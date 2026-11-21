import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { useDisableIntrospection } from '@graphql-yoga/plugin-disable-introspection';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { useServer } from 'graphql-ws/use/ws';
import { createYoga } from 'graphql-yoga';
import { WebSocketServer, type WebSocket } from 'ws';
import { SESSION_COOKIE, SESSION_MAX_AGE_S, sessionFromCookieHeader } from './auth.js';
import { config } from './config.js';
import type { Context, SessionChange } from './context.js';
import { prisma } from './db.js';
import { deny, sameOrigin } from './origin.js';
import { closeAllRelays, closeRelaysOf, handleRelayUpgrade, setRelayLogger } from './relay.js';
import { schema } from './schema.js';
import { getCard } from './services/cards.js';
import { getPeer, PEER_ID, registerPeer, unregisterPeer } from './services/peers.js';
import { userConnected, userDisconnected } from './services/presence.js';

interface ServerContext {
  req: FastifyRequest;
  reply: FastifyReply;
  session: SessionChange;
}

export async function buildApp() {
  const app = Fastify({
    logger: config.isTest ? false : { level: config.isProd ? 'info' : 'debug' },
    trustProxy: true,
    bodyLimit: 64 * 1024,
    disableRequestLogging: config.isProd,
  });

  await app.register(helmet, {
    contentSecurityPolicy: config.isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            // blob: for photos and videos, which live on the device and are shown from object URLs.
            imgSrc: ["'self'", 'data:', 'blob:'],
            mediaSrc: ["'self'", 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: null,
          },
        }
      : false,
    strictTransportSecurity: false, // plain-HTTP deployments are supported; terminate TLS in a proxy
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/healthz' || req.url === '/readyz',
  });

  // ---- health ----
  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });

  // ---- GraphQL over HTTP ----
  const yoga = createYoga<ServerContext>({
    schema,
    graphqlEndpoint: '/graphql',
    landingPage: false,
    graphiql: !config.isProd,
    logging: config.isTest ? false : 'warn',
    plugins: config.isProd ? [useDisableIntrospection()] : [],
    context: async ({ req, session }): Promise<Context> => ({
      userId: await sessionFromCookieHeader(req.headers.cookie),
      ip: req.ip,
      session,
      peerId: null,
    }),
  });

  app.route({
    url: '/graphql',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) => {
      const session: SessionChange = {};
      const response = await yoga.handleNodeRequestAndResponse(req, reply, { req, reply, session });
      response.headers.forEach((value, key) => reply.header(key, value));

      if (typeof session.token === 'string') {
        reply.setCookie(SESSION_COOKIE, session.token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.cookieSecure,
          path: '/',
          maxAge: SESSION_MAX_AGE_S,
        });
      } else if (session.token === null) {
        reply.clearCookie(SESSION_COOKIE, { path: '/' });
      }
      reply.header('Cache-Control', 'no-store');
      return reply.status(response.status).send(response.body);
    },
  });

  // ---- GraphQL subscriptions over WebSocket (same path) ----
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const socketUsers = new WeakMap<WebSocket, string>();
  const socketPeers = new WeakMap<WebSocket, string>();

  app.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/media-relay') {
      if (!config.media.enabled || !config.media.relay) return deny(socket);
      void handleRelayUpgrade(req, socket, head).catch(() => deny(socket));
      return;
    }
    if (path !== '/graphql') return; // leave other upgrades (e.g. dev tooling) alone
    if (!sameOrigin(req)) return deny(socket);
    wsServer.handleUpgrade(req, socket, head, (ws) => wsServer.emit('connection', ws, req));
  });

  const disposeWs = useServer(
    {
      schema,
      onConnect: async (ctx) => {
        const userId = await sessionFromCookieHeader(ctx.extra.request.headers.cookie);
        if (!userId) return false; // closes with 4403; the client treats it as fatal
        const raw = (ctx.connectionParams as { peerId?: unknown } | undefined)?.peerId;
        const peerId = typeof raw === 'string' && PEER_ID.test(raw) ? raw : null;
        // A peer id already owned by someone else is refused, so ids can't be hijacked.
        if (peerId && !registerPeer(peerId, userId, ctx.extra.socket)) return false;
        if (peerId) socketPeers.set(ctx.extra.socket, peerId);
        socketUsers.set(ctx.extra.socket, userId);
        await userConnected(userId);
        return true;
      },
      onClose: async (ctx) => {
        const peerId = socketPeers.get(ctx.extra.socket);
        if (peerId) {
          socketPeers.delete(ctx.extra.socket);
          // Only if this socket still owns the peer id (a reconnect may have replaced it).
          if (getPeer(peerId)?.socket === ctx.extra.socket) closeRelaysOf(peerId);
          unregisterPeer(peerId, ctx.extra.socket);
        }
        const userId = socketUsers.get(ctx.extra.socket);
        if (!userId) return;
        socketUsers.delete(ctx.extra.socket);
        await userDisconnected(userId);
      },
      context: (ctx): Context => ({
        userId: socketUsers.get(ctx.extra.socket) ?? null,
        ip: ctx.extra.request.socket.remoteAddress ?? '',
        session: {},
        peerId: socketPeers.get(ctx.extra.socket) ?? null,
      }),
    },
    wsServer,
    30_000, // ping every 30s so dead connections are detected and presence stays accurate
  );

  setRelayLogger(app.log);

  app.addHook('onClose', async () => {
    closeAllRelays();
    await disposeWs.dispose();
    for (const client of wsServer.clients) client.terminate();
    wsServer.close();
  });

  // ---- the built web app ----
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      wildcard: false,
      setHeaders: (res, path) => {
        res.setHeader(
          'Cache-Control',
          path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    let indexHtml: string | null = null;
    app.get('/*', async (req, reply) => {
      const accepts = String(req.headers.accept ?? '');
      if (accepts.includes('text/html') || accepts.includes('*/*') || accepts === '') {
        // A shared card's link gets a title and description for link previews in other apps.
        const handle = /^\/@([a-z0-9_]{3,20})\/?$/i.exec(req.url.split('?')[0]!)?.[1];
        if (handle) {
          const card = await getCard(null, handle).catch(() => null);
          if (card) {
            indexHtml ??= readFileSync(join(config.webDist, 'index.html'), 'utf8');
            return reply
              .header('Cache-Control', 'no-cache')
              .type('text/html; charset=utf-8')
              .send(
                withCardMeta(indexHtml, card.user.displayName, card.user.username, card.recipe),
              );
          }
        }
        return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found' });
    });
  }

  return app;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** index.html with `<title>` and `og:` tags for someone's shared card. */
export function withCardMeta(
  html: string,
  displayName: string,
  username: string,
  recipe: string | null,
) {
  let about = '';
  try {
    const parsed = recipe ? (JSON.parse(recipe) as { about?: unknown }) : null;
    if (typeof parsed?.about === 'string') about = parsed.about.split('\n')[0]!;
  } catch {
    /* no about */
  }
  const title = escapeHtml(`${displayName} (@${username}) on jessDek`);
  const description = escapeHtml(about || `Say hi to ${displayName} on jessDek.`);
  const tags = [
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:type" content="profile">`,
    `<meta name="description" content="${description}">`,
  ].join('');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace('</head>', `${tags}</head>`);
}

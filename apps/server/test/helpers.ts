import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { avatarLimiter, signInLimiter } from '../src/services/users.js';
import { clearRelays } from '../src/relay.js';
import { clearBlockCache } from '../src/services/blocks.js';
import { cardLimiter } from '../src/services/cards.js';
import { deckLimiter } from '../src/services/deck.js';
import { requestLimiter } from '../src/services/conversations.js';
import { resetMediaState } from '../src/services/media.js';
import { sendLimiter, typingLimiter } from '../src/services/messages.js';
import { reactLimiter } from '../src/services/reactions.js';
import { themeLimiter } from '../src/services/themes.js';
import { clearPeers } from '../src/services/peers.js';

export async function resetDb() {
  await prisma.block.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.groupInvite.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany();
  clearBlockCache();
  clearPeers();
  resetMediaState();
  clearRelays();
  signInLimiter.clear();
  avatarLimiter.clear();
  sendLimiter.clear();
  typingLimiter.clear();
  reactLimiter.clear();
  cardLimiter.clear();
  deckLimiter.clear();
  themeLimiter.clear();
  requestLimiter.clear();
}

export interface GqlResult<T = Record<string, any>> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string; field?: string } }>;
}

let clients = 0;
function nextAddress(): string {
  clients += 1;
  return `10.${(clients >> 16) & 255}.${(clients >> 8) & 255}.${clients & 255}`;
}

/**
 * A tiny GraphQL client that keeps its own cookie jar, like a browser tab. Each one also has its
 * own network address, like a separate device: the server's per-IP limit (600 a minute) is meant
 * for one device, and a whole test file sharing one address would trip it.
 */
export class Client {
  cookie = '';
  readonly address = nextAddress();
  constructor(private app: FastifyInstance) {}

  async gql<T = Record<string, any>>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<GqlResult<T>> {
    const res = await this.app.inject({
      method: 'POST',
      url: '/graphql',
      remoteAddress: this.address,
      headers: {
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      payload: { query, variables },
    });
    const setCookie = res.headers['set-cookie'];
    for (const header of [setCookie].flat()) {
      if (!header) continue;
      const pair = header.split(';')[0]!;
      this.cookie = pair.endsWith('=') ? '' : pair;
      // An expired/cleared cookie has an empty value.
      if (/expires=Thu, 01 Jan 1970/i.test(header) || pair.split('=')[1] === '') this.cookie = '';
    }
    return res.json() as GqlResult<T>;
  }
}

export async function signUp(client: Client, username: string, extra: Record<string, string> = {}) {
  const res = await client.gql(
    `mutation($input: SignUpInput!) { signUp(input: $input) { id username displayName } }`,
    { input: { username, email: `${username}@test.dev`, password: 'test-password-1', ...extra } },
  );
  if (res.errors) throw new Error(res.errors[0]!.message);
  return res.data!.signUp as { id: string; username: string; displayName: string };
}

export async function newApp() {
  const app = await buildApp();
  await app.ready();
  return app;
}

/** For tests that listen on a socket: the events of one type, in the order they arrived. */
export const types = (peer: { events: any[] }, typename: string) =>
  peer.events.filter((e) => e.__typename === typename);

/** Waits (up to `ms`) for something that arrives over a socket. */
export async function until(cond: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** A pause long enough for the server to deliver (or not deliver) what's expected. */
export const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export const RESPOND_TO_REQUEST = `mutation($c: ID!, $accept: Boolean!) { respondToRequest(conversationId: $c, accept: $accept) { id request { state } } }`;
export const RESPOND_TO_INVITE = `mutation($c: ID!, $accept: Boolean!) { respondToInvite(conversationId: $c, accept: $accept) { id } }`;

/** The data of a result that must have worked; a failure says which step broke. */
function must<T>(res: GqlResult, step: string, pick: (data: Record<string, any>) => T): T {
  if (res.errors) throw new Error(`${step} failed: ${res.errors[0]!.message}`);
  return pick(res.data!);
}

async function usernameOf(client: Client): Promise<string> {
  const res = await client.gql(`{ me { username } }`);
  return must(res, 'me', (d) => d.me.username as string);
}

/**
 * Makes `a` and `b` ordinary chat partners, the way people really do it: `a` starts the chat and
 * sends the one message a request allows (`intro`), and `b` accepts it. Returns the chat.
 * That first message is part of the chat's history, and counts as one of `a`'s sends.
 */
export async function connect(a: Client, b: Client, intro = 'hi'): Promise<{ id: string }> {
  const username = await usernameOf(b);
  const id = must(
    await a.gql(`mutation($u: String!) { startDirect(username: $u) { id } }`, { u: username }),
    'startDirect',
    (d) => d.startDirect.id as string,
  );
  must(
    await a.gql(
      `mutation($c: ID!, $b: String!) { sendMessage(conversationId: $c, body: $b) { id } }`,
      {
        c: id,
        b: intro,
      },
    ),
    'sending the request',
    () => null,
  );
  must(
    await b.gql(RESPOND_TO_REQUEST, { c: id, accept: true }),
    'accepting the request',
    () => null,
  );
  return { id };
}

/**
 * A group where everyone has joined: `owner` creates it, then each of `others` accepts their
 * invite, one after the other (so members join in the order given). Returns the group.
 */
export async function groupWith(
  owner: Client,
  name: string,
  others: Client[],
): Promise<{ id: string }> {
  const usernames = await Promise.all(others.map(usernameOf));
  const id = must(
    await owner.gql(
      `mutation($n: String!, $u: [String!]!) { createGroup(name: $n, usernames: $u) { id } }`,
      { n: name, u: usernames },
    ),
    'createGroup',
    (d) => d.createGroup.id as string,
  );
  for (const other of others)
    must(
      await other.gql(RESPOND_TO_INVITE, { c: id, accept: true }),
      'joining the group',
      () => null,
    );
  return { id };
}

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Treat empty strings (e.g. from `${VAR:-}` in compose) as "not set".
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(4000)),
  HOST: z.preprocess(blankToUndefined, z.string().default('0.0.0.0')),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.preprocess(
    blankToUndefined,
    z.string().min(16, 'JWT_SECRET must be at least 16 characters').optional(),
  ),
  WEB_DIST: z.preprocess(
    blankToUndefined,
    z.string().default(fileURLToPath(new URL('../../web/dist', import.meta.url))),
  ),
  // Set to "true" when the app is served over HTTPS so the session cookie is marked Secure.
  COOKIE_SECURE: z.preprocess(blankToUndefined, z.enum(['true', 'false']).default('false')),
  // Photos and videos travel device to device; the server only stores metadata and passes signals.
  MEDIA_ENABLED: z.preprocess(blankToUndefined, z.enum(['true', 'false']).default('true')),
  MEDIA_RELAY: z.preprocess(blankToUndefined, z.enum(['true', 'false']).default('true')),
  MEDIA_MAX_IMAGE_MB: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(100).default(20),
  ),
  MEDIA_MAX_VIDEO_MB: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(1024).default(100),
  ),
  // JSON array of RTCIceServer. Blank → public STUN. "[]" → host candidates only (LAN / tests).
  ICE_SERVERS: z.preprocess(
    blankToUndefined,
    z.string().default('[{"urls":"stun:stun.l.google.com:19302"}]'),
  ),
});

const iceServersSchema = z.array(
  z.object({
    urls: z.union([z.string(), z.array(z.string()).min(1)]),
    username: z.string().optional(),
    credential: z.string().optional(),
  }),
);

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`Invalid configuration:\n${lines.join('\n')}`);
  process.exit(1);
}

const env = parsed.data;

let iceServers: { urls: string[]; username?: string; credential?: string }[] = [];
try {
  const list = iceServersSchema.parse(JSON.parse(env.ICE_SERVERS));
  iceServers = list.map((s) => ({ ...s, urls: Array.isArray(s.urls) ? s.urls : [s.urls] }));
} catch {
  console.error(
    'Invalid configuration:\n  - ICE_SERVERS: must be a JSON array of {urls, username?, credential?}',
  );
  process.exit(1);
}
let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (env.NODE_ENV === 'production') {
    console.warn(
      '[config] JWT_SECRET is not set. Using a random secret: everyone is signed out on every restart. Set JWT_SECRET to keep sessions.',
    );
  }
  jwtSecret = randomBytes(32).toString('hex');
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  host: env.HOST,
  databaseUrl: env.DATABASE_URL,
  jwtSecret,
  webDist: env.WEB_DIST,
  cookieSecure: env.COOKIE_SECURE === 'true',
  media: {
    enabled: env.MEDIA_ENABLED === 'true',
    relay: env.MEDIA_RELAY === 'true',
    maxAttachments: 10,
    maxImageBytes: env.MEDIA_MAX_IMAGE_MB * 1024 * 1024,
    maxVideoBytes: env.MEDIA_MAX_VIDEO_MB * 1024 * 1024,
    maxPosterBytes: 512 * 1024,
    iceServers,
  },
};

/** Client-side limits for photos and videos (MEDIA_PLAN.md §3.8). Server limits come from mediaConfig. */
const KiB = 1024;
const MiB = 1024 * KiB;

/** Largest photo accepted *before* processing (it's resized and re-encoded before sending). */
export const IMAGE_INPUT_MAX_BYTES = 50 * MiB;

export const PHOTO = {
  longEdge: 2048,
  quality: 0.82,
  hdLongEdge: 4096,
  hdQuality: 0.9,
  jpegQuality: 0.86,
} as const;

export const POSTER = { longEdge: 640, quality: 0.8, maxBytes: 512 * KiB } as const;

/** ThumbHash input is drawn at most this big on each side. */
export const THUMBHASH_MAX = 100;
/** Largest width / height the server accepts. */
export const MAX_DIMENSION = 16384;

export const CHUNK_BYTES = 64 * KiB;
export const HIGH_WATER = 4 * MiB;
export const LOW_WATER = 1 * MiB;
/** Files are hashed in slices so big videos never need to be in memory at once. */
export const HASH_SLICE_BYTES = 4 * MiB;

export const HAVE_WAIT_MS = 1500;
export const ICE_TIMEOUT_MS = 8000;
export const IDLE_PEER_CLOSE_MS = 60_000;
/** No frame for this long during a transfer means the other side is gone. */
export const TRANSFER_IDLE_MS = 30_000;
/** How long a holder waits for the requester's "ok" after the last byte. */
export const ACK_WAIT_MS = 30_000;
export const VIDEO_METADATA_TIMEOUT_MS = 8000;
/** The server's request TTL; holders forget an authorization after this. */
export const REQUEST_TTL_MS = 120_000;

export const MAX_DOWNLOADS = 3;
export const MAX_SERVES = 4;
/** Transfer attempts per download before it is marked failed. */
export const MAX_ATTEMPTS = 3;

export const AUTO_VIDEO_MAX_BYTES = 50 * MiB;
export const UNAVAILABLE_RETRY_MS = 60_000;
export const PRESENCE_DEBOUNCE_MS = 1000;

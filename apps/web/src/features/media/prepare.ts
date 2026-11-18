import type { AttachmentInput, MediaConfig } from '@/lib/gql';
import { getMediaConfig } from './config';
import { replaceExt, sniff, SNIFF_BYTES } from './format';
import { encodeFrame, thumbhashOf } from './ops';
import { uuidv4 } from './peerId';
import { IMAGE_INPUT_MAX_BYTES, MAX_DIMENSION, POSTER, VIDEO_METADATA_TIMEOUT_MS } from './limits';
import * as work from './worker';

/** Getting a picked file ready to send: checks, re-encoding, poster frames, ThumbHash, SHA-256. */

export type Limits = Pick<MediaConfig, 'maxAttachments' | 'maxImageBytes' | 'maxVideoBytes'>;

const DEFAULT_LIMITS: Limits = {
  maxAttachments: 10,
  maxImageBytes: 20 * 1024 * 1024,
  maxVideoBytes: 100 * 1024 * 1024,
};

const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

export const messages = {
  tooMany: (max: number) => `You can send up to ${max} at a time.`,
  wrongType: (name: string) =>
    `“${name}” can’t be sent. Use a JPEG, PNG, WebP, GIF, MP4 or WebM file.`,
  tooBigPhoto: (name: string, max: number) =>
    `“${name}” is too large. Photos can be up to ${mb(max)} MB.`,
  tooBigVideo: (name: string, max: number) =>
    `“${name}” is too large. Videos can be up to ${mb(max)} MB.`,
  videoUnreadable: (name: string) =>
    `“${name}” can’t be read in this browser. Try an MP4 (H.264) video.`,
};

/** The file's type, from the browser or (when it has none, e.g. HEIC on Windows) its extension. */
export function typeOf(file: Pick<File, 'type' | 'name'>): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const fromExt = BY_EXTENSION[ext];
  if (!file.type) return fromExt ?? '';
  // Some systems report .m4v / .mov oddly; trust the extension for video containers.
  if (file.type.startsWith('video/') && fromExt?.startsWith('video/')) return fromExt;
  return file.type;
}

export const kindOf = (mime: string): 'IMAGE' | 'VIDEO' | null =>
  VIDEO_TYPES.has(mime)
    ? 'VIDEO'
    : mime.startsWith('image/') && mime !== 'image/svg+xml'
      ? 'IMAGE'
      : null;

export interface Rejection {
  file: File;
  reason: string;
}

/** Cheap synchronous checks, in order: count, type, size. */
export function accept(
  files: File[],
  alreadyInTray: number,
  cfg: Limits = getMediaConfig() ?? DEFAULT_LIMITS,
): { accepted: File[]; rejected: Rejection[] } {
  const accepted: File[] = [];
  const rejected: Rejection[] = [];
  const room = Math.max(0, cfg.maxAttachments - alreadyInTray);
  files.forEach((file, i) => {
    if (i >= room) {
      rejected.push({ file, reason: messages.tooMany(cfg.maxAttachments) });
      return;
    }
    const mime = typeOf(file);
    const kind = kindOf(mime);
    if (!kind) {
      rejected.push({ file, reason: messages.wrongType(file.name) });
      return;
    }
    if (kind === 'IMAGE') {
      if (mime === 'image/gif' && file.size > cfg.maxImageBytes) {
        rejected.push({ file, reason: messages.tooBigPhoto(file.name, cfg.maxImageBytes) });
        return;
      }
      if (file.size > IMAGE_INPUT_MAX_BYTES) {
        rejected.push({ file, reason: messages.tooBigPhoto(file.name, IMAGE_INPUT_MAX_BYTES) });
        return;
      }
    } else if (file.size > cfg.maxVideoBytes) {
      rejected.push({ file, reason: messages.tooBigVideo(file.name, cfg.maxVideoBytes) });
      return;
    }
    accepted.push(file);
  });
  return { accepted, rejected };
}

// ---- the async pipeline ---------------------------------------------------------------------

export class PrepareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrepareError';
  }
}

interface PreparedBase {
  file: Blob;
  mimeType: string;
  name: string;
  size: number;
  width: number;
  height: number;
  sha256: string;
  thumbhash: string | null;
  previewUrl: string;
}
export interface PreparedImage extends PreparedBase {
  kind: 'IMAGE';
}
export interface PreparedVideo extends PreparedBase {
  kind: 'VIDEO';
  durationMs: number;
  poster: { blob: Blob; mime: string; size: number; sha256: string };
}
export type PreparedAttachment = PreparedImage | PreparedVideo;

export interface Preparing {
  localId: string;
  kind: 'IMAGE' | 'VIDEO';
  /** Shown at once in the tray: the original photo, or (for videos) a poster once it's ready. */
  previewUrl: string | null;
  done: Promise<PreparedAttachment>;
}

/** Checks the first bytes match the type, so a file the receiver would refuse is never sent. */
async function assertSignature(blob: Blob, mime: string, name: string) {
  const head = new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer());
  if (!sniff(head, mime)) throw new PrepareError(messages.wrongType(name));
}

export function prepare(file: File, opts: { hd: boolean }): Preparing {
  const mime = typeOf(file);
  const kind = kindOf(mime);
  const localId = uuidv4();
  if (kind === 'VIDEO') {
    const preparing: Preparing = { localId, kind, previewUrl: null, done: null! };
    preparing.done = prepareVideo(file, mime).then((v) => {
      preparing.previewUrl = v.previewUrl;
      return v;
    });
    return preparing;
  }
  const previewUrl = URL.createObjectURL(file);
  return { localId, kind: 'IMAGE', previewUrl, done: prepareImage(file, previewUrl, opts) };
}

async function prepareImage(
  file: File,
  previewUrl: string,
  opts: { hd: boolean },
): Promise<PreparedImage> {
  const cfg = getMediaConfig() ?? DEFAULT_LIMITS;
  let out;
  try {
    out = await work.processImage(file, opts);
  } catch {
    throw new PrepareError(messages.wrongType(file.name));
  }
  if (out.blob.size > cfg.maxImageBytes)
    throw new PrepareError(messages.tooBigPhoto(file.name, cfg.maxImageBytes));
  await assertSignature(out.blob, out.mime, file.name);
  const sha256 = await work.hash(out.blob);
  return {
    kind: 'IMAGE',
    file: out.blob,
    mimeType: out.mime,
    name: replaceExt(file.name, out.mime),
    size: out.blob.size,
    width: out.width,
    height: out.height,
    sha256,
    thumbhash: out.thumbhash,
    previewUrl,
  };
}

function once<T extends Event>(target: EventTarget, ok: string, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(() => reject(new Error('timeout'))), ms);
    const onOk = (e: Event) => done(() => resolve(e as T));
    const onErr = () => done(() => reject(new Error('error')));
    function done(fn: () => void) {
      clearTimeout(timer);
      target.removeEventListener(ok, onOk);
      target.removeEventListener('error', onErr);
      fn();
    }
    target.addEventListener(ok, onOk);
    target.addEventListener('error', onErr);
  });
}

/** A WebP (or JPEG) poster ≤ 512 KiB; busy frames are re-encoded at lower quality until they fit. */
async function posterOf(video: HTMLVideoElement, w: number, h: number): Promise<Blob> {
  for (const quality of [POSTER.quality, 0.6, 0.4]) {
    // alpha: false → WebP, or JPEG where WebP can't be encoded: the two types the server takes.
    const { blob } = await encodeFrame(video, w, h, {
      longEdge: POSTER.longEdge,
      quality,
      alpha: false,
      jpegQuality: quality,
    });
    if (blob.size <= POSTER.maxBytes) return blob;
  }
  throw new Error('poster');
}

/** Videos are sent byte for byte; we only read their size, length and a poster frame. */
async function prepareVideo(file: File, mime: string): Promise<PreparedVideo> {
  const cfg = getMediaConfig() ?? DEFAULT_LIMITS;
  if (file.size > cfg.maxVideoBytes)
    throw new PrepareError(messages.tooBigVideo(file.name, cfg.maxVideoBytes));
  await assertSignature(file, mime, file.name);

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;
  try {
    try {
      await once(video, 'loadedmetadata', VIDEO_METADATA_TIMEOUT_MS);
    } catch {
      throw new PrepareError(messages.videoUnreadable(file.name));
    }
    const { videoWidth: w, videoHeight: h } = video;
    if (!Number.isFinite(video.duration)) {
      // WebM from MediaRecorder (and some others) has no duration in its header. Seeking far past
      // the end makes the browser work it out.
      video.currentTime = 1e101;
      await once(video, 'durationchange', VIDEO_METADATA_TIMEOUT_MS).catch(() => undefined);
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!w || !h || w > MAX_DIMENSION || h > MAX_DIMENSION)
      throw new PrepareError(messages.videoUnreadable(file.name));

    video.currentTime = Math.min(1, duration * 0.1);
    try {
      await once(video, 'seeked', VIDEO_METADATA_TIMEOUT_MS);
    } catch {
      throw new PrepareError(messages.videoUnreadable(file.name));
    }
    let thumb: { hash: string };
    let poster: Blob;
    try {
      thumb = thumbhashOf(video, w, h);
      poster = await posterOf(video, w, h);
    } catch {
      throw new PrepareError(messages.videoUnreadable(file.name));
    }
    const [sha256, posterSha256] = await Promise.all([work.hash(file), work.hash(poster)]);
    return {
      kind: 'VIDEO',
      file,
      mimeType: mime,
      name: replaceExt(file.name, mime),
      size: file.size,
      width: w,
      height: h,
      durationMs: Math.round(duration * 1000),
      sha256,
      thumbhash: thumb.hash,
      previewUrl: URL.createObjectURL(poster),
      poster: { blob: poster, mime: poster.type, size: poster.size, sha256: posterSha256 },
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** What goes to the server: metadata only. */
export function toInput(a: PreparedAttachment): AttachmentInput {
  const base = {
    kind: a.kind,
    mimeType: a.mimeType,
    name: a.name,
    size: a.size,
    width: a.width,
    height: a.height,
    sha256: a.sha256,
    thumbhash: a.thumbhash,
  };
  return a.kind === 'VIDEO'
    ? {
        ...base,
        durationMs: a.durationMs,
        posterSha256: a.poster.sha256,
        posterSize: a.poster.size,
        posterMime: a.poster.mime,
      }
    : { ...base, durationMs: null, posterSha256: null, posterSize: null, posterMime: null };
}

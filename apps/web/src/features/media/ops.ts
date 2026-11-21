import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { rgbaToThumbHash } from 'thumbhash';
import { SNIFF_BYTES } from './format';
import { HASH_SLICE_BYTES, MAX_DIMENSION, PHOTO, THUMBHASH_MAX } from './limits';

/**
 * The heavy lifting for photos and videos: hashing, re-encoding, ThumbHash, and the receiving
 * sink. Runs inside media.worker.ts, or on the main thread where workers or OffscreenCanvas
 * aren't available (jsdom tests, older browsers). Pure functions of their inputs.
 */

// ---- hashing --------------------------------------------------------------------------------

/** SHA-256 of a Blob, read in slices so a 100 MB video is never in memory at once. */
export async function hashBlob(blob: Blob): Promise<string> {
  const h = sha256.create();
  for (let offset = 0; offset < blob.size; offset += HASH_SLICE_BYTES) {
    const slice = await blob.slice(offset, offset + HASH_SLICE_BYTES).arrayBuffer();
    h.update(new Uint8Array(slice));
  }
  return bytesToHex(h.digest());
}

export function base64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// ---- canvases (OffscreenCanvas in the worker, <canvas> as a fallback) -----------------------

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function canvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function context(c: AnyCanvas): Ctx2D {
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('UNSUPPORTED');
  return ctx;
}

function encode(c: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('UNSUPPORTED'))), type, quality),
  );
}

export const fit = (w: number, h: number, longEdge: number) => {
  const scale = Math.min(1, longEdge / Math.max(w, h)); // never upscale
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
};

type Drawable = ImageBitmap | HTMLVideoElement | HTMLImageElement;

/** ThumbHash of a frame (drawn at ≤ 100 × 100) plus whether any pixel is see-through. */
export function thumbhashOf(
  source: Drawable,
  w: number,
  h: number,
): { hash: string; alpha: boolean } {
  const size = fit(w, h, THUMBHASH_MAX);
  const c = canvas(size.w, size.h);
  const ctx = context(c);
  ctx.drawImage(source, 0, 0, size.w, size.h);
  const { data } = ctx.getImageData(0, 0, size.w, size.h);
  let alpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 255) {
      alpha = true;
      break;
    }
  }
  return { hash: base64(rgbaToThumbHash(size.w, size.h, data)), alpha };
}

/** Draws a frame scaled to `longEdge` and encodes it as WebP, falling back to PNG / JPEG. */
export async function encodeFrame(
  source: Drawable,
  w: number,
  h: number,
  opts: { longEdge: number; quality: number; alpha: boolean; jpegQuality: number },
): Promise<{ blob: Blob; width: number; height: number }> {
  const size = fit(w, h, opts.longEdge);
  const c = canvas(size.w, size.h);
  const ctx = context(c);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size.w, size.h);
  let blob = await encode(c, 'image/webp', opts.quality);
  // Older Safari silently returns PNG for WebP requests.
  if (blob.type !== 'image/webp') {
    blob = opts.alpha
      ? await encode(c, 'image/png', 1)
      : await encode(c, 'image/jpeg', opts.jpegQuality);
  }
  return { blob, width: size.w, height: size.h };
}

// ---- photos ---------------------------------------------------------------------------------

export interface ProcessedImage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  thumbhash: string;
}

/**
 * Decodes, orients, resizes and re-encodes a photo. Re-encoding drops EXIF, GPS and XMP.
 * GIFs pass through untouched (re-encoding would lose the animation; GIFs carry no GPS EXIF).
 */
export async function processImage(file: Blob, opts: { hd: boolean }): Promise<ProcessedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('UNSUPPORTED');
  }
  try {
    const { width, height } = bitmap;
    if (!width || !height) throw new Error('UNSUPPORTED');
    const thumb = thumbhashOf(bitmap, width, height);
    if (file.type === 'image/gif') {
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error('UNSUPPORTED');
      return { blob: file, mime: 'image/gif', width, height, thumbhash: thumb.hash };
    }
    const out = await encodeFrame(bitmap, width, height, {
      longEdge: opts.hd ? PHOTO.hdLongEdge : PHOTO.longEdge,
      quality: opts.hd ? PHOTO.hdQuality : PHOTO.quality,
      alpha: thumb.alpha,
      jpegQuality: PHOTO.jpegQuality,
    });
    return {
      blob: out.blob,
      mime: out.blob.type,
      width: out.width,
      height: out.height,
      thumbhash: thumb.hash,
    };
  } finally {
    bitmap.close();
  }
}

// ---- receiving sink -------------------------------------------------------------------------

/**
 * Collects a download: chunks arrive transferred (zero-copy), are hashed as they come, and become
 * one Blob at the end. State is kept per key so a dropped transfer resumes where it stopped.
 */
interface SinkState {
  hasher: ReturnType<typeof sha256.create>;
  chunks: ArrayBuffer[];
  received: number;
  head: Uint8Array;
}
const sinks = new Map<string, SinkState>();

export function sinkWrite(key: string, chunk: ArrayBuffer): number {
  let s = sinks.get(key);
  if (!s) {
    s = { hasher: sha256.create(), chunks: [], received: 0, head: new Uint8Array(0) };
    sinks.set(key, s);
  }
  const bytes = new Uint8Array(chunk);
  if (s.head.length < SNIFF_BYTES) {
    const head = new Uint8Array(Math.min(SNIFF_BYTES, s.head.length + bytes.length));
    head.set(s.head);
    head.set(bytes.subarray(0, head.length - s.head.length), s.head.length);
    s.head = head;
  }
  s.hasher.update(bytes);
  s.chunks.push(chunk);
  s.received += bytes.length;
  return s.received;
}

export interface SinkResult {
  sha256: string;
  size: number;
  head: Uint8Array;
  blob: Blob;
}

/** Finishes and forgets the sink. */
export function sinkFinish(key: string, mime: string): SinkResult {
  const s = sinks.get(key);
  sinks.delete(key);
  if (!s) {
    return {
      sha256: bytesToHex(sha256(new Uint8Array(0))),
      size: 0,
      head: new Uint8Array(0),
      blob: new Blob([], { type: mime }),
    };
  }
  return {
    sha256: bytesToHex(s.hasher.digest()),
    size: s.received,
    head: s.head,
    blob: new Blob(s.chunks, { type: mime }),
  };
}

export function sinkAbort(key: string): void {
  sinks.delete(key);
}

export function sinkClear(): void {
  sinks.clear();
}

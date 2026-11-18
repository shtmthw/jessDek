import * as ops from './ops';
import type { ProcessedImage, SinkResult } from './ops';

/**
 * Typed calls into media.worker.ts. Without Worker support (jsdom tests, very old browsers) the
 * same functions run on the main thread. Photos are re-encoded in the worker only where
 * OffscreenCanvas can encode; elsewhere on the main thread with a regular canvas.
 */
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined') return worker;
  try {
    const w = new Worker(new URL('./media.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (
      e: MessageEvent<{ id: number; ok: boolean; value?: unknown; error?: string }>,
    ) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.value);
      else p.reject(new Error(e.data.error));
    };
    w.onerror = () => {
      // The worker failed to load: fall back to the main thread from now on.
      for (const p of pending.values()) p.reject(new Error('WORKER'));
      pending.clear();
      worker = null;
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function call<T>(op: string, args: unknown[], transfer: Transferable[] = []): Promise<T> | null {
  const w = getWorker();
  if (!w) return null;
  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, op, args }, transfer);
  });
}

const offscreenEncodes =
  typeof OffscreenCanvas !== 'undefined' && 'convertToBlob' in OffscreenCanvas.prototype;

export function hash(blob: Blob): Promise<string> {
  return call<string>('hash', [blob]) ?? ops.hashBlob(blob);
}

export function processImage(file: Blob, opts: { hd: boolean }): Promise<ProcessedImage> {
  if (offscreenEncodes) {
    const p = call<ProcessedImage>('processImage', [file, opts]);
    if (p) return p;
  }
  return ops.processImage(file, opts);
}

/** The receiving side of a download, living in the worker. Keyed by the file's hash. */
export const sink = {
  /** The chunk is transferred (zero-copy): don't touch it afterwards. */
  write(key: string, chunk: ArrayBuffer): void {
    const p = call<number>('sinkWrite', [key, chunk], [chunk]);
    if (p) p.catch(() => undefined);
    else ops.sinkWrite(key, chunk);
  },
  finish(key: string, mime: string): Promise<SinkResult> {
    return (
      call<SinkResult>('sinkFinish', [key, mime]) ?? Promise.resolve(ops.sinkFinish(key, mime))
    );
  },
  abort(key: string): void {
    const p = call('sinkAbort', [key]);
    if (p) p.catch(() => undefined);
    else ops.sinkAbort(key);
  },
  clear(): void {
    const p = call('sinkClear', []);
    if (p) p.catch(() => undefined);
    else ops.sinkClear();
  },
};

/// <reference lib="webworker" />
import * as ops from './ops';

/** Runs the heavy media work off the main thread. Protocol: see worker.ts. */
type Request = { id: number; op: keyof typeof handlers; args: unknown[] };

const handlers = {
  hash: (blob: Blob) => ops.hashBlob(blob),
  processImage: (file: Blob, opts: { hd: boolean }) => ops.processImage(file, opts),
  sinkWrite: (key: string, chunk: ArrayBuffer) => ops.sinkWrite(key, chunk),
  sinkFinish: (key: string, mime: string) => ops.sinkFinish(key, mime),
  sinkAbort: (key: string) => ops.sinkAbort(key),
  sinkClear: () => ops.sinkClear(),
};

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (e: MessageEvent<Request>) => {
  const { id, op, args } = e.data;
  try {
    const fn = handlers[op] as (...a: unknown[]) => unknown;
    const value = await fn(...args);
    scope.postMessage({ id, ok: true, value });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

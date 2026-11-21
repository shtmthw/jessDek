import { parseControl, sendControl, type Channel, type ErrorCode } from './channel';
import { sniff } from './format';
import { TRANSFER_IDLE_MS } from './limits';
import { sink } from './worker';

/** The requester's side of a transfer: receive, then verify size, SHA-256 and file signature. */
export type TransferErrorCode = ErrorCode | 'CLOSED' | 'TIMEOUT' | 'CANCELLED' | 'PROTOCOL';

export class TransferError extends Error {
  constructor(readonly code: TransferErrorCode) {
    super(code);
    this.name = 'TransferError';
  }
  /** The bytes can't be trusted: start over with another holder. */
  get integrity() {
    return this.code === 'HASH' || this.code === 'SIZE' || this.code === 'TYPE';
  }
}

export interface Expected {
  sha256: string;
  size: number;
  mime: string;
}

/**
 * A download in progress, kept for the session so a dropped transfer resumes where it stopped.
 * The bytes themselves live in the worker.
 */
export interface Sink {
  readonly key: string;
  received: number;
}

const sinks = new Map<string, Sink>();

export function getSink(key: string): Sink {
  let s = sinks.get(key);
  if (!s) sinks.set(key, (s = { key, received: 0 }));
  return s;
}

/** Throws the partial bytes away (failed verification, or cancelled). */
export function resetSink(key: string): void {
  sinks.delete(key);
  sink.abort(key);
}

export function clearSinks(): void {
  sinks.clear();
  sink.clear();
}

export function fetchOver(
  channel: Channel,
  { requestId, expected }: { requestId: string; expected: Expected },
  target: Sink,
  onProgress?: (received: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let gotHead = false;
    let idle: ReturnType<typeof setTimeout>;

    const end = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      signal?.removeEventListener('abort', onAbort);
      channel.onmessage = null;
      channel.onclose = null;
      fn();
    };
    const fail = (code: TransferErrorCode, tell?: ErrorCode) =>
      end(() => {
        if (tell) sendControl(channel, { t: 'error', code: tell });
        if (code !== 'CLOSED') channel.close();
        reject(new TransferError(code));
      });
    const bump = () => {
      clearTimeout(idle);
      idle = setTimeout(() => fail('TIMEOUT'), TRANSFER_IDLE_MS);
    };
    function onAbort() {
      fail('CANCELLED');
    }
    if (signal?.aborted) return reject(new TransferError('CANCELLED'));
    signal?.addEventListener('abort', onAbort);

    channel.onclose = () => fail('CLOSED');
    channel.onmessage = (data) => {
      bump();
      if (typeof data !== 'string') {
        if (!gotHead) return fail('PROTOCOL');
        if (target.received + data.byteLength > expected.size) {
          resetSink(target.key);
          return fail('SIZE', 'SIZE');
        }
        target.received += data.byteLength;
        sink.write(target.key, data); // transferred to the worker: don't touch `data` after this
        onProgress?.(target.received);
        return;
      }
      const msg = parseControl(data);
      if (!msg) return fail('PROTOCOL');
      switch (msg.t) {
        case 'head':
          if (msg.size !== expected.size) {
            resetSink(target.key);
            return fail('SIZE', 'SIZE');
          }
          gotHead = true;
          return;
        case 'error':
          return fail(msg.code);
        case 'done':
          if (!gotHead) return fail('PROTOCOL');
          void verify();
          return;
        default:
          return;
      }
    };

    async function verify() {
      clearTimeout(idle);
      if (target.received !== expected.size) {
        resetSink(target.key);
        return fail('SIZE', 'SIZE');
      }
      sinks.delete(target.key);
      const result = await sink.finish(target.key, expected.mime);
      if (settled) return;
      if (result.size !== expected.size) return fail('SIZE', 'SIZE');
      if (result.sha256 !== expected.sha256) return fail('HASH', 'HASH');
      if (!sniff(result.head, expected.mime)) return fail('TYPE', 'TYPE');
      end(() => {
        sendControl(channel, { t: 'ok' });
        resolve(result.blob);
      });
    }

    bump();
    sendControl(channel, { t: 'get', requestId, offset: target.received });
  });
}

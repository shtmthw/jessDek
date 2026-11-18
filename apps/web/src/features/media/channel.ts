import { CHUNK_BYTES } from './limits';

/**
 * One transfer's pipe: an RTCDataChannel, or a relay socket wrapped to look like one. Text frames
 * are JSON control messages; binary frames are file bytes (MEDIA_PLAN.md §3.5).
 */
export interface Channel {
  send(data: string | ArrayBuffer): void;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  onbufferedamountlow: (() => void) | null;
  onmessage: ((data: string | ArrayBuffer) => void) | null;
  onclose: (() => void) | null;
  readonly maxMessageSize: number;
  close(): void;
}

export type Control =
  | { t: 'get'; requestId: string; offset: number }
  | { t: 'head'; size: number; mime: string }
  | { t: 'done' }
  | { t: 'ok' }
  | { t: 'error'; code: ErrorCode };

export type ErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'BUSY' | 'SIZE' | 'HASH' | 'TYPE';

export function parseControl(text: string): Control | null {
  try {
    const value = JSON.parse(text) as Control;
    return value && typeof value === 'object' && typeof value.t === 'string' ? value : null;
  } catch {
    return null;
  }
}

export const sendControl = (channel: Channel, message: Control) => {
  try {
    channel.send(JSON.stringify(message));
  } catch {
    /* already closed */
  }
};

/** Adapts an RTCDataChannel. Messages that arrive before a handler is set are queued. */
export function fromDataChannel(dc: RTCDataChannel, pc?: RTCPeerConnection): Channel {
  dc.binaryType = 'arraybuffer';
  const early: (string | ArrayBuffer)[] = [];
  let closed = false;
  const channel: Channel = {
    send: (data) => dc.send(data as string & ArrayBuffer),
    get bufferedAmount() {
      return dc.bufferedAmount;
    },
    get bufferedAmountLowThreshold() {
      return dc.bufferedAmountLowThreshold;
    },
    set bufferedAmountLowThreshold(v: number) {
      dc.bufferedAmountLowThreshold = v;
    },
    onbufferedamountlow: null,
    onmessage: null,
    onclose: null,
    maxMessageSize: Math.min(CHUNK_BYTES, pc?.sctp?.maxMessageSize || CHUNK_BYTES),
    close: () => dc.close(),
  };
  let handler: Channel['onmessage'] = null;
  Object.defineProperty(channel, 'onmessage', {
    get: () => handler,
    set: (fn: Channel['onmessage']) => {
      handler = fn;
      while (fn && early.length) fn(early.shift()!);
    },
  });
  dc.onmessage = (e: MessageEvent<string | ArrayBuffer>) => {
    if (handler) handler(e.data);
    else early.push(e.data);
  };
  dc.onbufferedamountlow = () => channel.onbufferedamountlow?.();
  const onClose = () => {
    if (closed) return;
    closed = true;
    channel.onclose?.();
  };
  dc.onclose = onClose;
  dc.onerror = onClose;
  return channel;
}

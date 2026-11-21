// @vitest-environment node
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import type { Channel } from './channel';
import { fetchOver, getSink, resetSink, TransferError } from './fetch';
import { HIGH_WATER } from './limits';
import { authorize, authorized, serve } from './serve';

// A tiny in-memory holder store: sha → { blob, conversations }.
const held = new Map<string, { blob: Blob; conversations: string[] }>();
vi.mock('./store', () => ({
  hasAsync: async (sha: string, conversationId?: string) => {
    const h = held.get(sha);
    return Boolean(h) && (!conversationId || h!.conversations.includes(conversationId));
  },
  get: async (sha: string) => held.get(sha)?.blob,
}));

/**
 * Two connected channel ends. Delivery is one frame per macrotask, so a fast sender really does
 * build up `bufferedAmount` and has to respect backpressure. `dropAfter` closes the pipe once that
 * many file bytes have been delivered.
 */
function pair({ dropAfter = Infinity } = {}) {
  let delivered = 0;
  class End implements Channel {
    other!: End;
    bufferedAmount = 0;
    bufferedAmountLowThreshold = 0;
    maxBuffered = 0;
    onbufferedamountlow: (() => void) | null = null;
    onmessage: ((data: string | ArrayBuffer) => void) | null = null;
    onclose: (() => void) | null = null;
    readonly maxMessageSize = 64 * 1024;
    closed = false;
    dead = false;
    pumping = false;
    sent: (string | ArrayBuffer)[] = [];
    private queue: (string | ArrayBuffer)[] = [];

    send(data: string | ArrayBuffer) {
      if (this.closed) throw new Error('closed');
      this.sent.push(data);
      this.queue.push(data);
      this.bufferedAmount += size(data);
      this.maxBuffered = Math.max(this.maxBuffered, this.bufferedAmount);
      if (!this.pumping) {
        this.pumping = true;
        setTimeout(() => this.pump(), 0);
      }
    }
    private pump() {
      const data = this.queue.shift();
      if (data === undefined || this.dead) {
        this.pumping = false;
        if (this.closed) this.fireClose();
        return;
      }
      const before = this.bufferedAmount;
      this.bufferedAmount -= size(data);
      if (
        before > this.bufferedAmountLowThreshold &&
        this.bufferedAmount <= this.bufferedAmountLowThreshold
      )
        this.onbufferedamountlow?.();
      if (typeof data !== 'string') delivered += data.byteLength;
      this.other.onmessage?.(data);
      if (delivered >= dropAfter) return this.kill();
      setTimeout(() => this.pump(), 0);
    }
    /** Like the real thing: what was already sent is still delivered, then both ends close. */
    close() {
      if (this.closed) return;
      this.closed = this.other.closed = true;
      if (!this.pumping && !this.other.pumping) this.fireClose();
    }
    /** The connection drops: anything in flight is lost. */
    kill() {
      this.dead = this.other.dead = true;
      this.closed = this.other.closed = true;
      this.fireClose();
    }
    private fired = false;
    private fireClose() {
      if (this.fired || this.other.pumping) return;
      this.fired = this.other.fired = true;
      setTimeout(() => {
        this.onclose?.();
        this.other.onclose?.();
      }, 0);
    }
  }
  const size = (d: string | ArrayBuffer) => (typeof d === 'string' ? d.length : d.byteLength);
  const holder = new End();
  const requester = new End();
  holder.other = requester;
  requester.other = holder;
  return { holder, requester };
}

const REQUESTER = 'requester-peer';
const CONV = 'conv-1';

function file(size: number, header: number[] = [0x89, 0x50, 0x4e, 0x47]) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) & 0xff;
  bytes.set(header);
  return { bytes, blob: new Blob([bytes], { type: 'image/png' }), sha: bytesToHex(sha256(bytes)) };
}

function setup(
  f: ReturnType<typeof file>,
  { requestId = 'req-1', conversations = [CONV], authConv = CONV } = {},
) {
  held.set(f.sha, { blob: f.blob, conversations });
  authorize(requestId, {
    sha256: f.sha,
    conversationId: authConv,
    requesterPeerId: REQUESTER,
    requesterUserId: 'bob',
  });
  return { requestId, expected: { sha256: f.sha, size: f.bytes.length, mime: 'image/png' } };
}

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: unknown) => (e instanceof TransferError ? e.code : String(e)),
  );

beforeEach(() => {
  held.clear();
  authorized.clear();
});

describe('transfer protocol', () => {
  it('moves a whole file and verifies it', async () => {
    const f = file(300 * 1024 + 123);
    const { requestId, expected } = setup(f);
    const { holder, requester } = pair();
    const served = serve(holder, REQUESTER);
    const progress: number[] = [];
    const blob = await fetchOver(requester, { requestId, expected }, getSink(f.sha), (n) =>
      progress.push(n),
    );
    expect(await bytesOf(blob)).toEqual(f.bytes);
    expect(blob.type).toBe('image/png');
    expect(progress.at(-1)).toBe(f.bytes.length);
    await served;
    expect(JSON.parse(requester.sent.at(-1) as string)).toEqual({ t: 'ok' });
  });

  it('resumes from where a dropped transfer stopped', async () => {
    const f = file(640 * 1024);
    const { requestId, expected } = setup(f);
    const target = getSink(f.sha);

    const first = pair({ dropAfter: Math.floor(f.bytes.length * 0.4) });
    void serve(first.holder, REQUESTER);
    expect(await codeOf(fetchOver(first.requester, { requestId, expected }, target))).toBe(
      'CLOSED',
    );
    const partial = target.received;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(f.bytes.length);

    const second = pair();
    void serve(second.holder, REQUESTER);
    const blob = await fetchOver(second.requester, { requestId, expected }, getSink(f.sha));
    expect(JSON.parse(second.requester.sent[0] as string)).toEqual({
      t: 'get',
      requestId,
      offset: partial,
    });
    expect(await bytesOf(blob)).toEqual(f.bytes);
  });

  it('rejects bytes whose hash doesn’t match', async () => {
    const f = file(100 * 1024);
    const { requestId, expected } = setup(f);
    const { holder, requester } = pair();
    void serve(holder, REQUESTER);
    const bad = { ...expected, sha256: '0'.repeat(64) };
    expect(
      await codeOf(fetchOver(requester, { requestId, expected: bad }, getSink('bad-hash'))),
    ).toBe('HASH');
  });

  it('rejects a size that doesn’t match the metadata', async () => {
    const f = file(100 * 1024);
    const { requestId, expected } = setup(f);
    const { holder, requester } = pair();
    void serve(holder, REQUESTER);
    const bad = { ...expected, size: expected.size + 1 };
    expect(
      await codeOf(fetchOver(requester, { requestId, expected: bad }, getSink('bad-size'))),
    ).toBe('SIZE');
  });

  it('rejects a file whose bytes aren’t the declared type', async () => {
    const f = file(10 * 1024, [0x3c, 0x68, 0x74, 0x6d]); // "<htm"
    const { requestId, expected } = setup(f);
    const { holder, requester } = pair();
    void serve(holder, REQUESTER);
    expect(await codeOf(fetchOver(requester, { requestId, expected }, getSink(f.sha)))).toBe(
      'TYPE',
    );
    resetSink(f.sha);
  });

  it('serves only the requester the server named', async () => {
    const f = file(10 * 1024);
    const { requestId, expected } = setup(f);
    const { holder, requester } = pair();
    void serve(holder, 'someone-else');
    expect(await codeOf(fetchOver(requester, { requestId, expected }, getSink('wrong-peer')))).toBe(
      'UNAUTHORIZED',
    );
    expect(holder.sent.some((d) => typeof d !== 'string')).toBe(false);
  });

  it('never serves a file into a conversation it wasn’t received in (S6)', async () => {
    const f = file(10 * 1024);
    // The device holds the file for conv-1, but the request (a fake attachment) is in conv-2.
    const { requestId, expected } = setup(f, { conversations: [CONV], authConv: 'conv-2' });
    const { holder, requester } = pair();
    void serve(holder, REQUESTER);
    expect(await codeOf(fetchOver(requester, { requestId, expected }, getSink('other-conv')))).toBe(
      'NOT_FOUND',
    );
    expect(holder.sent.some((d) => typeof d !== 'string')).toBe(false);
  });

  it('never buffers past the high-water mark', async () => {
    const f = file(6 * 1024 * 1024 + 5);
    const { requestId, expected } = setup(f);
    const { holder, requester } = pair();
    void serve(holder, REQUESTER);
    const blob = await fetchOver(requester, { requestId, expected }, getSink(f.sha));
    expect(blob.size).toBe(f.bytes.length);
    expect(holder.maxBuffered).toBeGreaterThan(1024 * 1024);
    expect(holder.maxBuffered).toBeLessThanOrEqual(HIGH_WATER + holder.maxMessageSize);
  }, 30_000);
});

// @vitest-environment node
import { wrapRelay } from './relay';

vi.mock('./wsRequest', () => ({ wsRequest: vi.fn(), signal: vi.fn() }));

/** Two fake WebSockets joined by a "relay" that can watch, drop, tamper with or replay frames. */
function sockets() {
  const wire: Uint8Array[] = [];
  let tamper: ((frame: Uint8Array) => Uint8Array[]) | null = null;
  class FakeSocket extends EventTarget {
    other!: FakeSocket;
    readyState = 1;
    bufferedAmount = 0;
    binaryType = 'arraybuffer';
    onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
    send(data: Uint8Array) {
      const frame = new Uint8Array(data);
      wire.push(frame);
      const frames = tamper ? tamper(frame) : [frame];
      for (const f of frames)
        setTimeout(() => this.other.onmessage?.({ data: f.slice().buffer }), 0);
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = this.other.readyState = 3;
      setTimeout(() => {
        this.dispatchEvent(new Event('close'));
        this.other.dispatchEvent(new Event('close'));
      }, 0);
    }
  }
  const a = new FakeSocket();
  const b = new FakeSocket();
  a.other = b;
  b.other = a;
  return { a, b, wire, setTamper: (fn: typeof tamper) => (tamper = fn) };
}

vi.stubGlobal('WebSocket', { OPEN: 1 });

const key = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const received = (ch: ReturnType<typeof wrapRelay>) => {
  const got: (string | ArrayBuffer)[] = [];
  ch.onmessage = (d) => got.push(d);
  return got;
};
const contains = (hay: Uint8Array, needle: string) =>
  Buffer.from(hay).includes(Buffer.from(needle));

describe('relay framing', () => {
  it('encrypts both ways, so the relay never sees plaintext', async () => {
    const k = await key();
    const { a, b, wire } = sockets();
    const requester = wrapRelay(a as unknown as WebSocket, k, 'requester');
    const holder = wrapRelay(b as unknown as WebSocket, k, 'holder');
    const atHolder = received(holder);
    const atRequester = received(requester);

    requester.send('{"t":"get","requestId":"secret-request"}');
    const bytes = new TextEncoder().encode('PLAINTEXT-FILE-BYTES').buffer;
    holder.send(bytes.slice(0));
    holder.send('{"t":"done"}');
    await vi.waitFor(() => expect(atRequester).toHaveLength(2));

    expect(atHolder).toEqual(['{"t":"get","requestId":"secret-request"}']);
    expect(new TextDecoder().decode(atRequester[0] as ArrayBuffer)).toBe('PLAINTEXT-FILE-BYTES');
    expect(atRequester[1]).toBe('{"t":"done"}');
    expect(wire).toHaveLength(3);
    for (const frame of wire) {
      expect(contains(frame, 'secret-request')).toBe(false);
      expect(contains(frame, 'PLAINTEXT')).toBe(false);
      expect(contains(frame, '"t"')).toBe(false);
    }
    // iv = direction byte, then the per-transfer salt and counter.
    expect(wire.map((f) => f[0])).toEqual([0x01, 0x02, 0x02]);
  });

  it('closes on a tampered frame', async () => {
    const k = await key();
    const { a, b, setTamper } = sockets();
    const requester = wrapRelay(a as unknown as WebSocket, k, 'requester');
    const holder = wrapRelay(b as unknown as WebSocket, k, 'holder');
    const got = received(requester);
    let closed = false;
    requester.onclose = () => (closed = true);
    setTamper((f) => {
      const copy = f.slice();
      copy[copy.length - 1]! ^= 0xff;
      return [copy];
    });
    holder.send(new Uint8Array([1, 2, 3]).buffer);
    await vi.waitFor(() => expect(closed).toBe(true));
    expect(got).toEqual([]);
  });

  it('closes on a replayed or reflected frame', async () => {
    const k = await key();
    const replay = sockets();
    const requester = wrapRelay(replay.a as unknown as WebSocket, k, 'requester');
    const holder = wrapRelay(replay.b as unknown as WebSocket, k, 'holder');
    const got = received(requester);
    let closed = false;
    requester.onclose = () => (closed = true);
    replay.setTamper((f) => [f, f]); // the relay sends every frame twice
    holder.send('{"t":"done"}');
    await vi.waitFor(() => expect(closed).toBe(true));
    expect(got).toEqual(['{"t":"done"}']);

    // A frame bounced back at its own sender is refused too.
    const reflect = sockets();
    const r2 = wrapRelay(reflect.a as unknown as WebSocket, k, 'requester');
    wrapRelay(reflect.b as unknown as WebSocket, k, 'holder');
    let r2closed = false;
    r2.onclose = () => (r2closed = true);
    reflect.setTamper((f) => {
      setTimeout(() => reflect.a.onmessage?.({ data: f.slice().buffer }), 0);
      return [];
    });
    r2.send('{"t":"get"}');
    await vi.waitFor(() => expect(r2closed).toBe(true));
  });

  it('sends type-prefixed plaintext frames when there is no key (plain HTTP)', async () => {
    const { a, b, wire } = sockets();
    const requester = wrapRelay(a as unknown as WebSocket, null, 'requester');
    const holder = wrapRelay(b as unknown as WebSocket, null, 'holder');
    const got = received(holder);
    requester.send('{"t":"ok"}');
    await vi.waitFor(() => expect(got).toEqual(['{"t":"ok"}']));
    expect(wire[0]![0]).toBe(0);
    expect(new TextDecoder().decode(wire[0]!.subarray(1))).toBe('{"t":"ok"}');
  });
});

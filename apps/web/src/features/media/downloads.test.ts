import { TransferError } from './fetch';
import { PeerError } from './peer';

const m = vi.hoisted(() => ({
  wsRequest: vi.fn(),
  waitForHave: vi.fn(),
  openChannel: vi.fn(),
  openRelayChannel: vi.fn(),
  fetchOver: vi.fn(),
  put: vi.fn(),
  have: new Set<string>(),
  config: { relay: true } as { relay: boolean } | null,
  relayOnly: false,
}));

vi.mock('./limits', async (orig) => ({
  ...(await orig<typeof import('./limits')>()),
  HAVE_WAIT_MS: 5,
  PRESENCE_DEBOUNCE_MS: 5,
}));
vi.mock('./wsRequest', async (orig) => ({
  ...(await orig<typeof import('./wsRequest')>()),
  wsRequest: m.wsRequest,
}));
vi.mock('./signals', () => ({ waitForHave: m.waitForHave, forgetRequest: vi.fn() }));
vi.mock('./peer', async (orig) => ({
  ...(await orig<typeof import('./peer')>()),
  openChannel: m.openChannel,
  hasWebRTC: () => true,
}));
vi.mock('./relay', () => ({ openRelayChannel: m.openRelayChannel }));
vi.mock('./fetch', async (orig) => ({
  ...(await orig<typeof import('./fetch')>()),
  fetchOver: m.fetchOver,
  getSink: (key: string) => ({ key, received: 0 }),
  resetSink: vi.fn(),
}));
vi.mock('./store', () => ({
  hasAsync: async (sha: string) => m.have.has(sha),
  urlFor: async (sha: string) => `blob:${sha}`,
  put: m.put,
}));
vi.mock('./config', () => ({ getMediaConfig: () => m.config }));
vi.mock('./prefs', () => ({ getPref: () => m.relayOnly }));

const downloads = await import('./downloads');

let n = 0;
const att = (sha = `sha-${++n}`) => ({
  id: `att-${sha}`,
  sha256: sha,
  size: 10,
  mimeType: 'image/webp',
});
const channel = { close: vi.fn() };
const status = (sha: string) => downloads.getDownload(sha)?.status;
const until = (fn: () => boolean) => vi.waitFor(() => expect(fn()).toBe(true), { timeout: 2000 });

function candidates(count: number) {
  m.wsRequest.mockResolvedValue({ requestMedia: { requestId: `r-${++n}`, candidates: count } });
}
const holder = (fromPeerId: string, relayOnly = false) => ({
  fromPeerId,
  fromUserId: 'alice',
  relayOnly,
});

beforeEach(() => {
  downloads.clearDownloads();
  vi.clearAllMocks();
  m.have.clear();
  m.config = { relay: true };
  m.relayOnly = false;
  downloads.setMembershipResolver(() => true);
  m.openChannel.mockResolvedValue(channel);
  m.openRelayChannel.mockResolvedValue(channel);
  m.fetchOver.mockResolvedValue(new Blob(['x']));
  m.put.mockResolvedValue(undefined);
});

describe('downloads', () => {
  it('waits when nobody has it, and fills in when a member comes online', async () => {
    const a = att();
    candidates(0);
    downloads.ensure(a, 'FILE', 'c1');
    await until(() => status(a.sha256) === 'unavailable');

    candidates(1);
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    downloads.onPresence('alice');
    await until(() => status(a.sha256) === 'ready');
    expect(downloads.getDownload(a.sha256)).toMatchObject({
      url: `blob:${a.sha256}`,
      transport: 'p2p',
    });
    expect(m.put).toHaveBeenCalledWith(
      a.sha256,
      expect.any(Blob),
      'image/webp',
      'c1',
      'received',
      false,
    );
  });

  it('only retries conversations the person who came online is in', async () => {
    const a = att();
    candidates(0);
    downloads.ensure(a, 'FILE', 'c1');
    await until(() => status(a.sha256) === 'unavailable');
    downloads.setMembershipResolver(
      (conversationId, userId) => conversationId === 'c1' && userId === 'alice',
    );
    downloads.onPresence('stranger');
    await new Promise((r) => setTimeout(r, 30));
    expect(m.wsRequest).toHaveBeenCalledTimes(1);
  });

  it('fetches an identical file once', async () => {
    const a = att('same');
    candidates(1);
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    downloads.ensure(a, 'FILE', 'c1');
    downloads.ensure({ ...a, id: 'other-attachment' }, 'FILE', 'c2');
    await until(() => status('same') === 'ready');
    downloads.ensure(a, 'FILE', 'c1');
    expect(m.wsRequest).toHaveBeenCalledTimes(1);
    expect(m.fetchOver).toHaveBeenCalledTimes(1);
  });

  it('uses a file another tab of this browser already has', async () => {
    const a = att();
    m.have.add(a.sha256);
    downloads.ensure(a, 'FILE', 'c1');
    await until(() => status(a.sha256) === 'ready');
    expect(m.wsRequest).not.toHaveBeenCalled();
    expect(downloads.getDownload(a.sha256)!.transport).toBe('local');
  });

  it('runs at most three at a time, highest priority first', async () => {
    candidates(1);
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    const releases: (() => void)[] = [];
    m.fetchOver.mockImplementation(
      () => new Promise((resolve) => releases.push(() => resolve(new Blob(['x'])))),
    );
    const files = Array.from({ length: 5 }, () => att());
    files.forEach((f, i) =>
      downloads.ensure(f, 'FILE', 'c1', i === 4 ? downloads.PRIORITY.viewer : 50),
    );
    await until(() => releases.length === 3);
    const busy = () => files.filter((f) => status(f.sha256) === 'downloading').length;
    expect(busy()).toBe(3);
    expect(status(files[3]!.sha256)).toBe('queued');
    expect(status(files[4]!.sha256)).toBe('queued');
    // When a slot frees up, the viewer's file goes first even though it was asked for last.
    releases.shift()!();
    await until(() => status(files[4]!.sha256) === 'downloading');
    expect(status(files[3]!.sha256)).toBe('queued');
    releases.splice(0).forEach((r) => r());
    await until(() => releases.length === 1);
    releases[0]!();
    await until(() => files.every((f) => status(f.sha256) === 'ready'));
  });

  it('skips a holder whose bytes failed, and tries another', async () => {
    const a = att();
    candidates(2);
    m.waitForHave.mockImplementation(async (_req: string, exclude: Set<string>) =>
      exclude.has('bad-tab') ? holder('good-tab') : holder('bad-tab'),
    );
    m.fetchOver.mockRejectedValueOnce(new TransferError('HASH'));
    downloads.ensure(a, 'FILE', 'c1');
    await until(() => status(a.sha256) === 'ready');
    expect(m.openChannel.mock.calls.map((c) => c[0])).toEqual(['bad-tab', 'good-tab']);
  });

  it('gives up after three failed attempts', async () => {
    const a = att();
    candidates(1);
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    m.fetchOver.mockRejectedValue(new TransferError('CLOSED'));
    downloads.ensure(a, 'FILE', 'c1');
    await until(() => status(a.sha256) === 'failed');
    expect(m.fetchOver).toHaveBeenCalledTimes(3);
    m.fetchOver.mockResolvedValue(new Blob(['x']));
    downloads.retry(a.sha256);
    await until(() => status(a.sha256) === 'ready');
  });

  it('goes through the relay when either side hides its IP address', async () => {
    const a = att();
    const b = att();
    candidates(1);
    m.waitForHave.mockResolvedValue(holder('alice-tab', true)); // the holder hides theirs
    downloads.ensure(a, 'FILE', 'c1');
    await until(() => status(a.sha256) === 'ready');
    expect(m.openChannel).not.toHaveBeenCalled();
    expect(downloads.getDownload(a.sha256)!.transport).toBe('relay');

    m.relayOnly = true; // now we hide ours
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    downloads.ensure(b, 'FILE', 'c1');
    await until(() => status(b.sha256) === 'ready');
    expect(m.openChannel).not.toHaveBeenCalled();
    expect(m.openRelayChannel).toHaveBeenCalledTimes(2);
  });

  it('falls back to the relay when ICE times out (and fails without one)', async () => {
    const a = att();
    candidates(1);
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    m.openChannel.mockRejectedValue(new PeerError('ICE_TIMEOUT'));
    downloads.ensure(a, 'FILE', 'c1');
    await until(() => status(a.sha256) === 'ready');
    expect(downloads.getDownload(a.sha256)!.transport).toBe('relay');

    const b = att();
    m.config = { relay: false };
    downloads.ensure(b, 'FILE', 'c1');
    await until(() => status(b.sha256) === 'failed');
    expect(m.openRelayChannel).toHaveBeenCalledTimes(1);
  });

  it('can cancel a download', async () => {
    const a = att();
    candidates(1);
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    m.fetchOver.mockImplementation(
      (_c: unknown, _o: unknown, _s: unknown, _p: unknown, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new TransferError('CANCELLED'))),
        ),
    );
    downloads.ensure(a, 'FILE', 'c1');
    await until(() => status(a.sha256) === 'downloading');
    downloads.cancel(a.sha256);
    await until(() => status(a.sha256) === 'idle');
    await new Promise((r) => setTimeout(r, 20));
    expect(status(a.sha256)).toBe('idle');
  });

  it('asks for a video poster by its own hash', async () => {
    const v = {
      ...att('video'),
      mimeType: 'video/mp4',
      posterSha256: 'poster',
      posterSize: 5,
      posterMime: 'image/webp',
    };
    candidates(1);
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    downloads.ensure(v, 'POSTER', 'c1');
    await until(() => status('poster') === 'ready');
    expect(m.wsRequest).toHaveBeenCalledWith(expect.anything(), {
      attachmentId: v.id,
      part: 'POSTER',
    });
    expect(m.put).toHaveBeenCalledWith(
      'poster',
      expect.any(Blob),
      'image/webp',
      'c1',
      'received',
      true,
    );
    expect(status('video')).toBeUndefined();
  });

  it('asks again when the same file arrives in a newer message', async () => {
    const old = att('same-file');
    candidates(0); // nobody has the old copy
    downloads.ensure(old, 'FILE', 'c1');
    await until(() => status('same-file') === 'unavailable');

    candidates(1); // the new message's sender is online
    m.waitForHave.mockResolvedValue(holder('alice-tab'));
    downloads.ensure({ ...old, id: 'newer-attachment' }, 'FILE', 'c1');
    await until(() => status('same-file') === 'ready');
    expect(m.wsRequest).toHaveBeenLastCalledWith(expect.anything(), {
      attachmentId: 'newer-attachment',
      part: 'FILE',
    });
  });
});

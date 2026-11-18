// @vitest-environment node
import 'fake-indexeddb/auto';
import * as store from './store';

const blob = (text: string, type = 'image/webp') => new Blob([text], { type });

beforeEach(async () => {
  await store.clearAll();
});

describe('media store', () => {
  it('puts, finds and tags files by conversation', async () => {
    await store.put('a'.repeat(64), blob('photo'), 'image/webp', 'c1', 'sent');
    expect(store.has('a'.repeat(64))).toBe(true);
    expect(store.has('a'.repeat(64), 'c1')).toBe(true);
    expect(store.has('a'.repeat(64), 'c2')).toBe(false);
    expect(await store.hasAsync('a'.repeat(64), 'c1')).toBe(true);
    const got = await store.get('a'.repeat(64));
    expect(await got!.text()).toBe('photo');
  });

  it('keeps one copy for a file in several conversations, and forgets per conversation', async () => {
    const sha = 'b'.repeat(64);
    await store.put(sha, blob('same bytes'), 'image/webp', 'c1', 'received');
    await store.put(sha, blob('same bytes'), 'image/webp', 'c2', 'received');
    expect(store.has(sha, 'c1') && store.has(sha, 'c2')).toBe(true);
    expect((await store.usage()).photos).toBe(1);

    await store.forgetConversation('c1');
    expect(store.has(sha, 'c1')).toBe(false);
    expect(store.has(sha, 'c2')).toBe(true);

    await store.forgetConversation('c2');
    expect(store.has(sha)).toBe(false);
    expect(await store.get(sha)).toBeUndefined();
  });

  it('serves a held send before it is persisted, then persists it', async () => {
    const sha = 'c'.repeat(64);
    store.holdInMemory(sha, blob('pending', 'video/mp4'), 'c1');
    expect(store.has(sha, 'c1')).toBe(true);
    expect(await store.hasAsync(sha, 'c1')).toBe(true);
    await store.persist(sha, 'c1', 'sent');
    expect(await store.usage()).toMatchObject({ videos: 1, photos: 0, bytes: 7 });

    const other = 'd'.repeat(64);
    store.holdInMemory(other, blob('discarded'), 'c1');
    store.releaseMemory(other);
    expect(store.has(other)).toBe(false);
  });

  it('does not count video posters as photos', async () => {
    await store.put('e'.repeat(64), blob('frame'), 'image/webp', 'c1', 'received', true);
    expect(await store.usage()).toMatchObject({ photos: 0, videos: 0, bytes: 5 });
  });

  it('clears everything', async () => {
    await store.put('f'.repeat(64), blob('x'), 'image/webp', 'c1', 'sent');
    await store.clearAll();
    expect(store.has('f'.repeat(64))).toBe(false);
    expect(await store.hasAsync('f'.repeat(64))).toBe(false);
    expect(await store.usage()).toMatchObject({ bytes: 0, photos: 0, videos: 0 });
  });
});

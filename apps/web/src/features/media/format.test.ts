import { extensionFor, formatBytes, formatDuration, replaceExt, sniff } from './format';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [18_400_000, '18 MB'],
    [20 * 1024 * 1024, '20 MB'],
    [1.2 * 1024 * 1024, '1.2 MB'],
  ])('%d → %s', (n, out) => expect(formatBytes(n)).toBe(out));
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [42_000, '0:42'],
    [725_000, '12:05'],
    [3_753_000, '1:02:33'],
  ])('%d → %s', (ms, out) => expect(formatDuration(ms)).toBe(out));
});

describe('file names', () => {
  it('uses the extension of the verified type', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('video/quicktime')).toBe('mov');
    expect(extensionFor('text/html')).toBe('bin');
    expect(replaceExt('IMG_1234.HEIC', 'image/webp')).toBe('IMG_1234.webp');
    expect(replaceExt('holiday', 'image/jpeg')).toBe('holiday.jpg');
    expect(replaceExt('.png', 'image/png')).toBe('photo.png');
  });
});

describe('sniff', () => {
  const cases: Array<[string, Uint8Array]> = [
    ['image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0])],
    ['image/png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])],
    ['image/gif', bytes('GIF89a')],
    ['image/webp', bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 ')],
    ['image/avif', bytes([0, 0, 0, 0x1c], 'ftypavif')],
    ['video/mp4', bytes([0, 0, 0, 0x18], 'ftypisom')],
    ['video/quicktime', bytes([0, 0, 0, 0x14], 'ftypqt  ')],
    ['video/webm', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f])],
  ];
  it.each(cases)('recognises %s', (mime, head) => expect(sniff(head, mime)).toBe(true));

  it('refuses a mismatch and an HTML impostor', () => {
    const html = bytes('<!doctype html><script>');
    for (const [mime] of cases) expect(sniff(html, mime)).toBe(false);
    expect(sniff(cases[0]![1], 'image/png')).toBe(false);
    expect(sniff(bytes('RIFF', [1, 2, 3, 4], 'AVI LIST'), 'image/webp')).toBe(false);
    expect(sniff(cases[1]![1], 'image/svg+xml')).toBe(false);
  });
});

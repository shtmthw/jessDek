import { accept, kindOf, typeOf } from './prepare';

const MB = 1024 * 1024;
const cfg = { maxAttachments: 10, maxImageBytes: 20 * MB, maxVideoBytes: 100 * MB };
const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('accept', () => {
  it('caps the count first, counting what is already in the tray', () => {
    const files = Array.from({ length: 4 }, (_, i) => file(`p${i}.jpg`, 'image/jpeg'));
    const { accepted, rejected } = accept(files, 8, cfg);
    expect(accepted.map((f) => f.name)).toEqual(['p0.jpg', 'p1.jpg']);
    expect(rejected.map((r) => r.reason)).toEqual([
      'You can send up to 10 at a time.',
      'You can send up to 10 at a time.',
    ]);
  });

  it('refuses anything that isn’t a photo or a supported video', () => {
    const { accepted, rejected } = accept(
      [
        file('notes.pdf', 'application/pdf'),
        file('logo.svg', 'image/svg+xml'),
        file('clip.mkv', 'video/x-matroska'),
        file('ok.png', 'image/png'),
      ],
      0,
      cfg,
    );
    expect(accepted.map((f) => f.name)).toEqual(['ok.png']);
    expect(rejected[0]!.reason).toBe(
      '“notes.pdf” can’t be sent. Use a JPEG, PNG, WebP, GIF, MP4 or WebM file.',
    );
    expect(rejected.map((r) => r.file.name)).toEqual(['notes.pdf', 'logo.svg', 'clip.mkv']);
  });

  it('applies every size limit with its message', () => {
    const { accepted, rejected } = accept(
      [
        file('huge.jpg', 'image/jpeg', 51 * MB),
        file('big.gif', 'image/gif', 21 * MB),
        file('long.mp4', 'video/mp4', 101 * MB),
        file('fine.jpg', 'image/jpeg', 49 * MB), // resized before sending, so this is fine
        file('fine.mp4', 'video/mp4', 99 * MB),
      ],
      0,
      cfg,
    );
    expect(rejected.map((r) => r.reason)).toEqual([
      '“huge.jpg” is too large. Photos can be up to 50 MB.',
      '“big.gif” is too large. Photos can be up to 20 MB.',
      '“long.mp4” is too large. Videos can be up to 100 MB.',
    ]);
    expect(accepted.map((f) => f.name)).toEqual(['fine.jpg', 'fine.mp4']);
  });
});

describe('type inference', () => {
  it('falls back to the extension when the browser gives no type', () => {
    expect(typeOf(file('IMG_1.HEIC', ''))).toBe('image/heic');
    expect(typeOf(file('a.heif', ''))).toBe('image/heif');
    expect(typeOf(file('clip.MOV', ''))).toBe('video/quicktime');
    expect(typeOf(file('clip.m4v', ''))).toBe('video/mp4');
    expect(typeOf(file('clip.m4v', 'video/x-m4v'))).toBe('video/mp4');
    expect(typeOf(file('mystery', ''))).toBe('');
    expect(kindOf('image/heic')).toBe('IMAGE');
    expect(kindOf('video/quicktime')).toBe('VIDEO');
    expect(kindOf('image/svg+xml')).toBeNull();
    expect(kindOf('')).toBeNull();
  });
});

/** Formatting and file-type helpers shared by the UI, the worker and the transfer code. */

const UNITS = ['B', 'KB', 'MB', 'GB'];

/** 0 → "0 B", 1536 → "1.5 KB", 18_400_000 → "18 MB" (binary units, like the server limits). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const shown = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${shown} ${UNITS[unit]}`;
}

/** 42_000 → "0:42", 725_000 → "12:05", 3_753_000 → "1:02:33". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** The extension for a verified type ("bin" for anything else, which is never served as-is). */
export const extensionFor = (mime: string): string => EXTENSIONS[mime] ?? 'bin';

/** "IMG_1234.HEIC" + image/webp → "IMG_1234.webp". Download names always match the real type. */
export function replaceExt(name: string, mime: string): string {
  const base =
    name.replace(/\.[^./\\]{1,8}$/, '').trim() || (mime.startsWith('video/') ? 'video' : 'photo');
  return `${base}.${extensionFor(mime)}`;
}

const ascii = (bytes: Uint8Array, at: number, text: string) =>
  text.split('').every((c, i) => bytes[at + i] === c.charCodeAt(0));
const starts = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** How many leading bytes `sniff` needs. */
export const SNIFF_BYTES = 16;

/**
 * Does the start of a file match its declared type? Receivers check this so a holder can't pass
 * off, say, an HTML page as a photo.
 */
export function sniff(bytes: Uint8Array, mime: string): boolean {
  switch (mime) {
    case 'image/jpeg':
      return starts(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return starts(bytes, [0x89, 0x50, 0x4e, 0x47]);
    case 'image/gif':
      return ascii(bytes, 0, 'GIF8');
    case 'image/webp':
      return ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP');
    case 'image/avif':
      return ascii(bytes, 4, 'ftypavif') || ascii(bytes, 4, 'ftypavis');
    case 'video/mp4':
      return ascii(bytes, 4, 'ftyp');
    case 'video/quicktime':
      // Older QuickTime files can open with a movie atom instead of `ftyp`.
      return ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].some((box) => ascii(bytes, 4, box));
    case 'video/webm':
      return starts(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    default:
      return false;
  }
}

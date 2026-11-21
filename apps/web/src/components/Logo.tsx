/**
 * The jessDek monogram: j and D share one stem, the bowl is filled indigo
 * and the j's dot is the avatar sparkle. Source of truth:
 * docs/brand/jessdek-logo/concepts/f-monogram/icon.svg
 */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <rect width="512" height="512" rx="112" fill="#EEF0FF" />
      <path
        d="M198.67 155.82 L248.5 156.09 C317.27 157.21 358.83 197.42 358.04 262.93 C359.66 324.92 317.76 366.52 248.97 367.2 L200.24 366.84 Z"
        fill="#4F46E5"
        stroke="#18181B"
        strokeWidth={14.4305}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M200.41 155.82 L200.51 406.13 C199.18 441.51 179.51 455.23 153.79 447.76"
        fill="none"
        stroke="#18181B"
        strokeWidth={14.4305}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M205.57 69.15 C206.61 93.99 206.61 93.99 229.6 103.46 C204.76 104.5 204.76 104.5 195.29 127.49 C194.25 102.65 194.25 102.65 171.26 93.18 C196.1 92.14 196.1 92.14 205.57 69.15 Z"
        fill="#4F46E5"
      />
    </svg>
  );
}

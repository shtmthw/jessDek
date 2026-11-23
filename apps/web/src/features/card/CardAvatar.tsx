import { memo, useId, useMemo } from 'react';
import { AvatarFigure, VIEW_AVATAR, VIEW_FULL } from '../avatar/AvatarFigure';
import { parseRecipe } from '../avatar/recipe';
import type { CardRecipe } from './recipe';
import type { CardTheme } from './theme';

/** Avatar frame outlines in a 100 × 100 box. */
function stampPath(n = 7, r = 3.4, inset = 2) {
  const a = inset;
  const b = 100 - inset;
  const L = (b - a) / n;
  let d = `M${a} ${a}`;
  const edge = (from: [number, number], dir: [number, number]) => {
    for (let i = 0; i < n; i++) {
      const m = i * L + L / 2;
      const p1 = [from[0] + dir[0] * (m - r), from[1] + dir[1] * (m - r)];
      const p2 = [from[0] + dir[0] * (m + r), from[1] + dir[1] * (m + r)];
      d += ` L${p1[0]!.toFixed(2)} ${p1[1]!.toFixed(2)} A${r} ${r} 0 0 0 ${p2[0]!.toFixed(2)} ${p2[1]!.toFixed(2)}`;
    }
  };
  edge([a, a], [1, 0]);
  d += ` L${b} ${a}`;
  edge([b, a], [0, 1]);
  d += ` L${b} ${b}`;
  edge([b, b], [-1, 0]);
  d += ` L${a} ${b}`;
  edge([a, b], [0, -1]);
  return `${d} Z`;
}

export const FRAME_PATHS: Record<string, string> = {
  circle: 'M50 0 A50 50 0 1 1 49.99 0 Z',
  squircle: 'M50 0 C88 0 100 12 100 50 C100 88 88 100 50 100 C12 100 0 88 0 50 C0 12 12 0 50 0 Z',
  rounded: 'M22 0 H78 Q100 0 100 22 V78 Q100 100 78 100 H22 Q0 100 0 78 V22 Q0 0 22 0 Z',
  arch: 'M2 100 V50 A48 48 0 0 1 98 50 V100 Z',
  blob: 'M53 1 C75 0 96 15 98 41 C100 63 92 85 70 95 C49 103 22 98 10 78 C-2 58 2 31 16 15 C26 6 39 2 53 1 Z',
  hexagon: 'M50 1 L93 25.5 V74.5 L50 99 L7 74.5 V25.5 Z',
  stamp: stampPath(),
};

const RAINBOW = ['#ff6b8b', '#ffb347', '#ffe066', '#6ee7a8', '#6cc4ff', '#a78bfa'];

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

/**
 * The person's own avatar (the same recipe and colour as everywhere else in the app), in the
 * card's frame, backdrop and ring.
 */
export const CardAvatar = memo(function CardAvatar({
  user,
  card,
  theme,
  size,
  fade,
  lite = false,
}: {
  user: { displayName: string; avatar: string | null; avatarColor: string };
  card: CardRecipe;
  theme: CardTheme;
  /** Rendered width and height in layout px. */
  size: number;
  /** Soften the bottom edge of a cut-out figure (when it doesn't stand on a divider). */
  fade?: boolean;
  /** A light card: a `glow` ring is drawn plain, without its blurred drop shadows. */
  lite?: boolean;
}) {
  const uid = `ca${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const recipe = useMemo(() => parseRecipe(user.avatar), [user.avatar]);
  const character = recipe.style === 'character';
  const cutout = card.frame === 'none' && character;
  const shape = FRAME_PATHS[card.frame] ?? FRAME_PATHS.circle!;
  const unit = 100 / size; // layout px → frame units

  if (cutout) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden
        style={
          fade
            ? {
                maskImage: 'linear-gradient(to bottom, #000 78%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, #000 78%, transparent)',
              }
            : undefined
        }
      >
        <AvatarFigure
          recipe={recipe}
          viewBox={VIEW_FULL}
          box={{ x: 0, y: 0, width: 100, height: 100 }}
          size={size}
        />
      </svg>
    );
  }

  const ringW = { thin: 2.5, thick: 5, double: 6, dashed: 3, rainbow: 5, glow: 3 }[card.ring] ?? 0;
  const ringPaint = card.ring === 'rainbow' ? `url(#${uid}-rb)` : theme.line;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      overflow="visible"
      aria-hidden
      style={
        card.ring === 'glow' && !lite
          ? { filter: `drop-shadow(0 0 ${8}px ${theme.line}) drop-shadow(0 0 2px ${theme.line})` }
          : undefined
      }
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <path d={shape} />
        </clipPath>
        {card.ring === 'rainbow' ? (
          <linearGradient id={`${uid}-rb`} x1="0" y1="0" x2="1" y2="1">
            {RAINBOW.map((c, i) => (
              <stop key={c} offset={i / (RAINBOW.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        ) : null}
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>
        {/* Always their own avatar colour, so the card shows the avatar they made. */}
        <rect width={100} height={100} fill={user.avatarColor} />
        {character ? (
          <AvatarFigure
            recipe={recipe}
            viewBox={VIEW_AVATAR}
            box={{ x: 0, y: card.frame === 'arch' ? 2 : 0, width: 100, height: 100 }}
            // Its layout size, so it needn't measure itself: a nested <svg> reports no width and
            // fell back to a forced layout (and the fan's on-screen scale) on every card mount.
            size={size}
          />
        ) : (
          <text
            x={50}
            y={52}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={38}
            fontWeight={650}
            fill="#fff"
            fontFamily="'Figtree Variable', ui-sans-serif, system-ui, sans-serif"
            letterSpacing={-1}
          >
            {initials(user.displayName)}
          </text>
        )}
      </g>
      {ringW > 0 ? (
        <path
          d={shape}
          fill="none"
          stroke={ringPaint}
          strokeWidth={ringW * unit}
          strokeLinejoin="round"
          strokeDasharray={card.ring === 'dashed' ? `${7 * unit} ${5 * unit}` : undefined}
          strokeLinecap="round"
        />
      ) : null}
      {card.ring === 'double' ? (
        <path
          d={shape}
          fill="none"
          stroke={theme.bg.base}
          strokeWidth={2 * unit}
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
});

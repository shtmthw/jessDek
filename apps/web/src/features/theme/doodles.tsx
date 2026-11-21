import {
  cloneElement,
  Fragment,
  isValidElement,
  memo,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react';
import { INK as ART_INK } from '../avatar/art';
import { TILES } from '../card/patterns';
import { STICKERS } from '../card/stickers';
import { byId, DOODLES } from './catalog';

/**
 * Wallpaper doodles. A scatter set re-draws card stickers as fine line art in one ink (outlines kept,
 * fills dropped, inked details such as eyes kept), placed by hand on a square tile that repeats.
 */

/** Stroke width of a doodle line, in the sticker's 100-unit box (about 1.3 px at doodle size). */
const LINE = 3.8;

type Props = Record<string, unknown> & { children?: ReactNode };

const isInk = (v: unknown) => typeof v === 'string' && v.toLowerCase() === ART_INK;
const isNone = (v: unknown) => v === 'none' || v === 'transparent';

/**
 * One sticker drawing as line art in `ink`. `stroked`: an ancestor sets a stroke (inherited by SVG).
 * Shapes with an outline lose their fill; outline-less shapes stay only when they're inked details.
 */
function toLineArt(
  node: ReactNode,
  ink: string,
  stroked: boolean,
  key?: string | number,
): ReactNode {
  if (Array.isArray(node)) return node.map((n, i) => toLineArt(n, ink, stroked, i));
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<Props>;
  if (el.type === Fragment)
    return <Fragment key={key}>{toLineArt(el.props.children, ink, stroked)}</Fragment>;
  if (typeof el.type !== 'string') return null; // drawings are plain SVG elements
  const p = el.props;
  if (el.type === 'text' || el.type === 'defs' || el.type === 'filter') return null;
  const hasStroke = p.stroke !== undefined ? !isNone(p.stroke) : stroked;
  const next: Props = {};
  if (p.stroke !== undefined && !isNone(p.stroke)) next.stroke = ink;
  if (p.strokeWidth !== undefined) next.strokeWidth = LINE;
  if (p.opacity !== undefined) next.opacity = undefined;
  if (p.filter !== undefined) next.filter = undefined;
  const leaf = el.type !== 'g';
  if (leaf) {
    const fill = p.fill;
    if (hasStroke) {
      next.fill = 'none';
      next.stroke = ink;
      next.strokeWidth = LINE;
      next.strokeLinecap = 'round';
      next.strokeLinejoin = 'round';
    } else if (isInk(fill)) {
      next.fill = ink;
    } else {
      return null; // a colour fill, a shine or a blush: not part of the line drawing
    }
  } else if (p.fill !== undefined) {
    next.fill = hasStroke ? 'none' : isInk(p.fill) ? ink : 'none';
  }
  const children = p.children !== undefined ? toLineArt(p.children, ink, hasStroke) : undefined;
  return cloneElement(el, { ...next, key }, children);
}

/** Stickers in each scatter set, with where they sit on a 300 × 300 tile: [id, x, y, scale, turn]. */
type Spot = [string, number, number, number, number];
const SETS: Record<string, Spot[]> = {
  doodles: [
    ['star', 40, 46, 1, -12],
    ['heart', 158, 30, 0.85, 10],
    ['note', 262, 70, 0.9, 8],
    ['cloud', 100, 140, 1.05, 0],
    ['sparkle', 220, 168, 0.8, 0],
    ['smiley', 36, 236, 0.9, -8],
    ['flower', 150, 252, 0.95, 14],
    ['planet', 262, 262, 0.9, -16],
  ],
  snacks: [
    ['pizza', 44, 50, 1, -14],
    ['donut', 166, 34, 0.9, 8],
    ['cherry', 266, 84, 0.85, 10],
    ['coffee', 96, 150, 0.95, -6],
    ['icecream', 216, 176, 1, 12],
    ['boba', 40, 252, 0.95, 6],
    ['donut', 150, 262, 0.75, -20],
    ['cherry', 266, 270, 0.7, -8],
  ],
  nature: [
    ['flower', 44, 48, 1, -10],
    ['clover', 164, 36, 0.85, 12],
    ['sun', 268, 78, 0.9, 0],
    ['mushroom', 98, 150, 0.95, -6],
    ['cactus', 218, 178, 0.95, 8],
    ['cloud', 46, 250, 0.9, 0],
    ['flower', 152, 262, 0.75, 18],
    ['clover', 266, 268, 0.7, -14],
  ],
  space: [
    ['planet', 46, 50, 1, -14],
    ['star', 160, 34, 0.75, 10],
    ['rocket', 266, 80, 0.95, 24],
    ['moon', 100, 150, 0.9, -8],
    ['sparkle', 214, 172, 0.8, 0],
    ['alien', 44, 252, 0.95, 6],
    ['star', 152, 262, 0.6, -12],
    ['planet', 266, 266, 0.7, 16],
  ],
  pets: [
    ['cat', 46, 50, 1, -8],
    ['paw', 162, 36, 0.75, 16],
    ['heart', 268, 76, 0.7, 10],
    ['ghost', 100, 154, 0.95, -6],
    ['paw', 220, 176, 0.8, -18],
    ['heart', 40, 250, 0.65, -12],
    ['cat', 152, 262, 0.85, 10],
    ['paw', 268, 268, 0.7, 4],
  ],
  music: [
    ['note', 44, 50, 1, -10],
    ['headphones', 164, 40, 0.95, 8],
    ['star', 268, 82, 0.7, 12],
    ['note', 100, 154, 0.8, 14],
    ['sparkle', 216, 172, 0.75, 0],
    ['headphones', 46, 254, 0.8, -12],
    ['note', 154, 262, 0.7, -6],
    ['heart', 266, 266, 0.7, 10],
  ],
  games: [
    ['controller', 48, 50, 1, -10],
    ['dice', 166, 38, 0.8, 14],
    ['gem', 268, 82, 0.8, -6],
    ['bolt', 100, 152, 0.85, 12],
    ['crown', 218, 176, 0.9, -8],
    ['dice', 44, 254, 0.7, -16],
    ['controller', 154, 262, 0.75, 10],
    ['star', 266, 266, 0.7, 0],
  ],
};

export const SCATTER_TILE = 300;
/** The card's pattern tiles are card-sized: a wallpaper draws them larger, so they read calmer. */
const PATTERN_SCALE = 1.6;
/** A doodle's size on the tile at scale 1, in px. */
const DOODLE_PX = 46;

function ScatterTile({ set, ink }: { set: Spot[]; ink: string }) {
  return (
    <>
      {set.map(([id, x, y, s, r], i) => {
        const def = STICKERS[id];
        if (!def) return null;
        const k = (DOODLE_PX * s) / 100;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${k}) translate(-50 -50)`}>
            {toLineArt(def.draw('#ffffff'), ink, false)}
          </g>
        );
      })}
    </>
  );
}

/**
 * The doodle layer as an SVG `<pattern>` with the given id (null for none). `scale` shrinks it for the
 * theme sheet's small previews.
 */
export function doodlePattern(
  id: string,
  ink: string,
  patternId: string,
  scale = 1,
): ReactElement | null {
  const doodle = byId(DOODLES, id);
  if (doodle.kind === 'pattern') {
    const tile = TILES[doodle.id];
    if (!tile) return null;
    const k = scale * PATTERN_SCALE;
    const transform = [
      tile.angle ? `rotate(${tile.angle})` : '',
      k !== 1 ? `scale(${+k.toFixed(3)})` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <pattern
        id={patternId}
        width={tile.w}
        height={tile.h ?? tile.w}
        patternUnits="userSpaceOnUse"
        patternTransform={transform || undefined}
      >
        {tile.draw(ink)}
      </pattern>
    );
  }
  const set = doodle.kind === 'scatter' ? SETS[doodle.id] : undefined;
  if (!set) return null;
  return (
    <pattern
      id={patternId}
      width={SCATTER_TILE}
      height={SCATTER_TILE}
      patternUnits="userSpaceOnUse"
      patternTransform={scale !== 1 ? `scale(${scale})` : undefined}
    >
      <ScatterTile set={set} ink={ink} />
    </pattern>
  );
}

/** Fills its (positioned) parent with a doodle layer: a repeating pattern or a scatter set. */
export const Doodles = memo(function Doodles({
  id,
  ink,
  opacity,
  scale = 1,
}: {
  id: string;
  ink: string;
  opacity: number;
  scale?: number;
}) {
  const uid = `dd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pattern = opacity > 0 ? doodlePattern(id, ink, uid, scale) : null;
  if (!pattern) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" style={{ opacity }}>
      <defs>{pattern}</defs>
      <rect width="100%" height="100%" fill={`url(#${uid})`} />
    </svg>
  );
});

/** For tests and the board generator: the scatter sets' sticker ids. */
export const scatterStickers = (id: string) => (SETS[id] ?? []).map(([k]) => k);

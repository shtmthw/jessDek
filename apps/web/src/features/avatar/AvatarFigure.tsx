import { memo, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SW, type Item, type Paint } from './art';
import { luminance, mix } from './color';
import { colorOf, EYE_COLORS, GLASSES_COLORS, HAIR_COLORS, ITEM_COLORS, SKINS } from './palettes';
import { CLIPS, EARRINGS, GLASSES } from './parts/accessories';
import { NECKS, TOPS } from './parts/clothes';
import {
  BROWS,
  CHEEKS,
  Ears,
  EYES,
  Head,
  MARKS,
  MOUTHS,
  Neck,
  NOSES,
  bodyOf,
  type FaceId,
} from './parts/face';
import { HAIRS } from './parts/hair';
import { HATS, type HatItem } from './parts/hats';
import { PETS } from './parts/pets';
import type { Recipe } from './recipe';

const NOTHING: Item = { label: '' };
const item = (map: Record<string, Item>, id: string): Item => map[id] ?? NOTHING;

/**
 * Pets ride up the shoulder towards the neck (the shoulder rises about as fast as it comes in
 * there), so on the lowered shoulders they still sit on it but aren't cut off by the circle.
 */
const PET_LIFT = 'translate(7 -7)';

/** How far up the figure moves, so the shoulders under the long neck stay in frame. */
const LIFT = 7;
/** The highest a figure may reach once moved: the frame's top (y 8) plus room for the outline. */
const HEADROOM = 12;

/**
 * The figure sits `LIFT` higher, except as far as tall hair or headwear needs room above it: then
 * it moves up only as much as keeps that in the frame (no higher than before it was lifted).
 */
export function liftFor(hair: Item, hat: Item): number {
  const top = Math.min(hair.top ?? Infinity, hat.top ?? Infinity);
  return Math.min(LIFT, Math.max(0, top - HEADROOM));
}

/** The same viewBox moved down by `dy`. */
const moveView = (view: string, dy: number) => {
  if (!dy) return view;
  const [x, y, w, h] = view.split(/\s+/).map(Number);
  return `${x} ${y! + dy} ${w} ${h}`;
};

export function paintFor(r: Recipe, uid: string): Paint {
  const skin = colorOf(SKINS, r.skin);
  const light = luminance(skin) > 0.25;
  const hair = colorOf(HAIR_COLORS, r.hairColor);
  const hairLum = luminance(hair);
  const hat = colorOf(ITEM_COLORS, r.hatColor);
  const top = colorOf(ITEM_COLORS, r.topColor);
  const neck = colorOf(ITEM_COLORS, r.neckColor);
  const clip = colorOf(ITEM_COLORS, r.clipColor);
  const earring = colorOf(ITEM_COLORS, r.earringColor);
  // A detail the same colour as the top would vanish (checks, print, patch): shift it a step.
  const accent =
    r.topAccent === r.topColor
      ? luminance(top) > 0.45
        ? mix(top, '#18181b', 0.72)
        : mix(top, '#ffffff', 0.62)
      : colorOf(ITEM_COLORS, r.topAccent);
  return {
    skin,
    skinShade: light ? mix(skin, '#7a2e17', 0.2) : mix(skin, '#160805', 0.32),
    blush: mix(skin, '#ff5c80', light ? 0.55 : 0.6),
    hair,
    hairShade: mix(hair, '#1a0f0a', 0.25),
    hairShine: mix(hair, '#ffffff', hairLum < 0.05 ? 0.3 : 0.5),
    brow: hairLum > 0.35 ? mix(hair, '#3b2418', 0.55) : hair,
    eye: colorOf(EYE_COLORS, r.eyeColor),
    hat,
    hatShade: mix(hat, '#1b1020', 0.2),
    hatTint: mix(hat, '#ffffff', 0.45),
    top,
    topShade: mix(top, '#1b1020', 0.2),
    topTint: mix(top, '#ffffff', 0.45),
    neck,
    neckShade: mix(neck, '#1b1020', 0.2),
    glasses: colorOf(GLASSES_COLORS, r.glassesColor),
    clip,
    clipShade: mix(clip, '#1b1020', 0.22),
    earring,
    earringShade: mix(earring, '#1b1020', 0.22),
    accent,
    accentShade: mix(accent, '#1b1020', 0.2),
    slim: r.build === 'slim',
    uid,
  };
}

/** The whole canvas (studio preview), the in-app framing, and a closer crop for tiny sizes. */
export const VIEW_FULL = '0 0 200 200';
export const VIEW_AVATAR = '10 8 180 180';
export const VIEW_CLOSE = '20 22 160 160';

/**
 * Every avatar is drawn with fine lines. The parts are drawn at a heavier weight, so one pass over
 * the rendered strokes scales them, whatever item they belong to.
 *
 * How much depends on the size it's shown at: `FINE` at studio and card sizes, and less thinning
 * as it gets small, so an outline never drops under `MIN_PX` and a chat-list face still reads.
 */
const FINE = 0.4;
const MIN_PX = 0.9;

/** The stroke scale for an avatar `px` CSS pixels wide showing `viewW` units of the drawing. */
export function lineScale(px: number, viewW: number): number {
  if (!(px > 0)) return FINE;
  return Math.min(1, Math.max(FINE, (MIN_PX * viewW) / (SW * px)));
}

function useLineWeight(
  svg: React.RefObject<SVGSVGElement | null>,
  viewW: number,
  recipe: Recipe,
  size?: number,
) {
  // The size it's drawn at (layout size, so a dialog scaling in doesn't change the lines). A known
  // `size` skips measuring: no forced layout, and no second render once the size comes in.
  const [measured, setPx] = useState(0);
  const px = size ?? measured;
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el || size !== undefined) return;
    setPx(Math.round(el.clientWidth || el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setPx(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [svg, size]);

  const scale = Math.round(lineScale(px, viewW) * 100) / 100;
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    el.querySelectorAll<SVGElement>('[stroke-width]').forEach((node) => {
      const w = Number.parseFloat(node.getAttribute('stroke-width') ?? '');
      if (Number.isFinite(w)) node.style.strokeWidth = `${Math.round(w * scale * 100) / 100}px`;
    });
  }, [svg, scale, recipe]);
}

/**
 * Draws a character from a recipe as a square SVG. The caller clips it (the avatar circle) and
 * paints the background colour. Layer order is documented in AVATAR_PLAN.md §3.1.
 */
export const AvatarFigure = memo(function AvatarFigure({
  recipe,
  viewBox = VIEW_FULL,
  className,
  box,
  anchor = 'figure',
  size,
}: {
  recipe: Recipe;
  viewBox?: string;
  className?: string;
  /**
   * `head`: the viewBox frames the head (a studio tile for a hat, glasses, eyes...) and follows
   * it, wherever the lift for tall hair or headwear puts it. Default: it frames the whole figure.
   */
  anchor?: 'figure' | 'head';
  /** Position and size when nested inside another SVG (the card's avatar frame). */
  box?: { x: number; y: number; width: number; height: number };
  /** Its width in CSS px when the caller knows it, so it needn't measure itself. */
  size?: number;
}) {
  const uid = `av${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const p = useMemo(() => paintFor(recipe, uid), [recipe, uid]);
  const svg = useRef<SVGSVGElement>(null);
  useLineWeight(svg, Number(viewBox.split(/\s+/)[2]) || 200, recipe, size);
  const hat: HatItem = (HATS as Record<string, HatItem>)[recipe.hat] ?? NOTHING;
  const hair = item(HAIRS, recipe.hair);
  const top = item(TOPS, recipe.top);
  const pet = item(PETS, recipe.pet);
  const clipId = hat.clip ? `${uid}-hat` : undefined;
  const slim = recipe.build === 'slim';
  const body = bodyOf(slim);
  const lift = liftFor(hair, hat);
  const clip = clipId ? `url(#${clipId})` : undefined;

  return (
    <svg
      ref={svg}
      viewBox={anchor === 'head' ? moveView(viewBox, -lift) : viewBox}
      className={className}
      {...box}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      {clipId ? (
        <defs>
          <clipPath id={clipId}>
            <path d={hat.clip} />
          </clipPath>
        </defs>
      ) : null}
      {/* The figure sits a little higher, so the lowered shoulders and necklaces stay in frame. */}
      <g transform={lift ? `translate(0 ${-lift})` : undefined}>
        <g clipPath={clip}>{hair.back?.(p)}</g>
        {hat.back?.(p)}
        <Neck p={p} slim={slim} />
        {/* Everything below the neck sits lower, under the long neck (and narrower when slim). */}
        <g transform={body}>
          <g transform={PET_LIFT}>{pet.back?.(p)}</g>
          {top.back?.(p)}
          {top.front?.(p)}
          {item(NECKS, recipe.neck).front?.(p)}
        </g>
        <g clipPath={clip}>{hair.mid?.(p)}</g>
        <Ears p={p} />
        {item(EARRINGS, recipe.earrings).front?.(p)}
        <Head p={p} face={recipe.face as FaceId} />
        {item(CHEEKS, recipe.cheeks).front?.(p)}
        {item(MARKS, recipe.mark).front?.(p)}
        {item(BROWS, recipe.brows).front?.(p)}
        {item(EYES, recipe.eyes).front?.(p)}
        {item(NOSES, recipe.nose).front?.(p)}
        {item(MOUTHS, recipe.mouth).front?.(p)}
        <g clipPath={clip}>{hair.front?.(p)}</g>
        {item(CLIPS, recipe.clip).front?.(p)}
        {item(GLASSES, recipe.glasses).front?.(p)}
        {hat.front?.(p)}
        <g transform={body}>
          <g transform={PET_LIFT}>{pet.front?.(p)}</g>
        </g>
      </g>
    </svg>
  );
});

import { memo, useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { Item, Paint } from './art';
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
  SLIM_BODY,
  type FaceId,
} from './parts/face';
import { HAIRS } from './parts/hair';
import { HATS, type HatItem } from './parts/hats';
import { PETS } from './parts/pets';
import type { Recipe } from './recipe';

const NOTHING: Item = { label: '' };
const item = (map: Record<string, Item>, id: string): Item => map[id] ?? NOTHING;

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
 * The "fine" line weight draws every outline thinner. Parts are all drawn at the bold weight, so
 * one pass over the rendered strokes scales them, whatever item they belong to. Tiny avatars keep
 * a little more weight so the face still reads.
 */
const FINE = 0.4;
const FINE_SMALL = 0.7;

function useLineWeight(svg: React.RefObject<SVGSVGElement | null>, scale: number, recipe: Recipe) {
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    el.querySelectorAll<SVGElement>('[stroke-width]').forEach((node) => {
      if (scale === 1) {
        node.style.strokeWidth = '';
        return;
      }
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
}: {
  recipe: Recipe;
  viewBox?: string;
  className?: string;
  /** Position and size when nested inside another SVG (the card's avatar frame). */
  box?: { x: number; y: number; width: number; height: number };
}) {
  const uid = `av${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const p = useMemo(() => paintFor(recipe, uid), [recipe, uid]);
  const svg = useRef<SVGSVGElement>(null);
  useLineWeight(
    svg,
    recipe.line === 'fine' ? (viewBox === VIEW_CLOSE ? FINE_SMALL : FINE) : 1,
    recipe,
  );
  const hat: HatItem = (HATS as Record<string, HatItem>)[recipe.hat] ?? NOTHING;
  const hair = item(HAIRS, recipe.hair);
  const top = item(TOPS, recipe.top);
  const pet = item(PETS, recipe.pet);
  const clipId = hat.clip ? `${uid}-hat` : undefined;
  const slim = recipe.build === 'slim';
  const clip = clipId ? `url(#${clipId})` : undefined;

  return (
    <svg
      ref={svg}
      viewBox={viewBox}
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
      {/* The slim build sits a little higher, so its lowered shoulders and necklaces stay in frame. */}
      <g transform={slim ? 'translate(0 -7)' : undefined}>
        <g clipPath={clip}>{hair.back?.(p)}</g>
        {hat.back?.(p)}
        {slim ? <Neck p={p} slim /> : null}
        {/* The slim build lowers and narrows everything below the neck. */}
        <g transform={slim ? SLIM_BODY : undefined}>
          {pet.back?.(p)}
          {top.back?.(p)}
          {slim ? null : <Neck p={p} />}
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
        <g transform={slim ? SLIM_BODY : undefined}>{pet.front?.(p)}</g>
      </g>
    </svg>
  );
});

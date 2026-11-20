import { useEffect, useState } from 'react';
import { FONTS } from './catalog';

/**
 * Card fonts ship with the app (Fontsource, served from our own origin) and load the first time a
 * card uses them. Figtree is the app font and is always there.
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  bubbly: () => import('@fontsource-variable/fredoka'),
  storybook: () => import('@fontsource-variable/fraunces'),
  typewriter: () => import('@fontsource-variable/jetbrains-mono'),
  handwritten: () => import('@fontsource-variable/caveat'),
  marker: () => import('@fontsource/permanent-marker'),
  pixel: () => import('@fontsource-variable/pixelify-sans'),
};

const loaded = new Map<string, Promise<void>>();
const ready = new Set<string>();

/**
 * Fetches the font files themselves. Adding the stylesheet only declares the faces: the browser
 * downloads one when text first uses it, so the card would show a fallback and then reflow.
 */
function fetchFaces(id: string): Promise<unknown> {
  const font = FONTS.find((f) => f.id === id);
  const faces = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!font || !faces?.load) return Promise.resolve();
  return Promise.all(
    [...new Set([font.regular, font.bold])].map((w) => faces.load(`${w} 16px ${font.family}`)),
  );
}

/** Loads a card font. Resolves once its faces are ready (or failed). */
export function loadCardFont(id: string): Promise<void> {
  const hit = loaded.get(id);
  if (hit) return hit;
  const load = LOADERS[id];
  const p = load
    ? load()
        .then(() => fetchFaces(id))
        .then(
          () => void ready.add(id),
          () => void ready.add(id),
        )
    : Promise.resolve();
  loaded.set(id, p);
  return p;
}

/** Starts loading a card font; true once it's ready. */
export function useCardFont(id: string): boolean {
  const [isReady, setReady] = useState(() => !LOADERS[id] || ready.has(id));
  useEffect(() => {
    let live = true;
    if (!LOADERS[id]) {
      setReady(true);
      return;
    }
    setReady(ready.has(id));
    void loadCardFont(id).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [id]);
  return isReady;
}

/**
 * Whether to show a card yet: once its font is ready, or after `wait` ms at most (a slow network
 * shouldn't hold the card back; it then reflows once the font arrives). No font yet: true.
 */
export function useCardFontGate(id: string | undefined, wait = 700): boolean {
  const fontReady = useCardFont(id ?? 'clean');
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (fontReady || !id) return;
    setWaited(false);
    const t = setTimeout(() => setWaited(true), wait);
    return () => clearTimeout(t);
  }, [id, fontReady, wait]);
  return !id || fontReady || waited;
}

/** Warm every card font (the studio's Font tab shows them all). */
export const preloadCardFonts = () => Object.keys(LOADERS).forEach((id) => void loadCardFont(id));

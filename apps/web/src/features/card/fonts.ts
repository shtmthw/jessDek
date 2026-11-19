import { useEffect, useState } from 'react';

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

/** Loads the stylesheet for a card font. Resolves once its faces are ready (or failed). */
export function loadCardFont(id: string): Promise<void> {
  const hit = loaded.get(id);
  if (hit) return hit;
  const load = LOADERS[id];
  const p = load
    ? load()
        .then(() => (typeof document !== 'undefined' ? document.fonts?.ready : undefined))
        .then(
          () => undefined,
          () => undefined,
        )
    : Promise.resolve();
  loaded.set(id, p);
  return p;
}

/** Starts loading a card font; true once it's ready. */
export function useCardFont(id: string): boolean {
  const [ready, setReady] = useState(() => !LOADERS[id]);
  useEffect(() => {
    let live = true;
    if (!LOADERS[id]) {
      setReady(true);
      return;
    }
    setReady(false);
    void loadCardFont(id).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [id]);
  return ready;
}

/** Warm every card font (the studio's Font tab shows them all). */
export const preloadCardFonts = () => Object.keys(LOADERS).forEach((id) => void loadCardFont(id));

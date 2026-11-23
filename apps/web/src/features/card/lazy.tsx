import { lazy } from 'react';

/*
 * Screens most visits never open, split out of the main bundle. Each loads the first time it's
 * shown, and `prefetchScreens` warms them all once the app is idle, so opening one later is instant.
 */
const load = {
  cardStudio: () => import('./CardStudio'),
  avatarStudio: () => import('../avatar/AvatarStudio'),
  settings: () => import('../settings/SettingsPage'),
  cardPages: () => import('./CardPages'),
  cardDialog: () => import('./CardDialog'),
  discover: () => import('../discover/pages'),
};

export const CardStudio = lazy(() => load.cardStudio().then((m) => ({ default: m.CardStudio })));
export const AvatarStudio = lazy(() =>
  load.avatarStudio().then((m) => ({ default: m.AvatarStudio })),
);
export const SettingsPage = lazy(() => load.settings().then((m) => ({ default: m.SettingsPage })));
export const SignedInCardPage = lazy(() =>
  load.cardPages().then((m) => ({ default: m.SignedInCardPage })),
);
export const PublicCardPage = lazy(() =>
  load.cardPages().then((m) => ({ default: m.PublicCardPage })),
);
export const CardDialog = lazy(() => load.cardDialog().then((m) => ({ default: m.CardDialog })));
export const DiscoverFront = lazy(() =>
  load.discover().then((m) => ({ default: m.DiscoverFront })),
);
export const DeckFanPage = lazy(() => load.discover().then((m) => ({ default: m.DeckFanPage })));
export const DeckCardPage = lazy(() => load.discover().then((m) => ({ default: m.DeckCardPage })));

let prefetched = false;
/** Fetch every split-out screen in the background, once, when the browser has a moment. */
export function prefetchScreens() {
  if (prefetched) return;
  prefetched = true;
  const run = () => Object.values(load).forEach((l) => void l().catch(() => undefined));
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 1500);
}

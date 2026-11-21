import { AnimatePresence, motion } from 'motion/react';
import { createContext, lazy, Suspense, useContext, useMemo, type CSSProperties } from 'react';
import { serializeTheme, type ThemeSpec } from './recipe';
import { resolveTheme, themeVars } from './resolve';

/**
 * The themed chat's wallpaper: the wall colour or gradient and its doodles. Each layer carries its
 * own colours, so a theme change crossfades the old wallpaper into the new one (for everyone in the
 * chat, live). Sits behind the messages and composer, inside an `isolate` parent.
 */
export function ChatWallpaper({ spec }: { spec: ThemeSpec }) {
  return (
    <AnimatePresence initial={false}>
      {spec.classic ? null : (
        <motion.div
          key={serializeTheme(spec)}
          aria-hidden
          data-chat-wallpaper
          className="pointer-events-none absolute inset-0 -z-10"
          style={wallVars(spec)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <DoodleLayer id={spec.doodle} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A still wallpaper (no crossfade), for previews. `scale` shrinks the doodles; `boost` strengthens
 * their ink, for small picker tiles where the wallpaper's quiet strength would hide the pattern.
 */
export function WallpaperLayer({
  spec,
  scale = 1,
  boost = 1,
}: {
  spec: ThemeSpec;
  scale?: number;
  boost?: number;
}) {
  if (spec.classic) return null;
  return (
    <span
      aria-hidden
      data-chat-wallpaper
      className="pointer-events-none absolute inset-0 -z-10"
      style={wallVars(spec, boost)}
    >
      <DoodleLayer id={spec.doodle} scale={scale} />
    </span>
  );
}

function wallVars(spec: ThemeSpec, boost = 1): CSSProperties {
  const light = resolveTheme(spec, 'light');
  const dark = resolveTheme(spec, 'dark');
  const ink = (opacity: number) => String(Math.min(1, opacity * boost));
  return {
    '--lw': light.wall,
    '--dw': dark.wall,
    '--ld': light.doodle,
    '--dd': dark.doodle,
    '--lo': ink(light.doodleOpacity),
    '--do': ink(dark.doodleOpacity),
  } as CSSProperties;
}

/** The doodles load on demand (they're drawn from the card stickers). */
const LazyDoodles = lazy(() => import('./DoodleLayer'));

function DoodleLayer({ id, scale = 1 }: { id: string; scale?: number }) {
  if (id === 'none') return null;
  return (
    <Suspense fallback={null}>
      <LazyDoodles id={id} scale={scale} />
    </Suspense>
  );
}

interface ChatThemeValue {
  spec: ThemeSpec;
}

const ChatThemeContext = createContext<ChatThemeValue | null>(null);
export const ChatThemeProvider = ChatThemeContext.Provider;

/**
 * Props that carry the chat's theme onto something drawn outside the chat (a portal, such as the
 * message menu), so it keeps the chat's accent and bubbles.
 */
export function useChatThemeScope(): { 'data-chat-theme'?: string; style?: CSSProperties } {
  const value = useContext(ChatThemeContext);
  const spec = value?.spec;
  return useMemo(
    () =>
      !spec || spec.classic
        ? {}
        : { 'data-chat-theme': spec.id, style: themeVars(spec) as CSSProperties },
    [spec],
  );
}

export const useChatTheme = () => useContext(ChatThemeContext)?.spec ?? null;

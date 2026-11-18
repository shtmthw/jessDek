import * as RadixDialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Download, Share, X } from 'lucide-react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Avatar } from '@/components/Avatar';
import { ensure, PRIORITY, useDownload } from '@/features/media/downloads';
import { replaceExt } from '@/features/media/format';
import * as store from '@/features/media/store';
import { cn } from '@/lib/cn';
import { isTouchDevice, useMediaQuery } from '@/lib/media';
import type { MediaItem } from '@/lib/messages';
import { spring } from '@/lib/motion';
import { formatClock, formatDayLabel } from '@/lib/time';
import { Linkify } from '../Linkify';
import { imageSha, toRef } from './items';
import { blurDataUrl, useMediaUrl } from './MediaTile';
import { ProgressRing } from './ProgressRing';

/** One photo or video in the order of the chat, with who sent it. */
export interface ViewerEntry {
  item: MediaItem;
  messageId: string;
  senderName: string;
  senderColor?: string;
  createdAt: string;
  caption: string;
}

// ---- tuning (MEDIA_PLAN.md §8.5) ---------------------------------------------------------------
const GAP = 16; // between slides
const PAGE_DISTANCE = 0.2; // of the width
const PAGE_VELOCITY = 500;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 600;
const EDGE_ELASTIC = 0.12;
const DOUBLE_TAP_MS = 250;
const LOCK_PX = 8;
const ZOOM_TOGGLE = 2.5;
const ZOOM_MAX = 4;
const CHROME_IDLE_MS = 3000;
const TILE_RADIUS = 18;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const firstName = (name: string) => name.split(' ')[0] ?? name;

/** The largest box with the item's shape that fits the screen. */
function fitRect(item: MediaItem, w: number, h: number): Rect {
  const ratio = item.width / Math.max(1, item.height) || 4 / 3;
  const width = Math.min(w, h * ratio);
  const height = width / ratio;
  return { left: (w - width) / 2, top: (h - height) / 2, width, height };
}

/** Where the item's tile is on screen right now, if it's there to fly back to. */
function tileRect(key: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-media-tile="${CSS.escape(key)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const visible = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  return visible ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** Whether the file itself is on this device, and its URL. */
function useItemFile(item: MediaItem, conversationId: string) {
  const download = useDownload(item.sha256);
  store.useStoreVersion();
  const ready =
    Boolean(item.local && !item.local.preparing) ||
    Boolean(item.sha256 && store.has(item.sha256, conversationId)) ||
    download?.status === 'ready';
  const src = useMediaUrl(
    item.sha256,
    item.kind === 'IMAGE' ? item.local?.previewUrl : undefined,
    ready,
  );
  return { ready: ready && Boolean(src), src, download };
}

// ---- one slide ---------------------------------------------------------------------------------

function Slide({
  entry,
  conversationId,
  rect,
  active,
  boxStyle,
  zoomStyle,
}: {
  entry: ViewerEntry;
  conversationId: string;
  rect: Rect;
  active: boolean;
  /** The active slide's box is animated (open / close / dismiss). */
  boxStyle?: Record<string, MotionValue<number> | number>;
  zoomStyle?: Record<string, MotionValue<number>>;
}) {
  const { item } = entry;
  const isVideo = item.kind === 'VIDEO';
  const { ready, src, download } = useItemFile(item, conversationId);
  const poster = useMediaUrl(imageSha(item), item.local?.previewUrl, isVideo);
  const blur = blurDataUrl(item.thumbhash);
  const first = firstName(entry.senderName);

  // Chrome plays H.264 MOV files when they're labelled MP4.
  const [videoUrl, setVideoUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!isVideo || !ready || !src || !item.sha256) return setVideoUrl(undefined);
    if (item.mimeType !== 'video/quicktime') return setVideoUrl(src);
    let url: string | undefined;
    let live = true;
    void store.get(item.sha256).then((blob) => {
      if (!blob || !live) return;
      url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
      setVideoUrl(url);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [isVideo, ready, src, item.sha256, item.mimeType]);

  const waiting = download?.status === 'unavailable';
  const failed = download?.status === 'failed';
  const ref = toRef(item);
  const alt = entry.caption || `Photo from ${entry.senderName}, ${formatClock(entry.createdAt)}`;

  return (
    <motion.div
      className="absolute overflow-hidden"
      data-viewer-box={active ? '' : undefined}
      style={boxStyle ?? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <motion.div className="relative size-full" style={zoomStyle}>
        {blur || (isVideo && poster) ? (
          <img
            src={isVideo && poster ? poster : blur}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        {isVideo ? (
          videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              poster={poster}
              controls
              autoPlay={active}
              playsInline
              className="absolute inset-0 size-full bg-black object-contain"
            />
          ) : null
        ) : ready && src ? (
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
      </motion.div>

      {!ready ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 px-6 text-center text-sm text-white">
          {waiting || failed ? (
            <>
              <p className="max-w-xs text-balance">
                {waiting
                  ? `${first} isn’t online right now. It will load when they’re back.`
                  : 'Couldn’t load this.'}
              </p>
              <button
                type="button"
                className="rounded-full bg-white/15 px-4 py-2 font-medium hover:bg-white/25"
                onClick={() => ref && ensure(ref, 'FILE', conversationId, PRIORITY.viewer)}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <ProgressRing
                size={64}
                value={download?.status === 'downloading' ? download.progress : undefined}
                label={isVideo ? 'Getting video' : 'Getting photo'}
              />
              <p>{isVideo ? `Getting video from ${first}…` : `Getting photo from ${first}…`}</p>
            </>
          )}
        </div>
      ) : null}
    </motion.div>
  );
}

// ---- the viewer --------------------------------------------------------------------------------

/**
 * The full-screen photo and video viewer (MEDIA_PLAN.md §8.5).
 *  - Opens out of the tile and closes back into it (a FLIP of the picture's box).
 *  - Swipe sideways to page, drag down to dismiss, double-tap or pinch to zoom, drag to pan.
 *  - ←/→ and Esc on keyboards; the chrome fades out on a tap, or after 3 s still on desktop.
 */
export default function MediaViewer({
  entries,
  index,
  conversationId,
  onIndexChange,
  onClose,
}: {
  entries: ViewerEntry[];
  index: number;
  conversationId: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { w: W, h: H } = useViewport();
  const reduced = useReducedMotion() ?? false;
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const entry = entries[index]!;
  const item = entry.item;
  const target = fitRect(item, W, H);
  const hasPrev = index > 0;
  const hasNext = index < entries.length - 1;

  // ---- motion values ----
  const trackX = useMotionValue(0);
  const dismissY = useMotionValue(0);
  const dismissScale = useTransform(dismissY, (v) => 1 - Math.min(Math.abs(v) / H, 1) * 0.15);
  const openness = useMotionValue(0); // 0 closed → 1 open; drives the backdrop
  const backdrop = useTransform(
    [openness, dismissY],
    ([o, y]) => (o as number) * (1 - Math.min(Math.abs(y as number) / (H * 0.6), 1)),
  );
  const boxLeft = useMotionValue(target.left);
  const boxTop = useMotionValue(target.top);
  const boxWidth = useMotionValue(target.width);
  const boxHeight = useMotionValue(target.height);
  const boxRadius = useMotionValue(0);
  const boxOpacity = useMotionValue(1);
  const boxScale = useMotionValue(1);
  const zoom = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  const content = useRef<HTMLDivElement>(null);
  // Whatever had focus when the viewer opened (the tile), for when it closes.
  const opener = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [chrome, setChrome] = useState(true);
  const [captionOpen, setCaptionOpen] = useState(false);
  const closing = useRef(false);

  const setBox = useCallback(
    (r: Rect) => {
      boxLeft.set(r.left);
      boxTop.set(r.top);
      boxWidth.set(r.width);
      boxHeight.set(r.height);
    },
    [boxLeft, boxTop, boxWidth, boxHeight],
  );
  const animateBox = (r: Rect, radius: number, transition: object, velocityY = 0) =>
    Promise.all([
      animate(boxLeft, r.left, transition),
      animate(boxTop, r.top, { ...transition, velocity: velocityY }),
      animate(boxWidth, r.width, transition),
      animate(boxHeight, r.height, transition),
      animate(boxRadius, radius, transition),
    ]);

  // ---- open: grow out of the tile ----
  useLayoutEffect(() => {
    const from = reduced ? null : tileRect(item.key);
    if (from) {
      setBox(from);
      boxRadius.set(TILE_RADIUS);
      void animateBox(target, 0, spring.panel);
    } else {
      setBox(target);
      boxOpacity.set(0);
      boxScale.set(reduced ? 1 : 0.96);
      void animate(boxOpacity, 1, { duration: 0.2 });
      void animate(boxScale, 1, spring.panel);
    }
    void animate(openness, 1, { duration: reduced ? 0.15 : 0.25 });
    // Only on mount: paging re-targets the box below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new page (or a resize) puts the active box back to its resting place, unzoomed.
  useLayoutEffect(() => {
    if (closing.current) return;
    trackX.set(0);
    dismissY.set(0);
    zoom.set(1);
    panX.set(0);
    panY.set(0);
    setCaptionOpen(false);
    if (boxRadius.get() === 0) setBox(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, W, H]);

  // ---- downloads: this one first, then the neighbours' photos ----
  useEffect(() => {
    const ref = toRef(item);
    if (ref && !item.local) ensure(ref, 'FILE', conversationId, PRIORITY.viewer);
    for (const n of [entries[index - 1], entries[index + 1]]) {
      const nref = n ? toRef(n.item) : null;
      if (!nref || n!.item.local) continue;
      if (n!.item.kind === 'IMAGE') ensure(nref, 'FILE', conversationId, PRIORITY.prefetch);
      else if (n!.item.posterSha256) ensure(nref, 'POSTER', conversationId, PRIORITY.prefetch);
    }
  }, [item, index, entries, conversationId]);

  // ---- close: fly back into the tile (carrying a drag's speed), or fade ----
  const close = useCallback(
    async (fromDrag?: { velocityY: number }) => {
      if (closing.current) return;
      closing.current = true;
      setChrome(false);
      void animate(zoom, 1, spring.soft);
      void animate(panX, 0, spring.soft);
      void animate(panY, 0, spring.soft);
      const to = reduced ? null : tileRect(item.key);
      if (fromDrag) {
        // Re-express the dragged (moved and shrunk) picture as a plain box, then fly from there.
        const s = dismissScale.get();
        const dy = dismissY.get();
        const r = { width: target.width * s, height: target.height * s };
        setBox({
          left: target.left + (target.width - r.width) / 2,
          top: target.top + dy + (target.height - r.height) / 2,
          ...r,
        });
        dismissY.set(0);
      }
      const fade = animate(openness, 0, { duration: reduced ? 0.12 : 0.22 });
      if (to) {
        await animateBox(to, TILE_RADIUS, spring.panel, fromDrag?.velocityY ?? 0);
      } else {
        await Promise.all([
          animate(boxOpacity, 0, { duration: 0.18 }),
          animate(boxScale, 0.96, { duration: 0.18 }),
        ]);
      }
      await fade;
      onClose();
      // Back to the tile of what was on screen (it may differ from the one that opened it).
      const key = item.key;
      requestAnimationFrame(() => {
        const tile = document.querySelector<HTMLElement>(
          `[data-media-tile="${CSS.escape(key)}"] button[data-phase]`,
        );
        (tile ?? opener.current)?.focus({ preventScroll: true });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.key, reduced, target.left, target.top, target.width, target.height, onClose],
  );

  // ---- paging ----
  // One page turn at a time; a press during a turn is remembered and played right after it.
  const paging = useRef(false);
  const queued = useRef<1 | -1 | null>(null);
  const go = useCallback(
    (dir: 1 | -1, velocity = 0) => {
      if (closing.current) return;
      if (paging.current) {
        queued.current = dir;
        return;
      }
      if ((dir === 1 && !hasNext) || (dir === -1 && !hasPrev)) {
        void animate(trackX, 0, spring.panel);
        return;
      }
      paging.current = true;
      void animate(trackX, -dir * (W + GAP), {
        ...(reduced ? { duration: 0.15 } : spring.panel),
        velocity,
      }).then(() => onIndexChange(index + dir));
    },
    [hasNext, hasPrev, W, index, onIndexChange, reduced, trackX],
  );
  // The turn has landed (the new index rendered): take the queued press, if any.
  useEffect(() => {
    if (!paging.current) return;
    paging.current = false;
    const next = queued.current;
    queued.current = null;
    if (next) go(next);
  }, [index, go]);

  // ←/→ wherever focus is inside the viewer (Esc is Radix's).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // ---- zoom ----
  const bounds = (s: number) => ({
    x: Math.max(0, (target.width * s - W) / 2),
    y: Math.max(0, (target.height * s - H) / 2),
  });
  const zoomTo = (s: number, px: number, py: number, transition: object | null = spring.soft) => {
    const from = zoom.get();
    const next = clamp(s, 1, ZOOM_MAX);
    // Keep the point under the finger (relative to the centre of the screen) where it is.
    const rx = px - W / 2;
    const ry = py - H / 2;
    const b = bounds(next);
    const nx = clamp(rx - (rx - panX.get()) * (next / from), -b.x, b.x);
    const ny = clamp(ry - (ry - panY.get()) * (next / from), -b.y, b.y);
    if (!transition) {
      zoom.set(next);
      panX.set(nx);
      panY.set(ny);
      return;
    }
    void animate(zoom, next, transition);
    void animate(panX, next === 1 ? 0 : nx, transition);
    void animate(panY, next === 1 ? 0 : ny, transition);
  };
  const settlePan = () => {
    const b = bounds(zoom.get());
    void animate(panX, clamp(panX.get(), -b.x, b.x), spring.soft);
    void animate(panY, clamp(panY.get(), -b.y, b.y), spring.soft);
  };

  // ---- chrome: tap to toggle, and on desktop it rests after a few still seconds ----
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wake = useCallback(() => {
    if (closing.current) return;
    setChrome(true);
    clearTimeout(idle.current);
    if (finePointer) idle.current = setTimeout(() => setChrome(false), CHROME_IDLE_MS);
  }, [finePointer]);
  useEffect(() => {
    wake();
    return () => clearTimeout(idle.current);
  }, [wake]);

  // ---- pointer gestures ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: 'none' | 'pending' | 'page' | 'dismiss' | 'pan' | 'pinch';
    x0: number;
    y0: number;
    pan0: { x: number; y: number };
    zoom0: number;
    dist0: number;
    samples: { t: number; x: number; y: number }[];
  }>({ kind: 'none', x0: 0, y0: 0, pan0: { x: 0, y: 0 }, zoom0: 1, dist0: 1, samples: [] });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const singleTap = useRef<ReturnType<typeof setTimeout>>(undefined);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1,
      mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
    };
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (closing.current) return;
    // Buttons, links and the video's own controls keep their clicks.
    if ((e.target as HTMLElement).closest('button, a, video, [data-viewer-chrome]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2) {
      const { dist } = spread();
      Object.assign(g, {
        kind: 'pinch',
        zoom0: zoom.get(),
        dist0: dist,
        pan0: { x: panX.get(), y: panY.get() },
      });
      void animate(trackX, 0, spring.panel);
      void animate(dismissY, 0, spring.panel);
      return;
    }
    Object.assign(g, {
      kind: 'pending',
      x0: e.clientX,
      y0: e.clientY,
      pan0: { x: panX.get(), y: panY.get() },
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
    });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (finePointer) wake();
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      const { dist, mid } = spread();
      const s = clamp((g.zoom0 * dist) / g.dist0, 0.85, ZOOM_MAX * 1.15);
      const rx = mid.x - W / 2;
      const ry = mid.y - H / 2;
      zoom.set(s);
      panX.set(rx - (rx - g.pan0.x) * (s / g.zoom0));
      panY.set(ry - (ry - g.pan0.y) * (s / g.zoom0));
      return;
    }
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (g.samples.length > 6) g.samples.shift();
    if (g.kind === 'pending') {
      if (Math.hypot(dx, dy) < LOCK_PX) return;
      // Direction lock: whichever way it moves first, it stays that way.
      g.kind = zoom.get() > 1.01 ? 'pan' : Math.abs(dx) > Math.abs(dy) ? 'page' : 'dismiss';
      if (g.kind === 'dismiss') setChrome(false); // the picture alone, while it's being pulled away
    }
    if (g.kind === 'page') {
      const atEdge = (dx > 0 && !hasPrev) || (dx < 0 && !hasNext);
      trackX.set(atEdge ? dx * EDGE_ELASTIC : dx);
    } else if (g.kind === 'dismiss') {
      dismissY.set(dy);
    } else if (g.kind === 'pan') {
      const b = bounds(zoom.get());
      const rubber = (v: number, max: number) =>
        Math.abs(v) <= max ? v : Math.sign(v) * (max + (Math.abs(v) - max) * 0.3);
      panX.set(rubber(g.pan0.x + dx, b.x));
      panY.set(rubber(g.pan0.y + dy, b.y));
    }
  }

  function velocity(now: number): { vx: number; vy: number } {
    const s = gesture.current.samples;
    const a = s[0];
    const b = s[s.length - 1];
    // Held still before letting go: that's a stop, not a flick.
    if (!a || !b || b.t === a.t || now - b.t > 80) return { vx: 0, vy: 0 };
    const dt = (b.t - a.t) / 1000;
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'pinch') {
      if (pointers.current.size > 0) {
        // One finger left: carry on as a pan from where it is, without a jump.
        const [rest] = [...pointers.current.values()];
        Object.assign(g, {
          kind: 'pan',
          x0: rest!.x,
          y0: rest!.y,
          pan0: { x: panX.get(), y: panY.get() },
          samples: [],
        });
        return;
      }
      g.kind = 'none';
      if (zoom.get() <= 1.01) zoomTo(1, W / 2, H / 2);
      else if (zoom.get() > ZOOM_MAX) zoomTo(ZOOM_MAX, W / 2, H / 2);
      else settlePan();
      return;
    }
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const { vx, vy } = velocity(e.timeStamp);
    const kind = g.kind;
    g.kind = 'none';
    if (kind === 'page') {
      if ((dx < -W * PAGE_DISTANCE || vx < -PAGE_VELOCITY) && hasNext) go(1, vx);
      else if ((dx > W * PAGE_DISTANCE || vx > PAGE_VELOCITY) && hasPrev) go(-1, vx);
      else void animate(trackX, 0, { ...spring.panel, velocity: vx });
    } else if (kind === 'dismiss') {
      if (Math.abs(dy) > DISMISS_DISTANCE || Math.abs(vy) > DISMISS_VELOCITY)
        void close({ velocityY: vy });
      else {
        void animate(dismissY, 0, { ...spring.panel, velocity: vy });
        wake();
      }
    } else if (kind === 'pan') {
      settlePan();
    } else if (kind === 'pending' && e.type === 'pointerup') {
      tap(e.clientX, e.clientY, e.timeStamp);
    }
  }

  function tap(x: number, y: number, t: number) {
    const last = lastTap.current;
    if (last && t - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < 30) {
      clearTimeout(singleTap.current);
      lastTap.current = null;
      if (item.kind === 'VIDEO') return;
      zoomTo(zoom.get() > 1.01 ? 1 : ZOOM_TOGGLE, x, y);
      return;
    }
    lastTap.current = { t, x, y };
    clearTimeout(singleTap.current);
    singleTap.current = setTimeout(() => {
      lastTap.current = null;
      setChrome((c) => !c);
    }, DOUBLE_TAP_MS);
  }

  // Trackpad pinch arrives as ctrl + wheel (anywhere in the viewer, chrome included). It needs a
  // non-passive native listener (React's is passive, so the page itself would zoom instead), and
  // the dialog's element only exists a render after ours (it's portalled), hence the callback ref.
  const stage = useRef<HTMLDivElement>(null);
  const onWheel = useRef<(e: WheelEvent) => void>(() => undefined);
  onWheel.current = (e: WheelEvent) => {
    if (!e.ctrlKey || item.kind === 'VIDEO') return;
    e.preventDefault();
    zoomTo(zoom.get() * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY, null);
  };
  const detachWheel = useRef<(() => void) | null>(null);
  const contentRef = useCallback((el: HTMLDivElement | null) => {
    content.current = el;
    detachWheel.current?.();
    detachWheel.current = null;
    if (!el) return;
    const listener = (e: WheelEvent) => onWheel.current(e);
    el.addEventListener('wheel', listener, { passive: false });
    detachWheel.current = () => el.removeEventListener('wheel', listener);
  }, []);

  // ---- download / share ----
  const { ready, src } = useItemFile(item, conversationId);
  const safeName = replaceExt(item.name, item.mimeType);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    if (!isTouchDevice() || typeof navigator.canShare !== 'function') return setCanShare(false);
    try {
      setCanShare(
        navigator.canShare({ files: [new File([''], safeName, { type: item.mimeType })] }),
      );
    } catch {
      setCanShare(false);
    }
  }, [safeName, item.mimeType]);
  async function share() {
    const blob = item.sha256 ? await store.get(item.sha256) : undefined;
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], safeName, { type: item.mimeType })] });
    } catch {
      /* dismissed */
    }
  }

  const slides = [-1, 0, 1]
    .map((offset) => ({ offset, entry: entries[index + offset] }))
    .filter((s): s is { offset: number; entry: ViewerEntry } => Boolean(s.entry));
  const kind = item.kind === 'VIDEO' ? 'Video' : 'Photo';
  const chromeTransition = { duration: 0.18 };
  const iconButton =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10';

  return (
    <RadixDialog.Root open onOpenChange={(open) => !open && void close()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay asChild>
          <motion.div className="fixed inset-0 z-50 bg-black" style={{ opacity: backdrop }} />
        </RadixDialog.Overlay>
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 select-none overflow-hidden outline-none"
          // Radix only returns focus to a Dialog.Trigger; we put it back on the tile ourselves.
          onCloseAutoFocus={(e) => e.preventDefault()}
          ref={contentRef}
          // Opening shouldn't put a focus ring on the close button; keyboard users tab from here.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            content.current?.focus();
          }}
          tabIndex={-1}
        >
          <RadixDialog.Title className="sr-only">
            {kind} from {entry.senderName}
          </RadixDialog.Title>

          {/* The stage: every gesture lands here. */}
          <div
            ref={stage}
            data-viewer-stage
            className="absolute inset-0 touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <motion.div className="absolute inset-0" style={{ x: trackX }}>
              {slides.map(({ offset, entry: e }) =>
                offset === 0 ? (
                  <motion.div
                    key={e.item.key}
                    className="absolute inset-0"
                    style={{ y: dismissY, scale: dismissScale }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{ opacity: boxOpacity, scale: boxScale }}
                    >
                      <Slide
                        entry={e}
                        conversationId={conversationId}
                        rect={target}
                        active
                        boxStyle={{
                          left: boxLeft,
                          top: boxTop,
                          width: boxWidth,
                          height: boxHeight,
                          borderRadius: boxRadius,
                        }}
                        zoomStyle={{ scale: zoom, x: panX, y: panY }}
                      />
                    </motion.div>
                  </motion.div>
                ) : (
                  <div
                    key={e.item.key}
                    className="absolute inset-0"
                    style={{ transform: `translateX(${offset * (W + GAP)}px)` }}
                    aria-hidden
                  >
                    <Slide
                      entry={e}
                      conversationId={conversationId}
                      rect={fitRect(e.item, W, H)}
                      active={false}
                    />
                  </div>
                ),
              )}
            </motion.div>
          </div>

          {/* Chrome */}
          <motion.div
            data-viewer-chrome
            className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] text-white"
            initial={false}
            animate={{ opacity: chrome ? 1 : 0 }}
            transition={chromeTransition}
          >
            <div
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3',
                chrome && 'pointer-events-auto',
              )}
            >
              <Avatar name={entry.senderName} color={entry.senderColor} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{entry.senderName}</p>
                <p className="truncate text-xs text-white/70">
                  {formatDayLabel(entry.createdAt)}, {formatClock(entry.createdAt)}
                </p>
              </div>
            </div>
            <span className="tabular shrink-0 text-xs text-white/70" aria-live="polite">
              {index + 1} of {entries.length}
            </span>
            <div className={cn('flex shrink-0 items-center', chrome && 'pointer-events-auto')}>
              {ready && src ? (
                canShare ? (
                  <button
                    type="button"
                    aria-label="Share"
                    title="Share"
                    className={iconButton}
                    onClick={() => void share()}
                  >
                    <Share className="size-5" />
                  </button>
                ) : (
                  <a
                    href={src}
                    download={safeName}
                    aria-label="Download"
                    title="Download"
                    className={iconButton}
                  >
                    <Download className="size-5" />
                  </a>
                )
              ) : null}
              <RadixDialog.Close asChild>
                <button type="button" aria-label="Close" title="Close (Esc)" className={iconButton}>
                  <X className="size-5" />
                </button>
              </RadixDialog.Close>
            </div>
          </motion.div>

          {entry.caption ? (
            <motion.div
              data-viewer-chrome
              className={cn(
                'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 text-[15px] leading-snug text-white',
                chrome ? 'pointer-events-auto' : 'pointer-events-none',
              )}
              initial={false}
              animate={{ opacity: chrome ? 1 : 0 }}
              transition={chromeTransition}
              onClick={() => setCaptionOpen((o) => !o)}
            >
              <p
                className={cn(
                  'mx-auto max-w-2xl whitespace-pre-wrap break-words',
                  !captionOpen && 'line-clamp-3',
                )}
              >
                <Linkify text={entry.caption} />
              </p>
            </motion.div>
          ) : null}

          {finePointer ? (
            <>
              {hasPrev ? (
                <motion.button
                  type="button"
                  aria-label="Previous"
                  onClick={() => go(-1)}
                  className={cn(
                    'absolute left-3 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20',
                    !chrome && 'pointer-events-none',
                  )}
                  initial={false}
                  animate={{ opacity: chrome ? 1 : 0 }}
                  transition={chromeTransition}
                >
                  <ChevronLeft className="size-6" />
                </motion.button>
              ) : null}
              {hasNext ? (
                <motion.button
                  type="button"
                  aria-label="Next"
                  onClick={() => go(1)}
                  className={cn(
                    'absolute right-3 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20',
                    !chrome && 'pointer-events-none',
                  )}
                  initial={false}
                  animate={{ opacity: chrome ? 1 : 0 }}
                  transition={chromeTransition}
                >
                  <ChevronRight className="size-6" />
                </motion.button>
              ) : null}
            </>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

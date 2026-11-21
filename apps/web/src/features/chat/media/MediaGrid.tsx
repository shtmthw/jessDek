import { AnimatePresence } from 'motion/react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cancel, ensure, PRIORITY, useDownloads } from '@/features/media/downloads';
import { AUTO_VIDEO_MAX_BYTES } from '@/features/media/limits';
import { usePref } from '@/features/media/prefs';
import { has, useStoreVersion } from '@/features/media/store';
import { cn } from '@/lib/cn';
import type { MediaItem } from '@/lib/messages';
import { imageSha, toRef } from './items';
import { layoutFor } from './layout';
import { MediaPill, MediaTile } from './MediaTile';
import { ScrollRootContext } from './ScrollRoot';
import { deriveView, pillText, type TileView } from './tileState';

export interface MediaWho {
  /** The chat is a one-to-one conversation. */
  dm: boolean;
  /** The bubble is yours. */
  mine: boolean;
  /** The sender's first name, for "Waiting for Alice to come online". */
  firstName: string;
}

const saveData = () =>
  (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * The picture area of a media bubble: one photo or video, or an album grid. Every box is sized
 * from metadata, so nothing moves when files arrive. Also starts downloads as tiles come near the
 * viewport, following the "Auto-download" setting.
 */
export function MediaGrid({
  items,
  conversationId,
  who,
  senderName,
  onOpen,
  className,
}: {
  items: MediaItem[];
  conversationId: string;
  who: MediaWho;
  senderName: string;
  onOpen: (index: number) => void;
  className?: string;
}) {
  const layout = useMemo(() => layoutFor(items), [items]);
  const shown = layout.kind === 'single' ? 1 : layout.shown;
  const visibleItems = useMemo(() => items.slice(0, shown), [items, shown]);
  const [autoDownload] = usePref('media:autodownload');

  // ---- what each tile should show --------------------------------------------------------
  const keys = visibleItems.flatMap((i) => [
    i.local ? undefined : imageSha(i),
    i.kind === 'VIDEO' && !i.local ? i.sha256 : undefined,
  ]);
  const downloads = useDownloads(keys);
  const storeVersion = useStoreVersion();
  const views: TileView[] = useMemo(
    () =>
      visibleItems.map((item, i) =>
        deriveView(item, { image: downloads[i * 2], file: downloads[i * 2 + 1] }, (sha) =>
          has(sha, conversationId),
        ),
      ),
    // `has` reads the store, which announces changes through its version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleItems, downloads, conversationId, storeVersion],
  );

  // ---- load what is near the screen -------------------------------------------------------
  const root = useContext(ScrollRootContext);
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setNear(true);
    const observer = new IntersectionObserver(
      ([entry]) => setNear(Boolean(entry?.isIntersecting)),
      {
        root: root?.current ?? null,
        rootMargin: '600px 0px',
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near) return;
    visibleItems.forEach((item, i) => {
      const ref = toRef(item);
      if (!ref || item.local) return;
      const view = views[i]!;
      if (item.kind === 'VIDEO') {
        // Posters always come; the video itself only when the setting and the size allow.
        if (item.posterSha256 && !view.imageReady) ensure(ref, 'POSTER', conversationId);
        const auto =
          autoDownload === 'all' &&
          item.size <= AUTO_VIDEO_MAX_BYTES &&
          !saveData() &&
          view.phase !== 'ready';
        if (auto) ensure(ref, 'FILE', conversationId);
      } else if (!view.imageReady && autoDownload !== 'off') {
        ensure(ref, 'FILE', conversationId);
      }
    });
    // Views change as downloads progress; only the inputs that should trigger a request matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, visibleItems, autoDownload, conversationId]);

  // ---- taps -------------------------------------------------------------------------------
  function request(item: MediaItem) {
    const ref = toRef(item);
    if (!ref) return;
    ensure(ref, 'FILE', conversationId, PRIORITY.viewer);
    if (item.kind === 'VIDEO' && item.posterSha256)
      ensure(ref, 'POSTER', conversationId, PRIORITY.viewer);
  }

  function activate(index: number) {
    const item = items[index]!;
    const { phase } = views[index]!;
    if (phase === 'preparing') return;
    if (item.kind === 'VIDEO') {
      // The viewer fetches the video itself; here we only nudge a stuck poster.
      if (phase === 'unavailable' || phase === 'failed') request(item);
      return onOpen(index);
    }
    if (phase === 'ready') return onOpen(index);
    if (phase === 'idle' || phase === 'unavailable' || phase === 'failed') request(item);
  }

  const stuck = views.findIndex((v) => v.phase === 'unavailable' || v.phase === 'failed');
  const stuckPhase = stuck >= 0 ? (views[stuck]!.phase as 'unavailable' | 'failed') : null;
  const waitingText = stuckPhase ? pillText(stuckPhase, who) : undefined;

  const tiles = visibleItems.map((item, i) => (
    <MediaTile
      key={item.key}
      item={item}
      view={views[i]!}
      waiting={pillText('unavailable', who)}
      name={senderName}
      alt={item.kind === 'VIDEO' ? `Video poster from ${senderName}` : `Photo from ${senderName}`}
      extra={
        layout.kind === 'album' && i === shown - 1 && layout.extra > 0 ? layout.extra : undefined
      }
      className={layout.kind === 'album' ? layout.tiles[i] : undefined}
      onActivate={() => activate(i)}
      onCancel={() => {
        if (item.sha256) cancel(item.sha256);
      }}
    />
  ));

  return (
    <div ref={box} className={cn('relative', className)} style={layout.style}>
      {layout.kind === 'single' ? (
        tiles
      ) : (
        <div className={cn('grid size-full gap-0.5', layout.grid)}>{tiles}</div>
      )}
      <AnimatePresence>
        {stuckPhase ? (
          <MediaPill
            key="pill"
            phase={stuckPhase}
            text={waitingText!}
            onRetry={() => {
              views.forEach((v, i) => {
                if (v.phase === 'unavailable' || v.phase === 'failed') request(items[i]!);
              });
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

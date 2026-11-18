import { Play, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { formatDuration } from '@/features/media/format';
import { removeItem, setHd, type TrayItem } from '@/features/media/trayStore';
import { cn } from '@/lib/cn';
import { exit, spring } from '@/lib/motion';
import { blurDataUrl } from './MediaTile';
import { ProgressRing } from './ProgressRing';

/** Photos and videos waiting to be sent, above the message box. */
export function AttachmentTray({
  trayKey,
  items,
  hd,
}: {
  trayKey: string;
  items: TrayItem[];
  hd: boolean;
}) {
  const photos = items.filter((i) => i.kind === 'IMAGE').length;
  const kindIndex = (item: TrayItem) => items.filter((i) => i.kind === item.kind).indexOf(item) + 1;
  return (
    <div
      role="list"
      aria-label="Attachments"
      className="flex snap-x scroll-px-2 gap-2 overflow-x-auto px-2 pb-1 pt-2"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((item) => (
          <TrayTile key={item.localId} item={item} n={kindIndex(item)} trayKey={trayKey} />
        ))}
      </AnimatePresence>
      {photos > 0 ? (
        <button
          type="button"
          aria-pressed={hd}
          title="Send photos in high quality (larger files)"
          onClick={() => setHd(trayKey, !hd)}
          className={cn(
            'h-7 shrink-0 self-center rounded-full px-2.5 text-xs font-semibold transition-colors',
            hd
              ? 'bg-brand text-brand-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          HD
        </button>
      ) : null}
    </div>
  );
}

function TrayTile({ item, n, trayKey }: { item: TrayItem; n: number; trayKey: string }) {
  const isVideo = item.kind === 'VIDEO';
  const failed = item.status === 'failed';
  const blur = blurDataUrl(item.prepared?.thumbhash);
  return (
    <motion.div
      role="listitem"
      layout
      className="relative size-16 shrink-0 snap-start"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={
        failed ? { opacity: 1, scale: 1, x: [0, -4, 4, -2, 0] } : { opacity: 1, scale: 1, x: 0 }
      }
      exit={{ opacity: 0, scale: 0.8, transition: exit.fast }}
      transition={failed ? { duration: 0.3 } : { ...spring.pop, layout: spring.soft }}
    >
      {/* The picture is clipped to its rounded box; the remove button sits outside that clip so its
          44px tap area isn't cut off at the tile's edge. */}
      <div className="relative size-full overflow-hidden rounded-xl bg-muted ring-1 ring-border">
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
            draggable={false}
            className={cn(
              'size-full object-cover transition-opacity duration-200',
              failed && 'opacity-40',
            )}
          />
        ) : blur ? (
          <img src={blur} alt="" aria-hidden className="size-full object-cover" />
        ) : (
          <div className="skeleton size-full" />
        )}

        {isVideo && item.status === 'ready' && item.prepared?.kind === 'VIDEO' ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <Play className="size-4 fill-white text-white drop-shadow" />
            </span>
            <span className="tabular pointer-events-none absolute bottom-1 left-1 rounded-md bg-black/55 px-1 py-0.5 text-[10px] font-medium text-white">
              {formatDuration(item.prepared.durationMs)}
            </span>
          </>
        ) : null}

        {item.status === 'preparing' ? (
          <>
            {!item.previewUrl ? null : (
              <span aria-hidden className="absolute inset-0 bg-black/20" />
            )}
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/45 p-1">
                <ProgressRing size={20} label="Preparing" />
              </span>
            </span>
          </>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`Remove ${isVideo ? 'video' : 'photo'} ${n}`}
        onClick={() => removeItem(trayKey, item.localId)}
        className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm after:absolute after:-inset-2.5 after:content-['']"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );
}

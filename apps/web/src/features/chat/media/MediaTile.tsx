import { Download as DownloadIcon, Hourglass, Play, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useContext, useEffect, useRef, useState } from 'react';
import { thumbHashToDataURL } from 'thumbhash';
import { formatBytes, formatDuration } from '@/features/media/format';
import { peekUrl, urlFor } from '@/features/media/store';
import { cn } from '@/lib/cn';
import type { MediaItem } from '@/lib/messages';
import { easeOut, exit, spring } from '@/lib/motion';
import { ProgressRing } from './ProgressRing';
import type { TileView } from './tileState';
import { OpenMediaContext } from './ViewerContext';

const blurCache = new Map<string, string>();

/** The tiny blurred stand-in for a photo, from its ThumbHash. */
export function blurDataUrl(hash: string | null | undefined): string | undefined {
  if (!hash) return undefined;
  let url = blurCache.get(hash);
  if (url === undefined) {
    try {
      const bin = atob(hash);
      url = thumbHashToDataURL(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch {
      url = '';
    }
    blurCache.set(hash, url);
  }
  return url || undefined;
}

/**
 * The object URL for a file on this device. Starts from what is already known (so nothing flickers
 * when your own send is confirmed) and looks the rest up.
 */
export function useMediaUrl(
  sha: string | undefined,
  local: string | null | undefined,
  want: boolean,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(
    () => local ?? (sha ? peekUrl(sha) : undefined),
  );
  useEffect(() => {
    if (local) return setUrl(local);
    if (!sha || !want) return;
    const known = peekUrl(sha);
    if (known) return setUrl(known);
    let live = true;
    urlFor(sha).then(
      (u) => live && setUrl(u),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [sha, local, want]);
  return local ?? url;
}

/** A photo that "develops" out of its blur once it has decoded. Already-ready photos just appear. */
function Developed({ src, alt }: { src: string; alt: string }) {
  const instant = useRef(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.src = src;
    img
      .decode()
      .catch(() => undefined)
      .then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [src]);
  // Whatever wasn't decoded at the very first paint gets the reveal; scrolling history never does.
  useEffect(() => {
    instant.current = false;
  }, []);
  return (
    <motion.img
      src={src}
      alt={alt}
      draggable={false}
      className="absolute inset-0 size-full select-none object-cover"
      initial={false}
      animate={
        ready || instant.current
          ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
          : { opacity: 0, scale: 1.015, filter: 'blur(6px)' }
      }
      transition={{ duration: 0.35, ease: easeOut }}
    />
  );
}

const chip =
  'tabular rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-white';

export function MediaTile({
  item,
  view,
  waiting,
  alt,
  name,
  extra,
  className,
  onActivate,
  onCancel,
}: {
  item: MediaItem;
  view: TileView;
  /** Why it is waiting ("Waiting for Alice to come online"), for the accessible name. */
  waiting?: string;
  alt: string;
  /** For the accessible name: the sender's first name. */
  name: string;
  /** "+3" on the last tile of a long album. */
  extra?: number;
  className?: string;
  onActivate: () => void;
  onCancel?: () => void;
}) {
  const isVideo = item.kind === 'VIDEO';
  const imageSha = isVideo ? (item.posterSha256 ?? undefined) : item.sha256;
  const src = useMediaUrl(imageSha, item.local?.previewUrl, view.imageReady);
  const blur = blurDataUrl(item.thumbhash);
  const { phase } = view;
  const busy = phase === 'busy';
  // While the viewer shows this item, the picture lives there: leave a quiet gap here.
  const carried = useContext(OpenMediaContext) === item.key;
  // Size while a file still has to come over; "4.1 of 18 MB" while a video is arriving.
  const sizeChip =
    phase === 'idle'
      ? formatBytes(item.size)
      : busy && isVideo
        ? view.progress !== undefined
          ? `${formatBytes(item.size * view.progress)} of ${formatBytes(item.size)}`
          : formatBytes(item.size)
        : null;
  const showChips = phase !== 'preparing' && (isVideo || sizeChip !== null);

  const what = isVideo ? 'video' : 'photo';
  const label =
    phase === 'preparing'
      ? `${what}, preparing`
      : phase === 'busy'
        ? `${what}, downloading`
        : phase === 'unavailable'
          ? `${what}, ${(waiting ?? 'waiting for someone who has it').toLowerCase()}`
          : phase === 'failed'
            ? `${what}, couldn’t load. Retry`
            : isVideo
              ? `Play video, ${formatDuration(item.durationMs ?? 0)}${phase === 'idle' ? `, ${formatBytes(item.size)}` : ''}`
              : phase === 'idle'
                ? `Download photo, ${formatBytes(item.size)}`
                : `Open photo by ${name}`;

  // The centre control: what tapping will do.
  const center = isVideo
    ? phase === 'ready' || phase === 'idle'
      ? 'play'
      : phase === 'busy'
        ? 'ring'
        : null
    : phase === 'idle'
      ? 'download'
      : phase === 'busy'
        ? 'ring'
        : null;

  return (
    <div
      data-media-tile={item.key}
      className={cn(
        'relative size-full overflow-hidden bg-muted transition-opacity duration-0',
        carried && 'opacity-0',
        className,
      )}
    >
      {blur ? (
        <img
          src={blur}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {src && view.imageReady ? <Developed key={src} src={src} alt={alt} /> : null}

      <button
        type="button"
        aria-label={label}
        aria-busy={busy || phase === 'preparing' || undefined}
        data-phase={phase}
        data-transport={view.transport}
        onClick={onActivate}
        className="absolute inset-0 outline-offset-[-2px]"
      />

      {/* Keeps white chips readable on bright photos. */}
      {showChips ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/35 to-transparent"
          />
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex gap-1">
            {isVideo ? <span className={chip}>{formatDuration(item.durationMs ?? 0)}</span> : null}
            {sizeChip ? <span className={chip}>{sizeChip}</span> : null}
          </span>
        </>
      ) : null}

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          {center ? (
            <motion.span
              key={center}
              className="pointer-events-none relative inline-flex size-12 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, transition: exit.fast }}
              transition={spring.pop}
            >
              {center === 'play' ? <Play className="size-5 translate-x-px fill-current" /> : null}
              {center === 'download' ? <DownloadIcon className="size-5" /> : null}
              {center === 'ring' ? (
                <>
                  <span className="absolute inset-0 flex items-center justify-center">
                    <ProgressRing value={view.progress} label={`Downloading ${what}`} />
                  </span>
                  {view.cancellable && onCancel ? (
                    <button
                      type="button"
                      aria-label={`Cancel ${what} download`}
                      onClick={onCancel}
                      className="pointer-events-auto relative inline-flex size-10 items-center justify-center rounded-full after:absolute after:-inset-1 after:content-['']"
                    >
                      <X className="size-4" strokeWidth={2.5} />
                    </button>
                  ) : null}
                </>
              ) : null}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Your own file being re-encoded: a small ring in the corner. */}
      <AnimatePresence>
        {phase === 'preparing' ? (
          <motion.span
            key="prep"
            className="pointer-events-none absolute bottom-2 right-2 inline-flex rounded-full bg-black/45 p-1 backdrop-blur-md"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7, transition: exit.fast }}
            transition={spring.snappy}
          >
            <ProgressRing size={20} label="Preparing" />
          </motion.span>
        ) : null}
      </AnimatePresence>

      {extra ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-2xl font-semibold text-white"
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

/** The bubble-wide notice over media that can't load right now. One per bubble. */
export function MediaPill({
  phase,
  text,
  onRetry,
}: {
  phase: 'unavailable' | 'failed';
  text: string;
  onRetry: () => void;
}) {
  const Icon = phase === 'failed' ? RotateCcw : Hourglass;
  return (
    <motion.button
      type="button"
      onClick={onRetry}
      className="absolute inset-x-2 bottom-2 mx-auto flex w-fit max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-[1.1rem] bg-black/55 px-3 py-1.5 text-left text-xs font-medium leading-4 text-white backdrop-blur-md"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exit.fast }}
      transition={spring.snappy}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="line-clamp-2">{text}</span>
    </motion.button>
  );
}

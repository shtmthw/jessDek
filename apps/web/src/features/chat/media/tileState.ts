import type { Download } from '@/features/media/downloads';
import type { MediaItem } from '@/lib/messages';

/** What a tile should show, worked out from the item and its downloads (MEDIA_PLAN.md §8.3). */
export type Phase = 'preparing' | 'idle' | 'busy' | 'ready' | 'unavailable' | 'failed';

export interface TileView {
  phase: Phase;
  /** The picture itself (not just the blur) can be drawn. */
  imageReady: boolean;
  /** 0–1 once bytes are arriving; undefined while locating or connecting. */
  progress?: number;
  /** A video download in progress can be cancelled with ×. */
  cancellable: boolean;
  transport?: Download['transport'];
}

const BUSY = new Set<Download['status']>(['queued', 'locating', 'connecting', 'downloading']);

function fromDownload(d: Download | undefined): Phase {
  if (!d || d.status === 'idle') return 'idle';
  if (d.status === 'ready') return 'ready';
  if (d.status === 'unavailable') return 'unavailable';
  if (d.status === 'failed') return 'failed';
  return 'busy';
}

export function deriveView(
  item: MediaItem,
  dl: { image?: Download; file?: Download },
  has: (sha: string) => boolean,
): TileView {
  const local = item.local;
  if (local?.preparing)
    return { phase: 'preparing', imageReady: Boolean(local.previewUrl), cancellable: false };

  if (item.kind === 'IMAGE') {
    const done = Boolean(local) || (item.sha256 ? has(item.sha256) : false);
    const phase = done ? 'ready' : fromDownload(dl.image);
    return {
      phase,
      imageReady: phase === 'ready',
      progress: dl.image?.status === 'downloading' ? dl.image.progress : undefined,
      cancellable: false,
      transport: dl.image?.transport,
    };
  }

  // Video: the poster frame is the picture; the file itself is what the play button needs.
  const posterReady =
    Boolean(local?.previewUrl) ||
    (item.posterSha256 ? has(item.posterSha256) : false) ||
    dl.image?.status === 'ready';
  const fileReady =
    Boolean(local) || (item.sha256 ? has(item.sha256) : false) || dl.file?.status === 'ready';
  let phase: Phase;
  if (fileReady) phase = 'ready';
  else if (dl.file && dl.file.status !== 'idle') phase = fromDownload(dl.file);
  else if (!posterReady) phase = fromDownload(dl.image);
  else phase = 'idle';
  const fileBusy = dl.file ? BUSY.has(dl.file.status) : false;
  return {
    phase,
    imageReady: posterReady,
    progress: dl.file?.status === 'downloading' ? dl.file.progress : undefined,
    cancellable: fileBusy,
    transport: dl.file?.transport ?? dl.image?.transport,
  };
}

/** The text of the pill shown over a bubble whose media can't load right now. */
export function pillText(
  phase: 'unavailable' | 'failed',
  who: { dm: boolean; mine: boolean; firstName: string },
): string {
  if (phase === 'failed') return 'Couldn’t load · Retry';
  return who.dm && !who.mine
    ? `Waiting for ${who.firstName} to come online`
    : 'Waiting for someone who has it';
}

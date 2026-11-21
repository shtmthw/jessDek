import type { Attachment } from '@/lib/gql';
import type { MediaItem } from '@/lib/messages';
import type { MediaRef } from '@/features/media/downloads';
import type { PreparedAttachment } from '@/features/media/prepare';
import type { TrayItem } from '@/features/media/trayStore';

/** A server attachment as the timeline draws it. */
export function fromAttachment(a: Attachment): MediaItem {
  return {
    key: a.id,
    kind: a.kind,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    mimeType: a.mimeType,
    name: a.name,
    size: a.size,
    thumbhash: a.thumbhash,
    attachmentId: a.id,
    sha256: a.sha256,
    posterSha256: a.posterSha256,
    posterSize: a.posterSize,
    posterMime: a.posterMime,
  };
}

/**
 * Your own pending send, drawn from the files on this device (4:3 until their real size is known).
 * `prepared` arrives a moment after the tray item was taken, so it is passed in separately.
 */
export function fromTray(item: TrayItem, prepared?: PreparedAttachment): MediaItem {
  const p = prepared ?? item.prepared;
  return {
    key: item.localId,
    kind: item.kind,
    width: p?.width ?? 4,
    height: p?.height ?? 3,
    durationMs: p?.kind === 'VIDEO' ? p.durationMs : null,
    mimeType: p?.mimeType ?? item.source.type,
    name: p?.name ?? item.source.name,
    size: p?.size ?? item.source.size,
    thumbhash: p?.thumbhash,
    sha256: p?.sha256,
    posterSha256: p?.kind === 'VIDEO' ? p.poster.sha256 : null,
    posterSize: p?.kind === 'VIDEO' ? p.poster.size : null,
    posterMime: p?.kind === 'VIDEO' ? p.poster.mime : null,
    local: { previewUrl: p?.previewUrl ?? item.previewUrl, preparing: !p },
  };
}

/** What the download manager needs, once the item has a server id. */
export function toRef(item: MediaItem): MediaRef | null {
  if (!item.attachmentId || !item.sha256) return null;
  return {
    id: item.attachmentId,
    sha256: item.sha256,
    size: item.size,
    mimeType: item.mimeType,
    posterSha256: item.posterSha256,
    posterSize: item.posterSize,
    posterMime: item.posterMime,
  };
}

/** The hash of the picture shown for an item: the photo itself, or a video's poster frame. */
export const imageSha = (item: MediaItem) =>
  item.kind === 'VIDEO' ? (item.posterSha256 ?? undefined) : item.sha256;

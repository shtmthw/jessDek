/** Chat-list wording for messages with photos and videos (MEDIA_PLAN.md §8.6). */
export interface MediaKinds {
  kind: 'IMAGE' | 'VIDEO';
}

export interface MediaSummary {
  /** "Photo", "3 photos", "Video", "2 videos" or "5 items". */
  text: string;
  /** Which icon to show: a photo, a video, or neither for a mix. */
  icon: 'image' | 'video';
}

export function mediaSummary(attachments: readonly MediaKinds[]): MediaSummary | null {
  const photos = attachments.filter((a) => a.kind === 'IMAGE').length;
  const videos = attachments.length - photos;
  if (attachments.length === 0) return null;
  if (videos === 0) return { text: photos === 1 ? 'Photo' : `${photos} photos`, icon: 'image' };
  if (photos === 0) return { text: videos === 1 ? 'Video' : `${videos} videos`, icon: 'video' };
  return { text: `${attachments.length} items`, icon: 'image' };
}

/** "Photo · look at this" with a caption, "Photo" without one. */
export function mediaPreviewText(attachments: readonly MediaKinds[], caption: string): string {
  const summary = mediaSummary(attachments);
  if (!summary) return caption;
  const text = caption.replace(/\s+/g, ' ').trim();
  return text ? `${summary.text} · ${text}` : summary.text;
}

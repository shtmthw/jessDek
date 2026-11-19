import type { Message, ReplyTo } from '@/lib/gql';
import { mediaSummary } from '@/lib/mediaText';

/** Just what a quote needs from a full message. */
export const toReplyTo = (m: Message): ReplyTo => ({
  __typename: 'Message',
  id: m.id,
  body: m.body,
  createdAt: m.createdAt,
  sender: {
    __typename: 'User',
    id: m.sender.id,
    displayName: m.sender.displayName,
    avatarColor: m.sender.avatarColor,
  },
  attachments: m.attachments,
});

export interface QuoteDescription {
  /** "You", or the sender's display name. */
  name: string;
  /** The text to show: the message, or "Photo" / "3 photos" / "Video" when there's no caption. */
  text: string;
  /** The first photo or video, for a thumbnail. */
  media: ReplyTo['attachments'][number] | null;
}

export function describeQuote(quote: ReplyTo, viewerId: string): QuoteDescription {
  const caption = quote.body.replace(/\s+/g, ' ').trim();
  const media = quote.attachments[0] ?? null;
  return {
    name: quote.sender.id === viewerId ? 'You' : quote.sender.displayName,
    text: caption || mediaSummary(quote.attachments)?.text || 'Message',
    media,
  };
}

/**
 * A person's colour, readable as text on bubbles and the page in either theme: their avatar
 * colour pulled a little towards the text colour.
 */
export const readableColor = (color: string) =>
  `color-mix(in oklab, ${color} 72%, var(--foreground))`;

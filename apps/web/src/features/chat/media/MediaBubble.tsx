import type { MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import type { MediaItem } from '@/lib/messages';
import { bubbleCorners } from '../bubbleStyle';
import { Linkify } from '../Linkify';
import { MediaGrid, type MediaWho } from './MediaGrid';

/** A message with photos or videos: the pictures on top, an optional caption under them. */
export function MediaBubble({
  items,
  caption,
  mine,
  first,
  last,
  failed,
  conversationId,
  who,
  senderName,
  onToggleTime,
  onOpen,
}: {
  items: MediaItem[];
  caption: string;
  mine: boolean;
  first: boolean;
  last: boolean;
  failed?: boolean;
  conversationId: string;
  who: MediaWho;
  senderName: string;
  onToggleTime: (e: MouseEvent<HTMLElement>) => void;
  onOpen: (index: number) => void;
}) {
  return (
    <div
      className={cn(
        'relative w-fit max-w-full overflow-hidden',
        bubbleCorners(mine, first, last),
        'transition-[border-radius,opacity] duration-300 ease-out-quint',
        mine ? 'bg-brand text-brand-foreground' : 'bg-bubble text-foreground',
        failed && 'opacity-60',
        // Without a caption, a hairline keeps pale photos from dissolving into the page.
        !caption &&
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-black/5 after:content-[''] dark:after:ring-white/10",
      )}
    >
      <MediaGrid
        items={items}
        conversationId={conversationId}
        who={who}
        senderName={senderName}
        onOpen={onOpen}
      />
      {caption ? (
        // `w-0 min-w-full`: the caption wraps to the width of the pictures instead of widening them.
        <div
          onClick={onToggleTime}
          className={cn(
            'w-0 min-w-full whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-[1.42] md:px-4',
            mine
              ? '[&_a]:text-brand-foreground [&_a]:decoration-white/50'
              : '[&_a]:text-brand-text [&_a]:decoration-current/40',
          )}
        >
          <Linkify text={caption} />
        </div>
      ) : null}
    </div>
  );
}

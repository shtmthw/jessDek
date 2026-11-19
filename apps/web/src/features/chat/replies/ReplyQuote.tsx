import { Image as ImageIcon, Video, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import type { ReplyTo } from '@/lib/gql';
import { blurDataUrl, useMediaUrl } from '../media/MediaTile';
import { describeQuote, readableColor } from './quote';

/** A small square of the quoted photo or video: the real picture if it's here, else its blur. */
function Thumb({
  media,
  className,
}: {
  media: ReplyTo['attachments'][number];
  className?: string;
}) {
  const sha = media.kind === 'VIDEO' ? (media.posterSha256 ?? undefined) : media.sha256;
  // Only ever reads a file already on this device; a quote never starts a download.
  const url = useMediaUrl(sha, null, true) ?? blurDataUrl(media.thumbhash);
  return (
    <span
      aria-hidden
      className={cn('block shrink-0 overflow-hidden bg-muted', className)}
      style={
        url
          ? {
              backgroundImage: `url(${url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    />
  );
}

function KindIcon({ kind }: { kind: 'IMAGE' | 'VIDEO' }) {
  const Icon = kind === 'VIDEO' ? Video : ImageIcon;
  return <Icon className="mb-px mr-1 inline size-3.5 align-middle opacity-80" aria-hidden />;
}

/**
 * The quote at the top of a reply bubble. Tapping it jumps to the original. On your own (brand)
 * bubbles it's a soft white inset; on others' it carries the quoted person's colour.
 */
export function ReplyQuote({
  quote,
  viewerId,
  mine,
  onJump,
  className,
}: {
  quote: ReplyTo;
  viewerId: string;
  /** The reply bubble is yours (brand coloured). */
  mine: boolean;
  onJump?: () => void;
  className?: string;
}) {
  const { name, text, media } = describeQuote(quote, viewerId);
  const color = readableColor(quote.sender.avatarColor);
  return (
    <button
      type="button"
      data-reply-quote
      onClick={(e: MouseEvent) => {
        e.stopPropagation(); // the bubble's own tap reveals the time
        onJump?.();
      }}
      aria-label={`Reply to ${name}: ${text}. Show the original message`}
      className={cn(
        'flex w-full min-w-0 items-stretch gap-2 overflow-hidden rounded-[12px] text-left',
        'transition-colors duration-150',
        mine
          ? 'bg-white/[0.14] hover:bg-white/20'
          : 'bg-background/75 hover:bg-background dark:bg-white/[0.06] dark:hover:bg-white/10',
        className,
      )}
    >
      <span
        aria-hidden
        className="my-1.5 ml-1.5 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: mine ? 'rgb(255 255 255 / 0.75)' : quote.sender.avatarColor }}
      />
      <span className="min-w-0 flex-1 py-1.5">
        <span
          className={cn(
            'block truncate text-[13px] font-semibold leading-[18px]',
            mine && 'text-brand-foreground',
          )}
          style={mine ? undefined : { color }}
        >
          {name}
        </span>
        <span
          className={cn(
            'line-clamp-2 break-words text-[13px] leading-[18px]',
            mine ? 'text-brand-foreground/85' : 'text-muted-foreground',
          )}
        >
          {media && !quote.body.trim() ? <KindIcon kind={media.kind} /> : null}
          {text}
        </span>
      </span>
      {media ? (
        <Thumb media={media} className="m-1 size-10 self-center rounded-lg" />
      ) : (
        <span className="w-1.5 shrink-0" />
      )}
    </button>
  );
}

/** "Replying to Bob" above the message box, with a way out. */
export function ReplyBar({
  quote,
  viewerId,
  onCancel,
}: {
  quote: ReplyTo;
  viewerId: string;
  onCancel: () => void;
}) {
  const { name, text, media } = describeQuote(quote, viewerId);
  return (
    <div className="flex items-stretch gap-2 px-1.5 pt-1.5" data-reply-bar>
      <div className="flex min-w-0 flex-1 items-stretch gap-2.5 overflow-hidden rounded-2xl bg-muted/70 dark:bg-muted">
        <span
          aria-hidden
          className="my-2 ml-2 w-[3px] shrink-0 rounded-full"
          style={{ backgroundColor: quote.sender.avatarColor }}
        />
        <div className="min-w-0 flex-1 py-1.5">
          <p className="truncate text-[13px] leading-[18px] text-muted-foreground">
            Replying to{' '}
            <span
              className="font-semibold"
              style={{ color: readableColor(quote.sender.avatarColor) }}
            >
              {name === 'You' ? 'yourself' : name}
            </span>
          </p>
          <p className="truncate text-[13px] leading-[18px] text-foreground/80">
            {media && !quote.body.trim() ? <KindIcon kind={media.kind} /> : null}
            {text}
          </p>
        </div>
        {media ? <Thumb media={media} className="my-1 size-9 self-center rounded-lg" /> : null}
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        title="Cancel reply (Esc)"
        className="inline-flex size-9 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

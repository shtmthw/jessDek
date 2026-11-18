import { AlertCircle, ArrowDown, Check, Loader2, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Avatar } from '@/components/Avatar';
import { useSharingSummary } from '@/features/media/transfers';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/media';
import { buildTimeline, type ChatMessage, type TimelineItem } from '@/lib/messages';
import { exit, spring } from '@/lib/motion';
import { formatClock } from '@/lib/time';
import type { Typer } from '../realtime/typing';
import { bubbleCorners } from './bubbleStyle';
import { Linkify } from './Linkify';
import { MediaBubble } from './media/MediaBubble';
import { ScrollRootContext } from './media/ScrollRoot';
import { TypingBubble } from './TypingBubble';

/** A message as shown on screen. `id` is a stable key: a sent message keeps the key it had while pending. */
export interface DisplayMessage extends ChatMessage {
  status?: 'sending' | 'failed' | 'sent';
  tempId?: string;
  /** Your own photos and videos are still being resized and hashed before they can be sent. */
  preparing?: boolean;
}

type Run = Extract<TimelineItem<DisplayMessage>, { kind: 'run' }>;

const NEAR_BOTTOM_PX = 120;
const SLOW_SEND_MS = 400;
const RECEIPT_DELAY_S = 0.2;
const FAR_FROM_BOTTOM_PX = 480;

function Bubble({
  text,
  mine,
  first,
  last,
  status,
  onClick,
}: {
  text: string;
  mine: boolean;
  first: boolean;
  last: boolean;
  status?: DisplayMessage['status'];
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'w-fit max-w-[min(80%,clamp(34rem,45%,48rem))] whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-[1.42] md:px-4',
        'transition-[border-radius,opacity,background-color] duration-300 ease-out-quint',
        mine ? 'bg-brand text-brand-foreground' : 'bg-bubble text-foreground',
        bubbleCorners(mine, first, last),
        status === 'sending' && 'opacity-70',
        status === 'failed' && 'opacity-60',
        mine
          ? '[&_a]:text-brand-foreground [&_a]:decoration-white/50'
          : '[&_a]:text-brand-text [&_a]:decoration-current/40',
      )}
    >
      <Linkify text={text} />
    </div>
  );
}

function StatusLine({
  message,
  showDelivery,
  sharingText,
  onRetry,
  onDiscard,
}: {
  message: DisplayMessage;
  showDelivery: boolean;
  /** "Sharing with Bob · 45%" while someone is downloading your photos from this tab. */
  sharingText?: string | null;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
}) {
  const { status, tempId } = message;
  // "Sending…" is only worth showing when a send takes a noticeable moment.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (status !== 'sending') return setSlow(false);
    const t = setTimeout(() => setSlow(true), SLOW_SEND_MS);
    return () => clearTimeout(t);
  }, [status]);
  const key =
    status === 'failed'
      ? 'failed'
      : status === 'sending' && message.preparing
        ? 'preparing' // no delay: resizing a photo is slow enough to deserve a word at once
        : sharingText
          ? 'sharing' // shown on any of your media messages, not just the newest
          : !showDelivery
            ? null
            : status === 'sending'
              ? slow
                ? 'sending'
                : null
              : (status ?? null);
  // One label at a time, in one grid cell under its bubble: the old one leaves before the next
  // arrives. When the line goes away entirely (a newer message took over), it leaves at once.
  const leave = {
    exit: (next: string | null) => ({
      opacity: 0,
      transition: next ? exit.fast : { duration: 0 },
    }),
  };
  return (
    <div className="grid justify-items-end">
      <AnimatePresence initial={false} custom={key} mode="wait">
        {key === 'failed' && tempId ? (
          <motion.div
            key="failed"
            role="alert"
            className="col-start-1 row-start-1 flex items-center gap-1 px-1 pt-1 text-xs text-danger"
            variants={leave}
            custom={key}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit="exit"
            transition={spring.snappy}
          >
            Not sent
            <button
              onClick={() => onRetry(tempId)}
              className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium hover:bg-danger/10"
            >
              <RotateCcw className="size-3" /> Retry
            </button>
            <button
              onClick={() => onDiscard(tempId)}
              aria-label="Discard message"
              className="rounded-md p-1 hover:bg-danger/10"
            >
              <X className="size-3" />
            </button>
          </motion.div>
        ) : key === 'sending' || key === 'preparing' || key === 'sharing' ? (
          <motion.span
            key={key}
            className="tabular col-start-1 row-start-1 px-1 pt-1 text-[11px] text-muted-foreground"
            variants={leave}
            custom={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit="exit"
          >
            {key === 'sending' ? 'Sending…' : key === 'preparing' ? 'Preparing…' : sharingText}
          </motion.span>
        ) : key === 'sent' ? (
          <motion.span
            key="sent"
            className="col-start-1 row-start-1 inline-flex items-center gap-1 px-1 pt-1 text-[11px] text-muted-foreground"
            variants={leave}
            custom={key}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit="exit"
            // Wait for the bubble to have mostly arrived before confirming it.
            transition={{ ...spring.snappy, delay: RECEIPT_DELAY_S }}
          >
            <motion.span
              className="inline-flex"
              initial={{ scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={{ ...spring.pop, delay: RECEIPT_DELAY_S }}
            >
              <Check className="size-3" strokeWidth={2.5} />
            </motion.span>
            Sent
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** "Sharing with Bob · 45%", or "Sharing with 2 people". */
function sharingLabel(
  sharing: { peers: string[]; progress: number } | undefined,
  nameOf: (userId: string) => string | undefined,
): string | null {
  if (!sharing) return null;
  if (sharing.peers.length === 1) {
    const name = nameOf(sharing.peers[0]!)?.split(' ')[0];
    const pct = `${Math.round(sharing.progress * 100)}%`;
    return name ? `Sharing with ${name} · ${pct}` : `Sharing with 1 person · ${pct}`;
  }
  return `Sharing with ${sharing.peers.length} people`;
}

function MessageRow({
  message,
  mine,
  first,
  last,
  fresh,
  showDelivery,
  conversationId,
  isGroup,
  memberName,
  onOpenMedia,
  onRetry,
  onDiscard,
}: {
  message: DisplayMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  fresh: boolean;
  showDelivery: boolean;
  conversationId: string;
  isGroup: boolean;
  memberName: (userId: string) => string | undefined;
  onOpenMedia: (messageId: string, index: number) => void;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
}) {
  const [reveal, setReveal] = useState(false);
  const media = message.attachments?.length ? message.attachments : null;
  const sharing = useSharingSummary(
    mine && media ? media.flatMap((m) => [m.sha256, m.posterSha256 ?? undefined]) : [],
  );

  // Tap (or click) a bubble to pin its time; links and text selection keep working as usual.
  function toggle(e: MouseEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest('a')) return;
    if (window.getSelection()?.toString()) return;
    setReveal((r) => !r);
  }

  return (
    <div className={cn('flex w-full flex-col', mine ? 'items-end' : 'items-start')}>
      <motion.div
        className={cn(
          'group/msg flex w-full items-center gap-2',
          mine ? 'flex-row-reverse' : 'flex-row',
        )}
        style={{ transformOrigin: mine ? '100% 100%' : '0% 100%' }}
        initial={fresh ? { opacity: 0, y: mine ? 16 : 10, scale: mine ? 0.92 : 0.96 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={mine ? spring.send : spring.soft}
      >
        {media ? (
          <MediaBubble
            items={media}
            caption={message.body}
            mine={mine}
            first={first}
            last={last}
            failed={message.status === 'failed'}
            conversationId={conversationId}
            who={{ dm: !isGroup, mine, firstName: message.sender.displayName.split(' ')[0] ?? '' }}
            senderName={message.sender.displayName}
            onToggleTime={toggle}
            onOpen={(index) => onOpenMedia(message.id, index)}
          />
        ) : (
          <Bubble
            text={message.body}
            mine={mine}
            first={first}
            last={last}
            status={message.status}
            onClick={toggle}
          />
        )}
        {message.status === 'failed' ? (
          <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />
        ) : (
          <time
            dateTime={message.createdAt}
            className={cn(
              'tabular shrink-0 select-none text-[11px] text-muted-foreground transition-opacity duration-200',
              reveal ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100',
            )}
          >
            {formatClock(message.createdAt)}
          </time>
        )}
      </motion.div>
      <StatusLine
        message={message}
        showDelivery={showDelivery}
        sharingText={sharingLabel(sharing, memberName)}
        onRetry={onRetry}
        onDiscard={onDiscard}
      />
    </div>
  );
}

function Separator({ item }: { item: Exclude<TimelineItem, { kind: 'run' | 'day' }> }) {
  if (item.kind === 'unread') {
    return (
      <div
        data-unread-divider
        className="my-4 flex items-center gap-3 text-xs font-semibold text-brand-text"
      >
        <span className="h-px flex-1 bg-brand-text/30" />
        New messages
        <span className="h-px flex-1 bg-brand-text/30" />
      </div>
    );
  }
  return (
    <p className="tabular mb-2 mt-5 text-center text-xs font-medium text-muted-foreground">
      {item.label}
    </p>
  );
}

export function MessageList({
  messages,
  viewerId,
  conversationId,
  memberName,
  onOpenMedia,
  isGroup,
  hasMore,
  loadingMore,
  onLoadMore,
  onRetry,
  onDiscard,
  typing,
  firstUnreadId,
  intro,
  empty,
}: {
  messages: DisplayMessage[];
  viewerId: string;
  conversationId: string;
  /** A member's display name by user id (for "Sharing with Bob"). */
  memberName: (userId: string) => string | undefined;
  /** A photo or video tile was tapped: which message, and which of its attachments. */
  onOpenMedia: (messageId: string, index: number) => void;
  isGroup: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
  /** People typing right now. */
  typing: Typer[];
  firstUnreadId?: string;
  /** Shown above the first message once the whole history is loaded. */
  intro?: ReactNode;
  /** Shown instead of the list when there are no messages yet. */
  empty?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const initialised = useRef(false);
  const lastSeenId = useRef<string | undefined>(undefined);
  const prepend = useRef<{ height: number; firstId: string | undefined } | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [far, setFar] = useState(false);

  // Only messages that arrive while the chat is open get an entrance; history just appears.
  const known = useRef<Set<string> | null>(null);
  const newestKnown = useRef(0);
  if (known.current === null) {
    known.current = new Set(messages.map((m) => m.id));
    newestKnown.current = Math.max(0, ...messages.map((m) => Date.parse(m.createdAt)));
  }
  const isFresh = (m: DisplayMessage) =>
    !known.current!.has(m.id) &&
    (m.status !== undefined || Date.parse(m.createdAt) >= newestKnown.current);
  useEffect(() => {
    for (const m of messages) {
      known.current!.add(m.id);
      newestKnown.current = Math.max(newestKnown.current, Date.parse(m.createdAt));
    }
  }, [messages]);

  const timeline = useMemo(
    () => buildTimeline(messages, viewerId, new Date(), { firstUnreadId }),
    [messages, viewerId, firstUnreadId],
  );
  // Each day is its own section so its label can stick to the top while you scroll through it.
  const sections = useMemo(() => {
    const out: Array<{ key: string; label: string; items: TimelineItem<DisplayMessage>[] }> = [];
    for (const item of timeline) {
      if (item.kind === 'day') out.push({ key: item.key, label: item.label, items: [] });
      else out.at(-1)?.items.push(item);
    }
    return out;
  }, [timeline]);
  const lastMessage = messages[messages.length - 1];

  const scrollToBottom = (smooth: boolean) => {
    const el = scroller.current;
    if (el)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
      });
  };

  // Keep the viewport sensible whenever the list changes.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = messages[0];
    const last = messages[messages.length - 1];

    // Older messages were added above: keep what the reader was looking at in place.
    if (prepend.current) {
      if (first?.id !== prepend.current.firstId)
        el.scrollTop += el.scrollHeight - prepend.current.height;
      prepend.current = null;
      lastSeenId.current = last?.id;
      return;
    }
    if (!initialised.current) {
      if (messages.length === 0) return;
      initialised.current = true;
      lastSeenId.current = last?.id;
      // Open at the first unread message when there is one, otherwise at the latest.
      const divider = el.querySelector<HTMLElement>('[data-unread-divider]');
      if (divider) {
        const offset = divider.getBoundingClientRect().top - el.getBoundingClientRect().top;
        el.scrollTop = Math.max(0, el.scrollTop + offset - 56);
      } else {
        el.scrollTop = el.scrollHeight;
      }
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      return;
    }
    if (last && last.id !== lastSeenId.current) {
      lastSeenId.current = last.id;
      if (last.sender.id === viewerId || stick.current) scrollToBottom(true);
      else setUnseen((n) => n + 1);
    }
  }, [messages, viewerId]);

  // Keep the typing bubble in view when you're already at the bottom.
  const someoneTyping = typing.length > 0;
  useLayoutEffect(() => {
    if (someoneTyping && stick.current) scrollToBottom(true);
  }, [someoneTyping]);

  // Stay pinned to the bottom when the viewport resizes (e.g. the mobile keyboard opens).
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load older history when the top of the list comes into view.
  useEffect(() => {
    const el = scroller.current;
    const sentinel = topSentinel.current;
    if (!el || !sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && initialised.current) {
          prepend.current = { height: el.scrollHeight, firstId: messages[0]?.id };
          onLoadMore();
        }
      },
      { root: el, rootMargin: '300px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, messages]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distance < NEAR_BOTTOM_PX;
    if (stick.current) setUnseen(0);
    setFar(distance > FAR_FROM_BOTTOM_PX);
  }

  function renderRun(run: Run) {
    const others = !run.mine && isGroup;
    return (
      <div
        key={run.key}
        className={cn('mt-3 flex items-end gap-2 first:mt-0', run.mine && 'justify-end')}
      >
        {others ? (
          <Avatar
            name={run.sender.displayName}
            color={run.sender.avatarColor}
            size="sm"
            className="mb-px"
          />
        ) : null}
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-0.5',
            run.mine ? 'items-end' : 'items-start',
          )}
        >
          {others ? (
            <span className="mb-0.5 px-3.5 text-xs font-medium text-muted-foreground">
              {run.sender.displayName}
            </span>
          ) : null}
          {run.messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              mine={run.mine}
              first={i === 0}
              last={i === run.messages.length - 1}
              fresh={isFresh(m)}
              showDelivery={m === lastMessage}
              conversationId={conversationId}
              isGroup={isGroup}
              memberName={memberName}
              onOpenMedia={onOpenMedia}
              onRetry={onRetry}
              onDiscard={onDiscard}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollRootContext.Provider value={scroller}>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain"
          role="log"
          aria-live="polite"
          aria-label="Messages"
        >
          <div className="chat-column flex min-h-full flex-col justify-end pb-3 pt-2">
            <div ref={topSentinel} className="h-px shrink-0" />
            {loadingMore ? (
              <div className="flex justify-center py-3 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-label="Loading earlier messages" />
              </div>
            ) : !hasMore && messages.length > 0 ? (
              intro
            ) : null}

            {messages.length === 0 ? empty : null}

            {sections.map((section) => (
              <div key={section.key} role="group" aria-label={section.label}>
                <div className="pointer-events-none sticky top-0 z-10 flex justify-center py-2.5">
                  <span className="rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur-md">
                    {section.label}
                  </span>
                </div>
                {section.items.map((item) =>
                  item.kind === 'run' ? (
                    renderRun(item)
                  ) : item.kind === 'day' ? null : (
                    <Separator key={item.key} item={item} />
                  ),
                )}
              </div>
            ))}

            <AnimatePresence>
              {someoneTyping ? <TypingBubble key="typing" typers={typing} group={isGroup} /> : null}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {unseen > 0 ? (
            <motion.button
              key="unseen"
              onClick={() => {
                scrollToBottom(true);
                setUnseen(0);
              }}
              className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-sm font-medium text-brand-foreground shadow-md"
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95, transition: exit.fast }}
              transition={spring.pop}
            >
              <ArrowDown className="size-4" />
              {unseen === 1 ? '1 new message' : `${unseen} new messages`}
            </motion.button>
          ) : far ? (
            <motion.button
              key="latest"
              aria-label="Jump to latest message"
              title="Jump to latest"
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-3 right-4 inline-flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-md ring-1 ring-border hover:text-foreground md:right-6"
              initial={{ opacity: 0, y: 12, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: exit.fast }}
              transition={spring.pop}
            >
              <ArrowDown className="size-[18px]" />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </ScrollRootContext.Provider>
  );
}

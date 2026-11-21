import { Copy, Plus, Reply, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useChatThemeScope } from '../../theme/ChatWallpaper';
import { cn } from '@/lib/cn';
import { exit, spring } from '@/lib/motion';
import { preloadEmojiPicker } from '../reactions/EmojiPickerDialog';
import { QUICK_REACTIONS } from '../reactions/reactions';

export interface MenuRequest {
  /** The bubble element: the menu gathers around it. */
  bubble: HTMLElement;
  /** `react`: just the reaction bar (the toolbar's smiley). `full`: reactions and actions. */
  mode: 'react' | 'full';
  /** Opened by touch: dim everything but the bubble, and use finger-sized targets. */
  touch: boolean;
  /** Where focus goes back to when the menu closes (keyboard and mouse use only). */
  returnFocus: HTMLElement | null;
}

const MARGIN = 10;
const GAP = 8;

interface Place {
  rect: { top: number; left: number; width: number; height: number };
  radius: string;
  bar: { top: number; left: number; below: boolean };
  list: { top: number; left: number } | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Puts the reaction bar above the bubble and the actions below it, wherever they fit. */
function place(
  bubble: HTMLElement,
  mine: boolean,
  bar: { width: number; height: number },
  list: { width: number; height: number } | null,
): Place {
  const r = bubble.getBoundingClientRect();
  // Keep clear of the whole message (its reaction chips hang below the bubble).
  const block = (bubble.closest('[data-message-key]') ?? bubble).getBoundingClientRect();
  const top = Math.min(r.top, block.top);
  const bottom = Math.max(r.bottom, block.bottom);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const alignX = (w: number) => clamp(mine ? r.right - w : r.left, MARGIN, vw - w - MARGIN);
  const above = top - MARGIN;
  const below = vh - bottom - MARGIN;

  let barTop: number;
  let barBelow = false;
  let listTop: number | null = null;
  if (above >= bar.height + GAP) {
    barTop = top - GAP - bar.height;
    if (list) {
      if (below >= list.height + GAP) listTop = bottom + GAP;
      else if (above >= bar.height + list.height + 2 * GAP) listTop = barTop - GAP - list.height;
      else listTop = clamp(bottom + GAP, MARGIN, vh - list.height - MARGIN);
    }
  } else {
    barBelow = true;
    barTop = bottom + GAP;
    if (list) listTop = barTop + bar.height + GAP;
    const end = (listTop ?? barTop) + (list ? list.height : bar.height);
    if (end > vh - MARGIN) {
      // No room either way (a very tall bubble): keep both on screen, over the bubble.
      const shift = end - (vh - MARGIN);
      barTop -= shift;
      if (listTop !== null) listTop -= shift;
    }
  }
  return {
    rect: { top: r.top, left: r.left, width: r.width, height: r.height },
    radius: getComputedStyle(bubble).borderRadius,
    bar: {
      top: clamp(barTop, MARGIN, vh - bar.height - MARGIN),
      left: alignX(bar.width),
      below: barBelow,
    },
    list: list && listTop !== null ? { top: listTop, left: alignX(list.width) } : null,
  };
}

function Action({
  icon: Icon,
  children,
  onSelect,
}: {
  icon: LucideIcon;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] outline-none transition-colors duration-100 hover:bg-muted focus-visible:bg-muted md:min-h-9 md:text-sm"
    >
      <Icon className="size-[18px] shrink-0 text-muted-foreground md:size-4" aria-hidden />
      {children}
    </button>
  );
}

/**
 * A message's reactions and actions, gathered around its bubble. On touch it dims everything else
 * (the bubble stays put, in a spotlight); with a mouse or keyboard it rings the bubble instead.
 */
export function MessageMenu({
  request,
  mine,
  current,
  canCopy,
  onClose,
  onReact,
  onMore,
  onReply,
  onCopy,
}: {
  request: MenuRequest;
  mine: boolean;
  /** Your reaction to this message, if any. */
  current: string | null;
  canCopy: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  /** "+": every emoji. */
  onMore: () => void;
  onReply: () => void;
  onCopy: () => void;
}) {
  const { bubble, mode, touch } = request;
  const barRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Place | null>(null);
  const full = mode === 'full';

  // Measure, then place before the first paint so nothing jumps.
  // (offsetWidth/Height: the entrance animation starts scaled down, and layout size ignores that.)
  useLayoutEffect(() => {
    const size = (el: HTMLElement | null) =>
      el ? { width: el.offsetWidth, height: el.offsetHeight } : null;
    const bar = size(barRef.current);
    if (!bar) return;
    setPos(place(bubble, mine, bar, full ? size(listRef.current) : null));
  }, [bubble, mine, full]);

  // The bubble moves if the window does: simplest to close.
  useEffect(() => {
    window.addEventListener('resize', onClose);
    return () => window.removeEventListener('resize', onClose);
  }, [onClose]);

  useEffect(preloadEmojiPicker, []);

  // Once placed (it's hidden until then, and hidden things can't take focus), start on your
  // current reaction or the first, ready for arrow keys. Focus goes back where it was on close.
  const placed = pos !== null;
  useEffect(() => {
    if (!placed || touch) return; // no focus ring under a finger
    const start =
      barRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      barRef.current?.querySelector<HTMLElement>('button');
    start?.focus({ preventScroll: true });
    const back = request.returnFocus;
    const menu = root.current;
    return () => {
      // Only if focus is still ours: an action like Reply moves it on (to the message box).
      const here = document.activeElement;
      const ours = !here || here === document.body || Boolean(menu?.contains(here));
      if (ours && back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [placed, touch, request.returnFocus]);

  // Esc closes from anywhere, even if focus is outside (opened by touch, say).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    const inBar = barRef.current?.contains(document.activeElement);
    const items = (el: HTMLElement | null) =>
      el ? [...el.querySelectorAll<HTMLElement>('button')] : [];
    const move = (list: HTMLElement[], step: number) => {
      const i = list.indexOf(document.activeElement as HTMLElement);
      list[(i + step + list.length) % list.length]?.focus();
    };
    if (inBar && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      move(items(barRef.current), e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (inBar && listRef.current) items(listRef.current)[0]?.focus();
      else if (!inBar) {
        const list = items(listRef.current);
        const i = list.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowUp' && i <= 0) items(barRef.current)[0]?.focus();
        else move(list, e.key === 'ArrowDown' ? 1 : -1);
      }
    } else if (e.key === 'Tab') {
      // Keep focus inside while the menu is open.
      const all = items(root.current);
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  // Drawn outside the chat, so it carries the chat's theme itself (its accent marks your reaction).
  const themeScope = useChatThemeScope();
  const ready = placed;
  const emojiSize = touch ? 'size-11 text-[27px]' : 'size-10 text-[24px]';

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Message actions"
      className="fixed inset-0 z-50"
      onKeyDown={onKeyDown}
      data-chat-theme={themeScope['data-chat-theme']}
      style={{ ...themeScope.style, visibility: ready ? 'visible' : 'hidden' }}
    >
      {/* Any touch or click outside closes. Pointer-down, so the finger that opened it can lift. */}
      <div
        className="absolute inset-0"
        onPointerDown={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />

      {pos ? (
        touch ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              ...pos.rect,
              borderRadius: pos.radius,
              boxShadow: '0 0 0 200vmax var(--scrim)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: exit.base }}
          />
        ) : (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute ring-2 ring-brand-text/45"
            style={{ ...pos.rect, borderRadius: pos.radius }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15 } }}
            exit={{ opacity: 0, transition: exit.fast }}
          />
        )
      ) : null}

      <motion.div
        ref={barRef}
        role="toolbar"
        aria-label="React"
        className="absolute flex items-center gap-0.5 rounded-full bg-background p-1 shadow-lg ring-1 ring-border"
        style={{
          top: pos?.bar.top ?? 0,
          left: pos?.bar.left ?? 0,
          transformOrigin: `${mine ? '85%' : '15%'} ${pos?.bar.below ? '0%' : '100%'}`,
        }}
        initial={{ opacity: 0, scale: 0.6, y: pos?.bar.below ? -6 : 6 }}
        animate={ready ? { opacity: 1, scale: 1, y: 0 } : undefined}
        exit={{ opacity: 0, scale: 0.9, transition: exit.fast }}
        transition={spring.pop}
      >
        {QUICK_REACTIONS.map((emoji, i) => {
          const on = emoji === current;
          return (
            <motion.button
              key={emoji}
              type="button"
              aria-label={on ? `Remove ${emoji}` : `React ${emoji}`}
              aria-pressed={on}
              onClick={() => onReact(emoji)}
              className={cn(
                'relative inline-flex items-center justify-center rounded-full leading-none outline-offset-0',
                emojiSize,
                on && 'bg-brand/12 ring-1 ring-inset ring-brand-text/40',
              )}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={ready ? { opacity: 1, scale: 1 } : undefined}
              transition={{ ...spring.pop, delay: 0.03 + i * 0.022 }}
              whileHover={{ scale: 1.22, y: -3 }}
              whileTap={{ scale: 0.88 }}
            >
              {emoji}
            </motion.button>
          );
        })}
        <motion.button
          type="button"
          aria-label="More reactions"
          title="More reactions"
          onClick={onMore}
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground',
            touch ? 'ml-0.5 size-10' : 'ml-0.5 size-9',
          )}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={ready ? { opacity: 1, scale: 1 } : undefined}
          transition={{ ...spring.pop, delay: 0.03 + QUICK_REACTIONS.length * 0.022 }}
          whileTap={{ scale: 0.9 }}
        >
          <Plus className="size-5" />
        </motion.button>
      </motion.div>

      {full ? (
        <motion.div
          ref={listRef}
          role="menu"
          aria-label="Actions"
          className="absolute w-56 rounded-2xl bg-background p-1.5 shadow-lg ring-1 ring-border"
          style={{
            top: pos?.list?.top ?? 0,
            left: pos?.list?.left ?? 0,
            transformOrigin: `${mine ? '100%' : '0%'} 0%`,
          }}
          initial={{ opacity: 0, scale: 0.94, y: -4 }}
          animate={ready ? { opacity: 1, scale: 1, y: 0 } : undefined}
          exit={{ opacity: 0, scale: 0.97, transition: exit.fast }}
          transition={spring.soft}
        >
          <Action icon={Reply} onSelect={onReply}>
            Reply
          </Action>
          {canCopy ? (
            <Action icon={Copy} onSelect={onCopy}>
              Copy text
            </Action>
          ) : null}
        </motion.div>
      ) : null}
    </div>,
    document.body,
  );
}

import { ArrowUp, ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { AutoHeight } from '@/components/AutoHeight';
import { useMediaConfig } from '@/features/media/config';
import { setPref, usePref } from '@/features/media/prefs';
import { addFiles, takeTray, useHd, useTray, type TrayItem } from '@/features/media/trayStore';
import { cn } from '@/lib/cn';
import { getDraft, setDraft } from '@/lib/drafts';
import type { ReplyTo } from '@/lib/gql';
import { COMPOSER_ID } from '@/lib/keys';
import { isTouchDevice } from '@/lib/media';
import { exit, spring } from '@/lib/motion';
import { AttachmentTray } from './media/AttachmentTray';
import { MediaIntro } from './media/MediaIntro';
import { ReplyBar } from './replies/ReplyQuote';

const MAX_LENGTH = 4000;
/** The remaining-characters counter appears once you're this close to the limit. */
const COUNTER_AT = 400;

export function Composer({
  onSend,
  onTyping,
  placeholder = 'Message',
  draftKey,
  autoFocus,
  replyTo,
  viewerId,
  onCancelReply,
  onWallpaper,
  textOnly,
}: {
  /** `items` are the photos and videos from the tray (ownership passes to the caller). */
  onSend: (body: string, items?: TrayItem[]) => void;
  onTyping?: () => void;
  placeholder?: string;
  /** Keeps unsent text for this conversation across chat switches and reloads. */
  draftKey?: string;
  /** Focus on mount (skipped on touch devices so the keyboard doesn't jump up). */
  autoFocus?: boolean;
  /** The message being replied to, shown above the text field. */
  replyTo?: ReplyTo | null;
  viewerId?: string;
  onCancelReply?: () => void;
  /** The chat has a wallpaper: let it show around the message box. */
  onWallpaper?: boolean;
  /** No photos or videos (a message request): no attach button, pasted files are ignored. */
  textOnly?: boolean;
}) {
  const [value, setValue] = useState(() => (draftKey ? getDraft(draftKey) : ''));
  const [launches, setLaunches] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // The tray is kept per chat, so a chat switch (and coming back) never loses what you added.
  const fallbackKey = useId();
  const trayKey = draftKey ?? fallbackKey;
  const items = useTray(trayKey);
  const hd = useHd(trayKey);
  const mediaEnabled = useMediaConfig()?.enabled !== false && !textOnly;
  const [introSeen] = usePref('media:intro-seen');
  const hasMedia = items.length > 0;
  const canSend = value.trim().length > 0 || hasMedia;
  const remaining = MAX_LENGTH - value.length;

  // Grow with the content, up to roughly six lines, then scroll.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 152)}px`;
  }, [value]);

  useEffect(() => {
    if (!autoFocus || isTouchDevice()) return;
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  function update(next: string) {
    setValue(next);
    if (draftKey) setDraft(draftKey, next);
  }

  function submit() {
    const body = value.trim();
    if (!body && !hasMedia) return;
    if (hasMedia) {
      setPref('media:intro-seen', true);
      onSend(body, takeTray(trayKey));
    } else onSend(body);
    update('');
    setLaunches((n) => n + 1);
    ref.current?.focus();
  }

  function onFiles(files: File[]) {
    if (files.length) addFiles(trayKey, files);
  }

  // Pasting a picture attaches it; pasting text (even alongside a picture) pastes the text.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!mediaEnabled) return;
    const files = Array.from(e.clipboardData.files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    );
    if (files.length === 0 || e.clipboardData.getData('text/plain')) return;
    e.preventDefault();
    onFiles(files);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Esc lets go of a reply first (before it would leave the chat).
    if (e.key === 'Escape' && replyTo && onCancelReply) {
      e.preventDefault();
      onCancelReply();
      return;
    }
    // Enter sends on desktop; on touch keyboards Enter inserts a new line (use the button).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        'chat-column shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 md:pb-4',
        !onWallpaper && 'bg-background',
      )}
    >
      <AnimatePresence initial={false}>
        {hasMedia && !introSeen ? (
          <MediaIntro key="intro" onDismiss={() => setPref('media:intro-seen', true)} />
        ) : null}
      </AnimatePresence>
      <div
        className={cn(
          'flex w-full flex-col rounded-[1.5rem] border border-border bg-background p-1 shadow-sm',
          'transition-[border-color,box-shadow] duration-200 ease-out-quint',
          'focus-within:border-brand-text/45 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_12%,transparent)]',
        )}
      >
        <AutoHeight>
          <AnimatePresence initial={false} mode="popLayout">
            {replyTo && viewerId && onCancelReply ? (
              <motion.div
                key={replyTo.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exit.fast }}
                transition={spring.soft}
              >
                <ReplyBar
                  quote={replyTo}
                  viewerId={viewerId}
                  onCancel={() => {
                    onCancelReply();
                    ref.current?.focus();
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {hasMedia ? <AttachmentTray trayKey={trayKey} items={items} hd={hd} /> : null}
        </AutoHeight>
        <div className="flex items-end gap-1">
          {mediaEnabled ? (
            <motion.button
              type="button"
              aria-label="Add photos or videos"
              title="Add photos or videos"
              onClick={() => fileInput.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:size-9"
              whileTap={{ scale: 0.9 }}
              transition={spring.pop}
            >
              <ImagePlus className="size-5" />
            </motion.button>
          ) : null}
          <textarea
            id={COMPOSER_ID}
            ref={ref}
            value={value}
            rows={1}
            maxLength={MAX_LENGTH}
            placeholder={hasMedia ? 'Add a caption…' : placeholder}
            aria-label="Message"
            enterKeyHint="send"
            onChange={(e) => {
              update(e.target.value);
              if (e.target.value) onTyping?.();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className={cn(
              'max-h-38 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 outline-none focus-visible:outline-none md:min-h-9 md:py-1.5 md:text-[15px]',
              mediaEnabled ? 'pl-1' : 'pl-3',
            )}
          />
          <AnimatePresence initial={false}>
            {remaining <= COUNTER_AT ? (
              <motion.span
                key="counter"
                aria-live="polite"
                className={cn(
                  'tabular self-center text-xs',
                  remaining < 100 ? 'font-medium text-danger' : 'text-muted-foreground',
                )}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: exit.fast }}
                transition={spring.snappy}
              >
                {remaining}
              </motion.span>
            ) : null}
          </AnimatePresence>
          {/* The button keeps its full tap target; only the circle inside shrinks while idle. */}
          <motion.button
            type="submit"
            aria-label="Send message"
            title="Send (Enter)"
            disabled={!canSend}
            className={cn(
              'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full md:size-9',
              canSend ? 'text-brand-foreground' : 'text-muted-foreground',
            )}
            whileTap={canSend ? { scale: 0.9 } : undefined}
            transition={spring.pop}
          >
            <motion.span
              aria-hidden
              className={cn(
                'absolute inset-0 overflow-hidden rounded-full transition-colors duration-200',
                canSend ? 'bg-brand' : 'bg-muted',
              )}
              initial={false}
              animate={{ scale: canSend ? 1 : 0.88 }}
              transition={spring.pop}
            >
              {/* Each send launches the arrow up and a fresh one rises into place. */}
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={launches}
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ y: 18, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -22, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
                  transition={spring.soft}
                >
                  <ArrowUp className="size-[18px]" strokeWidth={2.4} />
                </motion.span>
              </AnimatePresence>
            </motion.span>
          </motion.button>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        data-media-input
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = ''; // picking the same file again should still fire
        }}
      />
    </form>
  );
}

import { ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { getDraft, setDraft } from '@/lib/drafts';
import { COMPOSER_ID } from '@/lib/keys';
import { isTouchDevice } from '@/lib/media';
import { exit, spring } from '@/lib/motion';

const MAX_LENGTH = 4000;
/** The remaining-characters counter appears once you're this close to the limit. */
const COUNTER_AT = 400;

export function Composer({
  onSend,
  onTyping,
  placeholder = 'Message',
  draftKey,
  autoFocus,
}: {
  onSend: (body: string) => void;
  onTyping?: () => void;
  placeholder?: string;
  /** Keeps unsent text for this conversation across chat switches and reloads. */
  draftKey?: string;
  /** Focus on mount (skipped on touch devices so the keyboard doesn't jump up). */
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(() => (draftKey ? getDraft(draftKey) : ''));
  const [launches, setLaunches] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0;
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
    if (!body) return;
    onSend(body);
    update('');
    setLaunches((n) => n + 1);
    ref.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
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
      className="chat-column shrink-0 bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 md:pb-4"
    >
      <div
        className={cn(
          'flex w-full items-end gap-2 rounded-[1.5rem] border border-border bg-background p-1 pl-4 shadow-sm',
          'transition-[border-color,box-shadow] duration-200 ease-out-quint',
          'focus-within:border-brand-text/45 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_12%,transparent)]',
        )}
      >
        <textarea
          id={COMPOSER_ID}
          ref={ref}
          value={value}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder={placeholder}
          aria-label="Message"
          enterKeyHint="send"
          onChange={(e) => {
            update(e.target.value);
            if (e.target.value) onTyping?.();
          }}
          onKeyDown={onKeyDown}
          className="max-h-38 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 outline-none focus-visible:outline-none md:min-h-9 md:py-1.5 md:text-[15px]"
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
    </form>
  );
}

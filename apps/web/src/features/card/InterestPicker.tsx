import { Plus, Search, SmilePlus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { cn } from '@/lib/cn';
import { exit, spring } from '@/lib/motion';
import { EmojiPickerDialog } from '../chat/reactions/EmojiPickerDialog';
import { interestEmoji, interestLabel } from './CardView';
import { INTEREST_GROUPS, searchInterests, type InterestDef } from './interests';
import {
  charCount,
  cleanCustom,
  CUSTOM_MAX,
  interestKey,
  INTERESTS_MAX,
  type Interest,
} from './recipe';

/** A built-in interest as a toggle chip. */
function Choice({
  item,
  on,
  full,
  onToggle,
}: {
  item: InterestDef;
  on: boolean;
  full: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={!on && full}
      onClick={onToggle}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium outline-offset-2',
        'transition-[background-color,color,box-shadow,transform,opacity] duration-200 ease-out-quint motion-safe:active:scale-95',
        on
          ? 'bg-brand text-brand-foreground shadow-sm'
          : 'bg-muted text-foreground hover:bg-border/70 disabled:opacity-40 dark:bg-border/60 dark:hover:bg-border',
      )}
    >
      <span aria-hidden>{item.emoji}</span>
      {item.label}
    </button>
  );
}

/**
 * Up to six interests: picked from the built-in list (searchable, by category), or written by
 * the person with an emoji of their choice.
 */
export function InterestPicker({
  value,
  onChange,
}: {
  value: Interest[];
  onChange: (next: Interest[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const ids = useId();
  const full = value.length >= INTERESTS_MAX;
  const chosen = useMemo(() => new Set(value.map(interestKey)), [value]);
  const results = useMemo(() => searchInterests(query), [query]);
  const trimmed = cleanCustom(query);
  const exact = results.some((r) => r.label.toLowerCase() === trimmed.toLowerCase());

  const toggle = (id: string) =>
    onChange(
      chosen.has(`id:${id}`) ? value.filter((v) => v !== id) : full ? value : [...value, id],
    );
  const remove = (it: Interest) =>
    onChange(value.filter((v) => interestKey(v) !== interestKey(it)));

  function addCustom(name: string, e: string | null) {
    const t = cleanCustom(name);
    if (!t || full) return;
    const it: Interest = e ? { t, e } : { t };
    if (chosen.has(interestKey(it))) return;
    onChange([...value, it]);
  }

  function onSubmitCustom(e: FormEvent) {
    e.preventDefault();
    addCustom(custom, emoji);
    setCustom('');
    setEmoji(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 id={`${ids}-mine`} className="text-sm font-semibold tracking-tight">
            Your interests
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {value.length} of {INTERESTS_MAX}
          </span>
        </div>
        {value.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
            Pick up to {INTERESTS_MAX} below, or add your own.
          </p>
        ) : (
          <ul aria-labelledby={`${ids}-mine`} className="flex flex-wrap gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {value.map((it) => (
                <motion.li
                  key={interestKey(it)}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85, transition: exit.fast }}
                  transition={spring.pop}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand/10 pl-3 pr-1 text-sm font-medium text-brand-text ring-1 ring-inset ring-brand-text/25"
                >
                  {interestEmoji(it) ? <span aria-hidden>{interestEmoji(it)}</span> : null}
                  {interestLabel(it)}
                  <button
                    type="button"
                    onClick={() => remove(it)}
                    aria-label={`Remove ${interestLabel(it)}`}
                    className="ml-0.5 inline-flex size-7 items-center justify-center rounded-full transition-colors hover:bg-brand/15"
                  >
                    <X className="size-3.5" strokeWidth={2.5} />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {full ? (
          <p className="mt-2 text-xs text-muted-foreground">
            That’s six. Remove one to pick another.
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmitCustom} className="space-y-2">
        <label htmlFor={`${ids}-custom`} className="block text-sm font-semibold tracking-tight">
          Add your own
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={emoji ? `Emoji: ${emoji}. Change it` : 'Choose an emoji'}
            title="Choose an emoji"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-xl shadow-sm transition-colors hover:bg-muted md:size-10"
          >
            {emoji ?? <SmilePlus className="size-5 text-muted-foreground" />}
          </button>
          <Input
            id={`${ids}-custom`}
            value={custom}
            onChange={(e) => setCustom([...e.target.value].slice(0, CUSTOM_MAX).join(''))}
            placeholder="Bouldering, synths, sourdough…"
            autoComplete="off"
            disabled={full}
            aria-describedby={`${ids}-custom-hint`}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={full || !cleanCustom(custom)}
            className="md:h-10"
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
        <p id={`${ids}-custom-hint`} className="text-xs text-muted-foreground">
          Up to {CUSTOM_MAX} characters · {charCount(custom)}/{CUSTOM_MAX}
        </p>
      </form>

      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search interests"
            aria-label="Search interests"
            className="pl-10"
            autoComplete="off"
          />
        </div>

        {query.trim() ? (
          <div className="space-y-3" aria-live="polite">
            <div className="flex flex-wrap gap-2">
              {results.map((it) => (
                <Choice
                  key={it.id}
                  item={it}
                  on={chosen.has(`id:${it.id}`)}
                  full={full}
                  onToggle={() => toggle(it.id)}
                />
              ))}
              {trimmed && !exact ? (
                <button
                  type="button"
                  disabled={full}
                  onClick={() => {
                    addCustom(trimmed, null);
                    setQuery('');
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-brand-text/50 px-3 text-sm font-medium text-brand-text transition-colors hover:bg-brand/10 disabled:opacity-40"
                >
                  <Plus className="size-4" /> Add “{trimmed}”
                </button>
              ) : null}
            </div>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing in the list matches. Add it as your own?
              </p>
            ) : null}
          </div>
        ) : (
          INTEREST_GROUPS.map((g) => (
            <section key={g.id} aria-labelledby={`${ids}-${g.id}`}>
              <h3
                id={`${ids}-${g.id}`}
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {g.label}
              </h3>
              <div className="flex flex-wrap gap-2">
                {g.items.map((it) => (
                  <Choice
                    key={it.id}
                    item={it}
                    on={chosen.has(`id:${it.id}`)}
                    full={full}
                    onToggle={() => toggle(it.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <EmojiPickerDialog
        open={picking}
        onOpenChange={setPicking}
        current={emoji}
        title="Choose an emoji"
        onPick={setEmoji}
      />
    </div>
  );
}

import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { isTouchDevice } from '@/lib/media';
import { GROUPS, search, type Entry, type Group } from './emojiData';
import { getRecent } from './recent';

/** The emoji that stands for each group in the jump bar. */
const ICONS: Record<string, string> = {
  'Recently used': '🕘',
  'Smileys & emotion': '😀',
  'People & body': '👋',
  'Animals & nature': '🐻',
  'Food & drink': '🍔',
  'Travel & places': '✈️',
  Activities: '⚽',
  Objects: '💡',
  Symbols: '💟',
  Flags: '🏁',
};

/** Arrow keys move through the grid of emoji buttons, row by row. */
function onGridKeys(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-emoji]')];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const here = buttons[i]!;
  const sameRow = (b: HTMLElement) => Math.abs(b.offsetTop - here.offsetTop) < 4;
  let next = i;
  if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
  else if (e.key === 'ArrowRight') next = Math.min(buttons.length - 1, i + 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = buttons.length - 1;
  else {
    // The button in the next (or previous) row closest to this column.
    const step = e.key === 'ArrowDown' ? 1 : -1;
    let j = i + step;
    while (j >= 0 && j < buttons.length && sameRow(buttons[j]!)) j += step;
    if (j < 0 || j >= buttons.length) return;
    const row = buttons[j]!.offsetTop;
    let best = j;
    for (
      let k = j;
      k >= 0 && k < buttons.length && Math.abs(buttons[k]!.offsetTop - row) < 4;
      k += step
    ) {
      if (
        Math.abs(buttons[k]!.offsetLeft - here.offsetLeft) <
        Math.abs(buttons[best]!.offsetLeft - here.offsetLeft)
      )
        best = k;
    }
    next = best;
  }
  buttons[next]!.focus();
  buttons[next]!.scrollIntoView({ block: 'nearest' });
}

function EmojiButton({
  emoji,
  label,
  current,
  tabbable,
  onPick,
}: {
  emoji: string;
  label: string;
  current: boolean;
  /** The grid's one Tab stop; arrow keys do the rest. */
  tabbable: boolean;
  onPick: (emoji: string) => void;
}) {
  return (
    <button
      type="button"
      data-emoji={emoji}
      aria-label={label}
      title={label}
      aria-pressed={current}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onPick(emoji)}
      className={cn(
        'flex aspect-square items-center justify-center rounded-xl text-[26px] leading-none outline-offset-0',
        'transition-[background-color,transform] duration-150 ease-out-quint hover:bg-muted motion-safe:active:scale-90',
        current && 'bg-brand/12 ring-1 ring-inset ring-brand-text/40',
      )}
    >
      {emoji}
    </button>
  );
}

const nameOf = (e: Entry) => e[1].charAt(0).toUpperCase() + e[1].slice(1);

/** Every emoji, searchable, with what you used lately on top. */
export default function EmojiPicker({
  current,
  onPick,
}: {
  current: string | null;
  onPick: (emoji: string) => void;
}) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const recent = useMemo(() => {
    const all = new Map(GROUPS.flatMap((g) => g.emojis.map((e) => [e[0], e] as const)));
    return getRecent()
      .map((e) => all.get(e))
      .filter((e): e is Entry => Boolean(e));
  }, []);
  const sections = useMemo<Group[]>(
    () => (recent.length ? [{ name: 'Recently used', emojis: recent }, ...GROUPS] : GROUPS),
    [recent],
  );
  const results = useMemo(() => search(query), [query]);
  const searching = query.trim().length > 0;

  // On a keyboard device, typing to search is the fastest way in.
  useEffect(() => {
    if (!isTouchDevice()) input.current?.focus();
  }, []);

  // Light up the group you're scrolling through in the jump bar.
  useEffect(() => {
    const root = scroller.current;
    if (!root || searching || typeof IntersectionObserver === 'undefined') return;
    const heads = [...root.querySelectorAll<HTMLElement>('[data-section]')];
    const observer = new IntersectionObserver(
      () => {
        const top = root.getBoundingClientRect().top;
        let index = 0;
        heads.forEach((h, i) => {
          if (h.getBoundingClientRect().top - top <= 8) index = i;
        });
        setActive(index);
      },
      { root, threshold: [0, 1] },
    );
    heads.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [searching, sections]);

  function jump(index: number) {
    setQuery('');
    requestAnimationFrame(() => {
      const head = scroller.current?.querySelectorAll<HTMLElement>('[data-section]')[index];
      if (head && scroller.current) scroller.current.scrollTop = head.offsetTop;
      setActive(index);
    });
  }

  function firstEmoji() {
    return scroller.current?.querySelector<HTMLButtonElement>('[data-emoji]') ?? null;
  }

  const grid = 'grid grid-cols-8 gap-0.5 sm:grid-cols-9';

  return (
    <div className="flex flex-col gap-2.5">
      <label className="relative block">
        <span className="sr-only">Search emoji</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Search emoji"
          enterKeyHint="done"
          onChange={(e) => {
            setQuery(e.target.value);
            if (scroller.current) scroller.current.scrollTop = 0;
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              firstEmoji()?.focus();
            } else if (e.key === 'Enter' && searching && results[0]) {
              e.preventDefault();
              onPick(results[0][0]);
            }
          }}
          className="h-11 w-full rounded-xl bg-muted pl-9 pr-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-text/50 md:h-10 md:text-sm"
        />
      </label>

      {!searching ? (
        <div
          className="no-scrollbar -mx-1 flex gap-0.5 overflow-x-auto px-1"
          role="toolbar"
          aria-label="Emoji groups"
        >
          {sections.map((s, i) => (
            <button
              key={s.name}
              type="button"
              aria-label={s.name}
              title={s.name}
              onClick={() => jump(i)}
              className={cn(
                'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-lg transition-[background-color,opacity] duration-150',
                i === active ? 'bg-muted opacity-100' : 'opacity-55 hover:opacity-100',
              )}
            >
              {ICONS[s.name] ?? '•'}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={scroller}
        onKeyDown={onGridKeys}
        className="relative h-[min(52dvh,22rem)] overflow-y-auto overscroll-contain"
        aria-label={searching ? 'Search results' : 'Emoji'}
        role="group"
      >
        {searching ? (
          results.length ? (
            <div className={grid}>
              {results.map((e, i) => (
                <EmojiButton
                  key={e[0]}
                  emoji={e[0]}
                  label={nameOf(e)}
                  current={e[0] === current}
                  tabbable={i === 0}
                  onPick={onPick}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No emoji found</p>
          )
        ) : (
          sections.map((s, si) => (
            <section
              key={s.name}
              aria-label={s.name}
              className="[contain-intrinsic-size:auto_20rem] [content-visibility:auto]"
            >
              <h3
                data-section
                className="sticky top-0 z-10 bg-background/95 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm"
              >
                {s.name}
              </h3>
              <div className={grid}>
                {s.emojis.map((e, i) => (
                  <EmojiButton
                    key={`${s.name}-${e[0]}`}
                    emoji={e[0]}
                    label={nameOf(e)}
                    current={e[0] === current}
                    tabbable={si === 0 && i === 0}
                    onPick={onPick}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

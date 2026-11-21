import { useMutation } from '@apollo/client';
import { Check, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Segmented } from '@/components/Segmented';
import { cn } from '@/lib/cn';
import { SET_CHAT_THEME, SET_MEMBER_COLOR, type Conversation } from '@/lib/gql';
import { exit, spring } from '@/lib/motion';
import { useViewer } from '../session/ViewerProvider';
import { ACCENTS, BUBBLES, DOODLES, MEMBER_COLORS, WALLS, type BubbleStyle } from './catalog';
import { ChatWallpaper, WallpaperLayer } from './ChatWallpaper';
import { PRESETS } from './presets';
import {
  customFrom,
  parseTheme,
  sameTheme,
  serializeTheme,
  themeSpec,
  type ThemeSpec,
} from './recipe';
import { textOn } from './color';
import { assignMemberColors, fillCss, memberVars, themeVars } from './resolve';

type Tab = 'themes' | 'custom' | 'color';

const messageOf = (err: unknown) =>
  (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
  'Couldn’t save. Try again.';

const firstName = (name: string) => name.split(' ')[0] ?? name;

/** Props that theme a box like a chat: the theme's colours, bubble style and wallpaper tones. */
const themed = (spec: ThemeSpec) => ({
  'data-chat-theme': spec.classic ? undefined : spec.id,
  'data-bubble-style': spec.bubble,
  style: themeVars(spec) as CSSProperties,
});

/**
 * Picks the chat's theme (everyone in it sees it) and, in groups, your own colour there. What you
 * pick shows straight away in the preview and in the chat behind (`onTry`); nothing is saved
 * until you press the button.
 */
export function ThemeSheet({
  conversation,
  open,
  onOpenChange,
  onTry,
}: {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The theme being tried, for the chat behind the sheet (null: the saved one). */
  onTry: (spec: ThemeSpec | null) => void;
}) {
  const viewer = useViewer();
  const group = conversation.type === 'GROUP';
  const saved = useMemo(() => themeSpec(parseTheme(conversation.theme)), [conversation.theme]);
  const savedColor = conversation.memberColors.find((m) => m.userId === viewer.id)?.color ?? null;
  const [tab, setTab] = useState<Tab>('themes');
  const [draft, setDraft] = useState(saved);
  const [color, setColor] = useState<string | null>(savedColor);
  const [saving, setSaving] = useState(false);
  const [setTheme] = useMutation(SET_CHAT_THEME);
  const [setMemberColor] = useMutation(SET_MEMBER_COLOR);

  // Each time it opens, start from what the chat has now.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(saved);
      setColor(savedColor);
      setTab('themes');
    }
    wasOpen.current = open;
  }, [open, saved, savedColor]);

  // The pinned preview gets its hairline once the options scroll under it.
  const [stuck, setStuck] = useState(false);
  const unpin = useRef<(() => void) | null>(null);
  const pinned = useCallback((node: HTMLDivElement | null) => {
    unpin.current?.();
    unpin.current = null;
    const scroller = node?.parentElement?.closest<HTMLElement>('.overflow-y-auto');
    if (!scroller) return;
    const onScroll = () => setStuck(scroller.scrollTop > 4);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    unpin.current = () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  const themeChanged = !sameTheme(draft, saved);
  const colorChanged = group && color !== savedColor;
  useEffect(() => {
    if (open) onTry(themeChanged ? draft : null);
  }, [open, draft, themeChanged, onTry]);

  async function save() {
    if (!themeChanged && !colorChanged) return onOpenChange(false);
    setSaving(true);
    try {
      if (themeChanged)
        await setTheme({
          variables: { conversationId: conversation.id, theme: serializeTheme(draft) },
        });
      if (colorChanged)
        await setMemberColor({ variables: { conversationId: conversation.id, color } });
      onOpenChange(false);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  const others = conversation.members.filter((m) => m.id !== viewer.id);
  const autoColors = useMemo(
    () =>
      assignMemberColors(
        conversation.members.map((m) => m.id),
        conversation.memberColors,
        draft.accent,
      ),
    [conversation.members, conversation.memberColors, draft.accent],
  );
  const sample = others[0];
  const sampleColor = group && sample ? autoColors.get(sample.id) : undefined;
  // Your automatic colour ignores what you picked for yourself.
  const myAuto =
    assignMemberColors(
      conversation.members.map((m) => m.id),
      conversation.memberColors.filter((m) => m.userId !== viewer.id),
      draft.accent,
    ).get(viewer.id) ?? MEMBER_COLORS[0]!.id;

  const label =
    themeChanged && colorChanged
      ? 'Save'
      : themeChanged
        ? 'Set theme'
        : colorChanged
          ? 'Save my colour'
          : 'Done';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Chat theme"
      description={
        group
          ? `Everyone in ${conversation.title} sees it.`
          : `You and ${firstName(conversation.title)} both see it.`
      }
      className="md:max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {/* The preview and tabs stay put while the options scroll under them, so whatever you
            pick further down is still shown. The hairline appears once something is beneath. */}
        <div
          ref={pinned}
          data-stuck={stuck || undefined}
          className={cn(
            'sticky -top-2 z-10 -mx-5 -mt-2 flex flex-col gap-3 bg-background px-5 pb-3 pt-2',
            'border-b border-transparent transition-[border-color] duration-200',
            'data-[stuck]:border-border',
          )}
        >
          <MiniChat
            spec={draft}
            sampleName={group && sample ? firstName(sample.displayName) : undefined}
            sampleStyle={
              sampleColor ? (memberVars(draft, sampleColor) as CSSProperties) : undefined
            }
          />

          <Segmented<Tab>
            kind="tabs"
            label="Theme options"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'themes', label: 'Themes' },
              { value: 'custom', label: 'Custom' },
              ...(group ? [{ value: 'color' as const, label: 'Your colour' }] : []),
            ]}
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            role="tabpanel"
            aria-label={tab === 'themes' ? 'Themes' : tab === 'custom' ? 'Custom' : 'Your colour'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exit.fast }}
            transition={spring.soft}
          >
            {tab === 'themes' ? (
              <PresetGrid value={draft} onChange={setDraft} />
            ) : tab === 'custom' ? (
              <CustomBuilder value={draft} onChange={setDraft} />
            ) : (
              <ColorPicker
                spec={draft}
                value={color}
                auto={myAuto}
                onChange={setColor}
                name={viewer.displayName}
                avatar={viewer.avatar}
                avatarColor={viewer.avatarColor}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 flex justify-end gap-2 border-t border-border bg-background px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} data-theme-save>
            {label}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** A little chat in the theme: the wallpaper, a bubble each way, a reply and the message box. */
function MiniChat({
  spec,
  sampleName,
  sampleStyle,
}: {
  spec: ThemeSpec;
  sampleName?: string;
  sampleStyle?: CSSProperties;
}) {
  return (
    <div
      {...themed(spec)}
      aria-label={`Preview of the ${spec.label} theme`}
      role="img"
      className="relative overflow-hidden rounded-2xl ring-1 ring-border"
    >
      <div
        data-chat-wall
        className="relative isolate flex flex-col gap-1 bg-background px-3 pb-3 pt-3"
      >
        <ChatWallpaper spec={spec} />
        <span className="mx-auto mb-1 rounded-full bg-background/85 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-border max-sm:hidden">
          Today
        </span>
        <div
          data-member={sampleStyle ? '' : undefined}
          style={sampleStyle}
          className="flex flex-col items-start gap-0.5"
        >
          {sampleName ? (
            <span className="px-3 text-[11px] font-medium text-[var(--member-name)]">
              {sampleName}
            </span>
          ) : null}
          <span
            data-bubble
            className="rounded-[18px] bg-bubble px-3 py-1.5 text-[13px] text-bubble-foreground transition-colors duration-300"
          >
            Saturday still on? <span className="text-brand-text underline">trail.map</span>
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span
            data-bubble
            className="rounded-[18px] rounded-br-md bg-mine px-3 py-1.5 text-[13px] text-mine-foreground transition-colors duration-300"
          >
            Yes! Bringing snacks
          </span>
          <span
            data-bubble
            className="rounded-[18px] rounded-tr-md bg-mine px-3 py-1.5 text-[13px] text-mine-foreground transition-colors duration-300"
          >
            See you at 7 ✨
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-3 pr-1 shadow-sm">
          <span className="flex-1 text-[13px] text-muted-foreground">Message</span>
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand text-brand-foreground transition-colors duration-300">
            <svg
              viewBox="0 0 16 16"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Arrow keys move between options of a radio grid; the chosen one is the Tab stop. */
function gridKeys(e: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  // Columns: how many options share the first row.
  const top = items[0]!.offsetTop;
  const cols = Math.max(1, items.filter((el) => el.offsetTop === top).length);
  const step =
    e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : cols;
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? items.length - 1
        : Math.min(items.length - 1, Math.max(0, i + step));
  items[next]?.focus();
  items[next]?.click();
}

function PresetGrid({ value, onChange }: { value: ThemeSpec; onChange: (s: ThemeSpec) => void }) {
  const specs = useMemo(() => PRESETS.map((p) => themeSpec({ v: 1, preset: p.id })), []);
  const current = value.id;
  const anyChecked = specs.some((s) => s.id === current);
  return (
    <div
      role="radiogroup"
      aria-label="Themes"
      onKeyDown={gridKeys}
      className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4"
    >
      {specs.map((spec, i) => {
        const on = spec.id === current;
        return (
          <button
            key={spec.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!anyChecked && i === 0) ? 0 : -1}
            onClick={() => onChange(spec)}
            data-theme-preset={spec.id}
            className="group flex flex-col gap-1.5 rounded-2xl text-left outline-offset-4"
          >
            <ThemeSwatch spec={spec} selected={on} />
            <span
              className={cn(
                'truncate px-1 text-[13px] leading-4',
                on ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
              )}
            >
              {spec.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A small tile of a theme: its wallpaper with a bubble each way. */
function ThemeSwatch({ spec, selected }: { spec: ThemeSpec; selected: boolean }) {
  return (
    <span
      {...themed(spec)}
      className={cn(
        'relative block h-[72px] overflow-hidden rounded-xl ring-1 transition-[box-shadow,transform] duration-200 ease-out-quint',
        'motion-safe:group-active:scale-[0.97]',
        selected
          ? 'ring-2 ring-[var(--select-ring)]'
          : 'ring-border group-hover:ring-[color-mix(in_srgb,var(--foreground)_25%,transparent)]',
      )}
    >
      <span
        data-chat-wall
        className="absolute inset-0 isolate flex flex-col justify-center gap-1.5 bg-background px-2.5"
      >
        <WallpaperLayer spec={spec} scale={0.42} />
        <span data-bubble className="block h-3.5 w-3/5 rounded-full bg-bubble" />
        <span data-bubble className="ml-auto block h-3.5 w-1/2 rounded-full bg-mine" />
      </span>
      <AnimatePresence>
        {selected ? (
          <motion.span
            className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0, transition: exit.fast }}
            transition={spring.pop}
          >
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function CustomBuilder({
  value,
  onChange,
}: {
  value: ThemeSpec;
  onChange: (s: ThemeSpec) => void;
}) {
  // The custom tab starts from whatever is chosen (a preset becomes its custom twin).
  const set = (patch: Partial<ThemeSpec>) => onChange(customFrom(value, patch));
  const base = value.classic ? customFrom(value) : value;
  return (
    <div className="flex flex-col gap-5">
      <Section title="Accent">
        <div
          role="radiogroup"
          aria-label="Accent"
          onKeyDown={gridKeys}
          className="flex flex-wrap gap-2"
        >
          {ACCENTS.map((a) => {
            const on = !value.classic && value.accent === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a.label}
                title={a.label}
                tabIndex={on || (value.classic && a.id === 'indigo') ? 0 : -1}
                onClick={() => set({ accent: a.id })}
                data-swatch
                className={cn(
                  'relative inline-flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-200 ease-out-quint motion-safe:active:scale-90',
                  on
                    ? 'ring-2 ring-[var(--select-ring)]'
                    : 'ring-1 ring-black/10 dark:ring-white/15',
                )}
                style={
                  {
                    '--sw-l': a.light,
                    '--sw-d': a.dark,
                    '--sw-on-l': textOn(a.light),
                    '--sw-on-d': textOn(a.dark),
                  } as CSSProperties
                }
              >
                {on ? <Check className="size-4" strokeWidth={3} /> : null}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Wallpaper">
        <div
          role="radiogroup"
          aria-label="Wallpaper"
          onKeyDown={gridKeys}
          className="grid grid-cols-6 gap-2 sm:grid-cols-7"
        >
          {WALLS.map((w) => {
            const on = !value.classic && value.wall === w.id;
            return (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={w.label}
                title={w.label}
                tabIndex={on || (value.classic && w.id === 'plain') ? 0 : -1}
                onClick={() => set({ wall: w.id })}
                data-wall-swatch
                className={cn(
                  'relative h-11 rounded-xl transition-[box-shadow,transform] duration-200 ease-out-quint motion-safe:active:scale-95',
                  on
                    ? 'ring-2 ring-[var(--select-ring)] ring-offset-2 ring-offset-background'
                    : 'ring-1 ring-border',
                )}
                style={{ '--lw': fillCss(w.light), '--dw': fillCss(w.dark) } as CSSProperties}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Doodles">
        <div
          role="radiogroup"
          aria-label="Doodles"
          onKeyDown={gridKeys}
          className="grid grid-cols-4 gap-2 sm:grid-cols-6"
        >
          {DOODLES.map((d) => {
            const on = !value.classic && value.doodle === d.id;
            const spec = { ...base, doodle: d.id, classic: false };
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (value.classic && d.id === 'none') ? 0 : -1}
                onClick={() => set({ doodle: d.id })}
                className="group flex flex-col items-center gap-1 rounded-xl outline-offset-2"
              >
                <span
                  {...themed(spec)}
                  className={cn(
                    'relative block h-12 w-full overflow-hidden rounded-xl transition-[box-shadow] duration-200',
                    on ? 'ring-2 ring-[var(--select-ring)]' : 'ring-1 ring-border',
                  )}
                >
                  <span data-chat-wall className="absolute inset-0 isolate bg-background">
                    <WallpaperLayer spec={spec} scale={0.5} boost={2.2} />
                  </span>
                </span>
                <span
                  className={cn(
                    'text-[11px] leading-3',
                    on ? 'font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {d.label}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Bubbles">
        <Segmented<BubbleStyle>
          kind="radio"
          label="Bubble style"
          value={value.classic ? 'solid' : value.bubble}
          onChange={(bubble) => set({ bubble })}
          options={BUBBLES.map((b) => ({ value: b.id, label: b.label }))}
        />
      </Section>
    </div>
  );
}

function ColorPicker({
  spec,
  value,
  auto,
  onChange,
  name,
  avatar,
  avatarColor,
}: {
  spec: ThemeSpec;
  /** The colour you picked, or null for automatic. */
  value: string | null;
  /** Your automatic colour. */
  auto: string;
  onChange: (color: string | null) => void;
  name: string;
  avatar: string | null | undefined;
  avatarColor: string;
}) {
  const shown = value ?? auto;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        How your name and bubbles look to everyone else in this group. Your own bubbles stay in the
        theme’s colour for you.
      </p>
      <div
        {...themed(spec)}
        className="relative overflow-hidden rounded-2xl ring-1 ring-border"
        aria-hidden
      >
        <div
          data-chat-wall
          className="relative isolate flex items-end gap-2 bg-background px-3 py-3"
        >
          <WallpaperLayer spec={spec} scale={0.6} />
          <Avatar name={name} avatar={avatar} color={avatarColor} size="sm" />
          <div
            data-member
            style={memberVars(spec, shown) as CSSProperties}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="px-3 text-[11px] font-medium text-[var(--member-name)] transition-colors duration-300">
              {name}
            </span>
            <span
              data-bubble
              className="rounded-[18px] bg-bubble px-3 py-1.5 text-[13px] text-bubble-foreground transition-colors duration-300"
            >
              Hi everyone 👋
            </span>
          </div>
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label="Your colour"
        onKeyDown={gridKeys}
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          tabIndex={value === null ? 0 : -1}
          onClick={() => onChange(null)}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-[box-shadow,background-color] duration-200',
            value === null
              ? 'bg-muted text-foreground ring-2 ring-[var(--select-ring)]'
              : 'bg-muted/60 text-muted-foreground ring-1 ring-border hover:text-foreground',
          )}
        >
          <Sparkles className="size-3.5" />
          Automatic
        </button>
        {MEMBER_COLORS.map((c) => {
          const on = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.label}
              title={c.label}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(c.id)}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-200 ease-out-quint motion-safe:active:scale-90',
                on ? 'ring-2 ring-[var(--select-ring)]' : 'ring-1 ring-black/10 dark:ring-white/15',
              )}
              style={{ background: c.color }}
            >
              {on ? <Check className="size-4 text-white drop-shadow" strokeWidth={3} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

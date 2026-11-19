import {
  ArrowLeft,
  Check,
  CircleUserRound,
  Dices,
  Eye,
  Frame,
  LayoutTemplate,
  Palette,
  PenLine,
  SmilePlus,
  Sticker as StickerIcon,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, buttonClass } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { Skeleton } from '@/components/Skeleton';
import { Switch } from '@/components/Switch';
import { cn } from '@/lib/cn';
import { useScrollEdges } from '@/lib/scrollEdges';
import { isEditable, modKey } from '@/lib/keys';
import { DESKTOP_QUERY } from '@/lib/media';
import { exit, spring } from '@/lib/motion';
import { EmojiPickerDialog } from '../chat/reactions/EmojiPickerDialog';
import { useViewer } from '../session/ViewerProvider';
import {
  ACCENTS,
  BACKGROUNDS,
  BORDER_COLORS,
  BORDERS,
  BUTTONS,
  CHIPS,
  colorHex,
  CORNERS,
  DIVIDERS,
  FINISHES,
  FONTS,
  FRAME_BGS,
  FRAMES,
  INKS,
  LAYOUTS,
  PATTERN_TONES,
  PATTERNS,
  RINGS,
  type Option,
  type StyleKey,
} from './catalog';
import { CardAvatar } from './CardAvatar';
import { CardDialog } from './CardDialog';
import { CardView, interestEmoji, interestLabel, type CardUser } from './CardView';
import { BorderLayer, buttonStyle, Divider, faceMask, FinishLayer, SketchBox } from './decor';
import { preloadCardFonts } from './fonts';
import { InterestPicker } from './InterestPicker';
import { Pattern } from './patterns';
import {
  ABOUT_LINES,
  ABOUT_MAX,
  charCount,
  randomStyle,
  serializeCard,
  STICKER_SCALE,
  STICKERS_MAX,
  tidySticker,
  type CardRecipe,
  type Sticker,
} from './recipe';
import { StickerEditor, stickerLabel } from './StickerEditor';
import { StickerArt, STICKER_IDS, STICKERS } from './stickers';
import { CARD_H, CARD_W, cardTheme, type CardTheme } from './theme';
import { useCardDraft } from './useCardDraft';
import { useMyCard } from './useMyCard';

type TabId = 'about' | 'stickers' | 'colors' | 'border' | 'layout' | 'avatar' | 'font';

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'about', label: 'About', icon: PenLine },
  { id: 'stickers', label: 'Stickers', icon: StickerIcon },
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'border', label: 'Border', icon: Frame },
  { id: 'layout', label: 'Layout', icon: LayoutTemplate },
  { id: 'avatar', label: 'Avatar', icon: CircleUserRound },
  { id: 'font', label: 'Font', icon: Type },
];

// ---------------------------------------------------------------------------------------------
// Keyboard: arrow keys move through a radio group, in two dimensions when it wraps into a grid
// ---------------------------------------------------------------------------------------------

function onRadioKeys(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const i = radios.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0 || radios.length === 0) return;
  e.preventDefault();
  const top = radios[0]!.offsetTop;
  const firstWrap = radios.findIndex((r) => r.offsetTop !== top);
  const cols = firstWrap > 0 ? firstWrap : radios.length;
  const last = radios.length - 1;
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? last
        : e.key === 'ArrowLeft'
          ? (i - 1 + radios.length) % radios.length
          : e.key === 'ArrowRight'
            ? (i + 1) % radios.length
            : e.key === 'ArrowUp'
              ? Math.max(0, i - cols)
              : Math.min(last, i + cols);
  radios[next]!.focus();
  radios[next]!.click();
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

function SectionTitle({
  id,
  children,
  aside,
}: {
  id: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-sm font-semibold tracking-tight">
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** A radio group of picture tiles. */
function Tiles({
  title,
  options,
  value,
  onPick,
  render,
  className = 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-6',
  tile = 'aspect-[2/3]',
}: {
  title: string;
  options: readonly Option[];
  value: string;
  onPick: (id: string) => void;
  render: (id: string) => ReactNode;
  className?: string;
  tile?: string;
}) {
  const headingId = useId();
  return (
    <section>
      <SectionTitle id={headingId}>{title}</SectionTitle>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        onKeyDown={onRadioKeys}
        className={cn('grid gap-2.5', className)}
      >
        {options.map((o) => {
          const selected = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onPick(o.id)}
              className="group flex min-w-0 flex-col items-center gap-1.5 outline-offset-4"
            >
              <span
                className={cn(
                  'relative w-full rounded-2xl bg-muted dark:bg-border/80',
                  'transition-[background-color,transform] duration-200 ease-out-quint group-hover:bg-border/60 motion-safe:group-active:scale-95 dark:group-hover:bg-border',
                  tile,
                )}
              >
                {selected ? (
                  <motion.span
                    layoutId={`card-${headingId}`}
                    aria-hidden
                    className="absolute -inset-[3px] rounded-[1.15rem] ring-2 ring-brand-text"
                    transition={spring.snappy}
                  />
                ) : null}
                <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl">
                  {render(o.id)}
                </span>
              </span>
              <span
                className={cn(
                  'max-w-full truncate text-xs',
                  selected ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** A row of round colour swatches. `fill` is any CSS background. */
function Swatches({
  title,
  options,
  value,
  onPick,
  fill,
}: {
  title: string;
  options: readonly Option[];
  value: string;
  onPick: (id: string) => void;
  fill: (id: string) => string;
}) {
  const headingId = useId();
  return (
    <section>
      <SectionTitle id={headingId}>{title}</SectionTitle>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        onKeyDown={onRadioKeys}
        className="flex flex-wrap gap-2.5"
      >
        {options.map((o) => {
          const selected = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.label}
              title={o.label}
              tabIndex={selected ? 0 : -1}
              onClick={() => onPick(o.id)}
              className="relative inline-flex size-10 items-center justify-center rounded-full outline-offset-4 transition-transform duration-200 ease-out-quint motion-safe:hover:scale-105 motion-safe:active:scale-95"
            >
              {selected ? (
                <motion.span
                  layoutId={`swatch-${headingId}`}
                  aria-hidden
                  className="absolute -inset-0.5 rounded-full ring-2 ring-foreground"
                  transition={spring.snappy}
                />
              ) : null}
              <span
                aria-hidden
                className="size-9 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
                style={{ background: fill(o.id) }}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

const MINI_W = 132;
const MINI_H = 200;

/** A card's surface only (background, pattern, border, finish), small, for option tiles. */
function MiniFace({ card }: { card: CardRecipe }) {
  const theme = cardTheme(card);
  const tone = card.patternTone;
  return (
    // Sized by the tile's height and centred across its width, whatever shape the tile is.
    <div className="absolute inset-x-0 inset-y-[12%]" style={{ containerType: 'size' }}>
      <div
        className="absolute left-1/2 top-0 origin-top-left"
        style={{
          width: MINI_W,
          height: MINI_H,
          transform: `scale(calc(100cqh / ${MINI_H}px)) translateX(-50%)`,
        }}
      >
        <div
          className="relative size-full overflow-hidden shadow-sm"
          style={{
            borderRadius: theme.radius * 0.6,
            background: theme.bg.css,
            ...faceMask(card.border, MINI_H * 0.42),
          }}
        >
          {card.pattern !== 'none' ? (
            <Pattern
              id={card.pattern}
              color={tone === 'white' ? '#fff' : tone === 'accent' ? theme.accent : theme.ink}
              opacity={
                tone === 'soft' ? 0.1 : tone === 'bold' ? 0.2 : tone === 'white' ? 0.55 : 0.35
              }
            />
          ) : null}
          <FinishLayer kind={card.finish} theme={theme} />
          <BorderLayer
            kind={card.border}
            theme={{ ...theme, radius: theme.radius * 0.6 }}
            width={MINI_W}
            height={MINI_H}
            ticketY={MINI_H * 0.42}
          />
        </div>
      </div>
    </div>
  );
}

/** The card at a size that fits the box it's in, whatever its shape. */
/** Room kept under the studio's card for the status line (its height plus the gap). */
const BELOW_H = 34;

function FitCard({
  className,
  children,
  below,
}: {
  className?: string;
  children: (width: number) => ReactNode;
  /** Shown right under the card (its room is kept free when sizing the card). */
  below?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const reserve = below ? BELOW_H : 0;
  const width = Math.floor(Math.min(size.w, ((size.h - reserve) * CARD_W) / CARD_H, 360));
  return (
    <div ref={ref} className={cn('flex flex-col items-center justify-center gap-1.5', className)}>
      {width > 40 ? children(width) : null}
      {below}
    </div>
  );
}

const sample = (theme: CardTheme, kind: string) => (
  <span
    className="relative inline-flex items-center justify-center text-[10px] font-bold"
    style={{
      ...buttonStyle(kind, theme),
      width: 76,
      height: 26,
      borderRadius: kind === 'pill' ? 999 : kind === 'sketch' ? 0 : 8,
    }}
  >
    {kind === 'sketch' ? <SketchBox width={76} height={26} color={theme.ink} /> : null}
    <span className="relative">Message</span>
  </span>
);

// ---------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------

interface TabProps {
  card: CardRecipe;
  user: CardUser;
  set: (key: StyleKey, id: string) => void;
  change: ReturnType<typeof useCardDraft>['change'];
}

function AboutTab({ card, change, aboutFits }: TabProps & { aboutFits: boolean }) {
  const id = useId();
  const count = charCount(card.about);
  return (
    <>
      <section>
        <SectionTitle
          id={`${id}-about`}
          aside={
            <span
              className={cn(
                'text-xs tabular-nums',
                count >= ABOUT_MAX ? 'text-danger' : 'text-muted-foreground',
              )}
            >
              {count}/{ABOUT_MAX}
            </span>
          }
        >
          About me
        </SectionTitle>
        <textarea
          aria-labelledby={`${id}-about`}
          aria-describedby={`${id}-about-hint`}
          value={card.about}
          rows={4}
          placeholder="A line or two about you. What should people message you about?"
          onChange={(e) => {
            let v = e.target.value.replace(/\r\n?/g, '\n');
            const lines = v.split('\n');
            if (lines.length > ABOUT_LINES)
              v = lines.slice(0, ABOUT_LINES).join('\n') + lines.slice(ABOUT_LINES).join(' ');
            v = [...v].slice(0, ABOUT_MAX).join('');
            change((c) => ({ ...c, about: v }), 'about');
          }}
          className={cn(
            'w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-base leading-relaxed shadow-sm outline-none md:text-sm',
            'transition-[border-color,box-shadow] duration-200 ease-out-quint hover:border-muted-foreground/40',
            'focus:border-brand-text/60 focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_12%,transparent)]',
          )}
        />
        <p
          id={`${id}-about-hint`}
          role="status"
          className={cn('mt-1.5 text-[13px]', aboutFits ? 'text-muted-foreground' : 'text-danger')}
        >
          {aboutFits
            ? `Up to ${ABOUT_MAX} characters and ${ABOUT_LINES} lines. Every card is the same size.`
            : 'A little long for this card: the end gets cut off. Shorten it, or try another font.'}
        </p>
      </section>
      <section>
        <InterestPicker
          value={card.interests}
          onChange={(interests) => change((c) => ({ ...c, interests }))}
        />
      </section>
    </>
  );
}

function StickersTab({
  card,
  change,
  selected,
  setSelected,
}: TabProps & { selected: number | null; setSelected: (i: number | null) => void }) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const id = useId();
  const count = card.stickers.length;
  const full = count >= STICKERS_MAX;
  const sel = selected !== null ? card.stickers[selected] : undefined;
  const def = sel?.k !== undefined ? STICKERS[sel.k] : undefined;

  function add(base: { k: string } | { e: string }) {
    if (full) {
      toast(`A card holds up to ${STICKERS_MAX} stickers.`);
      return;
    }
    const s = tidySticker({
      ...base,
      x: 0.5 + (Math.random() - 0.5) * 0.36,
      y: 0.3 + Math.random() * 0.36,
      s: 1,
      r: Math.round((Math.random() - 0.5) * 24),
    } as Sticker);
    change((c) => ({ ...c, stickers: [...c.stickers, s] }));
    setSelected(count);
  }

  const update = (patch: Partial<Sticker>, merge: string) => {
    if (selected === null || !sel) return;
    change(
      (c) => ({
        ...c,
        stickers: c.stickers.map((s, i) =>
          i === selected ? tidySticker({ ...s, ...patch } as Sticker) : s,
        ),
      }),
      merge,
    );
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Tap a sticker to add it, then drag it around the card. The round handle resizes and turns
        it; on a phone you can also pinch and twist.
      </p>

      <AnimatePresence initial={false} mode="popLayout">
        {sel && selected !== null ? (
          <motion.section
            key="selected"
            aria-label="Selected sticker"
            className="space-y-4 rounded-2xl border border-border bg-surface p-4"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: exit.fast }}
            transition={spring.soft}
          >
            <div className="flex items-center gap-3">
              <StickerArt sticker={sel} className="size-10 shrink-0" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{stickerLabel(sel)}</p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  change((c) => ({ ...c, stickers: c.stickers.filter((_, i) => i !== selected) }));
                  setSelected(null);
                }}
              >
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>
            {def?.color ? (
              <Swatches
                title="Color"
                options={ACCENTS.concat({ id: 'white', label: 'White' })}
                value={sel.c ?? def.color}
                onPick={(c) => update({ c }, `color:${selected}`)}
                fill={(c) => colorHex(c)}
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 flex justify-between font-medium">
                  Size{' '}
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(sel.s * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={STICKER_SCALE.min}
                  max={STICKER_SCALE.max}
                  step={0.05}
                  value={sel.s}
                  onChange={(e) => update({ s: Number(e.target.value) }, `size:${selected}`)}
                  className="w-full accent-[var(--brand)]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 flex justify-between font-medium">
                  Turn <span className="tabular-nums text-muted-foreground">{sel.r}°</span>
                </span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={sel.r}
                  onChange={(e) => update({ r: Number(e.target.value) }, `turn:${selected}`)}
                  className="w-full accent-[var(--brand)]"
                />
              </label>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <section>
        <SectionTitle
          id={`${id}-add`}
          aside={
            <span className="text-xs tabular-nums text-muted-foreground">
              {count} of {STICKERS_MAX}
            </span>
          }
        >
          Add a sticker
        </SectionTitle>
        <div
          className="grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-8"
          aria-labelledby={`${id}-add`}
          role="group"
        >
          <button
            type="button"
            onClick={() => setEmojiOpen(true)}
            disabled={full}
            className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <SmilePlus className="size-5" /> Emoji
          </button>
          {STICKER_IDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={`Add ${STICKERS[k]!.label}`}
              title={STICKERS[k]!.label}
              disabled={full}
              onClick={() => add({ k })}
              className="flex aspect-square items-center justify-center rounded-2xl bg-muted p-1.5 transition-[background-color,transform] duration-200 ease-out-quint hover:bg-border/60 disabled:opacity-40 motion-safe:active:scale-90 dark:bg-border/80 dark:hover:bg-border"
            >
              <StickerArt sticker={{ k }} className="size-full" />
            </button>
          ))}
        </div>
      </section>

      {count > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            change((c) => ({ ...c, stickers: [] }));
            setSelected(null);
          }}
        >
          Remove all stickers
        </Button>
      ) : null}

      <EmojiPickerDialog
        open={emojiOpen}
        onOpenChange={setEmojiOpen}
        current={null}
        title="Emoji sticker"
        onPick={(e) => add({ e })}
      />
    </>
  );
}

function ColorsTab({ card, set }: TabProps) {
  const theme = cardTheme(card);
  const solids = BACKGROUNDS.filter((b) => b.kind === 'solid');
  const gradients = BACKGROUNDS.filter((b) => b.kind === 'gradient');
  const bgFill = (id: string) => BACKGROUNDS.find((b) => b.id === id)!.css;
  return (
    <>
      <Swatches
        title="Background"
        options={solids}
        value={card.bg}
        onPick={(id) => set('bg', id)}
        fill={bgFill}
      />
      <Swatches
        title="Gradients"
        options={gradients}
        value={card.bg}
        onPick={(id) => set('bg', id)}
        fill={bgFill}
      />
      <Tiles
        title="Pattern"
        options={PATTERNS}
        value={card.pattern}
        onPick={(id) => set('pattern', id)}
        render={(id) => (
          <MiniFace card={{ ...card, pattern: id, border: 'none', finish: 'matte' }} />
        )}
        className="grid-cols-5 sm:grid-cols-6 lg:grid-cols-8"
      />
      {card.pattern !== 'none' ? (
        <section>
          <SectionTitle id="pattern-tone">Pattern strength</SectionTitle>
          <Segmented
            kind="radio"
            label="Pattern strength"
            value={card.patternTone}
            onChange={(v) => set('patternTone', v)}
            options={PATTERN_TONES.map((o) => ({ value: o.id, label: o.label }))}
          />
        </section>
      ) : null}
      <Swatches
        title="Text color"
        options={INKS}
        value={card.ink}
        onPick={(id) => set('ink', id)}
        fill={(id) =>
          id === 'auto'
            ? `linear-gradient(135deg, ${theme.bg.dark ? '#fafafa' : '#18181b'} 50%, ${theme.bg.css.startsWith('linear') ? theme.bg.base : theme.bg.css} 50%)`
            : colorHex(id)
        }
      />
      <Swatches
        title="Accent"
        options={ACCENTS}
        value={card.accent}
        onPick={(id) => set('accent', id)}
        fill={(id) => colorHex(id)}
      />
    </>
  );
}

function BorderTab({ card, set }: TabProps) {
  const theme = cardTheme(card);
  return (
    <>
      <Tiles
        title="Border"
        options={BORDERS}
        value={card.border}
        onPick={(id) => set('border', id)}
        render={(id) => <MiniFace card={{ ...card, border: id, finish: 'matte' }} />}
      />
      <Swatches
        title="Border and ring color"
        options={BORDER_COLORS}
        value={card.borderColor}
        onPick={(id) => set('borderColor', id)}
        fill={(id) => (id === 'ink' ? theme.ink : id === 'accent' ? theme.accent : colorHex(id))}
      />
      <section>
        <SectionTitle id="corners">Corners</SectionTitle>
        <Segmented
          kind="radio"
          label="Corners"
          value={card.corners}
          onChange={(v) => set('corners', v)}
          options={CORNERS.map((o) => ({ value: o.id, label: o.label }))}
        />
      </section>
      <Tiles
        title="Finish"
        options={FINISHES}
        value={card.finish}
        onPick={(id) => set('finish', id)}
        render={(id) => <MiniFace card={{ ...card, finish: id }} />}
      />
    </>
  );
}

function LayoutTab({ card, user, set, change }: TabProps) {
  const theme = cardTheme(card);
  const chipsCard =
    card.interests.length > 0 ? card : { ...card, interests: ['hiking', 'pizza', 'games'] };
  return (
    <>
      <Tiles
        title="Layout"
        options={LAYOUTS}
        value={card.layout}
        onPick={(id) => set('layout', id)}
        className="grid-cols-4"
        tile="aspect-[3/4]"
        render={(id) => (
          <CardView
            card={{ ...card, layout: id }}
            user={user}
            width={84}
            shadow={false}
            hideStickers
          />
        )}
      />
      <section>
        <SectionTitle id="name-style">Name</SectionTitle>
        <Segmented
          kind="radio"
          label="Name"
          value={card.name}
          onChange={(v) => set('name', v)}
          options={[
            { value: 'username', label: `@${user.username}` },
            { value: 'both', label: 'Name + @username' },
          ]}
        />
      </section>
      <section>
        <SectionTitle id="align">Text alignment</SectionTitle>
        <Segmented
          kind="radio"
          label="Text alignment"
          value={card.align}
          onChange={(v) => set('align', v)}
          options={[
            { value: 'center', label: 'Center' },
            { value: 'left', label: 'Left' },
          ]}
        />
      </section>
      <div className="flex items-center justify-between gap-4">
        <span id="labels-label" className="text-sm font-semibold tracking-tight">
          Section labels
          <span className="block text-xs font-normal text-muted-foreground">
            “Interests” and “About me”
          </span>
        </span>
        <Switch
          checked={card.labels}
          onChange={(labels) => change((c) => ({ ...c, labels }))}
          aria-labelledby="labels-label"
        />
      </div>
      <Tiles
        title="Interests style"
        options={CHIPS}
        value={card.chips}
        onPick={(id) => set('chips', id)}
        className="grid-cols-2 sm:grid-cols-3"
        tile="aspect-[5/2]"
        render={(id) => (
          <span
            className="flex size-full items-center justify-center gap-1 px-2"
            style={{ background: theme.bg.css, color: theme.ink }}
          >
            {id === 'plain' ? (
              <span className="truncate text-xs">
                {chipsCard.interests.slice(0, 2).map(interestLabel).join(', ')}
              </span>
            ) : (
              chipsCard.interests.slice(0, 2).map((it, i) => (
                <span
                  key={i}
                  className="inline-flex h-5 items-center gap-0.5 truncate px-1.5 text-[10px] font-semibold"
                  style={
                    id === 'pill'
                      ? { background: theme.accentWash, borderRadius: 99 }
                      : id === 'outline'
                        ? { boxShadow: `inset 0 0 0 1.25px ${theme.ink}`, borderRadius: 99 }
                        : id === 'tag'
                          ? { color: theme.accentText }
                          : {
                              background: '#fff',
                              color: '#18181b',
                              borderRadius: 5,
                              boxShadow: '0 0 0 1.25px #18181b',
                              transform: `rotate(${i ? 3 : -3}deg)`,
                            }
                  }
                >
                  {id === 'tag' ? (
                    `#${interestLabel(it).toLowerCase().replace(/\s+/g, '')}`
                  ) : (
                    <>
                      {interestEmoji(it)} {interestLabel(it)}
                    </>
                  )}
                </span>
              ))
            )}
          </span>
        )}
      />
      <Tiles
        title="Dividers"
        options={DIVIDERS}
        value={card.divider}
        onPick={(id) => set('divider', id)}
        className="grid-cols-4"
        tile="aspect-[5/2]"
        render={(id) => (
          <span
            className="flex size-full items-center justify-center px-2"
            style={{ background: theme.bg.css }}
          >
            {id === 'none' ? (
              <span className="text-xs" style={{ color: theme.ink, opacity: 0.5 }}>
                None
              </span>
            ) : (
              <Divider kind={id} width={64} theme={theme} />
            )}
          </span>
        )}
      />
      <Tiles
        title="Button"
        options={BUTTONS}
        value={card.button}
        onPick={(id) => set('button', id)}
        className="grid-cols-3 sm:grid-cols-5"
        tile="aspect-[5/3]"
        render={(id) => (
          <span
            className="flex size-full items-center justify-center"
            style={{ background: theme.bg.css, fontFamily: theme.font.family }}
          >
            {sample(theme, id)}
          </span>
        )}
      />
    </>
  );
}

function AvatarTab({ card, user, set }: TabProps) {
  const theme = cardTheme(card);
  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3.5 py-2.5 text-sm">
        <span className="text-muted-foreground">Your card always shows your profile avatar.</span>
        <Link to="/settings/avatar" className={buttonClass('outline', 'sm')}>
          Edit avatar
        </Link>
      </div>
      <Tiles
        title="Frame"
        options={FRAMES}
        value={card.frame}
        onPick={(id) => set('frame', id)}
        tile="aspect-square"
        render={(id) => (
          <span
            className="flex size-full items-center justify-center"
            style={{ background: theme.bg.css }}
          >
            <CardAvatar
              user={user}
              card={{ ...card, frame: id }}
              theme={theme}
              size={id === 'none' ? 64 : 52}
            />
          </span>
        )}
      />
      {card.frame !== 'none' ? (
        <>
          <section>
            <SectionTitle id="frame-bg">Behind your avatar</SectionTitle>
            <Segmented
              kind="radio"
              label="Behind your avatar"
              value={card.frameBg}
              onChange={(v) => set('frameBg', v)}
              options={FRAME_BGS.map((o) => ({ value: o.id, label: o.label }))}
            />
          </section>
          <Tiles
            title="Ring"
            options={RINGS}
            value={card.ring}
            onPick={(id) => set('ring', id)}
            tile="aspect-square"
            render={(id) => (
              <span
                className="flex size-full items-center justify-center"
                style={{ background: theme.bg.css }}
              >
                <CardAvatar user={user} card={{ ...card, ring: id }} theme={theme} size={48} />
              </span>
            )}
          />
          <p className="-mt-3 text-xs text-muted-foreground">
            The ring uses the border color (Border tab).
          </p>
        </>
      ) : null}
    </>
  );
}

function FontTab({ card, set }: TabProps) {
  useEffect(preloadCardFonts, []);
  const theme = cardTheme(card);
  return (
    <Tiles
      title="Font"
      options={FONTS}
      value={card.font}
      onPick={(id) => set('font', id)}
      className="grid-cols-3 sm:grid-cols-4"
      tile="aspect-[4/3]"
      render={(id) => {
        const f = FONTS.find((x) => x.id === id)!;
        return (
          <span
            className="flex size-full items-center justify-center"
            style={{ background: theme.bg.css, color: theme.ink, fontFamily: f.family }}
          >
            <span style={{ fontSize: 26 * f.scale, fontWeight: f.bold, lineHeight: 1 }}>Aa</span>
          </span>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------

function StudioLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy aria-label="Loading your card">
      <div className="h-[calc(4rem+env(safe-area-inset-top))] shrink-0 border-b border-border/80" />
      <div className="flex flex-1 items-center justify-center p-6">
        <Skeleton className="aspect-[320/540] w-48 rounded-2xl md:w-72" />
      </div>
    </div>
  );
}

export function CardStudio() {
  const mine = useMyCard();
  if (mine.loading && !mine.data) return <StudioLoading />;
  return <Studio savedRaw={mine.data?.recipe ?? null} save={mine.save} saving={mine.saving} />;
}

function Studio({
  savedRaw,
  save,
  saving,
}: {
  savedRaw: string | null;
  save: ReturnType<typeof useMyCard>['save'];
  saving: boolean;
}) {
  const viewer = useViewer();
  const draft = useCardDraft(viewer.id, savedRaw);
  const { card, change, undo } = draft;
  const [tab, setTab] = useState<TabId>('about');
  const [selected, setSelected] = useState<number | null>(null);
  const [aboutFits, setAboutFits] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // On a phone, typing shrinks the preview so the keyboard doesn't bury the text box.
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(typingTimer.current), []);
  const tabsId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const tabStrip = useRef<HTMLDivElement>(null);
  useScrollEdges(tabStrip);
  const user = useMemo<CardUser>(
    () => ({
      username: viewer.username,
      displayName: viewer.displayName,
      avatar: viewer.avatar,
      avatarColor: viewer.avatarColor,
    }),
    [viewer.username, viewer.displayName, viewer.avatar, viewer.avatarColor],
  );

  const set = useCallback(
    (key: StyleKey, id: string) => change((c) => ({ ...c, [key]: id })),
    [change],
  );

  // A selection that no longer exists (undo, remove) is dropped.
  useEffect(() => {
    if (selected !== null && selected >= card.stickers.length) setSelected(null);
  }, [selected, card.stickers.length]);

  // ⌘/Ctrl+Z steps back through your changes (text fields keep their own undo).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'z' || isEditable(e.target)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  useEffect(() => {
    tabRefs.current
      .get(tab)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [tab]);

  const onStickerChange = useCallback(
    (index: number, sticker: Sticker, merge?: string) =>
      change(
        (c) => ({ ...c, stickers: c.stickers.map((s, i) => (i === index ? sticker : s)) }),
        merge,
      ),
    [change],
  );
  const onStickerRemove = useCallback(
    (index: number) => {
      change((c) => ({ ...c, stickers: c.stickers.filter((_, i) => i !== index) }));
      setSelected(null);
    },
    [change],
  );
  const onStickerFront = useCallback(
    (index: number) => {
      change((c) => {
        const s = c.stickers[index];
        if (!s) return c;
        return { ...c, stickers: [...c.stickers.filter((_, i) => i !== index), s] };
      });
      setSelected(card.stickers.length - 1);
    },
    [change, card.stickers.length],
  );
  const onStickerSelect = useCallback((i: number | null) => {
    setSelected(i);
    if (i !== null) setTab('stickers');
  }, []);

  async function onSave() {
    try {
      await save({ recipe: serializeCard(card) });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      toast.success('Card saved');
    } catch (err) {
      toast.error(
        (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
          'Couldn’t save your card. Try again.',
      );
    }
  }

  function onTabKeys(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const n = TABS.length;
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? n - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    const t = TABS[next]!;
    setTab(t.id);
    tabRefs.current.get(t.id)?.focus();
  }

  const tabProps: TabProps = { card, user, set, change };

  // Unsaved changes (or a hint), right under the card.
  const status = (
    <div
      className={cn(
        'h-7 shrink-0 items-center text-sm',
        // Phones only show it when there's something to act on.
        draft.dirty && !typing ? 'flex' : 'hidden md:flex',
      )}
      aria-live="polite"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {draft.dirty ? (
          <motion.p
            key="dirty"
            className="flex items-center gap-1.5 text-muted-foreground"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exit.fast }}
            transition={spring.soft}
          >
            {draft.restored ? 'Picked up where you left off' : 'Unsaved changes'}
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={draft.discard}
              className="rounded-md px-1 font-medium text-brand-text hover:underline"
            >
              Discard
            </button>
          </motion.p>
        ) : (
          <motion.p
            key="hint"
            className="truncate text-muted-foreground"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exit.fast }}
            transition={spring.soft}
          >
            Every card is the same size
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="z-10 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-0.5 border-b border-border/80 bg-background/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md md:px-4">
        <Link
          to="/settings"
          aria-label="Back to settings"
          className="inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted md:size-9"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate px-1 text-[17px] font-semibold tracking-tight md:px-1.5">
          Card
        </h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo"
          title={`Undo (${modKey()} Z)`}
          disabled={!draft.canUndo}
          onClick={undo}
        >
          <Undo2 className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Randomize the look"
          title="Randomize the look (keeps your words and stickers)"
          onClick={() => change((c) => randomStyle(c))}
        >
          <Dices className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Preview"
          title="See it as others will"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="size-5" />
        </Button>
        <Button
          size="sm"
          disabled={!draft.dirty}
          loading={saving}
          onClick={() => void onSave()}
          className={cn(
            'ml-1 min-w-[4.5rem] md:min-w-[5.25rem]',
            savedFlash && 'disabled:opacity-100',
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={savedFlash ? 'saved' : 'save'}
              className="inline-flex items-center gap-1.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: exit.fast }}
              transition={spring.snappy}
            >
              {savedFlash ? (
                <>
                  <Check className="size-4" strokeWidth={2.5} /> Saved
                </>
              ) : (
                'Save'
              )}
            </motion.span>
          </AnimatePresence>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section
          aria-label="Preview"
          className={cn(
            'flex shrink-0 flex-col items-center gap-1 px-4 pb-1 pt-3 transition-[height] duration-300 ease-out-quint',
            'md:h-auto md:w-[min(44%,26rem)] md:justify-center md:gap-3 md:border-r md:border-border md:bg-surface md:px-6 md:py-6',
            typing ? 'h-[24dvh]' : tab === 'stickers' ? 'h-[54dvh]' : 'h-[42dvh]',
          )}
        >
          <FitCard className="min-h-0 w-full flex-1" below={status}>
            {(width) => (
              <CardView
                card={card}
                user={user}
                width={width}
                hideStickers
                onAboutFit={setAboutFits}
              >
                {(scale) => (
                  <StickerEditor
                    stickers={card.stickers}
                    scale={scale}
                    selected={selected}
                    onSelect={onStickerSelect}
                    onChange={onStickerChange}
                    onRemove={onStickerRemove}
                    onFront={onStickerFront}
                  />
                )}
              </CardView>
            )}
          </FitCard>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* The border lives outside the strip, so the edge fade doesn't fade it too. */}
          <div className="shrink-0 border-b border-border">
            <div
              ref={tabStrip}
              role="tablist"
              aria-label="Card settings"
              onKeyDown={onTabKeys}
              className="edge-fade relative isolate flex gap-1 no-scrollbar overflow-x-auto px-3 py-2 md:flex-wrap md:overflow-visible md:px-5"
            >
              {TABS.map((t) => {
                const active = t.id === tab;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    ref={(el) => {
                      if (el) tabRefs.current.set(t.id, el);
                      else tabRefs.current.delete(t.id);
                    }}
                    type="button"
                    role="tab"
                    id={`${tabsId}-${t.id}`}
                    aria-selected={active}
                    aria-controls={`${tabsId}-panel`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-200',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId={`${tabsId}-thumb`}
                        aria-hidden
                        className="absolute inset-0 -z-10 rounded-full bg-muted dark:bg-border/70"
                        transition={spring.snappy}
                      />
                    ) : null}
                    <Icon className="size-4" aria-hidden />
                    {t.label}
                    {t.id === 'stickers' && card.stickers.length > 0 ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {card.stickers.length}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 md:px-6"
            onFocus={(e) => {
              if (!isEditable(e.target) || matchMedia(DESKTOP_QUERY).matches) return;
              window.clearTimeout(typingTimer.current);
              setTyping(true);
              // Once the preview has shrunk, bring the field back into view above the keyboard.
              const field = e.target as HTMLElement;
              setTimeout(() => field.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 320);
            }}
            onBlur={(e) => {
              if (e.relatedTarget && isEditable(e.relatedTarget)) return;
              // Grow back a beat later, so a tap that ended the typing (on a chip, say) lands
              // before anything moves under the finger.
              window.clearTimeout(typingTimer.current);
              typingTimer.current = window.setTimeout(() => setTyping(false), 260);
            }}
          >
            <motion.div
              key={tab}
              className="mx-auto max-w-2xl space-y-7"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
            >
              {tab === 'about' ? <AboutTab {...tabProps} aboutFits={aboutFits} /> : null}
              {tab === 'stickers' ? (
                <StickersTab {...tabProps} selected={selected} setSelected={setSelected} />
              ) : null}
              {tab === 'colors' ? <ColorsTab {...tabProps} /> : null}
              {tab === 'border' ? <BorderTab {...tabProps} /> : null}
              {tab === 'layout' ? <LayoutTab {...tabProps} /> : null}
              {tab === 'avatar' ? <AvatarTab {...tabProps} /> : null}
              {tab === 'font' ? <FontTab {...tabProps} /> : null}
            </motion.div>
          </div>
        </section>
      </div>

      <CardDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        user={user}
        card={card}
        own
        preview
      />
    </div>
  );
}

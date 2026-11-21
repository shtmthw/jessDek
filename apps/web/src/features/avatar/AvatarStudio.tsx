import { useMutation } from '@apollo/client';
import {
  ArrowLeft,
  Ban,
  Check,
  Crown,
  Dices,
  Eye,
  Glasses,
  PaintBucket,
  Palette,
  PawPrint,
  Scissors,
  Shirt,
  Smile,
  Sparkles,
  Undo2,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { cn } from '@/lib/cn';
import { useScrollEdges } from '@/lib/scrollEdges';
import { UPDATE_AVATAR } from '@/lib/gql';
import { isEditable, modKey } from '@/lib/keys';
import { exit, spring } from '@/lib/motion';
import { useViewer } from '../session/ViewerProvider';
import { AvatarFigure, VIEW_AVATAR, VIEW_FULL } from './AvatarFigure';
import { SLOTS, slotIds, slotLabel, type SlotId } from './catalog';
import { BACKGROUNDS, type Swatch } from './palettes';
import { DEFAULT_RECIPE, randomRecipe, serializeRecipe, type Recipe } from './recipe';
import { SPECIALS, specialOf } from './specials';
import { useAvatarDraft, type Look } from './useAvatarDraft';

// ---------------------------------------------------------------------------------------------
// What the studio offers, tab by tab
// ---------------------------------------------------------------------------------------------

/** Square crops of the canvas, so each option tile shows the part it changes. */
const VIEW = {
  head: '22 26 156 156',
  hair: '6 4 188 188',
  eyes: '52 54 96 96',
  mouth: '62 82 76 76',
  cheeks: '42 66 116 116',
  hat: '18 0 164 164',
  glasses: '44 62 112 112',
  ear: '18 82 66 66',
  top: '28 96 140 140',
  neck: '48 120 104 104',
  pet: '4 102 96 96',
  clip: '30 32 80 80',
} as const;

/** Cameras on the head: they follow it when tall hair or headwear moves the figure down. */
const HEAD_VIEWS = new Set<string>([
  VIEW.head,
  VIEW.hair,
  VIEW.eyes,
  VIEW.mouth,
  VIEW.cheeks,
  VIEW.hat,
  VIEW.glasses,
  VIEW.ear,
  VIEW.clip,
]);

interface ItemSection {
  kind: 'items';
  slot: SlotId;
  title: string;
  view: string;
  /** Slots cleared in this section's tiles so the option itself is easy to see. */
  hide?: Partial<Recipe>;
}
interface ColorSection {
  kind: 'colors';
  slot: SlotId;
  title: string;
  /** Only offered while the chosen item actually uses the colour. */
  when?: (r: Recipe) => boolean;
}
type Section = ItemSection | ColorSection;

const items = (slot: SlotId, title: string, view: string, hide?: Partial<Recipe>): ItemSection => ({
  kind: 'items',
  slot,
  title,
  view,
  hide,
});
const colors = (slot: SlotId, title: string, when?: (r: Recipe) => boolean): ColorSection => ({
  kind: 'colors',
  slot,
  title,
  when,
});

const PLAIN_HATS = new Set(['none', 'halo', 'frog', 'santa']);
const PLAIN_NECKS = new Set(['none', 'chain', 'pearls']);
const PLAIN_GLASSES = new Set(['none']);
const PLAIN_EARRINGS = new Set(['none', 'pearls', 'hearts']);
/** Tops with a second colour (the shirt under a blazer, a print, a patch, checks). */
const ACCENT_TOPS = new Set(['blazer', 'print', 'patch', 'checker']);

const TABS: Array<{ id: string; label: string; icon: LucideIcon; sections: Section[] }> = [
  { id: 'specials', label: 'Specials', icon: WandSparkles, sections: [] },
  {
    id: 'skin',
    label: 'Skin',
    icon: Palette,
    sections: [
      colors('skin', 'Skin tone'),
      items('face', 'Face shape', VIEW.head, { hat: 'none' }),
    ],
  },
  {
    id: 'hair',
    label: 'Hair',
    icon: Scissors,
    sections: [
      items('hair', 'Hairstyle', VIEW.hair, { hat: 'none', pet: 'none' }),
      colors('hairColor', 'Hair color'),
    ],
  },
  {
    id: 'eyes',
    label: 'Eyes',
    icon: Eye,
    sections: [
      items('eyes', 'Eyes', VIEW.eyes, { glasses: 'none' }),
      colors('eyeColor', 'Eye color'),
      items('brows', 'Brows', VIEW.eyes, { glasses: 'none' }),
    ],
  },
  {
    id: 'mouth',
    label: 'Mouth',
    icon: Smile,
    sections: [items('mouth', 'Mouth', VIEW.mouth), items('nose', 'Nose', VIEW.mouth)],
  },
  {
    id: 'details',
    label: 'Details',
    icon: Sparkles,
    sections: [
      items('cheeks', 'Cheeks', VIEW.cheeks, { glasses: 'none' }),
      items('mark', 'Stickers', VIEW.cheeks, { glasses: 'none' }),
      items('clip', 'Hair clips', VIEW.clip, { hat: 'none', glasses: 'none' }),
      colors('clipColor', 'Clip color', (r) => r.clip !== 'none'),
    ],
  },
  {
    id: 'hats',
    label: 'Hats',
    icon: Crown,
    sections: [
      items('hat', 'Headwear', VIEW.hat, { pet: 'none' }),
      colors('hatColor', 'Headwear color', (r) => !PLAIN_HATS.has(r.hat)),
    ],
  },
  {
    id: 'clothes',
    label: 'Clothes',
    icon: Shirt,
    sections: [
      items('top', 'Top', VIEW.top, { pet: 'none', neck: 'none' }),
      colors('topColor', 'Top color'),
      colors('topAccent', 'Detail color', (r) => ACCENT_TOPS.has(r.top)),
    ],
  },
  {
    id: 'extras',
    label: 'Extras',
    icon: Glasses,
    sections: [
      items('glasses', 'Glasses', VIEW.glasses),
      colors('glassesColor', 'Frame color', (r) => !PLAIN_GLASSES.has(r.glasses)),
      items('earrings', 'Earrings', VIEW.ear, { hat: 'none', pet: 'none' }),
      colors('earringColor', 'Earring color', (r) => !PLAIN_EARRINGS.has(r.earrings)),
      items('neck', 'Neckwear', VIEW.neck, { pet: 'none' }),
      colors('neckColor', 'Neckwear color', (r) => !PLAIN_NECKS.has(r.neck)),
    ],
  },
  {
    id: 'pets',
    label: 'Pets',
    icon: PawPrint,
    sections: [items('pet', 'Little friend', VIEW.pet)],
  },
  { id: 'background', label: 'Background', icon: PaintBucket, sections: [] },
];

type TabId = (typeof TABS)[number]['id'];

/** The tab to open on: one asked for in the link's state (`{ tab: 'specials' }`), else Skin. */
function initialTab(state: unknown): TabId {
  const asked = (state as { tab?: unknown } | null)?.tab;
  return TABS.some((t) => t.id === asked) ? (asked as TabId) : 'skin';
}

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

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

function Preview({ look, name }: { look: Look; name: string }) {
  return (
    <div
      className="relative size-32 shrink-0 overflow-hidden rounded-full shadow-md ring-1 ring-black/5 transition-[background-color] duration-300 ease-out-quint md:size-56 lg:size-64 dark:ring-white/10"
      style={{ backgroundColor: look.color }}
      role="img"
      aria-label={
        look.recipe.style === 'initials' ? `Your initials, ${initialsOf(name)}` : 'Your avatar'
      }
    >
      {look.recipe.style === 'initials' ? (
        <span className="absolute inset-0 flex items-center justify-center text-4xl font-semibold tracking-tight text-white md:text-7xl">
          {initialsOf(name)}
        </span>
      ) : (
        <AvatarFigure
          recipe={look.recipe}
          viewBox={VIEW_FULL}
          className="absolute inset-0 size-full"
        />
      )}
    </div>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-3 text-sm font-semibold tracking-tight">
      {children}
    </h2>
  );
}

function OptionGrid({
  section,
  recipe,
  onPick,
}: {
  section: ItemSection;
  recipe: Recipe;
  onPick: (slot: SlotId, id: string) => void;
}) {
  const headingId = useId();
  const value = recipe[section.slot];
  return (
    <section>
      <SectionTitle id={headingId}>{section.title}</SectionTitle>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        onKeyDown={onRadioKeys}
        className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 lg:grid-cols-6"
      >
        {slotIds(section.slot).map((id) => {
          const selected = id === value;
          const label = slotLabel(section.slot, id);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              tabIndex={selected ? 0 : -1}
              onClick={() => onPick(section.slot, id)}
              className={cn(
                // In dark mode the tiles sit a step above the page so the ink outlines still read.
                'relative aspect-square rounded-2xl bg-muted outline-offset-4 dark:bg-border/80',
                'transition-[background-color,transform] duration-200 ease-out-quint hover:bg-border/60 motion-safe:active:scale-95 dark:hover:bg-border',
              )}
            >
              {selected ? (
                <motion.span
                  layoutId={`studio-${section.slot}`}
                  aria-hidden
                  className="absolute -inset-[3px] rounded-[1.15rem] ring-2 ring-brand-text"
                  transition={spring.snappy}
                />
              ) : null}
              <span className="absolute inset-0 overflow-hidden rounded-2xl">
                <AvatarFigure
                  recipe={{ ...recipe, ...section.hide, [section.slot]: id }}
                  viewBox={section.view}
                  anchor={HEAD_VIEWS.has(section.view) ? 'head' : 'figure'}
                  className="size-full"
                />
              </span>
              {id === 'none' ? (
                <span className="absolute bottom-1.5 right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm">
                  <Ban className="size-3" strokeWidth={2.5} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SwatchRow({
  title,
  layoutId,
  swatches,
  value,
  onPick,
}: {
  title: string;
  layoutId: string;
  swatches: readonly Swatch[];
  value: string;
  onPick: (id: string) => void;
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
        {swatches.map((s) => {
          const selected = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={s.label}
              title={s.label}
              tabIndex={selected ? 0 : -1}
              onClick={() => onPick(s.id)}
              className="relative inline-flex size-10 items-center justify-center rounded-full outline-offset-4 transition-transform duration-200 ease-out-quint motion-safe:hover:scale-105 motion-safe:active:scale-95"
            >
              {selected ? (
                <motion.span
                  layoutId={layoutId}
                  aria-hidden
                  className="absolute -inset-0.5 rounded-full ring-2 ring-foreground"
                  transition={spring.snappy}
                />
              ) : null}
              <span
                aria-hidden
                className="size-9 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
                style={{ backgroundColor: s.color }}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ColorSectionView({
  section,
  recipe,
  onPick,
}: {
  section: ColorSection;
  recipe: Recipe;
  onPick: (slot: SlotId, id: string) => void;
}) {
  const slot = SLOTS[section.slot];
  if (slot.kind !== 'colors') return null;
  return (
    <SwatchRow
      title={section.title}
      layoutId={`studio-${section.slot}`}
      swatches={slot.swatches}
      value={recipe[section.slot]}
      onPick={(id) => onPick(section.slot, id)}
    />
  );
}

/** Ready-made characters to start from. */
function SpecialsPanel({
  look,
  change,
}: {
  look: Look;
  change: (next: Look | ((prev: Look) => Look)) => void;
}) {
  const headingId = useId();
  const current = specialOf(look.recipe);
  return (
    <>
      <section>
        <SectionTitle id={headingId}>Specials</SectionTitle>
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">
          Ready-made characters with doe eyes and soft faces. Pick one, then change anything you
          like in the other tabs.
        </p>
        <div
          role="radiogroup"
          aria-labelledby={headingId}
          onKeyDown={onRadioKeys}
          className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5"
        >
          {SPECIALS.map((sp, i) => {
            const selected = current?.id === sp.id;
            return (
              <button
                key={sp.id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (!current && i === 0) ? 0 : -1}
                onClick={() => change((l) => ({ ...l, recipe: { ...sp.recipe } }))}
                className="group flex min-w-0 flex-col items-center gap-1.5 outline-offset-4"
              >
                <span
                  className="relative aspect-square w-full rounded-2xl transition-[transform,background-color] duration-300 ease-out-quint motion-safe:group-active:scale-95"
                  style={{ backgroundColor: look.color }}
                >
                  {selected ? (
                    <motion.span
                      layoutId="studio-special"
                      aria-hidden
                      className="absolute -inset-[3px] rounded-[1.15rem] ring-2 ring-brand-text"
                      transition={spring.snappy}
                    />
                  ) : null}
                  <span className="absolute inset-0 overflow-hidden rounded-2xl">
                    <AvatarFigure recipe={sp.recipe} viewBox={VIEW_AVATAR} className="size-full" />
                  </span>
                </span>
                <span
                  className={cn(
                    'max-w-full truncate text-xs',
                    selected ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {sp.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------

export function AvatarStudio() {
  const viewer = useViewer();
  const draft = useAvatarDraft(viewer);
  const { look, change, undo } = draft;
  const location = useLocation();
  const [tab, setTab] = useState<TabId>(() => initialTab(location.state));
  const [updateAvatar, saving] = useMutation(UPDATE_AVATAR);
  const [savedFlash, setSavedFlash] = useState(false);
  const tabsId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const tabStrip = useRef<HTMLDivElement>(null);
  useScrollEdges(tabStrip);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]!;
  const showingInitials = look.recipe.style === 'initials';

  const pick = (slot: SlotId, id: string) =>
    change((l) => ({ ...l, recipe: { ...l.recipe, [slot]: id } }));

  // ⌘/Ctrl+Z steps back through your changes.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      // Text fields keep their own undo (the chat search box sits next to the studio on desktop).
      if (e.key.toLowerCase() !== 'z' || isEditable(e.target)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // Keep the chosen tab in view in the scrolling strip.
  useEffect(() => {
    tabRefs.current
      .get(tab)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [tab]);

  async function save() {
    try {
      await updateAvatar({
        variables: { input: { avatarColor: look.color, avatar: serializeRecipe(look.recipe) } },
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      toast.success('Avatar saved');
    } catch (err) {
      toast.error(
        (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
          'Couldn’t save your avatar. Try again.',
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
        <h1 className="min-w-0 flex-1 truncate px-1.5 text-[17px] font-semibold tracking-tight">
          Avatar
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
          aria-label="Randomize"
          title="Randomize"
          onClick={() => change((l) => ({ ...l, recipe: randomRecipe(l.recipe) }))}
        >
          <Dices className="size-5" />
        </Button>
        <Button
          size="sm"
          disabled={!draft.dirty}
          loading={saving.loading}
          onClick={() => void save()}
          className={cn('ml-1 min-w-[5.25rem]', savedFlash && 'disabled:opacity-100')}
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
          className="flex shrink-0 flex-col items-center gap-2 px-4 pb-2 pt-4 md:w-[min(42%,22rem)] md:justify-center md:gap-4 md:border-r md:border-border md:bg-surface md:py-8"
        >
          <Preview look={look} name={viewer.displayName} />
          <div className="flex h-7 items-center text-sm" aria-live="polite">
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
                  key="name"
                  className="truncate font-medium text-muted-foreground"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exit.fast }}
                  transition={spring.soft}
                >
                  {viewer.displayName}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* The border lives outside the strip, so the edge fade doesn't fade it too. */}
          <div className="shrink-0 border-b border-border">
            <div
              ref={tabStrip}
              role="tablist"
              aria-label="Avatar parts"
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
                      'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium',
                      'transition-colors duration-200',
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
          >
            <motion.div
              key={tab}
              className="mx-auto max-w-2xl space-y-7"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
            >
              {showingInitials && current.id !== 'background' && current.id !== 'specials' ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3.5 py-2.5 text-sm">
                  <span className="text-muted-foreground">Others see your initials right now.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      change((l) => ({ ...l, recipe: { ...l.recipe, style: 'character' } }))
                    }
                  >
                    Show character
                  </Button>
                </div>
              ) : null}

              {current.sections.map((s) =>
                s.kind === 'items' ? (
                  <OptionGrid key={s.slot} section={s} recipe={look.recipe} onPick={pick} />
                ) : !s.when || s.when(look.recipe) ? (
                  <ColorSectionView key={s.slot} section={s} recipe={look.recipe} onPick={pick} />
                ) : null,
              )}

              {current.id === 'specials' ? <SpecialsPanel look={look} change={change} /> : null}

              {current.id === 'background' ? (
                <>
                  <SwatchRow
                    title="Background"
                    layoutId="studio-background"
                    swatches={BACKGROUNDS}
                    value={look.color}
                    onPick={(color) => change((l) => ({ ...l, color }))}
                  />
                  <section>
                    <SectionTitle id={`${tabsId}-style`}>Show others</SectionTitle>
                    <Segmented
                      kind="radio"
                      label="Show others"
                      value={look.recipe.style}
                      onChange={(style) =>
                        change((l) => ({ ...l, recipe: { ...l.recipe, style } }))
                      }
                      options={[
                        { value: 'character', label: 'My character' },
                        { value: 'initials', label: 'My initials' },
                      ]}
                    />
                  </section>
                  <section className="border-t border-border pt-6">
                    <SectionTitle id={`${tabsId}-reset`}>Start over</SectionTitle>
                    <p className="-mt-2 mb-3 text-sm text-muted-foreground">
                      Go back to the default character. You can undo this.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        change((l) => ({ ...l, recipe: { ...DEFAULT_RECIPE, style: 'character' } }))
                      }
                    >
                      Reset to default
                    </Button>
                  </section>
                </>
              ) : null}
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  );
}

import { useQuery } from '@apollo/client';
import { ArrowLeft, Compass, Feather, Shuffle } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button, buttonClass } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/cn';
import { useDeckQuality } from '@/lib/deckQuality';
import { CARD, DECK_CARD, type Card } from '@/lib/gql';
import { isDialogOpen, isEditable } from '@/lib/keys';
import { useIsDesktop } from '@/lib/media';
import { spring } from '@/lib/motion';
import { DealtCard } from '../card/CardDialog';
import { CardView } from '../card/CardView';
import { useCardFontGate } from '../card/fonts';
import { parseCard } from '../card/recipe';
import { CARD_H, CARD_W } from '../card/theme';
import { firstName } from '../requests/inbox';
import { useDeck } from './DeckProvider';
import { Fan, FanPlaceholder } from './Fan';
import { SayHi } from './SayHi';

/*
 * Discover (CARD_DECK_PLAN.md §4.2): the front page with the deck's stack (its top card is M), the
 * matching page with the fan, and one person's card with the openers. All three share the one deck
 * in DeckProvider, so moving between them never deals a new one.
 */

function PaneHeader({
  back,
  backAlways = false,
  title,
  right,
}: {
  back: { to: string; label: string };
  /** Desktop shows the back arrow too (the front page only shows it on phones). */
  backAlways?: boolean;
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border/80 bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:px-6">
      <Link
        to={back.to}
        aria-label={back.label}
        className={`-ml-2 inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted md:size-9 ${backAlways ? '' : 'md:hidden'}`}
      >
        <ArrowLeft className="size-5" />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight md:text-lg">
        {title}
      </h1>
      {right}
    </header>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-dvh flex-col overflow-y-auto overflow-x-hidden bg-background md:min-h-0">
      {children}
    </div>
  );
}

/** Esc goes back (not while typing in a box that has text). */
function useEscapeTo(path: string) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isDialogOpen()) return;
      if (isEditable(e.target) && (e.target as HTMLTextAreaElement).value) return;
      e.preventDefault();
      navigate(path);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, path]);
}

const STACK_WIDTH = 'min(250px, 62vw, calc((100dvh - 21rem) * 320 / 540))';
/** The cards under the top one: how far each sits back, and its turn. */
const UNDER = [
  { x: -6, y: 1, r: -1.5, rh: -3 },
  { x: -14, y: 3, r: -4.5, rh: -8 },
  { x: -22, y: 6, r: -8, rh: -13 },
];

/** The deck's stack from the sketch: the top card is M; the next few peek out behind it. */
function Stack({
  top,
  under,
  onOpen,
  lite,
}: {
  top: Card;
  under: Array<Card | null>;
  onOpen: () => void;
  /** The light deck: the stack is drawn like the fan it opens into. */
  lite: boolean;
}) {
  const fontReady = useCardFontGate(parseCard(top.recipe).font);
  return (
    <div className="group relative isolate" style={{ width: STACK_WIDTH }}>
      {UNDER.map((u, i) => {
        const card = under[i];
        return (
          <div
            key={card?.id ?? `under-${i}`}
            aria-hidden
            className="absolute inset-0 transition-transform duration-300 ease-out [transform:translate(var(--x),var(--y))_rotate(var(--r))] group-hover:[transform:translate(var(--x),var(--y))_rotate(var(--rh))]"
            style={
              {
                zIndex: 3 - i,
                '--x': `${u.x}px`,
                '--y': `${u.y}px`,
                '--r': `${u.r}deg`,
                '--rh': `${u.rh}deg`,
              } as CSSProperties
            }
          >
            {card ? (
              <CardView card={parseCard(card.recipe)} user={card.user} lite={lite} />
            ) : (
              <div className="h-full w-full rounded-[24px] border border-border bg-muted shadow-sm" />
            )}
          </div>
        );
      }).reverse()}
      <button
        type="button"
        onClick={onOpen}
        data-deck-top={top.id}
        aria-label={`Open the deck, starting with ${top.user.displayName}’s card`}
        className="relative z-10 block w-full rounded-[24px] outline-offset-4 transition-transform duration-200 ease-out hover:-translate-y-1.5 focus-visible:outline-2 focus-visible:outline-brand-text"
      >
        {fontReady ? (
          <CardView card={parseCard(top.recipe)} user={top.user} lite={lite} />
        ) : (
          <Skeleton
            className="w-full rounded-[24px]"
            style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
          />
        )}
      </button>
    </div>
  );
}

/** /discover: the front page. Its top card is M; opening the deck reuses this deal. */
export function DiscoverFront() {
  const { store, snap } = useDeck();
  const [quality] = useDeckQuality();
  const navigate = useNavigate();
  useEffect(() => {
    // An empty deck is dealt again on each visit: someone new may share an interest by now.
    if (snap.status === 'ready' && snap.mode === 'empty') void store.restart();
    else void store.ensureStarted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const top = store.current();
  const open = () => navigate('/discover/deck');
  let body: ReactNode;
  if (snap.status === 'error') {
    body = (
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-lg font-semibold tracking-tight">Couldn’t deal your deck</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button onClick={() => void store.restart()}>Try again</Button>
      </div>
    );
  } else if (snap.status !== 'ready') {
    body = (
      <div className="flex flex-col items-center gap-6" aria-busy aria-label="Dealing your deck">
        <Skeleton
          className="rounded-[24px]"
          style={{ width: STACK_WIDTH, aspectRatio: `${CARD_W} / ${CARD_H}` }}
        />
        <Skeleton className="h-6 w-48" />
      </div>
    );
  } else if (!top) {
    body = (
      <div className="flex max-w-xs flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-muted">
          <Compass className="size-8 text-muted-foreground" aria-hidden />
        </span>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">No matches yet</h2>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Add a few interests to your card. We’ll show you people who share at least one.
        </p>
        <Link to="/settings/card" className={buttonClass('primary', 'md', 'mt-6')}>
          Add interests
        </Link>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-center">
        <Stack
          top={top}
          under={[1, 2, 3].map((k) => store.cardAt(k) ?? null)}
          onOpen={open}
          lite={quality === 'light'}
        />
        <h2 className="mt-8 text-[22px] font-semibold tracking-tight">Find your people</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {snap.n === 1 ? '1 person shares' : `${snap.n} people share`} an interest with you
        </p>
        <Button className="mt-5 min-w-44" onClick={open}>
          Open the deck
        </Button>
        <p className="mt-3 text-[13px] text-muted-foreground">or tap the top card</p>
      </div>
    );
  }

  return (
    <Page>
      <PaneHeader back={{ to: '/', label: 'Back to chats' }} title="Discover" />
      <motion.div
        className="flex flex-1 flex-col items-center justify-center px-4 py-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
      >
        {body}
      </motion.div>
    </Page>
  );
}

/**
 * Switches the deck between full-quality and light cards (DECK_QUALITY_PLAN.md), right where any
 * lag is felt. The same choice as Settings → Discover; it's kept on this device.
 */
function QualityToggle() {
  const [quality, setQuality] = useDeckQuality();
  const light = quality === 'light';
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={light}
      aria-label="Light cards"
      title="Light cards: simpler cards and snappier motion, easier on older devices"
      onClick={() => {
        setQuality(light ? 'full' : 'light');
        toast(light ? 'Full-quality cards' : 'Light cards on', {
          id: 'deck-quality',
          description: light
            ? 'Every card in full detail.'
            : 'Simpler cards while you browse. Cards you open stay in full.',
        });
      }}
      className={cn(light && 'bg-brand/12 text-brand-text hover:bg-brand/18')}
    >
      <Feather className="size-4" />
      <span className="hidden sm:inline">Light</span>
    </Button>
  );
}

/** /discover/deck: the matching page. */
export function DeckFanPage() {
  const { store, snap } = useDeck();
  const [quality] = useDeckQuality();
  const navigate = useNavigate();
  useEscapeTo('/discover');
  useEffect(() => {
    void store.ensureStarted();
  }, [store]);
  if (snap.status === 'ready' && snap.mode === 'empty') return <Navigate to="/discover" replace />;
  return (
    <Page>
      <PaneHeader
        back={{ to: '/discover', label: 'Back to Discover' }}
        backAlways
        title="Your deck"
        right={
          <div className="flex items-center gap-2">
            <QualityToggle />
            <Button
              variant="secondary"
              size="sm"
              aria-label="Shuffle: start from someone else"
              title="Start from someone else"
              disabled={snap.status === 'loading'}
              onClick={() => void store.restart()}
            >
              <Shuffle className="size-4" />
              <span className="hidden sm:inline">Shuffle</span>
            </Button>
          </div>
        }
      />
      {snap.status === 'ready' ? (
        <Fan
          store={store}
          snap={snap}
          lite={quality === 'light'}
          onOpen={(card) => navigate(`/discover/deck/${card.user.username}`)}
        />
      ) : snap.status === 'error' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-semibold">Couldn’t deal your deck</p>
          <Button onClick={() => void store.restart()}>Try again</Button>
        </div>
      ) : (
        <FanPlaceholder />
      )}
    </Page>
  );
}

/** Phones keep the card small, so the openers sit right under it. */
const VIEW_WIDTH = {
  wide: 'min(320px, 100%, calc((100dvh - 12rem) * 320 / 540))',
  narrow: 'min(210px, 58vw)',
};

/** /discover/deck/:username: one person's card, with the openers. "Back to deck" is free. */
export function DeckCardPage() {
  const { username = '' } = useParams();
  const { store } = useDeck();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  useEscapeTo('/discover/deck');

  // From the deck: the card is already here. Check they're still available (the spec's 410).
  const fromDeck = store.find((c) => c.user.username === username);
  const { data: check } = useQuery(DECK_CARD, {
    variables: { id: fromDeck?.id ?? '' },
    skip: !fromDeck,
    fetchPolicy: 'network-only',
  });
  useEffect(() => {
    if (fromDeck && check && check.deckCard === null) {
      store.remove(fromDeck.id);
      toast(`${firstName(fromDeck.user.displayName)} isn’t available any more`);
      navigate('/discover/deck', { replace: true });
    }
  }, [check, fromDeck, store, navigate]);

  // Opened straight from a link (or after a reload): there's no deck to take it from.
  const { data: direct, loading } = useQuery(CARD, {
    variables: { username },
    skip: Boolean(fromDeck),
    fetchPolicy: 'cache-and-network',
  });
  const card = fromDeck ?? direct?.card ?? null;
  const recipe = card ? parseCard(card.recipe) : null;
  const fontReady = useCardFontGate(recipe?.font);

  return (
    <Page>
      <PaneHeader
        back={{ to: '/discover/deck', label: 'Back to deck' }}
        backAlways
        title="Back to deck"
      />
      <div className="flex flex-1 flex-col items-center gap-6 px-4 py-6 md:flex-row md:items-start md:justify-center md:gap-10 md:px-8 md:py-10">
        <div className="shrink-0" style={{ width: desktop ? VIEW_WIDTH.wide : VIEW_WIDTH.narrow }}>
          {!card || !recipe || !fontReady ? (
            loading || fromDeck ? (
              <Skeleton
                className="w-full rounded-[24px]"
                style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
              />
            ) : (
              <div className="flex aspect-[320/540] w-full flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed border-border px-8 text-center">
                <p className="font-semibold">No card to show</p>
                <p className="text-sm text-muted-foreground">@{username} isn’t available to you.</p>
              </div>
            )
          ) : (
            <DealtCard>
              <CardView card={recipe} user={card.user} tilt />
            </DealtCard>
          )}
        </div>
        {card && recipe ? <SayHi them={card} recipe={recipe} /> : null}
      </div>
    </Page>
  );
}

import { useMutation } from '@apollo/client';
import { ChevronRight, IdCard, MessagesSquare, Shirt, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { DISMISS_WELCOME, type Viewer } from '@/lib/gql';
import { spring } from '@/lib/motion';
import { AvatarFigure, VIEW_AVATAR } from '../avatar/AvatarFigure';
import { slotIds } from '../avatar/catalog';
import { BACKGROUNDS } from '../avatar/palettes';
import { parseRecipe, type Recipe } from '../avatar/recipe';
import { SPECIALS } from '../avatar/specials';
import { useViewer } from '../session/ViewerProvider';

/** How long each look stays on before the next one pops in. */
const STEP_MS = 1700;
/** Specials the hero tries on after the person's own look (varied hair, hats and colours). */
const TRY_ON = [3, 6, 8, 1, 5, 0];

const count = (slot: Parameters<typeof slotIds>[0]) =>
  slotIds(slot).filter((id) => id !== 'none').length;

/**
 * The one-time welcome for a new account: what Realtime is for, with the person's own character
 * trying on a few looks. Closing it any way counts as seen (on every device).
 */
export function WelcomeDialog() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [dismiss] = useMutation(DISMISS_WELCOME);
  const saved = useRef(false);

  const close = (to?: string, state?: unknown) => {
    if (!saved.current) {
      saved.current = true;
      // If this fails the welcome simply shows again next time, which is harmless.
      void dismiss().catch(() => undefined);
    }
    setOpen(false);
    if (to) navigate(to, { state });
  };
  // The studio opens on the ready-made looks the hero above has been trying on.
  const dressUp = () => close('/settings/avatar', { tab: 'specials' });

  const first = viewer.displayName.trim().split(/\s+/)[0] || viewer.username;
  const things: Array<{ icon: LucideIcon; title: string; text: ReactNode; go: () => void }> = [
    {
      icon: Shirt,
      title: 'Dress up your character',
      // A non-breaking hyphen keeps "ready-made" on one line.
      text: `${count('hair')} hairstyles, ${count('hat')} hats, ${count('pet')} little friends and ${SPECIALS.length} ready\u2011made looks.`,
      go: dressUp,
    },
    {
      icon: IdCard,
      title: 'Design your card',
      text: (
        <>
          Stickers, fonts and borders. Share it as a link:{' '}
          <span className="whitespace-nowrap font-medium text-foreground/80">
            /@{viewer.username}
          </span>
        </>
      ),
      go: () => close('/settings/card'),
    },
    {
      icon: MessagesSquare,
      title: 'Chat in real time',
      text: 'Replies, reactions, and photos and videos sent straight between devices.',
      go: () => close(),
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Welcome to Realtime"
      description={`Hi ${first}! Here’s what you can do.`}
    >
      <div className="flex flex-col gap-5">
        <DressUp viewer={viewer} />
        <ul className="-mx-2 flex flex-col">
          {things.map((t, i) => (
            <motion.li
              key={t.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.soft, delay: 0.18 + i * 0.07 }}
            >
              <button
                type="button"
                onClick={t.go}
                className="group flex w-full items-center gap-3.5 rounded-xl px-2 py-2.5 text-left outline-offset-[-2px] transition-colors hover:bg-muted"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-text transition-transform duration-200 ease-out-quint group-hover:scale-105">
                  <t.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug">{t.title}</span>
                  <span className="block text-sm leading-snug text-muted-foreground">{t.text}</span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
                  aria-hidden
                />
              </button>
            </motion.li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => close()}>
            Start chatting
          </Button>
          <Button className="flex-1" onClick={dressUp}>
            Make my character
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Four-point sparkle, centred on 0,0 with a radius of 1. */
const SPARKLE =
  'M0 -1 C0.12 -0.12 0.12 -0.12 1 0 C0.12 0.12 0.12 0.12 0 1 C-0.12 0.12 -0.12 0.12 -1 0 C-0.12 -0.12 -0.12 -0.12 0 -1 Z';

/** The person's own character, then a few ready-made looks popping in, each with a sparkle burst. */
function DressUp({ viewer }: { viewer: Viewer }) {
  const reduced = useReducedMotion() ?? false;
  const looks = useMemo(() => {
    const own = { recipe: parseRecipe(viewer.avatar), color: viewer.avatarColor };
    const tries = TRY_ON.map((n, i) => ({
      recipe: SPECIALS[n % SPECIALS.length]!.recipe,
      color: BACKGROUNDS[(i * 3 + 1) % BACKGROUNDS.length]!.color,
    }));
    return [own, ...tries] as Array<{ recipe: Recipe; color: string }>;
  }, [viewer.avatar, viewer.avatarColor]);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setI((n) => (n + 1) % looks.length);
    }, STEP_MS);
    return () => clearInterval(t);
  }, [reduced, looks.length]);

  const look = looks[reduced ? 0 : i]!;
  return (
    <div aria-hidden className="relative mx-auto mt-1 size-28">
      <motion.div
        className="absolute inset-0 overflow-hidden rounded-full shadow-md ring-1 ring-black/5 dark:ring-white/10"
        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, backgroundColor: look.color }}
        transition={{ ...spring.pop, backgroundColor: { duration: 0.35 } }}
      >
        {/* One look at a time: the old one shrinks away, then the new one pops in. Overlapping
            them for a crossfade muddied the two faces together. */}
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={i}
            className="absolute inset-0"
            initial={{ y: 10, scale: 0.72, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
            transition={spring.pop}
          >
            <AvatarFigure recipe={look.recipe} viewBox={VIEW_AVATAR} className="size-full" />
          </motion.div>
        </AnimatePresence>
      </motion.div>
      {reduced ? null : <Burst key={i} />}
    </div>
  );
}

/** Sparkle colours: the brand, a warm gold and a soft pink, alternating round the ring. */
const SPARKLE_FILLS = ['fill-brand', 'fill-amber-400', 'fill-pink-400'];

/** A ring of sparkles that flies out from the avatar's edge and fades. */
function Burst() {
  return (
    <svg
      className="pointer-events-none absolute -inset-8 overflow-visible"
      viewBox="-88 -88 176 176"
    >
      {Array.from({ length: 8 }, (_, k) => {
        const a = ((k * 45 + 22) * Math.PI) / 180;
        const r = k % 2 ? 6 : 9;
        return (
          <motion.path
            key={k}
            d={SPARKLE}
            className={SPARKLE_FILLS[k % SPARKLE_FILLS.length]}
            initial={{ x: Math.cos(a) * 54, y: Math.sin(a) * 54, scale: 0, rotate: 0, opacity: 1 }}
            animate={{
              x: Math.cos(a) * 76,
              y: Math.sin(a) * 76,
              scale: [0, r, 0],
              rotate: 45,
              opacity: [1, 1, 0],
            }}
            // Starts as the new look pops in (after the old one's 0.12 s exit).
            transition={{ duration: 0.75, ease: 'easeOut', delay: 0.1 + 0.03 * k }}
          />
        );
      })}
    </svg>
  );
}

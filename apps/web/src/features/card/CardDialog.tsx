import { Link2, Pencil, Share } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonClass } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Skeleton } from '@/components/Skeleton';
import { easeOut } from '@/lib/motion';
import { useCardFontGate } from './fonts';
import { CardView, type CardUser } from './CardView';
import type { CardRecipe } from './recipe';
import { copyCardLink, shareCard } from './share';

/** Room left for the card in a dialog: the sheet's height minus its title, the room the card
 * leans into, and the actions. */
const CARD_WIDTH = 'min(320px, 100%, calc((88dvh - 13rem) * 320 / 540))';

/** Ends a touch past the mark and eases back, like a spring, but always on the same frame. */
const settleBack = [0.3, 1.45, 0.55, 1] as const;

/**
 * The card arrives with a little toss, then settles.
 *
 * Timed curves rather than springs: a spring's tail creeps the last pixel for a few hundred ms and
 * then snaps its last half degree of turn, which reads as a shiver along the card's edges. No scale
 * either: the card's tilt layer is drawn once at the size it first appears, so starting it small
 * left it soft. It's its own layer only while it moves.
 */
export function DealtCard({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const [moving, setMoving] = useState(!reduced);
  if (reduced) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 22, rotate: -4 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{
        delay: 0.04,
        opacity: { duration: 0.18, ease: 'easeOut' },
        y: { duration: 0.5, ease: easeOut },
        rotate: { duration: 0.62, ease: settleBack },
      }}
      style={moving ? { willChange: 'transform' } : undefined}
      onAnimationComplete={() => setMoving(false)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Someone's card in a dialog (a bottom sheet on phones), with what you can do with it.
 *
 * - `card`: the recipe; `undefined` while it loads, `null` when there's none to show you.
 * - `own`: it's your card (Edit and Share under it; its Message button is just drawn).
 * - `preview`: the studio's "see it as others will" (no actions but Close).
 * - `onMessage`: what the card's own "Message @name" button does (opens the chat). It's the only
 *   Message button: the dialog doesn't add a second one.
 * - `messaging`: the chat is opening (the card's button shows it's busy).
 */
export function CardDialog({
  open,
  onOpenChange,
  user,
  card,
  own = false,
  preview = false,
  onMessage,
  messaging = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: CardUser;
  card: CardRecipe | null | undefined;
  own?: boolean;
  preview?: boolean;
  onMessage?: () => void;
  messaging?: boolean;
}) {
  const title = preview
    ? 'How others see your card'
    : own
      ? 'Your card'
      : `${user.displayName}’s card`;
  // Deal the card once its font is here, so its text doesn't reflow mid-toss.
  const fontReady = useCardFontGate(card?.font);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      {/* The padding is room for the card to lean into and for stickers that hang off its edge. */}
      <div className="flex flex-col items-center gap-6 pb-1 pt-4">
        <div style={{ width: CARD_WIDTH }}>
          {card === undefined || (card && !fontReady) ? (
            <Skeleton className="aspect-[320/540] w-full rounded-2xl" />
          ) : card === null ? (
            <div className="flex aspect-[320/540] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-8 text-center">
              <p className="font-semibold">This card isn’t available</p>
              <p className="text-sm text-muted-foreground">
                @{user.username} can’t be reached from here.
              </p>
            </div>
          ) : (
            <DealtCard>
              <CardView
                card={card}
                user={user}
                tilt
                onMessage={own || preview ? undefined : onMessage}
                messaging={messaging}
              />
            </DealtCard>
          )}
        </div>

        {preview ? (
          <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
            Back to editing
          </Button>
        ) : (
          <div className="flex w-full gap-2">
            {own ? (
              <Link
                to="/settings/card"
                onClick={() => onOpenChange(false)}
                className={buttonClass('primary', 'md', 'flex-1')}
              >
                <Pencil className="size-4" /> Edit card
              </Link>
            ) : null}
            <Button
              variant="secondary"
              className="flex-1"
              disabled={card === null}
              onClick={() => void (own ? shareCard(user) : copyCardLink(user.username))}
            >
              {own ? <Share className="size-4" /> : <Link2 className="size-4" />}
              {own ? 'Share' : 'Copy link'}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

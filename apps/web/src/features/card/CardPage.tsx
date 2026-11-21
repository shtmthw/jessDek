import { ArrowLeft, Link2, Pencil, Share } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, buttonClass } from '@/components/Button';
import { Wordmark } from '@/components/Wordmark';
import { Skeleton } from '@/components/Skeleton';
import { spring } from '@/lib/motion';
import { DealtCard } from './CardDialog';
import { CardView, type CardUser } from './CardView';
import { useCardFontGate } from './fonts';
import type { CardRecipe } from './recipe';
import { copyCardLink, shareCard } from './share';

export type CardPageState =
  | { status: 'loading' }
  /** No such person, or their card isn't shared with you. Worded the same either way. */
  | { status: 'missing' }
  | { status: 'ready'; user: CardUser; card: CardRecipe };

/** As large as fits: the page's height less the bars and the actions under the card. */
const CARD_WIDTH = 'min(340px, 100%, calc((100dvh - 14rem) * 320 / 540))';

/**
 * The page at /@username. Signed in, it sits in the main pane like Settings; signed out, it's the
 * whole page with the app's name and a way in. `onMessage` is what the card's Message button does
 * (signed out: off to sign in first).
 */
export function CardPage({
  username,
  state,
  signedIn,
  own = false,
  onMessage,
  messaging = false,
  onSignIn,
  onSignUp,
}: {
  username: string;
  state: CardPageState;
  signedIn: boolean;
  own?: boolean;
  onMessage?: () => void;
  /** The chat is opening (the card's Message button shows it's busy). */
  messaging?: boolean;
  /** Signed out: go to the sign-in screen. */
  onSignIn?: () => void;
  /** Signed out: go to the sign-up form. */
  onSignUp?: () => void;
}) {
  // Deal the card once its font is here, so its text doesn't reflow mid-toss.
  const fontReady = useCardFontGate(state.status === 'ready' ? state.card.font : undefined);
  const body = (
    <motion.div
      className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={spring.soft}
    >
      <div style={{ width: CARD_WIDTH }}>
        {state.status === 'loading' || (state.status === 'ready' && !fontReady) ? (
          <Skeleton className="aspect-[320/540] w-full rounded-2xl" />
        ) : state.status === 'missing' ? (
          <div className="flex aspect-[320/540] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-8 text-center">
            <p className="text-lg font-semibold tracking-tight">
              {signedIn ? 'No card to show' : 'This card isn’t shared'}
            </p>
            <p className="text-sm text-muted-foreground">
              {signedIn
                ? `Nobody called @${username} is on jessDek, or their card isn’t available to you.`
                : `If you know @${username}, sign in to find them on jessDek.`}
            </p>
          </div>
        ) : (
          <DealtCard>
            <CardView
              card={state.card}
              user={state.user}
              tilt
              onMessage={own ? undefined : onMessage}
              messaging={messaging}
            />
          </DealtCard>
        )}
      </div>

      {state.status === 'ready' ? (
        <div className="flex w-full max-w-[340px] gap-2">
          {own ? (
            <>
              <Link to="/settings/card" className={buttonClass('primary', 'md', 'flex-1')}>
                <Pencil className="size-4" /> Edit card
              </Link>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => void shareCard(state.user)}
              >
                <Share className="size-4" /> Share
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => void copyCardLink(username)}
            >
              <Link2 className="size-4" /> Copy link
            </Button>
          )}
        </div>
      ) : null}
    </motion.div>
  );

  if (!signedIn) {
    return (
      <Shell
        bar={
          <>
            <Wordmark height={36} />
            <Button variant="secondary" size="sm" onClick={onSignIn}>
              Sign in
            </Button>
          </>
        }
      >
        {body}
        <p className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">
          jessDek is a small, fast chat app.{' '}
          <button
            type="button"
            onClick={onSignUp ?? onSignIn}
            className="font-medium text-brand-text hover:underline"
          >
            Create an account
          </button>{' '}
          to message people.
        </p>
      </Shell>
    );
  }

  return (
    <Shell
      bar={
        <>
          <Link
            to="/"
            aria-label="Back to chats"
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted md:hidden"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
            @{username}
          </h1>
        </>
      }
    >
      {body}
    </Shell>
  );
}

function Shell({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  return (
    // overflow-x-hidden: the card's toss and stickers hanging off its edge never scroll the page sideways.
    <div className="flex h-full min-h-dvh flex-col overflow-y-auto overflow-x-hidden bg-background md:min-h-0">
      <header className="sticky top-0 z-10 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:px-6">
        {bar}
      </header>
      {children}
    </div>
  );
}

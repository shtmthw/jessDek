import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import type { Reaction } from '@/lib/gql';
import { exit, spring } from '@/lib/motion';
import { groupReactions, reactionSummary } from './reactions';

const MAX_SHOWN = 3;

/**
 * The reactions on a message: one pill tucked under the bubble's corner on the sender's side, with
 * up to three emojis and the total. Tinted when one of them is yours. Tap for who reacted.
 */
export function ReactionChips({
  reactions,
  viewerId,
  mine,
  onOpen,
}: {
  reactions: readonly Reaction[] | undefined;
  viewerId: string;
  /** The bubble is yours (the pill sits on the right). */
  mine: boolean;
  onOpen: () => void;
}) {
  const groups = groupReactions(reactions ?? [], viewerId);
  const total = reactions?.length ?? 0;
  const youReacted = groups.some((g) => g.mine);
  const summary = reactionSummary(groups);
  return (
    <AnimatePresence initial={false}>
      {total > 0 ? (
        <motion.button
          key="chips"
          type="button"
          data-reaction-chips
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label={`Reactions: ${summary}. Show who reacted`}
          title={summary}
          className={cn(
            'relative z-10 -mt-2 inline-flex h-[26px] items-center gap-px rounded-full px-1.5 shadow-sm ring-1',
            'transition-[background-color,box-shadow] duration-200',
            mine ? 'mr-2.5 self-end' : 'ml-2.5 self-start',
            youReacted
              ? 'bg-[color-mix(in_srgb,var(--brand)_10%,var(--background))] ring-brand-text/35'
              : 'bg-background ring-border',
          )}
          style={{ transformOrigin: mine ? '85% 0%' : '15% 0%' }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6, transition: exit.fast }}
          transition={spring.pop}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {groups.slice(0, MAX_SHOWN).map((g) => (
              <motion.span
                key={g.emoji}
                layout="position"
                className="text-[15px] leading-none"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4, transition: exit.fast }}
                transition={spring.pop}
              >
                {g.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
          {total > 1 ? (
            <motion.span
              key={total}
              layout="position"
              className={cn(
                'tabular ml-0.5 pr-0.5 text-xs font-semibold',
                youReacted ? 'text-brand-text' : 'text-muted-foreground',
              )}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.snappy}
            >
              {total}
            </motion.span>
          ) : null}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

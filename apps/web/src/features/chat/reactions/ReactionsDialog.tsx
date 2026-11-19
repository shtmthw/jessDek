import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Dialog } from '@/components/Dialog';
import { cn } from '@/lib/cn';
import type { Reaction, User } from '@/lib/gql';
import { exit, spring } from '@/lib/motion';
import { groupReactions } from './reactions';

/**
 * Who reacted to a message, all together or one emoji at a time. Your own row takes your
 * reaction back.
 */
export function ReactionsDialog({
  open,
  onOpenChange,
  reactions,
  viewerId,
  members,
  onRemoveMine,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reactions: readonly Reaction[];
  viewerId: string;
  /** For avatars; people who have since left the chat get a plain one. */
  members: readonly User[];
  onRemoveMine: () => void;
}) {
  const [tab, setTab] = useState<string>('all');
  const groups = groupReactions(reactions, viewerId);
  const current = tab === 'all' || groups.some((g) => g.emoji === tab) ? tab : 'all';
  // You first, then everyone else in the order they reacted.
  const rows = reactions
    .filter((r) => current === 'all' || r.emoji === current)
    .slice()
    .sort((a, b) => Number(b.user.id === viewerId) - Number(a.user.id === viewerId));
  const tabs = [
    { id: 'all', label: `All ${reactions.length}` },
    ...groups.map((g) => ({ id: g.emoji, label: `${g.emoji} ${g.count}` })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Reactions">
      <div
        role="tablist"
        aria-label="Filter by emoji"
        className="no-scrollbar relative isolate -mx-1 flex gap-1 overflow-x-auto px-1 pb-3"
      >
        {tabs.map((t) => {
          const active = t.id === current;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                'tabular relative inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="reactions-tab"
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-full bg-muted dark:bg-border/70"
                  transition={spring.snappy}
                />
              ) : null}
              {t.label}
            </button>
          );
        })}
      </div>
      <ul className="-mx-2 max-h-[50dvh] overflow-y-auto pb-2" aria-label="People who reacted">
        <AnimatePresence initial={false}>
          {rows.map((r) => {
            const you = r.user.id === viewerId;
            const person = members.find((m) => m.id === r.user.id);
            const content = (
              <>
                <Avatar
                  name={r.user.displayName}
                  color={person?.avatarColor}
                  avatar={person?.avatar}
                  size="md"
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] font-medium">
                    {you ? 'You' : r.user.displayName}
                  </span>
                  {you ? (
                    <span className="block text-xs text-muted-foreground">Tap to remove</span>
                  ) : null}
                </span>
                <span className="text-2xl leading-none" aria-label={`reacted ${r.emoji}`}>
                  {r.emoji}
                </span>
              </>
            );
            return (
              <motion.li
                key={r.user.id}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exit.fast }}
                transition={spring.soft}
              >
                {you ? (
                  <button
                    type="button"
                    onClick={onRemoveMine}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">{content}</div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </Dialog>
  );
}

import { Inbox } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { NavLink, useMatch } from 'react-router';
import { cn } from '@/lib/cn';
import { exit, spring } from '@/lib/motion';
import { firstName, useRequestInbox } from './inbox';

/**
 * Pinned above the chats while anyone new is waiting: message requests and group invites. It opens
 * and closes in place, like a chat row.
 */
export function RequestsRow() {
  const { requests, invites, count } = useRequestInbox();
  const active = useMatch('/requests') !== null;
  const reduced = useReducedMotion() ?? false;
  const names = [
    ...invites.map((i) => i.name),
    ...requests.map((c) => firstName(c.peer?.displayName ?? c.title)),
  ];

  return (
    <AnimatePresence initial={false}>
      {count > 0 ? (
        <motion.div
          key="requests"
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: reduced ? { duration: 0 } : exit.collapse }}
          transition={reduced ? { duration: 0 } : spring.panel}
        >
          <div className="pb-1.5">
            <NavLink
              to="/requests"
              data-conversation-id="requests"
              aria-label={`Requests, ${count} waiting`}
              className={cn(
                'relative flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 outline-offset-[-2px] transition-colors',
                active
                  ? 'border-transparent bg-muted ring-1 ring-border/60'
                  : 'border-border hover:bg-muted/70',
              )}
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-text">
                <Inbox className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold tracking-tight">Requests</span>
                <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                  {names.join(', ')}
                </span>
              </span>
              <motion.span
                key={count}
                className="tabular inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={spring.pop}
              >
                {count > 99 ? '99+' : count}
              </motion.span>
            </NavLink>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

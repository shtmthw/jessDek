import { ArrowLeft, ChevronRight, Inbox } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { Skeleton } from '@/components/Skeleton';
import type { Conversation, GroupInvite } from '@/lib/gql';
import { exit, spring } from '@/lib/motion';
import { formatListTime } from '@/lib/time';
import { firstName, useRequestInbox } from './inbox';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The pane header: back to chats on phones, and the title. */
export function PaneHeader({ title, back = '/' }: { title: ReactNode; back?: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-1 border-b border-border/80 bg-background/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md md:px-6">
      <Link
        to={back}
        aria-label={back === '/' ? 'Back to chats' : 'Back'}
        className="inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted md:hidden"
      >
        <ArrowLeft className="size-5" />
      </Link>
      <h1 className="px-2 text-[17px] font-semibold tracking-tight md:px-0">{title}</h1>
    </header>
  );
}

function Row({ to, children }: { to: string; children: ReactNode }) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: exit.collapse }}
      transition={spring.panel}
      className="overflow-hidden"
    >
      <Link
        to={to}
        className="flex min-h-[4.25rem] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/70"
      >
        {children}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </motion.li>
  );
}

function InviteRow({ invite }: { invite: GroupInvite }) {
  return (
    <Row to={`/invite/${invite.conversationId}`}>
      <Avatar name={invite.name} group />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold tracking-tight">{invite.name}</span>
          <span className="tabular shrink-0 text-xs text-muted-foreground">
            {formatListTime(invite.createdAt)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {firstName(invite.invitedBy.displayName)} invited you ·{' '}
          {plural(invite.members.length, 'member')}
        </span>
      </span>
    </Row>
  );
}

function RequestRow({ conversation: c }: { conversation: Conversation }) {
  const peer = c.peer;
  return (
    <Row to={`/c/${c.id}`}>
      <Avatar name={c.title} color={peer?.avatarColor} avatar={peer?.avatar} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[15px] font-semibold tracking-tight">{c.title}</span>
            {peer ? (
              <span className="truncate text-xs text-muted-foreground">@{peer.username}</span>
            ) : null}
          </span>
          <span className="tabular shrink-0 text-xs text-muted-foreground">
            {formatListTime(c.lastMessage?.createdAt ?? c.lastMessageAt)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-foreground/80">
          {c.lastMessage?.body.replace(/\s+/g, ' ') ?? ''}
        </span>
      </span>
    </Row>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul>
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </section>
  );
}

/** Message requests and group invites from people you haven't talked to yet. */
export function RequestsPage() {
  const { requests, invites, count, loading } = useRequestInbox();
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PaneHeader title="Requests" />
      <motion.div
        className="mx-auto w-full max-w-lg space-y-6 px-2 py-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
      >
        {count === 0 && loading ? (
          <div className="space-y-3 px-3" aria-busy>
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center px-8 py-14 text-center">
            <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Inbox className="size-5" />
            </div>
            <p className="font-semibold">No requests</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              When someone new messages you or invites you to a group, it shows up here.
            </p>
          </div>
        ) : (
          <>
            <p className="px-3 text-sm text-muted-foreground">
              From people you haven’t chatted with yet. They won’t know you’ve seen a request until
              you answer it.
            </p>
            {invites.length ? (
              <Section title="Group invites">
                {invites.map((i) => (
                  <InviteRow key={i.conversationId} invite={i} />
                ))}
              </Section>
            ) : null}
            {requests.length ? (
              <Section title="Message requests">
                {requests.map((c) => (
                  <RequestRow key={c.id} conversation={c} />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </motion.div>
    </div>
  );
}

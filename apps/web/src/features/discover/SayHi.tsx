import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { SendHorizontal, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { buttonClass } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { upsertConversation } from '@/lib/cacheUpdates';
import { CONVERSATIONS, SEND_MESSAGE, START_DIRECT, type Card } from '@/lib/gql';
import { cn } from '@/lib/cn';
import { expectOwnConversation } from '@/lib/sounds';
import { interestEmoji } from '../card/CardView';
import { parseCard, type CardRecipe } from '../card/recipe';
import { useMyCard } from '../card/useMyCard';
import { applyMessage } from '../realtime/EventsProvider';
import { firstName } from '../requests/inbox';
import { useViewer } from '../session/ViewerProvider';
import { interestWord, sharedInterests, suggestOpeners } from './openers';

const BODY_MAX = 4000;

const messageOf = (err: unknown) =>
  (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
  'Couldn’t send that. Try again.';

/** Panel shell: the rounded box from the sketch. */
function Box({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'w-full rounded-[20px] border border-border bg-background shadow-sm md:max-w-[460px]',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Someone you already have a chat (or request) with: no openers, just where things stand. */
function Known({
  title,
  sub,
  to,
  action,
}: {
  title: string;
  sub: string;
  to?: string;
  action?: string;
}) {
  return (
    <Box className="p-5">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      {to && action ? (
        <Link to={to} className={buttonClass('primary', 'md', 'mt-4')}>
          {action}
        </Link>
      ) : null}
    </Box>
  );
}

/**
 * The card view's chat box (the sketch's "Agm" window): a few auto-generated openers as radio
 * options, a box to edit the chosen one, and send. It goes out as the ordinary message request.
 */
export function SayHi({ them, recipe }: { them: Card; recipe: CardRecipe }) {
  const viewer = useViewer();
  const client = useApolloClient();
  const navigate = useNavigate();
  const name = firstName(them.user.displayName);
  const { data: mine, loading: mineLoading } = useMyCard();
  const myInterests = useMemo(() => parseCard(mine?.recipe).interests, [mine?.recipe]);
  const shared = useMemo(
    () => sharedInterests(recipe.interests, myInterests),
    [recipe, myInterests],
  );
  const openers = useMemo(
    () =>
      suggestOpeners({
        id: them.id,
        displayName: them.user.displayName,
        theirs: recipe.interests,
        mine: myInterests,
        about: recipe.about,
      }),
    [them, recipe, myInterests],
  );

  const [choice, setChoice] = useState<number | null>(0);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  // Fill in the first opener once yours are known, unless you've started writing.
  useEffect(() => {
    if (edited) return;
    setChoice(0);
    setText(openers[0] ?? '');
  }, [openers, edited]);

  const [startDirect] = useMutation(START_DIRECT);
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [busy, setBusy] = useState(false);

  const { data: list } = useQuery(CONVERSATIONS, { fetchPolicy: 'cache-first' });
  const chat = list?.conversations.find(
    (c) => c.type === 'DIRECT' && c.peer?.username === them.user.username,
  );
  const request = chat?.request ?? null;

  if (request?.state === 'PENDING' && request.sentByMe && request.sentAt) {
    return (
      <Known
        title="Request sent"
        sub={`${name} can accept or decline. You’ll hear either way.`}
        to={`/c/${chat!.id}`}
        action="View request"
      />
    );
  }
  if (request?.state === 'DECLINED' && request.sentByMe) {
    return (
      <Known
        title={`${name} declined your request`}
        sub={`You can’t send another unless ${name} reaches out.`}
      />
    );
  }
  if (request?.state === 'PENDING' && !request.sentByMe) {
    return (
      <Known
        title={`${name} sent you a message request`}
        sub="Have a look and accept or decline it."
        to={`/c/${chat!.id}`}
        action="Open request"
      />
    );
  }

  if (chat && !request) {
    return chat.canMessage ? (
      <Known
        title={`You already chat with ${name}`}
        sub="No need for an opener: pick up where you left off."
        to={`/c/${chat.id}`}
        action="Open chat"
      />
    ) : (
      <Known title={`You can’t message ${name}`} sub="One of you blocked the other." />
    );
  }

  const body = text.trim();
  async function send() {
    if (!body || busy) return;
    setBusy(true);
    expectOwnConversation();
    try {
      const { data } = await startDirect({ variables: { username: them.user.username } });
      if (!data) return;
      const convo = data.startDirect;
      upsertConversation(client, convo);
      const { data: sent } = await sendMessage({ variables: { conversationId: convo.id, body } });
      if (sent) applyMessage(client, viewer.id, sent.sendMessage);
      navigate(`/c/${convo.id}`);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <div className="px-5 pb-4 pt-5">
        <h2 className="text-[17px] font-semibold tracking-tight">Say hi to {name}</h2>
        {shared.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] text-muted-foreground">You both like</span>
            {shared.map((it) => (
              <span
                key={typeof it === 'string' ? it : `t:${it.t}`}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-brand/10 px-2.5 text-[13px] font-medium text-brand-text"
              >
                {interestEmoji(it) ? <span aria-hidden>{interestEmoji(it)}</span> : null}
                {upper(interestWord(it))}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-border px-2 pb-2 pt-3">
        <p className="flex items-center gap-1.5 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3.5 text-brand-text" aria-hidden /> Suggested openers
        </p>
        {mineLoading && !mine ? (
          <div className="space-y-3 px-3 py-1" aria-busy>
            <Skeleton className="h-10" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : (
          <div role="radiogroup" aria-label="Suggested openers" className="space-y-0.5">
            {openers.map((line, i) => (
              <label
                key={line}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-[15px] leading-snug transition-colors',
                  choice === i ? 'bg-brand/10 font-medium' : 'hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="opener"
                  value={i}
                  checked={choice === i}
                  onChange={() => {
                    setChoice(i);
                    setText(line);
                    setEdited(false);
                  }}
                  className="mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-full border-[1.5px] border-muted-foreground/60 bg-background transition-colors checked:border-[5px] checked:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text"
                />
                <span>{line}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="say-hi" className="sr-only">
          Your message to {name}
        </label>
        <textarea
          id="say-hi"
          rows={2}
          maxLength={BODY_MAX}
          value={text}
          placeholder="Type a message"
          onChange={(e) => {
            setText(e.target.value);
            setEdited(true);
            setChoice(
              openers.indexOf(e.target.value) === -1 ? null : openers.indexOf(e.target.value),
            );
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          className="max-h-40 min-h-12 flex-1 resize-none rounded-2xl bg-muted px-4 py-3 text-[15px] leading-snug outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-text/40"
        />
        <button
          type="submit"
          aria-label="Send message request"
          disabled={!body || busy}
          aria-busy={busy || undefined}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm transition-[transform,opacity] hover:bg-brand/90 active:scale-95 disabled:opacity-50"
        >
          <SendHorizontal className="size-5" />
        </button>
      </form>
      <p className="px-5 pb-4 text-center text-[13px] text-muted-foreground">
        Sent as a message request: one message until {name} accepts.
      </p>
    </Box>
  );
}

const upper = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

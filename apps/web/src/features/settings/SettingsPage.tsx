import { useMutation, useQuery } from '@apollo/client';
import {
  ArrowLeft,
  Check,
  Copy,
  Feather,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Play,
  Share,
  Sparkles,
  Sun,
} from 'lucide-react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button, buttonClass } from '@/components/Button';
import { Field, Input } from '@/components/Input';
import { Segmented } from '@/components/Segmented';
import { Switch } from '@/components/Switch';
import { useMediaConfig } from '@/features/media/config';
import { formatBytes } from '@/features/media/format';
import { usePref, type AutoDownload } from '@/features/media/prefs';
import * as mediaStore from '@/features/media/store';
import { cn } from '@/lib/cn';
import { resetSession } from '@/lib/apollo';
import { BLOCKED_USERS, SIGN_OUT, UPDATE_PROFILE } from '@/lib/gql';
import { prefersReducedMotion } from '@/lib/media';
import { easeOut, exit, spring } from '@/lib/motion';
import { playSound, useSoundsEnabled, type SoundKind } from '@/lib/sounds';
import { useThemePreference, type ThemePreference } from '@/lib/theme';
import { useDeckQuality, type DeckQuality } from '@/lib/deckQuality';
import { CardView } from '../card/CardView';
import { parseCard } from '../card/recipe';
import { cardUrl, copyCardLink, shareCard } from '../card/share';
import { useMyCard } from '../card/useMyCard';
import { useChatActions } from '../chat/useChatActions';
import { useViewer } from '../session/ViewerProvider';

const SOUND_PREVIEWS: Array<{ kind: SoundKind; label: string; hint: string }> = [
  { kind: 'dm', label: 'Direct message', hint: 'When someone messages you' },
  { kind: 'group', label: 'Group message', hint: 'A softer variant for group chats' },
  { kind: 'newChat', label: 'New chat', hint: 'When someone starts a chat with you' },
  { kind: 'addedToGroup', label: 'Added to a group', hint: 'When someone adds you to a group' },
];

const AUTO_DOWNLOAD: Array<{ value: AutoDownload; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'photos', label: 'Photos only' },
  { value: 'off', label: 'Off' },
];

const swap = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6, transition: exit.fast },
  transition: spring.soft,
};

const DECK_QUALITY: Array<{ value: DeckQuality; label: string; icon: typeof Sun; hint: string }> = [
  {
    value: 'full',
    label: 'Full quality',
    icon: Sparkles,
    hint: 'Every card in full: stickers, patterns, finishes and shadows.',
  },
  {
    value: 'light',
    label: 'Light',
    icon: Feather,
    hint: 'Simpler cards and snappier motion while you browse, easier on older phones and laptops. A card you open is always shown in full.',
  },
];

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** Switch themes with a soft crossfade where the browser supports view transitions. */
function changeTheme(apply: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || prefersReducedMotion()) return apply();
  doc.startViewTransition(() => flushSync(apply));
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 id={id} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** What photos and videos this device holds, and a way to clear them. */
function useMediaUsage() {
  const [usage, setUsage] = useState<mediaStore.Usage | null>(null);
  const refresh = useCallback(() => {
    void mediaStore.usage().then(setUsage, () => undefined);
  }, []);
  useEffect(() => {
    refresh();
    return mediaStore.onStoreChange(refresh);
  }, [refresh]);
  return { usage, refresh };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SettingsPage() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const [theme, setTheme] = useThemePreference();
  const [soundsOn, setSoundsOn] = useSoundsEnabled();
  const [deckQuality, setDeckQuality] = useDeckQuality();
  const [displayName, setDisplayName] = useState(viewer.displayName);
  const [updateProfile, update] = useMutation(UPDATE_PROFILE);
  const [signOut, out] = useMutation(SIGN_OUT);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mediaConfig = useMediaConfig();
  const [autoDownload, setAutoDownload] = usePref('media:autodownload');
  const [relayOnly, setRelayOnly] = usePref('media:relayOnly');
  const { usage } = useMediaUsage();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const hasMedia = (usage?.photos ?? 0) + (usage?.videos ?? 0) > 0;

  const dirty = displayName.trim() !== viewer.displayName && displayName.trim() !== '';

  async function save() {
    setError(null);
    try {
      await updateProfile({
        variables: { input: { displayName, avatarColor: viewer.avatarColor } },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      toast.success('Profile updated');
    } catch (err) {
      setError(
        (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
          'Couldn’t save. Try again.',
      );
    }
  }

  async function logout() {
    try {
      await signOut();
    } finally {
      // Leave this account's page behind, so whoever signs in next starts at home.
      navigate('/', { replace: true });
      await resetSession();
    }
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <header className="sticky top-0 z-10 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-1 border-b border-border/80 bg-background/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md md:px-6">
        <Link
          to="/"
          aria-label="Back to chats"
          className="inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted md:hidden"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="px-2 text-[17px] font-semibold tracking-tight md:px-0">Settings</h1>
      </header>

      <motion.div
        className="mx-auto max-w-lg space-y-10 px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
      >
        <Section id="profile-heading" title="Profile" description="How you appear to others.">
          <div className="flex items-center gap-4">
            {/* A big touch target for the same place the Edit button goes. */}
            <Link
              to="/settings/avatar"
              tabIndex={-1}
              aria-hidden
              className="group relative shrink-0 rounded-full"
            >
              <Avatar
                name={displayName || viewer.username}
                color={viewer.avatarColor}
                avatar={viewer.avatar}
                size="lg"
                className="transition-transform duration-200 ease-out-quint motion-safe:group-hover:scale-[1.04] motion-safe:group-active:scale-95"
              />
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 inline-flex size-6 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-border"
              >
                <Pencil className="size-3" strokeWidth={2.5} />
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold tracking-tight">
                {displayName.trim() || viewer.username}
              </p>
              {/* One line where there's room; on a phone the email gets its own, so it isn't cut short. */}
              <p className="text-sm text-muted-foreground sm:truncate">
                <span className="block truncate sm:inline">@{viewer.username}</span>
                <span aria-hidden className="hidden sm:inline">
                  {' · '}
                </span>
                <span className="block truncate sm:inline">{viewer.email}</span>
              </p>
            </div>
            <Link to="/settings/avatar" className={buttonClass('secondary', 'sm')}>
              Edit avatar
            </Link>
          </div>
          <Field label="Display name" error={error}>
            {(p) => (
              <Input
                {...p}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
              />
            )}
          </Field>
          <Button
            disabled={!dirty}
            loading={update.loading}
            onClick={() => void save()}
            className={cn('min-w-36', saved && 'disabled:opacity-100')}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={saved ? 'saved' : 'save'}
                className="inline-flex items-center gap-1.5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: exit.fast }}
                transition={spring.snappy}
              >
                {saved ? (
                  <>
                    <Check className="size-4" strokeWidth={2.5} /> Saved
                  </>
                ) : (
                  'Save changes'
                )}
              </motion.span>
            </AnimatePresence>
          </Button>
        </Section>

        <YourCard />

        <Section
          id="appearance-heading"
          title="Appearance"
          description="Follow your device, or pick a side."
        >
          <Segmented
            kind="radio"
            label="Theme"
            value={theme}
            onChange={(t) => changeTheme(() => setTheme(t))}
            options={THEMES.map(({ value, label, icon: Icon }) => ({
              value,
              label,
              icon: <Icon className="size-4" />,
            }))}
          />
        </Section>

        <Section
          id="discover-heading"
          title="Discover"
          description="How the card deck is drawn on this device."
        >
          <div>
            <Segmented
              kind="radio"
              label="Card deck"
              value={deckQuality}
              onChange={setDeckQuality}
              options={DECK_QUALITY.map(({ value, label, icon: Icon }) => ({
                value,
                label,
                icon: <Icon className="size-4" />,
              }))}
            />
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              {DECK_QUALITY.find((o) => o.value === deckQuality)?.hint}
            </p>
          </div>
        </Section>

        <Section
          id="sounds-heading"
          title="Sounds"
          description="A soft chime when something happens in a chat you're not looking at."
        >
          <div className="flex items-center justify-between gap-4">
            <span id="sounds-toggle-label" className="text-sm font-medium">
              Notification sounds
            </span>
            <Switch
              checked={soundsOn}
              onChange={setSoundsOn}
              aria-labelledby="sounds-toggle-label"
            />
          </div>
          <ul
            className={cn(
              'divide-y divide-border rounded-xl border border-border transition-opacity duration-200',
              !soundsOn && 'opacity-55',
            )}
            aria-label="Sound previews"
          >
            {SOUND_PREVIEWS.map(({ kind, label, hint }) => (
              <li key={kind} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Play the ${label.toLowerCase()} sound`}
                  title="Preview"
                  onClick={() => playSound(kind, { force: true })}
                >
                  <Play className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Section>

        {mediaConfig?.enabled === false ? null : (
          <Section
            id="media-heading"
            title="Photos & videos"
            description="Sent device to device. Nothing is stored on the server."
          >
            <div>
              <Segmented
                kind="radio"
                label="Auto-download"
                value={autoDownload}
                onChange={setAutoDownload}
                options={AUTO_DOWNLOAD}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Downloads start when something scrolls into view. Videos up to 50 MB.
              </p>
            </div>

            {mediaConfig?.relay ? (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span id="relay-only-label" className="text-sm font-medium">
                    Hide my IP address
                  </span>
                  <p id="relay-only-hint" className="mt-0.5 text-xs text-muted-foreground">
                    Device-to-device transfers let others in a chat see your IP address. Turn this
                    on to pass media through the server instead. It’s slower, and the server still
                    doesn’t keep anything.
                  </p>
                </div>
                <Switch
                  checked={relayOnly}
                  onChange={setRelayOnly}
                  aria-labelledby="relay-only-label"
                  aria-describedby="relay-only-hint"
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">On this device</p>
                <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
                  {usage
                    ? `${formatBytes(usage.bytes)} · ${plural(usage.photos, 'photo', 'photos')}, ${plural(usage.videos, 'video', 'videos')}`
                    : '…'}
                </p>
              </div>
              <AnimatePresence initial={false} mode="popLayout">
                {!confirmClear ? (
                  <motion.div key="clear" {...swap}>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!hasMedia}
                      onClick={() => setConfirmClear(true)}
                    >
                      Clear…
                    </Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            <AnimatePresence initial={false}>
              {confirmClear ? (
                <motion.div key="confirm" className="space-y-2" {...swap}>
                  <p className="text-sm text-muted-foreground">
                    Remove all photos and videos from this device? People who haven’t downloaded
                    them yet won’t be able to get them from you.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => setConfirmClear(false)}
                    >
                      Keep
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={() => {
                        void mediaStore
                          .clearAll()
                          .then(() => toast.success('Removed from this device'));
                        setConfirmClear(false);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </Section>
        )}

        <BlockedPeople />

        <section className="border-t border-border pt-8">
          <AnimatePresence initial={false} mode="popLayout">
            {confirmSignOut ? (
              <motion.div key="confirm" className="space-y-3" {...swap}>
                <p className="text-center text-sm text-muted-foreground">
                  Sign out? Photos and videos on this device will be removed, and people who haven’t
                  downloaded them yet won’t be able to get them from you.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setConfirmSignOut(false)}
                  >
                    Stay
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    loading={out.loading}
                    onClick={() => void logout()}
                  >
                    <LogOut className="size-4" /> Sign out
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="signout" {...swap}>
                <Button
                  variant="danger"
                  loading={out.loading}
                  // Only ask when signing out would actually remove something.
                  onClick={() => (hasMedia ? setConfirmSignOut(true) : void logout())}
                  className="w-full"
                >
                  <LogOut className="size-4" /> Sign out
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </motion.div>
    </div>
  );
}

/** Everyone you blocked, with a way back. */
function BlockedPeople() {
  const { data, loading } = useQuery(BLOCKED_USERS, { fetchPolicy: 'cache-and-network' });
  const actions = useChatActions();
  const people = data?.blockedUsers ?? [];
  return (
    <Section
      id="blocked-heading"
      title="Blocked people"
      description="They can’t message you or add you to groups, and you don’t see each other online."
    >
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {loading && !data ? '…' : 'Nobody. You can block someone from a chat’s menu.'}
        </p>
      ) : (
        <ul
          className="divide-y divide-border rounded-xl border border-border"
          aria-labelledby="blocked-heading"
        >
          <AnimatePresence initial={false}>
            {people.map((u) => (
              <motion.li
                key={u.id}
                layout="position"
                className="flex items-center gap-3 px-3.5 py-2.5"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exit.fast }}
                transition={spring.soft}
              >
                <Avatar name={u.displayName} color={u.avatarColor} avatar={u.avatar} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.displayName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{u.username}
                  </span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => void actions.unblock(u)}>
                  Unblock
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Section>
  );
}

/** The card link row opens its space first, then the row itself settles into it. */
const linkReveal: Variants = {
  closed: { height: 0, transition: exit.collapse },
  open: { height: 'auto', transition: spring.panel },
};
const linkRow: Variants = {
  closed: { opacity: 0, y: -6, scale: 0.98, transition: exit.fast },
  open: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...spring.soft, opacity: { duration: 0.22, delay: 0.05, ease: easeOut } },
  },
};

/** A small look at your card, a way to edit and share it, and whether the link is public. */
function YourCard() {
  const viewer = useViewer();
  const mine = useMyCard();
  const card = parseCard(mine.data?.recipe ?? null);
  // The switch answers the tap at once; the server catches up behind it. Saves go one at a time and
  // always end on the latest tap, so a slow reply can never land after a newer one and flip it back.
  const [pending, setPending] = useState<boolean | null>(null);
  const wanted = useRef<boolean | null>(null);
  const saving = useRef(false);
  const shared = pending ?? mine.data?.shared ?? false;

  function setShared(next: boolean) {
    wanted.current = next;
    setPending(next);
    if (!saving.current) void saveLatest();
  }

  async function saveLatest() {
    saving.current = true;
    let sent: boolean | null = null;
    try {
      while (wanted.current !== null && wanted.current !== sent) {
        const value: boolean = wanted.current;
        await mine.save({ shared: value });
        sent = value;
      }
      toast.success(sent ? 'Your card link is on' : 'Your card link is off');
    } catch {
      toast.error('Couldn’t change that. Try again.');
    } finally {
      saving.current = false;
      wanted.current = null;
      // The last save is already in the cache, so handing back to it doesn't flicker. After a
      // failure, this slides the switch back to what's really saved.
      setPending(null);
    }
  }

  return (
    <Section id="card-heading" title="Your card" description="What people see when they tap you.">
      <div className="flex items-center gap-5">
        <Link to="/settings/card" aria-label="Edit your card" className="shrink-0 rounded-xl">
          <CardView
            card={card}
            user={{ ...viewer, avatar: viewer.avatar }}
            width={132}
            hideStickers={false}
            className="transition-transform duration-200 ease-out-quint motion-safe:hover:-rotate-2 motion-safe:hover:scale-[1.03]"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Link to="/settings/card" className={buttonClass('secondary', 'sm', 'justify-start')}>
            <Pencil className="size-4" /> Edit card
          </Link>
          <Button
            variant="secondary"
            size="sm"
            className="justify-start"
            onClick={() => void shareCard(viewer)}
          >
            <Share className="size-4" /> Share
          </Button>
        </div>
      </div>
      {/* One child of the section, so its spacing can't jump when the link row comes and goes:
          the gap above the row lives inside the height that animates. */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span id="card-shared-label" className="text-sm font-medium">
              Share my card
            </span>
            <p id="card-shared-hint" className="mt-0.5 text-xs text-muted-foreground">
              Anyone with the link can see your card, even without an account. People on jessDek can
              always see it.
            </p>
          </div>
          <Switch
            checked={shared}
            onChange={setShared}
            aria-labelledby="card-shared-label"
            aria-describedby="card-shared-hint"
          />
        </div>
        <AnimatePresence initial={false}>
          {shared ? (
            <motion.div
              key="link"
              className="overflow-hidden"
              variants={linkReveal}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <motion.div variants={linkRow} className="origin-top pt-4">
                <div className="flex items-center gap-2 rounded-xl border border-border py-1.5 pl-3.5 pr-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {cardUrl(viewer.username)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyCardLink(viewer.username)}
                  >
                    <Copy className="size-4" /> Copy
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Section>
  );
}

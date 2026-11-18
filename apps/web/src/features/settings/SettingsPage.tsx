import { useMutation } from '@apollo/client';
import { ArrowLeft, Check, LogOut, Monitor, Moon, Play, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Input';
import { Segmented } from '@/components/Segmented';
import { Switch } from '@/components/Switch';
import { cn } from '@/lib/cn';
import { resetSession } from '@/lib/apollo';
import { SIGN_OUT, UPDATE_PROFILE } from '@/lib/gql';
import { prefersReducedMotion } from '@/lib/media';
import { exit, spring } from '@/lib/motion';
import { playSound, useSoundsEnabled, type SoundKind } from '@/lib/sounds';
import { useThemePreference, type ThemePreference } from '@/lib/theme';
import { useViewer } from '../session/ViewerProvider';

const COLORS: Array<{ value: string; name: string }> = [
  { value: '#6366f1', name: 'Indigo' },
  { value: '#0ea5e9', name: 'Sky' },
  { value: '#14b8a6', name: 'Teal' },
  { value: '#22c55e', name: 'Green' },
  { value: '#eab308', name: 'Amber' },
  { value: '#f97316', name: 'Orange' },
  { value: '#ec4899', name: 'Pink' },
  { value: '#a855f7', name: 'Purple' },
];

const SOUND_PREVIEWS: Array<{ kind: SoundKind; label: string; hint: string }> = [
  { kind: 'dm', label: 'Direct message', hint: 'When someone messages you' },
  { kind: 'group', label: 'Group message', hint: 'A softer variant for group chats' },
  { kind: 'newChat', label: 'New chat', hint: 'When someone starts a chat with you' },
  { kind: 'addedToGroup', label: 'Added to a group', hint: 'When someone adds you to a group' },
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

export function SettingsPage() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const [theme, setTheme] = useThemePreference();
  const [soundsOn, setSoundsOn] = useSoundsEnabled();
  const [displayName, setDisplayName] = useState(viewer.displayName);
  const [color, setColor] = useState(viewer.avatarColor);
  const [updateProfile, update] = useMutation(UPDATE_PROFILE);
  const [signOut, out] = useMutation(SIGN_OUT);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    (displayName.trim() !== viewer.displayName && displayName.trim() !== '') ||
    color !== viewer.avatarColor;

  async function save() {
    setError(null);
    try {
      await updateProfile({ variables: { input: { displayName, avatarColor: color } } });
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
            <motion.div
              key={color}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={spring.pop}
            >
              <Avatar name={displayName || viewer.username} color={color} size="lg" />
            </motion.div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold tracking-tight">
                {displayName.trim() || viewer.username}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                @{viewer.username} · {viewer.email}
              </p>
            </div>
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
          <div>
            <p className="mb-2.5 text-sm font-medium" id="color-label">
              Avatar color
            </p>
            <div
              className="flex flex-wrap gap-2 md:gap-2.5"
              role="radiogroup"
              aria-labelledby="color-label"
            >
              {COLORS.map((c) => {
                const selected = color === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={c.name}
                    title={c.name}
                    onClick={() => setColor(c.value)}
                    className="relative inline-flex size-9 items-center justify-center rounded-full outline-offset-4 md:size-10 transition-transform duration-200 ease-out-quint motion-safe:hover:scale-105 motion-safe:active:scale-95"
                  >
                    {selected ? (
                      <motion.span
                        layoutId="avatar-color-ring"
                        aria-hidden
                        className="absolute -inset-1 rounded-full ring-2 ring-foreground"
                        transition={spring.snappy}
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="size-8 rounded-full md:size-9"
                      style={{ backgroundColor: c.value }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
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

        <section className="border-t border-border pt-8">
          <Button
            variant="danger"
            loading={out.loading}
            onClick={() => void logout()}
            className="w-full"
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </section>
      </motion.div>
    </div>
  );
}

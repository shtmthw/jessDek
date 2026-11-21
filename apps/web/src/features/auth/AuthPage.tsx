import { useMutation } from '@apollo/client';
import { Eye, EyeOff } from 'lucide-react';
import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { Segmented } from '@/components/Segmented';
import { ME, SIGN_IN, SIGN_UP } from '@/lib/gql';
import { prefersReducedMotion } from '@/lib/media';
import { exit, spring } from '@/lib/motion';
import { validateSignIn, validateSignUp } from './validation';

type Mode = 'signin' | 'signup';
type Errors = Record<string, string | undefined>;

const COPY: Record<Mode, { title: string; subtitle: string }> = {
  signin: { title: 'Welcome back', subtitle: 'Sign in to pick up your conversations.' },
  signup: { title: 'Create your account', subtitle: 'Takes a few seconds. No spam, ever.' },
};

/** Pulls a friendly message and (when the server named one) the field out of an Apollo error. */
function describeError(err: unknown): { field?: string; message: string } {
  const gqlError = (
    err as { graphQLErrors?: Array<{ message: string; extensions?: { field?: string } }> }
  ).graphQLErrors?.[0];
  if (gqlError) return { message: gqlError.message, field: gqlError.extensions?.field };
  return { message: 'Can’t reach the server. Check your connection and try again.' };
}

const enter = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: spring.soft,
};

export function AuthPage() {
  const navigate = useNavigate();
  // A shared card's "Create an account" arrives here asking for the sign-up form.
  const { state } = useLocation() as { state: { auth?: Mode } | null };
  const [mode, setMode] = useState<Mode>(state?.auth === 'signup' ? 'signup' : 'signin');
  const [values, setValues] = useState({ identifier: '', username: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [card, animateCard] = useAnimate<HTMLDivElement>();

  const [signIn, signInState] = useMutation(SIGN_IN);
  const [signUp, signUpState] = useMutation(SIGN_UP);
  const loading = signInState.loading || signUpState.loading;

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setFormError(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
  };

  // A small headshake says "that didn't work" before you've even read the message,
  // and focus lands on the first field that needs fixing.
  const reject = () => {
    requestAnimationFrame(() =>
      card.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(),
    );
    if (!card.current || prefersReducedMotion()) return;
    void animateCard(card.current, { x: [0, -9, 8, -6, 4, -2, 0] }, { duration: 0.45 });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    const found: Errors = mode === 'signin' ? validateSignIn(values) : validateSignUp(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      reject();
      return;
    }

    try {
      if (mode === 'signin') {
        await signIn({
          variables: { input: { identifier: values.identifier.trim(), password: values.password } },
          update: (cache, { data }) =>
            data && cache.writeQuery({ query: ME, data: { me: data.signIn } }),
        });
      } else {
        await signUp({
          variables: {
            input: {
              username: values.username.trim(),
              email: values.email.trim(),
              password: values.password,
            },
          },
          update: (cache, { data }) => {
            if (!data) return;
            // A brand-new account starts at home, wherever the address bar was left.
            navigate('/', { replace: true });
            cache.writeQuery({ query: ME, data: { me: data.signUp } });
          },
        });
      }
    } catch (err) {
      const { field, message } = describeError(err);
      if (field && field in values) setErrors({ [field]: message });
      else setFormError(message);
      reject();
    }
  }

  return (
    <div className="h-dvh overflow-y-auto">
      {/* Anchored near the top (not centred) so the tabs stay put while the form grows below them. */}
      <div className="flex min-h-full justify-center px-5 pb-10 pt-[max(clamp(2.5rem,13vh,8rem),env(safe-area-inset-top))]">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={spring.pop}
            >
              <Logo size={52} />
            </motion.div>
            <div className="mt-5 grid">
              {/* The old heading leaves before the new one arrives, so they never overprint. */}
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={mode}
                  className="col-start-1 row-start-1"
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: exit.fast }}
                  transition={spring.soft}
                >
                  <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">
                    {COPY[mode].title}
                  </h1>
                  <p className="mt-1.5 text-[15px] text-muted-foreground">{COPY[mode].subtitle}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <Segmented
            kind="tabs"
            label="Account"
            className="mb-6"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'signin', label: 'Sign in' },
              { value: 'signup', label: 'Sign up' },
            ]}
          />

          <div ref={card}>
            <form onSubmit={submit} noValidate className="space-y-4">
              {mode === 'signin' ? (
                <motion.div key="identifier" {...enter}>
                  <Field label="Username or email" error={errors.identifier}>
                    {(p) => (
                      <Input
                        {...p}
                        value={values.identifier}
                        onChange={set('identifier')}
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        autoFocus
                      />
                    )}
                  </Field>
                </motion.div>
              ) : (
                <>
                  <motion.div key="username" {...enter}>
                    <Field
                      label="Username"
                      error={errors.username}
                      hint="3–20 letters, numbers or underscores. This is how people find you."
                    >
                      {(p) => (
                        <Input
                          {...p}
                          value={values.username}
                          onChange={set('username')}
                          autoComplete="username"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          autoFocus
                        />
                      )}
                    </Field>
                  </motion.div>
                  <motion.div key="email" {...enter} transition={{ ...spring.soft, delay: 0.04 }}>
                    <Field label="Email" error={errors.email}>
                      {(p) => (
                        <Input
                          {...p}
                          type="email"
                          value={values.email}
                          onChange={set('email')}
                          autoComplete="email"
                        />
                      )}
                    </Field>
                  </motion.div>
                </>
              )}

              {/* Fields below the swap glide to their new place instead of jumping. */}
              <motion.div layout="position" transition={spring.panel} className="space-y-4">
                <Field
                  label="Password"
                  error={errors.password}
                  hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
                >
                  {(p) => (
                    <div className="relative">
                      <Input
                        {...p}
                        type={showPassword ? 'text' : 'password'}
                        value={values.password}
                        onChange={set('password')}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        className="pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                          <motion.span
                            key={showPassword ? 'hide' : 'show'}
                            className="inline-flex"
                            initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.6, rotate: 20, transition: exit.fast }}
                            transition={spring.snappy}
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </motion.span>
                        </AnimatePresence>
                      </button>
                    </div>
                  )}
                </Field>

                {formError ? (
                  <motion.p
                    key={formError}
                    role="alert"
                    className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={spring.snappy}
                  >
                    {formError}
                  </motion.p>
                ) : null}

                <Button type="submit" loading={loading} className="w-full">
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
              </motion.div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

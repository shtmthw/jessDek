import { useQuery } from '@apollo/client';
import { MotionConfig, motion } from 'motion/react';
import { Toaster } from 'sonner';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { ME } from '@/lib/gql';
import { easeOut } from '@/lib/motion';
import { useThemePreference } from '@/lib/theme';
import { AppShell } from './features/AppShell';
import { AuthPage } from './features/auth/AuthPage';
import { EventsProvider } from './features/realtime/EventsProvider';
import { ViewerProvider } from './features/session/ViewerProvider';

/** Each top-level screen fades in. No exit: signed-in screens must unmount at once on sign-out. */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="h-dvh"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center" aria-busy aria-label="Loading">
      <div className="breathe">
        <Logo size={52} />
      </div>
    </div>
  );
}

export default function App() {
  const { data, loading, error, refetch } = useQuery(ME);
  const [theme] = useThemePreference();

  let key: string;
  let screen: React.ReactNode;
  if (loading && !data) {
    key = 'splash';
    screen = <Splash />;
  } else if (error && !data) {
    key = 'offline';
    screen = (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 px-8 text-center">
        <Logo size={48} />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Can’t reach the server</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Check your connection and that the app is running, then try again.
        </p>
        <Button onClick={() => void refetch()} className="mt-4">
          Try again
        </Button>
      </div>
    );
  } else if (!data?.me) {
    key = 'auth';
    screen = <AuthPage />;
  } else {
    key = 'app';
    screen = (
      <ViewerProvider viewer={data.me}>
        <EventsProvider>
          <AppShell />
        </EventsProvider>
      </ViewerProvider>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <Screen key={key}>{screen}</Screen>
      <Toaster
        position="top-center"
        theme={theme}
        closeButton={false}
        gap={8}
        toastOptions={{
          className:
            '!rounded-2xl !border-border !bg-background !font-sans !text-foreground !shadow-lg !text-sm',
        }}
      />
    </MotionConfig>
  );
}

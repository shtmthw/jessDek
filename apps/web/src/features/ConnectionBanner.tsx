import { Check, Loader2, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useConnectionState } from '@/lib/connection';
import { cn } from '@/lib/cn';
import { exit, spring } from '@/lib/motion';

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

type Status = 'hidden' | 'offline' | 'reconnecting' | 'back';

/**
 * A small floating pill: appears only if the live connection has been down for a moment,
 * says so plainly, and confirms briefly when everything is back.
 */
export function ConnectionBanner() {
  const state = useConnectionState();
  const online = useOnline();
  // What's wrong right now, if anything. "connecting" is neither: it's an attempt in progress.
  const problem: Status | null = !online ? 'offline' : state === 'closed' ? 'reconnecting' : null;
  const [status, setStatus] = useState<Status>('hidden');
  const shown = useRef(false);

  useEffect(() => {
    if (problem) {
      // Brief blips stay invisible; once the pill is up, it updates at once.
      const t = setTimeout(
        () => {
          shown.current = true;
          setStatus(problem);
        },
        shown.current ? 0 : 1500,
      );
      return () => clearTimeout(t);
    }
    if (state === 'idle') {
      // Signed out or no live data needed: nothing to report.
      shown.current = false;
      setStatus('hidden');
      return;
    }
    // Only a real connection clears the pill; an attempt in progress keeps "Reconnecting…".
    if (state !== 'connected' || !shown.current) return;
    shown.current = false;
    setStatus('back');
    const t = setTimeout(() => setStatus('hidden'), 1800);
    return () => clearTimeout(t);
  }, [problem, state]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center px-4"
    >
      <AnimatePresence>
        {status !== 'hidden' ? (
          <motion.div
            key="pill"
            layout
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium shadow-md ring-1',
              status === 'back'
                ? 'bg-background text-foreground ring-border'
                : 'bg-foreground text-background ring-transparent',
            )}
            initial={{ opacity: 0, y: -16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96, transition: exit.base }}
            transition={spring.soft}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={status}
                className="inline-flex items-center gap-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, transition: exit.fast }}
                transition={spring.snappy}
              >
                {status === 'offline' ? (
                  <>
                    <WifiOff className="size-4" aria-hidden />
                    You’re offline. Messages will send when you’re back.
                  </>
                ) : status === 'reconnecting' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Reconnecting…
                  </>
                ) : (
                  <>
                    <Check className="size-4 text-online" strokeWidth={2.5} aria-hidden />
                    Connected
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

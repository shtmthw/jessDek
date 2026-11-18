import { ArrowLeftRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/Button';
import { exit, spring } from '@/lib/motion';

/** Shown the first time someone adds a photo or video: where it goes, and why it may take a moment. */
export function MediaIntro({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      className="overflow-hidden"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', transition: { ...spring.soft } }}
      exit={{ opacity: 0, height: 0, transition: exit.base }}
    >
      <motion.div
        className="mb-2 flex gap-3 rounded-2xl bg-muted/70 p-3 text-sm"
        initial={{ y: 8 }}
        animate={{ y: 0 }}
        transition={spring.soft}
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-text">
          <ArrowLeftRight className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Sent device to device</p>
          <p className="mt-0.5 text-muted-foreground">
            Photos and videos go straight to the people in this chat and are never stored on the
            server, so they can be downloaded while someone who has them is online.
          </p>
          <Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={onDismiss}>
            Got it
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

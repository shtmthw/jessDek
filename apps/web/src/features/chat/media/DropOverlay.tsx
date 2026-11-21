import { ImagePlus } from 'lucide-react';
import { motion } from 'motion/react';
import { exit, spring } from '@/lib/motion';

/** Covers the chat while files are dragged over it. Keyboard users have the attach button instead. */
export function DropOverlay({ name }: { name: string }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-brand-text/50 bg-background/85 backdrop-blur-sm"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: exit.fast }}
      transition={spring.soft}
    >
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-brand/10 text-brand-text">
        <ImagePlus className="size-7" />
      </span>
      <p className="text-[15px] font-semibold">Drop to send to {name}</p>
      <p className="text-sm text-muted-foreground">Photos and videos, up to 10 at a time</p>
    </motion.div>
  );
}

import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from '@/components/Avatar';
import { exit, spring } from '@/lib/motion';
import type { Typer } from '../realtime/typing';

/** At most this many faces next to the dots; more people than that just add to the dots' company. */
const MAX_FACES = 3;

/**
 * The "someone is typing" bubble. In a group it carries the face of whoever is typing (up to
 * three, side by side), in the spot a message from them would have, so you can tell who it is
 * without reading the header. In a one-to-one chat there is only one person it could be.
 */
export function TypingBubble({ typers, group }: { typers: Typer[]; group: boolean }) {
  const faces = typers.slice(0, MAX_FACES);
  return (
    <motion.div
      aria-hidden
      data-typing-bubble
      className="mt-3 flex items-end gap-2"
      style={{ transformOrigin: '0% 100%' }}
      initial={{ opacity: 0, y: 8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, transition: exit.fast }}
      transition={spring.soft}
    >
      {group ? (
        <span className="mb-px flex shrink-0 items-center gap-1">
          <AnimatePresence initial={false} mode="popLayout">
            {faces.map((t) => (
              <motion.span
                key={t.id}
                layout
                data-typing-face={t.id}
                title={t.name}
                className="inline-flex"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6, transition: exit.fast }}
                transition={spring.pop}
              >
                <Avatar name={t.name} color={t.color} avatar={t.avatar} size="sm" />
              </motion.span>
            ))}
          </AnimatePresence>
        </span>
      ) : null}
      <span className="inline-flex h-9 items-center gap-1 rounded-[20px] bg-bubble px-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot size-1.5 rounded-full bg-muted-foreground"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </motion.div>
  );
}

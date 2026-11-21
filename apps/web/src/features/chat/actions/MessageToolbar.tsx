import { MoreHorizontal, Reply, SmilePlus, type LucideIcon } from 'lucide-react';
import { motion, useTransform, type MotionValue } from 'motion/react';
import { cn } from '@/lib/cn';
import { SWIPE_THRESHOLD_PX } from './useBubbleGestures';

function ToolButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      // Mouse shortcuts only: the keyboard way in is the message itself (Enter for actions, R to reply).
      tabIndex={-1}
      aria-label={label}
      title={label}
      onClick={(e) => onClick(e.currentTarget)}
      className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-[17px]" />
    </button>
  );
}

/**
 * React · Reply · More, beside a message while the mouse is over it (never on touch screens:
 * long-press and swipe do these there). Stays up while its menu is open.
 */
export function MessageToolbar({
  active,
  onReact,
  onReply,
  onMore,
}: {
  active: boolean;
  onReact: (button: HTMLButtonElement) => void;
  onReply: () => void;
  onMore: (button: HTMLButtonElement) => void;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center rounded-full bg-background p-0.5 shadow-sm ring-1 ring-border',
        'transition-[opacity,transform] duration-150 ease-out-quint pointer-coarse:hidden',
        active
          ? 'pointer-events-auto scale-100 opacity-100'
          : 'pointer-events-none scale-95 opacity-0 group-hover/msg:pointer-events-auto group-hover/msg:scale-100 group-hover/msg:opacity-100',
      )}
    >
      <ToolButton icon={SmilePlus} label="React" onClick={onReact} />
      <ToolButton icon={Reply} label="Reply" onClick={() => onReply()} />
      <ToolButton icon={MoreHorizontal} label="More" onClick={onMore} />
    </div>
  );
}

/** The reply arrow behind a bubble being swiped: it grows in and turns brand once letting go would reply. */
export function SwipeReplyHint({ x }: { x: MotionValue<number> }) {
  const progress = useTransform(x, [8, SWIPE_THRESHOLD_PX], [0, 1], { clamp: true });
  const scale = useTransform(progress, [0, 1], [0.4, 1]);
  // A switch, not a blend: it flips the moment letting go would reply.
  const armed = (v: number) => v >= SWIPE_THRESHOLD_PX - 0.5;
  const background = useTransform(x, (v) => (armed(v) ? 'var(--brand)' : 'var(--muted)'));
  const color = useTransform(x, (v) =>
    armed(v) ? 'var(--brand-foreground)' : 'var(--muted-foreground)',
  );
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute left-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full"
      style={{ opacity: progress, scale, background, color }}
    >
      <Reply className="size-4" />
    </motion.span>
  );
}

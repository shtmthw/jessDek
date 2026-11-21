import { motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

/** Knob travel: the 48px track, minus 2px padding on each side, minus the 24px knob. */
const TRAVEL = 20;
/** How far the knob stretches while it's held down, so a press feels like it has weight. */
const STRETCH = 5;

/** An on/off switch whose knob glides across. Label it with `aria-labelledby` or `aria-label`. */
export function Switch({
  checked,
  onChange,
  className,
  ...aria
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}) {
  const [pressed, setPressed] = useState(false);
  const release = () => setPressed(false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      onPointerDown={(e) => {
        if (e.button === 0) setPressed(true);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onBlur={release}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 touch-manipulation items-center rounded-full p-0.5 transition-colors duration-300 ease-out-quint',
        checked ? 'bg-brand' : 'bg-border',
        className,
      )}
      {...aria}
    >
      {/* Moved with a transform (not layout) so nothing else on the page can make it jump. While
          held, it stretches toward the side it's about to travel to, keeping its far edge put. */}
      <motion.span
        aria-hidden
        className="h-6 rounded-full bg-white shadow-sm"
        initial={false}
        animate={{
          width: pressed ? 24 + STRETCH : 24,
          x: checked ? TRAVEL - (pressed ? STRETCH : 0) : 0,
        }}
        transition={spring.toggle}
      />
    </button>
  );
}

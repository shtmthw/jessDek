import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

/** An on/off switch whose knob springs across. Label it with `aria-labelledby` or `aria-label`. */
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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
        checked ? 'justify-end bg-brand' : 'justify-start bg-border',
        className,
      )}
      {...aria}
    >
      <motion.span
        layout
        aria-hidden
        className="size-6 rounded-full bg-white shadow-sm"
        transition={spring.snappy}
      />
    </button>
  );
}

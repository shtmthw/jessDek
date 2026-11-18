import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/**
 * A segmented control whose thumb glides to the chosen option.
 * `kind="tabs"` exposes tab semantics (switches what is shown); `kind="radio"` a radio group (a setting).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  kind,
  label,
  className,
}: {
  options: Array<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  kind: 'tabs' | 'radio';
  label: string;
  className?: string;
}) {
  const thumbId = useId();
  const tabs = kind === 'tabs';

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? options.length - 1
          : (index + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
    buttons[next]?.focus();
  }

  return (
    <div
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      onKeyDown={onKeyDown}
      // `isolate` + a negative z-index keep the thumb under every label while it glides, in either direction.
      className={cn(
        'relative isolate grid auto-cols-fr grid-flow-col rounded-xl bg-muted p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            {...(tabs ? { 'aria-selected': active } : { 'aria-checked': active })}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium md:h-9',
              'transition-colors duration-200',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active ? (
              <motion.span
                layoutId={thumbId}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm ring-1 ring-black/[0.03] dark:bg-border/70 dark:ring-white/[0.04]"
                transition={spring.snappy}
              />
            ) : null}
            <span className="relative inline-flex items-center gap-2">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { exit, spring } from '@/lib/motion';

export const inputClass = cn(
  'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-base shadow-sm outline-none md:h-10 md:text-sm',
  'transition-[border-color,box-shadow] duration-200 ease-out-quint',
  'hover:border-muted-foreground/40',
  'focus:border-brand-text/60 focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_12%,transparent)] focus:hover:border-brand-text/60',
);

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        inputClass,
        'focus-visible:outline-none',
        invalid &&
          'border-danger/70 hover:border-danger focus:border-danger focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_14%,transparent)] focus:hover:border-danger',
        className,
      )}
      {...props}
    />
  );
});

/** Label + control + inline error, wired together for screen readers. */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: (props: { id: string; 'aria-describedby'?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const messageId = `${id}-msg`;
  const message = error || hint;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': message ? messageId : undefined,
        invalid: Boolean(error),
      })}
      {/* The message opens and closes in place so the fields below glide instead of jumping.
          A fixed error leaves at once, so an outdated alert never lingers. */}
      <AnimatePresence initial={false}>
        {message ? (
          <motion.div
            key="message"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: error ? { duration: 0 } : exit.base }}
            transition={spring.panel}
          >
            {error ? (
              <motion.p
                key={error}
                id={messageId}
                role="alert"
                className="pt-1.5 text-sm text-danger"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.snappy}
              >
                {error}
              </motion.p>
            ) : (
              <p id={messageId} className="pt-1.5 text-[13px] text-muted-foreground">
                {hint}
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

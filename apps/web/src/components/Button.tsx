import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'md' | 'sm' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-foreground shadow-sm hover:bg-brand/90',
  secondary: 'bg-muted text-foreground hover:bg-border/70',
  outline: 'border border-border bg-background text-foreground shadow-sm hover:bg-muted',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  danger: 'bg-danger/10 text-danger hover:bg-danger/15',
};
const sizes: Record<Size, string> = {
  md: 'h-11 px-4 text-[15px] md:h-10 md:text-sm',
  sm: 'h-9 px-3 text-sm',
  icon: 'size-11 md:size-9',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-xl font-medium',
    'transition-[background-color,color,opacity,transform,box-shadow] duration-150 ease-out-quint',
    'motion-safe:active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
    variants[variant],
    sizes[size],
    className,
  );

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      <AnimatePresence initial={false}>
        {loading ? (
          <motion.span
            key="spinner"
            aria-hidden
            className="inline-flex"
            initial={{ opacity: 0, width: 0, scale: 0.5 }}
            animate={{ opacity: 1, width: 'auto', scale: 1 }}
            exit={{ opacity: 0, width: 0, scale: 0.5 }}
            transition={spring.snappy}
          >
            <Loader2 className="size-4 animate-spin" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      {children}
    </button>
  );
}

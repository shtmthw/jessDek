import { Users } from 'lucide-react';
import { cn } from '@/lib/cn';

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-7 text-[11px]',
  md: 'size-10 text-sm',
  lg: 'size-16 text-xl',
} as const;

const dots = {
  xs: 'size-2 ring-[1.5px]',
  sm: 'size-2.5 ring-2',
  md: 'size-3 ring-2',
  lg: 'size-4 ring-[3px]',
} as const;

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function Avatar({
  name,
  color,
  size = 'md',
  online,
  group,
  className,
}: {
  name: string;
  color?: string;
  size?: keyof typeof sizes;
  online?: boolean;
  group?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        aria-hidden
        className={cn(
          'inline-flex select-none items-center justify-center rounded-full font-semibold tracking-tight text-white',
          'transition-[background-color] duration-300 ease-out-quint',
          group && 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
          sizes[size],
        )}
        style={group ? undefined : { backgroundColor: color ?? '#71717a' }}
      >
        {group ? (
          <Users className={size === 'sm' || size === 'xs' ? 'size-3.5' : 'size-[42%]'} />
        ) : (
          initials(name)
        )}
      </span>
      {/* The dot is always rendered so presence changes can grow and fade instead of blinking. */}
      <span
        {...(online ? { role: 'img', 'aria-label': 'Online' } : { 'aria-hidden': true })}
        className={cn(
          'absolute bottom-0 right-0 rounded-full bg-online ring-background',
          'transition-[transform,opacity] duration-300 ease-out-expo',
          online ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
          dots[size],
        )}
      />
    </span>
  );
}

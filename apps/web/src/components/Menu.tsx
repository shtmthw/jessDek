import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { exit, spring } from '@/lib/motion';

/**
 * A small action menu that springs out of its trigger. Radix handles focus, arrow keys, typeahead
 * and Esc; this only adds the look and the motion.
 */
export function Menu({
  trigger,
  children,
  align = 'end',
}: {
  /** A single focusable element (usually an icon button). */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  return (
    <RadixMenu.Root open={open} onOpenChange={setOpen}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <AnimatePresence>
        {open ? (
          <RadixMenu.Portal forceMount>
            <RadixMenu.Content
              asChild
              forceMount
              align={align}
              sideOffset={6}
              collisionPadding={12}
            >
              <motion.div
                className="z-50 min-w-52 rounded-2xl bg-background p-1.5 shadow-lg outline-none ring-1 ring-border"
                style={{ transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)' }}
                initial={{ opacity: 0, scale: 0.94, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: exit.fast }}
                transition={spring.snappy}
              >
                {children}
              </motion.div>
            </RadixMenu.Content>
          </RadixMenu.Portal>
        ) : null}
      </AnimatePresence>
    </RadixMenu.Root>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  danger,
  onSelect,
}: {
  icon: LucideIcon;
  children: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <RadixMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 text-[15px] outline-none md:min-h-9 md:text-sm',
        'transition-colors duration-100 data-[highlighted]:bg-muted',
        danger ? 'text-danger data-[highlighted]:bg-danger/10' : 'text-foreground',
      )}
    >
      <Icon className={cn('size-4 shrink-0', danger ? '' : 'text-muted-foreground')} aria-hidden />
      {children}
    </RadixMenu.Item>
  );
}

export const MenuSeparator = () => <RadixMenu.Separator className="mx-1.5 my-1 h-px bg-border" />;

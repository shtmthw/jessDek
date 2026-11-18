import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useIsDesktop } from '@/lib/media';
import { exit, spring } from '@/lib/motion';
import { AutoHeight } from './AutoHeight';
import { Button } from './Button';

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 600;

/** A modal that floats near the top on desktop and becomes a draggable bottom sheet on phones. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const desktop = useIsDesktop();
  const reduced = useReducedMotion() ?? false;
  const drag = useDragControls();

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) onOpenChange(false);
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--scrim)] backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.18 } }}
                exit={{ opacity: 0, transition: exit.base }}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content
              asChild
              forceMount
              {...(description ? {} : { 'aria-describedby': undefined })}
            >
              <motion.div
                className={cn(
                  'fixed z-50 flex max-h-[88dvh] flex-col bg-background shadow-lg outline-none',
                  desktop
                    ? 'inset-x-0 top-[12vh] mx-auto w-[calc(100%-2rem)] max-w-md rounded-2xl ring-1 ring-border'
                    : 'inset-x-0 bottom-0 rounded-t-[1.75rem] pb-[env(safe-area-inset-bottom)] ring-1 ring-border',
                  className,
                )}
                style={desktop ? { transformOrigin: '50% 0%' } : undefined}
                initial={
                  reduced
                    ? { opacity: 0 }
                    : desktop
                      ? { opacity: 0, scale: 0.96, y: -8 }
                      : { y: '100%' }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={
                  reduced
                    ? { opacity: 0, transition: exit.base }
                    : desktop
                      ? { opacity: 0, scale: 0.97, y: -6, transition: exit.fast }
                      : // A spring picks up the speed of a drag-down, so a flick carries straight through.
                        {
                          y: '100%',
                          transition: { type: 'spring', visualDuration: 0.3, bounce: 0 },
                        }
                }
                // The panel turns opaque almost at once so nothing behind it reads through while it settles.
                transition={
                  desktop
                    ? { ...spring.soft, opacity: { duration: 0.07, ease: 'linear' } }
                    : spring.panel
                }
                drag={desktop ? false : 'y'}
                dragListener={false}
                dragControls={drag}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.04, bottom: 0.9 }}
                onDragEnd={onDragEnd}
              >
                {!desktop ? (
                  <div
                    className="flex h-6 shrink-0 cursor-grab touch-none select-none items-end justify-center active:cursor-grabbing"
                    onPointerDown={(e) => drag.start(e)}
                    aria-hidden
                  >
                    <span className="h-1.5 w-10 rounded-full bg-border" />
                  </div>
                ) : null}
                <div
                  className={cn(
                    'flex items-start justify-between gap-4 px-5 pb-2',
                    desktop ? 'pt-5' : 'touch-none select-none pt-2',
                  )}
                  onPointerDown={desktop ? undefined : (e) => drag.start(e)}
                >
                  <div className="min-w-0">
                    <RadixDialog.Title className="text-[17px] font-semibold tracking-tight">
                      {title}
                    </RadixDialog.Title>
                    {description ? (
                      <RadixDialog.Description className="mt-0.5 text-sm text-muted-foreground">
                        {description}
                      </RadixDialog.Description>
                    ) : null}
                  </div>
                  <RadixDialog.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Close"
                      className="-mr-2 -mt-1.5"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <X className="size-[18px]" />
                    </Button>
                  </RadixDialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
                  <AutoHeight>{children}</AutoHeight>
                </div>
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

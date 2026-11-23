import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from 'motion/react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useIsDesktop } from '@/lib/media';
import { exit, spring, tf } from '@/lib/motion';
import { AutoHeight } from './AutoHeight';
import { Button } from './Button';

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 600;

/**
 * A modal that floats near the top on desktop and becomes a draggable bottom sheet on phones.
 *
 * `header` and `footer` stay put above and below the scrolling body (a live preview, actions).
 * They sit outside the scroll area rather than being sticky inside it: sticky content jumps while
 * the body's animated height clips it, and jitters under Firefox's async scrolling.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  header,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const desktop = useIsDesktop();
  const reduced = useReducedMotion() ?? false;
  const drag = useDragControls();

  // A hairline under the pinned header once the body has scrolled beneath it.
  const [scrolled, setScrolled] = useState(false);
  const unwatch = useRef<(() => void) | null>(null);
  const body = useCallback((el: HTMLDivElement | null) => {
    unwatch.current?.();
    unwatch.current = null;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 2);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    unwatch.current = () => el.removeEventListener('scroll', onScroll);
  }, []);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) onOpenChange(false);
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              {/* No backdrop blur: it re-blurs the whole app under every frame the dialog animates.
                  `data-scrim`: see index.css (body pointer-events). */}
              <motion.div
                data-scrim
                className="fixed inset-0 z-40 bg-[var(--scrim)]"
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
                // Desktop animates one `transform` string (not motion's separate scale and y), so the
                // browser runs it on the compositor: mounting the dialog can't stall it. Phones keep
                // `y`, which the drag-down needs.
                initial={
                  reduced
                    ? { opacity: 0 }
                    : desktop
                      ? { opacity: 0, transform: tf({ y: -8, scale: 0.96 }) }
                      : { y: '100%' }
                }
                animate={desktop ? { opacity: 1, transform: tf() } : { opacity: 1, y: 0 }}
                exit={
                  reduced
                    ? { opacity: 0, transition: exit.base }
                    : desktop
                      ? {
                          opacity: 0,
                          transform: tf({ y: -6, scale: 0.97 }),
                          transition: exit.fast,
                        }
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
                {header ? (
                  <div
                    className={cn(
                      'shrink-0 border-b px-5 pb-3 pt-2 transition-[border-color] duration-200',
                      scrolled ? 'border-border' : 'border-transparent',
                    )}
                  >
                    {header}
                  </div>
                ) : null}
                <div
                  ref={header ? body : undefined}
                  className={cn(
                    'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5',
                    header ? 'pt-3' : 'pt-2',
                    footer ? 'pb-4' : 'pb-5',
                  )}
                >
                  <AutoHeight>{children}</AutoHeight>
                </div>
                {footer ? (
                  <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
                    {footer}
                  </div>
                ) : null}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

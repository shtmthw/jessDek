import { lazy, Suspense } from 'react';
import { Dialog } from '@/components/Dialog';
import { Skeleton } from '@/components/Skeleton';

// The picker and its emoji list (~33 KB compressed) load the first time someone opens it.
const EmojiPicker = lazy(() => import('./EmojiPicker'));
/** Start fetching the picker before it's needed (e.g. when the reaction bar opens). */
export const preloadEmojiPicker = () => void import('./EmojiPicker');

function Loading() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy aria-label="Loading emoji">
      <Skeleton className="h-11 w-full rounded-xl md:h-10" />
      <div className="grid h-[min(52dvh,22rem)] grid-cols-8 content-start gap-1.5 pt-10 sm:grid-cols-9">
        {Array.from({ length: 40 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Every emoji, in a dialog (a bottom sheet on phones): reactions, and card stickers and interests. */
export function EmojiPickerDialog({
  open,
  onOpenChange,
  current,
  onPick,
  title = 'Choose a reaction',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string | null;
  onPick: (emoji: string) => void;
  title?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <Suspense fallback={<Loading />}>
        <EmojiPicker
          current={current}
          onPick={(emoji) => {
            onPick(emoji);
            onOpenChange(false);
          }}
        />
      </Suspense>
    </Dialog>
  );
}

import { toast } from 'sonner';
import { isTouchDevice } from '@/lib/media';

/** The readable link to someone's card (CARDS_PLAN.md §1). */
export const cardPath = (username: string) => `/@${username}`;
export const cardUrl = (username: string) => `${location.origin}${cardPath(username)}`;

/** Copies the link, with a toast. */
export async function copyCardLink(username: string) {
  try {
    await navigator.clipboard.writeText(cardUrl(username));
    toast.success('Link copied');
  } catch {
    toast.error('Couldn’t copy. The link is ' + cardUrl(username));
  }
}

/** The system share sheet on phones (and anywhere it exists); otherwise copies the link. */
export async function shareCard(user: { username: string; displayName: string }) {
  const url = cardUrl(user.username);
  if (typeof navigator.share === 'function' && isTouchDevice()) {
    try {
      await navigator.share({ title: `${user.displayName} on Realtime`, url });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  await copyCardLink(user.username);
}

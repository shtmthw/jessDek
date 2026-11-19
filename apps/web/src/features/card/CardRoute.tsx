import { useEffect, useRef } from 'react';
import { useStartChat } from './useStartChat';

/*
 * The light half of the /@username routes, always in the main bundle. The pages themselves are in
 * CardPages.tsx and load on demand (see lazy.tsx).
 */

/** The username in a card link (`/@name`), or null when the path isn't one. */
export function matchCardPath(pathname: string): string | null {
  const m = /^\/@([a-z0-9_]{3,20})\/?$/i.exec(pathname);
  return m ? m[1]!.toLowerCase() : null;
}

/** Where a signed-out visitor's "Message @name" waits for them to sign in. */
export const PENDING_CHAT = 'pendingChat';

/**
 * After signing in from someone's card ("Message @name" while signed out), open that chat once.
 * Mounted in the signed-in app.
 */
export function usePendingChat() {
  const { start } = useStartChat();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    let username: string | null = null;
    try {
      username = sessionStorage.getItem(PENDING_CHAT);
      sessionStorage.removeItem(PENDING_CHAT);
    } catch {
      return;
    }
    if (username) void start(username);
  }, [start]);
}

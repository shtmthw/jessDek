import { createContext, type RefObject } from 'react';

/** The message list's scroller, so media tiles can load when they come near the viewport. */
export const ScrollRootContext = createContext<RefObject<HTMLElement | null> | null>(null);

import { createContext } from 'react';

/** The key of the item the viewer shows right now: its tile hides while the viewer "carries" it. */
export const OpenMediaContext = createContext<string | null>(null);

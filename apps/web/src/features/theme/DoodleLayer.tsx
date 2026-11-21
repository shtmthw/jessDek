import { useId } from 'react';
import { doodlePattern } from './doodles';

/**
 * A wallpaper's doodles, filling the layer. Its own chunk: the doodles re-draw the card stickers,
 * which only themed chats need. `currentColor` takes the mode's ink from the layer (index.css).
 */
export default function DoodleLayer({ id, scale = 1 }: { id: string; scale?: number }) {
  const uid = `cw${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pattern = doodlePattern(id, 'currentColor', uid, scale);
  if (!pattern) return null;
  return (
    <svg className="absolute inset-0 size-full animate-[doodles-in_0.3s_ease-out]" data-doodles>
      <defs>{pattern}</defs>
      <rect width="100%" height="100%" fill={`url(#${uid})`} />
    </svg>
  );
}

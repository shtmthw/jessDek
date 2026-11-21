import type { Conversation } from '@/lib/gql';
import { CUSTOM, parseTheme, themeSpec } from './recipe';

type ThemeFields = Pick<Conversation, 'theme' | 'themeSetBy' | 'themeSetAt'>;

/**
 * "You changed the theme to Matcha", "Bob reset the theme": what the chat says about its latest
 * theme change. Null when the theme was never changed.
 */
export function themeChangeText(c: ThemeFields, viewerId: string): string | null {
  if (!c.themeSetAt) return null;
  const spec = themeSpec(parseTheme(c.theme));
  const who = !c.themeSetBy
    ? null
    : c.themeSetBy.id === viewerId
      ? 'You'
      : (c.themeSetBy.displayName.split(' ')[0] ?? 'Someone');
  if (spec.classic) return who ? `${who} reset the theme` : 'The theme was reset';
  if (spec.id === CUSTOM) return who ? `${who} made a custom theme` : 'The theme was customized';
  return who
    ? `${who} changed the theme to ${spec.label}`
    : `The theme was changed to ${spec.label}`;
}

/**
 * The chat-list line for a theme change, when it's the newest thing in the chat (newer than the
 * last message and the reaction the list would mention). Quiet, like reactions.
 */
export function themePreviewText(
  c: ThemeFields & Pick<Conversation, 'lastMessage' | 'lastReaction'>,
  viewerId: string,
): string | null {
  if (!c.themeSetAt) return null;
  const at = Date.parse(c.themeSetAt);
  if (c.lastMessage && Date.parse(c.lastMessage.createdAt) >= at) return null;
  if (c.lastReaction && Date.parse(c.lastReaction.reactedAt) >= at) return null;
  return themeChangeText(c, viewerId);
}

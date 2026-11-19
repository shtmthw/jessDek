import type { ReactionPreview } from './gql';

const EXCERPT_MAX = 40;

/** “see you at 7”, or "a photo" / "a video" / "a message" when there's no text to quote. */
function excerpt(message: ReactionPreview['message']): string {
  const text = message.body.replace(/\s+/g, ' ').trim();
  if (text) {
    let cut = text;
    if (text.length > EXCERPT_MAX) {
      cut = text.slice(0, EXCERPT_MAX - 1);
      // End on a whole word when there is one reasonably close to the limit.
      const space = cut.lastIndexOf(' ');
      if (space > EXCERPT_MAX / 2) cut = cut.slice(0, space);
      cut = `${cut.trimEnd()}…`;
    }
    return `“${cut}”`;
  }
  const kind = message.attachments[0]?.kind;
  return kind === 'IMAGE' ? 'a photo' : kind === 'VIDEO' ? 'a video' : 'a message';
}

/**
 * The chat-list line for a reaction ("Bob reacted ❤️ to “see you at 7”"), or null when there's
 * nothing to say: no reaction, or a message has arrived since (the cached reaction is then stale).
 */
export function reactionPreviewText(
  reaction: ReactionPreview | null | undefined,
  lastMessage: { createdAt: string } | null | undefined,
  viewerId: string,
): string | null {
  if (!reaction) return null;
  if (lastMessage && Date.parse(lastMessage.createdAt) >= Date.parse(reaction.reactedAt)) {
    return null;
  }
  const who =
    reaction.user.id === viewerId ? 'You' : (reaction.user.displayName.split(' ')[0] ?? 'Someone');
  return `${who} reacted ${reaction.emoji} to ${excerpt(reaction.message)}`;
}

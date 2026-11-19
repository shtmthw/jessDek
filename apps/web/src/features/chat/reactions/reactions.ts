import type { Reaction } from '@/lib/gql';

/** The quick reactions, in order. Fully-qualified emojis: the server rejects bare text forms. */
export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'] as const;

export interface ReactionGroup {
  emoji: string;
  count: number;
  /** You're one of them. */
  mine: boolean;
  /** Who, in the order they reacted ("You" for you). */
  names: string[];
}

/** Reactions grouped by emoji: most popular first, ties in the order they first appeared. */
export function groupReactions(reactions: readonly Reaction[], viewerId: string): ReactionGroup[] {
  const groups = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    const g = groups.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
    g.count += 1;
    if (r.user.id === viewerId) {
      g.mine = true;
      g.names.unshift('You');
    } else g.names.push(r.user.displayName);
    groups.set(r.emoji, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** "❤️ You, Bob · 😂 Carol" */
export const reactionSummary = (groups: readonly ReactionGroup[]) =>
  groups.map((g) => `${g.emoji} ${g.names.join(', ')}`).join(' · ');

export const myReaction = (reactions: readonly Reaction[] | undefined, viewerId: string) =>
  reactions?.find((r) => r.user.id === viewerId)?.emoji ?? null;

/**
 * What picking `emoji` means: picking your current emoji again takes it back (null), anything
 * else becomes your one reaction.
 */
export const toggleTarget = (current: string | null, emoji: string | null) =>
  emoji !== null && emoji === current ? null : emoji;

/**
 * The reactions after you set (or remove) yours, as the server will return them: one per person,
 * in the order people first reacted, so changing your emoji keeps your place.
 */
export function applyReaction(
  reactions: readonly Reaction[],
  viewer: { id: string; displayName: string },
  emoji: string | null,
  now = new Date(),
): Reaction[] {
  const at = now.toISOString();
  const index = reactions.findIndex((r) => r.user.id === viewer.id);
  if (emoji === null) return reactions.filter((r) => r.user.id !== viewer.id);
  const mine: Reaction = {
    __typename: 'Reaction',
    emoji,
    reactedAt: at,
    user: { __typename: 'User', id: viewer.id, displayName: viewer.displayName },
  };
  if (index === -1) return [...reactions, mine];
  return reactions.map((r, i) => (i === index ? mine : r));
}

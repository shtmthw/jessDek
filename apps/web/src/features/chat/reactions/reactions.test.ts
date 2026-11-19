import { describe, expect, it } from 'vitest';
import type { Reaction } from '@/lib/gql';
import { GROUPS, search } from './emojiData';
import {
  applyReaction,
  groupReactions,
  myReaction,
  QUICK_REACTIONS,
  reactionSummary,
  toggleTarget,
} from './reactions';

const r = (emoji: string, id: string, name = id): Reaction => ({
  emoji,
  reactedAt: '2026-11-19T10:00:00.000Z',
  user: { id, displayName: name },
});

describe('reaction helpers', () => {
  it('groups by emoji, most popular first, with you named first', () => {
    const groups = groupReactions(
      [r('😂', 'bob', 'Bob'), r('❤️', 'carol', 'Carol'), r('❤️', 'me', 'Me')],
      'me',
    );
    expect(groups).toEqual([
      { emoji: '❤️', count: 2, mine: true, names: ['You', 'Carol'] },
      { emoji: '😂', count: 1, mine: false, names: ['Bob'] },
    ]);
    expect(reactionSummary(groups)).toBe('❤️ You, Carol · 😂 Bob');
  });

  it('toggles: your current emoji again removes it, another replaces it', () => {
    expect(toggleTarget('❤️', '❤️')).toBeNull();
    expect(toggleTarget('❤️', '😂')).toBe('😂');
    expect(toggleTarget(null, '👍')).toBe('👍');
    expect(toggleTarget('👍', null)).toBeNull();
  });

  it('applies your reaction the way the server will: one each, keeping your place', () => {
    const me = { id: 'me', displayName: 'Me' };
    const start = [r('😂', 'bob'), r('❤️', 'me'), r('👍', 'carol')];
    const changed = applyReaction(start, me, '😮', new Date('2026-11-19T11:00:00Z'));
    expect(changed.map((x) => `${x.user.id}:${x.emoji}`)).toEqual(['bob:😂', 'me:😮', 'carol:👍']);
    expect(changed[1]!.reactedAt).toBe('2026-11-19T11:00:00.000Z');
    expect(applyReaction(start, me, null).map((x) => x.user.id)).toEqual(['bob', 'carol']);
    expect(applyReaction([], me, '🙏')).toHaveLength(1);
    expect(myReaction(start, 'me')).toBe('❤️');
    expect(myReaction(start, 'nobody')).toBeNull();
  });
});

describe('emoji picker data', () => {
  // The same check the server makes (apps/server/src/services/reactions.ts).
  const ONE_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');

  it('only offers emojis the server accepts, the quick ones included', () => {
    const all = GROUPS.flatMap((g) => g.emojis.map((e) => e[0]));
    expect(all.length).toBeGreaterThan(1500);
    expect(all.filter((e) => !ONE_EMOJI.test(e))).toEqual([]);
    for (const q of QUICK_REACTIONS) expect(ONE_EMOJI.test(q), q).toBe(true);
    for (const q of QUICK_REACTIONS) expect(all, q).toContain(q);
  });

  it('finds by name before tags, and needs every word to match', () => {
    expect(search('party')[0]?.[0]).toBe('🥳');
    expect(search('red heart')[0]?.[0]).toBe('❤️');
    expect(search('hea red').map((e) => e[0])).toContain('❤️');
    expect(search('thumbs up')[0]?.[0]).toBe('👍');
    expect(search('zzqx')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });
});

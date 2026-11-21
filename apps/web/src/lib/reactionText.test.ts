import { describe, expect, it } from 'vitest';
import type { ReactionPreview } from './gql';
import { reactionPreviewText } from './reactionText';

const reaction = (over: Partial<ReactionPreview> = {}): ReactionPreview => ({
  emoji: '❤️',
  reactedAt: '2026-11-19T10:00:00.000Z',
  user: { id: 'bob', displayName: 'Bob Carter' },
  message: { id: 'm1', body: 'see you at 7', sender: { id: 'alice' }, attachments: [] },
  ...over,
});

describe('reactionPreviewText', () => {
  it('names who reacted, with the emoji and a quote', () => {
    expect(reactionPreviewText(reaction(), null, 'alice')).toBe('Bob reacted ❤️ to “see you at 7”');
    expect(
      reactionPreviewText(reaction({ user: { id: 'alice', displayName: 'Alice' } }), null, 'alice'),
    ).toBe('You reacted ❤️ to “see you at 7”');
  });

  it('collapses whitespace and cuts long messages', () => {
    const long = reaction({
      message: {
        id: 'm1',
        body: 'this   is a\nvery long message that goes on and on and on',
        sender: { id: 'alice' },
        attachments: [],
      },
    });
    const text = reactionPreviewText(long, null, 'alice')!;
    expect(text).toBe('Bob reacted ❤️ to “this is a very long message that goes…”');
  });

  it('describes media without a caption', () => {
    const media = (kind: 'IMAGE' | 'VIDEO' | null) =>
      reaction({
        message: {
          id: 'm1',
          body: '',
          sender: { id: 'alice' },
          attachments: kind ? [{ id: 'a1', kind }] : [],
        },
      });
    expect(reactionPreviewText(media('IMAGE'), null, 'alice')).toBe('Bob reacted ❤️ to a photo');
    expect(reactionPreviewText(media('VIDEO'), null, 'alice')).toBe('Bob reacted ❤️ to a video');
    expect(reactionPreviewText(media(null), null, 'alice')).toBe('Bob reacted ❤️ to a message');
  });

  it('says nothing without a reaction, or once a newer message has arrived', () => {
    expect(reactionPreviewText(null, null, 'alice')).toBeNull();
    expect(
      reactionPreviewText(reaction(), { createdAt: '2026-11-19T10:00:01.000Z' }, 'alice'),
    ).toBeNull();
    expect(
      reactionPreviewText(reaction(), { createdAt: '2026-11-19T09:59:59.000Z' }, 'alice'),
    ).not.toBeNull();
  });
});

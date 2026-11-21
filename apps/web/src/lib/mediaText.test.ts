import { mediaPreviewText, mediaSummary } from './mediaText';

const img = { kind: 'IMAGE' as const };
const vid = { kind: 'VIDEO' as const };

describe('mediaSummary', () => {
  it.each([
    [[img], 'Photo', 'image'],
    [[img, img, img], '3 photos', 'image'],
    [[vid], 'Video', 'video'],
    [[vid, vid], '2 videos', 'video'],
    [[img, vid], '2 items', 'image'],
    [[img, img, vid, vid, vid], '5 items', 'image'],
  ] as const)('%j → %s', (list, text, icon) => {
    expect(mediaSummary(list)).toEqual({ text, icon });
  });

  it('is null without attachments', () => {
    expect(mediaSummary([])).toBeNull();
  });
});

describe('mediaPreviewText', () => {
  it('appends the caption after a middle dot, collapsing whitespace', () => {
    expect(mediaPreviewText([img], 'look\n  at   this')).toBe('Photo · look at this');
    expect(mediaPreviewText([vid, vid], ' hi ')).toBe('2 videos · hi');
  });
  it('is just the summary without a caption', () => {
    expect(mediaPreviewText([img], '')).toBe('Photo');
    expect(mediaPreviewText([img], '   ')).toBe('Photo');
  });
  it('falls back to the caption when there is no media', () => {
    expect(mediaPreviewText([], 'hello')).toBe('hello');
  });
});

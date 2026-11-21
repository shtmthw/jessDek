import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { buildTimeline } from '@/lib/messages';
import type { Conversation } from '@/lib/gql';
import { STICKERS } from '../card/stickers';
import { ACCENTS, BUBBLES, DOODLES, MEMBER_COLORS, WALLS } from './catalog';
import { contrast } from './color';
import { doodlePattern, scatterStickers } from './doodles';
import { themeChangeText, themePreviewText } from './notice';
import { PRESETS } from './presets';
import {
  customFrom,
  parseTheme,
  serializeTheme,
  themeSpec,
  THEME_MAX_BYTES,
  type ThemeSpec,
} from './recipe';
import { assignMemberColors, memberTokens, resolveTheme, themeVars, type Mode } from './resolve';

const MODES: Mode[] = ['light', 'dark'];

describe('theme recipes', () => {
  it('reads nothing, broken JSON and unknown presets as Classic', () => {
    for (const raw of [null, undefined, '', 'nope', '[]', '{"v":1}', '{"v":1,"preset":"nope"}'])
      expect(themeSpec(parseTheme(raw)).classic).toBe(true);
  });

  it('round-trips every preset, and Classic is stored as null', () => {
    for (const p of PRESETS) {
      const spec = themeSpec({ v: 1, preset: p.id });
      const stored = serializeTheme(spec);
      if (p.id === 'classic') expect(stored).toBeNull();
      else expect(themeSpec(parseTheme(stored))).toEqual(spec);
      expect((stored ?? '').length).toBeLessThanOrEqual(THEME_MAX_BYTES);
    }
  });

  it('keeps a custom theme’s parts and falls back for unknown ones', () => {
    const spec = themeSpec(
      parseTheme(
        JSON.stringify({ v: 1, preset: 'custom', accent: 'teal', wall: 'zzz', bubble: 'soft' }),
      ),
    );
    expect(spec).toMatchObject({
      id: 'custom',
      accent: 'teal',
      wall: 'plain',
      doodle: 'none',
      bubble: 'soft',
    });
    expect(themeSpec(parseTheme(serializeTheme(spec)))).toEqual(spec);
  });

  it('starts a custom theme from the current one', () => {
    const matcha = themeSpec({ v: 1, preset: 'matcha' });
    expect(customFrom(matcha, { accent: 'rose' })).toMatchObject({
      id: 'custom',
      accent: 'rose',
      wall: matcha.wall,
      doodle: matcha.doodle,
      classic: false,
    });
  });

  it('every preset uses parts that exist', () => {
    for (const p of PRESETS) {
      expect(
        ACCENTS.some((a) => a.id === p.accent),
        p.id,
      ).toBe(true);
      expect(
        WALLS.some((w) => w.id === p.wall),
        p.id,
      ).toBe(true);
      expect(
        DOODLES.some((d) => d.id === p.doodle),
        p.id,
      ).toBe(true);
    }
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});

/** Every combination a person can make, plus the presets. */
function everyTheme(): ThemeSpec[] {
  const out = PRESETS.map((p) => themeSpec({ v: 1, preset: p.id }));
  for (const accent of ACCENTS)
    for (const wall of WALLS)
      for (const bubble of BUBBLES)
        out.push(
          themeSpec({
            v: 1,
            preset: 'custom',
            accent: accent.id,
            wall: wall.id,
            bubble: bubble.id,
          }),
        );
  return out;
}

describe('contrast', () => {
  const themes = everyTheme();
  const name = (s: ThemeSpec, mode: Mode) => `${s.id}:${s.accent}/${s.wall}/${s.bubble} ${mode}`;

  it('bubble text reads at 4.5:1 on its bubble, in every theme and mode', () => {
    for (const s of themes)
      for (const mode of MODES) {
        const t = resolveTheme(s, mode);
        expect(contrast(t.onMine, t.mine), `mine ${name(s, mode)}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.onTheirs, t.theirs), `theirs ${name(s, mode)}`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrast(t.onAccent, t.accent), `accent ${name(s, mode)}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
  });

  it('accent text and quiet text read on the wallpaper, others’ bubbles and small surfaces', () => {
    for (const s of themes)
      for (const mode of MODES) {
        const t = resolveTheme(s, mode);
        for (const bg of [t.wallBase, t.theirs, t.surface])
          expect(contrast(t.accentText, bg), `accentText ${name(s, mode)}`).toBeGreaterThanOrEqual(
            4.5,
          );
        for (const bg of [t.wallBase, ...t.wallFill.stops])
          expect(contrast(t.meta, bg), `meta ${name(s, mode)}`).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('member colours read in every theme and mode', () => {
    for (const s of themes)
      for (const mode of MODES) {
        const t = resolveTheme(s, mode);
        for (const c of MEMBER_COLORS) {
          const m = memberTokens(c.id, t, mode);
          expect(
            contrast(m.onBubble, m.bubble),
            `${c.id} bubble ${name(s, mode)}`,
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            contrast(m.name, t.wallBase),
            `${c.id} name ${name(s, mode)}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
  });

  it('others’ bubbles stand apart from the wallpaper', () => {
    for (const s of themes)
      for (const mode of MODES) {
        const t = resolveTheme(s, mode);
        expect(t.theirs, name(s, mode)).not.toBe(t.wallBase);
      }
  });
});

describe('Classic', () => {
  it('changes no colours and draws no wallpaper', () => {
    const classic = themeSpec(null);
    expect(themeVars(classic)).toEqual({});
    expect(resolveTheme(classic, 'light')).toMatchObject({
      mine: '#4f46e5',
      theirs: '#f4f4f5',
      doodleOpacity: 0,
    });
    expect(resolveTheme(classic, 'dark')).toMatchObject({ mine: '#5850ec', theirs: '#1c1c21' });
  });

  it('sets both modes’ variables for a theme', () => {
    const vars = themeVars(themeSpec({ v: 1, preset: 'ocean' }));
    expect(vars['--l-mine']).toMatch(/^#/);
    expect(vars['--d-mine']).toMatch(/^#/);
    expect(vars['--l-wall']).toMatch(/linear-gradient/);
  });
});

describe('member colours', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

  it('gives the first members different colours, skipping the accent', () => {
    const colors = assignMemberColors(ids, [], 'sky');
    expect(new Set(colors.values()).size).toBe(ids.length);
    expect([...colors.values()]).not.toContain('sky');
  });

  it('is the same for everyone and a picked colour wins', () => {
    const picked = [{ userId: 'c', color: 'tan' }];
    const one = assignMemberColors(ids, picked, 'indigo');
    const two = assignMemberColors([...ids], [...picked], 'indigo');
    expect([...one]).toEqual([...two]);
    expect(one.get('c')).toBe('tan');
    expect(one.get('a')).toBe(MEMBER_COLORS[0]!.id);
  });

  it('ignores a picked colour it doesn’t know', () => {
    expect(assignMemberColors(['a'], [{ userId: 'a', color: 'plaid' }], 'indigo').get('a')).toBe(
      MEMBER_COLORS[0]!.id,
    );
  });
});

describe('theme notices', () => {
  const at = '2026-11-21T10:00:00.000Z';
  const base = {
    theme: JSON.stringify({ v: 1, preset: 'matcha' }),
    themeSetAt: at,
    themeSetBy: { id: 'u2', displayName: 'Bob Carter' },
  };

  it('says who changed the theme to what', () => {
    expect(themeChangeText(base, 'u1')).toBe('Bob changed the theme to Matcha');
    expect(themeChangeText(base, 'u2')).toBe('You changed the theme to Matcha');
    expect(themeChangeText({ ...base, theme: null }, 'u1')).toBe('Bob reset the theme');
    expect(
      themeChangeText(
        { ...base, theme: JSON.stringify({ v: 1, preset: 'custom', accent: 'red' }) },
        'u1',
      ),
    ).toBe('Bob made a custom theme');
    expect(themeChangeText({ ...base, themeSetBy: null }, 'u1')).toBe(
      'The theme was changed to Matcha',
    );
    expect(themeChangeText({ ...base, themeSetAt: null }, 'u1')).toBeNull();
  });

  it('takes the chat-list line only when it’s the newest thing in the chat', () => {
    const c = { ...base, lastMessage: null, lastReaction: null } as unknown as Conversation;
    expect(themePreviewText(c, 'u1')).toBe('Bob changed the theme to Matcha');
    const later = { createdAt: '2026-11-21T10:05:00.000Z' };
    expect(themePreviewText({ ...c, lastMessage: later } as Conversation, 'u1')).toBeNull();
    const earlier = { createdAt: '2026-11-21T09:00:00.000Z' };
    expect(themePreviewText({ ...c, lastMessage: earlier } as Conversation, 'u1')).not.toBeNull();
    const reacted = { reactedAt: '2026-11-21T10:01:00.000Z' };
    expect(
      themePreviewText({ ...c, lastReaction: reacted } as unknown as Conversation, 'u1'),
    ).toBeNull();
  });
});

describe('timeline notice', () => {
  const sender = { id: 'u2', displayName: 'Bob', avatarColor: '#000' };
  const msg = (id: string, iso: string) => ({ id, body: id, createdAt: iso, sender });
  const messages = [
    msg('m1', '2026-11-21T10:00:00.000Z'),
    msg('m2', '2026-11-21T10:02:00.000Z'),
    msg('m3', '2026-11-21T10:04:00.000Z'),
  ];
  const kinds = (items: Array<{ kind: string }>) => items.map((i) => i.kind);
  const now = new Date('2026-11-21T12:00:00.000Z');

  it('goes in at its time and splits the run it falls in', () => {
    const items = buildTimeline(messages, 'u1', now, {
      notice: { key: 'n', at: '2026-11-21T10:03:00.000Z', leading: false },
    });
    expect(kinds(items)).toEqual(['day', 'run', 'notice', 'run']);
  });

  it('goes after everything when it’s newest', () => {
    const items = buildTimeline(messages, 'u1', now, {
      notice: { key: 'n', at: '2026-11-21T11:00:00.000Z', leading: false },
    });
    expect(kinds(items).at(-1)).toBe('notice');
  });

  it('goes before the first message only when all history is loaded', () => {
    const at = '2026-11-21T09:00:00.000Z';
    expect(
      kinds(buildTimeline(messages, 'u1', now, { notice: { key: 'n', at, leading: false } })),
    ).not.toContain('notice');
    // An hour before the first message, so that message gets its time label.
    expect(
      kinds(buildTimeline(messages, 'u1', now, { notice: { key: 'n', at, leading: true } })),
    ).toEqual(['day', 'notice', 'time', 'run']);
  });

  it('shows in an empty chat, under its own day', () => {
    const items = buildTimeline([], 'u1', now, {
      notice: { key: 'n', at: '2026-11-21T09:00:00.000Z', leading: true },
    });
    expect(kinds(items)).toEqual(['day', 'notice']);
  });

  it('gets its own day label when it happened on a day without messages', () => {
    const items = buildTimeline(
      [msg('m1', '2026-11-19T10:00:00.000Z'), msg('m2', '2026-11-21T10:00:00.000Z')],
      'u1',
      now,
      {
        notice: { key: 'n', at: '2026-11-20T10:00:00.000Z', leading: false },
      },
    );
    expect(kinds(items)).toEqual(['day', 'run', 'day', 'notice', 'day', 'run']);
  });
});

describe('doodles', () => {
  it('every scatter set draws stickers that exist', () => {
    for (const d of DOODLES.filter((x) => x.kind === 'scatter')) {
      const ids = scatterStickers(d.id);
      expect(ids.length, d.id).toBeGreaterThan(0);
      for (const id of ids) expect(STICKERS[id], `${d.id}: ${id}`).toBeDefined();
    }
  });

  it('draws every doodle in one ink, as lines, with no colour fills', () => {
    for (const d of DOODLES.filter((x) => x.kind !== 'none')) {
      const pattern = doodlePattern(d.id, '#123456', 'p');
      expect(pattern, d.id).not.toBeNull();
      const svg = renderToStaticMarkup(createElement('svg', null, pattern));
      const colors = new Set(
        [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]!.toLowerCase()),
      );
      expect([...colors], d.id).toEqual(['#123456']);
    }
    expect(doodlePattern('none', '#000', 'p')).toBeNull();
  });
});

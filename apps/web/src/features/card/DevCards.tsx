import { useMemo, type ReactNode } from 'react';
import { DEFAULT_RECIPE, randomRecipe, serializeRecipe } from '../avatar/recipe';
import { STYLE_OPTIONS, type StyleKey } from './catalog';
import { CardView, type CardUser } from './CardView';
import { DEFAULT_CARD, type CardRecipe, type Sticker } from './recipe';
import { StickerArt, STICKER_IDS, STICKERS } from './stickers';

/** Dev only (/dev/cards): every card option side by side, for visual checks. */

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

const look = (seed: number) => serializeRecipe(randomRecipe(DEFAULT_RECIPE, seeded(seed)));

const MATEO: CardUser = {
  username: 'mateo',
  displayName: 'Mateo Rossi',
  avatar: null,
  avatarColor: '#6366f1',
};
const LONG: CardUser = {
  username: 'abcdefghijklmnopqrst',
  displayName: 'Maximiliana Wolfeschlegelsteinhausen-Bergerdorff',
  avatar: look(11),
  avatarColor: '#ec4899',
};
const INITIALS: CardUser = {
  username: 'ivy',
  displayName: 'Ivy Chen',
  avatar: JSON.stringify({ v: 1, style: 'initials' }),
  avatarColor: '#14b8a6',
};

const SKETCH: CardRecipe = {
  ...DEFAULT_CARD,
  about: 'Bla bla bla blaaa blaa blaaaaa blaaa blllaaaa blaaaa blaaa balaaa blaaa blaaa\nHit me up',
  interests: ['hiking', 'biking', 'pizza', 'games'],
};

const MAX_ABOUT =
  'Product designer by day, amateur baker by night. Ask me about sourdough, cats or the best ramen in town.\nAlways up for a hike!\nSay hi ✌️';

const STICKERS_DEMO: Sticker[] = [
  { k: 'star', x: 0.88, y: 0.06, s: 0.9, r: 14, c: 'yellow' },
  { k: 'heart', x: 0.1, y: 0.36, s: 0.55, r: -16 },
  { e: '🍕', x: 0.9, y: 0.6, s: 0.7, r: 10 },
  { k: 'tape', x: 0.5, y: 0.005, s: 1.2, r: 0, c: 'rose' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-5">{children}</div>
    </section>
  );
}

function Tile({
  label,
  card,
  user = MATEO,
  width = 200,
  tilt,
}: {
  label: string;
  card: CardRecipe;
  user?: CardUser;
  width?: number;
  tilt?: boolean;
}) {
  return (
    <figure className="space-y-1.5">
      <CardView card={card} user={user} width={width} tilt={tilt} />
      <figcaption className="text-center text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function Each({
  k,
  base = SKETCH,
  width = 170,
  user,
}: {
  k: StyleKey;
  base?: CardRecipe;
  width?: number;
  user?: CardUser;
}) {
  return (
    <Section title={k}>
      {STYLE_OPTIONS[k].map((o) => (
        <Tile key={o.id} label={o.label} card={{ ...base, [k]: o.id }} width={width} user={user} />
      ))}
    </Section>
  );
}

export default function DevCards() {
  const people = useMemo(
    () => [1, 2, 3, 4, 5, 6].map((s) => ({ ...MATEO, avatar: look(s * 7) })),
    [],
  );
  const chips: CardRecipe = {
    ...SKETCH,
    interests: ['hiking', 'biking', 'pizza', 'games', { t: 'Bouldering', e: '🧗' }, 'coffee'],
  };
  const full: CardRecipe = { ...chips, about: MAX_ABOUT };
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-10 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Cards</h1>

        <Section title="The sketch (default) · tilt on">
          <Tile label="Default + about + interests" card={SKETCH} width={320} tilt />
          <Tile label="Never customised" card={DEFAULT_CARD} width={320} tilt />
          <Tile
            label="Stickers"
            card={{ ...SKETCH, stickers: STICKERS_DEMO, bg: 'lemon', pattern: 'dots' }}
            width={320}
            tilt
          />
          <Tile
            label="Holo + foil"
            card={{
              ...full,
              bg: 'galaxy',
              finish: 'holo',
              border: 'foil',
              chips: 'pill',
              button: 'solid',
              accent: 'lilac',
              divider: 'stars',
              ring: 'rainbow',
            }}
            width={320}
            tilt
            user={people[2]}
          />
        </Section>

        <Section title="Edge cases">
          <Tile
            label="Longest names (both)"
            card={{ ...full, name: 'both' }}
            user={LONG}
            width={240}
          />
          <Tile label="Longest handle" card={full} user={LONG} width={240} />
          <Tile
            label="Side + longest"
            card={{ ...full, layout: 'side', name: 'both' }}
            user={LONG}
            width={240}
          />
          <Tile
            label="Initials avatar"
            card={{ ...full, frame: 'none' }}
            user={INITIALS}
            width={240}
          />
          <Tile
            label="Six long customs"
            card={{
              ...full,
              chips: 'pill',
              interests: [
                'abcdefghijklmnopqr',
                'Bouldering forever',
                'Competitive naps',
                'Synth collecting',
                'Mushroom foraging',
                'Making zines',
              ].map((t) => ({ t, e: '✨' })),
            }}
            width={240}
          />
          <Tile
            label="Six long customs, plain"
            card={{
              ...full,
              interests: [
                'abcdefghijklmnopqr',
                'Bouldering forever',
                'Competitive naps',
                'Synth collecting',
                'Mushroom foraging',
                'Making zines',
              ].map((t) => ({ t })),
            }}
            width={240}
          />
        </Section>

        <Section title="People">
          {people.map((p, i) => (
            <Tile
              key={i}
              label={`look ${i}`}
              card={{ ...chips, chips: 'pill', frame: 'squircle' }}
              user={p}
              width={170}
            />
          ))}
        </Section>

        <Each k="layout" base={{ ...full, chips: 'pill' }} width={220} user={people[0]} />
        <Section title="layout · name both">
          {STYLE_OPTIONS.layout.map((o) => (
            <Tile
              key={o.id}
              label={o.label}
              card={{ ...full, chips: 'outline', layout: o.id, name: 'both' }}
              width={220}
              user={people[1]}
            />
          ))}
        </Section>
        <Section title="layout · cut-out">
          {STYLE_OPTIONS.layout.map((o) => (
            <Tile
              key={o.id}
              label={o.label}
              card={{ ...full, layout: o.id, frame: 'none' }}
              width={220}
              user={people[3]}
            />
          ))}
        </Section>
        <Each k="font" base={full} width={220} />
        <Section title="font · chips">
          {STYLE_OPTIONS.font.map((o) => (
            <Tile
              key={o.id}
              label={o.label}
              card={{ ...full, font: o.id, chips: 'pill', name: 'both' }}
              width={220}
            />
          ))}
        </Section>
        <Each k="bg" />
        <Each k="pattern" base={{ ...SKETCH, bg: 'sky' }} />
        <Each k="patternTone" base={{ ...SKETCH, bg: 'coral', pattern: 'stars' }} />
        <Each k="border" base={{ ...SKETCH, bg: 'cream' }} />
        <Each k="corners" base={{ ...SKETCH, border: 'thick' }} />
        <Each k="finish" base={{ ...SKETCH, bg: 'mint' }} width={220} />
        <Section title="finish · dark">
          {STYLE_OPTIONS.finish.map((o) => (
            <Tile
              key={o.id}
              label={o.label}
              card={{ ...SKETCH, bg: 'midnight', finish: o.id }}
              width={220}
              tilt
            />
          ))}
        </Section>
        <Each k="frame" user={people[4]} />
        <Each
          k="ring"
          base={{ ...SKETCH, accent: 'rose', borderColor: 'accent' }}
          user={people[5]}
        />
        <Each k="divider" />
        <Each k="chips" base={chips} width={220} />
        <Section title="chips · dark">
          {STYLE_OPTIONS.chips.map((o) => (
            <Tile
              key={o.id}
              label={o.label}
              card={{ ...chips, bg: 'ink', chips: o.id, accent: 'yellow' }}
              width={220}
            />
          ))}
        </Section>
        <Each k="button" />
        <Section title="button · dark + yellow accent">
          {STYLE_OPTIONS.button.map((o) => (
            <Tile
              key={o.id}
              label={o.label}
              card={{ ...SKETCH, bg: 'denim', button: o.id, accent: 'yellow' }}
              width={170}
            />
          ))}
        </Section>
        <Each k="accent" base={{ ...chips, chips: 'tag', button: 'solid' }} />

        <Section title="Stickers">
          {STICKER_IDS.map((id) => (
            <figure key={id} className="flex w-24 flex-col items-center gap-1">
              <div className="flex size-24 items-center justify-center rounded-xl bg-[#f3eadb]">
                <StickerArt sticker={{ k: id }} className="size-20" />
              </div>
              <figcaption className="text-xs text-muted-foreground">
                {STICKERS[id]!.label}
              </figcaption>
            </figure>
          ))}
          {['🍕', '🔥', '🌈', '🐸'].map((e) => (
            <figure key={e} className="flex w-24 flex-col items-center gap-1">
              <div className="flex size-24 items-center justify-center rounded-xl bg-[#f3eadb]">
                <StickerArt sticker={{ e }} className="size-20" />
              </div>
              <figcaption className="text-xs text-muted-foreground">emoji</figcaption>
            </figure>
          ))}
        </Section>
        <Section title="Stickers · small">
          {STICKER_IDS.map((id) => (
            <StickerArt key={id} sticker={{ k: id }} className="size-9" />
          ))}
        </Section>
      </div>
    </div>
  );
}

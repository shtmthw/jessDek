# CARD_DECK_PLAN.md: the card deck (Discover)

> **Status: built and tested (2026-11-23), not committed.** Server 165/165 tests (29 new, mutation-checked),
> web 228/228 (32 new: the store and the openers), e2e `discover.spec.ts` 4/4. Checked by eye in Chromium on
> desktop and phone against the Penpot file "jessDek · Discover deck" (8 boards, built from real renders of
> the app's cards). Implements `CARD_LOADING.md` (the loading spec) and the five hand sketches. Paths are
> relative to the repo root. "Deviations" at the end lists where the build differs.

## 0. In one minute

- A **Discover** button in the chat list's header opens `/discover`: the **front page of the deck**.
  It shows a stack of cards. The card on top **is M**, the middle card of the fan.
- Click the top card and the **matching page** opens (`/discover/deck`): a **fan of 5 cards**,
  M in the middle, two each side, tilted like a hand of cards. **Swipe, drag, arrow keys or buttons** move it.
  The deck is a circle: it loops.
- Pick a card (tap the middle one) and the **card view** opens (`/discover/deck/:username`): the
  person's whole card plus a chat box. Above the box are **AGM, auto-generated messages**: 3 or 4
  openers written from your **shared interests**. Pick one (it fills the box, you can edit it) and send.
  It goes out as the ordinary one-message request.
- **Back to CD** (card to deck) returns to the fan: same M, same cards, **zero requests**.
- Cards load **lazily from both ends** (`CARD_LOADING.md`): 5 a side to start, a refill of 5 when a
  side runs low, at most 10 loaded a side, one request in flight per side. Decks of 21 or fewer are
  loaded whole.

## 1. Decisions

| Question | Answer (2026-11-23) |
| --- | --- |
| Where the deck lives | A dedicated **Discover** page, opened from a button in the list header. The chat pane is unchanged |
| Where AGM come from | **Templates** from shared interests (free, instant, same every time). Built behind `suggestOpeners()` so an AI version can replace it later |
| People you already know | They stay in the deck (spec as written). The card view's box adapts: **Open chat** / **Request sent** / **Declined** instead of the AGM list |
| Looking at the sketches | Dots next to x1, x3, x4 are radio buttons; "Agm" is the section's header; ">" sends |

Fixed by `CARD_LOADING.md` (not up for change): only M is random; swiping is a rotation in id order
and wraps; no shuffling or `ORDER BY random()` on page fetches; the top card of the front page is M and
the matching page opens on it.

## 2. How the spec maps onto this stack

The spec is written for Go and `users`/`user_interests` tables. This app is TypeScript, Prisma and
GraphQL, and a person's interests live inside their card recipe (JSON). Behaviour is the same;
names differ:

| Spec | Here |
| --- | --- |
| `GET /api/deck/start` | Query `deckStart` |
| `GET /api/deck/cards?dir&after/before&limit` | Query `deckCards(dir, cursor, limit)` |
| `GET /api/users/{uid}/profile` (410) | Query `deckCard(id)`: **null** when the person is gone or blocked (the app's way of saying "not for you", like `card`). The client treats null as 410 |
| `uid bigint` | `User.id` (a cuid). Keyset order is `id` ascending. Text order is stable and total, which is all the rotation needs; no neighbour is ever computed as `M ± k` |
| `user_interests` + join | `User.interestKeys text[]` with a **GIN** index; the match test is `a.interestKeys && b.interestKeys` (the spec's own alternative) |
| `deleted_at` | **Not added.** The app has no account deletion, so a column nothing sets would be dead weight. The filter has no such clause; the null/410 path already covers "gone" |
| `blocks` | `Block` (already there), checked both ways |
| `$me` | The signed-in session (`ctx.userId`). The API takes no user id |
| Card payload `uid, bio, interests` | The app's `Card` type: `id`, `user` (username, display name, avatar) and `recipe` (about, interests and style). Display fields only, and the same data every signed-in person can already see with `card(username)` |

### 2.1 Interest keys

`interestKeys` is derived from the recipe whenever a card is saved: a built-in interest `hiking` becomes
`id:hiking`; a custom one `{t:"Chess"}` becomes `t:chess` (lower-cased, the same rule as the client's `interestKey`). Two
people match when they share a key. The migration backfills every existing card in SQL. (A custom "Chess"
and the built-in "Chess" don't match each other; custom words only match custom words.)

## 3. Server

### 3.1 Schema (`apps/server/prisma/schema.prisma`)

```prisma
model User {
  // …
  /// Derived from the card's interests (see services/deck.ts). The deck matches people on these.
  interestKeys String[] @default([])
  @@index([interestKeys], type: Gin)
}
```

### 3.2 GraphQL

```graphql
enum DeckMode { EMPTY SMALL LARGE }
enum DeckDir  { LEFT RIGHT }

type Query {
  "Starts a deck: a random middle card, how many matches there are, and the first cards."
  deckStart: DeckStart!
  "More cards from one end of the deck: RIGHT = ids greater than the cursor (ascending), LEFT = smaller (descending). Wraps."
  deckCards(dir: DeckDir!, cursor: ID!, limit: Int = 5): DeckPage!
  "One person's card as the deck shows it. Null when they're gone or blocked."
  deckCard(id: ID!): Card
}

type DeckStart {
  mode: DeckMode!
  n: Int!
  "SMALL: every match, M first, then id ascending with wrap. Otherwise empty."
  cards: [Card!]!
  "LARGE: the middle card, and BatchSize cards each side, nearest first."
  m: Card
  right: [Card!]!
  left: [Card!]!
}
type DeckPage { cards: [Card!]!  wrapped: Boolean! }
```

### 3.3 `services/deck.ts`

- `MATCH` is **one SQL fragment** (`Prisma.sql`) reused by every query: not me, shares a key, no block
  either way.
- `deckStart(me)`: `SELECT u.id, count(*) OVER () AS n … ORDER BY random() LIMIT 1`, then by `n`:
  0 → `EMPTY`; ≤ 21 → all matches by id ascending, rotated so M is index 0; otherwise M plus
  5 each side from the side queries (with wrap).
- `deckCards(me, dir, cursor, limit)`: limit clamped to 1…5, cursor must look like an id (≤ 40 chars,
  `[a-z0-9]`), keyset query, and if it returns fewer than asked, the same query **without the cursor
  bound** for the rest (`wrapped: true`).
- `deckCard(me, id)`: the card if `id` is someone other than me, not blocked either way; else null.
- Rate limit (`deckLimiter`, 240 a minute per user: a fast swiper makes about one request per 5 moves).
- `interestKeysOf(recipe)` is exported and called by `cards.ts` on every save.

### 3.4 Migration

`prisma/migrations/<ts>_card_deck/`: adds the column and the GIN index, then backfills
`interestKeys` from `User.card` JSON. The seed sets the keys for its demo cards, and gets a
`SEED_CROWD=<n>` option that adds that many extra users with cards, to try large decks locally.

## 4. Client (`apps/web/src/features/discover/`)

### 4.1 `deckStore.ts` — the state machine

A plain class (no React) so it can be tested in isolation, holding exactly the spec's state:
`mode, n, mUid, right[], left[], inFlight{left,right}`. It takes a `fetchPage(dir, cursor, limit)`
function. Methods: `start(res)`, `moveRight()`, `moveLeft()`, `maybeRefill(side)`, `onRefill(…)`,
`evict(side)`, `remove(uid)` (the 410 path), `cardAt(p)` (small mode wraps with `mod(p, n)`),
`fan()` (positions to show, handling `n < 5`: no looping, no repeats). It also counts the metrics in
section 6. `useDeck()` reads it with `useSyncExternalStore`.

`DeckProvider` sits **above the routes** in `AppShell`, so the store survives going from the fan to
a card and back (**Back to CD = zero requests**) and from the front page to the fan (no second
`deckStart`). It starts a deck the first time Discover opens and again only on **Shuffle** (or a
reload).

### 4.2 Routes

| Path | Screen |
| --- | --- |
| `/discover` | Front page: the stack, the count, "Open the deck". Empty state when `n = 0` |
| `/discover/deck` | Matching page: the fan |
| `/discover/deck/:username` | Card view + AGM |

### 4.3 The fan (`Fan.tsx`)

- Positions −2…+2, each a card with `x`, `y` (a gentle arc), `rotate`, `scale` and `zIndex` from its
  distance to M. M is largest and flat; the outer cards lean outward like the sketch. Positions ±3 are
  drawn invisible so cards slide in from, and out to, the edges instead of popping.
- An edge card not loaded yet is a **skeleton** card. The middle one never should be (`buffer_empty`).
- Moves: drag/swipe (a flick can skip cards), ←/→ keys, side buttons, tap a side card to bring it to
  the middle, tap the middle one to open it. Drag left = move right (the +1 card becomes M).
- `n < 5`: no looping; the ends bounce; the fan shows only `n` cards (spec 5.7).
- Motion: the app's soft springs (`lib/motion.ts`); reduced motion crossfades.
- Touch: the fan has `touch-action: pan-y` so the page still scrolls, and ignores the pane's
  edge-swipe-back near the left edge.

### 4.4 Card view and AGM

- Left: the card (`CardView`, tilt on desktop). Right: a chat box shaped like the sketch: a header
  ("Say hi to Erin"), **3 or 4 radio options**, a text box ("Type…") and a send button.
  On phones the two stack: card, then the box.
- Choosing an option **fills the box** (editable); sending runs `startDirect` then `sendMessage`
  (the request flow: one text-only message), then opens the chat at `/c/:id`.
- If a chat exists: "Open chat" (or "Request sent", "Declined": no box).
- **Back to CD** at the top-left returns to the fan.
- Opening a card calls `deckCard(id)`; null ⇒ the card is removed from the buffer and the user goes
  back to the fan with a toast ("That person isn't available any more").

### 4.5 AGM templates (`openers.ts`)

`suggestOpeners({ me, them, shared })` returns 3–4 strings: one **interest-specific** line per
shared interest (up to 2, from a table keyed by built-in id, with a generic "I saw we both like
{interest}…" fallback for custom interests), one **about-me** line when they wrote an about text, and
generic friendly openers to fill up. Chosen deterministically from a hash of the two ids, so the
list doesn't change on every render. All short, friendly, one sentence; none mention anything
private.

## 5. Screens to design (Penpot)

1. **Front page**: stack with the top card (M), count, "Open the deck", empty state.
2. **Matching page**: the fan (desktop and phone), skeleton edge cards, arrows, hint.
3. **Card view + AGM**: card left, chat box right (desktop); stacked (phone); known-person states.

## 6. Metrics (spec §7)

Counted in `deckStore` and exposed through `store.metrics`: `bufferEmpty`, refill latencies (p95 is
computed), `refills`, `moves`, and unused loaded cards at session end. Logged with `console.debug`
in dev builds. Server side, the match queries are in `deck.ts` only, so `pg_stat_statements` shows them as
the three `deck*` statements.

## 7. Tests

| Where | What |
| --- | --- |
| `apps/server/test/deck.test.ts` | Spec acceptance 1, 4, 7 (gone = blocked here), 8, 10: modes for n = 0, 1, 3, 4, 5, 21, 22, 100; rotation order and wrap with no gaps or repeats; `limit` clamp; blocks both ways; `$me` can't be spoofed; payload shape; interest keys follow card saves |
| `apps/web/src/features/discover/deckStore.test.ts` | Acceptance 2, 3, 5, 6, 9: no requests in small mode; 30 moves → one refill on the first move then one per 5, sides ≤ 10; reversing refetches the evicted cards in order; 20 rapid moves keep one request in flight per side and no repeats; Back to CD restores state |
| `apps/web/src/features/discover/openers.test.ts` | Template output is stable, 3–4 items, no placeholders left |
| `e2e/tests/discover.spec.ts` | Two users with a shared interest: Discover → stack → fan → card → pick an AGM → send → request appears; Back to CD; empty state; phone |

## 8. Phases

1. **Server**: schema + migration, `deck.ts`, resolvers, `cards.ts` sync, seed, server tests.
2. **Store**: `deckStore.ts`, `openers.ts`, tests.
3. **Design** in Penpot.
4. **Screens**: Discover entry + front page, fan, card view + AGM.
5. **Polish and checks**: e2e, Firefox, phone, dark mode, reduced motion, README + screenshots.

## Deviations

From `CARD_LOADING.md`:

1. **M never becomes a skeleton.** The spec's `moveRight` with nothing loaded on the right would make M
   an unloaded card (and log `buffer_empty`). Here the move doesn't happen instead: M stays, the fan
   bounces, `buffer_empty` is counted, and that side's refill is made sure of. Edge cards still draw as
   skeletons while they load.
2. **A refill that brings nothing new isn't repeated from the same card.** If every card in an answer is
   already loaded (the deck shrank) or the answer is empty, asking again from the same cursor would
   loop forever. The store remembers that cursor and waits until that side changes. (The store's tests
   also refuse more than 500 page requests, so a regression fails fast instead of eating memory.)
3. **A failed refill is retried on the next move toward that side**, not immediately.
4. **`deckCards` never repeats a card inside one answer** (it can only happen when a tiny deck wraps).
5. **"410 Gone" is `deckCard(id) = null`**, the app's usual way to say "not available to you". There is
   no `deleted_at`: the app has no account deletion, so the filter checks blocks only.
6. **`uid` is the cuid `User.id`**, and interests are `User.interestKeys` (text[] + GIN) rather than a
   join table; the spec allows the array form.
7. **Removing a card from a small deck** re-centres the ring on the current M; for `n < 5` the window
   of positions is laid out again around it.
8. **Metrics** are counted in the store (`store.metrics()`: moves, refills, `buffer_empty`, refill p95,
   unused cards) and logged with `console.debug` in dev builds, including a session summary on
   `pagehide`. There is no metrics endpoint yet.

From this plan:

9. **How the fan moves (reworked 2026-11-23 after "cards pop through each other").** The cards
   sit tucked like a hand of cards, fanned from the bottom (±1 under the middle card, ±2 under ±1).
   Cards are stacked by distance from the middle, so the outgoing and incoming cards swap halfway
   through a move. Just then they **part** (`PART` in `Fan.tsx`, a sine bump over the first position),
   so there's clear space between them when they swap, and no card ever cuts through another. Each card
   has a fixed place on an endless strip and only the view moves, so a move never renumbers a card
   mid-flight. An earlier version did, and it drew one wrong frame per move. A measuring script that
   checks every frame (rotated outlines, stacking order) found 0 visible swaps over ~1,400 frames of
   keys, rapid presses, drags and flicks. The fan deals out from a stack when it opens, settles on a
   calm spring (0.46 s, little overshoot) that carries a flick's speed, and bounces at the ends.
   Positions ±3 and ±4 are drawn too, faded out, so cards slide in and out instead of popping.
   Their faces are drawn a couple of frames late, and refill requests start after the next paint, so
   a move's first frame never waits.
10. **On phones only ±1 peek in.** ±2 are laid out just off-screen, ready to slide in.
11. **An empty deck is dealt again on each visit** to the front page, and saving your card marks the deck
    stale (new interests, new matches).
12. **The card view opened from a link or after a reload** has no deck to take the card from, so it uses
    `card(username)`. "Back to deck" then deals a new deck.
13. **The phone card view isn't sticky**: the send box sits under the openers. A sticky box covered the
    openers on short screens.
14. **Custom and built-in interests don't match each other** ("Chess" typed vs the built-in Chess).
15. **`SEED_CROWD=<n>`** (`prisma/crowd.ts`) seeds n demo people whose cards and avatars are drawn from
    every option in the card and avatar kits (`prisma/crowdOptions.ts`, copied from the web catalogs),
    with stickers kept to the corners so they never cover text. Each shares interests with two of the
    demo users, and Alice gets interests if she has none, so with `SEED_CROWD=80` every demo user has a
    large deck (34–37 matches). Seeded randomness: the same crowd every time, and a re-run adds nobody.
    Every card and avatar goes through the server's own validators.

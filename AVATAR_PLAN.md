# AVATAR_PLAN.md: character avatars

> **Status: implemented.** The sections below are the plan; "Deviations" at the end lists where the
> build differs from it. Paths are relative to the repo root.

## 0. In one minute

- Every user has a **cartoon character avatar**: a round head with thick dark outlines (based on the two
  reference faces, softened a little), shown **head and shoulders** inside the existing round avatar.
- People dress it up in an **Avatar studio** (`/settings/avatar`): skin tone, face shape, eyes, eye colour,
  brows, nose, mouth, blush/freckles, face stickers, hair style and colour, hats, glasses, earrings,
  tops, neck accessories, a little pet, and the background colour.
- The avatar is **drawn in the browser as SVG** from a tiny "recipe" (about 400 bytes of JSON). The server
  stores only that recipe, so there are no image uploads, it's crisp at any size, and it themes cleanly.
- **Same default for everyone:** someone who hasn't customised yet gets the base character (short dark hair,
  light skin, plain tee) on their existing background colour.
- **Initials stay available:** the studio has a "Use initials instead" switch that brings back today's look.
- Changes reach everyone live: saving publishes a `UserUpdated` event to the user's other tabs and to everyone
  who shares a chat with them, and Apollo's normalized cache repaints every avatar of that person at once.

## 1. Decisions (asked 2026-11-19)

| Question | Answer |
| --- | --- |
| Framing | Head + shoulders in the round avatar (not full body) |
| Default before customising | The same base character for everyone |
| Initials | Kept as an opt-out in the studio |
| Extras | Little pets, face details (blush, freckles, stickers, bandage, beauty mark), glasses & earrings |
| Idle animation | None (no blinking / item pops). The studio still uses the app's normal UI springs. |
| Unlocks / economy | None: every item is free for everyone |

## 2. The recipe (the contract between client and server)

```json
{
  "v": 1,
  "style": "character",
  "skin": "peach", "face": "soft",
  "eyes": "dot", "eyeColor": "ink", "brows": "none",
  "nose": "curve", "mouth": "smile",
  "cheeks": "blush", "mark": "none",
  "hair": "short", "hairColor": "black",
  "hat": "none", "hatColor": "indigo",
  "glasses": "none", "glassesColor": "ink",
  "earrings": "none",
  "neck": "none", "neckColor": "rose",
  "top": "tee", "topColor": "indigo",
  "pet": "none"
}
```

- `style` is `"character"` or `"initials"`.
- Every other value is a slug from the catalog (`apps/web/src/features/avatar/catalog.ts`).
- The **client is forgiving**: a missing key or an unknown slug falls back to the default for that slot, so
  old recipes keep working when items are added, renamed or removed. `v` lets a future art pass migrate.
- The **server only checks shape**, not the catalog (it never draws): a flat object, at most 32 keys, keys
  `^[a-zA-Z]{1,16}$`, values slugs `^[a-z0-9-]{1,24}$` or small integers (`v`), at most 1 KiB serialized. It
  stores the re-serialized object, so stray whitespace or nesting can't get in.
- The background colour remains the existing `avatarColor` column (the same 8 colours, the same server check).

## 3. Art

### 3.1 Canvas and layers

One `viewBox="0 0 200 200"`, clipped to a circle by the avatar's container. Head around x 50–150,
y 48–146; ears at the sides; neck and shoulders below; hats can reach y ≈ 6. Outlines are `#18181b`
(the app's ink), about 5.5 units thick with round joins, so the outline is about 1 px at 40 px.

Paint order (back to front):

1. background (the avatar colour circle, drawn by the container)
2. hair, back part (long hair, pigtails, afro cloud, buns behind)
3. pet, behind part (tails)
4. neck, then top (clothes), then neck accessory
5. ears, earrings
6. head (face shape), then cheeks, freckles and sticker
7. brows, eyes, nose, mouth
8. hair, front part (fringe, cap, sideburns), clipped under hats that cover the head
9. glasses
10. hat / headwear
11. pet, front part (sitting on the shoulder)

Items are plain React components that return SVG groups and take resolved colours (skin, skin shade,
hair, hair shade, item colour). Hats that cover the scalp declare a clip region so tall hair (afro, bun,
mohawk) tucks under them instead of poking through.

### 3.2 Catalog (initial)

| Slot | Options |
| --- | --- |
| Skin tone | 10 tones, ivory to deep |
| Face shape | soft (default, rounder than the reference), round, oval, chubby, heart |
| Eyes | dot (default), sparkle, happy, sleepy, wink, lashes, round, wide, star, heart, cool, dizzy |
| Eye colour | ink, brown, hazel, green, blue, grey, violet |
| Brows | none (default), soft, thick, straight, raised, cross, worried |
| Nose | curve (default), button, dots, tick, none |
| Mouth | smile (default), small, grin, teeth, tongue, cat, fang, laugh, o, smirk, flat, kiss |
| Cheeks | none, blush (default), freckles, blush + freckles, rosy |
| Sticker | none, heart, star, bandage, beauty mark, sparkle, sweat drop |
| Hair | short (default), pigtails, buzz, bald, side part, spiky, curly, afro, bob, long, ponytail, bun, space buns, mohawk, wavy, braids, bowl, curtains |
| Hair colour | black, dark brown, brown, light brown, auburn, ginger, blonde, platinum, grey, white, pink, blue, purple, mint, cherry |
| Headwear | none, beanie, cap, backwards cap, bucket hat, beret, crown, tiara, flower crown, cat ears, bunny ears, bear ears, party hat, top hat, wizard hat, cowboy hat, straw hat, big bow, hair clips, headphones, frog hat, halo, horns, santa hat |
| Glasses | none, round, square, cat-eye, shades, heart shades, star shades, 3D glasses |
| Earrings | none, studs, hoops, pearls, stars, hearts |
| Top | tee (default), v-neck, striped tee, hoodie, sweater, turtleneck, shirt, overalls, dress, tank top, jacket, suit, sailor, cardigan, jersey, puffer |
| Neck | none, chain, pearls, heart pendant, bow tie, tie, scarf, bandana, choker, flower lei |
| Pet | none, cat, puppy, chick, bunny, frog, ghost, hamster, bear |
| Item colours | one 12-colour palette shared by headwear, tops and neck items; glasses have their own frame colours |

## 4. UI

### 4.1 `Avatar` everywhere

`apps/web/src/components/Avatar.tsx` gains an `avatar?: string | null` prop (the raw recipe JSON from
GraphQL). With `style: "initials"` it renders exactly as today; otherwise it renders `AvatarFigure` on the
colour circle. Parsing is memoized per recipe string, and the figure is `React.memo`'d, so long message
lists don't re-parse. Below 32 px (`xs`, `sm`) the figure zooms in on the head so the face stays readable.
SVG ids (clip paths) come from `useId`, so many avatars can share a page.

### 4.2 Avatar studio (`/settings/avatar`)

- Settings → Profile shows the avatar with an **Edit avatar** button. The colour swatches move into the
  studio's Background tab.
- Layout: a large live preview with category tabs and an option grid. On phones the preview stays pinned
  above the scrolling options; on wider screens they sit side by side.
- Tabs: Skin · Hair · Eyes · Mouth · Details · Hats · Clothes · Accessories · Pets · Background.
- Each option tile is a mini avatar with that option applied, zoomed to the relevant region (eyes tiles
  show the face, tops tiles show the shoulders). Colour rows appear under items that take a colour.
- Header actions: Undo (also ⌘/Ctrl+Z), Randomize, Save. Unsaved edits are kept as a draft on the
  device (see Deviations). The Background tab holds the colour, "Show others: My character / My
  initials", and "Reset to default".
- Keyboard: tabs and option grids are radio groups (arrow keys move, Space/Enter picks).

## 4.3 Specials (added 2026-11-19)

Nine ready-made characters, adapted from a reference sheet the user supplied, in a finer, softer
style: thin lines, doe eyes, tiny mouths and pale skin with a faint blush. They live in
`apps/web/src/features/avatar/specials.ts`.

- **Each special is an ordinary recipe**, so after picking one every slot can be changed as usual.
  The Specials tab (first in the studio) marks one as picked only while the look is exactly it.
- **New parts, usable by everyone:**
  - face: the "mochi" face shape;
  - eyes: Doe, Doe lashes, Dreamy and Doe wink;
  - mouths: Tiny smile and Little o;
  - cheeks: Faint blush;
  - hair: Side swoop, Tousled, Straight bob, Blunt bob, Swept up, Sleek long, Long bangs, Messy and
    Side braid;
  - hats: Knit beanie, Headband and Mini beret;
  - necklaces: Bead necklace, Bead tag, Cross and Buckle choker;
  - tops: Blazer, Cami, Print tee, Patch sweater and Checkered;
  - earrings: Huggies, Drops and Ear cuff.
- **New slots:**
  - `line`: `bold` (default) or `fine`. Every part is drawn at the bold weight, and `AvatarFigure`
    scales the rendered strokes (×0.4, or ×0.7 in the closest crop for 24–28 px avatars).
  - `clip` and `clipColor`: hair clips (sparkle, star, heart, bow, barrette) at the left temple.
  - `earringColor`: studs, hoops, stars and the new earrings take it; it defaults to gold, which is
    what they were before.
  - `topAccent`: the second colour of the blazer's shirt, the print, the patch and the checks.
- **New colours:** jade, gold, white, black and blush (pale pink) for items; ash for hair.
- **Polish pass (same day):**
  - Long hair now has a third layer, `mid`. It is drawn over the clothes but behind the ears and
    face, so long styles tuck behind the ears (earrings show) and fall in front of the shoulders,
    as in the reference. Paint order: … neck accessory, **hair mid**, ears, earrings, head ….
  - The female specials' hair was redrawn on it with softer, curved bangs and face-framing wisps.
  - Nine more hairstyles in the same style:
    - High ponytail, Twin tails, Long waves, Pixie and Messy bun;
    - Middle part, Textured crop, Wolf cut and Side sweep.
  - The doe eyes are bigger.
  - A top's detail colour that matches its main colour is shifted lighter or darker, so checks,
    prints and patches never vanish.
  - `/dev/specials?slot=hat` shows every special (and the classic look) wearing every item of a
    slot. `specials.test.tsx` renders all of them (about 2,500 combinations).
- **Slim build (specials only):** a `build` slot, `classic` (default) or `slim`, set on every
  special and not offered in the studio. Slim draws a slender, longer neck that flows into the
  shoulders (skin tops leave out the neckline line). It also lowers and narrows everything below
  the neck: clothes, necklaces and pets (`SLIM_BODY`). The whole figure sits 7 units higher, so
  necklaces stay in the round frame. Chokers sit up on the slim neck, and the bead necklace has
  the round pendant from the reference. Randomize keeps the build, like the line weight.
- **Fix found on the way:** the sweater's ribbed collar poked past the shoulder line; it is now
  clipped to the body (all avatars).
- **Server:** no change. Recipes now have 29 keys (the limit is 32) and stay well under 1 KiB.
  `specials.test.tsx` checks every special against the server's rules.

## 5. Server

- `User.avatar String?` (null = default). Migration `avatar_recipe`.
- GraphQL: `avatar: String` on `User` and `Viewer` ("JSON recipe; null means the default character").
- `updateAvatar(input: UpdateAvatarInput!): Viewer!` with `avatarColor: String!` and `avatar: String`.
  Validation as in §2. Rate-limited per user (30 saves a minute), since every save fans out an event.
- New event `UserUpdated { user: User! }`, published to the user and to everyone who shares a
  conversation with them, after `updateAvatar` and after `updateProfile` (today a display-name change
  only shows up after a reload).
- Tests: shape validation (rejects nesting, long values, too many keys, oversize), normalization, the
  event reaching a peer and not a stranger.

## 6. Phases

| # | Phase | Who | Done when |
| --- | --- | --- | --- |
| 1 | Art kit: recipe parsing, catalog, all parts, `AvatarFigure`, `/dev/avatars` contact sheet | Opus | **Done.** Every item checked visually at 200 px, 40 px and 24 px |
| 2 | Avatar studio UI and the `Avatar` component switch-over | Opus | **Done.** Checked in the app on phone and desktop, light and dark. Saving waits for phase 3 |
| 3 | Server: column, migration, validation, `updateAvatar`, `UserUpdated`, tests | Sonnet | **Done.** `npm test -w apps/server` passes |
| 4 | Plumbing: `avatar` in GraphQL fragments, every `<Avatar>` call site, typing bubble, media viewer, events | Sonnet | **Done.** Typecheck and web tests pass; a change made as bob showed up live in alice's open browser |
| 5 | Tests and docs: recipe unit tests, e2e (edit avatar, peer sees it), README section | Sonnet | **Done.** `npm test` and `npm run e2e` pass |

## 7. Checklists for phases 3–5

All three phases below are done; the checklists are kept as a record of what was built.

### Phase 3: server (`apps/server`)

1. `prisma/schema.prisma`: `avatar String?` on `User` (after `avatarColor`). Migration named
   `avatar_recipe` (`npx prisma migrate dev --name avatar_recipe`; see the local dev notes for a scratch DB).
2. `src/services/users.ts`: `updateAvatar(userId, input)`.
   - `avatarColor`: the existing hex check (`/^#[0-9a-fA-F]{6}$/`).
   - `avatar`: `null` (back to the default) or a string that `JSON.parse`s to a plain object (not an
     array, not null) with at most 32 keys; keys match `^[a-zA-Z]{1,16}$`; values are strings matching
     `^[a-z0-9-]{1,24}$` or integers 0–999. Anything else → `BAD_USER_INPUT` "That avatar can't be saved".
   - Store `JSON.stringify(parsed)` (re-serialized), and reject it if that is over 1024 characters.
   - A `RateLimiter(30, 60_000)` per user (`src/rateLimit.ts`), `RATE_LIMITED` when exceeded: every save fans out an event.
3. `src/schema.ts`: `avatar: String` on `User` and `Viewer` with the description "Avatar recipe (JSON).
   Null means the default character."; `input UpdateAvatarInput { avatarColor: String!, avatar: String }`;
   `updateAvatar(input: UpdateAvatarInput!): Viewer!`; `type UserUpdated { user: User! }` added to the
   `ChatEvent` union.
4. `src/types.ts`: `| { __typename: 'UserUpdated'; user: User }` in `ServerEvent`.
5. Broadcast: export `peersOf` from `src/services/presence.ts` (or move it to a shared module) and add
   `announceUser(user)` that publishes `UserUpdated` to `[user.id, ...peers]`. Call it from the
   `updateAvatar` **and** `updateProfile` resolvers after the write (a display-name change should show live too).
6. Tests: `test/api.test.ts`: saves and reads back; `null` resets; rejects arrays, nesting, 33 keys,
   long values, bad keys, oversize, bad colour; stored string is re-serialized. `test/realtime.test.ts`:
   a peer in a shared chat and the user's own subscription get `UserUpdated`; a stranger doesn't.
   `npm test -w apps/server` passes.

### Phase 4: client plumbing (`apps/web`)

1. `src/lib/gql.ts`: add `avatar` to the `UserFields` and `ViewerFields` fragments; make the TS fields
   `avatar: string | null` (not optional); drop the now-redundant extra `avatar` line in `UPDATE_AVATAR`.
   Add `... on UserUpdated { user { ...UserFields } }` to the events subscription and its TS type.
2. `src/features/realtime/EventsProvider.tsx`: handle `UserUpdated`. Apollo already normalizes the
   `User` from the event; also `cache.modify` the `Viewer:<id>` entry (displayName, avatarColor, avatar)
   when `event.user.id` is the signed-in user, so other tabs update.
3. Pass `avatar` to every `<Avatar>` (find them with `grep -rn "<Avatar" src`): ConversationList
   (`c.peer?.avatar`), ChatView (three, `peer?.avatar`), MessageList (`run.sender.avatar`),
   GroupInfoDialog, NewChatDialog (two), SettingsPage "Blocked people", MediaViewer (add `senderAvatar`
   to the entry ChatView builds next to `senderColor`), TypingBubble (`markTyping` in
   `src/features/realtime/typing.ts` gets the avatar too, and `Typer` carries it). The optimistic message
   in ChatView gets `avatar: viewer.avatar ?? null` on its sender; `src/lib/messages.ts`'s sender type gains `avatar`.
4. `apps/server/prisma/seed.ts`: give bob, carol, dave and erin distinct recipes (alice keeps the
   default), so demos and screenshots show variety. Build them as JSON in the §2 shape.
5. Typecheck, lint and `npm test -w apps/web` pass. Check live: change alice's avatar in one browser
   and watch it change in bob's chat list without a reload.

### Phase 5: tests and docs

1. e2e (`e2e/tests`): alice opens Settings → Edit avatar → Hats → "Cat ears" → Save, sees "Avatar
   saved", reloads, and "Cat ears" is still checked. "Use initials" round trip: pick "My initials",
   save, and her avatar in the sidebar shows "AM".
2. README: a short "Avatars" section (what you can change, that only a ~400-byte recipe is stored).
3. Mark this plan implemented and update Deviations.

## Deviations

- **Unsaved edits are kept, not confirmed.** Leaving the studio doesn't ask first: the app uses
  `BrowserRouter` (no navigation blocker) and the phone edge-swipe navigates straight home. Instead the
  working copy is saved as a draft on the device (`lib/drafts`, so sign-out clears it) and comes back
  next time, with "Picked up where you left off · Discard" under the preview.
- **Tabs** scroll sideways on phones and wrap to two rows from `md` up (a hidden scrollbar would hide
  the last tabs from mouse users). A small unlayered `.no-scrollbar` class in `index.css` beats the
  global thin-scrollbar rule.
- **Pets sit on the left shoulder**, because the cheek stickers and the ponytail are on the right.
- **Option tiles hide items that would cover the option**: hair tiles drop the hat, eye tiles drop
  glasses, and so on.
- **Framing**: the studio preview shows the whole canvas; avatars in the app use a gentle crop
  (`VIEW_AVATAR`), and 24–28 px avatars a closer one (`VIEW_CLOSE`).
- **Settings → Profile** shows the avatar with an "Edit avatar" button; the colour swatches moved to the
  studio's Background tab. `updateProfile` still sends the current `avatarColor`.
- **Phases 3–5**:
  - The migration is `20261119063304_avatar_recipe`.
  - `peersOf` and the new `announceUser` live in `src/services/presence.ts`. `avatarLimiter` is exported from `users.ts` so the test helpers can reset it, like the other limiters.
  - A bad colour is reported on the `avatarColor` field; every recipe problem gets the same "That avatar can't be saved" on `avatar`.
  - `UserUpdated` reaches everyone who shares a chat, even across a block: blocked people in a shared group still see each other's messages, and so their avatars.
- **e2e** signs up fresh users, as the rest of the suite does, instead of using the seeded alice. Their display name is one word, so "My initials" shows a single letter.
- **Tests updated for the new default**: an older e2e check and a unit test expected initials in the group typing bubble; both now expect the drawn character.
- **Review pass after phase 5 (Opus)**:
  - The studio's `⌘/Ctrl+Z` no longer fires while you type in a text field. The chat search box sits beside the studio on desktop, and its own undo was being taken over.
  - The temporary "just saved" bridge in `useAvatarDraft` is gone. The viewer now carries `avatar`, and the bridge could go stale after a colour-only save.
  - "Picked up where you left off" shows only while the look is still exactly last visit's draft.
  - `updateAvatar` without `avatar` now keeps the current recipe and changes only the colour; `null` still resets it.
  - The README screenshots were regenerated (the seeded people now have characters), with two new ones of the studio.

- **Correction (found during the replies work):** `UserUpdated` wasn't actually applied live. The events subscription uses `no-cache`, and the handler only updated your own Viewer entry, so the earlier "showed up live" check most likely passed thanks to a refetch. `applyUser` in `apps/web/src/lib/cacheUpdates.ts` now writes the person into the cache (and renames your direct chat with them); `cacheUpdates.test.ts` covers it.

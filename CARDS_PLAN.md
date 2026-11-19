# CARDS_PLAN.md: user cards

> **Status: implemented (2026-11-19).** Paths are relative to the repo
> root. "Deviations" at the end lists where the build differs from this plan.

## 0. In one minute

- Every user has a **card**: a fixed-size, portrait card (like the sketch) with their `@username`, their
  **character avatar** (always the one from their profile, live), their **interests**, a short **about me**
  and a **Message @username** button.
- People design their card in a **Card studio** (`/settings/card`, reached from Settings → Your card): colours,
  gradients, patterns, borders, corners, finishes (gloss, holographic, glitter, paper), layouts, fonts, divider
  styles, interest-chip styles, button styles, avatar frames and rings, and **stickers** they drag anywhere
  on the card, resize and rotate (drawn stickers in the avatar's style, plus any emoji).
- **Every card is the same size** (a 320 × 540 layout box, scaled to fit wherever it's shown, so line breaks
  never change). The about text is capped (150 characters, 4 lines) and interests are capped (6).
- **Interests** come from a built-in list (~90, with emoji, in categories, searchable), plus **custom
  interests** with a name and an emoji of your choice.
- **Sharing:** every card has a readable link, `/@username`. People on Realtime can always open it.
  People who aren't signed in can open it only while the owner has **Share my card** on (off by default);
  their "Message" button asks them to sign in or sign up, then opens the chat.
- **In the app**, tapping a person opens their card: chat header, group info member rows, sender avatars
  in group messages, and new-chat search results.
- Like avatars, the card is stored as a small JSON **recipe** (≤ 4 KiB) and drawn in the browser.

## 1. Decisions (asked 2026-11-19)

| Question | Answer |
| --- | --- |
| Who can open a shared link | Anyone, but signed-out visitors only while "Share my card" is on |
| Link style | Readable: `/@username` (usernames can't change, so links never break) |
| Stickers | Drag anywhere, resize and rotate (up to 8) |
| Where cards show in the app | Chat header & group info, avatars in messages, new-chat search |

Decided without asking (sensible defaults, easy to change):

- The card has its own colours and does **not** follow the app's light/dark theme: a card looks the same
  to everyone, like a physical card. The page around it does follow the theme.
- The default card is the sketch: white, hand-drawn ("sketch") border, `@username` top-left, avatar centred,
  plain comma-separated interests, centred text, sketch dividers and a sketch button.
- Fonts are bundled with the app (Fontsource, self-hosted, CSP-safe) and loaded only when a card uses them.
- Signed-in people can see anyone's card in the app (the switch only governs the public link), except that
  someone who **blocked you** has no card for you.
- No link-preview image for now (text `og:` tags only, from the server, for shared cards).

## 2. The recipe (the contract between client and server)

```json
{
  "v": 1,
  "about": "Bla bla bla…\nHit me up",
  "interests": ["hiking", "biking", "pizza", "games", { "t": "Bouldering", "e": "🧗" }],
  "layout": "classic", "name": "username", "labels": true, "align": "center", "font": "clean",
  "bg": "paper", "pattern": "none", "patternTone": "soft", "ink": "auto", "accent": "indigo",
  "border": "sketch", "borderColor": "ink", "corners": "soft", "finish": "matte",
  "frame": "none", "frameBg": "avatar", "ring": "none",
  "divider": "sketch", "chips": "plain", "button": "sketch",
  "stickers": [
    { "k": "star", "c": "yellow", "x": 0.86, "y": 0.07, "s": 1, "r": 12 },
    { "e": "🍕", "x": 0.12, "y": 0.52, "s": 0.8, "r": -8 }
  ]
}
```

- **Content**
  - `about`: plain text, at most **150 characters** (code points) and **4 lines**. No links are made clickable.
  - `interests`: at most **6**, no duplicates. A string is a built-in interest id (`interests.ts`); an object
    is a custom one: `t` the name (1–18 characters, one line), `e` an optional single emoji.
- **Style**: every other key is a slug from the client catalog (`apps/web/src/features/card/catalog.ts`),
  except `labels` (boolean). Unknown or missing values fall back to the default, as with avatars.
- **Stickers**: at most **8**, back to front. Each has exactly one of `k` (a drawn sticker id) or `e` (an
  emoji). `x`, `y` are the sticker's centre as a fraction of the card (0–1); `s` is the scale (0.4–2.5,
  1 = 56 layout px); `r` the rotation in degrees (−180…180); `c` an optional colour slug for drawn stickers.
- The **avatar is not in the card recipe**: the card always draws the user's current `avatar`/`avatarColor`.

**Server validation** (shape only, like avatars; the server never draws):

- A plain object; at most 40 keys; keys `^[a-zA-Z]{1,16}$`.
- `v`: integer 0–999. `labels` (and any other boolean): boolean.
- `about`: string; normalized (CRLF → LF, other control characters removed, trailing spaces trimmed per
  line, whole string trimmed); then ≤ 150 code points and ≤ 4 lines.
- `interests`: array ≤ 6 of a slug `^[a-z0-9-]{1,24}$` or `{ t, e? }` with `t` trimmed, 1–18 code points,
  no control characters or newlines, and `e` a single RGI emoji
  (`new RegExp('^\\p{RGI_Emoji}$', 'v')`, as for reactions). Duplicates (same slug, or same `t` ignoring case)
  are dropped.
- `stickers`: array ≤ 8 of objects with exactly one of `k` (slug) / `e` (RGI emoji), numbers in range
  (rounded: `x`/`y` to 3 decimals, `s` to 2, `r` to an integer), optional `c` slug. No other keys.
- Every other value: a slug `^[a-z0-9-]{1,24}$` or a boolean.
- Re-serialized and rejected over **4096** characters. Any problem: `BAD_USER_INPUT`
  "That card can't be saved" on field `card` (an over-long about gets "About me is too long").

## 3. The card

### 3.1 Size and scaling

The card is laid out in a fixed **320 × 540** box (`CARD_W`, `CARD_H`) and scaled with a CSS transform
to the width it's given, so the layout, wrapping and sticker positions are identical everywhere: settings
preview, studio, dialog, public page. Sections have fixed heights; text that could still overflow
(wide fonts) is clipped by a line clamp, and the studio warns before that happens.

### 3.2 Layout (classic, the sketch)

```
┌──────────────────────────────┐
│ @mateo                       │  name (top-left in "classic")
│          ( avatar )          │  avatar 160 px, frame/ring/backdrop options
│                              │
├──────────────────────────────┤  divider (style option)
│ Interests: Hiking, Biking,   │  chips (plain / pill / outline / tag / sticker)
│ Pizza, Games                 │
├──────────────────────────────┤
│ About me: Bla bla bla…       │  ≤ 150 chars, ≤ 4 lines
│ Hit me up                    │
├──────────────────────────────┤
│     [ Message @mateo ]       │  button (style option); opens the chat
└──────────────────────────────┘
```

Layouts: **classic** (as above), **centered** (avatar on top, name under it), **side** (smaller avatar left,
name right), **banner** (an accent banner across the top with the avatar overlapping its lower edge).

### 3.3 Catalog (initial)

| Option | Choices |
| --- | --- |
| Background | 16 solids (paper, cream, sand, blush, peach, lemon, mint, sky, periwinkle, lavender, rose, coral, sage, slate, ink, midnight) and 12 gradients (sunset, ocean, mint fizz, aurora, candy, dusk, forest, lemonade, peachy, galaxy, sherbet, mono) |
| Pattern | none, dots, grid, stripes, checkers, waves, zigzag, stars, hearts, confetti, sprinkles, crosses, bubbles, diamonds, clouds |
| Pattern tone | soft, bold, white, accent |
| Text colour | auto (dark on light, light on dark) or a palette colour |
| Accent | 12 colours (chips, button, banner, rings) |
| Border | none, thin, thick, double, dashed, dotted, sketch, stitched, ticket, frame, glow, foil |
| Border colour | ink, white, accent, or a palette colour |
| Corners | square, soft, round, extra round |
| Finish | matte, gloss, holographic, glitter, paper |
| Avatar frame | none (cut-out), circle, squircle, rounded square, arch, blob, hexagon, stamp |
| Avatar backdrop | their avatar colour, accent, card colour |
| Avatar ring | none, thin, thick, double, dashed, rainbow, glow |
| Name | `@username`, or display name + `@username` |
| Section labels | on / off ("Interests", "About me") |
| Alignment | left, center |
| Divider | none, line, dashed, dotted, wavy, zigzag, stars, sketch |
| Interest chips | plain (comma list), pill, outline, tag (#hiking), sticker |
| Button | solid, soft, outline, pill, sketch |
| Font | clean (Figtree), bubbly (Fredoka), storybook (Fraunces), typewriter (JetBrains Mono), handwritten (Caveat), marker (Permanent Marker), pixel (Pixelify Sans) |
| Stickers | ~40 drawn stickers in the avatar style (thick ink outlines, die-cut white edge), several colourable, plus any emoji |

### 3.4 Motion

Cards tilt toward the pointer (or a drag on touch) in the dialog and on the public page, with the gloss and
holographic finishes following the tilt. Reduced motion: no tilt, finishes stay still. Opening the dialog uses
the app's existing springs (`apps/web/src/lib/motion.ts`).

## 4. UI

### 4.1 Card studio (`/settings/card`)

- Same shell as the avatar studio: a big live preview, tabs with option grids, header actions Undo
  (⌘/Ctrl+Z, not while typing), Randomize (style only, never your text), Save. Unsaved edits are kept as a
  draft on the device (`lib/drafts`, cleared on sign-out).
- Tabs: **About** (about me with a live counter, interests picker with search, categories, "Add your own"
  with an emoji), **Stickers**, **Colors**, **Border**, **Layout**, **Avatar** (frame, backdrop, ring, and
  "Edit avatar" →), **Font**.
- Stickers: tap one to add it to the middle of the card; drag it on the preview to move; the selected
  sticker shows a corner handle to resize and rotate in one drag, and a remove button. Two-finger pinch and
  twist on touch. Keyboard: arrows nudge (Shift: further), `+`/`-` resize, `[`/`]` rotate, Delete removes,
  Esc deselects. Tapping a sticker brings it to the front. The 9th sticker is refused with a hint.

### 4.2 Showing a card

- `CardView`: the card itself (props: user, recipe, `interactive` for the Message button, `tilt`).
- `CardDialog`: someone's card in the app's `Dialog` (a bottom sheet on phones). The card's own
  **Message @name** button opens the chat (the only Message button; nothing is added under the card),
  with **Copy link** under it, or **Edit card** and **Share** on your own.
- `CardPage`: the `/@username` page. Signed in: shown in the main pane like Settings. Signed out: a simple
  centred page with the card, the logo, and Sign in / Create account. "This card isn't shared" when there's
  nothing to show (same wording whether or not the user exists).

### 4.3 Settings → Your card

A small preview of your card, **Edit card**, the **Share my card** switch ("Anyone with the link can see your
card, even without an account. People on Realtime can always see it."), and Copy link / Share.

## 5. Server

- `User.card String?` (null = the default card) and `User.cardShared Boolean @default(false)`.
  Migration `user_cards`.
- GraphQL:
  - `type Card { id: ID! user: User! recipe: String shared: Boolean }` (`id` is the user id; `shared` is
    only filled in on your own card, null on others').
  - `card(username: String!): Card`: signed out, only when `cardShared`; signed in, anyone's, except
    `null` when the owner blocked you. Unknown users and unshared cards give the same `null`.
  - `updateCard(input: UpdateCardInput!): Card!` with `input UpdateCardInput { recipe: String, shared: Boolean }`
    (a left-out field is kept; `recipe: null` resets to the default card). Rate-limited, 30 saves a minute.
  - `User.online` is `false` and `User.lastSeenAt` is `null` for signed-out requests (presence must not leak
    through the public page).
- Shared cards get `og:title` / `og:description` (display name, `@username`, the first line of about)
  injected into `index.html` for `/@username` requests in production.

## 6. Phases

| # | Phase | Who | Done when |
| --- | --- | --- | --- |
| 1 | Card kit: recipe (parse/normalize/serialize/limits), catalog, interests list, stickers art, fonts, `CardView` with every option, tilt and finishes, `/dev/cards` sheet, unit tests | Opus | **Done.** Every option checked on `/dev/cards` |
| 2 | Card studio (`/settings/card`) with the sticker editor and interests picker, `useCardDraft`, `CardDialog`, `CardPage` (presentational) | Opus | **Done.** Checked on desktop (mouse, keyboard) and a touch phone (drag, pinch). Saves to memory until phase 4 |
| 3 | Server: columns, migration, validation, `card`, `updateCard`, signed-out presence, tests | Opus (medium) | **Done.** 74 server tests pass |
| 4 | Wiring: GraphQL docs and types, studio load/save, Settings → Your card, `/@username` routes (signed in and out), sign-in → open the chat, card openers in chat header / group info / message avatars / new-chat search, seed cards, `og:` tags | Opus (medium) | **Done.** Signed-out `/@bob` → Message → sign in → chat with Bob, checked in the browser |
| 5 | Tests and docs: e2e (edit card, share link signed out, Message → chat), README section, screenshots | Opus (medium) | **Done.** All 28 e2e tests pass; README section and three screenshots |

## 7. Checklists for phases 3–5

Updated after phase 2 with the real names. Everything the client draws lives in
`apps/web/src/features/card/`:

| File | What it is |
| --- | --- |
| `recipe.ts` | `CardRecipe` type, `DEFAULT_CARD`, `parseCard(raw)`, `serializeCard(card)`, limits (`ABOUT_MAX` …) |
| `CardView.tsx` | `CardView({ card, user, width?, onMessage?, tilt?, … })`; `user` is a `CardUser` (`username displayName avatar avatarColor`, so any `User` fits) |
| `CardDialog.tsx` | `CardDialog({ open, onOpenChange, user, card, own?, onMessage?, messaging? })`; `card` is `undefined` while loading, `null` for "isn't available" |
| `CardPage.tsx` | `CardPage({ username, state, signedIn, own?, onMessage?, onSignIn? })`; `state` is `{status:'loading'}`, `{status:'missing'}` or `{status:'ready', user, card}` |
| `share.ts` | `cardPath(username)` (`/@name`), `cardUrl`, `copyCardLink(username)`, `shareCard(user)` |
| `useMyCard.ts` | **Stub to replace in phase 4** (keeps the card in memory). Keep its return shape |
| `CardStudio.tsx` | The studio; reads and saves only through `useMyCard` |

### Phase 3: server (`apps/server`)

1. `prisma/schema.prisma`: on `User`, after `avatar`:
   `/// Card recipe (JSON, at most 4 KiB). Null means the default card. Drawn by the client.` `card String?`
   and `/// Signed-out visitors can open the card at /@username.` `cardShared Boolean @default(false)`.
   Migration `user_cards`.
2. `src/services/cards.ts`:
   - `parseCard(raw)` per §2 (zod, shape only), returning the re-serialized string; `null` passes through.
   - `getCard(viewerId | null, username)`: lowercase the username; `null` if no user, if signed out and not
     `cardShared`, or if the owner blocked the viewer (`services/blocks.ts`). Returns
     `{ id: user.id, user, recipe: user.card, shared: viewerId === user.id ? user.cardShared : null }`.
   - `updateCard(userId, input)`: `recipe` (if present) through `parseCard`, `shared` (if present) must be a
     boolean; a `RateLimiter(30, 60_000)` (`cardLimiter`, exported for the test helpers). Returns the same
     shape as `getCard`.
3. `src/schema.ts` and `src/resolvers.ts`: the `Card` type, `card` query (no `requireUser`), `updateCard`
   mutation; `User.online`/`lastSeenAt` return `false`/`null` when `ctx.userId` is null.
4. `test/api.test.ts`: save and read back; `null` resets; `shared` toggles; signed-out read works only when
   shared and gives `null` for unknown users too; blocked viewer gets `null`; validation rejects 151-char
   about, 5 lines, 7 interests, 9 stickers, out-of-range numbers, a sticker with both `k` and `e`, a nested
   style value, bad emoji, a 19-char custom interest, oversize; normalization (CRLF, trimming, duplicate
   interests dropped, numbers rounded); signed-out `User.online` is false. Reset `cardLimiter` in helpers.

### Phase 4: wiring (`apps/web`, `apps/server`)

1. `src/lib/gql.ts`: a `Card` type (`id`, `recipe: string | null`, `shared: boolean | null`, `user: User`);
   `CARD` query (`card(username: $username) { id recipe shared user { ...UserFields } }`); `UPDATE_CARD`
   mutation (`updateCard(input: $input)`, same fields).
2. `features/card/useMyCard.ts`: replace the in-memory body with `useQuery(CARD, { variables: { username:
   viewer.username }, fetchPolicy: 'cache-and-network' })` and `useMutation(UPDATE_CARD)`. Keep the return
   shape `{ data: { recipe, shared } | null, loading, error, save(input), saving }`; `save` throws on error (the
   studio shows the GraphQL message). Nothing in `CardStudio.tsx` should need to change.
3. Settings → **Your card** (`SettingsPage.tsx`, a `Section` right after Profile), per §4.3:
   - `CardView` of your saved card at about 150 px wide (`parseCard(data.recipe)`, `user` = the viewer),
     next to **Edit card** (`buttonClass('secondary','sm')` link to `/settings/card`) and **Share**
     (`shareCard(viewer)`).
   - The **Share my card** `Switch` → `save({ shared })`, with the hint text from §4.3 and the link
     (`cardUrl(viewer.username)`) shown under it while it's on, with a Copy button (`copyCardLink`).
4. Opening cards from anywhere: add `features/card/CardDialogProvider.tsx` — a context with
   `useOpenCard(): (user: User) => void`, mounted once in `AppShell`. It runs the `CARD` query for that
   username (`cache-and-network`), renders one `CardDialog` with `card = loading ? undefined :
   data.card ? parseCard(data.card.recipe) : null`, `own` when it's the viewer, and `onMessage` =
   `START_DIRECT` (see `NewChatDialog.tsx` for the existing call) → close → `navigate('/c/' + id)`, with
   errors as a toast. Use `data.card.user` for the dialog's `user` once loaded (fresh avatar).
5. Openers, each calling `openCard(user)`:
   - Chat header (`ChatView.tsx`): in a direct chat, the peer's avatar and name become a button.
   - Group info (`GroupInfoDialog.tsx`): each member row's avatar/name (not the remove button). Opening a
     second dialog over the first is fine (Radix stacks them).
   - Sender avatars in group message runs (`MessageList.tsx`, the `<Avatar>` near line 741): wrap it in a
     button with `aria-label={`${name}'s card`}`. Don't steal the bubble's own gestures.
   - New-chat search results (`NewChatDialog.tsx`): a small ghost icon button (lucide `IdCard`) at the end
     of each result row, `aria-label={`See ${name}'s card`}`; tapping the row still starts the chat.
6. Routes for `/@username` (react-router can't do partial segments, so test the pathname with
   `/^\/@([a-z0-9_]{3,20})\/?$/i`):
   - Signed out (`App.tsx`, where `AuthPage` would render): if the path matches, render `CardPage` with
     `signedIn={false}`, loading the card with `CARD`. Its `onMessage` and `onSignIn`: put the username in
     `sessionStorage['pendingChat']` (only for `onMessage`), then `navigate('/')` so the auth screen shows.
   - Signed in (`AppShell` `PaneRoutes` + `inPane`): a route `/:handle` whose element checks the leading `@`
     (else `<Navigate to="/" />`), loads `CARD`, and renders `CardPage` with `signedIn`, `own`, and
     `onMessage` doing what the provider's does.
   - After sign-in or sign-up, `AppShell` checks `sessionStorage['pendingChat']` once on mount: removes it,
     runs `START_DIRECT`, navigates to the chat (toast on error, e.g. blocked).
7. `apps/server/prisma/seed.ts`: cards for bob, carol, dave and erin, written as recipe JSON in the §2
   shape (different backgrounds, layouts, fonts, interests incl. one custom, 1–3 stickers each); alice keeps
   the default; bob's and carol's are shared (`cardShared: true`).
8. `og:` tags (§5): in `src/app.ts`'s HTML fallback, for `/@username` of a shared card, read `index.html`
   once, and inject `<meta property="og:title">` / `og:description` / `<title>` (HTML-escaped) before
   `</head>`. Unshared or unknown: serve the plain file. Production only (dev uses Vite).
9. Typecheck, lint, `npm test -w apps/web`; then in the browser: a signed-out window opens `/@bob` and sees
   his card; Message → sign in as alice → lands in the chat with bob.

### Phase 5: tests and docs

1. e2e: a fresh user opens Settings → Edit card, writes an about, picks two interests and a custom one,
   adds a sticker, changes the background, saves, reloads and sees it; turns on Share my card; a second,
   signed-out context opens `/@user` and sees the about text; its Message button leads to sign-in and, after
   signing in as another fresh user, to a chat with the owner. With sharing off, the signed-out context sees
   "This card isn't shared".
2. README: a short "Cards" section.
3. Screenshots: the studio (desktop light, phone dark) and the public card page.
4. Mark this plan implemented; fill in Deviations.

## Deviations

Phases 1–2 (Opus, 2026-11-19):

- **Section heights** (layout px): header 224, interests 92, about 110, footer 60, dividers 18 each.
- **Text that doesn't fit shrinks.** The about text and the plain interests list try four or five smaller
  sizes before falling back to an ellipsis; chip-style interests switch to a compact size (at most two to a
  row, so six always fit in three rows). 150 characters in four lines can still overflow in the worst case
  (a long last line), so the studio says so in red under the text box. Measuring happens after every render,
  so fonts finishing loading are accounted for.
- **Border colour "Text color"** (`borderColor: 'ink'`) follows the text colour instead of meaning black, so
  the default sketch border stays visible on dark backgrounds. The avatar ring uses the same colour.
- **Default avatar frame is a circle on the avatar colour**, so the card matches the profile avatar. The
  sketch's frameless head is the "Cut-out" frame.
- **Stickers can hang over the card's edge** (their centre stays on the card), like real stickers.
- **Studio extras:** tapping a sticker on the preview from any tab selects it and opens the Stickers tab;
  the selected sticker also gets Size and Turn sliders and colour swatches (for stickers that take one); a
  tap brings a sticker to the top of the pile; ⌘/Ctrl+Z undo folds typing and nudges into one step; an eye
  button opens "How others see your card" (the dialog, with tilt).
- **Empty states on the card:** no about shows "Hi, I'm {display name}! 👋"; no interests shows "No
  interests yet".
- **Small shared changes:** `AvatarFigure` takes a `box` prop to nest inside the card's frame SVG;
  `EmojiPickerDialog` takes a `title`; `vite-env.d.ts` declares the Fontsource modules.

Phases 3–5 (Opus at medium effort, 2026-11-19; the user chose to stay on Opus):

- The migration is `user_cards`. The service is `src/services/cards.ts` (`parseCardRecipe`, `getCard`,
  `updateCard`, `cardLimiter`). Card links ignore a leading `@` and letter case.
- `withCardMeta` (in `src/app.ts`, exported for its test) fills in `<title>`, `og:title`,
  `og:description`, `og:type` and `description` for shared cards.
- Opening a card from anywhere: `CardDialogProvider` (mounted in `App.tsx` around `AppShell`) gives
  `useOpenCard()`. `useStartChat` opens or starts the direct chat and is shared by the dialog, `/@name` and
  the after-sign-in pending chat (`usePendingChat` in `CardRoute.tsx`).
- The message sender type (`lib/messages.ts`) has an optional `username`. The sender avatar opens a card
  only when it's there, which it always is for messages from the server.
- New-chat search has the card button on every result, including the "add members" picker in group info.
  New chat closes whenever the route changes, so messaging from a card opened there lands in the chat.
- e2e: `cards.spec.ts` (design + save + reload, share off then on, visitor signs up via Message and lands
  in the chat; opening a card from the chat header). The README screenshots were regenerated, with
  three new ones (`card-studio-light`, `card-studio-phone-dark`, `card-public-light`).
- **One Message button.** The dialog's extra Message button is gone: the card's own "Message @name"
  button opens the chat everywhere, and shows a spinner while the chat opens (`messaging` prop on
  `CardView`, `CardDialog` and `CardPage`).
- **Phone polish (2026-11-19):**
  - Cards only tilt for a mouse. On touch screens they stay flat and crisp, and a finger on them
    scrolls or drags the sheet.
  - On phones, the studio preview is bigger (42% of the screen, 54% on Stickers) and shrinks while you
    type, so the keyboard doesn't cover the text box. The "same size" hint only shows when there are
    unsaved changes.
  - The studio tab strips (cards and avatars) fade at a scrolling edge (`lib/scrollEdges.ts`,
    `.edge-fade`).
  - Sticker handles are 34 px on touch screens.
  - "Create an account" on a shared card opens the sign-up form.
- **Tilt without wobble:** the card reads the pointer from its still wrapper (measuring the tilting
  card fed its own rotation back in), turns as one GPU layer (`will-change: transform`) so text
  doesn't shimmer, keeps its shadow on the wrapper, and only passes the light position to finishes
  that use it (gloss, holographic, foil).

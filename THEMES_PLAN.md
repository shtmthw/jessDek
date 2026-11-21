# THEMES_PLAN.md: chat themes and member colours

> **Status: done (2026-11-21).** Paths are relative to the repo root. "Deviations" at the end
> lists where the build differs from this plan.

## 0. In one minute

- Every chat, direct or group, can have a **theme**: a wallpaper (a soft colour or gradient with fine-line
  doodles drawn in the avatar/card style), an **accent** (your bubbles, the send button, links, the typing
  line, the "new messages" divider) and a **bubble style**. Every theme has a light and a dark version.
- Themes are **shared**: everyone in the chat sees the same theme and **any member can change it**. The chat
  then shows a quiet line, "Alice changed the theme to Matcha · Change", and the chat list mentions it
  (like reactions: no sound, not unread, the chat doesn't move up).
- **About 16 presets** made for jessDek, plus a **Custom** tab: accent colour, wallpaper, doodles and bubble
  style.
- In **group chats** every member gets **their own colour** (their name and a tint on their bubbles). It's
  picked automatically from a palette, and each member can **choose their own colour** for that group.
- The default theme, **Classic**, is today's look (white/zinc, indigo, no wallpaper), so nothing changes for
  chats nobody themes, apart from member colours in groups.
- Like avatars and cards, a theme is a small JSON **recipe** (≤ 512 bytes) stored on the conversation and
  drawn by the browser. The server checks only its shape.

## 1. Decisions (asked 2026-11-21)

| Question | Answer |
| --- | --- |
| Who sees a chat's theme, who changes it | Shared by everyone in the chat; any member can change it; the chat says who did |
| Per-person colours in groups | Yes: automatic from the theme's palette, and each member can pick their own for that group |
| Depth | Presets plus a Custom builder (accent, wallpaper, doodles, bubble style) |
| Pacing | Straight through on Opus: design in Penpot, build, test, report at the end |

Decided without asking (sensible defaults, easy to change):

- Only the **latest** theme change is remembered (who and when), not a history. The notice sits in the
  timeline where it happened; older changes aren't shown. No system messages are added to the data model.
- A blocked direct chat (`canMessage: false`) can't have its theme changed.
- Your own bubbles always use the theme's accent, in groups too. Member colours tint **other people's**
  bubbles and names. Two people may end up with the same colour; that's fine.
- The header keeps the app's own colours (with the theme's accent for the typing line); the wallpaper fills
  the message area and runs under the composer.
- The theme picker previews the chosen theme live in a mini chat before you set it.

## 2. The recipe (the contract between client and server)

```json
{ "v": 1, "preset": "matcha" }
{ "v": 1, "preset": "custom", "accent": "teal", "wall": "mint", "doodle": "nature", "bubble": "soft" }
```

- `preset`: a preset id (`apps/web/src/features/theme/presets.ts`). A named preset defines everything; the
  other keys are ignored. `custom` builds the theme from `accent`, `wall`, `doodle` and `bubble`, each a slug
  from `apps/web/src/features/theme/catalog.ts`. Unknown or missing slugs fall back to the default.
- `null` (no theme) is Classic.

**Server validation** (shape only; the server never draws):

- JSON text of at most **512 bytes**; a plain object with at most **12 keys**, keys `^[a-zA-Z]{1,16}$`.
- `v`: an integer 0–999. Every other value: a slug `^[a-z0-9-]{1,24}$`.
- Stored re-serialized. A member colour is one slug of the same form, or `null` for automatic.

## 3. The theme

### 3.1 Tokens

`resolveTheme(recipe, mode)` returns everything the chat needs, for `light` or `dark`:

| Token | Used for |
| --- | --- |
| `wall`, `wallBase` | The wallpaper's CSS background, and a colour standing for it (contrast checks) |
| `doodle`, `doodleOpacity` | The doodle layer's ink and strength |
| `accent`, `onAccent` | Your bubbles and the send button; text on them |
| `accentText` | Links, the typing line, the unread divider, rings: the accent nudged until it reads on the wallpaper |
| `theirs`, `onTheirs` | Other people's bubbles (DMs, and groups before member tints) |
| `meta` | Timestamps, day and time labels, names over the wallpaper |
| `members[]` | Group member colours: `{ id, bubble, name }` per palette entry |

The chat sets these as CSS variables (`--brand`, `--brand-foreground`, `--brand-text`, `--bubble`,
`--muted-foreground`, plus `--wall*`) on the chat section, so every existing component inside (bubbles,
composer, reply quotes, reaction chips, typing bubble, message menu) picks the theme up with no per-component
colour logic. Light and dark values are both set; CSS picks one with `.dark`, so switching the app's mode
never re-renders the chat.

**Contrast rules** (checked by a unit test over every preset × mode × bubble style): bubble text ≥ 4.5:1 on its
bubble, `accentText` and `meta` ≥ 4.5:1 on `wallBase`, member names ≥ 4.5:1 on the wallpaper.

### 3.2 Wallpapers, doodles, bubbles

- **Wallpapers:** solids and gradients from the card palette, each with a hand-tuned dark twin (a deep,
  low-saturation version of the same hue rather than a plain darkening).
- **Doodles:** a repeating tile drawn in one ink at low opacity. Simple patterns reuse the card's tiles
  (dots, stars, hearts, clouds, waves, sprinkles, confetti); **scatter sets** re-draw the card stickers as
  fine line art (fills off, one ink): Doodles (mixed), Snacks, Nature, Space, Pets, Music, Games.
- **Bubbles:** `solid` (today's), `soft` (your bubbles a light accent wash with dark text), `outline` (a
  thin ink outline with a small offset shadow, like a die-cut sticker).

### 3.3 Presets (draft, final list after the Penpot review)

Classic, Doodles, Blush, Matcha, Lemonade, Ocean, Lavender, Peach, Candy, Snacks, Space, Pets, Sunset,
Notebook, Arcade, Sticker.

### 3.4 Member colours (groups)

- Palette: the item colours of the avatar kit that aren't the theme's accent (sky, teal, green, orange,
  rose, lilac, gold, red, denim, tan).
- Automatic: members in join order take the palette in order (skipping the accent), so the first 9 or so
  members always differ. A colour you picked wins.
- Shown as: the sender name above a run, a soft wash on their bubbles (`bubble`), and the bar of a quote of
  their message.

### 3.5 Motion

The wallpaper and accent crossfade (~300 ms) when the theme changes, live, for everyone. Reduced motion:
an instant swap.

## 4. UI

- **Chat header menu → Theme** (and **Group info → Theme / Your colour**) opens the **theme sheet** (the
  app's `Dialog`: centred on desktop, a bottom sheet on phones):
  - a live **mini chat** preview at the top (wallpaper, a bubble each way, a reply, the composer pill),
  - **Themes** tab: a grid of preset tiles (radio group, arrow keys),
  - **Custom** tab: accent swatches, wallpaper swatches (solids, gradients), doodle tiles, bubble style,
  - in groups, a **Your colour** tab: Automatic, or a swatch,
  - **Set theme** saves; closing without saving keeps the old theme.
- **Notice** in the timeline: "You changed the theme to Matcha · Change" (centred, small; *Change* opens
  the sheet). "… reset the theme" for Classic.
- **Chat list**: "Bob changed the theme to Matcha" when that's newer than the last message and reaction.
- `/dev/themes` (dev only): every preset as a mini chat in light and dark, for visual checks.

## 5. Server

- Migration `chat_themes`:
  - `Conversation.theme String?`, `Conversation.themeSetById String?` (→ `User`, `onDelete: SetNull`),
    `Conversation.themeSetAt DateTime?`;
  - `ConversationMember.color String?` (a member colour slug; null = automatic).
- `src/services/themes.ts`: `parseTheme(raw)`, `setChatTheme(userId, conversationId, theme)`,
  `setMemberColor(userId, conversationId, color)` (groups only). Both: `requireMember`, rate limit 30 a
  minute, then `ConversationUpdated` to every member. `setChatTheme` refuses a blocked direct chat.
- GraphQL: `Conversation.theme: String`, `themeSetBy: User`, `themeSetAt: String`,
  `memberColors: [MemberColor!]!` (`type MemberColor { userId: ID! color: String! }`, picked colours only);
  `setChatTheme(conversationId: ID!, theme: String): Conversation!`,
  `setMemberColor(conversationId: ID!, color: String): Conversation!`.
- Seed: Weekend hike gets Matcha and Bob picks orange; alice ↔ bob gets Doodles.

## 6. Phases

| # | Phase | Done when |
| --- | --- | --- |
| 1 | Design: catalog, presets, doodles, `resolveTheme`, contrast test; Penpot board of every preset in light and dark; review and iterate | The board reads well in both modes and the contrast test passes |
| 2 | Server: migration, service, schema, resolvers, seed, tests | Server tests pass |
| 3 | Chat: theme variables on the chat, wallpaper layer, bubble styles, member colours, notice, chat-list line, live updates, `/dev/themes` | Checked in the browser, light and dark, desktop and phone |
| 4 | Theme sheet: presets, custom builder, your colour, mini preview; entries in the header menu and group info | Checked with mouse, keyboard and touch |
| 5 | Tests and docs: unit, e2e (set a theme, the other person sees it live; member colour), README section and screenshots | typecheck, lint, all unit and e2e tests pass |

## Deviations

- **Presets:** 17 in all. There is no **Sticker** preset (the Notebook and Arcade presets use the outlined, sticker-like bubbles instead), and **Soda** and **Mixtape** are new. Final list: Classic, Doodles, Blush, Matcha, Lemonade, Ocean, Lavender, Peach, Candy, Snacks, Space, Pets, Sunset, Notebook, Arcade, Soda, Mixtape.
- **No `/dev/themes` route.** Instead, `apps/web/scripts/theme-board.tsx` draws every preset as a small chat, in light and dark, on one SVG board for design review (`npx tsx scripts/theme-board.tsx out.svg`). It uses the real tokens and doodles. The real-app check was a screenshot sweep of every preset.
- **Lazy loading:** the theme sheet and the doodle layer are separate chunks. The theme system adds 16 kB to the main bundle (about 5 kB gzipped). Before the split it added 53 kB, because the doodles pulled in the card sticker drawings.
- **Member colours:** members are ordered by join time with the user id as a tiebreak, so the automatic colours are stable when two people join at the same moment.
- **e2e:** the group test uses three people, because a group needs at least two others.
- **Found while testing:** the full e2e run tripped the server's per-IP rate limit (600 a minute). The extra theme tests pushed it over, but the cause was that the web app's own static files counted, and a tripped limit replaced the whole app with a page of JSON. Static file GETs are now exempt (`isStaticFileRequest` in `apps/server/src/app.ts`, with tests). The API and pages stay limited.
- **Polish pass (after the build):** the theme sheet's preview and tabs stay pinned while the options scroll, so a pick far down the list still shows. Doodle picker tiles draw their pattern stronger than the real wallpaper, so they can be told apart. The theme-change notice is a pill like the day labels, so it reads on any wallpaper. Bubbles fade their text and outline colours along with the background when the theme changes. In dark mode, outline bubbles drop a real dark shadow under a softer edge, instead of a light offset that read as a glow.

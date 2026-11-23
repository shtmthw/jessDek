# Deck quality: Full or Light

People choose how the Discover deck is drawn.

- **Full** (default) is today's deck.
- **Light** is a simpler version that's easier on older phones and laptops.

A card you open (the card page, a card dialog) is always shown in full.

## Why

Moving quickly through the deck makes the browser build and draw a new detailed card face on every move. The cost is in the faces, not in the network: deck pages come back in about 3 ms. On a phone-class CPU the main thread is saturated at about 10 taps a second. Light cuts what each card costs to build and to draw.

## What Light changes

**Cards in the deck.** The fan, and the front page's stack:

| Layer | Full | Light |
| --- | --- | --- |
| Colours, gradient background, font, layout, name, interests, about, message button | yes | yes, the same |
| Avatar and its frame | yes | yes; a `glow` ring is drawn plain (no drop-shadow filters) |
| Dividers | yes | yes (plain SVG strokes, cheap) |
| Background pattern | yes | no |
| Finish (gloss, holo, glitter, paper) | yes | no (blend modes, and SVG noise for glitter/paper) |
| Border layer and shape mask (stamp, ticket...) | yes | a plain inset ring in the card's line colour; no mask |
| Stickers | yes | no (SVG filters) |
| Card shadow | two blurred `drop-shadow` filters | one cheap `box-shadow` on the face |

**Motion in the fan.** The same fan, poses and parting:

- The settle spring is shorter with no overshoot (0.34 s, bounce 0 instead of 0.46 s, bounce 0.12). There are fewer frames to draw, and the deck trails less behind quick taps.
- The deal-out is shorter (0.45 s, bounce 0).

## Where you choose

- **Settings → Discover → "Card deck":** a two-way `Segmented` control, Full quality / Light. The line under it explains the current choice.
- **The deck's header:** a toggle button (feather icon, `aria-pressed`) next to Shuffle, so it can be switched where the lag is felt. Switching shows a short toast, and the deck keeps its place.
- **Per device:** stored in `localStorage` (key `deck-quality`), because it's about this device's hardware, like the theme and sounds.

## Implementation

1. **`lib/deckQuality.ts`:** `getDeckQuality`, `setDeckQuality`, `useDeckQuality`.
   - Uses `useSyncExternalStore`, with the in-tab listeners plus the `storage` event for other tabs.
   - Unknown or missing values mean `full`.
   - If `localStorage` throws, it keeps an in-memory value for this session.
2. **`CardView` and `CardFace`:** a `lite` prop that skips the layers above.
   - `CardAvatar` gets `lite` for the glow ring.
   - Layers get `data-layer` attributes, and the face gets `data-quality`, so tests can check them.
3. **`Fan`:** a `lite` prop.
   - It's passed to the memoised `Face`, keyed by card, width and lite, so switching re-renders faces without remounting the fan or moving it.
   - It picks the springs and puts `data-quality` on the deck region.
4. **`pages.tsx`:**
   - `DeckFanPage` reads the preference and adds the header toggle.
   - `DiscoverFront` draws its stack in the chosen quality.
   - `DeckCardPage` stays full.
5. **`SettingsPage`:** the Discover section.

## Edge cases

- Switching while the deck is moving, dealing or settling: it keeps the position, and nothing jumps or disappears.
- Switching in Settings in another tab: an open deck follows.
- Reduced motion with Light: both apply (no motion, light faces).
- `localStorage` blocked: the switch still works for the session.
- A garbage stored value means Full.
- Cards with no pattern, finish, border or stickers look the same in both modes, apart from the shadow.
- Skeleton and placeholder cards are unchanged.
- An opened card, from the deck or a chat, is always full.

## Tests

- **Unit (`deckQuality.test.ts`):**
  - The default, set and get.
  - A garbage value.
  - Blocked storage.
  - Listeners notified.
  - The cross-tab `storage` event.
- **Unit (`CardView.lite.test.tsx`):**
  - A card with a pattern, finish, border and stickers renders all its layers in Full and none of them in Light.
  - The text content is the same in both.
- **e2e (`discover.spec.ts`):**
  - Settings switch: it persists across a reload, and the deck draws light faces.
  - Header toggle: it switches live, keeps the same middle card, and a reload keeps it.
  - An opened card from a light deck shows its stickers.

## Check

- **Playwright MCP:** full and light fans side by side, dark and light themes, desktop and phone, the Settings section, and the header toggle states.
- **Frame and trace scripts:** fast taps in Full and in Light, on 4× throttled Chromium and on Firefox.

## Status (2026-11-23)

The feature is built and tested:

- Unit: 9 tests in `deckQuality.test.ts` and 5 in `CardView.lite.test.tsx`.
- e2e: 2 new tests in `discover.spec.ts`.

Results, for 30 fast taps 100 ms apart on a large deck (prod build):

| | Full | Light |
| --- | --- | --- |
| Chromium, CPU ×4 (phone stand-in): frames over 25 ms | 64 | 2 |
| Chromium, CPU ×1: frames over 25 ms | 36 | 0 |
| Main-thread commit time (×4) | 162 ms | 37 ms |
| Main-thread layerize time (×4) | 396 ms | 224 ms |
| Main-thread script time (×4) | 704 ms | 501 ms |

Heavy layers in the fan go from 33 to 0, and filtered elements from 24 to 0.

Headless Firefox renders in software here. It idles at 60 fps but drops to about 37 fps while the nine rotated cards move in either mode, so its numbers don't reflect a GPU-backed Firefox.

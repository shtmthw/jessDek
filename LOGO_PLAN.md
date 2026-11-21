# jessDek logo: handoff and replacement plan

Status (2026-11-21, later): **F · Monogram chosen (round 6, design 3) and shipped to the working tree.** Favicon, PWA icons, manifest, `index.html` and `Logo.tsx` use it. The app is renamed from Realtime to **jessDek** in every user-facing string (infrastructure names like the `@realtime/*` packages, the Docker image and DB names are unchanged). A `Wordmark` component (`apps/web/src/components/Wordmark.tsx`, one drawing for both themes via `currentColor` and `--brand-text`) replaces the icon + text in the public card page header. README screenshots are regenerated.

> **For the agent picking this up:** the steps below are done for `f-monogram`. Keep them as the record, or to swap concepts later.

Quick look: [`docs/brand/jessdek-logo/boards/finals.png`](docs/brand/jessdek-logo/boards/finals.png) shows every final version, in light and dark and as an icon. Round-by-round boards are in the same folder (`round-1.png` … `round-6.png`).

## The brief

The user asked for a logo that reads "jessDek" (lowercase j, camel-case D). It should be **cute, clean, hand-drawn and minimal, but not look like it's for a kids' app.** It should take its art style from the site: the fine-line character avatars, the doe eyes, blush and four-point sparkles, and the zinc + indigo palette.

All concepts share:

- **Hand-built monoline lettering.** These are not a font: each letter is a stroked path with round caps, a seeded wobble and a small tilt and bounce per letter. Final weight is 6.2 units on a 60-unit x-height, matching the avatars' fine lines.
- **Colours**, taken from `apps/web/src/index.css` and the avatar kit:

  | Role | Hex | Source |
  | --- | --- | --- |
  | Ink (lines, text) | `#18181B` | `--foreground`, avatar `INK` |
  | Brand indigo | `#4F46E5` | `--brand` |
  | Indigo for dark mode | `#818CF8` | `--brand-text` (dark) |
  | Ink on dark | `#FAFAFA` | `--foreground` (dark) |
  | Icon tile (lavender) | `#EEF0FF` | new: a tint of the brand |
  | Blush | `#FFA3B1` | avatar cheeks |
  | Skin / hair (Peek only) | `#FDE3D3` / `#24201F` | avatar `peach` / `black` |

## The concepts

| ID | Folder | Idea | Notes |
| --- | --- | --- | --- |
| A · Ink | `a-ink` | Pure wordmark; the j's dot is the avatar sparkle | The most grown-up. The icon (a j plus a sparkle) is thin at 48 px. |
| B · Deck | `b-deck` | Two hand-drawn cards, the front one with an avatar face, plus the wordmark | Nods to the cards feature and the planned card game. The face is lost at 48 px. |
| C · Bubble | `c-bubble` | The camel-case D is an indigo chat bubble with doe eyes | Says "chat" and gives the brand a mascot. Strong icon. |
| D · Sticker | `d-sticker` | The wordmark on a die-cut speech-bubble sticker with an indigo offset | Looks the same on light and dark. The icon is "jD" on the sticker. |
| E · Peek | `e-peek` | The default avatar peeks over the D, hands on the ledge | Closest to the site's look. **The icon is the cutest of all seven.** |
| F · Monogram | `f-monogram` | j and D share one stem; the bowl is filled indigo and the j's dot is a sparkle | The cleanest and most brand-like. Reads at 48 px. |
| G · Swash | `g-swash` | The j's tail loops into an underline that ends in a sparkle | Elegant. The icon (a j flourish) is the weakest. |

What was recommended to the user: **E · Peek** if the logo should feel like the avatars, **F · Monogram** for a quieter mark that holds up at small sizes, or a combination: F as the favicon and app icon, plus E's peeking character as a mascot on the welcome screen, empty states and the auth hero.

## Files

```
docs/brand/jessdek-logo/
  boards/          finals.png (overview), round-1..6.png (Penpot board exports)
  concepts/<id>/   the final version of each concept, ready to ship
    wordmark.svg          for light backgrounds
    wordmark-dark.svg     for dark backgrounds (ink becomes #FAFAFA, sparkles #818CF8; faces keep dark pupils)
    icon.svg              512×512 rounded tile (rx 112), the favicon and in-app mark
    icon-maskable.svg     full-bleed square, art scaled into the 80 % safe zone (Android / PWA)
    png/icon-192.png, icon-512.png            from icon.svg
    png/icon-maskable-512.png                 from icon-maskable.svg
    png/apple-touch-icon.png                  180×180, full bleed (iOS rounds it itself)
    png/wordmark@2x.png, wordmark-dark@2x.png 1000 px wide, transparent
  rounds/round-N/  the raw SVGs of each round, as reviewed (history; A–C = rounds 1–3, D–G = rounds 4–6)
  source/          the generator (see "Changing a design")
```

All SVGs use plain absolute paths, `<ellipse>` elements and fills/strokes, with no fonts, filters or transforms (only the maskable files have one `<g transform>`). They work as `<img>`, inline SVG or JSX.

## Where the current logo lives

| What | Where | Notes |
| --- | --- | --- |
| Favicon / PWA any-size icon | `apps/web/public/icon.svg` | The indigo chat bubble with three dots |
| PNG icons | `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png` | |
| Manifest | `apps/web/public/manifest.webmanifest` | The icons list. 512 is marked `"any maskable"` (wrong for a rounded tile). `theme_color: #4f46e5` |
| HTML head | `apps/web/index.html:12-13` | `<link rel="icon" href="/icon.svg">`, `<link rel="apple-touch-icon" href="/icon-192.png">` |
| In-app logo | `apps/web/src/components/Logo.tsx` | Inline SVG, `size` prop, tile filled with `var(--brand)` |
| `Logo` call sites | `apps/web/src/App.tsx:37` (52 px), `App.tsx:58` (48), `features/AppShell.tsx:106` (52), `features/auth/AuthPage.tsx:129` (52), `features/card/CardPage.tsx:122` (30, next to the text "Realtime" at `:123`) | Keep the `size` API and these call sites won't need changes |
| README screenshots | `docs/screenshots/*.png` | Show the old mark; regenerate with `npm run screenshots` |

## Replacing the logo

Do this once the user has chosen a concept (call it `<id>`). Paths are relative to the repo root.

1. **Favicon and PWA icons**
   ```bash
   C=docs/brand/jessdek-logo/concepts/<id>
   cp $C/icon.svg                 apps/web/public/icon.svg
   cp $C/png/icon-192.png         apps/web/public/icon-192.png
   cp $C/png/icon-512.png         apps/web/public/icon-512.png
   cp $C/png/icon-maskable-512.png apps/web/public/icon-maskable-512.png
   cp $C/png/apple-touch-icon.png apps/web/public/apple-touch-icon.png
   ```
2. **Manifest**: give each icon a single purpose.
   ```json
   "icons": [
     { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
     { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
     { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
     { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" }
   ]
   ```
   `theme_color` can stay `#4f46e5` (every concept uses that indigo).
3. **`index.html`**: point `apple-touch-icon` at `/apple-touch-icon.png`.
4. **`Logo.tsx`**: replace the body with the chosen `icon.svg` as JSX.
   - Keep `viewBox="0 0 512 512"`, `width`/`height` from `size`, and `aria-hidden`.
   - Convert attributes: `stroke-width` → `strokeWidth`, `stroke-linecap` → `strokeLinecap`, `stroke-linejoin` → `strokeLinejoin`.
   - The new icons use fixed colours (lavender tile, ink lines). Check them in **both themes** (the app toggles a `dark` class on `<html>`, see `apps/web/public/theme-init.js`). The lavender tile sits fine on dark backgrounds; if it looks too bright there, swap the tile fill for `var(--muted)` in dark only.
5. **Wordmark (optional, ask the user)**: if the brand name should appear as artwork (for example the CardPage header, which today is `Logo` plus the text "Realtime", or the auth hero), add a `Wordmark` component that renders `wordmark.svg` or `wordmark-dark.svg` according to the theme. Inline both and toggle with `dark:hidden` / `hidden dark:block`; the app uses Tailwind.
6. **Verify**:
   - `npm run typecheck && npm run lint && npm test`.
   - Then look at the app in the Playwright browser: light and dark, desktop and phone width, the favicon in the tab, and every `Logo` call site above.
   - Finally `npm run screenshots` to refresh the README images.

### The name question: "jessDek" vs "Realtime"

The logo says **jessDek**, but the app is still called **Realtime** everywhere. Renaming is a separate decision; **ask the user** before doing it. If they want it, these are the touchpoints:

- `apps/web/index.html` `<title>`; `apps/web/public/manifest.webmanifest` `name` and `short_name`
- `apps/web/src/features/AppShell.tsx:353-355` (`document.title`)
- `apps/web/src/features/welcome/WelcomeDialog.tsx:84` (`"Welcome to Realtime"`) and the comment at `:26`
- `apps/web/src/features/card/CardPage.tsx:70-71, 123, 133`; `apps/web/src/features/settings/SettingsPage.tsx:604`
- `apps/server/src/app.ts:238-239` (the shared-card page title and description)
- e2e tests: `e2e/tests/auth.spec.ts:49,58` and `e2e/tests/helpers.ts:18` (dialog name `'Welcome to Realtime'`), `e2e/tests/safety.spec.ts:93` (`toHaveTitle('Realtime')`)
- `README.md`

## Changing a design

The generator in `docs/brand/jessdek-logo/source/` is plain Node (no dependencies). `resvg` must be on PATH for the PNGs.

```bash
cd docs/brand/jessdek-logo
node source/export.mjs concepts        # rebuild concepts/ (all SVGs + PNGs) from source
```

- `gen.mjs` holds the toolkit and the glyphs:
  - `G` defines the hand-built letters j, e, s, D and k: baseline 101, x-height 41–101, cap 15, ascender 9.
  - `word()` lays out a word with a per-letter tilt and bounce, a seeded wobble and `special` per-letter overrides.
  - `sparkle()`, `roundRect()`, `affine()` and `atWidth()` bake a scale into the path coordinates.
- `concepts.mjs` builds A–C, using the round-3 look when argv[2] is `out_v3`. `concepts2.mjs` builds D–G, taking the round number from argv[3] (6 is final). `export.mjs` sets both and writes `concepts/`.
- Preview: `node source/concepts2.mjs out_v6 6` writes `source/out_v6/`. Then run `python source/serve.py source` and open `http://localhost:8765/board.html?dir=out_v6&rows=D:Sticker,E:Peek,F:Monogram,G:Swash`.
- The randomness is seeded (`reseed(n)`), so output is deterministic: `export.mjs` reproduces `concepts/` byte for byte.
- `rounds/` is the record of what was reviewed. Rounds 1, 4 and 5 can't be regenerated from the current source, because later edits weren't all gated by round number.

## Penpot

The same boards live in the user's Penpot cloud file: Drafts → "New File 1", page "jessDek logo". Rounds 1–3 are in the left column, rounds 4–6 on the right. URL: `https://design.penpot.app/#/workspace?team-id=cf924903-cff3-81f4-8008-fab42219b499&file-id=cf924903-cff3-81f4-8008-fab488e2c6de`.

The Peek dark wordmark was fixed after the Penpot boards were made: its head now has a light outline so the black hair shows on dark. The Penpot round-6 board still shows the old version; **the files in `concepts/` are the source of truth.**

Working with it through the Penpot MCP:
- the plugin must be loaded and connected in an open Penpot tab;
- `createShapeFromSvg` ignores the SVG's width and height, so import the `atWidth()`-scaled SVGs;
- don't navigate the Penpot tab elsewhere, or the plugin disconnects.

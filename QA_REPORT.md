# QA_REPORT.md: UI/UX test pass (2026-11-19)

A full pass over the web app on desktop (1280 × 800) and phone (390 × 844, plus 320 px for the
narrowest phones), in light and dark, signed in and signed out. Paths are relative to the repo root.

## How it was tested

- **Automated sweep:** a Playwright script walked every screen in each of the four setups and
  collected screenshots, console errors and warnings, page errors, and any element sticking out
  past the right edge of the screen.
  - Screens: sign-in, sign-up, chat list, group chat, group info, direct chat, card window, New chat
    search, Settings top and bottom, avatar studio, all 7 card studio tabs, `/@carol`, an unknown
    `/@name`, and, signed out, a shared card (`/@bob`) and an unshared one (`/@dave`).
- **Interaction checks** (scripted, with real touch events on the phone):
  - the date label at the top of a chat, at rest and while scrolling;
  - dragging a sticker with a finger;
  - the hover toolbar and reaction bar on desktop;
  - opening a card from a sender's avatar;
  - the newly split-out screens loading.
- **Test suites:**
  - 158 web unit tests pass.
  - All 28 end-to-end tests pass. One typing-indicator test timed out once under load, then passed
    six re-runs in a row.
  - Lint, typecheck and formatting are clean.

**Result of the sweep:** no console errors or warnings and no page errors on any screen. Nothing
overflows the screen sideways anywhere.

## Bugs found and fixed

| # | Where | What was wrong | Fix |
| --- | --- | --- | --- |
| 1 | Chat, phone (and short desktop windows) | The floating date label ("Yesterday") stayed pinned over the top message and covered its text | It now shows while you scroll and fades out once you stop, like other messengers. Labels in their own place between messages always show (`MessageList.tsx` `markPinnedDays`, `index.css`) |
| 2 | Settings → Photos & videos, phone | The "Photos & videos" auto-download option wrapped onto two lines inside its segment | Options are now "Everything · Photos only · Off" (`SettingsPage.tsx`) |
| 3 | `/@name` for someone who doesn't exist, signed in | It said "This card isn't shared", which is wrong when there's no such person | Signed in, it reads "No card to show" and says the person isn't on Realtime or their card isn't available to you (`CardPage.tsx`). Signed out it still says "This card isn't shared", on purpose, so the page doesn't reveal who exists |
| 4 | Card studio, desktop | The "Unsaved changes · Discard" / "Every card is the same size" line sat at the bottom of the preview column, far from the card | It now sits right under the card, and the card is sized to leave room for it (`CardStudio.tsx` `FitCard below`) |
| 5 | Card studio, pattern/border/finish tiles (earlier today) | The mini cards sat left of centre in their tiles | Centred at every width (measured: 0 px off on desktop, 600 px and phone) |
| 6 | Cards on phones (earlier today) | Cards sat tilted and soft at rest, and a finger on one tilted it instead of scrolling | Tilt follows a mouse only |
| 7 | Card studio, phone (earlier today) | Small preview, keyboard covered the text box, tab labels cut mid-word, small sticker handles, cramped header at 320 px | Bigger preview that shrinks while typing; tab strips fade at the edges; 34 px handles on touch; tighter header |

## Optimization

- **Main bundle down from 571 kB to 455 kB (183 → 149 kB gzipped).** These now load on demand and
  are prefetched when the browser is idle after sign-in, so opening one is still instant
  (`apps/web/src/features/card/lazy.tsx`):
  - the card studio, the avatar studio and Settings;
  - the `/@name` pages (`CardPages.tsx`);
  - the card window and the card art.
- Checking a card no longer pulls in every sticker drawing. The sticker ids live in
  `stickerIds.ts`, and a test keeps them in step with the drawings.
- Signed-out visitors opening a shared card download the card page on its own, not the whole
  signed-in app.

## Checked and fine

- Sign-in, sign-up, chat list, chats, group info, New chat, the card window, Settings, both studios
  and shared-card pages, in all four setups.
- Long names and long text truncate or wrap cleanly. Dark mode surfaces and contrast are consistent.
- Touch: dragging a sticker moves it without scrolling the page.
- Desktop: hover toolbar and reaction bar.
- The phone layout is one pane at a time with back navigation (end-to-end tested).

## Not covered

- Real phones (iOS Safari, Android Chrome), since all touch testing was emulated. The keyboard
  behaviour in the studio in particular should be tried on a real device.
- Photo and video transfer between two real devices (covered by the end-to-end tests on one
  machine).

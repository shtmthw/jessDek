<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/jessdek-logo/concepts/f-monogram/wordmark-dark.svg">
  <img src="docs/brand/jessdek-logo/concepts/f-monogram/wordmark.svg" alt="jessDek" width="300">
</picture>

**A small, fast chat app. Direct messages and group chats, delivered instantly, with character avatars, shareable cards and a deck for meeting people who like what you like.**

[![CI](https://github.com/shtmthw/jessDek/actions/workflows/ci.yml/badge.svg)](https://github.com/shtmthw/jessDek/actions/workflows/ci.yml)
[![Docker Hub](https://img.shields.io/docker/pulls/matthew552/jessdek?label=docker%20hub)](https://hub.docker.com/r/matthew552/jessdek)

<img src="docs/screenshots/desktop-chat-light.png" alt="jessDek on desktop" width="760">

</div>

## Quick start

All you need is Docker. Download the compose file, pull the image and start it:

```bash
curl -O https://raw.githubusercontent.com/shtmthw/jessDek/master/docker-compose.yml
docker compose pull
docker compose up -d
```

Open **http://localhost:8080** and create an account. To try a conversation, open a second browser (or a private window), create another account and message the first one.

The defaults are fine for a quick trial. For anything longer-lived, set your own secrets:

```bash
curl -O https://raw.githubusercontent.com/shtmthw/jessDek/master/.env.example
cp .env.example .env     # then set JWT_SECRET and POSTGRES_PASSWORD
docker compose up -d
```

To stop, run `docker compose down`. Your data is kept in the `realtime_db` volume; add `-v` to delete it. (The volume keeps the name it had before the app was called jessDek, so existing installs carry their data over.)

## Features

- **Instant delivery.** Messages, typing indicators, unread counts and online status arrive live over WebSockets, with no polling.
- **Direct messages and group chats.** Find people by username with live search. A new chat starts as a [message request](#message-requests-and-group-invites) the other person accepts, and groups invite people instead of adding them. Rename or leave groups at any time.
- **Photos and videos, device to device.** Sent straight between browsers over WebRTC and never stored on the server. They can be downloaded while someone who has them is online. Up to 10 per message, with a caption. In **Settings → Photos & videos** you choose what downloads by itself (everything, photos only, or nothing), see how much is kept on the device, and can turn on **Hide my IP address** to send media through the server instead.
- **Replies and reactions.** Reply to any message and it arrives with a quote of the original; tap the quote to jump back to it. React with one emoji per person: six quick ones, or any emoji from a searchable picker. On phones, long-press a message for reactions and swipe it right to reply; on desktop, hover it or right-click. Reactions are quiet: no sound, and they never count as unread.
- **Discover people.** A deck of cards from people who share at least one of your interests. Swipe through it, open someone's card and say hi with a suggested opener. See [Discover](#discover-the-card-deck).
- **You decide who reaches you.** Someone new can send you one text message, which you accept or decline, and a group can only invite you. Block someone and they can't message you, start a chat with you or add you to groups, and neither of you sees the other's online status. Mute any chat, remove a direct chat from your list, and (as a group's owner) remove members.
- **Pleasant to use.** Messages appear immediately and retry if sending fails. Unread badges (and a count in the tab title), a "new messages" pill, infinite scroll through history, day separators and a reconnecting banner. A soft chime plays when something happens in a chat you're not looking at, with a gentler one for groups; preview the sounds or turn them off in **Settings → Sounds**. New accounts get a one-time welcome that points them to their avatar and card.
- **Keyboard friendly.** `Ctrl/⌘ + K` starts a new chat, `/` searches your chats, `Alt + ↑/↓` switches between them and `Esc` closes one. Start typing anywhere in a chat and it lands in the message box. In the message list, the arrow keys walk the messages, `Enter` opens one's actions and `R` replies to it.
- **Mobile-first.** A single pane on phones (swipe in from the left edge to go back) and two panes on desktop. Respects safe areas, uses 44 px tap targets, and can be installed as a PWA. It follows your device's light or dark setting, or you can pick one in **Settings → Appearance**.
- **Smooth.** Soft spring animations that run on the compositor wherever they can, so dialogs, menus and the Discover deck stay fluid on modest hardware. If your device asks for reduced motion, jessDek uses less of it.
- **Secure by default.** argon2id password hashing, httpOnly session cookies, rate limiting, input validation, and membership checks on every operation.
- **One image.** The API and the web app ship together as `matthew552/jessdek`. The only other container is PostgreSQL.

## Avatars

Everyone has a cartoon character as their avatar, drawn head and shoulders on their own background colour. It starts as the same default character for everybody, and you dress it up in **Settings → Edit avatar**:

- **Face:** 10 skin tones, 6 face shapes, 16 eyes in 7 colours, brows, noses, 14 mouths, blush and freckles, and cheek stickers.
- **Hair:** 36 styles in 16 colours (long styles tuck behind the ears and fall over the shoulders), and hair clips.
- **Wardrobe:** 26 hats and headwear, 21 tops, 13 neck accessories, glasses, 8 earrings, and 19 colours for hats, tops, neck items, clips and earrings.
- **A little pet** on your shoulder: a cat, puppy, chick, bunny, frog, ghost, hamster or bear.

**Specials** are nine ready-made characters in a finer, softer style: thin lines, doe eyes and tiny mouths, with beanies, headphones, bead necklaces, a checkered sweater and more. Pick one in the studio's Specials tab, then change anything in the other tabs as usual. The **Fine** line weight works on any look.

The studio has undo (`Ctrl/⌘ + Z`) and a randomize button. Unsaved changes wait on your device until you come back. If you'd rather not have a character, you can show your initials instead.

Avatars are drawn in the browser as SVG. The server stores only a small "recipe" naming the chosen items (at most 1 KiB of JSON), so there are no image uploads. A change shows up straight away for everyone who shares a chat with you.

<div align="center">

<img src="docs/screenshots/avatar-studio-light.png" alt="The avatar studio on a desktop: a live preview beside a grid of hats" width="620">
<img src="docs/screenshots/avatar-studio-phone-dark.png" alt="The avatar studio on a phone, dark theme" width="190">
<img src="docs/screenshots/avatar-specials-light.png" alt="The avatar studio's Specials tab: nine ready-made characters with fine lines" width="620">

</div>

## Cards

Everyone has a **card**: a portrait card with their `@username`, their avatar, up to six interests and a short "about me", plus a **Message** button. Tap someone in a chat header, a group's member list, a group message or New chat search to see theirs. Design your own in **Settings → Your card**:

- **Words:** an about of up to 150 characters, and interests picked from about 100 built-in ones, or your own with an emoji.
- **Look:** solid and gradient backgrounds, patterns, borders and corners, finishes (gloss, holographic, glitter, paper), four layouts, seven fonts, dividers, interest and button styles, and a frame and ring for your avatar.
- **Stickers:** up to eight, drawn in the avatar style or any emoji. Drag them anywhere, resize and turn them, or pinch on a phone.

Every card is the same size, so long text shrinks to fit. Each card has a link, `/@username`. People on jessDek can always open it; turn on **Share my card** and anyone can, even without an account. Their Message button asks them to sign in or sign up, then opens the chat with you. Like avatars, cards are drawn in the browser from a small recipe (at most 4 KiB of JSON).

<div align="center">

<img src="docs/screenshots/card-studio-light.png" alt="The card studio on a desktop: a live card preview beside sticker options" width="620">
<img src="docs/screenshots/card-studio-phone-dark.png" alt="The card studio on a phone, dark theme" width="190">
<img src="docs/screenshots/card-public-light.png" alt="Bob's shared card, opened by someone who isn't signed in" width="620">

</div>

## Chat themes

Every chat, direct or group, can have a **theme**: a wallpaper of soft colour with fine-line doodles in the avatar style, an accent for your bubbles, the send button and links, and a bubble style. Open a chat's menu and pick **Theme**. The chat behind the sheet shows each choice live, and closing without saving keeps the old theme.

- **Shared.** Everyone in the chat sees the same theme, and anyone in it can change it. The chat then shows a quiet line such as "Alice changed the theme to Matcha · Change", and the chat list mentions it too. Like reactions, a theme change makes no sound and doesn't count as unread.
- **17 presets:** Classic (the default look), Doodles, Blush, Matcha, Lemonade, Ocean, Lavender, Peach, Candy, Snacks, Space, Pets, Sunset, Notebook, Arcade, Soda and Mixtape.
- **Custom:** choose from 14 accents and 19 wallpapers (solids and gradients). Add one of 16 doodle patterns, from simple hearts, stars and waves to line-art scatters of snacks, pets, space and music. Then pick a bubble style: **solid**, **soft** (a light wash of the accent) or **outline** (a thin ink outline, like a sticker).
- **Light and dark.** Every theme has a hand-tuned dark version and follows the app's light or dark setting. A contrast test checks the text in every preset and custom combination, in both modes.
- **Member colours in groups.** Each member gets their own colour for their name, a tint on their bubbles, and the bar of a quote of their messages. Colours are assigned from a palette of 10 in join order, and anyone can pick their own for that group in **Group info → Your colour**.

Like avatars and cards, a theme is a small recipe (at most 512 bytes of JSON) stored on the chat and drawn by the browser. Chats nobody has themed keep the Classic look.

<div align="center">

<img src="docs/screenshots/theme-sheet-light.png" alt="The theme sheet over a direct chat, showing the preset tiles" width="620">
<img src="docs/screenshots/group-theme-dark.png" alt="A group chat with the Matcha theme and member colours, dark theme" width="620">

</div>

## Message requests and group invites

Nobody lands in your chats uninvited. A chat with someone new starts as a **request**, and a group only gets people who say yes.

- **A new direct chat is a request.** Whoever starts it can send **one message, text only**: no photos, videos, replies or reactions. Then their composer is replaced by "Request sent · Erin can accept or decline". Chats you already had are unchanged, and once it is accepted a chat is an ordinary one.
- **You see it under Requests.** A **Requests** row above your chats counts what is waiting (message requests and group invites together) and opens a list. Opening a request shows the message with **Accept**, **Decline** and **Block** where the composer would be. Looking at it tells the sender nothing.
- **The sender finds out.** Accepting turns the request into an ordinary chat for both people, and the sender gets a toast ("Erin accepted your message request") while their composer switches over live. After a decline their chat says so and they can't send another. **A decline is final**: it only opens up again if the person who declined starts a chat themselves. Blocking from a request declines it, and the sender sees the same thing as for any decline.
- **Groups invite instead of adding.** Creating a group, or inviting people later, sends invites. An invite shows the group's name, who invited you and who is in it, but none of its messages, with **Join group** and **Decline**. The inviter gets a toast with the answer, and **Group info** lists who is still invited and who declined. The person who sent an invite, or the group's owner, can take it back while it is pending. A declined invite is final for that group.
- **Quiet and private.** Requests and invites make no sound and don't count in the tab title. Until a request is accepted, the two people see nothing of each other: no online status, typing or profile changes. Someone can reach out to at most 20 new people an hour, counting requests and invites together.

## Discover: the card deck

The **compass** next to New chat opens **Discover**: a deck of cards from everyone who shares **at least one interest** with you (built-in interests by id, your own words without regard to case). People you blocked, or who blocked you, never appear.

- **The deck's front page** shows a stack. The card on top is where the deck starts, picked at random each time a deck is dealt. Tap it, or **Open the deck**.
- **The deck** is a fan of five cards, the middle one largest. Swipe or drag it, use **← →**, the arrow buttons, or tap a side card to bring it to the middle. It's a circle in a fixed order, so going round brings you back. Decks of fewer than five cards don't loop: they stop at the ends. **Shuffle** deals again from someone else.
- **Tap the middle card** to open it, with a box to say hi. Above the box are **suggested openers** written from the interests you share. Pick one (it fills the box, and you can change it) and send it. It goes out as an ordinary [message request](#message-requests-and-group-invites). If you already have a chat or a request with that person, the box says so instead.
- **Back to deck** returns to the same card without loading anything again.
- **Full quality or Light.** Every card is drawn in full by default: stickers, patterns, finishes and shadows. **Light** draws simpler cards (the same colours, avatar and text) with snappier motion, which is much easier on older phones and laptops. Switch it with the feather button in the deck's header or in **Settings → Discover**. It's kept per device, and a card you open is always shown in full. See [DECK_QUALITY_PLAN.md](DECK_QUALITY_PLAN.md).

Cards load lazily from both ends of the deck: five each side to start, then five more whenever a side runs low, with at most ten kept each side. Decks of up to 21 people arrive in one go. Someone who blocks you while their card is already loaded drops out of the deck when you open it. To fill the decks locally, seed a crowd with `SEED_CROWD=80 npm run db:seed -w apps/server` (it also works on an already-seeded database). That's 80 people whose cards and avatars are drawn from every style option, each sharing interests with two of the demo users. Alice also gets a few interests, so every demo user has a full deck of 30 or more. The rules are in [CARD_LOADING.md](CARD_LOADING.md).

## Screenshots

<div align="center">

<img src="docs/screenshots/mobile-list-light.png" alt="Chat list on a phone" width="190">
<img src="docs/screenshots/mobile-chat-light.png" alt="Conversation on a phone" width="190">
<img src="docs/screenshots/mobile-chat-dark.png" alt="Conversation on a phone, dark theme" width="190">
<img src="docs/screenshots/mobile-list-dark.png" alt="Chat list on a phone, dark theme" width="190">

</div>

| Light                                                          | Dark                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ![Group chat](docs/screenshots/desktop-group-light.png)        | ![Group chat, dark theme](docs/screenshots/desktop-group-dark.png)        |
| ![Photos and videos](docs/screenshots/desktop-media-light.png) | ![Photos and videos, dark theme](docs/screenshots/desktop-media-dark.png) |
| ![Sign up](docs/screenshots/auth-light.png)                    | ![Direct message, dark theme](docs/screenshots/desktop-chat-dark.png)     |

## Configuration

Set these in `.env` next to `docker-compose.yml`.

| Variable             | Default     | Description                                                                                                                                                    |
| -------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_PORT`           | `8080`      | Port the app is published on                                                                                                                                   |
| `JWT_SECRET`         | _(random)_  | Signs session cookies. If unset, a random secret is generated at startup, so everyone is signed out whenever the container restarts                            |
| `POSTGRES_PASSWORD`  | `realtime`  | Database password                                                                                                                                              |
| `COOKIE_SECURE`      | `false`     | Set to `true` when serving over HTTPS so cookies are marked `Secure`                                                                                           |
| `MEDIA_ENABLED`      | `true`      | Turns photos and videos on or off                                                                                                                              |
| `MEDIA_RELAY`        | `true`      | Lets the server pass media between two devices (in memory, nothing kept) when they can't connect directly                                                      |
| `MEDIA_MAX_IMAGE_MB` | `20`        | Largest photo, after the browser has resized it                                                                                                                |
| `MEDIA_MAX_VIDEO_MB` | `100`       | Largest video                                                                                                                                                  |
| `ICE_SERVERS`        | public STUN | JSON list of STUN/TURN servers for direct connections, e.g. `[{"urls":"turn:turn.example.com","username":"u","credential":"p"}]`. `[]` means same-network only |

### Behind a reverse proxy

If you put jessDek behind Caddy, nginx or Traefik, the proxy must forward WebSocket upgrades on `/graphql` **and `/media-relay`**, and preserve the `Host` header. Serve it over HTTPS and set `COOKIE_SECURE=true`. HTTPS also makes the relay's frames end-to-end encrypted between the two browsers.

## Updating

```bash
docker compose pull
docker compose up -d
```

Your data lives in the `realtime_db` volume and is kept across updates.

### Moving from `matthew552/realtime`

jessDek used to be called Realtime, and its image was `matthew552/realtime`. That image no longer gets updates. To switch, download the new `docker-compose.yml` (it only changes the image name) and run the two commands above. Your accounts, chats and settings stay, because the database and its volume are unchanged.

## Upgrading from v1

v2 is a full rewrite (TypeScript, PostgreSQL, GraphQL subscriptions). The data model changed, so v1 MySQL data is **not** migrated. See [REFRACTOR.md](REFRACTOR.md) for the plan and the reasoning behind it.

## How it works

```mermaid
flowchart LR
  B[Browser<br/>React SPA] -- "HTTP: queries and mutations" --> S
  B <-- "WebSocket: subscriptions<br/>(same /graphql path)" --> S
  subgraph App container
    S[Fastify + GraphQL Yoga + graphql-ws]
  end
  S --> P[(PostgreSQL)]
  B <-. "photos and videos: WebRTC, or the in-memory relay" .-> B2[Another browser]
```

- **One conversation model.** Direct messages and groups are both conversations with members. Each direct-message pair has a unique key, so two people can never end up with two separate chats. A message request is a direct chat with a state (pending or declined), and the single message is enforced with an atomic claim, so two sends at once can't both get through. Group invites live in their own table, so someone who hasn't joined is never a member and can't see or hear anything from the group.
- **One event stream per user.** New messages, conversation changes, typing and presence all arrive on a single subscription. Events are published only to current members, so nobody can listen in on a chat they are not part of.
- **Sessions** are a signed JWT in an `httpOnly`, `SameSite=Lax` cookie. The WebSocket handshake authenticates with the same cookie and rejects cross-origin connections.
- **Photos and videos never touch the server's disk or database.** The database keeps a small metadata row per file (type, size, dimensions, a hash and a tiny blur placeholder), and a test guards against any column that could hold bytes. The files themselves stay in each person's browser storage.
- **Direct first.** The two browsers connect over WebRTC data channels; the server only passes the short handshake messages. If that fails (a strict firewall, or someone chose "Hide my IP address"), the server pipes the bytes between the two sockets in memory instead. On HTTPS those frames are encrypted by the browsers, so the server sees only ciphertext.
- **Pulled from whoever has it.** A device asks which online members of the chat have a file, and the first to answer sends it, so group media stays available after the sender goes offline. With nothing stored on the server, a photo can only be downloaded while someone who has it is online. The app says so ("Waiting for Alice to come online") and fills in by itself when they return. Photos are re-encoded before sending, which removes location data; videos are sent as they are.
- **Drawn, not uploaded.** Avatars, cards and chat themes are small JSON recipes (at most 1 KiB, 4 KiB and 512 bytes). The server checks each one against a schema before storing it, and the browser draws it as SVG, so there are no image uploads and a change reaches everyone straight away.
- **The deck is a circle, not a shuffle.** The match filter (someone else who shares an interest, with no block either way) is written once and used by every deck query. Only the starting card is random. From there the deck walks the matches in id order, a page at a time in each direction, and wraps at the end, so nothing is ordered at random and going round brings you back to the start. The full rules are in [CARD_LOADING.md](CARD_LOADING.md).
- **Presence** is tracked in memory by counting each user's open sockets. This works for a single instance; running several instances behind a load balancer is not supported.

| Layer  | Stack                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server | Node 24, TypeScript, Fastify 5, GraphQL Yoga, graphql-ws, Prisma 6, PostgreSQL 17, zod, jose, argon2                                                                                    |
| Web    | React 19, Vite 7, TypeScript, Tailwind CSS 4, Apollo Client, React Router 7, Motion, Radix (Dialog, Dropdown Menu), Sonner toasts, lucide icons, IndexedDB (via idb) for media, Figtree |

<details>
<summary><strong>Running from source</strong></summary>

<br>

Requirements: Node 22+ and a PostgreSQL database.

```bash
git clone https://github.com/shtmthw/jessDek.git
cd jessDek
npm install

# a throwaway database
docker run -d --name jessdek-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=jessdek -p 5432:5432 postgres:17-alpine

cp .env.example .env     # set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jessdek
npm run db:migrate -w apps/server
npm run db:seed -w apps/server    # optional demo users: alice, bob, carol, dave, erin (password: SEED_PASSWORD, or a random one it prints)
                                  # SEED_CROWD=80 adds 80 people with all sorts of cards, for the Discover deck
npm run dev
```

The web app runs on http://localhost:5173. Vite proxies `/graphql`, including WebSockets, to the API on port 4000.

| Command               | What it does                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| `npm run dev`         | API in watch mode plus the web dev server                               |
| `npm run build`       | Compile the API and bundle the web app                                  |
| `npm run lint`        | ESLint                                                                  |
| `npm run format`      | Prettier, over the whole repo                                           |
| `npm run typecheck`   | TypeScript checks for both apps                                         |
| `npm test`            | Server integration tests (needs `DATABASE_URL_TEST`) and web unit tests |
| `npm run e2e`         | Playwright tests in a real browser against the production-mode server   |
| `npm run screenshots` | Regenerate `docs/screenshots` from seeded demo data                     |

Tests use their own databases and never touch your development data: `DATABASE_URL_TEST` for the server tests and `DATABASE_URL_E2E` for Playwright. Both default to `localhost:55432` (see `apps/server/vitest.config.ts` and `e2e/server.ts`).

To build the image locally instead of pulling it: `docker build -t jessdek .`

```
apps/server       Fastify + GraphQL API, Prisma schema and migrations, tests
apps/web          React app
e2e               Playwright tests and the screenshot generator
Dockerfile        Builds the single runtime image
docs/brand        The jessDek logo: final SVG and PNG exports, and the generator that draws them
docs/screenshots  The pictures in this README, made by npm run screenshots
```

Each feature was planned in a document at the repo root, and those documents explain the reasoning behind the code:

| Document                                                                   | About                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [REFRACTOR.md](REFRACTOR.md)                                               | The v2 rewrite: TypeScript, PostgreSQL, GraphQL subscriptions   |
| [MEDIA_PLAN.md](MEDIA_PLAN.md), [DIRCOM.md](DIRCOM.md)                     | Photos and videos, device to device, and how the transfer works |
| [AVATAR_PLAN.md](AVATAR_PLAN.md)                                           | Character avatars                                               |
| [CARDS_PLAN.md](CARDS_PLAN.md)                                             | User cards                                                      |
| [REPLIES_PLAN.md](REPLIES_PLAN.md)                                         | Replies and reactions                                           |
| [THEMES_PLAN.md](THEMES_PLAN.md)                                           | Chat themes and member colours                                  |
| [REQUESTS_PLAN.md](REQUESTS_PLAN.md)                                       | Message requests and group invites                              |
| [CARD_DECK_PLAN.md](CARD_DECK_PLAN.md), [CARD_LOADING.md](CARD_LOADING.md) | Discover: the deck, and how its cards load                      |
| [DECK_QUALITY_PLAN.md](DECK_QUALITY_PLAN.md)                               | The deck's Full and Light quality                               |
| [LOGO_PLAN.md](LOGO_PLAN.md)                                               | The jessDek logo                                                |
| [QA_REPORT.md](QA_REPORT.md)                                               | A UI and UX test pass over every screen (November 2026)         |

</details>

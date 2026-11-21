# REPLIES_PLAN.md: replies and reactions

> **Status: implemented.** The sections above §7 are the plan; Deviations lists where the build differs. Paths are relative to the repo root. "Deviations" at the end lists where the
> build differs from this plan.

## 0. In one minute

- **Reply** to any sent message, in DMs and groups. The reply is an ordinary new message at the bottom
  of the chat, with a small quote of the original on top: the original sender's name in their colour
  and a one-to-two-line excerpt (or a thumbnail and "Photo"/"Video"). Tapping the quote scrolls to the
  original, loading older history if needed, and briefly highlights it.
- **React** to any sent message with one emoji per person. The quick bar offers ❤️ 😂 😮 😢 🙏 👍 and a
  "+" that opens a searchable picker of every emoji, bundled with the app and loaded on first use. Picking
  your current emoji again removes it; picking another replaces it.
- Reactions sit as small chips on the bubble's bottom edge. Tapping a chip shows who reacted with what,
  and lets you take yours back.
- **Quiet notifications:** a reaction never plays a sound, never counts as unread and never reorders the
  chat list. When someone reacts to your message (or you react), the chat list line reads
  "Bob reacted ❤️ to “see you at 7”" until the next message arrives.
- **Gestures follow the app's motion language** (`apps/web/src/lib/motion.ts`):
  - Desktop: a hover toolbar next to each bubble (React, Reply), plus the right-click menu.
  - Phones: swipe a bubble sideways to reply, and long-press for the reaction bar and actions.
  - Keyboard: ↑/↓ moves between messages, Enter opens the actions, R replies, Esc cancels a reply.

## 1. Decisions (asked 2026-11-19)

| Question | Answer |
| --- | --- |
| What a reply quotes | The whole message (not a highlighted part) |
| Reactions per person | One; a new emoji replaces it, the same emoji removes it |
| Emoji choice | 6 quick reactions + a full searchable picker, bundled, loaded on demand |
| Notifications | Quiet: no sound, no unread, no reorder; chat-list line for reactions by you or on your message |

## 2. Data model (`apps/server/prisma/schema.prisma`)

```prisma
model Message {
  // …existing fields…
  replyToId String?
  replyTo   Message?   @relation("Replies", fields: [replyToId], references: [id], onDelete: SetNull)
  replies   Message[]  @relation("Replies")
  reactions Reaction[]

  @@index([replyToId])
}

/// One reaction per person per message.
model Reaction {
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())
  /// When the person last set it: changing the emoji counts as reacting again.
  updatedAt DateTime @updatedAt

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([messageId, userId])
  @@index([userId])
  @@index([updatedAt])
}
```

`User` gains `reactions Reaction[]`. Migration name: `replies_reactions`. Messages can't be deleted
today, so `SetNull` only matters if that ever changes (the reply then shows "Original message
unavailable").

## 3. GraphQL contract (`apps/server/src/schema.ts`)

```graphql
type Message {
  # …existing fields…
  "The message this one replies to. Null when it isn't a reply."
  replyTo: Message
  "Who reacted with what, one per person, in the order they first reacted."
  reactions: [Reaction!]!
}

type Reaction {
  emoji: String!
  user: User!
  "When this person last set their reaction (ISO 8601)."
  reactedAt: String!
}

"The reaction the chat list mentions: the newest one you made or one on your message, if newer than the last message."
type ReactionPreview {
  emoji: String!
  user: User!
  message: Message!
  reactedAt: String!
}

type Conversation {
  # …existing fields…
  lastReaction: ReactionPreview
}

type Mutation {
  sendMessage(conversationId: ID!, body: String!, attachments: [AttachmentInput!], replyToId: ID): Message!
  "Sets your reaction to a message (one per person; another emoji replaces it). Null removes it."
  react(messageId: ID!, emoji: String): Message!
}

"Someone's reaction to a message in this chat was added, changed or removed."
type ReactionChanged {
  conversationId: ID!
  message: Message!
}
# ChatEvent gains ReactionChanged.
```

## 4. Server rules

- `messageInclude` (`apps/server/src/types.ts`) also loads
  `replyTo: { include: { sender: true, attachments: { orderBy: { position: 'asc' } } } }` and
  `reactions: { include: { user: true }, orderBy: { createdAt: 'asc' } }`. Field resolvers default
  `reactions` to `[]` and `replyTo` to `null` when not loaded (a nested `replyTo` isn't).
- **`sendMessage` with `replyToId`:** the target must be a message in the same conversation, otherwise
  `BAD_USER_INPUT` "You can only reply to a message in this chat". Everything else about sending is
  unchanged (a reply is a normal message: unread, sound, chat-list order).
- **`react`:**
  - Load the message; the caller must be a member of its conversation (`requireMember`), and in a direct
    chat neither person may have blocked the other (`FORBIDDEN`, same message as sending).
  - `emoji` must be one RGI emoji and at most 64 UTF-16 units. Anything else is `BAD_USER_INPUT`
    "Pick an emoji". Build the check as `new RegExp('^\\p{RGI_Emoji}$', 'v')`: the TS target (ES2023)
    rejects a `/…/v` literal, but Node 22+ supports it at runtime. Checked on Node 26: `❤️ 👍🏽 👨‍👩‍👧 🇮🇳 1️⃣`
    pass; `a`, `❤️❤️`, `""` and the bare text heart `❤` (no U+FE0F) fail, so the client must send
    fully-qualified emojis.
  - `null` deletes your row (if any); otherwise upsert on `(messageId, userId)`. Setting the emoji you
    already have changes nothing and publishes nothing.
  - `reactLimiter = new RateLimiter(40, 10_000)` per user, cleared in the test helpers like the others.
  - Return the message with `messageInclude`.
- **Events after a real change:**
  - `ReactionChanged { conversationId, message }` to every member.
  - `ConversationUpdated` to the reactor and the message's sender (deduplicated), so their chat-list
    line updates.
  - Reactions never touch `lastMessageAt`, `lastReadAt`, `hiddenAt` or unread counts.
- **`Conversation.lastReaction`** (resolved per viewer): the newest reaction in the conversation with
  `updatedAt > conversation.lastMessageAt` where the reactor is the viewer **or** the message's sender
  is the viewer; else null. One indexed query per conversation is fine at this scale.

## 5. Client data layer (`apps/web`)

- `src/lib/gql.ts`:
  - `MessageFields` adds
    `replyTo { id body createdAt sender { id displayName avatarColor } attachments { ...AttachmentFields } }`
    and `reactions { emoji reactedAt user { id displayName } }`.
  - `ConversationFields` adds
    `lastReaction { emoji reactedAt user { id displayName } message { id body sender { id } attachments { id kind } } }`.
  - `SEND_MESSAGE` takes `$replyToId: ID`.
  - A `REACT` mutation returns `{ id reactions { … } }`.
  - The events subscription adds `... on ReactionChanged { conversationId message { id reactions { … } } }`;
    Apollo's normalization does the rest.
  - TS types: `Reaction`, `ReplyTo`, `ReactionPreview`; `Message.replyTo: ReplyTo | null`,
    `Message.reactions: Reaction[]`, `Conversation.lastReaction: ReactionPreview | null`;
    the `ReactionChanged` event in `ChatEvent`.
- `src/lib/messages.ts`: `ChatMessage` gains `replyTo?: ReplyTo | null` and `reactions?: Reaction[]`.
- `src/features/chat/ChatView.tsx`: `send(body, items, replyTo?)`. The pending message carries `replyTo`
  so its bubble shows the quote straight away; `dispatch` passes `replyToId`, and echo pairing also
  requires the same `replyTo` id.
- `src/features/conversations/ConversationList.tsx` `preview()`: when `lastReaction` exists, show
  `You reacted ❤️ to “excerpt”` / `Bob reacted ❤️ to “excerpt”`, where the excerpt is the whitespace-collapsed
  body, cut to about 40 characters with "…", or "a photo" / "a video" / "a message" when there's no text.

## 6. UI (`apps/web/src/features/chat/`)

1. **Message actions.**
   - Desktop: a hover/focus toolbar beside the bubble (React, Reply, More → Copy text), and a right-click
     menu with the same actions plus the quick reaction bar.
   - Phones: long-press (~350 ms) lifts the bubble over a soft scrim, with the reaction bar above and an
     action list below (Reply, Copy text).
   - Pending and failed messages have no actions.
2. **Swipe to reply** (touch): drag a bubble sideways and a reply arrow fades in. Past the threshold it
   ticks (`navigator.vibrate(8)` where available) and letting go starts a reply. Vertical scrolling
   wins (`touch-action: pan-y` plus intent detection), and the pane's edge swipe-back keeps priority.
3. **Reaction bar and picker.** The bar holds the 6 quick reactions and "+". The picker is its own lazily
   loaded chunk (emoji data bundled from an npm package), with search, categories and recently used.
   It's a popover on desktop and a bottom sheet on phones.
4. **Reaction chips** on the bubble's bottom edge, on the sender's side: up to 3 distinct emojis and a
   count. Your own reaction is tinted. They pop in and out with `spring.pop`. Tapping one opens "Reactions"
   (tabs per emoji, rows of avatar and name, and yours with "Tap to remove").
5. **Reactions are optimistic:** they show at once and roll back with a toast if the server refuses.
6. **Composer reply bar:** "Replying to Bob" with the excerpt or thumbnail and ✕, above the text field
   inside the composer card. It animates with `AutoHeight` and focuses the composer. Esc cancels it. It's
   kept per chat for the session.
7. **Quote in the reply bubble:** an inset card at the top of the bubble with an accent bar in the quoted
   sender's colour, their name ("You" for yours), a 2-line clamp, and a small thumbnail for media.
   Tapping it jumps to the original: it loads older pages until found (capped, with a toast otherwise),
   scrolls it to the middle and flashes a highlight.
8. **Keyboard:** the message log is one tab stop with a roving focus. ↑/↓ moves between messages,
   Enter or the context-menu key opens the actions, R replies, Esc closes or cancels.

## 7. Phases

| # | Phase | Who | Done when |
| --- | --- | --- | --- |
| 1 | Server (§2–4) and client data layer (§5), with tests | Sonnet | **Done.** `npm test` (67 server, 134 web), typecheck and lint pass |
| 2 | UI and interactions (§6) | Opus | **Done.** Checked in the browser on desktop (mouse, keyboard) and a touch phone (long-press, swipe), light and dark, DM and group; 141 web tests and the existing 23 e2e tests pass |
| 3 | e2e, README section, screenshots, wrap-up | Sonnet | **Done.** `npm run e2e`: 26 passed (3 new in `replies.spec.ts`) |

### Phase 1 checklist

1. Schema and migration as in §2.
2. `schema.ts` as in §3; resolvers for `react`, `Message.replyTo`, `Message.reactions` (with
   `Reaction.reactedAt` from `updatedAt`), `Conversation.lastReaction`, `ReactionChanged`
   (`ChatEvent.__resolveType` already uses `__typename`); `sendMessage` passes `replyToId` through.
3. `src/types.ts`: `messageInclude` additions and a `ReactionChanged` server event.
4. Service code in `src/services/messages.ts` (or a new `reactions.ts`), following §4 exactly.
5. Tests in `test/api.test.ts`:
   - reply happy path, and a reply to a message from another chat (rejected)
   - react, change, same-emoji no-op, remove with null
   - bad emoji (`"a"`, `"❤️❤️"`, `""`, 65+ chars)
   - non-member, and a blocked DM (rejected)
   - rate limit
   - `lastReaction` is visible to the reactor and the author but not a third member, and gone after a newer message
   - reactions don't change `unreadCount` or the list order
6. Tests in `test/realtime.test.ts`: `ReactionChanged` reaches every member, not a stranger;
   `ConversationUpdated` reaches the reactor and the author.
7. Client data layer as in §5, with unit tests for the chat-list wording.
8. Seed (`apps/server/prisma/seed.ts`): a few reactions and one reply in the demo chats.
9. `npm run typecheck`, `npm run lint`, `npm test` pass. Mark phase 1 done in §7.

### Phase 3 checklist

1. `e2e/tests/replies.spec.ts`:
   - DM: alice replies to bob's message via the hover toolbar; bob sees the quote live; tapping it jumps to the original.
   - Group: carol reacts ❤️; alice and bob see the chip live; carol changes it to 😂, then removes it.
   - Phone viewport: long-press opens the reaction bar.
2. README: a "Replies and reactions" bullet under Features.
3. Regenerate screenshots (`npm run screenshots`) so they show a reply and reactions.
4. Mark this plan implemented and update Deviations.

## Deviations

- **Phase 1**:
  - **Migration:** `20261119073141_replies_reactions`. The `react` service lives in `apps/server/src/services/reactions.ts`, with `reactLimiter` cleared in the test helpers.
  - **Hidden chats:** reacting to a message in a chat you're not in answers `NOT_FOUND` "Message not found", so the chat's existence isn't revealed. That's the same code `requireMember` gives, with message-specific wording.
  - **Cache:** a shared `ReactionFields` fragment, and an Apollo type policy `Message.reactions: { merge: false }`, so a message's reactions are always replaced whole and Apollo doesn't warn about lost data. The client's `ReactionChanged` case is a deliberate no-op: normalization already merged it.
  - **Chat-list wording:** it lives in `apps/web/src/lib/reactionText.ts` (`reactionPreviewText`), with unit tests. It also hides a cached reaction once a newer message has arrived, and cuts long excerpts at a word boundary (“…that goes…”, not “…goes o…”).
  - **Sending a reply:** `ChatView`'s `send(body, items, replyTo)` takes the quoted message (`ReplyTo`); retries keep it.
  - **Seed:** two replies and seven reactions. Two of them are newer than their chat's last message, so the demo chat list shows the reaction line: Alice's DM with Bob and "Design crit".
- **Phase 2**:
  - **Live events weren't reaching the cache.** The events subscription uses `fetchPolicy: 'no-cache'` and applies every event by hand, so the phase 1 assumption that Apollo merges `ReactionChanged` was wrong: live reactions only showed after a refetch. The same was true of `UserUpdated` from the avatar work. `apps/web/src/lib/cacheUpdates.ts` now has `applyReactions` (loaded messages only) and `applyUser`, which also updates the title of your direct chat with that person. `cacheUpdates.test.ts` guards both.
  - **Emoji data** is generated, not imported whole. `npm run emoji-data -w apps/web` (`apps/web/scripts/emoji-data.ts`) writes `src/features/chat/reactions/emoji-data.json` (1,870 emojis, ~33 KB gzipped, lazy-loaded with the picker). It keeps only Emoji ≤ 15.0 (most devices draw them) that pass the server's RGI check. `emojibase-data` is a dev dependency. Search ranks name prefixes, then names, then tags.
  - **The menu**: one `MessageMenu` for all inputs. Touch gets a spotlight (the screen dims around the bubble, which stays in place); mouse and keyboard get a ring. The reaction bar sits above the message and the actions below, flipping or stacking when there's no room. "+" opens the picker in a `Dialog` (a bottom sheet on phones).
  - **Desktop hover toolbar**: React · Reply · More. It sits in the row's normal flow (absolute placement would overflow the chat column on narrow windows) and is hidden on coarse pointers. Its buttons are mouse-only (`tabIndex=-1`); keyboard users use the message itself (Enter, R).
  - **Touch gestures** live in `useBubbleGestures`. Long-press is 380 ms, with the bubble sinking slightly while held. Swipe right replies once past 56 px, with a tick (`navigator.vibrate`) and a reply arrow that turns brand-coloured. Touches within 32 px of the left edge stay with the pane's swipe-back. A gesture swallows the click that follows, so a swipe on a photo doesn't open the viewer. Bubbles aren't text-selectable on touch screens; Copy text replaces that.
  - **Confirmed sends** keep their temporary display key but now carry `serverId`, so you can react to and reply to a message you just sent.
  - **Jump to original**: loads up to 20 pages of 50 looking for the message (a toast if it's further back), scrolls it to the middle and rings it twice (`.message-flash`; a still ring with reduced motion).
- **Phase 3**:
  - **The touch test signs up its phone user inside its own context.** It's a `hasTouch` context, which the shared `newUser` helper doesn't create. It waits for the phone's chat pane to finish sliding in before measuring the bubble; a touch measured mid-slide lands in the pane's 32 px swipe-back edge.
  - **Exact button names.** Tests use `{ name: 'React', exact: true }`, because the reaction chips' label ("Reactions: …") also contains "React".
  - **No new screenshot files.** Regenerating the existing ones was enough: the seeded reply, reactions and "reacted" chat-list lines now appear in the desktop and phone chat shots.


# REQUESTS_PLAN.md: message requests and group invites

> **Status: done except the commit (2026-11-23).** All phases are built and checked: typecheck, lint,
> prettier, 136 server tests, 196 web tests and 38 e2e tests pass, and every state was reviewed by eye in
> Chromium (dark) and Firefox (light and dark, desktop and phone). Paths are relative to the repo root. "Deviations" at the end lists where the build
> differs from this plan.

## 0. In one minute

- A **new direct chat starts as a message request.** The person starting it can send **one message,
  text only** (no photos, videos, replies or reactions). Then their composer locks with
  "Request sent · Erin can accept or decline".
- The person receiving it sees a **Requests** row above their chats, with a count. Inside are the
  requests and group invites. Opening a request shows the one message with **Accept / Decline / Block**
  where the composer would be.
- The sender **finds out the answer**: a toast ("Erin accepted your message request"), and the chat
  itself changes. On accept the chat becomes a normal chat for both. On decline the sender sees
  "Erin declined your message request" and **can't send another**. It opens up again only if Erin
  starts a chat with them herself.
- **Groups invite instead of adding.** Creating a group or adding people sends invites. The invitee
  sees the group's name, who invited them and who's in it (no messages), with **Join group / Decline**.
  The inviter gets a toast with the answer. Group info lists who's still invited and who declined.
  A declined invite is final for that group.
- Chats that exist today stay as they are. Requests and invites are quiet: no sound, and not in the
  tab title. The Requests row carries the count.

## 1. Decisions (asked 2026-11-23)

| Question | Answer |
| --- | --- |
| Where requests and invites show up | One "Requests" row pinned above the chats, opening a separate list |
| People who already share a group | Still need a request: every new direct chat starts as one |
| After a decline | Final. It opens up again only if the person who declined reaches out |
| What an invitee sees before joining | Group name, inviter, members. No messages |

## 2. Data model

`Conversation` gets three nullable fields. Null `requestState` means an ordinary chat, so every
existing row, every group and the seed stay as they are.

```prisma
enum RequestState { PENDING DECLINED }

model Conversation {
  // …
  /// Direct chats only. Null: an ordinary chat (accepted, or from before requests existed).
  requestState  RequestState?
  /// Who started the request. The other member is the one who answers it.
  requestedById String?
  /// When the one request message was sent. Null: nothing sent yet (the other person can't see it).
  requestSentAt DateTime?
}
```

Group invites get their own table, so pending people are **never** `ConversationMember`s. Every
existing membership check (messages, typing, presence, media, reactions, themes) keeps them out
without any changes.

```prisma
enum InviteState { PENDING DECLINED }

model GroupInvite {
  conversationId String
  userId         String      // the invitee
  invitedById    String
  state          InviteState @default(PENDING)
  createdAt      DateTime    @default(now())
  respondedAt    DateTime?
  // relations: conversation (cascade), user "Invitee" (cascade), invitedBy "Inviter" (cascade)
  @@id([conversationId, userId])
  @@index([userId, state])
}
```

Joining deletes the invite and creates the member row in one transaction. Declining keeps the row as
`DECLINED`, which blocks re-invites and shows "Declined" in group info.

## 3. Server rules

### 3.1 Direct requests (`services/requests.ts` + changes to `conversations.ts`, `messages.ts`)

| Situation | `startDirect(@them)` does |
| --- | --- |
| No chat yet | Creates it as `PENDING`, `requestedById` = me. Only I'm told about it |
| `PENDING`, I'm the sender | Opens it |
| `PENDING`, I'm the recipient, nothing sent yet | I become the sender (I'm the one writing first) |
| `PENDING`, I'm the recipient, message sent | Opens the request (with Accept / Decline) |
| `DECLINED`, I'm the sender | Opens it, locked |
| `DECLINED`, I declined it | Turns it into an ordinary chat, because they wanted to talk |

`sendMessage` in a `PENDING` chat:
- only the sender can send; no attachments, no `replyToId`;
- the one-message rule is enforced with an **atomic claim** inside an interactive transaction:
  `updateMany({ where: { id, requestState: 'PENDING', requestSentAt: null }, data: { requestSentAt } })`.
  If the count is 0, someone else got there first ("You've already sent your request"). Two quick
  sends from two tabs can't both get through;
- a new `requestLimiter` (20 new requests an hour per user) slows down spam;
- the first message tells the recipient (`ConversationUpdated` and `MessageAdded`).

`DECLINED`: nobody can send.

`respondToRequest(conversationId, accept)`: recipient only, `PENDING` with a message sent.
- Accept: `requestState = null`. Both people get `ConversationUpdated`, presence is announced both
  ways, and the sender gets `RequestAnswered`.
- Decline: `DECLINED`, and the recipient's member row gets `hiddenAt`, so it leaves their list. Both
  get `ConversationUpdated`. The sender gets `RequestAnswered { accepted: false }`.
- Blocking the sender from a pending request also declines it (`safety.blockUser`).

**Visibility and leaks** (a request is between strangers until it's accepted):
- `listConversations` / `getConversation`: the recipient can't see a `PENDING` chat until
  `requestSentAt` is set, and can't see a `DECLINED` one. The sender always sees theirs.
- `presence.peersOf`: only counts conversations with `requestState: null`, so a request never shares
  presence or profile updates.
- `setTyping`, `react`, `setChatTheme`, `requestMedia` refuse in a request through one helper,
  `requireOpenChat`. `canMessage` is false in any request, so the client hides those actions too.
- `markRead` still works for the recipient. There are no read receipts, so opening a request
  reveals nothing to the sender.

GraphQL: `Conversation.request: MessageRequest` (null for ordinary chats):
`{ state: RequestState!, sentByMe: Boolean!, sentAt: String, respondedAt: String }`.

### 3.2 Group invites

- `createGroup`: the owner is the only member; everyone else gets an invite. `refuseBlockers` stays.
- `addMembers` (any member, as today) now invites. It refuses people already in the group
  ("They're already in this group"), already invited ("Already invited"), or who declined
  ("Erin declined an invite to this group").
- `respondToInvite(conversationId, accept)`: invitee only, `PENDING`. Join creates the member (role
  MEMBER, `joinedAt` now) and deletes the invite. Decline sets `DECLINED`. The members get
  `ConversationUpdated`, and the inviter gets `RequestAnswered`.
- `cancelInvite(conversationId, userId)`: the inviter or the owner can cancel a pending invite (the
  row is deleted).
- Blocking someone declines their pending invites to you. A group that empties out cascades its
  invites away, and the invitees are told.
- Rate limit: invites count against `requestLimiter` too, one hit per person invited.

GraphQL:
- `Query.invites: [GroupInvite!]!` lists your pending invites, newest first.
- `GroupInvite { conversationId, name, invitedBy: User!, members: [User!]!, createdAt }`.
- `Conversation.invites: [MemberInvite!]!` for groups: `{ user, invitedBy, state, createdAt }`,
  pending and declined.

### 3.3 Events

- `InviteChanged { conversationId, invite: GroupInvite }` goes to the invitee. It's resolved per
  subscriber and is null once the invite is gone (answered, cancelled, group deleted).
- `RequestAnswered { conversationId, kind: ConversationType!, user: User!, accepted: Boolean! }`
  goes to the sender or inviter, and drives the toast.
- The existing `ConversationUpdated` covers everything else.

## 4. UI (frontend, keeps the zinc + indigo palette, Figtree and the springs in `lib/motion.ts`)

- **Chat list:** a Requests row above the chats when there's at least one incoming request or invite.
  It has an inbox icon, "Requests", the first names ("Erin, Book club") and a count badge. Incoming
  requests are filtered out of the normal list. Route `/requests` opens the list in the main pane, or
  as a pushed screen on mobile, with the same edge swipe-back.
- **Requests page:** message requests as rows (avatar, name, @username, the message, time) that open
  `/c/:id`. Group invites as rows ("Carol invited you · 3 members") that open `/invite/:id`.
- **Sender, before sending:** the composer is in request mode, with no attach button and the
  placeholder "Send Erin a message request". A quiet line above it says "Erin gets this as a request.
  You can send one message until they accept." Empty state: "Say hi to Erin".
- **Sender, after sending:** a status bar where the composer was. Pending: "Request sent · Erin can
  accept or decline". Declined: "Erin declined your message request." The chat list preview says the
  same.
- **Recipient:** header subtitle "Message request" (no presence). In place of the composer:
  "Erin wants to message you. They won't know you've seen this unless you accept." with
  [Block] [Decline] [Accept]. Accept swaps the bar for the composer with a spring. Decline goes back
  to Requests with a toast.
- **Invite screen `/invite/:id`:** as in the mockup. Group avatar, name, "Carol invited you to join",
  overlapping member avatars with names, "3 members", then [Decline] [Join group]. Join lands in the
  chat.
- **Group info:** an "Invited" section (pending: "Invited by Carol", with Cancel for the inviter or
  owner; declined: "Declined"). The "Add people" button becomes "Invite people". The header subtitle
  becomes "3 members · 1 invited".
- **New chat dialog:** the group flow says "They'll get an invite to join" and the toast says
  "Invites sent".
- **Toasts** on `RequestAnswered`: "Erin accepted your message request", "Erin declined your
  message request", "Erin joined Book club", "Erin declined the invite to Book club".
- Requests and invites never play a sound and aren't counted in the tab title.

## 5. Tests

- **Server** (`apps/server/test/requests.test.ts`): the one-message rule including a parallel double
  send, text only, no reply, no reactions, typing or themes in a request, visibility before and after
  the first message, accept, decline (and decline being final), the decliner reaching out, block from
  a request, no presence across a request, invites (create, add, join, decline, cancel, re-invite
  refused, blocked), invitee not seeing messages or getting events, and `RequestAnswered` reaching
  the sender.
- **Existing tests** that make direct chats or groups go through a helper that accepts, e.g.
  `connect(a, b)` and `groupWith(owner, …)`, in both `apps/server/test` and `e2e/tests/helpers.ts`.
- **Web unit:** the list filter and Requests row, and the request-mode composer.
- **e2e** (`e2e/tests/requests.spec.ts`, two browser contexts): request, locked composer, accept,
  chat both ways; decline seen by the sender; invite, join; invite, decline seen in group info.
- **Visual:** Playwright MCP screenshots of every new state, light and dark, desktop and phone, in
  Chromium and Firefox. The user reviews them, then a polish pass.

## 6. Phases

1. **Server core** (Opus): migration, rules, leak audit, GraphQL, events.
2. **Server tests** (Sonnet): new suite, plus moving the existing tests onto the accept helpers.
3. **Client** (Opus): gql, cache routing, chat states, Requests row and page, invite screen, group info.
4. **e2e + docs** (Sonnet): new spec, existing e2e helpers, README section, screenshots.
5. **Visual review** (Opus): MCP screenshots → user input → polish → commit.

## Deviations

- `Conversation.requestRespondedAt` was added. It's set on accept and on decline, and the API exposes
  it as `request.respondedAt`.
- `RequestAnswered` also carries `groupName`, so the inviter's toast can name the group even after
  they've left it.
- `startDirect` takeover: if the recipient starts the chat before the sender wrote anything, the
  request changes hands. Both people are told, so the first person's tabs drop the empty chat.
- `sendMessage` also tells the **sender's** tabs (`ConversationUpdated`) when the request goes out, so
  every tab's composer locks. The client also locks it as soon as the send is in flight.
- `hideConversation` refuses for the recipient of a pending request ("Decline the request instead").
- Presence: `peersOf` skips requests, so no live presence or profile events cross a request. The
  `User.online` resolver still answers for anyone (as it did before, e.g. in search), so the client
  hides the online dot and "last seen" for requests: the header says "Message request" and the list
  row has no dot.
- Apollo: `Query.conversations`, `Query.invites` and `Conversation.invites` use `merge: false` (they
  always arrive whole). This also removes an old dev warning when a chat is removed from the list.
- Group info's dialog description still says "N members". The chat header says
  "N members · M invited".

## Handoff notes (for phases 2 and 4)

- About 40 existing server tests fail as expected, because they assume a new DM or group works at
  once. Give `apps/server/test/helpers.ts` two helpers: `connect(a, b)` (a `startDirect`s, sends one
  message, and b `respondToRequest(accept: true)`) and `groupWith(owner, name, others)` (`createGroup`,
  then each invitee `respondToInvite(accept: true)`). Move those tests onto them. Also add
  `prisma.groupInvite.deleteMany()` (before conversation) and `requestLimiter.clear()` to `resetDb`.
- New `apps/server/test/requests.test.ts` covers the list in section 5.
- e2e: the helpers in `e2e/tests/helpers.ts` that start DMs and groups need the same accept steps
  (two contexts). The new spec is `e2e/tests/requests.spec.ts`. Use selectors from the build: the
  link "Requests, N waiting", the buttons Accept / Decline / Block / "Join group", the placeholder
  "Send <first name> a message request", and the status "Request sent".

## Notes from phases 2 and 4 (tests, e2e, docs)

- **Server tests.** `helpers.ts` has `connect(a, b, intro = 'hi')` (the intro is the chat's first
  message, and counts as one of `a`'s sends) and `groupWith(owner, name, others)`, plus `until`,
  `settle`, `types` and the two `RESPOND_TO_*` mutations. Every `Client` now has its own fake address:
  with the extra setup requests the whole of `api.test.ts` went over the 600-a-minute per-IP limit
  from one shared address. 136 tests pass (85 moved or kept, 51 new in `requests.test.ts`).
- **e2e.** `startDirect(a, b)` and `createGroup(owner, name, members)` now take people (`{ page,
  username }`) and do the accepting: `b` accepts from Requests, or each member joins from their
  invite, then goes back to their chat list with Esc. `openDirect` and `inviteToGroup` are the raw
  versions that leave the request or invite pending. The new group button reads "Create group and
  invite N people". `chat.spec.ts` "two people chat in realtime" now follows the request flow itself.
  38 tests pass.

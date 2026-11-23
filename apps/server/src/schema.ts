import { makeExecutableSchema } from '@graphql-tools/schema';
import { resolvers } from './resolvers.js';

export const typeDefs = /* GraphQL */ `
  type Query {
    me: Viewer
    conversations: [Conversation!]!
    conversation(id: ID!): Conversation
    "Messages are returned oldest → newest. Pass the id of the oldest loaded message as \`before\` to page back."
    messages(conversationId: ID!, before: ID, limit: Int = 30): MessagePage!
    searchUsers(query: String!): [User!]!
    "Limits and connection settings for photos and videos. Requires sign-in."
    mediaConfig: MediaConfig!
    "People you blocked, most recent first."
    blockedUsers: [User!]!
    "Someone's card. Signed out: only cards shared by link. Null when there's none to show you."
    card(username: String!): Card
    "Your pending group invites, newest first."
    invites: [GroupInvite!]!
    "Starts a deck of people who share an interest with you: a random middle card, how many matches there are, and the first cards."
    deckStart: DeckStart!
    "More cards from one end of a large deck. RIGHT: ids after the cursor, ascending. LEFT: ids before it, descending. Wraps around the ends."
    deckCards(dir: DeckDir!, cursor: ID!, limit: Int = 5): DeckPage!
    "One person's card as the deck shows it. Null when they aren't available to you any more (a block, either way)."
    deckCard(id: ID!): Card
  }

  enum DeckMode {
    "No matches yet."
    EMPTY
    "Up to 21 matches: all of them come in deckStart.cards, middle card first."
    SMALL
    "More than 21: the middle card and a batch each side, the rest on demand."
    LARGE
  }

  enum DeckDir {
    LEFT
    RIGHT
  }

  type DeckStart {
    mode: DeckMode!
    "How many people matched when the deck started."
    n: Int!
    "SMALL: every match. The middle card first, then by id ascending, wrapping. Empty otherwise."
    cards: [Card!]!
    "LARGE: the middle card."
    m: Card
    "LARGE: the cards right of the middle, nearest first."
    right: [Card!]!
    "LARGE: the cards left of the middle, nearest first."
    left: [Card!]!
  }

  type DeckPage {
    "Nearest first."
    cards: [Card!]!
    "True when the end of the deck was hit and the rest came from the other end."
    wrapped: Boolean!
  }

  enum MediaPart {
    FILE
    POSTER
  }

  enum SignalType {
    HAVE
    OFFER
    ANSWER
    ICE
    RELAY
    BYE
  }

  input SignalInput {
    requestId: ID!
    toPeerId: ID!
    type: SignalType!
    payload: String!
  }

  type MediaRequest {
    requestId: ID!
    candidates: Int!
  }

  type Mutation {
    signUp(input: SignUpInput!): Viewer!
    signIn(input: SignInInput!): Viewer!
    signOut: Boolean!
    updateProfile(input: UpdateProfileInput!): Viewer!
    "Saves the avatar recipe and background colour. Everyone who shares a chat with you sees it live."
    updateAvatar(input: UpdateAvatarInput!): Viewer!
    "Saves your card and/or whether its link works for people who aren't signed in."
    updateCard(input: UpdateCardInput!): Card!
    "Marks the one-time welcome as seen, on every device."
    dismissWelcome: Viewer!

    "Opens your direct chat with someone. A new one is a message request: you can send one message, text only, until they accept."
    startDirect(username: String!): Conversation!
    "Recipient only. Accepting makes it an ordinary chat (returned); declining is final (returns null)."
    respondToRequest(conversationId: ID!, accept: Boolean!): Conversation
    "You're the only member at first: everyone else gets an invite."
    createGroup(name: String!, usernames: [String!]!): Conversation!
    "Invites people to the group. They join if they accept. Someone who declined can't be invited again."
    addMembers(conversationId: ID!, usernames: [String!]!): Conversation!
    "Join the group (returns it) or decline the invite (returns null)."
    respondToInvite(conversationId: ID!, accept: Boolean!): Conversation
    "Whoever sent the invite, or the group's owner, takes back a pending invite."
    cancelInvite(conversationId: ID!, userId: ID!): Conversation!
    renameGroup(conversationId: ID!, name: String!): Conversation!
    leaveGroup(conversationId: ID!): Boolean!
    "Group owners only. Their earlier messages stay."
    removeMember(conversationId: ID!, userId: ID!): Conversation!
    "Sets the chat's theme for everyone in it (JSON recipe). Null goes back to Classic."
    setChatTheme(conversationId: ID!, theme: String): Conversation!
    "Group chats: your own colour there, for everyone. Null goes back to automatic."
    setMemberColor(conversationId: ID!, color: String): Conversation!
    "Direct chats only: removes it from your list until something new happens in it."
    hideConversation(conversationId: ID!): Boolean!
    "Muted chats make no sound and aren't counted in the tab title."
    muteConversation(conversationId: ID!, muted: Boolean!): Conversation!
    "They can't message you, start a chat with you or add you to groups, and neither of you sees the other's presence or typing."
    blockUser(userId: ID!): User!
    unblockUser(userId: ID!): Boolean!

    "\`replyToId\`: a message in the same chat that this one replies to."
    sendMessage(
      conversationId: ID!
      body: String!
      attachments: [AttachmentInput!]
      replyToId: ID
    ): Message!
    "Sets your reaction to a message (one per person; another emoji replaces it). Null removes it."
    react(messageId: ID!, emoji: String): Message!
    "Live connection only. Asks the online devices of this chat's members who has the attachment."
    requestMedia(attachmentId: ID!, part: MediaPart!): MediaRequest!
    "Live connection only. Passes a WebRTC signal to a device taking part in a live media request."
    sendSignal(input: SignalInput!): Boolean!
    "Live connection only. Opens an in-memory relay to a holder when a direct connection isn't possible. Returns the relay id."
    openRelay(requestId: ID!, holderPeerId: ID!, key: String): String!
    markRead(conversationId: ID!): Conversation!
    setTyping(conversationId: ID!): Boolean!
  }

  type Subscription {
    "One stream per signed-in user with everything that happens in their conversations."
    events: ChatEvent!
  }

  input SignUpInput {
    username: String!
    email: String!
    password: String!
    displayName: String
  }

  input SignInInput {
    "Username or email"
    identifier: String!
    password: String!
  }

  input UpdateProfileInput {
    displayName: String!
    avatarColor: String!
  }

  input UpdateAvatarInput {
    avatarColor: String!
    "Avatar recipe (JSON). Null goes back to the default character; leave it out to keep the current one."
    avatar: String
  }

  input UpdateCardInput {
    "Card recipe (JSON). Null goes back to the default card; leave it out to keep the current one."
    recipe: String
    "Signed-out visitors can open /@username. Leave it out to keep the current setting."
    shared: Boolean
  }

  "A person's card. Drawn by the client from its recipe and the person's avatar."
  type Card {
    "Same as the user's id."
    id: ID!
    user: User!
    "Card recipe (JSON). Null means the default card."
    recipe: String
    "Only on your own card: whether its link works for people who aren't signed in."
    shared: Boolean
  }

  "The signed-in user."
  type Viewer {
    id: ID!
    username: String!
    displayName: String!
    email: String!
    avatarColor: String!
    "Avatar recipe (JSON). Null means the default character."
    avatar: String
    "False until a new account closes the one-time welcome."
    welcomed: Boolean!
  }

  type User {
    id: ID!
    username: String!
    displayName: String!
    avatarColor: String!
    "Avatar recipe (JSON). Null means the default character."
    avatar: String
    online: Boolean!
    "Null when hidden from you (a block between you)."
    lastSeenAt: String
  }

  enum ConversationType {
    DIRECT
    GROUP
  }

  type Conversation {
    id: ID!
    type: ConversationType!
    "Display title for the viewer: the other person for DMs, the group name for groups."
    title: String!
    name: String
    members: [User!]!
    "The other person in a direct message."
    peer: User
    lastMessage: Message
    lastMessageAt: String!
    unreadCount: Int!
    createdAt: String!
    muted: Boolean!
    "You removed this direct chat from your list."
    hidden: Boolean!
    "Direct chats: you blocked the other person."
    blockedByMe: Boolean!
    "False in a direct chat where either of you blocked the other."
    canMessage: Boolean!
    "Groups: the member who can remove people."
    ownerId: ID
    "The newest reaction you made or one on your message, if newer than the last message."
    lastReaction: ReactionPreview
    "Chat theme recipe (JSON), the same for everyone in the chat. Null means Classic."
    theme: String
    "Who last changed the theme."
    themeSetBy: User
    "When the theme was last changed (ISO 8601)."
    themeSetAt: String
    "Groups: the colours members picked for themselves (the others are automatic)."
    memberColors: [MemberColor!]!
    "Direct chats: a message request that hasn't been accepted. Null for an ordinary chat."
    request: MessageRequest
    "Groups: people invited who haven't joined, pending or declined, oldest first."
    invites: [MemberInvite!]!
  }

  enum RequestState {
    PENDING
    DECLINED
  }

  enum InviteState {
    PENDING
    DECLINED
  }

  type MessageRequest {
    state: RequestState!
    "You started it, so the other person answers."
    sentByMe: Boolean!
    "When its one message was sent. Null: not yet (the other person can't see it)."
    sentAt: String
    respondedAt: String
  }

  "Someone invited to a group you're in."
  type MemberInvite {
    user: User!
    invitedBy: User!
    state: InviteState!
    createdAt: String!
    respondedAt: String
  }

  "An invite to a group you're not in yet: just enough to decide."
  type GroupInvite {
    "The group's conversation id."
    id: ID!
    conversationId: ID!
    name: String!
    invitedBy: User!
    members: [User!]!
    createdAt: String!
  }

  type MemberColor {
    userId: ID!
    "A colour slug."
    color: String!
  }

  type Message {
    id: ID!
    conversationId: ID!
    sender: User!
    body: String!
    attachments: [Attachment!]!
    createdAt: String!
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

  enum AttachmentKind {
    IMAGE
    VIDEO
  }

  "Metadata only: the bytes travel device to device and are never stored on the server."
  type Attachment {
    id: ID!
    kind: AttachmentKind!
    mimeType: String!
    name: String!
    size: Int!
    width: Int!
    height: Int!
    durationMs: Int
    sha256: String!
    thumbhash: String
    posterSha256: String
    posterSize: Int
    posterMime: String
  }

  input AttachmentInput {
    kind: AttachmentKind!
    mimeType: String!
    name: String!
    size: Int!
    width: Int!
    height: Int!
    durationMs: Int
    sha256: String!
    thumbhash: String
    posterSha256: String
    posterSize: Int
    posterMime: String
  }

  type IceServer {
    urls: [String!]!
    username: String
    credential: String
  }

  type MediaConfig {
    enabled: Boolean!
    relay: Boolean!
    maxAttachments: Int!
    maxImageBytes: Int!
    maxVideoBytes: Int!
    iceServers: [IceServer!]!
  }

  type MessagePage {
    messages: [Message!]!
    hasMore: Boolean!
  }

  union ChatEvent =
    | MessageAdded
    | ConversationUpdated
    | TypingStarted
    | PresenceChanged
    | MediaRequested
    | MediaSignal
    | UserUpdated
    | ReactionChanged
    | InviteChanged
    | RequestAnswered

  type MessageAdded {
    conversationId: ID!
    message: Message!
  }

  "Something about a conversation changed (created, renamed, members, read state). \`conversation\` is null if you are no longer a member."
  type ConversationUpdated {
    conversationId: ID!
    conversation: Conversation
  }

  "Your invite to this group changed. \`invite\` is null once it's gone (answered, cancelled, or the group is gone)."
  type InviteChanged {
    conversationId: ID!
    invite: GroupInvite
  }

  "Someone answered your message request or your invite to a group."
  type RequestAnswered {
    conversationId: ID!
    kind: ConversationType!
    "The group's name, for invites."
    groupName: String
    user: User!
    accepted: Boolean!
  }

  "Someone's reaction to a message in this chat was added, changed or removed."
  type ReactionChanged {
    conversationId: ID!
    message: Message!
  }

  "Someone's name or avatar changed (you, or someone who shares a chat with you)."
  type UserUpdated {
    user: User!
  }

  type TypingStarted {
    conversationId: ID!
    user: User!
  }

  type MediaRequested {
    requestId: ID!
    conversationId: ID!
    attachmentId: ID!
    part: MediaPart!
    sha256: String!
    fromUserId: ID!
    fromPeerId: ID!
  }

  type MediaSignal {
    requestId: ID!
    type: SignalType!
    payload: String!
    fromUserId: ID!
    fromPeerId: ID!
  }

  type PresenceChanged {
    userId: ID!
    online: Boolean!
    lastSeenAt: String
  }
`;

export const schema = makeExecutableSchema({ typeDefs, resolvers });

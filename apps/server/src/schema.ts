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

    startDirect(username: String!): Conversation!
    createGroup(name: String!, usernames: [String!]!): Conversation!
    addMembers(conversationId: ID!, usernames: [String!]!): Conversation!
    renameGroup(conversationId: ID!, name: String!): Conversation!
    leaveGroup(conversationId: ID!): Boolean!
    "Group owners only. Their earlier messages stay."
    removeMember(conversationId: ID!, userId: ID!): Conversation!
    "Direct chats only: removes it from your list until something new happens in it."
    hideConversation(conversationId: ID!): Boolean!
    "Muted chats make no sound and aren't counted in the tab title."
    muteConversation(conversationId: ID!, muted: Boolean!): Conversation!
    "They can't message you, start a chat with you or add you to groups, and neither of you sees the other's presence or typing."
    blockUser(userId: ID!): User!
    unblockUser(userId: ID!): Boolean!

    sendMessage(conversationId: ID!, body: String!, attachments: [AttachmentInput!]): Message!
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

  "The signed-in user."
  type Viewer {
    id: ID!
    username: String!
    displayName: String!
    email: String!
    avatarColor: String!
  }

  type User {
    id: ID!
    username: String!
    displayName: String!
    avatarColor: String!
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
  }

  type Message {
    id: ID!
    conversationId: ID!
    sender: User!
    body: String!
    attachments: [Attachment!]!
    createdAt: String!
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

  type MessageAdded {
    conversationId: ID!
    message: Message!
  }

  "Something about a conversation changed (created, renamed, members, read state). \`conversation\` is null if you are no longer a member."
  type ConversationUpdated {
    conversationId: ID!
    conversation: Conversation
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

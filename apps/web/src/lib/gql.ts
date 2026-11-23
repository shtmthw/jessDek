import { gql, type TypedDocumentNode } from '@apollo/client';

// ---- Types (mirror apps/server/src/schema.ts) ----
export interface User {
  __typename?: 'User';
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  /** The avatar recipe (JSON). Null: the default character. */
  avatar: string | null;
  online: boolean;
  /** Null when hidden from you (a block between you). */
  lastSeenAt: string | null;
}
export interface Viewer {
  __typename?: 'Viewer';
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarColor: string;
  /** The avatar recipe (JSON). Null: the default character. */
  avatar: string | null;
  /** False until a new account closes the one-time welcome. */
  welcomed: boolean;
}
export type AttachmentKind = 'IMAGE' | 'VIDEO';
export type MediaPart = 'FILE' | 'POSTER';
export type SignalType = 'HAVE' | 'OFFER' | 'ANSWER' | 'ICE' | 'BYE' | 'RELAY';

/** Metadata only: the bytes travel device to device and are never stored on the server. */
export interface Attachment {
  __typename?: 'Attachment';
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  name: string;
  size: number;
  width: number;
  height: number;
  durationMs: number | null;
  sha256: string;
  thumbhash: string | null;
  posterSha256: string | null;
  posterSize: number | null;
  posterMime: string | null;
}
export type AttachmentInput = Omit<Attachment, '__typename' | 'id'>;
export interface Message {
  __typename?: 'Message';
  id: string;
  conversationId: string;
  body: string;
  createdAt: string;
  sender: User;
  attachments: Attachment[];
  /** The message this one replies to; null when it isn't a reply. */
  replyTo: ReplyTo | null;
  /** One per person, in the order they first reacted. */
  reactions: Reaction[];
}
/** The quoted message on a reply: just enough to draw the quote. */
export interface ReplyTo {
  __typename?: 'Message';
  id: string;
  body: string;
  createdAt: string;
  sender: Pick<User, 'id' | 'displayName' | 'avatarColor'> & { __typename?: 'User' };
  attachments: Attachment[];
}
export interface Reaction {
  __typename?: 'Reaction';
  emoji: string;
  /** When this person last set it (ISO 8601). */
  reactedAt: string;
  user: Pick<User, 'id' | 'displayName'> & { __typename?: 'User' };
}
/** What the chat list mentions: the newest reaction by you or on your message, if newer than the last message. */
export interface ReactionPreview {
  __typename?: 'ReactionPreview';
  emoji: string;
  reactedAt: string;
  user: Pick<User, 'id' | 'displayName'> & { __typename?: 'User' };
  message: {
    __typename?: 'Message';
    id: string;
    body: string;
    sender: { __typename?: 'User'; id: string };
    attachments: Array<{ __typename?: 'Attachment'; id: string; kind: AttachmentKind }>;
  };
}
export interface IceServer {
  urls: string[];
  username?: string | null;
  credential?: string | null;
}
export interface MediaConfig {
  enabled: boolean;
  relay: boolean;
  maxAttachments: number;
  maxImageBytes: number;
  maxVideoBytes: number;
  iceServers: IceServer[];
}
export interface Conversation {
  __typename?: 'Conversation';
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string;
  name: string | null;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
  peer: User | null;
  members: User[];
  lastMessage: Message | null;
  /** No sounds, not counted in the tab title. */
  muted: boolean;
  /** You removed this direct chat from your list. */
  hidden: boolean;
  /** Direct chats: you blocked the other person. */
  blockedByMe: boolean;
  /** False in a direct chat where either of you blocked the other. */
  canMessage: boolean;
  /** Groups: the member who can remove people. */
  ownerId: string | null;
  /** The reaction the chat list mentions, if any. */
  lastReaction: ReactionPreview | null;
  /** Chat theme recipe (JSON), the same for everyone. Null: Classic. */
  theme: string | null;
  /** Who last changed the theme, and when (ISO 8601). */
  themeSetBy: (Pick<User, 'id' | 'displayName'> & { __typename?: 'User' }) | null;
  themeSetAt: string | null;
  /** Groups: colours members picked for themselves (the rest are automatic). */
  memberColors: MemberColor[];
  /** Direct chats: a message request that hasn't been accepted. Null: an ordinary chat. */
  request: MessageRequest | null;
  /** Groups: people invited who haven't joined (pending or declined). */
  invites: MemberInvite[];
}
export interface MessageRequest {
  __typename?: 'MessageRequest';
  state: 'PENDING' | 'DECLINED';
  /** You started it; the other person answers. */
  sentByMe: boolean;
  /** When its one message was sent. Null: not yet. */
  sentAt: string | null;
  respondedAt: string | null;
}
export interface MemberInvite {
  __typename?: 'MemberInvite';
  user: User;
  invitedBy: Pick<User, 'id' | 'displayName'> & { __typename?: 'User' };
  state: 'PENDING' | 'DECLINED';
  createdAt: string;
  respondedAt: string | null;
}
/** An invite to a group you're not in yet. */
export interface GroupInvite {
  __typename?: 'GroupInvite';
  id: string;
  conversationId: string;
  name: string;
  invitedBy: User;
  members: User[];
  createdAt: string;
}
export interface MemberColor {
  __typename?: 'MemberColor';
  userId: string;
  color: string;
}
export interface MessagePage {
  __typename?: 'MessagePage';
  messages: Message[];
  hasMore: boolean;
}

/** Someone's card. `recipe` null: the default card. `shared`: only on your own card. */
export interface Card {
  __typename?: 'Card';
  id: string;
  recipe: string | null;
  shared: boolean | null;
  user: User;
}

export type ChatEvent =
  | { __typename: 'MessageAdded'; conversationId: string; message: Message }
  | { __typename: 'ConversationUpdated'; conversationId: string; conversation: Conversation | null }
  | { __typename: 'TypingStarted'; conversationId: string; user: User }
  | { __typename: 'PresenceChanged'; userId: string; online: boolean; lastSeenAt: string | null }
  /** Someone's name or avatar changed: you (in another tab) or someone you share a chat with. */
  | { __typename: 'UserUpdated'; user: User }
  /** Someone's reaction in this chat was added, changed or removed. */
  | {
      __typename: 'ReactionChanged';
      conversationId: string;
      message: { __typename?: 'Message'; id: string; reactions: Reaction[] };
    }
  /** Your invite to a group changed; null once it's gone. */
  | { __typename: 'InviteChanged'; conversationId: string; invite: GroupInvite | null }
  /** Someone answered your message request or group invite. */
  | {
      __typename: 'RequestAnswered';
      conversationId: string;
      kind: 'DIRECT' | 'GROUP';
      groupName: string | null;
      user: User;
      accepted: boolean;
    }
  | MediaRequestedEvent
  | MediaSignalEvent;

export interface MediaRequestedEvent {
  __typename: 'MediaRequested';
  requestId: string;
  conversationId: string;
  attachmentId: string;
  part: MediaPart;
  sha256: string;
  fromUserId: string;
  fromPeerId: string;
}
export interface MediaSignalEvent {
  __typename: 'MediaSignal';
  requestId: string;
  type: SignalType;
  payload: string;
  fromUserId: string;
  fromPeerId: string;
}

type Doc<D, V = Record<string, never>> = TypedDocumentNode<D, V>;

// ---- Fragments ----
export const USER_FIELDS = gql`
  fragment UserFields on User {
    id
    username
    displayName
    avatarColor
    avatar
    online
    lastSeenAt
  }
`;
export const ATTACHMENT_FIELDS = gql`
  fragment AttachmentFields on Attachment {
    id
    kind
    mimeType
    name
    size
    width
    height
    durationMs
    sha256
    thumbhash
    posterSha256
    posterSize
    posterMime
  }
`;
export const REACTION_FIELDS = gql`
  fragment ReactionFields on Reaction {
    emoji
    reactedAt
    user {
      id
      displayName
    }
  }
`;
/** Just a message's reactions, for applying a live ReactionChanged. */
export const MESSAGE_REACTIONS = gql`
  fragment MessageReactions on Message {
    id
    reactions {
      ...ReactionFields
    }
  }
  ${REACTION_FIELDS}
`;
export const MESSAGE_FIELDS = gql`
  fragment MessageFields on Message {
    id
    conversationId
    body
    createdAt
    sender {
      ...UserFields
    }
    attachments {
      ...AttachmentFields
    }
    replyTo {
      id
      body
      createdAt
      sender {
        id
        displayName
        avatarColor
      }
      attachments {
        ...AttachmentFields
      }
    }
    reactions {
      ...ReactionFields
    }
  }
  ${USER_FIELDS}
  ${ATTACHMENT_FIELDS}
  ${REACTION_FIELDS}
`;
export const CONVERSATION_FIELDS = gql`
  fragment ConversationFields on Conversation {
    id
    type
    title
    name
    unreadCount
    lastMessageAt
    createdAt
    muted
    hidden
    blockedByMe
    canMessage
    ownerId
    peer {
      ...UserFields
    }
    members {
      ...UserFields
    }
    lastMessage {
      ...MessageFields
    }
    theme
    themeSetAt
    themeSetBy {
      id
      displayName
    }
    memberColors {
      userId
      color
    }
    request {
      state
      sentByMe
      sentAt
      respondedAt
    }
    invites {
      state
      createdAt
      respondedAt
      user {
        ...UserFields
      }
      invitedBy {
        id
        displayName
      }
    }
    lastReaction {
      emoji
      reactedAt
      user {
        id
        displayName
      }
      message {
        id
        body
        sender {
          id
        }
        attachments {
          id
          kind
        }
      }
    }
  }
  ${USER_FIELDS}
  ${MESSAGE_FIELDS}
`;
const VIEWER_FIELDS = gql`
  fragment ViewerFields on Viewer {
    id
    username
    displayName
    email
    avatarColor
    avatar
    welcomed
  }
`;

// ---- Queries ----
export const ME: Doc<{ me: Viewer | null }> = gql`
  query Me {
    me {
      ...ViewerFields
    }
  }
  ${VIEWER_FIELDS}
`;

export const CONVERSATIONS: Doc<{ conversations: Conversation[] }> = gql`
  query Conversations {
    conversations {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const MESSAGES: Doc<
  { messages: MessagePage },
  { conversationId: string; before?: string | null; limit?: number }
> = gql`
  query Messages($conversationId: ID!, $before: ID, $limit: Int) {
    messages(conversationId: $conversationId, before: $before, limit: $limit) {
      hasMore
      messages {
        ...MessageFields
      }
    }
  }
  ${MESSAGE_FIELDS}
`;

export const SEARCH_USERS: Doc<{ searchUsers: User[] }, { query: string }> = gql`
  query SearchUsers($query: String!) {
    searchUsers(query: $query) {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;

// ---- Mutations ----
export const SIGN_UP: Doc<
  { signUp: Viewer },
  { input: { username: string; email: string; password: string; displayName?: string } }
> = gql`
  mutation SignUp($input: SignUpInput!) {
    signUp(input: $input) {
      ...ViewerFields
    }
  }
  ${VIEWER_FIELDS}
`;

export const SIGN_IN: Doc<{ signIn: Viewer }, { input: { identifier: string; password: string } }> =
  gql`
    mutation SignIn($input: SignInInput!) {
      signIn(input: $input) {
        ...ViewerFields
      }
    }
    ${VIEWER_FIELDS}
  `;

export const SIGN_OUT: Doc<{ signOut: boolean }> = gql`
  mutation SignOut {
    signOut
  }
`;

export const UPDATE_PROFILE: Doc<
  { updateProfile: Viewer },
  { input: { displayName: string; avatarColor: string } }
> = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      ...ViewerFields
    }
  }
  ${VIEWER_FIELDS}
`;

/** Saves the avatar recipe and background colour. `avatar: null` goes back to the default character. */
export const UPDATE_AVATAR: Doc<
  { updateAvatar: Viewer },
  { input: { avatarColor: string; avatar: string | null } }
> = gql`
  mutation UpdateAvatar($input: UpdateAvatarInput!) {
    updateAvatar(input: $input) {
      ...ViewerFields
    }
  }
  ${VIEWER_FIELDS}
`;

export const DISMISS_WELCOME: Doc<{ dismissWelcome: Viewer }> = gql`
  mutation DismissWelcome {
    dismissWelcome {
      ...ViewerFields
    }
  }
  ${VIEWER_FIELDS}
`;

const CARD_FIELDS = gql`
  fragment CardFields on Card {
    id
    recipe
    shared
    user {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;

export const CARD: Doc<{ card: Card | null }, { username: string }> = gql`
  query Card($username: String!) {
    card(username: $username) {
      ...CardFields
    }
  }
  ${CARD_FIELDS}
`;

// ---- The card deck (CARD_LOADING.md, CARD_DECK_PLAN.md) ----

export type DeckDir = 'LEFT' | 'RIGHT';
export interface DeckStart {
  __typename?: 'DeckStart';
  mode: 'EMPTY' | 'SMALL' | 'LARGE';
  n: number;
  /** SMALL: every match, the middle card first. */
  cards: Card[];
  /** LARGE: the middle card, and a batch each side (nearest first). */
  m: Card | null;
  right: Card[];
  left: Card[];
}

export const DECK_START: Doc<{ deckStart: DeckStart }> = gql`
  query DeckStart {
    deckStart {
      mode
      n
      cards {
        ...CardFields
      }
      m {
        ...CardFields
      }
      right {
        ...CardFields
      }
      left {
        ...CardFields
      }
    }
  }
  ${CARD_FIELDS}
`;

export const DECK_CARDS: Doc<
  { deckCards: { __typename?: 'DeckPage'; cards: Card[]; wrapped: boolean } },
  { dir: DeckDir; cursor: string; limit?: number }
> = gql`
  query DeckCards($dir: DeckDir!, $cursor: ID!, $limit: Int) {
    deckCards(dir: $dir, cursor: $cursor, limit: $limit) {
      wrapped
      cards {
        ...CardFields
      }
    }
  }
  ${CARD_FIELDS}
`;

/** Null: they aren't available to you any more (the spec's 410). */
export const DECK_CARD: Doc<{ deckCard: Card | null }, { id: string }> = gql`
  query DeckCard($id: ID!) {
    deckCard(id: $id) {
      ...CardFields
    }
  }
  ${CARD_FIELDS}
`;

export const UPDATE_CARD: Doc<
  { updateCard: Card },
  { input: { recipe?: string | null; shared?: boolean } }
> = gql`
  mutation UpdateCard($input: UpdateCardInput!) {
    updateCard(input: $input) {
      ...CardFields
    }
  }
  ${CARD_FIELDS}
`;

export const START_DIRECT: Doc<{ startDirect: Conversation }, { username: string }> = gql`
  mutation StartDirect($username: String!) {
    startDirect(username: $username) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const RESPOND_TO_REQUEST: Doc<
  { respondToRequest: Conversation | null },
  { conversationId: string; accept: boolean }
> = gql`
  mutation RespondToRequest($conversationId: ID!, $accept: Boolean!) {
    respondToRequest(conversationId: $conversationId, accept: $accept) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const GROUP_INVITE_FIELDS = gql`
  fragment GroupInviteFields on GroupInvite {
    id
    conversationId
    name
    createdAt
    invitedBy {
      ...UserFields
    }
    members {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;

export const INVITES: Doc<{ invites: GroupInvite[] }> = gql`
  query Invites {
    invites {
      ...GroupInviteFields
    }
  }
  ${GROUP_INVITE_FIELDS}
`;

export const RESPOND_TO_INVITE: Doc<
  { respondToInvite: Conversation | null },
  { conversationId: string; accept: boolean }
> = gql`
  mutation RespondToInvite($conversationId: ID!, $accept: Boolean!) {
    respondToInvite(conversationId: $conversationId, accept: $accept) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const CANCEL_INVITE: Doc<
  { cancelInvite: Conversation },
  { conversationId: string; userId: string }
> = gql`
  mutation CancelInvite($conversationId: ID!, $userId: ID!) {
    cancelInvite(conversationId: $conversationId, userId: $userId) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const CREATE_GROUP: Doc<
  { createGroup: Conversation },
  { name: string; usernames: string[] }
> = gql`
  mutation CreateGroup($name: String!, $usernames: [String!]!) {
    createGroup(name: $name, usernames: $usernames) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const ADD_MEMBERS: Doc<
  { addMembers: Conversation },
  { conversationId: string; usernames: string[] }
> = gql`
  mutation AddMembers($conversationId: ID!, $usernames: [String!]!) {
    addMembers(conversationId: $conversationId, usernames: $usernames) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const RENAME_GROUP: Doc<
  { renameGroup: Conversation },
  { conversationId: string; name: string }
> = gql`
  mutation RenameGroup($conversationId: ID!, $name: String!) {
    renameGroup(conversationId: $conversationId, name: $name) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const LEAVE_GROUP: Doc<{ leaveGroup: boolean }, { conversationId: string }> = gql`
  mutation LeaveGroup($conversationId: ID!) {
    leaveGroup(conversationId: $conversationId)
  }
`;

export const SEND_MESSAGE: Doc<
  { sendMessage: Message },
  {
    conversationId: string;
    body: string;
    attachments?: AttachmentInput[];
    /** The message this one replies to (same chat). */
    replyToId?: string | null;
  }
> = gql`
  mutation SendMessage(
    $conversationId: ID!
    $body: String!
    $attachments: [AttachmentInput!]
    $replyToId: ID
  ) {
    sendMessage(
      conversationId: $conversationId
      body: $body
      attachments: $attachments
      replyToId: $replyToId
    ) {
      ...MessageFields
    }
  }
  ${MESSAGE_FIELDS}
`;

/** Sets your one reaction to a message (another emoji replaces it); `emoji: null` removes it. */
export const REACT: Doc<
  { react: { __typename?: 'Message'; id: string; reactions: Reaction[] } },
  { messageId: string; emoji: string | null }
> = gql`
  mutation React($messageId: ID!, $emoji: String) {
    react(messageId: $messageId, emoji: $emoji) {
      id
      reactions {
        ...ReactionFields
      }
    }
  }
  ${REACTION_FIELDS}
`;

// ---- Photos and videos (device to device; these run over the WebSocket) ----
export const MEDIA_CONFIG: Doc<{ mediaConfig: MediaConfig }> = gql`
  query MediaConfig {
    mediaConfig {
      enabled
      relay
      maxAttachments
      maxImageBytes
      maxVideoBytes
      iceServers {
        urls
        username
        credential
      }
    }
  }
`;

export const REQUEST_MEDIA: Doc<
  { requestMedia: { requestId: string; candidates: number } },
  { attachmentId: string; part: MediaPart }
> = gql`
  mutation RequestMedia($attachmentId: ID!, $part: MediaPart!) {
    requestMedia(attachmentId: $attachmentId, part: $part) {
      requestId
      candidates
    }
  }
`;

export const SEND_SIGNAL: Doc<
  { sendSignal: boolean },
  { input: { requestId: string; toPeerId: string; type: SignalType; payload: string } }
> = gql`
  mutation SendSignal($input: SignalInput!) {
    sendSignal(input: $input)
  }
`;

export const OPEN_RELAY: Doc<
  { openRelay: string },
  { requestId: string; holderPeerId: string; key: string }
> = gql`
  mutation OpenRelay($requestId: ID!, $holderPeerId: ID!, $key: String) {
    openRelay(requestId: $requestId, holderPeerId: $holderPeerId, key: $key)
  }
`;

export const SET_CHAT_THEME: Doc<
  { setChatTheme: Conversation },
  { conversationId: string; theme: string | null }
> = gql`
  mutation SetChatTheme($conversationId: ID!, $theme: String) {
    setChatTheme(conversationId: $conversationId, theme: $theme) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const SET_MEMBER_COLOR: Doc<
  { setMemberColor: Conversation },
  { conversationId: string; color: string | null }
> = gql`
  mutation SetMemberColor($conversationId: ID!, $color: String) {
    setMemberColor(conversationId: $conversationId, color: $color) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const MUTE_CONVERSATION: Doc<
  { muteConversation: Conversation },
  { conversationId: string; muted: boolean }
> = gql`
  mutation MuteConversation($conversationId: ID!, $muted: Boolean!) {
    muteConversation(conversationId: $conversationId, muted: $muted) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const HIDE_CONVERSATION: Doc<{ hideConversation: boolean }, { conversationId: string }> =
  gql`
    mutation HideConversation($conversationId: ID!) {
      hideConversation(conversationId: $conversationId)
    }
  `;

export const REMOVE_MEMBER: Doc<
  { removeMember: Conversation },
  { conversationId: string; userId: string }
> = gql`
  mutation RemoveMember($conversationId: ID!, $userId: ID!) {
    removeMember(conversationId: $conversationId, userId: $userId) {
      ...ConversationFields
    }
  }
  ${CONVERSATION_FIELDS}
`;

export const BLOCK_USER: Doc<{ blockUser: User }, { userId: string }> = gql`
  mutation BlockUser($userId: ID!) {
    blockUser(userId: $userId) {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;

export const UNBLOCK_USER: Doc<{ unblockUser: boolean }, { userId: string }> = gql`
  mutation UnblockUser($userId: ID!) {
    unblockUser(userId: $userId)
  }
`;

export const BLOCKED_USERS: Doc<{ blockedUsers: User[] }> = gql`
  query BlockedUsers {
    blockedUsers {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;

export const MARK_READ: Doc<{ markRead: Conversation }, { conversationId: string }> = gql`
  mutation MarkRead($conversationId: ID!) {
    markRead(conversationId: $conversationId) {
      id
      unreadCount
    }
  }
`;

export const SET_TYPING: Doc<{ setTyping: boolean }, { conversationId: string }> = gql`
  mutation SetTyping($conversationId: ID!) {
    setTyping(conversationId: $conversationId)
  }
`;

// ---- Subscription ----
export const EVENTS: Doc<{ events: ChatEvent }> = gql`
  subscription Events {
    events {
      __typename
      ... on MessageAdded {
        conversationId
        message {
          ...MessageFields
        }
      }
      ... on ConversationUpdated {
        conversationId
        conversation {
          ...ConversationFields
        }
      }
      ... on TypingStarted {
        conversationId
        user {
          ...UserFields
        }
      }
      ... on PresenceChanged {
        userId
        online
        lastSeenAt
      }
      ... on UserUpdated {
        user {
          ...UserFields
        }
      }
      ... on ReactionChanged {
        conversationId
        message {
          id
          reactions {
            ...ReactionFields
          }
        }
      }
      ... on InviteChanged {
        conversationId
        invite {
          ...GroupInviteFields
        }
      }
      ... on RequestAnswered {
        conversationId
        kind
        groupName
        accepted
        user {
          ...UserFields
        }
      }
      ... on MediaRequested {
        requestId
        conversationId
        attachmentId
        part
        sha256
        fromUserId
        fromPeerId
      }
      ... on MediaSignal {
        requestId
        type
        payload
        fromUserId
        fromPeerId
      }
    }
  }
  ${CONVERSATION_FIELDS}
  ${GROUP_INVITE_FIELDS}
`;

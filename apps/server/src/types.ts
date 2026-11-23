import type { Prisma, User } from '@prisma/client';

export const messageInclude = {
  sender: true,
  attachments: { orderBy: { position: 'asc' } },
  // The quoted message, one level deep (its own `replyTo` and `reactions` aren't loaded).
  replyTo: { include: { sender: true, attachments: { orderBy: { position: 'asc' } } } },
  reactions: { include: { user: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.MessageInclude;

export type MessageWithSender = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export type ServerEvent =
  | { __typename: 'MessageAdded'; conversationId: string; message: MessageWithSender }
  | { __typename: 'ConversationUpdated'; conversationId: string }
  /** To an invitee: their invite to this group changed (resolved per subscriber). */
  | { __typename: 'InviteChanged'; conversationId: string }
  /** To whoever sent a message request or group invite: `user` answered it. */
  | {
      __typename: 'RequestAnswered';
      conversationId: string;
      kind: 'DIRECT' | 'GROUP';
      groupName: string | null;
      user: User;
      accepted: boolean;
    }
  | { __typename: 'TypingStarted'; conversationId: string; user: User }
  | { __typename: 'UserUpdated'; user: User }
  | { __typename: 'ReactionChanged'; conversationId: string; message: MessageWithSender }
  /** `lastSeenAt` is null when it's hidden from the receiver (a block). */
  | { __typename: 'PresenceChanged'; userId: string; online: boolean; lastSeenAt: Date | null }
  // Peer-targeted: only the one browser tab named in `toPeerId` receives these.
  | {
      __typename: 'MediaRequested';
      toPeerId: string;
      requestId: string;
      conversationId: string;
      attachmentId: string;
      part: 'FILE' | 'POSTER';
      sha256: string;
      fromUserId: string;
      fromPeerId: string;
    }
  | {
      __typename: 'MediaSignal';
      toPeerId: string;
      requestId: string;
      type: 'HAVE' | 'OFFER' | 'ANSWER' | 'ICE' | 'BYE' | 'RELAY';
      payload: string;
      fromUserId: string;
      fromPeerId: string;
    };

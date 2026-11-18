import type { Prisma, User } from '@prisma/client';

export const messageInclude = {
  sender: true,
  attachments: { orderBy: { position: 'asc' } },
} satisfies Prisma.MessageInclude;

export type MessageWithSender = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export type ServerEvent =
  | { __typename: 'MessageAdded'; conversationId: string; message: MessageWithSender }
  | { __typename: 'ConversationUpdated'; conversationId: string }
  | { __typename: 'TypingStarted'; conversationId: string; user: User }
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

import { formatClock, formatDayLabel } from './time';

/** A photo or video in a message, as the timeline draws it (from the server, or your own pending send). */
export interface MediaItem {
  /** Stable across a send: the local id while pending, the attachment id once confirmed. */
  key: string;
  kind: 'IMAGE' | 'VIDEO';
  width: number;
  height: number;
  durationMs?: number | null;
  mimeType: string;
  name: string;
  size: number;
  thumbhash?: string | null;
  attachmentId?: string;
  sha256?: string;
  posterSha256?: string | null;
  posterSize?: number | null;
  posterMime?: string | null;
  /** Your own pending send: shown from the file on this device. */
  local?: { previewUrl: string | null; preparing: boolean };
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; displayName: string; avatarColor: string };
  attachments?: MediaItem[];
}

export type TimelineItem<M extends ChatMessage = ChatMessage> =
  | { kind: 'day'; key: string; label: string }
  /** A pause of an hour or more inside one day. */
  | { kind: 'time'; key: string; label: string }
  /** Where the messages you haven't read yet begin. */
  | { kind: 'unread'; key: string }
  | {
      kind: 'run';
      key: string;
      mine: boolean;
      sender: M['sender'];
      messages: M[];
    };

const RUN_GAP_MS = 5 * 60 * 1000;
const TIME_GAP_MS = 60 * 60 * 1000;

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Turns a flat, oldest → newest message list into a timeline of day separators and runs of
 * consecutive messages from the same sender (broken by a pause of 5+ minutes or a new day).
 * A pause of an hour or more adds a time label; `firstUnreadId` adds a "new messages" divider.
 */
export function buildTimeline<M extends ChatMessage>(
  messages: M[],
  viewerId: string,
  now = new Date(),
  { firstUnreadId }: { firstUnreadId?: string } = {},
): TimelineItem<M>[] {
  const items: TimelineItem<M>[] = [];
  let lastDay = '';
  let current: Extract<TimelineItem<M>, { kind: 'run' }> | null = null;
  let lastTime = 0;

  for (const message of messages) {
    const day = dayKey(message.createdAt);
    const time = new Date(message.createdAt).getTime();
    if (day !== lastDay) {
      items.push({ kind: 'day', key: `day-${day}`, label: formatDayLabel(message.createdAt, now) });
      lastDay = day;
      current = null;
    } else if (time - lastTime >= TIME_GAP_MS) {
      items.push({
        kind: 'time',
        key: `time-${message.id}`,
        label: formatClock(message.createdAt),
      });
      current = null;
    }
    if (firstUnreadId && message.id === firstUnreadId) {
      items.push({ kind: 'unread', key: 'unread' });
      current = null;
    }
    if (!current || current.sender.id !== message.sender.id || time - lastTime > RUN_GAP_MS) {
      current = {
        kind: 'run',
        key: `run-${message.id}`,
        mine: message.sender.id === viewerId,
        sender: message.sender,
        messages: [],
      };
      items.push(current);
    }
    current.messages.push(message);
    lastTime = time;
  }
  return items;
}

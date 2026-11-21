import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Info,
  MessageSquareOff,
  MoreHorizontal,
  Palette,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button, buttonClass } from '@/components/Button';
import { Menu, MenuItem, MenuSeparator } from '@/components/Menu';
import { Skeleton } from '@/components/Skeleton';
import { useMediaConfig } from '@/features/media/config';
import { PrepareError, toInput, type PreparedAttachment } from '@/features/media/prepare';
import * as mediaStore from '@/features/media/store';
import { addFiles, trackUnsent, type TrayItem } from '@/features/media/trayStore';
import { cn } from '@/lib/cn';
import { COMPOSER_ID } from '@/lib/keys';
import {
  CONVERSATIONS,
  MARK_READ,
  MESSAGES,
  SEND_MESSAGE,
  SET_TYPING,
  type Message,
  type ReplyTo,
} from '@/lib/gql';
import { useIsDesktop } from '@/lib/media';
import { easeOut, exit, spring } from '@/lib/motion';
import { formatLastSeen } from '@/lib/time';
import { getActiveConversation, setActiveConversation } from '../realtime/active';
import { applyMessage } from '../realtime/EventsProvider';
import { useTypers } from '../realtime/typing';
import { useViewer } from '../session/ViewerProvider';
import { Composer } from './Composer';
import { GroupInfoDialog } from './GroupInfoDialog';
import type { ComponentProps } from 'react';
import { DropOverlay } from './media/DropOverlay';
import { fromAttachment, fromTray } from './media/items';
import type { ViewerEntry } from './media/MediaViewer';
import { OpenMediaContext } from './media/ViewerContext';
import { useFileDrop } from './media/useFileDrop';
import { useChatActions } from './useChatActions';
import { MessageList, type DisplayMessage } from './MessageList';
import { useOpenCard } from '../card/CardDialogProvider';
import { useReact } from './reactions/useReact';
import { toReplyTo } from './replies/quote';
import { getReply, setReply, useReply } from './replies/replyStore';
import { ChatThemeProvider, ChatWallpaper } from '../theme/ChatWallpaper';
import { themeChangeText } from '../theme/notice';
import { parseTheme, themeSpec, type ThemeSpec } from '../theme/recipe';
import { assignMemberColors, memberVars, themeVars } from '../theme/resolve';

// The theme sheet is its own chunk, loaded the first time it opens.
const ThemeSheet = lazy(() =>
  import('../theme/ThemeSheet').then((m) => ({ default: m.ThemeSheet })),
);

// The viewer is its own chunk, loaded as soon as a chat has something to open. It's kept out of
// React.lazy on purpose: a suspended first open leaves the tile's spot empty for React's 300 ms
// reveal throttle before the picture can grow out of it.
type ViewerComponent = ComponentType<ComponentProps<typeof import('./media/MediaViewer').default>>;
let loadedViewer: ViewerComponent | null = null;
const loadViewer = () =>
  import('./media/MediaViewer').then((m) => (loadedViewer = m.default as ViewerComponent));

const PAGE_SIZE = 30;
/** Jumping to a quoted message loads at most this many older pages looking for it. */
const JUMP_PAGES = 20;
const JUMP_PAGE_SIZE = 50;
const TYPING_THROTTLE_MS = 2500;
let pendingCounter = 0;

interface PendingMessage {
  tempId: string;
  body: string;
  createdAt: string;
  status: 'sending' | 'failed' | 'sent';
  /** The server's id once the send is confirmed. */
  realId?: string;
  /** The newest real message when this was sent; its echo can only arrive after that. */
  after?: string;
  /** Photos and videos from the tray. They arrive with the message and belong to it from here on. */
  attachments?: TrayItem[];
  /** Same files, once resized and hashed. Known only after preparing, and before the send. */
  prepared?: PreparedAttachment[];
  /** The message this one replies to, shown as a quote while the send is in flight. */
  replyTo?: ReplyTo;
}

const sameShas = (a: string[], b: string[]) =>
  a.length === b.length && a.every((s, i) => s === b[i]);

/** A real message as the timeline draws it (server attachments become tiles). */
const toDisplay = (m: Message): DisplayMessage => ({
  ...m,
  attachments: m.attachments.length ? m.attachments.map(fromAttachment) : undefined,
});

const isWindowActive = () => document.visibilityState === 'visible' && document.hasFocus();
const firstName = (name: string) => name.split(' ')[0] ?? name;

function typingLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${firstName(names[0]!)} is typing`;
  if (names.length === 2) return `${firstName(names[0]!)} and ${firstName(names[1]!)} are typing`;
  return `${names.length} people are typing`;
}

function NotFound() {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
    >
      <div className="mb-2 inline-flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <MessageSquareOff className="size-5" />
      </div>
      <p className="font-semibold">This conversation isn’t available</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        It may have been deleted, or you’re no longer a member.
      </p>
      <Link to="/" className={buttonClass('secondary', 'md', 'mt-3')}>
        Back to chats
      </Link>
    </motion.div>
  );
}

function MessagesSkeleton() {
  return (
    <div className="chat-column flex flex-1 flex-col justify-end gap-2 pb-4" aria-busy>
      <Skeleton className="h-10 w-52 rounded-[20px]" />
      <Skeleton className="h-10 w-72 rounded-[20px] rounded-tl-md" />
      <Skeleton className="ml-auto mt-3 h-10 w-44 rounded-[20px]" />
      <Skeleton className="h-10 w-60 rounded-[20px]" />
      <Skeleton className="ml-auto mt-3 h-10 w-64 rounded-[20px]" />
    </div>
  );
}

export function ChatView() {
  const { id = '' } = useParams();
  // Remount per conversation so scroll position, drafts and pending sends never leak between chats.
  return <ChatScreen key={id} id={id} />;
}

function ChatScreen({ id }: { id: string }) {
  const viewer = useViewer();
  const client = useApolloClient();
  const desktop = useIsDesktop();
  const [infoOpen, setInfoOpen] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [lightbox, setLightbox] = useState<{ messageId: string; index: number } | null>(null);
  const mediaEnabled = useMediaConfig()?.enabled !== false;
  const actions = useChatActions();
  const openCard = useOpenCard();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const lastTypingPing = useRef(0);
  /** Confirmed message id → the temporary key it was shown under, so a send never re-animates. */
  const aliases = useRef(new Map<string, string>());
  const replyTo = useReply(id);
  const react = useReact();
  const [jump, setJump] = useState<{ id: string; nonce: number } | null>(null);
  const [themeOpen, setThemeOpenState] = useState(false);
  /** Mounted from the first open on, so the sheet can animate out. */
  const [themeMounted, setThemeMounted] = useState(false);
  const setThemeOpen = useCallback((open: boolean) => {
    if (open) setThemeMounted(true);
    setThemeOpenState(open);
  }, []);
  /** The theme being tried in the theme sheet, shown in the chat until it's set or dropped. */
  const [trying, setTrying] = useState<ThemeSpec | null>(null);

  const { data: list, loading: listLoading } = useQuery(CONVERSATIONS, {
    fetchPolicy: 'cache-first',
  });
  const conversation = list?.conversations.find((c) => c.id === id);

  // The chat's theme (or the one being tried), and in groups each member's colour.
  const savedTheme = conversation?.theme ?? null;
  const spec = useMemo(() => trying ?? themeSpec(parseTheme(savedTheme)), [trying, savedTheme]);
  const themeStyle = useMemo(() => themeVars(spec) as CSSProperties, [spec]);
  const members = conversation?.members;
  const picked = conversation?.memberColors;
  const groupChat = conversation?.type === 'GROUP';
  const memberStyle = useMemo(() => {
    if (!groupChat || !members) return undefined;
    const colors = assignMemberColors(
      members.map((m) => m.id),
      picked ?? [],
      spec.accent,
    );
    const cache = new Map<string, CSSProperties>();
    return (userId: string) => {
      const color = colors.get(userId);
      if (!color) return undefined;
      let style = cache.get(color);
      if (!style) cache.set(color, (style = memberVars(spec, color) as CSSProperties));
      return style;
    };
  }, [groupChat, members, picked, spec]);

  const { data, error, fetchMore, loading } = useQuery(MESSAGES, {
    variables: { conversationId: id, limit: PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
    skip: !conversation,
  });
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [setTyping] = useMutation(SET_TYPING);
  const [markRead] = useMutation(MARK_READ);
  const [loadingMore, setLoadingMore] = useState(false);
  const typers = useTypers(id);
  const typingNames = useMemo(() => typers.map((t) => t.name), [typers]);

  // Remember how much was unread when the chat opened, before marking it read clears the count.
  const unreadAtOpen = useRef<number | null>(null);
  if (unreadAtOpen.current === null && conversation)
    unreadAtOpen.current = conversation.unreadCount;

  // Tell the realtime layer which chat is open so incoming messages here count as read.
  useEffect(() => {
    setActiveConversation(id);
    return () => {
      if (getActiveConversation() === id) setActiveConversation(null);
    };
  }, [id]);

  // Mark as read while the chat is on screen and the window is active.
  const unread = conversation?.unreadCount ?? 0;
  const [active, setActive] = useState(isWindowActive);
  useEffect(() => {
    const update = () => setActive(isWindowActive());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    if (unread > 0 && active)
      void markRead({ variables: { conversationId: id } }).catch(() => undefined);
  }, [unread, active, id, markRead]);

  const messages = useMemo(() => data?.messages.messages ?? [], [data]);
  const hasMore = data?.messages.hasMore ?? false;

  // Where the unread messages began when you opened the chat (fixed for the visit).
  const firstUnread = useRef<string | undefined | null>(null);
  if (firstUnread.current === null && data) {
    const count = unreadAtOpen.current ?? 0;
    const fromOthers = messages.filter((m) => m.sender.id !== viewer.id);
    firstUnread.current =
      count > 0 ? fromOthers[Math.max(0, fromOthers.length - count)]?.id : undefined;
  }

  // Real history plus your sends in flight. A send keeps its key from "sending" to "sent".
  const { display, onScreen } = useMemo(() => {
    const aliased = aliases.current;
    const claimed = new Set(aliased.values());
    const ids = messages.map((m) => m.id);
    // The server also echoes your own message over the live connection, sometimes before the
    // send itself returns: pair such echoes with the pending bubble they belong to.
    for (const p of pending) {
      if (p.status !== 'sending' || claimed.has(p.tempId)) continue;
      const start = p.after ? ids.indexOf(p.after) + 1 : 0;
      // Matching on the text alone would swap two captionless photos, so the files must match too.
      // A send with media can only be paired once its files have been hashed.
      if (p.attachments && !p.prepared) continue;
      const shas = p.prepared?.map((a) => a.sha256) ?? [];
      const echo = messages.slice(start).find(
        (m) =>
          m.sender.id === viewer.id &&
          m.body === p.body &&
          (m.replyTo?.id ?? null) === (p.replyTo?.id ?? null) &&
          sameShas(
            m.attachments.map((a) => a.sha256),
            shas,
          ) &&
          !aliased.has(m.id),
      );
      if (echo) {
        aliased.set(echo.id, p.tempId);
        claimed.add(p.tempId);
      }
    }
    // Temp keys whose confirmed message is already in the list.
    const onScreen = new Set<string>();
    const out: DisplayMessage[] = messages.map((m) => {
      const shown = toDisplay(m);
      const key = aliased.get(m.id);
      if (!key) return shown;
      onScreen.add(key);
      return { ...shown, id: key, tempId: key, serverId: m.id, status: 'sent' as const };
    });
    const sender = {
      id: viewer.id,
      displayName: viewer.displayName,
      avatarColor: viewer.avatarColor,
      avatar: viewer.avatar ?? null,
    };
    for (const p of pending) {
      if (onScreen.has(p.tempId)) continue;
      out.push({
        id: p.tempId,
        tempId: p.tempId,
        body: p.body,
        createdAt: p.createdAt,
        sender,
        status: p.status === 'failed' ? 'failed' : 'sending',
        preparing: p.attachments && !p.prepared ? true : undefined,
        attachments: p.attachments?.map((item, i) => fromTray(item, p.prepared?.[i])),
        replyTo: p.replyTo ?? null,
        reactions: [],
      });
    }
    return { display: out, onScreen };
  }, [messages, pending, viewer]);

  // Forget pending entries once their real message is on screen.
  useEffect(() => {
    if (pending.some((p) => onScreen.has(p.tempId)))
      setPending((list) => list.filter((p) => !onScreen.has(p.tempId)));
  }, [onScreen, pending]);

  const loadMore = useCallback(() => {
    const oldest = messages[0];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    fetchMore({ variables: { conversationId: id, before: oldest.id, limit: PAGE_SIZE } })
      .catch(() => toast.error('Couldn’t load earlier messages'))
      .finally(() => setLoadingMore(false));
  }, [messages, loadingMore, fetchMore, id]);

  /** Your files are held for others to download while the send is in flight. */
  function holdForSharing(prepared: PreparedAttachment[]) {
    for (const a of prepared) {
      mediaStore.holdInMemory(a.sha256, a.file, id);
      if (a.kind === 'VIDEO') {
        mediaStore.holdInMemory(a.poster.sha256, a.poster.blob, id, true);
        mediaStore.registerUrl(a.poster.sha256, a.previewUrl); // the bubble keeps the same picture
      } else mediaStore.registerUrl(a.sha256, a.previewUrl);
    }
  }

  async function dispatch(tempId: string, body: string, items?: TrayItem[], replyTo?: ReplyTo) {
    try {
      let prepared: PreparedAttachment[] | undefined;
      if (items?.length) {
        prepared = await Promise.all(items.map((i) => i.done));
        holdForSharing(prepared);
        setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, prepared } : x)));
      }
      const { data: sent } = await sendMessage({
        variables: {
          conversationId: id,
          body,
          attachments: prepared?.map(toInput),
          replyToId: replyTo?.id ?? null,
        },
      });
      if (!sent) return;
      const realId = sent.sendMessage.id;
      const alreadyPaired = [...aliases.current.values()].includes(tempId);
      if (!alreadyPaired && !aliases.current.has(realId)) aliases.current.set(realId, tempId);
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: 'sent', realId } : x)));
      applyMessage(client, viewer.id, sent.sendMessage);
      // Now that the server has the message, keep the files on this device for others to fetch.
      if (prepared) {
        await Promise.all(
          prepared.flatMap((a) => [
            mediaStore.persist(a.sha256, id, 'sent'),
            a.kind === 'VIDEO' ? mediaStore.persist(a.poster.sha256, id, 'sent') : undefined,
          ]),
        ).catch(() => undefined); // out of space: it stays shareable from memory for this session
      }
    } catch (err) {
      const message =
        err instanceof PrepareError
          ? err.message
          : (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message;
      if (message) toast.error(message);
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: 'failed' } : x)));
    } finally {
      if (items?.length) trackUnsent(-1);
    }
  }

  // Sends are queued so messages reach the server in the order they were typed.
  const enqueue = (tempId: string, body: string, items?: TrayItem[], replyTo?: ReplyTo) => {
    if (items?.length) trackUnsent(1);
    queue.current = queue.current.then(() => dispatch(tempId, body, items, replyTo));
  };

  /** `replyTo`: the message this one quotes (a reply). */
  function send(body: string, items?: TrayItem[], replyTo?: ReplyTo) {
    lastTypingPing.current = 0; // the next keystroke should announce typing again
    const tempId = `pending-${Date.now()}-${pendingCounter++}`;
    const after = messages[messages.length - 1]?.id;
    setPending((p) => [
      ...p,
      {
        tempId,
        body,
        status: 'sending',
        createdAt: new Date().toISOString(),
        after,
        attachments: items?.length ? items : undefined,
        replyTo,
      },
    ]);
    enqueue(tempId, body, items, replyTo);
  }

  /** The composer's send: a reply if one is being written, which it then lets go of. */
  function sendFromComposer(body: string, items?: TrayItem[]) {
    const quote = getReply(id);
    if (quote) setReply(id, null);
    send(body, items, quote ?? undefined);
  }

  function startReply(messageId: string) {
    const original = messages.find((m) => m.id === messageId);
    if (!original) return;
    setReply(id, toReplyTo(original));
    // Straight to the message box, like starting to type.
    requestAnimationFrame(() => document.getElementById(COMPOSER_ID)?.focus());
  }

  /** Brings a quoted message into view, loading older history until it's there. */
  async function jumpTo(messageId: string) {
    const show = () => setJump((j) => ({ id: messageId, nonce: (j?.nonce ?? 0) + 1 }));
    if (messages.some((m) => m.id === messageId)) return show();
    let oldest = messages[0]?.id;
    let more = hasMore;
    setLoadingMore(true);
    try {
      for (let page = 0; page < JUMP_PAGES && more && oldest; page++) {
        const res = await fetchMore({
          variables: { conversationId: id, before: oldest, limit: JUMP_PAGE_SIZE },
        });
        const got = res.data.messages;
        if (got.messages.some((m) => m.id === messageId)) {
          // Let the new history render before scrolling to it.
          requestAnimationFrame(show);
          return;
        }
        oldest = got.messages[0]?.id;
        more = got.hasMore;
      }
      toast('That message is too far back to show here');
    } catch {
      toast.error('Couldn’t load earlier messages');
    } finally {
      setLoadingMore(false);
    }
  }

  function retry(tempId: string) {
    const item = pending.find((p) => p.tempId === tempId);
    if (!item) return;
    const after = messages[messages.length - 1]?.id;
    setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: 'sending', after } : x)));
    enqueue(tempId, item.body, item.attachments, item.replyTo);
  }

  function discard(tempId: string) {
    const item = pending.find((p) => p.tempId === tempId);
    for (const a of item?.prepared ?? []) {
      mediaStore.releaseMemory(a.sha256);
      if (a.kind === 'VIDEO') mediaStore.releaseMemory(a.poster.sha256);
    }
    for (const i of item?.attachments ?? []) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    setPending((p) => p.filter((x) => x.tempId !== tempId));
  }

  function typingPing() {
    const now = Date.now();
    if (now - lastTypingPing.current < TYPING_THROTTLE_MS) return;
    lastTypingPing.current = now;
    void setTyping({ variables: { conversationId: id } }).catch(() => undefined);
  }

  // Every photo and video loaded in this chat, oldest first, for the viewer.
  const viewerEntries = useMemo<ViewerEntry[]>(
    () =>
      display.flatMap((m) =>
        (m.attachments ?? []).map((item) => ({
          item,
          messageId: m.id,
          senderName: m.sender.displayName,
          senderColor: m.sender.avatarColor,
          senderAvatar: m.sender.avatar ?? null,
          createdAt: m.createdAt,
          caption: m.body,
        })),
      ),
    [display],
  );
  const viewerIndex = lightbox
    ? viewerEntries.findIndex((e) => e.messageId === lightbox.messageId) + lightbox.index
    : -1;
  function stepViewer(flat: number) {
    const entry = viewerEntries[flat];
    if (!entry) return;
    const first = viewerEntries.findIndex((e) => e.messageId === entry.messageId);
    setLightbox({ messageId: entry.messageId, index: flat - first });
  }

  // Warm the viewer's code as soon as there's something to open, so the first tap isn't a wait.
  const hasMedia = viewerEntries.length > 0;
  const [Viewer, setViewer] = useState<ViewerComponent | null>(() => loadedViewer);
  useEffect(() => {
    if (hasMedia && !Viewer) void loadViewer().then((v) => setViewer(() => v));
  }, [hasMedia, Viewer]);
  const openMedia = (messageId: string, index: number) => {
    if (Viewer) return setLightbox({ messageId, index });
    // Tapped before the code arrived (slow network): open as soon as it's here.
    void loadViewer().then((v) => {
      setViewer(() => v);
      setLightbox({ messageId, index });
    });
  };

  const drop = useFileDrop((files) => {
    if (mediaEnabled) addFiles(id, files);
  });

  if (!conversation) {
    if (listLoading) {
      return (
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-border px-4">
            <Skeleton className="size-10 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <MessagesSkeleton />
        </div>
      );
    }
    return <NotFound />;
  }

  const isGroup = conversation.type === 'GROUP';
  const peer = conversation.peer;
  const typingText = typingLabel(typingNames);
  const subtitle = isGroup
    ? `${conversation.members.length} members`
    : conversation.blockedByMe
      ? 'Blocked'
      : peer?.online
        ? 'Online'
        : peer?.lastSeenAt
          ? formatLastSeen(peer.lastSeenAt)
          : '';

  const identity = (
    <>
      <Avatar
        name={conversation.title}
        color={peer?.avatarColor}
        avatar={peer?.avatar}
        online={peer?.online}
        group={isGroup}
      />
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold leading-5 tracking-tight">
          {conversation.title}
        </h1>
        <p className="grid h-4 overflow-hidden text-xs leading-4" aria-live="polite">
          <AnimatePresence initial={false}>
            <motion.span
              key={typingText ? 'typing' : 'status'}
              className={cn(
                'col-start-1 row-start-1 truncate',
                typingText ? 'font-medium text-brand-text' : 'text-muted-foreground',
              )}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: exit.fast }}
              transition={spring.snappy}
            >
              {typingText ?? subtitle}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>
    </>
  );

  const empty = (
    <motion.div
      className="m-auto flex flex-col items-center gap-1 py-10 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
    >
      <Avatar
        name={conversation.title}
        color={peer?.avatarColor}
        avatar={peer?.avatar}
        group={isGroup}
        size="lg"
      />
      <p className="mt-3 text-[17px] font-semibold tracking-tight">
        {isGroup ? `Welcome to ${conversation.title}` : `Say hi to ${conversation.title}`}
      </p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Messages you send here show up instantly.
      </p>
      <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => send('👋')}>
        <span aria-hidden>👋</span> Wave hello
      </Button>
    </motion.div>
  );

  const noticeText = themeChangeText(conversation, viewer.id);
  const notice =
    noticeText && conversation.themeSetAt
      ? {
          at: conversation.themeSetAt,
          text: noticeText,
          onChange: conversation.canMessage ? () => setThemeOpen(true) : undefined,
        }
      : null;

  const intro = (
    <div className="flex flex-col items-center gap-1 pb-4 pt-8 text-center">
      <Avatar
        name={conversation.title}
        color={peer?.avatarColor}
        avatar={peer?.avatar}
        group={isGroup}
        size="lg"
      />
      <p className="mt-2 font-semibold tracking-tight">{conversation.title}</p>
      <p className="text-xs text-muted-foreground">
        {isGroup
          ? `This is the start of ${conversation.title}`
          : 'This is the start of the conversation'}
      </p>
    </div>
  );

  return (
    <ChatThemeProvider value={{ spec }}>
      <motion.section
        className="relative flex h-full min-h-0 flex-col"
        aria-label={`Chat with ${conversation.title}`}
        data-chat-theme={spec.classic ? undefined : spec.id}
        data-bubble-style={spec.bubble}
        style={themeStyle}
        {...(mediaEnabled ? drop.handlers : {})}
        initial={desktop ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: easeOut }}
      >
        <header className="relative z-20 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-1 border-b border-border/80 bg-background px-2 pt-[env(safe-area-inset-top)] md:px-4">
          <Link
            to="/"
            aria-label="Back to chats"
            className="inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted md:hidden"
          >
            <ArrowLeft className="size-5" />
          </Link>
          {isGroup ? (
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-muted/70"
            >
              {identity}
            </button>
          ) : peer ? (
            <button
              type="button"
              onClick={() => openCard(peer)}
              aria-label={`${conversation.title}, see their card`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-muted/70"
            >
              {identity}
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-1.5 py-1.5">{identity}</div>
          )}
          {conversation.muted ? (
            <BellOff className="size-4 shrink-0 text-muted-foreground" aria-label="Muted" />
          ) : null}
          <Menu
            trigger={
              <Button variant="ghost" size="icon" aria-label="Chat options" title="Chat options">
                <MoreHorizontal className="size-5" />
              </Button>
            }
          >
            {isGroup ? (
              <MenuItem icon={Info} onSelect={() => setInfoOpen(true)}>
                Group info
              </MenuItem>
            ) : null}
            {conversation.canMessage ? (
              <MenuItem icon={Palette} onSelect={() => setThemeOpen(true)}>
                Theme
              </MenuItem>
            ) : null}
            <MenuItem
              icon={conversation.muted ? Bell : BellOff}
              onSelect={() => void actions.mute(conversation, !conversation.muted)}
            >
              {conversation.muted ? 'Unmute notifications' : 'Mute notifications'}
            </MenuItem>
            {peer ? (
              <>
                <MenuSeparator />
                {conversation.blockedByMe ? (
                  <MenuItem icon={ShieldCheck} onSelect={() => void actions.unblock(peer)}>
                    Unblock {firstName(peer.displayName)}
                  </MenuItem>
                ) : (
                  <MenuItem icon={Ban} danger onSelect={() => void actions.block(peer)}>
                    Block {firstName(peer.displayName)}
                  </MenuItem>
                )}
                <MenuItem icon={Trash2} danger onSelect={() => void actions.hide(conversation)}>
                  Remove chat
                </MenuItem>
              </>
            ) : null}
          </Menu>
        </header>

        <div data-chat-wall className="relative isolate flex min-h-0 flex-1 flex-col">
          <ChatWallpaper spec={spec} />
          {error && !data ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="font-semibold">Couldn’t load messages</p>
              <p className="text-sm text-muted-foreground">
                Check your connection, then try again.
              </p>
              <Button
                variant="secondary"
                onClick={() => void client.refetchQueries({ include: ['Messages'] })}
              >
                Try again
              </Button>
            </div>
          ) : loading && !data ? (
            <MessagesSkeleton />
          ) : (
            <OpenMediaContext.Provider
              value={viewerIndex >= 0 ? (viewerEntries[viewerIndex]?.item.key ?? null) : null}
            >
              <MessageList
                messages={display}
                viewerId={viewer.id}
                conversationId={id}
                memberName={(userId) =>
                  conversation.members.find((m) => m.id === userId)?.displayName
                }
                onOpenMedia={openMedia}
                isGroup={isGroup}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                onRetry={retry}
                onDiscard={discard}
                typing={typers}
                firstUnreadId={firstUnread.current ?? undefined}
                intro={intro}
                empty={empty}
                canAct={conversation.canMessage}
                members={conversation.members}
                onReply={startReply}
                onReact={react}
                onJump={(messageId) => void jumpTo(messageId)}
                jump={jump}
                memberStyle={memberStyle}
                notice={notice}
              />
            </OpenMediaContext.Provider>
          )}

          {conversation.canMessage ? (
            <Composer
              key={id}
              draftKey={id}
              autoFocus
              onSend={sendFromComposer}
              replyTo={replyTo}
              viewerId={viewer.id}
              onCancelReply={() => setReply(id, null)}
              onTyping={typingPing}
              placeholder={`Message ${isGroup ? conversation.title : firstName(conversation.title)}`}
              onWallpaper={!spec.classic}
            />
          ) : (
            // A block (either way) ends the conversation; whoever blocked can undo it right here.
            <motion.div
              className="chat-column shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 md:pb-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
            >
              <div
                role="status"
                className="flex min-h-13 items-center justify-center gap-3 rounded-[1.5rem] bg-muted/70 px-4 py-2 text-center text-sm text-muted-foreground"
              >
                {conversation.blockedByMe && peer ? (
                  <>
                    <span>You blocked {firstName(peer.displayName)}.</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void actions.unblock(peer)}
                    >
                      Unblock
                    </Button>
                  </>
                ) : (
                  <span>You can’t reply to this conversation.</span>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {isGroup ? (
          <GroupInfoDialog
            conversation={conversation}
            open={infoOpen}
            onOpenChange={setInfoOpen}
            onOpenTheme={() => {
              setInfoOpen(false);
              setThemeOpen(true);
            }}
          />
        ) : null}

        {themeMounted ? (
          <Suspense fallback={null}>
            <ThemeSheet
              conversation={conversation}
              open={themeOpen}
              onOpenChange={(open) => {
                setThemeOpen(open);
                if (!open) setTrying(null);
              }}
              onTry={setTrying}
            />
          </Suspense>
        ) : null}

        <AnimatePresence>
          {drop.dragging && mediaEnabled ? (
            <DropOverlay
              key="drop"
              name={isGroup ? conversation.title : firstName(conversation.title)}
            />
          ) : null}
        </AnimatePresence>

        {Viewer && viewerIndex >= 0 && viewerEntries[viewerIndex] ? (
          <Viewer
            entries={viewerEntries}
            index={viewerIndex}
            conversationId={id}
            onIndexChange={stepViewer}
            onClose={() => setLightbox(null)}
          />
        ) : null}
      </motion.section>
    </ChatThemeProvider>
  );
}

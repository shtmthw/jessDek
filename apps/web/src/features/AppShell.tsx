import { useQuery } from '@apollo/client';
import { Settings, SquarePen } from 'lucide-react';
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from 'motion/react';
import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  matchPath,
  useLocation,
  useNavigate,
  type Location,
} from 'react-router';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Kbd } from '@/components/Kbd';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/cn';
import { hasTray } from '@/features/media/trayStore';
import { CONVERSATIONS } from '@/lib/gql';
import {
  COMPOSER_ID,
  SEARCH_ID,
  altKey,
  focusById,
  isDialogOpen,
  isEditable,
  modKey,
} from '@/lib/keys';
import { useIsDesktop, useWindowWidth } from '@/lib/media';
import { easeOut, spring } from '@/lib/motion';
import { ChatView } from './chat/ChatView';
import { ConnectionBanner } from './ConnectionBanner';
import { ConversationList, sortConversations } from './conversations/ConversationList';
import { NewChatDialog } from './conversations/NewChatDialog';
import { useViewer } from './session/ViewerProvider';
import { matchCardPath, usePendingChat } from './card/CardRoute';
import {
  AvatarStudio,
  CardStudio,
  prefetchScreens,
  SettingsPage,
  SignedInCardPage,
} from './card/lazy';

const SWIPE_EDGE_PX = 28;

// Visual-QA pages for every photo and video state and every avatar item. Dev builds only; production drops them.
const DevMedia = import.meta.env.DEV ? lazy(() => import('./chat/media/DevGallery')) : null;
const DevAvatars = import.meta.env.DEV ? lazy(() => import('./avatar/DevAvatars')) : null;
const DevCards = import.meta.env.DEV ? lazy(() => import('./card/DevCards')) : null;
const DevSpecials = import.meta.env.DEV ? lazy(() => import('./avatar/DevSpecials')) : null;

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  const shortcuts: Array<[ReactNode, string]> = [
    [
      <>
        <Kbd>{modKey()}</Kbd>
        <Kbd>K</Kbd>
      </>,
      'New chat',
    ],
    [<Kbd key="slash">/</Kbd>, 'Search chats'],
    [
      <>
        <Kbd>{altKey()}</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
      </>,
      'Switch chats',
    ],
    [<Kbd key="esc">Esc</Kbd>, 'Close chat'],
  ];
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
    >
      <Logo size={52} />
      <h1 className="mt-5 text-xl font-semibold tracking-tight">Pick a conversation</h1>
      <p className="mt-1.5 max-w-xs text-[15px] text-muted-foreground">
        Choose a chat from the list, or start a new one with someone’s username.
      </p>
      <Button onClick={onNewChat} className="mt-6">
        <SquarePen className="size-4" /> New chat
      </Button>
      <dl className="mt-10 grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-2.5 text-left text-sm">
        {shortcuts.map(([keys, label]) => (
          <div key={label} className="contents">
            <dt className="flex justify-end gap-1">{keys}</dt>
            <dd className="text-muted-foreground">{label}</dd>
          </div>
        ))}
      </dl>
    </motion.div>
  );
}

function PaneRoutes({ location, onNewChat }: { location?: Location; onNewChat: () => void }) {
  return (
    // Settings, the studios and card pages load on demand (prefetched when idle; see card/lazy).
    <Suspense fallback={<div className="h-full bg-background" aria-busy />}>
      <Routes location={location}>
        <Route path="/" element={<EmptyState onNewChat={onNewChat} />} />
        <Route path="/c/:id" element={<ChatView />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/avatar" element={<AvatarStudio />} />
        <Route path="/settings/card" element={<CardStudio />} />
        <Route path="/:handle" element={<SignedInCardPage />} />
        {DevMedia ? (
          <Route
            path="/dev/media"
            element={
              <Suspense fallback={null}>
                <DevMedia />
              </Suspense>
            }
          />
        ) : null}
        {DevAvatars ? (
          <Route
            path="/dev/avatars"
            element={
              <Suspense fallback={null}>
                <DevAvatars />
              </Suspense>
            }
          />
        ) : null}
        {DevSpecials ? (
          <Route
            path="/dev/specials"
            element={
              <Suspense fallback={null}>
                <DevSpecials />
              </Suspense>
            }
          />
        ) : null}
        {DevCards ? (
          <Route
            path="/dev/cards"
            element={
              <Suspense fallback={null}>
                <DevCards />
              </Suspense>
            }
          />
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

/**
 * On phones the chat (or settings) slides over the list like a pushed page.
 * Drag from the left edge to peel it back; let go past a third of the way and you're home.
 */
function MobilePane({
  x,
  opacity,
  reduced,
  width,
  location,
  onBack,
  onNewChat,
}: {
  x: MotionValue<number>;
  opacity: MotionValue<number>;
  /** Reduced motion: no sliding, the pane simply crossfades over the list. */
  reduced: boolean;
  width: number;
  location: Location;
  onBack: () => void;
  onNewChat: () => void;
}) {
  const controls = useDragControls();

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > width * 0.33 || info.velocity.x > 500) onBack();
    else animate(x, 0, spring.panel);
  }

  return (
    <motion.main
      className="absolute inset-0 z-20 flex flex-col bg-background shadow-[var(--pane-shadow)]"
      style={{ x, opacity }}
      initial={reduced ? { x: 0, opacity: 0 } : { x: width, opacity: 1 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { x: width }}
      transition={reduced ? { duration: 0.2, ease: easeOut } : spring.panel}
      drag="x"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ left: 0, right: width }}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      onPointerDownCapture={(e) => {
        // React pointer events bubble through portals: a swipe starting in a dialog (or the media
        // viewer) near the left edge must not drag the chat pane underneath.
        if (!e.currentTarget.contains(e.target as Node)) return;
        const target = e.target as HTMLElement;
        if (e.clientX > SWIPE_EDGE_PX || target.closest('a,button') || isEditable(target)) return;
        e.preventDefault(); // a drag from the edge should never start a text selection
        controls.start(e);
      }}
    >
      <PaneRoutes location={location} onNewChat={onNewChat} />
    </motion.main>
  );
}

export function AppShell() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const location = useLocation();
  const desktop = useIsDesktop();
  const width = useWindowWidth();
  const [newChatOpen, setNewChatOpen] = useState(false);
  const chatMatch = matchPath('/c/:id', location.pathname);
  const inPane = Boolean(
    chatMatch ||
    matchPath('/settings/*', location.pathname) ||
    matchCardPath(location.pathname) ||
    (import.meta.env.DEV && matchPath('/dev/*', location.pathname)),
  );
  const openNewChat = () => setNewChatOpen(true);
  usePendingChat();
  useEffect(prefetchScreens, []);
  // Going somewhere else (e.g. Message on someone's card opened from New chat) closes New chat,
  // so it doesn't sit on top of the chat that just opened.
  useEffect(() => setNewChatOpen(false), [location.pathname]);

  // Phone layout: one motion value drives the pane and the list's parallax underneath it.
  const reduced = useReducedMotion() ?? false;
  const paneX = useMotionValue(inPane ? 0 : width);
  const paneOpacity = useMotionValue(1);
  const listX = useTransform(paneX, [0, width], [-width * 0.28, 0]);
  const listDim = useTransform(paneX, [0, width], [1, 0]);
  const aside = useRef<HTMLElement>(null);
  // Hide the list from view and from assistive tech only once the pane fully covers it.
  const coverList = () => {
    const el = aside.current;
    if (!el) return;
    const covered = !desktop && paneX.get() < 1 && paneOpacity.get() > 0.99;
    el.style.visibility = covered ? 'hidden' : '';
    el.inert = covered;
  };
  useMotionValueEvent(paneX, 'change', coverList);
  useMotionValueEvent(paneOpacity, 'change', coverList);
  useLayoutEffect(coverList);
  // After a rotation, a closed pane must sit just off the new right edge.
  const paneOpen = useRef(inPane);
  paneOpen.current = inPane;
  useEffect(() => {
    if (!paneOpen.current) paneX.set(width);
  }, [width, paneX]);

  const { data } = useQuery(CONVERSATIONS, { fetchPolicy: 'cache-first' });
  const conversations = data?.conversations;

  // Global keyboard flow. Shortcuts never fire while you're typing, except the modifier ones.
  const state = useRef({ conversations, chatId: chatMatch?.params.id, navigate });
  state.current = { conversations, chatId: chatMatch?.params.id, navigate };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const { conversations, chatId, navigate } = state.current;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setNewChatOpen(true);
        return;
      }
      if (isDialogOpen()) return;
      const typing = isEditable(e.target);

      if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const list = sortConversations(conversations ?? []);
        if (list.length === 0) return;
        e.preventDefault();
        const index = list.findIndex((c) => c.id === chatId);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const next =
          index === -1
            ? list[step === 1 ? 0 : list.length - 1]
            : list[Math.min(list.length - 1, Math.max(0, index + step))];
        if (next && next.id !== chatId) navigate(`/c/${next.id}`);
        return;
      }
      if (e.key === '/' && !typing && !mod && !e.altKey) {
        e.preventDefault();
        focusById(SEARCH_ID);
        return;
      }
      if (e.key === 'Escape' && chatId) {
        // Esc leaves the chat, unless it would throw away text you're writing.
        if (typing && (e.target as HTMLTextAreaElement).value) return;
        // …or photos and videos you've added but not sent yet.
        if (hasTray(chatId)) return;
        e.preventDefault();
        navigate('/');
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-conversation-id="${chatId}"]`)?.focus(),
        );
        return;
      }
      // Start typing anywhere in a chat and the keystroke lands in the message box.
      if (chatId && !typing && !mod && !e.altKey && e.key.length === 1 && e.key !== ' ') {
        focusById(COMPOSER_ID);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Show the total unread count in the tab title.
  // Muted chats keep their own badge but don't count towards the tab title.
  const unread = conversations?.reduce((sum, c) => sum + (c.muted ? 0 : c.unreadCount), 0) ?? 0;
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Realtime` : 'Realtime';
    return () => {
      document.title = 'Realtime';
    };
  }, [unread]);

  return (
    <div className="relative flex h-dvh w-full overflow-clip bg-background">
      <motion.aside
        ref={aside}
        style={{ x: desktop || reduced ? 0 : listX }}
        className="relative flex w-full shrink-0 flex-col border-border bg-surface md:w-80 md:border-r lg:w-96"
      >
        <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
          <h1 className="text-2xl font-bold tracking-tight">Chats</h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label="New chat"
            title={`New chat (${modKey()} K)`}
            onClick={openNewChat}
            className="-mr-1.5"
          >
            <SquarePen className="size-5" />
          </Button>
        </header>

        <ConversationList onNewChat={openNewChat} />

        <NavLink
          to="/settings"
          title="Settings"
          className={({ isActive }) =>
            cn(
              'mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] mt-1 flex min-h-14 shrink-0 items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
              isActive ? 'bg-muted' : 'hover:bg-muted/70',
            )
          }
        >
          <Avatar name={viewer.displayName} color={viewer.avatarColor} avatar={viewer.avatar} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{viewer.displayName}</span>
            <span className="block truncate text-xs text-muted-foreground">@{viewer.username}</span>
          </span>
          <Settings className="size-[18px] text-muted-foreground" aria-label="Settings" />
        </NavLink>

        {!desktop && !reduced ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-black/10 dark:bg-black/50"
            style={{ opacity: listDim }}
          />
        ) : null}
      </motion.aside>

      {desktop ? (
        <main className="relative flex min-w-0 flex-1 flex-col bg-background">
          <PaneRoutes onNewChat={openNewChat} />
        </main>
      ) : (
        <AnimatePresence
          initial={false}
          onExitComplete={() => {
            paneX.set(width);
            paneOpacity.set(1);
          }}
        >
          {inPane ? (
            <MobilePane
              key="pane"
              x={paneX}
              opacity={paneOpacity}
              reduced={reduced}
              width={width}
              location={location}
              onBack={() => navigate('/')}
              onNewChat={openNewChat}
            />
          ) : null}
        </AnimatePresence>
      )}

      <ConnectionBanner />
      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
    </div>
  );
}

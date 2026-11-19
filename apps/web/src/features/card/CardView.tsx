import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/lib/media';
import { CardAvatar } from './CardAvatar';
import {
  BorderLayer,
  buttonStyle,
  Divider,
  faceMask,
  faceShadow,
  FinishLayer,
  SketchBox,
} from './decor';
import { useCardFont } from './fonts';
import { interestById } from './interests';
import { Pattern } from './patterns';
import { interestKey, type CardRecipe, type Interest } from './recipe';
import { StickerArt, STICKER_BOX } from './stickers';
import { CARD_H, CARD_W, cardTheme, fitSize, PAD, type CardTheme } from './theme';

export interface CardUser {
  username: string;
  displayName: string;
  avatar: string | null;
  avatarColor: string;
}

const INNER = CARD_W - PAD * 2;

/** Section heights (layout px). They add up to CARD_H, so every card lines up the same way. */
const H = { header: 224, divider: 18, interests: 92, about: 110, footer: 60 } as const;
const LABEL_H = 20;

export const interestLabel = (it: Interest) =>
  typeof it === 'string' ? (interestById(it)?.label ?? it) : it.t;
export const interestEmoji = (it: Interest) =>
  typeof it === 'string' ? interestById(it)?.emoji : it.e;

/**
 * Shrinks text until it fits `max` px of height: tries each [font size, line height] in turn.
 * Runs after every render (it's a few reads), so new words, fonts or styles are always measured.
 * When nothing fits, the last step is used and the text is cut with an ellipsis.
 */
function useFitText(
  ref: React.RefObject<HTMLElement | null>,
  steps: ReadonlyArray<readonly [number, number]>,
  max: number,
  onFit?: (fits: boolean) => void,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const s = el.style as CSSStyleDeclaration & { webkitLineClamp: string };
    s.display = '';
    s.webkitLineClamp = '';
    let fits = false;
    let lead = 0;
    for (const [size, height] of steps) {
      s.fontSize = `${size}px`;
      s.lineHeight = `${height}px`;
      lead = height;
      if (el.scrollHeight <= max + 0.5) {
        fits = true;
        break;
      }
    }
    if (!fits) {
      s.display = '-webkit-box';
      s.webkitLineClamp = String(Math.max(1, Math.floor(max / lead)));
    }
    onFit?.(fits);
  });
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

function Name({
  card,
  user,
  theme,
  width,
  align,
}: {
  card: CardRecipe;
  user: CardUser;
  theme: CardTheme;
  width: number;
  align: 'left' | 'center';
}) {
  const f = theme.font;
  const handle = `@${user.username}`;
  const clamp: CSSProperties = { overflowWrap: 'anywhere', textAlign: align };
  if (card.name === 'both') {
    const big = fitSize(user.displayName, width, 22 * f.scale, f, 15 * f.scale);
    return (
      <div style={clamp}>
        <p
          className="line-clamp-2"
          style={{ fontSize: big, lineHeight: 1.12, fontWeight: f.bold, letterSpacing: '-0.01em' }}
        >
          {user.displayName}
        </p>
        <p
          style={{ fontSize: 13 * f.scale, lineHeight: 1.4, opacity: 0.68, fontWeight: f.regular }}
        >
          {handle}
        </p>
      </div>
    );
  }
  const size = fitSize(handle, width, 23 * f.scale, f, 14 * f.scale);
  return (
    <p
      className="line-clamp-2"
      style={{
        ...clamp,
        fontSize: size,
        lineHeight: 1.15,
        fontWeight: f.bold,
        letterSpacing: '-0.01em',
      }}
    >
      {handle}
    </p>
  );
}

function Header({ card, user, theme }: { card: CardRecipe; user: CardUser; theme: CardTheme }) {
  const both = card.name === 'both';
  const cutout = card.frame === 'none';
  const avatar = (size: number, fade = false) => (
    <CardAvatar user={user} card={card} theme={theme} size={size} fade={fade} />
  );
  switch (card.layout) {
    case 'centered':
      return (
        <div
          className="relative flex flex-col items-center"
          style={{ height: H.header, paddingTop: both ? 16 : 22 }}
        >
          {avatar(both ? 140 : 150, true)}
          <div style={{ width: INNER, marginTop: 10 }}>
            <Name card={card} user={user} theme={theme} width={INNER} align="center" />
          </div>
        </div>
      );
    case 'side': {
      const size = cutout ? 156 : 132;
      const nameW = INNER - size - 14;
      return (
        <div
          className="relative flex items-end"
          style={{ height: H.header, paddingInline: PAD, paddingBottom: cutout ? 0 : 26, gap: 14 }}
        >
          <div className="shrink-0">{avatar(size)}</div>
          <div className="min-w-0" style={{ width: nameW, paddingBottom: cutout ? 30 : 8 }}>
            <Name card={card} user={user} theme={theme} width={nameW} align="left" />
          </div>
        </div>
      );
    }
    case 'banner':
      return (
        <div className="relative flex flex-col items-center" style={{ height: H.header }}>
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 overflow-hidden"
            style={{ height: 112, background: theme.accent }}
          >
            <Pattern
              id={card.pattern === 'none' ? 'dots' : card.pattern}
              color={theme.onAccent}
              opacity={0.16}
            />
          </div>
          <div className="relative" style={{ marginTop: both ? 40 : 46 }}>
            {avatar(both ? 124 : 132, true)}
          </div>
          <div style={{ width: INNER, marginTop: 8 }}>
            <Name card={card} user={user} theme={theme} width={INNER} align="center" />
          </div>
        </div>
      );
    default: {
      // Classic, the sketch: the handle top-left, the avatar standing on the first divider.
      const size = cutout ? 178 : both ? 140 : 154;
      return (
        <div className="relative" style={{ height: H.header }}>
          <div className="absolute" style={{ left: PAD, top: 16, width: INNER - 40 }}>
            <Name card={card} user={user} theme={theme} width={INNER - 40} align="left" />
          </div>
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={cutout ? { bottom: 0 } : { bottom: both ? 14 : 18 }}
          >
            {avatar(size)}
          </div>
        </div>
      );
    }
  }
}

function SectionLabel({ children, theme }: { children: ReactNode; theme: CardTheme }) {
  const f = theme.font;
  return (
    <p
      style={{
        fontSize: 10.5 * f.scale,
        lineHeight: '14px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: f.bold,
        opacity: 0.6,
        marginBottom: 6,
      }}
    >
      {children}
    </p>
  );
}

const CHIP_TILT = [-3, 2, -1.5, 3, -2.5, 1.5];

function Interests({ card, theme }: { card: CardRecipe; theme: CardTheme }) {
  const f = theme.font;
  const align = card.align === 'left' ? 'left' : 'center';
  const list = card.interests;
  const inline = card.chips === 'plain';
  const textRef = useRef<HTMLParagraphElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const k = f.scale;
  // Big like the sketch when it's short; smaller when there's a lot to fit.
  useFitText(
    textRef,
    [19, 17, 15.5, 14, 12.5].map((px) => [px * k, Math.round(px * 1.24)] as const),
    H.interests - 4,
  );

  // Chips that would need more than three rows switch to a compact size, two to a row at most.
  const key = `${card.chips}|${card.font}|${list.map(interestKey).join(',')}`;
  const [compactFor, setCompactFor] = useState<string | null>(null);
  const compact = compactFor === key;
  const listMax = H.interests - (card.labels ? LABEL_H : 0);
  // No dependency list on purpose: re-measure after every render (a font finishing loading
  // widens the chips). It sets state at most once per `key`, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && !compact && el.scrollHeight > listMax + 1) setCompactFor(key);
  });

  if (list.length === 0) {
    return (
      <div
        style={{ height: H.interests, textAlign: align }}
        className="flex flex-col justify-center"
      >
        {card.labels && !inline ? <SectionLabel theme={theme}>Interests</SectionLabel> : null}
        <p style={{ fontSize: 14 * k, opacity: 0.5, fontWeight: f.regular }}>
          {card.labels && inline ? <b style={{ fontWeight: f.bold }}>Interests: </b> : null}
          No interests yet
        </p>
      </div>
    );
  }

  if (inline) {
    return (
      <div
        style={{ height: H.interests, textAlign: align }}
        className="flex flex-col justify-center"
      >
        <p
          ref={textRef}
          style={{
            fontWeight: f.regular,
            textWrap: 'balance',
            overflowWrap: 'anywhere',
            overflow: 'hidden',
            WebkitBoxOrient: 'vertical',
          }}
        >
          {card.labels ? <span style={{ fontWeight: f.bold }}>Interests: </span> : null}
          {list.map(interestLabel).join(', ')}
        </p>
      </div>
    );
  }

  const gap = compact ? 4 : 5;
  const chipBase: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: compact ? 3 : 4,
    height: compact ? 21 : 24,
    paddingInline: compact ? 7 : 9,
    fontSize: (compact ? 11.25 : 12.5) * k,
    fontWeight: f.regular + 100,
    whiteSpace: 'nowrap',
    maxWidth: compact ? (INNER - 12) / 2 : INNER,
  };
  const chipStyle = (i: number): CSSProperties => {
    switch (card.chips) {
      case 'pill':
        return { ...chipBase, background: theme.accentWash, borderRadius: 999 };
      case 'outline':
        return { ...chipBase, boxShadow: `inset 0 0 0 1.5px ${theme.ink}`, borderRadius: 999 };
      case 'tag':
        return { ...chipBase, paddingInline: 2, color: theme.accentText, fontWeight: f.bold };
      default:
        return {
          ...chipBase,
          background: '#fff',
          color: '#18181b',
          borderRadius: 7,
          boxShadow: '0 0 0 1.5px #18181b, 0 2px 0 1.5px rgb(0 0 0 / 0.18)',
          transform: `rotate(${CHIP_TILT[i % CHIP_TILT.length]}deg)`,
        };
    }
  };
  return (
    <div style={{ height: H.interests, textAlign: align }} className="flex flex-col justify-center">
      {card.labels ? <SectionLabel theme={theme}>Interests</SectionLabel> : null}
      <ul
        ref={listRef}
        aria-label="Interests"
        className="flex flex-wrap overflow-hidden"
        style={{
          gap: card.chips === 'tag' ? `2px ${compact ? 8 : 10}px` : gap,
          justifyContent: align === 'center' ? 'center' : 'flex-start',
          maxHeight: listMax,
          // Room for the sticker chips' tilt and drop edge.
          padding: card.chips === 'sticker' ? '2px 3px 3px' : undefined,
        }}
      >
        {list.map((it, i) => {
          const emoji = interestEmoji(it);
          const label = interestLabel(it);
          return (
            <li key={interestKey(it)} style={chipStyle(i)}>
              {card.chips === 'tag' ? (
                <span className="truncate">{`#${label.toLowerCase().replace(/\s+/g, '')}`}</span>
              ) : (
                <>
                  {emoji ? <span aria-hidden>{emoji}</span> : null}
                  <span className="truncate">{label}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function About({
  card,
  user,
  theme,
  onFit,
}: {
  card: CardRecipe;
  user: CardUser;
  theme: CardTheme;
  onFit?: (fits: boolean) => void;
}) {
  const f = theme.font;
  const inline = card.chips === 'plain';
  const text = card.about || `Hi, I’m ${user.displayName}! 👋`;
  const ref = useRef<HTMLParagraphElement>(null);
  const heading = card.labels && !inline;
  useFitText(
    ref,
    [1, 0.93, 0.86, 0.8].map(
      (m) => [14.5 * f.scale * m, Math.round(f.leading * m * 10) / 10] as const,
    ),
    H.about - (heading ? LABEL_H : 0) - 2,
    onFit,
  );
  return (
    <div
      style={{ height: H.about, textAlign: card.align === 'left' ? 'left' : 'center' }}
      className="flex flex-col justify-center"
    >
      {heading ? <SectionLabel theme={theme}>About me</SectionLabel> : null}
      <p
        ref={ref}
        style={{
          fontWeight: f.regular,
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textWrap: 'pretty',
        }}
      >
        {card.labels && inline ? <span style={{ fontWeight: f.bold }}>About me: </span> : null}
        {text}
      </p>
    </div>
  );
}

function MessageButton({
  card,
  user,
  theme,
  onMessage,
  busy = false,
}: {
  card: CardRecipe;
  user: CardUser;
  theme: CardTheme;
  onMessage?: () => void;
  /** The chat is opening: the button waits instead of firing twice. */
  busy?: boolean;
}) {
  const f = theme.font;
  const label = `Message @${user.username}`;
  const width = Math.min(INNER, Math.max(176, [...label].length * f.advance * 15 * f.scale + 48));
  const style: CSSProperties = {
    ...buttonStyle(card.button, theme),
    position: 'relative',
    width,
    height: 42,
    fontSize: fitSize(label, width - 32, 15 * f.scale, f, 11 * f.scale),
    fontWeight: f.bold,
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
  };
  const inner = (
    <>
      {card.button === 'sketch' ? <SketchBox width={width} height={42} color={theme.ink} /> : null}
      <span className="relative inline-flex min-w-0 items-center gap-1.5 px-4">
        {busy ? (
          <Loader2
            aria-hidden
            className="shrink-0 animate-spin"
            style={{ width: 14 * f.scale, height: 14 * f.scale }}
          />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
    </>
  );
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: H.footer, paddingBottom: 6 }}
    >
      {onMessage ? (
        <button
          type="button"
          onClick={busy ? undefined : onMessage}
          aria-busy={busy || undefined}
          className={cn(
            'outline-offset-4 transition-[transform,filter,opacity] duration-150 ease-out focus-visible:outline-2',
            busy
              ? 'cursor-progress opacity-75'
              : 'cursor-pointer hover:brightness-[1.06] active:scale-[0.97]',
          )}
          style={{ ...style, outlineColor: theme.accentText }}
        >
          {inner}
        </button>
      ) : (
        <span aria-hidden style={style}>
          {inner}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------------------------

/** One sticker placed on the card (layout px; the parent is the 320 × 540 layout box). */
export function PlacedSticker({
  sticker,
  className,
}: {
  sticker: CardRecipe['stickers'][number];
  className?: string;
}) {
  const size = STICKER_BOX * sticker.s;
  return (
    <StickerArt
      sticker={sticker}
      className={cn('pointer-events-none absolute', className)}
      style={{
        left: sticker.x * CARD_W - size / 2,
        top: sticker.y * CARD_H - size / 2,
        width: size,
        height: size,
        transform: `rotate(${sticker.r}deg)`,
      }}
    />
  );
}

/** The card face at its layout size (320 × 540). `CardView` scales it. */
export const CardFace = memo(function CardFace({
  card,
  user,
  onMessage,
  messaging,
  hideStickers,
  onAboutFit,
}: {
  card: CardRecipe;
  user: CardUser;
  onMessage?: () => void;
  messaging?: boolean;
  hideStickers?: boolean;
  onAboutFit?: (fits: boolean) => void;
}) {
  const theme = cardTheme(card);
  useCardFont(card.font);
  const f = theme.font;
  const tone = card.patternTone;
  const patternColor = tone === 'white' ? '#ffffff' : tone === 'accent' ? theme.accent : theme.ink;
  const patternOpacity =
    tone === 'soft' ? 0.07 : tone === 'bold' ? 0.16 : tone === 'white' ? 0.5 : 0.3;
  const divider = (seed: number) => (
    <div style={{ paddingInline: PAD, height: H.divider }}>
      <Divider kind={card.divider} width={INNER} theme={theme} seed={seed} />
    </div>
  );

  return (
    <div className="relative" style={{ width: CARD_W, height: CARD_H }}>
      <article
        aria-label={`${user.displayName}’s card`}
        className="absolute inset-0 overflow-hidden"
        style={{
          borderRadius: theme.radius,
          background: theme.bg.css,
          color: theme.ink,
          fontFamily: f.family,
          boxShadow: faceShadow(card.border, theme),
          ...faceMask(card.border),
        }}
      >
        {card.pattern !== 'none' ? (
          <Pattern id={card.pattern} color={patternColor} opacity={patternOpacity} />
        ) : null}
        <div className="relative flex flex-col" style={{ height: CARD_H }}>
          <Header card={card} user={user} theme={theme} />
          {divider(3)}
          <div style={{ paddingInline: PAD }}>
            <Interests card={card} theme={theme} />
          </div>
          {divider(5)}
          <div style={{ paddingInline: PAD }}>
            <About card={card} user={user} theme={theme} onFit={onAboutFit} />
          </div>
          {divider(8)}
          <MessageButton
            card={card}
            user={user}
            theme={theme}
            onMessage={onMessage}
            busy={messaging}
          />
        </div>
        <FinishLayer kind={card.finish} theme={theme} />
        <BorderLayer kind={card.border} theme={theme} width={CARD_W} height={CARD_H} />
      </article>
      {hideStickers
        ? null
        : card.stickers.map((s, i) => <PlacedSticker key={`${i}:${s.k ?? s.e}`} sticker={s} />)}
    </div>
  );
});

/** Measures the width it's given, so the card can be scaled to fill it. */
function useWidth<T extends HTMLElement>(fixed?: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fixed ?? 0);
  useLayoutEffect(() => {
    if (fixed !== undefined) {
      setWidth(fixed);
      return;
    }
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixed]);
  return [ref, width] as const;
}

const MAX_TILT = 9;

/**
 * A card, scaled to `width` (or to fill its container's width) with the layout unchanged.
 * `tilt` makes it lean towards the pointer, with gloss and foil following.
 */
export function CardView({
  card,
  user,
  width,
  onMessage,
  messaging = false,
  tilt = false,
  shadow = true,
  className,
  style,
  hideStickers,
  onAboutFit,
  children,
}: {
  card: CardRecipe;
  user: CardUser;
  /** Rendered width in px. Leave out to fill the container's width. */
  width?: number;
  /** Makes the card's "Message @name" button work (the only Message button a card gets). Without
   * it the button is just drawn. */
  onMessage?: () => void;
  /** The chat is opening: the Message button shows it's busy. */
  messaging?: boolean;
  tilt?: boolean;
  /** A soft drop shadow under the card. */
  shadow?: boolean;
  className?: string;
  style?: CSSProperties;
  hideStickers?: boolean;
  /** Told after each render whether the about text fits (false: it's cut with an ellipsis). */
  onAboutFit?: (fits: boolean) => void;
  /** Drawn over the card in layout px (the studio's sticker editor); a function gets the scale. */
  children?: ReactNode | ((scale: number) => ReactNode);
}) {
  const [ref, measured] = useWidth<HTMLDivElement>(width);
  const scale = measured / CARD_W;
  const reduced = useReducedMotion() ?? false;
  // Tilt follows a mouse. On touch screens the card stays flat: a finger on it should scroll the
  // page or drag the sheet, and a 3D-turned layer renders soft on phones.
  const hover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const canTilt = tilt && !reduced && hover;
  const shiny = card.finish === 'gloss' || card.finish === 'holo' || card.border === 'foil';

  // Pointer position over the card, 0–1. Springs give the lean a little weight.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 220, damping: 22, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 220, damping: 22, mass: 0.6 });
  const rotateY = useTransform(sx, [0, 1], [-MAX_TILT, MAX_TILT]);
  const rotateX = useTransform(sy, [0, 1], [MAX_TILT, -MAX_TILT]);
  const mx = useTransform(sx, (v) => `${(v * 100).toFixed(1)}%`);
  const my = useTransform(sy, (v) => `${(v * 100).toFixed(1)}%`);
  const shine = useMotionTemplate`${mx}`;
  const shineY = useMotionTemplate`${my}`;

  // Measured on the wrapper, which never moves. Measuring the tilting card itself fed its own
  // rotation back into the next reading, so it wobbled and the text shimmered.
  const track = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canTilt || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    py.set(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  const settle = () => {
    animate(px, 0.5, { type: 'spring', visualDuration: 0.5, bounce: 0.3 });
    animate(py, 0.5, { type: 'spring', visualDuration: 0.5, bounce: 0.3 });
  };

  return (
    <div
      ref={ref}
      className={cn('relative', width === undefined && 'w-full', className)}
      style={{
        width,
        height: measured ? measured * (CARD_H / CARD_W) : undefined,
        aspectRatio: measured ? undefined : `${CARD_W} / ${CARD_H}`,
        perspective: canTilt ? 900 : undefined,
        // The shadow sits on the wrapper: a filter on the tilting layer would repaint it each frame.
        filter: shadow
          ? 'drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.12)) drop-shadow(0 10px 18px rgb(0 0 0 / 0.16))'
          : undefined,
        ...style,
      }}
      onPointerMove={canTilt ? track : undefined}
      onPointerLeave={canTilt ? settle : undefined}
    >
      {measured > 0 ? (
        <motion.div
          className="absolute inset-0"
          style={
            canTilt
              ? ({
                  rotateX,
                  rotateY,
                  // Its own GPU layer: the card is drawn once and turned, so text stays still
                  // instead of being redrawn at a slightly different position every frame.
                  willChange: 'transform',
                  backfaceVisibility: 'hidden',
                  // Only finishes that follow the light need the pointer position.
                  ...(shiny ? { '--mx': shine, '--my': shineY } : null),
                } as object)
              : undefined
          }
        >
          <div
            style={{
              width: CARD_W,
              height: CARD_H,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
            <div className="relative" style={{ width: CARD_W, height: CARD_H }}>
              <CardFace
                card={card}
                user={user}
                onMessage={onMessage}
                messaging={messaging}
                hideStickers={hideStickers}
                onAboutFit={onAboutFit}
              />
              {typeof children === 'function' ? children(scale) : children}
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

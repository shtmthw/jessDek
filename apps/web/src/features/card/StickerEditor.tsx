import { RotateCw, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/lib/media';
import { STICKER_SCALE, tidySticker, type Sticker } from './recipe';
import { StickerArt, STICKER_BOX, STICKERS } from './stickers';
import { CARD_H, CARD_W } from './theme';

/**
 * Stickers on the studio preview, editable: drag to move, the corner handle to resize and turn
 * in one motion, two fingers to pinch and twist, and the keyboard for all of it. Lives inside the
 * card's scaled layout box, so positions are layout px; `scale` converts from screen px.
 *
 * During a gesture the sticker is drawn from local state and committed once at the end, so the
 * card underneath doesn't re-render on every frame and a drag is one undo step.
 */

type Pt = { x: number; y: number };

type Gesture =
  | { kind: 'move'; index: number; origin: Sticker; start: Pt; moved: boolean }
  | { kind: 'turn'; index: number; origin: Sticker; center: Pt; v0: Pt }
  | {
      kind: 'pinch';
      index: number;
      origin: Sticker;
      ids: [number, number];
      d0: number;
      a0: number;
      mid0: Pt;
    };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clampScale = (s: number) => Math.min(STICKER_SCALE.max, Math.max(STICKER_SCALE.min, s));
const deg = (rad: number) => (rad * 180) / Math.PI;

/** Rotation lands exactly on 0/45/90… when you're within a few degrees of it. */
function snapAngle(r: number) {
  const nearest = Math.round(r / 45) * 45;
  return Math.abs(r - nearest) < 4 ? nearest : r;
}

export const stickerLabel = (s: Pick<Sticker, 'k' | 'e'>) =>
  s.k !== undefined ? `${STICKERS[s.k]?.label ?? 'Sticker'} sticker` : `${s.e} sticker`;

export function StickerEditor({
  stickers,
  scale,
  selected,
  onSelect,
  onChange,
  onRemove,
  onFront,
}: {
  stickers: Sticker[];
  scale: number;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Commit a sticker's new placement. `merge` folds quick repeats into one undo step. */
  onChange: (index: number, sticker: Sticker, merge?: string) => void;
  onRemove: (index: number) => void;
  /** Move a sticker to the top of the pile. */
  onFront: (index: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture | null>(null);
  const [live, setLive] = useState<{ index: number; sticker: Sticker } | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  // Keyboard focus follows the selection when a sticker moves in the pile (a tap brings it to
  // the top, so it's at a new index).
  useEffect(() => {
    const el = root.current;
    const active = document.activeElement as HTMLElement | null;
    if (selected === null || !el || !active || !el.contains(active)) return;
    if (active.dataset.sticker !== undefined && active.dataset.sticker !== String(selected)) {
      el.querySelector<HTMLElement>(`[data-sticker="${selected}"]`)?.focus({ preventScroll: true });
    }
  }, [selected, stickers]);

  const current = (i: number) => (live?.index === i ? live.sticker : stickers[i]!);

  /** A sticker's centre in client px. */
  function centerOf(s: Sticker): Pt {
    const r = root.current!.getBoundingClientRect();
    return { x: r.left + s.x * r.width, y: r.top + s.y * r.height };
  }

  function startPinch(index: number) {
    const [a, b] = [...pointers.current.entries()];
    if (!a || !b) return;
    const origin = current(index);
    gesture.current = {
      kind: 'pinch',
      index,
      origin,
      ids: [a[0], b[0]],
      d0: Math.max(1, Math.hypot(b[1].x - a[1].x, b[1].y - a[1].y)),
      a0: Math.atan2(b[1].y - a[1].y, b[1].x - a[1].x),
      mid0: { x: (a[1].x + b[1].x) / 2, y: (a[1].y + b[1].y) / 2 },
    };
  }

  function commit() {
    const g = gesture.current;
    const l = liveRef.current;
    gesture.current = null;
    if (g && l && l.index === g.index) onChange(g.index, tidySticker(l.sticker));
    setLive(null);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-remove]')) return; // a plain click
    const el = root.current!;
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const g = gesture.current;
    if (pointers.current.size === 2 && g && g.kind !== 'pinch') {
      startPinch(g.index);
      return;
    }
    if (pointers.current.size > 1) return;

    const handle = target.closest<HTMLElement>('[data-handle]');
    const hit = target.closest<HTMLElement>('[data-sticker]');
    if (handle && selected !== null && stickers[selected]) {
      const origin = current(selected);
      const center = centerOf(origin);
      gesture.current = {
        kind: 'turn',
        index: selected,
        origin,
        center,
        v0: { x: e.clientX - center.x, y: e.clientY - center.y },
      };
    } else if (hit) {
      const index = Number(hit.dataset.sticker);
      onSelect(index);
      gesture.current = {
        kind: 'move',
        index,
        origin: current(index),
        start: { x: e.clientX, y: e.clientY },
        moved: false,
      };
    } else {
      onSelect(null);
      gesture.current = null;
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const o = g.origin;
    let next: Sticker;
    if (g.kind === 'move') {
      const dx = e.clientX - g.start.x;
      const dy = e.clientY - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      next = { ...o, x: clamp01(o.x + dx / scale / CARD_W), y: clamp01(o.y + dy / scale / CARD_H) };
    } else if (g.kind === 'turn') {
      const v = { x: e.clientX - g.center.x, y: e.clientY - g.center.y };
      const ratio = Math.hypot(v.x, v.y) / Math.max(1, Math.hypot(g.v0.x, g.v0.y));
      const turn = deg(Math.atan2(v.y, v.x) - Math.atan2(g.v0.y, g.v0.x));
      next = { ...o, s: clampScale(o.s * ratio), r: snapAngle(o.r + turn) };
    } else {
      const a = pointers.current.get(g.ids[0]);
      const b = pointers.current.get(g.ids[1]);
      if (!a || !b) return;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      next = {
        ...o,
        s: clampScale((o.s * d) / g.d0),
        r: snapAngle(o.r + deg(angle - g.a0)),
        x: clamp01(o.x + (mid.x - g.mid0.x) / scale / CARD_W),
        y: clamp01(o.y + (mid.y - g.mid0.y) / scale / CARD_H),
      };
    }
    setLive({ index: g.index, sticker: next });
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      // Lifting either finger ends the pinch; the other one doesn't start a drag.
      if (g.ids.includes(e.pointerId)) commit();
      return;
    }
    if (pointers.current.size > 0) return;
    if (g.kind === 'move' && !g.moved) {
      gesture.current = null;
      setLive(null);
      // A tap brings a sticker to the top of the pile.
      if (g.index !== stickers.length - 1) onFront(g.index);
      return;
    }
    commit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>, i: number) {
    const s = stickers[i]!;
    const step = e.shiftKey ? 0.05 : 0.01;
    let next: Sticker | null = null;
    let merge = `nudge:${i}`;
    switch (e.key) {
      case 'ArrowLeft':
        next = { ...s, x: clamp01(s.x - step) };
        break;
      case 'ArrowRight':
        next = { ...s, x: clamp01(s.x + step) };
        break;
      case 'ArrowUp':
        next = { ...s, y: clamp01(s.y - step) };
        break;
      case 'ArrowDown':
        next = { ...s, y: clamp01(s.y + step) };
        break;
      case '+':
      case '=':
        next = { ...s, s: clampScale(s.s + 0.1) };
        merge = `size:${i}`;
        break;
      case '-':
      case '_':
        next = { ...s, s: clampScale(s.s - 0.1) };
        merge = `size:${i}`;
        break;
      case '[':
      case '{':
        next = { ...s, r: s.r - (e.shiftKey ? 5 : 15) };
        merge = `turn:${i}`;
        break;
      case ']':
      case '}':
        next = { ...s, r: s.r + (e.shiftKey ? 5 : 15) };
        merge = `turn:${i}`;
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        onRemove(i);
        return;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onSelect(null);
        (e.currentTarget as HTMLElement).blur();
        return;
      default:
        return;
    }
    e.preventDefault();
    onChange(i, tidySticker(next), merge);
  }

  // Handle size in screen px whatever the card's scale: finger-sized on touch screens.
  const coarse = useMediaQuery('(pointer: coarse)');
  const chrome = (coarse ? 34 : 26) / scale;
  const sel = selected !== null && stickers[selected] ? current(selected) : null;
  const box = (s: Sticker) => {
    const size = STICKER_BOX * s.s;
    return {
      left: s.x * CARD_W - size / 2,
      top: s.y * CARD_H - size / 2,
      width: size,
      height: size,
      transform: `rotate(${s.r}deg)`,
    };
  };

  return (
    <div
      ref={root}
      className="absolute inset-0 touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    >
      {stickers.map((_, i) => {
        const s = current(i);
        return (
          <div
            key={i}
            role="button"
            tabIndex={0}
            data-sticker={i}
            aria-label={`${stickerLabel(s)}, ${i + 1} of ${stickers.length}`}
            aria-pressed={selected === i}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - [ ] Delete"
            onFocus={() => onSelect(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'absolute rounded-full outline-none',
              live?.index === i ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={box(s)}
          >
            <StickerArt sticker={s} className="pointer-events-none size-full" />
          </div>
        );
      })}

      {sel && selected !== null ? (
        <div aria-hidden={false} className="pointer-events-none absolute" style={box(sel)}>
          <div
            className="absolute rounded-full border-dashed border-brand-text"
            style={{ inset: -4 / scale, borderWidth: 1.75 / scale }}
          />
          <button
            type="button"
            data-remove
            aria-label={`Remove ${stickerLabel(sel)}`}
            title="Remove"
            onClick={() => onRemove(selected)}
            className="pointer-events-auto absolute inline-flex items-center justify-center rounded-full bg-foreground text-background shadow-md transition-transform hover:scale-110"
            style={{ width: chrome, height: chrome, right: -chrome / 2, top: -chrome / 2 }}
          >
            <X style={{ width: chrome * 0.55, height: chrome * 0.55 }} strokeWidth={2.75} />
          </button>
          <div
            data-handle
            aria-hidden
            title="Drag to resize and turn"
            className="pointer-events-auto absolute inline-flex cursor-nwse-resize items-center justify-center rounded-full bg-brand text-brand-foreground shadow-md"
            style={{ width: chrome, height: chrome, right: -chrome / 2, bottom: -chrome / 2 }}
          >
            <RotateCw style={{ width: chrome * 0.52, height: chrome * 0.52 }} strokeWidth={2.75} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useSyncExternalStore } from 'react';

/**
 * Notification sounds, synthesised with Web Audio so they stay tiny and match the app's quiet tone.
 * One family, four voices:
 *  - dm:            a light two-note pip rising a fifth
 *  - group:         its softer sibling: same shape, a fourth lower, rounder tone
 *  - newChat:       someone started a chat with you: a bright three-note rise
 *  - addedToGroup:  you were added to a group: a small chord that blooms
 */
export type SoundKind = 'dm' | 'group' | 'newChat' | 'addedToGroup';

interface Note {
  /** Frequency in Hz. */
  f: number;
  /** Start offset in seconds. */
  at: number;
  /** Ring time in seconds. */
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

const SOUNDS: Record<SoundKind, Note[]> = {
  dm: [
    { f: 880, at: 0, dur: 0.14 },
    { f: 1318.5, at: 0.075, dur: 0.22 },
  ],
  group: [
    { f: 659.25, at: 0, dur: 0.14, type: 'triangle', gain: 0.9 },
    { f: 987.77, at: 0.075, dur: 0.24, type: 'triangle', gain: 0.9 },
  ],
  newChat: [
    { f: 1046.5, at: 0, dur: 0.16 },
    { f: 1318.5, at: 0.09, dur: 0.16 },
    { f: 1568, at: 0.18, dur: 0.34 },
  ],
  addedToGroup: [
    { f: 587.33, at: 0, dur: 0.55, type: 'triangle', gain: 0.55 },
    { f: 739.99, at: 0.05, dur: 0.55, type: 'triangle', gain: 0.55 },
    { f: 880, at: 0.1, dur: 0.55, type: 'triangle', gain: 0.55 },
    { f: 1174.66, at: 0.16, dur: 0.6, gain: 0.5 },
  ],
};

const MASTER_GAIN = 0.13;
/** Bursts (several messages at once) make one sound, not a drumroll. */
const REPEAT_GAP_MS = { dm: 700, group: 700, newChat: 400, addedToGroup: 400 } as const;

// ---- Preference -------------------------------------------------------------------------------

const KEY = 'sounds';
const listeners = new Set<() => void>();

export function soundsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: the choice lasts for this session only */
  }
  listeners.forEach((l) => l());
}

export function useSoundsEnabled(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    soundsEnabled,
    () => true,
  );
  return [on, setSoundsEnabled];
}

// ---- Playback ---------------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let output: AudioNode | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    // A gentle low-pass keeps the tones soft on laptop speakers.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5200;
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(filter).connect(ctx.destination);
    output = master;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Browsers only allow audio after a user gesture: wake the context on the first one. */
export function primeAudio() {
  if (typeof window === 'undefined') return;
  const wake = () => {
    void audio()
      ?.resume()
      .catch(() => undefined);
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
}

const lastPlayed = new Map<SoundKind, number>();

/** Plays a sound. `force` ignores the user's preference and the repeat gap (for previews). */
export function playSound(kind: SoundKind, { force = false } = {}) {
  if (!force && !soundsEnabled()) return;
  const now = Date.now();
  if (!force && now - (lastPlayed.get(kind) ?? 0) < REPEAT_GAP_MS[kind]) return;
  const ac = audio();
  if (!ac || !output) return;
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
  lastPlayed.set(kind, now);

  const t0 = ac.currentTime + 0.01;
  for (const note of SOUNDS[kind]) {
    const start = t0 + note.at;
    const end = start + note.dur;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(note.gain ?? 1, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(output);

    const osc = ac.createOscillator();
    osc.type = note.type ?? 'sine';
    osc.frequency.setValueAtTime(note.f, start);
    osc.connect(env);
    osc.start(start);
    osc.stop(end + 0.02);

    // A faint octave overtone gives sine notes a little bell-like body.
    if (osc.type === 'sine') {
      const shimmer = ac.createGain();
      shimmer.gain.value = 0.12;
      shimmer.connect(env);
      const over = ac.createOscillator();
      over.frequency.setValueAtTime(note.f * 2, start);
      over.connect(shimmer);
      over.start(start);
      over.stop(end + 0.02);
    }
  }
}

// ---- Own actions --------------------------------------------------------------------------------

let ownUntil = 0;

/**
 * Call just before *you* create a chat or group: the server announces it to every member,
 * including you, and you shouldn't get a "someone added you" chime for your own action.
 */
export function expectOwnConversation() {
  ownUntil = Date.now() + 6000;
}

export const isOwnConversationExpected = () => Date.now() < ownUntil;

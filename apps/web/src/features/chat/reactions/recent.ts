/** Emojis you reacted with lately, newest first, for the top of the picker. Kept on this device. */
const KEY = 'emoji:recent';
const MAX = 18;

export function getRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((e): e is string => typeof e === 'string').slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(emoji: string) {
  const next = [emoji, ...getRecent().filter((e) => e !== emoji)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the picker just won't remember */
  }
}

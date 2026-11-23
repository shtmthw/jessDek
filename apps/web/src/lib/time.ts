const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days between `d` and `now` (0 = today, 1 = yesterday). */
export const daysAgo = (d: Date, now = new Date()) =>
  Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY);

/*
 * One formatter per style, made once. `toLocaleTimeString(…, options)` builds a new Intl formatter on
 * every call, and the message list formats every message's time on each render: hundreds of calls.
 */
const format = (options: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat(undefined, options);
  return (d: Date) => f.format(d);
};
// `numeric` hours: "9:05 AM" rather than "09:05 AM" (24-hour locales still pad, as they expect).
const clock = format({ hour: 'numeric', minute: '2-digit' });
const weekday = format({ weekday: 'short' });
const monthDay = format({ month: 'short', day: 'numeric' });
const dayLabel = format({ weekday: 'short', month: 'short', day: 'numeric' });
const dayLabelYear = format({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/** "9:05 AM" or "14:05" (by locale) for messages. */
export const formatClock = (iso: string) => clock(new Date(iso));

/** Compact label for the conversation list: time today, "Yesterday", weekday, then date. */
export function formatListTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = daysAgo(d, now);
  if (days <= 0) return clock(d);
  if (days === 1) return 'Yesterday';
  if (days < 7) return weekday(d);
  return monthDay(d);
}

/** Separator label between days inside a chat. */
export function formatDayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = daysAgo(d, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.getFullYear() === now.getFullYear() ? dayLabel(d) : dayLabelYear(d);
}

/** "5 min ago" style text for presence. */
export function formatLastSeen(iso: string, now = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Last seen just now';
  if (min < 60) return `Last seen ${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24 && daysAgo(new Date(iso), now) === 0) return `Last seen ${hours} hr ago`;
  const days = daysAgo(new Date(iso), now);
  if (days === 1) return `Last seen yesterday`;
  return `Last seen ${monthDay(new Date(iso))}`;
}

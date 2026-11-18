/** True when a keystroke belongs to a text field rather than to a global shortcut. */
export function isEditable(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color'].includes(el.type);
  }
  return false;
}

export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "⌘" on Apple keyboards, "Ctrl" everywhere else. */
export const modKey = () => (isMac() ? '⌘' : 'Ctrl');
export const altKey = () => (isMac() ? '⌥' : 'Alt');

export const isDialogOpen = () => document.querySelector('[role="dialog"]') !== null;

export const COMPOSER_ID = 'composer';
export const SEARCH_ID = 'chat-search';

export function focusById(id: string) {
  const el = document.getElementById(id);
  if (el instanceof HTMLElement) {
    el.focus({ preventScroll: true });
    return true;
  }
  return false;
}

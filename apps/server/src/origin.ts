import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/** The browser sends Origin on WebSocket upgrades; it must match the host being served. */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Refuses an HTTP upgrade before any WebSocket is created. */
export function deny(socket: Duplex): void {
  socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
  socket.destroy();
}

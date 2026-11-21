/**
 * This tab's identity for device-to-device transfers, sent in the graphql-ws connectionParams.
 * Built from getRandomValues rather than crypto.randomUUID, which needs a secure context and would
 * break plain-HTTP LAN deployments.
 */
export function uuidv4(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let current = uuidv4();

export const getPeerId = () => current;

/**
 * A fresh id after sign-out: the server binds a peer id to one user, so the next person to sign
 * in from this tab must not inherit the old one.
 */
export function rotatePeerId(): void {
  current = uuidv4();
}

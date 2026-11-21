/**
 * Things to wipe when someone signs out. Lives apart from apollo.ts so features that import the
 * Apollo client (photos and videos do) can register here without an import cycle.
 */
type Hook = () => void | Promise<void>;
const hooks = new Set<Hook>();

export function onSignOut(fn: Hook): () => void {
  hooks.add(fn);
  return () => hooks.delete(fn);
}

export async function runSignOutHooks(): Promise<void> {
  await Promise.allSettled([...hooks].map(async (fn) => fn()));
}

import type { TypedDocumentNode } from '@apollo/client';
import { print } from 'graphql';
import { wsClient } from '@/lib/apollo';
import { SEND_SIGNAL, type SignalType } from '@/lib/gql';

export class WsRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'WsRequestError';
  }
}

/**
 * Runs one GraphQL operation over the existing WebSocket. Media mutations must go this way: the
 * server ties them to this socket's peer id, and refuses them over plain HTTP.
 */
export function wsRequest<D, V extends Record<string, unknown>>(
  doc: TypedDocumentNode<D, V>,
  variables: V,
  timeoutMs = 10_000,
): Promise<D> {
  return new Promise<D>((resolve, reject) => {
    let result: {
      data?: D | null;
      errors?: readonly { message: string; extensions?: Record<string, unknown> }[];
    } | null = null;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      dispose();
      finish(() => reject(new WsRequestError('The connection timed out', 'TIMEOUT')));
    }, timeoutMs);
    const dispose = wsClient.subscribe<D>(
      { query: print(doc), variables },
      {
        next: (r) => {
          result = r as typeof result;
        },
        error: (err) =>
          finish(() => {
            const first = Array.isArray(err)
              ? (err[0] as { message?: string; extensions?: { code?: string } } | undefined)
              : undefined;
            reject(
              new WsRequestError(
                first?.message ?? (err instanceof Error ? err.message : 'The connection dropped'),
                first?.extensions?.code ?? 'NETWORK',
              ),
            );
          }),
        complete: () =>
          finish(() => {
            const first = result?.errors?.[0];
            if (first)
              reject(
                new WsRequestError(first.message, first.extensions?.code as string | undefined),
              );
            else if (result?.data) resolve(result.data);
            else reject(new WsRequestError('No response', 'NETWORK'));
          }),
      },
    );
  });
}

/** Sends one WebRTC / relay signal to a device taking part in a live request. */
export function signal(
  requestId: string,
  toPeerId: string,
  type: Exclude<SignalType, 'RELAY'>,
  payload: unknown,
): Promise<boolean> {
  return wsRequest(SEND_SIGNAL, {
    input: { requestId, toPeerId, type, payload: JSON.stringify(payload) },
  }).then((d) => d.sendSignal);
}

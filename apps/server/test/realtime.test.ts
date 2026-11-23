import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { createClient, type Client as WsClient } from 'graphql-ws';
import { WebSocket } from 'ws';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { relayTimeouts } from '../src/relay.js';
import {
  Client,
  RESPOND_TO_INVITE,
  connect,
  groupWith,
  newApp,
  resetDb,
  settle,
  signUp,
  types,
  until,
} from './helpers.js';

let app: FastifyInstance;
let port: number;
const sockets: WsClient[] = [];

beforeAll(async () => {
  app = await newApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  port = (app.server.address() as AddressInfo).port;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);
afterEach(async () => {
  await Promise.all(sockets.splice(0).map((s) => s.dispose()));
  // The server finishes its per-socket cleanup (presence updates hit the DB) a moment after the
  // client closes; let it land before the next test, or before afterAll disconnects Prisma.
  await new Promise((r) => setTimeout(r, 150));
});

const EVENTS = `subscription { events {
  __typename
  ... on MessageAdded { conversationId message { body sender { username } } }
  ... on TypingStarted { conversationId user { username } }
  ... on PresenceChanged { userId online }
  ... on ConversationUpdated { conversationId conversation { title unreadCount theme themeSetBy { username } memberColors { color } } }
  ... on MediaRequested { requestId conversationId attachmentId part sha256 fromUserId fromPeerId }
  ... on MediaSignal { requestId type payload fromUserId fromPeerId }
  ... on UserUpdated { user { username displayName avatarColor avatar } }
  ... on ReactionChanged { conversationId message { id reactions { emoji user { username } } } }
  ... on InviteChanged { conversationId invite { name invitedBy { username } members { username } } }
  ... on RequestAnswered { conversationId kind groupName user { username } accepted }
} }`;

/** Opens a subscription as the given (signed-in) client and collects what arrives. */
function listen(cookie: string, peerId?: string) {
  class CookieSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols, { headers: { cookie } });
    }
  }
  const events: any[] = [];
  const errors: unknown[] = [];
  const client = createClient({
    url: `ws://127.0.0.1:${port}/graphql`,
    webSocketImpl: CookieSocket,
    retryAttempts: 0,
    connectionParams: peerId ? { peerId } : undefined,
  });
  sockets.push(client);
  client.subscribe(
    { query: EVENTS },
    {
      next: (r) => events.push(r.data!.events),
      error: (e) => errors.push(e),
      complete: () => undefined,
    },
  );
  /** Runs one mutation over this same WebSocket (media calls need a live connection). */
  const request = (query: string, variables: Record<string, unknown> = {}) =>
    new Promise<{
      data?: any;
      errors?: Array<{ message: string; extensions?: { code?: string } }>;
    }>((resolve, reject) => {
      let result: any = {};
      client.subscribe(
        { query, variables },
        {
          next: (r) => (result = r),
          error: (e) => (Array.isArray(e) ? resolve({ errors: e }) : reject(e)),
          complete: () => resolve(result),
        },
      );
    });
  return { events, errors, request };
}

async function setup() {
  const [a, b, eve] = [new Client(app), new Client(app), new Client(app)];
  await signUp(a, 'alice');
  await signUp(b, 'bob');
  await signUp(eve, 'eve');
  // Alice and Bob are chat partners (Alice's request, Bob accepted); Eve is a stranger to both.
  const dm = await connect(a, b);
  return { a, b, eve, dm };
}

describe('realtime events', () => {
  it('delivers new messages to members instantly, including the sender’s other tabs', async () => {
    const { a, b, dm } = await setup();
    const bob = listen(b.cookie);
    const aliceTab = listen(a.cookie);
    await settle();

    await a.gql(`mutation($c: ID!) { sendMessage(conversationId: $c, body: "hello bob") { id } }`, {
      c: dm.id,
    });

    await until(() => bob.events.some((e) => e.__typename === 'MessageAdded'));
    const received = bob.events.find((e) => e.__typename === 'MessageAdded');
    expect(received).toMatchObject({
      conversationId: dm.id,
      message: { body: 'hello bob', sender: { username: 'alice' } },
    });
    await until(() => aliceTab.events.some((e) => e.__typename === 'MessageAdded'));
  });

  it('never leaks conversations to non-members', async () => {
    const { a, eve, dm } = await setup();
    const spy = listen(eve.cookie);
    await settle();

    await a.gql(`mutation($c: ID!) { sendMessage(conversationId: $c, body: "private") { id } }`, {
      c: dm.id,
    });
    await a.gql(`mutation($c: ID!) { setTyping(conversationId: $c) }`, { c: dm.id });
    await settle(600);

    expect(
      spy.events.filter((e) => e.__typename === 'MessageAdded' || e.__typename === 'TypingStarted'),
    ).toEqual([]);
  });

  it('streams typing indicators to the other members only', async () => {
    const { a, b, dm } = await setup();
    const bob = listen(b.cookie);
    const alice = listen(a.cookie);
    await settle();

    await a.gql(`mutation($c: ID!) { setTyping(conversationId: $c) }`, { c: dm.id });
    await until(() => bob.events.some((e) => e.__typename === 'TypingStarted'));
    expect(bob.events.find((e) => e.__typename === 'TypingStarted')).toMatchObject({
      user: { username: 'alice' },
    });
    await settle();
    expect(alice.events.some((e) => e.__typename === 'TypingStarted')).toBe(false);
  });

  it('tells someone about a group invite (resolved from their point of view), then the group once they join', async () => {
    const { a, b, eve } = await setup();
    const alice = listen(a.cookie);
    const bob = listen(b.cookie);
    const spy = listen(eve.cookie);
    await settle();

    const g = (await a.gql(`mutation { createGroup(name: "Trip", usernames: ["bob"]) { id } }`))
      .data!.createGroup;
    // Bob learns of the invite, with just enough to decide: the name, the inviter, who's in.
    await until(() => types(bob, 'InviteChanged').length === 1);
    expect(types(bob, 'InviteChanged')[0]).toMatchObject({
      conversationId: g.id,
      invite: { name: 'Trip', invitedBy: { username: 'alice' }, members: [{ username: 'alice' }] },
    });
    // The group isn't his yet: no chat-list update, nothing said in it.
    await settle();
    expect(types(bob, 'ConversationUpdated')).toEqual([]);

    await b.gql(RESPOND_TO_INVITE, { c: g.id, accept: true });
    // The invite is gone for him, the group is his, and Alice is told he joined.
    await until(() => types(bob, 'InviteChanged').length === 2);
    expect(types(bob, 'InviteChanged')[1].invite).toBeNull();
    await until(() =>
      bob.events.some(
        (e) => e.__typename === 'ConversationUpdated' && e.conversation?.title === 'Trip',
      ),
    );
    await until(() => types(alice, 'RequestAnswered').length === 1);
    expect(types(alice, 'RequestAnswered')[0]).toEqual({
      __typename: 'RequestAnswered',
      conversationId: g.id,
      kind: 'GROUP',
      groupName: 'Trip',
      user: { username: 'bob' },
      accepted: true,
    });
    await settle();
    expect(spy.events).toEqual([]);
  });

  it('tracks presence for people you share a conversation with', async () => {
    const { a, b } = await setup();
    const alice = listen(a.cookie);
    await settle();

    const bobId = (await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } })).id;
    const bob = listen(b.cookie);
    await until(() =>
      alice.events.some(
        (e) => e.__typename === 'PresenceChanged' && e.userId === bobId && e.online,
      ),
    );
    expect(
      (await a.gql(`{ conversations { peer { online } } }`)).data!.conversations[0].peer.online,
    ).toBe(true);

    await sockets[sockets.length - 1]!.dispose();
    await until(() =>
      alice.events.some(
        (e) => e.__typename === 'PresenceChanged' && e.userId === bobId && !e.online,
      ),
    );
    expect(bob.errors).toEqual([]);
  });

  it('tells the user’s tabs and people in shared chats about a new avatar or name, nobody else', async () => {
    const { a, b, eve } = await setup();
    const aliceTab = listen(a.cookie);
    const bob = listen(b.cookie);
    const spy = listen(eve.cookie);
    await settle();

    const avatar = JSON.stringify({ v: 1, style: 'character', hair: 'afro' });
    await a.gql(`mutation($i: UpdateAvatarInput!) { updateAvatar(input: $i) { id } }`, {
      i: { avatarColor: '#ec4899', avatar },
    });
    const expected = { username: 'alice', avatarColor: '#ec4899', avatar };
    await until(() => types(bob, 'UserUpdated').length === 1);
    await until(() => types(aliceTab, 'UserUpdated').length === 1);
    expect(types(bob, 'UserUpdated')[0].user).toMatchObject(expected);
    expect(types(aliceTab, 'UserUpdated')[0].user).toMatchObject(expected);

    await a.gql(
      `mutation { updateProfile(input: { displayName: "Ali", avatarColor: "#ec4899" }) { id } }`,
    );
    await until(() => types(bob, 'UserUpdated').length === 2);
    expect(types(bob, 'UserUpdated')[1].user.displayName).toBe('Ali');

    await settle();
    expect(types(spy, 'UserUpdated')).toEqual([]);
  });

  it('sends reaction changes to every member, and chat-list updates to the reactor and author only', async () => {
    const { a, b, eve } = await setup();
    const carol = new Client(app);
    await signUp(carol, 'carol');
    const g = await groupWith(a, 'Trip', [b, carol]);
    const msg = (
      await a.gql(`mutation($c: ID!) { sendMessage(conversationId: $c, body: "7pm?") { id } }`, {
        c: g.id,
      })
    ).data!.sendMessage;
    const alice = listen(a.cookie);
    const bob = listen(b.cookie);
    const carolTab = listen(carol.cookie);
    const spy = listen(eve.cookie);
    await settle();

    await b.gql(`mutation($m: ID!) { react(messageId: $m, emoji: "👍") { id } }`, { m: msg.id });
    for (const peer of [alice, bob, carolTab])
      await until(() => types(peer, 'ReactionChanged').length === 1);
    expect(types(carolTab, 'ReactionChanged')[0]).toEqual({
      __typename: 'ReactionChanged',
      conversationId: g.id,
      message: { id: msg.id, reactions: [{ emoji: '👍', user: { username: 'bob' } }] },
    });
    // The chat-list line can only change for bob (reactor) and alice (author).
    await until(() => types(alice, 'ConversationUpdated').length === 1);
    await until(() => types(bob, 'ConversationUpdated').length === 1);

    // Setting the same emoji again changes nothing and sends nothing.
    await b.gql(`mutation($m: ID!) { react(messageId: $m, emoji: "👍") { id } }`, { m: msg.id });
    await settle();
    expect(types(alice, 'ReactionChanged')).toHaveLength(1);
    expect(types(carolTab, 'ConversationUpdated')).toEqual([]);
    expect(spy.events).toEqual([]);
  });

  it('tells every member of a chat about a new theme or member colour, and nobody else', async () => {
    const { a, b, eve } = await setup();
    const g = await groupWith(a, 'Trip', [b]);
    const alice = listen(a.cookie);
    const bob = listen(b.cookie);
    const spy = listen(eve.cookie);
    await settle();

    await a.gql(
      `mutation($c: ID!, $t: String) { setChatTheme(conversationId: $c, theme: $t) { id } }`,
      {
        c: g.id,
        t: JSON.stringify({ v: 1, preset: 'space' }),
      },
    );
    for (const peer of [alice, bob])
      await until(() => types(peer, 'ConversationUpdated').length === 1);
    const update = types(bob, 'ConversationUpdated')[0];
    expect(JSON.parse(update.conversation.theme).preset).toBe('space');
    expect(update.conversation.themeSetBy.username).toBe('alice');

    await b.gql(`mutation($c: ID!) { setMemberColor(conversationId: $c, color: "rose") { id } }`, {
      c: g.id,
    });
    await until(() => types(alice, 'ConversationUpdated').length === 2);
    expect(types(alice, 'ConversationUpdated')[1].conversation.memberColors).toEqual([
      { color: 'rose' },
    ]);
    await settle();
    expect(spy.events).toEqual([]);
  });

  it('refuses unauthenticated sockets', async () => {
    const { errors } = listen('');
    await until(() => errors.length > 0);
  });

  it('rejects cross-origin WebSocket upgrades', async () => {
    const { a } = await setup();
    const result = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/graphql`, 'graphql-transport-ws', {
        headers: { cookie: a.cookie, origin: 'https://evil.example' },
      });
      ws.on('unexpected-response', (_req, res) => resolve(`status ${res.statusCode}`));
      ws.on('open', () => resolve('open'));
      ws.on('error', () => undefined);
    });
    expect(result).toBe('status 403');
  });
});

describe('media signaling', () => {
  const REQUEST_MEDIA = `mutation($a: ID!, $p: MediaPart!) { requestMedia(attachmentId: $a, part: $p) { requestId candidates } }`;
  const SEND_SIGNAL = `mutation($i: SignalInput!) { sendSignal(input: $i) }`;
  const SEND_PHOTO = `mutation($c: ID!, $a: [AttachmentInput!]) { sendMessage(conversationId: $c, body: "", attachments: $a) { attachments { id sha256 } } }`;
  const SHA = 'd'.repeat(64);
  const photo = {
    kind: 'IMAGE',
    mimeType: 'image/webp',
    name: 'p.webp',
    size: 1000,
    width: 100,
    height: 100,
    sha256: SHA,
  };

  async function sendPhoto(client: Client, conversationId: string) {
    const res = await client.gql(SEND_PHOTO, { c: conversationId, a: [photo] });
    return res.data!.sendMessage.attachments[0] as { id: string; sha256: string };
  }
  const signal = (
    from: ReturnType<typeof listen>,
    requestId: string,
    toPeerId: string,
    type: string,
    payload = '{}',
  ) => from.request(SEND_SIGNAL, { i: { requestId, toPeerId, type, payload } });

  it('fans out to other members’ online devices only', async () => {
    const { a, b, eve, dm } = await setup();
    const [pa, pb1, pb2, pe] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const a1 = listen(a.cookie, pa);
    const b1 = listen(b.cookie, pb1);
    const b2 = listen(b.cookie, pb2);
    const e1 = listen(eve.cookie, pe);
    await settle();

    const att = await sendPhoto(a, dm.id);
    const res = await b1.request(REQUEST_MEDIA, { a: att.id, p: 'FILE' });
    expect(res.errors).toBeUndefined();
    expect(res.data!.requestMedia.candidates).toBe(2);

    await until(
      () => types(a1, 'MediaRequested').length > 0 && types(b2, 'MediaRequested').length > 0,
    );
    const bobId = (await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } })).id;
    for (const holder of [a1, b2]) {
      expect(types(holder, 'MediaRequested')).toEqual([
        {
          __typename: 'MediaRequested',
          requestId: res.data!.requestMedia.requestId,
          conversationId: dm.id,
          attachmentId: att.id,
          part: 'FILE',
          sha256: SHA,
          fromUserId: bobId,
          fromPeerId: pb1,
        },
      ]);
    }
    await settle();
    expect(types(b1, 'MediaRequested')).toEqual([]);
    expect(types(e1, 'MediaRequested')).toEqual([]);
  });

  it('does not let non-members request media', async () => {
    const { a, eve, dm } = await setup();
    const e1 = listen(eve.cookie, randomUUID());
    await settle();
    const att = await sendPhoto(a, dm.id);
    const res = await e1.request(REQUEST_MEDIA, { a: att.id, p: 'FILE' });
    expect(res.errors![0]!.extensions!.code).toBe('NOT_FOUND');
    // An id that doesn't exist looks exactly the same.
    const missing = await e1.request(REQUEST_MEDIA, { a: 'nope', p: 'FILE' });
    expect(missing.errors![0]).toMatchObject({
      message: res.errors![0]!.message,
      extensions: { code: 'NOT_FOUND' },
    });
  });

  it('passes signals only inside the request, stamped by the server', async () => {
    const { a, b, eve, dm } = await setup();
    const [pa, pb, pe] = [randomUUID(), randomUUID(), randomUUID()];
    const a1 = listen(a.cookie, pa);
    const b1 = listen(b.cookie, pb);
    const e1 = listen(eve.cookie, pe);
    await settle();
    const att = await sendPhoto(a, dm.id);
    const { requestId } = (await b1.request(REQUEST_MEDIA, { a: att.id, p: 'FILE' })).data!
      .requestMedia;
    await until(() => types(a1, 'MediaRequested').length > 0);
    const aliceId = (await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } })).id;

    const have = await signal(a1, requestId, pb, 'HAVE', '{"relayOnly":false}');
    expect(have.data!.sendSignal).toBe(true);
    await until(() => types(b1, 'MediaSignal').length > 0);
    expect(types(b1, 'MediaSignal')[0]).toEqual({
      __typename: 'MediaSignal',
      requestId,
      type: 'HAVE',
      payload: '{"relayOnly":false}',
      fromUserId: aliceId,
      fromPeerId: pa,
    });

    const code = (r: Awaited<ReturnType<typeof a1.request>>) => r.errors?.[0]?.extensions?.code;
    // A stranger, even with the right request id.
    expect(code(await signal(e1, requestId, pb, 'ICE'))).toBe('FORBIDDEN');
    // Wrong direction for the type: only the requester sends OFFER, only holders send HAVE / ANSWER.
    expect(code(await signal(a1, requestId, pb, 'OFFER'))).toBe('FORBIDDEN');
    expect(code(await signal(b1, requestId, pa, 'HAVE'))).toBe('FORBIDDEN');
    // Never to a peer that isn't part of the request.
    expect(code(await signal(a1, requestId, pe, 'ICE'))).toBe('FORBIDDEN');
    // Both directions of the allowed ones work.
    expect((await signal(b1, requestId, pa, 'OFFER')).data!.sendSignal).toBe(true);
    expect((await signal(a1, requestId, pb, 'ICE')).data!.sendSignal).toBe(true);
    // Size and type limits. RELAY is server-only.
    expect(code(await signal(a1, requestId, pb, 'ICE', 'x'.repeat(16 * 1024 + 1)))).toBe(
      'BAD_USER_INPUT',
    );
    expect((await signal(a1, requestId, pb, 'ICE', 'x'.repeat(16 * 1024))).data!.sendSignal).toBe(
      true,
    );
    expect(code(await signal(a1, requestId, pb, 'RELAY'))).toBe('BAD_USER_INPUT');
    expect(code(await signal(a1, randomUUID(), pb, 'HAVE'))).toBe('FORBIDDEN');
  });

  it('expires requests after two minutes', async () => {
    const { a, b, dm } = await setup();
    const [pa, pb] = [randomUUID(), randomUUID()];
    const a1 = listen(a.cookie, pa);
    const b1 = listen(b.cookie, pb);
    await settle();
    const att = await sendPhoto(a, dm.id);
    const { requestId } = (await b1.request(REQUEST_MEDIA, { a: att.id, p: 'FILE' })).data!
      .requestMedia;

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.advanceTimersByTime(119_000);
      expect((await signal(a1, requestId, pb, 'HAVE')).data!.sendSignal).toBe(true);
      vi.advanceTimersByTime(2_000);
      const late = await signal(a1, requestId, pb, 'HAVE');
      expect(late.errors![0]!.extensions!.code).toBe('FORBIDDEN');
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a socket that claims another user’s peer id', async () => {
    const { a, b, eve, dm } = await setup();
    const pa = randomUUID();
    const a1 = listen(a.cookie, pa);
    await settle();
    const hijack = listen(eve.cookie, pa);
    await until(() => hijack.errors.length > 0);
    expect(hijack.errors[0]).toMatchObject({ code: 4403 });

    // The real owner still holds it.
    const b1 = listen(b.cookie, randomUUID());
    await settle();
    const att = await sendPhoto(a, dm.id);
    expect(
      (await b1.request(REQUEST_MEDIA, { a: att.id, p: 'FILE' })).data!.requestMedia.candidates,
    ).toBe(1);
    await until(() => types(a1, 'MediaRequested').length > 0);
  });

  it('cancels live requests when someone leaves the group', async () => {
    const { a, b, eve } = await setup();
    const group = await groupWith(a, 'Trip', [b, eve]);
    const [pa, pb, pe] = [randomUUID(), randomUUID(), randomUUID()];
    const a1 = listen(a.cookie, pa);
    const b1 = listen(b.cookie, pb);
    const e1 = listen(eve.cookie, pe);
    await settle();
    const att = await sendPhoto(a, group.id);
    const { requestId } = (await b1.request(REQUEST_MEDIA, { a: att.id, p: 'FILE' })).data!
      .requestMedia;
    await until(
      () => types(a1, 'MediaRequested').length > 0 && types(e1, 'MediaRequested').length > 0,
    );

    // A holder who leaves can no longer answer…
    await eve.gql(`mutation($c: ID!) { leaveGroup(conversationId: $c) }`, { c: group.id });
    expect((await signal(e1, requestId, pb, 'HAVE')).errors![0]!.extensions!.code).toBe(
      'FORBIDDEN',
    );
    expect((await signal(a1, requestId, pb, 'HAVE')).data!.sendSignal).toBe(true);

    // …and when the requester leaves, the whole request is gone.
    await b.gql(`mutation($c: ID!) { leaveGroup(conversationId: $c) }`, { c: group.id });
    expect((await signal(a1, requestId, pb, 'HAVE')).errors![0]!.extensions!.code).toBe(
      'FORBIDDEN',
    );
  });

  it('needs a live connection, not plain HTTP', async () => {
    const { a, dm } = await setup();
    const att = await sendPhoto(a, dm.id);
    const res = await a.gql(REQUEST_MEDIA, { a: att.id, p: 'FILE' });
    expect(res.errors![0]).toMatchObject({
      message: expect.stringContaining('need a live connection'),
      extensions: { code: 'BAD_USER_INPUT' },
    });
    // A socket without a peer id can't use media either.
    const plain = listen(a.cookie);
    await settle();
    expect(
      (await plain.request(REQUEST_MEDIA, { a: att.id, p: 'FILE' })).errors![0]!.extensions!.code,
    ).toBe('BAD_USER_INPUT');
  });
});

describe('media relay', () => {
  const REQUEST_MEDIA = `mutation($a: ID!) { requestMedia(attachmentId: $a, part: FILE) { requestId candidates } }`;
  const OPEN_RELAY = `mutation($r: ID!, $h: ID!, $k: String) { openRelay(requestId: $r, holderPeerId: $h, key: $k) }`;
  const SEND_PHOTO = `mutation($c: ID!, $a: [AttachmentInput!]) { sendMessage(conversationId: $c, body: "", attachments: $a) { attachments { id } } }`;
  const raw: WebSocket[] = [];
  afterEach(() => raw.splice(0).forEach((w) => w.terminate()));

  /** Alice's tab holds a photo of `size` bytes; Bob's tab asked for it. */
  async function live(size = 200_000) {
    const { a, b, eve, dm } = await setup();
    const [pa, pb] = [randomUUID(), randomUUID()];
    const holder = listen(a.cookie, pa);
    const requester = listen(b.cookie, pb);
    await settle();
    const photo = {
      kind: 'IMAGE',
      mimeType: 'image/webp',
      name: 'p.webp',
      size,
      width: 10,
      height: 10,
      sha256: 'e'.repeat(64),
    };
    const att = (await a.gql(SEND_PHOTO, { c: dm.id, a: [photo] })).data!.sendMessage
      .attachments[0];
    const { requestId } = (await requester.request(REQUEST_MEDIA, { a: att.id })).data!
      .requestMedia;
    return { a, b, eve, pa, pb, holder, requester, requestId };
  }

  function joinRelay(cookie: string, relayId: string, peer: string) {
    return new Promise<{
      ws?: WebSocket;
      status?: number;
      messages: { data: Buffer; binary: boolean }[];
      closed: Promise<number>;
    }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/media-relay?relay=${relayId}&peer=${peer}`, {
        headers: { cookie },
      });
      raw.push(ws);
      const messages: { data: Buffer; binary: boolean }[] = [];
      const closed = new Promise<number>((done) => ws.on('close', (code) => done(code)));
      ws.on('message', (data, binary) => messages.push({ data: data as Buffer, binary }));
      ws.on('open', () => resolve({ ws, messages, closed }));
      ws.on('unexpected-response', (_req, res) =>
        resolve({ status: res.statusCode, messages, closed }),
      );
      ws.on('error', () => undefined);
    });
  }

  it('pipes bytes and control frames between exactly the two devices', async () => {
    const { a, b, pa, pb, holder, requester, requestId } = await live();
    const res = await requester.request(OPEN_RELAY, { r: requestId, h: pa, k: '' });
    expect(res.errors).toBeUndefined();
    const relayId = res.data!.openRelay as string;
    await until(() => types(holder, 'MediaSignal').length > 0);
    expect(types(holder, 'MediaSignal')[0]).toMatchObject({
      type: 'RELAY',
      requestId,
      fromPeerId: pb,
      payload: JSON.stringify({ relayId, key: '' }),
    });

    const h = await joinRelay(a.cookie, relayId, pa);
    const r = await joinRelay(b.cookie, relayId, pb);
    r.ws!.send('{"t":"get"}');
    await until(() => h.messages.length === 1);
    expect(h.messages[0]).toMatchObject({ binary: false });
    expect(h.messages[0]!.data.toString()).toBe('{"t":"get"}');

    const chunks = [0, 1, 2].map((i) => Buffer.alloc(65_536, i + 1));
    for (const c of chunks) h.ws!.send(c);
    h.ws!.send('{"t":"done"}');
    await until(() => r.messages.length === 4);
    expect(Buffer.concat(r.messages.slice(0, 3).map((m) => m.data))).toEqual(Buffer.concat(chunks));
    expect(r.messages.slice(0, 3).every((m) => m.binary)).toBe(true);
    expect(r.messages[3]!.data.toString()).toBe('{"t":"done"}');

    // Either side hanging up ends it for both.
    r.ws!.close(1000);
    expect(await h.closed).toBe(1000);
  });

  it('refuses anyone but the two devices it was opened for', async () => {
    const { a, b, eve, pa, requester, requestId } = await live();
    const relayId = (await requester.request(OPEN_RELAY, { r: requestId, h: pa, k: '' })).data!
      .openRelay;
    const pb2 = randomUUID();
    listen(b.cookie, pb2); // Bob's other tab
    await settle();
    expect((await joinRelay(b.cookie, relayId, pb2)).status).toBe(403);
    expect((await joinRelay(eve.cookie, relayId, pa)).status).toBe(403); // someone else's peer id
    expect((await joinRelay(b.cookie, relayId, pa)).status).toBe(403); // a peer id that isn't yours
    expect((await joinRelay('', relayId, pa)).status).toBe(403);
    expect((await joinRelay(a.cookie, randomUUID(), pa)).status).toBe(403);
    expect((await joinRelay(a.cookie, relayId, pa)).ws).toBeDefined();
    expect((await joinRelay(a.cookie, relayId, pa)).status).toBe(403); // that slot is taken
  });

  it('only lets the requester open a relay, to a holder that was asked', async () => {
    const { pa, pb, holder, requester, requestId } = await live();
    const code = (r: Awaited<ReturnType<typeof holder.request>>) => r.errors?.[0]?.extensions?.code;
    expect(code(await holder.request(OPEN_RELAY, { r: requestId, h: pb, k: '' }))).toBe(
      'FORBIDDEN',
    );
    expect(
      code(await requester.request(OPEN_RELAY, { r: requestId, h: randomUUID(), k: '' })),
    ).toBe('FORBIDDEN');
    expect(code(await requester.request(OPEN_RELAY, { r: requestId, h: pa, k: 'short' }))).toBe(
      'BAD_USER_INPUT',
    );
    expect(
      code(await requester.request(OPEN_RELAY, { r: requestId, h: pa, k: 'A'.repeat(43) })),
    ).toBeUndefined();
  });

  it('closes with 4413 when the holder sends more than the file', async () => {
    const { a, b, pa, pb, requester, requestId } = await live(1000);
    const relayId = (await requester.request(OPEN_RELAY, { r: requestId, h: pa, k: '' })).data!
      .openRelay;
    const h = await joinRelay(a.cookie, relayId, pa);
    const r = await joinRelay(b.cookie, relayId, pb);
    h.ws!.send(Buffer.alloc(40_000));
    h.ws!.send(Buffer.alloc(40_000));
    expect(await h.closed).toBe(4413);
    expect(await r.closed).toBe(4413);
  });

  it('closes with 4408 when the other side never joins', async () => {
    relayTimeouts.joinMs = 300;
    const { a, pa, requester, requestId } = await live();
    const relayId = (await requester.request(OPEN_RELAY, { r: requestId, h: pa, k: '' })).data!
      .openRelay;
    const h = await joinRelay(a.cookie, relayId, pa);
    expect(await h.closed).toBe(4408);
  });

  it('can be turned off', async () => {
    const { a, pa, requester, requestId } = await live();
    const relayId = (await requester.request(OPEN_RELAY, { r: requestId, h: pa, k: '' })).data!
      .openRelay;
    config.media.relay = false;
    try {
      const res = await requester.request(OPEN_RELAY, { r: requestId, h: pa, k: '' });
      expect(res.errors![0]!.extensions!.code).toBe('FORBIDDEN');
      expect((await joinRelay(a.cookie, relayId, pa)).status).toBe(403);
    } finally {
      config.media.relay = true;
    }
  });
});

describe('blocks in realtime', () => {
  it('stops typing and presence crossing a block, and keeps media off direct links', async () => {
    const { a, b, eve } = await setup();
    const group = await groupWith(a, 'Trip', [b, eve]);
    const ids = Object.fromEntries((await prisma.user.findMany()).map((u) => [u.username, u.id]));
    const [pa, pb, pe] = [randomUUID(), randomUUID(), randomUUID()];
    const alice = listen(a.cookie, pa);
    const bob = listen(b.cookie, pb);
    const evesTab = listen(eve.cookie, pe);
    await settle();

    await a.gql(`mutation($u: ID!) { blockUser(userId: $u) { id } }`, { u: ids.bob });
    // Bob is told Alice is "offline", with no last-seen time.
    await until(() =>
      bob.events.some(
        (e) => e.__typename === 'PresenceChanged' && e.userId === ids.alice && !e.online,
      ),
    );

    await a.gql(`mutation($c: ID!) { setTyping(conversationId: $c) }`, { c: group.id });
    await until(() => evesTab.events.some((e) => e.__typename === 'TypingStarted'));
    await settle();
    expect(bob.events.some((e) => e.__typename === 'TypingStarted')).toBe(false);

    // Bob's request for Alice's photo is only offered to Eve's device, never Alice's.
    const att = (
      await a.gql(
        `mutation($c: ID!, $a: [AttachmentInput!]) { sendMessage(conversationId: $c, body: "", attachments: $a) { attachments { id } } }`,
        {
          c: group.id,
          a: [
            {
              kind: 'IMAGE',
              mimeType: 'image/webp',
              name: 'p.webp',
              size: 10,
              width: 1,
              height: 1,
              sha256: 'f'.repeat(64),
            },
          ],
        },
      )
    ).data!.sendMessage.attachments[0];
    const res = await bob.request(
      `mutation($a: ID!) { requestMedia(attachmentId: $a, part: FILE) { candidates } }`,
      { a: att.id },
    );
    expect(res.data!.requestMedia.candidates).toBe(1);
    await settle();
    expect(alice.events.some((e) => e.__typename === 'MediaRequested')).toBe(false);
    await until(() => evesTab.events.some((e) => e.__typename === 'MediaRequested'));
  });
});

import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { createClient, type Client as WsClient } from 'graphql-ws';
import { WebSocket } from 'ws';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { requestLimiter } from '../src/services/conversations.js';
import {
  Client,
  RESPOND_TO_INVITE,
  RESPOND_TO_REQUEST,
  connect,
  groupWith,
  newApp,
  resetDb,
  settle,
  signUp,
  types,
  until,
  type GqlResult,
} from './helpers.js';

/**
 * Message requests (a new direct chat: one text message until the other person accepts) and group
 * invites (nobody is added to a group until they join). See REQUESTS_PLAN.md.
 */

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
  // The server finishes its per-socket cleanup a moment after the client closes (see realtime.test).
  await new Promise((r) => setTimeout(r, 150));
});

// ---- helpers ----------------------------------------------------------------------------------

const START = `mutation($u: String!) { startDirect(username: $u) { id title canMessage unreadCount request { state sentByMe sentAt respondedAt } } }`;
const SEND = `mutation($c: ID!, $b: String!) { sendMessage(conversationId: $c, body: $b) { id body } }`;
const SEND_REPLY = `mutation($c: ID!, $b: String!, $r: ID) { sendMessage(conversationId: $c, body: $b, replyToId: $r) { id } }`;
const SEND_PHOTO = `mutation($c: ID!, $b: String!, $a: [AttachmentInput!]) { sendMessage(conversationId: $c, body: $b, attachments: $a) { id } }`;
const LIST = `{ conversations { id title canMessage unreadCount lastMessage { body } request { state sentByMe sentAt respondedAt } } }`;
const ONE = `query($c: ID!) { conversation(id: $c) { id title canMessage request { state sentByMe sentAt respondedAt } } }`;
const MESSAGES = `query($c: ID!) { messages(conversationId: $c) { messages { body } } }`;
const REACT = `mutation($m: ID!, $e: String) { react(messageId: $m, emoji: $e) { id } }`;
const TYPING = `mutation($c: ID!) { setTyping(conversationId: $c) }`;
const THEME = `mutation($c: ID!, $t: String) { setChatTheme(conversationId: $c, theme: $t) { id } }`;
const HIDE = `mutation($c: ID!) { hideConversation(conversationId: $c) }`;
const BLOCK = `mutation($u: ID!) { blockUser(userId: $u) { id } }`;
const UNBLOCK = `mutation($u: ID!) { unblockUser(userId: $u) }`;
const MARK_READ = `mutation($c: ID!) { markRead(conversationId: $c) { id } }`;

const CREATE = `mutation($n: String!, $u: [String!]!) { createGroup(name: $n, usernames: $u) { id members { username } invites { state user { username } invitedBy { username } respondedAt } } }`;
const ADD = `mutation($c: ID!, $u: [String!]!) { addMembers(conversationId: $c, usernames: $u) { id members { username } invites { state user { username } invitedBy { username } } } }`;
const CANCEL = `mutation($c: ID!, $u: ID!) { cancelInvite(conversationId: $c, userId: $u) { id invites { state user { username } } } }`;
const GROUP = `query($c: ID!) { conversation(id: $c) { id members { username } invites { state user { username } invitedBy { username } respondedAt } } }`;
const INVITES = `{ invites { id conversationId name invitedBy { username } members { username } createdAt } }`;
const LEAVE = `mutation($c: ID!) { leaveGroup(conversationId: $c) }`;

const code = (r: GqlResult) => r.errors?.[0]?.extensions?.code;
const message = (r: GqlResult) => r.errors?.[0]?.message;
const ok = <T extends GqlResult>(r: T): T => {
  expect(r.errors, JSON.stringify(r.errors)).toBeUndefined();
  return r;
};

/** Signs up `alice`, `bob`… with their first names as display names ("Bob declined…"). */
async function people<N extends string>(...names: N[]): Promise<Record<N, Client>> {
  const out = {} as Record<N, Client>;
  for (const name of names) {
    const client = new Client(app);
    await signUp(client, name, { displayName: name[0]!.toUpperCase() + name.slice(1) });
    out[name] = client;
  }
  return out;
}

/** `n` usernames for people who only need to exist. */
const crowd = (n: number) =>
  Array.from({ length: n }, (_, i) => `person${String(i).padStart(2, '0')}`);

const idOf = async (username: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

/** The id of the oldest message in a chat. */
async function firstMessageId(client: Client, conversationId: string) {
  const res = ok(
    await client.gql(`query($c: ID!) { messages(conversationId: $c) { messages { id } } }`, {
      c: conversationId,
    }),
  );
  return res.data!.messages.messages[0].id as string;
}

/** Alice has started a chat with Bob and sent her one message. Bob hasn't answered. */
async function requested(text = 'hi, it’s Alice') {
  const p = await people('alice', 'bob');
  const chat = ok(await p.alice.gql(START, { u: 'bob' })).data!.startDirect as { id: string };
  ok(await p.alice.gql(SEND, { c: chat.id, b: text }));
  return { ...p, chat };
}

/** A (signed-in) client's `events` subscription over a real socket, collecting what arrives. */
function listen(client: Client) {
  const { cookie } = client;
  class CookieSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols, { headers: { cookie } });
    }
  }
  const events: any[] = [];
  const ws = createClient({
    url: `ws://127.0.0.1:${port}/graphql`,
    webSocketImpl: CookieSocket,
    retryAttempts: 0,
  });
  sockets.push(ws);
  ws.subscribe(
    {
      query: `subscription { events {
        __typename
        ... on MessageAdded { conversationId message { body } }
        ... on TypingStarted { conversationId }
        ... on PresenceChanged { userId online }
        ... on ConversationUpdated { conversationId conversation { id request { state sentByMe } invites { state user { username } } } }
        ... on UserUpdated { user { username } }
        ... on ReactionChanged { conversationId }
        ... on InviteChanged { conversationId invite { name invitedBy { username } members { username } } }
        ... on RequestAnswered { conversationId kind groupName user { username } accepted }
      } }`,
    },
    { next: (r) => events.push(r.data!.events), error: () => undefined, complete: () => undefined },
  );
  return { events };
}

// ---- message requests -------------------------------------------------------------------------

describe('starting a direct chat', () => {
  it('makes a request that only the person who started it can see, until they send their message', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const started = ok(await alice.gql(START, { u: 'bob' })).data!.startDirect;
    expect(started.request).toEqual({
      state: 'PENDING',
      sentByMe: true,
      sentAt: null,
      respondedAt: null,
    });
    expect(started.canMessage).toBe(false); // the composer is the request composer, not a chat's

    // Alice's list has it; nobody else's does (there's nothing for Bob to look at yet).
    expect((await alice.gql(LIST)).data!.conversations).toHaveLength(1);
    expect((await bob.gql(LIST)).data!.conversations).toEqual([]);
    expect((await bob.gql(ONE, { c: started.id })).data!.conversation).toBeNull();
    // Bob can't write into it before there is a request to answer, either.
    expect(code(await bob.gql(SEND, { c: started.id, b: 'hello?' }))).toBe('FORBIDDEN');
    expect(await prisma.message.count()).toBe(0);
  });

  it('shows it to the other person once the one message is sent, as a request they can answer', async () => {
    const { alice, bob, chat } = await requested('hi, it’s Alice');

    const mine = (await alice.gql(LIST)).data!.conversations[0];
    expect(mine).toMatchObject({
      title: 'Bob',
      canMessage: false,
      lastMessage: { body: 'hi, it’s Alice' },
      request: { state: 'PENDING', sentByMe: true },
    });
    expect(Date.parse(mine.request.sentAt)).toBeGreaterThan(0);

    const theirs = (await bob.gql(LIST)).data!.conversations;
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({
      id: chat.id,
      title: 'Alice',
      canMessage: false,
      unreadCount: 1,
      lastMessage: { body: 'hi, it’s Alice' },
      request: { state: 'PENDING', sentByMe: false },
    });
    expect((await bob.gql(MESSAGES, { c: chat.id })).data!.messages.messages).toEqual([
      { body: 'hi, it’s Alice' },
    ]);
  });

  it('keeps a request away from everyone else', async () => {
    const { chat } = await requested();
    const { eve } = await people('eve');
    expect((await eve.gql(LIST)).data!.conversations).toEqual([]);
    expect((await eve.gql(ONE, { c: chat.id })).data!.conversation).toBeNull();
    for (const res of [
      await eve.gql(MESSAGES, { c: chat.id }),
      await eve.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }),
      await eve.gql(MARK_READ, { c: chat.id }),
    ])
      expect(code(res)).toBe('NOT_FOUND');
  });
});

describe('the one message', () => {
  it('allows exactly one, and says so after that', async () => {
    const { alice, chat } = await requested();
    const second = await alice.gql(SEND, { c: chat.id, b: 'also…' });
    expect(code(second)).toBe('FORBIDDEN');
    expect(message(second)).toBe('You can send one message until Bob accepts');
    expect(await prisma.message.count()).toBe(1);
  });

  it('lets only one of several sends at once through', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const chat = ok(await alice.gql(START, { u: 'bob' })).data!.startDirect;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => alice.gql(SEND, { c: chat.id, b: `message ${i}` })),
    );
    expect(results.filter((r) => !r.errors)).toHaveLength(1);
    for (const r of results.filter((r) => r.errors)) expect(code(r)).toBe('FORBIDDEN');
    expect(await prisma.message.count()).toBe(1);
    expect((await bob.gql(LIST)).data!.conversations[0].lastMessage.body).toMatch(/^message \d$/);
  });

  it('is text only: no photos, videos or replies, and a failed try uses nothing up', async () => {
    const { alice, bob, carol } = await people('alice', 'bob', 'carol');
    // A message from another (ordinary) chat, for the reply to point at.
    const elsewhere = await connect(alice, carol, 'a message to reply to');
    const replyTo = await firstMessageId(alice, elsewhere.id);

    const chat = ok(await alice.gql(START, { u: 'bob' })).data!.startDirect;
    const photo = {
      kind: 'IMAGE',
      mimeType: 'image/webp',
      name: 'p.webp',
      size: 1000,
      width: 10,
      height: 10,
      sha256: 'a'.repeat(64),
    };
    const withPhoto = await alice.gql(SEND_PHOTO, { c: chat.id, b: 'look', a: [photo] });
    expect(code(withPhoto)).toBe('BAD_USER_INPUT');
    expect(message(withPhoto)).toBe('Photos and videos can wait until Bob accepts');
    expect(code(await alice.gql(SEND_PHOTO, { c: chat.id, b: '', a: [photo] }))).toBe(
      'BAD_USER_INPUT',
    );
    const asReply = await alice.gql(SEND_REPLY, { c: chat.id, b: 'hi', r: replyTo });
    expect(code(asReply)).toBe('BAD_USER_INPUT');
    expect(message(asReply)).toBe('Message requests can’t be replies');
    expect(code(await alice.gql(SEND, { c: chat.id, b: '   ' }))).toBe('BAD_USER_INPUT');

    // None of that used the message up.
    expect((await alice.gql(ONE, { c: chat.id })).data!.conversation.request.sentAt).toBeNull();
    ok(await alice.gql(SEND, { c: chat.id, b: 'hi Bob' }));
    expect((await bob.gql(LIST)).data!.conversations[0].lastMessage.body).toBe('hi Bob');
    expect(await prisma.attachment.count()).toBe(0);
  });

  it('can’t be answered by the person it’s for, until they accept', async () => {
    const { bob, chat } = await requested();
    const reply = await bob.gql(SEND, { c: chat.id, b: 'hello!' });
    expect(code(reply)).toBe('FORBIDDEN');
    expect(message(reply)).toBe('Accept the request to reply');
    expect(await prisma.message.count()).toBe(1);
  });

  it('is limited to 20 new people an hour, spent when the message is sent', async () => {
    const { alice } = await people('alice');
    const names = crowd(21);
    const others = await people(...names);
    for (const name of names.slice(0, 20)) {
      const chat = ok(await alice.gql(START, { u: name })).data!.startDirect;
      ok(await alice.gql(SEND, { c: chat.id, b: `hi ${name}` }));
    }
    // Starting a chat costs nothing: it's the message that reaches someone.
    const last = ok(await alice.gql(START, { u: names[20]! })).data!.startDirect;
    const limited = await alice.gql(SEND, { c: last.id, b: 'one more' });
    expect(code(limited)).toBe('RATE_LIMITED');
    expect(await prisma.message.count()).toBe(20);
    // …and being turned away didn't use the request up: it goes through once the hour is over.
    requestLimiter.clear();
    ok(await alice.gql(SEND, { c: last.id, b: 'one more' }));
    expect((await others[names[20]!]!.gql(LIST)).data!.conversations).toHaveLength(1);
  });

  it('shares that allowance with group invites', async () => {
    const { alice } = await people('alice');
    const names = crowd(21);
    await people(...names);
    for (const name of names.slice(0, 10)) {
      const chat = ok(await alice.gql(START, { u: name })).data!.startDirect;
      ok(await alice.gql(SEND, { c: chat.id, b: `hi ${name}` }));
    }
    const group = ok(await alice.gql(CREATE, { n: 'Big', u: names.slice(10, 20) })).data!
      .createGroup;
    // Twenty people reached: the 21st is turned away, whether by message or by invite.
    const chat = ok(await alice.gql(START, { u: names[20]! })).data!.startDirect;
    expect(code(await alice.gql(SEND, { c: chat.id, b: 'hi' }))).toBe('RATE_LIMITED');
    expect(code(await alice.gql(ADD, { c: group.id, u: [names[20]] }))).toBe('RATE_LIMITED');
  });
});

describe('what a request can’t do', () => {
  it('has no reactions, typing, themes or hiding while it’s a request', async () => {
    const { alice, bob, chat } = await requested();
    const messageId = await firstMessageId(alice, chat.id);

    for (const who of [alice, bob]) {
      expect(code(await who.gql(REACT, { m: messageId, e: '❤️' }))).toBe('FORBIDDEN');
      expect(
        code(await who.gql(THEME, { c: chat.id, t: JSON.stringify({ v: 1, preset: 'ocean' }) })),
      ).toBe('FORBIDDEN');
      // Typing is simply never sent (it would reach Bob before he has accepted anything).
      expect((await who.gql(TYPING, { c: chat.id })).data!.setTyping).toBe(false);
    }
    // Bob can't tuck a pending request away; declining is how he turns it down.
    const hide = await bob.gql(HIDE, { c: chat.id });
    expect(code(hide)).toBe('BAD_USER_INPUT');
    expect(message(hide)).toBe('Decline the request instead');
    expect((await bob.gql(LIST)).data!.conversations).toHaveLength(1);
  });

  it('lets the recipient read it without telling the sender anything', async () => {
    const { alice, bob, chat } = await requested();
    const watching = listen(alice);
    await settle();
    ok(await bob.gql(MARK_READ, { c: chat.id }));
    expect((await bob.gql(LIST)).data!.conversations[0].unreadCount).toBe(0);
    await settle();
    expect(watching.events).toEqual([]);
  });

  it('has the same things as any chat once it’s accepted', async () => {
    const { alice, bob, chat } = await requested();
    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }));
    const messageId = await firstMessageId(alice, chat.id);
    ok(await bob.gql(REACT, { m: messageId, e: '❤️' }));
    ok(await alice.gql(THEME, { c: chat.id, t: JSON.stringify({ v: 1, preset: 'ocean' }) }));
    expect((await alice.gql(TYPING, { c: chat.id })).data!.setTyping).toBe(true);
    ok(await bob.gql(HIDE, { c: chat.id }));
  });
});

describe('opening a chat that’s already a request', () => {
  it('goes back to the same chat for the person who sent it', async () => {
    const { alice, chat } = await requested();
    const again = ok(await alice.gql(START, { u: '@Bob' })).data!.startDirect;
    expect(again.id).toBe(chat.id);
    expect(again.request).toMatchObject({ state: 'PENDING', sentByMe: true });
    expect(await prisma.conversation.count()).toBe(1);
  });

  it('opens the request for the person it’s for, with its message', async () => {
    const { bob, chat } = await requested();
    const opened = ok(await bob.gql(START, { u: 'alice' })).data!.startDirect;
    expect(opened.id).toBe(chat.id);
    expect(opened.request).toMatchObject({ state: 'PENDING', sentByMe: false });
    expect(opened.canMessage).toBe(false);
  });

  it('changes hands when the other person starts it before anything was sent', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const first = ok(await alice.gql(START, { u: 'bob' })).data!.startDirect;
    // Bob reaches out too, before Alice wrote a word: now Bob is the one writing first.
    const second = ok(await bob.gql(START, { u: 'alice' })).data!.startDirect;
    expect(second.id).toBe(first.id);
    expect(second.request).toMatchObject({ state: 'PENDING', sentByMe: true, sentAt: null });
    expect((await alice.gql(LIST)).data!.conversations).toEqual([]); // nothing to see for her
    expect(code(await alice.gql(SEND, { c: first.id, b: 'hi' }))).toBe('FORBIDDEN');

    ok(await bob.gql(SEND, { c: first.id, b: 'hi Alice' }));
    const seen = (await alice.gql(LIST)).data!.conversations;
    expect(seen).toHaveLength(1);
    expect(seen[0].request).toMatchObject({ state: 'PENDING', sentByMe: false });
    expect(await prisma.conversation.count()).toBe(1);
  });
});

describe('accepting', () => {
  it('turns the request into an ordinary chat for both people', async () => {
    const { alice, bob, chat } = await requested('hi, it’s Alice');
    const accepted = ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true })).data!
      .respondToRequest;
    expect(accepted).toEqual({ id: chat.id, request: null });

    for (const who of [alice, bob]) {
      const view = (await who.gql(LIST)).data!.conversations[0];
      expect(view).toMatchObject({ id: chat.id, canMessage: true, request: null });
    }
    // It talks both ways now, and what was said first is still the start of it.
    ok(await bob.gql(SEND, { c: chat.id, b: 'hi Alice!' }));
    ok(await alice.gql(SEND, { c: chat.id, b: 'hi Bob!' }));
    expect(
      (await bob.gql(MESSAGES, { c: chat.id })).data!.messages.messages.map(
        (m: { body: string }) => m.body,
      ),
    ).toEqual(['hi, it’s Alice', 'hi Alice!', 'hi Bob!']);
  });

  it('can be answered once, only by the person it’s for, and only once there is a message', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const chat = ok(await alice.gql(START, { u: 'bob' })).data!.startDirect;
    // Nothing sent yet: there's nothing to answer, and it looks like no chat at all.
    expect(code(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }))).toBe('NOT_FOUND');
    ok(await alice.gql(SEND, { c: chat.id, b: 'hi' }));

    // The person who asked can't answer their own request.
    expect(code(await alice.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }))).toBe(
      'NOT_FOUND',
    );
    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }));
    // Already answered.
    expect(code(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }))).toBe('NOT_FOUND');
    expect(code(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: false }))).toBe(
      'NOT_FOUND',
    );
  });

  it('counts only one answer when two arrive together (two tabs)', async () => {
    const { bob, chat } = await requested();
    const results = await Promise.all([
      bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }),
      bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }),
      bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: false }),
    ]);
    const winners = results.filter((r) => !r.errors);
    expect(winners).toHaveLength(1);
    for (const r of results.filter((r) => r.errors))
      expect(['CONFLICT', 'NOT_FOUND']).toContain(code(r));
    // Whichever won, the chat is in one consistent state.
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: chat.id } });
    const accepted = winners[0]!.data!.respondToRequest !== null;
    expect(row.requestState).toBe(accepted ? null : 'DECLINED');
  });
});

describe('declining', () => {
  it('takes the request off the recipient’s list and tells the sender it was declined', async () => {
    const { alice, bob, chat } = await requested();
    const declined = ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: false })).data!
      .respondToRequest;
    expect(declined).toBeNull();

    expect((await bob.gql(LIST)).data!.conversations).toEqual([]);
    expect((await bob.gql(ONE, { c: chat.id })).data!.conversation).toBeNull();

    const mine = (await alice.gql(LIST)).data!.conversations[0];
    expect(mine).toMatchObject({
      id: chat.id,
      canMessage: false,
      request: { state: 'DECLINED', sentByMe: true },
    });
    expect(Date.parse(mine.request.respondedAt)).toBeGreaterThan(0);
  });

  it('is final: the sender can’t send another or ask again, and nor can the recipient write', async () => {
    const { alice, bob, chat } = await requested();
    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: false }));

    const again = await alice.gql(SEND, { c: chat.id, b: 'please?' });
    expect(code(again)).toBe('FORBIDDEN');
    expect(message(again)).toBe('Bob declined your message request');
    // Starting it again only opens the same, locked chat.
    const reopened = ok(await alice.gql(START, { u: 'bob' })).data!.startDirect;
    expect(reopened.id).toBe(chat.id);
    expect(reopened.request).toMatchObject({ state: 'DECLINED', sentByMe: true });
    expect(code(await alice.gql(SEND, { c: chat.id, b: 'please??' }))).toBe('FORBIDDEN');
    expect(await prisma.message.count()).toBe(1);

    // Bob can't write into what he declined, and it can't be answered a second time.
    const bobSays = await bob.gql(SEND, { c: chat.id, b: 'actually…' });
    expect(code(bobSays)).toBe('FORBIDDEN');
    expect(message(bobSays)).toBe('You declined this message request');
    expect(code(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }))).toBe('NOT_FOUND');
    expect((await bob.gql(LIST)).data!.conversations).toEqual([]);
  });

  it('opens up again only when the person who declined reaches out', async () => {
    const { alice, bob, chat } = await requested();
    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: false }));

    // Bob changes his mind and starts a chat with Alice: they wanted to talk, so it just works.
    const started = ok(await bob.gql(START, { u: 'alice' })).data!.startDirect;
    expect(started.id).toBe(chat.id);
    expect(started.request).toBeNull();
    expect(started.canMessage).toBe(true);

    for (const who of [alice, bob]) {
      expect((await who.gql(LIST)).data!.conversations[0]).toMatchObject({
        id: chat.id,
        canMessage: true,
        request: null,
      });
    }
    ok(await bob.gql(SEND, { c: chat.id, b: 'sorry, hi!' }));
    ok(await alice.gql(SEND, { c: chat.id, b: 'hi Bob!' }));
  });
});

describe('blocking from a request', () => {
  it('declines it, and a decline stays after unblocking', async () => {
    const { alice, bob, chat } = await requested();
    const aliceId = await idOf('alice');
    ok(await bob.gql(BLOCK, { u: aliceId }));

    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: chat.id } });
    expect(row.requestState).toBe('DECLINED');
    expect((await bob.gql(LIST)).data!.conversations).toEqual([]);
    expect(code(await alice.gql(SEND, { c: chat.id, b: 'hello?' }))).toBe('FORBIDDEN');

    ok(await bob.gql(UNBLOCK, { u: aliceId }));
    // Still declined: unblocking doesn't ask Alice's request again.
    expect((await alice.gql(LIST)).data!.conversations[0].request).toMatchObject({
      state: 'DECLINED',
    });
    const stillNo = await alice.gql(SEND, { c: chat.id, b: 'hello again' });
    expect(message(stillNo)).toBe('Bob declined your message request');
    // Bob can still reach out himself, as with any decline.
    expect(ok(await bob.gql(START, { u: 'alice' })).data!.startDirect.request).toBeNull();
  });

  it('leaves your own request alone when you block the person you asked', async () => {
    const { alice, chat } = await requested();
    ok(await alice.gql(BLOCK, { u: await idOf('bob') }));
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: chat.id } });
    expect(row.requestState).toBe('PENDING');
  });

  it('keeps someone who blocked you from being reached with a new request', async () => {
    const { alice, bob } = await people('alice', 'bob');
    ok(await bob.gql(BLOCK, { u: await idOf('alice') }));
    expect(code(await alice.gql(START, { u: 'bob' }))).toBe('FORBIDDEN');
    expect(await prisma.conversation.count()).toBe(0);
  });
});

// ---- group invites ----------------------------------------------------------------------------

describe('creating a group', () => {
  it('makes the creator the only member and invites everyone else', async () => {
    const { alice, bob, carol } = await people('alice', 'bob', 'carol');
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob', 'carol'] })).data!
      .createGroup;
    expect(group.members).toEqual([{ username: 'alice' }]);
    expect(group.invites).toEqual([
      {
        state: 'PENDING',
        user: { username: 'bob' },
        invitedBy: { username: 'alice' },
        respondedAt: null,
      },
      {
        state: 'PENDING',
        user: { username: 'carol' },
        invitedBy: { username: 'alice' },
        respondedAt: null,
      },
    ]);

    for (const invitee of [bob, carol]) {
      // It's in their invites, not their chats.
      const invites = ok(await invitee.gql(INVITES)).data!.invites;
      expect(invites).toHaveLength(1);
      expect(invites[0]).toMatchObject({
        id: group.id,
        conversationId: group.id,
        name: 'Book club',
        invitedBy: { username: 'alice' },
        members: [{ username: 'alice' }],
      });
      expect((await invitee.gql(LIST)).data!.conversations).toEqual([]);
    }
  });

  it('keeps the group’s messages from people who haven’t joined', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob'] })).data!.createGroup;
    ok(await alice.gql(SEND, { c: group.id, b: 'welcome to the club' }));

    expect((await bob.gql(ONE, { c: group.id })).data!.conversation).toBeNull();
    expect((await bob.gql(GROUP, { c: group.id })).data!.conversation).toBeNull();
    for (const res of [
      await bob.gql(MESSAGES, { c: group.id }),
      await bob.gql(SEND, { c: group.id, b: 'hello' }),
      await bob.gql(MARK_READ, { c: group.id }),
      await bob.gql(TYPING, { c: group.id }),
      await bob.gql(LEAVE, { c: group.id }),
    ])
      expect(code(res)).toBe('NOT_FOUND');
    // The invite itself has no messages in it, just who and what.
    expect(Object.keys(ok(await bob.gql(INVITES)).data!.invites[0]).sort()).toEqual(
      ['conversationId', 'createdAt', 'id', 'invitedBy', 'members', 'name'].sort(),
    );
  });

  it('shows invites newest first', async () => {
    const { alice, bob, carol } = await people('alice', 'bob', 'carol');
    await alice.gql(CREATE, { n: 'First', u: ['bob'] });
    await new Promise((r) => setTimeout(r, 15));
    await carol.gql(CREATE, { n: 'Second', u: ['bob'] });
    expect(ok(await bob.gql(INVITES)).data!.invites.map((i: { name: string }) => i.name)).toEqual([
      'Second',
      'First',
    ]);
  });
});

describe('answering an invite', () => {
  it('joining makes you a member, and the invite goes away', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob'] })).data!.createGroup;

    const joined = ok(await bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: true })).data!
      .respondToInvite;
    expect(joined.id).toBe(group.id);

    expect(ok(await bob.gql(INVITES)).data!.invites).toEqual([]);
    const view = (await alice.gql(GROUP, { c: group.id })).data!.conversation;
    expect(view.members.map((m: { username: string }) => m.username).sort()).toEqual([
      'alice',
      'bob',
    ]);
    expect(view.invites).toEqual([]);
    expect((await bob.gql(LIST)).data!.conversations).toHaveLength(1);
    ok(await bob.gql(SEND, { c: group.id, b: 'hi all' }));
    ok(await alice.gql(SEND, { c: group.id, b: 'hi Bob' }));
    expect(await prisma.groupInvite.count()).toBe(0);
  });

  it('declining keeps a note that you declined, and is final for that group', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob'] })).data!.createGroup;

    expect(
      ok(await bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: false })).data!.respondToInvite,
    ).toBeNull();
    expect(ok(await bob.gql(INVITES)).data!.invites).toEqual([]);
    expect((await bob.gql(LIST)).data!.conversations).toEqual([]);

    // The group's members see who declined.
    const view = (await alice.gql(GROUP, { c: group.id })).data!.conversation;
    expect(view.members).toEqual([{ username: 'alice' }]);
    expect(view.invites).toMatchObject([{ state: 'DECLINED', user: { username: 'bob' } }]);
    expect(Date.parse(view.invites[0].respondedAt)).toBeGreaterThan(0);

    // Bob can't change his mind, and nobody can invite him again.
    expect(code(await bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }))).toBe('NOT_FOUND');
    const reinvite = await alice.gql(ADD, { c: group.id, u: ['bob'] });
    expect(code(reinvite)).toBe('CONFLICT');
    expect(message(reinvite)).toBe('Bob declined an invite to this group');
    expect(ok(await bob.gql(INVITES)).data!.invites).toEqual([]);
    // He can still be invited to a different group.
    ok(await alice.gql(CREATE, { n: 'Hiking', u: ['bob'] }));
    expect(ok(await bob.gql(INVITES)).data!.invites).toHaveLength(1);
  });

  it('only answers your own, open invites, and only once', async () => {
    const { alice, bob, eve } = await people('alice', 'bob', 'eve');
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob'] })).data!.createGroup;
    // Not invited: eve, and alice herself (she's a member, not an invitee).
    expect(code(await eve.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }))).toBe('NOT_FOUND');
    expect(code(await alice.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }))).toBe(
      'NOT_FOUND',
    );
    expect(await prisma.conversationMember.count({ where: { conversationId: group.id } })).toBe(1);

    ok(await bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }));
    expect(code(await bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }))).toBe('NOT_FOUND');
    expect(code(await bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: false }))).toBe(
      'NOT_FOUND',
    );
  });

  it('counts only one answer when two arrive together (two tabs)', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob'] })).data!.createGroup;
    const results = await Promise.all([
      bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }),
      bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }),
      bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }),
    ]);
    expect(results.filter((r) => !r.errors)).toHaveLength(1);
    for (const r of results.filter((r) => r.errors))
      expect(['CONFLICT', 'NOT_FOUND']).toContain(code(r));
    expect(await prisma.conversationMember.count({ where: { conversationId: group.id } })).toBe(2);
  });
});

describe('inviting more people', () => {
  it('lets any member invite, and says who invited whom', async () => {
    const { alice, bob, carol } = await people('alice', 'bob', 'carol');
    const group = await groupWith(alice, 'Book club', [bob]);

    const added = ok(await bob.gql(ADD, { c: group.id, u: ['carol'] })).data!.addMembers;
    expect(added.members).toHaveLength(2); // Carol isn't in until she joins
    expect(added.invites).toEqual([
      { state: 'PENDING', user: { username: 'carol' }, invitedBy: { username: 'bob' } },
    ]);
    const invite = ok(await carol.gql(INVITES)).data!.invites[0];
    expect(invite.invitedBy).toEqual({ username: 'bob' });
    expect(invite.members.map((m: { username: string }) => m.username).sort()).toEqual([
      'alice',
      'bob',
    ]);
  });

  it('refuses people already in, already invited, or who declined', async () => {
    const { alice, bob, dave, erin } = await people('alice', 'bob', 'carol', 'dave', 'erin');
    const group = await groupWith(alice, 'Book club', [bob]);
    ok(await alice.gql(ADD, { c: group.id, u: ['carol', 'dave'] }));
    ok(await dave.gql(RESPOND_TO_INVITE, { c: group.id, accept: false }));

    const inGroup = await alice.gql(ADD, { c: group.id, u: ['bob'] });
    expect(code(inGroup)).toBe('CONFLICT');
    expect(message(inGroup)).toBe('They’re already in this group');
    const invited = await alice.gql(ADD, { c: group.id, u: ['carol'] });
    expect(code(invited)).toBe('CONFLICT');
    expect(message(invited)).toBe('They’re already invited');
    // One person who declined spoils the whole request, and nobody else gets invited by it.
    const mixed = await alice.gql(ADD, { c: group.id, u: ['erin', 'dave'] });
    expect(code(mixed)).toBe('CONFLICT');
    expect(message(mixed)).toBe('Dave declined an invite to this group');
    expect(ok(await erin.gql(INVITES)).data!.invites).toEqual([]);
    expect(await prisma.groupInvite.count()).toBe(2); // carol (pending) and dave (declined)
  });

  it('only lets members invite, and not people who blocked them', async () => {
    const { alice, bob, carol, eve } = await people('alice', 'bob', 'carol', 'eve');
    const group = await groupWith(alice, 'Book club', [bob]);
    expect(code(await eve.gql(ADD, { c: group.id, u: ['alice'] }))).toBe('NOT_FOUND');

    ok(await carol.gql(BLOCK, { u: await idOf('alice') }));
    expect(code(await alice.gql(ADD, { c: group.id, u: ['carol'] }))).toBe('FORBIDDEN');
    expect(code(await alice.gql(CREATE, { n: 'Another', u: ['carol'] }))).toBe('FORBIDDEN');
    expect(ok(await carol.gql(INVITES)).data!.invites).toEqual([]);
  });
});

describe('cancelling an invite', () => {
  async function invited() {
    const { alice, bob, carol, dave } = await people('alice', 'bob', 'carol', 'dave');
    const group = await groupWith(alice, 'Book club', [bob]);
    // Bob invites Carol, so Alice is the owner but not the inviter.
    ok(await bob.gql(ADD, { c: group.id, u: ['carol'] }));
    return { alice, bob, carol, dave, group, carolId: await idOf('carol') };
  }

  it('lets whoever invited them take it back', async () => {
    const { bob, carol, group, carolId } = await invited();
    const view = ok(await bob.gql(CANCEL, { c: group.id, u: carolId })).data!.cancelInvite;
    expect(view.invites).toEqual([]);
    expect(ok(await carol.gql(INVITES)).data!.invites).toEqual([]);
    expect(code(await carol.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }))).toBe(
      'NOT_FOUND',
    );
    // A cancelled invite leaves nothing behind, so they can be invited again.
    ok(await bob.gql(ADD, { c: group.id, u: ['carol'] }));
    expect(ok(await carol.gql(INVITES)).data!.invites).toHaveLength(1);
  });

  it('lets the owner cancel an invite someone else sent', async () => {
    const { alice, carol, group, carolId } = await invited();
    ok(await alice.gql(CANCEL, { c: group.id, u: carolId }));
    expect(ok(await carol.gql(INVITES)).data!.invites).toEqual([]);
  });

  it('doesn’t let other members, outsiders or the invitee cancel it', async () => {
    const { alice, carol, dave, group, carolId } = await invited();
    // Dave joins as a plain member who didn't send Carol's invite.
    ok(await alice.gql(ADD, { c: group.id, u: ['dave'] }));
    ok(await dave.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }));
    expect(code(await dave.gql(CANCEL, { c: group.id, u: carolId }))).toBe('FORBIDDEN');
    // Carol can't cancel her own invite (she'd just decline it), and she isn't a member.
    expect(code(await carol.gql(CANCEL, { c: group.id, u: carolId }))).toBe('NOT_FOUND');
    expect(ok(await carol.gql(INVITES)).data!.invites).toHaveLength(1);
  });

  it('only cancels pending invites that exist', async () => {
    const { alice, dave, group } = await invited();
    expect(code(await alice.gql(CANCEL, { c: group.id, u: await idOf('dave') }))).toBe('NOT_FOUND');
    // Declined invites stay as they are: that "no" is final.
    ok(await alice.gql(ADD, { c: group.id, u: ['dave'] }));
    ok(await dave.gql(RESPOND_TO_INVITE, { c: group.id, accept: false }));
    expect(code(await alice.gql(CANCEL, { c: group.id, u: await idOf('dave') }))).toBe('NOT_FOUND');
    expect(await prisma.groupInvite.count({ where: { state: 'DECLINED' } })).toBe(1);
    // Members aren't invites either.
    expect(code(await alice.gql(CANCEL, { c: group.id, u: await idOf('bob') }))).toBe('NOT_FOUND');
  });
});

describe('when a group goes away or someone blocks', () => {
  it('removes the invites with the group, and tells people they’re gone', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob'] })).data!.createGroup;
    const watching = listen(bob);
    await settle();

    expect(ok(await alice.gql(LEAVE, { c: group.id })).data!.leaveGroup).toBe(true);
    expect(await prisma.conversation.count()).toBe(0);
    expect(await prisma.groupInvite.count()).toBe(0);
    expect(ok(await bob.gql(INVITES)).data!.invites).toEqual([]);
    await until(() => types(watching, 'InviteChanged').length === 1);
    expect(types(watching, 'InviteChanged')[0]).toEqual({
      __typename: 'InviteChanged',
      conversationId: group.id,
      invite: null,
    });
  });

  it('keeps the invites while someone is still in the group', async () => {
    const { alice, bob, carol } = await people('alice', 'bob', 'carol');
    const group = await groupWith(alice, 'Book club', [bob]);
    ok(await alice.gql(ADD, { c: group.id, u: ['carol'] }));
    ok(await alice.gql(LEAVE, { c: group.id }));
    expect(ok(await carol.gql(INVITES)).data!.invites).toHaveLength(1);
    // Bob became the owner and can still cancel it.
    expect(
      ok(await bob.gql(CANCEL, { c: group.id, u: await idOf('carol') })).data!.cancelInvite.invites,
    ).toEqual([]);
  });

  it('declines the invites of someone you block, and keeps them declined', async () => {
    const { alice, bob, carol, dave } = await people('alice', 'bob', 'carol', 'dave');
    const first = ok(await alice.gql(CREATE, { n: 'First', u: ['bob', 'carol'] })).data!
      .createGroup;
    const second = ok(await alice.gql(CREATE, { n: 'Second', u: ['bob'] })).data!.createGroup;
    const third = ok(await dave.gql(CREATE, { n: 'Third', u: ['bob'] })).data!.createGroup;

    ok(await bob.gql(BLOCK, { u: await idOf('alice') }));
    // Both of Alice's invites are declined for him; Dave's isn't touched.
    expect(ok(await bob.gql(INVITES)).data!.invites.map((i: { name: string }) => i.name)).toEqual([
      'Third',
    ]);
    for (const group of [first, second]) {
      const view = (await alice.gql(GROUP, { c: group.id })).data!.conversation;
      expect(view.invites).toContainEqual(
        expect.objectContaining({ state: 'DECLINED', user: { username: 'bob' } }),
      );
    }
    // Carol, who didn't block anyone, still has hers.
    expect(ok(await carol.gql(INVITES)).data!.invites).toHaveLength(1);
    expect(code(await bob.gql(RESPOND_TO_INVITE, { c: first.id, accept: true }))).toBe('NOT_FOUND');
    ok(await bob.gql(RESPOND_TO_INVITE, { c: third.id, accept: true }));
  });
});

// ---- what people are told, live ---------------------------------------------------------------

describe('live updates for message requests', () => {
  it('tells the recipient nothing until the message is sent, then lets every tab of the sender lock', async () => {
    const { alice, bob, eve } = await people('alice', 'bob', 'eve');
    listen(alice);
    const aliceThere = listen(alice); // her other tab
    const bobTab = listen(bob);
    const spy = listen(eve);
    await settle();

    const chat = ok(await alice.gql(START, { u: 'bob' })).data!.startDirect;
    await until(() => types(aliceThere, 'ConversationUpdated').length === 1);
    await settle();
    expect(bobTab.events).toEqual([]); // a chat with nothing in it isn't worth a knock

    ok(await alice.gql(SEND, { c: chat.id, b: 'hi Bob' }));
    await until(() => types(bobTab, 'MessageAdded').length === 1);
    await until(() => types(bobTab, 'ConversationUpdated').length === 1);
    expect(types(bobTab, 'MessageAdded')[0]).toMatchObject({
      conversationId: chat.id,
      message: { body: 'hi Bob' },
    });
    expect(types(bobTab, 'ConversationUpdated')[0].conversation.request).toEqual({
      state: 'PENDING',
      sentByMe: false,
    });
    // Alice's other tab learns it was sent, so its composer locks too.
    await until(() => types(aliceThere, 'ConversationUpdated').length === 2);
    expect(types(aliceThere, 'ConversationUpdated')[1].conversation.request).toEqual({
      state: 'PENDING',
      sentByMe: true,
    });
    await settle();
    expect(spy.events).toEqual([]);
  });

  it('tells the sender how it was answered: accepted', async () => {
    const { alice, bob, chat } = await requested();
    const aliceTab = listen(alice);
    const bobTab = listen(bob);
    await settle();

    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }));
    await until(() => types(aliceTab, 'RequestAnswered').length === 1);
    expect(types(aliceTab, 'RequestAnswered')[0]).toEqual({
      __typename: 'RequestAnswered',
      conversationId: chat.id,
      kind: 'DIRECT',
      groupName: null,
      user: { username: 'bob' },
      accepted: true,
    });
    // Both chat lists change (it's an ordinary chat now), and only the sender gets the answer.
    await until(() => types(aliceTab, 'ConversationUpdated').length >= 1);
    await until(() => types(bobTab, 'ConversationUpdated').length >= 1);
    expect(types(aliceTab, 'ConversationUpdated').at(-1).conversation.request).toBeNull();
    expect(types(bobTab, 'ConversationUpdated').at(-1).conversation.request).toBeNull();
    await settle();
    expect(types(bobTab, 'RequestAnswered')).toEqual([]);
  });

  it('tells the sender how it was answered: declined, with the chat gone for the recipient', async () => {
    const { alice, bob, chat } = await requested();
    const aliceTab = listen(alice);
    const bobTab = listen(bob);
    await settle();

    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: false }));
    await until(() => types(aliceTab, 'RequestAnswered').length === 1);
    expect(types(aliceTab, 'RequestAnswered')[0]).toMatchObject({
      kind: 'DIRECT',
      user: { username: 'bob' },
      accepted: false,
    });
    await until(() => types(aliceTab, 'ConversationUpdated').length === 1);
    expect(types(aliceTab, 'ConversationUpdated')[0].conversation.request).toEqual({
      state: 'DECLINED',
      sentByMe: true,
    });
    // Bob's chat list drops it: the update says he can no longer see the conversation.
    await until(() => types(bobTab, 'ConversationUpdated').length === 1);
    expect(types(bobTab, 'ConversationUpdated')[0].conversation).toBeNull();
  });

  it('opens a declined request for the sender when the decliner reaches out', async () => {
    const { alice, bob, chat } = await requested();
    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: false }));
    const aliceTab = listen(alice);
    await settle();

    ok(await bob.gql(START, { u: 'alice' }));
    await until(() => types(aliceTab, 'ConversationUpdated').length === 1);
    expect(types(aliceTab, 'ConversationUpdated')[0].conversation.request).toBeNull();
  });

  it('keeps presence, typing and profile changes from crossing a request, until it’s accepted', async () => {
    const { alice, bob, chat } = await requested();
    const aliceId = await idOf('alice');
    const bobId = await idOf('bob');
    const aliceTab = listen(alice);
    await settle();
    const bobTab = listen(bob); // Bob comes online: Alice isn't told
    await settle();

    ok(await alice.gql(TYPING, { c: chat.id }));
    await alice.gql(
      `mutation { updateProfile(input: { displayName: "Ali", avatarColor: "#ec4899" }) { id } }`,
    );
    await until(() => types(aliceTab, 'UserUpdated').length === 1); // her own tab hears about it
    await settle();
    expect(types(aliceTab, 'PresenceChanged')).toEqual([]);
    expect(types(bobTab, 'PresenceChanged')).toEqual([]);
    expect(types(bobTab, 'UserUpdated')).toEqual([]);
    expect(types(bobTab, 'TypingStarted')).toEqual([]);

    // Once Bob accepts they each see the other, as any two chat partners do.
    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: true }));
    await until(() =>
      aliceTab.events.some(
        (e) => e.__typename === 'PresenceChanged' && e.userId === bobId && e.online,
      ),
    );
    await until(() =>
      bobTab.events.some(
        (e) => e.__typename === 'PresenceChanged' && e.userId === aliceId && e.online,
      ),
    );
    await alice.gql(
      `mutation { updateProfile(input: { displayName: "Alice", avatarColor: "#ec4899" }) { id } }`,
    );
    await until(() => types(bobTab, 'UserUpdated').length === 1);
  });

  it('keeps a declined request’s sender off the recipient’s presence too', async () => {
    const { alice, bob, chat } = await requested();
    ok(await bob.gql(RESPOND_TO_REQUEST, { c: chat.id, accept: false }));
    const bobTab = listen(bob);
    await settle();
    listen(alice); // Alice comes online
    await settle();
    expect(types(bobTab, 'PresenceChanged')).toEqual([]);
  });
});

describe('live updates for group invites', () => {
  it('sends an invitee nothing from the group, only changes to their invite', async () => {
    const { alice, bob, eve } = await people('alice', 'bob', 'eve');
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob'] })).data!.createGroup;
    const aliceTab = listen(alice);
    const bobTab = listen(bob);
    const spy = listen(eve);
    await settle();

    // Everything people do in the group while Bob is only invited…
    const sent = ok(await alice.gql(SEND, { c: group.id, b: 'welcome' })).data!.sendMessage;
    await alice.gql(TYPING, { c: group.id });
    await alice.gql(REACT, { m: sent.id, e: '❤️' });
    await alice.gql(THEME, { c: group.id, t: JSON.stringify({ v: 1, preset: 'ocean' }) });
    await until(() => types(aliceTab, 'MessageAdded').length === 1);
    await settle();
    // …never reaches him: no messages, typing, reactions, presence or chat-list updates.
    expect(bobTab.events).toEqual([]);

    // Cancelling the invite does reach him, as a removed invite.
    const bobId = await idOf('bob');
    ok(await alice.gql(CANCEL, { c: group.id, u: bobId }));
    await until(() => types(bobTab, 'InviteChanged').length === 1);
    expect(types(bobTab, 'InviteChanged')[0]).toEqual({
      __typename: 'InviteChanged',
      conversationId: group.id,
      invite: null,
    });
    await settle();
    expect(spy.events).toEqual([]);
  });

  it('tells the inviter how it was answered, and the group about it', async () => {
    const { alice, bob, carol } = await people('alice', 'bob', 'carol');
    const group = await groupWith(alice, 'Book club', [bob]);
    ok(await bob.gql(ADD, { c: group.id, u: ['carol'] })); // Bob invites Carol
    const aliceTab = listen(alice);
    const bobTab = listen(bob);
    await settle();

    ok(await carol.gql(RESPOND_TO_INVITE, { c: group.id, accept: false }));
    // The answer goes to Bob, who invited her. Alice (the owner) sees the group change.
    await until(() => types(bobTab, 'RequestAnswered').length === 1);
    expect(types(bobTab, 'RequestAnswered')[0]).toEqual({
      __typename: 'RequestAnswered',
      conversationId: group.id,
      kind: 'GROUP',
      groupName: 'Book club',
      user: { username: 'carol' },
      accepted: false,
    });
    await until(() => types(aliceTab, 'ConversationUpdated').length === 1);
    expect(types(aliceTab, 'ConversationUpdated')[0].conversation.invites).toEqual([
      { state: 'DECLINED', user: { username: 'carol' } },
    ]);
    await settle();
    expect(types(aliceTab, 'RequestAnswered')).toEqual([]);
  });

  it('still tells an inviter who has left the group since', async () => {
    const { alice, bob, carol } = await people('alice', 'bob', 'carol');
    const group = await groupWith(alice, 'Book club', [bob]);
    ok(await bob.gql(ADD, { c: group.id, u: ['carol'] }));
    ok(await bob.gql(LEAVE, { c: group.id }));
    const bobTab = listen(bob);
    await settle();

    ok(await carol.gql(RESPOND_TO_INVITE, { c: group.id, accept: true }));
    await until(() => types(bobTab, 'RequestAnswered').length === 1);
    expect(types(bobTab, 'RequestAnswered')[0]).toMatchObject({
      groupName: 'Book club',
      user: { username: 'carol' },
      accepted: true,
    });
  });

  it('keeps the invite in step across the invitee’s tabs', async () => {
    const { alice, bob } = await people('alice', 'bob');
    const first = listen(bob);
    const second = listen(bob);
    await settle();
    const group = ok(await alice.gql(CREATE, { n: 'Book club', u: ['bob'] })).data!.createGroup;
    for (const tab of [first, second]) {
      await until(() => types(tab, 'InviteChanged').length === 1);
      expect(types(tab, 'InviteChanged')[0].invite).toMatchObject({ name: 'Book club' });
    }
    // Answering on one tab clears the invite from both.
    ok(await bob.gql(RESPOND_TO_INVITE, { c: group.id, accept: false }));
    for (const tab of [first, second]) {
      await until(() => types(tab, 'InviteChanged').length === 2);
      expect(types(tab, 'InviteChanged')[1].invite).toBeNull();
    }
  });
});

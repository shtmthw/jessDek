import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { Client, newApp, resetDb, signUp } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await newApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

const START_DIRECT = `mutation($u: String!) { startDirect(username: $u) { id type title peer { username } unreadCount } }`;
const SEND = `mutation($c: ID!, $b: String!) { sendMessage(conversationId: $c, body: $b) { id body sender { username } conversationId } }`;
const MESSAGES = `query($c: ID!, $before: ID, $limit: Int) { messages(conversationId: $c, before: $before, limit: $limit) { hasMore messages { id body } } }`;

async function twoUsers() {
  const a = new Client(app);
  const b = new Client(app);
  await signUp(a, 'alice', { displayName: 'Alice A' });
  await signUp(b, 'bob', { displayName: 'Bob B' });
  return { a, b };
}

describe('auth', () => {
  it('signs up, sets an httpOnly cookie and identifies the viewer', async () => {
    const c = new Client(app);
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'content-type': 'application/json' },
      payload: {
        query: `mutation($i: SignUpInput!) { signUp(input: $i) { username displayName } }`,
        variables: { i: { username: 'Alice', email: 'a@test.dev', password: 'password123' } },
      },
    });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/rt_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // usernames are normalised to lowercase, display name defaults to the username
    expect(res.json().data.signUp).toEqual({ username: 'alice', displayName: 'alice' });

    c.cookie = cookie.split(';')[0]!;
    const me = await c.gql(`{ me { username email } }`);
    expect(me.data!.me).toEqual({ username: 'alice', email: 'a@test.dev' });
  });

  it('never stores plain-text passwords', async () => {
    await signUp(new Client(app), 'alice');
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('validates input with field-level errors', async () => {
    const c = new Client(app);
    const bad = await c.gql(`mutation($i: SignUpInput!) { signUp(input: $i) { id } }`, {
      i: { username: 'a!', email: 'x@test.dev', password: 'password123' },
    });
    expect(bad.errors![0]!.extensions).toMatchObject({ code: 'BAD_USER_INPUT', field: 'username' });

    const short = await c.gql(`mutation($i: SignUpInput!) { signUp(input: $i) { id } }`, {
      i: { username: 'alice', email: 'x@test.dev', password: 'short' },
    });
    expect(short.errors![0]!.extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'password',
    });
  });

  it('rejects duplicate usernames and emails', async () => {
    await signUp(new Client(app), 'alice');
    const c = new Client(app);
    const dupName = await c.gql(`mutation($i: SignUpInput!) { signUp(input: $i) { id } }`, {
      i: { username: 'ALICE', email: 'other@test.dev', password: 'password123' },
    });
    expect(dupName.errors![0]!.extensions).toMatchObject({ code: 'CONFLICT', field: 'username' });
    const dupEmail = await c.gql(`mutation($i: SignUpInput!) { signUp(input: $i) { id } }`, {
      i: { username: 'someone', email: 'alice@test.dev', password: 'password123' },
    });
    expect(dupEmail.errors![0]!.extensions).toMatchObject({ code: 'CONFLICT', field: 'email' });
  });

  it('signs in by username or email, rejects a bad password, and signs out', async () => {
    await signUp(new Client(app), 'alice');
    const SIGN_IN = `mutation($i: SignInInput!) { signIn(input: $i) { username } }`;

    const wrong = await new Client(app).gql(SIGN_IN, {
      i: { identifier: 'alice', password: 'nope-nope' },
    });
    expect(wrong.errors![0]!.extensions!.code).toBe('UNAUTHENTICATED');
    const nobody = await new Client(app).gql(SIGN_IN, {
      i: { identifier: 'ghost', password: 'password123' },
    });
    expect(nobody.errors![0]!.message).toBe(wrong.errors![0]!.message); // no user enumeration

    const byName = new Client(app);
    expect(
      (await byName.gql(SIGN_IN, { i: { identifier: 'Alice', password: 'password123' } })).data!
        .signIn,
    ).toEqual({ username: 'alice' });
    const byEmail = new Client(app);
    expect(
      (await byEmail.gql(SIGN_IN, { i: { identifier: 'alice@test.dev', password: 'password123' } }))
        .errors,
    ).toBeUndefined();

    expect((await byName.gql(`{ me { id } }`)).data!.me).not.toBeNull();
    await byName.gql(`mutation { signOut }`);
    expect((await byName.gql(`{ me { id } }`)).data!.me).toBeNull();
  });

  it('rate limits repeated failed sign-ins', async () => {
    await signUp(new Client(app), 'alice');
    const c = new Client(app);
    const SIGN_IN = `mutation($i: SignInInput!) { signIn(input: $i) { id } }`;
    for (let i = 0; i < 10; i++)
      await c.gql(SIGN_IN, { i: { identifier: 'alice', password: 'wrong-wrong' } });
    const blocked = await c.gql(SIGN_IN, { i: { identifier: 'alice', password: 'password123' } });
    expect(blocked.errors![0]!.extensions!.code).toBe('RATE_LIMITED');
  });

  it('requires a session for protected operations', async () => {
    const res = await new Client(app).gql(`{ conversations { id } }`);
    expect(res.errors![0]!.extensions!.code).toBe('UNAUTHENTICATED');
    const forged = new Client(app);
    forged.cookie = 'rt_session=not.a.jwt';
    expect((await forged.gql(`{ me { id } }`)).data!.me).toBeNull();
  });

  it('treats a valid session whose user no longer exists as signed out', async () => {
    const c = new Client(app);
    const user = await signUp(c, 'ghost');
    await prisma.user.delete({ where: { id: user.id } }); // e.g. the database was reset
    expect((await c.gql(`{ me { id } }`)).data!.me).toBeNull();
    const res = await c.gql(
      `mutation { updateProfile(input: { displayName: "Boo", avatarColor: "#6366f1" }) { id } }`,
    );
    expect(res.errors![0]!.extensions!.code).toBe('UNAUTHENTICATED');
  });
});

describe('direct messages', () => {
  it('creates one conversation per pair, from either side', async () => {
    const { a, b } = await twoUsers();
    const first = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    const again = (await a.gql(START_DIRECT, { u: '@Bob' })).data!.startDirect;
    const fromBob = (await b.gql(START_DIRECT, { u: 'alice' })).data!.startDirect;

    expect(again.id).toBe(first.id);
    expect(fromBob.id).toBe(first.id);
    expect(first).toMatchObject({ type: 'DIRECT', title: 'Bob B', peer: { username: 'bob' } });
    expect(fromBob.title).toBe('Alice A'); // title is from each viewer's perspective
    expect(await prisma.conversation.count()).toBe(1);
  });

  it('survives both people starting the chat at once', async () => {
    const { a, b } = await twoUsers();
    const [x, y] = await Promise.all([
      a.gql(START_DIRECT, { u: 'bob' }),
      b.gql(START_DIRECT, { u: 'alice' }),
    ]);
    expect(x.errors).toBeUndefined();
    expect(y.errors).toBeUndefined();
    expect(x.data!.startDirect.id).toBe(y.data!.startDirect.id);
  });

  it('rejects yourself and unknown users', async () => {
    const { a } = await twoUsers();
    expect((await a.gql(START_DIRECT, { u: 'alice' })).errors![0]!.extensions!.code).toBe(
      'BAD_USER_INPUT',
    );
    expect((await a.gql(START_DIRECT, { u: 'nobody' })).errors![0]!.extensions!.code).toBe(
      'NOT_FOUND',
    );
  });

  it('lists conversations newest-activity first with last message', async () => {
    const { a } = await twoUsers();
    const c = new Client(app);
    await signUp(c, 'carol');
    const dmBob = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    const dmCarol = (await a.gql(START_DIRECT, { u: 'carol' })).data!.startDirect;
    await a.gql(SEND, { c: dmBob.id, b: 'hello bob' });
    await a.gql(SEND, { c: dmCarol.id, b: 'hello carol' });
    await a.gql(SEND, { c: dmBob.id, b: 'again bob' });

    const res = await a.gql(`{ conversations { id title lastMessage { body } } }`);
    expect(res.data!.conversations.map((c: any) => [c.title, c.lastMessage.body])).toEqual([
      ['Bob B', 'again bob'],
      ['carol', 'hello carol'],
    ]);
  });
});

describe('messages', () => {
  it('sends, validates and trims', async () => {
    const { a } = await twoUsers();
    const dm = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;

    const sent = await a.gql(SEND, { c: dm.id, b: '  hi there  ' });
    expect(sent.data!.sendMessage).toMatchObject({
      body: 'hi there',
      sender: { username: 'alice' },
      conversationId: dm.id,
    });

    expect((await a.gql(SEND, { c: dm.id, b: '   ' })).errors![0]!.extensions!.code).toBe(
      'BAD_USER_INPUT',
    );
    expect(
      (await a.gql(SEND, { c: dm.id, b: 'x'.repeat(4001) })).errors![0]!.extensions!.code,
    ).toBe('BAD_USER_INPUT');
  });

  it('pages history oldest → newest with a cursor', async () => {
    const { a } = await twoUsers();
    const dm = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    for (let i = 1; i <= 7; i++) await a.gql(SEND, { c: dm.id, b: `m${i}` });

    const latest = (await a.gql(MESSAGES, { c: dm.id, limit: 3 })).data!.messages;
    expect(latest.messages.map((m: any) => m.body)).toEqual(['m5', 'm6', 'm7']);
    expect(latest.hasMore).toBe(true);

    const older = (await a.gql(MESSAGES, { c: dm.id, limit: 3, before: latest.messages[0].id }))
      .data!.messages;
    expect(older.messages.map((m: any) => m.body)).toEqual(['m2', 'm3', 'm4']);
    expect(older.hasMore).toBe(true);

    const oldest = (await a.gql(MESSAGES, { c: dm.id, limit: 3, before: older.messages[0].id }))
      .data!.messages;
    expect(oldest.messages.map((m: any) => m.body)).toEqual(['m1']);
    expect(oldest.hasMore).toBe(false);
  });

  it('keeps conversations private to their members', async () => {
    const { a } = await twoUsers();
    const eve = new Client(app);
    await signUp(eve, 'eve');
    const dm = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    await a.gql(SEND, { c: dm.id, b: 'secret' });

    for (const res of [
      await eve.gql(MESSAGES, { c: dm.id }),
      await eve.gql(SEND, { c: dm.id, b: 'intrusion' }),
      await eve.gql(`mutation($c: ID!) { markRead(conversationId: $c) { id } }`, { c: dm.id }),
      await eve.gql(`mutation($c: ID!) { setTyping(conversationId: $c) }`, { c: dm.id }),
    ]) {
      expect(res.errors![0]!.extensions!.code).toBe('NOT_FOUND');
    }
    expect(
      (await eve.gql(`query($id: ID!) { conversation(id: $id) { id } }`, { id: dm.id })).data!
        .conversation,
    ).toBeNull();
    expect((await eve.gql(`{ conversations { id } }`)).data!.conversations).toEqual([]);
    expect(await prisma.message.count()).toBe(1);
  });

  it('counts unread messages and clears them with markRead', async () => {
    const { a, b } = await twoUsers();
    const dm = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    await a.gql(SEND, { c: dm.id, b: 'one' });
    await a.gql(SEND, { c: dm.id, b: 'two' });

    const unread = async (c: Client) =>
      (await c.gql(`{ conversations { unreadCount } }`)).data!.conversations[0].unreadCount;
    expect(await unread(b)).toBe(2);
    expect(await unread(a)).toBe(0); // your own messages are never unread

    await b.gql(`mutation($c: ID!) { markRead(conversationId: $c) { unreadCount } }`, { c: dm.id });
    expect(await unread(b)).toBe(0);

    await a.gql(SEND, { c: dm.id, b: 'three' });
    expect(await unread(b)).toBe(1);
    // replying counts as having read everything before it
    await b.gql(SEND, { c: dm.id, b: 'got it' });
    expect(await unread(b)).toBe(0);
  });

  it('rate limits message flooding', async () => {
    const { a } = await twoUsers();
    const dm = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    let limited = 0;
    for (let i = 0; i < 35; i++) {
      const r = await a.gql(SEND, { c: dm.id, b: `spam ${i}` });
      if (r.errors?.[0]?.extensions?.code === 'RATE_LIMITED') limited++;
    }
    expect(limited).toBe(5);
  });
});

describe('groups', () => {
  const CREATE = `mutation($n: String!, $u: [String!]!) { createGroup(name: $n, usernames: $u) { id type title name unreadCount members { username } } }`;

  it('creates a group, adds members and lets people leave', async () => {
    const { a, b } = await twoUsers();
    const c = new Client(app);
    await signUp(c, 'carol');

    const g = (await a.gql(CREATE, { n: '  Hike  ', u: ['bob', 'bob', '@carol', 'alice'] })).data!
      .createGroup;
    expect(g).toMatchObject({ type: 'GROUP', title: 'Hike' });
    expect(g.members.map((m: any) => m.username).sort()).toEqual(['alice', 'bob', 'carol']);

    // everyone in the group can talk
    await c.gql(SEND, { c: g.id, b: 'hi group' });
    expect((await b.gql(MESSAGES, { c: g.id })).data!.messages.messages).toHaveLength(1);

    // add a new person; adding existing members is a conflict
    const d = new Client(app);
    await signUp(d, 'dave');
    const added = await b.gql(
      `mutation($c: ID!, $u: [String!]!) { addMembers(conversationId: $c, usernames: $u) { members { username } } }`,
      { c: g.id, u: ['dave'] },
    );
    expect(added.data!.addMembers.members).toHaveLength(4);
    const again = await b.gql(
      `mutation($c: ID!, $u: [String!]!) { addMembers(conversationId: $c, usernames: $u) { id } }`,
      { c: g.id, u: ['dave', 'carol'] },
    );
    expect(again.errors![0]!.extensions!.code).toBe('CONFLICT');
    expect((await d.gql(MESSAGES, { c: g.id })).errors).toBeUndefined();

    // leaving removes access; the owner role moves on
    const LEAVE = `mutation($c: ID!) { leaveGroup(conversationId: $c) }`;
    expect((await a.gql(LEAVE, { c: g.id })).data!.leaveGroup).toBe(true);
    expect((await a.gql(MESSAGES, { c: g.id })).errors![0]!.extensions!.code).toBe('NOT_FOUND');
    const roles = await prisma.conversationMember.findMany({
      where: { conversationId: g.id, role: 'OWNER' },
    });
    expect(roles).toHaveLength(1);
  });

  it('deletes a group once everyone has left', async () => {
    const { a, b } = await twoUsers();
    const g = (await a.gql(CREATE, { n: 'Temp', u: ['bob'] })).data!.createGroup;
    await a.gql(`mutation($c: ID!) { leaveGroup(conversationId: $c) }`, { c: g.id });
    await b.gql(`mutation($c: ID!) { leaveGroup(conversationId: $c) }`, { c: g.id });
    expect(await prisma.conversation.count()).toBe(0);
  });

  it('validates names and members, and keeps DMs out of group operations', async () => {
    const { a } = await twoUsers();
    expect((await a.gql(CREATE, { n: '   ', u: ['bob'] })).errors![0]!.extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'name',
    });
    expect((await a.gql(CREATE, { n: 'X', u: ['ghost'] })).errors![0]!.extensions!.code).toBe(
      'NOT_FOUND',
    );
    expect((await a.gql(CREATE, { n: 'X', u: [] })).errors![0]!.extensions!.code).toBe(
      'BAD_USER_INPUT',
    );
    expect((await a.gql(CREATE, { n: 'X', u: ['alice'] })).errors![0]!.extensions!.code).toBe(
      'BAD_USER_INPUT',
    );

    const dm = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    const leave = await a.gql(`mutation($c: ID!) { leaveGroup(conversationId: $c) }`, { c: dm.id });
    expect(leave.errors![0]!.extensions!.code).toBe('BAD_USER_INPUT');
  });
});

describe('searchUsers', () => {
  it('matches by prefix, excludes yourself and needs 2+ characters', async () => {
    const a = new Client(app);
    await signUp(a, 'alice');
    await signUp(new Client(app), 'albert', { displayName: 'Albert Z' });
    await signUp(new Client(app), 'bob', { displayName: 'Alma B' });

    const Q = `query($q: String!) { searchUsers(query: $q) { username } }`;
    expect((await a.gql(Q, { q: 'al' })).data!.searchUsers.map((u: any) => u.username)).toEqual([
      'albert',
      'bob',
    ]);
    expect((await a.gql(Q, { q: '@alb' })).data!.searchUsers).toEqual([{ username: 'albert' }]);
    expect((await a.gql(Q, { q: 'a' })).data!.searchUsers).toEqual([]);
  });
});

describe('profile & health', () => {
  it('updates the profile', async () => {
    const a = new Client(app);
    await signUp(a, 'alice');
    const ok = await a.gql(
      `mutation($i: UpdateProfileInput!) { updateProfile(input: $i) { displayName avatarColor } }`,
      {
        i: { displayName: ' Ali ', avatarColor: '#ff0000' },
      },
    );
    expect(ok.data!.updateProfile).toEqual({ displayName: 'Ali', avatarColor: '#ff0000' });
    const bad = await a.gql(
      `mutation($i: UpdateProfileInput!) { updateProfile(input: $i) { id } }`,
      {
        i: { displayName: 'Ali', avatarColor: 'red' },
      },
    );
    expect(bad.errors![0]!.extensions!.code).toBe('BAD_USER_INPUT');
  });

  it('reports health and readiness', async () => {
    expect((await app.inject('/healthz')).json()).toEqual({ ok: true });
    expect((await app.inject('/readyz')).json()).toEqual({ ok: true });
  });
});

const SHA = 'a'.repeat(64);
const photo = (over: Record<string, unknown> = {}) => ({
  kind: 'IMAGE',
  mimeType: 'image/webp',
  name: 'beach.webp',
  size: 120_000,
  width: 1600,
  height: 900,
  sha256: SHA,
  thumbhash: 'YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw==',
  ...over,
});
const video = (over: Record<string, unknown> = {}) => ({
  kind: 'VIDEO',
  mimeType: 'video/mp4',
  name: 'clip.mp4',
  size: 5_000_000,
  width: 1280,
  height: 720,
  durationMs: 42_000,
  sha256: 'b'.repeat(64),
  posterSha256: 'c'.repeat(64),
  posterSize: 20_000,
  posterMime: 'image/webp',
  ...over,
});
const ATTACHMENT_FIELDS = `id kind mimeType name size width height durationMs sha256 thumbhash posterSha256 posterSize posterMime`;
const SEND_MEDIA = `mutation($c: ID!, $b: String!, $a: [AttachmentInput!]) { sendMessage(conversationId: $c, body: $b, attachments: $a) { id body attachments { ${ATTACHMENT_FIELDS} } } }`;

describe('media metadata', () => {
  async function dm() {
    const { a, b } = await twoUsers();
    const conv = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    return { a, b, conv };
  }

  it('sends a photo with no caption', async () => {
    const { a, b, conv } = await dm();
    const res = await a.gql(SEND_MEDIA, { c: conv.id, b: '', a: [photo()] });
    expect(res.errors).toBeUndefined();
    const msg = res.data!.sendMessage;
    expect(msg.body).toBe('');
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0]).toMatchObject({
      kind: 'IMAGE',
      mimeType: 'image/webp',
      name: 'beach.webp',
      size: 120_000,
      width: 1600,
      height: 900,
      durationMs: null,
      sha256: SHA,
      thumbhash: 'YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw==',
      posterSha256: null,
      posterSize: null,
      posterMime: null,
    });

    const page = await b.gql(
      `query($c: ID!) { messages(conversationId: $c) { messages { id attachments { id sha256 } } } }`,
      { c: conv.id },
    );
    expect(page.data!.messages.messages[0].attachments[0].sha256).toBe(SHA);
    const list = await b.gql(`{ conversations { lastMessage { attachments { id kind } } } }`);
    expect(list.data!.conversations[0].lastMessage.attachments).toEqual([
      { id: msg.attachments[0].id, kind: 'IMAGE' },
    ]);
  });

  it('keeps album order and stores video poster metadata', async () => {
    const { a, conv } = await dm();
    const res = await a.gql(SEND_MEDIA, {
      c: conv.id,
      b: ' look ',
      a: [video(), photo({ name: 'second.webp' })],
    });
    const msg = res.data!.sendMessage;
    expect(msg.body).toBe('look');
    expect(msg.attachments.map((x: { kind: string }) => x.kind)).toEqual(['VIDEO', 'IMAGE']);
    expect(msg.attachments[0]).toMatchObject({
      durationMs: 42_000,
      posterSha256: 'c'.repeat(64),
      posterSize: 20_000,
      posterMime: 'image/webp',
    });
  });

  it('validates attachments', async () => {
    const { a, conv } = await dm();
    const cases: Array<[string, unknown[]]> = [
      ['bad sha', [photo({ sha256: 'xyz' })]],
      ['svg', [photo({ mimeType: 'image/svg+xml' })]],
      ['image over the max', [photo({ size: config.media.maxImageBytes + 1 })]],
      ['video without poster hash', [video({ posterSha256: null })]],
      ['11 attachments', Array.from({ length: 11 }, () => photo())],
      ['IMAGE kind with a video mime', [photo({ mimeType: 'video/mp4' })]],
    ];
    for (const [label, attachments] of cases) {
      const res = await a.gql(SEND_MEDIA, { c: conv.id, b: '', a: attachments });
      expect(res.errors?.[0]?.extensions?.code, label).toBe('BAD_USER_INPUT');
    }
    expect(await prisma.attachment.count()).toBe(0);

    const named = await a.gql(SEND_MEDIA, {
      c: conv.id,
      b: '',
      a: [photo({ name: '../../a\u0000b.jpg' })],
    });
    expect(named.data!.sendMessage.attachments[0].name).toBe('....ab.jpg');

    const blank = await a.gql(SEND_MEDIA, { c: conv.id, b: '   ', a: [] });
    expect(blank.errors![0]!.extensions!.code).toBe('BAD_USER_INPUT');
  });

  it('never stores media bytes', () => {
    const models = Prisma.dmmf.datamodel.models;
    for (const model of models) {
      expect(
        model.fields.filter((f) => f.type === 'Bytes').map((f) => `${model.name}.${f.name}`),
      ).toEqual([]);
    }
    const attachment = models.find((m) => m.name === 'Attachment')!;
    expect(attachment.fields.map((f) => f.name).sort()).toEqual(
      [
        'durationMs',
        'height',
        'id',
        'kind',
        'message',
        'messageId',
        'mimeType',
        'name',
        'position',
        'posterMime',
        'posterSha256',
        'posterSize',
        'sha256',
        'size',
        'thumbhash',
        'width',
      ].sort(),
    );
  });

  it('exposes mediaConfig to signed-in users only, and can be turned off', async () => {
    const { a, conv } = await dm();
    const anon = await new Client(app).gql(`{ mediaConfig { enabled } }`);
    expect(anon.errors![0]!.extensions!.code).toBe('UNAUTHENTICATED');

    const cfg = (
      await a.gql(
        `{ mediaConfig { enabled relay maxAttachments maxImageBytes maxVideoBytes iceServers { urls } } }`,
      )
    ).data!.mediaConfig;
    expect(cfg).toMatchObject({
      enabled: true,
      relay: true,
      maxAttachments: 10,
      maxImageBytes: 20 * 1024 * 1024,
      maxVideoBytes: 100 * 1024 * 1024,
    });
    expect(cfg.iceServers[0].urls[0]).toMatch(/^stun:/);

    config.media.enabled = false;
    try {
      const res = await a.gql(SEND_MEDIA, { c: conv.id, b: '', a: [photo()] });
      expect(res.errors![0]!.extensions!.code).toBe('FORBIDDEN');
    } finally {
      config.media.enabled = true;
    }
  });
});

describe('blocking, muting and removing', () => {
  const VIEW = `{ conversations { id type title muted hidden blockedByMe canMessage peer { username online lastSeenAt } } }`;
  const code = (r: { errors?: Array<{ extensions?: { code?: string } }> }) =>
    r.errors?.[0]?.extensions?.code;
  const SEND_TEXT = `mutation($c: ID!, $b: String!) { sendMessage(conversationId: $c, body: $b) { id } }`;

  async function three() {
    const { a, b } = await twoUsers();
    const c = new Client(app);
    await signUp(c, 'carol', { displayName: 'Carol C' });
    const dm = (await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect;
    const ids = Object.fromEntries(
      (await prisma.user.findMany()).map((u) => [u.username, u.id]),
    ) as Record<string, string>;
    return { a, b, c, dm, ids };
  }

  it('a block stops the direct chat both ways, hides presence, and can be undone', async () => {
    const { a, b, dm, ids } = await three();
    const blocked = await a.gql(`mutation($u: ID!) { blockUser(userId: $u) { username } }`, {
      u: ids.bob,
    });
    expect(blocked.data!.blockUser.username).toBe('bob');

    expect(code(await b.gql(SEND_TEXT, { c: dm.id, b: 'hello?' }))).toBe('FORBIDDEN');
    expect(code(await a.gql(SEND_TEXT, { c: dm.id, b: 'hi' }))).toBe('FORBIDDEN');

    const mine = (await a.gql(VIEW)).data!.conversations[0];
    expect(mine).toMatchObject({ blockedByMe: true, canMessage: false });
    const theirs = (await b.gql(VIEW)).data!.conversations[0];
    expect(theirs).toMatchObject({ blockedByMe: false, canMessage: false });
    // Neither sees when the other was around.
    expect(theirs.peer).toMatchObject({ online: false, lastSeenAt: null });
    expect(mine.peer.lastSeenAt).toBeNull();

    expect((await a.gql(`{ blockedUsers { username } }`)).data!.blockedUsers).toEqual([
      { username: 'bob' },
    ]);
    expect((await b.gql(`{ blockedUsers { username } }`)).data!.blockedUsers).toEqual([]);

    await a.gql(`mutation($u: ID!) { unblockUser(userId: $u) }`, { u: ids.bob });
    expect(code(await b.gql(SEND_TEXT, { c: dm.id, b: 'back again' }))).toBeUndefined();
    expect((await b.gql(VIEW)).data!.conversations[0].peer.lastSeenAt).toEqual(expect.any(String));
  });

  it('someone who blocked you can’t be reached by a new chat or a group, but shared groups still work', async () => {
    const { a, b, c, ids } = await three();
    const group = (
      await a.gql(`mutation { createGroup(name: "Trip", usernames: ["bob", "carol"]) { id } }`)
    ).data!.createGroup;
    await c.gql(`mutation($u: ID!) { blockUser(userId: $u) { id } }`, { u: ids.alice });

    expect(code(await a.gql(START_DIRECT, { u: 'carol' }))).toBe('FORBIDDEN');
    expect(
      code(await a.gql(`mutation { createGroup(name: "Again", usernames: ["carol"]) { id } }`)),
    ).toBe('FORBIDDEN');
    const other = (
      await a.gql(`mutation { createGroup(name: "Other", usernames: ["bob"]) { id } }`)
    ).data!.createGroup;
    expect(
      code(
        await a.gql(
          `mutation($c: ID!) { addMembers(conversationId: $c, usernames: ["carol"]) { id } }`,
          { c: other.id },
        ),
      ),
    ).toBe('FORBIDDEN');
    // Carol can still start one with Alice (she can unblock whenever she likes), and the group goes on.
    expect(code(await a.gql(SEND_TEXT, { c: group.id, b: 'still here' }))).toBeUndefined();
    expect(code(await c.gql(SEND_TEXT, { c: group.id, b: 'me too' }))).toBeUndefined();
    expect(code(await b.gql(SEND_TEXT, { c: group.id, b: 'hi all' }))).toBeUndefined();
  });

  it('mutes and unmutes a chat for you only', async () => {
    const { a, b, dm } = await three();
    const MUTE = `mutation($c: ID!, $m: Boolean!) { muteConversation(conversationId: $c, muted: $m) { muted } }`;
    expect((await a.gql(MUTE, { c: dm.id, m: true })).data!.muteConversation.muted).toBe(true);
    expect((await a.gql(VIEW)).data!.conversations[0].muted).toBe(true);
    expect((await b.gql(VIEW)).data!.conversations[0].muted).toBe(false);
    expect((await a.gql(MUTE, { c: dm.id, m: false })).data!.muteConversation.muted).toBe(false);
  });

  it('removes a direct chat from your list until something new happens in it', async () => {
    const { a, b, dm } = await three();
    await a.gql(SEND_TEXT, { c: dm.id, b: 'first' });
    await a.gql(`mutation($c: ID!) { hideConversation(conversationId: $c) }`, { c: dm.id });
    expect((await a.gql(VIEW)).data!.conversations).toEqual([]);
    expect((await b.gql(VIEW)).data!.conversations).toHaveLength(1); // only gone for you

    await b.gql(SEND_TEXT, { c: dm.id, b: 'are you there?' });
    const back = (await a.gql(VIEW)).data!.conversations;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: dm.id, hidden: false });

    // Starting it again brings it back too; groups are left, not removed.
    await a.gql(`mutation($c: ID!) { hideConversation(conversationId: $c) }`, { c: dm.id });
    expect((await a.gql(START_DIRECT, { u: 'bob' })).data!.startDirect.id).toBe(dm.id);
    expect((await a.gql(VIEW)).data!.conversations).toHaveLength(1);
    const group = (await a.gql(`mutation { createGroup(name: "G", usernames: ["bob"]) { id } }`))
      .data!.createGroup;
    expect(
      code(
        await a.gql(`mutation($c: ID!) { hideConversation(conversationId: $c) }`, { c: group.id }),
      ),
    ).toBe('BAD_USER_INPUT');
  });

  it('lets only the owner remove someone from a group', async () => {
    const { a, b, c, ids } = await three();
    const group = (
      await a.gql(`mutation { createGroup(name: "Trip", usernames: ["bob", "carol"]) { id } }`)
    ).data!.createGroup;
    await c.gql(SEND_TEXT, { c: group.id, b: 'hello' });
    expect((await b.gql(`{ conversations { ownerId } }`)).data!.conversations[0].ownerId).toBe(
      ids.alice,
    );
    const REMOVE = `mutation($c: ID!, $u: ID!) { removeMember(conversationId: $c, userId: $u) { members { username } } }`;

    expect(code(await b.gql(REMOVE, { c: group.id, u: ids.carol }))).toBe('FORBIDDEN');
    expect(code(await a.gql(REMOVE, { c: group.id, u: ids.alice }))).toBe('BAD_USER_INPUT');
    const res = await a.gql(REMOVE, { c: group.id, u: ids.carol });
    expect(
      res.data!.removeMember.members.map((m: { username: string }) => m.username).sort(),
    ).toEqual(['alice', 'bob']);
    expect(
      (await c.gql(VIEW)).data!.conversations.some((x: { id: string }) => x.id === group.id),
    ).toBe(false);
    expect(code(await c.gql(SEND_TEXT, { c: group.id, b: 'let me in' }))).toBe('NOT_FOUND');
    // What they said before stays.
    const history = await a.gql(MESSAGES, { c: group.id });
    expect(history.data!.messages.messages.map((m: { body: string }) => m.body)).toContain('hello');
    expect(code(await a.gql(REMOVE, { c: group.id, u: ids.carol }))).toBe('NOT_FOUND');
  });
});

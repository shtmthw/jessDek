import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withCardMeta } from '../src/app.js';
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

describe('welcome', () => {
  const ME = `{ me { welcomed } }`;
  const DISMISS = `mutation { dismissWelcome { welcomed } }`;

  it('is shown to a new account once, on every device', async () => {
    const c = new Client(app);
    await signUp(c, 'newbie');
    expect((await c.gql(ME)).data!.me).toEqual({ welcomed: false });

    expect((await c.gql(DISMISS)).data!.dismissWelcome).toEqual({ welcomed: true });
    // Signing in again (another device) doesn't bring it back, and a second dismiss is harmless.
    const other = new Client(app);
    await other.gql(`mutation($i: SignInInput!) { signIn(input: $i) { id } }`, {
      i: { identifier: 'newbie', password: 'test-password-1' },
    });
    expect((await other.gql(ME)).data!.me).toEqual({ welcomed: true });
    const first = (await prisma.user.findUniqueOrThrow({ where: { username: 'newbie' } }))
      .welcomedAt;
    await other.gql(DISMISS);
    const again = (await prisma.user.findUniqueOrThrow({ where: { username: 'newbie' } }))
      .welcomedAt;
    expect(again).toEqual(first);
  });

  it('needs a signed-in user', async () => {
    const res = await new Client(app).gql(DISMISS);
    expect(res.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });
});

describe('auth', () => {
  it('signs up, sets an httpOnly cookie and identifies the viewer', async () => {
    const c = new Client(app);
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'content-type': 'application/json' },
      payload: {
        query: `mutation($i: SignUpInput!) { signUp(input: $i) { username displayName } }`,
        variables: { i: { username: 'Alice', email: 'a@test.dev', password: 'test-password-1' } },
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
      i: { username: 'a!', email: 'x@test.dev', password: 'test-password-1' },
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
      i: { username: 'ALICE', email: 'other@test.dev', password: 'test-password-1' },
    });
    expect(dupName.errors![0]!.extensions).toMatchObject({ code: 'CONFLICT', field: 'username' });
    const dupEmail = await c.gql(`mutation($i: SignUpInput!) { signUp(input: $i) { id } }`, {
      i: { username: 'someone', email: 'alice@test.dev', password: 'test-password-1' },
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
      i: { identifier: 'ghost', password: 'test-password-1' },
    });
    expect(nobody.errors![0]!.message).toBe(wrong.errors![0]!.message); // no user enumeration

    const byName = new Client(app);
    expect(
      (await byName.gql(SIGN_IN, { i: { identifier: 'Alice', password: 'test-password-1' } })).data!
        .signIn,
    ).toEqual({ username: 'alice' });
    const byEmail = new Client(app);
    expect(
      (
        await byEmail.gql(SIGN_IN, {
          i: { identifier: 'alice@test.dev', password: 'test-password-1' },
        })
      ).errors,
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
    const blocked = await c.gql(SIGN_IN, {
      i: { identifier: 'alice', password: 'test-password-1' },
    });
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

  it('saves an avatar recipe, re-serialized, and resets it with null', async () => {
    const a = new Client(app);
    await signUp(a, 'alice');
    const SAVE = `mutation($i: UpdateAvatarInput!) { updateAvatar(input: $i) { avatarColor avatar } }`;
    const fresh = await a.gql(`{ me { avatar avatarColor } }`);
    expect(fresh.data!.me.avatar).toBeNull();

    const saved = await a.gql(SAVE, {
      i: {
        avatarColor: '#22c55e',
        avatar: '{ "v": 1,  "style": "character", "hair": "space-buns" }',
      },
    });
    expect(saved.errors).toBeUndefined();
    expect(saved.data!.updateAvatar).toEqual({
      avatarColor: '#22c55e',
      avatar: '{"v":1,"style":"character","hair":"space-buns"}',
    });
    // Others see it too.
    const b = new Client(app);
    await signUp(b, 'bob');
    const seen = await b.gql(`{ searchUsers(query: "ali") { avatar } }`);
    expect(seen.data!.searchUsers[0].avatar).toBe(
      '{"v":1,"style":"character","hair":"space-buns"}',
    );

    // Leaving the recipe out changes only the colour.
    const colourOnly = await a.gql(SAVE, { i: { avatarColor: '#0ea5e9' } });
    expect(colourOnly.data!.updateAvatar).toEqual({
      avatarColor: '#0ea5e9',
      avatar: '{"v":1,"style":"character","hair":"space-buns"}',
    });

    const reset = await a.gql(SAVE, { i: { avatarColor: '#22c55e', avatar: null } });
    expect(reset.data!.updateAvatar.avatar).toBeNull();
  });

  it('rejects avatar recipes that aren’t a small flat object, and bad colours', async () => {
    const a = new Client(app);
    await signUp(a, 'alice');
    const SAVE = `mutation($i: UpdateAvatarInput!) { updateAvatar(input: $i) { id } }`;
    const tooMany = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 33 }, (_, i) => [
          `k${String.fromCharCode(97 + (i % 26))}${'x'.repeat(Math.floor(i / 26))}`,
          'a',
        ]),
      ),
    );
    const oversize = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 32 }, (_, i) => [
          `key${String.fromCharCode(97 + (i % 26))}${'y'.repeat(Math.floor(i / 26) + 8)}`,
          'v'.repeat(24),
        ]),
      ),
    );
    const bad = [
      'not json',
      '[1,2]',
      'null',
      '"hair"',
      '{"hair":{"style":"afro"}}',
      '{"hair":["afro"]}',
      `{"hair":"${'a'.repeat(25)}"}`,
      '{"hair":"Afro!"}',
      '{"hair-style":"afro"}',
      '{"v":1000}',
      '{"v":1.5}',
      tooMany,
      oversize,
    ];
    for (const avatar of bad) {
      const res = await a.gql(SAVE, { i: { avatarColor: '#22c55e', avatar } });
      expect(res.errors?.[0]?.extensions?.code, avatar).toBe('BAD_USER_INPUT');
    }
    const color = await a.gql(SAVE, { i: { avatarColor: 'pink', avatar: null } });
    expect(color.errors![0]!.extensions!.code).toBe('BAD_USER_INPUT');
    const me = await a.gql(`{ me { avatar } }`);
    expect(me.data!.me.avatar).toBeNull();
  });

  it('rate limits avatar saves', async () => {
    const a = new Client(app);
    await signUp(a, 'alice');
    const SAVE = `mutation($i: UpdateAvatarInput!) { updateAvatar(input: $i) { id } }`;
    for (let i = 0; i < 30; i++) {
      const ok = await a.gql(SAVE, { i: { avatarColor: '#22c55e', avatar: null } });
      expect(ok.errors).toBeUndefined();
    }
    const limited = await a.gql(SAVE, { i: { avatarColor: '#22c55e', avatar: null } });
    expect(limited.errors![0]!.extensions!.code).toBe('RATE_LIMITED');
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

describe('replies and reactions', () => {
  const SEND_REPLY = `mutation($c: ID!, $b: String!, $r: ID) {
    sendMessage(conversationId: $c, body: $b, replyToId: $r) {
      id body replyTo { id body sender { username } }
    }
  }`;
  const REACT = `mutation($m: ID!, $e: String) {
    react(messageId: $m, emoji: $e) { id reactions { emoji reactedAt user { username } } }
  }`;
  const LIST = `{ conversations { id unreadCount lastReaction { emoji user { username } message { id } } } }`;

  /** alice, bob and carol in a group, with one message from each of alice and bob. */
  async function group() {
    const [a, b, c] = [new Client(app), new Client(app), new Client(app)];
    await signUp(a, 'alice');
    await signUp(b, 'bob');
    await signUp(c, 'carol');
    const g = (
      await a.gql(`mutation { createGroup(name: "Trip", usernames: ["bob", "carol"]) { id } }`)
    ).data!.createGroup as { id: string };
    const fromAlice = (await a.gql(SEND, { c: g.id, b: 'leaving at 7' })).data!.sendMessage;
    const fromBob = (await b.gql(SEND, { c: g.id, b: 'see you there' })).data!.sendMessage;
    return { a, b, c, g, fromAlice, fromBob };
  }

  it('sends a reply that quotes the original, and lists it with the quote', async () => {
    const { b, g, fromAlice } = await group();
    const reply = await b.gql(SEND_REPLY, { c: g.id, b: 'works for me', r: fromAlice.id });
    expect(reply.errors).toBeUndefined();
    expect(reply.data!.sendMessage.replyTo).toEqual({
      id: fromAlice.id,
      body: 'leaving at 7',
      sender: { username: 'alice' },
    });
    const page = await b.gql(
      `query($c: ID!) { messages(conversationId: $c) { messages { body replyTo { id } reactions { emoji } } } }`,
      { c: g.id },
    );
    const list = page.data!.messages.messages;
    expect(list.at(-1)).toEqual({
      body: 'works for me',
      replyTo: { id: fromAlice.id },
      reactions: [],
    });
    expect(list[0].replyTo).toBeNull();
  });

  it('refuses a reply to a message from another chat', async () => {
    const { a, g } = await group();
    const { a: other } = await twoUsersIn('dora', 'eli');
    const dm = (await other.gql(START_DIRECT, { u: 'eli' })).data!.startDirect;
    const elsewhere = (await other.gql(SEND, { c: dm.id, b: 'private' })).data!.sendMessage;
    const res = await a.gql(SEND_REPLY, { c: g.id, b: 'hi', r: elsewhere.id });
    expect(res.errors![0]!.extensions!.code).toBe('BAD_USER_INPUT');
    expect(res.errors![0]!.message).toBe('You can only reply to a message in this chat');
  });

  it('keeps one reaction per person: set, change, same again is a no-op, null removes', async () => {
    const { a, b, fromAlice } = await group();
    const set = await b.gql(REACT, { m: fromAlice.id, e: '❤️' });
    expect(set.data!.react.reactions).toMatchObject([{ emoji: '❤️', user: { username: 'bob' } }]);
    const firstAt = set.data!.react.reactions[0].reactedAt;

    await a.gql(REACT, { m: fromAlice.id, e: '😂' });
    await new Promise((r) => setTimeout(r, 5));
    const changed = await b.gql(REACT, { m: fromAlice.id, e: '👍🏽' });
    // In the order people first reacted, so changing an emoji doesn't move you.
    expect(changed.data!.react.reactions.map((r: { emoji: string }) => r.emoji)).toEqual([
      '👍🏽',
      '😂',
    ]);
    expect(changed.data!.react.reactions[0].reactedAt > firstAt).toBe(true);

    const same = await b.gql(REACT, { m: fromAlice.id, e: '👍🏽' });
    expect(same.data!.react.reactions[0].reactedAt).toBe(
      changed.data!.react.reactions[0].reactedAt,
    );

    const removed = await b.gql(REACT, { m: fromAlice.id, e: null });
    expect(removed.data!.react.reactions).toMatchObject([
      { emoji: '😂', user: { username: 'alice' } },
    ]);
    // Removing a reaction you don't have is harmless.
    const again = await b.gql(REACT, { m: fromAlice.id, e: null });
    expect(again.errors).toBeUndefined();
  });

  it('accepts only a single emoji', async () => {
    const { b, fromAlice } = await group();
    for (const e of ['a', '❤️❤️', '', '❤', 'x'.repeat(65), '🙂 ']) {
      const res = await b.gql(REACT, { m: fromAlice.id, e });
      expect(res.errors?.[0]?.extensions?.code, JSON.stringify(e)).toBe('BAD_USER_INPUT');
    }
    for (const e of ['👨‍👩‍👧', '🇮🇳', '1️⃣']) {
      const res = await b.gql(REACT, { m: fromAlice.id, e });
      expect(res.errors, e).toBeUndefined();
    }
  });

  it('keeps reactions to members, and out of blocked direct chats', async () => {
    const { fromAlice } = await group();
    const stranger = new Client(app);
    await signUp(stranger, 'mallory');
    const res = await stranger.gql(REACT, { m: fromAlice.id, e: '❤️' });
    expect(res.errors![0]!.extensions!.code).toBe('NOT_FOUND');

    const { a, b } = await twoUsersIn('fay', 'gus');
    const conv = (await a.gql(START_DIRECT, { u: 'gus' })).data!.startDirect;
    const msg = (await a.gql(SEND, { c: conv.id, b: 'hi gus' })).data!.sendMessage;
    const gus = (await b.gql(`{ me { id } }`)).data!.me.id;
    await a.gql(`mutation($u: ID!) { blockUser(userId: $u) { id } }`, { u: gus });
    const blocked = await b.gql(REACT, { m: msg.id, e: '❤️' });
    expect(blocked.errors![0]!.extensions!.code).toBe('FORBIDDEN');
    const blocker = await a.gql(REACT, { m: msg.id, e: '❤️' });
    expect(blocker.errors![0]!.extensions!.code).toBe('FORBIDDEN');
  });

  it('rate limits reaction changes', async () => {
    const { b, fromAlice } = await group();
    for (let i = 0; i < 40; i++) {
      const res = await b.gql(REACT, { m: fromAlice.id, e: i % 2 ? '❤️' : '👍' });
      expect(res.errors).toBeUndefined();
    }
    const limited = await b.gql(REACT, { m: fromAlice.id, e: '😂' });
    expect(limited.errors![0]!.extensions!.code).toBe('RATE_LIMITED');
  });

  it('mentions a reaction in the chat list for the reactor and the author only, until the next message', async () => {
    const { a, b, c, g, fromAlice } = await group();
    const listOf = async (client: Client) =>
      (await client.gql(LIST)).data!.conversations.find((x: { id: string }) => x.id === g.id);

    await c.gql(REACT, { m: fromAlice.id, e: '😮' });
    expect((await listOf(c)).lastReaction).toEqual({
      emoji: '😮',
      user: { username: 'carol' },
      message: { id: fromAlice.id },
    });
    expect((await listOf(a)).lastReaction).toMatchObject({ emoji: '😮' });
    expect((await listOf(b)).lastReaction).toBeNull();

    await b.gql(SEND, { c: g.id, b: 'anything else?' });
    expect((await listOf(a)).lastReaction).toBeNull();
    expect((await listOf(c)).lastReaction).toBeNull();
  });

  it('never counts as unread or reorders the chat list', async () => {
    const { a, b, g, fromBob } = await group();
    // A second chat for alice, newer than the group.
    await b.gql(START_DIRECT, { u: 'alice' }).then(async (r) => {
      await b.gql(SEND, { c: r.data!.startDirect.id, b: 'newer' });
    });
    await a.gql(`mutation($c: ID!) { markRead(conversationId: $c) { id } }`, { c: g.id });
    const before = (await a.gql(LIST)).data!.conversations;
    await b.gql(REACT, { m: fromBob.id, e: '❤️' }); // bob on his own message
    await b.gql(REACT, { m: fromBob.id, e: '😂' });
    const after = (await a.gql(LIST)).data!.conversations;
    expect(after.map((x: { id: string }) => x.id)).toEqual(before.map((x: { id: string }) => x.id));
    expect(after.find((x: { id: string }) => x.id === g.id).unreadCount).toBe(0);
  });
});

/** Two fresh users (signed up as `x` and `y`). */
async function twoUsersIn(x: string, y: string) {
  const a = new Client(app);
  const b = new Client(app);
  await signUp(a, x);
  await signUp(b, y);
  return { a, b };
}

describe('cards', () => {
  const CARD = `query($u: String!) { card(username: $u) { id recipe shared user { username online lastSeenAt } } }`;
  const SAVE = `mutation($i: UpdateCardInput!) { updateCard(input: $i) { id recipe shared } }`;
  const code = (r: { errors?: Array<{ extensions?: { code?: string } }> }) =>
    r.errors?.[0]?.extensions?.code;
  const recipe = (o: Record<string, unknown>) => JSON.stringify({ v: 1, ...o });

  it('saves, reads back, resets with null and toggles sharing', async () => {
    const { a, b } = await twoUsers();
    const saved = await a.gql(SAVE, {
      i: { recipe: recipe({ about: 'Hi!', bg: 'mint', labels: false, interests: ['pizza'] }) },
    });
    expect(saved.errors).toBeUndefined();
    expect(JSON.parse(saved.data!.updateCard.recipe)).toEqual({
      v: 1,
      about: 'Hi!',
      bg: 'mint',
      labels: false,
      interests: ['pizza'],
    });
    expect(saved.data!.updateCard.shared).toBe(false);

    // Someone signed in sees it, without the owner-only `shared`.
    const seen = await b.gql(CARD, { u: 'alice' });
    expect(JSON.parse(seen.data!.card.recipe).about).toBe('Hi!');
    expect(seen.data!.card.shared).toBeNull();

    // Leaving `recipe` out keeps it; `shared` toggles.
    const shared = await a.gql(SAVE, { i: { shared: true } });
    expect(shared.data!.updateCard.shared).toBe(true);
    expect(JSON.parse(shared.data!.updateCard.recipe).bg).toBe('mint');

    const reset = await a.gql(SAVE, { i: { recipe: null } });
    expect(reset.data!.updateCard.recipe).toBeNull();
    expect(reset.data!.updateCard.shared).toBe(true);
  });

  it('signed out, only shared cards show, and unknown people look the same', async () => {
    const { a } = await twoUsers();
    const visitor = new Client(app);
    expect((await visitor.gql(CARD, { u: 'alice' })).data!.card).toBeNull();
    expect((await visitor.gql(CARD, { u: 'nobody_here' })).data!.card).toBeNull();
    await a.gql(SAVE, { i: { shared: true } });
    const open = await visitor.gql(CARD, { u: '@Alice' });
    expect(open.data!.card.user.username).toBe('alice');
    // No presence for visitors.
    expect(open.data!.card.user.online).toBe(false);
    expect(open.data!.card.user.lastSeenAt).toBeNull();
    expect(open.data!.card.shared).toBeNull();
  });

  it('someone who blocked you has no card for you', async () => {
    const { a, b } = await twoUsers();
    const bobId = (await prisma.user.findUnique({ where: { username: 'bob' } }))!.id;
    await a.gql(`mutation($u: ID!) { blockUser(userId: $u) { id } }`, { u: bobId });
    expect((await b.gql(CARD, { u: 'alice' })).data!.card).toBeNull();
    // The blocker can still look at the person they blocked.
    expect((await a.gql(CARD, { u: 'bob' })).data!.card.user.username).toBe('bob');
  });

  it('rejects cards that break the limits', async () => {
    const { a } = await twoUsers();
    const sticker = { k: 'star', x: 0.5, y: 0.5, s: 1, r: 0 };
    const bads: unknown[] = [
      '[1]',
      'nope',
      recipe({ about: 'x'.repeat(151) }),
      recipe({ about: 'a\nb\nc\nd\ne' }),
      recipe({ interests: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
      recipe({ interests: [{ t: 'x'.repeat(19) }] }),
      recipe({ interests: [{ t: 'ok', e: 'abc' }] }),
      recipe({ stickers: Array.from({ length: 9 }, () => sticker) }),
      recipe({ stickers: [{ ...sticker, x: 1.5 }] }),
      recipe({ stickers: [{ ...sticker, s: 3 }] }),
      recipe({ stickers: [{ ...sticker, e: '🍕' }] }),
      recipe({ stickers: [{ ...sticker, extra: 1 }] }),
      recipe({ bg: { nested: true } }),
      recipe({ bg: 'Not A Slug' }),
      recipe({ 'bad-key': 'x' }),
      recipe(
        Object.fromEntries(
          Array.from({ length: 41 }, (_, i) => [
            `k${'abcdefghij'[i % 10]}${'abcdefghij'[Math.floor(i / 10)]}`,
            'x',
          ]),
        ),
      ),
    ];
    for (const r of bads) {
      const res = await a.gql(SAVE, { i: { recipe: r } });
      expect(code(res), String(r).slice(0, 60)).toBe('BAD_USER_INPUT');
    }
    const long = await a.gql(SAVE, { i: { recipe: recipe({ about: 'x'.repeat(151) }) } });
    expect(long.errors![0]!.message).toBe('About me is too long');
  });

  it('normalizes text, drops duplicate interests and rounds sticker numbers', async () => {
    const { a } = await twoUsers();
    const res = await a.gql(SAVE, {
      i: {
        recipe: recipe({
          about: '  Hello  \r\nthere\u0007  ',
          interests: ['pizza', 'pizza', { t: ' Synths ', e: '🎹' }, { t: 'SYNTHS' }],
          stickers: [{ e: '🍕', x: 0.123456, y: 0.5, s: 1.23456, r: 12.7, c: 'red' }],
        }),
      },
    });
    expect(res.errors).toBeUndefined();
    const card = JSON.parse(res.data!.updateCard.recipe);
    expect(card.about).toBe('Hello\nthere');
    expect(card.interests).toEqual(['pizza', { t: 'Synths', e: '🎹' }]);
    expect(card.stickers).toEqual([{ e: '🍕', x: 0.123, y: 0.5, s: 1.23, r: 13, c: 'red' }]);
  });

  it('adds escaped link-preview tags for a shared card', () => {
    const html = withCardMeta(
      '<html><head><title>jessDek</title></head></html>',
      'Bob <b>',
      'bob',
      JSON.stringify({ about: 'Hi "there"\nsecond line' }),
    );
    expect(html).toContain('<title>Bob &#60;b&#62; (@bob) on jessDek</title>');
    expect(html).toContain('<meta property="og:description" content="Hi &#34;there&#34;">');
  });

  it('needs sign-in to save', async () => {
    const visitor = new Client(app);
    expect(code(await visitor.gql(SAVE, { i: { shared: true } }))).toBe('UNAUTHENTICATED');
  });
});

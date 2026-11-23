import { expect, test } from '@playwright/test';
import { createGroup, newUser, openDirect, send, startDirect, unique } from './helpers';

test('two people chat in realtime without reloading', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));

  // Alice starts a chat with Bob and says hello. For Bob a first message is a request.
  await openDirect(a.page, b.username);
  await send(a.page, 'hello from alice');
  await expect(
    a.page.getByRole('log', { name: 'Messages' }).getByText('hello from alice'),
  ).toBeVisible();

  // Bob never reloaded: the request simply appears, quietly. It isn't a chat of his yet.
  const bobsChats = b.page.getByRole('navigation', { name: 'Conversations' });
  const requests = bobsChats.getByRole('link', { name: 'Requests, 1 waiting' });
  await expect(requests).toBeVisible();
  await expect(bobsChats.getByRole('link', { name: /alice/i })).toHaveCount(0);

  // Opening it shows the message, and accepting turns it into a chat in his list.
  await requests.click();
  await b.page.getByRole('link', { name: new RegExp(`@${a.username}`) }).click();
  await expect(
    b.page.getByRole('log', { name: 'Messages' }).getByText('hello from alice'),
  ).toBeVisible();
  await b.page.getByRole('button', { name: 'Accept' }).click();
  const bobsChat = bobsChats.getByRole('link', { name: /alice/i });
  await expect(bobsChat).toBeVisible();
  await expect(bobsChat).toContainText('hello from alice');
  await expect(requests).toHaveCount(0);
  await expect(bobsChat.getByLabel(/unread/)).toHaveCount(0); // he's reading it

  // Bob replies and Alice sees it instantly, in the chat she already has open.
  await send(b.page, 'hi alice!');
  await expect(a.page.getByRole('log', { name: 'Messages' }).getByText('hi alice!')).toBeVisible();

  // Messages in the open chat don't create unread badges.
  await expect(
    a.page.getByRole('navigation', { name: 'Conversations' }).getByLabel(/unread/),
  ).toHaveCount(0);

  // Typing indicator reaches the other person.
  await b.page.getByLabel('Message', { exact: true }).pressSequentially('typing now');
  await expect(a.page.getByText(/is typing/)).toBeVisible();

  // Presence: Bob is online from Alice's point of view.
  await expect(a.page.getByRole('region', { name: /Chat with/ }).getByText('Online')).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('group chats reach everyone and show unread counts', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  const c = await newUser(browser, unique('carol'));

  // The others are invited, and join from Requests.
  await createGroup(a, 'Weekend plans', [b, c]);

  await send(a.page, 'who is in?');
  const carolsRow = c.page
    .getByRole('navigation', { name: 'Conversations' })
    .getByRole('link', { name: /Weekend plans/ });
  await expect(carolsRow.getByLabel('1 unread')).toBeVisible();

  await carolsRow.click();
  await send(c.page, 'me!');
  await expect(a.page.getByRole('log', { name: 'Messages' }).getByText('me!')).toBeVisible();
  await expect(
    b.page
      .getByRole('navigation', { name: 'Conversations' })
      .getByRole('link', { name: /Weekend plans/ })
      .getByLabel('2 unread'),
  ).toBeVisible();

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test('history survives a reload and pages in earlier messages', async ({ browser }) => {
  // Forty sends one after another: on a busy machine that alone can come close to the default 30 s.
  test.slow();
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(a, b);
  for (let i = 1; i <= 40; i++) {
    await send(a.page, `message ${i}`);
    if (i % 25 === 0) await a.page.waitForTimeout(10_500); // stay under the 30 messages / 10s limit
  }
  await expect(a.page.getByRole('log').getByText('message 40', { exact: true })).toBeVisible();

  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Chats' })).toBeVisible(); // still signed in (cookie)
  await a.page.getByRole('navigation', { name: 'Conversations' }).getByRole('link').first().click();
  const log = a.page.getByRole('log', { name: 'Messages' });
  await expect(log.getByText('message 40', { exact: true })).toBeVisible();

  // Scrolling to the top loads the earlier page.
  await log.evaluate((el) => (el.scrollTop = 0));
  await expect(log.getByText('message 1', { exact: true })).toBeVisible();

  await a.context.close();
  await b.context.close();
});

for (const [label, viewport] of [
  ['desktop', { width: 1100, height: 760 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test(`group chats show who is typing, with their picture (${label})`, async ({ browser }) => {
    const a = await newUser(browser, unique('alice'), viewport);
    const b = await newUser(browser, unique('bob'), viewport);
    const c = await newUser(browser, unique('carol'), viewport);
    await createGroup(a, 'Typing club', [b, c]);
    for (const u of [b, c]) {
      await u.page
        .getByRole('navigation', { name: 'Conversations' })
        .getByRole('link', { name: /Typing club/ })
        .click();
    }

    // Alice types: Bob and Carol see her face (her initial, on her colour) beside the dots.
    await a.page
      .getByLabel('Message', { exact: true })
      .pressSequentially('on my way', { delay: 30 });
    for (const u of [b, c]) {
      const bubble = u.page.locator('[data-typing-bubble]');
      await expect(bubble).toBeVisible();
      await expect(bubble.locator('[data-typing-face]')).toHaveCount(1);
      // Their face: the default character (they haven't made their own), titled with their name.
      await expect(bubble.locator('[data-typing-face] svg')).toHaveCount(1);
      await expect(bubble.locator('[data-typing-face]')).toHaveAttribute('title', a.username);
      await expect(bubble.locator('.typing-dot')).toHaveCount(3);
    }

    // Bob types as well: Carol now sees both of them, and it fits on a phone.
    await b.page.getByLabel('Message', { exact: true }).pressSequentially('me too', { delay: 30 });
    await expect(c.page.locator('[data-typing-bubble] [data-typing-face]')).toHaveCount(2);
    const overflow = await c.page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await a.context.close();
    await b.context.close();
    await c.context.close();
  });
}

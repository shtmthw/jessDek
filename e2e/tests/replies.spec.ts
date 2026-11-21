import { expect, test, type Page } from '@playwright/test';
import { closeWelcome, createGroup, newUser, send, startDirect, unique } from './helpers';

const log = (page: Page) => page.getByRole('log', { name: 'Messages' });
/** A message's row (bubble, chips and toolbar) by its text. */
const row = (page: Page, text: string) =>
  page.locator('.group\\/msg', { has: page.locator('[data-message-key]', { hasText: text }) });
const chips = (page: Page, text: string) => row(page, text).locator('[data-reaction-chips]');

test('replies in a direct chat: the quote arrives live and jumps to the original', async ({
  browser,
}) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(b.page, a.username);
  await send(b.page, 'are we still on for 7?');
  await expect(log(b.page).getByText('are we still on for 7?')).toBeVisible();

  await a.page.getByRole('link', { name: new RegExp(b.username) }).click();
  const original = row(a.page, 'are we still on for 7?');
  await original.hover();
  await original.getByRole('button', { name: 'Reply' }).click();
  await expect(a.page.locator('[data-reply-bar]')).toContainText('are we still on for 7?');
  await expect(a.page.getByLabel('Message', { exact: true })).toBeFocused();
  await send(a.page, 'yes, see you there');
  await expect(a.page.locator('[data-reply-bar]')).toHaveCount(0);

  // Bob sees the reply with its quote, without reloading.
  const reply = b.page.locator('[data-message-key]', { hasText: 'yes, see you there' });
  await expect(reply.locator('[data-reply-quote]')).toContainText('You');
  await expect(reply.locator('[data-reply-quote]')).toContainText('are we still on for 7?');

  // Tapping the quote rings the original.
  await reply.locator('[data-reply-quote]').click();
  await expect(
    b.page.locator('.message-flash', { hasText: 'are we still on for 7?' }),
  ).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('reactions in a group reach everyone live: set, change, remove', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  const c = await newUser(browser, unique('carol'));
  await createGroup(a.page, 'Hike', [b.username, c.username]);
  await send(a.page, 'trail map is up');
  for (const u of [b, c]) {
    await u.page.getByRole('link', { name: /Hike/ }).click();
    await expect(log(u.page).getByText('trail map is up')).toBeVisible();
  }

  const msg = row(c.page, 'trail map is up');
  await msg.hover();
  await msg.getByRole('button', { name: 'React', exact: true }).click();
  await c.page.getByRole('button', { name: 'React ❤️' }).click();
  for (const u of [a, b, c]) await expect(chips(u.page, 'trail map is up')).toContainText('❤️');

  await msg.hover();
  await msg.getByRole('button', { name: 'React', exact: true }).click();
  await c.page.getByRole('button', { name: 'React 😂' }).click();
  for (const u of [a, b]) {
    await expect(chips(u.page, 'trail map is up')).toContainText('😂');
    await expect(chips(u.page, 'trail map is up')).not.toContainText('❤️');
  }

  // Picking the same emoji again takes it back.
  await msg.hover();
  await msg.getByRole('button', { name: 'React', exact: true }).click();
  await c.page.getByRole('button', { name: 'Remove 😂' }).click();
  for (const u of [a, b, c]) await expect(chips(u.page, 'trail map is up')).toHaveCount(0);

  for (const u of [a, b, c]) await u.context.close();
});

test('on a phone, a long-press opens the reaction bar', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const phone = await context.newPage();
  const name = unique('bob');
  await phone.goto('/');
  await phone.getByRole('tab', { name: 'Sign up' }).click();
  await phone.getByLabel('Username').fill(name);
  await phone.getByLabel('Email').fill(`${name}@example.com`);
  await phone.getByLabel('Password', { exact: true }).fill('test-password-1');
  await phone.getByRole('button', { name: 'Create account' }).click();
  await closeWelcome(phone);
  await expect(phone.getByRole('heading', { name: 'Chats' })).toBeVisible();

  await startDirect(a.page, name);
  await send(a.page, 'hold me down');
  await phone.getByRole('link', { name: new RegExp(a.username) }).click();
  const bubble = log(phone).getByText('hold me down', { exact: true });
  await expect(bubble).toBeVisible();
  // Let the chat pane finish sliding in before measuring where the bubble is.
  await expect(phone.getByRole('region', { name: /Chat with/ })).toHaveCSS('transform', 'none');
  await phone.waitForTimeout(300);

  const box = (await bubble.boundingBox())!;
  const cdp = await context.newCDPSession(phone);
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  await phone.waitForTimeout(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // Still open after the finger lifts.
  await expect(phone.getByRole('toolbar', { name: 'React' })).toBeVisible();
  await expect(phone.getByRole('menuitem', { name: 'Reply' })).toBeVisible();
  await phone.getByRole('button', { name: 'React 👍' }).click();
  await expect(chips(a.page, 'hold me down')).toContainText('👍');

  await a.context.close();
  await context.close();
});

import { expect, test, type Page } from '@playwright/test';
import { createGroup, newUser, send, startDirect, unique } from './helpers';

const list = (page: Page) => page.getByRole('navigation', { name: 'Conversations' });
const row = (page: Page, name: RegExp) => list(page).getByRole('link', { name });
const chatMenu = async (page: Page, item: RegExp) => {
  await page.getByRole('button', { name: 'Chat options' }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test('blocking ends a direct chat for both people, and unblocking brings it back', async ({
  browser,
}) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(a, b);
  await send(a.page, 'hello');
  await row(b.page, /alice/i).click();
  await expect(b.page.getByRole('region', { name: /Chat with/ }).getByText('Online')).toBeVisible();

  await chatMenu(a.page, /^Block/);
  await expect(a.page.getByText(`You blocked ${b.username}.`)).toBeVisible();
  await expect(a.page.getByLabel('Message', { exact: true })).toHaveCount(0);

  // Bob's side updates live: no box to type in, and Alice no longer shows as online.
  await expect(b.page.getByText('You can’t reply to this conversation.')).toBeVisible();
  await expect(b.page.getByLabel('Message', { exact: true })).toHaveCount(0);
  await expect(b.page.getByRole('region', { name: /Chat with/ }).getByText('Online')).toHaveCount(
    0,
  );

  // Unblocking from the banner restores everything.
  await a.page.getByRole('button', { name: 'Unblock' }).click();
  await expect(a.page.getByLabel('Message', { exact: true })).toBeVisible();
  await expect(b.page.getByLabel('Message', { exact: true })).toBeVisible();
  await send(b.page, 'we’re good');
  await expect(a.page.getByRole('log', { name: 'Messages' }).getByText('we’re good')).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('someone who blocked you can’t be messaged or added; Settings lists and unblocks', async ({
  browser,
}) => {
  const a = await newUser(browser, unique('alice'));
  const c = await newUser(browser, unique('carol'));
  const b = await newUser(browser, unique('bob'));
  await createGroup(a, 'Hikers', [b, c]);

  // Carol blocks Alice from the group's member list.
  await row(c.page, /Hikers/).click();
  await c.page.getByRole('button', { name: 'Chat options' }).click();
  await c.page.getByRole('menuitem', { name: 'Group info' }).click();
  await c.page.getByRole('button', { name: new RegExp(`Options for ${a.username}`) }).click();
  await c.page.getByRole('menuitem', { name: 'Block' }).click();
  await expect(c.page.getByRole('dialog').getByText(`@${a.username} · Blocked`)).toBeVisible();
  await c.page.keyboard.press('Escape');

  // Alice can't start a chat with her; the group itself carries on.
  await a.page.getByRole('button', { name: 'New chat' }).first().click();
  await a.page.getByLabel('Search people by username').fill(c.username.slice(0, 6));
  await a.page.getByRole('button', { name: new RegExp(`@${c.username}`) }).click();
  await expect(a.page.getByText('You can’t message this person')).toBeVisible();
  await a.page.keyboard.press('Escape');
  await send(a.page, 'still in the group');
  await expect(
    c.page.getByRole('log', { name: 'Messages' }).getByText('still in the group'),
  ).toBeVisible();

  await c.page.getByRole('link', { name: 'Settings' }).click();
  await expect(c.page.getByText(`@${a.username}`)).toBeVisible();
  await c.page.getByRole('button', { name: 'Unblock' }).click();
  await expect(c.page.getByText('Nobody. You can block someone from a chat’s menu.')).toBeVisible();

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test('a muted chat is silent: grey badge, not in the tab title', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(b, a);
  await send(b.page, 'first');
  await row(a.page, /bob/i).click();
  await chatMenu(a.page, /Mute notifications/);
  await expect(row(a.page, /bob/i).getByLabel('Muted')).toBeVisible();
  await a.page.getByRole('link', { name: 'Settings' }).click(); // look away from the chat

  await send(b.page, 'are you there?');
  await expect(row(a.page, /bob/i).getByLabel('1 unread')).toBeVisible();
  await expect(a.page).toHaveTitle('jessDek');

  await row(a.page, /bob/i).click();
  await chatMenu(a.page, /Unmute notifications/);
  await expect(row(a.page, /bob/i).getByLabel('Muted')).toHaveCount(0);

  await a.context.close();
  await b.context.close();
});

test('a removed chat leaves the list and comes back with the next message', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(a, b);
  await send(a.page, 'hi');
  await chatMenu(a.page, /Remove chat/);
  await expect(a.page.getByText('Chat removed')).toBeVisible();
  await expect(row(a.page, /bob/i)).toHaveCount(0);
  await expect(row(b.page, /alice/i)).toBeVisible(); // only gone for Alice

  await row(b.page, /alice/i).click();
  await send(b.page, 'hey, come back');
  await expect(row(a.page, /bob/i)).toContainText('hey, come back');
  await expect(row(a.page, /bob/i).getByLabel('1 unread')).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('the group owner can remove a member', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  const c = await newUser(browser, unique('carol'));
  await createGroup(a, 'Book club', [b, c]);
  await expect(row(c.page, /Book club/)).toBeVisible();

  // Bob isn't the owner: no remove option for him.
  await row(b.page, /Book club/).click();
  await b.page.getByRole('button', { name: 'Chat options' }).click();
  await b.page.getByRole('menuitem', { name: 'Group info' }).click();
  await b.page.getByRole('button', { name: new RegExp(`Options for ${c.username}`) }).click();
  await expect(b.page.getByRole('menuitem', { name: 'Remove from group' })).toHaveCount(0);
  await b.page.keyboard.press('Escape');

  await a.page.getByRole('button', { name: 'Chat options' }).click();
  await a.page.getByRole('menuitem', { name: 'Group info' }).click();
  await a.page.getByRole('button', { name: new RegExp(`Options for ${c.username}`) }).click();
  await a.page.getByRole('menuitem', { name: 'Remove from group' }).click();
  await expect(a.page.getByText(new RegExp(`Removed ${c.username} from Book club`))).toBeVisible();
  await expect(row(c.page, /Book club/)).toHaveCount(0);

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

import { expect, type Browser, type Page } from '@playwright/test';

export const unique = (name: string) => `${name}${Math.random().toString(36).slice(2, 7)}`;

export async function signUp(page: Page, username: string, password = 'test-password-1') {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Sign up' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await closeWelcome(page);
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
}

/** A new account is greeted once; close it the way most people will. */
export async function closeWelcome(page: Page) {
  const welcome = page.getByRole('dialog', { name: 'Welcome to jessDek' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Start chatting' }).click();
  await expect(welcome).toBeHidden();
}

/** A fresh browser context (own cookies) with a page that is already signed up. */
export async function newUser(
  browser: Browser,
  username: string,
  viewport?: { width: number; height: number },
) {
  const context = await browser.newContext({ viewport: viewport ?? { width: 1100, height: 760 } });
  const page = await context.newPage();
  await signUp(page, username);
  return { context, page, username };
}

/** Someone in a test: their browser page and the username they signed up with. */
export interface Person {
  page: Page;
  username: string;
}

/**
 * Opens a chat with `username` from the new-chat dialog. With someone new it's a message request:
 * the page shows the request composer, and the person on the other side sees nothing until you
 * send your one message.
 */
export async function openDirect(page: Page, username: string) {
  await page.getByRole('button', { name: 'New chat' }).first().click();
  await page.getByLabel('Search people by username').fill(username.slice(0, 6));
  await page.getByRole('button', { name: new RegExp(`@${username}`) }).click();
  await expect(
    page.getByRole('log', { name: 'Messages' }).or(page.getByText(/Say hi to/)),
  ).toBeVisible();
}

/** The one message that opens a chat when a test doesn't care what it says. */
export const INTRO = 'Hi! Can we chat?';

/**
 * Makes `a` and `b` chat partners the way people really do it: `a` opens a chat and sends the one
 * message a request allows, and `b` finds it under Requests and accepts. Afterwards `a` is in the
 * chat with its ordinary composer, and `b` is back on their chat list (the opening message read).
 */
export async function startDirect(a: Person, b: Person, intro = INTRO) {
  await openDirect(a.page, b.username);
  await send(a.page, intro);
  await expect(a.page.getByRole('log', { name: 'Messages' }).getByText(intro)).toBeVisible();

  await b.page.getByRole('link', { name: /^Requests, \d+ waiting$/ }).click();
  await b.page.getByRole('link', { name: new RegExp(`@${a.username}`) }).click();
  await b.page.getByRole('button', { name: 'Accept' }).click();
  await expect(b.page.getByLabel('Message', { exact: true })).toBeVisible();
  await leaveChat(b.page);
  // The sender's composer turns into a chat's, live.
  await expect(a.page.getByLabel('Message', { exact: true })).toBeVisible();
  await expect(a.page.getByRole('button', { name: 'Add photos or videos' })).toBeVisible();
}

/** Esc goes back to the chat list (on a phone: to the list, as a back swipe would). */
export async function leaveChat(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Chat with/ })).toHaveCount(0);
}

export async function send(page: Page, text: string) {
  const box = page.getByLabel('Message', { exact: true });
  await box.fill(text);
  await box.press('Enter');
}

/** Picks files through the composer's (hidden) file input, like the attach button would. */
export async function attach(page: Page, ...paths: string[]) {
  await page.locator('input[data-media-input]').setInputFiles(paths);
}

/** Largest request body sent to /graphql by this page so far (HTTP only; the WebSocket is separate). */
export function watchGraphqlBodies(page: Page) {
  const sizes: number[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/graphql') && req.method() === 'POST')
      sizes.push(req.postDataBuffer()?.length ?? 0);
  });
  return { max: () => Math.max(0, ...sizes), count: () => sizes.length };
}

/**
 * Creates a group from the new-chat dialog, as its owner. Everyone else is only invited: they
 * see an invite under Requests and aren't in the group until they join.
 */
export async function inviteToGroup(page: Page, name: string, members: string[]) {
  await page.getByRole('button', { name: 'New chat' }).first().click();
  await page.getByRole('tab', { name: 'Group' }).click();
  await page.getByLabel('Group name').fill(name);
  for (const username of members) {
    await page.getByLabel('Search people by username').fill(username.slice(0, 6));
    await page.getByRole('button', { name: new RegExp(`@${username}`) }).click();
  }
  await page
    .getByRole('button', {
      name: new RegExp(`Create group and invite ${members.length} (person|people)`),
    })
    .click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

/** `person` opens the group invite waiting under Requests and joins, then goes back to their chat list. */
export async function joinGroup(person: Person, name: string) {
  const { page } = person;
  await page.getByRole('link', { name: /^Requests, \d+ waiting$/ }).click();
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: 'Join group' }).click();
  // The invite page has a heading with the same name, so wait for the chat itself.
  await expect(page.getByRole('region', { name: /Chat with/ })).toBeVisible();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  await leaveChat(page);
}

/**
 * A group everyone has joined: `owner` creates it and invites `members`, who each accept from
 * Requests. Afterwards the owner is in the group, and the others are on their chat lists.
 */
export async function createGroup(owner: Person, name: string, members: Person[]) {
  await inviteToGroup(
    owner.page,
    name,
    members.map((m) => m.username),
  );
  for (const member of members) await joinGroup(member, name);
}

import { expect, test, type Page } from '@playwright/test';
import { inviteToGroup, newUser, openDirect, send, signUp, unique } from './helpers';

/**
 * Message requests (a new direct chat: one text message until the other person accepts) and
 * group invites (nobody is in a group until they join). Two browsers each time, like two people.
 */

const PHONE = { width: 390, height: 844 };

const chatList = (page: Page) => page.getByRole('navigation', { name: 'Conversations' });
const requestsRow = (page: Page, waiting?: number) =>
  chatList(page).getByRole('link', {
    name: waiting === undefined ? /^Requests, \d+ waiting$/ : `Requests, ${waiting} waiting`,
  });
const log = (page: Page) => page.getByRole('log', { name: 'Messages' });
const composer = (page: Page) => page.getByLabel('Message', { exact: true });
const toast = (page: Page, text: string | RegExp) =>
  page.locator('[data-sonner-toast]', { hasText: text });
/** Where the composer would be: the request's Accept / Decline bar, or the sender's status. */
const requestBar = (page: Page) =>
  page.getByRole('region', { name: 'Message request', exact: true });
const requestsHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Requests', exact: true });

/** The request composer: no photos, and it says what the other person will get. */
async function expectRequestComposer(page: Page, name: string) {
  await expect(page.getByPlaceholder(`Send ${name} a message request`)).toBeVisible();
  await expect(page.getByText(/gets this as a request/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add photos or videos' })).toHaveCount(0);
}

/** From the chat list: Requests, then the request from `username`. */
async function openRequestFrom(page: Page, username: string) {
  await requestsRow(page).click();
  await expect(requestsHeading(page)).toBeVisible();
  await page.getByRole('link', { name: new RegExp(`@${username}`) }).click();
}

test('a new chat is a request: one message, then the composer locks until it is accepted', async ({
  browser,
}) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));

  // Alice opens a chat with Bob. Nothing reaches Bob yet.
  await openDirect(a.page, b.username);
  await expectRequestComposer(a.page, b.username);
  await expect(a.page.getByRole('region', { name: /Chat with/ })).toContainText('Message request');
  await a.page.waitForTimeout(500);
  await expect(requestsRow(b.page)).toHaveCount(0);

  // Her one message goes out, and the composer is replaced by what's happening to it.
  await send(a.page, 'hi Bob, it’s Alice from the climbing gym');
  await expect(log(a.page).getByText('hi Bob, it’s Alice from the climbing gym')).toBeVisible();
  const status = requestBar(a.page).getByRole('status');
  await expect(status).toContainText(`Request sent · ${b.username} can accept or decline`);
  await expect(composer(a.page)).toHaveCount(0);

  // Bob's list shows it quietly, without reloading: a Requests row, not a chat, and no badge in
  // the tab title.
  await expect(requestsRow(b.page, 1)).toBeVisible();
  await expect(chatList(b.page).getByRole('link', { name: new RegExp(a.username) })).toHaveCount(0);
  await expect(b.page).toHaveTitle('jessDek');

  // Opening it shows the message, and who it's from, with Accept / Decline / Block where the
  // composer would be. Bob can't reply yet.
  await openRequestFrom(b.page, a.username);
  await expect(log(b.page).getByText('hi Bob, it’s Alice from the climbing gym')).toBeVisible();
  await expect(b.page.getByRole('region', { name: /Chat with/ })).toContainText('Message request');
  const bar = requestBar(b.page);
  await expect(bar).toContainText(`${a.username} wants to message you`);
  await expect(bar.getByRole('button', { name: 'Block' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Decline' })).toBeVisible();
  await expect(composer(b.page)).toHaveCount(0);

  // Accepting makes it a chat for both, live: Bob gets a composer, and Alice is told.
  await bar.getByRole('button', { name: 'Accept' }).click();
  await expect(composer(b.page)).toBeVisible();
  await expect(b.page.getByRole('button', { name: 'Add photos or videos' })).toBeVisible();
  await expect(requestsRow(b.page)).toHaveCount(0);
  await expect(chatList(b.page).getByRole('link', { name: new RegExp(a.username) })).toBeVisible();
  await expect(toast(a.page, `${b.username} accepted your message request`)).toBeVisible();
  await expect(composer(a.page)).toBeVisible();
  await expect(status).toHaveCount(0);
  await expect(a.page.getByRole('button', { name: 'Add photos or videos' })).toBeVisible();

  // And now they just talk, both ways.
  await send(b.page, 'hi Alice! sure');
  await expect(log(a.page).getByText('hi Alice! sure')).toBeVisible();
  await send(a.page, 'great, see you at 7');
  await expect(log(b.page).getByText('great, see you at 7')).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('the sender is told when a request is declined, and can’t send another', async ({
  browser,
}) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await openDirect(a.page, b.username);
  await send(a.page, 'hello?');
  await expect(requestsRow(b.page, 1)).toBeVisible();

  await openRequestFrom(b.page, a.username);
  await b.page.getByRole('button', { name: 'Decline' }).click();
  // Bob goes back to Requests, which is empty now, and the row leaves his list.
  await expect(toast(b.page, 'Request declined')).toBeVisible();
  await expect(b.page.getByText('No requests')).toBeVisible();
  await expect(requestsRow(b.page)).toHaveCount(0);

  // Alice finds out, in the toast and in the chat itself, and can't write again.
  await expect(toast(a.page, `${b.username} declined your message request`)).toBeVisible();
  await expect(requestBar(a.page).getByRole('status')).toContainText(
    `${b.username} declined your message request`,
  );
  await expect(composer(a.page)).toHaveCount(0);
  await expect(chatList(a.page).getByRole('link', { name: new RegExp(b.username) })).toContainText(
    'declined your request',
  );

  // It stays declined, also after a reload…
  await a.page.reload();
  await chatList(a.page)
    .getByRole('link', { name: new RegExp(b.username) })
    .click();
  await expect(composer(a.page)).toHaveCount(0);
  await expect(requestBar(a.page).getByRole('status')).toContainText(
    'declined your message request',
  );

  // …until Bob is the one who reaches out. Then they just chat, and Alice's composer is back.
  await openDirect(b.page, a.username);
  await expect(composer(b.page)).toBeVisible();
  await expect(b.page.getByText(/gets this as a request/)).toHaveCount(0);
  await expect(composer(a.page)).toBeVisible();
  await send(b.page, 'sorry, hi!');
  await expect(log(a.page).getByText('sorry, hi!')).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('declining stays on Requests when the live update arrives late', async ({ browser }) => {
  // On a slow machine the "request gone" event can reach Bob just after the Decline response,
  // while the request is still on screen. It must not send him to the home screen. Hold that
  // event until the response is in, and slow Bob's CPU down, to make the timing certain.
  const a = await newUser(browser, unique('alice'));
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  let holding = false;
  const held: (() => void)[] = [];
  await context.routeWebSocket(/\/graphql/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((m) => {
      if (holding && String(m).includes('ConversationUpdated')) held.push(() => ws.send(m));
      else ws.send(m);
    });
    ws.onMessage((m) => server.send(m));
  });
  const page = await context.newPage();
  const b = { page, username: unique('bob') };
  await signUp(page, b.username);
  await openDirect(a.page, b.username);
  await send(a.page, 'hello?');
  await expect(requestsRow(page, 1)).toBeVisible();
  await openRequestFrom(page, a.username);
  await expect(requestBar(page).getByRole('button', { name: 'Decline' })).toBeVisible();

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  holding = true;
  const answered = page.waitForResponse((r) =>
    /respondToRequest/.test(r.request().postData() ?? ''),
  );
  await requestBar(page).getByRole('button', { name: 'Decline' }).click();
  await (await answered).finished();
  holding = false;
  for (const release of held.splice(0)) release();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  await expect(page.getByText('No requests')).toBeVisible();
  await page.waitForTimeout(1000); // the late event has been handled by now
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByText('No requests')).toBeVisible();

  await a.context.close();
  await context.close();
});

test('blocking from a request declines it, and tells the sender the same', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await openDirect(a.page, b.username);
  await send(a.page, 'psst');
  await expect(requestsRow(b.page, 1)).toBeVisible();

  await openRequestFrom(b.page, a.username);
  await b.page.getByRole('button', { name: 'Block' }).click();
  await expect(toast(b.page, `Blocked ${a.username}`)).toBeVisible();
  await expect(requestsRow(b.page)).toHaveCount(0);

  // For Alice it's an ordinary decline: she can't tell it was a block from the request.
  await expect(composer(a.page)).toHaveCount(0);
  await expect(requestBar(a.page).getByRole('status')).toContainText(
    'declined your message request',
  );

  await a.context.close();
  await b.context.close();
});

test('a group invite shows who invited you and who is in, and the group is yours once you join', async ({
  browser,
}) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await inviteToGroup(a.page, 'Book club', [b.username]);
  await expect(a.page.getByRole('region', { name: /Chat with/ })).toContainText('1 invited');
  await send(a.page, 'welcome to the club');

  // Bob's Requests row appears live. The group isn't in his chats, and the invite doesn't show its
  // messages.
  await expect(requestsRow(b.page, 1)).toBeVisible();
  await expect(chatList(b.page).getByRole('link', { name: /Book club/ })).toHaveCount(0);
  await requestsRow(b.page).click();
  await expect(b.page.getByRole('region', { name: 'Group invites' })).toContainText(
    `${a.username} invited you · 1 member`,
  );
  await b.page.getByRole('link', { name: /Book club/ }).click();
  await expect(b.page.getByRole('heading', { name: 'Book club' })).toBeVisible();
  await expect(b.page.getByText(/invited you to join/)).toContainText(a.username);
  await expect(b.page.getByText('welcome to the club')).toHaveCount(0);
  await expect(b.page.getByRole('button', { name: 'Decline' })).toBeVisible();

  // Joining lands in the group; Alice is told, and the invited count is gone from her header.
  await b.page.getByRole('button', { name: 'Join group' }).click();
  await expect(toast(b.page, 'You joined Book club')).toBeVisible();
  await expect(b.page.getByRole('region', { name: /Chat with/ })).toContainText('2 members');
  await expect(chatList(b.page).getByRole('link', { name: /Book club/ })).toBeVisible();
  await expect(requestsRow(b.page)).toHaveCount(0);
  await expect(toast(a.page, `${b.username} joined Book club`)).toBeVisible();
  await expect(a.page.getByRole('region', { name: /Chat with/ })).toContainText('2 members');
  await expect(a.page.getByRole('region', { name: /Chat with/ })).not.toContainText('invited');

  await send(b.page, 'glad to be here');
  await expect(log(a.page).getByText('glad to be here')).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('a declined invite shows in Group info, and an invite can be taken back', async ({
  browser,
}) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  const c = await newUser(browser, unique('carol'));
  await inviteToGroup(a.page, 'Hikers', [b.username, c.username]);
  await expect(requestsRow(b.page, 1)).toBeVisible();
  await expect(requestsRow(c.page, 1)).toBeVisible();

  // Bob says no. Alice is told, and so is Group info.
  await requestsRow(b.page).click();
  await b.page.getByRole('link', { name: /Hikers/ }).click();
  await b.page.getByRole('button', { name: 'Decline' }).click();
  await expect(toast(b.page, 'Invite declined')).toBeVisible();
  await expect(requestsRow(b.page)).toHaveCount(0);
  await expect(chatList(b.page).getByRole('link', { name: /Hikers/ })).toHaveCount(0);
  await expect(toast(a.page, `${b.username} declined the invite to Hikers`)).toBeVisible();

  await a.page.getByRole('button', { name: 'Chat options' }).click();
  await a.page.getByRole('menuitem', { name: 'Group info' }).click();
  const info = a.page.getByRole('dialog');
  await expect(info.getByRole('heading', { name: 'Invited', exact: true })).toBeVisible();
  const declined = info.getByRole('listitem').filter({ hasText: b.username });
  await expect(declined).toContainText('Declined the invite');
  const waiting = info.getByRole('listitem').filter({ hasText: c.username });
  await expect(waiting).toContainText('Invited by you');

  // A pending invite can be taken back by the person who sent it. Carol's disappears live.
  await waiting.getByRole('button', { name: `Take back the invite to ${c.username}` }).click();
  await expect(waiting).toHaveCount(0);
  await expect(requestsRow(c.page)).toHaveCount(0);
  // The "no" stays on record.
  await expect(declined).toContainText('Declined the invite');

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test('on a phone, Requests and an invite are screens of their own', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'), PHONE);
  const b = await newUser(browser, unique('bob'), PHONE);
  await inviteToGroup(a.page, 'Picnic', [b.username]);
  await a.page.getByRole('link', { name: 'Back to chats' }).click();
  await openDirect(a.page, b.username);
  await send(a.page, 'hi from the picnic crowd');

  // The Requests row counts both. It opens its own screen, with a way back to the chats.
  await expect(requestsRow(b.page, 2)).toBeVisible();
  await requestsRow(b.page).click();
  await expect(requestsHeading(b.page)).toBeVisible();
  await expect(b.page.getByRole('heading', { name: 'Chats' })).toBeHidden();
  await expect(b.page.getByRole('region', { name: 'Group invites' })).toBeVisible();
  await expect(b.page.getByRole('region', { name: 'Message requests' })).toBeVisible();
  await b.page.getByRole('link', { name: 'Back to chats' }).click();
  await expect(b.page.getByRole('heading', { name: 'Chats' })).toBeVisible();

  // The invite is a screen too, with Join group in reach; joining lands in the chat.
  await requestsRow(b.page).click();
  await b.page.getByRole('link', { name: /Picnic/ }).click();
  const join = b.page.getByRole('button', { name: 'Join group' });
  await expect(join).toBeVisible();
  // (The card springs in from a touch smaller, so wait for it to settle before measuring.)
  await expect.poll(async () => (await join.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await join.click();
  await expect(b.page.getByRole('heading', { name: 'Picnic' })).toBeVisible();

  // Nothing overflows sideways on either screen.
  for (const { page } of [a, b]) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }

  await a.context.close();
  await b.context.close();
});

import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { attach } from '../tests/helpers';

const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

type Scheme = 'light' | 'dark';

async function signIn(
  browser: Browser,
  who: string,
  scheme: Scheme,
  viewport = DESKTOP,
  scale = 2,
) {
  const context = await browser.newContext({
    viewport,
    colorScheme: scheme,
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Username or email').fill(who);
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
  return { context, page };
}

const settle = async (page: Page, ms = 600) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
};

const chat = (page: Page, title: RegExp) =>
  page.getByRole('navigation', { name: 'Conversations' }).getByRole('link', { name: title });

test('capture README screenshots', async ({ browser }) => {
  // People who are "online" while we take the pictures.
  const bob = await signIn(browser, 'bob', 'light', DESKTOP, 1);
  const carol = await signIn(browser, 'carol', 'light', DESKTOP, 1);
  const dave = await signIn(browser, 'dave', 'light', DESKTOP, 1);
  await chat(dave.page, /Weekend hike/).click();

  // Sign-in screen
  for (const scheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: scheme,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByRole('tab', { name: 'Sign up' }).click();
    await settle(page);
    await page.screenshot({ path: `${OUT}auth-${scheme}.png` });
    await ctx.close();
  }

  // Pass 1 (before anything is read): direct message + phone views show the unread badge.
  for (const scheme of ['light', 'dark'] as const) {
    const desk = await signIn(browser, 'alice', scheme);
    await chat(desk.page, /Bob Carter/).click();
    await expect(desk.page.getByText('Absolutely, send me the link')).toBeVisible();
    await settle(desk.page);
    await desk.page.screenshot({ path: `${OUT}desktop-chat-${scheme}.png` });
    await desk.context.close();

    const phone = await signIn(browser, 'alice', scheme, PHONE, 3);
    await settle(phone.page);
    await phone.page.screenshot({ path: `${OUT}mobile-list-${scheme}.png` });
    await chat(phone.page, /Bob Carter/).click();
    await expect(phone.page.getByText('Absolutely, send me the link')).toBeVisible();
    await settle(phone.page);
    await phone.page.screenshot({ path: `${OUT}mobile-chat-${scheme}.png` });
    await phone.context.close();
  }

  // Pass 2: group chat with someone typing, and the new-chat dialog.
  for (const scheme of ['light', 'dark'] as const) {
    const desk = await signIn(browser, 'alice', scheme);
    await chat(desk.page, /Weekend hike/).click();
    await expect(desk.page.getByText('Trail map is in the shared folder')).toBeVisible();
    await dave.page
      .getByLabel('Message', { exact: true })
      .pressSequentially('Meet at the trailhead', { delay: 20 });
    await expect(desk.page.getByText(/is typing/)).toBeVisible();
    await settle(desk.page, 300);
    await desk.page.screenshot({ path: `${OUT}desktop-group-${scheme}.png` });
    await dave.page.getByLabel('Message', { exact: true }).fill('');

    if (scheme === 'light') {
      await desk.page.getByRole('button', { name: 'New chat' }).first().click();
      await desk.page.getByLabel('Search people by username').fill('er');
      await expect(desk.page.getByRole('button', { name: /@erin/ })).toBeVisible();
      await settle(desk.page, 300);
      await desk.page.screenshot({ path: `${OUT}new-chat-light.png` });
    }
    await desk.context.close();
  }

  // Pass 3: photos and videos. The seed can't hold any (the server never stores media), so Alice
  // adds some live, last, so the earlier pictures are unaffected.
  const sendMedia = async (page: Page, caption: string) => {
    await chat(page, /Bob Carter/).click();
    await expect(page.getByText('Absolutely, send me the link')).toBeVisible();
    await attach(page, fixture('photo-gps.jpg'), fixture('clip.webm'), fixture('photo-gps.jpg'));
    const box = page.getByLabel('Message', { exact: true });
    await box.fill(caption);
    await box.press('Enter');
    await expect(page.getByRole('log', { name: 'Messages' }).getByText('Sent')).toBeVisible();
    await settle(page, 900);
  };
  for (const scheme of ['light', 'dark'] as const) {
    const desk = await signIn(browser, 'alice', scheme);
    await sendMedia(desk.page, 'Photos from the trail');
    await desk.page.screenshot({ path: `${OUT}desktop-media-${scheme}.png` });
    await desk.context.close();
  }
  const phone = await signIn(browser, 'alice', 'light', PHONE, 3);
  await sendMedia(phone.page, 'More from the trail');
  await phone.page.screenshot({ path: `${OUT}mobile-media-light.png` });
  await phone.context.close();

  // Pass 4: the avatar studio, dressing Alice up (not saved, so nothing above changes).
  const dressUp = async (page: Page) => {
    await page.getByRole('link', { name: /@alice/ }).click();
    await page.getByRole('link', { name: 'Edit avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Avatar' })).toBeVisible();
    const pick = async (tab: string, option: string) => {
      await page.getByRole('tab', { name: tab }).click();
      await page.getByRole('radio', { name: option, exact: true }).click();
    };
    await pick('Hair', 'Pigtails');
    await pick('Hair', 'Ginger');
    await pick('Skin', 'Sand');
    await pick('Details', 'Blush & freckles');
    await pick('Pets', 'Bunny');
    await pick('Hats', 'Flower crown');
    await pick('Hats', 'Rose');
    await settle(page);
  };
  for (const [scheme, viewport, scale, name] of [
    ['light', DESKTOP, 2, 'avatar-studio-light'],
    ['dark', PHONE, 3, 'avatar-studio-phone-dark'],
  ] as const) {
    const s = await signIn(browser, 'alice', scheme, viewport, scale);
    await dressUp(s.page);
    await s.page.screenshot({ path: `${OUT}${name}.png` });
    await s.context.close();
  }

  // Avatar specials: the nine ready-made characters, one picked.
  {
    const s = await signIn(browser, 'alice', 'light', DESKTOP, 2);
    await s.page.goto('/settings/avatar');
    await s.page.getByRole('tab', { name: 'Specials' }).click();
    await s.page.getByRole('radio', { name: 'Headphones' }).click();
    await settle(s.page);
    await s.page.screenshot({ path: `${OUT}avatar-specials-light.png` });
    await s.context.close();
  }

  // Cards: the studio (alice designs hers) and Bob's shared card seen by a visitor.
  const designCard = async (page: Page) => {
    await page.goto('/settings/card');
    await expect(page.getByRole('heading', { name: 'Card' })).toBeVisible();
    await page.getByRole('textbox', { name: 'About me' }).fill('Coffee first, then chat.\nSay hi!');
    for (const n of ['Photography', 'Coffee', 'Board games']) {
      await page.getByRole('button', { name: n, exact: true }).click();
    }
    await page.getByRole('tab', { name: 'Colors' }).click();
    await page.getByRole('radio', { name: 'Peachy' }).click();
    await page.getByRole('radio', { name: 'Hearts', exact: true }).click();
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.getByRole('radio', { name: 'Pills' }).click();
    await page.getByRole('tab', { name: /Stickers/ }).click();
    await page.getByRole('button', { name: 'Add Heart' }).click();
    await page.getByRole('button', { name: 'Add Coffee' }).click();
    await settle(page);
  };
  for (const [scheme, viewport, scale, name] of [
    ['light', DESKTOP, 2, 'card-studio-light'],
    ['dark', PHONE, 3, 'card-studio-phone-dark'],
  ] as const) {
    const s = await signIn(browser, 'alice', scheme, viewport, scale);
    await designCard(s.page);
    await s.page.screenshot({ path: `${OUT}${name}.png` });
    await s.context.close();
  }
  {
    const context = await browser.newContext({
      viewport: DESKTOP,
      colorScheme: 'light',
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto('/@bob');
    await expect(page.getByRole('article', { name: 'Bob Carter’s card' })).toBeVisible();
    await settle(page, 900);
    await page.screenshot({ path: `${OUT}card-public-light.png` });
    await context.close();
  }

  await bob.context.close();
  await carol.context.close();
  await dave.context.close();
});

import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { attach } from '../tests/helpers';

/**
 * The README's seven pictures. The config seeds the demo users plus a crowd (SEED_CROWD), so
 * Discover has a full deck. Only the deck's starting card is random; everything else is the same
 * on every run.
 */

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
  const phone = viewport.width < 600;
  const context = await browser.newContext({
    viewport,
    colorScheme: scheme,
    deviceScaleFactor: scale,
    ...(phone ? { isMobile: true, hasTouch: true } : {}),
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

const chatList = (page: Page) => page.getByRole('navigation', { name: 'Conversations' });
const chat = (page: Page, title: RegExp) => chatList(page).getByRole('link', { name: title });
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}${name}.png` });

test('capture README screenshots', async ({ browser }) => {
  // People who are "online" while we take the pictures.
  const bob = await signIn(browser, 'bob', 'light', DESKTOP, 1);
  const carol = await signIn(browser, 'carol', 'light', DESKTOP, 1);
  const dave = await signIn(browser, 'dave', 'light', DESKTOP, 1);
  await chat(dave.page, /Weekend hike/).click();

  // Kofi (from the crowd) finds Alice in Discover and says hi: a message request is waiting
  // for her in every picture below.
  {
    const kofi = await signIn(browser, 'kofi_silva', 'light', DESKTOP, 1);
    await kofi.page.goto('/discover/deck/alice');
    await expect(kofi.page.getByRole('heading', { name: 'Say hi to Alice' })).toBeVisible();
    await kofi.page.getByRole('button', { name: 'Send message request' }).click();
    await expect(kofi.page.getByText('Request sent', { exact: true })).toBeVisible();
    await kofi.context.close();
  }

  // 1. Desktop: the group chat (Matcha theme, member colours, a reply, reactions) while Dave
  //    types, with the Requests row above the chats.
  {
    const desk = await signIn(browser, 'alice', 'light');
    await expect(
      chatList(desk.page).getByRole('link', { name: 'Requests, 1 waiting' }),
    ).toBeVisible();
    await chat(desk.page, /Weekend hike/).click();
    await expect(desk.page.getByText('Trail map is in the shared folder')).toBeVisible();
    await dave.page
      .getByLabel('Message', { exact: true })
      .pressSequentially('Meet at the trailhead', { delay: 20 });
    await expect(desk.page.getByText(/is typing/)).toBeVisible();
    await settle(desk.page, 900);
    await shot(desk.page, 'chat-desktop-light');
    await dave.page.getByLabel('Message', { exact: true }).fill('');
    await desk.context.close();
  }

  // 2. Phone: Kofi's request, with Accept / Decline / Block where the composer would be.
  {
    const phone = await signIn(browser, 'alice', 'light', PHONE, 3);
    await chatList(phone.page).getByRole('link', { name: 'Requests, 1 waiting' }).click();
    await expect(phone.page.getByRole('heading', { name: 'Requests', exact: true })).toBeVisible();
    await phone.page.getByRole('link', { name: /Kofi Silva/ }).click();
    await expect(
      phone.page.getByRole('region', { name: 'Message request', exact: true }),
    ).toBeVisible();
    await settle(phone.page, 900);
    await shot(phone.page, 'request-phone-light');
    await phone.context.close();
  }

  // 3. Desktop, dark: the Discover deck's fan.
  {
    const desk = await signIn(browser, 'alice', 'dark');
    await desk.page.getByRole('link', { name: 'Discover' }).click();
    await desk.page.getByRole('button', { name: 'Open the deck', exact: true }).click();
    await expect(desk.page.locator('button[data-deck-pos="0"]')).toBeVisible();
    await settle(desk.page, 1500);
    await shot(desk.page, 'discover-deck-dark');
    await desk.context.close();
  }

  // 4. Phone: one card from the deck, with openers written from the interests Alice shares.
  {
    const phone = await signIn(browser, 'alice', 'light', PHONE, 3);
    await phone.page.goto('/discover/deck/hiro_tanaka');
    await expect(phone.page.getByRole('heading', { name: 'Say hi to Hiro' })).toBeVisible();
    await settle(phone.page, 1200);
    await shot(phone.page, 'discover-say-hi-phone-light');
    await phone.context.close();
  }

  // 5. Desktop: the avatar studio, dressing Alice up (not saved).
  {
    const desk = await signIn(browser, 'alice', 'light');
    const page = desk.page;
    await page.goto('/settings/avatar');
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
    await shot(page, 'avatar-studio-desktop-light');
    await desk.context.close();
  }

  // 6. Phone, dark: the card studio (not saved).
  {
    const phone = await signIn(browser, 'alice', 'dark', PHONE, 3);
    const page = phone.page;
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
    await shot(page, 'card-studio-phone-dark');
    await phone.context.close();
  }

  // 7. Phone, dark: photos and a video in the direct chat with Bob (Doodles theme). The seed
  //    can't hold any (the server never stores media), so Alice sends them live, last.
  {
    const phone = await signIn(browser, 'alice', 'dark', PHONE, 3);
    const page = phone.page;
    await chat(page, /Bob Carter/).click();
    await expect(page.getByText('Absolutely, send me the link')).toBeVisible();
    await attach(page, fixture('photo-gps.jpg'), fixture('clip.webm'), fixture('photo-gps.jpg'));
    // The first time, a tip explains that media goes device to device.
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.getByLabel('Message', { exact: true }).fill('Photos from the trail');
    // On a touch screen, Enter makes a new line, so tap Send.
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('log', { name: 'Messages' }).getByText('Sent')).toBeVisible();
    await settle(page, 1200);
    await shot(page, 'chat-phone-dark');
    await phone.context.close();
  }

  await bob.context.close();
  await carol.context.close();
  await dave.context.close();
});

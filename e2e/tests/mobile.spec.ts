import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { attach, newUser, send, startDirect, unique } from './helpers';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

const PHONE = { width: 390, height: 844 };

test('phone layout: one pane at a time, with back navigation', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'), PHONE);
  const b = await newUser(browser, unique('bob'), PHONE);

  await startDirect(a, b);
  await send(a.page, 'ping');
  // Chat is full screen: the sidebar is hidden.
  await expect(a.page.getByRole('heading', { name: 'Chats' })).toBeHidden();
  await a.page.getByRole('link', { name: 'Back to chats' }).click();
  await expect(a.page.getByRole('heading', { name: 'Chats' })).toBeVisible();

  // Bob's list shows the chat; opening it fills the screen.
  await b.page.getByRole('link', { name: /alice/i }).click();
  await expect(b.page.getByText('ping')).toBeVisible();

  // Nothing overflows horizontally and the main tap target is at least 44px.
  for (const { page } of [a, b]) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
  const sendButton = await b.page.getByRole('button', { name: 'Send message' }).boundingBox();
  expect(sendButton!.width).toBeGreaterThanOrEqual(44);
  expect(sendButton!.height).toBeGreaterThanOrEqual(44);

  await a.context.close();
  await b.context.close();
});

test('phone layout: photo controls are easy to tap', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'), PHONE);
  const b = await newUser(browser, unique('bob'), PHONE);
  await startDirect(a, b);

  const attachButton = await a.page
    .getByRole('button', { name: 'Add photos or videos' })
    .boundingBox();
  expect(attachButton!.width).toBeGreaterThanOrEqual(44);
  expect(attachButton!.height).toBeGreaterThanOrEqual(44);

  await attach(a.page, fixture('photo-gps.jpg'));
  const remove = a.page.getByRole('button', { name: 'Remove photo 1' });
  await expect(remove).toBeVisible();
  // The visible circle is small; its tap area is grown to 44px with a pseudo-element, so check by
  // hit-testing the corners of a 44px square around its centre.
  const box = (await remove.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hits = await a.page.evaluate(
    ([x, y]) =>
      [
        [-21, -21],
        [21, -21],
        [-21, 21],
        [21, 21],
      ].map(([dx, dy]) => {
        const el = document.elementFromPoint(x! + dx!, y! + dy!);
        return el?.closest('button')?.getAttribute('aria-label');
      }),
    [cx, cy],
  );
  expect(hits.filter((h) => h === 'Remove photo 1').length).toBeGreaterThanOrEqual(2);

  // Nothing overflows horizontally with the tray open.
  const overflow = await a.page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await a.context.close();
  await b.context.close();
});

test('phone layout: the viewer fills the screen and a drag down closes it', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'), PHONE);
  const b = await newUser(browser, unique('bob'), PHONE);
  await startDirect(a, b);
  await attach(a.page, fixture('photo-gps.jpg'));
  await a.page.getByRole('button', { name: 'Send message' }).click();

  await b.page.getByRole('link', { name: /alice/i }).click();
  const tile = b.page.locator('[data-media-tile] button[data-phase="ready"]');
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.click();

  const viewer = b.page.getByRole('dialog');
  await expect(viewer).toBeVisible();
  const box = (await viewer.boundingBox())!;
  expect(box.width).toBe(PHONE.width);
  expect(box.height).toBe(PHONE.height);
  await expect(viewer.getByRole('button', { name: 'Close' })).toBeVisible();

  // Pull the photo down and let go: it flies back into the chat.
  await b.page.waitForTimeout(500);
  const stage = (await b.page.locator('[data-viewer-stage]').boundingBox())!;
  const x = stage.x + stage.width / 2;
  const y = stage.y + stage.height / 2;
  await b.page.mouse.move(x, y);
  await b.page.mouse.down();
  for (let i = 1; i <= 10; i++) await b.page.mouse.move(x, y + i * 20);
  await b.page.mouse.up();
  await expect(viewer).toBeHidden();
  await expect(tile).toBeVisible();

  // A short pull springs back instead, and with reduced motion the viewer still opens and closes.
  await b.page.emulateMedia({ reducedMotion: 'reduce' });
  await tile.click();
  await expect(viewer).toBeVisible();
  await b.page.waitForTimeout(300);
  await b.page.mouse.move(x, y);
  await b.page.mouse.down();
  // Slowly: a quick flick of the same distance is meant to close it.
  for (let i = 1; i <= 6; i++) {
    await b.page.mouse.move(x, y + i * 10);
    await b.page.waitForTimeout(40);
  }
  await b.page.waitForTimeout(150);
  await b.page.mouse.up();
  await b.page.waitForTimeout(500);
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Close' }).click();
  await expect(viewer).toBeHidden();

  await a.context.close();
  await b.context.close();
});

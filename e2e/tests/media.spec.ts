import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { attach, newUser, send, startDirect, unique, watchGraphqlBodies } from './helpers';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const PHOTO = fixture('photo-gps.jpg');
const CLIP = fixture('clip.webm');

const log = (page: Page) => page.getByRole('log', { name: 'Messages' });
const conversationLink = (page: Page, name: RegExp) =>
  page.getByRole('navigation', { name: 'Conversations' }).getByRole('link', { name });
const sendNow = (page: Page) => page.getByRole('button', { name: 'Send message' }).click();

/** A photo tile that has arrived, and how it got there. */
const arrived = (page: Page, transport: 'p2p' | 'relay') =>
  log(page).locator(`button[data-phase="ready"][data-transport="${transport}"]`);

test('a photo goes device to device without its location', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  const sizes = watchGraphqlBodies(a.page);

  await startDirect(a.page, b.username);
  await attach(a.page, PHOTO);
  await expect(a.page.getByRole('list', { name: 'Attachments' })).toBeVisible();
  await sendNow(a.page);
  await expect(log(a.page).getByText('Sent')).toBeVisible();

  // Bob never asked for it: the placeholder appears, then the photo "develops" over a direct link.
  await conversationLink(b.page, /alice/i).click();
  await expect(arrived(b.page, 'p2p')).toBeVisible({ timeout: 20_000 });
  const photo = log(b.page).locator('img[src^="blob:"]');
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // The bytes Bob holds on this device are a WebP with no EXIF and no GPS. (Read straight from the
  // browser's storage: the page's CSP rightly doesn't allow fetching blob: URLs.)
  const bytes = await b.page.evaluate(
    () =>
      new Promise<{ type: string; exif: boolean; gps: boolean }[]>((resolve, reject) => {
        const open = indexedDB.open('realtime-media');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('blobs').objectStore('blobs').getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = async () => {
            resolve(
              await Promise.all(
                (all.result as { blob: Blob }[]).map(async ({ blob }) => {
                  const text = new TextDecoder('latin1').decode(
                    new Uint8Array(await blob.arrayBuffer()),
                  );
                  return {
                    type: blob.type,
                    exif: text.includes('Exif'),
                    gps: text.includes('GPS'),
                  };
                }),
              ),
            );
          };
        };
      }),
  );
  expect(bytes).toEqual([{ type: 'image/webp', exif: false, gps: false }]);

  // Opening it shows the photo, and downloading it uses the verified type's extension.
  await arrived(b.page, 'p2p').click();
  const dialog = b.page.getByRole('dialog');
  await expect(dialog.locator('img[src^="blob:"]')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Download' })).toHaveAttribute(
    'download',
    /\.webp$/,
  );
  await b.page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The server only ever saw metadata.
  expect(sizes.count()).toBeGreaterThan(0);
  expect(sizes.max()).toBeLessThan(64 * 1024);

  await a.context.close();
  await b.context.close();
});

test('a video shows its poster, then plays', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  const sizes = watchGraphqlBodies(a.page);

  await startDirect(a.page, b.username);
  await attach(a.page, CLIP);
  await expect(a.page.getByRole('list', { name: 'Attachments' }).getByText('0:02')).toBeVisible();
  await sendNow(a.page);
  await expect(log(a.page).getByText('Sent')).toBeVisible();

  // Posters always come on their own; the video itself waits until someone opens it.
  await conversationLink(b.page, /alice/i).click();
  await expect(log(b.page).locator('img[src^="blob:"]')).toBeVisible({ timeout: 20_000 });
  await expect(log(b.page).getByText('0:02')).toBeVisible();

  await log(b.page)
    .getByRole('button', { name: /Play video/ })
    .click();
  const video = b.page.getByRole('dialog').locator('video');
  await expect(video).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);

  expect(sizes.max()).toBeLessThan(64 * 1024);
  await a.context.close();
  await b.context.close();
});

test('it waits for the sender, and fills in when they are back', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(a.page, b.username);
  await attach(a.page, PHOTO);
  await sendNow(a.page);
  await expect(log(a.page).getByText('Sent')).toBeVisible();
  await a.page.waitForTimeout(500); // let the file settle into this browser's storage

  // Alice closes the tab. Her browser (and its stored photo) stays; nobody is online with it.
  await a.page.close();
  await conversationLink(b.page, /alice/i).click();
  await expect(
    b.page.getByText(new RegExp(`Waiting for ${a.username} to come online`)),
  ).toBeVisible({
    timeout: 15_000,
  });

  // She comes back in the same browser: Bob's tile fills in on its own.
  const back = await a.context.newPage();
  await back.goto('/');
  await expect(back.getByRole('heading', { name: 'Chats' })).toBeVisible();
  await expect(arrived(b.page, 'p2p')).toBeVisible({ timeout: 30_000 });
  await expect(b.page.getByText(/Waiting for/)).toBeHidden();

  await a.context.close();
  await b.context.close();
});

test('group members share with each other when the sender is gone', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  const c = await newUser(browser, unique('carol'));

  await a.page.getByRole('button', { name: 'New chat' }).first().click();
  await a.page.getByRole('tab', { name: 'Group' }).click();
  await a.page.getByLabel('Group name').fill('Photo club');
  for (const u of [b, c]) {
    await a.page.getByLabel('Search people by username').fill(u.username.slice(0, 6));
    await a.page.getByRole('button', { name: new RegExp(`@${u.username}`) }).click();
  }
  await a.page.getByRole('button', { name: /Create group with 2 people/ }).click();
  await expect(a.page.getByRole('heading', { name: 'Photo club' })).toBeVisible();

  await attach(a.page, PHOTO);
  await sendNow(a.page);
  await expect(log(a.page).getByText('Sent')).toBeVisible();

  // Bob downloads it from Alice…
  await conversationLink(b.page, /Photo club/).click();
  await expect(arrived(b.page, 'p2p')).toBeVisible({ timeout: 20_000 });
  await b.page.waitForTimeout(500);

  // …then Alice's browser goes away entirely, and her copy with it.
  await a.context.close();

  // Carol opens the chat later and still gets the photo, from Bob.
  await conversationLink(c.page, /Photo club/).click();
  await expect(arrived(c.page, 'p2p')).toBeVisible({ timeout: 30_000 });

  await b.context.close();
  await c.context.close();
});

test('"Hide my IP address" sends media through the relay', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(a.page, b.username);

  // Bob hides his address in Settings, then goes back to the chat.
  await b.page.getByRole('link', { name: 'Settings' }).click();
  const hide = b.page.getByRole('switch', { name: 'Hide my IP address' });
  await hide.click();
  await expect(hide).toBeChecked();
  await conversationLink(b.page, /alice/i).click();

  await attach(a.page, PHOTO);
  await sendNow(a.page);
  await expect(arrived(b.page, 'relay')).toBeVisible({ timeout: 30_000 });
  await expect(arrived(b.page, 'p2p')).toHaveCount(0);

  await a.context.close();
  await b.context.close();
});

test('a caption and several photos arrive as one message', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(a.page, b.username);

  await attach(a.page, PHOTO, PHOTO, CLIP);
  await expect(a.page.getByRole('list', { name: 'Attachments' }).getByRole('listitem')).toHaveCount(
    3,
  );
  await a.page.getByLabel('Message', { exact: true }).fill('Weekend');
  await a.page.getByLabel('Message', { exact: true }).press('Enter');

  // One bubble, one caption, and the chat list says what it holds.
  await expect(log(a.page).getByText('Weekend')).toHaveCount(1);
  await expect(conversationLink(b.page, /alice/i)).toContainText('3 items · Weekend');
  await send(a.page, 'and some words'); // the next message is separate
  await expect(log(a.page).getByText('and some words')).toBeVisible();

  // Bob gets every one of them straight from Alice (three at once share one connection)…
  await conversationLink(b.page, /alice/i).click();
  await expect(log(b.page).locator('button[data-phase="ready"][data-transport="p2p"]')).toHaveCount(
    2,
    {
      timeout: 20_000,
    },
  ); // the two photos; the video waits to be opened
  await expect(log(b.page).locator('button[data-phase="idle"]').getByText('0:02')).toHaveCount(0);

  // …and steps through them in the viewer.
  await log(b.page).locator('[data-media-tile] button[data-phase]').first().click();
  const viewer = b.page.getByRole('dialog');
  await expect(viewer.getByText('1 of 3')).toBeVisible();
  await expect(viewer.getByText('Weekend')).toBeVisible();
  await b.page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('2 of 3')).toBeVisible();
  await b.page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('3 of 3')).toBeVisible();
  await expect(viewer.locator('video')).toBeVisible({ timeout: 20_000 }); // fetched when opened
  await b.page.keyboard.press('ArrowRight'); // the end: stays put
  await expect(viewer.getByText('3 of 3')).toBeVisible();
  await b.page.keyboard.press('ArrowLeft');
  await expect(viewer.getByText('2 of 3')).toBeVisible();

  // Esc closes it back into the chat, with focus on the tile that's showing.
  await b.page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(b.page.locator('[data-media-tile] button[data-phase]:focus')).toHaveCount(1);

  await a.context.close();
  await b.context.close();
});

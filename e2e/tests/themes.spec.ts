import { expect, test, type Page } from '@playwright/test';
import { createGroup, newUser, send, startDirect, unique } from './helpers';

const chat = (page: Page) => page.locator('section[aria-label^="Chat with"]');
const log = (page: Page) => page.getByRole('log', { name: 'Messages' });
const notice = (page: Page) => page.locator('[data-chat-notice]');

async function openThemeSheet(page: Page) {
  await page.getByRole('button', { name: 'Chat options' }).click();
  await page.getByRole('menuitem', { name: 'Theme' }).click();
  await expect(page.getByRole('dialog', { name: 'Chat theme' })).toBeVisible();
}

test('a theme is tried, set, and reaches the other person live', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  await startDirect(a, b);
  await send(a.page, 'new theme time');
  await b.page.getByRole('link', { name: new RegExp(a.username) }).click();
  await expect(log(b.page).getByText('new theme time')).toBeVisible();
  await expect(chat(b.page)).not.toHaveAttribute('data-chat-theme');

  // Trying a theme shows it in the chat behind the sheet; Cancel drops it.
  await openThemeSheet(a.page);
  const sheet = a.page.getByRole('dialog', { name: 'Chat theme' });
  await expect(sheet.getByRole('radio', { name: 'Classic' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await sheet.getByRole('radio', { name: 'Ocean' }).click();
  await expect(chat(a.page)).toHaveAttribute('data-chat-theme', 'ocean');
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(chat(a.page)).not.toHaveAttribute('data-chat-theme');

  // Set Matcha with the arrow keys.
  await openThemeSheet(a.page);
  await sheet.getByRole('radio', { name: 'Classic' }).focus();
  await a.page.keyboard.press('ArrowRight'); // Doodles
  await a.page.keyboard.press('ArrowRight'); // Blush
  await a.page.keyboard.press('ArrowRight'); // Matcha
  await expect(sheet.getByRole('radio', { name: 'Matcha' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await sheet.getByRole('button', { name: 'Set theme' }).click();
  await expect(sheet).toBeHidden();
  await expect(chat(a.page)).toHaveAttribute('data-chat-theme', 'matcha');
  await expect(notice(a.page)).toContainText('You changed the theme to Matcha');

  // Bob's open chat changes without a reload, and says who did it.
  await expect(chat(b.page)).toHaveAttribute('data-chat-theme', 'matcha');
  await expect(notice(b.page)).toContainText(`changed the theme to Matcha`);
  await expect(b.page.locator('[data-chat-wallpaper]')).toBeVisible();
  // The chat list says so too (quietly: it's the newest thing in the chat).
  await expect(b.page.getByRole('link', { name: new RegExp(a.username) })).toContainText(
    'changed the theme to Matcha',
  );

  // Bob makes a custom one from the notice's Change link; it survives a reload.
  await notice(b.page).getByRole('button', { name: 'Change' }).click();
  const bobSheet = b.page.getByRole('dialog', { name: 'Chat theme' });
  await bobSheet.getByRole('tab', { name: 'Custom' }).click();
  await bobSheet.getByRole('radio', { name: 'Rose' }).click();
  await bobSheet.getByRole('radio', { name: 'Space' }).click();
  await bobSheet.getByRole('radio', { name: 'Outline' }).click();
  await bobSheet.getByRole('button', { name: 'Set theme' }).click();
  await expect(chat(b.page)).toHaveAttribute('data-chat-theme', 'custom');
  await expect(chat(b.page)).toHaveAttribute('data-bubble-style', 'outline');
  await expect(notice(a.page)).toContainText('made a custom theme');
  await a.page.reload();
  await expect(chat(a.page)).toHaveAttribute('data-chat-theme', 'custom');
  await expect(chat(a.page)).toHaveAttribute('data-bubble-style', 'outline');

  await a.context.close();
  await b.context.close();
});

test('group members get colours, and pick their own', async ({ browser }) => {
  const a = await newUser(browser, unique('alice'));
  const b = await newUser(browser, unique('bob'));
  const c = await newUser(browser, unique('carol'));
  await createGroup(a, 'Picnic', [b, c]);
  await b.page.getByRole('link', { name: /Picnic/ }).click();
  await send(b.page, 'I bring the blanket');
  const bobRun = (page: Page) =>
    page.locator('[data-member]', { has: page.getByText('I bring the blanket') });
  await expect(bobRun(a.page)).toBeVisible();
  const before = await bobRun(a.page).getAttribute('style');

  // Bob picks lilac (never an automatic colour in a group of three) from Group info.
  await b.page
    .getByRole('button', { name: /Picnic/ })
    .first()
    .click();
  await b.page.getByRole('button', { name: /Theme and your colour/ }).click();
  const sheet = b.page.getByRole('dialog', { name: 'Chat theme' });
  await sheet.getByRole('tab', { name: 'Your colour' }).click();
  await expect(sheet.getByRole('radio', { name: 'Automatic' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await sheet.getByRole('radio', { name: 'Lilac' }).click();
  await sheet.getByRole('button', { name: 'Save my colour' }).click();
  await expect(sheet).toBeHidden();

  // Alice sees Bob's new colour live.
  await expect.poll(() => bobRun(a.page).getAttribute('style')).not.toBe(before);

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

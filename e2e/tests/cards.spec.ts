import { expect, test, type Page } from '@playwright/test';
import { closeWelcome, signUp, unique } from './helpers';

async function openCardStudio(page: Page) {
  await page.getByRole('link', { name: /@/ }).first().click();
  await page.getByRole('link', { name: 'Edit card' }).click();
  await expect(page.getByRole('heading', { name: 'Card' })).toBeVisible();
}

test('designs a card, saves it, shares the link, and a visitor messages through it', async ({
  page,
  browser,
}) => {
  const owner = unique('crd');
  await signUp(page, owner);
  await openCardStudio(page);

  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();

  await page.getByRole('textbox', { name: 'About me' }).fill('Ask me about sourdough.');
  await page.getByRole('button', { name: 'Hiking', exact: true }).click();
  await page.getByRole('button', { name: 'Pizza', exact: true }).click();
  await page.getByPlaceholder(/Bouldering/).fill('Synth collecting');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Synth collecting' })).toBeVisible();

  await page.getByRole('tab', { name: /Stickers/ }).click();
  await page.getByRole('button', { name: 'Add Star' }).click();
  await expect(page.locator('[data-sticker]')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Colors' }).click();
  await page.getByRole('radio', { name: 'Sunset' }).click();

  await save.click();
  await expect(page.getByText('Card saved')).toBeVisible();
  await expect(save).toBeDisabled();

  // It's all still there after a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Card' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'About me' })).toHaveValue(
    'Ask me about sourdough.',
  );
  await expect(page.locator('[data-sticker]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Colors' }).click();
  await expect(page.getByRole('radio', { name: 'Sunset' })).toHaveAttribute('aria-checked', 'true');

  // Not shared yet: a visitor sees nothing.
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/@${owner}`);
  await expect(visitor.getByText('This card isn’t shared')).toBeVisible();

  // Share it from Settings.
  await page.getByRole('link', { name: 'Back to settings' }).click();
  await page.getByRole('switch', { name: 'Share my card' }).click();
  await expect(page.getByText(`/@${owner}`)).toBeVisible();

  await visitor.reload();
  const card = visitor.getByRole('article', { name: `${owner}’s card` });
  await expect(card.getByText('Ask me about sourdough.')).toBeVisible();
  await expect(card.getByText('Synth collecting')).toBeVisible();

  // Message → sign up → straight into the chat with the owner.
  await card.getByRole('button', { name: `Message @${owner}` }).click();
  const fan = unique('fan');
  await visitor.getByRole('tab', { name: 'Sign up' }).click();
  await visitor.getByLabel('Username').fill(fan);
  await visitor.getByLabel('Email').fill(`${fan}@example.com`);
  await visitor.getByLabel('Password', { exact: true }).fill('test-password-1');
  await visitor.getByRole('button', { name: 'Create account' }).click();
  await closeWelcome(visitor);
  await expect(visitor).toHaveURL(/\/c\//);
  await expect(visitor.getByRole('heading', { name: owner, exact: true })).toBeVisible();
  await visitorContext.close();
});

test('opens someone’s card from the chat header', async ({ page, browser }) => {
  const other = unique('pal');
  const ctx = await browser.newContext();
  const otherPage = await ctx.newPage();
  await signUp(otherPage, other);
  await ctx.close();

  await signUp(page, unique('me'));
  await page.goto(`/@${other}`);
  const card = page.getByRole('article', { name: `${other}’s card` });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: `Message @${other}` }).click();
  await expect(page).toHaveURL(/\/c\//);

  await page.getByRole('button', { name: `${other}, see their card` }).click();
  const dialog = page.getByRole('dialog', { name: `${other}’s card` });
  await expect(dialog.getByRole('article')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeVisible();
});

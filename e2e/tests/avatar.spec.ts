import { expect, test, type Page } from '@playwright/test';
import { signUp, unique } from './helpers';

/** The round avatar in the sidebar's "you" row (the link to Settings). */
const sidebarAvatar = (page: Page) =>
  page.getByRole('link', { name: /@/ }).locator('span[style*="background"]').first();

async function openStudio(page: Page) {
  await page.getByRole('link', { name: /@/ }).click();
  await page.getByRole('link', { name: 'Edit avatar' }).click();
  await expect(page.getByRole('heading', { name: 'Avatar' })).toBeVisible();
}

test('dresses up the avatar, saves it, and it is still there after a reload', async ({ page }) => {
  const name = unique('ava');
  await signUp(page, name);
  // Everyone starts as the same drawn character.
  await expect(sidebarAvatar(page).locator('svg')).toHaveCount(1);

  await openStudio(page);
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();

  await page.getByRole('tab', { name: 'Hats' }).click();
  await page.getByRole('radio', { name: 'Cat ears' }).click();
  await expect(page.getByRole('radio', { name: 'Cat ears' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  await save.click();
  await expect(page.getByText('Avatar saved')).toBeVisible();
  await expect(save).toBeDisabled();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Avatar' })).toBeVisible();
  await page.getByRole('tab', { name: 'Hats' }).click();
  await expect(page.getByRole('radio', { name: 'Cat ears' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
});

test('can show initials instead of the character', async ({ page }) => {
  const name = unique('ini');
  await signUp(page, name);
  await openStudio(page);

  await page.getByRole('tab', { name: 'Background' }).click();
  await page.getByRole('radio', { name: 'My initials' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Avatar saved')).toBeVisible();

  // The display name defaults to the username: one word, one initial.
  await expect(sidebarAvatar(page)).toHaveText(name[0]!.toUpperCase());
  await expect(sidebarAvatar(page).locator('svg')).toHaveCount(0);

  await page.reload();
  await expect(sidebarAvatar(page)).toHaveText(name[0]!.toUpperCase());
});

test('starts from a special character, keeps it after a reload, and can still change it', async ({
  page,
}) => {
  await signUp(page, unique('spc'));
  await openStudio(page);

  await page.getByRole('tab', { name: 'Specials' }).click();
  await page.getByRole('radio', { name: 'Pink braid' }).click();
  await expect(page.getByRole('radio', { name: 'Pink braid' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Every avatar draws with fine lines now: there's no line weight to pick.
  await expect(page.getByRole('radio', { name: 'Bold' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Avatar saved')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Avatar' })).toBeVisible();
  await page.getByRole('tab', { name: 'Specials' }).click();
  await expect(page.getByRole('radio', { name: 'Pink braid' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Customising it works like any other look; it's no longer exactly the special.
  await page.getByRole('tab', { name: 'Hair' }).click();
  await page.getByRole('radio', { name: 'Blue' }).click();
  await page.getByRole('tab', { name: 'Specials' }).click();
  await expect(page.getByRole('radio', { name: 'Pink braid' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

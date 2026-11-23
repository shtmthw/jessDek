import { expect, test, type Page } from '@playwright/test';
import { newUser, unique } from './helpers';

/**
 * Discover, the card deck (CARD_LOADING.md, CARD_DECK_PLAN.md): the front page's stack, the fan,
 * one person's card with auto-generated openers, and the request it sends. Each test gives its
 * people a made-up interest of their own, so they only ever match each other.
 */

const PHONE = { width: 390, height: 844 };

/** Saves a card with these interests (custom ones, by name). */
async function setInterests(page: Page, ...names: string[]) {
  await saveCard(page, { interests: names.map((t) => ({ t })) });
}

/** Every layer the light deck leaves out (DECK_QUALITY_PLAN.md). */
const RICH = {
  pattern: 'dots',
  finish: 'gloss',
  border: 'dashed',
  ring: 'glow',
  stickers: [{ k: 'star', x: 0.85, y: 0.1, s: 1, r: 12 }],
};

/** Saves a card recipe. */
async function saveCard(page: Page, card: Record<string, unknown>) {
  const recipe = JSON.stringify({ v: 1, ...card });
  const res = await page.request.post('/graphql', {
    headers: { origin: new URL(page.url()).origin },
    data: {
      query: 'mutation($r: String) { updateCard(input: { recipe: $r }) { id } }',
      variables: { r: recipe },
    },
  });
  expect((await res.json()).errors).toBeUndefined();
}

/** Counts the deck's requests (DeckStart / DeckCards / DeckCard) this page makes. */
function watchDeck(page: Page) {
  const ops: string[] = [];
  page.on('request', (req) => {
    const m = /"operationName":"(Deck\w+)"/.exec(req.postData() ?? '');
    if (m) ops.push(m[1]!);
  });
  return ops;
}

const center = (page: Page) => page.locator('button[data-deck-pos="0"]');
const toast = (page: Page, text: string | RegExp) =>
  page.locator('[data-sonner-toast]', { hasText: text });

test('someone who shares an interest is in your deck, and you can say hi from their card', async ({
  browser,
}) => {
  const tag = unique('zq');
  const a = await newUser(browser, unique('dka'));
  const b = await newUser(browser, unique('dkb'));
  const c = await newUser(browser, unique('dkc'));
  await setInterests(a.page, tag, 'Chess');
  await setInterests(b.page, tag.toUpperCase()); // custom interests match whatever the case
  await setInterests(c.page, unique('other'));
  const ops = watchDeck(a.page);

  // The list's Discover button, then the front page: one match, b's card on top.
  await a.page.getByRole('link', { name: 'Discover' }).click();
  await expect(a.page.getByText('1 person shares an interest with you')).toBeVisible();
  const top = a.page.getByRole('button', {
    name: `Open the deck, starting with ${b.username}’s card`,
  });
  await expect(top).toBeVisible();

  // The top card is M: the fan opens on the same person, without dealing again.
  await top.click();
  await expect(center(a.page)).toHaveAccessibleName(`Open ${b.username}’s card`);
  await expect(a.page.getByRole('button', { name: new RegExp(c.username) })).toHaveCount(0);
  expect(ops).toEqual(['DeckStart']);

  // Their card: openers about what you share, the first one already in the box.
  await center(a.page).click();
  await expect(a.page.getByRole('heading', { name: `Say hi to ${b.username}` })).toBeVisible();
  const openers = a.page.getByRole('radiogroup', { name: 'Suggested openers' }).getByRole('radio');
  expect(await openers.count()).toBeGreaterThanOrEqual(3);
  await expect(openers.first()).toBeChecked();
  const box = a.page.getByLabel(`Your message to ${b.username}`);
  await expect(box).toHaveValue(new RegExp(tag, 'i'));
  expect(ops).toEqual(['DeckStart', 'DeckCard']); // only the "still available?" check

  // Back to the deck: same card in the middle, no requests at all (acceptance 9).
  await a.page.getByRole('link', { name: 'Back to deck' }).first().click();
  await expect(center(a.page)).toHaveAccessibleName(`Open ${b.username}’s card`);
  expect(ops).toEqual(['DeckStart', 'DeckCard']);

  // Pick another opener and send it: it's the one-message request.
  await center(a.page).click();
  await openers.nth(1).check();
  const line = (await a.page.getByRole('radiogroup').locator('label').nth(1).innerText()).trim();
  await expect(box).toHaveValue(line);
  await a.page.getByRole('button', { name: 'Send message request' }).click();
  await expect(a.page).toHaveURL(/\/c\//);
  await expect(a.page.getByRole('log', { name: 'Messages' }).getByText(line)).toBeVisible();
  await expect(a.page.getByText('Request sent', { exact: true })).toBeVisible();

  // b gets it as a request.
  await expect(b.page.getByRole('link', { name: 'Requests, 1 waiting' })).toBeVisible();

  // And a's card view of b now says where things stand, instead of openers.
  await a.page.goto(`/discover/deck/${b.username}`);
  await expect(a.page.getByRole('heading', { name: 'Request sent' })).toBeVisible();
  await expect(a.page.getByRole('radiogroup')).toHaveCount(0);

  await Promise.all([a.context.close(), b.context.close(), c.context.close()]);
});

test('with nothing in common, Discover says so and points to your card', async ({ browser }) => {
  const a = await newUser(browser, unique('dke'));
  await setInterests(a.page, unique('lonely'));
  await a.page.getByRole('link', { name: 'Discover' }).click();
  await expect(a.page.getByRole('heading', { name: 'No matches yet' })).toBeVisible();
  await a.page.getByRole('link', { name: 'Add interests' }).click();
  await expect(a.page).toHaveURL(/\/settings\/card$/);
  await a.context.close();
});

test('someone who blocks you mid-deck drops out when you open their card', async ({ browser }) => {
  const tag = unique('zb');
  const a = await newUser(browser, unique('dkf'));
  const b = await newUser(browser, unique('dkg'));
  await setInterests(a.page, tag);
  await setInterests(b.page, tag);
  await a.page.goto('/discover/deck');
  await expect(center(a.page)).toHaveAccessibleName(`Open ${b.username}’s card`);

  // b blocks a (a's deck is already loaded).
  const who = await b.page.request.post('/graphql', {
    headers: { origin: new URL(b.page.url()).origin },
    data: {
      query: 'query($u: String!) { card(username: $u) { id } }',
      variables: { u: a.username },
    },
  });
  const aId = (await who.json()).data.card.id as string;
  await b.page.request.post('/graphql', {
    headers: { origin: new URL(b.page.url()).origin },
    data: { query: 'mutation($u: ID!) { blockUser(userId: $u) { id } }', variables: { u: aId } },
  });

  await center(a.page).click();
  await expect(toast(a.page, `${b.username} isn’t available any more`)).toBeVisible();
  // The deck had only b: it's empty now.
  await expect(a.page.getByRole('heading', { name: 'No matches yet' })).toBeVisible();
  await Promise.all([a.context.close(), b.context.close()]);
});

test('on a phone: Discover slides in from the list, and the deck moves with a swipe', async ({
  browser,
}) => {
  const tag = unique('zp');
  const a = await newUser(browser, unique('dkh'), PHONE);
  const others = [];
  for (let i = 0; i < 2; i++) {
    const o = await newUser(browser, unique(`dk${i}`));
    await setInterests(o.page, tag);
    others.push(o);
  }
  await setInterests(a.page, tag);
  await a.page.getByRole('link', { name: 'Discover' }).click();
  await expect(a.page.getByText('2 people share an interest with you')).toBeVisible();
  await a.page.getByRole('button', { name: 'Open the deck', exact: true }).click();
  const first = await center(a.page).getAttribute('data-card-id');

  // Two cards don't loop: one swipe left moves to the other, a second one bounces.
  const box = (await center(a.page).boundingBox())!;
  const swipe = async () => {
    await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await a.page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await a.page.mouse.move(box.x + box.width / 2 - i * 20, box.y + box.height / 2);
    }
    await a.page.mouse.up();
  };
  await expect(a.page.getByRole('button', { name: 'Next card' })).toBeEnabled();
  await swipe();
  await expect(center(a.page)).not.toHaveAttribute('data-card-id', first!);
  await expect(a.page.getByRole('button', { name: 'Next card' })).toBeDisabled();
  const second = await center(a.page).getAttribute('data-card-id');
  await swipe();
  await expect(center(a.page)).toHaveAttribute('data-card-id', second!);
  await Promise.all([a.context.close(), ...others.map((o) => o.context.close())]);
});

test('Light cards: the deck switches in place, stays light on this device, and opened cards stay full', async ({
  browser,
}) => {
  const tag = unique('zl');
  const a = await newUser(browser, unique('dla'));
  const b = await newUser(browser, unique('dlb'));
  const c = await newUser(browser, unique('dlc'));
  await setInterests(a.page, tag);
  await saveCard(b.page, { interests: [{ t: tag }], ...RICH });
  await saveCard(c.page, { interests: [{ t: tag }], ...RICH });

  await a.page.goto('/discover/deck');
  const deck = a.page.getByRole('region', { name: 'Your deck' });
  await expect(center(a.page)).toBeVisible();

  // Full by default: their cards come with every layer.
  await expect(deck).toHaveAttribute('data-quality', 'full');
  await expect(deck.locator('[data-layer="stickers"]').first()).toBeAttached();
  await expect(deck.locator('[data-layer="pattern"]').first()).toBeAttached();
  const toggle = a.page.getByRole('button', { name: 'Light cards' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const before = await center(a.page).getAttribute('aria-label');

  // The header's toggle: light at once, in the same place.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(deck).toHaveAttribute('data-quality', 'light');
  await expect(deck.locator('article[data-quality="full"]')).toHaveCount(0);
  await expect(deck.locator('[data-layer]')).toHaveCount(0);
  await expect(center(a.page)).toHaveAttribute('aria-label', before!);
  await expect(toast(a.page, 'Light cards on')).toBeVisible();

  // It still moves, and what comes in is light too.
  const next = a.page.getByRole('button', { name: 'Next card' });
  await a.page.keyboard.press((await next.isEnabled()) ? 'ArrowRight' : 'ArrowLeft');
  await expect(center(a.page)).not.toHaveAttribute('aria-label', before!);
  await expect(deck.locator('article[data-quality="full"]')).toHaveCount(0);

  // Kept on this device.
  await a.page.reload();
  await expect(deck).toHaveAttribute('data-quality', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // The front page's stack is drawn like the deck it opens.
  await a.page.goto('/discover');
  await expect(a.page.locator('[data-deck-top] article')).toHaveAttribute('data-quality', 'light');

  // A card you open is always in full.
  await a.page.goto(`/discover/deck/${b.username}`);
  await expect(a.page.getByRole('heading', { name: `Say hi to ${b.username}` })).toBeVisible();
  await expect(a.page.locator('article[data-quality]')).toHaveAttribute('data-quality', 'full');
  await expect(a.page.locator('[data-layer="stickers"]')).toBeAttached();

  // And back to full from the toggle.
  await a.page.goto('/discover/deck');
  await toggle.click();
  await expect(deck).toHaveAttribute('data-quality', 'full');
  await expect(toast(a.page, 'Full-quality cards')).toBeVisible();
  await expect(deck.locator('[data-layer="stickers"]').first()).toBeAttached();

  await Promise.all([a.context.close(), b.context.close(), c.context.close()]);
});

test('Settings → Discover picks the deck quality, explains it, and an open deck in another tab follows', async ({
  browser,
}) => {
  const tag = unique('zs');
  const a = await newUser(browser, unique('dsa'));
  const b = await newUser(browser, unique('dsb'));
  await setInterests(a.page, tag);
  await saveCard(b.page, { interests: [{ t: tag }], ...RICH });

  // The deck, open in a second tab.
  const tab = await a.context.newPage();
  await tab.goto('/discover/deck');
  const deck = tab.getByRole('region', { name: 'Your deck' });
  await expect(deck).toHaveAttribute('data-quality', 'full');

  await a.page.goto('/settings');
  const choice = a.page.getByRole('radiogroup', { name: 'Card deck' });
  await expect(choice.getByRole('radio', { name: 'Full quality' })).toBeChecked();
  await expect(
    a.page.getByText('Every card in full: stickers, patterns, finishes and shadows.'),
  ).toBeVisible();

  await choice.getByRole('radio', { name: 'Light' }).click();
  await expect(choice.getByRole('radio', { name: 'Light' })).toBeChecked();
  await expect(a.page.getByText(/A card you open is always shown in full\./)).toBeVisible();
  await expect(deck).toHaveAttribute('data-quality', 'light');
  await expect(tab.getByRole('button', { name: 'Light cards' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // It works from the keyboard too (arrow keys move a radio choice), and the other tab follows again.
  await choice.getByRole('radio', { name: 'Light' }).focus();
  await a.page.keyboard.press('ArrowLeft');
  await expect(choice.getByRole('radio', { name: 'Full quality' })).toBeChecked();
  await expect(deck).toHaveAttribute('data-quality', 'full');
  await expect(deck.locator('[data-layer="stickers"]').first()).toBeAttached();

  await Promise.all([a.context.close(), b.context.close()]);
});

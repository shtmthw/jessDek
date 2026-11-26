import { firefox, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [S, engine] = process.argv.slice(2);
const token = readFileSync(`${S}/tok`, 'utf8').trim();
const browser = engine === 'firefox' ? await firefox.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell` });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 880 }, colorScheme: 'dark', recordVideo: { dir: `${S}/vid2-${engine}`, size: { width: 1000, height: 880 } } });
await ctx.addCookies([{ name: 'rt_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.setItem('theme', 'dark'));
await page.goto('http://localhost:5173/c/cmwqksipz0006f4hnmduil707');
await page.getByRole('button', { name: 'Chat options' }).click();
await page.getByRole('menuitem', { name: 'Theme' }).click();
const sheet = page.getByRole('dialog', { name: 'Chat theme' });
await sheet.getByRole('tab', { name: 'Custom' }).click();
await page.waitForTimeout(900);
const t0 = Date.now();
const b = await sheet.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height - 150);
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 90); await page.waitForTimeout(90); }
// Switch tabs while scrolled down: the body's height animates (AutoHeight clips meanwhile).
await sheet.getByRole('tab', { name: 'Themes' }).click(); await page.waitForTimeout(500);
await sheet.getByRole('tab', { name: 'Custom' }).click(); await page.waitForTimeout(500);
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 90); await page.waitForTimeout(80); }
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -90); await page.waitForTimeout(80); }
const t1 = Date.now();
// Keyboard: arrow from Classic to the last preset; it must be inside the body's visible area.
await sheet.getByRole('tab', { name: 'Themes' }).click(); await page.waitForTimeout(500);
await sheet.getByRole('radio', { name: 'Classic' }).focus();
for (let i = 0; i < 16; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40); }
await page.waitForTimeout(500);
const kb = await sheet.evaluate((d) => {
  const body = d.querySelector('.overflow-y-auto').getBoundingClientRect();
  const r = document.activeElement.getBoundingClientRect();
  return { focused: document.activeElement.textContent.trim(), visible: r.top >= body.top - 1 && r.bottom <= body.bottom + 1 };
});
await ctx.close(); await browser.close();
console.log(JSON.stringify({ engine, scrollSecs: ((t1 - t0) / 1000).toFixed(1), kb }));

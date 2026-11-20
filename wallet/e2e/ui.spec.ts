import { expect, test } from '@playwright/test';

// Actual static app and box API, no route mocks. Screenshots are verification artifacts only.
for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
 test(`public screens fit ${viewport.width}px`, async ({ browser }) => {
  const context = await browser.newContext({ viewport, locale: 'fr-FR' });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  try {
   for (const path of ['/', '/tour', '/tableau', '/op']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByTestId('island-band')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${path === '/' ? 'welcome' : path.slice(1)}-${viewport.width}.png`), fullPage: true });
   }
   expect(failures).toEqual([]);
  } finally { await context.close(); }
 });
}

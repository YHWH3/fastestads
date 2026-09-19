import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers';

const TOOL = '/tools/google-ads-headline-checker/';

test.use({ viewport: { width: 320, height: 640 } });

test('320px viewport: no horizontal scroll, touch targets >= 44px', async ({ page }) => {
  await page.goto(TOOL);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Analyze ad' }).click();
  await expect(page.locator('#fa-results-heading')).toBeFocused();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  const tooSmall = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll('button, input, summary')) {
      const r = el.getBoundingClientRect();
      // Ignore visually-hidden and zero-sized elements.
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44) bad.push(`${el.tagName}.${el.className} h=${r.height}`);
    }
    return bad;
  });
  expect(tooSmall).toEqual([]);
});

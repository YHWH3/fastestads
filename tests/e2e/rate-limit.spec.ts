import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers';
import { SEMANTIC_ENDPOINT } from '../../src/lib/routes';

const TOOL = '/tools/google-ads-headline-checker/';

test('429 from the API shows the rate-limited state', async ({ page }) => {
  await page.route(`**${SEMANTIC_ENDPOINT}`, async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'rate_limited' }),
    });
  });

  await page.goto(TOOL);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Analyze ad' }).click();

  await expect(page.locator('.fa-notice')).toContainText(
    'Too many requests right now — try again in a minute',
  );
  await expect(page.getByRole('button', { name: 'Retry semantic evaluation' })).toBeVisible();
});

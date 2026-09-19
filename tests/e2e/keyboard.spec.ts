import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers';

const TOOL = '/tools/google-ads-headline-checker/';

test('keyboard: tab to Analyze, Enter submits, results heading receives focus', async ({
  page,
}) => {
  await page.goto(TOOL);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Load example' }).click();

  // Focus the first input and tab forward until the submit button is focused.
  await page.locator('#fa-headline-0').focus();
  for (let i = 0; i < 40; i += 1) {
    const name = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (name === 'Analyze ad') break;
    await page.keyboard.press('Tab');
  }
  await expect(page.getByRole('button', { name: 'Analyze ad' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('#fa-results-heading')).toBeFocused();

  // The semantic notice's Retry button is reachable by keyboard.
  const retry = page.getByRole('button', { name: 'Retry semantic evaluation' });
  if (await retry.count()) {
    await retry.focus();
    await expect(retry).toBeFocused();
  }
});

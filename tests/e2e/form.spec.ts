import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers';

const TOOL = '/tools/google-ads-headline-checker/';

test('field add/remove, counters, paste split, reset and draft restore', async ({ page }) => {
  await page.goto(TOOL);
  await waitForHydration(page);

  // Starts with 3 headline rows.
  await expect(page.locator('#fa-headline-0')).toBeVisible();
  await expect(page.locator('#fa-headline-2')).toBeVisible();

  // Add a 4th headline, then remove the 2nd.
  await page.getByRole('button', { name: 'Add headline' }).click();
  await expect(page.locator('#fa-headline-3')).toBeVisible();
  await page.getByRole('button', { name: 'Remove headline 2' }).click();
  await expect(page.locator('#fa-headline-3')).not.toBeVisible();

  // Counter + over-limit text (never colour-only).
  await page.locator('#fa-headline-0').fill('x'.repeat(31));
  await expect(page.locator('#fa-headline-0-counter')).toHaveText('31 / 30');
  await expect(page.getByText('Over limit by 1')).toBeVisible();

  // Paste headlines splits one per line.
  await page.getByText('Paste headlines', { exact: true }).click();
  await page
    .locator('#fa-paste')
    .fill('First pasted headline\nSecond pasted headline\nThird pasted headline');
  await page.getByRole('button', { name: 'Split into headline rows' }).click();
  await expect(page.locator('#fa-headline-0')).toHaveValue('First pasted headline');
  await expect(page.locator('#fa-headline-2')).toHaveValue('Third pasted headline');

  // Draft survives a reload (sessionStorage, tab-scoped).
  await page.locator('#fa-keyword').fill('walnut shelves');
  // The draft write happens in an effect — wait for it to reach sessionStorage.
  await page.waitForFunction(() =>
    window.sessionStorage.getItem('fa:draft:google-ads-rsa')?.includes('walnut shelves'),
  );
  await page.reload();
  await expect(page.locator('#fa-headline-0')).toHaveValue('First pasted headline');
  await expect(page.locator('#fa-keyword')).toHaveValue('walnut shelves');

  // Reset clears everything.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('#fa-headline-0')).toHaveValue('');
  await expect(page.locator('#fa-keyword')).toHaveValue('');
});

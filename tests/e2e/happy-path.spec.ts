import { test, expect } from '@playwright/test';
import { okSemanticResult, noul, waitForHydration } from './helpers';

const TOOL = '/tools/google-ads-headline-checker/';

test('happy path: example ad analyzes and renders semantic results', async ({ page }) => {
  await page.route('**/api/semantic', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', result: okSemanticResult({ vague_H1: noul(0.9) }) }),
    });
  });

  await page.goto(TOOL);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Analyze ad' }).click();

  const heading = page.locator('#fa-results-heading');
  await expect(heading).toBeFocused();
  const summary = page.locator('.fa-summary');
  await expect(summary).toContainText(/Needs work|Ready/);

  // All 7 dimension cards render.
  await expect(page.locator('.fa-dimension')).toHaveCount(7);

  // At least one semantic issue (vague_H1 was forced to "yes").
  const semanticSection = page.locator('section[aria-labelledby="fa-sem-issues"]');
  await expect(semanticSection.locator('.fa-issue').first()).toBeVisible();

  // Copy button flips to "Copied".
  const copyBtn = page.getByRole('button', { name: 'Copy' }).first();
  await copyBtn.click();
  await expect(page.getByRole('button', { name: 'Copied' }).first()).toBeVisible();
});

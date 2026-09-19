import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers';

const TOOL = '/tools/google-ads-headline-checker/';

test('fallback: no API key shows deterministic results + honest semantic notice', async ({
  page,
}) => {
  // No interception — the preview server has no TYPESAFE_API_KEY, so the API
  // returns 503 not_configured.
  await page.goto(TOOL);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Analyze ad' }).click();

  // Deterministic results still render.
  await expect(page.locator('#fa-results-heading')).toBeFocused();
  await expect(page.locator('.fa-dimension').first()).toBeVisible();

  // Honest unavailable notice with retry.
  const notice = page.locator('.fa-notice');
  await expect(notice).toContainText("Semantic evaluation isn't configured on this deployment");
  await expect(page.getByRole('button', { name: 'Retry semantic evaluation' })).toBeVisible();

  // Inputs are never cleared by errors.
  await expect(page.locator('input').first()).toHaveValue('Powerful Business Software');
});

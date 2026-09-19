import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { okSemanticResult, noul, waitForHydration } from './helpers';
import { SEMANTIC_ENDPOINT } from '../../src/lib/routes';

const TOOL = '/tools/google-ads-headline-checker/';

async function expectNoSeriousViolations(page: import('@playwright/test').Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(violations, `${name}: ${violations.map((v) => v.id).join(', ')}`).toEqual([]);
}

test('a11y: tool page idle has no serious violations', async ({ page }) => {
  await page.goto(TOOL);
  await expectNoSeriousViolations(page, 'tool idle');
});

test('a11y: tool page after analysis has no serious violations', async ({ page }) => {
  await page.route(`**${SEMANTIC_ENDPOINT}`, async (route) => {
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
  await expect(page.locator('#fa-results-heading')).toBeFocused();
  await expectNoSeriousViolations(page, 'tool analyzed');
});

for (const [name, path] of [
  ['home', '/'],
  ['tools hub', '/tools/'],
  ['privacy', '/privacy/'],
  ['cpm calculator', '/tools/cpm-calculator/'],
] as const) {
  test(`a11y: ${name} page`, async ({ page }) => {
    await page.goto(path);
    await expectNoSeriousViolations(page, name);
  });
}

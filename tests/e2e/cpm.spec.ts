import { test, expect, type Page } from '@playwright/test';

const TOOL = '/tools/cpm-calculator/';

async function waitForCalc(page: Page) {
  const input = page.locator('#calc-cost');
  const results = page.locator('.fa-results');
  await expect(async () => {
    await input.fill('100');
    await page.locator('#calc-impressions').fill('10000');
    await expect(results).toContainText('$10.00');
  }).toPass({ timeout: 15_000 });
}

test('cpm calculator: solves CPM from spend and impressions', async ({ page }) => {
  await page.goto(TOOL);
  await waitForCalc(page);

  await page.locator('#calc-cost').fill('2500');
  await page.locator('#calc-impressions').fill('500000');
  await expect(page.locator('.fa-result-value')).toHaveText('$5.00');
  await expect(page.locator('.fa-calc-sentence')).toContainText('$2,500.00');
  await expect(page.locator('.fa-calc-sentence')).toContainText('500,000');
});

test('cpm calculator: solves spend and impressions targets', async ({ page }) => {
  await page.goto(TOOL);
  await waitForCalc(page);

  await page.getByRole('radio', { name: /Ad spend/ }).check();
  await page.locator('#calc-cpm').fill('6');
  await page.locator('#calc-impressions').fill('1000000');
  await expect(page.locator('.fa-result-value')).toHaveText('$6,000.00');

  await page.getByRole('radio', { name: /Impressions/ }).check();
  await page.locator('#calc-cost').fill('500');
  await expect(page.locator('.fa-result-value')).toHaveText('83,333');
});

test('cpm calculator: optional inputs derive CPC, CTR, CPA, ROAS', async ({ page }) => {
  await page.goto(TOOL);
  await waitForCalc(page);

  await page.locator('#calc-cost').fill('1000');
  await page.locator('#calc-impressions').fill('50000');
  await page.locator('summary', { hasText: 'clicks, conversions or revenue' }).click();
  await page.locator('#calc-clicks').fill('400');
  await page.locator('#calc-conversions').fill('20');
  await page.locator('#calc-revenue').fill('2500');

  const derived = page.locator('.fa-derived');
  await expect(derived).toContainText('$2.50');
  await expect(derived).toContainText('0.8%');
  await expect(derived).toContainText('$50.00');
  await expect(derived).toContainText('2.5×');
  await expect(derived).toContainText('$1,500.00');
});

test('cpm calculator: shows field errors and empty prompt', async ({ page }) => {
  await page.goto(TOOL);
  await waitForCalc(page);

  await page.locator('#calc-cost').fill('abc');
  await expect(
    page.locator('.fa-results .fa-over-text, .fa-calc-grid .fa-over-text').first(),
  ).toContainText('Enter a number');

  await page.locator('#calc-cost').fill('');
  await page.locator('#calc-impressions').fill('');
  await expect(page.locator('.fa-calc-empty')).toBeVisible();

  await page.locator('#calc-cost').fill('100');
  await page.locator('#calc-impressions').fill('0');
  await expect(page.locator('.fa-over-text').first()).toContainText('above 0');
});

test('cpm calculator: currency selection changes formatting', async ({ page }) => {
  await page.goto(TOOL);
  await waitForCalc(page);

  await page.locator('#calc-cost').fill('2500');
  await page.locator('#calc-impressions').fill('500000');
  await page.locator('#calc-currency').selectOption('EUR');
  await expect(page.locator('.fa-result-value')).toContainText('€');
});

test('cpm calculator: no API calls are made', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) apiCalls.push(req.url());
  });
  await page.goto(TOOL);
  await waitForCalc(page);
  await page.locator('#calc-cost').fill('2500');
  await page.locator('#calc-impressions').fill('500000');
  await expect(page.locator('.fa-result-value')).toHaveText('$5.00');
  expect(apiCalls).toHaveLength(0);
});

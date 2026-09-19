import { expect, type Page } from '@playwright/test';
import { runDeterministic } from '../../src/core/checker';
import { googleAdsRsa } from '../../src/core/platforms/google-ads';
import { parseAnswers, type JevAnswer, type SemanticResult } from '../../src/core/semantic/answers';
import { buildSemanticRequest } from '../../src/core/semantic/request';
import type { AdInput } from '../../src/core/platform/types';
import { mockAnswers, noul } from '../helpers/mockAnswers';

/** Builds an `ok` /api/semantic response body for the example ad. */
export function okSemanticResult(overrides: Record<string, JevAnswer> = {}): SemanticResult {
  const input: AdInput = {
    platform: 'google-ads',
    format: 'rsa',
    headlines: [
      'Powerful Business Software',
      'Manage Clients With Ease',
      'Grow Revenue Faster Now',
      'Track Every Deal In One Place',
      'Simple Pricing For Teams',
      'Try It Free For 14 Days',
    ],
    descriptions: [
      'Streamline how your team handles every account.',
      'Built for companies that want clearer pipelines.',
    ],
    paths: [],
    keyword: 'best crm for small business',
  };
  const det = runDeterministic(input, googleAdsRsa);
  const plan = buildSemanticRequest(det, input);
  if (!plan) throw new Error('example ad is not evaluable');
  const { answers, missing } = parseAnswers(
    mockAnswers(plan, overrides),
    plan.expectedIds,
    plan.questions,
  );
  return {
    status: missing.length === 0 ? 'ok' : 'partial',
    model: 'jev-e2e',
    latencyMs: 12,
    answers,
    missing,
  };
}

export { noul };

/**
 * Waits until the Preact island is hydrated. Before hydration, typing into a
 * field does not update its live character counter.
 */
export async function waitForHydration(page: Page) {
  const input = page.locator('#fa-headline-0');
  const counter = page.locator('#fa-headline-0-counter');
  await expect(async () => {
    await input.fill('probe');
    await expect(counter).toHaveText('5 / 30');
    await input.fill('');
    await expect(counter).toHaveText('0 / 30');
  }).toPass({ timeout: 15_000 });
}

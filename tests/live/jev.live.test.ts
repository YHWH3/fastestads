import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createJevClient } from '@server/jev/client';
import { runDeterministic } from '@core/checker';
import { googleAdsRsa } from '@core/platforms/google-ads';
import { buildSemanticRequest } from '@core/semantic/request';
import { parseAnswers } from '@core/semantic/answers';
import { noulVerdict, scoreToBand } from '@core/semantic/bands';
import { keywordMismatch } from '../fixtures/ads';

const LIVE = process.env.LIVE_JEV === '1';

function devVar(name: string): string | undefined {
  const file = join(import.meta.dirname, '../../.dev.vars');
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const [k, ...rest] = line.split('=');
    if (k.trim() === name) return rest.join('=').trim() || undefined;
  }
  return undefined;
}

describe.skipIf(!LIVE)('live Jev API', () => {
  it('evaluates the keywordMismatch fixture once', async () => {
    const apiKey = process.env.TYPESAFE_API_KEY ?? devVar('TYPESAFE_API_KEY');
    const det = runDeterministic(keywordMismatch, googleAdsRsa);
    const plan = buildSemanticRequest(det, keywordMismatch);
    expect(plan).not.toBeNull();

    const client = createJevClient({
      apiKey,
      baseUrl: process.env.TYPESAFE_BASE_URL ?? devVar('TYPESAFE_BASE_URL'),
      model: process.env.TYPESAFE_MODEL ?? devVar('TYPESAFE_MODEL'),
    });
    const outcome = await client.evaluate(plan!.state, plan!.questions);
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
    if (!outcome.ok) return;

    const { answers, missing } = parseAnswers(outcome.raw, plan!.expectedIds, plan!.questions);
    // Report model/latency/answer count and per-question type + band — never copy.
    const summary = Object.fromEntries(
      Object.entries(answers).map(([id, a]) => [
        id,
        a.type === 'noul'
          ? noulVerdict(a.noul)
          : a.type === 'score'
            ? scoreToBand(
                a.score,
                plan!.questions[id].type === 'score' ? plan!.questions[id].criteria.length : 1,
              )
            : a.choice,
      ]),
    );
    console.log(
      JSON.stringify({
        model: outcome.model,
        latencyMs: outcome.latencyMs,
        answerCount: Object.keys(answers).length,
        missing: missing.length,
        summary,
      }),
    );
    expect(Object.keys(answers).length).toBeGreaterThan(0);
  });
});

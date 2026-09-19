import { describe, expect, it } from 'vitest';
import type { AdInput } from '@core/platform/types';
import { googleAdsRsa } from '@core/platforms/google-ads';
import { runDeterministic } from '@core/checker';
import { buildSemanticRequest } from '@core/semantic/request';
import { AD_LEVEL_QUESTIONS, KEYWORD_QUESTIONS, STATE_CONTEXT } from '@core/semantic/questions';
import * as fixtures from '../fixtures/ads';

function ad(partial: Partial<AdInput>): AdInput {
  return {
    platform: 'google-ads',
    format: 'rsa',
    headlines: [],
    descriptions: [],
    paths: [],
    ...partial,
  };
}

function planFor(input: AdInput) {
  const det = runDeterministic(input, googleAdsRsa);
  return buildSemanticRequest(det, input);
}

describe('buildSemanticRequest', () => {
  it('returns null when the ad is not evaluable', () => {
    expect(planFor(fixtures.blank)).toBeNull();
  });

  it('maps state keys to original 1-based slot indices', () => {
    const plan = planFor(
      ad({
        headlines: ['', 'Second Headline', 'Third Headline'],
        descriptions: ['Only description.', ''],
      }),
    );
    expect(plan).not.toBeNull();
    expect(Object.keys(plan!.state.headlines)).toEqual(['H2', 'H3']);
    expect(plan!.state.headlines.H2).toBe('Second Headline');
    expect(plan!.headlineKeys).toEqual({ 1: 'H2', 2: 'H3' });
    expect(Object.keys(plan!.state.descriptions)).toEqual(['D1']);
  });

  it('sets context and omits target_query without a keyword', () => {
    const plan = planFor(
      ad({ headlines: ['One', 'Two', 'Three'], descriptions: ['Desc one.', 'Desc two.'] }),
    );
    expect(plan!.state.context).toBe(STATE_CONTEXT);
    expect(plan!.state.target_query).toBeUndefined();
  });

  it('includes keyword questions only when a keyword is present', () => {
    const without = planFor(
      ad({ headlines: ['One', 'Two', 'Three'], descriptions: ['D one.', 'D two.'] }),
    );
    for (const id of Object.keys(KEYWORD_QUESTIONS)) {
      expect(without!.questions[id]).toBeUndefined();
    }
    const withKw = planFor(
      ad({
        headlines: ['One', 'Two', 'Three'],
        descriptions: ['D one.', 'D two.'],
        keyword: '  leather boots  ',
      }),
    );
    expect(withKw!.state.target_query).toBe('leather boots');
    for (const id of Object.keys(KEYWORD_QUESTIONS)) {
      expect(withKw!.questions[id]).toBeDefined();
    }
  });

  it('always asks every ad-level question', () => {
    const plan = planFor(
      ad({ headlines: ['One', 'Two', 'Three'], descriptions: ['D one.', 'D two.'] }),
    );
    for (const id of Object.keys(AD_LEVEL_QUESTIONS)) {
      expect(plan!.questions[id]).toBeDefined();
    }
    expect(plan!.expectedIds).toEqual(Object.keys(plan!.questions));
  });

  it('asks vague_H for each non-empty headline with original indices', () => {
    const plan = planFor(
      ad({ headlines: ['', 'Second', 'Third', 'Fourth'], descriptions: ['D one.', 'D two.'] }),
    );
    expect(plan!.questions.vague_H2).toBeDefined();
    expect(plan!.questions.vague_H3).toBeDefined();
    expect(plan!.questions.vague_H4).toBeDefined();
    expect(plan!.questions.vague_H1).toBeUndefined();
  });

  it('asks redundant pairs for all non-dup headline pairs', () => {
    const plan = planFor(
      ad({
        headlines: ['Alpha Text', 'Beta Text', 'Gamma Text'],
        descriptions: ['D one.', 'D two.'],
      }),
    );
    expect(plan!.questions.redundant_H1_H2).toBeDefined();
    expect(plan!.questions.redundant_H1_H3).toBeDefined();
    expect(plan!.questions.redundant_H2_H3).toBeDefined();
  });

  it('excludes pairs already flagged by deterministic duplicate rules', () => {
    const plan = planFor(fixtures.duplicateHeadlines);
    // Headlines 0 and 1 are exact duplicates — no redundant question for them.
    expect(plan!.questions.redundant_H1_H2).toBeUndefined();
    expect(plan!.questions.redundant_H1_H3).toBeDefined();
    expect(plan!.questions.redundant_H2_H3).toBeDefined();
  });

  it('excludes near-duplicate pairs too', () => {
    const plan = planFor(fixtures.nearDuplicateHeadlines);
    expect(plan!.questions.redundant_H1_H2).toBeUndefined();
    expect(plan!.questions.redundant_H2_H3).toBeDefined();
  });

  it('produces deterministic ordering', () => {
    const input = ad({
      headlines: ['One', 'Two', 'Three'],
      descriptions: ['D one.', 'D two.'],
      keyword: 'kw',
    });
    const a = planFor(input);
    const b = planFor(input);
    expect(a!.expectedIds).toEqual(b!.expectedIds);
    expect(a).toEqual(b);
  });

  it('prompt-injection invariant: questions never contain input text', () => {
    const injected = planFor(fixtures.promptInjection);
    const serialized = JSON.stringify(injected!.questions);
    for (const text of [
      ...fixtures.promptInjection.headlines,
      ...fixtures.promptInjection.descriptions,
    ]) {
      if (text.trim() !== '') expect(serialized).not.toContain(text);
    }
  });

  it('prompt-injection plan deep-equals a benign plan with the same slot structure', () => {
    const injected = planFor(fixtures.promptInjection);
    const benign = planFor(
      ad({
        headlines: ['Plain Headline One', 'Plain Headline Two', 'Plain Headline Three'],
        descriptions: ['Plain description one.', 'Plain description two.'],
      }),
    );
    expect(injected!.questions).toEqual(benign!.questions);
    expect(injected!.expectedIds).toEqual(benign!.expectedIds);
  });

  it('html-payload invariant: questions never contain input text', () => {
    const injected = planFor(fixtures.htmlPayload);
    const serialized = JSON.stringify(injected!.questions);
    expect(serialized).not.toContain('<script>');
    const benign = planFor(
      ad({
        headlines: ['Plain Headline One', 'Plain Headline Two', 'Plain Headline Three'],
        descriptions: ['Plain description one.', 'Plain description two.'],
      }),
    );
    expect(injected!.questions).toEqual(benign!.questions);
  });
});

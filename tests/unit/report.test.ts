import { describe, expect, it } from 'vitest';
import type { AdInput } from '@core/platform/types';
import { googleAdsRsa } from '@core/platforms/google-ads';
import { runDeterministic } from '@core/checker';
import { buildSemanticRequest, type SemanticRequestPlan } from '@core/semantic/request';
import { parseAnswers, type JevAnswer, type SemanticResult } from '@core/semantic/answers';
import { buildReport } from '@core/aggregate/report';
import type { SemanticSlice } from '@core/aggregate/types';
import { mockAnswers, noul, score, choice } from '../helpers/mockAnswers';

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

const GOOD_AD: Partial<AdInput> = {
  headlines: [
    'Solid Walnut Shelves',
    'Handmade In Small Batches',
    'Get Free Shipping Today',
    'Custom Sizes For Any Wall',
    'Easy Install With Included Kit',
    'Rated 4.9 By 2,000 Buyers',
    'Ships Within Five Days',
    'Sustainably Sourced Timber',
    'Order Yours Online Now',
    'Ten Year Craft Guarantee',
  ],
  descriptions: [
    'Sturdy shelves built to order in our workshop.',
    'Ships within five business days, tracked.',
    'Free returns within thirty days of delivery.',
  ],
};

function makeReport(
  input: Partial<AdInput>,
  semanticSlice: SemanticSlice = { state: 'not_requested' },
) {
  const full = ad(input);
  const det = runDeterministic(full, googleAdsRsa);
  return buildReport(det, semanticSlice, googleAdsRsa);
}

function semanticResultFor(input: Partial<AdInput>, overrides: Record<string, JevAnswer> = {}) {
  const full = ad(input);
  const det = runDeterministic(full, googleAdsRsa);
  const plan = buildSemanticRequest(det, full) as SemanticRequestPlan;
  const { answers, missing } = parseAnswers(
    mockAnswers(plan, overrides),
    plan.expectedIds,
    plan.questions,
  );
  const result: SemanticResult = {
    status: missing.length === 0 ? 'ok' : 'partial',
    model: 'test-model',
    latencyMs: 1,
    answers,
    missing,
  };
  return { det, result };
}

function reportWithSemantic(input: Partial<AdInput>, overrides: Record<string, JevAnswer> = {}) {
  const { det, result } = semanticResultFor(input, overrides);
  return buildReport(det, { state: result.status, result }, googleAdsRsa);
}

function dim(report: ReturnType<typeof buildReport>, id: string) {
  const d = report.dimensions.find((d) => d.id === id);
  if (!d) throw new Error(`missing dimension ${id}`);
  return d;
}

describe('completeness dimension', () => {
  it('weak when a count rule fires, strong at 10h+3d, good at 5h, else needs_work', () => {
    expect(
      dim(makeReport({ headlines: ['One', 'Two'], descriptions: ['D.'] }), 'completeness').band,
    ).toBe('weak');
    expect(dim(makeReport(GOOD_AD), 'completeness').band).toBe('strong');
    const five = makeReport({ ...GOOD_AD, headlines: GOOD_AD.headlines!.slice(0, 5) });
    expect(dim(five, 'completeness').band).toBe('good');
    const three = makeReport({ ...GOOD_AD, headlines: GOOD_AD.headlines!.slice(0, 3) });
    expect(dim(three, 'completeness').band).toBe('needs_work');
    expect(dim(five, 'completeness').reasons[0]).toContain('5 of 15 headlines');
  });
});

describe('structure dimension', () => {
  it('weak on any error, needs_work at >=3 warnings, good at 1-2, strong clean', () => {
    const err = makeReport({ ...GOOD_AD, headlines: [...GOOD_AD.headlines!, 'x'.repeat(31)] });
    expect(dim(err, 'structure').band).toBe('weak');
    const warnings3 = makeReport({
      ...GOOD_AD,
      headlines: [...GOOD_AD.headlines!, 'Wow!!', 'Deals Here', 'Padded '],
    });
    expect(dim(warnings3, 'structure').band).toBe('needs_work');
    const warnings1 = makeReport({ ...GOOD_AD, headlines: [...GOOD_AD.headlines!, 'Wow!!'] });
    expect(dim(warnings1, 'structure').band).toBe('good');
    expect(dim(makeReport(GOOD_AD), 'structure').band).toBe('strong');
  });
});

describe('differentiation dimension', () => {
  it('weak on exact/normalized duplicates (deterministic)', () => {
    const report = makeReport({
      ...GOOD_AD,
      headlines: [...GOOD_AD.headlines!, 'Same Text', 'Same Text'],
    });
    const d = dim(report, 'differentiation');
    expect(d.band).toBe('weak');
    expect(d.basis).toBe('deterministic');
  });

  it('strong without semantic when no dups and >=3 headlines', () => {
    const d = dim(makeReport(GOOD_AD), 'differentiation');
    expect(d.band).toBe('strong');
    expect(d.basis).toBe('deterministic');
  });

  it('uses headline_complementarity when semantic is available', () => {
    const report = reportWithSemantic(GOOD_AD, { headline_complementarity: score(1) });
    const d = dim(report, 'differentiation');
    expect(d.basis).toBe('mixed');
    expect(d.band).toBe('needs_work'); // score 1/2 = 0.5
  });

  it('downgrades once when >=2 redundant pairs are verdict yes', () => {
    const input = { ...GOOD_AD, headlines: GOOD_AD.headlines!.slice(0, 4) };
    const report = reportWithSemantic(input, {
      headline_complementarity: score(2), // strong
      redundant_H1_H2: noul(0.9),
      redundant_H3_H4: noul(0.9),
    });
    expect(dim(report, 'differentiation').band).toBe('good'); // strong -> good
  });

  it('caps at good when duplicate.near is present', () => {
    const input = {
      ...GOOD_AD,
      headlines: [
        'Shop Durable Leather Boots',
        'Shop Durable Leather Boots Online',
        'Fresh Pasta Daily',
      ],
    };
    const report = reportWithSemantic(input, { headline_complementarity: score(2) });
    const d = dim(report, 'differentiation');
    expect(d.band).toBe('good');
  });
});

describe('relevance dimension', () => {
  it('not_evaluated without a keyword', () => {
    const d = dim(makeReport(GOOD_AD), 'relevance');
    expect(d.band).toBe('not_evaluated');
    expect(d.reasons[0]).toContain('target search query');
  });

  it('strong when phrase in a headline and no missing terms', () => {
    const report = makeReport({
      ...GOOD_AD,
      headlines: [...GOOD_AD.headlines!, 'Leather Boots On Sale'],
      keyword: 'leather boots',
    });
    expect(dim(report, 'relevance').band).toBe('strong');
  });

  it('good when all terms covered but phrase absent', () => {
    // 'walnut' is in a headline, 'shipping' is in another — phrase not adjacent.
    const report = makeReport({ ...GOOD_AD, keyword: 'walnut shipping' });
    expect(dim(report, 'relevance').band).toBe('good');
  });

  it('needs_work when only some terms covered, weak when none', () => {
    const partial = makeReport({ ...GOOD_AD, keyword: 'shelves waterproof' });
    expect(dim(partial, 'relevance').band).toBe('needs_work');
    const none = makeReport({ ...GOOD_AD, keyword: 'quantum blockchain' });
    expect(dim(none, 'relevance').band).toBe('weak');
  });

  it('combines semantic topic/intent and takes the lower band', () => {
    const input = { ...GOOD_AD, keyword: 'walnut shelves' };
    const report = reportWithSemantic(input, {
      topic_match: score(2), // strong
      intent_match: score(0), // weak
    });
    const d = dim(report, 'relevance');
    expect(d.basis).toBe('mixed');
    expect(d.band).toBe('weak'); // lower of weak semantic vs strong det
  });

  it('downgrades semantic band on audience mismatch and missing terms', () => {
    const input = { ...GOOD_AD, keyword: 'walnut shelves waterproof' };
    const report = reportWithSemantic(input, {
      topic_match: score(2),
      intent_match: score(2),
      audience_alignment: choice('mismatch'),
    });
    // strong -> downgrade (mismatch) -> good -> downgrade (missing terms) -> needs_work
    expect(dim(report, 'relevance').band).toBe('needs_work');
  });

  it('caps at good when keyword.stuffing fires', () => {
    const input = {
      headlines: [
        'Cheap Flights To Europe',
        'Cheap Flights To Asia',
        'Cheap Flights Daily Deals',
        'Book Cheap Flights Here',
        'Cheap Flights And Hotels',
        'Cheap Flights All Year',
      ],
      descriptions: ['Compare low fares.', 'Flexible dates help.'],
      keyword: 'cheap flights',
    };
    const report = reportWithSemantic(input, {
      topic_match: score(2),
      intent_match: score(2),
    });
    expect(dim(report, 'relevance').band).toBe('good');
  });
});

describe('clarity dimension', () => {
  it('unavailable without semantic', () => {
    const d = dim(makeReport(GOOD_AD), 'clarity');
    expect(d.band).toBe('unavailable');
    expect(d.basis).toBe('semantic');
  });

  it('bands from clarity_offer', () => {
    const report = reportWithSemantic(GOOD_AD, { clarity_offer: score(3) });
    expect(dim(report, 'clarity').band).toBe('strong');
  });

  it('downgrades when >40% of evaluated headlines are vague', () => {
    const input = { ...GOOD_AD, headlines: GOOD_AD.headlines!.slice(0, 5) };
    const report = reportWithSemantic(input, {
      clarity_offer: score(3), // strong
      vague_H1: noul(0.9),
      vague_H2: noul(0.9),
      vague_H3: noul(0.9),
    });
    // 3/5 vague > 40% -> strong downgraded to good
    expect(dim(report, 'clarity').band).toBe('good');
  });

  it('marks lowConfidence below 0.5', () => {
    const report = reportWithSemantic(GOOD_AD, { clarity_offer: score(3, 0.3) });
    expect(dim(report, 'clarity').lowConfidence).toBe(true);
  });
});

describe('specificity dimension', () => {
  it('unavailable without semantic; banded with it', () => {
    expect(dim(makeReport(GOOD_AD), 'specificity').band).toBe('unavailable');
    const report = reportWithSemantic(GOOD_AD, { specificity: score(1) });
    expect(dim(report, 'specificity').band).toBe('needs_work');
  });
});

describe('cta dimension', () => {
  it('weak without semantic when cta.none_detected fires, good otherwise', () => {
    const noCta = makeReport({
      headlines: [
        'Handcrafted Leather Goods',
        'Premium Materials Every Time',
        'Artisan Workshop In Oregon',
      ],
      descriptions: ['Made with full grain leather.', 'Each piece is finished by hand.'],
    });
    const d = dim(noCta, 'cta');
    expect(d.band).toBe('weak');
    expect(d.basis).toBe('deterministic');
    expect(dim(makeReport(GOOD_AD), 'cta').band).toBe('good');
  });

  it('bands from cta_clarity when semantic is present', () => {
    const report = reportWithSemantic(GOOD_AD, { cta_clarity: score(2) });
    const d = dim(report, 'cta');
    expect(d.band).toBe('strong');
    expect(d.basis).toBe('mixed');
  });
});

describe('semantic issues', () => {
  it('emits vague/redundant issues per verdict with hedged wording', () => {
    const input = { ...GOOD_AD, headlines: GOOD_AD.headlines!.slice(0, 3) };
    const report = reportWithSemantic(input, {
      vague_H1: noul(0.9),
      vague_H2: noul(0.5),
      vague_H3: noul(0.1),
      redundant_H1_H3: noul(0.8),
    });
    const vagueWarn = report.issues.find(
      (i) => i.ruleId === 'semantic.vague_headline' && i.severity === 'warning',
    );
    const vagueInfo = report.issues.find(
      (i) => i.ruleId === 'semantic.vague_headline' && i.severity === 'info',
    );
    expect(vagueWarn?.fields).toEqual([{ field: 'headline', index: 0 }]);
    expect(vagueInfo?.fields).toEqual([{ field: 'headline', index: 1 }]);
    const pair = report.issues.find((i) => i.ruleId === 'semantic.redundant_pair');
    expect(pair?.fields).toEqual([
      { field: 'headline', index: 0 },
      { field: 'headline', index: 2 },
    ]);
    expect(pair?.detail).toContain('appear to communicate the same idea');
    expect(pair?.detail).toContain('Headline 1 and Headline 3');
  });

  it('emits hype and unsupported_claims indicators', () => {
    const report = reportWithSemantic(GOOD_AD, {
      hype: noul(0.8),
      unsupported_claims: noul(0.5),
    });
    const hype = report.issues.find((i) => i.ruleId === 'semantic.hype');
    expect(hype?.severity).toBe('warning');
    const claims = report.issues.find((i) => i.ruleId === 'semantic.unsupported_claims');
    expect(claims?.severity).toBe('info');
    expect(claims?.detail).toContain('not a policy determination');
  });

  it('emits offer_unclear / low_specificity / cta_weak from score bands', () => {
    const report = reportWithSemantic(GOOD_AD, {
      clarity_offer: score(0), // weak
      specificity: score(1), // needs_work
      cta_clarity: score(0), // weak -> but cta.none_detected absent in GOOD_AD? 'Get','Order' present
    });
    expect(report.issues.find((i) => i.ruleId === 'semantic.offer_unclear')?.severity).toBe(
      'warning',
    );
    expect(report.issues.find((i) => i.ruleId === 'semantic.low_specificity')?.severity).toBe(
      'info',
    );
    expect(report.issues.find((i) => i.ruleId === 'semantic.cta_weak')?.severity).toBe('warning');
  });

  it('suppresses semantic.cta_weak warning when cta.none_detected exists', () => {
    const input = {
      headlines: [
        'Handcrafted Leather Goods',
        'Premium Materials Every Time',
        'Artisan Workshop In Oregon',
      ],
      descriptions: ['Made with full grain leather.', 'Each piece is finished by hand.'],
    };
    const report = reportWithSemantic(input, { cta_clarity: score(0) });
    expect(report.issues.map((i) => i.ruleId)).toContain('cta.none_detected');
    expect(report.issues.map((i) => i.ruleId)).not.toContain('semantic.cta_weak');
  });

  it('emits keyword semantic issues and audience mismatch by confidence', () => {
    const input = { ...GOOD_AD, keyword: 'quantum blockchain' };
    const report = reportWithSemantic(input, {
      topic_match: score(0),
      intent_match: score(1),
      audience_alignment: choice('mismatch', 0.9),
    });
    expect(report.issues.find((i) => i.ruleId === 'semantic.topic_mismatch')?.severity).toBe(
      'warning',
    );
    expect(report.issues.find((i) => i.ruleId === 'semantic.intent_gap')?.severity).toBe('info');
    expect(report.issues.find((i) => i.ruleId === 'semantic.audience_mismatch')?.severity).toBe(
      'warning',
    );
    const lowConf = reportWithSemantic(input, { audience_alignment: choice('mismatch', 0.3) });
    const m = lowConf.issues.find((i) => i.ruleId === 'semantic.audience_mismatch');
    expect(m?.severity).toBe('info');
    expect(m?.meta?.lowConfidence).toBe(true);
  });

  it('emits semantic.non_english for other/mixed language', () => {
    const report = reportWithSemantic(GOOD_AD, { primary_language: choice('other') });
    const issue = report.issues.find((i) => i.ruleId === 'semantic.non_english');
    expect(issue?.severity).toBe('info');
    expect(issue?.detail).toContain('tuned for English');
  });

  it('marks meta.lowConfidence on score-derived issues', () => {
    const report = reportWithSemantic(GOOD_AD, { clarity_offer: score(0, 0.3) });
    const issue = report.issues.find((i) => i.ruleId === 'semantic.offer_unclear');
    expect(issue?.meta?.lowConfidence).toBe(true);
  });
});

describe('report status and ordering', () => {
  it('blocked when platform_limit errors exist', () => {
    const report = makeReport({ ...GOOD_AD, headlines: [...GOOD_AD.headlines!, 'x'.repeat(31)] });
    expect(report.status).toBe('blocked');
  });

  it('needs_work on warnings or weak/needs_work dimensions', () => {
    const warn = makeReport({ ...GOOD_AD, headlines: [...GOOD_AD.headlines!, 'Wow!!'] });
    expect(warn.status).toBe('needs_work');
    const fewHeadlines = makeReport({ ...GOOD_AD, headlines: GOOD_AD.headlines!.slice(0, 3) });
    expect(fewHeadlines.status).toBe('needs_work');
  });

  it('ready for a clean ad', () => {
    const report = reportWithSemantic(GOOD_AD);
    expect(report.status).toBe('ready');
  });

  it('sorts issues error→warning→info, deterministic before semantic', () => {
    const input = {
      headlines: ['x'.repeat(31), 'Wow!!', 'Third'],
      descriptions: ['A description.', 'Another description.'],
    };
    const report = reportWithSemantic(input, {
      clarity_offer: score(0),
      vague_H1: noul(0.9),
    });
    const severities = report.issues.map((i) => i.severity);
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < severities.length; i += 1) {
      expect(rank[severities[i]]).toBeGreaterThanOrEqual(rank[severities[i - 1]]);
    }
    const firstWarning = report.issues.findIndex((i) => i.severity === 'warning');
    expect(report.issues[firstWarning].origin).toBe('deterministic');
    const semanticWarnings = report.issues.filter(
      (i) => i.severity === 'warning' && i.origin === 'semantic',
    );
    if (semanticWarnings.length > 0) {
      const lastDetWarning = report.issues
        .map((i, idx) => ({ i, idx }))
        .filter((x) => x.i.severity === 'warning' && x.i.origin === 'deterministic')
        .pop();
      expect(report.issues.indexOf(semanticWarnings[0])).toBeGreaterThan(lastDetWarning!.idx);
    }
  });

  it('unavailable semantic keeps deterministic cta/differentiation bands', () => {
    const report = makeReport(GOOD_AD, { state: 'unavailable', reason: 'timeout' });
    expect(dim(report, 'clarity').band).toBe('unavailable');
    expect(dim(report, 'specificity').band).toBe('unavailable');
    expect(dim(report, 'cta').band).toBe('good');
    expect(dim(report, 'differentiation').band).toBe('strong');
    expect(report.issues.filter((i) => i.origin === 'semantic')).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { AdInput } from '@core/platform/types';
import { googleAdsRsa } from '@core/platforms/google-ads';
import { runDeterministic } from '@core/checker';

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

const BASE = {
  headlines: ['Solid Walnut Shelves', 'Handmade In Small Batches', 'Get Free Shipping Today'],
  descriptions: ['Sturdy shelves built to order.', 'Ships within five business days.'],
};

describe('FieldStats', () => {
  it('builds a stat for every supplied slot, including empty ones', () => {
    const r = runDeterministic(ad({ ...BASE, headlines: [...BASE.headlines, ''] }), googleAdsRsa);
    expect(r.fields.headlines).toHaveLength(4);
    expect(r.fields.headlines[3].status).toBe('empty');
    expect(r.fields.headlines[3].counted).toBe(0);
  });

  it('treats whitespace-only slots as empty and excludes them from counts', () => {
    const r = runDeterministic(
      ad({ ...BASE, headlines: [...BASE.headlines, '   '] }),
      googleAdsRsa,
    );
    expect(r.fields.headlines[3].status).toBe('empty');
    expect(r.counts.headlines).toBe(3);
    // whitespace.edge is not raised for empty slots
    expect(r.issues.filter((i) => i.ruleId === 'whitespace.edge')).toHaveLength(0);
  });

  it('computes counted, remaining and statuses', () => {
    const r = runDeterministic(
      ad({ ...BASE, headlines: ['x'.repeat(20), 'x'.repeat(28), 'x'.repeat(31)] }),
      googleAdsRsa,
    );
    expect(r.fields.headlines[0].status).toBe('ok');
    expect(r.fields.headlines[0].remaining).toBe(10);
    expect(r.fields.headlines[1].status).toBe('near'); // remaining 2 <= 3
    expect(r.fields.headlines[2].status).toBe('over');
    expect(r.fields.headlines[2].remaining).toBe(-1);
  });

  it('keeps the original untrimmed text', () => {
    const r = runDeterministic(ad({ ...BASE, headlines: ['  Padded  '] }), googleAdsRsa);
    expect(r.fields.headlines[0].original).toBe('  Padded  ');
  });

  it('trailing empty slots do not count toward count.max', () => {
    const headlines = [...Array.from({ length: 15 }, (_, i) => `Unique Angle ${i + 1}`), '', '  '];
    const r = runDeterministic(ad({ ...BASE, headlines }), googleAdsRsa);
    expect(r.counts.headlines).toBe(15);
    expect(r.issues.map((i) => i.ruleId)).not.toContain('headline.count.max');
  });

  it('middle empty slots also do not count', () => {
    const headlines = ['One Here', '', 'Two Here', 'Three Here'];
    const r = runDeterministic(ad({ ...BASE, headlines }), googleAdsRsa);
    expect(r.counts.headlines).toBe(3);
    expect(r.issues.map((i) => i.ruleId)).not.toContain('headline.count.min');
  });
});

describe('issueIds', () => {
  it('attaches issue ids to the referenced FieldStats', () => {
    const r = runDeterministic(
      ad({ ...BASE, headlines: [...BASE.headlines, 'x'.repeat(31)] }),
      googleAdsRsa,
    );
    const issue = r.issues.find((i) => i.ruleId === 'headline.length.max');
    expect(issue).toBeDefined();
    expect(r.fields.headlines[3].issueIds).toContain(issue?.id);
    expect(r.fields.headlines[0].issueIds).not.toContain(issue?.id);
  });

  it('attaches duplicate group issues to every member field', () => {
    const r = runDeterministic(
      ad({ ...BASE, headlines: ['Same Text', 'Same Text', 'Different Text'] }),
      googleAdsRsa,
    );
    const issue = r.issues.find((i) => i.ruleId === 'duplicate.exact');
    expect(r.fields.headlines[0].issueIds).toContain(issue?.id);
    expect(r.fields.headlines[1].issueIds).toContain(issue?.id);
    expect(r.fields.headlines[2].issueIds).not.toContain(issue?.id);
  });
});

describe('issue ordering', () => {
  it('sorts error → warning → info, then by first field index', () => {
    const r = runDeterministic(
      ad({
        headlines: ['x'.repeat(40), 'Short 🚀', 'Fine Here'],
        descriptions: ['y'.repeat(95)],
        keyword: 'unrelated phrase',
      }),
      googleAdsRsa,
    );
    const severities = r.issues.map((i) => i.severity);
    const rank = { error: 0, warning: 1, info: 2 };
    for (let i = 1; i < severities.length; i += 1) {
      expect(rank[severities[i]]).toBeGreaterThanOrEqual(rank[severities[i - 1]]);
    }
    // First error should be the headline length issue at index 0 (index < others)
    const errors = r.issues.filter((i) => i.severity === 'error');
    expect(errors[0].fields[0]?.index ?? -1).toBeLessThanOrEqual(
      errors[errors.length - 1].fields[0]?.index ?? Infinity,
    );
  });
});

describe('hasBlockingErrors / evaluable', () => {
  it('hasBlockingErrors is true only for platform_limit errors', () => {
    const blocking = runDeterministic(ad({ ...BASE, headlines: ['x'.repeat(31)] }), googleAdsRsa);
    expect(blocking.hasBlockingErrors).toBe(true);
    // duplicate.exact is an error but kind=structure, not blocking
    const structural = runDeterministic(
      ad({ ...BASE, headlines: ['Same', 'Same', 'Other'] }),
      googleAdsRsa,
    );
    expect(structural.hasBlockingErrors).toBe(false);
  });

  it('evaluable requires at least one non-empty headline or description', () => {
    const blank = runDeterministic(ad({ headlines: ['', ' '], descriptions: [] }), googleAdsRsa);
    expect(blank.evaluable).toBe(false);
    const onlyDesc = runDeterministic(
      ad({ headlines: ['', ' '], descriptions: ['Some text here.'] }),
      googleAdsRsa,
    );
    expect(onlyDesc.evaluable).toBe(true);
    const onlyPath = runDeterministic(
      ad({ headlines: [], descriptions: [], paths: ['slug'] }),
      googleAdsRsa,
    );
    expect(onlyPath.evaluable).toBe(false);
  });
});

describe('keyword coverage', () => {
  it('computes phrase membership and term coverage', () => {
    const r = runDeterministic(
      ad({
        ...BASE,
        headlines: [...BASE.headlines, 'Leather Boots On Sale'],
        keyword: 'leather boots',
      }),
      googleAdsRsa,
    );
    expect(r.keyword?.phraseInHeadlines).toEqual([3]);
    expect(r.keyword?.termsCovered).toEqual(['leather', 'boots']);
    expect(r.keyword?.termsMissing).toEqual([]);
    expect(r.keyword?.headlineShareWithPhrase).toBeCloseTo(0.25);
  });

  it('only counts headlines containing the full phrase', () => {
    const r = runDeterministic(
      ad({
        ...BASE,
        headlines: [...BASE.headlines, 'Leather Boots On Sale'],
        keyword: 'leather boots waterproof',
      }),
      googleAdsRsa,
    );
    expect(r.keyword?.phraseInHeadlines).toEqual([]);
    expect(r.keyword?.termsCovered).toEqual(['leather', 'boots']);
    expect(r.keyword?.termsMissing).toEqual(['waterproof']);
  });

  it('matches the phrase only as a whole-word substring', () => {
    const r = runDeterministic(
      ad({
        ...BASE,
        headlines: [...BASE.headlines, 'Bootstrapper Weekly Deals'],
        keyword: 'boots',
      }),
      googleAdsRsa,
    );
    expect(r.keyword?.phraseInHeadlines).toEqual([]);
  });

  it('falls back to all tokens when the keyword is only stopwords', () => {
    const r = runDeterministic(ad({ ...BASE, keyword: 'the and of' }), googleAdsRsa);
    expect(r.keyword?.terms).toEqual(['the', 'and', 'of']);
  });

  it('ignores a blank keyword', () => {
    const r = runDeterministic(ad({ ...BASE, keyword: '   ' }), googleAdsRsa);
    expect(r.keyword).toBeUndefined();
  });
});

describe('finalUrl FieldStat', () => {
  it('is present only when finalUrl is provided', () => {
    expect(runDeterministic(ad(BASE), googleAdsRsa).fields.finalUrl).toBeUndefined();
    const r = runDeterministic(ad({ ...BASE, finalUrl: 'https://example.com' }), googleAdsRsa);
    expect(r.fields.finalUrl?.ref).toEqual({ field: 'finalUrl', index: 0 });
    expect(r.fields.finalUrl?.limit).toBeNull();
  });
});

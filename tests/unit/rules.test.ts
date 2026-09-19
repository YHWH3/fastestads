import { describe, expect, it } from 'vitest';
import type { AdInput, Issue } from '@core/platform/types';
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

function run(input: Partial<AdInput>) {
  return runDeterministic(ad(input), googleAdsRsa);
}

function ruleIds(input: Partial<AdInput>): string[] {
  return run(input).issues.map((i) => i.ruleId);
}

function issuesFor(input: Partial<AdInput>, ruleId: string): Issue[] {
  return run(input).issues.filter((i) => i.ruleId === ruleId);
}

// A minimal valid baseline: 3 distinct headlines, 2 descriptions, 1 CTA.
const BASE = {
  headlines: ['Solid Walnut Shelves', 'Handmade In Small Batches', 'Get Free Shipping Today'],
  descriptions: ['Sturdy shelves built to order.', 'Ships within five business days.'],
};

describe('platform limit rules', () => {
  it('headline.count.min fires below 3 and not at 3', () => {
    expect(ruleIds({ ...BASE, headlines: ['One', 'Two'] })).toContain('headline.count.min');
    expect(ruleIds(BASE)).not.toContain('headline.count.min');
  });

  it('headline.count.max fires above 15 and lists excess fields', () => {
    const issues = issuesFor(
      { ...BASE, headlines: Array.from({ length: 16 }, (_, i) => `Unique Angle ${i + 1}`) },
      'headline.count.max',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].fields).toEqual([{ field: 'headline', index: 15 }]);
    expect(
      ruleIds({
        ...BASE,
        headlines: Array.from({ length: 15 }, (_, i) => `Unique Angle ${i + 1}`),
      }),
    ).not.toContain('headline.count.max');
  });

  it('description.count.min fires below 2', () => {
    expect(ruleIds({ ...BASE, descriptions: ['Only one.'] })).toContain('description.count.min');
    expect(ruleIds(BASE)).not.toContain('description.count.min');
  });

  it('description.count.max fires above 4', () => {
    const descriptions = Array.from({ length: 5 }, (_, i) => `Different point ${i + 1} made here.`);
    const issues = issuesFor({ ...BASE, descriptions }, 'description.count.max');
    expect(issues).toHaveLength(1);
    expect(issues[0].fields).toEqual([{ field: 'description', index: 4 }]);
  });

  it('path.count.max fires above 2', () => {
    expect(ruleIds({ ...BASE, paths: ['one', 'two', 'three'] })).toContain('path.count.max');
    expect(ruleIds({ ...BASE, paths: ['one', 'two'] })).not.toContain('path.count.max');
  });

  it('headline.length.max fires at 31 counted chars but not 30', () => {
    const over = issuesFor(
      { ...BASE, headlines: [...BASE.headlines, 'x'.repeat(31)] },
      'headline.length.max',
    );
    expect(over).toHaveLength(1);
    expect(over[0].fields).toEqual([{ field: 'headline', index: 3 }]);
    expect(over[0].meta).toMatchObject({ counted: 31, limit: 30 });
    expect(ruleIds({ ...BASE, headlines: [...BASE.headlines, 'x'.repeat(30)] })).not.toContain(
      'headline.length.max',
    );
  });

  it('description.length.max fires at 91 counted chars but not 90', () => {
    expect(ruleIds({ ...BASE, descriptions: [...BASE.descriptions, 'x'.repeat(91)] })).toContain(
      'description.length.max',
    );
    expect(
      ruleIds({ ...BASE, descriptions: [...BASE.descriptions, 'x'.repeat(90)] }),
    ).not.toContain('description.length.max');
  });

  it('path.length.max fires at 16 chars but not 15', () => {
    expect(ruleIds({ ...BASE, paths: ['x'.repeat(16)] })).toContain('path.length.max');
    expect(ruleIds({ ...BASE, paths: ['x'.repeat(15)] })).not.toContain('path.length.max');
  });

  it('double-width characters count as 2 toward the limit', () => {
    const issues = issuesFor(
      { ...BASE, headlines: [...BASE.headlines, 'あ'.repeat(16)] },
      'headline.length.max',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].meta).toMatchObject({ counted: 32 });
  });

  it('field.line_break fires on any field kind', () => {
    const r = run({
      ...BASE,
      headlines: [...BASE.headlines, 'Line\nBreak'],
      descriptions: [...BASE.descriptions, 'Break\nHere'],
      paths: ['pa\nth'],
    });
    const ids = r.issues.filter((i) => i.ruleId === 'field.line_break');
    expect(ids).toHaveLength(3);
    expect(ids.map((i) => i.fields[0].field).sort()).toEqual(['description', 'headline', 'path']);
  });

  it('finalUrl.invalid only fires for malformed provided URLs', () => {
    expect(ruleIds({ ...BASE, finalUrl: 'notaurl' })).toContain('finalUrl.invalid');
    expect(ruleIds({ ...BASE, finalUrl: 'ftp://example.com' })).toContain('finalUrl.invalid');
    expect(ruleIds({ ...BASE, finalUrl: 'https://localhost' })).toContain('finalUrl.invalid');
    expect(ruleIds({ ...BASE, finalUrl: 'https://example.com' })).not.toContain('finalUrl.invalid');
    expect(ruleIds(BASE)).not.toContain('finalUrl.invalid');
  });
});

describe('duplicate rules', () => {
  it('duplicate.exact groups identical trimmed text into one issue', () => {
    const issues = issuesFor(
      { ...BASE, headlines: ['Same Great Offer', 'Same Great Offer', 'Different Angle Here'] },
      'duplicate.exact',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].fields).toEqual([
      { field: 'headline', index: 0 },
      { field: 'headline', index: 1 },
    ]);
  });

  it('duplicate.normalized fires on punctuation/case-only differences', () => {
    const issues = issuesFor(
      { ...BASE, headlines: ['Buy Now!', 'buy now', 'Different Angle Here'] },
      'duplicate.normalized',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('duplicate.near fires at Jaccard >= 0.75 but not below', () => {
    const near = issuesFor(
      {
        ...BASE,
        headlines: [
          'Shop Durable Leather Boots',
          'Shop Durable Leather Boots Online',
          'Fresh Pasta Made Daily',
        ],
      },
      'duplicate.near',
    );
    expect(near).toHaveLength(1);
    expect(near[0].fields).toHaveLength(2);
    expect(
      issuesFor(
        {
          ...BASE,
          headlines: [
            'Save On Quality Shoes Today',
            'Save On Quality Shoes Now',
            'Fresh Pasta Made Daily',
          ],
        },
        'duplicate.near',
      ),
    ).toHaveLength(0); // Jaccard 3/5 = 0.6
  });

  it('duplicate.near unions transitivity into a single issue', () => {
    const issues = issuesFor(
      {
        ...BASE,
        headlines: [
          'Alpha Beta Gamma',
          'Alpha Beta Gamma Delta',
          'Alpha Beta Gamma Epsilon',
          'Totally Other Text',
        ],
      },
      'duplicate.near',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].fields).toHaveLength(3);
  });

  it('exact duplicates are not also reported as near-duplicates', () => {
    const r = run({
      ...BASE,
      headlines: ['Same Great Offer', 'Same Great Offer', 'Different Angle Here'],
    });
    expect(r.issues.map((i) => i.ruleId)).not.toContain('duplicate.near');
  });

  it('requires at least 2 content tokens per side', () => {
    expect(
      issuesFor(
        { ...BASE, headlines: ['The Shoes', 'Shoes', 'Different Angle Here'] },
        'duplicate.near',
      ),
    ).toHaveLength(0); // 'Shoes' has a single content token
  });

  it('computes duplicates within descriptions separately', () => {
    const issues = issuesFor(
      { ...BASE, descriptions: ['Identical Words', 'Identical Words'] },
      'duplicate.exact',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].fields[0].field).toBe('description');
  });
});

describe('editorial rules', () => {
  const withExtraHeadline = (text: string) => ({ ...BASE, headlines: [...BASE.headlines, text] });

  it('chars.emoji flags emoji but not digits or symbols', () => {
    expect(ruleIds(withExtraHeadline('Fresh Coffee 🚀'))).toContain('chars.emoji');
    expect(ruleIds(withExtraHeadline('Save 5 Today'))).not.toContain('chars.emoji');
    expect(ruleIds(withExtraHeadline('Rated #1 Tool'))).not.toContain('chars.emoji');
  });

  it('chars.halfwidth_katakana flags ｱ but not fullwidth ア', () => {
    expect(ruleIds(withExtraHeadline('ｱｲｳ Kana'))).toContain('chars.halfwidth_katakana');
    expect(ruleIds(withExtraHeadline('アイウ Kana'))).not.toContain('chars.halfwidth_katakana');
  });

  it('chars.invisible flags ZWSP but not RLM', () => {
    expect(ruleIds(withExtraHeadline('Quiet\u200BMove'))).toContain('chars.invisible');
    expect(ruleIds(withExtraHeadline('מבצע\u200Fמיוחד'))).not.toContain('chars.invisible');
  });

  it('whitespace.edge flags padded text but not whitespace-only slots', () => {
    expect(ruleIds(withExtraHeadline(' Padded '))).toContain('whitespace.edge');
    expect(ruleIds({ ...BASE, headlines: [...BASE.headlines, '   '] })).not.toContain(
      'whitespace.edge',
    );
  });

  it('whitespace.double flags double spaces', () => {
    expect(ruleIds(withExtraHeadline('Buy  Now'))).toContain('whitespace.double');
    expect(ruleIds(withExtraHeadline('Buy Now'))).not.toContain('whitespace.double');
  });

  it('whitespace.nonstandard flags NBSP', () => {
    expect(ruleIds(withExtraHeadline('Deals\u00A0Everywhere'))).toContain('whitespace.nonstandard');
    expect(ruleIds(withExtraHeadline('Deals Everywhere'))).not.toContain('whitespace.nonstandard');
  });

  it('whitespace.missing_after_punct flags joined sentences but not URLs or ellipses', () => {
    expect(ruleIds(withExtraHeadline('Hello.World'))).toContain('whitespace.missing_after_punct');
    expect(ruleIds(withExtraHeadline('Visit example.com today'))).not.toContain(
      'whitespace.missing_after_punct',
    );
    expect(ruleIds(withExtraHeadline('Wait...What'))).not.toContain(
      'whitespace.missing_after_punct',
    );
  });

  it('punct.repeated flags !! ?? ** -- and a second ellipsis', () => {
    expect(ruleIds(withExtraHeadline('Wow!!'))).toContain('punct.repeated');
    expect(ruleIds(withExtraHeadline('Really??'))).toContain('punct.repeated');
    expect(ruleIds(withExtraHeadline('Star***'))).toContain('punct.repeated');
    expect(ruleIds(withExtraHeadline('Dash--Dash'))).toContain('punct.repeated');
    expect(ruleIds(withExtraHeadline('Sale...'))).not.toContain('punct.repeated');
    expect(ruleIds(withExtraHeadline('One... Two...'))).toContain('punct.repeated');
    expect(ruleIds(withExtraHeadline('Wow!'))).not.toContain('punct.repeated');
  });

  it('punct.exclamation_excess flags more than one exclamation', () => {
    expect(ruleIds(withExtraHeadline('Wow! Great!'))).toContain('punct.exclamation_excess');
    expect(ruleIds(withExtraHeadline('Wow!'))).not.toContain('punct.exclamation_excess');
  });

  it('symbols.decorative flags bullets, arrows, checks and *text*', () => {
    expect(ruleIds(withExtraHeadline('• Top Picks'))).toContain('symbols.decorative');
    expect(ruleIds(withExtraHeadline('A → B'))).toContain('symbols.decorative');
    expect(ruleIds(withExtraHeadline('✓ Verified'))).toContain('symbols.decorative');
    expect(ruleIds(withExtraHeadline('Big *Sale* Now'))).toContain('symbols.decorative');
    expect(ruleIds(withExtraHeadline('Hot ~deal~ today'))).toContain('symbols.decorative');
    expect(ruleIds(withExtraHeadline('Plain Text Here'))).not.toContain('symbols.decorative');
  });

  it('caps.all_caps_word flags long caps words outside the allowlist', () => {
    expect(ruleIds(withExtraHeadline('PREMIUM Quality Today'))).toContain('caps.all_caps_word');
    expect(ruleIds(withExtraHeadline('ASAP CRM API Info'))).not.toContain('caps.all_caps_word');
    expect(ruleIds(withExtraHeadline('Big SALE Day'))).toContain('caps.all_caps_word');
  });

  it('caps.all_caps_word treats a caps word in >= 2 assets as a brand', () => {
    expect(
      ruleIds({
        ...BASE,
        headlines: [...BASE.headlines, 'ACME Makes Shelves'],
        descriptions: [...BASE.descriptions, 'ACME ships everywhere.'],
      }),
    ).not.toContain('caps.all_caps_word');
  });

  it('caps.alternating flags >= 3 alternations in a >= 5 letter word', () => {
    expect(ruleIds(withExtraHeadline('fLoWeRs For You'))).toContain('caps.alternating');
    expect(ruleIds(withExtraHeadline('Flowers For You'))).not.toContain('caps.alternating');
  });

  it('caps.spaced_letters flags F.L.O.W.E.R.S patterns', () => {
    expect(ruleIds(withExtraHeadline('F.L.O.W.E.R.S Shop'))).toContain('caps.spaced_letters');
    expect(ruleIds(withExtraHeadline('U.S.A Made'))).not.toContain('caps.spaced_letters');
  });

  it('phone.in_text flags phone numbers but not prices, years or 24/7', () => {
    expect(ruleIds(withExtraHeadline('Call 800-555-0199'))).toContain('phone.in_text');
    expect(ruleIds(withExtraHeadline('Call 555.123.4567'))).toContain('phone.in_text');
    expect(ruleIds(withExtraHeadline('Only $1,299 today'))).not.toContain('phone.in_text');
    expect(ruleIds(withExtraHeadline('Open 24/7 Always'))).not.toContain('phone.in_text');
    expect(ruleIds(withExtraHeadline('Since 2026 Strong'))).not.toContain('phone.in_text');
  });

  it('repetition.word_within_asset flags a repeated >=4-letter content word', () => {
    expect(ruleIds(withExtraHeadline('Sale Sale Sale Today'))).toContain(
      'repetition.word_within_asset',
    );
    expect(ruleIds(withExtraHeadline('Big Sale Today'))).not.toContain(
      'repetition.word_within_asset',
    );
    expect(ruleIds(withExtraHeadline('the the the the'))).not.toContain(
      'repetition.word_within_asset',
    );
  });

  it('editorial details hedge with "may be flagged"', () => {
    const r = run(withExtraHeadline('Wow!! 🚀'));
    const editorial = r.issues.filter((i) => i.kind === 'editorial_indicator');
    expect(editorial.length).toBeGreaterThan(0);
    for (const issue of editorial) {
      expect(issue.detail).toMatch(/may be flagged/);
      expect(issue.detail).not.toMatch(/will be disapproved/);
    }
  });
});

describe('keyword rules', () => {
  it('keyword.missing_in_headlines fires when the phrase is absent', () => {
    const r = run({ ...BASE, keyword: 'leather boots' });
    expect(r.issues.map((i) => i.ruleId)).toContain('keyword.missing_in_headlines');
    const withPhrase = run({
      ...BASE,
      headlines: [...BASE.headlines, 'Leather Boots On Sale'],
      keyword: 'leather boots',
    });
    expect(withPhrase.issues.map((i) => i.ruleId)).not.toContain('keyword.missing_in_headlines');
  });

  it('keyword.terms_missing lists terms appearing nowhere', () => {
    const r = run({ ...BASE, keyword: 'walnut shelves waterproof' });
    const issue = r.issues.find((i) => i.ruleId === 'keyword.terms_missing');
    expect(issue).toBeDefined();
    expect(issue?.meta?.termsMissing).toBe('waterproof');
    expect(r.keyword?.termsCovered).toEqual(['walnut', 'shelves']);
  });

  it('keyword.stuffing fires when > 60% of >= 5 headlines contain the phrase', () => {
    const stuffed = run({
      ...BASE,
      headlines: [
        'Cheap Flights To Europe',
        'Cheap Flights To Asia',
        'Cheap Flights Daily Deals',
        'Book Cheap Flights Here',
        'Cheap Flights And Hotels',
        'Cheap Flights All Year',
      ],
      keyword: 'cheap flights',
    });
    expect(stuffed.issues.map((i) => i.ruleId)).toContain('keyword.stuffing');
    const fourOnly = run({
      ...BASE,
      headlines: [
        'Cheap Flights One',
        'Cheap Flights Two',
        'Cheap Flights Three',
        'Cheap Flights Four',
      ],
      keyword: 'cheap flights',
    });
    expect(fourOnly.issues.map((i) => i.ruleId)).not.toContain('keyword.stuffing');
  });

  it('skips keyword rules entirely without a keyword', () => {
    const r = run(BASE);
    expect(r.keyword).toBeUndefined();
    expect(r.issues.filter((i) => i.kind === 'keyword')).toHaveLength(0);
  });
});

describe('best practice rules', () => {
  it('headline.utilization.low fires below 8 non-empty headlines', () => {
    expect(ruleIds(BASE)).toContain('headline.utilization.low');
    const eight = run({
      ...BASE,
      headlines: Array.from({ length: 8 }, (_, i) => `Distinct Angle ${i + 1}`),
    });
    expect(eight.issues.map((i) => i.ruleId)).not.toContain('headline.utilization.low');
  });

  it('description.utilization.low fires below 3', () => {
    expect(ruleIds(BASE)).toContain('description.utilization.low');
    const three = run({
      ...BASE,
      descriptions: ['One thing here.', 'Another thing here.', 'Third point right here.'],
    });
    expect(three.issues.map((i) => i.ruleId)).not.toContain('description.utilization.low');
  });

  it('cta.none_detected fires when no CTA lexicon hit exists', () => {
    expect(
      ruleIds({
        headlines: [
          'Handcrafted Leather Goods',
          'Premium Materials Every Time',
          'Artisan Workshop In Oregon',
        ],
        descriptions: ['Made with full grain leather.', 'Each piece is finished by hand.'],
      }),
    ).toContain('cta.none_detected');
    expect(ruleIds(BASE)).not.toContain('cta.none_detected');
    expect(ruleIds({ ...BASE, headlines: [...BASE.headlines, 'Sign Up For Deals'] })).not.toContain(
      'cta.none_detected',
    );
  });

  it('titles stay within 60 characters', () => {
    const r = run({
      headlines: [
        'SAVE HUGE ON EVERYTHING NOW!!!',
        '🚀 Best Deals Call 800-555-0199',
        'x'.repeat(40),
      ],
      descriptions: ['y'.repeat(95)],
    });
    for (const issue of r.issues) {
      expect(issue.title.length).toBeLessThanOrEqual(60);
    }
  });
});

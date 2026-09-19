import { describe, expect, it } from 'vitest';
import type { AdInput } from '@core/platform/types';
import { googleAdsRsa } from '@core/platforms/google-ads';
import { runDeterministic } from '@core/checker';
import * as fixtures from '../fixtures/ads';

const named = Object.entries(fixtures).filter(
  (entry): entry is [string, AdInput] =>
    typeof entry[1] === 'object' && entry[1] !== null && Array.isArray(entry[1].headlines),
);

describe('fixtures smoke test', () => {
  it('exports fixtures', () => {
    expect(named.length).toBeGreaterThanOrEqual(15);
  });

  it.each(named)('%s runs through runDeterministic without throwing', (_name, input) => {
    const result = runDeterministic(input, googleAdsRsa);
    expect(result.counts.headlines).toBeGreaterThanOrEqual(0);
    expect(result.fields.headlines.length).toBe(input.headlines.length);
    // issue ids are unique
    const ids = result.issues.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('excellent produces no issues', () => {
    const r = runDeterministic(fixtures.excellent, googleAdsRsa);
    expect(r.issues).toEqual([]);
    expect(r.hasBlockingErrors).toBe(false);
    expect(r.evaluable).toBe(true);
  });

  it('bad raises the expected blocking errors and editorial flags', () => {
    const ids = runDeterministic(fixtures.bad, googleAdsRsa).issues.map((i) => i.ruleId);
    for (const id of [
      'headline.count.min',
      'description.count.min',
      'description.length.max',
      'finalUrl.invalid',
      'chars.emoji',
      'phone.in_text',
      'caps.all_caps_word',
      'punct.repeated',
      'punct.exclamation_excess',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('duplicateHeadlines flags duplicate.exact once', () => {
    const r = runDeterministic(fixtures.duplicateHeadlines, googleAdsRsa);
    const issues = r.issues.filter((i) => i.ruleId === 'duplicate.exact');
    expect(issues).toHaveLength(1);
    expect(issues[0].fields).toHaveLength(2);
  });

  it('nearDuplicateHeadlines flags duplicate.near once', () => {
    const r = runDeterministic(fixtures.nearDuplicateHeadlines, googleAdsRsa);
    const issues = r.issues.filter((i) => i.ruleId === 'duplicate.near');
    expect(issues).toHaveLength(1);
    expect(issues[0].fields).toEqual([
      { field: 'headline', index: 0 },
      { field: 'headline', index: 1 },
    ]);
  });

  it('missingCta flags cta.none_detected', () => {
    const ids = runDeterministic(fixtures.missingCta, googleAdsRsa).issues.map((i) => i.ruleId);
    expect(ids).toContain('cta.none_detected');
  });

  it('vagueCopy runs cleanly and flags no CTA', () => {
    const ids = runDeterministic(fixtures.vagueCopy, googleAdsRsa).issues.map((i) => i.ruleId);
    expect(ids).toContain('cta.none_detected');
  });

  it('keywordMismatch flags missing phrase and missing terms', () => {
    const r = runDeterministic(fixtures.keywordMismatch, googleAdsRsa);
    const ids = r.issues.map((i) => i.ruleId);
    expect(ids).toContain('keyword.missing_in_headlines');
    expect(ids).toContain('keyword.terms_missing');
    expect(r.keyword?.termsMissing).toEqual(expect.arrayContaining(['best', 'crm', 'small']));
  });

  it('exactBoundary stays under length limits', () => {
    const r = runDeterministic(fixtures.exactBoundary, googleAdsRsa);
    expect(r.fields.headlines[0].counted).toBe(30);
    expect(r.fields.headlines[0].status).toBe('near');
    expect(r.fields.descriptions[0].counted).toBe(90);
    const ids = r.issues.map((i) => i.ruleId);
    expect(ids).not.toContain('headline.length.max');
    expect(ids).not.toContain('description.length.max');
  });

  it('oneOver crosses both length limits', () => {
    const r = runDeterministic(fixtures.oneOver, googleAdsRsa);
    const ids = r.issues.map((i) => i.ruleId);
    expect(ids).toContain('headline.length.max');
    expect(ids).toContain('description.length.max');
    expect(r.fields.headlines[0].counted).toBe(31);
    expect(r.fields.descriptions[0].counted).toBe(91);
    expect(r.hasBlockingErrors).toBe(true);
  });

  it('emoji flags chars.emoji', () => {
    const ids = runDeterministic(fixtures.emoji, googleAdsRsa).issues.map((i) => i.ruleId);
    expect(ids).toContain('chars.emoji');
  });

  it('cjk headline counts double-width and crosses the limit', () => {
    const r = runDeterministic(fixtures.cjk, googleAdsRsa);
    expect(r.fields.headlines[0].graphemes).toBe(16);
    expect(r.fields.headlines[0].counted).toBe(32);
    expect(r.issues.map((i) => i.ruleId)).toContain('headline.length.max');
  });

  it('rtl does not flag chars.invisible for RLM', () => {
    const ids = runDeterministic(fixtures.rtl, googleAdsRsa).issues.map((i) => i.ruleId);
    expect(ids).not.toContain('chars.invisible');
  });

  it('htmlPayload is treated as plain text without crashing', () => {
    const r = runDeterministic(fixtures.htmlPayload, googleAdsRsa);
    expect(r.fields.headlines[0].original).toBe('<script>alert(1)</script>');
    expect(r.evaluable).toBe(true);
  });

  it('promptInjection is just text', () => {
    const r = runDeterministic(fixtures.promptInjection, googleAdsRsa);
    expect(r.fields.headlines[0].original).toContain('Ignore all previous instructions');
    expect(r.evaluable).toBe(true);
  });

  it('extremelyLong flags description.length.max', () => {
    const r = runDeterministic(fixtures.extremelyLong, googleAdsRsa);
    expect(r.fields.descriptions[0].counted).toBe(5000);
    expect(r.issues.map((i) => i.ruleId)).toContain('description.length.max');
  });

  it('blank is not evaluable and still surfaces count minimums', () => {
    const r = runDeterministic(fixtures.blank, googleAdsRsa);
    expect(r.evaluable).toBe(false);
    const ids = r.issues.map((i) => i.ruleId);
    expect(ids).toContain('headline.count.min');
    expect(ids).toContain('description.count.min');
  });

  it('tooFewHeadlines flags both count minimums', () => {
    const ids = runDeterministic(fixtures.tooFewHeadlines, googleAdsRsa).issues.map(
      (i) => i.ruleId,
    );
    expect(ids).toContain('headline.count.min');
    expect(ids).toContain('description.count.min');
  });

  it('tooMany flags both count maximums', () => {
    const r = runDeterministic(fixtures.tooMany, googleAdsRsa);
    const ids = r.issues.map((i) => i.ruleId);
    expect(ids).toContain('headline.count.max');
    expect(ids).toContain('description.count.max');
    expect(r.counts.headlines).toBe(16);
  });

  it('whitespaceMess flags the whitespace and invisible-character rules', () => {
    const ids = runDeterministic(fixtures.whitespaceMess, googleAdsRsa).issues.map((i) => i.ruleId);
    for (const id of [
      'whitespace.edge',
      'whitespace.double',
      'whitespace.nonstandard',
      'chars.invisible',
      'field.line_break',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('phoneNumber flags phone.in_text', () => {
    const ids = runDeterministic(fixtures.phoneNumber, googleAdsRsa).issues.map((i) => i.ruleId);
    expect(ids).toContain('phone.in_text');
  });

  it('allCaps flags caps.all_caps_word', () => {
    const ids = runDeterministic(fixtures.allCaps, googleAdsRsa).issues.map((i) => i.ruleId);
    expect(ids).toContain('caps.all_caps_word');
  });

  it('stuffing flags keyword.stuffing', () => {
    const r = runDeterministic(fixtures.stuffing, googleAdsRsa);
    expect(r.issues.map((i) => i.ruleId)).toContain('keyword.stuffing');
    expect(r.keyword?.headlineShareWithPhrase).toBe(1);
  });
});

import type { Rule } from '../../../platform/types';
import { defineRule, makeIssue } from '../../../platform/issue';
import { SOURCES } from '../spec';

const KEYWORD_REF = { field: 'keyword' as const, index: 0 };

const keywordMissingInHeadlines = defineRule({
  id: 'keyword.missing_in_headlines',
  label: 'Keyword phrase missing from headlines',
  kind: 'keyword',
  severity: 'warning',
  source: SOURCES.rsaSpec,
  check(ctx, rule) {
    const kw = ctx.keyword;
    if (!kw || kw.phraseInHeadlines.length > 0) return [];
    const missing =
      kw.termsMissing.length > 0 ? ` Missing terms: ${kw.termsMissing.join(', ')}.` : '';
    return [
      makeIssue(
        rule,
        [KEYWORD_REF],
        {
          title: 'Keyword phrase is missing from all headlines',
          detail: `None of the headlines contain "${kw.raw}" as a phrase.${missing}`,
          recommendation:
            "Include the keyword phrase or its key terms in at least one headline — Google's own RSA tip.",
          meta: { termsMissing: kw.termsMissing.join(' ') },
        },
        'kw',
      ),
    ];
  },
});

const keywordTermsMissing = defineRule({
  id: 'keyword.terms_missing',
  label: 'Keyword terms coverage',
  kind: 'keyword',
  severity: 'info',
  source: SOURCES.rsaSpec,
  check(ctx, rule) {
    const kw = ctx.keyword;
    if (!kw || kw.termsMissing.length === 0) return [];
    return [
      makeIssue(
        rule,
        [KEYWORD_REF],
        {
          title: 'Some keyword terms appear nowhere',
          detail: `These keyword terms do not appear in any headline, description, or path: ${kw.termsMissing.join(', ')}.`,
          recommendation: 'Work the missing terms into at least one asset where natural.',
          meta: { termsMissing: kw.termsMissing.join(' ') },
        },
        'kw',
      ),
    ];
  },
});

const keywordStuffing = defineRule({
  id: 'keyword.stuffing',
  label: 'Keyword stuffing',
  kind: 'keyword',
  severity: 'warning',
  source: SOURCES.rsaSpec,
  check(ctx, rule) {
    const kw = ctx.keyword;
    if (!kw) return [];
    const total = ctx.counts.headlines;
    if (total < 5 || kw.headlineShareWithPhrase <= 0.6) return [];
    return [
      makeIssue(
        rule,
        [KEYWORD_REF],
        {
          title: 'Keyword phrase is stuffed into most headlines',
          detail: `"${kw.raw}" appears in ${kw.phraseInHeadlines.length} of ${total} headlines (${Math.round(kw.headlineShareWithPhrase * 100)}%), which reads as keyword stuffing.`,
          recommendation: 'Keep the phrase in 1–2 headlines and vary the rest.',
          meta: {
            withPhrase: kw.phraseInHeadlines.length,
            total,
            share: kw.headlineShareWithPhrase,
          },
        },
        'kw',
      ),
    ];
  },
});

export const keywordRules: Rule[] = [
  keywordMissingInHeadlines,
  keywordTermsMissing,
  keywordStuffing,
];

import type { Rule } from '../../../platform/types';
import { defineRule, makeIssue } from '../../../platform/issue';
import { normalizeForCompare, tokenize } from '../../../text';
import { SOURCES } from '../spec';
import { allAssets } from './shared';

const CTA_WORDS: ReadonlySet<string> = new Set([
  'get',
  'buy',
  'shop',
  'order',
  'start',
  'try',
  'book',
  'download',
  'signup',
  'subscribe',
  'request',
  'compare',
  'call',
  'claim',
  'join',
  'discover',
  'see',
  'find',
  'save',
  'apply',
  'schedule',
  'reserve',
  'register',
  'contact',
  'explore',
  'upgrade',
  'browse',
  'view',
  'visit',
  'grab',
  'unlock',
]);

const CTA_PHRASES: readonly string[] = [
  'sign up',
  'learn more',
  'talk to',
  'speak to',
  'free trial',
  'get a quote',
  'get started',
];

function hasCta(texts: string[]): boolean {
  for (const text of texts) {
    const normalized = ` ${normalizeForCompare(text)} `;
    for (const token of tokenize(text)) {
      if (CTA_WORDS.has(token)) return true;
    }
    for (const phrase of CTA_PHRASES) {
      if (normalized.includes(` ${phrase} `)) return true;
    }
  }
  return false;
}

const headlineUtilizationLow = defineRule({
  id: 'headline.utilization.low',
  label: 'Headline utilization',
  kind: 'best_practice',
  severity: 'info',
  source: SOURCES.rsaSpec,
  check(ctx, rule) {
    const count = ctx.counts.headlines;
    if (count >= 8) return [];
    return [
      makeIssue(
        rule,
        [],
        {
          title: `Only ${count} headlines supplied`,
          detail:
            'Google recommends providing as many unique headlines as you can — up to 15 — to give its combinations more to work with.',
          recommendation: `Add ${8 - count}+ more distinct headlines.`,
          meta: { supplied: count, suggested: 8, max: 15 },
        },
        'ad',
      ),
    ];
  },
});

const descriptionUtilizationLow = defineRule({
  id: 'description.utilization.low',
  label: 'Description utilization',
  kind: 'best_practice',
  severity: 'info',
  source: SOURCES.rsaSpec,
  check(ctx, rule) {
    const count = ctx.counts.descriptions;
    if (count >= 3) return [];
    return [
      makeIssue(
        rule,
        [],
        {
          title: `Only ${count} descriptions supplied`,
          detail: 'Google allows up to 4 descriptions; supplying at least 3 improves coverage.',
          recommendation: 'Add more distinct descriptions.',
          meta: { supplied: count, suggested: 3, max: 4 },
        },
        'ad',
      ),
    ];
  },
});

const ctaNoneDetected = defineRule({
  id: 'cta.none_detected',
  label: 'Call to action present',
  kind: 'best_practice',
  severity: 'warning',
  source: SOURCES.rsaSpec,
  check(ctx, rule) {
    const texts = allAssets(ctx).map((a) => a.entry.text);
    if (texts.length === 0 || hasCta(texts)) return [];
    return [
      makeIssue(
        rule,
        [],
        {
          title: 'No call to action detected',
          detail:
            'None of the assets contain a common call-to-action verb or phrase (e.g. "get", "try", "sign up").',
          recommendation:
            'Add a clear call to action such as "Get a quote" or "Start free trial" to at least one asset.',
        },
        'ad',
      ),
    ];
  },
});

export const bestPracticeRules: Rule[] = [
  headlineUtilizationLow,
  descriptionUtilizationLow,
  ctaNoneDetected,
];

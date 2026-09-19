import type { Issue, Rule } from '../../../platform/types';
import { defineRule, makeIssue } from '../../../platform/issue';
import { containsLineBreak } from '../../../text';
import { SOURCES } from '../spec';
import { countFor, displayName, nonEmptyFor, occurrenceKey, ref } from './shared';

function countMinRule(kind: 'headline' | 'description', plural: string): Rule {
  return defineRule({
    id: `${kind}.count.min`,
    label: `Minimum ${plural.slice(0, -1)} count`,
    kind: 'platform_limit',
    severity: 'error',
    source: SOURCES.rsaSpec,
    check(ctx, rule) {
      const spec = ctx.platform.fields[kind];
      const count = countFor(ctx, kind);
      if (count >= spec.min) return [];
      return [
        makeIssue(
          rule,
          [],
          {
            title: `${count} ${plural} — at least ${spec.min} required`,
            detail: `A responsive search ad needs at least ${spec.min} ${plural}, but ${count} ${count === 1 ? 'was' : 'were'} supplied.`,
            recommendation: `Add ${spec.min - count} more unique ${plural}.`,
            meta: { supplied: count, min: spec.min },
          },
          'ad',
        ),
      ];
    },
  });
}

function countMaxRule(kind: 'headline' | 'description' | 'path', plural: string): Rule {
  return defineRule({
    id: `${kind}.count.max`,
    label: `Maximum ${plural.slice(0, -1)} count`,
    kind: 'platform_limit',
    severity: 'error',
    source: SOURCES.rsaSpec,
    check(ctx, rule) {
      const spec = ctx.platform.fields[kind];
      const entries = nonEmptyFor(ctx, kind);
      if (entries.length <= spec.max) return [];
      const excess = entries.slice(spec.max);
      const names = excess.map((e) => displayName(kind, e.index)).join(', ');
      return [
        makeIssue(
          rule,
          excess.map((e) => ref(kind, e.index)),
          {
            title: `Too many ${plural} — max ${spec.max} allowed`,
            detail: `${entries.length} non-empty ${plural} were supplied; Google allows ${spec.max}. ${names} ${excess.length === 1 ? 'is' : 'are'} over the limit.`,
            recommendation: `Remove ${entries.length - spec.max} ${plural}.`,
            meta: { supplied: entries.length, max: spec.max },
          },
          'ad',
        ),
      ];
    },
  });
}

function lengthMaxRule(kind: 'headline' | 'description' | 'path', plural: string): Rule {
  return defineRule({
    id: `${kind}.length.max`,
    label: `${plural.slice(0, -1)} length limit`,
    kind: 'platform_limit',
    severity: 'error',
    source: SOURCES.rsaSpec,
    check(ctx, rule) {
      const spec = ctx.platform.fields[kind];
      const issues: Issue[] = [];
      for (const entry of nonEmptyFor(ctx, kind)) {
        const counted = ctx.platform.countedLength(entry.text);
        if (counted <= spec.maxChars) continue;
        issues.push(
          makeIssue(
            rule,
            [ref(kind, entry.index)],
            {
              title: `${displayName(kind, entry.index)} exceeds ${spec.maxChars} characters`,
              detail: `${displayName(kind, entry.index)} counts as ${counted} characters; the ${plural.slice(0, -1)} limit is ${spec.maxChars}. Double-width characters count as 2.`,
              recommendation: `Shorten it by at least ${counted - spec.maxChars} counted characters.`,
              meta: { counted, limit: spec.maxChars },
            },
            occurrenceKey(kind, entry.index),
          ),
        );
      }
      return issues;
    },
  });
}

const fieldLineBreak = defineRule({
  id: 'field.line_break',
  label: 'No line breaks in fields',
  kind: 'platform_limit',
  severity: 'error',
  source: SOURCES.rsaSpec,
  check(ctx, rule) {
    const issues: Issue[] = [];
    for (const kind of ['headline', 'description', 'path'] as const) {
      for (const entry of nonEmptyFor(ctx, kind)) {
        if (!containsLineBreak(entry.text)) continue;
        issues.push(
          makeIssue(
            rule,
            [ref(kind, entry.index)],
            {
              title: `${displayName(kind, entry.index)} contains a line break`,
              detail: `Google Ads fields cannot contain line breaks. ${displayName(kind, entry.index)} includes a newline or paragraph separator.`,
              recommendation: 'Remove the line break and keep the text on one line.',
            },
            occurrenceKey(kind, entry.index),
          ),
        );
      }
    }
    return issues;
  },
});

const finalUrlInvalid = defineRule({
  id: 'finalUrl.invalid',
  label: 'Final URL must be valid',
  kind: 'platform_limit',
  severity: 'error',
  source: SOURCES.rsaSpec,
  check(ctx, rule) {
    const url = ctx.input.finalUrl;
    if (url === undefined || url.trim() === '') return [];
    let parsed: URL | null;
    try {
      parsed = new URL(url.trim());
    } catch {
      parsed = null;
    }
    const ok =
      parsed !== null &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.includes('.');
    if (ok) return [];
    return [
      makeIssue(
        rule,
        [{ field: 'finalUrl', index: 0 }],
        {
          title: 'Final URL is not a valid http(s) URL',
          detail:
            'The final URL must be a parseable URL with an http or https scheme and a dotted hostname.',
          recommendation: 'Use a full URL such as https://example.com/landing-page.',
        },
        'url',
      ),
    ];
  },
});

export const limitRules: Rule[] = [
  countMinRule('headline', 'headlines'),
  countMaxRule('headline', 'headlines'),
  lengthMaxRule('headline', 'headlines'),
  countMinRule('description', 'descriptions'),
  countMaxRule('description', 'descriptions'),
  lengthMaxRule('description', 'descriptions'),
  countMaxRule('path', 'paths'),
  lengthMaxRule('path', 'paths'),
  fieldLineBreak,
  finalUrlInvalid,
];

import type {
  AdInput,
  DeterministicResult,
  FieldLimits,
  FieldStat,
  Issue,
  KeywordCoverage,
  NonEmptyEntry,
  PlatformDefinition,
} from '../platform/types';
import { contentTokens, graphemeCount, normalizeForCompare, tokenize } from '../text';

type StatKind = 'headline' | 'description' | 'path';

function buildStat(
  kind: StatKind,
  index: number,
  original: string,
  limits: FieldLimits,
  countedLength: (s: string) => number,
): FieldStat {
  const counted = countedLength(original);
  const remaining = limits.maxChars - counted;
  let status: FieldStat['status'];
  if (original.trim() === '') {
    status = 'empty';
  } else if (counted > limits.maxChars) {
    status = 'over';
  } else if (remaining <= limits.nearThreshold) {
    status = 'near';
  } else {
    status = 'ok';
  }
  return {
    ref: { field: kind, index },
    original,
    counted,
    graphemes: graphemeCount(original),
    limit: limits.maxChars,
    remaining,
    status,
    issueIds: [],
  };
}

function buildFinalUrlStat(original: string, countedLength: (s: string) => number): FieldStat {
  return {
    ref: { field: 'finalUrl', index: 0 },
    original,
    counted: countedLength(original),
    graphemes: graphemeCount(original),
    limit: null,
    remaining: null,
    status: original.trim() === '' ? 'empty' : 'ok',
    issueIds: [],
  };
}

function nonEmptyEntries(stats: FieldStat[]): NonEmptyEntry[] {
  return stats
    .filter((s) => s.status !== 'empty')
    .map((s) => ({ index: s.ref.index, text: s.original }));
}

/** Whole-word phrase containment on normalized (space-collapsed) text. */
function containsPhrase(normalizedText: string, normalizedPhrase: string): boolean {
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function computeKeywordCoverage(
  input: AdInput,
  ctx: {
    nonEmptyHeadlines: NonEmptyEntry[];
    nonEmptyDescriptions: NonEmptyEntry[];
    nonEmptyPaths: NonEmptyEntry[];
    headlineCount: number;
  },
): KeywordCoverage | undefined {
  const raw = input.keyword?.trim();
  if (!raw) return undefined;
  const normalized = normalizeForCompare(raw);
  if (normalized === '') return undefined;

  let terms = contentTokens(raw);
  if (terms.length === 0) {
    // Keyword consists only of stopwords — fall back to all tokens.
    terms = tokenize(raw);
  }

  const phraseInHeadlines = ctx.nonEmptyHeadlines
    .filter((e) => containsPhrase(normalizeForCompare(e.text), normalized))
    .map((e) => e.index);
  const phraseInDescriptions = ctx.nonEmptyDescriptions
    .filter((e) => containsPhrase(normalizeForCompare(e.text), normalized))
    .map((e) => e.index);

  const assetTokens = new Set<string>();
  for (const entry of [
    ...ctx.nonEmptyHeadlines,
    ...ctx.nonEmptyDescriptions,
    ...ctx.nonEmptyPaths,
  ]) {
    for (const token of tokenize(entry.text)) assetTokens.add(token);
  }
  const termsCovered = terms.filter((t) => assetTokens.has(t));
  const termsMissing = terms.filter((t) => !assetTokens.has(t));

  return {
    raw,
    normalized,
    terms,
    phraseInHeadlines,
    phraseInDescriptions,
    termsCovered,
    termsMissing,
    headlineShareWithPhrase:
      ctx.headlineCount === 0 ? 0 : phraseInHeadlines.length / ctx.headlineCount,
  };
}

const SEVERITY_ORDER: Record<Issue['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function firstFieldIndex(issue: Issue): number {
  return issue.fields.length === 0 ? -1 : issue.fields[0].index;
}

function compareIssues(a: Issue, b: Issue): number {
  const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (sev !== 0) return sev;
  const idx = firstFieldIndex(a) - firstFieldIndex(b);
  if (idx !== 0) return idx;
  const field = a.fields[0]?.field.localeCompare(b.fields[0]?.field ?? '') ?? 0;
  if (field !== 0) return field;
  return a.id.localeCompare(b.id);
}

/**
 * Runs every deterministic rule for the platform against the input.
 * Pure: no I/O, no Date, no Math.random — output order is stable.
 */
export function runDeterministic(
  input: AdInput,
  platform: PlatformDefinition,
): DeterministicResult {
  const headlineStats = input.headlines.map((text, i) =>
    buildStat('headline', i, text, platform.fields.headline, platform.countedLength),
  );
  const descriptionStats = input.descriptions.map((text, i) =>
    buildStat('description', i, text, platform.fields.description, platform.countedLength),
  );
  const pathStats = input.paths.map((text, i) =>
    buildStat('path', i, text, platform.fields.path, platform.countedLength),
  );

  const nonEmptyHeadlines = nonEmptyEntries(headlineStats);
  const nonEmptyDescriptions = nonEmptyEntries(descriptionStats);
  const nonEmptyPaths = nonEmptyEntries(pathStats);

  const fields: DeterministicResult['fields'] = {
    headlines: headlineStats,
    descriptions: descriptionStats,
    paths: pathStats,
  };
  if (input.finalUrl !== undefined) {
    fields.finalUrl = buildFinalUrlStat(input.finalUrl, platform.countedLength);
  }

  const counts = {
    headlines: nonEmptyHeadlines.length,
    descriptions: nonEmptyDescriptions.length,
    paths: nonEmptyPaths.length,
  };

  const keyword = computeKeywordCoverage(input, {
    nonEmptyHeadlines,
    nonEmptyDescriptions,
    nonEmptyPaths,
    headlineCount: counts.headlines,
  });

  const ctx = {
    input,
    platform,
    fields,
    counts,
    nonEmpty: {
      headlines: nonEmptyHeadlines,
      descriptions: nonEmptyDescriptions,
      paths: nonEmptyPaths,
    },
    keyword,
  };

  const issues: Issue[] = platform.rules.flatMap((rule) => rule.check(ctx));
  issues.sort(compareIssues);

  const statByRef = new Map<string, FieldStat>();
  for (const stat of [...headlineStats, ...descriptionStats, ...pathStats]) {
    statByRef.set(`${stat.ref.field}:${stat.ref.index}`, stat);
  }
  if (fields.finalUrl) {
    statByRef.set('finalUrl:0', fields.finalUrl);
  }
  for (const issue of issues) {
    for (const ref of issue.fields) {
      statByRef.get(`${ref.field}:${ref.index}`)?.issueIds.push(issue.id);
    }
  }

  return {
    fields,
    counts,
    issues,
    keyword,
    hasBlockingErrors: issues.some((i) => i.kind === 'platform_limit' && i.severity === 'error'),
    evaluable: counts.headlines >= 1 || counts.descriptions >= 1,
  };
}

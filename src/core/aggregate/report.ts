import type {
  DeterministicResult,
  FieldRef,
  Issue,
  IssueKind,
  PlatformDefinition,
  Severity,
} from '../platform/types';
import {
  LOW_CONFIDENCE,
  THRESHOLDS,
  capBand,
  downgrade,
  minBand,
  noulVerdict,
  scoreToBand,
  type Band,
} from '../semantic/bands';
import type { ChoiceAnswer, JevAnswer, ScoreAnswer } from '../semantic/answers';
import { parseRedundantId, parseVagueId } from '../semantic/questions';
import type { AnalysisReport, Dimension, SemanticSlice } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

type SemanticIssueSeed = {
  ruleId: string;
  severity: Severity;
  fields: FieldRef[];
  title: string;
  detail: string;
  recommendation?: string;
  lowConfidence?: boolean;
};

function semanticIssue(seed: SemanticIssueSeed, occurrenceKey: string): Issue {
  return {
    id: `${seed.ruleId}:${occurrenceKey}`,
    ruleId: seed.ruleId,
    severity: seed.severity,
    kind: 'semantic' satisfies IssueKind,
    origin: 'semantic',
    fields: seed.fields,
    title: seed.title,
    detail: seed.detail,
    recommendation: seed.recommendation,
    meta: seed.lowConfidence ? { lowConfidence: true } : undefined,
  };
}

function headlineDisplay(index: number): string {
  return `Headline ${index + 1}`;
}

function headlineIndex(key: string): number {
  return Number(key.slice(1)) - 1;
}

function isScore(answer: JevAnswer | undefined): answer is ScoreAnswer {
  return answer?.type === 'score';
}

function isChoice(answer: JevAnswer | undefined): answer is ChoiceAnswer {
  return answer?.type === 'choice';
}

function confidenceOf(answer: JevAnswer | undefined): number | undefined {
  if (isScore(answer) || isChoice(answer)) return answer.confidence;
  return undefined;
}

function missingTermsSentence(det: DeterministicResult): string {
  const missing = det.keyword?.termsMissing ?? [];
  if (missing.length === 0) return '';
  const quoted = missing.map((t) => `"${t}"`).join(' and ');
  return ` Your target query names ${quoted}, but no headline uses these terms.`;
}

// ---------------------------------------------------------------------------
// Semantic-derived issues
// ---------------------------------------------------------------------------

function buildSemanticIssues(
  det: DeterministicResult,
  result: NonNullable<SemanticSlice['result']>,
): Issue[] {
  const issues: Issue[] = [];
  const answers = result.answers;

  for (const id of Object.keys(answers)) {
    const key = parseVagueId(id);
    if (!key) continue;
    const answer = answers[id];
    if (answer.type !== 'noul') continue;
    const verdict = noulVerdict(answer.noul);
    if (verdict === 'no') continue;
    const index = headlineIndex(key);
    issues.push(
      semanticIssue(
        {
          ruleId: 'semantic.vague_headline',
          severity: verdict === 'yes' ? 'warning' : 'info',
          fields: [{ field: 'headline', index }],
          title: `${headlineDisplay(index)} ${verdict === 'yes' ? 'appears' : 'may be'} vague`,
          detail: `${headlineDisplay(index)} ${verdict === 'yes' ? 'appears' : 'may be'} generic enough to fit almost any business and does not clearly say what is offered.`,
          recommendation: 'Name the product, service, or a concrete benefit.',
        },
        `h${index + 1}`,
      ),
    );
  }

  for (const id of Object.keys(answers)) {
    const pair = parseRedundantId(id);
    if (!pair) continue;
    const answer = answers[id];
    if (answer.type !== 'noul') continue;
    const verdict = noulVerdict(answer.noul);
    if (verdict === 'no') continue;
    const [keyA, keyB] = pair;
    const [a, b] = [headlineIndex(keyA), headlineIndex(keyB)];
    issues.push(
      semanticIssue(
        {
          ruleId: 'semantic.redundant_pair',
          severity: verdict === 'yes' ? 'warning' : 'info',
          fields: [
            { field: 'headline', index: a },
            { field: 'headline', index: b },
          ],
          title: `${headlineDisplay(a)} and ${headlineDisplay(b)} seem redundant`,
          detail: `${headlineDisplay(a)} and ${headlineDisplay(b)} appear to communicate the same idea. Use one of them for a different benefit, proof point or call to action.`,
        },
        `h${a + 1}-h${b + 1}`,
      ),
    );
  }

  const hype = answers.hype;
  if (hype?.type === 'noul') {
    const verdict = noulVerdict(hype.noul);
    if (verdict !== 'no') {
      issues.push(
        semanticIssue(
          {
            ruleId: 'semantic.hype',
            severity: verdict === 'yes' ? 'warning' : 'info',
            fields: [],
            title: `Copy ${verdict === 'yes' ? 'appears' : 'may be'} hyped`,
            detail: `The wording ${verdict === 'yes' ? 'appears' : 'may be'} exaggerated or superlative rather than plain and factual.`,
            recommendation: 'Prefer concrete, verifiable claims over hype.',
          },
          'ad',
        ),
      );
    }
  }

  const claims = answers.unsupported_claims;
  if (claims?.type === 'noul') {
    const verdict = noulVerdict(claims.noul);
    if (verdict !== 'no') {
      issues.push(
        semanticIssue(
          {
            ruleId: 'semantic.unsupported_claims',
            severity: verdict === 'yes' ? 'warning' : 'info',
            fields: [],
            title: `Some claims ${verdict === 'yes' ? 'appear' : 'may be'} hard to substantiate`,
            detail:
              `Absolute or guarantee-style claims ${verdict === 'yes' ? 'appear' : 'may be'} present. ` +
              'This is an indicator for the advertiser to review — not a policy determination.',
            recommendation: 'Qualify claims or add the supporting terms they require.',
          },
          'ad',
        ),
      );
    }
  }

  const clarity = answers.clarity_offer;
  if (isScore(clarity)) {
    const band = scoreToBand(clarity.score, 4);
    if (band === 'weak' || band === 'needs_work') {
      issues.push(
        semanticIssue(
          {
            ruleId: 'semantic.offer_unclear',
            severity: band === 'weak' ? 'warning' : 'info',
            fields: [],
            title: `The offer ${band === 'weak' ? 'appears' : 'may be'} unclear`,
            detail: `Across the headlines and descriptions it ${band === 'weak' ? 'appears' : 'may be'} hard to tell what product or service is being sold.`,
            recommendation: 'Name the product or service category explicitly.',
            lowConfidence: clarity.confidence < LOW_CONFIDENCE,
          },
          'ad',
        ),
      );
    }
  }

  const specificity = answers.specificity;
  if (isScore(specificity)) {
    const band = scoreToBand(specificity.score, 3);
    if (band === 'weak' || band === 'needs_work') {
      issues.push(
        semanticIssue(
          {
            ruleId: 'semantic.low_specificity',
            severity: 'info',
            fields: [],
            title: 'Copy lacks specific detail',
            detail:
              'The wording may be too abstract — numbers, features, prices, timeframes or named audiences make ads more convincing.',
            recommendation: 'Add one concrete, checkable detail per asset where possible.',
            lowConfidence: specificity.confidence < LOW_CONFIDENCE,
          },
          'ad',
        ),
      );
    }
  }

  const cta = answers.cta_clarity;
  if (isScore(cta)) {
    const band = scoreToBand(cta.score, 3);
    const suppressed = band === 'weak' && det.issues.some((i) => i.ruleId === 'cta.none_detected');
    if ((band === 'weak' && !suppressed) || band === 'needs_work') {
      issues.push(
        semanticIssue(
          {
            ruleId: 'semantic.cta_weak',
            severity: band === 'weak' ? 'warning' : 'info',
            fields: [],
            title: `The call to action ${band === 'weak' ? 'appears' : 'may be'} weak`,
            detail: `The ad ${band === 'weak' ? 'appears' : 'may'} not clearly tell the searcher what to do next.`,
            recommendation: 'Add an explicit next step such as "Get a free quote".',
            lowConfidence: cta.confidence < LOW_CONFIDENCE,
          },
          'ad',
        ),
      );
    }
  }

  const topic = answers.topic_match;
  if (isScore(topic)) {
    const band = scoreToBand(topic.score, 3);
    if (band === 'weak' || band === 'needs_work') {
      issues.push(
        semanticIssue(
          {
            ruleId: 'semantic.topic_mismatch',
            severity: band === 'weak' ? 'warning' : 'info',
            fields: [],
            title: `Ad ${band === 'weak' ? 'appears' : 'may be'} off-topic for the query`,
            detail:
              `The ad ${band === 'weak' ? 'appears' : 'may'} not address the topic the target query asks about.` +
              missingTermsSentence(det),
            recommendation: 'Align at least one headline with the query subject.',
            lowConfidence: topic.confidence < LOW_CONFIDENCE,
          },
          'ad',
        ),
      );
    }
  }

  const intent = answers.intent_match;
  if (isScore(intent)) {
    const band = scoreToBand(intent.score, 3);
    if (band === 'weak' || band === 'needs_work') {
      issues.push(
        semanticIssue(
          {
            ruleId: 'semantic.intent_gap',
            severity: band === 'weak' ? 'warning' : 'info',
            fields: [],
            title: `Ad ${band === 'weak' ? 'appears' : 'may'} not match searcher intent`,
            detail: `The copy ${band === 'weak' ? 'appears' : 'may'} not address what someone typing this query most likely wants.`,
            recommendation: 'Speak to the likely goal — comparing, buying, or getting a quote.',
            lowConfidence: intent.confidence < LOW_CONFIDENCE,
          },
          'ad',
        ),
      );
    }
  }

  const audience = answers.audience_alignment;
  if (isChoice(audience) && audience.choice === 'mismatch') {
    const lowConf = audience.confidence < LOW_CONFIDENCE;
    issues.push(
      semanticIssue(
        {
          ruleId: 'semantic.audience_mismatch',
          severity: lowConf ? 'info' : 'warning',
          fields: [],
          title: 'Ad may not match the query audience',
          detail:
            'The target query names an audience the ad does not appear to address.' +
            missingTermsSentence(det),
          recommendation: 'Mention the audience segment in at least one asset.',
          lowConfidence: lowConf,
        },
        'ad',
      ),
    );
  }

  const language = answers.primary_language;
  if (isChoice(language) && (language.choice === 'other' || language.choice === 'mixed')) {
    issues.push(
      semanticIssue(
        {
          ruleId: 'semantic.non_english',
          severity: 'info',
          fields: [],
          title: 'Non-English copy detected',
          detail:
            'Semantic evaluation is tuned for English copy; treat these judgments as lower-accuracy for other languages. Deterministic checks are unaffected.',
        },
        'ad',
      ),
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

function countIssues(det: DeterministicResult): {
  errors: number;
  warnings: number;
  infos: number;
} {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const issue of det.issues) {
    if (issue.severity === 'error') errors += 1;
    else if (issue.severity === 'warning') warnings += 1;
    else infos += 1;
  }
  return { errors, warnings, infos };
}

function completenessDimension(det: DeterministicResult, platform: PlatformDefinition): Dimension {
  const h = det.counts.headlines;
  const d = det.counts.descriptions;
  const lim = platform.fields;
  const countIssue = det.issues.some((i) => /\.count\./.test(i.ruleId));
  let band: Band;
  if (countIssue) band = 'weak';
  else if (h >= 10 && d >= 3) band = 'strong';
  else if (h >= 5) band = 'good';
  else band = 'needs_work';
  const reasons = [
    `${h} of ${lim.headline.max} headlines, ${d} of ${lim.description.max} descriptions.`,
  ];
  if (countIssue) reasons.push('A required minimum or maximum count is violated.');
  return { id: 'completeness', label: 'Completeness', basis: 'deterministic', band, reasons };
}

function structureDimension(det: DeterministicResult): Dimension {
  const { errors, warnings } = countIssues(det);
  let band: Band;
  if (errors > 0) band = 'weak';
  else if (warnings >= 3) band = 'needs_work';
  else if (warnings >= 1) band = 'good';
  else band = 'strong';
  const reasons = [`${errors} errors, ${warnings} warnings from rule checks.`];
  return { id: 'structure', label: 'Structure', basis: 'deterministic', band, reasons };
}

function differentiationDimension(det: DeterministicResult, semantic: SemanticSlice): Dimension {
  const hasExactOrNormalized = det.issues.some(
    (i) => i.ruleId === 'duplicate.exact' || i.ruleId === 'duplicate.normalized',
  );
  const hasNear = det.issues.some((i) => i.ruleId === 'duplicate.near');
  if (hasExactOrNormalized) {
    return {
      id: 'differentiation',
      label: 'Differentiation',
      basis: 'deterministic',
      band: 'weak',
      reasons: ['Identical or near-identical assets were found.'],
    };
  }

  const complementarity = semantic.result?.answers.headline_complementarity;
  const semanticAvailable =
    (semantic.state === 'ok' || semantic.state === 'partial') && isScore(complementarity);
  if (semanticAvailable) {
    let band = scoreToBand(complementarity.score, 3);
    const redundantYes = Object.entries(semantic.result?.answers ?? {}).filter(
      ([id, a]) =>
        parseRedundantId(id) !== null && a.type === 'noul' && noulVerdict(a.noul) === 'yes',
    ).length;
    if (redundantYes >= 2) band = downgrade(band);
    if (hasNear) band = capBand(band, 'good');
    const reasons = [`Jev rated headline complementarity "${band.replace('_', ' ')}".`];
    if (redundantYes >= 2)
      reasons.push(`${redundantYes} headline pairs appear to repeat each other.`);
    if (hasNear) reasons.push('Near-duplicate wording limits the score.');
    return {
      id: 'differentiation',
      label: 'Differentiation',
      basis: 'mixed',
      band,
      lowConfidence: complementarity.confidence < LOW_CONFIDENCE,
      reasons,
    };
  }

  const anyDuplicate = hasExactOrNormalized || hasNear;
  const band: Band = !anyDuplicate && det.counts.headlines >= 3 ? 'strong' : 'needs_work';
  return {
    id: 'differentiation',
    label: 'Differentiation',
    basis: 'deterministic',
    band,
    reasons: anyDuplicate
      ? ['Duplicate or near-duplicate wording was found.']
      : [`${det.counts.headlines} distinct headlines supplied.`],
  };
}

function relevanceDimension(det: DeterministicResult, semantic: SemanticSlice): Dimension {
  const kw = det.keyword;
  if (!kw) {
    return {
      id: 'relevance',
      label: 'Relevance',
      basis: 'deterministic',
      band: 'not_evaluated',
      reasons: ['Add a target search query to evaluate relevance.'],
    };
  }

  let detBand: Band;
  const someCovered = kw.termsCovered.length > 0;
  if (kw.phraseInHeadlines.length >= 1 && kw.termsMissing.length === 0) detBand = 'strong';
  else if (kw.termsMissing.length === 0) detBand = 'good';
  else if (someCovered) detBand = 'needs_work';
  else detBand = 'weak';

  const detReasons = [
    kw.termsMissing.length === 0
      ? 'All query terms appear in the ad.'
      : `Missing terms: ${kw.termsMissing.join(', ')}.`,
  ];
  if (kw.phraseInHeadlines.length >= 1) detReasons.push('Full phrase appears in a headline.');

  const topic = semantic.result?.answers.topic_match;
  const intent = semantic.result?.answers.intent_match;
  const audience = semantic.result?.answers.audience_alignment;
  const semanticAvailable =
    (semantic.state === 'ok' || semantic.state === 'partial') && isScore(topic) && isScore(intent);

  let band = detBand;
  let basis: Dimension['basis'] = 'deterministic';
  let lowConfidence = false;
  const reasons = [...detReasons];

  if (semanticAvailable) {
    basis = 'mixed';
    let semBand = minBand(scoreToBand(topic.score, 3), scoreToBand(intent.score, 3));
    if (isChoice(audience) && audience.choice === 'mismatch') semBand = downgrade(semBand);
    if (kw.termsMissing.length > 0) semBand = downgrade(semBand);
    band = minBand(semBand, detBand);
    reasons.push('Combined with Jev topic and intent judgments.');
    const confidences = [confidenceOf(topic), confidenceOf(intent), confidenceOf(audience)].filter(
      (c): c is number => c !== undefined,
    );
    lowConfidence = confidences.some((c) => c < LOW_CONFIDENCE);
  }

  if (det.issues.some((i) => i.ruleId === 'keyword.stuffing')) {
    band = capBand(band, 'good');
    reasons.push('Keyword stuffing limits the score.');
  }

  return { id: 'relevance', label: 'Relevance', basis, band, lowConfidence, reasons };
}

function clarityDimension(semantic: SemanticSlice): Dimension {
  const clarity = semantic.result?.answers.clarity_offer;
  if (!isScore(clarity)) {
    return {
      id: 'clarity',
      label: 'Clarity',
      basis: 'semantic',
      band: 'unavailable',
      reasons: ['Semantic evaluation was not available.'],
    };
  }
  let band = scoreToBand(clarity.score, 4);
  const vague = Object.entries(semantic.result?.answers ?? {}).filter(([id, a]) => {
    if (parseVagueId(id) === null || a.type !== 'noul') return false;
    return true;
  });
  const vagueYes = vague.filter(
    ([, a]) => a.type === 'noul' && noulVerdict(a.noul) === 'yes',
  ).length;
  const vagueShare = vague.length === 0 ? 0 : vagueYes / vague.length;
  const reasons: string[] = [];
  if (vagueShare > THRESHOLDS.vagueHeadlineShare) {
    band = downgrade(band);
    reasons.push(`${vagueYes} of ${vague.length} headlines appear vague.`);
  }
  reasons.unshift('Based on Jev clarity-of-offer judgment.');
  return {
    id: 'clarity',
    label: 'Clarity',
    basis: 'semantic',
    band,
    lowConfidence: clarity.confidence < LOW_CONFIDENCE,
    reasons,
  };
}

function specificityDimension(semantic: SemanticSlice): Dimension {
  const specificity = semantic.result?.answers.specificity;
  if (!isScore(specificity)) {
    return {
      id: 'specificity',
      label: 'Specificity',
      basis: 'semantic',
      band: 'unavailable',
      reasons: ['Semantic evaluation was not available.'],
    };
  }
  return {
    id: 'specificity',
    label: 'Specificity',
    basis: 'semantic',
    band: scoreToBand(specificity.score, 3),
    lowConfidence: specificity.confidence < LOW_CONFIDENCE,
    reasons: ['Based on Jev specificity judgment.'],
  };
}

function ctaDimension(det: DeterministicResult, semantic: SemanticSlice): Dimension {
  const cta = semantic.result?.answers.cta_clarity;
  if (isScore(cta)) {
    return {
      id: 'cta',
      label: 'Call to action',
      basis: 'mixed',
      band: scoreToBand(cta.score, 3),
      lowConfidence: cta.confidence < LOW_CONFIDENCE,
      reasons: ['Based on Jev call-to-action judgment.'],
    };
  }
  const noneDetected = det.issues.some((i) => i.ruleId === 'cta.none_detected');
  return {
    id: 'cta',
    label: 'Call to action',
    basis: 'deterministic',
    band: noneDetected ? 'weak' : 'good',
    reasons: noneDetected
      ? ['No call-to-action phrase was detected.']
      : ['A call-to-action phrase was detected.'],
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function sortReportIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    const origin = (a.origin === 'deterministic' ? 0 : 1) - (b.origin === 'deterministic' ? 0 : 1);
    if (origin !== 0) return origin;
    return 0; // stable: preserve order within severity+origin
  });
}

export function buildReport(
  det: DeterministicResult,
  semantic: SemanticSlice,
  platform: PlatformDefinition,
): AnalysisReport {
  const semanticIssues =
    semantic.result !== undefined && (semantic.state === 'ok' || semantic.state === 'partial')
      ? buildSemanticIssues(det, semantic.result)
      : [];

  const dimensions: Dimension[] = [
    completenessDimension(det, platform),
    structureDimension(det),
    differentiationDimension(det, semantic),
    relevanceDimension(det, semantic),
    clarityDimension(semantic),
    specificityDimension(semantic),
    ctaDimension(det, semantic),
  ];

  const issues = sortReportIssues([...det.issues, ...semanticIssues]);

  let status: AnalysisReport['status'];
  if (det.hasBlockingErrors) {
    status = 'blocked';
  } else if (
    issues.some((i) => i.severity === 'error' || i.severity === 'warning') ||
    dimensions.some((d) => d.band === 'weak' || d.band === 'needs_work')
  ) {
    status = 'needs_work';
  } else {
    status = 'ready';
  }

  return {
    status,
    deterministic: det,
    semantic,
    dimensions,
    issues,
  };
}

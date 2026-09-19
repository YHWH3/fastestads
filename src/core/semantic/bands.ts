export type Band = 'strong' | 'good' | 'needs_work' | 'weak';

/** Threshold constants, exported so docs/UI can cite the same numbers. */
export const THRESHOLDS = {
  score: { strong: 0.8, good: 0.55, needsWork: 0.3 },
  noul: { flagged: 0.7, possible: 0.45 },
  lowConfidence: 0.5,
  keywordStuffingShare: 0.6,
  vagueHeadlineShare: 0.4,
} as const;

export const LOW_CONFIDENCE = THRESHOLDS.lowConfidence;

const RANK: Record<Band, number> = { weak: 0, needs_work: 1, good: 2, strong: 3 };
const BY_RANK: Band[] = ['weak', 'needs_work', 'good', 'strong'];

/** Band for a Score answer normalized by expected level index / (levels-1). */
export function scoreToBand(score: number, levelCount: number): Band {
  const normalized = levelCount > 1 ? score / (levelCount - 1) : 0;
  if (normalized >= THRESHOLDS.score.strong) return 'strong';
  if (normalized >= THRESHOLDS.score.good) return 'good';
  if (normalized >= THRESHOLDS.score.needsWork) return 'needs_work';
  return 'weak';
}

export type NoulVerdict = 'yes' | 'possible' | 'no';

export function noulVerdict(probability: number): NoulVerdict {
  if (probability >= THRESHOLDS.noul.flagged) return 'yes';
  if (probability >= THRESHOLDS.noul.possible) return 'possible';
  return 'no';
}

/** Move a band one step down (strong → good → needs_work → weak). */
export function downgrade(band: Band): Band {
  return BY_RANK[Math.max(0, RANK[band] - 1)];
}

/** The lower (worse) of two bands. */
export function minBand(a: Band, b: Band): Band {
  return RANK[a] <= RANK[b] ? a : b;
}

/** Cap a band at a ceiling: returns the worse of band and cap. */
export function capBand(band: Band, cap: Band): Band {
  return minBand(band, cap);
}

import { describe, expect, it } from 'vitest';
import {
  LOW_CONFIDENCE,
  THRESHOLDS,
  capBand,
  downgrade,
  minBand,
  noulVerdict,
  scoreToBand,
} from '@core/semantic/bands';

describe('scoreToBand', () => {
  it('bands a 4-level score by normalized position', () => {
    expect(scoreToBand(3, 4)).toBe('strong'); // 1.0
    expect(scoreToBand(2, 4)).toBe('good'); // 0.667
    expect(scoreToBand(1, 4)).toBe('needs_work'); // 0.333
    expect(scoreToBand(0, 4)).toBe('weak');
  });

  it('bands a 3-level score', () => {
    expect(scoreToBand(2, 3)).toBe('strong'); // 1.0
    expect(scoreToBand(1, 3)).toBe('needs_work'); // 0.5 < 0.55
    expect(scoreToBand(0, 3)).toBe('weak');
  });

  it('respects exact thresholds', () => {
    // normalized 0.8 -> strong, 0.55 -> good, 0.3 -> needs_work
    expect(THRESHOLDS.score).toMatchObject({ strong: 0.8, good: 0.55, needsWork: 0.3 });
    expect(scoreToBand(0.8, 2)).toBe('strong');
    expect(scoreToBand(0.55, 2)).toBe('good');
    expect(scoreToBand(0.3, 2)).toBe('needs_work');
    expect(scoreToBand(0.29, 2)).toBe('weak');
  });
});

describe('noulVerdict', () => {
  it('flags >= 0.70, hedges >= 0.45, otherwise no', () => {
    expect(noulVerdict(0.7)).toBe('yes');
    expect(noulVerdict(0.85)).toBe('yes');
    expect(noulVerdict(0.45)).toBe('possible');
    expect(noulVerdict(0.69)).toBe('possible');
    expect(noulVerdict(0.44)).toBe('no');
    expect(noulVerdict(0)).toBe('no');
  });
});

describe('downgrade / minBand / capBand', () => {
  it('steps a band down once', () => {
    expect(downgrade('strong')).toBe('good');
    expect(downgrade('good')).toBe('needs_work');
    expect(downgrade('needs_work')).toBe('weak');
    expect(downgrade('weak')).toBe('weak');
  });

  it('minBand picks the worse band', () => {
    expect(minBand('good', 'weak')).toBe('weak');
    expect(minBand('strong', 'good')).toBe('good');
  });

  it('capBand caps at the ceiling', () => {
    expect(capBand('strong', 'good')).toBe('good');
    expect(capBand('needs_work', 'good')).toBe('needs_work');
  });
});

describe('constants', () => {
  it('exports LOW_CONFIDENCE and THRESHOLDS', () => {
    expect(LOW_CONFIDENCE).toBe(0.5);
    expect(THRESHOLDS.noul).toMatchObject({ flagged: 0.7, possible: 0.45 });
    expect(THRESHOLDS.keywordStuffingShare).toBe(0.6);
    expect(THRESHOLDS.vagueHeadlineShare).toBe(0.4);
  });
});

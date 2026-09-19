import { describe, expect, it } from 'vitest';
import { parseAnswers } from '@core/semantic/answers';
import type { JevQuestion } from '@core/semantic/questions';

const QUESTIONS: Record<string, JevQuestion> = {
  clarity_offer: { type: 'score', instructions: 'x', criteria: ['a', 'b', 'c', 'd'] },
  hype: { type: 'noul', instructions: 'x', criteria: { true: 't', false: 'f' } },
  primary_language: {
    type: 'choice',
    instructions: 'x',
    criteria: { english: 'e', other: 'o', mixed: 'm' },
  },
};
const IDS = Object.keys(QUESTIONS);

describe('parseAnswers', () => {
  it('accepts well-formed answers of every type', () => {
    const { answers, missing, invalidCount } = parseAnswers(
      {
        clarity_offer: { type: 'score', score: 3, legend: {}, probabilities: {}, confidence: 0.9 },
        hype: { type: 'noul', noul: 0.8 },
        primary_language: {
          type: 'choice',
          choice: 'english',
          probabilities: { english: 1 },
          confidence: 0.7,
        },
      },
      IDS,
      QUESTIONS,
    );
    expect(missing).toEqual([]);
    expect(invalidCount).toBe(0);
    expect(answers.hype).toEqual({ type: 'noul', noul: 0.8 });
    expect(answers.clarity_offer.type).toBe('score');
  });

  it('treats absent ids as missing', () => {
    const { missing } = parseAnswers({}, IDS, QUESTIONS);
    expect(missing).toEqual(IDS);
  });

  it('rejects a noul outside [0,1]', () => {
    for (const noul of [-0.1, 1.1, Number.NaN, '0.5']) {
      const { missing, invalidCount } = parseAnswers(
        { hype: { type: 'noul', noul } },
        IDS,
        QUESTIONS,
      );
      expect(missing).toContain('hype');
      expect(invalidCount).toBe(1);
    }
  });

  it('rejects a choice outside the criteria keys', () => {
    const { missing, invalidCount } = parseAnswers(
      {
        primary_language: {
          type: 'choice',
          choice: 'klingon',
          probabilities: { klingon: 1 },
          confidence: 0.9,
        },
      },
      IDS,
      QUESTIONS,
    );
    expect(missing).toContain('primary_language');
    expect(invalidCount).toBe(1);
  });

  it('rejects a score outside [0, levels-1]', () => {
    for (const score of [-1, 4, 5]) {
      const { missing } = parseAnswers(
        { clarity_offer: { type: 'score', score, legend: {}, probabilities: {}, confidence: 1 } },
        IDS,
        QUESTIONS,
      );
      expect(missing).toContain('clarity_offer');
    }
    // boundaries and fractional (probability-weighted) scores are valid
    for (const score of [0, 1.6, 3]) {
      const { missing } = parseAnswers(
        { clarity_offer: { type: 'score', score, legend: {}, probabilities: {}, confidence: 1 } },
        IDS,
        QUESTIONS,
      );
      expect(missing).not.toContain('clarity_offer');
    }
  });

  it('rejects invalid confidence and probabilities', () => {
    const badConfidence = parseAnswers(
      {
        primary_language: {
          type: 'choice',
          choice: 'english',
          probabilities: {},
          confidence: 1.5,
        },
      },
      IDS,
      QUESTIONS,
    );
    expect(badConfidence.missing).toContain('primary_language');
    const badProbs = parseAnswers(
      {
        primary_language: {
          type: 'choice',
          choice: 'english',
          probabilities: { english: 2 },
          confidence: 0.5,
        },
      },
      IDS,
      QUESTIONS,
    );
    expect(badProbs.missing).toContain('primary_language');
  });

  it('rejects answers whose type does not match the question', () => {
    const { missing } = parseAnswers(
      { hype: { type: 'score', score: 1, legend: {}, probabilities: {}, confidence: 1 } },
      IDS,
      QUESTIONS,
    );
    expect(missing).toContain('hype');
  });

  it('ignores unknown ids entirely', () => {
    const { answers, missing, invalidCount } = parseAnswers(
      { hype: { type: 'noul', noul: 0.2 }, rogue_id: { type: 'noul', noul: 9 } },
      IDS,
      QUESTIONS,
    );
    expect(answers.rogue_id).toBeUndefined();
    expect(missing).not.toContain('rogue_id');
    expect(invalidCount).toBe(0);
  });

  it('handles a non-object raw payload gracefully', () => {
    for (const raw of [null, 'nope', 42, [1, 2]]) {
      const { answers, missing } = parseAnswers(raw, IDS, QUESTIONS);
      expect(answers).toEqual({});
      expect(missing).toEqual(IDS);
    }
  });
});

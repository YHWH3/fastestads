import type { JevQuestion } from './questions';

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface SemanticResult {
  status: 'ok' | 'partial';
  model: string;
  latencyMs: number;
  answers: Record<string, JevAnswer>;
  /** Expected ids that were absent or failed validation. */
  missing: string[];
}

export interface ParsedAnswers {
  answers: Record<string, JevAnswer>;
  missing: string[];
  invalidCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isProbabilityMap(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((v) => isUnitInterval(v));
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

function validAnswer(raw: unknown, question: JevQuestion): JevAnswer | null {
  if (!isRecord(raw) || raw.type !== question.type) return null;
  switch (question.type) {
    case 'noul': {
      return isUnitInterval(raw.noul) ? { type: 'noul', noul: raw.noul } : null;
    }
    case 'choice': {
      if (typeof raw.choice !== 'string' || !(raw.choice in question.criteria)) return null;
      if (!isProbabilityMap(raw.probabilities) || !isUnitInterval(raw.confidence)) return null;
      return {
        type: 'choice',
        choice: raw.choice,
        probabilities: raw.probabilities,
        confidence: raw.confidence,
      };
    }
    case 'score': {
      const levels = question.criteria.length;
      // Jev scores are probability-weighted and land between levels (e.g. 1.6).
      if (typeof raw.score !== 'number' || !Number.isFinite(raw.score)) return null;
      if (raw.score < 0 || raw.score > levels - 1) return null;
      if (!isStringMap(raw.legend)) return null;
      if (!isProbabilityMap(raw.probabilities) || !isUnitInterval(raw.confidence)) return null;
      return {
        type: 'score',
        score: raw.score,
        legend: raw.legend,
        probabilities: raw.probabilities,
        confidence: raw.confidence,
      };
    }
  }
}

/**
 * Structural validation of a raw Jev answers map (no zod — core stays
 * dependency-free). Unknown ids are ignored; invalid entries count as missing.
 */
export function parseAnswers(
  raw: unknown,
  expectedIds: string[],
  questions: Record<string, JevQuestion>,
): ParsedAnswers {
  const answers: Record<string, JevAnswer> = {};
  const missing: string[] = [];
  let invalidCount = 0;
  const source = isRecord(raw) ? raw : {};
  for (const id of expectedIds) {
    const question = questions[id];
    const candidate = source[id];
    if (question === undefined || candidate === undefined) {
      missing.push(id);
      continue;
    }
    const answer = validAnswer(candidate, question);
    if (answer === null) {
      missing.push(id);
      invalidCount += 1;
      continue;
    }
    answers[id] = answer;
  }
  return { answers, missing, invalidCount };
}

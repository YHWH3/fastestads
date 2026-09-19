import type { JevQuestion } from '../../src/core/semantic/questions';
import type { JevAnswer } from '../../src/core/semantic/answers';
import type { SemanticRequestPlan } from '../../src/core/semantic/request';

/** Generates a valid answer for every expected id in the plan. */
export function mockAnswers(
  plan: SemanticRequestPlan,
  overrides: Record<string, JevAnswer> = {},
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const id of plan.expectedIds) {
    const q: JevQuestion = plan.questions[id];
    switch (q.type) {
      case 'noul':
        answers[id] = { type: 'noul', noul: 0.1 };
        break;
      case 'choice': {
        const first = Object.keys(q.criteria)[0];
        answers[id] = {
          type: 'choice',
          choice: first,
          probabilities: { [first]: 1 },
          confidence: 0.9,
        };
        break;
      }
      case 'score':
        answers[id] = {
          type: 'score',
          score: q.criteria.length - 1,
          legend: {},
          probabilities: {},
          confidence: 0.9,
        };
        break;
    }
  }
  return { ...answers, ...overrides };
}

export function noul(probability: number): JevAnswer {
  return { type: 'noul', noul: probability };
}

export function score(value: number, confidence = 0.9): JevAnswer {
  return { type: 'score', score: value, legend: {}, probabilities: {}, confidence };
}

export function choice(
  value: string,
  confidence = 0.9,
  probabilities: Record<string, number> = {},
): JevAnswer {
  return { type: 'choice', choice: value, probabilities, confidence };
}

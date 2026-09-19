import type { AdInput, DeterministicResult } from '../platform/types';
import {
  AD_LEVEL_QUESTIONS,
  KEYWORD_QUESTIONS,
  STATE_CONTEXT,
  descriptionKey,
  headlineKey,
  redundantPairQuestion,
  redundantQuestionId,
  vagueHeadlineQuestion,
  vagueQuestionId,
  type JevQuestion,
  type SemanticState,
} from './questions';

export interface SemanticRequestPlan {
  state: SemanticState;
  questions: Record<string, JevQuestion>;
  /** Question ids in the order they were added. */
  expectedIds: string[];
  /** Original 0-based slot index -> state key ("H3" = Headline 3 in the UI). */
  headlineKeys: Record<number, string>;
}

const DUPLICATE_RULE_IDS = new Set(['duplicate.exact', 'duplicate.normalized', 'duplicate.near']);

/** Headline index pairs already reported by deterministic duplicate rules. */
function duplicatePairs(det: DeterministicResult): Set<string> {
  const pairs = new Set<string>();
  for (const issue of det.issues) {
    if (!DUPLICATE_RULE_IDS.has(issue.ruleId)) continue;
    const indices = issue.fields.filter((f) => f.field === 'headline').map((f) => f.index);
    for (let i = 0; i < indices.length; i += 1) {
      for (let j = i + 1; j < indices.length; j += 1) {
        pairs.add(`${indices[i]}-${indices[j]}`);
      }
    }
  }
  return pairs;
}

/**
 * Builds the Jev request plan from a deterministic result. Pure and
 * deterministic; user copy only ever lands inside `state` values.
 * Returns null when the ad is not evaluable.
 */
export function buildSemanticRequest(
  det: DeterministicResult,
  input: Pick<AdInput, 'headlines' | 'descriptions' | 'keyword'>,
): SemanticRequestPlan | null {
  if (!det.evaluable) return null;

  const headlineKeys: Record<number, string> = {};
  const headlines: Record<string, string> = {};
  for (const stat of det.fields.headlines) {
    if (stat.status === 'empty') continue;
    const key = headlineKey(stat.ref.index);
    headlineKeys[stat.ref.index] = key;
    headlines[key] = stat.original;
  }
  const descriptions: Record<string, string> = {};
  for (const stat of det.fields.descriptions) {
    if (stat.status === 'empty') continue;
    descriptions[descriptionKey(stat.ref.index)] = stat.original;
  }

  const keyword = input.keyword?.trim();
  const state: SemanticState = {
    context: STATE_CONTEXT,
    headlines,
    descriptions,
  };
  if (keyword) state.target_query = keyword;

  const questions: Record<string, JevQuestion> = {};
  for (const [id, q] of Object.entries(AD_LEVEL_QUESTIONS)) questions[id] = q;
  if (state.target_query) {
    for (const [id, q] of Object.entries(KEYWORD_QUESTIONS)) questions[id] = q;
  }

  const sortedIndices = Object.keys(headlineKeys)
    .map(Number)
    .sort((a, b) => a - b);
  for (const index of sortedIndices) {
    const key = headlineKeys[index];
    questions[vagueQuestionId(key)] = vagueHeadlineQuestion(key);
  }

  const dupPairs = duplicatePairs(det);
  for (let i = 0; i < sortedIndices.length; i += 1) {
    for (let j = i + 1; j < sortedIndices.length; j += 1) {
      const a = sortedIndices[i];
      const b = sortedIndices[j];
      if (dupPairs.has(`${a}-${b}`)) continue;
      const keyA = headlineKeys[a];
      const keyB = headlineKeys[b];
      questions[redundantQuestionId(keyA, keyB)] = redundantPairQuestion(keyA, keyB);
    }
  }

  return { state, questions, expectedIds: Object.keys(questions), headlineKeys };
}

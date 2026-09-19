import type { DeterministicResult, Issue } from '../platform/types';
import type { Band } from '../semantic/bands';
import type { SemanticResult } from '../semantic/answers';

export type { Band } from '../semantic/bands';
export type { SemanticResult } from '../semantic/answers';

export type SemanticState = 'ok' | 'partial' | 'unavailable' | 'skipped' | 'not_requested';

export interface SemanticSlice {
  state: SemanticState;
  reason?: string;
  result?: SemanticResult;
}

export type DimensionId =
  | 'completeness'
  | 'structure'
  | 'differentiation'
  | 'relevance'
  | 'clarity'
  | 'specificity'
  | 'cta';

export interface Dimension {
  id: DimensionId;
  label: string;
  basis: 'deterministic' | 'semantic' | 'mixed';
  band: Band | 'not_evaluated' | 'unavailable';
  lowConfidence?: boolean;
  reasons: string[];
}

export interface AnalysisReport {
  /** 'blocked' = platform_limit errors present. */
  status: 'blocked' | 'needs_work' | 'ready';
  deterministic: DeterministicResult;
  semantic: SemanticSlice;
  dimensions: Dimension[];
  /** Deterministic + semantic-derived issues, sorted by severity. */
  issues: Issue[];
}

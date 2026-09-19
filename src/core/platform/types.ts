export type Platform = 'google-ads';
export type AdFormat = 'rsa';
export type FieldKind = 'headline' | 'description' | 'path' | 'finalUrl' | 'keyword';

/** index is 0-based; display copy always shows index + 1. */
export interface FieldRef {
  field: FieldKind;
  index: number;
}

export interface AdInput {
  platform: Platform;
  format: AdFormat;
  /** Raw, untrimmed, exactly as typed. */
  headlines: string[];
  descriptions: string[];
  paths: string[];
  finalUrl?: string;
  keyword?: string;
}

export type Severity = 'error' | 'warning' | 'info';
export type IssueKind =
  'platform_limit' | 'editorial_indicator' | 'structure' | 'keyword' | 'best_practice' | 'semantic';

export interface SourceRef {
  label: string;
  url: string;
  /** YYYY-MM-DD */
  lastVerified: string;
}

export interface Issue {
  /** Unique per occurrence, e.g. "headline.length.max:h2". */
  id: string;
  /** Registry id, e.g. "headline.length.max". */
  ruleId: string;
  severity: Severity;
  kind: IssueKind;
  origin: 'deterministic' | 'semantic';
  fields: FieldRef[];
  /** <= 60 characters. */
  title: string;
  /** 1–2 sentences. */
  detail: string;
  recommendation?: string;
  meta?: Record<string, string | number | boolean>;
  source?: SourceRef;
}

export interface FieldStat {
  ref: FieldRef;
  /** Original, untrimmed text exactly as supplied. */
  original: string;
  /** Platform counted characters (Google: double-width = 2). */
  counted: number;
  graphemes: number;
  limit: number | null;
  remaining: number | null;
  /** 'near' means remaining <= nearThreshold (3 headline / 8 description / 2 path). */
  status: 'empty' | 'ok' | 'near' | 'over';
  issueIds: string[];
}

export interface KeywordCoverage {
  raw: string;
  normalized: string;
  terms: string[];
  phraseInHeadlines: number[];
  phraseInDescriptions: number[];
  termsCovered: string[];
  termsMissing: string[];
  /** 0..1 share of non-empty headlines containing the full phrase. */
  headlineShareWithPhrase: number;
}

export interface DeterministicResult {
  fields: {
    headlines: FieldStat[];
    descriptions: FieldStat[];
    paths: FieldStat[];
    finalUrl?: FieldStat;
  };
  /** Non-empty slots only. */
  counts: { headlines: number; descriptions: number; paths: number };
  issues: Issue[];
  keyword?: KeywordCoverage;
  /** Any platform_limit error. */
  hasBlockingErrors: boolean;
  /** >= 1 non-empty headline OR description (semantic is worth running). */
  evaluable: boolean;
}

export interface NonEmptyEntry {
  index: number;
  text: string;
}

export interface FieldLimits {
  min: number;
  max: number;
  maxChars: number;
  nearThreshold: number;
}

export interface RuleContext {
  input: AdInput;
  platform: PlatformDefinition;
  fields: DeterministicResult['fields'];
  counts: DeterministicResult['counts'];
  nonEmpty: {
    headlines: NonEmptyEntry[];
    descriptions: NonEmptyEntry[];
    paths: NonEmptyEntry[];
  };
  keyword?: KeywordCoverage;
}

export interface Rule {
  /** Stable public identifier; add, don't rename. */
  id: string;
  kind: IssueKind;
  severity: Severity;
  source?: SourceRef;
  check(ctx: RuleContext): Issue[];
}

export interface PlatformDefinition {
  platform: Platform;
  format: AdFormat;
  label: string;
  fields: Record<'headline' | 'description' | 'path', FieldLimits>;
  countedLength(text: string): number;
  sources: Record<string, SourceRef>;
  rules: Rule[];
}

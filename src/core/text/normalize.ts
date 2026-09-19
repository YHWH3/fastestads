export const STOPWORDS: readonly string[] = [
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'with',
  'your',
  'our',
  'you',
  'we',
  'is',
  'at',
  'by',
];

const STOPWORD_SET: ReadonlySet<string> = new Set(STOPWORDS);

export function isStopword(token: string): boolean {
  return STOPWORD_SET.has(token);
}

/**
 * NFKC → casefold → punctuation/symbols to spaces → collapse whitespace → trim.
 */
export function normalizeForCompare(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeForCompare(text);
  if (normalized === '') return [];
  return normalized.split(' ');
}

/** Tokens with stopwords removed. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((token) => !isStopword(token));
}

/** Jaccard similarity of two token collections. Empty/empty is defined as 1. */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  return intersection / union.size;
}

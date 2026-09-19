import type { Issue, Rule } from '../../../platform/types';
import { defineRule, makeIssue } from '../../../platform/issue';
import {
  detectInvisible,
  detectNonstandardSpaces,
  hasDoubleSpace,
  hasEdgeWhitespace,
  isEmoji,
  isHalfwidthKatakana,
  isStopword,
  segmentGraphemes,
  tokenize,
} from '../../../text';
import { SOURCES } from '../spec';
import { allAssets, displayName, occurrenceKey, ref } from './shared';

type AssetFinder = (text: string) => string[] | null;

/** Builds a per-field editorial rule: flag every asset where `find` returns hits. */
function editorialRule(
  id: string,
  label: string,
  source: Rule['source'],
  find: AssetFinder,
  copy: (
    name: string,
    hits: string[],
  ) => { title: string; detail: string; recommendation?: string },
): Rule {
  return defineRule({
    id,
    label,
    kind: 'editorial_indicator',
    severity: 'warning',
    source,
    check(ctx, rule) {
      const issues: Issue[] = [];
      for (const asset of allAssets(ctx)) {
        const hits = find(asset.entry.text);
        if (!hits || hits.length === 0) continue;
        const name = displayName(asset.kind, asset.entry.index);
        issues.push(
          makeIssue(
            rule,
            [ref(asset.kind, asset.entry.index)],
            { ...copy(name, hits), meta: { found: hits.slice(0, 5).join(' ') } },
            occurrenceKey(asset.kind, asset.entry.index),
          ),
        );
      }
      return issues;
    },
  });
}

// --- character rules -------------------------------------------------------

const charsEmoji = editorialRule(
  'chars.emoji',
  'Emoji in ad text',
  SOURCES.punctuation,
  (text) => segmentGraphemes(text).filter((g) => isEmoji(g)),
  (name) => ({
    title: `${name} contains emoji`,
    detail: `Emoji are not supported in ad text and may be flagged under Google's punctuation and symbols policy.`,
    recommendation: 'Remove the emoji from this field.',
  }),
);

const charsHalfwidthKatakana = editorialRule(
  'chars.halfwidth_katakana',
  'Half-width katakana',
  SOURCES.punctuation,
  (text) => {
    const hits: string[] = [];
    for (const ch of text) {
      if (isHalfwidthKatakana(ch.codePointAt(0) as number)) hits.push(ch);
    }
    return hits;
  },
  (name) => ({
    title: `${name} uses half-width katakana`,
    detail: `Single-byte (half-width) katakana is not supported and may be flagged under Google's punctuation and symbols policy.`,
    recommendation: 'Rewrite the katakana in full-width form.',
  }),
);

const charsInvisible = editorialRule(
  'chars.invisible',
  'Invisible characters',
  SOURCES.spacing,
  (text) =>
    detectInvisible(text).map((h) => `U+${h.cp.toString(16).toUpperCase().padStart(4, '0')}`),
  (name, hits) => ({
    title: `${name} contains invisible characters`,
    detail: `${name} contains zero-width or invisible formatting characters (${hits.join(', ')}) that may be flagged under Google's spacing policy.`,
    recommendation: 'Retype the text or paste it as plain text to strip hidden characters.',
  }),
);

// --- whitespace rules ------------------------------------------------------

const whitespaceEdge = editorialRule(
  'whitespace.edge',
  'Leading or trailing whitespace',
  SOURCES.spacing,
  (text) => (hasEdgeWhitespace(text) ? ['edge whitespace'] : []),
  (name) => ({
    title: `${name} has leading or trailing whitespace`,
    detail: `Extra whitespace at the start or end may be flagged under Google's spacing policy.`,
    recommendation: 'Trim the whitespace from the edges of this field.',
  }),
);

const whitespaceDouble = editorialRule(
  'whitespace.double',
  'Double spaces',
  SOURCES.spacing,
  (text) => (hasDoubleSpace(text) ? ['double space'] : []),
  (name) => ({
    title: `${name} contains double spaces`,
    detail: `Repeated spaces may be flagged under Google's spacing policy.`,
    recommendation: 'Replace consecutive spaces with a single space.',
  }),
);

const whitespaceNonstandard = editorialRule(
  'whitespace.nonstandard',
  'Non-standard spaces',
  SOURCES.spacing,
  (text) =>
    detectNonstandardSpaces(text).map(
      (h) => `U+${h.cp.toString(16).toUpperCase().padStart(4, '0')}`,
    ),
  (name, hits) => ({
    title: `${name} uses non-standard spaces`,
    detail: `${name} contains non-standard space characters (${hits.join(', ')}) such as no-break or thin spaces, which may be flagged under Google's spacing policy.`,
    recommendation: 'Replace them with regular spaces.',
  }),
);

const COMMON_TLDS =
  /^(?:com|net|org|io|co|ai|app|dev|gov|edu|info|biz|me|us|uk|ca|de|fr|jp|au|shop|store|online|site|xyz|tv|gg|so|to|in|it|nl|es|br|mx|kr|cn|ru|ch|se|no|fi|dk|be|at|pl|cz|pt|gr|tr|il|za|nz|sg|hk|my|ph|th|vn|id|ar|cl|pe|uy|ve|ie|ee|lt|lv|ua|by|sk|hu|ro|bg|hr|si|rs|is|blog|tech|pro|name|mobi|asia|cat|jobs|tel|travel|xxx|post|aero|coop|museum|int|mil)$/i;

/** `[,.!?;:][A-Za-z]` matches, excluding URLs/domains, decimals, and ellipses. */
function findMissingSpaceAfterPunct(text: string): string[] {
  const hits: string[] = [];
  const re = /[,.!?;:][A-Za-z]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const i = m.index;
    const punct = text[i];
    const before = text[i - 1] ?? '';
    const after = text[i + 2] ?? '';
    // Ellipsis: a '.' adjacent to another dot is not missing a space.
    if (punct === '.' && (before === '.' || after === '.')) continue;
    // Decimals like 1.5x: digit before the punctuation.
    if (/\d/.test(before)) continue;
    // URL/domain: inspect the whitespace-delimited token around the match.
    const start = text.lastIndexOf(' ', i - 1) + 1;
    let end = text.indexOf(' ', i + 2);
    if (end === -1) end = text.length;
    const token = text.slice(start, end);
    if (/^(?:https?:\/\/|www\.)/i.test(token)) continue;
    const domainMatch = token.match(/^[\w-]+(?:\.([\w-]+))+/);
    if (domainMatch && domainMatch[1] && COMMON_TLDS.test(domainMatch[1])) continue;
    hits.push(m[0]);
  }
  return hits;
}

const whitespaceMissingAfterPunct = editorialRule(
  'whitespace.missing_after_punct',
  'Missing space after punctuation',
  SOURCES.spacing,
  findMissingSpaceAfterPunct,
  (name, hits) => ({
    title: `${name} is missing a space after punctuation`,
    detail: `Sequences like "${hits[0]}" look like a missing space and may be flagged under Google's spacing policy.`,
    recommendation: 'Add a space after the punctuation mark.',
  }),
);

// --- punctuation / symbols -------------------------------------------------

/** Repeated-punctuation runs; a single `...` or `…` is allowed once. */
function findRepeatedPunctuation(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/[!?]{2,}/g)) found.add(m[0].slice(0, 2));
  for (const m of text.matchAll(/\*{2,}/g)) found.add(m[0].slice(0, 3));
  for (const m of text.matchAll(/-{2,}/g)) found.add(m[0].slice(0, 2));
  let ellipsisAllowed = 1;
  for (const m of text.matchAll(/\.{2,}|…/g)) {
    const run = m[0];
    const isSingleEllipsis = run === '...' || run === '…';
    if (isSingleEllipsis && ellipsisAllowed > 0) {
      ellipsisAllowed -= 1;
      continue;
    }
    found.add(isSingleEllipsis ? run : run.length > 40 ? `${run.slice(0, 3)}…` : run);
  }
  return [...found];
}

const punctRepeated = editorialRule(
  'punct.repeated',
  'Repeated punctuation',
  SOURCES.punctuation,
  findRepeatedPunctuation,
  (name, hits) => ({
    title: `${name} repeats punctuation marks`,
    detail: `Repeated punctuation like "${hits[0]}" may be flagged under Google's punctuation and symbols policy.`,
    recommendation: 'Use each punctuation mark at most once.',
  }),
);

const punctExclamationExcess = editorialRule(
  'punct.exclamation_excess',
  'Excessive exclamation marks',
  SOURCES.punctuation,
  (text) => {
    const count = (text.match(/!/g) ?? []).length;
    return count > 1 ? [String(count)] : [];
  },
  (name, hits) => ({
    title: `${name} uses ${hits[0]} exclamation marks`,
    detail: `More than one exclamation mark in a single asset may be flagged under Google's punctuation and symbols policy.`,
    recommendation: 'Keep at most one exclamation mark per asset.',
  }),
);

const DECORATIVE_CHARS = ['•', '★', '☆', '►', '→', '✓', '^'];

function findDecorativeSymbols(text: string): string[] {
  const found = new Set<string>();
  for (const ch of DECORATIVE_CHARS) {
    if (text.includes(ch)) found.add(ch);
  }
  for (const m of text.matchAll(/\*\S[^*]*\*/g)) found.add(m[0]);
  for (const m of text.matchAll(/~\S[^~]*~/g)) found.add(m[0]);
  return [...found];
}

const symbolsDecorative = editorialRule(
  'symbols.decorative',
  'Decorative symbols',
  SOURCES.punctuation,
  findDecorativeSymbols,
  (name, hits) => ({
    title: `${name} uses decorative symbols`,
    detail: `Decorative symbols like "${hits[0]}" may be flagged under Google's punctuation and symbols policy.`,
    recommendation: 'Remove the decorative characters.',
  }),
);

// --- capitalization --------------------------------------------------------

const CAPS_ALLOWLIST: ReadonlySet<string> = new Set(
  'ASAP USA UK EU CRM SEO PPC SEM B2B B2C SAAS API HVAC CEO CPA ROI ROAS LLC INC FAQ VIP DIY HD 4K USB GPS LED AI IT HR'.split(
    ' ',
  ),
);

function capsWords(text: string): string[] {
  return text.match(/\b[A-Z]{4,}\b/g) ?? [];
}

const capsAllCapsWord = defineRule({
  id: 'caps.all_caps_word',
  label: 'All-caps words',
  kind: 'editorial_indicator',
  severity: 'warning',
  source: SOURCES.capitalization,
  check(ctx, rule) {
    // A word that appears in all caps across >= 2 assets is treated as a brand name.
    const appearances = new Map<string, Set<string>>();
    for (const asset of allAssets(ctx)) {
      const key = `${asset.kind}${asset.entry.index}`;
      for (const word of new Set(capsWords(asset.entry.text))) {
        const set = appearances.get(word) ?? new Set<string>();
        set.add(key);
        appearances.set(word, set);
      }
    }
    const brandAllowlisted = new Set(
      [...appearances.entries()].filter(([, set]) => set.size >= 2).map(([w]) => w),
    );
    const issues: Issue[] = [];
    for (const asset of allAssets(ctx)) {
      const flagged = [
        ...new Set(
          capsWords(asset.entry.text).filter(
            (w) => !CAPS_ALLOWLIST.has(w) && !brandAllowlisted.has(w),
          ),
        ),
      ];
      if (flagged.length === 0) continue;
      const name = displayName(asset.kind, asset.entry.index);
      issues.push(
        makeIssue(
          rule,
          [ref(asset.kind, asset.entry.index)],
          {
            title: `${name} uses all-caps words`,
            detail: `Gimmicky capitalization such as "${flagged[0]}" may be flagged under Google's capitalization policy.`,
            recommendation: 'Use normal sentence or title casing instead.',
            meta: { found: flagged.join(' ') },
          },
          occurrenceKey(asset.kind, asset.entry.index),
        ),
      );
    }
    return issues;
  },
});

function findAlternatingCaps(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(/\b[A-Za-z]{5,}\b/g)) {
    const word = m[0];
    let alternations = 0;
    for (let i = 1; i < word.length; i += 1) {
      const prevUpper = word[i - 1] === word[i - 1].toUpperCase();
      const curUpper = word[i] === word[i].toUpperCase();
      if (prevUpper !== curUpper) alternations += 1;
    }
    if (alternations >= 3) hits.push(word);
  }
  return hits;
}

const capsAlternating = editorialRule(
  'caps.alternating',
  'Alternating capitalization',
  SOURCES.capitalization,
  findAlternatingCaps,
  (name, hits) => ({
    title: `${name} uses alternating capitalization`,
    detail: `Mixed-case styling like "${hits[0]}" may be flagged under Google's capitalization policy.`,
    recommendation: 'Use normal casing.',
  }),
);

function findSpacedLetters(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(/(?:\b[A-Za-z]\b[.\s]+){3,}\b[A-Za-z]\b/g)) {
    hits.push(m[0]);
  }
  return hits;
}

const capsSpacedLetters = editorialRule(
  'caps.spaced_letters',
  'Spaced-out letters',
  SOURCES.capitalization,
  findSpacedLetters,
  (name, hits) => ({
    title: `${name} spells out single letters`,
    detail: `Spaced or dotted letters like "${hits[0]}" may be flagged under Google's capitalization policy.`,
    recommendation: 'Write the word normally.',
  }),
);

// --- phone numbers ----------------------------------------------------------

/**
 * Phone-number candidates: 7+ digits with typical separators and an optional
 * leading '+'. Rejects matches adjacent to currency/percent signs, bare
 * 4-digit runs (years), and runs embedded in things like 24/7.
 */
export function findPhoneNumbers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/\+?\d(?:[\d\s().-]*\d)*/g)) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7) continue;
    const start = m.index;
    const end = start + raw.length;
    const prev = text[start - 1] ?? '';
    const next = text[end] ?? '';
    if (prev !== '' && '$€£'.includes(prev)) continue;
    if (next === '%') continue;
    if (prev === '/' && /\d/.test(text[start - 2] ?? '')) continue;
    if (next === '/' && /\d/.test(text[end + 1] ?? '')) continue;
    found.push(raw.trim());
  }
  return found;
}

const phoneInText = editorialRule(
  'phone.in_text',
  'Phone number in ad text',
  SOURCES.phone,
  findPhoneNumbers,
  (name, hits) => ({
    title: `${name} contains a phone number`,
    detail: `Phone numbers in ad text ("${hits[0]}") are not allowed and may be flagged under Google's editorial policy.`,
    recommendation: 'Remove the phone number; use call assets or a landing page instead.',
  }),
);

// --- repetition within one asset -------------------------------------------

function findRepeatedWords(text: string): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    if (token.length < 4 || isStopword(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([w]) => w);
}

const repetitionWordWithinAsset = editorialRule(
  'repetition.word_within_asset',
  'Repeated words in one asset',
  SOURCES.repetition,
  findRepeatedWords,
  (name, hits) => ({
    title: `${name} repeats the same word`,
    detail: `The word "${hits[0]}" appears multiple times in one asset, which may be flagged under Google's repetition policy.`,
    recommendation: 'Vary the wording so each term appears once.',
  }),
);

export const editorialRules: Rule[] = [
  charsEmoji,
  charsHalfwidthKatakana,
  charsInvisible,
  whitespaceEdge,
  whitespaceDouble,
  whitespaceNonstandard,
  whitespaceMissingAfterPunct,
  punctRepeated,
  punctExclamationExcess,
  symbolsDecorative,
  capsAllCapsWord,
  capsAlternating,
  capsSpacedLetters,
  phoneInText,
  repetitionWordWithinAsset,
];

import { segmentGraphemes } from './graphemes';
import { isDoubleWidth } from './width';

export interface CodePointHit {
  /** The offending code point. */
  cp: number;
  /** UTF-16 code-unit index where it occurs. */
  index: number;
}

const INVISIBLE_CODEPOINTS: ReadonlySet<number> = new Set([
  0x200b, // zero width space
  0x200c, // zero width non-joiner
  0x200d, // zero width joiner
  0x2060, // word joiner
  0xfeff, // zero width no-break space / BOM
  0x00ad, // soft hyphen
]);

const NONSTANDARD_SPACE_CODEPOINTS: ReadonlySet<number> = new Set([
  0x00a0, // no-break space
  0x2000,
  0x2001,
  0x2002,
  0x2003,
  0x2004,
  0x2005,
  0x2006,
  0x2007,
  0x2008,
  0x2009,
  0x200a,
  0x202f, // narrow no-break space
  0x205f, // medium mathematical space
  0x3000, // ideographic space
]);

function scanCodePoints(text: string, wanted: (cp: number) => boolean): CodePointHit[] {
  const hits: CodePointHit[] = [];
  let index = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (wanted(cp)) hits.push({ cp, index });
    index += ch.length;
  }
  return hits;
}

/**
 * Invisible formatting characters Google may reject. U+200E/U+200F (LRM/RLM)
 * are deliberately excluded — they are legitimate bidirectional marks.
 */
export function detectInvisible(text: string): CodePointHit[] {
  return scanCodePoints(text, (cp) => INVISIBLE_CODEPOINTS.has(cp));
}

/**
 * Non-standard space characters. U+3000 (ideographic space) is only reported
 * when the text is not predominantly CJK, where it is legitimate.
 */
export function detectNonstandardSpaces(text: string): CodePointHit[] {
  const cjk = isPredominantlyCJK(text);
  return scanCodePoints(text, (cp) => {
    if (!NONSTANDARD_SPACE_CODEPOINTS.has(cp)) return false;
    if (cp === 0x3000 && cjk) return false;
    return true;
  });
}

export function containsLineBreak(text: string): boolean {
  return /[\n\r\u2028\u2029]/.test(text);
}

export function hasDoubleSpace(text: string): boolean {
  return text.includes('  ');
}

export function hasEdgeWhitespace(text: string): boolean {
  return text.length > 0 && text !== text.trim();
}

export function isPredominantlyCJK(text: string): boolean {
  const graphemes = segmentGraphemes(text).filter((g) => !/^\s+$/u.test(g));
  if (graphemes.length === 0) return false;
  let cjk = 0;
  for (const grapheme of graphemes) {
    for (const ch of grapheme) {
      if (isDoubleWidth(ch.codePointAt(0) as number)) {
        cjk += 1;
        break;
      }
    }
  }
  return cjk / graphemes.length > 0.5;
}

const RTL_PATTERN = /[\u0590-\u08ff\ufb50-\ufdff\ufe70-\ufefc\u200e\u200f]/u;

export function hasRTL(text: string): boolean {
  return RTL_PATTERN.test(text);
}

const EMOJI_BASE_EXCLUSIONS: ReadonlySet<string> = new Set([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '#',
  '*',
  '©',
  '®',
  '™',
]);

const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/**
 * True when the grapheme is pictographic/emoji. Plain digits, '#' and '*'
 * (which are technically Extended_Pictographic) are excluded, as are the
 * © ® ™ symbols. Keycap sequences like "1️⃣" still count as emoji.
 */
export function isEmoji(grapheme: string): boolean {
  const base = grapheme.replace(/\uFE0F/g, '');
  if (EMOJI_BASE_EXCLUSIONS.has(base)) return false;
  for (const ch of base) {
    const cp = ch.codePointAt(0) as number;
    // U+20E3 turns a preceding digit/#/* into a keycap emoji.
    if (cp === 0x20e3 || EXTENDED_PICTOGRAPHIC.test(ch)) return true;
  }
  return false;
}

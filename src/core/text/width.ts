import type { Platform } from '../platform/types';
import { graphemeCount, segmentGraphemes } from './graphemes';

// Code-point ranges Google Ads counts as two characters (East Asian
// Wide/Fullwidth). Kept as a sorted, non-overlapping range table.
const DOUBLE_WIDTH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x2fdf], // CJK Radicals Supplement, Kangxi Radicals, Ideographic Description
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x3100, 0x312f], // Bopomofo
  [0x3130, 0x318f], // Hangul Compatibility Jamo
  [0x31a0, 0x31bf], // Bopomofo Extended
  [0x31c0, 0x31ef], // CJK Strokes
  [0x3200, 0x33ff], // Enclosed CJK, CJK Compatibility
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi Syllables / Radicals
  [0xa960, 0xa97f], // Hangul Jamo Extended-B
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xd7b0, 0xd7ff], // Hangul Jamo Extended-B (medial vowels / final consonants)
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe30, 0xfe6f], // CJK Compatibility Forms + Small Form Variants
  [0xff01, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6], // Fullwidth symbol signs
  [0x20000, 0x2fffd], // CJK Unified Ideographs Extension B and beyond
  [0x30000, 0x3fffd], // CJK Unified Ideographs Extension G/H
];

export function isDoubleWidth(codePoint: number): boolean {
  let lo = 0;
  let hi = DOUBLE_WIDTH_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = DOUBLE_WIDTH_RANGES[mid];
    if (codePoint < start) hi = mid - 1;
    else if (codePoint > end) lo = mid + 1;
    else return true;
  }
  return false;
}

export function isHalfwidthKatakana(codePoint: number): boolean {
  return codePoint >= 0xff61 && codePoint <= 0xff9f;
}

/**
 * Platform "counted" length. For Google Ads each double-width character counts
 * as 2; everything else counts 1 per grapheme (emoji count 1 and are flagged
 * separately by rule).
 */
export function countedLength(text: string, platform: Platform): number {
  if (platform !== 'google-ads') {
    return graphemeCount(text);
  }
  let total = 0;
  for (const grapheme of segmentGraphemes(text)) {
    let wide = false;
    for (const ch of grapheme) {
      if (isDoubleWidth(ch.codePointAt(0) as number)) {
        wide = true;
        break;
      }
    }
    total += wide ? 2 : 1;
  }
  return total;
}

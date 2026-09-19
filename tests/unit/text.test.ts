import { describe, expect, it } from 'vitest';
import {
  STOPWORDS,
  contentTokens,
  containsLineBreak,
  countedLength,
  detectInvisible,
  detectNonstandardSpaces,
  graphemeCount,
  hasDoubleSpace,
  hasEdgeWhitespace,
  hasRTL,
  isDoubleWidth,
  isEmoji,
  isHalfwidthKatakana,
  isPredominantlyCJK,
  jaccard,
  normalizeForCompare,
  segmentGraphemes,
  tokenize,
} from '@core/text';

describe('segmentGraphemes / graphemeCount', () => {
  it('splits ASCII per character', () => {
    expect(segmentGraphemes('abc')).toEqual(['a', 'b', 'c']);
    expect(graphemeCount('abc')).toBe(3);
  });

  it('keeps emoji ZWJ sequences as one grapheme', () => {
    expect(segmentGraphemes('👨‍👩‍👧')).toHaveLength(1);
    expect(graphemeCount('a👨‍👩‍👧b')).toBe(3);
  });

  it('keeps flag sequences as one grapheme', () => {
    expect(graphemeCount('🇺🇸')).toBe(1);
  });

  it('keeps combining marks with their base', () => {
    expect(graphemeCount('e\u0301')).toBe(1); // e + combining acute
    expect(segmentGraphemes('e\u0301')[0]).toBe('e\u0301');
  });
});

describe('isDoubleWidth', () => {
  it('flags CJK, kana, hangul and fullwidth forms', () => {
    expect(isDoubleWidth(0x4e2d)).toBe(true); // 中
    expect(isDoubleWidth(0x3042)).toBe(true); // あ
    expect(isDoubleWidth(0x30ab)).toBe(true); // カ
    expect(isDoubleWidth(0xd55c)).toBe(true); // 한
    expect(isDoubleWidth(0xff21)).toBe(true); // Ａ fullwidth A
    expect(isDoubleWidth(0x3000)).toBe(true); // ideographic space
  });

  it('does not flag ASCII or halfwidth katakana', () => {
    expect(isDoubleWidth(0x61)).toBe(false); // a
    expect(isDoubleWidth(0xff71)).toBe(false); // ｱ halfwidth
    expect(isDoubleWidth(0x20ac)).toBe(false); // €
  });
});

describe('isHalfwidthKatakana', () => {
  it('detects the U+FF61–FF9F block', () => {
    expect(isHalfwidthKatakana(0xff71)).toBe(true); // ｱ
    expect(isHalfwidthKatakana(0xff9f)).toBe(true);
    expect(isHalfwidthKatakana(0x30a1)).toBe(false); // fullwidth ア
    expect(isHalfwidthKatakana(0x61)).toBe(false);
  });
});

describe('countedLength (google-ads)', () => {
  it('counts ASCII and accented latin as 1', () => {
    expect(countedLength('abc', 'google-ads')).toBe(3);
    expect(countedLength('café', 'google-ads')).toBe(4);
  });

  it('counts CJK and fullwidth forms as 2', () => {
    expect(countedLength('あいう', 'google-ads')).toBe(6);
    expect(countedLength('ＡＢ', 'google-ads')).toBe(4);
    expect(countedLength('a中', 'google-ads')).toBe(3);
  });

  it('counts halfwidth katakana as 1', () => {
    expect(countedLength('ｱｲ', 'google-ads')).toBe(2);
  });

  it('counts each emoji grapheme as 1', () => {
    expect(countedLength('🚀🚀', 'google-ads')).toBe(2);
    expect(countedLength('👨‍👩‍👧', 'google-ads')).toBe(1);
  });
});

describe('normalizeForCompare', () => {
  it('casefolds, strips punctuation and collapses whitespace', () => {
    expect(normalizeForCompare('Héllo,  WORLD!')).toBe('héllo world');
    expect(normalizeForCompare('Buy-Now!')).toBe('buy now');
    expect(normalizeForCompare('  spaced   out  ')).toBe('spaced out');
  });

  it('applies NFKC so fullwidth becomes ASCII', () => {
    expect(normalizeForCompare('ＡＢＣ')).toBe('abc');
  });
});

describe('tokenize / STOPWORDS / contentTokens', () => {
  it('tokenizes normalized text', () => {
    expect(tokenize('Fast, Cheap Shoes!')).toEqual(['fast', 'cheap', 'shoes']);
    expect(tokenize('')).toEqual([]);
  });

  it('contains the documented stopwords', () => {
    for (const w of [
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
    ]) {
      expect(STOPWORDS).toContain(w);
    }
  });

  it('removes stopwords in contentTokens', () => {
    expect(contentTokens('the best shoes for you')).toEqual(['best', 'shoes']);
  });
});

describe('jaccard', () => {
  it('computes set similarity', () => {
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a'], ['b'])).toBe(0);
    expect(jaccard([], [])).toBe(1);
  });
});

describe('detectInvisible', () => {
  it('reports zero-width code points with index', () => {
    expect(detectInvisible('a\u200Bb')).toEqual([{ cp: 0x200b, index: 1 }]);
    expect(detectInvisible('x\u00ADy')).toEqual([{ cp: 0x00ad, index: 1 }]);
  });

  it('does not flag legitimate RTL marks', () => {
    expect(detectInvisible('a\u200Fb')).toEqual([]);
    expect(detectInvisible('a\u200Eb')).toEqual([]);
  });
});

describe('detectNonstandardSpaces', () => {
  it('reports NBSP and friends', () => {
    const hits = detectNonstandardSpaces('a\u00A0b');
    expect(hits).toHaveLength(1);
    expect(hits[0].cp).toBe(0x00a0);
  });

  it('ignores regular spaces', () => {
    expect(detectNonstandardSpaces('a b')).toEqual([]);
  });

  it('skips U+3000 in predominantly CJK text but flags it otherwise', () => {
    expect(detectNonstandardSpaces('あ\u3000い')).toEqual([]);
    expect(detectNonstandardSpaces('ab\u3000c')).toHaveLength(1);
  });
});

describe('misc detectors', () => {
  it('containsLineBreak', () => {
    expect(containsLineBreak('a\nb')).toBe(true);
    expect(containsLineBreak('a\rb')).toBe(true);
    expect(containsLineBreak('a\u2028b')).toBe(true);
    expect(containsLineBreak('ab')).toBe(false);
  });

  it('hasDoubleSpace / hasEdgeWhitespace', () => {
    expect(hasDoubleSpace('a  b')).toBe(true);
    expect(hasDoubleSpace('a b')).toBe(false);
    expect(hasEdgeWhitespace(' x')).toBe(true);
    expect(hasEdgeWhitespace('x ')).toBe(true);
    expect(hasEdgeWhitespace('x')).toBe(false);
    expect(hasEdgeWhitespace('')).toBe(false);
  });

  it('isPredominantlyCJK / hasRTL', () => {
    expect(isPredominantlyCJK('これは日本語です')).toBe(true);
    expect(isPredominantlyCJK('English text')).toBe(false);
    expect(hasRTL('עברית')).toBe(true);
    expect(hasRTL('العربية')).toBe(true);
    expect(hasRTL('English')).toBe(false);
  });
});

describe('isEmoji', () => {
  it('flags pictographs and emoji sequences', () => {
    expect(isEmoji('🚀')).toBe(true);
    expect(isEmoji('\u2615')).toBe(true);
    expect(isEmoji('1️⃣')).toBe(true); // keycap
  });

  it('excludes plain digits, #, * and © ® ™', () => {
    expect(isEmoji('5')).toBe(false);
    expect(isEmoji('#')).toBe(false);
    expect(isEmoji('*')).toBe(false);
    expect(isEmoji('©')).toBe(false);
    expect(isEmoji('®')).toBe(false);
    expect(isEmoji('™')).toBe(false);
    expect(isEmoji('a')).toBe(false);
  });
});

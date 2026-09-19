let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    try {
      segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
    } catch {
      segmenter = null;
    }
  }
  return segmenter ?? null;
}

export function segmentGraphemes(text: string): string[] {
  const seg = getSegmenter();
  if (seg) {
    return Array.from(seg.segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

export function graphemeCount(text: string): number {
  return segmentGraphemes(text).length;
}

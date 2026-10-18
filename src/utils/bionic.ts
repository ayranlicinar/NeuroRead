// Bionic Reading transformation. Produces a list of segments that render as
// plain React text nodes; concatenating all segments reproduces the original
// string exactly (Turkish letters, punctuation, whitespace and newlines).

export type BionicSegment =
  | { type: 'word'; bold: string; rest: string }
  | { type: 'text'; value: string };

// A "word" is a run of letters, combining marks and digits in any script.
const WORD_RE = /[\p{L}\p{M}\p{N}]+/gu;

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('tr', { granularity: 'grapheme' })
    : null;

function graphemes(word: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(word), (s) => s.segment);
  return Array.from(word);
}

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.4;
  return Math.min(0.8, Math.max(0.1, ratio));
}

/** Number of leading graphemes to bold for a word with `length` graphemes. */
export function boldLength(length: number, ratio: number): number {
  if (length <= 0) return 0;
  if (length <= 3) return 1;
  return Math.max(1, Math.min(length - 1, Math.round(length * clampRatio(ratio))));
}

export function toBionicSegments(text: string, ratio = 0.4): BionicSegment[] {
  const segments: BionicSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: 'text', value: text.slice(last, start) });
    const parts = graphemes(match[0]);
    const n = boldLength(parts.length, ratio);
    segments.push({ type: 'word', bold: parts.slice(0, n).join(''), rest: parts.slice(n).join('') });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
  return segments;
}

export function segmentsToString(segments: BionicSegment[]): string {
  return segments.map((s) => (s.type === 'word' ? s.bold + s.rest : s.value)).join('');
}

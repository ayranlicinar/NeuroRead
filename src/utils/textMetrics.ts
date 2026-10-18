/** Average silent-reading speed used for estimates. A rough, adjustable assumption. */
export const DEFAULT_WPM = 180;

const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;

export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

export function estimateReadingMinutes(words: number, wpm = DEFAULT_WPM): number {
  if (words <= 0 || wpm <= 0) return 0;
  return words / wpm;
}

export function formatReadingTime(minutes: number): string {
  if (minutes <= 0) return '0 dk';
  if (minutes < 1) return '1 dk’dan az';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} dk`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Split into paragraphs on blank lines; single newlines stay inside a paragraph. */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .filter((p) => p.trim().length > 0);
}

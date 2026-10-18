// Parses AI output into a tiny, safe block structure (headings, lists,
// paragraphs, **bold**). Rendering uses plain React text nodes, so any HTML or
// script inside the response is displayed as literal text, never executed.

export type Inline = { text: string; bold: boolean };

export type Block =
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'ol'; items: Inline[][] }
  | { type: 'p'; inlines: Inline[] };

export const MAX_RENDERED_CHARS = 40_000;

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: line.slice(last, i), bold: false });
    out.push({ text: m[1], bold: true });
    last = i + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out;
}

export function parseAiOutput(raw: string): Block[] {
  const text = raw.length > MAX_RENDERED_CHARS ? `${raw.slice(0, MAX_RENDERED_CHARS)}…` : raw;
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', inlines: parseInline(para.join(' ')) });
    para = [];
  };

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', inlines: parseInline(heading[1]) });
    } else if (bullet || ordered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const item = parseInline((bullet ?? ordered)![1]);
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === type) prev.items.push(item);
      else blocks.push({ type, items: [item] });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

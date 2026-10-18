import { useMemo } from 'react';
import { parseAiOutput, type Inline } from '../utils/aiFormat';

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((it, i) => (it.bold ? <strong key={i}>{it.text}</strong> : <span key={i}>{it.text}</span>))}
    </>
  );
}

/** Safe renderer for model output: text nodes only, no HTML injection. */
export function AiOutput({ content }: { content: string }) {
  const blocks = useMemo(() => parseAiOutput(content), [content]);
  return (
    <div className="ai-output">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <h4 key={i}>
                <Inlines items={b.inlines} />
              </h4>
            );
          case 'ul':
          case 'ol': {
            const List = b.type;
            return (
              <List key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inlines items={item} />
                  </li>
                ))}
              </List>
            );
          }
          case 'p':
            return (
              <p key={i}>
                <Inlines items={b.inlines} />
              </p>
            );
        }
      })}
    </div>
  );
}

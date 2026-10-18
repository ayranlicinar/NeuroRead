import { memo } from 'react';
import { toBionicSegments } from '../utils/bionic';

interface Props {
  text: string;
  enabled: boolean;
  ratio: number;
}

/** Renders text as React text nodes only; never as HTML. The source string is not modified. */
export const BionicText = memo(function BionicText({ text, enabled, ratio }: Props) {
  if (!enabled) return <>{text}</>;
  return (
    <>
      {toBionicSegments(text, ratio).map((seg, i) =>
        seg.type === 'word' ? (
          <span key={i} className="bionic-word">
            <b>{seg.bold}</b>
            {seg.rest}
          </span>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  );
});

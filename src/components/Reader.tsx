import { useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { ReadingSettings } from '../types';
import { countWords, estimateReadingMinutes, formatReadingTime, splitParagraphs } from '../utils/textMetrics';
import { BionicText } from './BionicText';

/** A short first line without sentence-ending punctuation is shown as a title. */
function isTitleLike(p: string): boolean {
  const t = p.trim();
  return t.length <= 90 && !t.includes('\n') && !/[.!?…:;,]$/.test(t);
}

interface Props {
  text: string;
  mode: 'edit' | 'read';
  settings: ReadingSettings;
  scrollRef: RefObject<HTMLDivElement | null>;
  progress: number;
  banner?: ReactNode;
  onTextChange: (text: string) => void;
  onLoadSample: () => void;
  onModeChange: (mode: 'edit' | 'read') => void;
  onSelection: (text: string) => void;
}

export function Reader({
  text,
  mode,
  settings,
  scrollRef,
  progress,
  banner,
  onTextChange,
  onLoadSample,
  onModeChange,
  onSelection,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const words = useMemo(() => countWords(text), [text]);
  const paragraphs = useMemo(() => splitParagraphs(text), [text]);
  const minutes = estimateReadingMinutes(words);
  const hasText = text.trim().length > 0;

  const captureSelection = () => {
    const sel = window.getSelection();
    const article = articleRef.current;
    if (!sel || !article || sel.isCollapsed || !sel.anchorNode || !article.contains(sel.anchorNode)) return;
    const selected = sel.toString().trim();
    if (selected) onSelection(selected);
  };

  const readerStyle = {
    '--reader-font-size': `${settings.fontSize}px`,
    '--reader-line-height': String(settings.lineHeight),
    '--reader-width': `${settings.paragraphWidth}ch`,
  } as CSSProperties;

  return (
    <section className="reader" aria-label="Okuma alanı">
      <div className="reader-toolbar">
        <div className="segmented small" role="tablist" aria-label="Görünüm">
          <button type="button" role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'is-active' : ''} onClick={() => onModeChange('edit')}>
            Metin
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'read'}
            className={mode === 'read' ? 'is-active' : ''}
            onClick={() => onModeChange('read')}
            disabled={!hasText}
          >
            Okuma görünümü
          </button>
        </div>
        <div className="reader-stats" aria-live="polite">
          <span>
            <strong>{words.toLocaleString('tr-TR')}</strong> kelime
          </span>
          <span>
            ≈ <strong>{formatReadingTime(minutes)}</strong> okuma
          </span>
          {mode === 'read' && hasText && <span>%{Math.round(progress * 100)} ilerleme</span>}
        </div>
      </div>
      {mode === 'read' && <div className="progress-bar" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />}
      {banner}

      <div className="reader-scroll" ref={scrollRef} data-font={settings.fontFamily}>
        {mode === 'edit' ? (
          <div className="editor">
            {!hasText && (
              <div className="welcome">
                <p className="eyebrow">Uyarlanabilir okuma alanı</p>
                <h1>Uzun metinleri daha rahat okuyun.</h1>
                <p>
                  Metninizi yapıştırın, tipografiyi kendinize göre ayarlayın, isterseniz yapay zekâ asistanından özet alın. Kamera analizi
                  tamamen isteğe bağlıdır ve yalnızca sizin onayınızla, tarayıcınızda çalışır.
                </p>
                <div className="welcome-actions">
                  <button type="button" className="btn btn-primary" onClick={onLoadSample}>
                    Örnek Türkçe metni yükle
                  </button>
                  <button type="button" className="btn" onClick={() => textareaRef.current?.focus()}>
                    Kendi metnimi yapıştır
                  </button>
                </div>
              </div>
            )}
            <label className="sr-only" htmlFor="reading-text">
              Okunacak metin
            </label>
            <textarea
              id="reading-text"
              ref={textareaRef}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Okumak istediğiniz metni buraya yapıştırın veya yazın…"
              spellCheck={false}
            />
            {hasText && (
              <div className="editor-actions">
                <button type="button" className="btn" onClick={() => onTextChange('')}>
                  Temizle
                </button>
                <button type="button" className="btn" onClick={onLoadSample}>
                  Örnek metin
                </button>
                <button type="button" className="btn btn-primary" onClick={() => onModeChange('read')}>
                  Okuma görünümüne geç →
                </button>
              </div>
            )}
          </div>
        ) : (
          <article
            ref={articleRef}
            className="reading-surface"
            style={readerStyle}
            lang="tr"
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
          >
            {paragraphs.map((p, i) => (
              <p key={i} className={i === 0 && isTitleLike(p) ? 'is-title' : undefined}>
                <BionicText text={p} enabled={settings.bionic} ratio={settings.bionicRatio} />
              </p>
            ))}
            <p className="reading-end" aria-hidden="true">
              ◆
            </p>
          </article>
        )}
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { AiAction } from '../../types';
import type { AiAvailability } from '../../hooks/useAiHealth';
import { MAX_QUESTION_CHARS, MAX_TEXT_CHARS, requestAi } from '../../services/aiClient';
import { AI_ACTIONS } from '../../services/messages';
import { AiOutput } from '../AiOutput';
import { Badge, Spinner } from '../ui';

interface Props {
  text: string;
  selection: string;
  availability: AiAvailability;
  preset: AiAction | null;
  onPresetConsumed: () => void;
  onClearSelection: () => void;
  onRecheck: () => void;
}

interface ResultItem {
  id: number;
  action: AiAction;
  question?: string;
  content: string;
  scope: 'selection' | 'all';
  truncated: boolean;
  at: Date;
}

const ACTION_ORDER: AiAction[] = ['summarize', 'simplify', 'key-ideas', 'study-notes', 'ask'];

export function AssistantPanel({ text, selection, availability, preset, onPresetConsumed, onClearSelection, onRecheck }: Props) {
  const [action, setAction] = useState<AiAction>('summarize');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (preset) {
      setAction(preset);
      onPresetConsumed();
    }
  }, [preset, onPresetConsumed]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const scope: 'selection' | 'all' = selection ? 'selection' : 'all';
  const source = scope === 'selection' ? selection : text;
  const truncated = source.length > MAX_TEXT_CHARS;
  const payloadText = truncated ? source.slice(0, MAX_TEXT_CHARS) : source;
  const needsQuestion = action === 'ask';
  const canSend = !loading && payloadText.trim().length > 0 && (!needsQuestion || question.trim().length > 0) && availability !== 'missing-key';

  const send = async () => {
    if (!canSend) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    const result = await requestAi({ action, text: payloadText, question: needsQuestion ? question.trim() : undefined }, controller.signal);
    if (controllerRef.current === controller) controllerRef.current = null;
    setLoading(false);
    if (result.ok) {
      setResults((prev) => [
        { id: nextId.current++, action, question: needsQuestion ? question.trim() : undefined, content: result.content, scope, truncated, at: new Date() },
        ...prev,
      ]);
    } else if (result.code !== 'CANCELLED') {
      setError({ code: result.code, message: result.message });
      if (result.code === 'MISSING_API_KEY') onRecheck();
    }
  };

  const copy = async (item: ResultItem) => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <div className="panel-body">
      {availability === 'missing-key' && (
        <div className="callout callout-warn" role="alert">
          <strong>Yapay zekâ yapılandırılmamış</strong>
          <ol>
            <li>
              Proje klasöründe <code>.env.example</code> dosyasını <code>.env</code> adıyla kopyalayın.
            </li>
            <li>
              <code>KEDY_API_KEY=</code> satırına kendi Kedy anahtarınızı yazın.
            </li>
            <li>Sunucuyu yeniden başlatın (<code>npm run dev</code>).</li>
          </ol>
          <p className="hint">Anahtar yalnızca sunucuda kalır; tarayıcıya hiçbir zaman gönderilmez. Okuma özellikleri anahtarsız da çalışır.</p>
          <button type="button" className="btn btn-sm" onClick={onRecheck}>
            Tekrar kontrol et
          </button>
        </div>
      )}
      {availability === 'unknown' && (
        <div className="callout callout-warn" role="status">
          <strong>Sunucuya ulaşılamadı</strong>
          <p className="hint">
            Yapay zekâ özellikleri NeuroRead sunucusunu gerektirir. <code>npm run dev</code> ile hem arayüzü hem sunucuyu başlatın.
          </p>
          <button type="button" className="btn btn-sm" onClick={onRecheck}>
            Tekrar kontrol et
          </button>
        </div>
      )}

      <section className="group">
        <h3>İşlem</h3>
        <div className="action-grid">
          {ACTION_ORDER.map((a) => (
            <button
              key={a}
              type="button"
              className={`action-chip ${action === a ? 'is-active' : ''}`}
              aria-pressed={action === a}
              onClick={() => setAction(a)}
              title={AI_ACTIONS[a].description}
            >
              {AI_ACTIONS[a].label}
            </button>
          ))}
        </div>
        <p className="hint">{AI_ACTIONS[action].description}.</p>
        {needsQuestion && (
          <label className="field">
            <span>Sorunuz</span>
            <textarea
              rows={3}
              maxLength={MAX_QUESTION_CHARS}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Örn. Yazar satır uzunluğu hakkında ne öneriyor?"
            />
          </label>
        )}
      </section>

      <section className="group">
        <h3>Kapsam</h3>
        {selection ? (
          <div className="scope-row">
            <span>
              Seçili metin <Badge>{selection.length.toLocaleString('tr-TR')} karakter</Badge>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClearSelection}>
              Tüm metni kullan
            </button>
          </div>
        ) : (
          <p className="hint">
            {text.trim() ? 'Tüm metin kullanılacak. Okuma görünümünde bir bölüm seçerek yalnızca onu gönderebilirsiniz.' : 'Önce okuma alanına bir metin ekleyin.'}
          </p>
        )}
        {truncated && (
          <p className="hint warn-text">Metin uzun; yalnızca ilk {MAX_TEXT_CHARS.toLocaleString('tr-TR')} karakter gönderilecek.</p>
        )}
      </section>

      <p className="privacy-note">
        “Gönder”e bastığınızda yalnızca yukarıdaki metin{needsQuestion ? ' ve sorunuz' : ''} NeuroRead sunucusu üzerinden Kedy NOVAQ’a gönderilir. Kamera verileri hiçbir zaman gönderilmez.
      </p>

      <div className="send-row">
        <button type="button" className="btn btn-primary btn-block" onClick={send} disabled={!canSend}>
          {loading ? <Spinner label="Yanıt bekleniyor…" /> : `${AI_ACTIONS[action].label} · Gönder`}
        </button>
        {loading && (
          <button type="button" className="btn btn-ghost" onClick={() => controllerRef.current?.abort()}>
            İptal
          </button>
        )}
      </div>

      {error && (
        <div className="callout callout-error" role="alert">
          <strong>İstek tamamlanamadı</strong>
          <p>{error.message}</p>
          <p className="hint">Kod: {error.code}</p>
        </div>
      )}

      {results.length === 0 && !error && !loading && (
        <div className="empty">
          <p>Henüz bir yanıt yok.</p>
          <p className="hint">Yapay zekâ yanılabilir; önemli bilgileri asıl metinden doğrulayın.</p>
        </div>
      )}

      <div className="results">
        {results.map((r) => (
          <article key={r.id} className="result-card">
            <header>
              <span className="result-title">
                {AI_ACTIONS[r.action].label}
                <Badge>{r.scope === 'selection' ? 'seçim' : 'tüm metin'}</Badge>
                {r.truncated && <Badge tone="warn">kısaltıldı</Badge>}
              </span>
              <span className="result-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(r)}>
                  {copiedId === r.id ? 'Kopyalandı' : 'Kopyala'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label="Yanıtı kaldır"
                  onClick={() => setResults((prev) => prev.filter((x) => x.id !== r.id))}
                >
                  ✕
                </button>
              </span>
            </header>
            {r.question && <p className="result-question">Soru: {r.question}</p>}
            <AiOutput content={r.content} />
            <footer className="hint">
              Kedy NOVAQ · {r.at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · Yapay zekâ çıktısıdır, hata içerebilir.
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

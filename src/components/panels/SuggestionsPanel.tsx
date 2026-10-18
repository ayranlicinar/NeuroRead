import type { EvidenceSource, ManualOverrides, SettingKey, Suggestion } from '../../types';
import { RULES } from '../../utils/adaptation';
import { Badge, Toggle } from '../ui';

const EVIDENCE: Record<EvidenceSource, string> = {
  session: 'Oturum süresi',
  interaction: 'Kaydırma etkinliği',
  camera: 'Kamera (yerel)',
  simulated: 'SİMÜLE',
};

const SETTING_LABEL: Partial<Record<SettingKey, string>> = {
  fontSize: 'yazı boyutu',
  lineHeight: 'satır aralığı',
  paragraphWidth: 'paragraf genişliği',
  theme: 'tema',
  fontFamily: 'yazı tipi',
  bionic: 'Bionic Reading',
  bionicRatio: 'Bionic oranı',
};

export function SuggestionCard({
  s,
  onAccept,
  onReject,
  compact,
}: {
  s: Suggestion;
  onAccept: (s: Suggestion) => void;
  onReject: (s: Suggestion) => void;
  compact?: boolean;
}) {
  return (
    <article className={`suggestion ${s.simulated ? 'is-simulated' : ''} ${compact ? 'is-compact' : ''}`}>
      <header>
        <strong>{s.title}</strong>
        <Badge tone={s.simulated ? 'sim' : s.evidence === 'camera' ? 'live' : 'neutral'}>{EVIDENCE[s.evidence]}</Badge>
      </header>
      <p>{s.reason}</p>
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAccept(s)}>
          {s.actionLabel}
        </button>
        {s.kind !== 'info' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReject(s)}>
            Hayır, teşekkürler
          </button>
        )}
      </div>
    </article>
  );
}

interface Props {
  suggestions: Suggestion[];
  autoAdapt: boolean;
  manualOverrides: ManualOverrides;
  hasText: boolean;
  onAutoAdapt: (v: boolean) => void;
  onAccept: (s: Suggestion) => void;
  onReject: (s: Suggestion) => void;
  onClearOverrides: () => void;
}

export function SuggestionsPanel(p: Props) {
  const manualKeys = Object.keys(p.manualOverrides) as SettingKey[];
  return (
    <div className="panel-body">
      <section className="group">
        <Toggle
          label="Otomatik uyarlama"
          hint={`Açıkken, görünüm önerileri en fazla ${RULES.autoApplyIntervalMs / 60000} dakikada bir otomatik uygulanır ve her seferinde geri alınabilir. Elle değiştirdiğiniz ayarlara dokunulmaz. Özet önerileri asla otomatik gönderilmez.`}
          checked={p.autoAdapt}
          onChange={p.onAutoAdapt}
        />
      </section>

      <section className="group">
        <h3>Güncel öneriler</h3>
        {!p.hasText ? (
          <p className="hint">Öneriler, okuma alanına metin eklendiğinde etkinleşir.</p>
        ) : p.suggestions.length === 0 ? (
          <div className="empty">
            <p>Şu an bir öneri yok.</p>
            <p className="hint">Öneriler yalnızca aşağıdaki açık kurallara göre oluşur. Reddettiğiniz öneri {RULES.rejectCooldownMs / 60000} dakika boyunca tekrar gösterilmez.</p>
          </div>
        ) : (
          p.suggestions.map((s) => <SuggestionCard key={s.id} s={s} onAccept={p.onAccept} onReject={p.onReject} />)
        )}
      </section>

      {manualKeys.length > 0 && (
        <section className="group">
          <h3>Elle ayarladıklarınız</h3>
          <p className="hint">Bu oturumda {manualKeys.map((k) => SETTING_LABEL[k] ?? k).join(', ')} ayarını kendiniz değiştirdiniz; bu ayarlar için öneri yapılmaz.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClearOverrides}>
            Önerilere yeniden izin ver
          </button>
        </section>
      )}

      <details className="method">
        <summary>Kurallar nasıl çalışır?</summary>
        <ul>
          <li>{RULES.warmThemeAfterMs / 60000} dk aktif okumadan sonra: sıcak tema önerisi.</li>
          <li>
            {RULES.narrowAfterMs / 60000} dk sonra satır genişliği {RULES.wideParagraphCh} karakterden fazlaysa: daha dar sütun önerisi.
          </li>
          <li>{RULES.breakAfterMs / 60000} dk aktif okumadan sonra: kısa mola önerisi.</li>
          <li>
            Oturum sürerken {RULES.idleScrollMs / 60000} dk kaydırma yoksa: özet önerisi. Kaydırma yokluğu anlama düzeyi hakkında bir şey söylemez; dikkatli okuma
            da olabilir.
          </li>
          <li>
            Kamera açıksa ve en az {RULES.eyeMinWindowMs / 1000} sn veri varsa: kapalı kare oranı ≥ %{RULES.closureRatioHigh * 100} veya ≥{' '}
            {RULES.sustainedClosuresHigh} uzun kapanma → satır aralığı önerisi; kırpma &lt; {RULES.lowBlinkRate}/dk → göz dinlendirme önerisi.
          </li>
          <li>Bu kurallar deneysel ve basittir; bilimsel olarak doğrulanmış bir yorgunluk ölçümü değildir.</li>
        </ul>
      </details>
    </div>
  );
}

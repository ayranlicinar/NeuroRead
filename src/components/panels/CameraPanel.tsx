import type { CameraErrorCode, CameraMetrics, CameraStatus, DemoScenario, SimulatedSignals } from '../../types';
import { CAMERA_ERRORS, DEMO_SCENARIOS } from '../../services/messages';
import { DEFAULTS } from '../../utils/eyeMetrics';
import { Badge, Spinner, Toggle } from '../ui';

interface Props {
  status: CameraStatus;
  error: CameraErrorCode | null;
  metrics: CameraMetrics | null;
  demoScenario: DemoScenario | null;
  demoSignals: SimulatedSignals | null;
  sessionIdle: boolean;
  useEyeSignals: boolean;
  onUseEyeSignals: (v: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onRecalibrate: () => void;
  onDemo: (scenario: DemoScenario | null) => void;
}

const pct = (v: number | null) => (v === null ? '—' : `%${Math.round(v * 100)}`);
const num = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}

function LiveMetrics({ m }: { m: CameraMetrics }) {
  const ind = m.indicators;
  const calibrationText =
    m.calibration === 'done'
      ? `tamam (referans EAR ${m.baselineEar.toFixed(2)})`
      : m.calibration === 'default'
        ? `varsayılan eşik (EAR ${m.baselineEar.toFixed(2)})`
        : m.calibration === 'collecting'
          ? `ölçülüyor… %${Math.round(m.calibrationProgress * 100)}`
          : 'yüz bekleniyor';
  return (
    <>
      {!m.faceDetected && <div className="callout callout-warn">Yüz algılanmıyor. Kameraya önden bakın ve yüzünüzün kadrajda olduğundan emin olun.</div>}
      {m.faceDetected && !m.eyesVisible && <div className="callout callout-warn">Göz bölgesi tam görünmüyor; ölçümler duraklatıldı.</div>}
      {m.lowLight && <div className="callout callout-warn">Ortam ışığı düşük görünüyor; ölçümler güvenilmez olabilir.</div>}
      <div className="metrics-grid">
        <Metric label="Yüz" value={m.faceDetected ? 'Algılandı' : 'Algılanmadı'} />
        <Metric label="Göz bölgesi" value={m.eyesVisible ? 'Görünür' : 'Görünmüyor'} />
        <Metric
          label="Göz durumu"
          value={m.eyeState === 'open' ? 'Açık' : m.eyeState === 'closed' ? 'Kapalı' : 'Belirsiz'}
        />
        <Metric label="Göz açıklığı (EAR)" value={num(m.ear)} hint={m.opennessRatio === null ? undefined : `referansın ${pct(m.opennessRatio)}’i`} />
        <Metric
          label="Göz kırpma"
          value={String(m.blinkCount)}
          hint={ind.blinkRatePerMin === null ? 'dakika başı: veri toplanıyor' : `≈ ${ind.blinkRatePerMin.toFixed(0)} / dk (son 60 sn)`}
        />
        <Metric label="Uzun kapanma (≥1 sn)" value={String(m.sustainedClosureCount)} hint={`son 60 sn: ${ind.sustainedClosures}`} />
        <Metric label="Kapalı kare oranı" value={pct(ind.closureRatio)} hint="son 60 sn · PERCLOS değildir" />
        <Metric label="Yüz görünürlüğü" value={pct(ind.faceDetectedRatio)} hint="son 60 sn" />
        <Metric label="Işık" value={m.brightness === null ? '—' : m.lowLight ? 'Düşük' : 'Yeterli'} hint={m.brightness === null ? undefined : `ortalama parlaklık ${Math.round(m.brightness)}/255`} />
        <Metric label="İşlenen kare" value={`${m.fps.toFixed(0)} fps`} />
      </div>
      <p className="hint">Kalibrasyon: {calibrationText}</p>
    </>
  );
}

export function CameraPanel(p: Props) {
  const starting = p.status === 'requesting' || p.status === 'loading-model';
  const active = p.status === 'active';
  const err = p.status === 'error' && p.error ? CAMERA_ERRORS[p.error] : null;

  return (
    <div className="panel-body">
      <section className="group">
        <h3>
          Kamera analizi {active && <Badge tone="live">GERÇEK ÖLÇÜM</Badge>}
        </h3>
        {p.status === 'off' && (
          <>
            <p className="hint">
              İsteğe bağlıdır. Etkinleştirirseniz görüntü yalnızca tarayıcınızda MediaPipe ile işlenir; kareler, yüz görüntüleri ve yüz noktaları hiçbir
              yere gönderilmez veya kaydedilmez. Bu bir tıbbi ölçüm değildir ve yorgunluk teşhisi yapmaz.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={p.onStart}>
              Kamerayı etkinleştir
            </button>
          </>
        )}
        {starting && (
          <div className="callout">
            <Spinner label={p.status === 'loading-model' ? 'Yüz analizi modeli yükleniyor…' : 'Kamera izni bekleniyor… Tarayıcınızın izin penceresini kontrol edin.'} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={p.onStop}>
              Vazgeç
            </button>
          </div>
        )}
        {err && (
          <div className="callout callout-error" role="alert">
            <strong>{err.title}</strong>
            <p>{err.help}</p>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={p.onStart}>
                Tekrar dene
              </button>
              {!p.demoScenario && (
                <button type="button" className="btn btn-sm" onClick={() => p.onDemo('normal')}>
                  Demo modunu aç (simüle)
                </button>
              )}
            </div>
          </div>
        )}
        {active && (
          <>
            {p.metrics ? <LiveMetrics m={p.metrics} /> : <Spinner label="İlk kareler işleniyor…" />}
            <div className="row">
              <button type="button" className="btn" onClick={p.onStop}>
                Kamerayı kapat
              </button>
              <button type="button" className="btn btn-ghost" onClick={p.onRecalibrate} title="Gözleriniz açık, ekrana bakarken 3 saniyelik kişisel referans ölçümü">
                Yeniden kalibre et
              </button>
            </div>
          </>
        )}
        <Toggle
          label="Göz göstergelerini önerilerde kullan"
          hint="Kapalıysa öneriler yalnızca oturum süresi ve kaydırmaya dayanır."
          checked={p.useEyeSignals}
          onChange={p.onUseEyeSignals}
        />
      </section>

      <section className="group demo-group">
        <h3>
          Demo modu <Badge tone="sim">SİMÜLE</Badge>
        </h3>
        <p className="hint">
          Kamera olmadan uyarlama mantığını göstermek içindir. Buradaki değerler <strong>gerçek ölçüm değildir</strong> ve her yerde “simüle” olarak etiketlenir.
          Demo açıkken kamera kapalı tutulur.
        </p>
        <div className="demo-list" role="radiogroup" aria-label="Demo senaryosu">
          {(Object.keys(DEMO_SCENARIOS) as DemoScenario[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={p.demoScenario === s}
              className={`demo-option ${p.demoScenario === s ? 'is-active' : ''}`}
              onClick={() => p.onDemo(s)}
            >
              <span className="demo-title">{DEMO_SCENARIOS[s].label}</span>
              <span className="hint">{DEMO_SCENARIOS[s].description}</span>
            </button>
          ))}
        </div>
        {p.demoScenario && p.demoSignals && (
          <>
            <div className="sim-box">
              <Badge tone="sim">SİMÜLE DEĞERLER</Badge>
              <ul>
                <li>Ek oturum süresi: {Math.round(p.demoSignals.extraSessionMs / 60000)} dk</li>
                <li>Son kaydırmadan beri: {p.demoSignals.idleScrollMs === null ? 'gerçek veri' : `${Math.round(p.demoSignals.idleScrollMs / 1000)} sn`}</li>
                {p.demoSignals.eye && (
                  <>
                    <li>Göz kırpma: {p.demoSignals.eye.indicators.blinkRatePerMin} / dk</li>
                    <li>Kapalı kare oranı: {pct(p.demoSignals.eye.indicators.closureRatio)}</li>
                    <li>Uzun kapanma: {p.demoSignals.eye.indicators.sustainedClosures}</li>
                  </>
                )}
              </ul>
            </div>
            {p.sessionIdle && <p className="hint warn-text">Süre ve kaydırma senaryoları için üst çubuktan okuma oturumunu başlatın.</p>}
            <button type="button" className="btn btn-block" onClick={() => p.onDemo(null)}>
              Demo modunu kapat
            </button>
          </>
        )}
      </section>

      <details className="method">
        <summary>Yöntem ve sınırlamalar</summary>
        <ul>
          <li>
            Model: MediaPipe Face Landmarker (478 yüz noktası), tarayıcıda WebAssembly ile çalışır. Kareler en fazla yaklaşık 20 fps hızında işlenir ve bellekten hemen
            atılır.
          </li>
          <li>
            Göz açıklığı: Eye Aspect Ratio (EAR) = (|p2−p6| + |p3−p5|) / (2·|p1−p4|). Noktalar: 33, 160, 158, 133, 153, 144 ve 362, 385, 387, 263, 373, 380.
            İki gözün ortalaması kullanılır.
          </li>
          <li>
            Kalibrasyon: yüz ilk görüldüğünde yaklaşık {DEFAULTS.calibrationMs / 1000} sn boyunca EAR medyanı kişisel “açık göz” referansı olarak alınır
            (makul aralık dışındaysa varsayılan {DEFAULTS.baselineEar} kullanılır). Tıbbi bir kalibrasyon değildir.
          </li>
          <li>
            Kapalı: EAR &lt; referans × {DEFAULTS.closeFactor}; tekrar açık: EAR &gt; referans × {DEFAULTS.openFactor} (histerezis).
          </li>
          <li>
            Göz kırpma: {DEFAULTS.maxBlinkMs} ms’den kısa kapanma. Uzun kapanma: {DEFAULTS.sustainedMs} ms ve üzeri. Aradaki süreler sayılmaz. {DEFAULTS.maxFrameGapMs}{' '}
            ms’den uzun kare boşluklarında durum sıfırlanır.
          </li>
          <li>Kapalı kare oranı, son 60 sn içinde yüzün göründüğü karelerden gözlerin “kapalı” sayıldığı karelerin oranıdır. Doğrulanmış PERCLOS değildir.</li>
          <li>
            Sınırlamalar: gözlük yansımaları, düşük ışık, yan bakış, kamera açısı ve düşük kare hızı sonuçları bozabilir. Doğruluk oranı ölçülmemiştir; bu
            değerler yorgunluk, dikkat ya da anlama düzeyini ölçmez.
          </li>
        </ul>
      </details>
    </div>
  );
}

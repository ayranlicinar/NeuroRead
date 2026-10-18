import type { CameraStatus, DemoScenario, SessionStatus } from '../types';
import { DEMO_SCENARIOS } from '../services/messages';
import { formatDuration } from '../utils/textMetrics';

interface Props {
  sessionStatus: SessionStatus;
  activeMs: number;
  canStart: boolean;
  cameraStatus: CameraStatus;
  demoScenario: DemoScenario | null;
  focusMode: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onToggleFocus: () => void;
  onOpenCamera: () => void;
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Oturum başlamadı',
  running: 'Okuma sürüyor',
  paused: 'Duraklatıldı',
};

export function TopBar(p: Props) {
  const cameraOn = p.cameraStatus === 'active';
  const cameraStarting = p.cameraStatus === 'requesting' || p.cameraStatus === 'loading-model';
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          N
        </span>
        <span className="brand-name">NeuroRead</span>
      </div>

      <div className="session" aria-label="Okuma oturumu">
        <span className={`session-dot is-${p.sessionStatus}`} aria-hidden="true" />
        <span className="session-label">{STATUS_LABEL[p.sessionStatus]}</span>
        <span className="session-time" aria-label="Aktif okuma süresi">
          {formatDuration(p.activeMs)}
        </span>
        <div className="session-actions">
          {p.sessionStatus === 'idle' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={p.onStart} disabled={!p.canStart} title={p.canStart ? '' : 'Önce bir metin ekleyin'}>
              Başlat
            </button>
          )}
          {p.sessionStatus === 'running' && (
            <button type="button" className="btn btn-sm" onClick={p.onPause}>
              Duraklat
            </button>
          )}
          {p.sessionStatus === 'paused' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={p.onResume}>
              Devam et
            </button>
          )}
          {p.sessionStatus !== 'idle' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={p.onReset}>
              Sıfırla
            </button>
          )}
        </div>
      </div>

      <div className="topbar-right">
        {cameraOn && (
          <button type="button" className="indicator indicator-live" onClick={p.onOpenCamera} title="Kamera açık — görüntü yalnızca bu cihazda işlenir">
            <span className="rec-dot" aria-hidden="true" /> Kamera açık
          </button>
        )}
        {cameraStarting && (
          <button type="button" className="indicator" onClick={p.onOpenCamera}>
            Kamera başlatılıyor…
          </button>
        )}
        {p.demoScenario && (
          <button type="button" className="indicator indicator-sim" onClick={p.onOpenCamera} title="Gösterilen sinyaller simüledir, gerçek ölçüm değildir">
            DEMO · {DEMO_SCENARIOS[p.demoScenario].label} (simüle)
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onToggleFocus} aria-pressed={p.focusMode}>
          {p.focusMode ? 'Odak modundan çık' : 'Odak modu'}
        </button>
      </div>
    </header>
  );
}

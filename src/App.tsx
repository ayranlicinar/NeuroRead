import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  AiAction,
  DemoScenario,
  EyeSignal,
  ManualOverrides,
  ReadingSettings,
  SettingKey,
  Suggestion,
  SuggestionId,
} from './types';
import { TopBar } from './components/TopBar';
import { Reader } from './components/Reader';
import { CameraPreview } from './components/CameraPreview';
import { AppearancePanel } from './components/panels/AppearancePanel';
import { AssistantPanel } from './components/panels/AssistantPanel';
import { CameraPanel } from './components/panels/CameraPanel';
import { SuggestionCard, SuggestionsPanel } from './components/panels/SuggestionsPanel';
import { PrivacyPanel } from './components/panels/PrivacyPanel';
import { useNow } from './hooks/useNow';
import { useCameraAnalysis } from './hooks/useCameraAnalysis';
import { useScrollTracker } from './hooks/useScrollTracker';
import { useAiHealth } from './hooks/useAiHealth';
import { simulatedSignals } from './services/demoSignals';
import { SAMPLE_TEXT } from './services/sampleText';
import { evaluateAdaptation, pickAutoApply, previousValues } from './utils/adaptation';
import { getActiveMs, initialSession, sessionReducer } from './utils/session';
import { DEFAULT_SETTINGS, loadStoredSettings, storeSettings } from './utils/settings';

type TabId = 'appearance' | 'assistant' | 'camera' | 'suggestions' | 'privacy';

const TABS: { id: TabId; label: string }[] = [
  { id: 'appearance', label: 'Görünüm' },
  { id: 'assistant', label: 'Asistan' },
  { id: 'camera', label: 'Kamera' },
  { id: 'suggestions', label: 'Öneriler' },
  { id: 'privacy', label: 'Gizlilik' },
];

interface Toast {
  id: number;
  message: string;
  undo?: Partial<ReadingSettings>;
}

const storedAtStart = loadStoredSettings();

export default function App() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'edit' | 'read'>('edit');
  const [settings, setSettings] = useState<ReadingSettings>(storedAtStart ?? DEFAULT_SETTINGS);
  const [rememberPrefs, setRememberPrefs] = useState(storedAtStart !== null);
  const [manualOverrides, setManualOverrides] = useState<ManualOverrides>({});
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const [autoAdapt, setAutoAdapt] = useState(false);
  const [useEyeSignals, setUseEyeSignals] = useState(true);
  const [demoScenario, setDemoScenario] = useState<DemoScenario | null>(null);
  const [rejected, setRejected] = useState<Partial<Record<SuggestionId, number>>>({});
  const [accepted, setAccepted] = useState<SuggestionId[]>([]);
  const [lastAutoApplyAt, setLastAutoApplyAt] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [tab, setTab] = useState<TabId>('appearance');
  const [focusMode, setFocusMode] = useState(false);
  const [selection, setSelection] = useState('');
  const [aiPreset, setAiPreset] = useState<AiAction | null>(null);

  const now = useNow(1000);
  const camera = useCameraAnalysis();
  const ai = useAiHealth();
  const readerRef = useRef<HTMLDivElement>(null);
  const scroll = useScrollTracker(readerRef, [mode, text, settings.fontSize, settings.lineHeight, settings.paragraphWidth, focusMode]);
  const hasText = text.trim().length > 0;

  // Theme applies to the whole app.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    storeSettings(rememberPrefs ? settings : null);
  }, [rememberPrefs, settings]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- settings ----------
  const updateSetting = useCallback(<K extends SettingKey>(key: K, value: ReadingSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setManualOverrides((m) => ({ ...m, [key]: Date.now() }));
  }, []);

  const resetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    setManualOverrides({});
  };

  // ---------- session ----------
  const startSession = () => {
    dispatch({ type: 'start', now: Date.now() });
    setMode('read');
  };
  const resetSession = () => {
    dispatch({ type: 'reset' });
    setManualOverrides({});
    setRejected({});
    setAccepted([]);
    setLastAutoApplyAt(null);
  };

  // ---------- camera vs demo (mutually exclusive, never mixed) ----------
  const startCamera = () => {
    setDemoScenario(null);
    void camera.start();
  };
  const selectDemo = (scenario: DemoScenario | null) => {
    if (scenario) camera.stop();
    setDemoScenario(scenario);
  };

  // ---------- adaptation ----------
  const simulated = demoScenario ? simulatedSignals(demoScenario) : null;
  const sessionStarted = session.status !== 'idle';
  const realActiveMs = getActiveMs(session, now);
  const sessionActiveMs = realActiveMs + (simulated && sessionStarted ? simulated.extraSessionMs : 0);

  const scrollBaseline = Math.max(scroll.lastScrollAt.current ?? 0, session.resumedAt ?? 0);
  const realIdleMs = session.status === 'running' && scrollBaseline > 0 ? Math.max(0, now - scrollBaseline) : null;
  const interactionSimulated = !!simulated && simulated.idleScrollMs !== null;
  const msSinceLastScroll = interactionSimulated ? simulated!.idleScrollMs : realIdleMs;

  const eye: EyeSignal | null = simulated
    ? simulated.eye
    : camera.status === 'active' && camera.metrics
      ? { source: 'camera', indicators: camera.metrics.indicators }
      : null;

  const suggestions: Suggestion[] = useMemo(
    () =>
      hasText
        ? evaluateAdaptation({
            now,
            sessionRunning: session.status === 'running',
            sessionActiveMs,
            sessionSimulated: !!simulated && simulated.extraSessionMs > 0 && sessionStarted,
            msSinceLastScroll,
            interactionSimulated,
            textNeedsScrolling: interactionSimulated || scroll.needsScroll,
            settings,
            manualOverrides,
            eye,
            useEyeSignals,
            rejected,
            accepted,
          })
        : [],
    // eye/simulated are derived from the deps below
    [hasText, now, session.status, sessionActiveMs, msSinceLastScroll, interactionSimulated, scroll.needsScroll, settings, manualOverrides, camera.metrics, camera.status, demoScenario, useEyeSignals, rejected, accepted, sessionStarted],
  );

  const applySuggestion = useCallback(
    (s: Suggestion, auto = false) => {
      setAccepted((a) => (a.includes(s.id) ? a : [...a, s.id]));
      if (s.change) {
        const undo = previousValues(settings, s.change);
        setSettings((cur) => ({ ...cur, ...s.change }));
        setToast({ id: Date.now(), message: `${auto ? 'Otomatik uygulandı' : 'Uygulandı'}: ${s.title}${s.simulated ? ' (simüle veriye dayalı)' : ''}`, undo });
      }
      if (s.kind === 'summary') {
        setAiPreset('summarize');
        setTab('assistant');
        setFocusMode(false);
      }
      if (auto) setLastAutoApplyAt(Date.now());
    },
    [settings],
  );

  const rejectSuggestion = (s: Suggestion) => setRejected((r) => ({ ...r, [s.id]: Date.now() }));

  const undoToast = () => {
    if (!toast?.undo) return;
    const undo = toast.undo;
    setSettings((s) => ({ ...s, ...undo }));
    // Undoing is an explicit preference: don't suggest these settings again this session.
    const stamp = Date.now();
    setManualOverrides((m) => ({ ...m, ...Object.fromEntries(Object.keys(undo).map((k) => [k, stamp])) }));
    setToast(null);
  };

  useEffect(() => {
    if (!autoAdapt) return;
    const pick = pickAutoApply(suggestions, lastAutoApplyAt, now);
    if (pick) applySuggestion(pick, true);
  }, [autoAdapt, suggestions, lastAutoApplyAt, now, applySuggestion]);

  const consumePreset = useCallback(() => setAiPreset(null), []);
  const topSuggestion = !autoAdapt && mode === 'read' ? suggestions[0] : undefined;

  return (
    <div className={`app ${focusMode ? 'is-focus' : ''}`}>
      <TopBar
        sessionStatus={session.status}
        activeMs={realActiveMs}
        canStart={hasText}
        cameraStatus={camera.status}
        demoScenario={demoScenario}
        focusMode={focusMode}
        onStart={startSession}
        onPause={() => dispatch({ type: 'pause', now: Date.now() })}
        onResume={() => dispatch({ type: 'resume', now: Date.now() })}
        onReset={resetSession}
        onToggleFocus={() => setFocusMode((f) => !f)}
        onOpenCamera={() => {
          setFocusMode(false);
          setTab('camera');
        }}
      />

      <main className="workspace">
        <Reader
          text={text}
          mode={mode}
          settings={settings}
          scrollRef={readerRef}
          progress={scroll.progress}
          onTextChange={(t) => {
            setText(t);
            setSelection('');
            if (!t.trim()) setMode('edit');
          }}
          onLoadSample={() => {
            setText(SAMPLE_TEXT);
            setSelection('');
            setMode('read');
          }}
          onModeChange={setMode}
          onSelection={setSelection}
          banner={
            topSuggestion && (
              <div className="banner">
                <SuggestionCard s={topSuggestion} onAccept={(s) => applySuggestion(s)} onReject={rejectSuggestion} compact />
              </div>
            )
          }
        />

        <aside className="sidebar" aria-label="Araçlar">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className={tab === t.id ? 'is-active' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'suggestions' && suggestions.length > 0 && <span className="tab-count">{suggestions.length}</span>}
                {t.id === 'camera' && camera.status === 'active' && <span className="rec-dot" aria-label="kamera açık" />}
              </button>
            ))}
          </nav>
          {/* All panels stay mounted so state (e.g. AI results) survives tab switches. */}
          <div role="tabpanel" id="panel-appearance" aria-labelledby="tab-appearance" hidden={tab !== 'appearance'}>
            <AppearancePanel settings={settings} manualOverrides={manualOverrides} onChange={updateSetting} onResetDefaults={resetDefaults} />
          </div>
          <div role="tabpanel" id="panel-assistant" aria-labelledby="tab-assistant" hidden={tab !== 'assistant'}>
            <AssistantPanel
              text={text}
              selection={selection}
              availability={ai.availability}
              preset={aiPreset}
              onPresetConsumed={consumePreset}
              onClearSelection={() => setSelection('')}
              onRecheck={() => void ai.refresh()}
            />
          </div>
          <div role="tabpanel" id="panel-camera" aria-labelledby="tab-camera" hidden={tab !== 'camera'}>
            <CameraPanel
              status={camera.status}
              error={camera.error}
              metrics={camera.metrics}
              demoScenario={demoScenario}
              demoSignals={simulated}
              sessionIdle={!sessionStarted}
              useEyeSignals={useEyeSignals}
              onUseEyeSignals={setUseEyeSignals}
              onStart={startCamera}
              onStop={camera.stop}
              onRecalibrate={camera.recalibrate}
              onDemo={selectDemo}
            />
          </div>
          <div role="tabpanel" id="panel-suggestions" aria-labelledby="tab-suggestions" hidden={tab !== 'suggestions'}>
            <SuggestionsPanel
              suggestions={suggestions}
              autoAdapt={autoAdapt}
              manualOverrides={manualOverrides}
              hasText={hasText}
              onAutoAdapt={setAutoAdapt}
              onAccept={(s) => applySuggestion(s)}
              onReject={rejectSuggestion}
              onClearOverrides={() => setManualOverrides({})}
            />
          </div>
          <div role="tabpanel" id="panel-privacy" aria-labelledby="tab-privacy" hidden={tab !== 'privacy'}>
            <PrivacyPanel rememberPrefs={rememberPrefs} onRememberPrefs={setRememberPrefs} />
          </div>
        </aside>
      </main>

      <CameraPreview videoRef={camera.videoRef} status={camera.status} />

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button type="button" className="btn btn-sm" onClick={undoToast}>
              Geri al
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Kapat" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

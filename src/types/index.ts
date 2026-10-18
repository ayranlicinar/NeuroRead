// ---------- Reading preferences ----------

export type ThemeName = 'dark' | 'light' | 'warm';
export type FontFamily = 'serif' | 'sans';

export interface ReadingSettings {
  /** px */
  fontSize: number;
  /** unitless multiplier */
  lineHeight: number;
  /** max line length in `ch` */
  paragraphWidth: number;
  theme: ThemeName;
  fontFamily: FontFamily;
  bionic: boolean;
  /** share of each word (0–1) rendered bold in Bionic mode */
  bionicRatio: number;
}

export type SettingKey = keyof ReadingSettings;

/** Timestamp (ms) of the last manual change per setting, for the current session. */
export type ManualOverrides = Partial<Record<SettingKey, number>>;

// ---------- Session ----------

export type SessionStatus = 'idle' | 'running' | 'paused';

export interface SessionState {
  status: SessionStatus;
  startedAt: number | null;
  /** active time accumulated before the current running segment */
  accumulatedMs: number;
  /** start of the current running segment */
  resumedAt: number | null;
}

// ---------- Eye indicators ----------
// Real camera data and simulated demo data are deliberately different types
// that carry a `source` discriminator, so they can never be confused.

export interface EyeIndicators {
  /** how much time (ms) the rolling window actually covers */
  windowMs: number;
  /** share of processed frames in the window where a face was found (0–1) */
  faceDetectedRatio: number;
  /** blinks per minute of face-visible time, null if not enough data */
  blinkRatePerMin: number | null;
  /** share of face-visible frames with eyes below the closed threshold (0–1) */
  closureRatio: number | null;
  /** count of eye closures lasting ≥ 1 s inside the window */
  sustainedClosures: number;
}

export interface CameraEyeSignal {
  source: 'camera';
  indicators: EyeIndicators;
}

export type DemoScenario = 'normal' | 'reduced-scroll' | 'long-session' | 'example-recommendation';

export interface SimulatedEyeSignal {
  source: 'simulated';
  scenario: DemoScenario;
  indicators: EyeIndicators;
}

export type EyeSignal = CameraEyeSignal | SimulatedEyeSignal;

/** Values injected by the explicit demo mode. Never produced by the camera. */
export interface SimulatedSignals {
  source: 'simulated';
  scenario: DemoScenario;
  /** simulated extra active session time */
  extraSessionMs: number;
  /** simulated time since last scroll, null = use real interaction data */
  idleScrollMs: number | null;
  eye: SimulatedEyeSignal | null;
}

// ---------- Camera ----------

export type CalibrationState = 'pending' | 'collecting' | 'done' | 'default';

export interface CameraMetrics {
  source: 'camera';
  faceDetected: boolean;
  eyesVisible: boolean;
  /** mean Eye Aspect Ratio of both eyes for the latest frame */
  ear: number | null;
  /** latest EAR relative to calibrated open-eye baseline (0–1+) */
  opennessRatio: number | null;
  eyeState: 'open' | 'closed' | 'unknown';
  blinkCount: number;
  sustainedClosureCount: number;
  baselineEar: number;
  closeThreshold: number;
  calibration: CalibrationState;
  calibrationProgress: number;
  /** mean luma of a downsampled frame (0–255) */
  brightness: number | null;
  lowLight: boolean;
  fps: number;
  indicators: EyeIndicators;
}

export type CameraErrorCode =
  | 'UNSUPPORTED'
  | 'INSECURE_CONTEXT'
  | 'PERMISSION_DENIED'
  | 'NO_CAMERA'
  | 'CAMERA_IN_USE'
  | 'MODEL_LOAD_FAILED'
  | 'STREAM_ENDED'
  | 'UNKNOWN';

export type CameraStatus = 'off' | 'requesting' | 'loading-model' | 'active' | 'error';

// ---------- Adaptation ----------

export type SuggestionId =
  | 'increase-line-height'
  | 'reduce-width'
  | 'warm-theme'
  | 'offer-summary'
  | 'take-break';

export type EvidenceSource = 'session' | 'interaction' | 'camera' | 'simulated';

export interface Suggestion {
  id: SuggestionId;
  title: string;
  reason: string;
  actionLabel: string;
  /** settings change applied on accept; absent for informational suggestions */
  change?: Partial<ReadingSettings>;
  kind: 'setting' | 'summary' | 'info';
  evidence: EvidenceSource;
  /** true when the suggestion was triggered by demo-mode data */
  simulated: boolean;
}

export interface AdaptationInput {
  now: number;
  sessionRunning: boolean;
  sessionActiveMs: number;
  sessionSimulated: boolean;
  /** null = no scroll yet in this session */
  msSinceLastScroll: number | null;
  interactionSimulated: boolean;
  textNeedsScrolling: boolean;
  settings: ReadingSettings;
  manualOverrides: ManualOverrides;
  eye: EyeSignal | null;
  useEyeSignals: boolean;
  /** suggestion id → time it was rejected */
  rejected: Partial<Record<SuggestionId, number>>;
  accepted: readonly SuggestionId[];
}

// ---------- AI ----------

export type { AiActionId as AiAction } from '../../shared/aiContract';

export interface AiSuccess {
  ok: true;
  content: string;
}

export interface AiFailure {
  ok: false;
  code: string;
  message: string;
}

export type AiResult = AiSuccess | AiFailure;

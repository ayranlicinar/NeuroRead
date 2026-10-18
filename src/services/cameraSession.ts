// Owns the webcam stream and the per-frame analysis loop.
// Frames are analysed in memory and immediately discarded; nothing is stored or sent.
import type { CameraErrorCode, CameraMetrics } from '../types';
import type { Point2 } from '../utils/eyeMetrics';
import { EyeAnalyzer } from './eyeAnalyzer';

export interface LandmarkerLike {
  detectForVideo(video: never, timestamp: number): { faceLandmarks: Point2[][] };
  close(): void;
}

export interface VideoLike {
  srcObject: MediaProvider | null;
  muted: boolean;
  play(): Promise<void>;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly readyState: number;
}

export interface CameraSessionDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createLandmarker(): Promise<LandmarkerLike>;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
  now(): number;
  measureBrightness?(video: VideoLike): number | null;
}

export class CameraError extends Error {
  constructor(public readonly code: CameraErrorCode) {
    super(code);
    this.name = 'CameraError';
  }
}

export function mapMediaError(err: unknown): CameraErrorCode {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'PERMISSION_DENIED';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'NO_CAMERA';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'CAMERA_IN_USE';
    default:
      return 'UNKNOWN';
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

const TARGET_FPS = 20;
const EMIT_INTERVAL_MS = 250;
const BRIGHTNESS_INTERVAL_MS = 1000;

export class CameraSession {
  readonly analyzer = new EyeAnalyzer();
  onMetrics?: (metrics: CameraMetrics) => void;
  onError?: (error: CameraError) => void;

  private stream: MediaStream | null = null;
  private landmarker: LandmarkerLike | null = null;
  private video: VideoLike | null = null;
  private frameId: number | null = null;
  private generation = 0;
  private lastProcessed = -Infinity;
  private lastEmit = -Infinity;
  private lastBrightness = -Infinity;
  private lastTimestamp = -1;

  constructor(private readonly deps: CameraSessionDeps) {}

  get isRunning(): boolean {
    return this.stream !== null && this.landmarker !== null;
  }

  /**
   * Loads the model, then asks for camera permission and starts analysis.
   * Resolves `false` if `stop()` was called meanwhile. Throws CameraError on failure,
   * in which case every acquired camera track has already been stopped.
   */
  async start(video: VideoLike, onStage?: (stage: 'loading-model' | 'requesting') => void): Promise<boolean> {
    this.stop();
    const gen = ++this.generation;

    onStage?.('loading-model');
    let landmarker: LandmarkerLike;
    try {
      landmarker = await this.deps.createLandmarker();
    } catch {
      if (gen !== this.generation) return false;
      throw new CameraError('MODEL_LOAD_FAILED');
    }
    if (gen !== this.generation) {
      landmarker.close();
      return false;
    }
    this.landmarker = landmarker;

    onStage?.('requesting');
    let stream: MediaStream;
    try {
      stream = await this.deps.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      if (gen !== this.generation) return false;
      this.stop();
      throw new CameraError(mapMediaError(err));
    }
    if (gen !== this.generation) {
      // stop() was called while the permission prompt was open.
      stopStream(stream);
      return false;
    }
    this.stream = stream;
    for (const track of stream.getVideoTracks()) track.addEventListener('ended', this.handleEnded);

    try {
      video.muted = true;
      video.srcObject = stream;
      this.video = video;
      await video.play();
    } catch (err) {
      if (gen !== this.generation) return false;
      this.stop();
      throw new CameraError(mapMediaError(err));
    }
    if (gen !== this.generation) return false;

    this.frameId = this.deps.requestFrame(this.tick);
    return true;
  }

  /** Stops the loop and every camera track, detaches the video and frees the model. Idempotent. */
  stop(): void {
    this.generation++;
    if (this.frameId !== null) this.deps.cancelFrame(this.frameId);
    this.frameId = null;
    if (this.stream) {
      for (const track of this.stream.getVideoTracks()) track.removeEventListener('ended', this.handleEnded);
      stopStream(this.stream);
    }
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {
        /* already released */
      }
    }
    this.landmarker = null;
  }

  recalibrate(): void {
    this.analyzer.recalibrate();
  }

  private handleEnded = () => {
    this.stop();
    this.onError?.(new CameraError('STREAM_ENDED'));
  };

  private tick = () => {
    const { video, landmarker } = this;
    if (!video || !landmarker || !this.stream) return;
    const now = this.deps.now();

    if (now - this.lastProcessed >= 1000 / TARGET_FPS && video.readyState >= 2 && video.videoWidth > 0) {
      this.lastProcessed = now;
      // MediaPipe requires strictly increasing timestamps in VIDEO mode.
      const ts = Math.max(Math.round(now), this.lastTimestamp + 1);
      this.lastTimestamp = ts;
      let landmarks: Point2[] | null;
      try {
        landmarks = landmarker.detectForVideo(video as never, ts).faceLandmarks[0] ?? null;
      } catch {
        this.stop();
        this.onError?.(new CameraError('UNKNOWN'));
        return;
      }
      this.analyzer.processFrame(landmarks, video.videoWidth, video.videoHeight, now);

      if (this.deps.measureBrightness && now - this.lastBrightness >= BRIGHTNESS_INTERVAL_MS) {
        this.lastBrightness = now;
        this.analyzer.brightness = this.deps.measureBrightness(video);
      }
      if (now - this.lastEmit >= EMIT_INTERVAL_MS) {
        this.lastEmit = now;
        this.onMetrics?.(this.analyzer.snapshot());
      }
    }
    if (this.stream) this.frameId = this.deps.requestFrame(this.tick);
  };
}

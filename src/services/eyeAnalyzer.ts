import type { CalibrationState, CameraMetrics } from '../types';
import {
  BlinkDetector,
  Calibrator,
  DEFAULTS,
  EYE_A,
  EYE_B,
  RollingEyeWindow,
  eyeAspectRatio,
  eyesInFrame,
  type Point2,
} from '../utils/eyeMetrics';

/** Mean frame luma (0–255) below which we warn about lighting. */
export const LOW_LIGHT_THRESHOLD = 50;

/** Turns per-frame landmarks into explainable, aggregated eye indicators. Holds no images. */
export class EyeAnalyzer {
  private blink = new BlinkDetector();
  private calibrator = new Calibrator();
  private window = new RollingEyeWindow();
  private calibration: CalibrationState = 'pending';
  private baseline: number = DEFAULTS.baselineEar;
  private blinkCount = 0;
  private sustainedCount = 0;
  private lastEar: number | null = null;
  private faceDetected = false;
  private eyesVisible = false;
  private frameTimes: number[] = [];
  brightness: number | null = null;

  /** Restart the short personal open-eye reference measurement. */
  recalibrate(): void {
    this.calibrator.reset();
    this.calibration = 'collecting';
  }

  processFrame(landmarks: readonly Point2[] | null, width: number, height: number, t: number): void {
    this.frameTimes.push(t);
    while (this.frameTimes.length && this.frameTimes[0] < t - 2000) this.frameTimes.shift();

    this.faceDetected = !!landmarks && landmarks.length > 0;
    this.eyesVisible = this.faceDetected && eyesInFrame(landmarks!);

    let ear: number | null = null;
    if (this.faceDetected && this.eyesVisible) {
      const values = [eyeAspectRatio(landmarks!, EYE_A, width, height), eyeAspectRatio(landmarks!, EYE_B, width, height)]
        .filter((v): v is number => v !== null);
      ear = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
    this.lastEar = ear;

    if (this.calibration === 'pending' && ear !== null) this.calibration = 'collecting';
    if (this.calibration === 'collecting') {
      const result = this.calibrator.add(ear, t);
      if (typeof result === 'number') {
        this.baseline = result;
        this.blink.setBaseline(result);
        this.calibration = 'done';
      } else if (result === 'invalid') {
        this.baseline = DEFAULTS.baselineEar;
        this.blink.setBaseline(this.baseline);
        this.calibration = 'default';
      }
    }

    for (const event of this.blink.update(ear, t)) {
      this.window.addEvent(event);
      if (event.type === 'blink') this.blinkCount++;
      else this.sustainedCount++;
    }
    this.window.addFrame({ t, face: ear !== null, closed: this.blink.eyeState === 'closed' });
  }

  snapshot(): CameraMetrics {
    const n = this.frameTimes.length;
    const span = n > 1 ? this.frameTimes[n - 1] - this.frameTimes[0] : 0;
    return {
      source: 'camera',
      faceDetected: this.faceDetected,
      eyesVisible: this.eyesVisible,
      ear: this.lastEar,
      opennessRatio: this.lastEar === null ? null : this.lastEar / this.baseline,
      eyeState: this.blink.eyeState,
      blinkCount: this.blinkCount,
      sustainedClosureCount: this.sustainedCount,
      baselineEar: this.baseline,
      closeThreshold: this.blink.closeThreshold,
      calibration: this.calibration,
      calibrationProgress: this.calibrator.progress,
      brightness: this.brightness,
      lowLight: this.brightness !== null && this.brightness < LOW_LIGHT_THRESHOLD,
      fps: span > 0 ? ((n - 1) * 1000) / span : 0,
      indicators: this.window.stats(),
    };
  }
}

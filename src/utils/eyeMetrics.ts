// Explainable eye indicators computed from MediaPipe Face Landmarker landmarks.
//
// Eye Aspect Ratio (EAR, Soukupová & Čech 2016):
//   EAR = (|p2 − p6| + |p3 − p5|) / (2 · |p1 − p4|)
// p1/p4 are the eye corners, p2/p3 upper-lid points, p6/p5 the lower-lid points
// below them. EAR drops towards 0 when the lid closes.
//
// Everything here is a heuristic on 2D landmarks. It is NOT PERCLOS, NOT a
// validated fatigue measure and has no claimed accuracy.

export interface Point2 {
  x: number;
  y: number;
}

/** MediaPipe Face Mesh indices [p1, p2, p3, p4, p5, p6]. Image-left eye (subject's right eye). */
export const EYE_A = [33, 160, 158, 133, 153, 144] as const;
/** Image-right eye (subject's left eye). */
export const EYE_B = [362, 385, 387, 263, 373, 380] as const;

export const DEFAULTS = {
  /** typical open-eye EAR used until calibration completes */
  baselineEar: 0.28,
  /** closed when EAR < baseline × closeFactor */
  closeFactor: 0.7,
  /** re-opened when EAR > baseline × openFactor (hysteresis) */
  openFactor: 0.85,
  /** closure shorter than this counts as a blink */
  maxBlinkMs: 500,
  /** closure at least this long counts as a sustained closure */
  sustainedMs: 1000,
  /** frame gaps longer than this reset the state machine (tab hidden, stalls) */
  maxFrameGapMs: 300,
  /** rolling window for rates/ratios */
  windowMs: 60_000,
  /** face-visible time needed before a blink rate is reported */
  minRateCoverageMs: 15_000,
  /** calibration: face-visible time and minimum samples */
  calibrationMs: 3_000,
  calibrationMinSamples: 15,
  /** plausible open-eye EAR range for a calibration result */
  calibrationMinEar: 0.15,
  calibrationMaxEar: 0.5,
} as const;

function dist(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * EAR for one eye. Landmarks are normalized to [0,1]; they are scaled by the
 * frame size so that horizontal and vertical distances are comparable.
 */
export function eyeAspectRatio(
  landmarks: readonly Point2[],
  idx: readonly number[],
  width: number,
  height: number,
): number | null {
  const p = idx.map((i) => landmarks[i]);
  if (p.some((pt) => !pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) return null;
  const s = p.map((pt) => ({ x: pt!.x * width, y: pt!.y * height }));
  const horizontal = dist(s[0], s[3]);
  if (horizontal < 1e-6) return null;
  return (dist(s[1], s[5]) + dist(s[2], s[4])) / (2 * horizontal);
}

/** True if all eye landmarks lie inside the frame. */
export function eyesInFrame(landmarks: readonly Point2[]): boolean {
  return [...EYE_A, ...EYE_B].every((i) => {
    const pt = landmarks[i];
    return !!pt && pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1;
  });
}

export type BlinkEvent = { type: 'blink'; t: number; durationMs: number } | { type: 'sustained'; t: number };

/** Time-based blink detector with hysteresis; independent of frame rate. */
export class BlinkDetector {
  private state: 'open' | 'closed' | 'unknown' = 'unknown';
  private closedAt = 0;
  private sustainedReported = false;
  private lastT: number | null = null;
  closeThreshold: number;
  openThreshold: number;

  constructor(baselineEar: number = DEFAULTS.baselineEar) {
    this.closeThreshold = baselineEar * DEFAULTS.closeFactor;
    this.openThreshold = baselineEar * DEFAULTS.openFactor;
  }

  setBaseline(baselineEar: number): void {
    this.closeThreshold = baselineEar * DEFAULTS.closeFactor;
    this.openThreshold = baselineEar * DEFAULTS.openFactor;
  }

  get eyeState(): 'open' | 'closed' | 'unknown' {
    return this.state;
  }

  /** Feed one frame. `ear` null = no face / eyes not measurable. */
  update(ear: number | null, t: number): BlinkEvent[] {
    const events: BlinkEvent[] = [];
    const gap = this.lastT === null ? 0 : t - this.lastT;
    this.lastT = t;

    if (ear === null || gap > DEFAULTS.maxFrameGapMs) {
      // Lost tracking or stalled: we cannot know what happened, start over.
      this.state = 'unknown';
      if (ear === null) return events;
    }

    if (this.state === 'unknown') {
      // Only (re)enter tracking from a clearly open eye to avoid false blinks.
      if (ear > this.openThreshold) this.state = 'open';
      return events;
    }

    if (this.state === 'open') {
      if (ear < this.closeThreshold) {
        this.state = 'closed';
        this.closedAt = t;
        this.sustainedReported = false;
      }
      return events;
    }

    // state === 'closed'
    const duration = t - this.closedAt;
    if (!this.sustainedReported && duration >= DEFAULTS.sustainedMs) {
      this.sustainedReported = true;
      events.push({ type: 'sustained', t });
    }
    if (ear > this.openThreshold) {
      this.state = 'open';
      if (duration < DEFAULTS.maxBlinkMs) events.push({ type: 'blink', t, durationMs: duration });
    }
    return events;
  }
}

/** Collects open-eye EAR samples and returns their median as a personal baseline. */
export class Calibrator {
  private samples: number[] = [];
  private coveredMs = 0;
  private lastT: number | null = null;

  reset(): void {
    this.samples = [];
    this.coveredMs = 0;
    this.lastT = null;
  }

  get progress(): number {
    return Math.min(1, this.coveredMs / DEFAULTS.calibrationMs);
  }

  /** Returns the baseline when done, 'invalid' if implausible, null while collecting. */
  add(ear: number | null, t: number): number | 'invalid' | null {
    if (ear === null) {
      this.lastT = null;
      return null;
    }
    if (this.lastT !== null) this.coveredMs += Math.min(t - this.lastT, DEFAULTS.maxFrameGapMs);
    this.lastT = t;
    this.samples.push(ear);
    if (this.coveredMs < DEFAULTS.calibrationMs || this.samples.length < DEFAULTS.calibrationMinSamples) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median < DEFAULTS.calibrationMinEar || median > DEFAULTS.calibrationMaxEar) return 'invalid';
    return median;
  }
}

interface FrameSample {
  t: number;
  face: boolean;
  closed: boolean;
}

/** Rolling-window statistics over processed frames and detected events. */
export class RollingEyeWindow {
  private frames: FrameSample[] = [];
  private events: BlinkEvent[] = [];
  constructor(private windowMs: number = DEFAULTS.windowMs) {}

  addFrame(sample: FrameSample): void {
    this.frames.push(sample);
    this.prune(sample.t);
  }

  addEvent(e: BlinkEvent): void {
    this.events.push(e);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
    while (this.events.length && this.events[0].t < cutoff) this.events.shift();
  }

  stats() {
    const n = this.frames.length;
    if (n === 0) {
      return { windowMs: 0, faceDetectedRatio: 0, blinkRatePerMin: null, closureRatio: null, sustainedClosures: 0 };
    }
    const windowMs = this.frames[n - 1].t - this.frames[0].t;
    let faceFrames = 0;
    let closedFrames = 0;
    let faceMs = 0;
    for (let i = 0; i < n; i++) {
      const f = this.frames[i];
      if (!f.face) continue;
      faceFrames++;
      if (f.closed) closedFrames++;
      if (i > 0) faceMs += Math.min(f.t - this.frames[i - 1].t, DEFAULTS.maxFrameGapMs);
    }
    const blinks = this.events.filter((e) => e.type === 'blink').length;
    return {
      windowMs,
      faceDetectedRatio: faceFrames / n,
      blinkRatePerMin: faceMs >= DEFAULTS.minRateCoverageMs ? blinks / (faceMs / 60_000) : null,
      closureRatio: faceFrames > 0 ? closedFrames / faceFrames : null,
      sustainedClosures: this.events.filter((e) => e.type === 'sustained').length,
    };
  }
}

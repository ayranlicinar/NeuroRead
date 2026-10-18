import { describe, expect, it } from 'vitest';
import { BlinkDetector, Calibrator, DEFAULTS, EYE_A, EYE_B, RollingEyeWindow, eyeAspectRatio, eyesInFrame, type Point2 } from '../src/utils/eyeMetrics';
import { EyeAnalyzer } from '../src/services/eyeAnalyzer';

/** Builds a 478-point landmark array with both eyes at a given vertical opening (normalized). */
function face(opening: number): Point2[] {
  const pts: Point2[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const eye = (idx: readonly number[], cx: number) => {
    const [p1, p2, p3, p4, p5, p6] = idx;
    pts[p1] = { x: cx - 0.05, y: 0.4 };
    pts[p4] = { x: cx + 0.05, y: 0.4 };
    pts[p2] = { x: cx - 0.02, y: 0.4 - opening / 2 };
    pts[p3] = { x: cx + 0.02, y: 0.4 - opening / 2 };
    pts[p6] = { x: cx - 0.02, y: 0.4 + opening / 2 };
    pts[p5] = { x: cx + 0.02, y: 0.4 + opening / 2 };
  };
  eye(EYE_A, 0.35);
  eye(EYE_B, 0.65);
  return pts;
}

describe('Eye Aspect Ratio', () => {
  it('computes EAR from the six eye landmarks with frame scaling', () => {
    // width 0.1 * 640 = 64px; opening 0.04 * 480 = 19.2px → EAR = (19.2 + 19.2) / (2 * 64) = 0.3
    expect(eyeAspectRatio(face(0.04), EYE_A, 640, 480)).toBeCloseTo(0.3, 5);
    expect(eyeAspectRatio(face(0), EYE_B, 640, 480)).toBeCloseTo(0, 5);
  });

  it('returns null for missing landmarks', () => {
    expect(eyeAspectRatio([], EYE_A, 640, 480)).toBeNull();
  });

  it('detects eye landmarks leaving the frame', () => {
    expect(eyesInFrame(face(0.04))).toBe(true);
    const out = face(0.04);
    out[EYE_A[0]] = { x: -0.1, y: 0.4 };
    expect(eyesInFrame(out)).toBe(false);
  });
});

describe('BlinkDetector', () => {
  const OPEN = 0.3;
  const CLOSED = 0.1;

  function run(detector: BlinkDetector, seq: [number | null, number][]) {
    return seq.flatMap(([ear, t]) => detector.update(ear, t));
  }

  it('detects a normal blink using time, not frame count', () => {
    const d = new BlinkDetector(0.3);
    const events = run(d, [
      [OPEN, 0],
      [OPEN, 50],
      [CLOSED, 100],
      [CLOSED, 150],
      [OPEN, 250],
    ]);
    expect(events).toEqual([{ type: 'blink', t: 250, durationMs: 150 }]);
  });

  it('reports a sustained closure once, and not as a blink', () => {
    const d = new BlinkDetector(0.3);
    const seq: [number, number][] = [[OPEN, 0]];
    for (let t = 50; t <= 1500; t += 50) seq.push([CLOSED, t]);
    seq.push([OPEN, 1550]);
    const events = run(d, seq);
    expect(events.filter((e) => e.type === 'sustained')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'blink')).toHaveLength(0);
  });

  it('ignores closures between blink and sustained durations', () => {
    const d = new BlinkDetector(0.3);
    const seq: [number, number][] = [[OPEN, 0]];
    for (let t = 50; t <= 750; t += 50) seq.push([CLOSED, t]);
    seq.push([OPEN, 800]);
    expect(run(d, seq)).toEqual([]);
  });

  it('uses hysteresis so values between thresholds do not toggle state', () => {
    const d = new BlinkDetector(0.3); // close < 0.21, open > 0.255
    const events = run(d, [
      [OPEN, 0],
      [0.22, 50],
      [0.24, 100],
      [0.22, 150],
      [OPEN, 200],
    ]);
    expect(events).toEqual([]);
    expect(d.eyeState).toBe('open');
  });

  it('does not count a blink when tracking is lost or frames stall', () => {
    const d = new BlinkDetector(0.3);
    expect(run(d, [[OPEN, 0], [CLOSED, 50], [null, 100], [OPEN, 150]])).toEqual([]);
    const d2 = new BlinkDetector(0.3);
    expect(run(d2, [[OPEN, 0], [CLOSED, 50], [OPEN, 50 + DEFAULTS.maxFrameGapMs + 100]])).toEqual([]);
  });

  it('requires an open eye before tracking starts', () => {
    const d = new BlinkDetector(0.3);
    expect(run(d, [[CLOSED, 0], [CLOSED, 50], [OPEN, 100]])).toEqual([]);
  });
});

describe('Calibrator', () => {
  it('returns the median open-eye EAR after enough face-visible time', () => {
    const c = new Calibrator();
    let result: number | 'invalid' | null = null;
    for (let t = 0; t <= 3100 && result === null; t += 50) result = c.add(t % 1000 === 0 ? 0.1 : 0.32, t);
    expect(result).toBeCloseTo(0.32, 5);
  });

  it('rejects implausible baselines', () => {
    const c = new Calibrator();
    let result: number | 'invalid' | null = null;
    for (let t = 0; t <= 3100 && result === null; t += 50) result = c.add(0.05, t);
    expect(result).toBe('invalid');
  });
});

describe('RollingEyeWindow', () => {
  it('computes ratios over the window and drops old data', () => {
    const w = new RollingEyeWindow(10_000);
    for (let t = 0; t <= 20_000; t += 100) w.addFrame({ t, face: true, closed: t >= 18_000 });
    const s = w.stats();
    expect(s.windowMs).toBe(10_000);
    expect(s.faceDetectedRatio).toBe(1);
    expect(s.closureRatio).toBeCloseTo(21 / 101, 3);
  });

  it('reports no blink rate until enough face-visible time is covered', () => {
    const w = new RollingEyeWindow();
    for (let t = 0; t <= 5_000; t += 100) w.addFrame({ t, face: true, closed: false });
    w.addEvent({ type: 'blink', t: 2_000, durationMs: 120 });
    expect(w.stats().blinkRatePerMin).toBeNull();
    for (let t = 5_100; t <= 30_000; t += 100) w.addFrame({ t, face: true, closed: false });
    expect(w.stats().blinkRatePerMin).toBeCloseTo(2, 1); // 1 blink in 30 s
  });
});

describe('EyeAnalyzer', () => {
  it('calibrates, counts blinks and reports camera-sourced metrics', () => {
    const a = new EyeAnalyzer();
    let t = 0;
    for (; t < 4000; t += 50) a.processFrame(face(0.04), 640, 480, t); // open eyes → calibration
    expect(a.snapshot().calibration).toBe('done');
    a.processFrame(face(0.005), 640, 480, (t += 50));
    a.processFrame(face(0.005), 640, 480, (t += 50));
    a.processFrame(face(0.04), 640, 480, (t += 50));
    const m = a.snapshot();
    expect(m.source).toBe('camera');
    expect(m.blinkCount).toBe(1);
    expect(m.faceDetected).toBe(true);
    expect(m.opennessRatio).toBeCloseTo(1, 2);
  });

  it('handles frames without a face', () => {
    const a = new EyeAnalyzer();
    a.processFrame(null, 640, 480, 0);
    const m = a.snapshot();
    expect(m.faceDetected).toBe(false);
    expect(m.ear).toBeNull();
    expect(m.eyeState).toBe('unknown');
  });
});

import { describe, expect, it } from 'vitest';
import type { AdaptationInput, EyeIndicators, Suggestion } from '../src/types';
import { RULES, evaluateAdaptation, pickAutoApply, previousValues } from '../src/utils/adaptation';
import { DEFAULT_SETTINGS } from '../src/utils/settings';
import { simulatedSignals } from '../src/services/demoSignals';

const MIN = 60_000;
const NOW = 10_000_000;

function input(overrides: Partial<AdaptationInput> = {}): AdaptationInput {
  return {
    now: NOW,
    sessionRunning: true,
    sessionActiveMs: 0,
    sessionSimulated: false,
    msSinceLastScroll: 0,
    interactionSimulated: false,
    textNeedsScrolling: true,
    settings: { ...DEFAULT_SETTINGS },
    manualOverrides: {},
    eye: null,
    useEyeSignals: true,
    rejected: {},
    accepted: [],
    ...overrides,
  };
}

const ids = (s: Suggestion[]) => s.map((x) => x.id);

const goodEye: EyeIndicators = { windowMs: 60_000, faceDetectedRatio: 0.9, blinkRatePerMin: 15, closureRatio: 0.03, sustainedClosures: 0 };

describe('adaptation engine', () => {
  it('suggests nothing for a fresh, normal session', () => {
    expect(evaluateAdaptation(input())).toEqual([]);
  });

  it('suggests a warm theme and a break after long sessions', () => {
    expect(ids(evaluateAdaptation(input({ sessionActiveMs: 21 * MIN })))).toContain('warm-theme');
    const long = ids(evaluateAdaptation(input({ sessionActiveMs: 45 * MIN })));
    expect(long).toContain('warm-theme');
    expect(long).toContain('take-break');
  });

  it('does not suggest the warm theme when it is already active', () => {
    const s = evaluateAdaptation(input({ sessionActiveMs: 30 * MIN, settings: { ...DEFAULT_SETTINGS, theme: 'warm' } }));
    expect(ids(s)).not.toContain('warm-theme');
  });

  it('suggests narrower paragraphs only when lines are wide', () => {
    expect(ids(evaluateAdaptation(input({ sessionActiveMs: 12 * MIN })))).not.toContain('reduce-width');
    const wide = evaluateAdaptation(input({ sessionActiveMs: 12 * MIN, settings: { ...DEFAULT_SETTINGS, paragraphWidth: 95 } }));
    const s = wide.find((x) => x.id === 'reduce-width');
    expect(s?.change).toEqual({ paragraphWidth: RULES.narrowTargetCh });
  });

  it('offers a summary after reduced scrolling, without inferring comprehension', () => {
    const s = evaluateAdaptation(input({ msSinceLastScroll: 4 * MIN }));
    const summary = s.find((x) => x.id === 'offer-summary');
    expect(summary).toBeDefined();
    expect(summary!.kind).toBe('summary');
    expect(summary!.change).toBeUndefined();
    expect(summary!.reason).toMatch(/dikkatli okuma da olabilir/);
    expect(summary!.reason).not.toMatch(/anlamadı|anlayamadı/);
  });

  it('does not offer a summary when paused, when text fits on screen, or with no scroll data', () => {
    expect(ids(evaluateAdaptation(input({ msSinceLastScroll: 4 * MIN, sessionRunning: false })))).not.toContain('offer-summary');
    expect(ids(evaluateAdaptation(input({ msSinceLastScroll: 4 * MIN, textNeedsScrolling: false })))).not.toContain('offer-summary');
    expect(ids(evaluateAdaptation(input({ msSinceLastScroll: null })))).not.toContain('offer-summary');
  });

  it('uses camera indicators only with enough data and when enabled', () => {
    const elevated: EyeIndicators = { ...goodEye, closureRatio: 0.25 };
    const camera = { source: 'camera' as const, indicators: elevated };
    const s = evaluateAdaptation(input({ eye: camera }));
    const lh = s.find((x) => x.id === 'increase-line-height');
    expect(lh?.evidence).toBe('camera');
    expect(lh?.simulated).toBe(false);
    expect(lh?.change?.lineHeight).toBeLessThanOrEqual(RULES.maxLineHeight);
    expect(lh?.reason).toMatch(/teşhisi değildir/);

    expect(ids(evaluateAdaptation(input({ eye: camera, useEyeSignals: false })))).not.toContain('increase-line-height');
    expect(ids(evaluateAdaptation(input({ eye: { source: 'camera', indicators: { ...elevated, windowMs: 10_000 } } })))).not.toContain(
      'increase-line-height',
    );
    expect(
      ids(evaluateAdaptation(input({ eye: { source: 'camera', indicators: { ...elevated, faceDetectedRatio: 0.3 } } }))),
    ).not.toContain('increase-line-height');
  });

  it('labels suggestions from demo data as simulated', () => {
    const demo = simulatedSignals('example-recommendation');
    const s = evaluateAdaptation(input({ eye: demo.eye }));
    const lh = s.find((x) => x.id === 'increase-line-height')!;
    expect(lh.simulated).toBe(true);
    expect(lh.evidence).toBe('simulated');
    expect(lh.reason).toMatch(/simüle/);

    const long = evaluateAdaptation(input({ sessionActiveMs: 45 * MIN, sessionSimulated: true }));
    expect(long.every((x) => x.simulated)).toBe(true);
  });

  it('normal demo scenario produces no suggestions', () => {
    const demo = simulatedSignals('normal');
    expect(evaluateAdaptation(input({ eye: demo.eye, msSinceLastScroll: demo.idleScrollMs, interactionSimulated: true }))).toEqual([]);
  });

  it('respects rejection cooldown and accepted suggestions', () => {
    const base = { sessionActiveMs: 25 * MIN };
    expect(ids(evaluateAdaptation(input({ ...base, rejected: { 'warm-theme': NOW - 5 * MIN } })))).not.toContain('warm-theme');
    expect(ids(evaluateAdaptation(input({ ...base, rejected: { 'warm-theme': NOW - RULES.rejectCooldownMs - 1 } })))).toContain('warm-theme');
    expect(ids(evaluateAdaptation(input({ ...base, accepted: ['warm-theme'] })))).not.toContain('warm-theme');
  });

  it('never exceeds the maximum number of suggestions', () => {
    const s = evaluateAdaptation(
      input({
        sessionActiveMs: 60 * MIN,
        msSinceLastScroll: 10 * MIN,
        settings: { ...DEFAULT_SETTINGS, paragraphWidth: 100 },
        eye: { source: 'camera', indicators: { ...goodEye, closureRatio: 0.4, blinkRatePerMin: 2 } },
      }),
    );
    expect(s.length).toBeLessThanOrEqual(RULES.maxSuggestions);
    expect(new Set(ids(s)).size).toBe(s.length);
  });
});

describe('manual preference overrides', () => {
  it('never suggests changing a setting the user changed manually', () => {
    const manual = { theme: NOW - 50 * MIN, lineHeight: NOW - 1000, paragraphWidth: NOW - 1000 };
    const s = evaluateAdaptation(
      input({
        sessionActiveMs: 30 * MIN,
        manualOverrides: manual,
        settings: { ...DEFAULT_SETTINGS, paragraphWidth: 95 },
        eye: { source: 'camera', indicators: { ...goodEye, closureRatio: 0.3 } },
      }),
    );
    expect(ids(s)).not.toContain('warm-theme');
    expect(ids(s)).not.toContain('increase-line-height');
    expect(ids(s)).not.toContain('reduce-width');
  });

  it('still allows suggestions for settings that were not overridden', () => {
    const s = evaluateAdaptation(input({ sessionActiveMs: 30 * MIN, manualOverrides: { fontSize: NOW } }));
    expect(ids(s)).toContain('warm-theme');
  });
});

describe('automatic adaptation', () => {
  const settingSuggestion: Suggestion = {
    id: 'warm-theme',
    title: 't',
    reason: 'r',
    actionLabel: 'a',
    change: { theme: 'warm' },
    kind: 'setting',
    evidence: 'session',
    simulated: false,
  };
  const summary: Suggestion = { ...settingSuggestion, id: 'offer-summary', kind: 'summary', change: undefined };
  const info: Suggestion = { ...settingSuggestion, id: 'take-break', kind: 'info', change: undefined };

  it('never auto-applies summaries or informational suggestions', () => {
    expect(pickAutoApply([summary, info], null, NOW)).toBeNull();
  });

  it('applies at most one change per interval', () => {
    expect(pickAutoApply([summary, settingSuggestion], null, NOW)).toBe(settingSuggestion);
    expect(pickAutoApply([settingSuggestion], NOW - 60_000, NOW)).toBeNull();
    expect(pickAutoApply([settingSuggestion], NOW - RULES.autoApplyIntervalMs, NOW)).toBe(settingSuggestion);
  });

  it('records previous values so every change can be undone', () => {
    expect(previousValues(DEFAULT_SETTINGS, { theme: 'warm', lineHeight: 2 })).toEqual({
      theme: DEFAULT_SETTINGS.theme,
      lineHeight: DEFAULT_SETTINGS.lineHeight,
    });
  });
});

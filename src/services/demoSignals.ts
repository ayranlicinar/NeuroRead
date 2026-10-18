// Explicit, clearly-labelled simulated values for demo mode.
// These are never produced by, or mixed into, real camera measurements.
import type { DemoScenario, EyeIndicators, SimulatedSignals } from '../types';

const MIN = 60_000;

const NORMAL_EYE: EyeIndicators = {
  windowMs: 60_000,
  faceDetectedRatio: 0.95,
  blinkRatePerMin: 14,
  closureRatio: 0.04,
  sustainedClosures: 0,
};

export function simulatedSignals(scenario: DemoScenario): SimulatedSignals {
  switch (scenario) {
    case 'normal':
      return {
        source: 'simulated',
        scenario,
        extraSessionMs: 0,
        idleScrollMs: 20_000,
        eye: { source: 'simulated', scenario, indicators: NORMAL_EYE },
      };
    case 'reduced-scroll':
      return {
        source: 'simulated',
        scenario,
        extraSessionMs: 0,
        idleScrollMs: 4 * MIN,
        eye: { source: 'simulated', scenario, indicators: NORMAL_EYE },
      };
    case 'long-session':
      return {
        source: 'simulated',
        scenario,
        extraSessionMs: 45 * MIN,
        idleScrollMs: 30_000,
        eye: { source: 'simulated', scenario, indicators: NORMAL_EYE },
      };
    case 'example-recommendation':
      return {
        source: 'simulated',
        scenario,
        extraSessionMs: 0,
        idleScrollMs: 30_000,
        eye: {
          source: 'simulated',
          scenario,
          indicators: { ...NORMAL_EYE, closureRatio: 0.22, sustainedClosures: 3, blinkRatePerMin: 9 },
        },
      };
  }
}

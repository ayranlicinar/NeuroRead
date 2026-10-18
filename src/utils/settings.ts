import type { ReadingSettings } from '../types';

export const DEFAULT_SETTINGS: ReadingSettings = {
  fontSize: 19,
  lineHeight: 1.7,
  paragraphWidth: 68,
  theme: 'light',
  fontFamily: 'serif',
  bionic: false,
  bionicRatio: 0.4,
};

export const LIMITS = {
  fontSize: { min: 14, max: 30, step: 1 },
  lineHeight: { min: 1.3, max: 2.4, step: 0.1 },
  paragraphWidth: { min: 45, max: 100, step: 1 },
  bionicRatio: { min: 0.2, max: 0.7, step: 0.05 },
} as const;

const STORAGE_KEY = 'neuroread.preferences.v1';

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** Validates untrusted (stored) data into complete settings. */
export function sanitizeSettings(raw: unknown): ReadingSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    fontSize: clamp(r.fontSize, LIMITS.fontSize.min, LIMITS.fontSize.max, d.fontSize),
    lineHeight: clamp(r.lineHeight, LIMITS.lineHeight.min, LIMITS.lineHeight.max, d.lineHeight),
    paragraphWidth: clamp(r.paragraphWidth, LIMITS.paragraphWidth.min, LIMITS.paragraphWidth.max, d.paragraphWidth),
    theme: r.theme === 'light' || r.theme === 'warm' || r.theme === 'dark' ? r.theme : d.theme,
    fontFamily: r.fontFamily === 'sans' || r.fontFamily === 'serif' ? r.fontFamily : d.fontFamily,
    bionic: typeof r.bionic === 'boolean' ? r.bionic : d.bionic,
    bionicRatio: clamp(r.bionicRatio, LIMITS.bionicRatio.min, LIMITS.bionicRatio.max, d.bionicRatio),
  };
}

/** Only typography preferences are ever stored — never text, camera or biometric data. */
export function loadStoredSettings(): ReadingSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function storeSettings(settings: ReadingSettings | null): void {
  try {
    if (settings) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode) — preferences simply aren't remembered */
  }
}

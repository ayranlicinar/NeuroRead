// Small, transparent, rule-based adaptation engine.
// It only *suggests*. It never infers comprehension and never claims to detect
// fatigue; each rule states the observable trigger in its reason text.
import type {
  AdaptationInput,
  EvidenceSource,
  ReadingSettings,
  SettingKey,
  Suggestion,
  SuggestionId,
} from '../types';

const MIN = 60_000;

export const RULES = {
  /** active reading time after which a warmer theme is suggested */
  warmThemeAfterMs: 20 * MIN,
  /** active reading time after which a short break is suggested */
  breakAfterMs: 40 * MIN,
  /** active reading time after which narrower lines are suggested (if wide) */
  narrowAfterMs: 10 * MIN,
  /** paragraph width (ch) considered wide */
  wideParagraphCh: 75,
  narrowTargetCh: 66,
  /** no scrolling for this long while a session runs → offer summary */
  idleScrollMs: 3 * MIN,
  /** a rejected suggestion is not shown again for this long */
  rejectCooldownMs: 15 * MIN,
  /** minimum interval between two automatic changes */
  autoApplyIntervalMs: 5 * MIN,
  /** eye indicators are used only with this much data… */
  eyeMinWindowMs: 30_000,
  /** …and when a face was visible in at least this share of frames */
  eyeMinFaceRatio: 0.6,
  /** simple (non-PERCLOS) closed-frame share considered elevated */
  closureRatioHigh: 0.15,
  /** ≥ this many ≥1 s closures within the window */
  sustainedClosuresHigh: 2,
  /** blinks/min below this (screen reading often lowers blink rate) */
  lowBlinkRate: 6,
  maxLineHeight: 2.2,
  lineHeightTarget: 1.9,
  maxSuggestions: 3,
} as const;

function isBlocked(input: AdaptationInput, id: SuggestionId): boolean {
  if (input.accepted.includes(id)) return true;
  const rejectedAt = input.rejected[id];
  return rejectedAt !== undefined && input.now - rejectedAt < RULES.rejectCooldownMs;
}

/** Manual settings win: once the user changes a setting by hand in this session, it is never auto-suggested. */
function isManual(input: AdaptationInput, keys: SettingKey[]): boolean {
  return keys.some((k) => input.manualOverrides[k] !== undefined);
}

function usableEye(input: AdaptationInput) {
  if (!input.useEyeSignals || !input.eye) return null;
  const ind = input.eye.indicators;
  if (ind.windowMs < RULES.eyeMinWindowMs || ind.faceDetectedRatio < RULES.eyeMinFaceRatio) return null;
  return { signal: input.eye, ind };
}

function minutes(ms: number): number {
  return Math.round(ms / MIN);
}

export function evaluateAdaptation(input: AdaptationInput): Suggestion[] {
  const out: Suggestion[] = [];
  const { settings } = input;
  const add = (s: Suggestion) => {
    if (!isBlocked(input, s.id) && !out.some((o) => o.id === s.id)) out.push(s);
  };
  const sessionEvidence: EvidenceSource = input.sessionSimulated ? 'simulated' : 'session';
  const simTag = (simulated: boolean) => (simulated ? ' (simüle demo verisi)' : '');

  // Eye-indicator rules (real camera or clearly simulated demo data).
  const eye = usableEye(input);
  if (eye) {
    const simulated = eye.signal.source === 'simulated';
    const evidence: EvidenceSource = simulated ? 'simulated' : 'camera';
    const closureHigh = eye.ind.closureRatio !== null && eye.ind.closureRatio >= RULES.closureRatioHigh;
    const longClosures = eye.ind.sustainedClosures >= RULES.sustainedClosuresHigh;

    if ((closureHigh || longClosures) && settings.lineHeight < RULES.lineHeightTarget && !isManual(input, ['lineHeight'])) {
      const detail = closureHigh
        ? `son ölçüm penceresinde gözlerin kapalı göründüğü kare oranı %${Math.round((eye.ind.closureRatio ?? 0) * 100)}`
        : `son ölçüm penceresinde ${eye.ind.sustainedClosures} kez 1 saniyeden uzun göz kapanması`;
      add({
        id: 'increase-line-height',
        title: 'Satır aralığını artırmayı deneyin',
        reason: `Basit bir göz göstergesine göre ${detail}${simTag(simulated)}. Bu bir yorgunluk teşhisi değildir; daha ferah satırlar takip etmeyi kolaylaştırabilir.`,
        actionLabel: `Satır aralığını ${RULES.lineHeightTarget} yap`,
        change: { lineHeight: Math.min(RULES.maxLineHeight, RULES.lineHeightTarget) },
        kind: 'setting',
        evidence,
        simulated,
      });
    }
    if (eye.ind.blinkRatePerMin !== null && eye.ind.blinkRatePerMin < RULES.lowBlinkRate) {
      add({
        id: 'take-break',
        title: 'Gözlerinizi kısa süre dinlendirin',
        reason: `Tahmini göz kırpma sıklığı dakikada yaklaşık ${Math.round(eye.ind.blinkRatePerMin)}${simTag(simulated)}. Ekranda okurken kırpma sıklığının azalması yaygındır; birkaç saniye uzağa bakmak iyi gelebilir.`,
        actionLabel: 'Anladım',
        kind: 'info',
        evidence,
        simulated,
      });
    }
  }

  // Session-duration rules.
  if (input.sessionActiveMs >= RULES.warmThemeAfterMs && settings.theme !== 'warm' && !isManual(input, ['theme'])) {
    add({
      id: 'warm-theme',
      title: 'Sıcak temayı deneyin',
      reason: `Yaklaşık ${minutes(input.sessionActiveMs)} dakikadır aktif okuma oturumundasınız${simTag(input.sessionSimulated)}. Bazı okurlar uzun oturumlarda daha sıcak tonları daha rahat bulur.`,
      actionLabel: 'Sıcak temaya geç',
      change: { theme: 'warm' },
      kind: 'setting',
      evidence: sessionEvidence,
      simulated: input.sessionSimulated,
    });
  }

  if (
    input.sessionActiveMs >= RULES.narrowAfterMs &&
    settings.paragraphWidth > RULES.wideParagraphCh &&
    !isManual(input, ['paragraphWidth'])
  ) {
    add({
      id: 'reduce-width',
      title: 'Paragraf yoğunluğunu azaltın',
      reason: `Satır genişliği ${settings.paragraphWidth} karakter. Çok uzun satırlarda bir sonraki satırın başını bulmak zorlaşabilir; daha dar bir sütun deneyebilirsiniz.`,
      actionLabel: `Genişliği ${RULES.narrowTargetCh} karaktere indir`,
      change: { paragraphWidth: RULES.narrowTargetCh },
      kind: 'setting',
      evidence: sessionEvidence,
      simulated: input.sessionSimulated,
    });
  }

  if (input.sessionActiveMs >= RULES.breakAfterMs) {
    add({
      id: 'take-break',
      title: 'Kısa bir ara verin',
      reason: `Yaklaşık ${minutes(input.sessionActiveMs)} dakikadır kesintisiz okuyorsunuz${simTag(input.sessionSimulated)}. Kısa bir mola okumaya daha rahat dönmenize yardımcı olabilir.`,
      actionLabel: 'Anladım',
      kind: 'info',
      evidence: sessionEvidence,
      simulated: input.sessionSimulated,
    });
  }

  // Interaction rule. Lack of scrolling may simply mean careful reading;
  // it is never treated as a sign of (non-)comprehension.
  if (
    input.sessionRunning &&
    input.textNeedsScrolling &&
    input.msSinceLastScroll !== null &&
    input.msSinceLastScroll >= RULES.idleScrollMs
  ) {
    add({
      id: 'offer-summary',
      title: 'Bu bölümün özetini ister misiniz?',
      reason: `Yaklaşık ${minutes(input.msSinceLastScroll)} dakikadır kaydırma yapılmadı${simTag(input.interactionSimulated)}. Bu dikkatli okuma da olabilir; isterseniz yapay zekâ asistanıyla bir özet hazırlayabilirsiniz. Metin yalnızca siz “Gönder”e bastığınızda gönderilir.`,
      actionLabel: 'Asistanı aç',
      kind: 'summary',
      evidence: input.interactionSimulated ? 'simulated' : 'interaction',
      simulated: input.interactionSimulated,
    });
  }

  return out.slice(0, RULES.maxSuggestions);
}

/**
 * With automatic adaptation enabled, picks at most one setting change to apply,
 * no more often than `autoApplyIntervalMs`. Summary/info suggestions are never auto-applied.
 */
export function pickAutoApply(
  suggestions: Suggestion[],
  lastAutoApplyAt: number | null,
  now: number,
): Suggestion | null {
  if (lastAutoApplyAt !== null && now - lastAutoApplyAt < RULES.autoApplyIntervalMs) return null;
  return suggestions.find((s) => s.kind === 'setting' && s.change) ?? null;
}

/** Returns the previous values of the keys a change would modify (for undo). */
export function previousValues(settings: ReadingSettings, change: Partial<ReadingSettings>): Partial<ReadingSettings> {
  const prev: Partial<ReadingSettings> = {};
  for (const key of Object.keys(change) as SettingKey[]) {
    (prev as Record<SettingKey, unknown>)[key] = settings[key];
  }
  return prev;
}

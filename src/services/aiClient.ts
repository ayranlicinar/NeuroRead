// Talks only to our own backend (/api). The browser never contacts Kedy and
// never sees the API key. Only reading text and an optional question are sent.
import type { AiAction, AiResult } from '../types';

export { MAX_QUESTION_CHARS, MAX_TEXT_CHARS } from '../../shared/aiContract';
const CLIENT_TIMEOUT_MS = 75_000;

export interface AiRequest {
  action: AiAction;
  text: string;
  question?: string;
}

export interface HealthInfo {
  ok: boolean;
  aiConfigured: boolean;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthInfo | null> {
  try {
    const res = await fetch('/api/health', { signal });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'aiConfigured' in data) {
      return { ok: true, aiConfigured: Boolean((data as { aiConfigured: unknown }).aiConfigured) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function requestAi(req: AiRequest, externalSignal?: AbortSignal): Promise<AiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), CLIENT_TIMEOUT_MS);
  const onAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', onAbort);

  const body: AiRequest = { action: req.action, text: req.text };
  if (req.action === 'ask') body.question = req.question;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON (e.g. backend not running behind the dev proxy) */
    }
    if (res.ok && data && typeof data === 'object' && (data as { ok?: unknown }).ok === true) {
      const content = (data as { content?: unknown }).content;
      if (typeof content === 'string' && content.trim()) return { ok: true, content };
      return { ok: false, code: 'MALFORMED_RESPONSE', message: 'Sunucudan beklenmeyen bir yanıt alındı.' };
    }
    const err = (data as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    if (err && typeof err.code === 'string' && typeof err.message === 'string') {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: 'BACKEND_UNAVAILABLE',
      message: 'NeuroRead sunucusuna ulaşılamadı. “npm run dev” komutuyla hem arayüzün hem sunucunun çalıştığından emin olun.',
    };
  } catch {
    if (externalSignal?.aborted) return { ok: false, code: 'CANCELLED', message: 'İstek iptal edildi.' };
    if (controller.signal.aborted) {
      return { ok: false, code: 'CLIENT_TIMEOUT', message: 'Yanıt çok uzun sürdü. Lütfen daha kısa bir metinle tekrar deneyin.' };
    }
    return {
      ok: false,
      code: 'BACKEND_UNAVAILABLE',
      message: 'NeuroRead sunucusuna bağlanılamadı. Sunucunun çalıştığını ve ağ bağlantınızı kontrol edin.',
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

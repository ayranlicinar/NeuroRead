import { Router, type Request, type Response } from 'express';
import { AI_ACTION_IDS, MAX_QUESTION_CHARS, MAX_TEXT_CHARS, type AiActionId } from '../../shared/aiContract';
import { callKedy, KedyError, type KedyErrorCode } from '../services/kedyClient';
import { buildMessages } from '../services/prompts';

export interface ChatRouteDeps {
  getApiKey: () => string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ValidChatRequest {
  action: AiActionId;
  text: string;
  question?: string;
}

const ALLOWED_KEYS = new Set(['action', 'text', 'question']);

/** Strict validation. Unknown fields are rejected so nothing else (e.g. camera data) can be forwarded. */
export function validateChatRequest(body: unknown): { ok: true; value: ValidChatRequest } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'İstek gövdesi bir JSON nesnesi olmalıdır.' };
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length) return { ok: false, message: 'İstekte izin verilmeyen alanlar var.' };
  if (typeof b.action !== 'string' || !(AI_ACTION_IDS as readonly string[]).includes(b.action)) {
    return { ok: false, message: 'Geçersiz işlem türü.' };
  }
  if (typeof b.text !== 'string' || !b.text.trim()) return { ok: false, message: 'Gönderilecek metin boş olamaz.' };
  if (b.text.length > MAX_TEXT_CHARS) {
    return { ok: false, message: `Metin en fazla ${MAX_TEXT_CHARS.toLocaleString('tr-TR')} karakter olabilir.` };
  }
  const action = b.action as AiActionId;
  if (action === 'ask') {
    if (typeof b.question !== 'string' || !b.question.trim()) return { ok: false, message: 'Lütfen bir soru yazın.' };
    if (b.question.length > MAX_QUESTION_CHARS) {
      return { ok: false, message: `Soru en fazla ${MAX_QUESTION_CHARS} karakter olabilir.` };
    }
    return { ok: true, value: { action, text: b.text, question: b.question.trim() } };
  }
  if (b.question !== undefined) return { ok: false, message: 'Soru alanı yalnızca “Soru sor” işleminde kullanılabilir.' };
  return { ok: true, value: { action, text: b.text } };
}

const ERRORS: Record<KedyErrorCode, { status: number; message: string }> = {
  MISSING_API_KEY: {
    status: 503,
    message:
      'Yapay zekâ özelliği yapılandırılmamış. Proje klasöründe .env.example dosyasını .env olarak kopyalayın, KEDY_API_KEY değerine kendi anahtarınızı yazın ve sunucuyu yeniden başlatın. Okuma özellikleri anahtar olmadan da çalışır.',
  },
  INVALID_API_KEY: {
    status: 502,
    message: 'Kedy API anahtarı reddedildi. .env dosyasındaki KEDY_API_KEY değerini kontrol edip sunucuyu yeniden başlatın.',
  },
  RATE_LIMITED: { status: 429, message: 'Kedy istek sınırına ulaşıldı. Lütfen biraz bekleyip tekrar deneyin.' },
  UPSTREAM_REJECTED: { status: 502, message: 'Kedy isteği kabul etmedi. Metni kısaltıp tekrar deneyin.' },
  UPSTREAM_ERROR: { status: 502, message: 'Kedy hizmetinde geçici bir sorun var. Lütfen daha sonra tekrar deneyin.' },
  UPSTREAM_TIMEOUT: { status: 504, message: 'Kedy zamanında yanıt vermedi. Daha kısa bir metinle tekrar deneyin.' },
  UPSTREAM_UNREACHABLE: { status: 502, message: 'Kedy hizmetine ulaşılamadı. İnternet bağlantınızı kontrol edin.' },
  MALFORMED_RESPONSE: { status: 502, message: 'Kedy’den beklenmeyen biçimde bir yanıt geldi; sonuç gösterilemiyor.' },
};

export function createChatRouter(deps: ChatRouteDeps): Router {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response) => {
    const started = Date.now();
    const validation = validateChatRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_REQUEST', message: validation.message } });
      return;
    }
    const { action, text, question } = validation.value;
    try {
      const content = await callKedy({
        apiKey: deps.getApiKey(),
        messages: buildMessages(action, text, question),
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.timeoutMs,
      });
      // Log metadata only — never the text, question, answer or key.
      console.info(`[api/chat] action=${action} chars=${text.length} status=200 ms=${Date.now() - started}`);
      res.json({ ok: true, content });
    } catch (err) {
      const code: KedyErrorCode = err instanceof KedyError ? err.code : 'UPSTREAM_ERROR';
      const { status, message } = ERRORS[code];
      console.warn(`[api/chat] action=${action} error=${code} status=${status} ms=${Date.now() - started}`);
      if (err instanceof KedyError && err.retryAfterSeconds !== undefined) res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.status(status).json({ ok: false, error: { code, message } });
    }
  });

  return router;
}

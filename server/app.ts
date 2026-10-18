import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createChatRouter, type ChatRouteDeps } from './routes/chat';

export interface AppOptions extends ChatRouteDeps {
  /** Folder with the built frontend; served when it exists (production). */
  staticDir?: string | null;
  /** Requests per minute per client for /api/chat. */
  rateLimitPerMinute?: number;
}

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
}

/** Small in-memory fixed-window limiter; protects the paid upstream from accidental loops. */
function rateLimit(limit: number) {
  const hits = new Map<string, { windowStart: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart >= 60_000) {
      hits.set(key, { windowStart: now, count: 1 });
      if (hits.size > 10_000) hits.clear();
      return next();
    }
    entry.count++;
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.windowStart + 60_000 - now) / 1000)));
      res.status(429).json({ ok: false, error: { code: 'LOCAL_RATE_LIMIT', message: 'Çok fazla istek gönderildi. Lütfen bir dakika bekleyin.' } });
      return;
    }
    next();
  };
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);

  const api = express.Router();
  api.use(express.json({ limit: '100kb', strict: true }));
  api.get('/health', (_req, res) => {
    // Reports only whether a key is configured — never the key itself.
    res.json({ ok: true, aiConfigured: options.getApiKey() !== null });
  });
  api.use('/chat', rateLimit(options.rateLimitPerMinute ?? 20));
  api.use(createChatRouter(options));
  api.use((_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } });
  });
  // JSON parse errors, oversize bodies and anything unexpected → predictable JSON.
  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (err as { type?: string } | null)?.type;
    if (type === 'entity.too.large') {
      res.status(413).json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'İstek çok büyük. Daha kısa bir metin gönderin.' } });
      return;
    }
    if (type === 'entity.parse.failed') {
      res.status(400).json({ ok: false, error: { code: 'INVALID_JSON', message: 'İstek gövdesi geçerli JSON değil.' } });
      return;
    }
    console.error('[api] beklenmeyen hata');
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Sunucuda beklenmeyen bir hata oluştu.' } });
  });
  app.use('/api', api);

  const staticDir = options.staticDir === undefined ? resolve(process.cwd(), 'dist') : options.staticDir;
  if (staticDir && existsSync(resolve(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: 'index.html', maxAge: '1h' }));
    app.get(/.*/, (_req, res) => res.sendFile(resolve(staticDir, 'index.html')));
  }

  return app;
}

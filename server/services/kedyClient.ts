// Minimal Kedy NOVAQ client (OpenAI-compatible chat completions).
// No retries, bounded timeout, bounded response size, and errors that never
// contain the API key or the user's text.
import type { ChatMessage } from './prompts';

export const KEDY_ENDPOINT = 'https://api.kedy.dev/v1/chat/completions';
export const KEDY_MODEL = 'novaq';
export const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RESPONSE_BYTES = 2_000_000;

export type KedyErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'UPSTREAM_REJECTED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNREACHABLE'
  | 'MALFORMED_RESPONSE';

export class KedyError extends Error {
  constructor(
    public readonly code: KedyErrorCode,
    public readonly upstreamStatus?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'KedyError';
  }
}

export interface KedyCallOptions {
  apiKey: string | null;
  messages: ChatMessage[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Extracts assistant text from an OpenAI-compatible response, or null if malformed. */
export function extractContent(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown } | null)?.message;
  if (!message || typeof message !== 'object') return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content.trim() ? content : null;
  if (Array.isArray(content)) {
    // Some compatible APIs return content parts: [{ type: 'text', text: '…' }]
    const text = content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('');
    return text.trim() ? text : null;
  }
  return null;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 3600) : undefined;
}

export async function callKedy({ apiKey, messages, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: KedyCallOptions): Promise<string> {
  if (!apiKey) throw new KedyError('MISSING_API_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(KEDY_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: KEDY_MODEL, messages }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new KedyError(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE');
  }

  let raw: string;
  try {
    raw = await res.text();
  } catch {
    throw new KedyError(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE', res.status);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new KedyError('INVALID_API_KEY', res.status);
    if (res.status === 429) throw new KedyError('RATE_LIMITED', 429, parseRetryAfter(res.headers.get('retry-after')));
    if (res.status === 408 || res.status === 504) throw new KedyError('UPSTREAM_TIMEOUT', res.status);
    if (res.status >= 500) throw new KedyError('UPSTREAM_ERROR', res.status);
    throw new KedyError('UPSTREAM_REJECTED', res.status);
  }

  if (raw.length > MAX_RESPONSE_BYTES) throw new KedyError('MALFORMED_RESPONSE', res.status);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new KedyError('MALFORMED_RESPONSE', res.status);
  }
  const content = extractContent(data);
  if (content === null) throw new KedyError('MALFORMED_RESPONSE', res.status);
  return content;
}

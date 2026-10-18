import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Loads .env from the project root (Node ≥ 20.12 built-in). Missing file is fine. */
export function loadEnvFile(path = resolve(process.cwd(), '.env')): void {
  if (!existsSync(path)) return;
  try {
    process.loadEnvFile(path);
  } catch {
    console.warn('[config] .env okunamadı; ortam değişkenleri kullanılacak.');
  }
}

const PLACEHOLDER = 'your_kedy_api_key_here';

/** Returns the configured key, or null if missing/placeholder. Never log the return value. */
export function getKedyApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.KEDY_API_KEY?.trim();
  if (!key || key === PLACEHOLDER) return null;
  return key;
}

export function getPort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 3001;
}

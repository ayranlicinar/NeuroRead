// Static checks over the frontend source (and the production bundle, if built).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function files(dir: string, exts: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p, exts) : exts.test(name) ? [p] : [];
  });
}

const frontend = files(join(root, 'src'), /\.(ts|tsx|css)$/).map((p) => ({ path: relative(root, p), code: readFileSync(p, 'utf8') }));

describe('frontend source', () => {
  it('never reads the Kedy API key, contacts the Kedy host or uses VITE_ variables', () => {
    for (const f of frontend) {
      // The variable *name* may appear in setup instructions, but no code may read it.
      expect(f.code, f.path).not.toMatch(/process\.env|import\.meta\.env\.(?!BASE_URL)|api\.kedy\.dev|VITE_|Authorization|Bearer /);
    }
  });

  it('never uses dangerouslySetInnerHTML or innerHTML', () => {
    for (const f of frontend) expect(f.code, f.path).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });

  it('only touches navigator.mediaDevices from the camera service', () => {
    const callers = frontend.filter((f) => /mediaDevices\.getUserMedia\(/.test(f.code)).map((f) => f.path.replace(/\\/g, '/'));
    expect(callers).toEqual(['src/services/browserCamera.ts']);
    // …and the session only invokes it from start(), never from the constructor.
    const session = readFileSync(join(root, 'src/services/cameraSession.ts'), 'utf8');
    const ctor = session.slice(session.indexOf('constructor(private'), session.indexOf('get isRunning'));
    expect(ctor).not.toMatch(/getUserMedia/);
  });

  it('only sends network requests to its own /api backend (plus the public model file)', () => {
    for (const f of frontend) {
      for (const m of f.code.matchAll(/fetch\(([^,)]+)/g)) {
        expect(['url', "'/api/chat'", "'/api/health'"], `${f.path}: ${m[0]}`).toContain(m[1].trim());
      }
    }
  });

  it('does not put camera data into AI requests', () => {
    const client = readFileSync(join(root, 'src/services/aiClient.ts'), 'utf8');
    expect(client).not.toMatch(/camera|metrics|landmark|blink/i);
  });

  it('does not persist anything besides typography preferences', () => {
    const users = frontend.filter((f) => /localStorage|sessionStorage|indexedDB/.test(f.code)).map((f) => f.path.replace(/\\/g, '/'));
    expect(users).toEqual(['src/utils/settings.ts']);
  });
});

describe('production bundle (if built)', () => {
  const dist = join(root, 'dist');
  const bundle = files(dist, /\.(js|html|css)$/).filter((p) => !p.includes('mediapipe'));

  // The real key from a local .env (if present) must never end up in the bundle.
  const envPath = join(root, '.env');
  const localKey = existsSync(envPath) ? /^KEDY_API_KEY=(.+)$/m.exec(readFileSync(envPath, 'utf8'))?.[1]?.trim() : undefined;

  it.skipIf(bundle.length === 0)('contains no Kedy host, auth header or real key value', () => {
    for (const p of bundle) {
      const code = readFileSync(p, 'utf8');
      expect(code, p).not.toMatch(/api\.kedy\.dev|Bearer /);
      if (localKey && localKey !== 'your_kedy_api_key_here') expect(code.includes(localKey), p).toBe(false);
    }
  });
});

describe('repository hygiene', () => {
  it('.gitignore excludes env files but keeps the example', () => {
    const gi = readFileSync(join(root, '.gitignore'), 'utf8');
    for (const line of ['.env', '.env.*', '!.env.example', 'node_modules/', 'dist/', 'coverage/', 'logs/']) {
      expect(gi.split(/\r?\n/)).toContain(line);
    }
    expect(readFileSync(join(root, '.env.example'), 'utf8')).toMatch(/KEDY_API_KEY=your_kedy_api_key_here/);
  });
});

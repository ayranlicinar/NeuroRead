// Copies MediaPipe Tasks Vision WASM files into public/ and downloads the
// Face Landmarker model so the camera feature can run fully from local files.
// This script never fails the install: camera analysis is optional.
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = join(root, 'public', 'mediapipe', 'wasm');
const modelDir = join(root, 'public', 'models');
const modelPath = join(modelDir, 'face_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

function copyWasm() {
  if (!existsSync(wasmSrc)) {
    console.warn('[mediapipe] node_modules/@mediapipe/tasks-vision/wasm bulunamadı; atlandı.');
    return;
  }
  mkdirSync(wasmDest, { recursive: true });
  const files = readdirSync(wasmSrc);
  for (const file of files) copyFileSync(join(wasmSrc, file), join(wasmDest, file));
  console.log(`[mediapipe] ${files.length} WASM dosyası public/mediapipe/wasm içine kopyalandı.`);
}

async function downloadModel() {
  if (existsSync(modelPath) && statSync(modelPath).size > 1_000_000) {
    console.log('[mediapipe] Model zaten mevcut: public/models/face_landmarker.task');
    return;
  }
  mkdirSync(modelDir, { recursive: true });
  try {
    const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1_000_000) throw new Error('Beklenenden küçük dosya');
    writeFileSync(modelPath, buf);
    console.log(`[mediapipe] Model indirildi (${(buf.length / 1e6).toFixed(1)} MB).`);
  } catch (err) {
    console.warn(
      `[mediapipe] Model indirilemedi (${err instanceof Error ? err.message : err}). ` +
        'Uygulama çalışma anında modeli Google depolamasından yüklemeyi deneyecek. ' +
        'Daha sonra "npm run prepare:mediapipe" ile tekrar deneyebilirsiniz.',
    );
  }
}

try {
  copyWasm();
  await downloadModel();
} catch (err) {
  console.warn('[mediapipe] Hazırlık adımı atlandı:', err instanceof Error ? err.message : err);
}

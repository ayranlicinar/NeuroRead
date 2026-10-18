// Browser implementations of CameraSessionDeps. MediaPipe is imported lazily so
// it is only downloaded after the user explicitly enables the camera.
import type { CameraErrorCode } from '../types';
import type { CameraSessionDeps, LandmarkerLike, VideoLike } from './cameraSession';

const BASE = import.meta.env.BASE_URL;
const WASM_PATH = `${BASE}mediapipe/wasm`;
const LOCAL_MODEL = `${BASE}models/face_landmarker.task`;
/** Official MediaPipe model file; used only if the local copy is missing. */
export const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Returns a reason the camera cannot work in this browser, or null. */
export function cameraSupportProblem(): CameraErrorCode | null {
  if (typeof window === 'undefined') return 'UNSUPPORTED';
  if (!window.isSecureContext) return 'INSECURE_CONTEXT';
  if (!navigator.mediaDevices?.getUserMedia) return 'UNSUPPORTED';
  if (typeof WebAssembly === 'undefined') return 'UNSUPPORTED';
  return null;
}

async function fetchModel(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  const type = res.headers.get('content-type') ?? '';
  // A dev server may answer a missing file with index.html — reject that.
  if (!res.ok || type.includes('text/html')) throw new Error(`model unavailable: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 100_000) throw new Error('model too small');
  return buf;
}

async function loadModelBytes(): Promise<Uint8Array> {
  try {
    return await fetchModel(LOCAL_MODEL);
  } catch {
    return await fetchModel(REMOTE_MODEL);
  }
}

async function createLandmarker(): Promise<LandmarkerLike> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const [fileset, model] = await Promise.all([FilesetResolver.forVisionTasks(WASM_PATH), loadModelBytes()]);
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  let landmarker;
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, options('GPU'));
  } catch {
    // GPU delegate is not available everywhere; CPU is slower but broadly supported.
    landmarker = await FaceLandmarker.createFromOptions(fileset, options('CPU'));
  }
  return landmarker as unknown as LandmarkerLike;
}

let brightnessCanvas: HTMLCanvasElement | null = null;

/** Mean luma of a 32×24 downsampled frame. The pixels never leave this function. */
function measureBrightness(video: VideoLike): number | null {
  try {
    brightnessCanvas ??= document.createElement('canvas');
    brightnessCanvas.width = 32;
    brightnessCanvas.height = 24;
    const ctx = brightnessCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video as HTMLVideoElement, 0, 0, 32, 24);
    const { data } = ctx.getImageData(0, 0, 32, 24);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    ctx.clearRect(0, 0, 32, 24);
    return sum / (data.length / 4);
  } catch {
    return null;
  }
}

export function createBrowserCameraDeps(): CameraSessionDeps {
  return {
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    createLandmarker,
    requestFrame: (cb) => window.requestAnimationFrame(cb),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    now: () => performance.now(),
    measureBrightness,
  };
}

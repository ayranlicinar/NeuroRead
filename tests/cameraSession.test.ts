import { describe, expect, it, vi } from 'vitest';
import { CameraError, CameraSession, mapMediaError, type CameraSessionDeps, type LandmarkerLike, type VideoLike } from '../src/services/cameraSession';

function fakeStream() {
  const listeners: Record<string, () => void> = {};
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn((name: string, cb: () => void) => {
      listeners[name] = cb;
    }),
    removeEventListener: vi.fn(),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track, fireEnded: () => listeners.ended?.() };
}

function fakeVideo(): VideoLike {
  return { srcObject: null, muted: false, play: vi.fn(async () => {}), videoWidth: 640, videoHeight: 480, readyState: 4 };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<CameraSessionDeps> = {}) {
  const s = fakeStream();
  const landmarker: LandmarkerLike = { detectForVideo: vi.fn(() => ({ faceLandmarks: [] })), close: vi.fn() };
  let frameCb: (() => void) | null = null;
  let clock = 0;
  const deps: CameraSessionDeps = {
    getUserMedia: vi.fn(async () => s.stream),
    createLandmarker: vi.fn(async () => landmarker),
    requestFrame: vi.fn((cb) => {
      frameCb = cb;
      return 1;
    }),
    cancelFrame: vi.fn(),
    now: () => (clock += 100),
    ...overrides,
  };
  return { deps, ...s, landmarker, tick: () => frameCb?.() };
}

describe('CameraSession consent and cleanup', () => {
  it('does not touch the camera until start() is called', () => {
    const { deps } = setup();
    new CameraSession(deps);
    expect(deps.getUserMedia).not.toHaveBeenCalled();
    expect(deps.createLandmarker).not.toHaveBeenCalled();
  });

  it('starts, analyses frames and stops every track on stop()', async () => {
    const { deps, track, landmarker, tick } = setup();
    const session = new CameraSession(deps);
    const video = fakeVideo();
    expect(await session.start(video)).toBe(true);
    expect(deps.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    expect(video.srcObject).not.toBeNull();

    tick();
    expect(landmarker.detectForVideo).toHaveBeenCalledTimes(1);

    session.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(landmarker.close).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(deps.cancelFrame).toHaveBeenCalled();
    expect(session.isRunning).toBe(false);
  });

  it('never opens the camera if the model fails to load', async () => {
    const { deps } = setup({ createLandmarker: vi.fn(async () => Promise.reject(new Error('404'))) });
    const session = new CameraSession(deps);
    await expect(session.start(fakeVideo())).rejects.toMatchObject({ code: 'MODEL_LOAD_FAILED' });
    expect(deps.getUserMedia).not.toHaveBeenCalled();
  });

  it('maps a denied permission and releases the model', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const { deps, landmarker } = setup({ getUserMedia: vi.fn(async () => Promise.reject(denied)) });
    const session = new CameraSession(deps);
    await expect(session.start(fakeVideo())).rejects.toBeInstanceOf(CameraError);
    await expect(session.start(fakeVideo())).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(landmarker.close).toHaveBeenCalled();
  });

  it('stops tracks if video playback fails after the stream was acquired', async () => {
    const { deps, track } = setup();
    const video = fakeVideo();
    video.play = vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { name: 'NotReadableError' })));
    const session = new CameraSession(deps);
    await expect(session.start(video)).rejects.toMatchObject({ code: 'CAMERA_IN_USE' });
    expect(track.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it('stops a stream that arrives after the user cancelled', async () => {
    const pending = deferred<MediaStream>();
    const { deps, track, stream } = setup();
    deps.getUserMedia = vi.fn(() => pending.promise);
    const session = new CameraSession(deps);
    const started = session.start(fakeVideo());
    await vi.waitFor(() => expect(deps.getUserMedia).toHaveBeenCalled());
    session.stop(); // user clicked "Vazgeç" while the permission prompt was open
    pending.resolve(stream);
    expect(await started).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    expect(deps.requestFrame).not.toHaveBeenCalled();
  });

  it('stops and reports when the camera track ends unexpectedly', async () => {
    const { deps, track, fireEnded } = setup();
    const session = new CameraSession(deps);
    const onError = vi.fn();
    session.onError = onError;
    await session.start(fakeVideo());
    fireEnded();
    expect(track.stop).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'STREAM_ENDED' }));
  });

  it('stops everything if frame analysis throws', async () => {
    const { deps, track, landmarker, tick } = setup();
    (landmarker.detectForVideo as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('gpu lost');
    });
    const session = new CameraSession(deps);
    const onError = vi.fn();
    session.onError = onError;
    await session.start(fakeVideo());
    tick();
    expect(track.stop).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNKNOWN' }));
  });

  it('emits only aggregated numeric metrics, never frames or landmarks', async () => {
    const { deps, tick } = setup();
    const session = new CameraSession(deps);
    const onMetrics = vi.fn();
    session.onMetrics = onMetrics;
    await session.start(fakeVideo());
    for (let i = 0; i < 5; i++) tick();
    expect(onMetrics).toHaveBeenCalled();
    const metrics = onMetrics.mock.calls[0][0];
    const json = JSON.stringify(metrics);
    expect(json).not.toMatch(/landmark|image|frame|pixel/i);
    expect(metrics.source).toBe('camera');
  });

  it('maps browser media errors', () => {
    expect(mapMediaError({ name: 'NotFoundError' })).toBe('NO_CAMERA');
    expect(mapMediaError({ name: 'NotReadableError' })).toBe('CAMERA_IN_USE');
    expect(mapMediaError({ name: 'SecurityError' })).toBe('PERMISSION_DENIED');
    expect(mapMediaError(new Error('?'))).toBe('UNKNOWN');
  });
});

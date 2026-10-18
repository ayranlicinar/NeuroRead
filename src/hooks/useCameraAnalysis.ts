import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraErrorCode, CameraMetrics, CameraStatus } from '../types';
import { CameraError, CameraSession } from '../services/cameraSession';
import { cameraSupportProblem, createBrowserCameraDeps } from '../services/browserCamera';

/**
 * Opt-in webcam analysis. Nothing happens until `start()` is called from a
 * user action. Tracks are stopped on `stop()`, on errors, on page hide and on unmount.
 */
export function useCameraAnalysis() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState<CameraErrorCode | null>(null);
  const [metrics, setMetrics] = useState<CameraMetrics | null>(null);

  const getSession = useCallback(() => {
    if (!sessionRef.current) {
      const session = new CameraSession(createBrowserCameraDeps());
      session.onMetrics = setMetrics;
      session.onError = (e) => {
        setStatus('error');
        setError(e.code);
        setMetrics(null);
      };
      sessionRef.current = session;
    }
    return sessionRef.current;
  }, []);

  const start = useCallback(async () => {
    const problem = cameraSupportProblem();
    if (problem) {
      setStatus('error');
      setError(problem);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setMetrics(null);
    try {
      const started = await getSession().start(video, (stage) => setStatus(stage));
      if (started) setStatus('active');
    } catch (e) {
      setStatus('error');
      setError(e instanceof CameraError ? e.code : 'UNKNOWN');
      setMetrics(null);
    }
  }, [getSession]);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    setStatus('off');
    setError(null);
    setMetrics(null);
  }, []);

  const recalibrate = useCallback(() => sessionRef.current?.recalibrate(), []);

  useEffect(() => {
    const onPageHide = () => {
      sessionRef.current?.stop();
      setStatus('off');
      setMetrics(null);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      sessionRef.current?.stop();
    };
  }, []);

  return { videoRef, status, error, metrics, start, stop, recalibrate };
}

export type CameraController = ReturnType<typeof useCameraAnalysis>;

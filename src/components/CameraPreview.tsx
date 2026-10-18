import { useState, type RefObject } from 'react';
import type { CameraStatus } from '../types';

/**
 * The <video> element is always mounted (so the camera session can attach to it)
 * but only shown while the camera is starting or active. The image stays on this device.
 */
export function CameraPreview({ videoRef, status }: { videoRef: RefObject<HTMLVideoElement | null>; status: CameraStatus }) {
  const [minimized, setMinimized] = useState(false);
  const visible = status === 'active' || status === 'requesting' || status === 'loading-model';
  return (
    <div className={`camera-preview ${visible ? 'is-visible' : ''} ${minimized ? 'is-min' : ''}`} aria-hidden={!visible}>
      <video ref={videoRef} playsInline muted aria-label="Kamera önizlemesi (yalnızca bu cihazda)" />
      {visible && (
        <div className="camera-preview-bar">
          <span>
            <span className="rec-dot" aria-hidden="true" /> {status === 'active' ? 'Kamera açık · yerel analiz' : 'Başlatılıyor…'}
          </span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMinimized((m) => !m)}>
            {minimized ? 'Büyüt' : 'Küçült'}
          </button>
        </div>
      )}
    </div>
  );
}

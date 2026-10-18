import { useCallback, useEffect, useState } from 'react';
import { fetchHealth } from '../services/aiClient';

/** 'unknown' = backend unreachable. Only a boolean is returned by the server, never the key. */
export type AiAvailability = 'checking' | 'configured' | 'missing-key' | 'unknown';

export function useAiHealth() {
  const [availability, setAvailability] = useState<AiAvailability>('checking');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setAvailability('checking');
    const info = await fetchHealth(signal);
    if (signal?.aborted) return;
    setAvailability(info ? (info.aiConfigured ? 'configured' : 'missing-key') : 'unknown');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { availability, refresh };
}

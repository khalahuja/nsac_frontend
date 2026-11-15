import { useEffect, useState } from 'react';

import { fetchMoonFeatures, fetchStatus } from '../services/api';
import type { LunarFeature, StatusResponse } from '../types/lunar';

export interface UseApiStatusResult {
  status: StatusResponse | null;
  features: LunarFeature[];
  /** True once the initial status probe has resolved, successfully or not. */
  isReady: boolean;
  /** Set when the backend could not be reached at startup. */
  error: string | null;
}

/**
 * Probe the backend once at startup.
 *
 * Fetches which science providers are live (so the UI can state its own
 * fidelity before the first analysis) and the lunar feature catalogue used to
 * build the Moon texture. A failure here is non-fatal: the scene still renders
 * with an empty catalogue and the UI shows a connection banner.
 */
export function useApiStatus(): UseApiStatusResult {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [features, setFeatures] = useState<LunarFeature[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    Promise.allSettled([
      fetchStatus(controller.signal),
      fetchMoonFeatures(controller.signal)
    ]).then((results) => {
      if (controller.signal.aborted) return;

      const [statusResult, featuresResult] = results;
      if (statusResult.status === 'fulfilled') {
        setStatus(statusResult.value);
      } else {
        setError('Backend unavailable — start the API on port 8000 to run analyses.');
      }
      if (featuresResult.status === 'fulfilled') {
        setFeatures(featuresResult.value);
      }
      setIsReady(true);
    });

    return () => controller.abort();
  }, []);

  return { status, features, isReady, error };
}

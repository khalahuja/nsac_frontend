import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, fetchEnvironment } from '../services/api';
import type { EnvironmentResponse } from '../types/lunar';

/** What the caller needs to request an analysis. */
export interface EnvironmentQuery {
  latitude: number;
  longitude: number;
  datetimeIso: string;
}

export interface UseEnvironmentResult {
  data: EnvironmentResponse | null;
  isLoading: boolean;
  error: string | null;
  /** Re-run the current query, e.g. from a "retry" button. */
  refetch: () => void;
}

/**
 * Fetch the environmental analysis for a coordinate and time.
 *
 * Supersedes in-flight requests: when the query changes mid-flight the
 * previous request is aborted, so a slow response can never overwrite a newer
 * one. Previous data is kept visible while a new request runs, which avoids
 * the panel flashing empty on every update.
 *
 * @param query - The coordinate and instant to analyse, or `null` to idle.
 */
export function useEnvironment(query: EnvironmentQuery | null): UseEnvironmentResult {
  const [data, setData] = useState<EnvironmentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!query) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    fetchEnvironment(
      {
        latitude: query.latitude,
        longitude: query.longitude,
        datetime_utc: query.datetimeIso,
        include_sun_events: true
      },
      controller.signal
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiError ? caught.message : 'Unexpected error during analysis.'
        );
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [query?.latitude, query?.longitude, query?.datetimeIso, reloadToken]);

  return { data, isLoading, error, refetch };
}

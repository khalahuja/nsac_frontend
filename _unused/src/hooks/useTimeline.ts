import { useEffect, useRef, useState } from 'react';

import { ApiError, fetchTimeline } from '../services/api';
import type { TimelineResponse } from '../types/lunar';

export interface TimelineQuery {
  latitude: number;
  longitude: number;
  centerIso: string;
  hoursBefore: number;
  hoursAfter: number;
  stepHours: number;
}

export interface UseTimelineResult {
  data: TimelineResponse | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetch the temperature / irradiance timeline for a coordinate.
 *
 * Like {@link useEnvironment} this aborts superseded requests. A timeline is
 * markedly more expensive than a single analysis, so callers should pass an
 * already-debounced query rather than one that changes on every keystroke or
 * pointer move.
 */
export function useTimeline(query: TimelineQuery | null): UseTimelineResult {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

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

    fetchTimeline(
      {
        latitude: query.latitude,
        longitude: query.longitude,
        center_datetime_utc: query.centerIso,
        hours_before: query.hoursBefore,
        hours_after: query.hoursAfter,
        step_hours: query.stepHours
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
          caught instanceof ApiError ? caught.message : 'Unexpected error building the timeline.'
        );
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [
    query?.latitude,
    query?.longitude,
    query?.centerIso,
    query?.hoursBefore,
    query?.hoursAfter,
    query?.stepHours
  ]);

  return { data, isLoading, error };
}

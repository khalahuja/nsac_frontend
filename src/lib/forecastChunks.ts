import type { ForecastResult, ForecastSample, LunarCoordinate } from './lunar';
import { forecastMetrics } from './forecastMetrics';
import { computeSimulatedForecast } from './lunarPhysics';

/**
 * Forecasts for periods longer than the API's per-request sample cap.
 *
 * The period is cut into consecutive chunks of at most CHUNK_SAMPLES samples on
 * the same time grid, fetched a few at a time, and stitched back together
 * (the shared boundary sample is kept once). A chunk the server cannot serve
 * falls back to the in-browser model, and the result says so.
 */

export const CHUNK_SAMPLES = 1199;
/** Overall cap, about 2.3 years at 1-hour steps. */
export const MAX_TOTAL_SAMPLES = 20_000;
const PARALLEL = 3;

import { API } from './apiEndpoints';

export type ChunkedRequest = {
  latitude: number;
  longitude: number;
  start_datetime_utc: string;
  end_datetime_utc: string;
  step_hours: number;
  display_timezone: string;
};

export type ChunkedForecast = ForecastResult & {
  /** Chunks served by the in-browser model because the server failed. */
  fallbackChunks: number;
  chunkCount: number;
};

export function sampleCount(start: string, end: string, stepHours: number) {
  return Math.floor((Date.parse(end) - Date.parse(start)) / (stepHours * 3_600_000)) + 1;
}

/** The smallest standard step (h) that keeps a period within the overall cap. */
export function stepForPeriod(start: string, end: string, preferred: number) {
  const steps = [0.5, 1, 2, 3, 4, 6, 8, 12, 24];
  return steps.find((s) => s >= preferred && sampleCount(start, end, s) <= MAX_TOTAL_SAMPLES) ?? 24;
}

export function validateChunked(req: ChunkedRequest) {
  const startMs = Date.parse(req.start_datetime_utc);
  const endMs = Date.parse(req.end_datetime_utc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('The forecast end must be after the start.');
  if (!(req.step_hours > 0 && req.step_hours <= 24)) throw new Error('The time step must be between 0 and 24 hours.');
  const n = sampleCount(req.start_datetime_utc, req.end_datetime_utc, req.step_hours);
  if (n > MAX_TOTAL_SAMPLES) {
    const step = stepForPeriod(req.start_datetime_utc, req.end_datetime_utc, req.step_hours);
    throw new Error(`That period needs ${n.toLocaleString()} samples at ${req.step_hours} h steps; the limit is ${MAX_TOTAL_SAMPLES.toLocaleString()}. Use a ${step} h step or a shorter period.`);
  }
}

function chunkRanges(req: ChunkedRequest): [string, string][] {
  const stepMs = req.step_hours * 3_600_000;
  const startMs = Date.parse(req.start_datetime_utc);
  const endMs = Date.parse(req.end_datetime_utc);
  const ranges: [string, string][] = [];
  for (let from = startMs; from < endMs; from += (CHUNK_SAMPLES - 1) * stepMs) {
    const to = Math.min(endMs, from + (CHUNK_SAMPLES - 1) * stepMs);
    ranges.push([new Date(from).toISOString(), new Date(to).toISOString()]);
    if (to >= endMs) break;
  }
  return ranges;
}

async function fetchChunk(req: ChunkedRequest, from: string, to: string, signal?: AbortSignal): Promise<{ result: ForecastResult; fallback: boolean }> {
  try {
    const response = await fetch(`${API}/api/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, start_datetime_utc: from, end_datetime_utc: to }),
      signal
    });
    if (!response.ok) throw new Error(String(response.status));
    const result = (await response.json()) as ForecastResult;
    if (!result.samples?.length) throw new Error('empty');
    return { result, fallback: false };
  } catch (error) {
    if (signal?.aborted) throw error;
    const point: LunarCoordinate = { lat: req.latitude, lon: req.longitude };
    return { result: computeSimulatedForecast(point, from, to, req.step_hours), fallback: true };
  }
}

export async function fetchForecastChunked(req: ChunkedRequest, signal?: AbortSignal): Promise<ChunkedForecast> {
  validateChunked(req);
  const ranges = chunkRanges(req);
  const parts: { result: ForecastResult; fallback: boolean }[] = new Array(ranges.length);
  let next = 0;
  const worker = async () => {
    while (next < ranges.length) {
      const i = next++;
      parts[i] = await fetchChunk(req, ranges[i][0], ranges[i][1], signal);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, ranges.length) }, worker));

  const seen = new Set<string>();
  const samples: ForecastSample[] = [];
  for (const part of parts) {
    for (const sample of part.result.samples) {
      if (seen.has(sample.datetime_utc)) continue;
      seen.add(sample.datetime_utc);
      samples.push(sample);
    }
  }
  samples.sort((a, b) => Date.parse(a.datetime_utc) - Date.parse(b.datetime_utc));
  const first = parts[0].result;
  const fallbackChunks = parts.filter((p) => p.fallback).length;
  const metrics = forecastMetrics(samples, first.min_earth_elevation_deg);
  return {
    ...first,
    start_datetime_utc: req.start_datetime_utc,
    end_datetime_utc: req.end_datetime_utc,
    sample_count: samples.length,
    samples,
    ...metrics,
    terrain_visibility_available: parts.every(part => !part.fallback && part.result.terrain_visibility_available === true),
    position_notes: Array.from(new Set(parts.map(part => part.result.position_notes))).join(' '),
    model_name: fallbackChunks === parts.length ? `${first.model_name} (in-browser, server offline)`
      : fallbackChunks ? `${first.model_name} (${fallbackChunks} of ${parts.length} parts from the in-browser model)` : first.model_name,
    fallbackChunks,
    chunkCount: parts.length
  };
}

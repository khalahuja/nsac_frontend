/**
 * Typed client for the Lunar Environment Explorer API.
 *
 * Every call funnels through `request()`, which turns network failures and
 * FastAPI error bodies into a single `ApiError` carrying a message that is
 * safe to show the user. Callers never see a raw `fetch` rejection.
 */

import type {
  EnvironmentRequest,
  EnvironmentResponse,
  ForecastRequest,
  ForecastResponse,
  LunarFeature,
  StatusResponse,
  TimelineRequest,
  TimelineResponse
} from '../types/lunar';

/**
 * Base URL of the API.
 *
 * Empty by default so requests go to the same origin and Vite's dev proxy
 * (see `vite.config.ts`) forwards `/api` to the backend. Set
 * `VITE_API_BASE_URL` when the API lives elsewhere, e.g. in Docker.
 */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

/** Error carrying a user-presentable message plus HTTP context. */
export class ApiError extends Error {
  readonly status: number;
  readonly errorType: string;

  constructor(message: string, status: number, errorType = 'api_error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorType = errorType;
  }

  /** True when the backend could not be reached at all. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

interface ErrorBody {
  detail?: string;
  error_type?: string;
}

/**
 * Perform a request and decode the JSON body.
 *
 * @param path - API path beginning with `/api`.
 * @param init - Standard `fetch` options.
 * @param signal - Optional abort signal for cancelling in-flight requests.
 * @throws {ApiError} on network failure, non-2xx status, or invalid JSON.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  } catch (error) {
    // An AbortError is a deliberate cancellation, not a failure to report.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(
      'Cannot reach the analysis backend. Check that it is running on port 8000.',
      0,
      'network_error'
    );
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`;
    let errorType = 'http_error';
    try {
      const body = (await response.json()) as ErrorBody;
      if (body.detail) detail = body.detail;
      if (body.error_type) errorType = body.error_type;
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new ApiError(detail, response.status, errorType);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('The backend returned a malformed response.', response.status, 'parse_error');
  }
}

/**
 * Compute the full environmental analysis at a coordinate and instant.
 *
 * @param payload - Coordinate and UTC time to analyse.
 * @param signal - Abort signal, used to cancel superseded requests.
 */
export function fetchEnvironment(
  payload: EnvironmentRequest,
  signal?: AbortSignal
): Promise<EnvironmentResponse> {
  return request<EnvironmentResponse>(
    '/api/environment',
    { method: 'POST', body: JSON.stringify(payload) },
    signal
  );
}

/** Sample solar irradiance and temperature across a time window. */
export function fetchTimeline(
  payload: TimelineRequest,
  signal?: AbortSignal
): Promise<TimelineResponse> {
  return request<TimelineResponse>(
    '/api/timeline',
    { method: 'POST', body: JSON.stringify(payload) },
    signal
  );
}

/** Generate a time-dependent lunar environment forecast. */
export function fetchForecast(
  payload: ForecastRequest,
  signal?: AbortSignal
): Promise<ForecastResponse> {
  return request<ForecastResponse>(
    '/api/forecast',
    { method: 'POST', body: JSON.stringify(payload) },
    signal
  );
}

/** Download the same forecast calculations as a two-sheet XLSX workbook. */
export async function fetchForecastWorkbook(
  payload: ForecastRequest,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/export/xlsx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(body.detail ?? 'Excel export failed.', response.status, body.error_type);
  }
  return response.blob();
}

/** Report which science providers the backend actually has loaded. */
export function fetchStatus(signal?: AbortSignal): Promise<StatusResponse> {
  return request<StatusResponse>('/api/status', { method: 'GET' }, signal);
}

/** Named craters and maria used to annotate the 3D Moon. */
export function fetchMoonFeatures(signal?: AbortSignal): Promise<LunarFeature[]> {
  return request<LunarFeature[]>('/api/moon/features', { method: 'GET' }, signal);
}

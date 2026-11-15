/**
 * Types mirroring the FastAPI response models in
 * `backend/app/models/schemas.py`.
 *
 * Field names are snake_case to match the wire format exactly - no remapping
 * layer means no chance of the two drifting apart silently.
 */

/** A selenographic surface coordinate. */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Local topography.
 *
 * `null` means "not measured" - never "zero". `is_measured` is false whenever
 * the values come from the reference sphere rather than a real DEM.
 */
export interface TerrainInfo {
  elevation_m: number | null;
  slope_deg: number | null;
  aspect_deg: number | null;
  source: string;
  is_measured: boolean;
}

/** Solar geometry and direct-beam irradiance at the selected point. */
export interface SolarInfo {
  elevation_deg: number;
  azimuth_deg: number;
  incidence_angle_deg: number;
  illuminated: boolean;
  above_horizon: boolean;
  /** `null` when no DEM is loaded: unknown, not "not shadowed". */
  terrain_shadowed: boolean | null;
  solar_irradiance_w_m2: number;
  horizontal_irradiance_w_m2: number;
  solar_constant_at_moon_w_m2: number;
  sun_distance_km: number;
  /** Unit vector to the Sun in the lunar body-fixed (IAU_MOON) frame. */
  sun_vector_body: [number, number, number] | number[];
  sun_vector_j2000: [number, number, number] | number[];
  /** Unit vector to Earth in the lunar body-fixed frame. */
  earth_vector_body: [number, number, number] | number[];
  earth_distance_km: number;
  subsolar_latitude_deg: number;
  subsolar_longitude_deg: number;
}

/** Modelled surface temperature. `is_measured` is always false. */
export interface ThermalInfo {
  temperature_k: number;
  temperature_c: number;
  model: string;
  confidence: 'experimental' | 'experimental-with-terrain' | 'calibrated';
  albedo: number;
  emissivity: number;
  absorbed_flux_w_m2: number;
  is_measured: boolean;
  notes: string;
}

/** A real LRO Diviner measurement, present only when a dataset is installed. */
export interface DivinerObservationInfo {
  temperature_k: number;
  local_time_hours: number | null;
  dataset: string;
  observation_datetime_utc: string | null;
}

/** Next horizon crossings at the point. */
export interface SunEventsInfo {
  next_sunrise_utc: string | null;
  next_sunset_utc: string | null;
  search_window_hours: number;
  note: string | null;
}

/** Machine-readable provenance for each part of the answer. */
export interface SourceInfo {
  astronomy: string;
  terrain: string;
  temperature: string;
  diviner: string;
}

/** Human-readable fidelity labels for the model-fidelity panel. */
export interface FidelityInfo {
  astronomy: string;
  terrain: string;
  temperature: string;
  overall_note: string;
}

/** Full response from `POST /api/environment`. */
export interface EnvironmentResponse {
  coordinate: Coordinate;
  datetime_utc: string;
  terrain: TerrainInfo;
  solar: SolarInfo;
  thermal: ThermalInfo;
  diviner_observation: DivinerObservationInfo | null;
  sun_events: SunEventsInfo | null;
  sources: SourceInfo;
  fidelity: FidelityInfo;
  accuracy_notes: string[];
}

/** One timestep of the environmental timeline. */
export interface TimelineSample {
  datetime_utc: string;
  temperature_k: number;
  temperature_c: number;
  solar_irradiance_w_m2: number;
  horizontal_irradiance_w_m2: number;
  solar_elevation_deg: number;
  solar_azimuth_deg: number;
  incidence_angle_deg: number;
  illuminated: boolean;
}

/** Full response from `POST /api/timeline`. */
export interface TimelineResponse {
  coordinate: Coordinate;
  center_datetime_utc: string;
  step_hours: number;
  sample_count: number;
  samples: TimelineSample[];
  sources: SourceInfo;
  fidelity: FidelityInfo;
  synodic_month_hours: number;
}

/** Request body shared by forecast generation and XLSX export. */
export interface ForecastRequest {
  latitude: number;
  longitude: number;
  start_datetime_utc: string;
  end_datetime_utc: string;
  step_hours: number;
}

/** Full response from `POST /api/forecast`. */
export interface ForecastResponse {
  coordinate: Coordinate;
  start_datetime_utc: string;
  end_datetime_utc: string;
  step_hours: number;
  sample_count: number;
  samples: TimelineSample[];
  sources: SourceInfo;
  fidelity: FidelityInfo;
  model_name: string;
  model_notes: string;
}

/** Response from `GET /api/status` - which providers are actually active. */
export interface StatusResponse {
  status: 'ok';
  api_version: string;
  astronomy_source: string;
  astronomy_accuracy: string;
  terrain_source: string;
  terrain_is_measured: boolean;
  terrain_shadows_enabled: boolean;
  diviner_available: boolean;
  spice_requested: boolean;
  dem_requested: boolean;
  diviner_requested: boolean;
}

/** A named lunar surface feature used to annotate the 3D Moon. */
export interface LunarFeature {
  name: string;
  lat: number;
  lon: number;
  diameterKm: number;
  note: string;
}

/** Request body for `POST /api/environment`. */
export interface EnvironmentRequest {
  latitude: number;
  longitude: number;
  datetime_utc: string;
  include_sun_events?: boolean;
}

/** Request body for `POST /api/timeline`. */
export interface TimelineRequest {
  latitude: number;
  longitude: number;
  center_datetime_utc: string;
  hours_before: number;
  hours_after: number;
  step_hours: number;
}

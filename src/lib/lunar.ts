
export type Crater = {
  name: string;
  lat: number;
  lon: number;
  diameterKm: number;
  note: string;
};

export type InspectResult = {
  lat: number;
  lon: number;
  illumination: number;
  estimatedTemperatureC: number;
  nearestFeature: Crater;
  nearestDistanceKm: number;
};

export type LunarCoordinate = { lat: number; lon: number };

export type EnvironmentResult = {
  positions: HorizonPositions;
  coordinate: { latitude: number; longitude: number };
  datetime_utc: string;
  solar: {
    elevation_deg: number;
    azimuth_deg: number;
    incidence_angle_deg: number;
    illuminated: boolean;
    terrain_shadowed: boolean | null;
    solar_irradiance_w_m2: number;
    horizontal_irradiance_w_m2: number;
  };
  thermal: {
    temperature_k: number;
    temperature_c: number;
    model: string;
    confidence: string;
  };
  terrain: {
    elevation_m: number | null;
    slope_deg: number | null;
    source: string;
    is_measured: boolean;
  };
  sources: { astronomy: string; terrain: string; temperature: string; diviner: string };
  fidelity: { astronomy: string; terrain: string; temperature: string; overall_note: string };
  accuracy_notes: string[];
};

export type ForecastSample = {
  earth_elevation_deg: number;
  earth_azimuth_deg: number;
  earth_distance_km: number;
  earth_visible: boolean;
  datetime_utc: string;
  temperature_k: number;
  temperature_c: number;
  solar_irradiance_w_m2: number;
  horizontal_irradiance_w_m2: number;
  solar_elevation_deg: number;
  solar_azimuth_deg: number;
  incidence_angle_deg: number;
  illuminated: boolean;
  solar_earth_overlap?: boolean | null;
  terrain_shadowed?: boolean | null;
  solar_horizon_margin_deg?: number | null;
  earth_horizon_margin_deg?: number | null;
};

export type ForecastResult = {
  terrain_visibility_available?: boolean;
  sun_visibility_windows?: { start_utc: string; end_utc: string; duration_hours: number }[];
  sunlit_hours?: number;
  longest_darkness_hours?: number;
  darkness_boundary_limited?: boolean;
  earth_visibility_windows: { start_utc: string; end_utc: string; duration_hours: number }[];
  earth_visible_hours: number;
  sun_above_horizon_hours: number;
  horizontal_energy_wh_m2: number;
  min_earth_elevation_deg: number;
  position_notes: string;
  coordinate: { latitude: number; longitude: number };
  start_datetime_utc: string;
  end_datetime_utc: string;
  step_hours: number;
  sample_count: number;
  samples: ForecastSample[];
  sources: { astronomy: string; terrain: string; temperature: string; diviner: string };
  fidelity: { astronomy: string; terrain: string; temperature: string; overall_note: string };
  model_name: string;
  model_notes: string;
};

export const MOON_RADIUS = 1.12;
export type BodyPosition = { azimuth_deg: number; elevation_deg: number; distance_km: number; above_horizon: boolean };
export type HorizonPositions = { sun: BodyPosition; earth: BodyPosition; reference: string };
export const EARTH_RADIUS = 2.85;
export const EARTH_TEXTURE_URL = '/textures/blue-marble-2048.png';
export const MOON_TEXTURE_URL = '/textures/lroc-color-2k.jpg';



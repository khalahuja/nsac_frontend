import { API } from './apiEndpoints';

export type EvidenceType = 'ice_detection' | 'cold_conditions' | 'resource_potential';
export type EvidenceFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: number[] } | { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: { name: string; evidence_type: EvidenceType; source_url: string; dataset: string; note: string };
};
export type EvidenceCollection = { type: 'FeatureCollection'; features: EvidenceFeature[] };
export type WaterResult = {
  hydrogen: import("../components/HydrogenMap").HydrogenData;
  feature_collection: EvidenceCollection;
  features: (EvidenceFeature['properties'] & { distance_km: number; contains_selected_site: boolean })[];
  counts: Record<EvidenceType, number>; notes: string[];
};
export type TerrainCell = {
  x: number; y: number; lat: number; lon: number; elevation_m: number | null; slope_deg: number | null;
  height_uncertainty_m: number | null; slope_uncertainty_deg: number | null;
  screen: 'unknown' | 'hazard' | 'uncertain' | 'within_limit';
};
export type TerrainPatch = {
  available: boolean; high_resolution: boolean; source: string; source_url: string;
  resolution_m: number | null; size: number; radius_m: number; slope_limit_deg: number; uncertainty_factor: number;
  coverage_fraction: number; cells: TerrainCell[]; notes: string[]; frame: string | null; ephemeris_frame: string | null;
};
export type NasaCatalog = {
  terrain_source: string; diviner_available: boolean;
  regions: { id: string; title: string; source_url: string; resolution_m: number; installed: boolean; uncertainty_available: boolean }[];
  layers: { id: string; title: string; note: string; kind: string; source_url: string }[];
};
export type TileMatrix = { id: string; width: number; height: number; tile_width: number; tile_height: number; top_left: number[]; pixel_size: number };
export type ImageryLayer = {
  id: string; title: string; kind: string; projection: 'eq' | 'south'; endpoint: string; source_url: string;
  note: string; matrix_set: string; matrices: TileMatrix[]; style: string; extension: string; attribution: string;
};
export type ThermalObservation = { temperature_k: number; dataset: string; source_url: string; reference_period: string; comparison_kind: string; season: string; local_time_hours: number };
export type ThermalResult = {
  available: boolean; model_name: string; terrain_visibility_available: boolean; source: string;
  matched_samples: number; bias_k: number | null; rmse_k: number | null; notes: string[];
  samples: { datetime_utc: string; model_temperature_k: number; observation: ThermalObservation | null; residual_k: number | null }[];
  local_time_profile: { temperature_k: number; distance_m: number; local_time_min_hours: number; local_time_max_hours: number; season: string; dataset: string; source_url: string; reference_period: string }[];
};
export type ValidationReport = {
  astronomy_source: string; reference: string; case_count: number; successful_body_checks: number;
  max_abs_elevation_delta_deg: number | null; notes: string[];
  results: { latitude: number; longitude: number; datetime_utc: string; bodies: {
    body: string; model: { azimuth_deg: number; elevation_deg: number };
    reference: { azimuth_deg: number; elevation_deg: number } | null;
    azimuth_delta_deg: number | null; elevation_delta_deg: number | null; error: string | null;
  }[] }[];
};

export async function nasaRequest<T>(path: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(API + '/api/nasa' + path, {
    signal, ...(payload === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === 'string' ? error.detail : 'NASA data request failed (' + response.status + ').');
  }
  return response.json();
}

export function downloadNasaReport(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Coordinates in a WMTS matrix; no Web Mercator assumptions on lunar maps. */
export function imageryPixel(layer: ImageryLayer, matrix: TileMatrix, latitude: number, longitude: number): [number, number] {
  if (layer.projection === 'eq') {
    return [(longitude + 180) / 360 * matrix.width * matrix.tile_width, (90 - latitude) / 180 * matrix.height * matrix.tile_height];
  }
  const rho = 2 * 1737400 * Math.tan((90 + latitude) * Math.PI / 360);
  const x = rho * Math.sin(longitude * Math.PI / 180), y = rho * Math.cos(longitude * Math.PI / 180);
  return [(x - matrix.top_left[0]) / matrix.pixel_size, (matrix.top_left[1] - y) / matrix.pixel_size];
}

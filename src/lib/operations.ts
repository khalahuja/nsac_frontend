export type MissionRequirements = {
  mission_hours: number; min_sunlight_pct: number; max_dark_hours: number;
  min_earth_pct: number; max_outage_hours: number; min_both_hours: number; min_earth_elevation_deg: number;
};
export type OperationsRequest = {
  latitude: number; longitude: number; landing_start_utc: string; landing_end_utc: string;
  nearby_radius_km: number; requirements: MissionRequirements;
};
export type OperationsCandidate = {
  landing_utc: string; end_utc: string; feasible: boolean; score: number;
  metrics: { sunlight_pct: number; earth_pct: number; sunlight_hours: number; earth_hours: number; both_hours: number; longest_dark_hours: number; longest_outage_hours: number };
  checks: { label: string; actual: number; limit: number; unit: string; operator: string; passed: boolean }[];
  tracks: { key: 'sunlight' | 'contact' | 'both'; segments: { start_utc: string; end_utc: string; hours: number; available: boolean }[] }[];
};
export type NearbyAlternative = OperationsCandidate & {
  name: string; bearing_deg: number; latitude: number; longitude: number;
  distance_km: number; terrain_verified: boolean; score_delta: number;
};
export type OperationsResult = {
  request: OperationsRequest; candidates: OperationsCandidate[]; best: OperationsCandidate;
  candidate_count: number; feasible_count: number; nearby: NearbyAlternative[];
  astronomy_source: string; terrain_source: string; terrain_verified: boolean; sampling_hours: number; limitations: string[];
};
export const DEFAULT_REQUIREMENTS: MissionRequirements = {
  mission_hours: 168, min_sunlight_pct: 70, max_dark_hours: 48, min_earth_pct: 30,
  max_outage_hours: 72, min_both_hours: 24, min_earth_elevation_deg: 0,
};
export function operationsKey(r: OperationsRequest): string {
  return JSON.stringify([r.latitude, r.longitude, Date.parse(r.landing_start_utc), Date.parse(r.landing_end_utc), r.nearby_radius_km,
    ...(['mission_hours', 'min_sunlight_pct', 'max_dark_hours', 'min_earth_pct', 'max_outage_hours', 'min_both_hours', 'min_earth_elevation_deg'] as const).map(k => r.requirements[k])]);
}
export function validateOperations(r: OperationsRequest): string | null {
  const q = r.requirements;
  if (![r.latitude, r.longitude, r.nearby_radius_km, ...Object.values(q)].every(Number.isFinite)) return 'Complete every numeric field.';
  if (Math.abs(r.latitude) > 90 || Math.abs(r.longitude) > 180) return 'Enter valid lunar coordinates.';
  const span = Date.parse(r.landing_end_utc) - Date.parse(r.landing_start_utc);
  if (!Number.isFinite(span) || span <= 0 || span > 90 * 86400000) return 'Use an ordered landing search of at most 90 days.';
  if (!Number.isInteger(q.mission_hours) || q.mission_hours < 1 || q.mission_hours > 720) return 'Mission duration must be 1 to 720 whole hours.';
  if ([q.min_sunlight_pct, q.min_earth_pct].some(n => n < 0 || n > 100)) return 'Coverage percentages must be between 0 and 100.';
  if ([q.max_dark_hours, q.max_outage_hours, q.min_both_hours].some(n => n < 0 || n > 720)) return 'Duration limits must be between 0 and 720 hours.';
  if (q.min_both_hours > q.mission_hours) return 'Required overlap cannot exceed the mission duration.';
  if (q.min_earth_elevation_deg < 0 || q.min_earth_elevation_deg > 30) return 'Minimum Earth elevation must be 0 to 30 degrees.';
  if (r.nearby_radius_km < 0.1 || r.nearby_radius_km > 50) return 'Nearby radius must be 0.1 to 50 km.';
  return null;
}

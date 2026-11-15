import type { ForecastSample } from './lunar';

export type WindowCriteria = { minTemperature: number; maxTemperature: number; minIrradiance: number; maxIrradiance?: number; minEarthElevation: number; maxEarthElevation?: number; requireEarth: boolean; requireSun: boolean; minHours: number; minEarthHours?: number };
export type ScienceWindow = { startIndex: number; endIndex: number; start: string; end: string; hours: number; endsBecause: string };
export function failures(s: ForecastSample, c: WindowCriteria): string[] {
  const reasons: string[] = [];
  if (!Number.isFinite(s.temperature_c) || s.temperature_c < c.minTemperature || s.temperature_c > c.maxTemperature) reasons.push('Temperature');
  if (!Number.isFinite(s.horizontal_irradiance_w_m2) || s.horizontal_irradiance_w_m2 < c.minIrradiance || s.horizontal_irradiance_w_m2 > (c.maxIrradiance ?? Infinity)) reasons.push('Irradiance');
  if (c.requireSun && (!s.illuminated || s.solar_earth_overlap === true)) reasons.push('Sunlight');
  if (c.requireEarth && (!s.earth_visible || !Number.isFinite(s.earth_elevation_deg) || s.earth_elevation_deg < c.minEarthElevation || s.earth_elevation_deg > (c.maxEarthElevation ?? 90))) reasons.push('Earth visibility');
  return reasons;
}
export function findScienceWindows(samples: ForecastSample[], criteria: WindowCriteria, stepHours: number): ScienceWindow[] {
  if (Object.values(criteria).some(v => typeof v === 'number' && !Number.isFinite(v)) || criteria.minTemperature > criteria.maxTemperature || criteria.minHours < 0 || (criteria.minEarthHours ?? 0) < 0 || criteria.minIrradiance < 0 || criteria.minIrradiance > (criteria.maxIrradiance ?? Infinity) || criteria.minEarthElevation > (criteria.maxEarthElevation ?? 90) || Math.abs(criteria.maxEarthElevation ?? 90) > 90 || Math.abs(criteria.minEarthElevation) > 90 || !Number.isFinite(stepHours) || stepHours <= 0) return [];
  const result: ScienceWindow[] = [];
  let first = -1;
  const close = (last: number, reason: string) => {
    if (first < 0) return;
    const hours = (Date.parse(samples[last].datetime_utc) - Date.parse(samples[first].datetime_utc)) / 3600000;
    let earthStart = -1, longestEarthHours = 0;
    if ((criteria.minEarthHours ?? 0) > 0) {
      for (let i = first; i <= last; i++) {
        const sample = samples[i];
        const visible = sample.earth_visible && Number.isFinite(sample.earth_elevation_deg)
          && sample.earth_elevation_deg >= criteria.minEarthElevation
          && sample.earth_elevation_deg <= (criteria.maxEarthElevation ?? 90);
        if (!visible) earthStart = -1;
        else {
          if (earthStart < 0) earthStart = i;
          longestEarthHours = Math.max(longestEarthHours,
            (Date.parse(sample.datetime_utc) - Date.parse(samples[earthStart].datetime_utc)) / 3600000);
        }
      }
    }
    if (hours > 0 && hours >= criteria.minHours && longestEarthHours >= (criteria.minEarthHours ?? 0)) result.push({ startIndex: first, endIndex: last, start: samples[first].datetime_utc, end: samples[last].datetime_utc, hours, endsBecause: reason });
    first = -1;
  };
  samples.forEach((sample, i) => {
    const time = Date.parse(sample.datetime_utc);
    const gap = i ? time - Date.parse(samples[i - 1].datetime_utc) : 0;
    if (i && (gap <= 0 || gap > stepHours * 3600000 * 1.01)) close(i - 1, 'Data gap');
    const reasons = failures(sample, criteria);
    if (!Number.isFinite(time)) { close(i - 1, 'Missing time'); return; }
    if (reasons.length) close(i - 1, reasons.join(', '));
    else if (first < 0) first = i;
  });
  close(samples.length - 1, 'Forecast boundary');
  return result;
}
export function saveCsv(filename: string, rows: (string | number)[][]) {
  const content = rows.map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type MapLayer = 'imagery' | 'illumination' | 'temperature' | 'elevation' | 'slope';
export type TerrainPoint = { lat: number; lon: number; elevation_m: number | null; slope_deg: number | null };
export type TerrainLayer = { source: string; resolution: string; points: TerrainPoint[] };
export function parseTerrainLayer(value: unknown): TerrainLayer {
  const d = value as Partial<TerrainLayer> | null;
  if (!d || typeof d.source !== 'string' || !d.source.trim() || !Array.isArray(d.points) || !d.points.length || d.points.length > 20000) throw new Error('Provide a source and 1-20,000 terrain points.');
  const points = d.points.map(p => {
    if (!p || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lon) || Math.abs(p.lon) > 180) throw new Error('Each point needs valid numeric lat and lon.');
    const elevation_m = p.elevation_m ?? null; const slope_deg = p.slope_deg ?? null;
    if ((elevation_m !== null && !Number.isFinite(elevation_m)) || (slope_deg !== null && (!Number.isFinite(slope_deg) || slope_deg < 0 || slope_deg > 90))) throw new Error('Invalid elevation or slope; slope must be 0-90 degrees.');
    if (elevation_m === null && slope_deg === null) throw new Error('Each point needs elevation_m or slope_deg.');
    return { lat: p.lat, lon: p.lon, elevation_m, slope_deg };
  });
  return { source: d.source.trim(), resolution: typeof d.resolution === 'string' ? d.resolution : 'Unspecified', points };
}

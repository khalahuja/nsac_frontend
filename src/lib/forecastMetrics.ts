import type { ForecastSample } from './lunar';

export type TimeWindow = { start_utc: string; end_utc: string; duration_hours: number };
export function forecastWindows(samples: ForecastSample[], value: (sample: ForecastSample) => number): TimeWindow[] {
  const windows: { start: number; end: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const va = value(a), vb = value(b);
    let start = Date.parse(a.datetime_utc), end = Date.parse(b.datetime_utc);
    if (!Number.isFinite(va) || !Number.isFinite(vb) || end <= start || (va <= 0 && vb <= 0)) continue;
    if ((va > 0) !== (vb > 0)) {
      const crossing = start + (end - start) * (-va / (vb - va));
      if (va <= 0) start = crossing; else end = crossing;
    }
    const last = windows[windows.length - 1];
    if (last && start <= last.end + 1) last.end = end;
    else windows.push({ start, end });
  }
  return windows.map(window => ({ start_utc: new Date(window.start).toISOString(), end_utc: new Date(window.end).toISOString(), duration_hours: (window.end - window.start) / 3600000 }));
}

export function forecastMetrics(samples: ForecastSample[], earthThreshold = 0) {
  const sunlight = forecastWindows(samples, s => s.solar_horizon_margin_deg ?? Math.min(s.solar_elevation_deg, 90 - s.incidence_angle_deg));
  const earth = forecastWindows(samples, s => s.earth_horizon_margin_deg ?? s.earth_elevation_deg - earthThreshold);
  const geometric = forecastWindows(samples, s => s.solar_elevation_deg);
  let cursor = Date.parse(samples[0]?.datetime_utc ?? ''), longest = 0, boundary = false;
  const start = cursor, end = Date.parse(samples[samples.length - 1]?.datetime_utc ?? '');
  const consider = (a: number, b: number) => { if (b - a > longest) { longest = b - a; boundary = a === start || b === end; } };
  for (const window of sunlight) { const a = Date.parse(window.start_utc), b = Date.parse(window.end_utc); consider(cursor, a); cursor = b; }
  consider(cursor, end);
  let energy = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    energy += (Date.parse(b.datetime_utc) - Date.parse(a.datetime_utc)) / 3600000 * (a.horizontal_irradiance_w_m2 + b.horizontal_irradiance_w_m2) / 2;
  }
  return {
    sun_visibility_windows: sunlight, earth_visibility_windows: earth,
    sunlit_hours: sunlight.reduce((sum, w) => sum + w.duration_hours, 0),
    sun_above_horizon_hours: geometric.reduce((sum, w) => sum + w.duration_hours, 0),
    earth_visible_hours: earth.reduce((sum, w) => sum + w.duration_hours, 0),
    horizontal_energy_wh_m2: energy,
    longest_darkness_hours: longest / 3600000, darkness_boundary_limited: boundary,
  };
}

import { useMemo, useState } from 'react';
import type { ForecastResult } from '../lib/lunar';
import { forecastMetrics } from '../lib/forecastMetrics';
import '../nasa-data.css';

export function ForecastPowerSummary({ forecast }: { forecast: ForecastResult }) {
  const [load, setLoad] = useState(100), [depth, setDepth] = useState(80), [efficiency, setEfficiency] = useState(90);
  const metrics = useMemo(() => forecastMetrics(forecast.samples, forecast.min_earth_elevation_deg), [forecast]);
  const valid = Number.isFinite(load) && load >= 0 && depth > 0 && depth <= 100 && efficiency > 0 && efficiency <= 100;
  const capacity = valid ? load * metrics.longest_darkness_hours / (depth / 100 * efficiency / 100) : null;
  return <section className="forecast-power-summary">
    <h3>Sunlight, darkness and battery storage</h3>
    <p className="nasa-note">{forecast.terrain_visibility_available ? 'Measured terrain skyline applied to this forecast.' : 'Terrain shadows are unavailable for all or part of this forecast; spherical estimates are included.'}</p>
    <div className="nasa-metrics"><div><span>Surface sunlight</span><strong>{metrics.sunlit_hours.toFixed(2)} h</strong></div>
      <div><span>Longest sampled darkness</span><strong>{metrics.darkness_boundary_limited ? '≥ ' : ''}{metrics.longest_darkness_hours.toFixed(2)} h</strong></div>
      <div><span>Earth line of sight</span><strong>{metrics.earth_visible_hours.toFixed(2)} h</strong></div>
      <div><span>Horizontal solar energy</span><strong>{metrics.horizontal_energy_wh_m2.toFixed(1)} Wh/m²</strong></div></div>
    <div className="nasa-form-row">
      <label>Constant load (W)<input type="number" min="0" value={load} onChange={e => setLoad(Number(e.target.value))} /></label>
      <label>Usable discharge (%)<input type="number" min=".1" max="100" value={depth} onChange={e => setDepth(Number(e.target.value))} /></label>
      <label>Discharge efficiency (%)<input type="number" min=".1" max="100" value={efficiency} onChange={e => setEfficiency(Number(e.target.value))} /></label>
    </div>
    <p>Darkness-only nominal storage: <strong>{capacity === null ? 'Enter valid inputs' : (metrics.darkness_boundary_limited ? 'at least ' : '') + (capacity / 1000).toFixed(2) + ' kWh'}</strong></p>
    <p className="nasa-note">Load × longest darkness ÷ usable discharge ÷ efficiency. A boundary-touching dark interval is a lower bound; extend the date range to capture its full duration. This estimate excludes daylight power deficits, recharge limits, heaters beyond the entered load, ageing and design margin. Event times are interpolated between samples.</p>
    <p className="nasa-note">{forecast.position_notes}</p>
  </section>;
}

import { useRef, useState } from 'react';
import type { LunarCoordinate } from '../lib/lunar';
import { computeEquilibriumConditions } from '../lib/lunarPhysics';
import { MapLayer, TerrainLayer, parseTerrainLayer } from '../lib/science';
import { formatZonedDateTime } from '../lib/time';
export function MapLayerControls({ layer, setLayer, terrain, setTerrain, opacity, setOpacity, point, instant, timeZone }: {
  layer: MapLayer; setLayer: (v: MapLayer) => void; terrain: TerrainLayer | null; setTerrain: (v: TerrainLayer | null) => void;
  opacity: number; setOpacity: (v: number) => void; point: LunarCoordinate | null; instant: string; timeZone: string;
}) {
  const [error, setError] = useState(''); const sequence = useRef(0);
  const env = point ? computeEquilibriumConditions(point, instant) : null;
  const values = terrain?.points.map(p => layer === 'elevation' ? p.elevation_m : p.slope_deg).filter((v): v is number => v !== null) ?? [];
  const selected = point && terrain?.points.find(p => Math.abs(p.lat - point.lat) < .00001 && Math.abs(p.lon - point.lon) < .00001);
  const legendMin = layer === 'illumination' ? 0 : layer === 'temperature' ? -173.15 : values.length ? Math.min(...values) : 0;
  const legendMax = layer === 'illumination' ? 1361 : layer === 'temperature' ? 126.85 : values.length ? Math.max(...values) : 0;
  const unit = layer === 'illumination' ? 'W/m2' : layer === 'temperature' ? 'C' : layer === 'elevation' ? 'm' : 'deg';
  return <section className="science-card map-layer-controls"><h2>Interactive map layers</h2>
    <div className="science-layer-buttons">{(['imagery', 'illumination', 'temperature', 'elevation', 'slope'] as MapLayer[]).map(v => <button key={v} aria-pressed={layer === v} disabled={(v === 'elevation' || v === 'slope') && !terrain?.points.some(p => p[v === 'elevation' ? 'elevation_m' : 'slope_deg'] !== null)} onClick={() => setLayer(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
    {layer !== 'imagery' && <div className="science-map-legend"><div /><span>{legendMin.toFixed(1)} {unit}</span><span>{legendMax.toFixed(1)} {unit}</span></div>}
    {(layer === 'elevation' || layer === 'slope') && <p className="science-note">Source: {terrain?.source}. Resolution: {terrain?.resolution}. Colored points show imported coverage only.</p>}
    {selected && (layer === 'elevation' || layer === 'slope') && <p>Imported point: {layer === 'elevation' ? selected.elevation_m : selected.slope_deg} {unit}</p>}
    <label>Overlay opacity: {Math.round(opacity * 100)}%<input type="range" min="0" max="1" step="0.05" value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></label>
    <p className="science-note">Illumination and temperature: local spherical model at {formatZonedDateTime(instant, timeZone)}. Grid spacing: 2.5 degrees. Terrain shadows and thermal inertia are excluded.</p>
    {env && <p>Pointer/target: {point!.lat.toFixed(3)}, {point!.lon.toFixed(3)}<br />{layer === 'illumination' ? `Horizontal irradiance: ${env.solar.horizontal_irradiance_w_m2.toFixed(1)} W/m2` : layer === 'temperature' ? `Equilibrium temperature: ${env.thermal.temperature_c.toFixed(1)} C` : 'Click the globe to select a site.'}</p>}
    <label>Import elevation / slope points (JSON)<input type="file" accept=".json,application/json" onChange={async e => {
      const id = ++sequence.current; const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try { if (file.size > 5000000) throw new Error('Maximum file size is 5 MB.'); const parsed = parseTerrainLayer(JSON.parse(await file.text())); if (id === sequence.current) { setTerrain(parsed); setLayer(parsed.points.some(p => p.elevation_m !== null) ? 'elevation' : 'slope'); setError(''); } }
      catch(e) { if (id === sequence.current) setError((e as Error).message); }
    }} /></label>
    <details><summary>Import format</summary><p>Lunar latitude/longitude in degrees, longitude -180 to 180. Elevation in metres relative to your stated datum; slope in degrees. Points remain discrete, with no interpolated coverage.</p><pre>{'{"source":"Dataset and datum", "resolution":"100 m", "points":[{"lat":-89.54,"lon":0,"elevation_m":1200,"slope_deg":14}]}'}</pre></details>
    {terrain && <><p>{terrain.source} / {terrain.resolution} / {terrain.points.length} points</p><button onClick={() => { ++sequence.current; setTerrain(null); setLayer('imagery'); }}>Remove imported data</button></>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

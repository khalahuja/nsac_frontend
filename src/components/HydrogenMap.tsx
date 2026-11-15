import { useState } from 'react';
import type { LunarCoordinate } from '../lib/lunar';

export type HydrogenData = {
  available: boolean; source_url: string; documentation_url: string; title: string; units: string;
  selected_value_ppm: number | null; selected_bounds: number[] | null; note: string; hemisphere: 'south' | 'north';
  cells: { lat_min: number; lat_max: number; lon_min: number; lon_max: number; hydrogen_ppm: number | null }[];
};
export function HydrogenMap({ data, coordinate }: { data: HydrogenData; coordinate: LunarCoordinate }) {
  const [inspected, setInspected] = useState<number | null>(null);
  const cell = inspected === null ? null : data.cells[inspected];
  const maximum = Math.max(1, ...data.cells.map(p => p.hydrogen_ppm ?? 0));
  const xy = (lat: number, lon: number) => {
    const radius = Math.tan((90 - Math.abs(lat)) * Math.PI / 360) / Math.tan(15 * Math.PI / 360) * 210;
    return [250 + radius * Math.sin(lon * Math.PI / 180), 250 - radius * Math.cos(lon * Math.PI / 180)];
  };
  const path = (c: HydrogenData['cells'][number]) => {
    const lons = Array.from({ length: Math.ceil((c.lon_max - c.lon_min) / 3) + 1 }, (_, i) => Math.min(c.lon_max, c.lon_min + i * 3));
    if (lons[lons.length - 1] !== c.lon_max) lons.push(c.lon_max);
    const outer = data.hemisphere === 'south' ? c.lat_max : c.lat_min;
    const inner = data.hemisphere === 'south' ? c.lat_min : c.lat_max;
    return [...lons.map(lon => xy(outer, lon)), ...lons.slice().reverse().map(lon => xy(inner, lon))]
      .map((p, i) => (i ? 'L' : 'M') + p.join(',')).join(' ') + ' Z';
  };
  const [px, py] = xy(coordinate.lat, coordinate.lon);
  return <section className="nasa-card">
    <h2>Measured hydrogen proxy</h2><p>{data.title} · {data.units}</p>
    {data.available ? <>
      <div className="nasa-metrics"><div><span>Selected site's native bin</span><strong>{data.selected_value_ppm === null ? 'Unknown' : data.selected_value_ppm.toFixed(2) + ' ppm H'}</strong></div>
        <div><span>Map extent</span><strong>{data.hemisphere === 'south' ? '75–90° S' : '75–90° N'}</strong></div></div>
      <div className="nasa-terrain-layout"><div><svg viewBox="0 0 500 500" role="img" aria-label="Lunar Prospector native polar hydrogen bins. Colours show hydrogen parts per million, not ice probability.">
        <circle cx="250" cy="250" r="210" fill="#152333" />
        {data.cells.map((c, i) => <path key={i} d={path(c)} fill={c.hydrogen_ppm === null ? '#293443' : 'hsl(' + (220 - 190 * c.hydrogen_ppm / maximum) + ' 65% 52%)'} stroke="#152333" strokeWidth=".7" onPointerEnter={() => setInspected(i)}>
          <title>{c.lat_min + ' to ' + c.lat_max + '° latitude, ' + c.lon_min + ' to ' + c.lon_max + '° longitude: ' + (c.hydrogen_ppm?.toFixed(2) ?? 'unknown') + ' ppm H'}</title>
        </path>)}
        {Math.abs(coordinate.lat) >= 75 && <circle cx={px} cy={py} r="5" fill="white" stroke="black" strokeWidth="2" />}
        <text x="250" y="23" textAnchor="middle" fill="#a7b9c9">0° E</text>
      </svg><label>Inspect native bin<input type="range" min="0" max={Math.max(0, data.cells.length - 1)} value={inspected ?? 0} onChange={e => setInspected(Number(e.target.value))} /></label></div>
      <div><h3>Native bin values</h3>
        {cell ? <p>{cell.lat_min} to {cell.lat_max}° latitude<br />{cell.lon_min} to {cell.lon_max}° longitude<br /><strong>{cell.hydrogen_ppm?.toFixed(2) ?? 'Unknown'} ppm H</strong></p> : <p>Hover over a bin or use the slider to inspect its original value and bounds.</p>}
        <p className="nasa-note">Blue → warm colours: 0 to {maximum.toFixed(1)} ppm. White dot: selected site when inside the polar extent. Bins keep their original boundaries; the map does not add spatial resolution.</p>
        <p className="nasa-note">{data.note}</p><p><a href={data.source_url} target="_blank" rel="noreferrer">Original table</a> · <a href={data.documentation_url} target="_blank" rel="noreferrer">Product documentation</a></p>
      </div></div>
    </> : <p className="nasa-note">No local hydrogen table is installed. {data.note}</p>}
  </section>;
}

import { useState } from 'react';
import type { LunarCoordinate } from '../lib/lunar';
import { CANDIDATE_REGIONS, CANDIDATE_REGIONS_SOURCE, GAZETTEER_URL, SOUTH_POLE_FEATURES } from '../lib/southPole';
import '../southpole.css';

type Site = LunarCoordinate & { name: string };

/**
 * Overhead map of the lunar south-polar cap (84°S to the pole).
 *
 * Azimuthal equidistant projection centred on 90°S: distance from the centre
 * is proportional to colatitude, 0° longitude points up and east longitudes
 * run clockwise, as on LROC/USGS south-polar maps. Craters are circles of
 * their USGS/IAU catalogue diameter, so sizes and spacing are to scale.
 * There is no terrain shading: this is a feature-location map.
 */

const KM_PER_DEG = (Math.PI * 1737.4) / 180; // 30.32 km per degree of colatitude
const SIZE = 360;
const C = SIZE / 2;
const EXTENT_DEG = 6;
const SCALE = (C - 16) / EXTENT_DEG; // px per degree

const project = (lat: number, lon: number) => {
  const r = (90 + lat) * SCALE;
  const a = (lon * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};
const unproject = (x: number, y: number): LunarCoordinate => {
  const dx = x - C;
  const dy = C - y;
  return { lat: -90 + Math.hypot(dx, dy) / SCALE, lon: (Math.atan2(dx, dy) * 180) / Math.PI };
};
const fmt = (p: LunarCoordinate) => `${Math.abs(p.lat).toFixed(2)}°S ${Math.abs(p.lon).toFixed(2)}°${p.lon < 0 ? 'W' : 'E'}`;

export function SouthPoleMap({ sites, selectedName, onSelect, selected = null }: {
  sites: Site[];
  selectedName: string;
  onSelect: (site: Site) => void;
  /** Currently selected point, drawn as a marker when it is on the map. */
  selected?: LunarCoordinate | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const features = SOUTH_POLE_FEATURES.filter((f) => 90 + f.lat - f.diameterKm / 2 / KM_PER_DEG <= EXTENT_DEG);
  // Regions sharing one anchor feature are drawn once, with all names in the tooltip.
  const regionGroups = Object.values(
    CANDIDATE_REGIONS.reduce<Record<string, { lat: number; lon: number; names: string[] }>>((acc, r) => {
      (acc[r.anchor] ??= { lat: r.lat, lon: r.lon, names: [] }).names.push(r.name);
      return acc;
    }, {})
  );
  const lowerName = selectedName.toLowerCase();
  const mark = selected && 90 + selected.lat <= EXTENT_DEG ? project(selected.lat, selected.lon) : null;

  return (
    <details className="sp-map">
      <summary>
        <span>South pole map</span>
        <small>{90 - EXTENT_DEG}°S to the pole · to scale</small>
      </summary>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Map of the lunar south pole with named craters, NASA candidate regions and preset sites. Click to select a point."
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const p = unproject(((e.clientX - box.left) / box.width) * SIZE, ((e.clientY - box.top) / box.height) * SIZE);
          if (90 + p.lat <= EXTENT_DEG) onSelect({ ...p, name: `Location ${fmt(p)}` });
        }}
      >
        <defs>
          <radialGradient id="sp-ground" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1b2540" />
            <stop offset="100%" stopColor="#0b1222" />
          </radialGradient>
          <clipPath id="sp-clip"><circle cx={C} cy={C} r={EXTENT_DEG * SCALE} /></clipPath>
        </defs>
        <circle cx={C} cy={C} r={EXTENT_DEG * SCALE} fill="url(#sp-ground)" stroke="#2c4372" strokeWidth="1.5" />

        <g clipPath="url(#sp-clip)">
          {[2, 4].map((d) => <circle key={d} cx={C} cy={C} r={d * SCALE} fill="none" stroke="#2a3d63" strokeDasharray="3 4" />)}
          {Array.from({ length: 12 }, (_, i) => i * 30).map((lon) => {
            const end = project(-90 + EXTENT_DEG, lon);
            return <line key={lon} x1={C} y1={C} x2={end.x} y2={end.y} stroke="#1e2d4c" />;
          })}

          {features.map((f) => {
            const p = project(f.lat, f.lon);
            const r = Math.max(3, (f.diameterKm / 2 / KM_PER_DEG) * SCALE);
            const active = lowerName.includes(f.name.toLowerCase());
            return (
              <g
                key={f.name}
                className={`sp-feature is-${f.kind}${active ? ' is-active' : ''}${hover === f.name ? ' is-hover' : ''}`}
                onMouseEnter={() => setHover(f.name)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); onSelect({ lat: f.lat, lon: f.lon, name: f.name }); }}
              >
                <circle cx={p.x} cy={p.y} r={r} />
                <text x={p.x} y={p.y + 4} textAnchor="middle">{f.name}</text>
                <title>{`${f.name} · ${f.kind === 'crater' ? `${f.diameterKm} km crater` : `mountain, ~${f.diameterKm} km`} · ${fmt(f)}${f.note ? `\n${f.note}` : ''}\nUSGS/IAU gazetteer ${GAZETTEER_URL}${f.gazetteerId}`}</title>
              </g>
            );
          })}

          {regionGroups.map((g) => {
            const p = project(g.lat, g.lon);
            return (
              <g key={g.names.join()} className="sp-region" onClick={(e) => { e.stopPropagation(); onSelect({ lat: g.lat, lon: g.lon, name: g.names[0] }); }}>
                <rect x={p.x - 6} y={p.y - 6} width={12} height={12} transform={`rotate(45 ${p.x} ${p.y})`} />
                <title>{`NASA candidate region${g.names.length > 1 ? 's' : ''}: ${g.names.join(', ')}\nShown at the nearest named feature; NASA publishes no centre coordinates.`}</title>
              </g>
            );
          })}

          {sites.filter((s) => 90 + s.lat <= EXTENT_DEG).map((s, i) => {
            const p = project(s.lat, s.lon);
            const active = s.name === selectedName;
            return (
              <g key={s.name} className={`sp-site${active ? ' is-active' : ''}`} onClick={(e) => { e.stopPropagation(); onSelect(s); }}>
                <circle cx={p.x} cy={p.y} r={active ? 8 : 7} />
                <text x={p.x} y={p.y + 4} textAnchor="middle">{i + 1}</text>
                <title>{`${s.name} · ${fmt(s)}`}</title>
              </g>
            );
          })}

          {mark && (
            <g className="sp-selected" pointerEvents="none">
              <circle cx={mark.x} cy={mark.y} r={11} />
              <circle cx={mark.x} cy={mark.y} r={2.5} />
            </g>
          )}
          <circle cx={C} cy={C} r={2.5} fill="#9beefc" />
        </g>

        {([[0, '0°'], [90, '90°E'], [180, '180°'], [-90, '90°W']] as const).map(([lon, label]) => {
          const p = project(-90 + EXTENT_DEG - 0.4, lon);
          return <text key={label} className="sp-edge" x={p.x} y={p.y + 4} textAnchor="middle">{label}</text>;
        })}
      </svg>

      <ol className="sp-sites">
        {sites.map((s, i) => (
          <li key={s.name}>
            <button type="button" className={selectedName === s.name ? 'is-active' : ''} onClick={() => onSelect(s)}>
              <span>{i + 1}</span>{s.name}
            </button>
          </li>
        ))}
      </ol>
      <ul className="sp-legend">
        <li><i className="is-crater" /> Crater, catalogue size</li>
        <li><i className="is-region" /> NASA candidate region</li>
        <li><i className="is-site" /> Preset site</li>
      </ul>
      <p className="sp-note">Craters and centres: USGS/IAU gazetteer. {CANDIDATE_REGIONS_SOURCE}</p>
    </details>
  );
}

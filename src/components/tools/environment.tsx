/** Surface temperature and Sun/Earth sky envelope. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BatteryCharging, BookOpen, Check, Compass, Copy, Crosshair, Droplets, Gauge,
  MapPinned, Mountain, Orbit, Radio, RotateCcw, Search, ShieldCheck, Signal, Sliders, Sun,
  Sunrise, Target, Thermometer
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LunarCoordinate } from '../../lib/lunar';
import { formatZonedDateTime, utcInput } from '../../lib/time';
import { landingScreen, orbitInsertion } from '../../lib/missionMath';
import type { ToolId, ToolInputs } from '../../lib/navigation';
import { ARTEMIS_CANDIDATE_SITES } from '../SiteComparisonView';
import { CANDIDATE_REGIONS } from '../../lib/southPole';

import { MOON_RADIUS_KM, EARTH_RADIUS_KM, SOLAR_CONSTANT, SIGMA, LIGHT_SPEED_KM_S, BOLTZMANN_DBW, LUNAR_OBLIQUITY_DEG, LIBRATION_LAT_DEG, LIBRATION_LON_DEG, rad, deg, fmt, signed, FormSection, Field, Segmented, CopyButton, Answer, Stats, Working, Notes, Bars, Inputs } from './shared';
import type { Preset, FieldProps, Tone } from './shared';

export function TemperatureTool() {
  const [solar, setSolar] = useState(SOLAR_CONSTANT);
  const [elev, setElev] = useState(90);
  const [albedo, setAlbedo] = useState(0.12);
  const [emis, setEmis] = useState(0.95);
  const [floorK, setFloorK] = useState(100);

  const tempAt = (e: number) => {
    const q = solar * Math.max(0, Math.sin(rad(e)));
    const eps = Math.max(0.01, emis);
    return Math.pow(((1 - albedo) * q + eps * SIGMA * floorK ** 4) / (eps * SIGMA), 0.25);
  };
  const q = solar * Math.max(0, Math.sin(rad(elev)));
  const absorbed = (1 - albedo) * q;
  const tK = tempAt(elev);
  const tC = tK - 273.15;

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Incident Solar Flux" icon={Sun}>
          <Field label="Sunlight strength" unit="W/m²" value={solar} onChange={setSolar} min={1300} max={1420}
            presets={[{ label: 'Far 1316', value: 1316 }, { label: 'Average 1361', value: 1361 }, { label: 'Near 1408', value: 1408 }]} />
          <Field label="Sun height above horizon" unit="°" value={elev} onChange={setElev} min={-10} max={90} step={0.1}
            presets={[{ label: 'Noon 90°', value: 90 }, { label: 'Afternoon 30°', value: 30 }, { label: 'Pole 1.5°', value: 1.5 }, { label: 'Night −10°', value: -10 }]} />
        </FormSection>

        <FormSection title="Regolith Thermal Properties" icon={Thermometer}>
          <Field label="Albedo (reflected)" value={albedo} onChange={setAlbedo} min={0.02} max={0.5} step={0.01}
            presets={[{ label: 'Mare 0.08', value: 0.08 }, { label: 'Highland 0.12', value: 0.12 }]} />
          <Field label="Emissivity (radiated)" value={emis} onChange={setEmis} min={0.5} max={1} step={0.01} />
          <Field label="Night-time baseline floor" unit="K" value={floorK} onChange={setFloorK} min={0} max={150}
            hint="Subsurface thermal inertia keeps polar/night ground near 100 K; deep PSRs reach ~40 K." />
        </FormSection>
      </Inputs>

      <div className="fx-results">
        <Answer
          tone={tC > 0 ? 'gold' : 'blue'}
          label="Surface temperature"
          value={`${fmt(tC, 1)} °C`}
          sub={`${fmt(tK, 1)} K`}
          copy={`Surface temperature: ${fmt(tC, 1)} °C (${fmt(tK, 1)} K) with Sun at ${elev}°, albedo ${albedo}, emissivity ${emis}.`}
        />
        <Stats items={[
          { label: 'Sunlight on ground', value: `${fmt(q, 0)} W/m²` },
          { label: 'Absorbed heat', value: `${fmt(absorbed, 0)} W/m²` },
          { label: 'Night floor', value: `${floorK} K`, note: `${fmt(floorK - 273.15, 0)} °C` }
        ]} />
        <section className="fx-card fx-mini-table">
          <h3>Equilibrium temperature at various solar elevations</h3>
          <table>
            <thead><tr><th scope="col">Sun height</th><th scope="col">Celsius</th><th scope="col">Kelvin</th></tr></thead>
            <tbody>
              {[90, 60, 30, 10, 1.5, 0].map((e) => (
                <tr key={e} className={e === elev ? 'is-active' : ''}>
                  <th scope="row">{e}°</th>
                  <td>{fmt(tempAt(e) - 273.15, 0)} °C</td>
                  <td>{fmt(tempAt(e), 0)} K</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <Working lines={[
          ['Energy balance', 'ε σ T⁴ = (1 − A) S sin(h) + ε σ T₀⁴'],
          ['Solved for T', 'T = [ ((1 − A) S sin(h) + ε σ T₀⁴) ÷ (ε σ) ]^¼'],
          ['Your numbers', `T = [ (${fmt(1 - albedo, 2)} × ${fmt(q, 1)} + ${emis} × σ × ${floorK}⁴) ÷ (${emis} × σ) ]^¼ = ${fmt(tK, 1)} K`]
        ]} />
        <Notes items={[
          'Instant equilibrium balance model without regolith heat capacity delay.',
          'Assumes flat horizontal terrain. Slopes facing the low polar Sun become significantly warmer.',
          'This browser calculation has not been calibrated against local Diviner observations; use it for first-order sensitivity only.'
        ]} />
      </div>
    </div>
  );
}

export function SkyTool({ coordinate }: { coordinate: LunarCoordinate | null }) {
  const [lat, setLat] = useState(coordinate?.lat ?? -89.54);
  const [lon, setLon] = useState(coordinate?.lon ?? 0);

  const phi = Math.min(90, Math.max(-90, lat));
  const absPhi = Math.abs(phi);
  const noonHigh = 90 - Math.max(0, absPhi - LUNAR_OBLIQUITY_DEG);
  const noonLow = 90 - (absPhi + LUNAR_OBLIQUITY_DEG);
  const midnightHigh = absPhi + LUNAR_OBLIQUITY_DEG - 90;
  const midnightLow = Math.max(0, absPhi - LUNAR_OBLIQUITY_DEG) - 90;

  const earth = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    const N = 24;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const bL = -LIBRATION_LAT_DEG + (2 * LIBRATION_LAT_DEG * i) / N;
        const lL = -LIBRATION_LON_DEG + (2 * LIBRATION_LON_DEG * j) / N;
        const cosD = Math.sin(rad(phi)) * Math.sin(rad(bL)) + Math.cos(rad(phi)) * Math.cos(rad(bL)) * Math.cos(rad(lon - lL));
        const e = 90 - deg(Math.acos(Math.min(1, Math.max(-1, cosD))));
        lo = Math.min(lo, e);
        hi = Math.max(hi, e);
      }
    }
    const meanCos = Math.cos(rad(phi)) * Math.cos(rad(lon));
    return { lo, hi, mean: 90 - deg(Math.acos(Math.min(1, Math.max(-1, meanCos)))) };
  }, [phi, lon]);

  const sunVerdict = midnightHigh > 0
    ? 'Polar region: in peak summer the Sun stays continuously above the horizon for extended periods.'
    : noonHigh <= 0 ? 'The Sun never rises at this coordinate.' : 'The Sun rises and sets once every 29.5-day synodic lunar day.';
  const earthVerdict = earth.lo > 0 ? 'Earth is continuously above horizon (reliable DTE link).' : earth.hi <= 0 ? 'Earth is never visible from this point (far side).' : 'Earth periodically dips below the horizon due to libration cycles.';
  const earthTone: Tone = earth.lo > 0 ? 'green' : earth.hi <= 0 ? 'red' : 'amber';

  const rows: [string, number][] = [
    ['Sun, highest at noon', noonHigh],
    ['Sun, lowest at noon', noonLow],
    ['Sun, highest at midnight', midnightHigh],
    ['Sun, lowest at midnight', midnightLow],
    ['Earth, highest libration peak', earth.hi],
    ['Earth, average position', earth.mean],
    ['Earth, lowest libration trough', earth.lo]
  ];

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Lunar Coordinates" icon={Compass}>
          <div className="fx-field-grid">
            <Field label="Latitude" unit="°" value={lat} onChange={setLat} min={-90} max={90} step={0.01}
              hint="Negative is South." />
            <Field label="Longitude" unit="°" value={lon} onChange={setLon} min={-180} max={180} step={0.01}
              hint="0° points to Earth." />
          </div>
          <div className="fx-presets">
            {ARTEMIS_CANDIDATE_SITES.slice(0, 4).map((s) => (
              <button key={s.id} type="button" className={Math.abs(s.lat - lat) < 0.05 && Math.abs(s.lon - lon) < 0.05 ? 'is-on' : ''}
                onClick={() => { setLat(s.lat); setLon(s.lon); }}>
                {s.name.split(' (')[0]}
              </button>
            ))}
          </div>
          <button type="button" className="fx-use-site" disabled={!coordinate}
            onClick={() => { if (coordinate) { setLat(coordinate.lat); setLon(coordinate.lon); } }}>
            <Crosshair size={15} /> Use current coordinate from top bar
          </button>
        </FormSection>
      </Inputs>

      <div className="fx-results">
        <div className="fx-answer-pair">
          <Answer tone="gold" label="Max Solar Elevation" value={`${fmt(noonHigh, 2)}°`} sub={sunVerdict}
            copy={`At ${fmt(lat, 2)}°, ${fmt(lon, 2)}°: Sun up to ${fmt(noonHigh, 2)}° high; Earth between ${fmt(earth.lo, 1)}° and ${fmt(earth.hi, 1)}°.`} />
          <Answer tone={earthTone} label="Earth Libration Range" value={`${fmt(earth.lo, 1)}° to ${fmt(earth.hi, 1)}°`} sub={earthVerdict} />
        </div>
        <section className="fx-card fx-mini-table">
          <h3>Geometric elevations above horizon</h3>
          <table>
            <tbody>
              {rows.map(([label, v]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className={v > 0 ? 'is-up' : 'is-down'}>{signed(v, 2)}°</td>
                  <td>{v > 0 ? 'above horizon' : 'below horizon'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <Working lines={[
          ['Sun at noon', `h = 90° − |φ − δ|,  δ between −${LUNAR_OBLIQUITY_DEG}° and +${LUNAR_OBLIQUITY_DEG}°`],
          ['Sun at midnight', 'h = |φ + δ| − 90°'],
          ['Earth', `h = 90° − angle to sub-Earth point (wanders ±${LIBRATION_LON_DEG}° lon, ±${LIBRATION_LAT_DEG}° lat)`]
        ]} />
        <Notes items={[
          'Geometric heights of center of disk over a smooth sphere. Real topography/mountains modify local horizons.',
          'Libration extrema represent envelope maxima; seasonal libration oscillates monthly.',
          'For accurate ephemerides on a specific date, cross-reference with the DTE Sky Plot view.'
        ]} />
      </div>
    </div>
  );
}

// ------------------------------------------------------- mission design tools

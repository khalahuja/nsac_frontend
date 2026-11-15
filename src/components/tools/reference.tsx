/** Physical constants. */
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

const CONSTANTS: { name: string; symbol: string; value: string; unit: string; note: string }[] = [
  { name: 'Mean lunar radius', symbol: 'R☾', value: '1737.4', unit: 'km', note: 'IAU reference sphere' },
  { name: 'Lunar surface gravity', symbol: 'g☾', value: '1.62', unit: 'm/s²', note: 'approx 1/6 Earth gravity' },
  { name: 'Lunar gravitational parameter', symbol: 'GM☾', value: '4902.800118', unit: 'km³/s²', note: 'JPL DE440' },
  { name: 'Earth gravitational parameter', symbol: 'GM⊕', value: '398600.435507', unit: 'km³/s²', note: 'JPL DE440' },
  { name: 'Solar constant at 1 AU', symbol: 'S', value: '1361', unit: 'W/m²', note: 'total solar irradiance' },
  { name: 'Stefan–Boltzmann constant', symbol: 'σ', value: '5.670374419 × 10⁻⁸', unit: 'W m⁻² K⁻⁴', note: 'CODATA, exact' },
  { name: 'Boltzmann constant', symbol: 'k', value: '1.380649 × 10⁻²³', unit: 'J/K', note: `exact; ${fmt(BOLTZMANN_DBW, 1)} dBW/(K·Hz)` },
  { name: 'Speed of light', symbol: 'c', value: '299,792.458', unit: 'km/s', note: 'exact in vacuum' },
  { name: 'Mean Earth–Moon distance', symbol: 'd', value: '384,400', unit: 'km', note: 'center to center' },
  { name: 'Synodic month (lunar day)', symbol: '', value: '29.530589', unit: 'days', note: 'full day/night cycle' },
  { name: 'Sidereal month', symbol: '', value: '27.321662', unit: 'days', note: 'inertial rotation period' },
  { name: 'Lunar obliquity to ecliptic', symbol: 'I', value: '1.54', unit: '°', note: 'causes polar grazing sunlight' },
  { name: 'Optical libration in longitude', symbol: '', value: '±7.9', unit: '°', note: 'maximum envelope' },
  { name: 'Optical libration in latitude', symbol: '', value: '±6.7', unit: '°', note: 'maximum envelope' },
  { name: 'Regolith albedo (typical)', symbol: 'A', value: '0.12', unit: '', note: 'highland reference albedo' },
  { name: 'Regolith infrared emissivity', symbol: 'ε', value: '0.95', unit: '', note: 'lunar surface thermal model' }
];

export function ConstantsTool() {
  return (
    <div className="fx-body is-single">
      <section className="fx-card fx-constants">
        <table>
          <thead><tr><th scope="col">Quantity</th><th scope="col">Symbol</th><th scope="col">Value</th><th scope="col">Notes</th><th scope="col"><span className="fx-sr">Copy</span></th></tr></thead>
          <tbody>
            {CONSTANTS.map((c) => (
              <tr key={c.name}>
                <th scope="row">{c.name}</th>
                <td className="fx-symbol">{c.symbol}</td>
                <td className="fx-value">{c.value} <small>{c.unit}</small></td>
                <td className="fx-note">{c.note}</td>
                <td><CopyButton text={`${c.name}: ${c.value} ${c.unit}`.trim()} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------- page

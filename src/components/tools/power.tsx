/** Solar array and battery sizing. */
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

type Orientation = 'vertical' | 'horizontal' | 'tracking';
const ORIENTATION_LABEL: Record<Orientation, string> = {
  vertical: 'Vertical, turned to Sun',
  horizontal: 'Flat on ground',
  tracking: 'Two-axis tracker'
};

export function SolarTool() {
  const [flux, setFlux] = useState(SOLAR_CONSTANT);
  const [area, setArea] = useState(100);
  const [eff, setEff] = useState(30);
  const [elev, setElev] = useState(1.5);
  const [orientation, setOrientation] = useState<Orientation>('vertical');
  const [loss, setLoss] = useState(10);
  const [sunlit, setSunlit] = useState(100);

  const factor = (o: Orientation) =>
    elev <= 0 ? 0 : o === 'tracking' ? 1 : o === 'vertical' ? Math.cos(rad(elev)) : Math.sin(rad(elev));
  const powerW = (o: Orientation) => area * (eff / 100) * flux * factor(o) * (1 - loss / 100);
  const p = powerW(orientation);
  const dailyKwh = (p / 1000) * 24 * (sunlit / 100);

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Solar Illumination" icon={Sun}>
          <Field label="Sunlight strength" unit="W/m²" value={flux} onChange={setFlux} min={1300} max={1420}
            presets={[{ label: 'Far 1316', value: 1316 }, { label: 'Average 1361', value: 1361 }, { label: 'Near 1408', value: 1408 }]}
            hint="Changes over the year as Earth & Moon orbit the Sun." />
          <Field label="Sun height above horizon" unit="°" value={elev} onChange={setElev} min={-5} max={90} step={0.1}
            presets={[{ label: 'Pole 1.5°', value: 1.5 }, { label: 'Mid-lat 45°', value: 45 }, { label: 'Equator noon 90°', value: 90 }]} />
          <Field label="Share of the day in sunlight" unit="%" value={sunlit} onChange={setSunlit} min={0} max={100}
            hint="Used for daily energy. Compare Sites shows this for real terrain." />
        </FormSection>

        <FormSection title="Array Geometry & Efficiency" icon={Sliders}>
          <Field label="Panel area" unit="m²" value={area} onChange={setArea} min={1} max={1000} />
          <Field label="Cell efficiency" unit="%" value={eff} onChange={setEff} min={5} max={50} step={0.5}
            presets={[{ label: 'Si 20%', value: 20 }, { label: '3-Junc 30%', value: 30 }]} />
          <Segmented label="Mounting orientation" value={orientation} onChange={setOrientation}
            options={(Object.keys(ORIENTATION_LABEL) as Orientation[]).map((o) => ({ value: o, label: ORIENTATION_LABEL[o] }))} />
          <Field label="Losses (dust, wiring, thermal)" unit="%" value={loss} onChange={setLoss} min={0} max={50} />
        </FormSection>
      </Inputs>

      <div className="fx-results">
        <Answer
          tone="gold"
          label="Electrical power"
          value={`${fmt(p / 1000, 2)} kW`}
          sub={elev <= 0 ? 'The Sun is below the horizon, so the panels make no power.' : `${fmt(p, 0)} W from ${fmt(area, 0)} m² of panels`}
          copy={`Solar power: ${fmt(p / 1000, 2)} kW from ${area} m² at ${eff}% efficiency, Sun elevation ${elev}°, ${ORIENTATION_LABEL[orientation].toLowerCase()}.`}
        />
        <Stats items={[
          { label: 'Energy per 24 hours', value: `${fmt(dailyKwh, 1)} kWh`, note: `${sunlit}% sunlit share` },
          { label: 'Power per unit area', value: `${fmt(p / Math.max(1, area), 1)} W/m²` },
          { label: 'Tracking gain', value: factor('tracking') > 0 ? `${fmt((factor('tracking') / Math.max(1e-6, factor(orientation))) * 100 - 100, 0)}%` : '—' }
        ]} />
        <Bars
          title="Power with different mountings"
          unit="kW"
          rows={[
            { label: 'Two-axis tracking', value: powerW('tracking') / 1000, active: orientation === 'tracking' },
            { label: 'Vertical, facing Sun', value: powerW('vertical') / 1000, active: orientation === 'vertical' },
            { label: 'Flat on ground', value: powerW('horizontal') / 1000, active: orientation === 'horizontal' }
          ]}
          note="Near the south pole, vertical panels face a low Sun far better than flat panels."
        />
        <Working lines={[
          ['Equation', 'P = A × η × S × cos(θ) × (1 − loss)'],
          ['Your numbers', `P = ${area} m² × ${fmt(eff / 100, 2)} × ${flux} W/m² × ${fmt(factor(orientation), 3)} × ${fmt(1 - loss / 100, 2)}`],
          ['Result', `P = ${fmt(p, 0)} W = ${fmt(p / 1000, 2)} kW`]
        ]} />
        <Notes items={[
          'Ignores shadows from nearby terrain. Use the Moon or DTE Sky Plot pages for a real site.',
          'Assumes vertical panels turn to follow the Sun across the sky. Fixed vertical panels make less power when the Sun is off to one side.',
          'Cell efficiency is taken at its rated value; real cells lose some efficiency as they heat up.'
        ]} />
      </div>
    </div>
  );
}

// Only sites with a published longest-darkness value (see SiteComparisonView sources).
const DARKNESS_PRESETS = ARTEMIS_CANDIDATE_SITES.flatMap((s) => {
  if (s.maxShadowHours === null) return [];
  const short = s.name.replace(' (Mare Tranquillitatis)', '');
  return [{ label: `${short} ${s.maxShadowHours}h`, short, value: s.maxShadowHours }];
});

export function BatteryTool() {
  const [load, setLoad] = useState(10);
  const [hours, setHours] = useState(64);
  const [dod, setDod] = useState(80);
  const [specific, setSpecific] = useState(200);
  const [margin, setMargin] = useState(0);

  const sizeKwh = (h: number) => ((load * h) / (Math.max(1, dod) / 100)) * (1 + margin / 100);
  const usable = load * hours;
  const nameplate = sizeKwh(hours);
  const massKg = (nameplate * 1000) / Math.max(1, specific);

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Mission Load & Darkness" icon={BatteryCharging}>
          <Field label="Power needed during darkness" unit="kW" value={load} onChange={setLoad} min={0.1} max={100} step={0.1}
            hint="Heaters, life support, communications and computers that must keep running." />
          <Field label="Longest darkness" unit="h" value={hours} onChange={setHours} min={1} max={360}
            presets={DARKNESS_PRESETS.map(({ label, value }) => ({ label, value }))}
            hint="Presets are published longest-darkness values for those exact points (Gläser et al. 2018, 2 m height; Apollo 11 from orbital geometry). See Compare Sites → Notes and sources." />
        </FormSection>

        <FormSection title="Battery Chemistry & Margin" icon={Sliders}>
          <Field label="Depth of discharge" unit="%" value={dod} onChange={setDod} min={10} max={100}
            hint="80% preserves battery cycle life." />
          <Field label="Battery energy density" unit="Wh/kg" value={specific} onChange={setSpecific} min={50} max={500} step={5}
            presets={[{ label: 'Space Li-ion 150', value: 150 }, { label: 'Modern 200', value: 200 }]} />
          <Field label="Design margin" unit="%" value={margin} onChange={setMargin} min={0} max={100}
            hint="Extra capacity for cell degradation and thermal cold." />
        </FormSection>
      </Inputs>

      <div className="fx-results">
        <Answer
          tone="blue"
          label="Battery size needed"
          value={`${fmt(nameplate, 0)} kWh`}
          sub={`weighing about ${fmt(massKg, 0)} kg (${fmt(massKg / 1000, 2)} tonnes)`}
          copy={`Battery: ${fmt(nameplate, 0)} kWh, about ${fmt(massKg, 0)} kg, for ${load} kW over ${hours} h of darkness at ${dod}% depth of discharge.`}
        />
        <Stats items={[
          { label: 'Energy actually used', value: `${fmt(usable, 0)} kWh` },
          { label: 'Battery mass', value: `${fmt(massKg, 0)} kg` },
          { label: 'Mass per hour of darkness', value: `${fmt(massKg / Math.max(1, hours), 1)} kg/h` }
        ]} />
        <Bars
          title={`Battery mass for published darkness durations (${load} kW load)`}
          unit="kg"
          digits={0}
          rows={DARKNESS_PRESETS.map((s) => ({
            label: `${s.short} · ${s.value} h`,
            value: (sizeKwh(s.value) * 1000) / Math.max(1, specific),
            active: s.value === hours
          }))}
          note="Darkness durations are published values for those points. Well-lit polar ridges go dark for 3–7 days at most; the equator stays dark for about 15 days."
        />
        <Working lines={[
          ['Equation', 'E = (P × t) ÷ DoD × (1 + margin)     mass = E ÷ e'],
          ['Your numbers', `E = (${load} kW × ${hours} h) ÷ ${fmt(dod / 100, 2)} × ${fmt(1 + margin / 100, 2)}`],
          ['Result', `E = ${fmt(nameplate, 1)} kWh     mass = ${fmt(nameplate * 1000, 0)} Wh ÷ ${specific} Wh/kg = ${fmt(massKg, 0)} kg`]
        ]} />
        <Notes items={[
          'Battery mass only: no casing, wiring, heaters or radiators.',
          'Assumes the load stays constant through darkness and the battery is fully charged when sunset begins.',
          'Charge and discharge losses are not included; add them through the design margin.'
        ]} />
      </div>
    </div>
  );
}

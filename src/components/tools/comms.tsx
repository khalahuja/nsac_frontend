/** Radio link budget and surface line of sight. */
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

const BANDS = [
  { label: 'S-band 2.2 GHz', value: 2.2 },
  { label: 'X-band 8.4 GHz', value: 8.4 },
  { label: 'Ka-band 26 GHz', value: 26 }
];

export function LinkTool() {
  const [freq, setFreq] = useState(8.4);
  const [dist, setDist] = useState(384400);
  const [txW, setTxW] = useState(20);
  const [txGain, setTxGain] = useState(30);
  const [rxGain, setRxGain] = useState(68);
  const [noiseK, setNoiseK] = useState(50);
  const [losses, setLosses] = useState(3);
  const [rateKbps, setRateKbps] = useState(1000);
  const [required, setRequired] = useState(2.5);

  const latency = dist / LIGHT_SPEED_KM_S;
  const fspl = 20 * Math.log10(dist) + 20 * Math.log10(freq * 1000) + 32.44;
  const txDbw = 10 * Math.log10(Math.max(1e-6, txW));
  const eirp = txDbw + txGain;
  const received = eirp - fspl + rxGain - losses;
  const rateHz = Math.max(1, rateKbps * 1000);
  const rateDb = 10 * Math.log10(rateHz);
  const kDbw = BOLTZMANN_DBW;
  const noiseDbw = 10 * Math.log10(Math.max(1, noiseK));
  const ebn0 = received - (kDbw + noiseDbw + rateDb);
  const margin = ebn0 - required;

  const maxRateBps = Math.pow(10, (received - (kDbw + noiseDbw) - (required + 3)) / 10);
  const rateText = (bps: number) =>
    bps >= 1e9 ? `${fmt(bps / 1e9, 2)} Gbps` : bps >= 1e6 ? `${fmt(bps / 1e6, 2)} Mbps` : `${fmt(bps / 1e3, 0)} kbps`;

  const tone: Tone = margin >= 3 ? 'green' : margin >= 0 ? 'amber' : 'red';
  const verdict = margin >= 3
    ? 'The link closes with a healthy margin.'
    : margin >= 0
      ? 'The link closes, but has less than 3 dB of margin for rain or pointing error.'
      : `The link is negative by ${fmt(Math.abs(margin))} dB. More transmitter power, a bigger dish, or a lower data rate is needed.`;

  const budget: [string, string, number?][] = [
    ['Transmitter RF power', `${fmt(txW, 0)} W`, txDbw],
    ['Transmit antenna gain', 'Moon lander or rover', txGain],
    ['Equivalent isotropic radiated power (EIRP)', 'total power beamed toward Earth', undefined],
    ['Free-space path loss', `${fmt(dist, 0)} km at ${freq} GHz`, -fspl],
    ['Receive antenna gain', 'Earth station dish', rxGain],
    ['Other losses', 'pointing error, polarisation, atmosphere', -losses],
    ['Received power', 'at the Earth receiver', undefined],
    ['Boltzmann constant (k)', 'thermal noise density', -kDbw],
    ['Noise temperature (T)', `${noiseK} K`, -noiseDbw],
    ['Data rate bandwidth', rateText(rateHz), -rateDb],
    ['Received Eb/N₀', 'signal energy per bit over noise density', undefined],
    ['Required Eb/N₀', 'set by the coding scheme', -required],
    ['Link margin', 'spare capacity before errors rise', undefined]
  ];

  const totals: Record<string, number> = {
    'Equivalent isotropic radiated power (EIRP)': eirp,
    'Received power': received,
    'Received Eb/N₀': ebn0,
    'Link margin': margin
  };

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Carrier & Orbit Geometry" icon={Radio}>
          <div className="fx-field">
            <span className="fx-field-label">Radio frequency band</span>
            <div className="fx-presets">
              {BANDS.map((b) => (
                <button key={b.label} type="button" className={b.value === freq ? 'is-on' : ''} onClick={() => setFreq(b.value)}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Distance to Earth" unit="km" value={dist} onChange={setDist} min={350000} max={410000} step={1000}
            presets={[{ label: 'Closest 363,300', value: 363300 }, { label: 'Average 384,400', value: 384400 }, { label: 'Furthest 405,500', value: 405500 }]} />
        </FormSection>

        <FormSection title="Lunar Transmitter" icon={Signal}>
          <Field label="Transmitter power" unit="W" value={txW} onChange={setTxW} min={1} max={200}
            presets={[{ label: 'Rover 5 W', value: 5 }, { label: 'Lander 20 W', value: 20 }, { label: 'High 100 W', value: 100 }]} />
          <Field label="Transmit gain" unit="dBi" value={txGain} onChange={setTxGain} min={0} max={50} step={0.5}
            presets={[{ label: 'Omni 3', value: 3 }, { label: 'Patch 8', value: 8 }, { label: 'Dish 30', value: 30 }]} />
        </FormSection>

        <FormSection title="Earth Ground Station" icon={Mountain}>
          <Field label="Earth dish gain" unit="dBi" value={rxGain} onChange={setRxGain} min={20} max={85} step={0.5}
            hint="~68 dBi for 34 m DSN dish." />
          <Field label="Noise temperature" unit="K" value={noiseK} onChange={setNoiseK} min={10} max={1000} />
          <Field label="Other losses" unit="dB" value={losses} onChange={setLosses} min={0} max={20} step={0.5} />
        </FormSection>

        <FormSection title="Data Stream & Modulation" icon={Gauge}>
          <Field label="Data rate" unit="kbps" value={rateKbps} onChange={setRateKbps} min={1} max={100000} slider={false}
            presets={[{ label: '10 kbps', value: 10 }, { label: '1 Mbps', value: 1000 }, { label: '10 Mbps', value: 10000 }]} />
          <Field label="Required Eb/N₀" unit="dB" value={required} onChange={setRequired} min={0} max={15} step={0.1}
            hint="~2.5 dB for turbo/LDPC." />
        </FormSection>
      </Inputs>

      <div className="fx-results">
        <Answer
          tone={tone}
          label="Link margin"
          value={`${signed(margin)} dB`}
          sub={verdict}
          copy={`Link budget: margin ${signed(margin)} dB at ${rateText(rateKbps * 1000)}, ${freq} GHz, ${dist.toLocaleString()} km; path loss ${fmt(fspl)} dB; one-way delay ${fmt(latency, 3)} s.`}
        />
        <Stats items={[
          { label: 'Max rate (3 dB margin)', value: rateText(maxRateBps) },
          { label: 'One-way delay', value: `${fmt(latency, 3)} s`, note: `RTT ${fmt(latency * 2, 2)} s` },
          { label: 'Free-space path loss', value: `${fmt(fspl)} dB` }
        ]} />
        <section className="fx-card fx-budget">
          <h3>Link budget, line by line</h3>
          <table>
            <tbody>
              {budget.map(([label, detail, value]) => {
                const total = totals[label];
                return (
                  <tr key={label} className={total !== undefined ? 'is-total' : ''}>
                    <th scope="row">{label}{detail && <small>{detail}</small>}</th>
                    <td>{total !== undefined ? fmt(total) : signed(value ?? 0)}</td>
                    <td className="fx-budget-unit">{label === 'Received power' ? 'dBW' : 'dB'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <Working lines={[
          ['Path loss', `FSPL = 20 log₁₀(d km) + 20 log₁₀(f MHz) + 32.44 = ${fmt(fspl, 2)} dB`],
          ['Received power', `Pᵣ = Pₜ + Gₜ − FSPL − L + Gᵣ = ${fmt(received, 2)} dBW`],
          ['Signal to noise', `Eb/N₀ = Pᵣ − 10 log₁₀(k T) − 10 log₁₀(R) = ${fmt(ebn0, 2)} dB`],
          ['Delay', `t = d ÷ c = ${dist.toLocaleString()} km ÷ 299,792 km/s = ${fmt(latency, 3)} s`]
        ]} />
        <Notes items={[
          'Antenna gains and noise temperature are example values; replace them with your hardware specifications.',
          'Only works while Earth is above your local horizon. Verify with the DTE Sky Plot view.',
          'Ignores Earth\'s atmosphere and rain fade, which matter most at Ka-band; add them to Other losses.'
        ]} />
      </div>
    </div>
  );
}

export function LineOfSightTool() {
  const [h1, setH1] = useState(3);
  const [h2, setH2] = useState(1.5);
  const [target, setTarget] = useState(5);

  const horizonKm = (hM: number, r: number) => Math.sqrt(2 * r * (hM / 1000) + (hM / 1000) ** 2);
  const d1 = horizonKm(Math.max(0, h1), MOON_RADIUS_KM);
  const d2 = horizonKm(Math.max(0, h2), MOON_RADIUS_KM);
  const total = d1 + d2;
  const earthTotal = horizonKm(Math.max(0, h1), EARTH_RADIUS_KM) + horizonKm(Math.max(0, h2), EARTH_RADIUS_KM);
  const remaining = target - d2;
  const neededH1 = remaining <= 0 ? 0 : (Math.sqrt(MOON_RADIUS_KM ** 2 + remaining ** 2) - MOON_RADIUS_KM) * 1000;
  const inView = target <= total;

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Antenna Elevations" icon={Mountain}>
          <Field label="Antenna 1 (e.g. lander mast)" unit="m" value={h1} onChange={setH1} min={0} max={50} step={0.1}
            presets={[{ label: 'Lander 3 m', value: 3 }, { label: 'Tower 10 m', value: 10 }, { label: 'Tall 30 m', value: 30 }]} />
          <Field label="Antenna 2 (e.g. rover)" unit="m" value={h2} onChange={setH2} min={0} max={50} step={0.1}
            presets={[{ label: 'Rover 1.5 m', value: 1.5 }, { label: 'Crew 2 m', value: 2 }]} />
        </FormSection>

        <FormSection title="Surface Separation" icon={Compass}>
          <Field label="Distance between antennas" unit="km" value={target} onChange={setTarget} min={0.1} max={20} step={0.1} />
        </FormSection>
      </Inputs>

      <div className="fx-results">
        <Answer
          tone={inView ? 'green' : 'red'}
          label="Line-of-sight horizon range"
          value={`${fmt(total, 2)} km`}
          sub={inView
            ? `At ${target} km both antennas are in line of sight.`
            : `At ${target} km lunar curvature blocks the line. Antenna 1 would need to be ${fmt(neededH1, 1)} m tall.`}
          copy={`Line of sight: ${fmt(total, 2)} km between antennas ${h1} m and ${h2} m high on a smooth Moon; a ${target} km link is ${inView ? 'in view' : 'blocked'}.`}
        />
        <Stats items={[
          { label: 'Horizon from antenna 1', value: `${fmt(d1, 2)} km` },
          { label: 'Horizon from antenna 2', value: `${fmt(d2, 2)} km` },
          { label: 'Same antennas on Earth', value: `${fmt(earthTotal, 2)} km`, note: 'Moon curves 3.7× faster' }
        ]} />
        <Working lines={[
          ['Equation', 'd = √(2 R h + h²)  for each antenna, then add the two'],
          ['Your numbers', `√(2 × ${MOON_RADIUS_KM} km × ${fmt(h1 / 1000, 4)} km) + √(2 × ${MOON_RADIUS_KM} km × ${fmt(h2 / 1000, 4)} km)`],
          ['Result', `${fmt(d1, 3)} km + ${fmt(d2, 3)} km = ${fmt(total, 3)} km`],
          ['Height needed', `h₁ = √(R² + (D − d₂)²) − R = ${fmt(neededH1, 2)} m`]
        ]} />
        <Notes items={[
          `Calculated for a smooth sphere of radius ${MOON_RADIUS_KM} km. Craters, ridges and boulders can block or elevate the view.`,
          'Line of sight is mandatory for lunar surface comms as the Moon has no atmosphere or ionosphere to refract VHF/UHF waves.'
        ]} />
      </div>
    </div>
  );
}

/** Landing confidence, orbit timeline, water evidence and candidate sites. */
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

export function LandingConfidenceTool({ inputs = {} }: { inputs?: ToolInputs }) {
  const [sigma, setSigma] = useState(inputs.sigma_m ?? 35);
  const [radius, setRadius] = useState(inputs.radius_m ?? 100);
  const [safeTerrain, setSafeTerrain] = useState(inputs.safe_terrain_pct ?? 96);
  const [vehicleSuccess, setVehicleSuccess] = useState(inputs.vehicle_success_pct ?? 99.5);
  let containment = NaN, combined = NaN, validation = '';
  try { ({ containment, combined } = landingScreen(sigma, radius, safeTerrain, vehicleSuccess)); }
  catch (error) { validation = (error as Error).message; }

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Touchdown dispersion" icon={Crosshair}>
          <Field label="Horizontal 1-sigma error" unit="m" value={sigma} onChange={setSigma} min={1} max={250} step={1} hint="Assumes equal, independent north/east Gaussian errors." />
          <Field label="Target radius" unit="m" value={radius} onChange={setRadius} min={10} max={1000} step={5} hint="Artemis lander requirement: touch down within 100 m of the target. Apollo 11's landing ellipse was 17 × 5 km; Chandrayaan-3's landing area 4 × 2.4 km."
            presets={[{ label: 'Artemis 100 m', value: 100 }, { label: 'Chandrayaan-3 ~1.2 km', value: 1200 }]} />
        </FormSection>
        <FormSection title="Independent screening factors" icon={ShieldCheck}>
          <Field label="Hazard-free terrain fraction" unit="%" value={safeTerrain} onChange={setSafeTerrain} min={0} max={100} step={0.5}
            hint="Share of the target area within your slope and hazard limits. For reference, Chandrayaan-3's primary site had slopes under 4° over ~78 % of its area. Slope limits: Artemis < 10°, Apollo and Chandrayaan-3 ≤ 12°." />
          <Field label="Vehicle success assumption" unit="%" value={vehicleSuccess} onChange={setVehicleSuccess} min={0} max={100} step={0.1} />
        </FormSection>
      </Inputs>
      <div className="fx-results">
        {validation && <p className="fx-validation" role="alert">{validation}</p>}
        {!validation && <>
        <Answer label="Screening landing confidence" value={`${fmt(combined * 100, 1)}%`} tone={combined >= .9 ? 'green' : combined >= .7 ? 'amber' : 'red'} sub="A transparent planning estimate, not a certified probability of mission success." copy={`Landing screening estimate: ${(combined * 100).toFixed(1)}%`} />
        <Stats items={[
          { label: 'Inside target', value: `${fmt(containment * 100, 1)}%`, note: '2-D Gaussian containment' },
          { label: 'Outside target', value: `${fmt((1 - containment) * 100, 1)}%` },
          { label: 'Target diameter', value: `${fmt(radius * 2, 0)} m` }
        ]} />
        <Working lines={[
          ['Containment', `P(r <= R) = 1 - exp[-R^2 / (2 sigma^2)] = ${(containment * 100).toFixed(2)}%`],
          ['Combined screen', `${(containment * 100).toFixed(2)}% x ${safeTerrain}% x ${vehicleSuccess}% = ${(combined * 100).toFixed(2)}%`]
        ]} />
        <Notes items={[
          <>The dispersion model is circular and Gaussian. Real guidance errors can be biased, correlated and non-Gaussian.</>,
          <>Terrain and vehicle terms are user assumptions and are multiplied as independent events. Correlation would change the result.</>,
          <>Use this to compare assumptions. A flight probability requires validated Monte Carlo models, hazard maps and vehicle reliability evidence.</>,
          <>No official boulder-size limit has been published for Artemis landers or Chandrayaan-3, so none is assumed here.</>
        ]} />
        </>}
      </div>
    </div>
  );
}

export function OrbitTimelineTool({ timeZone, inputs = {} }: { timeZone: string; inputs?: ToolInputs }) {
  const [vInfinity, setVInfinity] = useState(inputs.v_infinity_km_s ?? .8);
  const [periapsis, setPeriapsis] = useState(inputs.periapsis_km ?? 100);
  const [apoapsis, setApoapsis] = useState(inputs.apoapsis_km ?? 100);
  const [coastDays, setCoastDays] = useState(inputs.coast_days ?? 4.5);
  const [start, setStart] = useState(inputs.departure_local ?? '2027-01-03T12:00');
  const [checkoutHours, setCheckoutHours] = useState(inputs.checkout_hours ?? 12);
  const [waitOrbits, setWaitOrbits] = useState(inputs.wait_orbits ?? 3);
  const [descentOrbitMinutes, setDescentOrbitMinutes] = useState(inputs.descent_orbit_minutes ?? 120);
  const [poweredMinutes, setPoweredMinutes] = useState(inputs.powered_minutes ?? 15);
  let approachSpeed = NaN, orbitSpeed = NaN, loi = NaN, orbitalPeriodHours = NaN, validation = '', base = NaN;
  try {
    ({ approachSpeed, orbitSpeed, loi, orbitalPeriodHours } = orbitInsertion(vInfinity, periapsis, apoapsis));
    base = Date.parse(utcInput(start, timeZone));
    if (coastDays <= 0 || checkoutHours < 0 || waitOrbits < 0 || descentOrbitMinutes <= 0 || poweredMinutes <= 0) throw new Error('Use positive coast and descent times; checkout and waiting cannot be negative.');
  } catch (error) { validation = (error as Error).message; }
  const arrival = coastDays * 24;
  const checked = arrival + checkoutHours;
  const descent = checked + waitOrbits * orbitalPeriodHours;
  const powered = descent + descentOrbitMinutes / 60;
  const phases = [
    ['Trans-lunar injection', 0],
    ['Lunar arrival / LOI', arrival],
    ['Orbit checkout complete', checked],
    ['Descent orbit initiation', descent],
    ['Powered descent start', powered],
    ['Touchdown target', powered + poweredMinutes / 60]
  ] as const;
  const dateText = (hours: number) => !validation && Number.isFinite(hours) ? formatZonedDateTime(new Date(base + hours * 3_600_000), timeZone) : 'Check inputs';

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Patched-conic arrival" icon={Orbit}>
          <Field label="Arrival hyperbolic excess speed" unit="km/s" value={vInfinity} onChange={setVInfinity} min={0.1} max={2.5} step={0.05} />
          <Field label="Perilune altitude" unit="km" value={periapsis} onChange={setPeriapsis} min={15} max={1000} step={5} />
          <Field label="Apolune altitude" unit="km" value={apoapsis} onChange={setApoapsis} min={15} max={10000} step={10} />
          <Field label="Earth-Moon coast" unit="days" value={coastDays} onChange={setCoastDays} min={2.5} max={10} step={0.05}
            presets={[{ label: 'Apollo 11 3.05 d', value: 3.05 }, { label: 'Artemis I ~5 d', value: 5 }]}
            hint="Apollo 11: 73.1 h from trans-lunar injection to lunar orbit insertion (mission report MSC-00171)." />
        </FormSection>
        <FormSection title="Landing sequence assumptions" icon={Orbit}>
          <Field label="Orbit checkout" unit="h" value={checkoutHours} onChange={setCheckoutHours} min={0} max={168} step={1} />
          <Field label="Wait after checkout" unit="orbits" value={waitOrbits} onChange={setWaitOrbits} min={0} max={100} step={1} />
          <Field label="Descent-orbit coast" unit="min" value={descentOrbitMinutes} onChange={setDescentOrbitMinutes} min={1} max={360} step={1} />
          <Field label="Powered descent" unit="min" value={poweredMinutes} onChange={setPoweredMinutes} min={1} max={120} step={0.1}
            presets={[{ label: 'Apollo 11 12.6 min', value: 12.6 }]} />
          <div className="fx-field fx-date-field"><label htmlFor="mission-start">Departure · {timeZone}</label><input id="mission-start" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></div>
        </FormSection>
      </Inputs>
      <div className="fx-results">
        {validation && <p className="fx-validation" role="alert">{validation}</p>}
        {!validation && <>
        <Answer label="Ideal lunar orbit insertion burn" value={`${fmt(loi, 3)} km/s`} tone="gold" sub="Impulsive, coplanar burn at perilune; margins and finite-burn losses excluded." copy={`Ideal LOI delta-v: ${loi.toFixed(3)} km/s`} />
        <Stats items={[
          { label: 'Arrival speed at perilune', value: `${fmt(approachSpeed, 3)} km/s` },
          { label: 'Post-LOI perilune speed', value: `${fmt(orbitSpeed, 3)} km/s` },
          { label: 'Orbit period', value: `${fmt(orbitalPeriodHours, 2)} h` }
        ]} />
        <section className="fx-card fx-timeline"><h3>Planning timeline</h3><ol>{phases.map(([name, hours], index) => <li key={name}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{name}</strong><small>{dateText(hours)} · T+{fmt(hours, 1)} h</small></div></li>)}</ol></section>
        <Working lines={[
          ['Approach speed', `v_p = sqrt(v_inf^2 + 2 mu/r_p) = ${fmt(approachSpeed, 3)} km/s`],
          ['Target-orbit speed', `v_p = sqrt[mu(2/r_p - 1/a)] = ${orbitSpeed.toFixed(3)} km/s`],
          ['Insertion burn', `Delta-v_LOI = ${approachSpeed.toFixed(3)} - ${orbitSpeed.toFixed(3)} = ${loi.toFixed(3)} km/s`]
        ]} />
        <Notes items={[
          <>Uses lunar GM = 4,902.800066 km³/s² (JPL DE430; DE440 gives 4,902.800118, a negligible difference) and mean radius 1,737.4 km.</>,
          <>Reference: Apollo 11's LOI burn was 889 m/s into a 60 × 170 nmi orbit; NASA's 2005 architecture study budgets 845–1,390 m/s for LOI and ~1,900 m/s for descent. No authoritative NRHO insertion value is used here.</>,
          <>The timeline after LOI is an editable planning scaffold, not an optimized trajectory. NRHO and powered descent require numerical propagation.</>,
          <>Add navigation, plane-change, finite-burn, hover, divert, reserve and contingency margins before sizing propulsion.</>
        ]} />
        </>}
      </div>
    </div>
  );
}

type EvidenceLevel = 'none' | 'possible' | 'strong';
export function WaterEvidenceTool({ coordinate, inputs = {} }: { coordinate: LunarCoordinate | null; inputs?: ToolInputs }) {
  const [latitude, setLatitude] = useState(inputs.absolute_latitude ?? Math.abs(coordinate?.lat ?? -89.54));
  const [temperature, setTemperature] = useState(inputs.max_temperature_k ?? 110);
  const [thermalKnown, setThermalKnown] = useState(inputs.thermal_confirmed ?? false);
  const [psr, setPsr] = useState<'yes' | 'no'>(inputs.psr_confirmed ? 'yes' : 'no');
  const [hydrogen, setHydrogen] = useState<EvidenceLevel>(inputs.hydrogen ?? 'none');
  const [radar, setRadar] = useState<EvidenceLevel>(inputs.radar ?? 'none');
  const previousCoordinate = useRef(coordinate);
  useEffect(() => {
    const previous = previousCoordinate.current;
    if (coordinate && (previous?.lat !== coordinate.lat || previous?.lon !== coordinate.lon)) {
      setLatitude(Math.abs(coordinate.lat)); setThermalKnown(false); setPsr('no'); setHydrogen('none'); setRadar('none');
    }
    previousCoordinate.current = coordinate;
  }, [coordinate]);
  const signal = (value: EvidenceLevel, weight: number) => value === 'strong' ? weight : value === 'possible' ? weight * .5 : 0;
  // Li et al. 2018 (M3): all surface-ice detections lie within 20° of a pole and >90 % within 10°.
  const latitudeScore = latitude >= 80 ? 10 : latitude >= 70 ? 5 : 0;
  const tempScore = !thermalKnown ? 0 : temperature <= 75 ? 25 : temperature < 110 ? 18 : temperature < 140 ? 5 : 0;
  const score = latitudeScore + (psr === 'yes' ? 30 : 0) + tempScore + signal(hydrogen, 20) + signal(radar, 15);
  const label = score >= 75 ? 'Strong evidence alignment' : score >= 45 ? 'Promising evidence alignment' : 'Weak evidence alignment';

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Location and thermal stability" icon={Droplets}>
          <label className="fx-evidence-check"><input type="checkbox" checked={thermalKnown} onChange={event => setThermalKnown(event.target.checked)} /> I have a measured or independently modeled maximum temperature</label>
          <Field label="Absolute lunar latitude" unit="deg" value={latitude} onChange={setLatitude} min={0} max={90} step={.1} />
          <Field label="Estimated maximum temperature" unit="K" value={temperature} onChange={setTemperature} min={20} max={300} step={1} hint="Below about 110 K, exposed ice sublimates extremely slowly." />
          <Segmented label="Permanently shadowed region" value={psr} onChange={setPsr} options={[{ value: 'yes', label: 'Inside PSR' }, { value: 'no', label: 'Not confirmed' }]} />
        </FormSection>
        <FormSection title="Remote-sensing indicators" icon={Signal}>
          <Segmented label="Hydrogen / neutron signal" value={hydrogen} onChange={setHydrogen} options={[{ value: 'none', label: 'None' }, { value: 'possible', label: 'Possible' }, { value: 'strong', label: 'Strong' }]} />
          <Segmented label="Radar / reflectance signal" value={radar} onChange={setRadar} options={[{ value: 'none', label: 'None' }, { value: 'possible', label: 'Possible' }, { value: 'strong', label: 'Strong' }]} />
        </FormSection>
      </Inputs>
      <div className="fx-results">
        <Answer label="Evidence-screening score" value={`${score.toFixed(0)} / 100`} tone={score >= 75 ? 'green' : score >= 45 ? 'amber' : 'red'} sub={`${label}. This score is not the probability that ice is present.`} copy={`Water-ice evidence screen: ${score.toFixed(0)}/100 (${label})`} />
        <Stats items={[
          { label: 'Cold-trap contribution', value: `${tempScore} / 25` },
          { label: 'PSR contribution', value: `${psr === 'yes' ? 30 : 0} / 30` },
          { label: 'Instrument contribution', value: `${signal(hydrogen, 20) + signal(radar, 15)} / 35` }
        ]} />
        <Working lines={[
          ['Transparent weights', `latitude ${latitudeScore}/10 + PSR ${psr === 'yes' ? 30 : 0}/30 + temperature ${tempScore}/25 + hydrogen ${signal(hydrogen, 20)}/20 + radar ${signal(radar, 15)}/15`],
          ['Screening total', `${score.toFixed(0)} / 100`]
        ]} />
        <Notes items={[
          <>NASA uses multiple LRO instruments—including LEND, LAMP, LOLA, LROC and Mini-RF—to investigate hydrogen, frost, topography, temperature and radar response.</>,
          <>Even sites that pass every test are uncertain: Li et al. 2018 (PNAS) found exposed ice in only ~3.5 % of lunar cold traps, mostly where the annual maximum temperature stays below 110 K. South-polar detections include Shackleton, Haworth, Shoemaker, Faustini, de Gerlache and Sverdrup.</>,
          <>The only direct measurement is LCROSS (Cabeus, 9 Oct 2009): 5.6 ± 2.9 % water ice by mass in the impact plume (Colaprete et al. 2010).</>,
          <>Unknown signals contribute zero; this means missing evidence, not proof that ice is absent. The temperature is used only after you confirm a source. All indicators are user inputs.</>,
          <>The weights are explicit triage choices, not a trained or calibrated probability model. Ground truth or a mission-specific data product is required to claim abundance.</>,
          <><a href="https://science.nasa.gov/moon/moon-water-and-ices/" target="_blank" rel="noreferrer">NASA Moon water and ice evidence</a> · <a href="https://science.nasa.gov/mission/lcross/" target="_blank" rel="noreferrer">LCROSS mission</a></>
        ]} />
      </div>
    </div>
  );
}


export function CandidateSiteTool({ onSelectSite, inputs = {} }: { onSelectSite?: (site: { name: string; lat: number; lon: number }) => void; inputs?: ToolInputs }) {
  const [query, setQuery] = useState(inputs.region_query ?? '');
  const [priority, setPriority] = useState<'safety' | 'resources' | 'power' | 'science'>(inputs.priority ?? 'safety');
  const filtered = CANDIDATE_REGIONS.map(r => r.name).filter(name => name.toLowerCase().includes(query.trim().toLowerCase()));
  // NASA publishes no region centres, so "View" goes to the nearest IAU-named feature (USGS gazetteer).
  const usable = (name: string) => {
    const region = CANDIDATE_REGIONS.find(r => r.name === name);
    return region ? { name: `${region.anchor} (near ${region.name})`, lat: region.lat, lon: region.lon, anchor: region.anchor } : undefined;
  };
  const guidance = {
    safety: 'Compare local slope, roughness, illumination and the landing ellipse before ranking.',
    resources: 'Prioritize access to cold traps, then validate hydrogen, temperature and traversability layers.',
    power: 'Rank only for a defined date window; polar illumination changes with terrain and time.',
    science: 'Match geologic units and sample objectives while preserving undisturbed volatile targets.'
  }[priority];

  return (
    <div className="fx-body">
      <Inputs>
        <FormSection title="Mission priority" icon={MapPinned}>
          <Segmented label="Primary objective" value={priority} onChange={setPriority} options={[{ value: 'safety', label: 'Landing safety' }, { value: 'resources', label: 'Water / resources' }, { value: 'power', label: 'Power / light' }, { value: 'science', label: 'Science return' }]} />
          <div className="fx-field"><label htmlFor="region-search">Filter official regions</label><input id="region-search" className="fx-text-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try Nobile or Haworth" /></div>
        </FormSection>
        <Notes items={[guidance, <>A launch date is required before any region can be ranked for trajectory access and surface lighting.</>]} />
      </Inputs>
      <div className="fx-results">
        <section className="fx-card fx-candidates">
          <div className="fx-candidate-head"><div><span>NASA candidate regions (Oct 2024)</span><strong>{filtered.length} region{filtered.length === 1 ? '' : 's'}</strong></div><a href="https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/" target="_blank" rel="noreferrer">NASA source</a></div>
          <ul>{filtered.map(name => { const site = usable(name); return <li key={name}><div><strong>{name}</strong><small>{site ? `Shown at ${site.anchor}, the nearest named feature (USGS/IAU gazetteer)` : 'Region-level candidate'}</small></div>{site && onSelectSite && <button type="button" onClick={() => onSelectSite(site)}>View on Moon</button>}</li>; })}</ul>
        </section>
        <Notes items={[
          <>NASA’s region screening considers science value, launch-window availability, terrain, Earth communications, lighting and vehicle capability together.</>,
          <>NASA has not published centre coordinates or boundaries for these regions. “View on Moon” goes to the nearest IAU-named feature, not an official landing point.</>,
          <>Since Feb 2026 Artemis III is a crewed test flight in Earth orbit; the first crewed south-pole landing is planned for Artemis IV. These are the latest published candidate regions (Oct 2024).</>,
          <><a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">Open NASA Moon Trek</a> for authoritative LRO layers, measurement and elevation tools.</>
        ]} />
      </div>
    </div>
  );
}

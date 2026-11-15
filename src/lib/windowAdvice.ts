import type { ForecastSample } from './lunar';
import { failures, findScienceWindows, type WindowCriteria } from './science';

/**
 * When a science-window search finds nothing, explain which condition blocks it
 * and propose relaxed conditions that DO produce windows on the same samples.
 * Every suggestion is verified by re-running the search; nothing is guessed.
 */

export type ConditionCheck = { label: string; passPct: number; observed: string };
export type Relaxation = { label: string; criteria: WindowCriteria; windows: number; hours: number };
export type WindowAdvice = { checks: ConditionCheck[]; blocking: string[]; relaxations: Relaxation[] };

const round = (v: number, step: number) => Math.round(v / step) * step;

function range(values: number[]): [number, number] | null {
  const finite = values.filter(Number.isFinite);
  return finite.length ? [Math.min(...finite), Math.max(...finite)] : null;
}

export function adviseWindows(samples: ForecastSample[], criteria: WindowCriteria, stepHours: number): WindowAdvice {
  const n = samples.length || 1;
  const failing = samples.map((s) => failures(s, criteria));
  const pct = (name: string) => (100 * failing.filter((f) => !f.includes(name)).length) / n;
  const temp = range(samples.map((s) => s.temperature_c));
  const irr = range(samples.map((s) => s.horizontal_irradiance_w_m2));
  const earth = range(samples.map((s) => (s.earth_elevation_deg ?? NaN)));

  const checks: ConditionCheck[] = [
    { label: `Temperature ${criteria.minTemperature} to ${criteria.maxTemperature} °C`, passPct: pct('Temperature'),
      observed: temp ? `site reaches ${temp[0].toFixed(0)} to ${temp[1].toFixed(0)} °C` : 'no data' },
    { label: `Sunlight ${criteria.minIrradiance}${criteria.maxIrradiance !== undefined && criteria.maxIrradiance < 2000 ? `–${criteria.maxIrradiance}` : '+'} W/m²`, passPct: pct('Irradiance'),
      observed: irr ? `site gets ${irr[0].toFixed(0)} to ${irr[1].toFixed(0)} W/m² on flat ground` : 'no data' },
  ];
  if (criteria.requireSun) checks.push({ label: 'Sun must be up', passPct: pct('Sunlight'), observed: `${pct('Sunlight').toFixed(0)}% of the time` });
  if (criteria.requireEarth) checks.push({ label: `Earth ≥ ${criteria.minEarthElevation}° up`, passPct: pct('Earth visibility'),
    observed: earth ? `Earth ranges ${earth[0].toFixed(1)}° to ${earth[1].toFixed(1)}°` : 'no Earth positions' });
  if ((criteria.minEarthHours ?? 0) > 0) {
    const passes = findScienceWindows(samples, criteria, stepHours).length > 0;
    checks.push({ label: `Earth in view for ${criteria.minEarthHours} continuous h within a qualifying window`,
      passPct: passes ? 100 : 0, observed: passes ? 'Duration requirement met' : 'No qualifying continuous contact interval' });
  }
  const allPct = (100 * failing.filter((f) => f.length === 0).length) / n;
  checks.push({ label: 'All conditions at once', passPct: allPct, observed: `${allPct.toFixed(0)}% of samples` });

  const blocking = checks.filter((c) => c.label !== 'All conditions at once' && c.passPct < 5).map((c) => c.label);
  // Far side: no relaxation of other limits can ever make Earth visible.
  if (criteria.requireEarth && earth && earth[1] <= 0) blocking.unshift(`Earth never rises here (far side: ${earth[0].toFixed(1)}° to ${earth[1].toFixed(1)}°)`);

  // Candidate relaxations, each tested on the same samples.
  const candidates: { label: string; criteria: WindowCriteria }[] = [];
  if (temp) {
    const lo = Math.min(criteria.minTemperature, round(temp[0] - 5, 5));
    const hi = Math.max(criteria.maxTemperature, round(temp[1] + 5, 5));
    if (lo < criteria.minTemperature) candidates.push({ label: `Allow colder: ${lo} to ${criteria.maxTemperature} °C`, criteria: { ...criteria, minTemperature: lo } });
    if (hi > criteria.maxTemperature) candidates.push({ label: `Allow warmer: ${criteria.minTemperature} to ${hi} °C`, criteria: { ...criteria, maxTemperature: hi } });
    // Most selective useful option: the warmest quarter of the period.
    const sorted = samples.map((x) => x.temperature_c).filter(Number.isFinite).sort((a, b) => a - b);
    const warm = round(sorted[Math.floor(sorted.length * 0.75)], 5);
    if (warm > temp[0]) candidates.push({ label: `Warmest quarter of the period: ≥ ${warm} °C`, criteria: { ...criteria, minTemperature: warm, maxTemperature: hi } });
    candidates.push({ label: `Any temperature the site reaches (${round(temp[0] - 5, 5)} to ${round(temp[1] + 5, 5)} °C)`, criteria: { ...criteria, minTemperature: round(temp[0] - 5, 5), maxTemperature: round(temp[1] + 5, 5) } });
  }
  if (criteria.minIrradiance > 0 && irr) {
    const half = round(Math.min(criteria.minIrradiance / 2, irr[1] * 0.5), 5);
    candidates.push({ label: `Lower sunlight to ≥ ${half} W/m²`, criteria: { ...criteria, minIrradiance: half } });
    candidates.push({ label: 'Drop the sunlight limit', criteria: { ...criteria, minIrradiance: 0, maxIrradiance: undefined } });
  }
  if (criteria.requireEarth && criteria.minEarthElevation > 0) candidates.push({ label: 'Earth just above the horizon (≥ 0°)', criteria: { ...criteria, minEarthElevation: 0 } });
  if (criteria.requireEarth) candidates.push({ label: 'Don’t require Earth in view', criteria: { ...criteria, requireEarth: false } });
  if (criteria.requireSun) candidates.push({ label: 'Don’t require the Sun up', criteria: { ...criteria, requireSun: false } });
  if ((criteria.minEarthHours ?? 0) > 0) candidates.push({ label: 'Drop the Earth contact duration', criteria: { ...criteria, minEarthHours: 0 } });
  if (criteria.minHours > 1) candidates.push({ label: `Shorter windows (≥ ${Math.max(1, round(criteria.minHours / 2, 1))} h)`, criteria: { ...criteria, minHours: Math.max(1, round(criteria.minHours / 2, 1)) } });

  // Several conditions can block at once: also try relaxing all of them together.
  if (candidates.length > 1) {
    const all: WindowCriteria = { ...criteria };
    if (temp) { all.minTemperature = Math.min(criteria.minTemperature, round(temp[0] - 5, 5)); all.maxTemperature = Math.max(criteria.maxTemperature, round(temp[1] + 5, 5)); }
    if (criteria.minIrradiance > 0 && irr) all.minIrradiance = round(Math.min(criteria.minIrradiance / 2, irr[1] * 0.5), 5);
    if (criteria.requireEarth) all.minEarthElevation = Math.min(criteria.minEarthElevation, 0);
    if (criteria.minHours > 1) all.minHours = Math.max(1, round(criteria.minHours / 2, 1));
    candidates.push({ label: 'Relax every blocking limit together', criteria: all });
  }

  const relaxations = candidates
    .map((c) => {
      const windows = findScienceWindows(samples, c.criteria, stepHours);
      return { ...c, windows: windows.length, hours: windows.reduce((a, w) => a + w.hours, 0) };
    })
    .filter((r) => r.windows > 0)
    .sort((a, b) => b.windows - a.windows || a.hours - b.hours)
    .filter((r, i, all) => all.findIndex((o) => o.label === r.label) === i)
    .slice(0, 4);

  return { checks, blocking, relaxations };
}

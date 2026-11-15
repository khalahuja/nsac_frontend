import { API } from '../lib/apiEndpoints';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ForecastResult, ForecastSample } from '../lib/lunar';
import { computeSimulatedForecast } from '../lib/lunarPhysics';
import { formatZonedDateTime } from '../lib/time';
import { saveCsv } from '../lib/science';
import { ForecastChart, ChartSeries } from './ForecastChart';

export type ComparisonSiteInput = { name: string; lat: number; lon: number };

/** Series colours, in site order. The Compare page uses the same order. */
export const COMPARISON_COLORS = ['#4fdcf5', '#a855f7', '#4ade80', '#fbbf24', '#f87171'];


const MAX_SAMPLES = 1200;

export type ComparisonSeries = ChartSeries & { lat: number; lon: number; source: string; samples: ForecastSample[] };

/**
 * Forecast every site over one shared window.
 *
 * Each site is fetched from the backend; if that fails the in-browser model is
 * used and the series is labelled as such. Series are then aligned on
 * timestamps present in every series — never by array index — so a cursor
 * position always means the same instant for every site.
 */
export function useComparisonForecast(sites: ComparisonSiteInput[], timeZone: string) {
  const [series, setSeries] = useState<ComparisonSeries[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const siteKey = sites.map((s) => `${s.name}:${s.lat}:${s.lon}`).join('|');

  // Results are stale as soon as the site list changes.
  useEffect(() => {
    controller.current?.abort();
    setSeries([]);
    setBusy(false);
    setError('');
  }, [siteKey]);
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (start: string, end: string, step: number) => {
    const count = Math.ceil((Date.parse(end) - Date.parse(start)) / (step * 3_600_000)) + 1;
    if (!sites.length) { setError('Add at least one site first.'); return; }
    if (!Number.isFinite(count) || Date.parse(end) <= Date.parse(start)) { setError('The end must be after the start.'); return; }
    if (step <= 0 || count > MAX_SAMPLES) {
      setError(`That window needs ${count.toLocaleString()} samples per site; the limit is ${MAX_SAMPLES.toLocaleString()}. Use a shorter window or a larger step.`);
      return;
    }

    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');

    try {
      const results = await Promise.all(sites.map(async (site, i) => {
        let result: ForecastResult;
        let source = 'Analysis server';
        try {
          const response = await fetch(`${API}/api/forecast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abort.signal,
            body: JSON.stringify({
              latitude: site.lat, longitude: site.lon,
              start_datetime_utc: start, end_datetime_utc: end,
              step_hours: step, display_timezone: timeZone
            })
          });
          if (!response.ok) throw new Error(`Backend returned ${response.status}`);
          result = await response.json();
          if (!result.samples?.length) throw new Error('Empty forecast');
        } catch (e) {
          if (abort.signal.aborted) throw e;
          result = computeSimulatedForecast(site, start, end, step);
          source = 'In-browser model (server offline; Earth fixed at 45°)';
        }
        return {
          name: site.name, color: COMPARISON_COLORS[i % COMPARISON_COLORS.length],
          samples: result.samples, source: `${source} · ${result.model_name}`,
          lat: site.lat, lon: site.lon
        };
      }));

      const common = results[0].samples
        .filter((s) => results.every((r) => r.samples.some((p) => p.datetime_utc === s.datetime_utc)))
        .map((s) => s.datetime_utc);
      if (!common.length) throw new Error('The forecasts share no timestamps, so they cannot be compared.');
      const aligned = results.map((r) => {
        const byTime = new Map(r.samples.map((s) => [s.datetime_utc, s]));
        return { ...r, samples: common.map((t) => byTime.get(t)!) };
      });
      if (!abort.signal.aborted) setSeries(aligned);
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }, [siteKey, timeZone]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadCsv = useCallback(() => {
    saveCsv('site-comparison.csv', [
      ['Site', 'Latitude', 'Longitude', 'UTC', 'Temperature C', 'Horizontal irradiance W/m2', 'Sun elevation deg', 'Earth elevation deg', 'Source'],
      ...series.flatMap((r) => r.samples.map((s) => [
        r.name, r.lat, r.lon, s.datetime_utc, s.temperature_c, s.horizontal_irradiance_w_m2,
        s.solar_elevation_deg, s.earth_elevation_deg, r.source
      ]))
    ]);
  }, [series]);

  return { series, busy, error, run, downloadCsv };
}

/** Summary statistics for one site's forecast, used in the comparison table. */
export function summarise(samples: ForecastSample[]) {
  const n = samples.length || 1;
  const temps = samples.map((s) => s.temperature_c);
  return {
    minTempC: Math.min(...temps),
    maxTempC: Math.max(...temps),
    meanIrradiance: samples.reduce((a, s) => a + s.horizontal_irradiance_w_m2, 0) / n,
    sunlitPct: (samples.filter((s) => s.illuminated).length / n) * 100,
    earthVisiblePct: (samples.filter((s) => s.earth_visible).length / n) * 100
  };
}

const CHARTS = [
  ['temperature_c', 'Surface temperature', '°C'],
  ['horizontal_irradiance_w_m2', 'Sunlight on flat ground', 'W/m²'],
  ['solar_elevation_deg', 'Sun height above horizon', '°'],
  ['earth_elevation_deg', 'Earth height above horizon', '°']
] as const;

/** Four shared-axis charts with one time cursor across every site. */
export function ComparisonCharts({ series, timeZone, compact = false }: { series: ComparisonSeries[]; timeZone: string; compact?: boolean }) {
  const [cursor, setCursor] = useState(0);
  const base = series[0]?.samples ?? [];
  useEffect(() => setCursor(0), [series]);
  if (!base.length) return null;

  return (
    <div className="cmpx-charts">
      <label className="cmpx-cursor">
        <span>Time: <strong>{formatZonedDateTime(base[Math.min(cursor, base.length - 1)].datetime_utc, timeZone)}</strong></span>
        <input type="range" min={0} max={base.length - 1} value={cursor} onChange={(e) => setCursor(Number(e.target.value))} aria-label="Shared time cursor" />
      </label>
      <div className="cmpx-chart-grid">
        {CHARTS.map(([field, title, unit]) => (
          <ForecastChart
            key={field}
            samples={base}
            field={field}
            title={compact && field === 'horizontal_irradiance_w_m2' ? 'Solar irradiance' : title}
            unit={unit}
            color={COMPARISON_COLORS[0]}
            timeZone={timeZone}
            series={series}
            hoveredIndex={cursor}
            onHoverIndex={(i) => i !== null && setCursor(i)}
          />
        ))}
      </div>
      <ul className="cmpx-sources">
        {series.map((r) => <li key={r.name}><i style={{ background: r.color }} /> <strong>{r.name}</strong> — {r.source}</li>)}
      </ul>
    </div>
  );
}

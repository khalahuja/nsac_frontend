import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import type { ForecastResult } from '../lib/lunar';
import { findScienceWindows, saveCsv, WindowCriteria } from '../lib/science';
import { formatZonedDateTime, localInput } from '../lib/time';

export type ScienceWindowsPageProps = {
  externalCriteria?: WindowCriteria;
  siteName: string;
  coordinateText: string;
  forecast: ForecastResult | null;
  forecastBusy: boolean;
  /** (Re)generate the shared forecast for the current site and period. */
  onGenerate: () => void;
  start: string;
  end: string;
  step: number;
  /** Receives raw `datetime-local` text, interpreted in `timeZone`. */
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onStepChange: (hours: number) => void;
  timeZone: string;
  /** Jump to the forecast charts at this sample index. */
  onInspect: (index: number) => void;
  error?: string;
};

const DEFAULT_CRITERIA: WindowCriteria = {
  minTemperature: -180,
  maxTemperature: 120,
  minIrradiance: 0,
  maxIrradiance: 1400,
  minEarthElevation: 0,
  maxEarthElevation: 90,
  requireEarth: true,
  requireSun: false,
  minHours: 3
};


/** Plain-language labels for the reasons a window closes. */
const REASON_LABELS: Record<string, string> = {
  Temperature: 'temperature out of range',
  Irradiance: 'too little sunlight',
  Sunlight: 'sun set',
  'Earth visibility': 'Earth dropped out of view',
  'Data gap': 'gap in data',
  'Missing time': 'missing data',
  'Forecast boundary': 'end of search period'
};
const explainReason = (reason: string) =>
  reason.split(', ').map((r) => REASON_LABELS[r] ?? r).join(', ');

const formatHours = (hours: number) =>
  hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(hours < 10 ? 1 : 0)} h`;

/**
 * Science-window finder.
 *
 * A "science window" is a continuous stretch of the forecast in which every
 * condition holds (temperature range, sunlight, Earth contact) for at least
 * the minimum duration. The forecast is generated automatically for the site
 * and period; windows are found client-side so changing a condition is instant.
 */
export function ScienceWindowsPage(props: ScienceWindowsPageProps) {
  const {
    siteName, coordinateText, forecast, forecastBusy, onGenerate,
    start, end, step, onStartChange, onEndChange, onStepChange,
    timeZone, onInspect, error
  } = props;
  const [criteria, setCriteria] = useState<WindowCriteria>(DEFAULT_CRITERIA);
  const [draft, setDraft] = useState<WindowCriteria>(DEFAULT_CRITERIA);
  useEffect(() => {
    if (props.externalCriteria) {
      setCriteria({ ...props.externalCriteria });
      setDraft({ ...props.externalCriteria });
    }
  }, [props.externalCriteria]);

  // Keep a forecast available: regenerate whenever the period or site changes
  // (the parent clears the forecast on those changes). Debounced for typing.
  // The parent's generate callback is recreated every render; read it through a
  // ref so unrelated re-renders don't keep resetting the debounce timer.
  const generateRef = useRef(onGenerate);
  generateRef.current = onGenerate;
  useEffect(() => {
    if (forecast || forecastBusy) return;
    const timer = window.setTimeout(() => generateRef.current(), 400);
    return () => window.clearTimeout(timer);
  }, [forecast, forecastBusy]);

  const invalid =
    Object.values(criteria).some((v) => typeof v === 'number' && !Number.isFinite(v)) ||
    criteria.minTemperature > criteria.maxTemperature ||
    criteria.minHours < 0 ||
    criteria.minIrradiance < 0 ||
    criteria.minIrradiance > (criteria.maxIrradiance ?? Infinity) ||
    criteria.minEarthElevation > (criteria.maxEarthElevation ?? 90) ||
    Math.abs(criteria.maxEarthElevation ?? 90) > 90 ||
    Math.abs(criteria.minEarthElevation) > 90;

  const fallbackGeometry = Boolean(forecast?.model_name.includes('in-browser') || forecast?.model_name.includes('Experimental'));
  const requiresVerifiedGeometry = fallbackGeometry && (criteria.requireEarth || criteria.requireSun);
  const windows = useMemo(
    () => (forecast && !invalid && !requiresVerifiedGeometry ? findScienceWindows(forecast.samples, criteria, forecast.step_hours) : []),
    [forecast, criteria, invalid, requiresVerifiedGeometry]
  );

  const totalHours = windows.reduce((sum, w) => sum + w.hours, 0);
  const longest = windows.reduce((max, w) => Math.max(max, w.hours), 0);
  const nextWindow = windows.find((w) => Date.parse(w.end) >= Date.now()) ?? windows[0];
  const periodStart = forecast ? Date.parse(forecast.samples[0].datetime_utc) : Date.parse(start);
  const periodEnd = forecast ? Date.parse(forecast.samples[forecast.samples.length - 1].datetime_utc) : Date.parse(end);
  const periodSpan = Math.max(1, periodEnd - periodStart);
  const periodHours = periodSpan / 3_600_000;
  const usesLocalModel = fallbackGeometry;

  const setNumber = (key: keyof WindowCriteria) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((c) => ({ ...c, [key]: e.target.value === '' ? NaN : Number(e.target.value) }));
  const numberValue = (key: keyof WindowCriteria) =>
    Number.isFinite(draft[key] as number) ? String(draft[key]) : '';

  const exportCsv = () => forecast && saveCsv('science-windows.csv', [
    ['Start UTC', 'End UTC', 'Duration hours', 'Ends because', 'Min temperature C', 'Max temperature C',
      'Min horizontal irradiance W/m2', 'Max horizontal irradiance W/m2', 'Require sunlight', 'Require Earth', 'Min Earth elevation deg',
      'Max Earth elevation deg', 'Min duration hours', 'Model', 'Time zone'],
    ...windows.map((w) => [w.start, w.end, w.hours, w.endsBecause, criteria.minTemperature, criteria.maxTemperature,
      criteria.minIrradiance, criteria.maxIrradiance ?? 1400, String(criteria.requireSun), String(criteria.requireEarth),
      criteria.minEarthElevation, criteria.maxEarthElevation ?? 90, criteria.minHours, forecast.model_name, timeZone])
  ]);

  return (
    <div className="swx-page">
      {/* ============================ Left: setup ============================ */}
      <aside className="swx-rail" aria-label="Science window filters">
        <form className="swx-filter-card" onSubmit={event => { event.preventDefault(); setCriteria({ ...draft }); }}>
          <h2>Filters</h2>
          <div className="swx-filter-field"><span>Surface temperature (C)</span><div className="swx-pair"><input aria-label="Minimum Surface temperature (C)" type="number" step="any" value={numberValue('minTemperature')} onChange={setNumber('minTemperature')} /><span aria-hidden="true">&ndash;</span><input aria-label="Maximum Surface temperature (C)" type="number" step="any" value={numberValue('maxTemperature')} onChange={setNumber('maxTemperature')} /></div></div>
          <div className="swx-filter-field"><span>Solar irradiance (W/m2)</span><div className="swx-pair"><input aria-label="Minimum Solar irradiance (W/m2)" type="number" step="any" value={numberValue('minIrradiance')} onChange={setNumber('minIrradiance')} /><span aria-hidden="true">&ndash;</span><input aria-label="Maximum Solar irradiance (W/m2)" type="number" step="any" value={numberValue('maxIrradiance')} onChange={setNumber('maxIrradiance')} /></div></div>
          <div className="swx-filter-field"><span>Earth elevation (degrees)</span><div className="swx-pair"><input aria-label="Minimum Earth elevation (degrees)" type="number" step="any" value={numberValue('minEarthElevation')} onChange={setNumber('minEarthElevation')} /><span aria-hidden="true">&ndash;</span><input aria-label="Maximum Earth elevation (degrees)" type="number" step="any" value={numberValue('maxEarthElevation')} onChange={setNumber('maxEarthElevation')} /></div></div>
          <label className="swx-filter-field"><span>Min duration (hours)</span><input aria-label="Minimum duration in hours" type="number" step="any" value={numberValue('minHours')} onChange={setNumber('minHours')} /></label>
          <label className="swx-filter-switch"><span>Sunlight required</span><input type="checkbox" role="switch" checked={draft.requireSun} onChange={event => setDraft(c => ({ ...c, requireSun: event.target.checked }))} /></label>
          <label className="swx-filter-switch"><span>Earth visible required</span><input type="checkbox" role="switch" checked={draft.requireEarth} onChange={event => setDraft(c => ({ ...c, requireEarth: event.target.checked }))} /></label>
          <button type="submit" className="swx-btn swx-apply">Apply Filters</button>
          <button type="button" className="swx-reset" onClick={() => { setDraft(DEFAULT_CRITERIA); setCriteria(DEFAULT_CRITERIA); }}>Reset conditions</button>
        </form>
        <details className="reference-tools"><summary>Search period and sampling</summary>
          <section className="swx-block"><label>From ({timeZone})<input type="datetime-local" value={localInput(start, timeZone)} onChange={e => onStartChange(e.target.value)} /></label><label>To ({timeZone})<input type="datetime-local" value={localInput(end, timeZone)} onChange={e => onEndChange(e.target.value)} /></label><label>Check every<select value={step} onChange={e => onStepChange(Number(e.target.value))}>{[1,3,6,12,24].map(h => <option key={h} value={h}>{h} hours</option>)}</select></label></section>
        </details>
      </aside>

      {/* =========================== Right: results =========================== */}
      <main className="swx-main">

        <div className="swx-main-head">
          <div>
            <span className="swx-eyebrow">{siteName} &middot; {coordinateText}</span>
            <h2>
              {forecastBusy ? 'Calculating…' : invalid ? 'Check your conditions' : requiresVerifiedGeometry ? 'Verification unavailable' : `${windows.length} window${windows.length === 1 ? '' : 's'} found`}
            </h2>
          </div>
          <button type="button" className="swx-btn" disabled={!windows.length} onClick={exportCsv}>
            <Download size={18} /> Export CSV
          </button>
        </div>

        {error && <p className="swx-alert" role="alert">{error}</p>}
        {requiresVerifiedGeometry && <p className="swx-alert" role="alert">Sunlight and Earth-contact windows need the analysis server. The browser fallback uses only a mean Earth position and cannot screen solar eclipses.</p>}
        {invalid && <p className="swx-alert" role="alert">Enter valid ranges: each minimum must not exceed its maximum, irradiance and duration must be nonnegative, and Earth elevation must be within -90 to 90 degrees.</p>}

        <details className="reference-tools"><summary>Window summary and timeline</summary><div className="swx-stats">
          <div><span>Windows meeting all filters</span><strong>{forecast && !requiresVerifiedGeometry ? windows.length : '—'}</strong></div>
          <div><span>Time meeting all filters</span><strong>{forecast && !requiresVerifiedGeometry ? formatHours(totalHours) : '—'}</strong><small>{forecast && !requiresVerifiedGeometry ? `${((totalHours / periodHours) * 100).toFixed(0)}% of the period` : ''}</small></div>
          <div><span>Longest window</span><strong>{windows.length ? formatHours(longest) : '—'}</strong></div>
          <div><span>Next window starts</span><strong className="swx-stat-date">{nextWindow ? formatZonedDateTime(nextWindow.start, timeZone) : '—'}</strong></div>
        </div>

        {/* Timeline: where the windows fall across the search period. */}
        {forecast && (
          <section className="swx-timeline" aria-label="Windows across the search period">
            <div className="swx-track">
              {windows.map((w, i) => {
                const left = ((Date.parse(w.start) - periodStart) / periodSpan) * 100;
                const width = Math.max(0.6, ((Date.parse(w.end) - Date.parse(w.start)) / periodSpan) * 100);
                return (
                  <button
                    key={w.start}
                    type="button"
                    className="swx-seg"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`Window ${i + 1}: ${formatZonedDateTime(w.start, timeZone)} – ${formatZonedDateTime(w.end, timeZone)} (${formatHours(w.hours)})`}
                    onClick={() => onInspect(w.startIndex)}
                  />
                );
              })}
            </div>
            <div className="swx-track-labels">
              <span>{formatZonedDateTime(new Date(periodStart).toISOString(), timeZone)}</span>
              <span>{formatZonedDateTime(new Date(periodEnd).toISOString(), timeZone)}</span>
            </div>
            <p className="swx-legend"><i /> Green = conditions met. Click a segment to see it in the forecast charts.</p>
          </section>
        )}

        </details>
        {forecast && !invalid && !requiresVerifiedGeometry && (
          windows.length ? (
            <div className="swx-table-wrap">
              <table className="swx-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Start ({timeZone}) <small>± {forecast?.step_hours ?? step} h</small></th>
                    <th scope="col">End ({timeZone}) <small>± {forecast?.step_hours ?? step} h</small></th>
                    <th scope="col" title="Edges are only known to within one sampling step, so the true duration lies in this range">Duration (h)</th>
                    <th scope="col">Limiting condition</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {windows.map((w, i) => (
                    <tr key={w.start}>
                      <td className="swx-num">{i + 1}</td>
                      <td>{formatZonedDateTime(w.start, timeZone)}</td>
                      <td>{formatZonedDateTime(w.end, timeZone)}</td>
                      <td className="swx-len">{w.hours.toFixed(1)}<small> – {(w.hours + 2 * (forecast?.step_hours ?? step)).toFixed(1)}</small></td>
                      <td className="swx-reason">{explainReason(w.endsBecause)}</td>
                      <td><button type="button" className="swx-link" onClick={() => onInspect(w.startIndex)}>Open in Forecast <ArrowRight size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="swx-empty">
              <h3>No windows match</h3>
              <p>Try a shorter minimum length, a wider temperature range, turning off a requirement, or a longer search period.</p>
            </div>
          )
        )}

        {forecast && (
          <p className="swx-note">
            Checked every {forecast.step_hours} h; conditions between checks are assumed, not verified.{' '}
            {usesLocalModel
              ? 'The analysis server is offline. The in-browser model uses a mean Earth position; libration and solar eclipses are not evaluated.'
              : `${forecast.sources.astronomy} geometry. ${forecast.position_notes}`}
          </p>
        )}
      </main>
    </div>
  );
}

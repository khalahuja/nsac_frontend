import { useEffect, useRef, useState } from 'react';
import { Bot, CalendarSearch, Check, MapPin, RefreshCw } from 'lucide-react';
import { API } from '../lib/apiEndpoints';
import { formatZonedDateTime, localInput, utcInput } from '../lib/time';
import { operationsKey, validateOperations } from '../lib/operations';
import type { MissionRequirements, OperationsRequest, OperationsResult, OperationsCandidate } from '../lib/operations';
import '../operations.css';

type Props = {
  request: OperationsRequest; result: OperationsResult | null; siteName: string; timeZone: string;
  onChange: (request: OperationsRequest) => void; onResult: (result: OperationsResult | null) => void;
  onUseSite: (latitude: number, longitude: number, name: string) => void; onUseDate: (date: string) => void;
};
const fields: { key: keyof MissionRequirements; label: string; max: number; unit: string }[] = [
  { key: 'mission_hours', label: 'Mission duration', max: 720, unit: 'h' },
  { key: 'min_sunlight_pct', label: 'Minimum sunlight coverage', max: 100, unit: '%' },
  { key: 'max_dark_hours', label: 'Maximum continuous darkness', max: 720, unit: 'h' },
  { key: 'min_earth_pct', label: 'Minimum Earth visibility', max: 100, unit: '%' },
  { key: 'max_outage_hours', label: 'Maximum contact outage', max: 720, unit: 'h' },
  { key: 'min_both_hours', label: 'Minimum sunlight + contact overlap', max: 720, unit: 'h' },
  { key: 'min_earth_elevation_deg', label: 'Minimum Earth elevation', max: 30, unit: 'deg' },
];
function ask(message: string) { window.dispatchEvent(new CustomEvent('selene:open-chat', { detail: { message } })); }

export function OperationsPage({ request, result, siteName, timeZone, onChange, onResult, onUseSite, onUseDate }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [selected, setSelected] = useState(0), [cursor, setCursor] = useState(0);
  const abort = useRef<AbortController>();
  const resultRef = useRef(onResult); resultRef.current = onResult;
  const requestKey = operationsKey(request);
  useEffect(() => {
    abort.current?.abort(); setBusy(false); setError(''); setSelected(0); setCursor(0);
    return () => abort.current?.abort();
  }, [requestKey]);
  const stale = !!result && operationsKey(result.request) !== requestKey;
  const active = stale ? null : result;
  const candidate = active?.candidates[selected] ?? active?.best;
  const fmt = (date: string) => formatZonedDateTime(date, timeZone);
  function update(patch: Partial<OperationsRequest>) { onChange({ ...request, ...patch }); }
  function dateChange(value: string, key: 'landing_start_utc' | 'landing_end_utc') {
    try { update({ [key]: utcInput(value, timeZone) }); setError(''); } catch (e) { setError((e as Error).message); }
  }
  async function run() {
    const invalid = validateOperations(request);
    if (invalid) { setError(invalid); return; }
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(''); onResult(null);
    try {
      const response = await fetch(`${API}/api/mission/operations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Search failed (${response.status})`);
      if (!controller.signal.aborted) { resultRef.current(data); setSelected(0); setCursor(0); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof TypeError ? 'The analysis server is unavailable. Reconnect and retry the search.' : (e as Error).message);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const selectedTime = candidate ? new Date(Date.parse(candidate.landing_utc) + cursor * 3600000).toISOString() : '';
  return <section className="ops-page" aria-label="Mission operations">
    <header className="ops-header"><div><span className="ops-eyebrow">SURFACE MISSION PLANNING</span><h1>Mission operations</h1><p>{siteName} | {request.latitude.toFixed(4)} deg, {request.longitude.toFixed(4)} deg | {timeZone}</p></div>
      <button type="button" onClick={() => ask('Explain my mission requirements')}><Bot size={16} /> Ask the assistant</button></header>
    <div className="ops-layout"><form className="ops-panel ops-form" onSubmit={event => { event.preventDefault(); void run(); }}>
      <h2>Mission requirements</h2><p>All limits apply together over the full surface stay.</p>
      <label>Earliest landing ({timeZone})<input type="datetime-local" required value={localInput(request.landing_start_utc, timeZone)} onChange={e => dateChange(e.target.value, 'landing_start_utc')} /></label>
      <label>Latest landing ({timeZone})<input type="datetime-local" required value={localInput(request.landing_end_utc, timeZone)} onChange={e => dateChange(e.target.value, 'landing_end_utc')} /></label>
      <div className="ops-fields">{fields.map(field => <label key={field.key}>{field.label} ({field.unit})<input type="number" required min={field.key === 'mission_hours' ? 1 : 0} max={field.max} step={field.key === 'mission_hours' ? 1 : 'any'} value={Number.isNaN(request.requirements[field.key]) ? '' : request.requirements[field.key]}
        onChange={e => update({ requirements: { ...request.requirements, [field.key]: e.target.valueAsNumber } })} /></label>)}</div>
      <label>Nearby search radius (km)<input type="number" required min="0.1" max="50" step="any" value={Number.isNaN(request.nearby_radius_km) ? '' : request.nearby_radius_km} onChange={e => update({ nearby_radius_km: e.target.valueAsNumber })} /></label>
      <p className="ops-note">Up to 90 days of landing dates, sampled hourly. Each mission can last up to 30 days.</p>
      <button className="ops-primary" type="submit" disabled={busy}>{busy ? <RefreshCw className="spin" size={16} /> : <CalendarSearch size={16} />}{busy ? 'Evaluating mission windows...' : 'Find best landing dates'}</button>
      {busy && <button type="button" onClick={() => { abort.current?.abort(); setBusy(false); }}>Cancel search</button>}
      {error && <p role="alert" className="ops-error">{error}</p>}
    </form><div className="ops-results" aria-busy={busy}>
      {!active && <div className="ops-panel ops-empty"><CalendarSearch size={36} /><h2>{stale ? 'Requirements changed' : 'Find a window that fits your mission'}</h2><p>{busy ? 'Checking every landing hour, then comparing eight nearby locations...' : 'Run the search to compare dates, inspect operations and explore alternatives.'}</p></div>}
      {active && candidate && <>
        <div className="ops-panel"><p className="ops-note">{active.astronomy_source} | {active.terrain_verified ? "DEM skyline available" : "Terrain unverified: spherical horizon only"}. Visibility screening only.</p><div className="ops-section-head"><div><h2>Best landing-date finder</h2><p>{active.feasible_count} of {active.candidate_count} sampled landing times meet every requirement.</p></div><span className={`ops-badge ${active.best.feasible ? 'ops-pass' : 'ops-fail'}`}>{active.best.feasible ? 'Matching dates found' : 'No matching dates'}</span></div>
          {!active.best.feasible && <p role="status">These are the closest screened options. Failed requirements remain visible; no limits were relaxed.</p>}
          <p className="ops-note">Ranked by all limits passing, number of checks passed, then coverage score; equal scores prefer the earliest date. Showing the top {active.candidates.length}.</p>
          <div className="ops-date-list" role="group" aria-label="Ranked landing dates">{active.candidates.map((c, i) => <button type="button" key={c.landing_utc} aria-pressed={selected === i} onClick={() => { setSelected(i); setCursor(0); }}><span>#{i + 1} {fmt(c.landing_utc)}</span><small>{c.feasible ? 'Meets limits' : `${c.checks.filter(x => !x.passed).length} failed checks`} | coverage {c.score.toFixed(1)}/100</small></button>)}</div>
        </div>
        <div className="ops-panel"><div className="ops-section-head"><div><h2>Combined operations timeline</h2><p>{fmt(candidate.landing_utc)} | {fmt(candidate.end_utc)}</p></div><button type="button" onClick={() => onUseDate(candidate.landing_utc)}><Check size={15} /> Use this landing time</button></div>
          <Timeline candidate={candidate} cursor={cursor} onCursor={setCursor} format={fmt} /><p className="ops-note">Cursor: {fmt(selectedTime)}. Colored intervals pass the track condition; gray intervals do not. Contact means Earth line of sight.</p>
          <div className="ops-checks">{candidate.checks.map(check => <div key={check.label} className={check.passed ? 'ops-pass' : 'ops-fail'}><span>{check.passed ? 'PASS' : 'FAIL'} | {check.label}</span><strong>{check.actual.toFixed(1)} {check.unit}</strong><small>Required {check.operator} {check.limit} {check.unit}</small></div>)}</div>
          <button type="button" onClick={() => ask('Explain my mission operations result')}>Explain the recommendation <Bot size={15} /></button>
        </div>
        <div className="ops-panel"><h2>Nearby alternatives map</h2><p>Eight points {request.nearby_radius_km} km from the selected site, compared at {fmt(active.best.landing_utc)}. Click a marker to inspect its trade-offs.</p><NearbyMap result={active} onUseSite={onUseSite} /></div>
        <details className="ops-panel ops-provenance"><summary>Models and calculation limits</summary><p>{active.astronomy_source} | {active.terrain_source} | {active.terrain_verified ? 'DEM skyline available' : 'Spherical horizon; terrain visibility unverified'}</p><ul>{active.limitations.map(note => <li key={note}>{note}</li>)}</ul></details>
      </>}
    </div></div>
  </section>;
}
function Timeline({ candidate, cursor, onCursor, format }: { candidate: OperationsCandidate; cursor: number; onCursor: (n: number) => void; format: (s: string) => string }) {
  const total = (Date.parse(candidate.end_utc) - Date.parse(candidate.landing_utc)) / 3600000;
  const labels = { sunlight: 'Sunlight', contact: 'Earth contact', both: 'Both available' };
  return <div className="ops-timeline"><div className="ops-tracks">{candidate.tracks.map(track => <div className="ops-track" key={track.key}><strong>{labels[track.key]}</strong><div className={`ops-track-bar ops-${track.key}`}>
    {track.segments.map(segment => <span key={segment.start_utc} className={segment.available ? 'is-on' : 'is-off'} style={{ width: `${100 * segment.hours / total}%` }} title={`${labels[track.key]}: ${segment.available ? 'available' : 'unavailable'}; ${format(segment.start_utc)} to ${format(segment.end_utc)} (${segment.hours} h)`} />)}<i style={{ left: `${100 * cursor / total}%` }} /></div></div>)}</div>
    <label>Explore mission hour {cursor} of {total}<input type="range" min="0" max={total} step="1" value={cursor} onChange={e => onCursor(Number(e.target.value))} /></label>
    <p role="status">{candidate.tracks.map(track => { const instant = Date.parse(candidate.landing_utc) + Math.min(cursor, total - 0.5) * 3600000; const segment = track.segments.find(s => Date.parse(s.start_utc) <= instant && instant < Date.parse(s.end_utc)); return `${labels[track.key]} ${segment?.available ? 'available' : 'unavailable'}`; }).join(' | ')}</p>
  </div>;
}
function NearbyMap({ result, onUseSite }: { result: OperationsResult; onUseSite: Props['onUseSite'] }) {
  const [index, setIndex] = useState(0); const item = result.nearby[index] ?? result.nearby[0];
  if (!item) return null;
  return <div className="ops-nearby"><div><svg viewBox="0 0 360 350" aria-label="Local bearing and distance schematic of nearby alternatives" role="img">
    <circle cx="180" cy="175" r="110" fill="none" stroke="currentColor" strokeDasharray="4 5" opacity=".25" /><path d="M180 40V310M45 175H315" stroke="currentColor" opacity=".15" /><text x="180" y="22" textAnchor="middle">Local north</text><text x="180" y="335" textAnchor="middle">{result.request.nearby_radius_km} km radius | schematic</text>
    <circle cx="180" cy="175" r="8" fill="#8b82ee" /><text x="180" y="199" textAnchor="middle">Selected site</text>
    {result.nearby.map((point, i) => { const angle = point.bearing_deg * Math.PI / 180; const x = 180 + 110 * Math.sin(angle), y = 175 - 110 * Math.cos(angle); return <g key={point.name} role="button" tabIndex={0} aria-label={`${point.name}, ${point.feasible ? 'meets limits' : 'fails limits'}, score ${point.score.toFixed(1)}`} aria-pressed={index === i} onClick={() => setIndex(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIndex(i); } }}>
      <circle cx={x} cy={y} r={index === i ? 17 : 14} fill={point.feasible ? '#166b60' : '#924323'} stroke={index === i ? '#b7b0ff' : 'transparent'} strokeWidth="3" /><text x={x} y={y + 4} textAnchor="middle" fill="white">{i + 1}</text><title>{point.name} | {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}</title></g>; })}
  </svg><p className="ops-note">Green: meets all limits. Brown: fails at least one. Positions show geodesic bearings and distance, not terrain or landing safety.</p></div>
  <div className="ops-alternative"><h3><MapPin size={16} /> {item.name}</h3><p>{item.latitude.toFixed(4)} deg, {item.longitude.toFixed(4)} deg</p><p>{item.feasible ? 'Meets every requirement' : 'Fails one or more requirements'} | coverage score {item.score.toFixed(1)}/100 ({item.score_delta >= 0 ? '+' : ''}{item.score_delta.toFixed(1)} vs selected site)</p>
    <ul>{item.checks.map(c => <li key={c.label}>{c.passed ? 'Pass' : 'Fail'}: {c.label} | {c.actual.toFixed(1)} {c.unit} (requires {c.operator} {c.limit})</li>)}</ul><p className="ops-note">{item.terrain_verified ? 'DEM skyline available' : 'Terrain unverified; spherical horizon only'}</p><button type="button" onClick={() => onUseSite(item.latitude, item.longitude, item.name)}>Use site and search its dates</button>
  </div></div>;
}

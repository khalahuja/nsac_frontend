import { useEffect, useRef, useState } from 'react';
import type { LunarCoordinate } from '../lib/lunar';
import { formatZonedDateTime, localInput, utcInput } from '../lib/time';
import { downloadNasaReport, nasaRequest } from '../lib/nasaData';
import type { EvidenceCollection, EvidenceType, ImageryLayer, NasaCatalog, TerrainCell, TerrainPatch, ThermalResult, ValidationReport, WaterResult } from '../lib/nasaData';
import { NasaImageryMap } from './NasaImageryMap';
import { HydrogenMap } from './HydrogenMap';
import '../nasa-data.css';

type Props = { coordinate: LunarCoordinate; siteName: string; instant: string; start: string; end: string; timeZone: string };
type Tab = 'terrain' | 'thermal' | 'water' | 'validation';
const kindNames: Record<EvidenceType, string> = { ice_detection: 'Ice detections', cold_conditions: 'Cold conditions', resource_potential: 'Resource proxies' };
const val = (value: number | null | undefined, digits = 2) => value == null ? 'Unknown' : value.toFixed(digits);

function useJob<T>(resetKey: string) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController>();
  useEffect(() => { controller.current?.abort(); setData(null); setError(''); setBusy(false); return () => controller.current?.abort(); }, [resetKey]);
  const run = async (path: string, payload?: unknown) => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    setData(null); setError(''); setBusy(true);
    try {
      const value = await nasaRequest<T>(path, payload, active.signal);
      if (!active.signal.aborted) setData(value);
    } catch (cause) {
      if (!active.signal.aborted) setError(cause instanceof Error ? cause.message : 'NASA data request failed.');
    } finally { if (!active.signal.aborted) setBusy(false); }
  };
  return { data, error, busy, run, cancel: () => { controller.current?.abort(); setBusy(false); } };
}

function Notes({ items }: { items: string[] }) {
  return <details className="nasa-notes"><summary>Coverage and interpretation</summary><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></details>;
}
function Feedback({ busy, error }: { busy: boolean; error: string }) {
  return <>{busy && <p role="status">Loading source data…</p>}{error && <p className="nasa-error" role="alert">{error}</p>}</>;
}
function Imagery({ coordinate, evidence, water = false }: { coordinate: LunarCoordinate; evidence?: EvidenceCollection; water?: boolean }) {
  const [layerId, setLayerId] = useState(water ? 'cold' : coordinate.lat <= -60 ? 'lroc-south' : 'lroc');
  const [kinds, setKinds] = useState<EvidenceType[]>(['ice_detection', 'cold_conditions', 'resource_potential']);
  const job = useJob<ImageryLayer>(layerId);
  useEffect(() => { void job.run('/imagery/' + layerId); }, [layerId]);
  return <section className="nasa-card">
    <div className="nasa-section-heading"><div><h2>{water ? 'Water evidence map' : 'Surface imagery'}</h2><p>NASA map tiles in their native lunar projection.</p></div>
      <label>Raster layer<select value={layerId} onChange={event => setLayerId(event.target.value)}>
        <option value="lroc-south">LROC south polar imagery</option><option value="lroc">LROC global imagery</option><option value="cold">Diviner cold conditions</option>
      </select></label>
    </div>
    {water && <fieldset className="nasa-toggles"><legend>Footprint overlays</legend>{(Object.keys(kindNames) as EvidenceType[]).map(kind =>
      <label key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={event => setKinds(old => event.target.checked ? [...old, kind] : old.filter(k => k !== kind))} />{kindNames[kind]}</label>)}</fieldset>}
    <Feedback busy={job.busy} error={job.error} />
    {job.error && <button onClick={() => void job.run('/imagery/' + layerId)}>Retry imagery service</button>}
    {job.data && <NasaImageryMap layer={job.data} coordinate={coordinate} evidence={evidence} kinds={kinds} />}
  </section>;
}

function Terrain({ coordinate }: { coordinate: LunarCoordinate }) {
  const [radius, setRadius] = useState(500), [limit, setLimit] = useState(12), [factor, setFactor] = useState(2);
  const [layer, setLayer] = useState<'screen' | 'elevation_m' | 'slope_deg' | 'height_uncertainty_m' | 'slope_uncertainty_deg'>('screen');
  const [selected, setSelected] = useState(312);
  const job = useJob<TerrainPatch>(coordinate.lat + ',' + coordinate.lon);
  const run = () => void job.run('/terrain', { latitude: coordinate.lat, longitude: coordinate.lon, radius_m: radius, slope_limit_deg: limit, uncertainty_factor: factor });
  useEffect(run, [coordinate.lat, coordinate.lon]);
  const data = job.data, active = data?.cells[selected];
  const values = data && layer !== 'screen' ? data.cells.map(cell => cell[layer]).filter((n): n is number => n !== null) : [];
  const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 0;
  const color = (cell: TerrainCell) => {
    if (layer === 'screen') return { unknown: '#293443', hazard: '#f87171', uncertain: '#e9b75b', within_limit: '#6ee7b7' }[cell.screen];
    const number = cell[layer];
    return number === null ? '#293443' : 'hsl(' + (220 - 190 * (number - min) / Math.max(1e-9, max - min)) + ' 65% 54%)';
  };
  return <>
    <section className="nasa-card">
      <div className="nasa-section-heading"><div><h2>Terrain and uncertainty</h2><p>Native elevation, slope and published RMS errors around your selected site.</p></div>
        {data && <button onClick={() => downloadNasaReport('selene-terrain.json', data)}>Export terrain report</button>}
      </div>
      <form className="nasa-form-row" onSubmit={event => { event.preventDefault(); run(); }}>
        <label>Map half-width (m)<input type="number" min="50" max="5000" value={radius} onChange={e => setRadius(Number(e.target.value))} required /></label>
        <label>Slope limit (°)<input type="number" min=".1" max="45" step=".1" value={limit} onChange={e => setLimit(Number(e.target.value))} required /></label>
        <label>RMS error multiplier<input type="number" min="0" max="5" step=".5" value={factor} onChange={e => setFactor(Number(e.target.value))} required /></label>
        <button type="submit" disabled={job.busy}>Update terrain</button>
      </form>
      <Feedback busy={job.busy} error={job.error} />
      {data && <>
        <p className="nasa-source"><a href={data.source_url} target="_blank" rel="noreferrer">{data.source}</a> · Native pixel {val(data.resolution_m, 0)} m · {(100 * data.coverage_fraction).toFixed(0)}% sampled coverage</p>
        {!data.high_resolution && <p className="nasa-note">No installed regional 5 m product covers this point. The active terrain provider is shown, with missing uncertainty left unknown.</p>}
        <label className="nasa-layer-select">Terrain layer<select value={layer} onChange={e => setLayer(e.target.value as typeof layer)}>
          <option value="screen">Slope screen with uncertainty margin</option><option value="elevation_m">Elevation (m)</option><option value="slope_deg">Slope (°)</option>
          <option value="height_uncertainty_m">Height RMS uncertainty (m)</option><option value="slope_uncertainty_deg">Slope RMS uncertainty (°)</option>
        </select></label>
        <div className="nasa-terrain-layout">
          <div><svg viewBox="0 0 500 500" role="img" aria-label="Sampled terrain map. North is up. Use the cell slider to inspect a location.">
            {data.cells.map((cell, i) => <rect key={i} x={cell.x * 20} y={cell.y * 20} width="20" height="20" fill={color(cell)}
              stroke={i === selected ? '#fff' : 'none'} strokeWidth="3" onPointerEnter={() => setSelected(i)} onClick={() => setSelected(i)}>
              <title>{cell.lat.toFixed(5) + ', ' + cell.lon.toFixed(5) + ': slope ' + val(cell.slope_deg) + '°, ' + cell.screen}</title>
            </rect>)}
          </svg><label>Inspect sampled cell<input type="range" min="0" max={data.cells.length - 1} value={selected} onChange={e => setSelected(Number(e.target.value))} /></label></div>
          <div className="nasa-cell-readout">
            <h3>Selected terrain sample</h3>
            {active && <dl><dt>Coordinates</dt><dd>{active.lat.toFixed(5)}, {active.lon.toFixed(5)}</dd><dt>Elevation</dt><dd>{val(active.elevation_m)} m</dd>
              <dt>Slope</dt><dd>{val(active.slope_deg)}°</dd><dt>Height RMS error</dt><dd>{val(active.height_uncertainty_m)} m</dd>
              <dt>Slope RMS error</dt><dd>{val(active.slope_uncertainty_deg)}°</dd><dt>Screen</dt><dd>{active.screen.replace(/_/g, ' ')}</dd></dl>}
            {layer === 'screen' ? <p className="nasa-note">Green: within slope limit including the selected uncertainty margin. Amber: uncertain or missing error data. Red: slope exceeds limit. Grey: no coverage.</p> : <p className="nasa-note">Blue → warm colours: {val(min)} to {val(max)}. Grey: no coverage.</p>}
            <p className="nasa-note">North ↑ · Frame {data.frame ?? 'unspecified'} {data.ephemeris_frame ?? ''}</p>
          </div>
        </div><Notes items={data.notes} />
      </>}
    </section>
    <Imagery coordinate={coordinate} />
  </>;
}

function Thermal({ coordinate, start, end, timeZone }: Props) {
  const [from, setFrom] = useState(start), [to, setTo] = useState(end), [step, setStep] = useState(.25);
  const [inputError, setInputError] = useState('');
  const job = useJob<ThermalResult>([coordinate.lat, coordinate.lon, from, to, step].join(','));
  const setDate = (value: string, setter: (date: string) => void) => { try { setter(utcInput(value, timeZone)); setInputError(''); } catch (e) { setInputError((e as Error).message); } };
  const data = job.data;
  const temperatures = data?.samples.flatMap(s => [s.model_temperature_k, ...(s.observation ? [s.observation.temperature_k] : [])]) ?? [];
  const minimum = temperatures.length ? Math.min(...temperatures) : 0, maximum = temperatures.length ? Math.max(...temperatures) : 1;
  const y = (number: number) => 230 - 200 * (number - minimum) / Math.max(1, maximum - minimum);
  const x = (index: number) => 55 + 560 * index / Math.max(1, (data?.samples.length ?? 1) - 1);
  return <section className="nasa-card">
    <div className="nasa-section-heading"><div><h2>Model and Diviner comparison</h2><p>Match historical local-time averages to the selected site's modelled conditions.</p></div>
      {data && <button onClick={() => downloadNasaReport('selene-diviner-comparison.json', { coordinate, start: from, end: to, step_hours: step, ...data })}>Export comparison</button>}
    </div>
    <form className="nasa-form-row" onSubmit={e => { e.preventDefault(); if (!inputError) void job.run('/thermal', { latitude: coordinate.lat, longitude: coordinate.lon, start_datetime_utc: from, end_datetime_utc: to, step_hours: step }); }}>
      <label>Start ({timeZone})<input type="datetime-local" value={localInput(from, timeZone)} onChange={e => setDate(e.target.value, setFrom)} required /></label>
      <label>End ({timeZone})<input type="datetime-local" value={localInput(to, timeZone)} onChange={e => setDate(e.target.value, setTo)} required /></label>
      <label>Sample interval<select value={step} onChange={e => setStep(Number(e.target.value))}><option value=".25">15 minutes</option><option value="1">1 hour</option><option value="3">3 hours</option></select></label>
      <button type="submit" disabled={job.busy}>Compare temperatures</button>
    </form>
    <p className="nasa-note">Choose up to 31 days. A 15-minute step can sample the native 15-minute Diviner local-time bins.</p>
    <Feedback busy={job.busy} error={inputError || job.error} />
    {data && <>
      <div className="nasa-metrics"><div><span>Matched samples</span><strong>{data.matched_samples} / {data.samples.length}</strong></div><div><span>Mean model − climatology</span><strong>{val(data.bias_k)} K</strong></div><div><span>Climatology RMSE</span><strong>{val(data.rmse_k)} K</strong></div></div>
      {!data.available && <p className="nasa-note">No Diviner product is active. Model values remain available, and observed values are missing.</p>}
      {data.available && !data.matched_samples && <p className="nasa-note">No installed Diviner pixel, season and local-time bin matches these samples. Available historical bins at this location are listed below.</p>}
      <svg className="nasa-thermal-chart" viewBox="0 0 640 280" role="img" aria-label="Model temperature in blue and matched historical Diviner averages as amber points, in Kelvin">
        <line x1="55" x2="615" y1="230" y2="230" stroke="#62768a" /><line x1="55" x2="615" y1="30" y2="30" stroke="#304050" />
        <text x="5" y="35">{maximum.toFixed(0)} K</text><text x="5" y="235">{minimum.toFixed(0)} K</text>
        <polyline fill="none" stroke="#67e8f9" strokeWidth="2" points={data.samples.map((s, i) => x(i) + ',' + y(s.model_temperature_k)).join(' ')} />
        {data.samples.map((s, i) => s.observation && <circle key={s.datetime_utc} cx={x(i)} cy={y(s.observation.temperature_k)} r="3" fill="#fbbf24"><title>{formatZonedDateTime(s.datetime_utc, timeZone) + ': Diviner ' + s.observation.temperature_k.toFixed(1) + ' K'}</title></circle>)}
        <text x="55" y="267">{formatZonedDateTime(data.samples[0].datetime_utc, timeZone)}</text><text x="615" y="267" textAnchor="end">{formatZonedDateTime(data.samples[data.samples.length - 1].datetime_utc, timeZone)}</text>
      </svg>
      <p className="nasa-note">Cyan: {data.model_name}. Amber: historical Diviner averages. Missing observations are not interpolated.</p>
      <h3>Available local-time bins at this site</h3>
      {data.local_time_profile.length ? <div className="nasa-table-scroll"><table><thead><tr><th>Lunar local time (hours)</th><th>Season</th><th>Temperature</th><th>Reference period</th><th>Source</th></tr></thead><tbody>{data.local_time_profile.map((p, i) => <tr key={i}><td>{p.local_time_min_hours.toFixed(2)}–{p.local_time_max_hours.toFixed(2)}</td><td>{p.season}</td><td>{p.temperature_k.toFixed(2)} K</td><td>{p.reference_period}</td><td><a href={p.source_url} target="_blank" rel="noreferrer">{p.dataset}</a></td></tr>)}</tbody></table></div> : <p>No installed temperature bins cover this point.</p>}
      <Notes items={data.notes} />
    </>}
  </section>;
}

function Water({ coordinate }: { coordinate: LunarCoordinate }) {
  const [collection, setCollection] = useState<EvidenceCollection>(), [fileError, setFileError] = useState('');
  const sequence = useRef(0);
  const job = useJob<WaterResult>(JSON.stringify([coordinate, collection]));
  useEffect(() => { void job.run('/water', { latitude: coordinate.lat, longitude: coordinate.lon, ...(collection ? { feature_collection: collection } : {}) }); }, [coordinate.lat, coordinate.lon, collection]);
  return <>
    <section className="nasa-card">
      <div className="nasa-section-heading"><div><h2>Sourced water evidence</h2><p>Keep ice detections, cold conditions and resource proxies separate.</p></div>
        {job.data && <button onClick={() => downloadNasaReport('selene-water-evidence.json', { coordinate, ...job.data })}>Export evidence</button>}
      </div>
      <label>Import footprint GeoJSON<input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={async e => {
        const id = ++sequence.current, file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        try {
          if (file.size > 900000) throw new Error('The evidence file must be smaller than 900 KB.');
          const value = JSON.parse(await file.text());
          if (id === sequence.current) { setCollection(value); setFileError(''); }
        } catch (cause) { if (id === sequence.current) setFileError((cause as Error).message); }
      }} /></label>
      {collection && <button onClick={() => { sequence.current++; setCollection(undefined); setFileError(''); }}>Use installed footprints</button>}
      <p className="nasa-note">Imports stay in this page's memory and are sent to Selene for geometry validation; they are not installed as shared datasets.</p>
      <details><summary>Evidence file format</summary><p>Use Point, Polygon or MultiPolygon geometries in east-positive lunar longitude/latitude. Each feature needs a name, evidence_type and source_url.</p>
        <pre>{JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, -89] }, properties: { name: 'Replace with a sourced detection', evidence_type: 'ice_detection', source_url: 'https://example.org/replace-with-original-product' } }] }, null, 2)}</pre>
      </details>
      <Feedback busy={job.busy} error={fileError || job.error} />
      {job.data && <>
        <div className="nasa-metrics">{(Object.keys(kindNames) as EvidenceType[]).map(kind => <div key={kind}><span>{kindNames[kind]}</span><strong>{job.data!.counts[kind]}</strong></div>)}</div>
        {!job.data.features.length && <p>No detection footprints are installed. The NASA cold-condition and hydrogen maps below are available independently; they are not labelled as ice detections.</p>}
        {job.data.features.length > 0 && <div className="nasa-table-scroll"><table><thead><tr><th>Feature</th><th>Evidence</th><th>Distance to footprint</th><th>Source</th></tr></thead><tbody>{job.data.features.slice(0, 100).map((feature, i) => <tr key={i}><td>{feature.name}<p className="nasa-note">{feature.note}</p></td><td>{kindNames[feature.evidence_type]}</td><td>{feature.contains_selected_site ? 'Site inside footprint' : feature.distance_km.toFixed(3) + ' km'}</td><td><a href={feature.source_url} target="_blank" rel="noreferrer">{feature.dataset || 'Original source'}</a></td></tr>)}</tbody></table></div>}
        <Notes items={job.data.notes} />
      </>}
    </section>
    {job.data?.hydrogen && <HydrogenMap data={job.data.hydrogen} coordinate={coordinate} />}
    <Imagery coordinate={coordinate} evidence={job.data?.feature_collection} water />
  </>;
}

function Validation({ coordinate, instant, timeZone }: Props) {
  const [sites, setSites] = useState(coordinate.lat + ', ' + coordinate.lon);
  const [dates, setDates] = useState(instant + '\n' + new Date(Date.parse(instant) + 7 * 86400000).toISOString());
  const [inputError, setInputError] = useState('');
  const job = useJob<ValidationReport>(sites + dates);
  const run = () => {
    try {
      const locations = sites.trim().split('\n').filter(Boolean).map(line => {
        const values = line.split(',').map(v => Number(v.trim()));
        if (values.length !== 2 || line.split(',').some(v => !v.trim()) || values.some(v => !Number.isFinite(v)) || Math.abs(values[0]) > 90 || Math.abs(values[1]) > 180) throw new Error('Enter one latitude, longitude pair per line.');
        return { latitude: values[0], longitude: values[1] };
      });
      const times = dates.trim().split('\n').filter(Boolean).map(value => {
        if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Each date must be an ISO timestamp with Z or an explicit UTC offset.');
        return new Date(value).toISOString();
      });
      if (!locations.length || locations.length > 4 || !times.length || times.length > 6 || locations.length * times.length > 12) throw new Error('Use up to 4 sites and 6 dates, with at most 12 site/date combinations.');
      setInputError(''); void job.run('/validate', { sites: locations, times });
    } catch (e) { setInputError((e as Error).message); }
  };
  return <section className="nasa-card">
    <div className="nasa-section-heading"><div><h2>JPL ephemeris validation</h2><p>Compare the active astronomy provider against Horizons at multiple sites and dates.</p></div>
      {job.data && <button onClick={() => downloadNasaReport('selene-jpl-validation.json', job.data)}>Download validation report</button>}
    </div>
    <form onSubmit={e => { e.preventDefault(); run(); }}><div className="nasa-form-row">
      <label>Sites: latitude, longitude<textarea rows={4} value={sites} onChange={e => setSites(e.target.value)} required /></label>
      <label>Dates: one ISO timestamp per line<textarea rows={4} value={dates} onChange={e => setDates(e.target.value)} required /></label>
    </div><button type="submit" disabled={job.busy}>Check against JPL Horizons</button>{job.busy && <button type="button" onClick={job.cancel}>Cancel</button>}</form>
    <p className="nasa-note">Up to 12 site/date cases. Queries require a reachable JPL service and may take several seconds. This compares observer angles, not landing safety.</p>
    <Feedback busy={job.busy} error={inputError || job.error} />
    {job.data && <>
      <p className="nasa-source">{job.data.astronomy_source} · Reference: {job.data.reference}</p>
      <div className="nasa-metrics"><div><span>Successful body checks</span><strong>{job.data.successful_body_checks} / {job.data.case_count * 2}</strong></div><div><span>Largest elevation difference</span><strong>{val(job.data.max_abs_elevation_delta_deg, 5)}°</strong></div></div>
      <div className="nasa-table-scroll"><table><thead><tr><th>Site / time</th><th>Body</th><th>Model az / el</th><th>JPL az / el</th><th>Δ az / el</th></tr></thead><tbody>
        {job.data.results.flatMap((result, i) => result.bodies.map(body => <tr key={i + body.body}><td>{result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}<br />{formatZonedDateTime(result.datetime_utc, timeZone)}</td><td>{body.body}</td><td>{val(body.model.azimuth_deg, 4)}° / {val(body.model.elevation_deg, 4)}°</td>
          <td>{body.reference ? val(body.reference.azimuth_deg, 4) + '° / ' + val(body.reference.elevation_deg, 4) + '°' : body.error}</td>
          <td>{body.reference ? val(body.azimuth_delta_deg, 5) + '° / ' + val(body.elevation_delta_deg, 5) + '°' : 'Unavailable'}</td></tr>))}
      </tbody></table></div><Notes items={job.data.notes} />
    </>}
  </section>;
}

export function NasaDataPage(props: Props) {
  const [tab, setTab] = useState<Tab>('terrain');
  const catalog = useJob<NasaCatalog>('catalog');
  useEffect(() => { void catalog.run('/catalog'); }, []);
  return <article className="nasa-page">
    <header><span className="nasa-eyebrow">NASA measurements and model checks</span><h1>NASA data workspace</h1>
      <p>{props.siteName} · {props.coordinate.lat.toFixed(5)}, {props.coordinate.lon.toFixed(5)} · {formatZonedDateTime(props.instant, props.timeZone)}</p>
    </header>
    <nav className="nasa-tabs" aria-label="NASA data features">{([
      ['terrain', 'Terrain & imagery'], ['thermal', 'Observed temperature'], ['water', 'Water evidence'], ['validation', 'JPL validation']
    ] as const).map(([id, name]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{name}</button>)}</nav>
    {catalog.data && <details className="nasa-catalog"><summary>Installed data and coverage</summary><p>Active terrain: {catalog.data.terrain_source}. Diviner reader: {catalog.data.diviner_available ? 'active' : 'no active product'}.</p>
      {catalog.data.regions.map(region => <p key={region.id}><a href={region.source_url} target="_blank" rel="noreferrer">{region.title}</a> · {region.installed ? 'installed' : 'not installed'} · {region.uncertainty_available ? 'uncertainty layers available' : 'uncertainty unavailable'}</p>)}
    </details>}
    <Feedback busy={catalog.busy} error={catalog.error} />
    {tab === 'terrain' && <Terrain key={props.coordinate.lat + ',' + props.coordinate.lon} coordinate={props.coordinate} />}
    {tab === 'thermal' && <Thermal key={[props.coordinate.lat, props.coordinate.lon, props.start, props.end].join(',')} {...props} />}
    {tab === 'water' && <Water key={props.coordinate.lat + ',' + props.coordinate.lon} coordinate={props.coordinate} />}
    {tab === 'validation' && <Validation key={props.coordinate.lat + ',' + props.coordinate.lon} {...props} />}
  </article>;
}

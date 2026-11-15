import { API } from '../lib/apiEndpoints';
import { useEffect, useState } from 'react';
import {
  Activity, ArrowRight, CheckCircle2, ChevronRight, Clock,
  Compass, Eye, Play, Radio, RotateCcw, ShieldAlert,
  Sparkles, Sun, Wifi, WifiOff, Zap
} from 'lucide-react';
import { EnvironmentResult, LunarCoordinate } from '../lib/lunar';
import { formatZonedDateTime } from '../lib/time';
import { HorizonSky3D, SkyTrackPoint } from './HorizonSky3D';



/** Half-window for the sky tracks: one synodic month (709 h) centred on the instant. */
const TRACK_HALF_WINDOW_H = 354;
const TRACK_STEP_H = 4;

export type HorizonSkyPlotProps = {
  coordinate: LunarCoordinate;
  siteName: string;
  instant: string;
  environment: EnvironmentResult | null;
  timeZone: string;
  onInstantChange: (newInstant: string) => void;
  onSelectSite?: (site: { name: string; lat: number; lon: number }) => void;
};

export function HorizonSkyPlot({
  coordinate,
  siteName,
  instant,
  environment,
  timeZone,
  onInstantChange
}: HorizonSkyPlotProps) {
  // Panel configuration for power generation calculation
  const [arrayArea, setArrayArea] = useState<number>(100); // 100 m²
  const [arrayType, setArrayType] = useState<'vertical' | 'horizontal' | 'tracking'>('vertical');
  const [cellEfficiency, setCellEfficiency] = useState<number>(30); // 30% triple junction
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Extract Sun & Earth coordinates from environment or defaults
  const sunElev = environment?.solar.elevation_deg ?? 1.2;
  const sunAz = environment?.solar.azimuth_deg ?? 45.0;
  const sunDistKm = environment?.positions.sun.distance_km ?? 149597870;
  const isSunlit = environment?.solar.illuminated ?? (sunElev > 0);

  const earthElev = environment?.positions.earth.elevation_deg ?? (90 - Math.abs(coordinate.lat) + 3.2);
  const earthAz = environment?.positions.earth.azimuth_deg ?? 12.5;
  const earthDistKm = environment?.positions.earth.distance_km ?? 384400;
  const isEarthVisible = environment?.positions.earth.above_horizon ?? (earthElev > 0);

  // Speed of light in vacuum = 299,792.458 km/s
  const lightTimeSeconds = earthDistKm / 299792.458;

  // Solar power calculation
  const solarFlux = environment?.solar.solar_irradiance_w_m2 || 1361;
  const incidenceFactor = arrayType === 'tracking'
    ? 1.0
    : arrayType === 'vertical'
    ? Math.max(0, Math.cos((Math.abs(sunElev) * Math.PI) / 180)) // perpendicular to grazing sun
    : Math.max(0, Math.sin((Math.max(0, sunElev) * Math.PI) / 180)); // flat on ground

  const powerKw = isSunlit
    ? (arrayArea * (cellEfficiency / 100) * solarFlux * incidenceFactor) / 1000
    : 0;

  // Real Sun and Earth tracks across one lunar day, from the backend
  // timeline. If the backend is unreachable the tracks are simply omitted;
  // no synthetic path is drawn in their place.
  const [sunTrack, setSunTrack] = useState<SkyTrackPoint[]>([]);
  const [earthTrack, setEarthTrack] = useState<SkyTrackPoint[]>([]);
  const [trackStatus, setTrackStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [exaggeration, setExaggeration] = useState(3);

  useEffect(() => {
    const abort = new AbortController();
    setTrackStatus('loading');
    const timer = window.setTimeout(() => {
      fetch(`${API}/api/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          latitude: coordinate.lat,
          longitude: coordinate.lon,
          center_datetime_utc: instant,
          hours_before: TRACK_HALF_WINDOW_H,
          hours_after: TRACK_HALF_WINDOW_H,
          step_hours: TRACK_STEP_H
        })
      })
        .then((response) => {
          if (!response.ok) throw new Error(`timeline ${response.status}`);
          return response.json();
        })
        .then((data: { samples: Array<Record<string, number | boolean | null>> }) => {
          const samples = data.samples ?? [];
          setSunTrack(samples.map((x) => ({
            azimuthDeg: Number(x.solar_azimuth_deg),
            elevationDeg: Number(x.solar_elevation_deg)
          })));
          setEarthTrack(samples
            .filter((x) => typeof x.earth_azimuth_deg === 'number' && typeof x.earth_elevation_deg === 'number')
            .map((x) => ({
              azimuthDeg: Number(x.earth_azimuth_deg),
              elevationDeg: Number(x.earth_elevation_deg)
            })));
          setTrackStatus('ready');
        })
        .catch(() => {
          if (abort.signal.aborted) return;
          setSunTrack([]);
          setEarthTrack([]);
          setTrackStatus('unavailable');
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [coordinate.lat, coordinate.lon, instant]);

  // Quick Time Step Shifter (+1h, +12h, +1d, +7d)
  const stepTime = (hours: number) => {
    const currentMs = Date.parse(instant);
    const nextIso = new Date(currentMs + hours * 3600000).toISOString();
    onInstantChange(nextIso);
  };

  return (
    <div className="horizon-plot-container">
      {/* Header bar */}
      <div className="horizon-header">
        <div>
          <span className="sl-eyebrow">
            <Compass size={12} /> Topocentric horizon radar
          </span>
          <h2>Sun and Earth relative to the horizon</h2>
          <p>
            Assess power generation and Direct-to-Earth communication windows for{' '}
            <strong>{siteName}</strong> ({Math.abs(coordinate.lat).toFixed(2)}°{' '}
            {coordinate.lat < 0 ? 'S' : 'N'}, {Math.abs(coordinate.lon).toFixed(2)}°{' '}
            {coordinate.lon < 0 ? 'W' : 'E'}).
          </p>
        </div>

        {/* Time Quick Adjust Controls */}
        <div className="horizon-time-stepper">
          <button type="button" onClick={() => stepTime(-24)} title="Back 24 Hours">
            -24h
          </button>
          <button type="button" onClick={() => stepTime(-1)} title="Back 1 Hour">
            -1h
          </button>
          <span className="horizon-current-time" title={`Display time zone: ${timeZone}`}>
            <Clock size={12} aria-hidden="true" />
            {formatZonedDateTime(instant, timeZone)}
          </span>
          <button type="button" onClick={() => stepTime(1)} title="Forward 1 Hour">
            +1h
          </button>
          <button type="button" onClick={() => stepTime(24)} title="Forward 24 Hours">
            +24h
          </button>
          <button
            type="button"
            className="is-accent"
            onClick={() => onInstantChange(new Date().toISOString())}
            title="Current Instant"
          >
            Now
          </button>
        </div>
      </div>

      {/* Main Dual Layout: Radar on Left, Engineering Telemetry on Right */}
      <div className="horizon-content-grid">
        {/* ===================================================================
            LEFT: POLAR HORIZON RADAR SKY PLOT
            =================================================================== */}
        <div className="horizon-radar-card hz3-card">
          <div className="horizon-radar-meta">
            <span className="radar-legend-tag is-sun">
              <Sun size={14} /> Sun {sunElev >= 0 ? `+${sunElev.toFixed(2)}` : sunElev.toFixed(2)}&deg; &middot;{' '}
              {isSunlit ? 'Sunlit' : 'Shadow'}
            </span>
            <span className="radar-legend-tag is-earth">
              <Radio size={14} /> Earth {earthElev >= 0 ? `+${earthElev.toFixed(2)}` : earthElev.toFixed(2)}&deg; &middot;{' '}
              {isEarthVisible ? 'In view' : 'Below horizon'}
            </span>
            <label className="hz3-exag">
              Elevation scale
              <select value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))}>
                <option value={1}>1&times; (true)</option>
                <option value={3}>3&times;</option>
                <option value={5}>5&times;</option>
                <option value={10}>10&times;</option>
              </select>
            </label>
          </div>

          <div className="hz3-canvas">
            <HorizonSky3D
              sun={{ azimuthDeg: sunAz, elevationDeg: sunElev, visible: isSunlit }}
              earth={{ azimuthDeg: earthAz, elevationDeg: earthElev, visible: isEarthVisible }}
              sunTrack={sunTrack}
              earthTrack={earthTrack}
              exaggeration={exaggeration}
            />
            {exaggeration !== 1 && (
              <span className="hz3-badge">Heights exaggerated {exaggeration}&times; for visibility &middot; labels show true angles</span>
            )}
            <span className="hz3-hint">Drag to look around &middot; scroll to zoom</span>
          </div>

          <div className="horizon-plot-caption">
            <span><i className="hz3-swatch is-sun" /> Sun track over one lunar day (&plusmn;{TRACK_HALF_WINDOW_H} h)</span>
            <span><i className="hz3-swatch is-earth" /> Earth track (libration loop)</span>
            {trackStatus === 'loading' && <span>Loading tracks&hellip;</span>}
            {trackStatus === 'unavailable' && <span className="text-rose">Tracks unavailable: analysis server offline</span>}
          </div>
        </div>

        {/* ===================================================================
            RIGHT: POWER GENERATION & DTE TELEMETRY ANALYSIS
            =================================================================== */}
        <div className="horizon-analysis-rail">
          <section className="analysis-card dte-geometry" aria-labelledby="dte-geometry-title">
            <h3 id="dte-geometry-title">Visibility &amp; Geometry</h3>
            <dl>
              <div><dt>Earth visible</dt><dd className={isEarthVisible ? 'dte-visible' : 'dte-hidden'}>{isEarthVisible ? 'Yes' : 'No'}<i aria-hidden="true" /></dd></div>
              <div><dt>Sun elevation</dt><dd className="dte-solar">{sunElev.toFixed(1)}&deg;</dd></div>
              <div><dt>Earth elevation</dt><dd>{earthElev.toFixed(1)}&deg;</dd></div>
              <div><dt>Earth distance</dt><dd>{Math.round(earthDistKm).toLocaleString()} <small>km</small></dd></div>
              <div><dt>Comm. delay <small>(one-way)</small></dt><dd>{lightTimeSeconds.toFixed(3)} <small>s</small></dd></div>
            </dl>
            <details className="dte-additional"><summary>Pointing details</summary><p>Earth azimuth: {earthAz.toFixed(1)}&deg;</p><p>{isEarthVisible ? 'Earth is above the geometric horizon; link availability also depends on terrain and antenna configuration.' : 'Earth is below the horizon; a relay is needed for direct communications.'}</p></details>
          </section>
          <section className="analysis-card is-power dte-power" aria-labelledby="dte-power-title">
            <h3 id="dte-power-title">Solar Power Calculator</h3>
            <div className="dte-power-fields">
              <label><span>Area (m&sup2;)</span><input type="number" min="1" max="1000" step="any" value={arrayArea} onChange={e => setArrayArea(Math.max(1, Math.min(1000, Number(e.target.value))))} /></label>
              <label><span>Efficiency (%)</span><input type="number" min="5" max="50" step="any" value={cellEfficiency} onChange={e => setCellEfficiency(Math.max(5, Math.min(50, Number(e.target.value))))} /></label>
            </div>
            <fieldset className="dte-orientation"><legend>Orientation</legend><div><button type="button" aria-pressed={arrayType !== 'tracking'} onClick={() => setArrayType('vertical')}>Fixed</button><button type="button" aria-pressed={arrayType === 'tracking'} onClick={() => setArrayType('tracking')}>Sun-tracking</button></div></fieldset>
            <div className="dte-power-result" aria-live="polite"><span>Estimated Power</span><strong><Sun size={28} aria-hidden="true" />{Math.round(powerKw * 1000).toLocaleString()} W</strong><small>At {Math.round(isSunlit ? solarFlux : 0).toLocaleString()} W/m&sup2; direct irradiance</small></div>
            <details className="dte-additional"><summary>Array details</summary><label>Fixed array mounting<select value={arrayType === 'tracking' ? 'vertical' : arrayType} disabled={arrayType === 'tracking'} onChange={e => setArrayType(e.target.value as 'vertical' | 'horizontal')}><option value="vertical">Vertical (polar)</option><option value="horizontal">Horizontal (flat)</option></select></label><p>Output includes orientation and cell efficiency. {arrayType === 'tracking' ? 'Tracking follows the Sun.' : 'Fixed panels use the selected mounting angle.'}</p><p>{(powerKw * 24).toFixed(1)} kWh over 24 hours at this constant power.</p></details>
          </section>
        </div>
      </div>
    </div>
  );
}

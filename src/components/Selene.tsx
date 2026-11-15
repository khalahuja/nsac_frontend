import { DEFAULT_REQUIREMENTS } from '../lib/operations';
import type { OperationsRequest, OperationsResult } from '../lib/operations';
import { API } from '../lib/apiEndpoints';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, CalendarDays, Clock, Compass, Crosshair, Download, Eye,
  Grid2X2, Layers, LocateFixed, Moon, Play, Radio, RefreshCw, Search,
  Sun, Thermometer, X
} from 'lucide-react';
import { Crater, EnvironmentResult, ForecastResult, LunarCoordinate } from '../lib/lunar';
import {
  DEFAULT_CRATERS, computeEquilibriumConditions,
  computeSimulatedForecast, downloadForecastCsv
} from '../lib/lunarPhysics';
import {
  formatZonedDateTime, isSupportedTimeZone, localInput, timeZones, utcInput
} from '../lib/time';
import { MapLayerControls } from './MapLayerControls';
import type { MapLayer, TerrainLayer } from '../lib/science';
const OperationsPage = lazy(() => import('./OperationsPage').then(module => ({ default: module.OperationsPage })));
const ForecastChart = lazy(() => import('./ForecastChart').then(module => ({ default: module.ForecastChart })));
const HorizonSkyPlot = lazy(() => import('./HorizonSkyPlot').then(module => ({ default: module.HorizonSkyPlot })));
import type { LunarView } from './LunarGlobe';
const CraterSkyView = lazy(() => import('./CraterSkyView').then(module => ({ default: module.CraterSkyView })));
const LunarGlobe = lazy(() => import('./LunarGlobe').then(module => ({ default: module.LunarGlobe })));
const MissionCalculator = lazy(() => import('./MissionCalculator').then(module => ({ default: module.MissionCalculator })));
import type { ToolId } from './MissionCalculator';
import { PAGES, pageInfo, pageFromHash } from '../lib/navigation';
import type { PageId, ToolInputs } from '../lib/navigation';
import { SouthPoleMap } from './SouthPoleMap';
import type { CompareRequest, ComparisonFocusRequest } from './SiteComparisonView';
import { fetchForecastChunked, validateChunked } from '../lib/forecastChunks';
import { SOUTH_POLE_FEATURES } from '../lib/southPole';
import { ModelsPage } from './ModelsPage';
import { ForecastPowerSummary } from './ForecastPowerSummary';
const SiteComparisonView = lazy(() => import('./SiteComparisonView').then(module => ({ default: module.SiteComparisonView })));
import { MissionContextBar } from './MissionContextBar';
import { ChatWidget } from './ChatWidget';
import type { WindowCriteria } from '../lib/science';
const ScienceWindowsPage = lazy(() => import('./ScienceWindowsPage').then(module => ({ default: module.ScienceWindowsPage })));
const MissionLabPage = lazy(() => import('./MissionLabPage').then(module => ({ default: module.MissionLabPage })));
const MissionPlannerPage = lazy(() => import('./MissionPlannerPage').then(module => ({ default: module.MissionPlannerPage })));
const TrajectoryExplorer = lazy(() => import('./TrajectoryExplorer').then(module => ({ default: module.TrajectoryExplorer })));
const SurfaceAnalysisPage = lazy(() => import('./SurfaceAnalysisPage').then(module => ({ default: module.SurfaceAnalysisPage })));
const ClpsPage = lazy(() => import('./ClpsPage').then(module => ({ default: module.ClpsPage })));
import '../selene.css';
import '../polestar.css';
import '../humanist.css';
import '../controls.css';
import '../workspace.css';
// Page styles load last so they win on their own pages.
import '../compare.css';
import '../windows.css';
import '../mission.css';
import '../mission-planner.css';
import '../dark-indigo.css';



const coordText = (p: LunarCoordinate) =>
  `${Math.abs(p.lat).toFixed(4)}° ${p.lat < 0 ? 'S' : 'N'} / ${Math.abs(p.lon).toFixed(4)}° ${p.lon < 0 ? 'W' : 'E'}`;

/** Default site: the best-lit published south-pole point (Gläser et al. 2018). */
const DEFAULT_SITE = { name: 'Connecting Ridge (C1)', lat: -89.4398, lon: -137.17 };

export const PRESET_SITES: Array<{ name: string; detail: string; lat: number; lon: number }> = [
  { name: 'Shackleton vicinity', detail: 'Low spot (−754 m) about 11 km from Shackleton\'s rim · sunlit only ~9 % of 2027 (LOLA terrain + JPL DE440)', lat: -89.54, lon: 0.0 },
  { name: 'Malapert Massif vicinity', detail: 'High-relief south-polar exploration point', lat: -86.04, lon: 2.7 },
  { name: 'Connecting Ridge (C1)', detail: 'Best-lit point near the pole: 92 % time in sunlight at 2 m (Gläser et al. 2018)', lat: -89.4398, lon: -137.17 },
  { name: 'de Gerlache vicinity', detail: 'Inside de Gerlache\'s catalogue footprint (shadowed floor) · representative point', lat: -88.71, lon: -88.34 },
  { name: 'Haworth vicinity', detail: 'Inside Haworth\'s catalogue footprint, near NASA\'s 2024 Haworth candidate region', lat: -87.87, lon: -5.1 },
  { name: 'Nobile Rim vicinity', detail: 'Near NASA candidate regions and former VIPER study area', lat: -85.25, lon: 37.8 },
  { name: 'Apollo 11', detail: 'Mare Tranquillitatis (0.67° N) · First crewed landing (1969)', lat: 0.6741, lon: 23.4729 },
  { name: 'Tycho', detail: 'Southern Highlands (-43.31° S) · Prominent ray crater', lat: -43.31, lon: -11.36 },
  { name: 'Copernicus', detail: 'Oceanus Procellarum (9.62° N) · High-albedo central peak', lat: 9.62, lon: -20.08 }
];


/** Site and period shared through the URL query (?lat=&lon=&site=&start=&end=&step=&tz=&t=). */
type UrlState = { coordinate?: LunarCoordinate; site?: string; start?: string; end?: string; step?: number; zone?: string; instant?: string };
function readUrlState(): UrlState {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string) => { const v = q.get(k); return v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined; };
  const iso = (k: string) => { const v = q.get(k); return v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined; };
  const lat = num('lat'), lon = num('lon'), step = num('step');
  const state: UrlState = {};
  if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) state.coordinate = { lat, lon };
  const site = q.get('site'); if (site) state.site = site.slice(0, 80);
  const start = iso('start'), end = iso('end');
  if (start && end && Date.parse(end) > Date.parse(start)) { state.start = start; state.end = end; }
  if (step !== undefined && step > 0 && step <= 24) state.step = step;
  const tz = q.get('tz');
  if (tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); state.zone = tz; } catch { /* ignore unknown zone */ } }
  const t = iso('t'); if (t) state.instant = t;
  return state;
}
function writeUrlState(state: { coordinate: LunarCoordinate | null; site: string; start: string; end: string; step: number; zone: string }) {
  const q = new URLSearchParams(window.location.search);
  if (state.coordinate) { q.set('lat', state.coordinate.lat.toFixed(4)); q.set('lon', state.coordinate.lon.toFixed(4)); }
  q.set('site', state.site); q.set('start', state.start); q.set('end', state.end); q.set('step', String(state.step)); q.set('tz', state.zone);
  const url = `${window.location.pathname}?${q.toString()}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', url);
}
const URL_STATE = readUrlState();

async function jsonRequest<T>(path: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    signal,
    ...(payload ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    } : {})
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.detail === 'string' ? data.detail : `Request failed (${response.status})`);
  }
  return response.json();
}

type AppMode = PageId;

export function Selene({ onContext }: { onContext?: () => void }) {
  // Master Mode Navigation
  const [activeMode, setActiveMode] = useState<AppMode>(pageFromHash);
  const currentTool = pageInfo(activeMode).tool;


  // Keep the URL in step with the page so it can be bookmarked or shared and
  // the browser's back/forward buttons move between pages.
  useEffect(() => {
    const hash = `#${pageInfo(activeMode).slug}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  }, [activeMode]);
  useEffect(() => {
    const onPop = () => setActiveMode(pageFromHash());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('hashchange', onPop); };
  }, []);

  // Coordinates & exploration target (default: Connecting Ridge C1, the best-lit published point)
  const [coordinate, setCoordinate] = useState<LunarCoordinate | null>(() => URL_STATE.coordinate ?? DEFAULT_SITE);
  const [cameraCoordinate, setCameraCoordinate] = useState<LunarCoordinate | null>(() => URL_STATE.coordinate ?? DEFAULT_SITE);
  const [hovered, setHovered] = useState<LunarCoordinate | null>(null);
  const [lat, setLat] = useState(() => String(URL_STATE.coordinate?.lat ?? DEFAULT_SITE.lat));
  const [lon, setLon] = useState(() => String(URL_STATE.coordinate?.lon ?? DEFAULT_SITE.lon));
  const [site, setSite] = useState(() => URL_STATE.site ?? DEFAULT_SITE.name);

  // View settings
  const [craterView, setCraterView] = useState(false);
  const [lunarView, setLunarView] = useState<LunarView>('south');
  const [navigation, setNavigation] = useState(0);
  const [globeZoom, setGlobeZoom] = useState<'overview' | 'polar' | 'surface'>('overview');
  const [grid, setGrid] = useState(false);
  const [showCraters, setShowCraters] = useState(true);
  const [showOrbits, setShowOrbits] = useState(true);
  const [timeScale, setTimeScale] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(true);


  // Craters & Search
  const [craters, setCraters] = useState<Crater[]>(DEFAULT_CRATERS);
  const [query, setQuery] = useState('');

  // Time settings
  const zones = useMemo(timeZones, []);
  const [zone, setZone] = useState(() => {
    if (URL_STATE.zone) return URL_STATE.zone;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    try {
      const savedZone = window.localStorage.getItem('selene.timeZone');
      return savedZone && isSupportedTimeZone(savedZone) ? savedZone : browserZone;
    } catch {
      return browserZone;
    }
  });
  const [instant, setInstant] = useState(() => URL_STATE.instant ?? new Date().toISOString());
  const [start, setStart] = useState(() => URL_STATE.start ?? new Date().toISOString());
  const [end, setEnd] = useState(() => URL_STATE.end ?? new Date(Date.now() + 7 * 86400000).toISOString());
  const [step, setStep] = useState(() => URL_STATE.step ?? 3);

  // Keep the shared site and period in the address bar, so any view can be bookmarked or shared.
  useEffect(() => {
    const timer = window.setTimeout(() => writeUrlState({ coordinate, site, start, end, step, zone }), 300);
    return () => window.clearTimeout(timer);
  }, [coordinate, site, start, end, step, zone]);
  // Sites sent by the assistant for Compare Sites (applied once per nonce).
  const [compareRequest, setCompareRequest] = useState<CompareRequest>();
  const [comparisonFocus, setComparisonFocus] = useState<ComparisonFocusRequest>();
  const [chatCriteria, setChatCriteria] = useState<WindowCriteria | undefined>();
  const [missionTool, setMissionTool] = useState<{ id: ToolId; nonce: number }>();
  const [toolScenarios, setToolScenarios] = useState<Partial<Record<ToolId, { inputs: ToolInputs; nonce: number }>>>({});

  const [operationsRequirements, setOperationsRequirements] = useState({ ...DEFAULT_REQUIREMENTS });
  const [operationsRange, setOperationsRange] = useState<{ start: string; end: string } | null>(null);
  const [operationsRadius, setOperationsRadius] = useState(10);
  const [operationsResult, setOperationsResult] = useState<OperationsResult | null>(null);
  const operationsRequest: OperationsRequest = {
    latitude: coordinate?.lat ?? DEFAULT_SITE.lat, longitude: coordinate?.lon ?? DEFAULT_SITE.lon,
    landing_start_utc: operationsRange?.start ?? start, landing_end_utc: operationsRange?.end ?? end,
    nearby_radius_km: operationsRadius, requirements: operationsRequirements,
  };
  const changeOperations = (request: OperationsRequest) => {
    setOperationsRequirements(request.requirements); setOperationsRadius(request.nearby_radius_km);
    setOperationsRange({ start: request.landing_start_utc, end: request.landing_end_utc });
    setOperationsResult(null);
    if (request.latitude !== coordinate?.lat || request.longitude !== coordinate?.lon) selectLocation({ lat: request.latitude, lon: request.longitude }, 'Mission operations site');
  };

  // Environmental & Forecast Data
  const [environment, setEnvironment] = useState<EnvironmentResult | null>(() =>
    computeEquilibriumConditions(DEFAULT_SITE, new Date().toISOString())
  );
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [forecastCursor, setForecastCursor] = useState<number | null>(null);
  const [mapLayer, setMapLayer] = useState<MapLayer>('imagery');
  const [terrainLayer, setTerrainLayer] = useState<TerrainLayer | null>(null);
  const [layerOpacity, setLayerOpacity] = useState(.65);
  useEffect(() => setForecastCursor(null), [forecast]);
  const pendingChartScroll = useRef(false);
  useEffect(() => {
    if (activeMode === 'forecast' && pendingChartScroll.current) {
      pendingChartScroll.current = false;
      document.querySelector('.science-cursor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMode, forecastCursor]);

  // Async States
  const [busy, setBusy] = useState(false);
  const [forecastBusy, setForecastBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);

  const forecastSequence = useRef(0);
  const exportSequence = useRef(0);

  const changeTimeZone = (nextZone: string) => {
    if (!isSupportedTimeZone(nextZone)) {
      setError(`The time zone ${nextZone} is not supported by this browser.`);
      return;
    }
    setZone(nextZone);
    setError('');
    try {
      window.localStorage.setItem('selene.timeZone', nextZone);
    } catch {
      // Storage can be unavailable in private or locked-down browser contexts.
    }
  };

  // Health check & Dynamic Craters loader
  useEffect(() => {
    const abort = new AbortController();
    jsonRequest('/api/status', undefined, abort.signal)
      .then(() => setOnline(true))
      .catch((e) => {
        if (e.name !== 'AbortError') setOnline(false);
      });
    jsonRequest<Crater[]>('/api/moon/features', undefined, abort.signal)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCraters([...data, ...DEFAULT_CRATERS.filter(crater => !data.some(item => item.name === crater.name))]);
        }
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, []);

  // Environment analysis when coordinate or instant updates
  useEffect(() => {
    if (!coordinate) return;
    const instantEnv = computeEquilibriumConditions(coordinate, instant);
    setEnvironment(instantEnv);

    const abort = new AbortController();
    setBusy(true);
    setError('');

    const timer = window.setTimeout(() => {
      jsonRequest<EnvironmentResult>(
        '/api/environment',
        { latitude: coordinate.lat, longitude: coordinate.lon, datetime_utc: instant, include_sun_events: false },
        abort.signal
      )
        .then((val) => {
          setEnvironment(val);
          setOnline(true);
        })
        .catch((e) => {
          if (!abort.signal.aborted) {
            if (e instanceof TypeError) {
              setOnline(false);
            }
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setBusy(false);
        });
    }, 150);

    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [coordinate, instant]);

  // Invalidate forecast when inputs change
  useEffect(() => {
    forecastSequence.current += 1;
    exportSequence.current += 1;
    setForecast(null);
    setForecastBusy(false);
    setExportBusy(false);
  }, [coordinate, start, end, step]);

  // Limit expensive parent renders during pointer movement to 20 per second.
  const hoverTime = useRef(0);
  const handleHover = useCallback((point: LunarCoordinate | null) => {
    const now = performance.now();
    if (point && now - hoverTime.current < 50) return;
    hoverTime.current = now;
    setHovered(point);
  }, []);

  // Location selector helper
  const selectLocation = (point: LunarCoordinate, name = 'Target Site') => {
    const clean = { lat: Number(point.lat.toFixed(4)), lon: Number(point.lon.toFixed(4)) };
    setCoordinate(clean);
    setCameraCoordinate(clean);
    setLat(String(clean.lat));
    setLon(String(clean.lon));
    setSite(name);
    setNavigation((n) => n + 1);
    setError('');
    setQuery('');
  };

  const navigateToCoords = () => {
    const p = { lat: Number(lat), lon: Number(lon) };
    if (!lat.trim() || !lon.trim() || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
      setError('Enter valid latitude (-90° to 90°) and longitude (-180° to 180°).');
      return;
    }
    selectLocation(p, `Target ${coordText(p)}`);
  };

  const changeDate = (value: string, setter: (val: string) => void) => {
    try {
      setter(utcInput(value, zone));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Forecast payload generator
  const getForecastPayload = () => {
    if (!coordinate) throw new Error('Select a lunar location first.');
    if (Date.parse(end) <= Date.parse(start)) throw new Error('Forecast end must be after start time.');
    const payload = {
      latitude: coordinate.lat,
      longitude: coordinate.lon,
      start_datetime_utc: start,
      end_datetime_utc: end,
      step_hours: step,
      display_timezone: zone
    };
    // Long periods are fetched in chunks; this only rejects the overall cap.
    validateChunked(payload);
    return payload;
  };

  // Generate forecast
  const generateForecast = async () => {
    const req = ++forecastSequence.current;
    setForecastBusy(true);
    setError('');

    let payload;
    try { payload = getForecastPayload(); } catch (e) {
      setError((e as Error).message);
      setForecastBusy(false);
      return;
    }
    try {
      // Chunked: periods beyond the server's 1,200-sample cap are split and
      // stitched; failed chunks fall back to the labelled in-browser model.
      const result = await fetchForecastChunked(payload);
      if (req === forecastSequence.current) {
        setForecast(result);
        setOnline(result.fallbackChunks < result.chunkCount);
      }
    } catch (e) {
      if (req === forecastSequence.current) setError((e as Error).message);
    } finally {
      if (req === forecastSequence.current) setForecastBusy(false);
    }
  };

  // Export workbook
  const exportWorkbook = async () => {
    const req = ++exportSequence.current;
    setExportBusy(true);
    setError('');

    let payload;
    try { payload = getForecastPayload(); } catch (e) {
      setError((e as Error).message);
      setExportBusy(false);
      return;
    }
    try {
      const response = await fetch(`${API}/api/export/xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Server export failed');
      const blob = await response.blob();
      if (req !== exportSequence.current) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `selene-lunar-forecast-${site.toLowerCase().replace(/[^a-z0-9]/g, '-')}.xlsx`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (forecast) {
        downloadForecastCsv(forecast, site);
      } else if (coordinate) {
        const simulated = computeSimulatedForecast(coordinate, start, end, step);
        downloadForecastCsv(simulated, site);
      }
    } finally {
      if (req === exportSequence.current) setExportBusy(false);
    }
  };

  // Filter search results
  const searchResults = query.trim()
    ? [...PRESET_SITES, ...craters]
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .filter((p, i, all) => all.findIndex((other) => other.name === p.name) === i)
        .slice(0, 7)
    : [];

  const fmt = (n: number | undefined | null, digits = 1) =>
    n === undefined || n === null ? '—' : n.toFixed(digits);

  return (
    <main className={`selene-app${activeMode === 'swarm' || activeMode === 'mission-plan' ? ' is-mission-planner' : ''}`}>
      {/* ====================================================================
          MASTER TOP NAVIGATION BAR
          Features Brand, Master Mode Switcher Tabs, and Engine Status
          ==================================================================== */}
      <header className="sl-navbar">
        {/* Brand */}
        <a
          href="#"
          className="sl-brand"
          onClick={(e) => {
            e.preventDefault();
            setActiveMode('selene');
            setLunarView('south');
            setCameraCoordinate(null);
            setGlobeZoom('overview');
            setNavigation((n) => n + 1);
          }}
          title="Reset to Selene Lunar Atlas"
        >
          <img className="sl-brand-logo" src="/selene-logo.png" alt="" />
          <div className="sl-brand-text">
            <strong>SELENE</strong>
          </div>
        </a>

        {/*
          Primary navigation. Labels are plain words a first-time visitor can
          act on; the expert term lives in the tooltip. Order follows the
          natural workflow: pick a spot -> check its sky -> compare -> plan.
        */}
        <nav className="atlas-nav" aria-label="Main pages">
          {([['selene', 'Moon'], ['horizon', 'Sky'], ['compare', 'Compare'], ['forecast', 'Forecast'], ['operations', 'Operations'], ['swarm', 'Agent Swarm'], ['mission-lab', 'Mission lab']] as const).map(([id, label]) => (
            <a key={id} href={`#${pageInfo(id).slug}`} aria-current={activeMode === id ? 'page' : undefined} onClick={event => { event.preventDefault(); setActiveMode(id); }}>{label}</a>
          ))}
          <details className="atlas-tools" key={activeMode}>
            <summary className={currentTool || activeMode === 'windows' ? 'is-active' : ''}>Tools</summary>
            <div className="atlas-tools-menu">
              {PAGES.filter(page => (page.tool && page.id !== 'calculator') || page.id === 'windows').map(page => (
                <a key={page.id} href={`#${page.slug}`} title={page.hint} aria-current={activeMode === page.id ? 'page' : undefined} onClick={event => { event.preventDefault(); setActiveMode(page.id); }}>{page.label}</a>
              ))}
            </div>
          </details>
        </nav>

        <div className="sl-nav-tail">
          <label className="sl-timezone-control" title="Times are shown in this zone. Calculations always use UTC.">
            <Clock size={14} aria-hidden="true" />
            <select
              className="sl-tz-select"
              value={zone}
              onChange={(e) => changeTimeZone(e.target.value)}
              aria-label="Time zone"
            >
              {zones.map((z) => (
                <option key={z} value={z}>{z === 'UTC' ? 'UTC' : z.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <MissionContextBar
          siteName={site}
          sites={PRESET_SITES}
          onSelectSite={chosen => selectLocation({ lat: chosen.lat, lon: chosen.lon }, chosen.name)}
          lat={lat}
          lon={lon}
          onLatChange={setLat}
          onLonChange={setLon}
          onGo={navigateToCoords}
          instant={instant}
          zone={zone}
          onDateTimeChange={(value) => changeDate(value, setInstant)}
          onNow={() => setInstant(new Date().toISOString())}
        />

      {/* ====================================================================
          MAIN WORKSPACE
          ==================================================================== */}
      <Suspense fallback={<div role="status" style={{ padding: 24 }}>Loading view...</div>}>
      <div className={`sl-workspace${activeMode === 'swarm' || activeMode === 'mission-plan' ? ' sl-workspace-mission' : ''}`}>
        {(activeMode === 'swarm' || activeMode === 'mission-plan') && <MissionPlannerPage latitude={coordinate?.lat ?? DEFAULT_SITE.lat} longitude={coordinate?.lon ?? DEFAULT_SITE.lon} />}
        {activeMode === 'operations' && <OperationsPage request={operationsRequest} result={operationsResult} siteName={site} timeZone={zone}
          onChange={changeOperations} onResult={setOperationsResult}
          onUseSite={(latitude, longitude, name) => { selectLocation({ lat: latitude, lon: longitude }, name); setOperationsResult(null); }}
          onUseDate={date => { setOperationsRange({ start: operationsRequest.landing_start_utc, end: operationsRequest.landing_end_utc }); setInstant(date); setStart(date); setEnd(new Date(Date.parse(date) + operationsRequirements.mission_hours * 3600000).toISOString()); }} />}
        {activeMode === 'trajectories'  && <TrajectoryExplorer startUtc={start} onUseArrival={arrival => {
          // Surface stay starts at arrival; look at the following 14 days in the shared period.
          const from = new Date(arrival).toISOString();
          setStart(from); setEnd(new Date(Date.parse(from) + 14 * 86400000).toISOString()); setInstant(from); setForecast(null);
          setActiveMode('forecast');
        }} />}
        {activeMode === 'surface' && coordinate && <SurfaceAnalysisPage coordinate={coordinate} siteName={site} instant={instant} onInstantChange={setInstant} />}
        {activeMode === 'clps' && <ClpsPage />}
        {activeMode === 'mission-lab' && coordinate && (
          <MissionLabPage
            siteName={site}
            coordinate={coordinate}
            forecast={forecast}
            environment={environment}
            timeZone={zone}
            busy={forecastBusy}
            onGenerate={() => void generateForecast()}
          />
        )}
        {/* ==================================================================
            MODE 1: HORIZON & DTE SKY PLOT VIEW
            ================================================================== */}
        {activeMode === 'windows' && (
          <div style={{ gridColumn: '1 / -1', height: '100%', overflow: 'hidden' }}>
            <ScienceWindowsPage
              externalCriteria={chatCriteria}
              siteName={site}
              coordinateText={coordinate ? coordText(coordinate) : 'No site selected'}
              forecast={forecast}
              forecastBusy={forecastBusy}
              onGenerate={() => { if (coordinate) void generateForecast(); }}
              start={start}
              end={end}
              step={step}
              onStartChange={(value) => changeDate(value, setStart)}
              onEndChange={(value) => changeDate(value, setEnd)}
              onStepChange={setStep}
              timeZone={zone}
              error={error}
              onInspect={(index) => {
                pendingChartScroll.current = true;
                setForecastCursor(index);
                setActiveMode('forecast');
              }}
            />
          </div>
        )}

        {activeMode === 'forecast' && (
          <section className="sl-forecast-page" aria-labelledby={'forecast-title'}>
            <div className="sl-forecast-header">
              <div>
                <span className="sl-eyebrow">Surface environment / {'Forecast'}</span>
                <h1 id={'forecast-title'}>{'Diurnal forecast'}</h1>
                <p>{'Explore temperature, sunlight and Earth visibility over your selected period.'}</p>
              </div>
              {activeMode === 'forecast' && <div className="sl-forecast-actions">
                <button type="button" className="sl-btn-secondary" disabled={!coordinate || exportBusy || forecastBusy}
                  onClick={() => void exportWorkbook()}>
                  <Download size={16} /> {exportBusy ? 'Exporting...' : 'Export workbook'}
                </button>
                <button type="button" className="sl-btn-primary sl-csv-button"
                  disabled={!forecast?.samples.length || forecastBusy}
                  onClick={() => forecast && downloadForecastCsv(forecast, site)}>
                  <Download size={18} /> Download CSV
                </button>
              </div>}
            </div>
            <div className="sl-forecast-context">
              <label>Forecast site
                <select value={PRESET_SITES.some((p) => p.name === site) ? site : 'custom'}
                  onChange={(e) => { const target = PRESET_SITES.find((p) => p.name === e.target.value); if (target) selectLocation(target, target.name); }}>
                  {!PRESET_SITES.some((p) => p.name === site) && <option value="custom">{site}</option>}
                  {PRESET_SITES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              </label>
              <div><span>Coordinates</span><strong>{coordinate ? coordText(coordinate) : 'Select a site'}</strong></div>
              <div><span>Display time zone</span><strong>{zone.replace(/_/g, ' ')}</strong></div>
              <button type="button" className="sl-btn-secondary" onClick={() => { setActiveMode('selene'); }}>
                <Crosshair size={16} /> Choose on atlas
              </button>
            </div>
                    <div className="sl-forecast-controls">
                      <label>
                        Start date and time ({zone.replace(/_/g, ' ')})
                        <input
                          type="datetime-local"
                          value={localInput(start, zone)}
                          onChange={(e) => changeDate(e.target.value, setStart)}
                        />
                      </label>
                      <label>
                        End date and time ({zone.replace(/_/g, ' ')})
                        <input
                          type="datetime-local"
                          value={localInput(end, zone)}
                          onChange={(e) => changeDate(e.target.value, setEnd)}
                        />
                      </label>
                      <label>
                        Sampling Step Interval
                        <select
                          value={step}
                          onChange={(e) => setStep(Number(e.target.value))}
                        >
                          <option value={1}>1 hour (high resolution)</option>
                          <option value={3}>3 hours (standard)</option>
                          <option value={6}>6 hours (medium)</option>
                          <option value={12}>12 hours (fast)</option>
                          <option value={24}>24 hours (1 sample/day)</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        className="sl-btn-primary"
                        disabled={!coordinate || forecastBusy}
                        onClick={() => void generateForecast()}
                      >
                        {forecastBusy ? (
                          <>
                            <RefreshCw size={14} className="spin" /> Generating Prediction...
                          </>
                        ) : (
                          <>
                            <Play size={14} /> {'Calculate Diurnal Forecast'}
                          </>
                        )}
                      </button>
                    </div>


            {error && <p role="alert" className="sl-forecast-notice">{error}</p>}
            <div className="sl-forecast-results" aria-busy={forecastBusy}>
              {forecastBusy && <p role="status" className="sl-forecast-notice">Generating forecast for {site}...</p>}
              {forecast?.samples.length ? (
                <>
                  
                  <div className="sl-forecast-results-heading">
                    <div><h2>Environment over time</h2><p>{forecast.sample_count} samples · {step}-hour interval · {zone.replace(/_/g, ' ')}</p></div>
                    <span>Model: {forecast.model_name || 'Thermal Relaxation'}</span>
                  </div>
                  <ForecastPowerSummary forecast={forecast} />
                  <div className="science-cursor"><label>Shared chart time: {forecastCursor === null ? 'Move over a chart or use the slider' : formatZonedDateTime(forecast.samples[forecastCursor]?.datetime_utc ?? forecast.samples[0].datetime_utc, zone)}
                    <input type="range" min="0" max={forecast.samples.length - 1} value={forecastCursor ?? 0} onChange={e => setForecastCursor(Number(e.target.value))} /></label></div>
                  <div className="sl-forecast-chart-grid">
                    <ForecastChart samples={forecast.samples} field="temperature_c" title="Surface temperature" unit="°C" color="#9beefc" timeZone={zone} hoveredIndex={forecastCursor} onHoverIndex={setForecastCursor} />
                    <ForecastChart samples={forecast.samples} field="solar_irradiance_w_m2" title="Solar irradiance" unit="W/m²" color="#f6c967" timeZone={zone} hoveredIndex={forecastCursor} onHoverIndex={setForecastCursor} />
                    <ForecastChart samples={forecast.samples} field="solar_elevation_deg" title="Solar elevation" unit="°" color="#6ee7b7" timeZone={zone} hoveredIndex={forecastCursor} onHoverIndex={setForecastCursor} />
                    <ForecastChart samples={forecast.samples} field="earth_elevation_deg" title="Earth elevation" unit="°" color="#7dd3fc" timeZone={zone} hoveredIndex={forecastCursor} onHoverIndex={setForecastCursor} />
                  </div>
                  

                </>
              ) : !forecastBusy && (
                <div className="sl-forecast-empty"><CalendarDays size={32} /><h2>{'Ready to explore your forecast'}</h2>
                  <p>{'Choose a site and date range, then calculate the forecast. Your charts and CSV download will appear here.'}</p></div>
              )}
            </div>
          </section>
        )}

        {activeMode === 'horizon' && (
          <div style={{ gridColumn: '1 / -1', height: '100%', overflow: 'hidden' }}>
            <HorizonSkyPlot
              coordinate={coordinate || DEFAULT_SITE}
              siteName={site}
              instant={instant}
              environment={environment}
              timeZone={zone}
              onInstantChange={setInstant}
            />
          </div>
        )}

        {/* ==================================================================
            MODE 2: CANDIDATE LANDING SITES COMPARISON VIEW
            ================================================================== */}
        {activeMode === 'compare' && (
          <div style={{ gridColumn: '1 / -1', height: '100%', overflow: 'hidden' }}>
            <SiteComparisonView
              activeSiteName={site}
              request={compareRequest}
              focusRequest={comparisonFocus}
              currentCoordinate={coordinate}
              currentSiteName={site}
              timeZone={zone} start={start} end={end} step={step}
              onSelectSite={(chosen) => {
                selectLocation({ lat: chosen.lat, lon: chosen.lon }, chosen.name);
                setActiveMode('horizon');
              }}
            />
          </div>
        )}

        {/* ==================================================================
            MODE 3: MISSION ENGINEERING CALCULATOR
            ================================================================== */}
        {currentTool && (
          <div style={{ gridColumn: '1 / -1', height: '100%', overflow: 'hidden' }}>
            <MissionCalculator
              coordinate={coordinate}
              requestedTool={activeMode === 'calculator' ? missionTool?.id ?? currentTool : currentTool}
              requestKey={missionTool?.nonce}
              standalone
              timeZone={zone}
              scenarios={toolScenarios}
              onSelectSite={(chosen) => {
                selectLocation({ lat: chosen.lat, lon: chosen.lon }, chosen.name);
                setActiveMode('selene');
              }}
            />
          </div>
        )}

        {/* ==================================================================
            MODE 6: SELENE LUNAR ATLAS & SURFACE EXPLORER
            ================================================================== */}
        {activeMode === 'models' && <ModelsPage />}
        {activeMode === 'selene' && (
          <>
            <section className="sl-viewer" aria-label="Interactive Lunar Globe">
              {craterView ? <CraterSkyView coordinate={coordinate ?? DEFAULT_SITE} siteName={site} instant={instant} timeZone={zone} environment={environment} onInstantChange={setInstant} onExit={() => setCraterView(false)} /> : <>
              <LunarGlobe
                coordinate={coordinate}
                hoverCoordinate={hovered}
                focusCoordinate={cameraCoordinate}
                view={lunarView}
                zoom={globeZoom}
                featureLabels={SOUTH_POLE_FEATURES}
                navigation={navigation}
                grid={grid}
                craters={craters}
                selectedName={site}
                siteMarkers={PRESET_SITES.filter(candidate => candidate.lat < -80)}
                showCraters={showCraters}
                mapLayer={mapLayer} terrainLayer={terrainLayer} layerOpacity={layerOpacity} layerInstant={instant}
                onSelect={(point) => selectLocation(point, `Location ${coordText(point)}`)}
                onSelectMarker={(marker) => selectLocation(marker, marker.name)}
                onHover={handleHover}
              />

              <details className="sl-map-overlay">
                <summary><Layers size={16} aria-hidden="true" /> Interactive map layers</summary>
                <div className="sl-map-overlay-content">
                    <MapLayerControls layer={mapLayer} setLayer={setMapLayer} terrain={terrainLayer} setTerrain={setTerrainLayer} opacity={layerOpacity} setOpacity={setLayerOpacity} point={hovered ?? coordinate} instant={instant} timeZone={zone} />
                </div>
              </details>

              <button type="button" className="crater-entry" onClick={() => setCraterView(true)}><Eye size={14} /> View from crater</button>
              <div className="sl-floating-dock" role="toolbar" aria-label="Globe controls">
                <button title="South Pole" aria-label="South Pole"
                  type="button"
                  className="sl-dock-btn"
                  onClick={() => {
                    setLunarView('south');
                    setCameraCoordinate(null);
                    setGlobeZoom('polar');
                    setNavigation((n) => n + 1);
                  }}
                >
                  <LocateFixed size={14} />
                </button>
                <button title="Zoom to site" aria-label="Zoom to site" type="button" className="sl-dock-btn" disabled={!coordinate} onClick={() => {
                  setCameraCoordinate(coordinate); setGlobeZoom('surface'); setNavigation(n => n + 1);
                }}><Crosshair size={14} /></button>
                <button title="Whole Moon" aria-label="Whole Moon" type="button" className="sl-dock-btn" onClick={() => {
                  setCameraCoordinate(null); setGlobeZoom('overview'); setNavigation(n => n + 1);
                }}><Moon size={14} /></button>
                <button title="Coordinate Grid" aria-label="Coordinate Grid" aria-pressed={grid}
                  type="button"
                  className={`sl-dock-btn ${grid ? 'is-active' : ''}`}
                  onClick={() => setGrid(!grid)}
                >
                  <Grid2X2 size={14} />
                </button>
                <button title="Crater Markers" aria-label="Crater Markers" aria-pressed={showCraters}
                  type="button"
                  className={`sl-dock-btn ${showCraters ? 'is-active' : ''}`}
                  onClick={() => setShowCraters(!showCraters)}
                >
                  <Layers size={14} />
                </button>
              </div>

              <div className="sl-hud-coords">
                <span>
                  <Crosshair size={11} className="sl-pointer-icon" />
                  Surface pointer coordinates
                </span>
                <strong>
                  {hovered
                    ? coordText(hovered)
                    : coordinate
                    ? coordText(coordinate)
                    : 'Click or hover the globe to sample'}
                </strong>
              </div>
              </>}
            </section>

            {/* Right Inspector Panel */}
            <aside className="sl-inspector" aria-label="Selected site inspector">
              <div className="sl-panel-scroll">
                <section className="atlas-snapshot" aria-label="Site conditions">
                  <header>
                    <div>
                      <h2>{site}</h2>
                      <small>{coordinate ? coordText(coordinate) : 'Select a site'}</small>
                    </div>
                    <span className={environment?.solar.illuminated ? 'condition-status is-sunlit' : 'condition-status'}>
                      {busy ? 'Calculating' : environment?.solar.illuminated ? 'Sunlit' : 'Shadowed'}
                    </span>
                  </header>
                  <div className="atlas-metrics">
                    <div>
                      <span><Thermometer size={12} aria-hidden="true" /> Temperature</span>
                      <strong>{fmt(environment?.thermal.temperature_c, 1)} °C</strong>
                    </div>
                    <div className="condition-sun">
                      <span><Sun size={12} aria-hidden="true" /> Sun elevation</span>
                      <strong>{fmt(environment?.solar.elevation_deg, 1)}°</strong>
                    </div>
                    <div className="condition-sun">
                      <span><Sun size={12} aria-hidden="true" /> Irradiance</span>
                      <strong>{fmt(environment?.solar.horizontal_irradiance_w_m2, 0)} <small>W/m²</small></strong>
                    </div>
                    <div className="condition-earth">
                      <span><Eye size={12} aria-hidden="true" /> Earth elevation</span>
                      <strong>{fmt(environment?.positions.earth.elevation_deg, 1)}°</strong>
                    </div>
                  </div>
                  <details className="atlas-more">
                    <summary>Azimuth, distance, and light time</summary>
                    <dl>
                      <div className="condition-sun"><dt><Compass size={14} /> Sun azimuth</dt><dd>{fmt(environment?.solar.azimuth_deg, 1)}°</dd></div>
                      <div className="condition-earth"><dt><Compass size={14} /> Earth azimuth</dt><dd>{fmt(environment?.positions.earth.azimuth_deg, 1)}°</dd></div>
                      <div className="condition-earth"><dt><Radio size={14} /> Earth distance</dt><dd>{fmt(environment?.positions.earth.distance_km, 0)} <small>km</small></dd></div>
                      <div className="condition-earth"><dt><Clock size={14} /> One-way light time</dt><dd>{environment ? (environment.positions.earth.distance_km / 299792.458).toFixed(3) : '—'} <small>s</small></dd></div>
                    </dl>
                  </details>
                </section>
                <SouthPoleMap
                  sites={PRESET_SITES.filter(candidate => candidate.lat < -80)}
                  selectedName={site}
                  selected={coordinate}
                  onSelect={chosen => { selectLocation(chosen, chosen.name); setGlobeZoom('surface'); }}
                />
                <details className="atlas-site-search">
                  <summary>Find a site or change globe view</summary>
                  <label className="atlas-perspective">Globe view
                    <select value={lunarView} onChange={event => {
                      setLunarView(event.target.value as LunarView); setCameraCoordinate(null);
                      setGlobeZoom('overview'); setNavigation(n => n + 1);
                    }}>
                      <option value="south">South pole</option><option value="near">Near side</option>
                      <option value="far">Far side</option><option value="north">North pole</option>
                      <option value="east">East limb</option><option value="west">West limb</option>
                    </select>
                  </label>
                  <div className="sl-search-bar">
                    <Search size={16} style={{ color: 'var(--sl-text-muted)' }} />
                    <input
                      placeholder="Search Shackleton, Malapert, Apollo..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Search landing sites"
                    />
                    {query && (
                      <button type="button" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => setQuery('')} aria-label="Clear search">
                        <X size={15} />
                      </button>
                    )}
                    {query && searchResults.length > 0 && (
                      <div className="sl-search-results">
                        {searchResults.map((res) => (
                          <button key={res.name} type="button" className="sl-search-item" onClick={() => selectLocation(res, res.name)}>
                            <strong>{res.name}</strong>
                            <small>{coordText(res)}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {query && searchResults.length === 0 && <p role="status">No matching sites. Try a crater name or enter coordinates above.</p>}
                </details>
                <p className="atlas-model-note">Instantaneous radiative equilibrium. <a href="#models" onClick={event => { event.preventDefault(); setActiveMode('models'); }}>Model assumptions</a></p>
                <button type="button" className="sl-btn-secondary" onClick={() => setActiveMode('horizon')}><Compass size={14} /> Open local sky <ArrowRight size={13} /></button>
                {error && <p role="alert">{error}</p>}
              </div>
            </aside>
          </>
        )}
      </div>

      </Suspense>
      <ChatWidget operationsContext={activeMode === 'operations' ? operationsRequest : undefined} page={activeMode} siteName={site} context={{ latitude: coordinate?.lat ?? DEFAULT_SITE.lat, longitude: coordinate?.lon ?? DEFAULT_SITE.lon, start_datetime_utc: start, end_datetime_utc: end, step_hours: step, display_timezone: zone }} onApply={action => {
        if (action.forecast) {
          const f = action.forecast;
          setCoordinate({ lat: f.latitude, lon: f.longitude });
          setLat(String(f.latitude)); setLon(String(f.longitude));
          if (coordinate?.lat !== f.latitude || coordinate?.lon !== f.longitude) setSite('Assistant selected coordinates');
          setStart(f.start_datetime_utc); setEnd(f.end_datetime_utc); setStep(f.step_hours); setZone(f.display_timezone);
          setForecast(null);
        }
        if (action.operations) changeOperations(action.operations);
        if (action.criteria) setChatCriteria(action.criteria);
        if (action.compare_focus) {
          setComparisonFocus(previous => ({ metric: action.compare_focus!, nonce: (previous?.nonce ?? 0) + 1 }));
        }
        if (action.compare_sites) {
          const request = action.compare_sites;
          setCompareRequest(previous => ({ sites: request.sites, mode: request.mode ?? 'replace', nonce: (previous?.nonce ?? 0) + 1 }));
        }
        if (action.tool) setMissionTool(previous => ({ id: action.tool as ToolId, nonce: (previous?.nonce ?? 0) + 1 }));
        const tool = action.tool ?? pageInfo(action.page).tool;
        if (tool && action.inputs) setToolScenarios(previous => ({ ...previous, [tool]: { inputs: action.inputs!, nonce: (previous[tool]?.nonce ?? 0) + 1 } }));
        setActiveMode(action.page === 'calculator' && action.tool ? action.tool : action.page);
      }} />
    </main>
  );
}

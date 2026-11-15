import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, CalendarRange, Check, Clock, Crosshair, Download, Info, Loader2, MapPin, Plus, Search, Sparkles, X
} from 'lucide-react';
import { COMPARISON_COLORS, ComparisonCharts, summarise, useComparisonForecast } from './ComparisonForecast';
import { formatZonedDateTime, localInput, utcInput } from '../lib/time';
import type { ForecastSample, LunarCoordinate } from '../lib/lunar';
import '../sites.css';

/**
 * Published statistics for named south-pole points.
 *
 * Every number is copied from the cited source for the exact point that
 * source analysed (coordinates included), never estimated here. A field is
 * null when no source publishes it for that point. Values from different
 * sources use different methods, heights and periods, so each site carries
 * its own `basis` and `sources`.
 */
export type SiteSource = { label: string; url: string };

export type CandidateSite = {
  id: string;
  name: string;
  designation: string;
  lat: number;
  lon: number;
  /** % of time any part of the Sun is above the local (terrain) horizon. */
  sunlitPct: number | null;
  /** Time-averaged visible fraction of the solar disk, %. */
  avgIlluminationPct: number | null;
  /** Longest continuous shadow, hours. */
  maxShadowHours: number | null;
  /** % of time Earth is above the local horizon. */
  earthVisiblePct: number | null;
  /** Distance to the nearest permanently shadowed region, km. */
  psrDistanceKm: number | null;
  /** Observer height, period and model behind the numbers. */
  basis: string;
  notes: string[];
  sources: SiteSource[];
};

const GLASER_2018: SiteSource = {
  label: 'Gläser et al. 2018, Planetary & Space Science 162:170–178 (Tables 2–3)',
  url: 'https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf'
};
/** Earth visibility computed here: real horizon vs. real Earth positions. */
const SELENE_EARTH: SiteSource = {
  label: 'Earth in view: computed by Selene from NASA LOLA LDEM_80S_80M terrain horizon (2 m height, 150 km) and JPL DE440 Earth positions, 6-hourly 2017–2037. Cross-check: gives 100 % at Malapert, matching Petro & Moriarty 2021.',
  url: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/'
};
const GLASER_BASIS = '2 m above the surface · 20 m/px LOLA terrain · hourly, 1 Jan 2017 – 1 Jan 2037';

export const ARTEMIS_CANDIDATE_SITES: CandidateSite[] = [
  {
    id: 'shackleton',
    name: 'Shackleton rim (S0)',
    designation: 'Most-illuminated Shackleton rim point',
    lat: -89.6866,
    lon: -162.81,
    sunlitPct: 89.4,
    avgIlluminationPct: 85.5,
    maxShadowHours: 66,
    earthVisiblePct: 49.6,
    psrDistanceKm: 0.37,
    basis: GLASER_BASIS,
    notes: [
      'Earth above the real terrain horizon 49.6 % of the time; longest Earth outage 14.8 days (computed by Selene, see sources).',
      'Highest average illumination on the Shackleton rim at 2 m height.',
      'Nearest permanently shadowed region 370 m away; slope inside it averages 8.6° (max 17.0°).'
    ],
    sources: [SELENE_EARTH, GLASER_2018]
  },
  {
    id: 'shackleton-s1',
    name: 'Shackleton rim (max sunlit time)',
    designation: 'Shackleton rim point with the longest time in sunlight',
    lat: -89.7815,
    lon: -155.3,
    sunlitPct: 89.8,
    avgIlluminationPct: 82.1,
    maxShadowHours: 65,
    earthVisiblePct: 52.5,
    psrDistanceKm: null,
    basis: GLASER_BASIS,
    notes: [
      'Earth above the real terrain horizon 52.5 % of the time; longest Earth outage 14.0 days (computed by Selene, see sources).','The Sun is at least partly visible 89.8 % of the time, the most of any Shackleton rim point in the study.'],
    sources: [SELENE_EARTH, GLASER_2018]
  },
  {
    id: 'connecting-ridge',
    name: 'Connecting Ridge (C1)',
    designation: 'Most-illuminated point in the study',
    lat: -89.4398,
    lon: -137.17,
    sunlitPct: 92.1,
    avgIlluminationPct: 88.0,
    maxShadowHours: 112,
    earthVisiblePct: 54.0,
    psrDistanceKm: 0.1,
    basis: GLASER_BASIS,
    notes: [
      'Earth above the real terrain horizon 54.0 % of the time; longest Earth outage 13.5 days (computed by Selene, see sources).',
      'Best-lit point found near the south pole at 2 m height.',
      'Nearest permanently shadowed region 100 m away; slope inside it averages 8.4° (max 12.8°).',
      'An earlier 20-year study at a point 1 m away (−89.4395°, −137.1934°) found 92 % time in light and a longest darkness of 4.58 days (Gläser et al., EPSC 2014).'
    ],
    sources: [SELENE_EARTH, GLASER_2018, { label: 'Gläser et al. 2014, EPSC Abstracts 9, EPSC2014-136-1', url: 'https://elib.dlr.de/94242/1/EPSC2014-136-1.pdf' }]
  },
  {
    id: 'connecting-ridge-c2',
    name: 'Connecting Ridge (C2)',
    designation: 'Second ridge point',
    lat: -89.313,
    lon: -114.02,
    sunlitPct: 82.0,
    avgIlluminationPct: 78.1,
    maxShadowHours: 165,
    earthVisiblePct: 54.4,
    psrDistanceKm: 0.08,
    basis: GLASER_BASIS,
    notes: [
      'Earth above the real terrain horizon 54.4 % of the time; longest Earth outage 13.8 days (computed by Selene, see sources).','Nearest permanently shadowed region 80 m away; slope inside it averages 12.1° (max 17.1°).'],
    sources: [SELENE_EARTH, GLASER_2018]
  },
  {
    id: 'malapert',
    name: 'Malapert summit area',
    designation: 'Continuous Earth view',
    lat: -85.95,
    lon: 0,
    sunlitPct: null,
    avgIlluminationPct: null,
    maxShadowHours: null,
    earthVisiblePct: 100,
    psrDistanceKm: null,
    basis: 'Earth visibility from LRO QuickMap / SLDEM terrain for the summit area (about 85.95°S, ±5° longitude)',
    notes: [
      'Earth stays above the horizon all the time on the summit, so direct-to-Earth radio is always possible.',
      'No peer-reviewed illumination figures for this exact point were found.'
    ],
    sources: [{ label: 'Petro & Moriarty 2021, Lunar Surface Science Workshop #8015', url: 'https://www.hou.usra.edu/meetings/lunarsurface12/pdf/8015.pdf' }]
  },
  {
    id: 'nobile',
    name: 'Nobile Rim (VIPER area)',
    designation: 'VIPER rover mission area centre',
    lat: -85.42088,
    lon: 31.6218,
    sunlitPct: null,
    avgIlluminationPct: null,
    maxShadowHours: null,
    earthVisiblePct: 67.3,
    psrDistanceKm: null,
    basis: 'Mission-area centre only; no per-point statistics published',
    notes: [
      'Earth above the real terrain horizon 67.3 % of the time; longest Earth outage 10.2 days (computed by Selene, see sources).',
      'Earth is below the horizon for roughly half of each month here (Lim et al., LPSC 2024).',
      'The VIPER rover was designed for slopes up to 15°.'
    ],
    sources: [SELENE_EARTH, { label: 'Beyer et al. 2025, Planetary Science Journal (mission area)', url: 'https://doi.org/10.3847/PSJ/ae061a' }]
  },
  {
    id: 'de-gerlache',
    name: 'de Gerlache Rim (GR1)',
    designation: 'ESA Lunar Lander study region',
    lat: -88.6952,
    lon: -68.2846,
    sunlitPct: null,
    avgIlluminationPct: null,
    maxShadowHours: null,
    earthVisiblePct: 52.8,
    psrDistanceKm: null,
    basis: 'Region-of-interest centre only; results published as maps, not numbers',
    notes: [
      'Earth above the real terrain horizon 52.8 % of the time; longest Earth outage 14.0 days (computed by Selene, see sources).','One of the regions characterised for ESA’s Lunar Lander; statistics were published only as figures.'],
    sources: [SELENE_EARTH, { label: 'De Rosa et al. 2012, Planetary & Space Science 74:224–246 (Table 2)', url: 'https://arxiv.org/abs/1208.5587' }]
  },
  {
    id: 'apollo11',
    name: 'Apollo 11 (Mare Tranquillitatis)',
    designation: 'Equatorial comparison site',
    lat: 0.6741,
    lon: 23.4729,
    sunlitPct: 50,
    avgIlluminationPct: null,
    maxShadowHours: 354,
    earthVisiblePct: 100,
    psrDistanceKm: null,
    basis: 'Orbital geometry for a near-equatorial nearside site (smooth horizon)',
    notes: [
      'Day and night each last half a synodic month (29.53 d), so about 354 h of continuous darkness.',
      'Earth stays high in the sky (about 65° up) at all times; there are no permanently shadowed regions nearby.'
    ],
    sources: [{ label: 'Synodic month 29.530589 d; Earth visibility from libration geometry', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html' }]
  }
];

/** A site in the comparison: a catalogue entry or a user-entered coordinate. */
type ComparedSite = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Published statistics; absent for user-entered coordinates. */
  catalog?: CandidateSite;
};

const MAX_SITES = 5;

const formatCoord = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;

const customId = (lat: number, lon: number) => `custom:${lat.toFixed(4)}:${lon.toFixed(4)}`;

const fromCatalog = (site: CandidateSite): ComparedSite => ({
  id: site.id, name: site.name, lat: site.lat, lon: site.lon, catalog: site
});

const shortName = (name: string) => name.split(' (')[0];

/** Longest unbroken run of samples matching `test`, in hours (cut off at the window edges). */
function longestRunHours(samples: ForecastSample[], test: (s: ForecastSample) => boolean, stepHours: number) {
  let best = 0;
  let runStart: number | null = null;
  samples.forEach((s, i) => {
    if (test(s)) {
      if (runStart === null) runStart = i;
      const hours = (Date.parse(s.datetime_utc) - Date.parse(samples[runStart].datetime_utc)) / 3_600_000 + stepHours;
      best = Math.max(best, hours);
    } else {
      runStart = null;
    }
  });
  return best;
}

/** One column of a comparison table. `value` returns null when the figure doesn't exist. */
type Column = {
  key: string;
  label: string;
  hint?: string;
  value: (site: ComparedSite, index: number) => number | null;
  format: (v: number) => string;
  better?: 'high' | 'low';
};

type View = 'computed' | 'catalogue' | 'charts' | 'notes';

const VIEWS: { id: View; label: string }[] = [
  { id: 'computed', label: 'Computed for this window' },
  { id: 'catalogue', label: 'Scenario assumptions' },
  { id: 'charts', label: 'Charts over time' },
  { id: 'notes', label: 'Notes and sources' }
];

/** Sites to load into the comparison (from the assistant); `nonce` makes each request apply once. */
export type CompareRequest = { sites: { name: string; latitude: number; longitude: number }[]; mode: 'replace' | 'add'; nonce: number };

export type ComparisonFocusRequest = { metric: 'earth_visibility'; nonce: number };

export type SiteComparisonViewProps = {
  request?: CompareRequest;
  focusRequest?: ComparisonFocusRequest;
  onSelectSite: (site: { name: string; lat: number; lon: number }) => void;
  activeSiteName: string;
  /** The coordinate currently entered in the top bar (after Go). */
  currentCoordinate: LunarCoordinate | null;
  currentSiteName: string;
  timeZone: string;
  start: string;
  end: string;
  step: number;
};

export function SiteComparisonView({
  onSelectSite, activeSiteName, currentCoordinate, currentSiteName, timeZone, start, end, step, request, focusRequest
}: SiteComparisonViewProps) {
  const [sites, setSites] = useState<ComparedSite[]>(() =>
    ['shackleton', 'malapert', 'connecting-ridge', 'nobile'].map((id) => fromCatalog(ARTEMIS_CANDIDATE_SITES.find((s) => s.id === id)!))
  );
  const [notice, setNotice] = useState('');

  // Load sites requested by the assistant: catalogue entries within 3 km keep their published data.
  const appliedNonce = useRef(0);
  useEffect(() => {
    if (!request || request.nonce === appliedNonce.current) return;
    appliedNonce.current = request.nonce;
    const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
      const p1 = (a.lat * Math.PI) / 180, p2 = (b.lat * Math.PI) / 180, dl = ((b.lon - a.lon) * Math.PI) / 180;
      return 1737.4 * Math.acos(Math.min(1, Math.max(-1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl))));
    };
    const incoming: ComparedSite[] = request.sites.map((s) => {
      const point = { lat: s.latitude, lon: s.longitude };
      const match = ARTEMIS_CANDIDATE_SITES.find((c) => km(c, point) < 3);
      return match ? fromCatalog(match) : { id: customId(point.lat, point.lon), name: s.name.slice(0, 60), lat: point.lat, lon: point.lon };
    });
    setSites((previous) => {
      const merged = request.mode === 'add' ? [...previous, ...incoming] : incoming;
      const unique = merged.filter((site, i) => merged.findIndex((o) => o.id === site.id) === i);
      if (unique.length > MAX_SITES) setNotice(`Only ${MAX_SITES} sites can be compared; the first ${MAX_SITES} were kept.`);
      else setNotice(`Loaded ${incoming.length} site${incoming.length === 1 ? '' : 's'} from the assistant.`);
      return unique.slice(0, MAX_SITES);
    });
  }, [request]);
  const [view, setView] = useState<View>('computed');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  useEffect(() => {
    if (focusRequest?.metric !== 'earth_visibility') return;
    setView('computed');
    setSort({ key: 'earth', dir: -1 });
    setNotice('Current sites ordered by computed Earth visibility, highest first. The comparison period is unchanged.');
  }, [focusRequest]);
  const [customName, setCustomName] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');
  const [windowStart, setWindowStart] = useState(start);
  const [windowEnd, setWindowEnd] = useState(end);
  const [windowStep, setWindowStep] = useState(step);
  const [siteFilter, setSiteFilter] = useState('');

  const filteredCatalog = useMemo(() => {
    const q = siteFilter.trim().toLowerCase();
    if (!q) return ARTEMIS_CANDIDATE_SITES;
    return ARTEMIS_CANDIDATE_SITES.filter((c) =>
      c.name.toLowerCase().includes(q) || c.designation.toLowerCase().includes(q)
    );
  }, [siteFilter]);

  const setPresetDuration = (days: number) => {
    try {
      const s = Date.parse(windowStart);
      if (!isNaN(s)) {
        setWindowEnd(new Date(s + days * 86400000).toISOString());
        setNotice('');
      }
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const isFull = sites.length >= MAX_SITES;
  const has = (id: string) => sites.some((s) => s.id === id);

  const addSite = (site: ComparedSite) => {
    if (has(site.id)) { setNotice(`${site.name} is already in the comparison.`); return false; }
    if (isFull) { setNotice(`Up to ${MAX_SITES} sites can be compared. Remove one first.`); return false; }
    setSites((current) => [...current, site]);
    setNotice('');
    return true;
  };
  const removeSite = (id: string) => {
    setSites((current) => current.filter((s) => s.id !== id));
    setNotice('');
  };
  const toggleCatalog = (site: CandidateSite) => (has(site.id) ? removeSite(site.id) : addSite(fromCatalog(site)));

  // The coordinate typed in the top bar, matched to a catalogue entry when it
  // is one, so a preset is never added twice under two different names.
  const currentAsSite = useMemo<ComparedSite | null>(() => {
    if (!currentCoordinate) return null;
    const { lat, lon } = currentCoordinate;
    const preset = ARTEMIS_CANDIDATE_SITES.find((c) => Math.abs(c.lat - lat) < 1e-3 && Math.abs(c.lon - lon) < 1e-3);
    if (preset) return fromCatalog(preset);
    const isGenericName = /^(Target|Location)\b/.test(currentSiteName);
    return { id: customId(lat, lon), name: isGenericName ? 'Top-bar coordinate' : currentSiteName, lat, lon };
  }, [currentCoordinate, currentSiteName]);

  const addCustom = (event: React.FormEvent) => {
    event.preventDefault();
    const lat = Number(customLat);
    const lon = Number(customLon);
    if (customLat.trim() === '' || !Number.isFinite(lat) || Math.abs(lat) > 90) { setNotice('Latitude must be a number from −90 to 90.'); return; }
    if (customLon.trim() === '' || !Number.isFinite(lon) || Math.abs(lon) > 180) { setNotice('Longitude must be a number from −180 to 180.'); return; }
    const customCount = sites.filter((s) => !s.catalog).length;
    const added = addSite({ id: customId(lat, lon), name: customName.trim() || `My point ${customCount + 1}`, lat, lon });
    if (added) { setCustomName(''); setCustomLat(''); setCustomLon(''); }
  };

  const forecastSites = useMemo(() => sites.map(({ name, lat, lon }) => ({ name, lat, lon })), [sites]);
  const forecast = useComparisonForecast(forecastSites, timeZone);
  const ready = forecast.series.length === sites.length && sites.length > 0 && !forecast.busy;

  // Recalculate automatically whenever the sites or the window change;
  // debounced so typing a date doesn't send a request per keystroke.
  const forecastKey = forecastSites.map((x) => `${x.lat},${x.lon}`).join('|');
  const { run } = forecast;
  useEffect(() => {
    if (!forecastSites.length) return;
    const timer = window.setTimeout(() => void run(windowStart, windowEnd, windowStep), 400);
    return () => window.clearTimeout(timer);
  }, [forecastKey, windowStart, windowEnd, windowStep, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const computed = useMemo(() => forecast.series.map((series) => {
    const samples = series.samples;
    const summary = summarise(samples);
    return {
      ...summary,
      swing: summary.maxTempC - summary.minTempC,
      longestDarkH: longestRunHours(samples, (s) => !s.illuminated, windowStep),
      longestOutageH: longestRunHours(samples, (s) => !s.earth_visible, windowStep)
    };
  }), [forecast.series, windowStep]);

  const changeDate = (value: string, setter: (v: string) => void) => {
    try { setter(utcInput(value, timeZone)); setNotice(''); } catch (e) { setNotice((e as Error).message); }
  };

  const calc = (i: number) => (ready ? computed[i] ?? null : null);
  const computedColumns: Column[] = [
    { key: 'sunlit', label: 'Time in sunlight', value: (_, i) => calc(i)?.sunlitPct ?? null, format: (v) => `${v.toFixed(0)}%`, better: 'high' },
    { key: 'dark', label: 'Longest darkness', hint: 'Within this window', value: (_, i) => calc(i)?.longestDarkH ?? null, format: (v) => `${v.toFixed(0)} h`, better: 'low' },
    { key: 'earth', label: 'Earth in view', value: (_, i) => calc(i)?.earthVisiblePct ?? null, format: (v) => `${v.toFixed(0)}%`, better: 'high' },
    { key: 'outage', label: 'Longest Earth outage', hint: 'Within this window', value: (_, i) => calc(i)?.longestOutageH ?? null, format: (v) => `${v.toFixed(0)} h`, better: 'low' },
    { key: 'irr', label: 'Average sunlight', hint: 'On flat ground', value: (_, i) => calc(i)?.meanIrradiance ?? null, format: (v) => `${v.toFixed(0)} W/m²`, better: 'high' },
    { key: 'min', label: 'Coldest', value: (_, i) => calc(i)?.minTempC ?? null, format: (v) => `${v.toFixed(0)} °C` },
    { key: 'max', label: 'Hottest', value: (_, i) => calc(i)?.maxTempC ?? null, format: (v) => `${v.toFixed(0)} °C` }
  ];
  const catalogueColumns: Column[] = [
    { key: 'sunlit', label: 'Time in sunlight', hint: 'Sun at least partly visible', value: (s) => s.catalog?.sunlitPct ?? null, format: (v) => `${v}%`, better: 'high' },
    { key: 'illum', label: 'Average illumination', hint: 'Visible fraction of the solar disk', value: (s) => s.catalog?.avgIlluminationPct ?? null, format: (v) => `${v}%`, better: 'high' },
    { key: 'shadow', label: 'Longest darkness', value: (s) => s.catalog?.maxShadowHours ?? null, format: (v) => `${v} h`, better: 'low' },
    { key: 'dte', label: 'Earth in view', value: (s) => s.catalog?.earthVisiblePct ?? null, format: (v) => `${v}%`, better: 'high' },
    { key: 'psr', label: 'Nearest permanent shadow', hint: 'Possible cold trap', value: (s) => s.catalog?.psrDistanceKm ?? null, format: (v) => (v < 1 ? `${Math.round(v * 1000)} m` : `${v} km`), better: 'low' }
  ];

  /** Indices of the winning site(s) for a column: empty when fewer than two sites have a value or all are equal. */
  const bestIndices = (col: Column): number[] => {
    if (!col.better) return [];
    const valid = sites.map((s, i) => [col.value(s, i), i] as const).filter(([v]) => v !== null) as [number, number][];
    if (valid.length < 2) return [];
    const values = valid.map(([v]) => v);
    const target = col.better === 'high' ? Math.max(...values) : Math.min(...values);
    const winners = valid.filter(([v]) => v === target).map(([, i]) => i);
    return winners.length === valid.length ? [] : winners;
  };

  const highlights: { title: string; col: Column; source: string }[] = [
    { title: 'Most sunlight', col: computedColumns[0], source: 'Computed' },
    { title: 'Shortest darkness', col: computedColumns[1], source: 'Computed' },
    { title: 'Most Earth contact', col: computedColumns[2], source: 'Computed' },
    { title: 'Closest permanent shadow', col: catalogueColumns[4], source: 'Published' }
  ];

  const order = (() => {
    const indices = sites.map((_, i) => i);
    if (!sort) return indices;
    const col = [...computedColumns, ...catalogueColumns].find((c) => c.key === sort.key);
    if (!col) return indices;
    return indices.sort((a, b) => {
      const va = col.value(sites[a], a);
      const vb = col.value(sites[b], b);
      if (va === null) return vb === null ? 0 : 1;
      if (vb === null) return -1;
      return (va - vb) * sort.dir;
    });
  })(); // the site list is at most five rows, so sorting every render is cheap

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: -1 } : s.dir === -1 ? { key, dir: 1 } : null));

  const anyCustom = sites.some((s) => !s.catalog);
  const status = forecast.busy ? 'Calculating…' : forecast.error ? 'Calculation failed' : ready ? 'Up to date' : sites.length ? 'Waiting to calculate…' : 'No sites';

  const renderTable = (columns: Column[], caption: string) => (
    <div className="sx-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="sx-table">
        <caption className="sx-sr">{caption}. Click a column heading to sort.</caption>
        <thead>
          <tr>
            <th scope="col">Site</th>
            {columns.map((col) => {
              const sorted = sort?.key === col.key ? sort.dir : 0;
              return (
                <th key={col.key} scope="col" aria-sort={sorted === 0 ? 'none' : sorted === 1 ? 'ascending' : 'descending'}>
                  <button type="button" onClick={() => toggleSort(col.key)}>
                    <span>{col.label}{col.hint && <small>{col.hint}</small>}</span>
                    {sorted === 0 ? <ArrowUpDown size={16} /> : sorted === 1 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                  </button>
                </th>
              );
            })}
            <th scope="col"><span className="sx-sr">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {order.map((index) => {
            const site = sites[index];
            return (
              <tr key={site.id} className={activeSiteName === site.name ? 'is-selected' : ''}>
                <th scope="row" style={{ '--c': COMPARISON_COLORS[index] } as React.CSSProperties}>
                  <div className="sx-site-cell">
                    <i aria-hidden="true" />
                    <span>
                      <strong>{shortName(site.name)}</strong>
                      <small>{formatCoord(site.lat, site.lon)}{!site.catalog && ' · your point'}</small>
                    </span>
                  </div>
                </th>
                {columns.map((col) => {
                  const value = col.value(site, index);
                  const best = bestIndices(col).includes(index);
                  return (
                    <td key={col.key} className={best ? 'is-best' : ''}>
                      {value === null
                        ? <span className="sx-na" title={forecast.busy ? 'Calculating' : 'Not available for this site'}>—</span>
                        : <>{col.format(value)}{best && <span className="sx-best">Best</span>}</>}
                    </td>
                  );
                })}
                <td className="sx-open">
                  <button type="button" onClick={() => onSelectSite({ name: site.name, lat: site.lat, lon: site.lon })} title={`Open ${site.name} in the DTE Sky Plot`}>
                    Sky plot <ArrowRight size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="sx-page">
      {/* ===================== Left: choose sites and window ===================== */}
      <aside className="sx-rail" aria-label="Comparison setup">
        <div className="sx-rail-head">
          <h2>Compare sites</h2>
          <p>Choose up to {MAX_SITES} candidate sites or coordinates for side-by-side ranking.</p>
        </div>

        <section className="sx-block">
          <h3>
            <MapPin size={16} /> Candidate sites
            <span className="sx-count">{sites.length} / {MAX_SITES} active</span>
          </h3>
          <div className="sx-filter-wrap">
            <Search size={13} aria-hidden="true" />
            <input
              type="text"
              placeholder="Filter candidate sites..."
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              aria-label="Filter candidate landing sites"
            />
          </div>
          <ul className="sx-checklist">
            {filteredCatalog.map((c) => {
              const index = sites.findIndex((s) => s.id === c.id);
              const on = index >= 0;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={!on && isFull}
                    className={on ? 'is-on' : ''}
                    style={on ? ({ '--c': COMPARISON_COLORS[index] } as React.CSSProperties) : undefined}
                    onClick={() => toggleCatalog(c)}
                  >
                    <span className="sx-box" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
                    <span className="sx-check-text">
                      <strong>{shortName(c.name)}</strong>
                      <small>{c.designation} · {formatCoord(c.lat, c.lon)}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="sx-block">
          <h3><Crosshair size={16} /> Custom target points</h3>
          {sites.filter((s) => !s.catalog).map((s) => {
            const index = sites.indexOf(s);
            return (
              <div key={s.id} className="sx-custom" style={{ '--c': COMPARISON_COLORS[index] } as React.CSSProperties}>
                <i aria-hidden="true" />
                <span><strong>{s.name}</strong><small>{formatCoord(s.lat, s.lon)}</small></span>
                <button type="button" onClick={() => removeSite(s.id)} aria-label={`Remove ${s.name}`} title="Remove"><X size={14} /></button>
              </div>
            );
          })}
          {currentAsSite && !has(currentAsSite.id) && (
            <button
              type="button"
              className="sx-btn sx-btn-wide"
              disabled={isFull}
              onClick={() => addSite(currentAsSite)}
            >
              <Crosshair size={14} /> Add top-bar point ({formatCoord(currentAsSite.lat, currentAsSite.lon)})
            </button>
          )}
          <form className="sx-custom-form" onSubmit={addCustom}>
            <label>
              <span>Point name (optional)</span>
              <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Ridge Ridge A" maxLength={40} />
            </label>
            <div className="sx-field-row-2">
              <label>
                <span>Latitude °</span>
                <input type="number" inputMode="decimal" step="any" min={-90} max={90} value={customLat} onChange={(e) => setCustomLat(e.target.value)} placeholder="−89.50" />
              </label>
              <label>
                <span>Longitude °</span>
                <input type="number" inputMode="decimal" step="any" min={-180} max={180} value={customLon} onChange={(e) => setCustomLon(e.target.value)} placeholder="45.00" />
              </label>
            </div>
            <button type="submit" className="sx-btn sx-btn-primary" disabled={isFull}>
              <Plus size={14} /> Add this point
            </button>
          </form>
          {notice && <p className="sx-notice" role="status">{notice}</p>}
        </section>

        <section className="sx-block">
          <h3><CalendarRange size={16} /> Forecast window</h3>
          <div className="sx-preset-durations">
            <button type="button" onClick={() => setPresetDuration(7)}>7 Days</button>
            <button type="button" onClick={() => setPresetDuration(14)}>14 Days</button>
            <button type="button" onClick={() => setPresetDuration(29.53)}>29.5d (Lunar Day)</button>
          </div>
          <div className="sx-field-row-2">
            <label>
              <span>From ({timeZone})</span>
              <input type="datetime-local" value={localInput(windowStart, timeZone)} onChange={(e) => changeDate(e.target.value, setWindowStart)} />
            </label>
            <label>
              <span>To ({timeZone})</span>
              <input type="datetime-local" value={localInput(windowEnd, timeZone)} onChange={(e) => changeDate(e.target.value, setWindowEnd)} />
            </label>
          </div>
          <label>
            <span>Sampling interval</span>
            <div className="sx-step-pills">
              {[1, 3, 6, 12, 24].map((h) => (
                <button
                  key={h}
                  type="button"
                  className={windowStep === h ? 'is-on' : ''}
                  onClick={() => setWindowStep(h)}
                >
                  {h}h
                </button>
              ))}
            </div>
          </label>
        </section>
      </aside>

      {/* ===================== Right: results ===================== */}
      <main className="sx-main">
        <header className="sx-head">
          <div>
            <span className="sx-eyebrow">
              {formatZonedDateTime(windowStart, timeZone)} → {formatZonedDateTime(windowEnd, timeZone)}
            </span>
            <h2>Comparing {sites.length} site{sites.length === 1 ? '' : 's'}</h2>
          </div>
          <span className={`sx-status${forecast.busy ? ' is-busy' : forecast.error ? ' is-error' : ''}`} role="status">
            {forecast.busy && <Loader2 size={18} className="sx-spin" />} {status}
          </span>
          <button type="button" className="sx-btn" disabled={!ready} onClick={forecast.downloadCsv}>
            <Download size={18} /> Download CSV
          </button>
        </header>

        {forecast.error && <p className="sx-error" role="alert">{forecast.error}</p>}

        {sites.length === 0 ? (
          <div className="sx-empty">
            <h3>Nothing to compare yet</h3>
            <p>Tick a landing site on the left, or add your own coordinates.</p>
          </div>
        ) : (
          <>
            <ul className="sx-legend" aria-label="Sites in this comparison">
              {sites.map((s, i) => (
                <li key={s.id} style={{ '--c': COMPARISON_COLORS[i] } as React.CSSProperties}>
                  <span>{shortName(s.name)}</span>
                  <button type="button" onClick={() => removeSite(s.id)} aria-label={`Remove ${s.name}`} title="Remove"><X size={16} /></button>
                </li>
              ))}
            </ul>

            <section className="sx-highlights" aria-label="Best site for each key measure">
              {highlights.map(({ title, col, source }) => {
                const winners = bestIndices(col);
                const i = winners.length ? winners[0] : null;
                const value = i === null ? null : col.value(sites[i], i);
                return (
                  <div key={title} style={i === null ? undefined : ({ '--c': COMPARISON_COLORS[i] } as React.CSSProperties)}>
                    <span>{title}</span>
                    {i === null || value === null ? (
                      <strong className="sx-na">{forecast.busy && source === 'Computed' ? 'Calculating…' : 'Not enough data'}</strong>
                    ) : (
                      <>
                        <strong><i aria-hidden="true" />{shortName(sites[i].name)}</strong>
                        {winners.length > 1 && <b>tied with {winners.slice(1).map((w) => shortName(sites[w].name)).join(', ')}</b>}
                        <em>{col.format(value)}</em>
                      </>
                    )}
                    <small>{source}</small>
                  </div>
                );
              })}
            </section>

            <div className="sx-tabs" role="tablist" aria-label="Comparison views">
              {VIEWS.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'is-on' : ''} onClick={() => setView(v.id)}>
                  {v.label}
                </button>
              ))}
            </div>

            {view === 'computed' && (
              <section className="sx-panel">
                {renderTable(computedColumns, 'Values computed for the chosen forecast window')}
                <p className="sx-note">
                  <Info size={18} aria-hidden="true" />
                  Computed by the app's model for the window above, for any coordinate. The model uses a smooth Moon, so
                  shadows from nearby mountains and crater rims are not included. "Longest" runs are cut off at the window edges.
                </p>
              </section>
            )}

            {view === 'catalogue' && (
              <section className="sx-panel">
                {renderTable(catalogueColumns, 'Published statistics for the exact points studied')}
                <p className="sx-note">
                  <Info size={18} aria-hidden="true" />
                  Peer-reviewed values for the exact points studied, using real terrain; Earth-in-view values are computed by Selene from NASA terrain and JPL ephemerides (see sources). Shackleton and Connecting Ridge
                  come from one study (2 m above the ground, 2017–2037), so they compare directly; other sites use different
                  methods. "—" means no published value exists for that point. Sources are listed under Advantages and risks.
                  {anyCustom && ' Your own points have no published values; use the computed view for those.'}
                </p>
              </section>
            )}

            {view === 'charts' && (
              <section className="sx-panel sx-charts">
                {ready ? <ComparisonCharts series={forecast.series} timeZone={timeZone} /> : <p className="sx-note">{status}</p>}
              </section>
            )}

            {view === 'notes' && (
              <section className="sx-panel sx-notes">
                {sites.map((site, i) => (
                  <article key={site.id} style={{ '--c': COMPARISON_COLORS[i] } as React.CSSProperties}>
                    <h3><i aria-hidden="true" />{shortName(site.name)}</h3>
                    {site.catalog ? (
                      <>
                        <p className="sx-designation">{site.catalog.designation}</p>
                        {site.catalog.notes.map((note) => <p key={note}>{note}</p>)}
                        <p className="sx-basis"><strong>Basis</strong>{site.catalog.basis}</p>
                        <p className="sx-sources"><strong>Sources</strong>
                          {site.catalog.sources.map((src) => (
                            <a key={src.url} href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
                          ))}
                        </p>
                      </>
                    ) : (
                      <p className="sx-muted">Your own point. No published statistics exist for it.</p>
                    )}
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BatteryCharging, BookOpen, Check, Compass, Copy, Crosshair, Droplets, Gauge,
  MapPinned, Mountain, Orbit, Radio, RotateCcw, Search, ShieldCheck, Signal, Sliders, Sun,
  Sunrise, Target, Thermometer
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LunarCoordinate } from '../lib/lunar';
import { formatZonedDateTime, utcInput } from '../lib/time';
import { landingScreen, orbitInsertion } from '../lib/missionMath';
import type { ToolId, ToolInputs } from '../lib/navigation';
export type { ToolId } from '../lib/navigation';
import { ARTEMIS_CANDIDATE_SITES } from './SiteComparisonView';
import '../formulas.css';
import { CANDIDATE_REGIONS } from '../lib/southPole';

import { SolarTool, BatteryTool } from './tools/power';
import { LinkTool, LineOfSightTool } from './tools/comms';
import { TemperatureTool, SkyTool } from './tools/environment';
import { LandingConfidenceTool, OrbitTimelineTool, WaterEvidenceTool, CandidateSiteTool } from './tools/missionDesign';
import { ConstantsTool } from './tools/reference';
import { MOON_RADIUS_KM, EARTH_RADIUS_KM, SOLAR_CONSTANT, SIGMA, LIGHT_SPEED_KM_S, BOLTZMANN_DBW, LUNAR_OBLIQUITY_DEG, LIBRATION_LAT_DEG, LIBRATION_LON_DEG, rad, deg, fmt, signed, FormSection, Field, Segmented, CopyButton, Answer, Stats, Working, Notes, Bars, Inputs } from './tools/shared';
import type { Preset, FieldProps, Tone } from './tools/shared';

/* ==========================================================================
   Formulas: one engineering tool at a time, picked from a left sidebar.

   Every tool shows its inputs, the answer, the equation with your numbers
   substituted in, and the assumptions behind it. Inputs are kept when you
   switch tools (all tools stay mounted, only the active one is shown).
   ========================================================================== */

// -------------------------------------------------------------- tool list

type ToolInfo = {
  id: ToolId;
  group: string;
  name: string;
  question: string;
  icon: LucideIcon;
  keywords: string;
};

const TOOLS: ToolInfo[] = [
  { id: 'landing', group: 'Mission design', name: 'Landing confidence', icon: Target,
    question: 'What fraction of landings remain inside the target and avoid hazards?', keywords: 'probability dispersion ellipse touchdown hazard reliability monte carlo' },
  { id: 'orbit', group: 'Mission design', name: 'Orbit insertion & timeline', icon: Orbit,
    question: 'What LOI burn and mission sequence does this lunar approach imply?', keywords: 'lunar orbit insertion loi delta v timeline descent landing transfer' },
  { id: 'water', group: 'Mission design', name: 'Water-ice evidence', icon: Droplets,
    question: 'How strongly do the available indicators support a water-ice target?', keywords: 'water ice psr cold trap hydrogen radar volatile probability' },
  { id: 'sites', group: 'Mission design', name: 'Candidate site finder', icon: MapPinned,
    question: 'Which official south-pole regions should I investigate first?', keywords: 'artemis candidate finder south pole region nobile haworth malapert' },
  { id: 'solar', group: 'Power', name: 'Solar array power', icon: Sun,
    question: 'How much power will my panels make at this Sun height?', keywords: 'panel pv photovoltaic irradiance efficiency' },
  { id: 'battery', group: 'Power', name: 'Battery for the night', icon: BatteryCharging,
    question: 'How big a battery do I need to survive the darkness?', keywords: 'storage shadow mass kwh dod' },
  { id: 'link', group: 'Communications', name: 'Radio link budget', icon: Radio,
    question: 'Will my radio link to Earth close, and how fast can it go?', keywords: 'dte comms fspl path loss latency delay antenna data rate eb/n0' },
  { id: 'los', group: 'Communications', name: 'Line of sight on the surface', icon: Mountain,
    question: 'How far can a lander and a rover talk before the horizon blocks them?', keywords: 'horizon distance mast rover antenna height' },
  { id: 'temperature', group: 'Environment', name: 'Surface temperature', icon: Thermometer,
    question: 'How hot or cold is the ground for this sunlight?', keywords: 'thermal equilibrium stefan boltzmann albedo emissivity' },
  { id: 'sky', group: 'Environment', name: 'Sun and Earth in the sky', icon: Sunrise,
    question: 'How high can the Sun and Earth get at this latitude?', keywords: 'elevation libration polar visibility latitude' },
  { id: 'constants', group: 'Reference', name: 'Constants', icon: BookOpen,
    question: 'The physical constants these tools use.', keywords: 'radius gravity solar constant sigma speed of light' }
];

const GROUPS = ['Mission design', 'Power', 'Communications', 'Environment', 'Reference'];

const STORAGE_KEY = 'formulas.tool';

function initialTool(): ToolId {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && TOOLS.some((t) => t.id === saved)) return saved as ToolId;
  } catch { /* storage unavailable */ }
  return 'solar';
}

export function MissionCalculator({ coordinate = null, requestedTool, requestKey, onSelectSite, standalone = false, timeZone = 'UTC', scenarios = {} }: {
  coordinate?: LunarCoordinate | null;
  requestedTool?: ToolId;
  requestKey?: number;
  standalone?: boolean;
  timeZone?: string;
  scenarios?: Partial<Record<ToolId, { inputs: ToolInputs; nonce: number }>>;
  onSelectSite?: (site: { name: string; lat: number; lon: number }) => void;
}) {
  const [active, setActive] = useState<ToolId>(initialTool);
  const [query, setQuery] = useState('');
  const [resets, setResets] = useState<Record<string, number>>({});

  const choose = (id: ToolId) => {
    setActive(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
  };
  useEffect(() => { if (requestedTool) choose(requestedTool); }, [requestedTool, requestKey]);

  const q = query.trim().toLowerCase();
  const visible = TOOLS.filter((t) => !q || `${t.name} ${t.question} ${t.group} ${t.keywords}`.toLowerCase().includes(q));
  const activeTool = standalone && requestedTool ? requestedTool : active;
  const tool = TOOLS.find((t) => t.id === activeTool)!;
  const Icon = tool.icon;

  const panels: Record<ToolId, ReactNode> = {
    landing: <LandingConfidenceTool inputs={scenarios.landing?.inputs} />,
    orbit: <OrbitTimelineTool timeZone={timeZone} inputs={scenarios.orbit?.inputs} />,
    water: <WaterEvidenceTool coordinate={coordinate} inputs={scenarios.water?.inputs} />,
    sites: <CandidateSiteTool onSelectSite={onSelectSite} inputs={scenarios.sites?.inputs} />,
    solar: <SolarTool />,
    battery: <BatteryTool />,
    link: <LinkTool />,
    los: <LineOfSightTool />,
    temperature: <TemperatureTool />,
    sky: <SkyTool coordinate={coordinate} />,
    constants: <ConstantsTool />
  };

  return (
    <div className={`fx-page${standalone ? ' fx-standalone' : ''}`}>
      {!standalone && <nav className="fx-nav" aria-label="Formulas">
        <div className="fx-nav-head">
          <h2>Formulas</h2>
          <p>Mission engineering calculation suite. Real-time updates as inputs change.</p>
        </div>
        <div className="fx-search">
          <Search size={15} aria-hidden="true" />
          <input type="text" placeholder="Search formulas..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tools" />
        </div>
        {GROUPS.map((group) => {
          const items = visible.filter((t) => t.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="fx-nav-group">
              <h3>{group}</h3>
              <ul>
                {items.map((t) => {
                  const ItemIcon = t.icon;
                  return (
                    <li key={t.id}>
                      <button type="button" className={t.id === active ? 'is-active' : ''} aria-current={t.id === active ? 'page' : undefined} onClick={() => choose(t.id)}>
                        <ItemIcon size={18} aria-hidden="true" />
                        <span>
                          <strong>{t.name}</strong>
                          <small>{t.question}</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {!visible.length && <p className="fx-nav-empty">No formula matches “{query}”.</p>}
      </nav>}

      <main className="fx-main">
        <header className="fx-head">
          <div className="fx-head-icon"><Icon size={22} aria-hidden="true" /></div>
          <div>
            <span className="fx-eyebrow">{tool.group}</span>
            <h2>{tool.name}</h2>
            <p>{tool.question}</p>
          </div>
          {activeTool !== 'constants' && (
            <button type="button" className="fx-reset" onClick={() => setResets((r) => ({ ...r, [activeTool]: (r[activeTool] ?? 0) + 1 }))}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </header>
        {TOOLS.map((t) => (
          <div key={`${t.id}:${resets[t.id] ?? 0}:${scenarios[t.id]?.nonce ?? 0}`} hidden={t.id !== activeTool}>
            {panels[t.id]}
          </div>
        ))}
      </main>
    </div>
  );
}

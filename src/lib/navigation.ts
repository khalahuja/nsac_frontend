import { Award, BatteryCharging, BookOpen, Bot, CalendarDays, Compass, Droplets, FlaskConical, MapPinned, Moon, Mountain, Orbit, Radio, Rocket, Search, ShieldCheck, Sun, Sunrise, Thermometer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ToolId = 'landing' | 'orbit' | 'water' | 'sites' | 'solar' | 'battery' | 'link' | 'los' | 'temperature' | 'sky' | 'constants';
export type ToolInputs = {
  sigma_m?: number; radius_m?: number; safe_terrain_pct?: number; vehicle_success_pct?: number;
  v_infinity_km_s?: number; periapsis_km?: number; apoapsis_km?: number; coast_days?: number;
  checkout_hours?: number; wait_orbits?: number; descent_orbit_minutes?: number; powered_minutes?: number; departure_local?: string;
  absolute_latitude?: number; max_temperature_k?: number; thermal_confirmed?: boolean; psr_confirmed?: boolean;
  hydrogen?: 'none' | 'possible' | 'strong'; radar?: 'none' | 'possible' | 'strong';
  region_query?: string; priority?: 'safety' | 'resources' | 'power' | 'science';
};
export type PageId = 'operations' | 'selene' | 'horizon' | 'compare' | 'calculator' | 'forecast' | 'windows' | 'mission-lab' | 'mission-plan' | 'swarm' | 'trajectories' | 'surface' | 'clps' | 'models' | ToolId;
export const NAV_GROUPS = ['Explore', 'Analyze', 'Mission', 'Engineering', 'Reference'] as const;
export type NavGroup = typeof NAV_GROUPS[number];
type Page = { id: PageId; slug: string; label: string; group: NavGroup; icon: LucideIcon; hint: string; tool?: ToolId };

export const PAGES: Page[] = [
  { id: 'operations', slug: 'operations', label: 'Mission operations', group: 'Mission', icon: CalendarDays, hint: 'Requirements, best landing dates, operations timeline and nearby alternatives' },
  { id: 'selene', slug: 'moon', label: 'Moon atlas', group: 'Explore', icon: Moon, hint: 'Explore the surface and select a location' },
  { id: 'horizon', slug: 'sky', label: 'Local sky', group: 'Explore', icon: Compass, hint: 'Sun and Earth above the local horizon' },
  { id: 'compare', slug: 'compare', label: 'Compare sites', group: 'Analyze', icon: Award, hint: 'Compare illustrative site scenarios' },
  { id: 'forecast', slug: 'forecast', label: 'Forecast', group: 'Analyze', icon: CalendarDays, hint: 'Temperature, sunlight and Earth visibility' },
  { id: 'swarm', slug: 'swarm', label: 'Agent Swarm', group: 'Mission', icon: Bot, hint: 'Plan a mission from site choice and landing dates to launch, descent and surface operations' },
  { id: 'windows', slug: 'science-windows', label: 'Science windows', group: 'Analyze', icon: Search, hint: 'Find intervals meeting your constraints' },
  { id: 'mission-lab', slug: 'mission-lab', label: 'Mission lab', group: 'Mission', icon: FlaskConical, hint: 'Integrated power, landing, communications, thermal and operations analysis' },
  { id: 'mission-plan', slug: 'mission-plan', label: 'Agent Swarm', group: 'Mission', icon: Bot, hint: 'Plan a mission from site choice and landing dates to launch, descent and surface operations' },
  { id: 'trajectories', slug: 'trajectories', label: 'Trajectories', group: 'Mission', icon: Rocket, hint: 'Search transfer cases and inspect 2D/3D paths' },
  { id: 'surface', slug: 'surface', label: 'Surface safety', group: 'Analyze', icon: Mountain, hint: 'Terrain skyline, moving shadows and landing footprint' },
  { id: 'clps', slug: 'clps', label: 'CLPS explorer', group: 'Mission', icon: MapPinned, hint: 'NASA lunar deliveries and payloads' },
  { id: 'landing', slug: 'landing', label: 'Landing probability', group: 'Mission', icon: ShieldCheck, hint: 'Gaussian containment and assumed success factors', tool: 'landing' },
  { id: 'orbit', slug: 'orbit', label: 'Orbit & timeline', group: 'Mission', icon: Orbit, hint: 'Ideal orbit insertion and editable landing sequence', tool: 'orbit' },
  { id: 'water', slug: 'water', label: 'Water evidence', group: 'Mission', icon: Droplets, hint: 'Screen evidence for ice; uncalibrated score', tool: 'water' },
  { id: 'sites', slug: 'candidates', label: 'Candidate finder', group: 'Mission', icon: MapPinned, hint: 'Explore NASA candidate regions and mission criteria', tool: 'sites' },
  { id: 'solar', slug: 'solar', label: 'Solar power', group: 'Engineering', icon: Sun, hint: 'Size a photovoltaic array', tool: 'solar' },
  { id: 'battery', slug: 'battery', label: 'Battery', group: 'Engineering', icon: BatteryCharging, hint: 'Size storage for a dark interval', tool: 'battery' },
  { id: 'link', slug: 'radio', label: 'Radio link', group: 'Engineering', icon: Radio, hint: 'Calculate an Earth link budget', tool: 'link' },
  { id: 'los', slug: 'line-of-sight', label: 'Surface contact', group: 'Engineering', icon: Mountain, hint: 'Geometric lander-to-rover horizon', tool: 'los' },
  { id: 'temperature', slug: 'temperature', label: 'Temperature', group: 'Engineering', icon: Thermometer, hint: 'First-order radiative equilibrium', tool: 'temperature' },
  { id: 'sky', slug: 'sky-envelope', label: 'Sky envelope', group: 'Engineering', icon: Sunrise, hint: 'Approximate Sun and Earth elevation limits', tool: 'sky' },
  { id: 'constants', slug: 'constants', label: 'Constants', group: 'Reference', icon: BookOpen, hint: 'Physical constants used by the tools', tool: 'constants' },
  { id: 'models', slug: 'models', label: 'Models & sources', group: 'Reference', icon: BookOpen, hint: 'Inspect scientific assumptions and data providers' },
  // Preserve old bookmarks and model responses without a duplicate visible tab.
  { id: 'calculator', slug: 'formulas', label: 'Mission tools', group: 'Engineering', icon: Sun, hint: 'Engineering calculators', tool: 'solar' }
];
export function pageInfo(id: PageId): Page {
  if (id === 'mission-plan') return PAGES.find(p => p.id === 'swarm') ?? PAGES[0];
  return PAGES.find(page => page.id === id) ?? PAGES[0];
}
export function pageFromHash(): PageId {
  const slug = window.location.hash.slice(1);
  if (slug === 'swarm' || slug === 'agent-swarm' || slug === 'mission-plan') return 'swarm';
  return PAGES.find(page => page.slug === slug)?.id ?? 'selene';
}

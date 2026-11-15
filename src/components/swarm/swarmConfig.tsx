/** Types, defaults, presets and agent descriptions for the mission planner. */
import { API } from '../../lib/apiEndpoints';
import { describeFetchError } from '../../lib/offline';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Flame,
  Globe2,
  Layers,
  MapPin,
  Maximize2,
  Orbit,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap, Upload } from 'lucide-react';
import { ChatVerification } from '../ChatVerification';
import { PRESET_SITES } from '../Selene';
import { MissionFlightPath, type AgentRunStatus } from '../MissionFlightPath';
import { flightDate, missionFlightTimes } from '../../lib/missionFlight';


export type Inputs = Record<string, number | string>;
export type Stage = {
  agent: string;
  equation: string;
  inputs: Record<string, number | string>;
  outputs: Record<string, number | string | boolean | null>;
  checks: string[];
  limitations: string[];
};
export type TimelineEvent = { event: string; utc: string; note: string };
export type Plan = {
  inputs: Inputs;
  stages: Stage[];
  timeline?: TimelineEvent[];
  overall_status: string;
  total_spacecraft_delta_v_km_s: number;
  spacecraft_delta_v_capacity_km_s: number;
  assumptions: string[];
  missing_verifications: string[];
  execution_log: string[];
};
export type Interpretation = {
  extracted: Inputs;
  assumed_fields: string[];
  unresolved: string[];
  plan: Plan;
};
export type StreamEvent =
  | { type: 'running'; node: string; index: number }
  | { type: 'completed'; node: string; index: number; status: 'completed' | 'warning'; stage?: Stage }
  | { type: 'result'; plan: Plan }
  | { type: 'error'; node: string; message: string };
export type WindowCandidate = {
  sunlight_interval_start_utc: string;
  sunlight_interval_end_utc: string;
  estimated_launch_utc: string;
  estimated_landing_utc: string;
  continuous_sunlight_days_screened: number;
  minimum_sun_elevation_deg: number;
  earth_contact_hours_first_8_days: number;
  earth_contact_hours_during_required_stay: number;
  earth_contact_hours_in_sunlight_interval: number;
  phase_targeted: boolean;
  terrain_verified: boolean;
  eclipse_screened: boolean;
};
export type WindowSearchResult = {
  candidates: WindowCandidate[];
  best_plan: Plan | null;
  astronomy_source: string;
  required_sunlight_days: number;
  total_screened_sunlight_hours: number;
  minimum_earth_elevation_deg: number;
  maximum_earth_elevation_deg: number;
  recommended_landing_utc: string | null;
  limitations: string[];
};



export const INITIAL_INPUTS: Inputs = {
  departure_utc: '2027-01-15T12:00:00Z',
  launch_latitude_deg: 28.5,
  parking_altitude_km: 200,
  earth_parking_orbits: 1,
  earth_staging_altitude_km: 0,
  earth_staging_orbits: 1,
  // Two-stage launcher: first stage, then an upper stage that also performs TLI.
  launch_wet_mass_kg: 420000,
  launch_dry_mass_kg: 25000,
  launch_isp_s: 300,
  launch_thrust_n: 7000000,
  upper_stage_wet_mass_kg: 110000,
  upper_stage_dry_mass_kg: 5000,
  upper_stage_isp_s: 450,
  tli_by_upper_stage: 'true',
  spacecraft_wet_mass_kg: 6500,
  spacecraft_dry_mass_kg: 2400,
  lunar_wait_orbits: 1,
  spacecraft_isp_s: 450,
  landing_thrust_n: 22000,
  descent_throttle: 0.6,
  hover_reserve_s: 60,
  dv_margin_pct: 10,
  lunar_orbit_altitude_km: 100,
  target_latitude_deg: -89.4398,
  target_longitude_deg: -137.17,
  landing_radius_m: 100,
  landing_sigma_m: 30,
  payload_power_w: 300,
  survival_power_w: 80,
  battery_capacity_wh: 20000,
  array_area_m2: 8,
  array_efficiency: 0.28,
  stay_days: 14,
  tx_power_w: 20,
  antenna_gain_dbi: 24,
  // Site-selection and landing-window agents (whole-mission run).
  site_mode: 'auto',
  landing_start_utc: '2027-01-01T00:00:00Z',
  landing_end_utc: '2027-03-31T00:00:00Z',
  min_sunlight_days: 8
};

export const STRING_FIELDS = new Set(['departure_utc', 'site_mode', 'landing_start_utc', 'landing_end_utc', 'tli_by_upper_stage']);

/** Drop an incomplete landing range so the request still validates. */
export function requestInputs(inputs: Inputs): Inputs {
  const out: Inputs = { ...inputs };
  // Booleans travel as strings in the form state.
  (out as Record<string, unknown>).tli_by_upper_stage = String(out.tli_by_upper_stage ?? 'true') !== 'false';
  delete out.site_safe_fraction;
  delete out.spacecraft_propellant_capacity_kg;
  if (!out.landing_start_utc || !out.landing_end_utc) { delete out.landing_start_utc; delete out.landing_end_utc; }
  return out;
}

export interface PresetScenario {
  id: string;
  name: string;
  badge: string;
  description: string;
  inputs: Partial<Inputs>;
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'artemis-crew',
    name: 'Crewed-class lander (scaled)',
    badge: 'Crewed-class',
    description: 'Illustrative crewed-class polar landing with a 6,500 kg lander. Real crewed landers are far heavier; Artemis III is now an Earth-orbit test flight.',
    inputs: {
      target_latitude_deg: -89.54,
      target_longitude_deg: 0,
      spacecraft_wet_mass_kg: 6500,
      spacecraft_dry_mass_kg: 800,
      spacecraft_isp_s: 450,
      landing_thrust_n: 22000,
      landing_radius_m: 100,
      landing_sigma_m: 30,
      payload_power_w: 300,
      battery_capacity_wh: 20000,
      array_area_m2: 8
    }
  },
  {
    id: 'viper-scout',
    name: 'VIPER Polar Prospector',
    badge: 'Robotic Rover',
    description: 'Lightweight autonomous rover delivery to Nobile Rim with 400W continuous science load.',
    inputs: {
      target_latitude_deg: -85.25,
      target_longitude_deg: 37.8,
      spacecraft_wet_mass_kg: 2400,
      spacecraft_dry_mass_kg: 450,
      spacecraft_isp_s: 325,
      landing_thrust_n: 7500,
      landing_radius_m: 60,
      landing_sigma_m: 18,
      payload_power_w: 400,
      battery_capacity_wh: 25000,
      array_area_m2: 6
    }
  },
  {
    id: 'clps-cargo',
    name: 'CLPS Commercial Cargo',
    badge: 'Commercial Delivery',
    description: 'Medium lander to Connecting Ridge, optimized for heavy surface equipment survival.',
    inputs: {
      target_latitude_deg: -89.44,
      target_longitude_deg: -137.3,
      spacecraft_wet_mass_kg: 3800,
      spacecraft_dry_mass_kg: 950,
      spacecraft_isp_s: 310,
      landing_thrust_n: 12000,
      landing_radius_m: 120,
      landing_sigma_m: 35,
      payload_power_w: 220,
      battery_capacity_wh: 16000,
      array_area_m2: 7
    }
  },
  {
    id: 'nuclear-electric',
    name: 'Deep Cargo High-Isp',
    badge: 'High-Isp Cargo',
    description: '12,000 kg heavy freight lander using high-efficiency electric propulsion to Malapert Massif.',
    inputs: {
      target_latitude_deg: -86.04,
      target_longitude_deg: 2.7,
      spacecraft_wet_mass_kg: 12000,
      spacecraft_dry_mass_kg: 2200,
      spacecraft_isp_s: 1800,
      landing_thrust_n: 46500,
      landing_radius_m: 80,
      landing_sigma_m: 22,
      payload_power_w: 1200,
      battery_capacity_wh: 60000,
      array_area_m2: 24
    }
  },
  {
    id: 'polar-hopper',
    name: 'Direct Polar Hopper',
    badge: 'High Precision',
    description: 'Haworth shadowed crater rim probe with high-containment target ellipse.',
    inputs: {
      target_latitude_deg: -87.87,
      target_longitude_deg: -5.1,
      spacecraft_wet_mass_kg: 2800,
      spacecraft_dry_mass_kg: 620,
      spacecraft_isp_s: 360,
      landing_thrust_n: 9000,
      landing_radius_m: 50,
      landing_sigma_m: 14,
      payload_power_w: 250,
      battery_capacity_wh: 18000,
      array_area_m2: 5
    }
  }
];

export const SUGGESTED_QUERIES = [
  'Plan a crewed-class landing at Connecting Ridge with a 6500 kg lander and 450 s Isp.',
  'Simulate a VIPER robotic scout delivery to Nobile Rim with 400W payload and 25 kWh battery.',
  'Test a 3800 kg commercial cargo lander to Connecting Ridge with 35m dispersion sigma.',
  'Analyze heavy freight transport with 12000 kg wet mass and 1800s Isp to Malapert Massif.'
];

export const AGENT_METADATA = [
  {
    name: 'Site selection agent',
    short: 'Site Selection',
    icon: MapPin,
    tag: 'Node 1 · Site',
    desc: 'Ranks candidate south-pole sites by sunlight and Earth visibility over the real skyline; rejects slopes over 10°'
  },
  {
    name: 'Landing window agent',
    short: 'Landing Window',
    icon: Sun,
    tag: 'Node 2 · Dates',
    desc: 'Finds landing dates with continuous sunlight at the chosen site and back-calculates the launch date'
  },
  {
    name: 'Launch and parking-orbit agent',
    short: 'Launch & Ascent',
    icon: Rocket,
    tag: 'Node 3 · Ascent',
    desc: 'LEO insertion velocity, Earth rotation boost, atmospheric/gravity loss screening'
  },
  {
    name: 'Translunar transfer agent',
    short: 'Translunar Transfer',
    icon: Orbit,
    tag: 'Node 4 · TLI',
    desc: 'Two-body Hohmann patched-conic injection delta-v, coast duration, hyperbolic excess'
  },
  {
    name: 'Lunar orbit insertion agent',
    short: 'Lunar Capture',
    icon: Globe2,
    tag: 'Node 5 · Capture',
    desc: 'LOI burn at perilune, hyperbolic capture reduction, parking orbit orbital period'
  },
  {
    name: 'Powered descent and propellant agent',
    short: 'Powered Descent',
    icon: ArrowDownCircle,
    tag: 'Node 6 · Descent',
    desc: 'De-orbit delta-v, landing engine throttle thrust-to-weight, fuel mass depletion'
  },
  {
    name: 'Landing safety, power and contact agent',
    short: 'Surface Operations',
    icon: Sun,
    tag: 'Node 7 · Surface',
    desc: 'Isotropic Gaussian containment ellipse, 7-day solar power budget, Earth line-of-sight'
  },
  {
    name: 'Review agent',
    short: 'Supervisor Audit',
    icon: ShieldCheck,
    tag: 'Node 8 · Review',
    desc: 'Combines the checks from every step, compares total Δv with spacecraft capacity, and gives the verdict'
  }
];

export const formatLabel = (field: string) =>
  field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const formatValue = (value: number | string | boolean | null | undefined) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Pass / True' : 'Fail / False';
  if (typeof value === 'number') {
    if (Math.abs(value) >= 10000 || (Math.abs(value) < 0.001 && value !== 0)) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
    }
    return Number(value.toPrecision(5)).toLocaleString();
  }
  return String(value);
};

export const pctText = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
export const numText = (v: number | null | undefined, unit: string, digits = 0) => (v === null || v === undefined ? '—' : `${v.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}`);

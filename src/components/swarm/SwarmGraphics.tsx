/** Δv budget, landing dispersion and surface power graphics for a computed plan. */
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

import { INITIAL_INPUTS, STRING_FIELDS, requestInputs, PRESET_SCENARIOS, SUGGESTED_QUERIES, AGENT_METADATA, formatLabel, formatValue, pctText, numText } from './swarmConfig';
import type { Inputs, Stage, TimelineEvent, Plan, Interpretation, StreamEvent, WindowCandidate, WindowSearchResult, PresetScenario } from './swarmConfig';

export function SwarmGraphics({ plan, inputs }: { plan: Plan | null; inputs: Inputs }) {
  const deltaVData = useMemo(() => {
    if (!plan) return null;
    const descentOut = plan.stages.find((st) => st.agent.includes('descent'))?.outputs ?? {};
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const earthRaise = num(descentOut['spacecraft_earth_raise_delta_v_km_s']);
    const tli = num(descentOut['spacecraft_tli_delta_v_km_s']);
    const loi = num(plan.stages.find((st) => st.agent.includes('insertion'))?.outputs['loi_delta_v_km_s']);
    const descent = num(descentOut['descent_delta_v_km_s']);
    const reserveNeeded = num(descentOut['required_reserve_km_s']);
    const totalRequired = plan.total_spacecraft_delta_v_km_s;
    const capacity = plan.spacecraft_delta_v_capacity_km_s;
    const margin = Math.max(0, capacity - totalRequired);
    const marginPct = capacity > 0 ? (margin / capacity) * 100 : 0;
    const isPassing = capacity >= totalRequired + reserveNeeded;
    return { earthRaise, tli, loi, descent, reserveNeeded, totalRequired, capacity, margin, marginPct, isPassing };
  }, [plan]);

  // Landing Containment Calculations
  const containmentData = useMemo(() => {
    if (!plan) return null;
    const out = plan.stages.find((st) => st.agent.includes('Landing safety'))?.outputs ?? {};
    const val = (k: string) => (typeof out[k] === 'number' && Number.isFinite(out[k] as number) ? (out[k] as number) : null);
    return {
      containment: val('landing_containment_probability'),
      terrainSafe: val('terrain_safe_fraction'),
      safeProb: val('landing_success_screen'),
      sunHours: val('sunlight_hours'),
      contactHours: val('earth_contact_hours'),
      solarEnergy: val('solar_energy_wh'),
      loadEnergy: val('load_energy_wh'),
      nightNeed: val('night_survival_energy_wh'),
      longestNight: val('longest_night_hours'),
      longestBlackout: val('longest_blackout_hours'),
      rateKbps: val('dte_data_rate_kbps_worst_case'),
      earthAtTouchdown: typeof out['earth_in_view_at_touchdown'] === 'boolean' ? (out['earth_in_view_at_touchdown'] as boolean) : null,
      stayDays: val('stay_days'),
    };
  }, [plan]);

  return (
    <>
      {plan && <section className="as-graphics-row">
        {/* Graphic 1: Delta-V Budget Distribution */}
        <div className="as-card as-graphic-card">
          <div className="as-card-header">
            <div>
              <h3>Spacecraft Delta-V Distribution</h3>
              <p>Burn budget and propellant capacity</p>
            </div>
            <span className={`as-pill ${deltaVData?.isPassing ? 'is-pass' : 'is-warn'}`}>
              {deltaVData?.isPassing ? 'Sufficient Fuel' : 'Capacity Deficit'}
            </span>
          </div>

          <div className="as-dv-visual">
            <div className="as-dv-bar">
              {(deltaVData?.earthRaise ?? 0) > 0 && <div className="as-dv-seg is-earth-raise" style={{ width: `${Math.min(100, (deltaVData!.earthRaise / Math.max(.001, deltaVData!.capacity)) * 100)}%` }} title={`Earth orbit raising: ${deltaVData!.earthRaise.toFixed(2)} km/s`}><span>Earth raise</span></div>}
              <div
                className="as-dv-seg is-tli"
                style={{ width: `${Math.min(100, ((deltaVData?.tli ?? 0) / Math.max(0.001, deltaVData?.capacity ?? 0)) * 100)}%` }}
                title={`Translunar Injection: ${(deltaVData?.tli ?? 0).toFixed(2)} km/s`}
              >
                <span>TLI</span>
              </div>
              <div
                className="as-dv-seg is-loi"
                style={{ width: `${Math.min(100, ((deltaVData?.loi ?? 0) / Math.max(0.001, deltaVData?.capacity ?? 0)) * 100)}%` }}
                title={`Lunar Orbit Insertion: ${(deltaVData?.loi ?? 0).toFixed(2)} km/s`}
              >
                <span>LOI</span>
              </div>
              <div
                className="as-dv-seg is-descent"
                style={{ width: `${Math.min(100, ((deltaVData?.descent ?? 0) / Math.max(0.001, deltaVData?.capacity ?? 0)) * 100)}%` }}
                title={`Powered Descent: ${(deltaVData?.descent ?? 0).toFixed(2)} km/s`}
              >
                <span>Descent</span>
              </div>
              <div
                className="as-dv-seg is-reserve"
                style={{ width: `${Math.max(0, deltaVData?.marginPct ?? 0)}%` }}
                title={`Reserve Margin: ${(deltaVData?.margin ?? 0).toFixed(2)} km/s`}
              >
                <span>Margin</span>
              </div>
            </div>

            <div className="as-dv-legend">
              {(deltaVData?.earthRaise ?? 0) > 0 && <div className="as-legend-item"><span className="as-swatch is-earth-raise"/><span>Earth orbit raising: <strong>{deltaVData!.earthRaise.toFixed(2)} km/s</strong></span></div>}
              <div className="as-legend-item">
                <span className="as-swatch is-tli" />
                <span>TLI by spacecraft: <strong>{(deltaVData?.tli ?? 0).toFixed(2)} km/s</strong></span>
              </div>
              <div className="as-legend-item">
                <span className="as-swatch is-loi" />
                <span>LOI Capture: <strong>{(deltaVData?.loi ?? 0).toFixed(2)} km/s</strong></span>
              </div>
              <div className="as-legend-item">
                <span className="as-swatch is-descent" />
                <span>Powered Descent: <strong>{(deltaVData?.descent ?? 0).toFixed(2)} km/s</strong></span>
              </div>
              <div className="as-legend-item">
                <span className="as-swatch is-reserve" />
                <span>Spare Δv: <strong>{(deltaVData?.margin ?? 0).toFixed(2)} km/s</strong> (reserve needed {(deltaVData?.reserveNeeded ?? 0).toFixed(2)} km/s)</span>
              </div>
            </div>

            <div className="as-dv-metrics">
              <div className="as-mini-metric">
                <span>Total Mission Demand</span>
                <strong>{(deltaVData?.totalRequired ?? 0).toFixed(3)} km/s</strong>
              </div>
              <div className="as-mini-metric">
                <span>Spacecraft Capacity</span>
                <strong>{(deltaVData?.capacity ?? 0).toFixed(3)} km/s</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Graphic 2: Landing Dispersion Ellipse Radar */}
        <div className="as-card as-graphic-card">
          <div className="as-card-header">
            <div>
              <h3>Landing Containment Radar</h3>
              <p>Landing dispersion</p>
            </div>
            <span className="as-pill is-indigo">
              P = {((containmentData?.containment ?? 0.996) * 100).toFixed(1)}%
            </span>
          </div>

          <div className="as-radar-container">
            <svg viewBox="0 0 200 200" className="as-radar-svg">
              {/* Radial Grid Rings */}
              <circle cx="100" cy="100" r="85" className="as-ring is-zone" />
              <circle cx="100" cy="100" r="60" className="as-ring is-3sigma" />
              <circle cx="100" cy="100" r="40" className="as-ring is-2sigma" />
              <circle cx="100" cy="100" r="20" className="as-ring is-1sigma" />

              {/* Crosshairs */}
              <line x1="100" y1="10" x2="100" y2="190" className="as-crosshair" />
              <line x1="10" y1="100" x2="190" y2="100" className="as-crosshair" />

              {/* Target Landing Site Center */}
              <circle cx="100" cy="100" r="4" className="as-bullseye" />

              {/* Simulated Dispersion Probability Cloud */}
              <ellipse cx="100" cy="100" rx="38" ry="34" className="as-dispersion-cloud" />

              {/* Ring Labels */}
              <text x="104" y="24" className="as-svg-label">Radius: {inputs.landing_radius_m}m</text>
              <text x="104" y="44" className="as-svg-label">3σ ({Number(inputs.landing_sigma_m) * 3}m)</text>
              <text x="104" y="64" className="as-svg-label">2σ ({Number(inputs.landing_sigma_m) * 2}m)</text>
              <text x="104" y="84" className="as-svg-label">1σ ({inputs.landing_sigma_m}m)</text>
            </svg>

            <div className="as-radar-stats">
              <div className="as-mini-metric">
                <span>Lands inside target radius</span>
                <strong>{pctText(containmentData?.containment)}</strong>
              </div>
              <div className="as-mini-metric">
                <span>Ellipse under 12° slope (LOLA)</span>
                <strong>{pctText(containmentData?.terrainSafe)}</strong>
              </div>
              <div className="as-mini-metric">
                <span>Inside radius and on safe slope</span>
                <strong>{pctText(containmentData?.safeProb)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Graphic 3: 7-Day Surface Energy & Illumination Preview */}
        <div className="as-card as-graphic-card">
          <div className="as-card-header">
            <div>
              <h3>{containmentData?.stayDays ?? 14}-day surface stay</h3>
              <p>Power, night survival and Earth link over the whole stay</p>
            </div>
            <span className={`as-pill ${(containmentData?.solarEnergy ?? 0) >= (containmentData?.loadEnergy ?? Infinity) ? 'is-pass' : 'is-warn'}`}>
              {(containmentData?.solarEnergy ?? 0) >= (containmentData?.loadEnergy ?? Infinity) ? 'Power Positive' : 'Load Deficit'}
            </span>
          </div>

          <div className="as-energy-visual">
            <div className="as-energy-row">
              <div className="as-energy-metric">
                <span>Solar generation</span>
                <strong>{numText(containmentData?.solarEnergy, 'Wh')}</strong>
              </div>
              <div className="as-energy-metric">
                <span>Load (payload by day, heaters at night)</span>
                <strong>{numText(containmentData?.loadEnergy, 'Wh')}</strong>
              </div>
            </div>

            {/* Visual power ratio bar */}
            <div className="as-power-progress">
              <div
                className="as-power-fill"
                style={{
                  width: `${Math.min(100, ((containmentData?.solarEnergy ?? 0) / Math.max(1, containmentData?.loadEnergy ?? 1)) * 100)}%`
                }}
              />
            </div>

            <div className="as-timeline-stats">
              <div className="as-time-chip">
                <Sun size={14} />
                <span>Sunlight: <strong>{numText(containmentData?.sunHours, 'h')}</strong> · longest night <strong>{numText(containmentData?.longestNight, 'h')}</strong></span>
              </div>
              <div className="as-time-chip">
                <Globe2 size={14} />
                <span>Earth in view: <strong>{numText(containmentData?.contactHours, 'h')}</strong> · at touchdown <strong>{containmentData?.earthAtTouchdown === null || containmentData?.earthAtTouchdown === undefined ? '—' : containmentData.earthAtTouchdown ? 'yes' : 'no'}</strong></span>
              </div>
              <div className="as-time-chip">
                <Zap size={14} />
                <span>Night heaters need <strong>{numText(containmentData?.nightNeed, 'Wh')}</strong> of {numText(Number(inputs.battery_capacity_wh), 'Wh')} battery · Earth link <strong>{numText(containmentData?.rateKbps, 'kbit/s')}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </section>}
    </>
  );
}

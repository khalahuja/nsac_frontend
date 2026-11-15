import { API } from '../lib/apiEndpoints';
import { describeFetchError } from '../lib/offline';
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
import { ChatVerification } from './ChatVerification';
import { PRESET_SITES } from './Selene';
import { INITIAL_INPUTS, STRING_FIELDS, requestInputs, PRESET_SCENARIOS, SUGGESTED_QUERIES, AGENT_METADATA, formatLabel, formatValue, pctText, numText } from './swarm/swarmConfig';
import type { Inputs, Stage, TimelineEvent, Plan, Interpretation, StreamEvent, WindowCandidate, WindowSearchResult, PresetScenario } from './swarm/swarmConfig';
import { SwarmGraphics } from './swarm/SwarmGraphics';
import { SwarmTimeline } from './swarm/SwarmTimeline';
import { SwarmAudit } from './swarm/SwarmAudit';
import { MissionFlightPath, type AgentRunStatus } from './MissionFlightPath';
import { flightDate, missionFlightTimes } from '../lib/missionFlight';

export function AgentSwarmPage({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [inputs, setInputs] = useState<Inputs>(() => ({
    ...INITIAL_INPUTS,
    target_latitude_deg: latitude,
    target_longitude_deg: longitude
  }));

  // Follow the site selected elsewhere in the app.
  useEffect(() => {
    setInputs(prev => ({ ...prev, target_latitude_deg: latitude, target_longitude_deg: longitude }));
  }, [latitude, longitude]);

  const [query, setQuery] = useState(
    'Plan a launch to a 100 km lunar orbit and land at the selected site. Use a 6500 kg spacecraft, 450 s Isp, and 300 W surface load.'
  );

  const [plan, setPlan] = useState<Plan | null>(null);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [busy, setBusy] = useState(false);
  const [runState, setRunState] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [agentStatuses, setAgentStatuses] = useState<AgentRunStatus[]>(() => AGENT_METADATA.map(() => 'pending'));
  const [completedStages, setCompletedStages] = useState<Stage[]>([]);
  const [activity, setActivity] = useState('Choose a mission profile or adjust parameters, then run the simulation.');
  const pageRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const [importError, setImportError] = useState('');
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState<number>(0);
  const [selectedTab, setSelectedTab] = useState<'graph' | 'telemetry' | 'audit'>('graph');
  const [paramSection, setParamSection] = useState<'launch' | 'spacecraft' | 'surface'>('spacecraft');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [landingStart, setLandingStart] = useState('2027-01-01');
  const [landingEnd, setLandingEnd] = useState('2027-10-12');
  const [minSunDays, setMinSunDays] = useState(8);
  const [windowResult, setWindowResult] = useState<WindowSearchResult | null>(null);
  const [windowBusy, setWindowBusy] = useState(false);
  const [windowError, setWindowError] = useState('');

  // Bot guard Turnstile config
  const [config, setConfig] = useState<{ challenge_required: boolean; site_key: string } | null>(null);
  const [token, setToken] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    fetch(`${API}/api/mission/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  // Update target when coordinate prop changes
  useEffect(() => {
    setInputs((prev) => ({
      ...prev,
      target_latitude_deg: latitude,
      target_longitude_deg: longitude
    }));
  }, [latitude, longitude]);

  async function executeSwarm(mode: 'simulate' | 'interpret', scrollToProgress = true) {
    setBusy(true);
    setError('');
    setInterpretation(null);
    setPlan(null);
    setCompletedStages([]);
    setAgentStatuses(AGENT_METADATA.map(() => 'pending'));
    setActiveStepIndex(-1);
    setSelectedTab('graph');
    setRunState('running');
    setActivity(mode === 'interpret' ? 'Groq is mapping your requirements to mission variables…' : 'Running the mission calculations…');
    if (scrollToProgress) window.setTimeout(() => progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    let lastNodeIndex = 0;

    try {
      const response = await fetch(`${API}/api/mission/${mode === 'simulate' ? 'simulate/stream' : 'interpret'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(mode === 'interpret' && token ? { 'X-Turnstile-Token': token } : {})
        },
        body: JSON.stringify(mode === 'interpret' ? { query, base_inputs: requestInputs(inputs) } : { inputs: requestInputs(inputs) })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : `Simulation request failed (${response.status})`);
      }
      if (mode === 'interpret') {
        const result = await response.json() as Interpretation;
        setInterpretation(result);
        setInputs(result.plan.inputs);
        setPlan(result.plan);
        setCompletedStages(result.plan.stages);
        setAgentStatuses(AGENT_METADATA.map((meta, index) => index === AGENT_METADATA.length - 1
          ? result.plan.overall_status === 'screening_failed' ? 'warning' : 'completed'
          : result.plan.stages.find(stage => stage.agent === meta.name)?.checks.length ? 'warning' : 'completed'));
        setRunState('complete');
        setActivity('Requirements mapped and every calculation step completed. Review the results below.');
        if (config?.challenge_required) {
          setToken('');
          setAttempt((v) => v + 1);
        }
      } else {
        if (!response.body) throw new Error('This browser cannot read the simulation progress stream.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = '';
        let receivedPlan = false;
        const applyEvent = (line: string) => {
          if (!line.trim()) return;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'running') {
            lastNodeIndex = event.index;
            setActiveStepIndex(event.index);
            setAgentStatuses(previous => previous.map((status, index) => index === event.index ? 'running' : status));
            setActivity(`${AGENT_METADATA[event.index]?.short ?? event.node} is running.`);
          } else if (event.type === 'completed') {
            setAgentStatuses(previous => previous.map((status, index) => index === event.index ? event.status : status));
            if (event.stage) setCompletedStages(previous => [...previous.filter(stage => stage.agent !== event.stage?.agent), event.stage!]);
          } else if (event.type === 'result') {
            receivedPlan = true;
            setPlan(event.plan);
            setRunState('complete');
            setActiveStepIndex(-1);
            setActivity(`All ${AGENT_METADATA.length} agents completed. ${event.plan.overall_status === 'screening_failed' ? 'Some constraints need attention.' : 'The provisional screen passed.'}`);
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          for (const line of lines) applyEvent(line);
          if (done) break;
        }
        if (pending.trim()) applyEvent(pending);
        if (!receivedPlan) throw new Error('The simulation stream ended before the supervisor returned a plan.');
      }
      setActiveStepIndex(-1);
    } catch (err) {
      setError(describeFetchError(err, 'The mission agent swarm'));
      setRunState('error');
      setAgentStatuses(previous => previous.map((status, index) => index === lastNodeIndex && status === 'running' ? 'failed' : status));
      setActivity('Simulation stopped. Check the error and run it again.');
      setActiveStepIndex(-1);
    } finally {
      setBusy(false);
    }
  }

  async function searchWindows() {
    setWindowBusy(true);
    setWindowError('');
    setWindowResult(null);
    try {
      const response = await fetch(`${API}/api/mission/windows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs,
          landing_start_utc: `${landingStart}T00:00:00Z`,
          landing_end_utc: `${landingEnd}T23:00:00Z`,
          min_continuous_sunlight_days: minSunDays
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Check the date range and mission inputs.');
      const result = body as WindowSearchResult;
      setWindowResult(result);
      if (result.best_plan) {
        setPlan(result.best_plan);
        setCompletedStages(result.best_plan.stages);
        setAgentStatuses(AGENT_METADATA.map((meta, index) => index === AGENT_METADATA.length - 1
          ? result.best_plan?.overall_status === 'screening_failed' ? 'warning' : 'completed'
          : result.best_plan?.stages.find(stage => stage.agent === meta.name)?.checks.length ? 'warning' : 'completed'));
        setRunState('complete');
        setActivity('The date search and mission agents completed. Review the screened plan below.');
      }
    } catch (err) {
      setWindowError(describeFetchError(err, 'The mission window search'));
    } finally {
      setWindowBusy(false);
    }
  }

  const applyPreset = (preset: PresetScenario) => {
    setInputs((prev) => {
      const next: Inputs = { ...prev };
      for (const [key, value] of Object.entries(preset.inputs)) {
        if (typeof value === 'string' || typeof value === 'number') next[key] = value;
      }
      return next;
    });
    setPlan(null);
    setCompletedStages([]);
    setAgentStatuses(AGENT_METADATA.map(() => 'pending'));
    setRunState('idle');
    setActivity(`${preset.name} selected. Press Run Simulation to start all agents.`);
  };

  const handleInputChange = (field: string, value: string | number) => {
    setInputs(prev => {
      const next = { ...prev, [field]: STRING_FIELDS.has(field) ? value : Number(value) };
      if (field === 'spacecraft_dry_mass_kg') {
        const fuel = Number(prev.spacecraft_wet_mass_kg) - Number(prev.spacecraft_dry_mass_kg);
        next.spacecraft_wet_mass_kg = Number(value) + fuel;
      }
      return next;
    });
    setPlan(null);
    setCompletedStages([]);
    setAgentStatuses(AGENT_METADATA.map(() => 'pending'));
    setRunState('idle');
    setActivity('Mission inputs changed. Press Run Simulation to recalculate the results.');
  };

  // Stages are matched by agent name, so the cards stay correct however many agents run.
  const selectedStage = completedStages.find((st) => st.agent === AGENT_METADATA[selectedAgentIndex]?.name)
    ?? plan?.stages.find((st) => st.agent === AGENT_METADATA[selectedAgentIndex]?.name);

  // Delta-V Calculations for Visualization

  const copyPlanSummary = () => {
    if (!plan) return;
    const text = `# Lunar Mission Swarm Plan Summary
Status: ${plan.overall_status}
Spacecraft Delta-V: ${plan.total_spacecraft_delta_v_km_s.toFixed(3)} km/s required / ${plan.spacecraft_delta_v_capacity_km_s.toFixed(3)} km/s capacity
Target: ${inputs.target_latitude_deg}° Lat, ${inputs.target_longitude_deg}° Lon
Spacecraft Mass: ${inputs.spacecraft_wet_mass_kg} kg wet / ${inputs.spacecraft_dry_mass_kg} kg dry
Engine Isp: ${inputs.spacecraft_isp_s} s
Stages:
${plan.stages.map((s, i) => `${i + 1}. ${s.agent}: ${JSON.stringify(s.outputs)}`).join('\n')}
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadJsonPlan = () => {
    if (!plan) return;
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lunar-mission-swarm-plan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJsonPlan = (file: File) => {
    file.text().then((text) => {
      const loaded = JSON.parse(text) as Plan;
      if (!loaded || typeof loaded !== 'object' || !loaded.inputs || typeof loaded.inputs !== 'object') throw new Error('Not a Selene mission plan');
      const clean: Inputs = {};
      for (const [key, value] of Object.entries(loaded.inputs)) if (typeof value === 'number' || typeof value === 'string') clean[key] = value;
      setInputs((prev) => ({ ...prev, ...clean }));
      setPlan(loaded);
      setCompletedStages(loaded.stages);
      setAgentStatuses(AGENT_METADATA.map((meta, index) => index === AGENT_METADATA.length - 1
        ? loaded.overall_status === 'screening_failed' ? 'warning' : 'completed'
        : loaded.stages.find(stage => stage.agent === meta.name)?.checks.length ? 'warning' : 'completed'));
      setRunState('complete');
      setActivity('Imported plan loaded. Run Simulation to compute fresh results from these inputs.');
      setImportError('');
    }).catch((error) => setImportError(`Could not load that file: ${(error as Error).message}`));
  };

  const completedCount = agentStatuses.filter(status => status === 'completed' || status === 'warning').length;
  const resultChecks = plan?.stages.flatMap(stage => stage.checks) ?? [];
  const flightStages = completedStages.length ? completedStages : plan?.stages ?? [];
  const flightDeparture = String(plan?.inputs.departure_utc ?? inputs.departure_utc);
  const flightOutput = (key: string) => flightStages.find(stage => stage.outputs[key] != null)?.outputs[key];
  const flightMetric = (value: unknown, unit: string, decimals = 2) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(decimals)} ${unit}` : 'Pending';
  const flightTimes = missionFlightTimes(flightStages, flightDeparture);

  return (
    <div className="as-container" ref={pageRef}>
      {/* ====================================================================
          1. HERO HEADER WITH SWARM STATUS
          ==================================================================== */}
      <header className="as-hero">
        <div className="as-hero-content">
          <div className="as-badge">
            <Bot size={15} className="as-pulse-icon" />
            <span>MISSION PLANNER · SITE TO SURFACE</span>
          </div>
          <h1>Earth-to-Moon mission plan</h1>
          <p>Choose a site, set dates, and run the mission.</p>

          <div className="as-stats-strip">
            <div className="as-stat-item">
              <span className="as-stat-label">Method</span>
              <strong className="as-stat-val">Deterministic equations</strong>
            </div>
            <div className="as-stat-item">
              <span className="as-stat-label">Steps</span>
              <strong className="as-stat-val">Site → dates → launch → landing</strong>
            </div>
            <div className="as-stat-item">
              <span className="as-stat-label">Data</span>
              <strong className="as-stat-val">JPL DE440 · NASA LOLA terrain</strong>
            </div>
            <div className="as-stat-item">
              <span className="as-stat-label">Feasibility Screen</span>
              <strong className={`as-stat-val ${plan?.overall_status === 'provisional_screening_pass' ? 'is-pass' : 'is-warn'}`}>
                {!plan ? 'Awaiting Simulation' : plan.overall_status === 'provisional_screening_pass' ? 'Provisional Pass' : 'Screening Checks Required'}
              </strong>
            </div>
          </div>
        </div>

        <div className="as-hero-actions">
          <button
            type="button"
            className="as-btn-primary as-run-primary"
            disabled={busy}
            onClick={() => void executeSwarm('simulate', true)}
          >
            {busy ? <RefreshCw size={17} className="as-spin" /> : <Play size={17} />}
            <span>{busy ? 'Agents Running…' : 'Run Simulation'}</span>
          </button>
          <button type="button" className="as-btn-secondary as-ask-chat" onClick={() => window.dispatchEvent(new Event('selene:open-chat'))}>
            <Bot size={16} /> Ask Selene chatbot
          </button>
          <div className="as-hero-secondary-btns">
            <button
              type="button"
              className="as-btn-secondary"
              onClick={copyPlanSummary}
              disabled={!plan}
              title="Copy mission plan markdown summary"
            >
              <Copy size={15} />
              <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
            </button>
            <button
              type="button"
              className="as-btn-secondary"
              onClick={downloadJsonPlan}
              disabled={!plan}
              title="Download full JSON plan"
            >
              <Download size={15} />
              <span>Export JSON</span>
            </button>
            <label className="as-btn-secondary" title="Load a previously exported JSON plan">
              <Upload size={15} />
              <span>Import JSON</span>
              <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJsonPlan(f); e.target.value = ''; }} />
            </label>
            {importError && <span className="as-import-error" role="alert">{importError}</span>}
          </div>
        </div>
      </header>

      <section className="as-vehicle-card" aria-labelledby="as-vehicle-title">
        <div className="as-vehicle-heading"><h2 id="as-vehicle-title">Spacecraft and mission settings</h2><span>Loaded mass: {Number(inputs.spacecraft_wet_mass_kg).toLocaleString()} kg</span></div>
        <div className="as-vehicle-fields">
          <label className="as-field"><span>Dry mass, including payload (kg)</span><input aria-label="Spacecraft dry mass" type="number" min="1" step="50" disabled={busy} value={inputs.spacecraft_dry_mass_kg} onChange={e => handleInputChange('spacecraft_dry_mass_kg', e.target.value)}/></label>
          <label className="as-field"><span>Fuel loaded (kg)</span><input aria-label="Spacecraft fuel loaded" type="number" min="1" step="100" disabled={busy} value={Number(inputs.spacecraft_wet_mass_kg) - Number(inputs.spacecraft_dry_mass_kg)} onChange={e => handleInputChange('spacecraft_wet_mass_kg', Number(inputs.spacecraft_dry_mass_kg) + Number(e.target.value))}/></label>
          <label className="as-field"><span>Engine specific impulse (s)</span><input aria-label="Spacecraft engine specific impulse" type="number" min="100" max="5000" step="10" disabled={busy} value={inputs.spacecraft_isp_s} onChange={e => handleInputChange('spacecraft_isp_s', e.target.value)}/></label>
          <label className="as-field"><span>Landing thrust (N)</span><input aria-label="Spacecraft landing thrust" type="number" min="1" step="1000" disabled={busy} value={inputs.landing_thrust_n} onChange={e => handleInputChange('landing_thrust_n', e.target.value)}/></label>
          <label className="as-field"><span>Earth parking orbit (km)</span><input aria-label="Earth parking altitude" type="number" min="150" max="2000" step="10" disabled={busy} value={inputs.parking_altitude_km} onChange={e => handleInputChange('parking_altitude_km', e.target.value)}/></label>
          <label className="as-field"><span>Earth parking orbit count</span><input aria-label="Earth parking orbit count" type="number" min="0" max="100" step="1" disabled={busy} value={inputs.earth_parking_orbits ?? 1} onChange={e => handleInputChange('earth_parking_orbits', e.target.value)}/></label>
          <label className="as-field"><span>Higher Earth orbit altitude (km; 0 = direct)</span><input aria-label="Earth staging altitude" type="number" min="0" max="60000" step="100" disabled={busy} value={inputs.earth_staging_altitude_km ?? 0} onChange={e => handleInputChange('earth_staging_altitude_km', e.target.value)}/></label>
          <label className="as-field"><span>Higher Earth orbit count</span><input aria-label="Earth staging orbit count" type="number" min="0" max="100" step="1" disabled={busy || !Number(inputs.earth_staging_altitude_km)} value={inputs.earth_staging_orbits ?? 1} onChange={e => handleInputChange('earth_staging_orbits', e.target.value)}/></label>
          <label className="as-field"><span>Lunar orbit altitude (km)</span><input aria-label="Lunar orbit altitude" type="number" min="15" max="1000" step="10" disabled={busy} value={inputs.lunar_orbit_altitude_km} onChange={e => handleInputChange('lunar_orbit_altitude_km', e.target.value)}/></label>
          <label className="as-field"><span>Lunar orbits before descent</span><input aria-label="Lunar orbits before descent" type="number" min="0" max="100" step="1" disabled={busy} value={inputs.lunar_wait_orbits ?? 1} onChange={e => handleInputChange('lunar_wait_orbits', e.target.value)}/></label>
        </div>
        <div className="as-vehicle-footer"><button type="button" className="as-btn-primary" disabled={busy} onClick={() => void executeSwarm('simulate', true)}><Play size={15}/> Calculate mission</button><button type="button" className="as-btn-ghost" onClick={() => document.getElementById('as-advanced-inputs')?.scrollIntoView({ behavior: 'smooth' })}>Launch, site and power settings <ArrowRight size={14}/></button></div>
      </section>

      <section ref={progressRef} className="as-live-panel" aria-label="Agent execution status">
        <div className="as-live-heading">
          <div><span className="as-badge-tag">LIVE AGENT STATUS</span><h2>{runState === 'idle' ? 'Ready to run the mission' : runState === 'running' ? 'Simulation in progress' : runState === 'error' ? 'Simulation stopped' : 'Simulation completed'}</h2><p role="status" aria-live="polite">{activity}</p></div>
          <strong>{completedCount} / {AGENT_METADATA.length} completed</strong>
        </div>
        <div className="as-live-dates"><span>Launch <time>{flightDate(flightTimes.departure)}</time></span><span>Landing <time>{flightDate(flightTimes.landing)}</time></span></div>
        <progress className="as-live-progress" max={AGENT_METADATA.length} value={completedCount} aria-label="Completed agents" />
        {error && <p className="as-live-error" role="alert">{error}</p>}
        <div className="as-live-agents">
          {AGENT_METADATA.map((meta, index) => {
            const Icon = meta.icon;
            const status = agentStatuses[index];
            return <button type="button" key={meta.name} className={`as-live-agent is-${status}`} onClick={() => { setSelectedAgentIndex(index); document.getElementById('as-detailed-results')?.scrollIntoView({ behavior: 'smooth' }); }}>
              <span className="as-live-agent-icon"><Icon size={19}/></span>
              <span className="as-live-agent-copy"><strong>{index + 1}. {meta.short}</strong><small>{status === 'running' ? 'Computing' : status === 'warning' ? 'Completed with a constraint alert' : status === 'completed' ? 'Completed · open results' : status === 'failed' ? 'Stopped at this agent' : 'Waiting to run'}</small></span>
              <span className={`as-live-agent-state is-${status}`}>{status === 'running' ? 'Running' : status === 'warning' ? 'Check' : status === 'completed' ? 'Done' : status === 'failed' ? 'Failed' : 'Queued'}</span>
            </button>;
          })}
        </div>
        {plan && <div className="as-run-results" role="status">
          <div><span>Supervisor verdict</span><strong>{plan.overall_status === 'provisional_screening_pass' ? 'Provisional screen passed' : 'Constraints need attention'}</strong></div>
          <div><span>Spacecraft Δv</span><strong>{plan.total_spacecraft_delta_v_km_s.toFixed(2)} / {plan.spacecraft_delta_v_capacity_km_s.toFixed(2)} km/s</strong></div>
          <div><span>Constraint alerts</span><strong>{resultChecks.length}</strong></div>
          <a href="#as-detailed-results" onClick={event => { event.preventDefault(); document.getElementById('as-detailed-results')?.scrollIntoView({ behavior: 'smooth' }); }}>See equations and all results <ArrowRight size={16}/></a>
        </div>}
        {runState === 'idle' && <button type="button" className="as-btn-primary as-run-inline" onClick={() => void executeSwarm('simulate', true)}><Play size={16}/> Run Simulation</button>}
      </section>

      <MissionFlightPath statuses={agentStatuses} activeIndex={activeStepIndex} stages={flightStages} departureUtc={flightDeparture} profile={{ parkingOrbits: Number(inputs.earth_parking_orbits ?? 1), stagingAltitude: Number(inputs.earth_staging_altitude_km ?? 0), stagingOrbits: Number(inputs.earth_staging_orbits ?? 1), lunarOrbits: Number(inputs.lunar_wait_orbits ?? 1) }} />
      <section className="as-mission-metrics" aria-label="Calculated mission results">
        <h2>Calculated mission results</h2>
        <div className="as-mission-metrics-grid">
          <div><span>Available / required delta-v</span><strong>{plan ? `${plan.spacecraft_delta_v_capacity_km_s.toFixed(2)} / ${plan.total_spacecraft_delta_v_km_s.toFixed(2)} km/s` : 'Pending'}</strong></div>
          <div><span>Fuel used / remaining</span><strong>{typeof flightOutput('propellant_used_kg') === 'number' ? `${Number(flightOutput('propellant_used_kg')).toFixed(0)} / ${Number(flightOutput('propellant_remaining_kg')).toFixed(0)} kg` : 'Pending'}</strong></div>
          <div><span>Earth orbit-raising burns</span><strong>{flightMetric(flightOutput('earth_orbit_raise_delta_v_km_s'), 'km/s')}</strong></div>
          <div><span>Higher Earth orbital speed</span><strong>{Number(flightOutput('earth_staging_altitude_km')) > 0 ? flightMetric(flightOutput('earth_staging_speed_km_s'), 'km/s') : 'Direct TLI'}</strong></div>
          <div><span>Higher Earth orbit period</span><strong>{Number(flightOutput('earth_staging_altitude_km')) > 0 ? flightMetric(flightOutput('earth_staging_period_hours'), 'hours') : 'Direct TLI'}</strong></div>
          <div><span>Earth orbital speed</span><strong>{flightMetric(flightStages.find(s => s.agent.startsWith('Launch'))?.outputs.circular_speed_km_s, 'km/s')}</strong></div>
          <div><span>Translunar injection speed</span><strong>{flightMetric(flightOutput('tli_speed_km_s'), 'km/s')}</strong></div>
          <div><span>Lunar orbital speed</span><strong>{flightMetric(flightStages.find(s => s.agent.startsWith('Lunar orbit'))?.outputs.circular_speed_km_s, 'km/s')}</strong></div>
          <div><span>Earth orbit period</span><strong>{flightMetric(flightStages.find(s => s.agent.startsWith('Launch'))?.outputs.orbit_period_hours, 'hours')}</strong></div>
          <div><span>Lunar orbit period</span><strong>{flightMetric(flightStages.find(s => s.agent.startsWith('Lunar orbit'))?.outputs.orbit_period_hours, 'hours')}</strong></div>
          <div><span>Launch-to-landing duration</span><strong>{flightMetric(flightOutput('mission_duration_hours'), 'hours')}</strong></div>
        </div>
        {Number(flightOutput('propellant_shortfall_kg')) > 0 && <p className="as-live-error" role="alert">Insufficient fuel: {Number(flightOutput('propellant_shortfall_kg')).toFixed(0)} kg shortfall at touchdown. This configuration fails the mission screen.</p>}
      </section>

      {/* ====================================================================
          2. MISSION PRESETS BAR
          ==================================================================== */}
      <section className="as-presets-bar" aria-label="Preset Mission Scenarios">
        <div className="as-presets-title">
          <Sparkles size={16} />
          <span>Quick Mission Profiles</span>
        </div>
        <div className="as-presets-scroll">
          {PRESET_SCENARIOS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="as-preset-card"
              onClick={() => {
                applyPreset(preset);
                pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <div className="as-preset-header">
                <strong>{preset.name}</strong>
                <span className="as-preset-badge">{preset.badge}</span>
              </div>
              <p>{preset.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ====================================================================
          3. CALCULATION CHAIN
          ==================================================================== */}
      <section className="as-graph-section" id="as-detailed-results">
        <div className="as-section-header">
          <div>
            <h2>Calculation chain</h2>
          </div>
          <div className="as-view-tabs">
            <button
              type="button"
              className={`as-view-tab ${selectedTab === 'graph' ? 'is-active' : ''}`}
              onClick={() => setSelectedTab('graph')}
            >
              <Layers size={14} /> Pipeline Graph
            </button>
            <button
              type="button"
              className={`as-view-tab ${selectedTab === 'telemetry' ? 'is-active' : ''}`}
              onClick={() => setSelectedTab('telemetry')}
            >
              <FileText size={14} /> Telemetry Ledger
            </button>
            <button
              type="button"
              className={`as-view-tab ${selectedTab === 'audit' ? 'is-active' : ''}`}
              onClick={() => setSelectedTab('audit')}
            >
              <ShieldCheck size={14} /> Audit Trail
            </button>
          </div>
        </div>

        {selectedTab === 'graph' && (
          <div className="as-pipeline-visual">
            <div className="as-nodes-row">
              {AGENT_METADATA.map((meta, idx) => {
                const IconComponent = meta.icon;
                const isSelected = selectedAgentIndex === idx;
                const isExecuting = activeStepIndex === idx;
                const stage = completedStages.find((st) => st.agent === meta.name) ?? plan?.stages.find((st) => st.agent === meta.name);
                const hasChecks = stage && stage.checks.length > 0;
                const nodeStatus = agentStatuses[idx];

                return (
                  <React.Fragment key={meta.name}>
                    <div
                      className={`as-node-card ${isSelected ? 'is-selected' : ''} ${isExecuting ? 'is-executing' : ''} ${hasChecks ? 'has-warning' : ''}`}
                      onClick={() => setSelectedAgentIndex(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAgentIndex(idx); } }}
                    >
                      <div className="as-node-head">
                        <div className="as-node-icon-wrap">
                          <IconComponent size={18} />
                        </div>
                        <span className="as-node-step">0{idx + 1}</span>
                      </div>
                      <h4 className="as-node-title">{meta.short}</h4>

                      <div className="as-node-footer">
                        {isExecuting ? (
                          <span className="as-node-status is-running">
                            <span className="as-pulse-dot" /> Computing...
                          </span>
                        ) : nodeStatus === 'pending' ? (
                          <span className="as-node-status is-pending">Queued</span>
                        ) : nodeStatus === 'failed' ? (
                          <span className="as-node-status is-warn"><ShieldAlert size={12} /> Stopped</span>
                        ) : hasChecks || nodeStatus === 'warning' ? (
                          <span className="as-node-status is-warn">
                            <ShieldAlert size={12} /> {stage?.checks.length ? `${stage.checks.length} constraint${stage.checks.length > 1 ? 's' : ''}` : 'Review alerts'}
                          </span>
                        ) : (
                          <span className="as-node-status is-ok">
                            <CheckCircle2 size={12} /> Completed
                          </span>
                        )}
                      </div>
                    </div>

                    {idx < AGENT_METADATA.length - 1 && (
                      <div className={`as-pipeline-arrow ${activeStepIndex === idx ? 'is-flowing' : ''}`}>
                        <ArrowRight size={18} />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Node Details Drawer */}
        {selectedStage && (
          <div className="as-inspector-drawer">
            <div className="as-drawer-header">
              <div className="as-drawer-title">
                <span className="as-drawer-eyebrow">AGENT {selectedAgentIndex + 1} INSPECTOR</span>
                <h3>{selectedStage.agent}</h3>
              </div>
              <div className="as-drawer-status">
                {selectedStage.checks.length > 0 ? (
                  <span className="as-badge-warning">
                    <ShieldAlert size={14} /> Attention Required
                  </span>
                ) : (
                  <span className="as-badge-success">
                    <CheckCircle2 size={14} /> Screening Threshold Satisfied
                  </span>
                )}
              </div>
            </div>

            <details className="as-formula-banner">
              <summary>Equations</summary>
              <code>{selectedStage.equation}</code>
            </details>

            <div className="as-drawer-grid">
              <div className="as-drawer-col">
                <h4>Computed Outputs & Telemetry</h4>
                <div className="as-kv-grid">
                  {Object.entries(selectedStage.outputs).map(([k, v]) => (
                    <div key={k} className="as-kv-card">
                      <span className="as-kv-key">{formatLabel(k)}</span>
                      <strong className="as-kv-val">{formatValue(v)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="as-drawer-col">
                <h4>Stage Inputs & Parameters</h4>
                <div className="as-kv-grid">
                  {Object.entries(selectedStage.inputs).map(([k, v]) => (
                    <div key={k} className="as-kv-card is-muted">
                      <span className="as-kv-key">{formatLabel(k)}</span>
                      <strong className="as-kv-val">{formatValue(v)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {selectedStage.checks.length > 0 && (
              <div className="as-checks-alert">
                <strong>Screening Constraints Triggered:</strong>
                <ul>
                  {selectedStage.checks.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            <details className="as-limits-note">
              <summary>Assumptions and limitations</summary>
              <ul>
                {selectedStage.limitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </section>

      {/* ====================================================================
          4. INTERACTIVE VISUAL GRAPHICS (DELTA-V, DISPERSION, SURFACE POWER)
          ==================================================================== */}
      <SwarmGraphics plan={plan} inputs={inputs} />

      <SwarmTimeline plan={plan} />

      <section className="as-window-section" aria-label="Landing sunlight window search">
        <div className="as-card">
          <div className="as-card-header">
            <div>
              <span className="as-badge-tag">SURFACE WINDOW AGENT</span>
              <h3>Find launch and landing date candidates</h3>
              <p>Find sunlit landing dates and estimated departures.</p>
            </div>
          </div>
          <div className="as-window-form">
            <label>First landing date (UTC)<input type="date" value={landingStart} onChange={e => setLandingStart(e.target.value)} /></label>
            <label>Last landing date (UTC)<input type="date" value={landingEnd} onChange={e => setLandingEnd(e.target.value)} /></label>
            <label>Continuous sunlight (days)<input type="number" min="1" max="30" step="0.5" value={minSunDays} onChange={e => setMinSunDays(Number(e.target.value))} /></label>
            <button type="button" className="as-btn-primary" disabled={windowBusy || !landingStart || !landingEnd} onClick={() => void searchWindows()}>
              {windowBusy ? <RefreshCw size={15} className="as-spin" /> : <Sun size={15} />}
              <span>{windowBusy ? 'Screening dates…' : 'Run window agent'}</span>
            </button>
          </div>
          {windowError && <p className="as-window-error" role="alert">{windowError}</p>}
          {windowResult && (
            <div className="as-window-results">
              <p className="as-window-provenance">{windowResult.astronomy_source} · hourly {windowResult.candidates[0]?.terrain_verified ? 'terrain-skyline' : 'spherical-horizon'} samples · {windowResult.required_sunlight_days} day minimum · {windowResult.candidates.length} qualifying intervals · {(windowResult.total_screened_sunlight_hours / 24).toFixed(1)} days of sampled sunlight over the full range · Earth elevation {windowResult.minimum_earth_elevation_deg.toFixed(1)}°–{windowResult.maximum_earth_elevation_deg.toFixed(1)}°</p>
              {windowResult.candidates.length ? (
                <div className="as-window-candidates">
                  {windowResult.candidates.map((candidate, index) => (
                    <article key={candidate.estimated_landing_utc} className="as-window-candidate">
                      <strong>Sunlight interval {index + 1}{candidate.estimated_landing_utc === windowResult.recommended_landing_utc ? ' · recommended screen' : ''}</strong>
                      <span>Interval: {new Date(candidate.sunlight_interval_start_utc).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })}–{new Date(candidate.sunlight_interval_end_utc).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</span>
                      <span>Screened landing: {new Date(candidate.estimated_landing_utc).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC · {candidate.continuous_sunlight_days_screened.toFixed(1)} days sunlight remain</span>
                      <span>Back-calculated departure: {new Date(candidate.estimated_launch_utc).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC · trajectory unvalidated</span>
                      <small>Earth above horizon: {candidate.earth_contact_hours_during_required_stay.toFixed(0)} h during the requested stay; {candidate.earth_contact_hours_in_sunlight_interval.toFixed(0)} h in this sunlight interval · lowest Sun: {candidate.minimum_sun_elevation_deg.toFixed(2)}° · terrain {candidate.terrain_verified ? 'screened' : 'unverified'} · eclipses {candidate.eclipse_screened ? 'screened' : 'unverified'}</small>
                    </article>
                  ))}
                </div>
              ) : <p>No sampled sunlight interval meets this requirement at the selected site in this range. Check the terrain skyline, or choose another site.</p>}
              <ul className="as-window-limitations">{windowResult.limitations.map(item => <li key={item}>{item}</li>)}</ul>
              {windowResult.best_plan?.overall_status === 'screening_failed' && (
                <p className="as-window-error" role="status">The selected vehicle/power configuration fails the mission screen: {windowResult.best_plan.stages.flatMap(stage => stage.checks).join(' ')}</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ====================================================================
          5. NATURAL LANGUAGE REQUIREMENTS INTERPRETER & PARAMETER CONTROLS
          ==================================================================== */}
      <section className="as-config-section" id="as-advanced-inputs">
        <div className="as-config-grid">
          {/* Natural Language Prompt Assistant */}
          <div className="as-card as-query-card">
            <div className="as-card-header">
              <div>
                <h3>Natural Language Mission Interpreter</h3>
                <p>Describe your mission to fill the parameters.</p>
              </div>
              <span className="as-badge-tag">Groq · Llama 3</span>
            </div>

            <div className="as-prompt-chips">
              {SUGGESTED_QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="as-chip"
                  onClick={() => setQuery(q)}
                >
                  {q}
                </button>
              ))}
            </div>

            <label htmlFor="as-mission-query" className="as-field-label">
              Mission Requirements Statement
            </label>
            <textarea
              id="as-mission-query"
              rows={4}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Plan a crewed lunar mission with a 6500 kg spacecraft to Shackleton Crater with 450s Isp..."
              className="as-textarea"
            />

            {config?.challenge_required && (
              <ChatVerification
                siteKey={config.site_key}
                attempt={attempt}
                onToken={setToken}
              />
            )}

            <div className="as-query-footer">
              <button
                type="button"
                className="as-btn-primary"
                disabled={busy || (config?.challenge_required && !token)}
                onClick={() => void executeSwarm('interpret', true)}
              >
                {busy ? <RefreshCw size={15} className="as-spin" /> : <Bot size={15} />}
                <span>Interpret & Run Swarm</span>
              </button>
              <span className="as-help-text">
                Groq extracts parameters; deterministic agents execute physical equations.
              </span>
            </div>

            {interpretation && (
              <div className="as-interpretation-box">
                <h4>Extracted Variables from Language</h4>
                <div className="as-extracted-chips">
                  {Object.entries(interpretation.extracted).map(([k, v]) => (
                    <span key={k} className="as-extracted-chip">
                      <strong>{formatLabel(k)}:</strong> {formatValue(v)}
                    </span>
                  ))}
                </div>
                {interpretation.unresolved.length > 0 && (
                  <p className="as-unresolved-note">
                    Unresolved items: {interpretation.unresolved.join('; ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Deterministic Parameter Fine-Tuning */}
          <div className="as-card as-params-card">
            <div className="as-card-header">
              <div>
                <h3>Advanced mission settings</h3>

              </div>
              <button
                type="button"
                className="as-btn-ghost"
                onClick={() => setInputs(INITIAL_INPUTS)}
                title="Reset to example defaults"
              >
                <RotateCcw size={14} /> Reset Defaults
              </button>
            </div>

            <div className="as-param-tabs">
              <button
                type="button"
                className={`as-param-tab ${paramSection === 'launch' ? 'is-active' : ''}`}
                onClick={() => setParamSection('launch')}
              >
                <Rocket size={14} /> Launch & Ascent
              </button>
              <button
                type="button"
                className={`as-param-tab ${paramSection === 'spacecraft' ? 'is-active' : ''}`}
                onClick={() => setParamSection('spacecraft')}
              >
                <Orbit size={14} /> Spacecraft & Orbit
              </button>
              <button
                type="button"
                className={`as-param-tab ${paramSection === 'surface' ? 'is-active' : ''}`}
                onClick={() => setParamSection('surface')}
              >
                <MapPin size={14} /> Landing & Power
              </button>
            </div>

            <div className="as-param-fields">
              {paramSection === 'launch' && (
                <div className="as-fields-grid">
                  <label className="as-field">
                    <span>Trans-lunar injection by</span>
                    <select value={String(inputs.tli_by_upper_stage ?? 'true')} onChange={(e) => handleInputChange('tli_by_upper_stage', e.target.value)}>
                      <option value="true">Rocket upper stage (as real missions do)</option>
                      <option value="false">The spacecraft itself</option>
                    </select>
                  </label>
                  <label className="as-field">
                    <span>Upper stage, fuelled (kg)</span>
                    <input type="number" step="1000" value={inputs.upper_stage_wet_mass_kg ?? ''} onChange={(e) => handleInputChange('upper_stage_wet_mass_kg', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Upper stage, empty (kg)</span>
                    <input type="number" step="100" value={inputs.upper_stage_dry_mass_kg ?? ''} onChange={(e) => handleInputChange('upper_stage_dry_mass_kg', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Upper stage Isp (s)</span>
                    <input type="number" step="5" value={inputs.upper_stage_isp_s ?? ''} onChange={(e) => handleInputChange('upper_stage_isp_s', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Landing site</span>
                    <select value={String(inputs.site_mode ?? 'auto')} onChange={(e) => handleInputChange('site_mode', e.target.value)}>
                      <option value="auto">Let the site agent choose (ranks candidates)</option>
                      <option value="fixed">Use my target coordinate</option>
                    </select>
                  </label>
                  <label className="as-field">
                    <span>First landing date (UTC)</span>
                    <input type="date" value={String(inputs.landing_start_utc ?? '').slice(0, 10)}
                      onChange={(e) => handleInputChange('landing_start_utc', e.target.value ? `${e.target.value}T00:00:00Z` : '')} />
                  </label>
                  <label className="as-field">
                    <span>Last landing date (UTC)</span>
                    <input type="date" value={String(inputs.landing_end_utc ?? '').slice(0, 10)}
                      onChange={(e) => handleInputChange('landing_end_utc', e.target.value ? `${e.target.value}T23:00:00Z` : '')} />
                  </label>
                  <label className="as-field">
                    <span>Continuous sunlight needed (days)</span>
                    <input type="number" min="1" max="30" step="0.5" value={inputs.min_sunlight_days ?? 8}
                      onChange={(e) => handleInputChange('min_sunlight_days', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Departure UTC (replaced by the landing-window agent when dates are set)</span>
                    <input
                      type="text"
                      value={inputs.departure_utc}
                      onChange={(e) => handleInputChange('departure_utc', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Launch Latitude (° N)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={inputs.launch_latitude_deg}
                      onChange={(e) => handleInputChange('launch_latitude_deg', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Parking Altitude (km)</span>
                    <input
                      type="number"
                      step="10"
                      value={inputs.parking_altitude_km}
                      onChange={(e) => handleInputChange('parking_altitude_km', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Launch Wet Mass (kg)</span>
                    <input
                      type="number"
                      step="5000"
                      value={inputs.launch_wet_mass_kg}
                      onChange={(e) => handleInputChange('launch_wet_mass_kg', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Launch Dry Mass (kg)</span>
                    <input
                      type="number"
                      step="1000"
                      value={inputs.launch_dry_mass_kg}
                      onChange={(e) => handleInputChange('launch_dry_mass_kg', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Ascent Engine Isp (s)</span>
                    <input
                      type="number"
                      step="5"
                      value={inputs.launch_isp_s}
                      onChange={(e) => handleInputChange('launch_isp_s', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Liftoff Thrust (N)</span>
                    <input
                      type="number"
                      step="100000"
                      value={inputs.launch_thrust_n}
                      onChange={(e) => handleInputChange('launch_thrust_n', e.target.value)}
                    />
                  </label>
                </div>
              )}

              {paramSection === 'spacecraft' && (
                <div className="as-fields-grid">
                  <label className="as-field">
                    <span>Average descent throttle (0.1–1)</span>
                    <input type="number" step="0.05" min="0.1" max="1" value={inputs.descent_throttle ?? ''} onChange={(e) => handleInputChange('descent_throttle', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Hover / divert reserve (s)</span>
                    <input type="number" step="10" min="0" value={inputs.hover_reserve_s ?? ''} onChange={(e) => handleInputChange('hover_reserve_s', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Δv reserve required (%)</span>
                    <input type="number" step="1" min="0" value={inputs.dv_margin_pct ?? ''} onChange={(e) => handleInputChange('dv_margin_pct', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Spacecraft Wet Mass (kg)</span>
                    <input
                      type="number"
                      step="100"
                      value={inputs.spacecraft_wet_mass_kg}
                      onChange={(e) => handleInputChange('spacecraft_wet_mass_kg', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Spacecraft Dry Mass (kg)</span>
                    <input
                      type="number"
                      step="50"
                      value={inputs.spacecraft_dry_mass_kg}
                      onChange={(e) => handleInputChange('spacecraft_dry_mass_kg', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Propulsion Engine Isp (s)</span>
                    <input
                      type="number"
                      step="10"
                      value={inputs.spacecraft_isp_s}
                      onChange={(e) => handleInputChange('spacecraft_isp_s', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Lunar Parking Altitude (km)</span>
                    <input
                      type="number"
                      step="10"
                      value={inputs.lunar_orbit_altitude_km}
                      onChange={(e) => handleInputChange('lunar_orbit_altitude_km', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Landing Engine Thrust (N)</span>
                    <input
                      type="number"
                      step="1000"
                      value={inputs.landing_thrust_n}
                      onChange={(e) => handleInputChange('landing_thrust_n', e.target.value)}
                    />
                  </label>
                </div>
              )}

              {paramSection === 'surface' && (
                <div className="as-fields-grid">
                  <label className="as-field">
                    <span>Surface stay to check (days)</span>
                    <input type="number" step="1" min="1" max="60" value={inputs.stay_days ?? ''} onChange={(e) => handleInputChange('stay_days', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Night survival heater power (W)</span>
                    <input type="number" step="10" min="0" value={inputs.survival_power_w ?? ''} onChange={(e) => handleInputChange('survival_power_w', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Radio transmit power (W)</span>
                    <input type="number" step="1" min="1" value={inputs.tx_power_w ?? ''} onChange={(e) => handleInputChange('tx_power_w', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Antenna gain (dBi)</span>
                    <input type="number" step="1" min="0" value={inputs.antenna_gain_dbi ?? ''} onChange={(e) => handleInputChange('antenna_gain_dbi', e.target.value)} />
                  </label>
                  <label className="as-field">
                    <span>Target Site Preset</span>
                    <select
                      onChange={(e) => {
                        const s = PRESET_SITES.find((site) => site.name === e.target.value);
                        if (s) {
                          handleInputChange('target_latitude_deg', s.lat);
                          handleInputChange('target_longitude_deg', s.lon);
                        }
                      }}
                    >
                      <option value="">Choose Site...</option>
                      {PRESET_SITES.map((site) => (
                        <option key={site.name} value={site.name}>
                          {site.name} ({site.lat}°, {site.lon}°)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="as-field">
                    <span>Target Latitude (° N)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={inputs.target_latitude_deg}
                      onChange={(e) => handleInputChange('target_latitude_deg', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Target Longitude (° E)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={inputs.target_longitude_deg}
                      onChange={(e) => handleInputChange('target_longitude_deg', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Landing Zone Radius (m)</span>
                    <input
                      type="number"
                      step="10"
                      value={inputs.landing_radius_m}
                      onChange={(e) => handleInputChange('landing_radius_m', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Dispersion Sigma (m)</span>
                    <input
                      type="number"
                      step="5"
                      value={inputs.landing_sigma_m}
                      onChange={(e) => handleInputChange('landing_sigma_m', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Payload Power Load (W)</span>
                    <input
                      type="number"
                      step="50"
                      value={inputs.payload_power_w}
                      onChange={(e) => handleInputChange('payload_power_w', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Battery Capacity (Wh)</span>
                    <input
                      type="number"
                      step="1000"
                      value={inputs.battery_capacity_wh}
                      onChange={(e) => handleInputChange('battery_capacity_wh', e.target.value)}
                    />
                  </label>
                  <label className="as-field">
                    <span>Solar Array Area (m²)</span>
                    <input
                      type="number"
                      step="1"
                      value={inputs.array_area_m2}
                      onChange={(e) => handleInputChange('array_area_m2', e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="as-params-footer">
              <button
                type="button"
                className="as-btn-primary"
                disabled={busy}
                onClick={() => void executeSwarm('simulate', true)}
              >
                {busy ? <RefreshCw size={15} className="as-spin" /> : <Play size={15} />}
                <span>Re-run Physical Equations</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Error Banner */}
      {error && (
        <div className="as-error-banner" role="alert">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ====================================================================
          6. SUPERVISOR REVIEW & AUDIT TRAIL
          ==================================================================== */}
      <SwarmAudit plan={plan} />
    </div>
  );
}

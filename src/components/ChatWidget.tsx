import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, Bot, Calculator, CalendarSearch, Check, Clock, GitCompare, Loader2, MapPin,
  Moon, RotateCcw, Satellite, Send, Sparkles, X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { findScienceWindows } from '../lib/science';
import type { ScienceWindow, WindowCriteria } from '../lib/science';
import type { ForecastResult, ForecastSample } from '../lib/lunar';
import { computeSimulatedForecast } from '../lib/lunarPhysics';
import { formatZonedDateTime } from '../lib/time';
import { fetchForecastChunked } from '../lib/forecastChunks';
import { missionFollowUps, rankingFollowUps, starterQuestions, summaryFollowUps, windowFollowUps, type Starter } from '../lib/chatSuggestions';
import { adviseWindows, type WindowAdvice } from '../lib/windowAdvice';
import '../chat.css';
import { ChatVerification } from './ChatVerification';
import { followupOptions, summarizeSearch } from '../lib/chatFollowups';
import { localChatNavigation, retryDelay, retryLabel, historyForSend } from '../lib/chatRecovery';

import type { OperationsRequest } from '../lib/operations';
import { PAGES } from '../lib/navigation';
import type { PageId, ToolId, ToolInputs } from '../lib/navigation';
export type { PageId } from '../lib/navigation';

export type ChatForecast = {
  latitude: number; longitude: number;
  start_datetime_utc: string; end_datetime_utc: string;
  step_hours: number; display_timezone: string;
};

export type ChatAction = {
  operations?: OperationsRequest | null;
  page: PageId;
  compare_focus?: 'earth_visibility' | null;
  tool?: ToolId | null;
  inputs?: ToolInputs | null;
  forecast?: ChatForecast | null;
  criteria?: WindowCriteria | null;
  mission_windows?: MissionWindowSearch | null;
  site_ranking?: { start_utc?: string | null; end_utc?: string | null; display_timezone?: string; min_sunlight_days?: number; priority?: 'overall' | 'water'; criteria?: WindowCriteria; max_slope_deg?: number | null; min_safe_fraction?: number | null; max_ice_distance_km?: number | null } | null;
  compare_sites?: { sites: { name: string; latitude: number; longitude: number }[]; mode?: 'replace' | 'add' } | null;
};

export type MissionWindowSearch = {
  latitude: number; longitude: number;
  landing_start_utc: string; landing_end_utc: string; min_sunlight_days: number; min_earth_hours?: number;
};
type RankedSite = {
  name: string; latitude: number; longitude: number; slope_deg: number | null; safe_footprint_fraction: number | null;
  sunlit_pct: number; earth_visible_pct: number; nearest_ice_crater: string; ice_crater_distance_km: number;
  landing_score: number; water_score: number; overall_score: number;
  continuous_sunlight_days?: number | null; sunlight_start_utc?: string | null; sunlight_end_utc?: string | null;
};
type MissionCandidate = {
  sunlight_interval_start_utc: string; sunlight_interval_end_utc: string;
  estimated_launch_utc: string; estimated_landing_utc: string; continuous_sunlight_days_screened: number;
  minimum_sun_elevation_deg: number; earth_contact_hours_during_required_stay: number; terrain_verified: boolean;
  continuous_earth_hours_screened?: number;
};

/** Results the widget computes itself for an action, so answers appear in the chat. */
type Preview =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ranking'; sites: RankedSite[]; bestLanding: string | null; bestWater: string | null; bestOverall: string | null; method: string[]; source: string }
  | { status: 'mission'; candidates: MissionCandidate[]; limitations: string[]; source: string; checks: string[]; totalSunHours: number; minEarthElevation: number; maxEarthElevation: number; requiredSunDays: number; requiredEarthHours: number; sunlitPct: number | null; maxHorizon: number | null; site: string }
  | { status: 'windows'; windows: ScienceWindow[]; totalHours: number; periodHours: number; source: string; advice?: WindowAdvice }
  | { status: 'summary'; sunlitPct: number; earthPct: number; minC: number; maxC: number; peakIrr: number; source: string };

type Turn = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  time: number;
  action?: ChatAction | null;
  options?: string[];
  applied?: boolean;
  preview?: Preview;
};

const PAGE_LABEL = Object.fromEntries(PAGES.map(page => [page.id, page.label]));

const STARTER_ICONS: Record<Starter['kind'], LucideIcon> = { site: Satellite, windows: CalendarSearch, mission: Bot, compare: GitCompare, method: Calculator };

/** Follow-up questions derived from a computed result. */
function resultFollowUps(preview: Preview, action: ChatAction, siteName: string): string[] {
  const site = action.forecast ? coordText(action.forecast.latitude, action.forecast.longitude) : siteName;
  const named = /^location|^target|^assistant/i.test(siteName) ? site : siteName;
  if (preview.status === 'windows' && action.criteria && action.forecast) {
    return windowFollowUps(preview.windows, named, action.forecast.step_hours, action.criteria);
  }
  if (preview.status === 'mission') return missionFollowUps(preview.candidates, named);
  if (preview.status === 'ranking') return rankingFollowUps(preview.sites);
  if (preview.status === 'summary') return summaryFollowUps(named);
  return [];
}


import { API } from '../lib/apiEndpoints';

const coordText = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;
const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const hoursText = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.round(h)} h`);

function criteriaChips(c: WindowCriteria): string[] {
  const chips: string[] = [];
  if (c.minTemperature > -273 || c.maxTemperature < 200) chips.push(`Temperature ${c.minTemperature} to ${c.maxTemperature} °C`);
  if (c.minIrradiance > 0 || (c.maxIrradiance !== undefined && c.maxIrradiance < 2000))
    chips.push(c.maxIrradiance !== undefined && c.maxIrradiance < 2000 ? `Sunlight ${c.minIrradiance}–${c.maxIrradiance} W/m²` : `Sunlight ≥ ${c.minIrradiance} W/m²`);
  if (c.requireSun) chips.push('Sun must be up');
  if (c.requireEarth) chips.push(c.minEarthElevation > 0 ? `Earth ≥ ${c.minEarthElevation}° high` : 'Earth in view');
  if ((c.minEarthHours ?? 0) > 0) chips.push(`Earth in view for at least ${c.minEarthHours} continuous h within the window`);
  if (c.minHours > 0) chips.push(`At least ${c.minHours} h long`);
  return chips.length ? chips : ['No conditions'];
}

/** Forecast from the server, falling back to the labelled in-browser model. */
async function loadForecast(f: ChatForecast, signal: AbortSignal): Promise<{ samples: ForecastSample[]; source: string; fallbackChunks: number }> {
  // Long periods are split into server-sized chunks and stitched together.
  const result = await fetchForecastChunked(f, signal);
  const parts = result.chunkCount > 1 ? ` · ${result.samples.length.toLocaleString()} samples in ${result.chunkCount} parts` : '';
  const source = result.fallbackChunks === result.chunkCount
    ? 'In-browser approximate model (server offline; mean Earth position only; contact and eclipse windows unavailable)'
    : `${result.sources?.astronomy ?? 'Analysis server'} geometry · ${result.model_name ?? 'thermal model'}${parts}`;
  return { samples: result.samples, source, fallbackChunks: result.fallbackChunks };
}

/** Runs the agent-swarm date search; every date shown comes from this call, never from the language model. */
async function computeMissionPreview(m: MissionWindowSearch, signal: AbortSignal): Promise<Preview> {
  const response = await fetch(`${API}/api/mission/windows`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({
      inputs: { departure_utc: m.landing_start_utc, target_latitude_deg: m.latitude, target_longitude_deg: m.longitude },
      landing_start_utc: m.landing_start_utc, landing_end_utc: m.landing_end_utc,
      min_continuous_sunlight_days: m.min_sunlight_days, min_continuous_earth_hours: m.min_earth_hours ?? 0
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Mission search failed (${response.status})`);
  return { status: 'mission', candidates: data.candidates ?? [], limitations: data.limitations ?? [], source: data.astronomy_source ?? '', checks: data.best_plan?.stages?.flatMap((stage: { checks?: string[] }) => stage.checks ?? []) ?? [], totalSunHours: data.total_screened_sunlight_hours ?? 0, minEarthElevation: data.minimum_earth_elevation_deg ?? 0, maxEarthElevation: data.maximum_earth_elevation_deg ?? 0, requiredSunDays: data.required_sunlight_days ?? m.min_sunlight_days, requiredEarthHours: data.required_earth_hours ?? m.min_earth_hours ?? 0,
    sunlitPct: data.site_sunlit_pct ?? null, maxHorizon: data.max_horizon_deg ?? null, site: coordText(m.latitude, m.longitude) };
}

async function computeRankingPreview(r: NonNullable<ChatAction['site_ranking']>, signal: AbortSignal): Promise<Preview> {
  const body: Record<string, unknown> = {};
  if (r.start_utc) body.start_utc = r.start_utc;
  if (r.end_utc) body.end_utc = r.end_utc;
  if (r.min_sunlight_days) body.min_sunlight_days = r.min_sunlight_days;
  if (r.priority) body.priority = r.priority;
  if (r.criteria) body.criteria = r.criteria;
  for (const key of ['max_slope_deg', 'min_safe_fraction', 'max_ice_distance_km'] as const) {
    if (r[key] != null) body[key] = r[key];
  }
  const response = await fetch(`${API}/api/mission/site-ranking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Site ranking failed (${response.status})`);
  return { status: 'ranking', sites: data.sites ?? [], bestLanding: data.best_landing, bestWater: data.best_water, bestOverall: data.best_overall, method: data.method ?? [], source: `${data.terrain_source} · ${data.astronomy_source}` };
}

async function computePreview(action: ChatAction, signal: AbortSignal): Promise<Preview> {
  if (action.site_ranking) return computeRankingPreview(action.site_ranking, signal);
  if (action.mission_windows) return computeMissionPreview(action.mission_windows, signal);
  const f = action.forecast!;
  const { samples, source, fallbackChunks } = await loadForecast(f, signal);
  if (action.criteria && (action.criteria.requireEarth || action.criteria.requireSun || (action.criteria.minEarthHours ?? 0) > 0) && fallbackChunks > 0) {
    throw new Error('The analysis server is required to screen sunlight or Earth contact. The browser fallback cannot verify lunar libration or solar eclipses.');
  }
  const periodHours = (Date.parse(f.end_datetime_utc) - Date.parse(f.start_datetime_utc)) / 3_600_000;
  if (action.criteria) {
    const windows = findScienceWindows(samples, action.criteria, f.step_hours);
    // Nothing found: explain which condition blocks it and test relaxed conditions on the same data.
    const advice = windows.length ? undefined : adviseWindows(samples, action.criteria, f.step_hours);
    return { status: 'windows', windows, totalHours: windows.reduce((a, w) => a + w.hours, 0), periodHours, source, advice };
  }
  const n = samples.length || 1;
  const temps = samples.map((s) => s.temperature_c);
  return {
    status: 'summary',
    sunlitPct: (samples.filter((s) => s.illuminated).length / n) * 100,
    earthPct: (samples.filter((s) => s.earth_visible).length / n) * 100,
    minC: Math.min(...temps),
    maxC: Math.max(...temps),
    peakIrr: Math.max(...samples.map((s) => s.horizontal_irradiance_w_m2)),
    source
  };
}

export type ChatWidgetProps = {
  operationsContext?: OperationsRequest;
  context: ChatForecast;
  page: PageId;
  siteName: string;
  onApply: (action: ChatAction) => void;
};

export function ChatWidget({ context, page, siteName, onApply, operationsContext }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  useEffect(() => {
    const openFromMissionPage = (event: Event) => {
      setOpen(true);
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (message) setInput(message);
    };
    window.addEventListener('selene:open-chat', openFromMissionPage);
    return () => window.removeEventListener('selene:open-chat', openFromMissionPage);
  }, []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [verification, setVerification] = useState<{ challenge_required: boolean; site_key: string }>();
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    setVerification(undefined);
    fetch(`${API}/api/chat/config`, { signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to load assistant settings.');
      if (!abort.signal.aborted) { setVerification(data); setError(''); }
    }).catch(error => { if (!abort.signal.aborted) setError((error as Error).message); });
    return () => abort.abort();
  }, [open]);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const previewAborts = useRef(new Set<AbortController>());

  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => { if (open) { inputRef.current?.focus(); setUnread(false); } }, [open]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [turns, busy, open]);
  useEffect(() => () => previewAborts.current.forEach((c) => c.abort()), []);

  // Tick once a second while a rate-limit cooldown is running.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= cooldownUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  // Auto-grow the message box up to about five lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input, open]);

  const updateTurn = (id: number, patch: Partial<Turn>) =>
    setTurns((previous) => previous.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const siteRef = useRef(siteName);
  siteRef.current = siteName;
  const runPreview = useCallback((id: number, action: ChatAction) => {
    if (!action.forecast && !action.mission_windows && !action.site_ranking) return;
    const controller = new AbortController();
    previewAborts.current.add(controller);
    updateTurn(id, { preview: { status: 'loading' } });
    computePreview(action, controller.signal)
      .then((preview) => {
        // Follow-ups come from the computed result, not from the language model.
        const derived = resultFollowUps(preview, action, siteRef.current);
        updateTurn(id, derived.length ? { preview, options: derived } : { preview });
      })
      .catch((e) => { if (!controller.signal.aborted) updateTurn(id, { preview: { status: 'error', message: (e as Error).message || 'Could not compute results.' } }); })
      .finally(() => previewAborts.current.delete(controller));
  }, []);

  /** Run a suggested search right here in the chat (computed locally; no AI call). */
  const tryAction = (action: ChatAction, label: string) => {
    const turn: Turn = { id: nextId.current++, role: 'assistant', content: `Trying: ${label}.`, time: Date.now(), action, options: [] };
    setTurns((previous) => [...previous, turn]);
    runPreview(turn.id, action);
  };

  async function send(text: string, retry = false) {
    const content = text.trim();
    if (!content || busy) return;
    const localAction = localChatNavigation(content, page);
    if (localAction) {
      const userTurn: Turn = { id: nextId.current++, role: 'user', content, time: Date.now() };
      const reply: Turn = {
        id: nextId.current++, role: 'assistant', time: Date.now(),
        content: localAction.compare_focus
          ? 'Showing the current sites ordered by computed Earth visibility for the existing comparison period.'
          : `Opened ${PAGE_LABEL[localAction.page]}.`,
        action: localAction, applied: true, options: []
      };
      onApply(localAction);
      setTurns(previous => [...historyForSend(previous, userTurn, retry), reply]);
      setInput('');
      setError('');
      return;
    }
    if (cooldown > 0) return;
    if (!verification || (verification.challenge_required && !verificationToken)) {
      setError('Please wait for assistant verification to finish.'); return;
    }
    const userTurn: Turn = { id: nextId.current++, role: 'user', content, time: Date.now() };
    const history = historyForSend(turns, userTurn, retry);
    const activeSearchTurn = [...turns].reverse().find(turn => turn.role === 'assistant'
      && (turn.action?.mission_windows || turn.action?.criteria || turn.action?.site_ranking || turn.action?.forecast || turn.action?.compare_sites));
    const activeSearch = activeSearchTurn?.action;
    setTurns(history);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(verification.challenge_required ? { 'X-Turnstile-Token': verificationToken } : {}) },
        body: JSON.stringify({
          context,
          page,
          site_name: siteName.slice(0, 80),
          operations_context: operationsContext ?? null,
          active_search: activeSearch ?? null,
          search_outcome: summarizeSearch(activeSearchTurn?.preview),
          messages: history.slice(-16).map(({ role, content: c }) => ({ role, content: c }))
        }),
        signal: AbortSignal.timeout(40000)
      });
      const data = await response.json().catch(() => ({}));
      const wait = retryDelay(response.status, response.headers);
      if (wait !== null) {
        setCooldownUntil(Date.now() + wait * 1000);
        setNow(Date.now());
        throw new Error(typeof data.detail === 'string' ? data.detail : `Too many messages. Please wait ${wait} seconds.`);
      }
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Unable to send this request.');
      const reply: Turn = {
        id: nextId.current++,
        role: 'assistant',
        content: data.reply,
        time: Date.now(),
        action: data.action ?? null,
        options: Array.isArray(data.options) ? data.options.filter((option: unknown) => typeof option === 'string').slice(0, 4) : []
      };
      // Navigation-only actions should feel like navigation, not a proposal.
      // Searches and configured forecasts still wait for explicit review.
      if (reply.action && !reply.action.forecast && !reply.action.criteria && !reply.action.operations) {
        onApply(reply.action);
        reply.applied = true;
      }
      setTurns((previous) => [...previous, reply]);
      if (reply.action?.forecast || reply.action?.mission_windows || reply.action?.site_ranking) runPreview(reply.id, reply.action);
      if (!openRef.current) setUnread(true);
    } catch (e) {
      setError(e instanceof Error ? (e.name === 'TimeoutError' ? 'The assistant took too long to answer. Please try again.' : e.message) : 'Assistant unavailable.');
    } finally {
      setBusy(false);
      if (verification.challenge_required) { setVerificationToken(''); setVerificationAttempt(previous => previous + 1); }
    }
  }

  const apply = (turn: Turn) => {
    if (!turn.action) return;
    onApply(turn.action);
    updateTurn(turn.id, { applied: true });
  };

  const reset = () => {
    previewAborts.current.forEach((c) => c.abort());
    previewAborts.current.clear();
    setTurns([]);
    setError('');
    setInput('');
    inputRef.current?.focus();
  };

  const latestTurn = turns[turns.length - 1];
  const lastAssistant = latestTurn?.role === 'assistant' ? latestTurn : undefined;
  const retryTurn = error && latestTurn?.role === 'user' ? latestTurn : undefined;
  const retryNeedsAI = retryTurn ? !localChatNavigation(retryTurn.content, page) : true;
  const suggestedReplies = followupOptions(lastAssistant?.options, lastAssistant?.preview);
  const launcherState = cooldown > 0 ? 'is-cooldown' : busy ? 'is-busy' : open ? 'is-open' : '';

  return createPortal(
    <div className="sc-root">
      {open && (
        <section
          className="sc-panel"
          role="dialog"
          aria-label="Selene assistant"
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        >
          <header className="sc-header">
            <div className="sc-avatar" aria-hidden="true"><Moon size={22} /></div>
            <div className="sc-title">
              <strong>Selene Assistant</strong>
            </div>
            <button type="button" className="sc-icon-btn" onClick={reset} disabled={!turns.length || busy} aria-label="Start a new conversation" title="New conversation">
              <RotateCcw size={19} />
            </button>
            <button type="button" className="sc-icon-btn" onClick={() => setOpen(false)} aria-label="Close assistant" title="Close">
              <X size={21} />
            </button>
          </header>

          <div className="sc-context" title="The assistant uses this site and period unless you give others">
            <MapPin size={16} aria-hidden="true" />
            <span>{siteName || 'Selected site'} · {coordText(context.latitude, context.longitude)}</span>
            <span className="sc-context-page">On {PAGE_LABEL[page]}</span>
          </div>

          <div className="sc-log" role="log" aria-live="polite">
            {!turns.length && (
              <div className="sc-welcome">
                <div className="sc-welcome-mark" aria-hidden="true"><Sparkles size={26} /></div>
                <h2>What would you like to find out?</h2>
                <p>I can open every feature, fill mission forms, set up forecasts and find science windows for your site.</p>
                <div className="sc-starters">
                  {starterQuestions({ page, siteName, latitude: context.latitude, longitude: context.longitude, start: context.start_datetime_utc, end: context.end_datetime_utc })
                    .map(({ kind, title, text }) => ({ icon: STARTER_ICONS[kind], title, text }))
                    .map(({ icon: Icon, title, text }) => (
                    <button key={title} type="button" onClick={() => void send(text)} disabled={busy || (cooldown > 0 && !localChatNavigation(text, page))}>
                      <Icon size={20} aria-hidden="true" />
                      <span><strong>{title}</strong><small>{text}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn) => (
              <div key={turn.id} className={`sc-turn is-${turn.role}`}>
                {turn.role === 'assistant' && <div className="sc-turn-avatar" aria-hidden="true"><Moon size={16} /></div>}
                <div className="sc-turn-body">
                  <div className="sc-bubble">{turn.content}</div>
                  {turn.action && <ActionCard turn={turn} busy={busy} onApply={() => apply(turn)} onRetry={() => runPreview(turn.id, turn.action!)} onOpen={onApply} onTry={tryAction} />}
                  <span className="sc-meta">{turn.role === 'user' ? 'You' : 'Selene'} · {clockTime(turn.time)}</span>
                </div>
              </div>
            ))}

            {busy && (
              <div className="sc-turn is-assistant">
                <div className="sc-turn-avatar" aria-hidden="true"><Moon size={16} /></div>
                <div className="sc-typing" aria-label="Selene is typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={bottom} />
          </div>

          {lastAssistant && !busy && !error && suggestedReplies.length > 0 && <div className="sc-suggestion-tray" aria-label="Suggested replies">
            <span>Try asking</span>
            <div className="sc-options">{suggestedReplies.map(option =>
              <button key={option} type="button" onClick={() => void send(option)} disabled={cooldown > 0 && !localChatNavigation(option, page)}>{option}</button>
            )}</div>
          </div>}

          {error && (
            <p className={`sc-error${cooldown > 0 ? ' is-warn' : ''}`} role="alert">
              {cooldown > 0 ? <Clock size={18} aria-hidden="true" /> : null}
              <span>{error}{retryTurn && <><br /><button type="button" className="sc-retry" disabled={busy || (cooldown > 0 && retryNeedsAI)} onClick={() => void send(retryTurn.content, true)}>{cooldown > 0 && retryNeedsAI ? retryLabel(cooldown) : 'Retry last message'}</button></>}</span>
            </p>
          )}

          <form className="sc-composer" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <textarea
              ref={inputRef}
              rows={1}
              aria-label="Message the assistant"
              placeholder={cooldown > 0 ? 'AI is paused; you can still open a page' : 'Ask about a site, a date or a page…'}
              maxLength={6000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); }
              }}
            />
            <button type="submit" className="sc-send" disabled={busy || !input.trim() || (cooldown > 0 && !localChatNavigation(input, page))} aria-label="Send message">
              {busy ? <Loader2 size={20} className="sc-spin" /> : <Send size={20} />}
            </button>
          </form>
          {verification?.challenge_required && <ChatVerification siteKey={verification.site_key} attempt={verificationAttempt} onToken={setVerificationToken} />}
          <footer className="sc-footer">
            Enter to send · Shift+Enter for a new line. AI answers can be wrong; results come from the site's models.
          </footer>
        </section>
      )}

      {!open && !greetingDismissed && (
        <div className="sc-greeting">
          <button type="button" className="sc-greeting-text" onClick={() => setOpen(true)}>
            Hey, I'm <strong>Selene.</strong> How can I help you?<br />
            What are you curious about?
          </button>
          <button type="button" className="sc-greeting-dismiss" aria-label="Dismiss greeting" onClick={() => setGreetingDismissed(true)}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      )}
      <button
        type="button"
        className={`sc-launcher ${launcherState}`}
        aria-label={open ? 'Hide assistant' : 'Open assistant'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={27} aria-hidden="true" /> : <Moon size={30} strokeWidth={1.8} aria-hidden="true" />}
        {unread && !open && <b className="sc-badge" aria-label="New reply" />}
      </button>
    </div>,
    document.body
  );
}

function ActionCard({ turn, busy, onApply, onRetry, onOpen, onTry }: { turn: Turn; busy: boolean; onApply: () => void; onRetry: () => void; onOpen: (action: ChatAction) => void; onTry: (action: ChatAction, label: string) => void }) {
  const action = turn.action!;
  const f = action.forecast;
  const zone = f?.display_timezone ?? action.site_ranking?.display_timezone ?? 'UTC';
  const preview = turn.preview;
  const title = action.operations ? 'Mission operations requirements' : action.compare_focus ? 'Compare Earth visibility' : action.compare_sites ? `Compare ${action.compare_sites.sites.length} site${action.compare_sites.sites.length === 1 ? '' : 's'}` : action.site_ranking ? 'South-pole site ranking' : action.mission_windows ? 'Launch & landing date search' : action.criteria ? 'Science window search' : f ? `Forecast for ${PAGE_LABEL[action.page]}` : `Open ${PAGE_LABEL[action.page]}`;

  return (
    <div className="sc-card">
      <div className="sc-card-head">
        <span>{title}</span>
        <em>{PAGE_LABEL[action.page]}</em>
      </div>

      {f && (
        <dl className="sc-card-facts">
          <div><dt>Site</dt><dd>{coordText(f.latitude, f.longitude)}</dd></div>
          <div><dt>From</dt><dd>{formatZonedDateTime(f.start_datetime_utc, zone)}</dd></div>
          <div><dt>To</dt><dd>{formatZonedDateTime(f.end_datetime_utc, zone)}</dd></div>
          <div><dt>Sampling</dt><dd>Every {f.step_hours} h</dd></div>
        </dl>
      )}
      {action.operations && <dl className="sc-card-facts">
        <div><dt>Coordinates</dt><dd>{coordText(action.operations.latitude, action.operations.longitude)}</dd></div>
        <div><dt>Landing range</dt><dd>{formatZonedDateTime(action.operations.landing_start_utc, zone)} to {formatZonedDateTime(action.operations.landing_end_utc, zone)}</dd></div>
        {Object.entries(action.operations.requirements).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{value}</dd></div>)}
        <div><dt>Nearby radius</dt><dd>{action.operations.nearby_radius_km} km</dd></div>
        <div><dt>Next step</dt><dd>Apply these values, then run Find best landing dates.</dd></div>
      </dl>}
      {action.mission_windows && <dl className="sc-card-facts">
        <div><dt>Selected site</dt><dd>{coordText(action.mission_windows.latitude, action.mission_windows.longitude)}</dd></div>
        <div><dt>Landing range</dt><dd>{action.mission_windows.landing_start_utc.slice(0, 10)} to {action.mission_windows.landing_end_utc.slice(0, 10)} UTC</dd></div>
        <div><dt>Sunlight needed</dt><dd>{hoursText(action.mission_windows.min_sunlight_days * 24)} continuous</dd></div>
        {(action.mission_windows.min_earth_hours ?? 0) > 0 && <div><dt>Earth visibility</dt><dd>{hoursText(action.mission_windows.min_earth_hours ?? 0)} continuous from landing</dd></div>}
      </dl>}
      {action.criteria && (
        <div className="sc-chips">{criteriaChips(action.criteria).map((c) => <span key={c}>{c}</span>)}</div>
      )}

      {preview?.status === 'loading' && (
        <div className="sc-result is-loading"><Loader2 size={18} className="sc-spin" /> Computing results…</div>
      )}
      {preview?.status === 'error' && (
        <div className="sc-result is-error">
          Could not compute results: {preview.message}
          <button type="button" className="sc-link" onClick={onRetry}>Try again</button>
        </div>
      )}
      {preview?.status === 'windows' && (
        <div className="sc-result">
          <div className="sc-result-stats">
            <div><strong>{preview.windows.length}</strong><span>window{preview.windows.length === 1 ? '' : 's'} found</span></div>
            <div><strong>{hoursText(preview.totalHours)}</strong><span>meeting shown filters</span></div>
            <div><strong>{preview.periodHours > 0 ? Math.round((preview.totalHours / preview.periodHours) * 100) : 0}%</strong><span>of the period</span></div>
          </div>
          {preview.windows.length ? (
            <ol className="sc-window-list">
              {preview.windows.slice(0, 5).map((w) => (
                <li key={w.start}>
                  <span>{formatZonedDateTime(w.start, zone)}</span>
                  <strong>{hoursText(w.hours)}</strong>
                </li>
              ))}
              {preview.windows.length > 5 && <li className="sc-more">and {preview.windows.length - 5} more on the Science Windows page</li>}
            </ol>
          ) : (
            <div className="sc-advice">
              <p className="sc-empty">No period meets every condition{preview.advice?.blocking.length ? ` — blocked by: ${preview.advice.blocking.join(', ')}` : ''}.</p>
              {preview.advice && <>
                <ul className="sc-advice-checks">
                  {preview.advice.checks.map(c => (
                    <li key={c.label} className={c.passPct < 5 ? 'is-bad' : c.passPct < 50 ? 'is-warn' : 'is-ok'}>
                      <strong>{c.passPct.toFixed(0)}%</strong> <span>{c.label}</span> <small>{c.observed}</small>
                    </li>
                  ))}
                </ul>
                {preview.advice.relaxations.length ? <>
                  <p className="sc-advice-head">These changes give results on the same dates:</p>
                  <div className="sc-advice-options">
                    {preview.advice.relaxations.map(r => (
                      <button key={r.label} type="button" onClick={() => onTry({ page: 'windows', forecast: f, criteria: r.criteria }, r.label)}>
                        {r.label} <em>{r.windows} window{r.windows === 1 ? '' : 's'}, {hoursText(r.hours)}</em>
                      </button>
                    ))}
                  </div>
                </> : <p className="sc-advice-head">No single relaxation gives results in this period; try a longer date range or another site.</p>}
              </>}
            </div>
          )}
          <small className="sc-source">{preview.source}. Edges depend on the {f?.step_hours} h sampling.</small>
        </div>
      )}
      {preview?.status === 'ranking' && (
        <div className="sc-result">
          {action.site_ranking?.criteria && <p>{criteriaChips(action.site_ranking.criteria).join(' ? ')}</p>}
          <div className="sc-result-stats">
            <div><strong>{preview.bestLanding ?? 'No qualifying site'}</strong><span>safest landing</span></div>
            <div><strong>{preview.bestWater ?? 'No qualifying site'}</strong><span>closest to detected ice</span></div>
            <div><strong>{preview.bestOverall ?? 'No qualifying site'}</strong><span>best overall</span></div>
          </div>
          <div className="sc-mission-table-wrap"><table className="sc-mission-table">
            <thead><tr><th>Site</th><th>Landing</th><th>Slope</th><th>Ice crater</th><th>Sun</th><th>Earth</th><th>Qualifying interval</th></tr></thead>
            <tbody>
              {preview.sites.map(site => (
                <tr key={site.name}>
                  <td>{site.name}</td>
                  <td>{site.safe_footprint_fraction === null ? '—' : `${(site.safe_footprint_fraction * 100).toFixed(0)}% safe`}</td>
                  <td>{site.slope_deg === null ? '—' : `${site.slope_deg.toFixed(1)}°`}</td>
                  <td>{site.nearest_ice_crater} {site.ice_crater_distance_km < 0.05 ? '(on rim)' : `${site.ice_crater_distance_km.toFixed(1)} km`}</td>
                  <td>{site.sunlit_pct.toFixed(0)}%</td>
                  <td>{site.earth_visible_pct.toFixed(0)}%</td>
                  <td>{site.continuous_sunlight_days == null ? 'Not requested' : <>{site.continuous_sunlight_days.toFixed(1)} days<br />{site.sunlight_start_utc && formatZonedDateTime(site.sunlight_start_utc, zone)} to {site.sunlight_end_utc && formatZonedDateTime(site.sunlight_end_utc, zone)}</>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {preview.sites.length > 0 && <button type="button" className="sc-apply" onClick={() => onOpen({ page: 'compare', compare_sites: { mode: 'replace', sites: preview.sites.slice(0, 5).map(site => ({ name: site.name, latitude: site.latitude, longitude: site.longitude })) } })}>
            Compare the top {Math.min(5, preview.sites.length)} sites <ArrowRight size={18} />
          </button>}
          {!preview.sites.length && <p>No candidate site meets all requested conditions in this date range.</p>}
          <small className="sc-source">Computed by the site ranking · {preview.source}. {preview.method.join(' ')}</small>
        </div>
      )}
      {preview?.status === 'mission' && (
        <div className="sc-result">
          <div className="sc-result-stats">
            <div><strong>{preview.candidates.length}</strong><span>landing window{preview.candidates.length === 1 ? '' : 's'} meeting both limits</span></div>
            <div><strong>{(preview.totalSunHours / 24).toFixed(1)} d</strong><span>sampled sunlight in range</span></div>
            <div><strong>{preview.minEarthElevation.toFixed(1)}°–{preview.maxEarthElevation.toFixed(1)}°</strong><span>sampled Earth elevation</span></div>
          </div>
          {preview.candidates.length ? (
            <div className="sc-mission-table-wrap"><table className="sc-mission-table">
              <thead><tr><th>Sunlight interval (UTC)</th><th>Screened landing (UTC)</th><th>Sunlight left</th><th>Earth in stay</th><th>Back-calculated departure (UTC)</th></tr></thead>
              <tbody>
                {preview.candidates.map(c => (
                  <tr key={c.estimated_launch_utc}>
                    <td>{c.sunlight_interval_start_utc.slice(0, 16).replace('T', ' ')} → {c.sunlight_interval_end_utc.slice(0, 16).replace('T', ' ')}</td>
                    <td>{c.estimated_landing_utc.slice(0, 16).replace('T', ' ')}</td>
                    <td>{c.continuous_sunlight_days_screened.toFixed(1)} d</td>
                    <td>{preview.requiredEarthHours > 0 ? `${(c.continuous_earth_hours_screened ?? preview.requiredEarthHours).toFixed(0)} h continuous` : `${c.earth_contact_hours_during_required_stay.toFixed(0)} h / ${Math.ceil(preview.requiredSunDays * 24)} h`}</td>
                    <td>{c.estimated_launch_utc.slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : preview.requiredEarthHours > 0 && preview.maxEarthElevation <= 0 ? <p className="sc-empty">
            <strong>Earth never rises at {preview.site}.</strong> This site is on the Moon's far side: Earth stays between {preview.minEarthElevation.toFixed(1)}° and {preview.maxEarthElevation.toFixed(1)}° below the horizon, so no date can give Earth contact. Choose a near-side site, a point near the limb (for example Connecting Ridge C1, −89.44°, −137.17°), or plan a relay satellite.
          </p> : <p className="sc-empty">
            No landing window meeting {hoursText(preview.requiredSunDays * 24)} of continuous sunlight{preview.requiredEarthHours > 0 ? ` and ${hoursText(preview.requiredEarthHours)} of continuous Earth visibility` : ''} was found at {preview.site} in this date range.
            {preview.sunlitPct !== null && ` This spot is sunlit only ${preview.sunlitPct.toFixed(0)}% of the time`}
            {preview.maxHorizon !== null && `, with ridges up to ${preview.maxHorizon.toFixed(1)}° high around it`}.
            {' '}Try a well-lit point such as Connecting Ridge (C1, −89.44°, −137.17°), or let the Agent Swarm choose the site.
          </p>}
          {preview.checks.length > 0 && <p className="sc-empty">Mission screen alert: {preview.checks.join(' ')}</p>}
          <small className="sc-source">Computed by the agent-swarm date search · {preview.source}. {preview.limitations.join(' ')}</small>
        </div>
      )}
      {preview?.status === 'summary' && (
        <div className="sc-result">
          <div className="sc-result-stats">
            <div><strong>{preview.sunlitPct.toFixed(0)}%</strong><span>Sun up</span></div>
            <div><strong>{preview.earthPct.toFixed(0)}%</strong><span>Earth in view</span></div>
            <div><strong>{preview.minC.toFixed(0)} to {preview.maxC.toFixed(0)}</strong><span>°C range</span></div>
          </div>
          <small className="sc-source">Peak sunlight {preview.peakIrr.toFixed(0)} W/m² · {preview.source}</small>
        </div>
      )}

      {f && (preview?.status === 'windows' || preview?.status === 'summary') && (
        <CrossVerify action={action} preview={preview} zone={zone} onOpen={onOpen} />
      )}

      <button type="button" className="sc-apply" disabled={busy || turn.applied} onClick={onApply}>
        {turn.applied ? <><Check size={18} /> {action.operations ? 'Applied mission settings' : `Opened ${PAGE_LABEL[action.page]}`}</> : <>{action.operations ? 'Apply mission settings' : `Open ${PAGE_LABEL[action.page]}`}{action.criteria ? ' with these filters' : ''} <ArrowRight size={18} /></>}
      </button>
    </div>
  );
}

/**
 * "Check it yourself": the same inputs opened in the site's own forms, with
 * what each one should show, so chat results can be cross-verified.
 */
function CrossVerify({ action, preview, zone, onOpen }: {
  action: ChatAction;
  preview: Extract<Preview, { status: 'windows' | 'summary' }>;
  zone: string;
  onOpen: (action: ChatAction) => void;
}) {
  const f = action.forecast!;
  const c = action.criteria;
  const period = `${formatZonedDateTime(f.start_datetime_utc, zone)} → ${formatZonedDateTime(f.end_datetime_utc, zone)}`;
  const checks: { label: string; expect: string; action: ChatAction }[] = [];
  if (c && preview.status === 'windows') {
    checks.push({
      label: 'Science Windows form',
      expect: `same filters; should list ${preview.windows.length} window${preview.windows.length === 1 ? '' : 's'}, ${hoursText(preview.totalHours)} in total`,
      action: { page: 'windows', forecast: f, criteria: c }
    });
  }
  checks.push({
    label: 'Forecast charts',
    expect: c?.requireEarth ? 'Earth-elevation chart above the horizon during each window' : 'sunlight, temperature and Earth elevation over the period',
    action: { page: 'forecast', forecast: f }
  });
  checks.push({
    label: 'Sky envelope calculator',
    expect: c?.requireEarth
      ? `Earth's height range at this site must reach above ${c.minEarthElevation ?? 0}° for any window to exist`
      : 'highest and lowest Sun and Earth heights at this site',
    action: { page: 'sky', forecast: f }
  });

  return (
    <section className="sc-verify" aria-label="Cross-verify these results">
      <strong>Cross-verify these results</strong>
      <p>
        Open the same inputs in the site's forms and check they agree. The top bar should read {coordText(f.latitude, f.longitude)} and {period}, every {f.step_hours} h.
      </p>
      <ul>
        {checks.map((check) => (
          <li key={check.label}>
            <button type="button" className="sc-link" onClick={() => onOpen(check.action)}>{check.label}</button>
            <span> — {check.expect}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Dated mission events from launch to the end of the surface stay. */
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

export function SwarmTimeline({ plan }: { plan: Plan | null }) {
  return (
    <>
      {plan?.timeline && plan.timeline.length > 0 && (
        <section className="as-card as-timeline-card" aria-label="Mission timeline">
          <div className="as-card-header">
            <div>
              <span className="as-badge-tag">TIMELINE</span>
              <h3>Mission timeline (UTC)</h3>
              <p>Launch to the end of the surface stay, from the calculations above.</p>
            </div>
          </div>
          <ol className="as-timeline-list">
            {plan.timeline.map((e) => (
              <li key={`${e.event}-${e.utc}`}>
                <time>{new Date(e.utc).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })}</time>
                <strong>{e.event}</strong>
                <span>{e.note}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

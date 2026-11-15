/** Review verdict, assumptions, missing verifications and execution log. */
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

export function SwarmAudit({ plan }: { plan: Plan | null }) {
  return (
    <>
      {plan && (
        <section className="as-audit-section">
          <div className="as-card">
            <div className="as-card-header">
              <div>
                <span className="as-badge-tag">REVIEW</span>
                <h3>Mission Feasibility & Audit Trail</h3>
              </div>
              <span className={`as-pill ${plan.overall_status === 'provisional_screening_pass' ? 'is-pass' : 'is-warn'}`}>
                {plan.overall_status === 'provisional_screening_pass' ? 'Screening Verification Passed' : 'Verification Checks Alert'}
              </span>
            </div>

            <details className="as-audit-details"><summary>Verification details and execution log</summary><div className="as-audit-grid">
              <div className="as-audit-col">
                <h4>Required Formal Verifications</h4>
                <ul className="as-audit-list">
                  {plan.missing_verifications.map((item, idx) => (
                    <li key={idx}>
                      <ChevronRight size={14} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="as-audit-col">
                <h4>Agent Execution Log</h4>
                <ol className="as-log-list">
                  {plan.execution_log.map((entry, idx) => (
                    <li key={idx}>
                      <code>{entry}</code>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="as-audit-col">
                <h4>Governing Assumptions</h4>
                <ul className="as-assumptions-list">
                  {plan.assumptions.map((assump, idx) => (
                    <li key={idx}>{assump}</li>
                  ))}
                </ul>
              </div>
            </div></details>
          </div>
        </section>
      )}
    </>
  );
}

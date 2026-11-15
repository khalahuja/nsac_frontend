/** Constants, helpers and form building blocks shared by the engineering tools. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BatteryCharging, BookOpen, Check, Compass, Copy, Crosshair, Droplets, Gauge,
  MapPinned, Mountain, Orbit, Radio, RotateCcw, Search, ShieldCheck, Signal, Sliders, Sun,
  Sunrise, Target, Thermometer
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LunarCoordinate } from '../../lib/lunar';
import { formatZonedDateTime, utcInput } from '../../lib/time';
import { landingScreen, orbitInsertion } from '../../lib/missionMath';
import type { ToolId, ToolInputs } from '../../lib/navigation';
import { ARTEMIS_CANDIDATE_SITES } from '../SiteComparisonView';
import { CANDIDATE_REGIONS } from '../../lib/southPole';


// ---------------------------------------------------------------- constants

export const MOON_RADIUS_KM = 1737.4;
export const EARTH_RADIUS_KM = 6371.0;
export const SOLAR_CONSTANT = 1361;
export const SIGMA = 5.670374419e-8;
export const LIGHT_SPEED_KM_S = 299792.458;
export const BOLTZMANN_DBW = 10 * Math.log10(1.380649e-23); // −228.6 dBW/(K·Hz)
export const LUNAR_OBLIQUITY_DEG = 1.54;
export const LIBRATION_LAT_DEG = 6.7;
export const LIBRATION_LON_DEG = 7.9;

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const fmt = (v: number, digits = 1) =>
  Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
export const signed = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), digits)}`;

// -------------------------------------------------------- shared controls

export type Preset = { label: string; value: number };

export type FieldProps = {
  label: string;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  presets?: Preset[];
  slider?: boolean;
};

export function FormSection({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="fx-section">
      <div className="fx-section-header">
        {Icon && <Icon size={13} className="fx-section-icon" />}
        <span className="fx-section-title">{title}</span>
      </div>
      <div className="fx-section-fields">{children}</div>
    </div>
  );
}

export function Field({ label, unit, value, onChange, min, max, step = 1, hint, presets, slider = true }: FieldProps) {
  const id = useId();
  const outOfRange = !Number.isFinite(value) || value < min || value > max;
  return (
    <div className="fx-field">
      <div className="fx-field-row">
        <label htmlFor={id}>{label}</label>
        <div className={`fx-num${outOfRange ? ' is-warn' : ''}`}>
          <input
            id={id}
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => { const v = e.target.valueAsNumber; if (Number.isFinite(v)) onChange(v); }}
          />
          {unit && <span>{unit}</span>}
        </div>
      </div>
      {slider && (
        <input
          className="fx-slider"
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      {presets && (
        <div className="fx-presets">
          {presets.map((p) => (
            <button key={p.label} type="button" className={p.value === value ? 'is-on' : ''} onClick={() => onChange(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      {outOfRange && <small className="fx-warn">Outside usual range ({min}–{max}{unit ? ` ${unit}` : ''}).</small>}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="fx-field">
      <span className="fx-field-label">{label}</span>
      <div className="fx-segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="fx-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy result'}
    </button>
  );
}

export type Tone = 'gold' | 'blue' | 'green' | 'amber' | 'red';

export function Answer({ label, value, sub, tone = 'blue', copy }: { label: string; value: string; sub?: ReactNode; tone?: Tone; copy?: string }) {
  return (
    <section className={`fx-card fx-answer is-${tone}`}>
      <div className="fx-answer-head">
        <span className="fx-answer-label">{label}</span>
        {copy && <CopyButton text={copy} />}
      </div>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </section>
  );
}

export function Stats({ items }: { items: { label: string; value: string; note?: string }[] }) {
  return (
    <div className="fx-stats">
      {items.map((s) => (
        <div key={s.label}>
          <span>{s.label}</span>
          <strong>{s.value}</strong>
          {s.note && <small>{s.note}</small>}
        </div>
      ))}
    </div>
  );
}

/** The equation, the same equation with the user's numbers, and the result. */
export function Working({ lines }: { lines: [string, string][] }) {
  return (
    <section className="fx-card fx-working">
      <h3>How it's calculated</h3>
      <dl>
        {lines.map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><code>{text}</code></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Notes({ items }: { items: ReactNode[] }) {
  return (
    <section className="fx-card fx-notes">
      <h3>Assumptions & Model Notes</h3>
      <ul>{items.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </section>
  );
}

export function Bars({ title, rows, unit, digits = 1, note }: {
  title: string; rows: { label: string; value: number; active?: boolean }[]; unit: string; digits?: number; note?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <section className="fx-card fx-bars">
      <h3>{title}</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.label} className={r.active ? 'is-active' : ''}>
            <span className="fx-bar-label">{r.label}</span>
            <span className="fx-bar-track"><i style={{ width: `${(r.value / max) * 100}%` }} /></span>
            <span className="fx-bar-value">{fmt(r.value, digits)} {unit}</span>
          </li>
        ))}
      </ul>
      {note && <p className="fx-bars-note">{note}</p>}
    </section>
  );
}

export function Inputs({ children }: { children: ReactNode }) {
  return (
    <form className="fx-card fx-inputs" aria-label="Inputs" onSubmit={event => event.preventDefault()}>
      <div className="fx-inputs-header">
        <h3>Parameters & Settings</h3>
      </div>
      {children}
    </form>
  );
}

// ------------------------------------------------------------------ tools

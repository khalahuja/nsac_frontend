import { useMemo, useState } from 'react';
import { ForecastSample } from '../lib/lunar';

export type ChartSeries = { name: string; color: string; samples: ForecastSample[]; source?: string; lat?: number; lon?: number };

type ChartProps = {
  samples: ForecastSample[];
  field: 'horizontal_irradiance_w_m2' | 'temperature_c' | 'solar_irradiance_w_m2' | 'solar_elevation_deg' | 'earth_elevation_deg';
  title: string;
  unit: string;
  color: string;
  timeZone?: string;
  hoveredIndex?: number | null;
  onHoverIndex?: (index: number | null) => void;
  series?: ChartSeries[];
};

export function ForecastChart({ samples, field, title, unit, color, timeZone = 'UTC', hoveredIndex, onHoverIndex, series }: ChartProps) {
  const [localHover, setLocalHover] = useState<number | null>(null);
  const hovered = hoveredIndex === undefined ? localHover : hoveredIndex;
  const setHovered = onHoverIndex ?? setLocalHover;
  const values = useMemo(() => samples.map((sample) => sample[field]), [field, samples]);
  const allValues = series?.length ? series.flatMap(s => s.samples.map(p => p[field])) : values;
  const minimum = allValues.length ? Math.min(...allValues) : 0;
  const maximum = allValues.length ? Math.max(...allValues) : 0;
  const padding = Math.max((maximum - minimum) * 0.08, 0.5);
  const domainMin = minimum - padding;
  const domainMax = maximum + padding;
  const span = domainMax - domainMin;
  const width = 520;
  const height = 250;
  const left = 54;
  const right = 18;
  const top = 22;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xAt = (index: number) => left + (index / Math.max(1, values.length - 1)) * plotWidth;
  const yAt = (value: number) => top + (1 - (value - domainMin) / span) * plotHeight;
  const points = values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(' ');
  const active = hovered === null ? null : samples[hovered];

  if (!samples.length) return <div className="forecast-chart">No samples available.</div>;

  const tickLabel = (index: number) => new Date(samples[index].datetime_utc).toLocaleString(undefined, {
    timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="forecast-chart">
      <div className="chart-heading">
        <span>{title}</span>
        <strong>{active ? `${active[field].toFixed(1)} ${unit}` : `${minimum.toFixed(1)}–${maximum.toFixed(1)} ${unit}`}</strong>
      </div>
      {series && <div className="science-chart-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}: {hovered !== null && s.samples[hovered] ? `${s.samples[hovered][field].toFixed(1)} ${unit}` : s.source?.split(':')[0]}</span>)}</div>}
      <div className="chart-plot-scroll" tabIndex={0} role="region" aria-label={`${title} chart; scroll horizontally on small screens`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title} forecast chart`}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const relative = (event.clientX - bounds.left) / bounds.width;
          const chartX = relative * width;
          const index = Math.round(((chartX - left) / plotWidth) * (samples.length - 1));
          setHovered(Math.max(0, Math.min(samples.length - 1, index)));
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <line x1={left} x2={width - right} y1={top} y2={top} className="chart-grid" />
        <line x1={left} x2={width - right} y1={top + plotHeight / 2} y2={top + plotHeight / 2} className="chart-grid" />
        <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} className="chart-grid" />
        <text x={left - 6} y={top + 4} textAnchor="end" className="chart-axis">{domainMax.toFixed(1)}</text>
        <text x={left - 6} y={height - bottom + 4} textAnchor="end" className="chart-axis">{domainMin.toFixed(1)}</text>
        <text x={left - 6} y={top + plotHeight / 2 + 4} textAnchor="end" className="chart-axis">{((minimum + maximum) / 2).toFixed(1)}</text>
        {series?.length ? series.map(s => <polyline key={s.name} points={s.samples.map((p, i) => `${xAt(i)},${yAt(p[field])}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.8" vectorEffect="non-scaling-stroke" />) : <polyline points={points} fill="none" stroke={color} strokeWidth="2.8" vectorEffect="non-scaling-stroke" />}
        {hovered !== null && active && (
          <>
            <line x1={xAt(hovered)} x2={xAt(hovered)} y1={top} y2={height - bottom} className="chart-cursor" />
            {series?.length ? series.map(s => <circle key={s.name} cx={xAt(hovered)} cy={yAt(s.samples[hovered][field])} r="4" fill={s.color} stroke="#08101a" strokeWidth="2" />) : <circle cx={xAt(hovered)} cy={yAt(active[field])} r="4" fill={color} stroke="#08101a" strokeWidth="2" />}
          </>
        )}
        <text x={left} y={height - 6} className="chart-axis">{tickLabel(0)}</text>
        <text x={width - right} y={height - 6} textAnchor="end" className="chart-axis">{tickLabel(samples.length - 1)}</text>
      </svg>
      </div>
      <div className="chart-readout">{active ? new Date(active.datetime_utc).toLocaleString(undefined, { timeZone, timeZoneName: 'short' }) : `Hover or touch the curve to inspect samples · ${timeZone.replace(/_/g, ' ')}`}</div>

    </div>
  );
}

import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { generateTransfers, propellantForDeltaV, type Transfer } from '../lib/trajectories';
import '../trajectory.css';

const fmt = (value: number, digits = 0) => value.toFixed(digits);

function TrajectoryPlot({ transfer, view }: { transfer: Transfer; view: '2d' | '3d' }) {
  if (view === '3d') return <Canvas camera={{ position: [0, 0, 2.8], fov: 48 }}>
    <color attach="background" args={['#0c111a']} />
    <ambientLight intensity={.8} />
    <pointLight position={[3, 4, 4]} intensity={2} />
    <mesh><sphereGeometry args={[.036, 24, 16]} /><meshStandardMaterial color="#3f8ec9" /></mesh>
    <mesh position={transfer.moonPoint}><sphereGeometry args={[.014, 18, 12]} /><meshStandardMaterial color="#dddddd" /></mesh>
    <Line points={transfer.points} color="#e7b86e" lineWidth={2} />
    <OrbitControls enablePan enableZoom />
  </Canvas>;
  return <svg viewBox="-1.15 -1.15 2.3 2.3" role="img" aria-label="Earth-centred transfer projection with Moon at estimated arrival">
    <circle r="1" fill="none" stroke="#53606c" strokeWidth=".002" strokeDasharray=".01 .01" />
    <circle r=".036" fill="#438ecb" />
    <circle cx={transfer.moonPoint[0]} cy={-transfer.moonPoint[1]} r=".014" fill="#ddd" />
    <polyline points={transfer.points.map(point => `${point[0]},${-point[1]}`).join(' ')} fill="none" stroke="#e7b86e" strokeWidth=".008" />
  </svg>;
}

export function TrajectoryExplorer({ startUtc, onUseArrival }: { startUtc: string; onUseArrival?: (arrivalUtc: string) => void }) {
  const [minDays, setMinDays] = useState(3);
  const [maxDays, setMaxDays] = useState(7);
  const [maxDeltaV, setMaxDeltaV] = useState(4500);
  const [maxMiss, setMaxMiss] = useState(60000);
  const [sort, setSort] = useState<'dv' | 'time' | 'miss'>('miss');
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<'2d' | '3d'>('3d');
  const [dry, setDry] = useState(1000);
  const [wet, setWet] = useState(2000);
  const [isp, setIsp] = useState(320);
  const catalogue = useMemo(() => generateTransfers(startUtc), [startUtc]);
  const matches = useMemo(() => catalogue.filter(item =>
    item.coastDays >= minDays && item.coastDays <= maxDays && item.totalDvMs <= maxDeltaV && item.arrivalKm <= maxMiss
  ).sort((a, b) => sort === 'dv' ? a.totalDvMs - b.totalDvMs : sort === 'time' ? a.coastDays - b.coastDays : a.arrivalKm - b.arrivalKm), [catalogue, minDays, maxDays, maxDeltaV, maxMiss, sort]);
  const active = matches.find(item => item.id === selected) ?? matches[0];
  const fuel = active ? propellantForDeltaV(dry, wet, isp, active.totalDvMs) : null;

  return <section className="tr-page">
    <header><span>Transfer design / early stage screen</span><h1>Earth to Moon trajectories</h1><p>Search {catalogue.length.toLocaleString()} two-body transfer cases against the Moon's approximate position at arrival.</p></header>
    <div className="tr-layout">
      <aside>
        <h2>Smart filters</h2>
        <label>Minimum transit days<input type="number" min="1" max="20" value={minDays} onChange={event => setMinDays(Number(event.target.value))} /></label>
        <label>Maximum transit days<input type="number" min="1" max="20" value={maxDays} onChange={event => setMaxDays(Number(event.target.value))} /></label>
        <label>Maximum Δv, m/s<input type="number" min="0" value={maxDeltaV} onChange={event => setMaxDeltaV(Number(event.target.value))} /></label>
        <label>Maximum arrival miss, km<input type="number" min="0" value={maxMiss} onChange={event => setMaxMiss(Number(event.target.value))} /></label>
        <label>Sort by<select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="miss">Closest approach</option><option value="dv">Lowest Δv</option><option value="time">Shortest transit</option></select></label>
        <h2>Propulsion budget</h2>
        <label>Dry mass, kg<input type="number" value={dry} onChange={event => setDry(Number(event.target.value))} /></label>
        <label>Wet mass, kg<input type="number" value={wet} onChange={event => setWet(Number(event.target.value))} /></label>
        <label>Specific impulse, s<input type="number" value={isp} onChange={event => setIsp(Number(event.target.value))} /></label>
        {fuel && active && <p className={fuel.margin >= 0 ? 'tr-pass' : 'tr-fail'}>Available {fmt(fuel.possible)} m/s · required {fmt(active.totalDvMs)} m/s<br />Propellant used {fmt(fuel.required)} kg · margin {fmt(fuel.margin)} m/s</p>}
        {!fuel && <p>Enter a positive dry mass, a larger wet mass, and a positive specific impulse.</p>}
      </aside>
      <main>
        <div className="tr-toolbar"><strong>{matches.length} matches · {matches.filter(item => item.closeApproach).length} within 10,000 km</strong><div><button aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D</button><button aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button></div></div>
        <div className="tr-visual">{active ? <TrajectoryPlot transfer={active} view={view} /> : <p className="tr-empty">No transfer matches these filters. Increase the miss-distance or Δv limit.</p>}</div>
        {active && <div className="tr-stats"><span>Launch {active.launchUtc.slice(0, 16).replace('T', ' ')} UTC</span><span>Arrival {active.arrivalUtc.slice(0, 16).replace('T', ' ')} UTC</span><span>Transit {fmt(active.coastDays, 2)} d</span><span>TLI {fmt(active.tliMs)} m/s</span><span>LOI budget {fmt(active.loiMs)} m/s</span><span>Arrival miss {fmt(active.arrivalKm)} km</span>{onUseArrival && <button type="button" className="tr-use" onClick={() => onUseArrival(active.arrivalUtc)}>Plan surface ops from this arrival →</button>}</div>}
        <p className="tr-caveat">The fixed departure direction and lunar position use approximate ephemerides. Arrival miss is checked at transfer apogee. These are candidate dates for further targeting, not validated launch windows or captured trajectories.</p>
        <div className="tr-results"><table><thead><tr><th>Case</th><th>Launch UTC</th><th>Transit</th><th>Δv</th><th>Arrival miss</th></tr></thead><tbody>{matches.slice(0, 100).map(item => <tr key={item.id} className={item.id === active?.id ? 'active' : ''} onClick={() => setSelected(item.id)}><td>#{item.id}</td><td>{item.launchUtc.slice(0, 10)}</td><td>{fmt(item.coastDays, 2)} d</td><td>{fmt(item.totalDvMs)} m/s</td><td>{fmt(item.arrivalKm)} km</td></tr>)}</tbody></table></div>
      </main>
    </div>
  </section>;
}

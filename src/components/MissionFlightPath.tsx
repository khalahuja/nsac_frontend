import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { Globe2, Orbit, Rocket, ArrowDownCircle, MapPin, Play, Pause, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { createEarthTexture } from '../utils/textures';
import { flightDate, missionFlightTimes } from '../lib/missionFlight';

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'warning' | 'failed';
type Stage = { agent: string; outputs: Record<string, number | string | boolean | null> };
type FlightProfile = { parkingOrbits: number; stagingAltitude: number; stagingOrbits: number; lunarOrbits: number };
const defaultProfile: FlightProfile = { parkingOrbits: 1, stagingAltitude: 0, stagingOrbits: 1, lunarOrbits: 1 };
type Props = { statuses: AgentRunStatus[]; activeIndex: number; stages: Stage[]; departureUtc: string; profile?: FlightProfile };
const phaseNodes = [2, 3, 4, 5, 6];
const phaseNames = ['Earth launch', 'Translunar coast', 'Lunar capture', 'Powered descent', 'Moon landing'];
const phaseIcons = [Rocket, Orbit, Globe2, ArrowDownCircle, MapPin];
const earthCenter = new THREE.Vector3(-3, 0, 0);
const moonCenter = new THREE.Vector3(3, 0, 0);
const captureAngle = 2.3;
const lunarEntry = moonCenter.clone().add(new THREE.Vector3(Math.cos(captureAngle) * .8, Math.sin(captureAngle) * .8, 0));
const transfer = new THREE.CubicBezierCurve3(new THREE.Vector3(-3, .9, 0), new THREE.Vector3(-1.8, 2.5, .2), new THREE.Vector3(1.2, 2.2, .1), lunarEntry);

/** Illustrative, compressed trajectory. Shares one coordinate system in both views. */
function flightPoint(progress: number, profile = defaultProfile): THREE.Vector3 {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  if (p < .04) return new THREE.Vector3(-3, THREE.MathUtils.lerp(.52, .9, p / .04), 0);
  const raised = profile.stagingAltitude > 0;
  const parkingEnd = raised ? .1 : .2;
  if (p < parkingEnd) {
    const angle = Math.PI / 2 - ((p - .04) / (parkingEnd - .04)) * Math.PI * 2 * profile.parkingOrbits;
    return earthCenter.clone().add(new THREE.Vector3(Math.cos(angle) * .9, Math.sin(angle) * .9, 0));
  }
  if (raised && p < .14) {
    const angle = Math.PI / 2 - ((p - .1) / .04) * Math.PI;
    return earthCenter.clone().add(new THREE.Vector3(Math.cos(angle) * Math.sqrt(.9 * 1.25), -.175 + Math.sin(angle) * 1.075, 0));
  }
  if (raised && p < .2) {
    const angle = -Math.PI / 2 - ((p - .14) / .06) * Math.PI * 2 * profile.stagingOrbits;
    return earthCenter.clone().add(new THREE.Vector3(Math.cos(angle) * 1.25, Math.sin(angle) * 1.25, 0));
  }
  if (p < .65) {
    if (!raised) return transfer.getPoint((p - .2) / .45);
    const t = (p - .2) / .45, u = 1 - t;
    return new THREE.Vector3(u*u*u*-3 + 3*u*u*t*-1.8 + 3*u*t*t*1.2 + t*t*t*lunarEntry.x,
      u*u*u*-1.25 + 3*u*u*t*-1.8 + 3*u*t*t*1.8 + t*t*t*lunarEntry.y, 0);
  }
  if (p < .85) {
    const angle = captureAngle - ((p - .65) / .2) * Math.PI * 2 * profile.lunarOrbits;
    return moonCenter.clone().add(new THREE.Vector3(Math.cos(angle) * .8, Math.sin(angle) * .8, 0));
  }
  const radius = THREE.MathUtils.lerp(.8, .445, (p - .85) / .15);
  return moonCenter.clone().add(new THREE.Vector3(Math.cos(captureAngle) * radius, Math.sin(captureAngle) * radius, 0));
}
function phaseAt(p: number) { return p >= 1 ? 4 : p >= .85 ? 3 : p >= .65 ? 2 : p >= .2 ? 1 : 0; }
const project = (v: THREE.Vector3) => [500 + v.x * 105, 275 - v.y * 105] as const;
function earthPhase(p: number, raised: boolean) {
  return p < .04 ? 'Earth launch' : raised && p >= .14 && p < .2 ? 'Higher Earth orbit'
    : raised && p >= .1 && p < .14 ? 'Earth orbit transfer' : p < .2 ? 'Earth parking orbits' : phaseNames[phaseAt(p)];
}


function Spacecraft({ progress, profile }: { progress: number; profile: FlightProfile }) {
  const position = flightPoint(progress, profile);
  const direction = progress >= .85 ? position.clone().sub(moonCenter).normalize() : flightPoint(Math.min(1, progress + .001), profile).sub(flightPoint(Math.max(0, progress - .001), profile)).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const burn = progress < .04 || (profile.stagingAltitude > 0 && ((progress >= .1 && progress < .106) || (progress >= .14 && progress < .146))) || (progress >= .2 && progress < .23) || (progress >= .65 && progress < .69) || (progress >= .85 && progress < 1);
  return <group position={position} quaternion={rotation}>
    <mesh><cylinderGeometry args={[.065, .09, .19, 12]} /><meshStandardMaterial color="#f2e8d5" metalness={.55} roughness={.35} /></mesh>
    <mesh position={[0, .13, 0]}><coneGeometry args={[.065, .08, 12]} /><meshStandardMaterial color="#e3cc87" metalness={.65} roughness={.3} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * .16, 0, 0]}><boxGeometry args={[.2, .07, .015]} /><meshStandardMaterial color="#5082d4" metalness={.4} roughness={.35} /></mesh>
      <mesh position={[side * .085, -.12, 0]} rotation={[0, 0, side * .45]}><cylinderGeometry args={[.008, .008, .13, 6]} /><meshStandardMaterial color="#e3cc87" /></mesh>
    </group>)}
    {burn && <mesh position={[0, -.23, 0]} rotation={[0, 0, Math.PI]}><coneGeometry args={[.05, .24, 12]} /><meshBasicMaterial color="#ffba58" transparent opacity={.9} /></mesh>}
    {progress >= 1 && <Html position={[0, .3, 0]} center><span className="as-flight-label is-landed">Touchdown</span></Html>}
  </group>;
}

function FitFlightCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const distance = Math.max(9, 4.2 / (Math.tan(THREE.MathUtils.degToRad(18)) * size.width / size.height));
    camera.position.set(0, 1.2, distance);
    camera.lookAt(0, .65, 0);
  }, [camera, size.width, size.height]);
  return null;
}

function Flight3D({ progress, profile, routes }: { progress: number; profile: FlightProfile; routes: THREE.Vector3[][] }) {
  const earthTexture = useMemo(createEarthTexture, []);
  useEffect(() => () => earthTexture.dispose(), [earthTexture]);
  const stars = useMemo(() => Array.from({ length: 120 }, (_, i) => new THREE.Vector3(Math.sin(i * 73.1) * 12, Math.cos(i * 41.3) * 7, -4 - (i % 7))), []);
  const trail = useMemo(() => {
    const resolution = Math.max(3000, Math.min(12000, Math.max(profile.parkingOrbits, profile.stagingOrbits, profile.lunarOrbits) * 1000));
    const count = Math.max(2, Math.ceil(progress * resolution));
    return Array.from({ length: count }, (_, i) => flightPoint(progress * i / (count - 1), profile));
  }, [progress, profile]);
  return <Canvas camera={{ position: [0, 1.2, 9], fov: 36 }} style={{ touchAction: 'pan-y' }}>
    <FitFlightCamera />
    <color attach="background" args={['#0b101c']} />
    <ambientLight intensity={.65} />
    <directionalLight position={[-3, 4, 5]} intensity={2.3} />
    {stars.map((v, i) => <mesh key={i} position={v}><sphereGeometry args={[.012, 4, 4]} /><meshBasicMaterial color="#afbddb" /></mesh>)}
    <mesh position={earthCenter}><sphereGeometry args={[.52, 48, 32]} /><meshStandardMaterial map={earthTexture} roughness={.85} /></mesh>
    <mesh position={earthCenter}><sphereGeometry args={[.55, 32, 24]} /><meshBasicMaterial color="#679cdf" transparent opacity={.12} side={THREE.BackSide} /></mesh>
    <mesh position={moonCenter}><sphereGeometry args={[.43, 48, 32]} /><meshStandardMaterial color="#a9adb8" roughness={1} /></mesh>
    <Html position={[-3, -.8, 0]} center><span className="as-flight-label">EARTH</span></Html>
    <Html position={[3, -.72, 0]} center><span className="as-flight-label">MOON</span></Html>
    {routes.map((points, i) => <Line key={i} points={points} color="#536480" lineWidth={1} transparent opacity={.65} />)}
    {progress > 0 && <Line points={trail} color="#c3b5ee" lineWidth={2.5} />}
    <Spacecraft progress={progress} profile={profile} />
    <OrbitControls target={[0, .65, 0]} enablePan={false} enableZoom={false} minPolarAngle={.5} maxPolarAngle={Math.PI / 2} />
  </Canvas>;
}

export function MissionFlightPath({ statuses, activeIndex, stages, departureUtc, profile = defaultProfile }: Props) {
  const [view, setView] = useState<'2d' | '3d'>('3d');
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const frameTime = useRef(0);
  const previousActive = useRef(activeIndex);
  useEffect(() => {
    if (activeIndex >= 0 && previousActive.current < 0) { setProgress(0); setPlaying(true); }
    previousActive.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    frameTime.current = 0;
    const tick = (now: number) => {
      const dt = frameTime.current ? Math.min((now - frameTime.current) / 1000, .1) : 0;
      frameTime.current = now;
      setProgress(p => Math.min(1, p + dt / 30));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => { if (progress >= 1) setPlaying(false); }, [progress]);
  const phase = phaseAt(progress);
  const raised = profile.stagingAltitude > 0;
  const previewPhase = earthPhase(progress, raised);
  const routes = useMemo(() => {
    const cuts = raised ? [0, .04, .1, .14, .2, .65, .85, 1] : [0, .04, .2, .65, .85, 1];
    return cuts.slice(0, -1).map((start, i) => Array.from({ length: Math.max(121, Math.min(12000, Math.max(profile.parkingOrbits, profile.stagingOrbits, profile.lunarOrbits) * 120)) }, (_, n) => {
      const count = Math.max(121, Math.min(12000, Math.max(profile.parkingOrbits, profile.stagingOrbits, profile.lunarOrbits) * 120));
      return flightPoint(start + (cuts[i + 1] - start) * n / (count - 1), profile);
    }));
  }, [profile]);
  const travelled2d = useMemo(() => {
    const resolution = Math.max(3000, Math.min(12000, Math.max(profile.parkingOrbits, profile.stagingOrbits, profile.lunarOrbits) * 1000));
    const count = Math.max(2, Math.ceil(progress * resolution));
    return Array.from({ length: count }, (_, i) => {
      const v = project(flightPoint(progress * i / (count - 1), profile));
      return `${i ? 'L' : 'M'} ${v.join(' ')}`;
    }).join(' ');
  }, [progress, profile]);
  const route2d = useMemo(() => routes.map(points => points.map((v, i) => `${i ? 'L' : 'M'} ${project(v).join(' ')}`).join(' ')), [routes]);
  const craft = flightPoint(progress, profile);
  const [x, y] = project(craft);
  const direction = phase >= 3 ? craft.clone().sub(moonCenter) : flightPoint(Math.min(1, progress + .001), profile).sub(flightPoint(Math.max(0, progress - .001), profile));
  const angle = Math.atan2(direction.x, direction.y) * 180 / Math.PI;
  const times = missionFlightTimes(stages, departureUtc, progress);
  const number = (value: number | null, unit: string) => value === null ? 'Pending' : `${value.toFixed(2)} ${unit}`;
  const previousLanding = useRef<number | null>(null);
  useEffect(() => {
    if (times.landing !== null && previousLanding.current !== times.landing) { setProgress(0); setPlaying(true); }
    previousLanding.current = times.landing;
  }, [times.landing]);
  return <section className="as-flight-card" aria-label="Earth to Moon mission visualization" data-flight-progress={progress.toFixed(4)}>
    <div className="as-flight-heading">
      <div><span className="as-badge-tag">MISSION FLIGHT PATH</span><h2>Earth launch to lunar landing</h2><p>Flight preview with compressed time and distance.</p></div>
      <div className="as-flight-toggle" role="group" aria-label="Flight path view"><button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button><button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D</button></div>
    </div>
    <div className="as-flight-visual">
      <div className="as-flight-scene-status">{previewPhase}<span>{Math.round(progress * 100)}%</span><time className="as-flight-clock">{flightDate(times.current)}</time></div>
      {view === '3d' ? <Flight3D progress={progress} profile={profile} routes={routes} /> : <svg viewBox="0 0 1000 500" role="img" aria-label={`Animated mission preview: ${previewPhase}`}>
        <defs><radialGradient id="asEarth"><stop stopColor="#7cb6e0"/><stop offset="1" stopColor="#316caa"/></radialGradient><radialGradient id="asMoon"><stop stopColor="#d0d1dd"/><stop offset="1" stopColor="#858fa9"/></radialGradient></defs>
        <circle cx="185" cy="275" r="54.6" fill="url(#asEarth)"/><circle cx="815" cy="275" r="45.15" fill="url(#asMoon)"/>
        {route2d.map((path, i) => <path key={i} d={path} fill="none" stroke="#536480" strokeWidth={1.5} />)}
        <path d={travelled2d} fill="none" stroke="#c3b5ee" strokeWidth="2.5"/>
        <g transform={`translate(${x} ${y}) rotate(${angle})`}><path d="M0 -13 L6 -4 L6 7 L-6 7 L-6 -4 Z" fill="#f2e8d5" stroke="#b49b68"/><path d="M-20 -2 H-6 V4 H-20 Z M6 -2 H20 V4 H6 Z" fill="#5082d4"/>{phase !== 1 && phase !== 4 && <path d="M-4 8 L0 24 L4 8" fill="#ffba58"/>}</g>
        <text x="151" y="363">EARTH</text><text x="785" y="353">MOON</text>
      </svg>}
    </div>
    <div className="as-flight-playback">
      <button type="button" className="as-btn-secondary" onClick={() => { if (progress >= 1) setProgress(0); setPlaying(p => !p); }} aria-label={playing ? 'Pause flight animation' : 'Play flight animation'}>{playing ? <Pause size={15}/> : <Play size={15}/>} {playing ? 'Pause' : 'Play'}</button>
      <button type="button" className="as-btn-secondary" onClick={() => { setProgress(0); setPlaying(true); }} aria-label="Replay flight animation"><RotateCcw size={15}/> Replay</button>
      <label>Flight timeline<input type="range" min="0" max="1" step="0.001" value={progress} onChange={e => { setPlaying(false); setProgress(Number(e.target.value)); }} aria-label="Flight animation timeline"/></label>
      <span>{previewPhase}</span>
    </div>
    <div className="as-flight-phases">{phaseNames.map((name, index) => {
      const Icon = phaseIcons[index]; const state = statuses[phaseNodes[index]];
      return <div key={name} className={`as-flight-phase is-${state}${phase === index ? ' is-preview-active' : ''}`}><Icon size={17}/><span>{name}</span><small>Agent: {state === 'running' ? 'Running' : state === 'completed' || state === 'warning' ? 'Completed' : state === 'failed' ? 'Failed' : 'Waiting'}</small></div>;
    })}</div>
    <div className="as-flight-dates" aria-label="Mission dates">
      <div><span>Simulation time</span><time>{flightDate(times.current)}</time></div>
      <div><span>Earth departure</span><time>{flightDate(times.departure)}</time></div>
      <div><span>Lunar injection</span><time>{flightDate(times.injection)}</time></div>
      <div><span>Lunar arrival</span><time>{flightDate(times.arrival)}</time></div>
      <div><span>Lunar landing</span><time>{flightDate(times.landing)}</time></div>
    </div>
    <div className="as-flight-facts"><span>Earth parking <strong>{profile.parkingOrbits} orbit(s)</strong></span>{raised && <span>Earth staging <strong>{profile.stagingOrbits} orbit(s) at {profile.stagingAltitude.toLocaleString()} km</strong></span>}<span>TLI <strong>{number(times.tli, 'km/s')}</strong></span><span>Coast <strong>{number(times.coast, 'days')}</strong></span><span>Capture <strong>{number(times.capture, 'km/s')}</strong></span></div>
  </section>;
}

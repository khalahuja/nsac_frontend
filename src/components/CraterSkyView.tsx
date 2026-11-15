import { API } from '../lib/apiEndpoints';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { ArrowLeft, Eye, Pause, Play, Sun, ZoomIn, ZoomOut } from 'lucide-react';
import * as THREE from 'three';
import { createEarthTexture } from '../utils/textures';
import { skyTrackPosition, skyTrackSegments, skyTrackWindow } from '../lib/skyTrack';
import { computeEquilibriumConditions } from '../lib/lunarPhysics';
import { formatZonedDateTime } from '../lib/time';
import { SOUTH_POLE_FEATURES } from '../lib/southPole';
import type { EnvironmentResult, LunarCoordinate } from '../lib/lunar';
import '../surfaceview.css';


type TrackSample = { datetime_utc: string; solar_azimuth_deg: number; solar_elevation_deg: number; earth_azimuth_deg: number | null; earth_elevation_deg: number | null; earth_distance_km: number | null };
type Props = {
  coordinate: LunarCoordinate; siteName: string; instant: string; timeZone: string;
  environment: EnvironmentResult | null; onInstantChange: (instant: string) => void; onExit: () => void;
};

const EYE = 1.65;
const SKY = 180;
const SUN_COLOR = '#facc15';
const EARTH_COLOR = '#3b82f6';
// Longitude libration follows the ~27.55-day anomalistic month, not the solar day.
// https://svs.gsfc.nasa.gov/5195 (latitude has a different period, so do not close the line).
const EARTH_TRACK_DAYS = 27.55;

/** North = −Z, east = +X; observer eye 1.65 m above the ground. */
export function skyDirection(azimuth: number, elevation: number, radius = SKY): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuth), el = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(radius * Math.cos(el) * Math.sin(az), EYE + radius * Math.sin(el), -radius * Math.cos(el) * Math.cos(az));
}

// Deterministic value noise, so the landscape is the same on every visit.
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) {
  let total = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 5; i++) { total += amp * noise(x * freq, y * freq); amp *= 0.5; freq *= 2.03; }
  return total;
}

/** Simple-crater profile: bowl below 1 radius, raised rim, ejecta falling off outside. */
function craterProfile(r: number) {
  if (r < 1) return -0.55 * (1 - r * r) + 0.12;
  return 0.12 * Math.exp(-((r - 1) ** 2) / 0.08) + 0.06 * Math.exp(-(r - 1) * 2.2);
}

type SmallCrater = { x: number; z: number; radius: number };
const SMALL_CRATERS: SmallCrater[] = Array.from({ length: 70 }, (_, i) => {
  const angle = hash(i, 3) * Math.PI * 2;
  const distance = 6 + hash(i, 7) ** 0.7 * 110;
  const radius = 0.6 + hash(i, 11) ** 3 * 9;
  return { x: Math.sin(angle) * distance, z: -Math.cos(angle) * distance, radius };
});

/**
 * Illustrative regolith landscape: an observer standing in a shallow basin,
 * surrounded by a rough rim, littered with dusty bowl-shaped craters.
 * Heights are not a DEM of the site.
 */
function landscapeGeometry(basinScale = 1): THREE.BufferGeometry {
  const size = 280, segments = 220;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const d = Math.hypot(x, z);
    // Basin floor rising to an irregular rim near 70–100 m.
    const rim = 85 + 18 * (fbm(Math.atan2(x, z) * 2 + 5, 1.3) - 0.5);
    let h = 7 * basinScale * craterProfile(d / rim) + 0.4 * basinScale;
    h += (fbm(x * 0.045, z * 0.045) - 0.5) * 4.5 * basinScale + (fbm(x * 0.4, z * 0.4) - 0.5) * 0.35;
    let shade = 0.62 + (fbm(x * 0.09 + 30, z * 0.09) - 0.5) * 0.35;
    for (const c of SMALL_CRATERS) {
      const r = Math.hypot(x - c.x, z - c.z) / c.radius;
      if (r < 2.4) {
        h += c.radius * 0.35 * craterProfile(r) * (d < 3 ? 0 : 1);
        if (r > 0.85 && r < 1.25) shade += 0.18;      // fresh bright rim
        else if (r < 0.85) shade -= 0.12 * (1 - r);    // dusty darker floor
      }
    }
    h *= Math.min(1, d / 4);                           // flat spot where the observer stands
    position.setY(i, h);
    const g = Math.max(0.18, Math.min(0.95, shade));
    colors[i * 3] = g; colors[i * 3 + 1] = g * 0.985; colors[i * 3 + 2] = g * 0.96;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Fine regolith grain, tiled across the ground. */
function grainTexture(): THREE.Texture {
  const n = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 150 + (fbm(x * 0.08, y * 0.08) - 0.5) * 90 + (hash(x, y) - 0.5) * 70;
    const k = (y * n + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.max(0, Math.min(255, v));
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(70, 70);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture(color: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.25, color + 'aa');
  gradient.addColorStop(1, color + '00');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

type SkylinePoint = { azimuth_deg: number; elevation_deg: number | null };
const SKYLINE_RADIUS = 160;

/** Measured terrain horizon (LOLA DEM, out to 150 km) drawn as a distant ridge ring. */
function skylineGeometry(points: SkylinePoint[]): THREE.BufferGeometry {
  const known = points.filter((p) => p.elevation_deg !== null) as { azimuth_deg: number; elevation_deg: number }[];
  const ring = [...known, { ...known[0], azimuth_deg: known[0].azimuth_deg + 360 }];
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  ring.forEach((p, i) => {
    const top = skyDirection(p.azimuth_deg, p.elevation_deg, SKYLINE_RADIUS);
    const bottom = skyDirection(p.azimuth_deg, Math.min(p.elevation_deg, 0) - 6, SKYLINE_RADIUS);
    vertices.push(top.x, top.y, top.z, bottom.x, bottom.y, bottom.z);
    const g = 0.55 + 0.25 * noise(i * 0.7, 2.1);
    colors.push(g, g, g * 0.98, 0.22, 0.22, 0.22);
    if (i < ring.length - 1) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Skyline({ points }: { points: SkylinePoint[] }) {
  const geometry = useMemo(() => skylineGeometry(points), [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const line = useMemo(() => {
    const known = points.filter((p) => p.elevation_deg !== null) as { azimuth_deg: number; elevation_deg: number }[];
    return [...known, known[0]].map((p) => skyDirection(p.azimuth_deg, p.elevation_deg, SKYLINE_RADIUS - 0.5));
  }, [points]);
  return <>
    <mesh geometry={geometry}><meshStandardMaterial vertexColors roughness={1} side={THREE.DoubleSide} /></mesh>
    <ThinLine points={line} color="#94a3b8" opacity={0.35} />
  </>;
}

function ObserverCamera({ heading, pitch, fov }: { heading: number; pitch: number; fov: number }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(0, EYE, 0);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.lookAt(skyDirection(heading, pitch));
    invalidate();
  }, [camera, heading, pitch, fov, invalidate]);
  return null;
}

/**
 * One-pixel line in clip space. (Screen-space "fat" lines smear segments that
 * pass behind the camera into streaks across the view.)
 */
function ThinLine({ points, color, opacity = 1, overlay = false }: { points: THREE.Vector3[]; color: string; opacity?: number; overlay?: boolean }) {
  // Declarative resources stay attached to one scene object as samples change.
  // Avoid swapping primitive objects, which can leave earlier tracks attached.
  const positions = useMemo(() => {
    const vertices = new Float32Array(Math.max(0, points.length - 1) * 6);
    for (let i = 1; i < points.length; i++) {
      points[i - 1].toArray(vertices, (i - 1) * 6);
      points[i].toArray(vertices, (i - 1) * 6 + 3);
    }
    return vertices;
  }, [points]);
  return <lineSegments renderOrder={overlay ? 10 : 0}>
    <bufferGeometry key={positions.length}>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} />
    </bufferGeometry>
    <lineBasicMaterial color={color} linewidth={1} transparent={opacity < 1} opacity={opacity} depthTest={true} depthWrite={false} toneMapped={false} />
  </lineSegments>;
}

/** Label at the highest point of a sky path. */
function PathLabel({ points, text, className }: { points: THREE.Vector3[]; text: string; className: string }) {
  const top = points.reduce((best, p) => (p.y > best.y ? p : best), points[0]);
  return (
    <Html position={top} center zIndexRange={[12, 0]}>
      <span className={`sv-path-label ${className}`}>{text}</span>
    </Html>
  );
}

function Compass() {
  return <>
    {([['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]] as const).map(([label, az]) => (
      <Html key={label} position={skyDirection(az, 0.4, 150)} center zIndexRange={[10, 0]}>
        <span className={`sv-compass${label.length === 1 ? ' is-cardinal' : ''}`}>{label}</span>
      </Html>
    ))}
  </>;
}

function Scene({ environment, heading, pitch, fov, paths, tracks, earthAvailable, skyline }: {
  skyline: SkylinePoint[] | null;
  earthAvailable: boolean; environment: EnvironmentResult; heading: number; pitch: number; fov: number; paths: boolean;
  tracks: { sun: THREE.Vector3[][]; earth: THREE.Vector3[][] };
}) {
  const terrain = useMemo(() => landscapeGeometry(skyline ? 0.12 : 1), [skyline]);
  const grain = useMemo(grainTexture, []);
  const earthTexture = useMemo(createEarthTexture, []);
  const sunGlow = useMemo(() => glowTexture('#fff3b0'), []);
  const earthGlow = useMemo(() => glowTexture('#7fb4ff'), []);
  useEffect(() => () => { terrain.dispose(); grain.dispose(); earthTexture.dispose(); sunGlow.dispose(); earthGlow.dispose(); }, [terrain, grain, earthTexture, sunGlow, earthGlow]);

  const sunEl = environment.solar.elevation_deg;
  const night = sunEl <= 0;
  // Fraction of Earth's disk that is sunlit, seen from the Moon (opposite of the lunar phase).
  const earthPhase = (() => {
    const s = skyDirection(environment.solar.azimuth_deg, sunEl, 1).sub(new THREE.Vector3(0, EYE, 0)).normalize();
    const e = skyDirection(environment.positions.earth.azimuth_deg, environment.positions.earth.elevation_deg, 1).sub(new THREE.Vector3(0, EYE, 0)).normalize();
    return Math.max(0.15, (1 - s.dot(e)) / 2);
  })();
  const sun = skyDirection(environment.solar.azimuth_deg, sunEl);
  const earth = skyDirection(environment.positions.earth.azimuth_deg, environment.positions.earth.elevation_deg);
  // True angular sizes: Sun ~0.53°, Earth ~1.9° from the Moon.
  const sunRadius = SKY * Math.tan(THREE.MathUtils.degToRad(0.267));
  const earthRadius = SKY * 6371 / environment.positions.earth.distance_km;
  // Low Sun → long hard shadows; a little Earthshine on the night side.
  const sunlight = sunEl > -0.5 ? Math.min(3.2, 0.6 + Math.max(0, sunEl) * 0.45) : 0;
  const lightPos = skyDirection(environment.solar.azimuth_deg, Math.max(sunEl, 0.5), 120);

  return <>
    <ObserverCamera heading={heading} pitch={pitch} fov={fov} />
    <color attach="background" args={['#010203']} />
    {/* Night side: Earth (up to ~50x brighter than a full Moon seen from Earth) lights the ground.
        The scene is exposed like a long-exposure camera so the regolith stays visible. */}
    <ambientLight intensity={night ? 0.55 : 0.08} color={night ? '#c9d6ee' : '#ffffff'} />
    <hemisphereLight args={[night ? '#8fa8d8' : '#ffffff', '#1a1a1a', night ? 0.6 : 0.12]} />
    {earthAvailable && environment.positions.earth.elevation_deg > 0 && (
      <directionalLight position={earth} intensity={night ? 1.4 * earthPhase : 0.08} color="#bcd3ff" />
    )}
    <directionalLight
      position={lightPos}
      intensity={sunlight}
      color="#fff6e6"
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-120}
      shadow-camera-right={120}
      shadow-camera-top={120}
      shadow-camera-bottom={-120}
      shadow-camera-near={1}
      shadow-camera-far={400}
      shadow-bias={-0.0006}
    />
    {skyline && <Skyline points={skyline} />}
    <mesh geometry={terrain} receiveShadow castShadow>
      <meshStandardMaterial vertexColors map={grain} roughness={1} metalness={0} color={night ? '#d8dde6' : '#ffffff'} />
    </mesh>

    {sunEl > -1 && <>
      <mesh position={sun}><sphereGeometry args={[sunRadius, 24, 16]} /><meshBasicMaterial color="#fffbe8" toneMapped={false} /></mesh>
      <sprite position={sun} scale={[sunRadius * 16, sunRadius * 16, 1]}>
        <spriteMaterial map={sunGlow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </>}
    {earthAvailable && <>
      <mesh position={earth} rotation={[0, Math.PI, 0]}><sphereGeometry args={[earthRadius, 32, 24]} /><meshBasicMaterial map={earthTexture} toneMapped={false} /></mesh>
      <sprite position={earth} scale={[earthRadius * 3.2, earthRadius * 3.2, 1]}>
        <spriteMaterial map={earthGlow} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </>}

    {paths && <>
      {tracks.sun.length > 0 && <>
        {tracks.sun.map((points, i) => <ThinLine key={i} points={points} color={SUN_COLOR} overlay />)}
        <PathLabel points={tracks.sun.flat()} text="Sun path · 1 lunar day" className="is-sun" />
      </>}
      {tracks.earth.length > 0 && <>
        {tracks.earth.map((points, i) => <ThinLine key={i} points={points} color={EARTH_COLOR} overlay />)}
        <PathLabel points={tracks.earth.flat()} text="Earth path (libration)" className="is-earth" />
        {/* Mark the actual sampled limits; libration is not an exactly closed ellipse. */}
        {[tracks.earth[0][0], tracks.earth[tracks.earth.length - 1].slice(-1)[0]].map((point, i) => (
          <mesh key={i} position={point}>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshBasicMaterial color={EARTH_COLOR} toneMapped={false} />
          </mesh>
        ))}
      </>}
    </>}
    <ThinLine points={Array.from({ length: 73 }, (_, i) => skyDirection(i * 5, 0, 170))} color="#475569" opacity={0.5} />
    <Compass />
  </>;
}

/** Small inset map: where the site is, and which way the observer is facing. */
function LocationMap({ coordinate, bearing, siteName }: { coordinate: LunarCoordinate; bearing: number; siteName: string }) {
  const polar = coordinate.lat <= -80;
  const size = 170, c = size / 2;
  if (polar) {
    const extent = 10, scale = (c - 8) / extent;
    const project = (lat: number, lon: number) => {
      const r = (90 + lat) * scale, a = (lon * Math.PI) / 180;
      return { x: c + r * Math.sin(a), y: c - r * Math.cos(a) };
    };
    const p = project(coordinate.lat, coordinate.lon);
    // On a south-polar map, local north points away from the pole.
    const northScreen = (Math.atan2(p.x - c, -(p.y - c)) * 180) / Math.PI;
    const facing = Math.abs(90 + coordinate.lat) < 1e-3 ? bearing : northScreen + bearing;
    return (
      <figure className="sv-map" aria-label={`Location map: ${siteName}`}>
        <svg viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={extent * scale} className="sv-map-ground" />
          {[2.5, 5, 7.5].map((d) => <circle key={d} cx={c} cy={c} r={d * scale} className="sv-map-ring" />)}
          {SOUTH_POLE_FEATURES.filter((f) => f.kind === 'crater' && 90 + f.lat < extent).map((f) => {
            const q = project(f.lat, f.lon);
            return <g key={f.name}>
              <circle cx={q.x} cy={q.y} r={Math.max(2, (f.diameterKm / 2 / 30.32) * scale)} className="sv-map-crater" />
              {f.diameterKm > 30 && <text x={q.x} y={q.y + 3} textAnchor="middle">{f.name}</text>}
            </g>;
          })}
          <circle cx={c} cy={c} r={1.8} fill="#cbd5e1" />
          <g transform={`translate(${p.x} ${p.y}) rotate(${facing})`}>
            <path d="M0 -15 L7 3 L0 -2 L-7 3 Z" className="sv-map-cone" />
          </g>
          <circle cx={p.x} cy={p.y} r={4} className="sv-map-site" />
        </svg>
        <figcaption>{Math.abs(coordinate.lat).toFixed(2)}°S {Math.abs(coordinate.lon).toFixed(2)}°{coordinate.lon < 0 ? 'W' : 'E'} · 80°S–pole</figcaption>
      </figure>
    );
  }
  const w = 170, h = 85;
  const x = ((coordinate.lon + 180) / 360) * w, y = ((90 - coordinate.lat) / 180) * h;
  return (
    <figure className="sv-map" aria-label={`Location map: ${siteName}`}>
      <svg viewBox={`0 0 ${w} ${h}`}>
        <rect width={w} height={h} className="sv-map-ground" />
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} className="sv-map-ring" />
        <line x1={w / 2} y1={0} x2={w / 2} y2={h} className="sv-map-ring" />
        <g transform={`translate(${x} ${y}) rotate(${bearing})`}><path d="M0 -11 L5 2 L0 -1 L-5 2 Z" className="sv-map-cone" /></g>
        <circle cx={x} cy={y} r={3.5} className="sv-map-site" />
      </svg>
      <figcaption>{Math.abs(coordinate.lat).toFixed(2)}°{coordinate.lat < 0 ? 'S' : 'N'} {Math.abs(coordinate.lon).toFixed(2)}°{coordinate.lon < 0 ? 'W' : 'E'}</figcaption>
    </figure>
  );
}

export function CraterSkyView({ coordinate, siteName, instant, timeZone, environment, onInstantChange, onExit }: Props) {
  const [heading, setHeading] = useState(environment?.positions.earth.azimuth_deg ?? 0);
  const [pitch, setPitch] = useState(Math.max(15, Math.min(45, environment?.positions.earth.elevation_deg ?? 20)));
  const [fov, setFov] = useState(85);
  const [mode, setMode] = useState<'selected' | 'live' | 'play'>('live');
  const [paths, setPaths] = useState(true);
  const instantRef = useRef(instant); instantRef.current = instant;
  const updateRef = useRef(onInstantChange); updateRef.current = onInstantChange;
  const drag = useRef<{ x: number; y: number; heading: number; pitch: number } | null>(null);

  useEffect(() => {
    if (mode === 'selected') return;
    const tick = () => updateRef.current(mode === 'live' ? new Date().toISOString() : new Date(Date.parse(instantRef.current) + 2 * 3600000).toISOString());
    if (mode === 'live') tick();
    const timer = window.setInterval(tick, mode === 'live' ? 20000 : 400);
    return () => window.clearInterval(timer);
  }, [mode]);

  const [skyline, setSkyline] = useState<{ points: SkylinePoint[]; source: string; elevation: number | null } | null>(null);
  useEffect(() => {
    const abort = new AbortController(); setSkyline(null);
    fetch(`${API}/api/surface/skyline`, {
      method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: coordinate.lat, longitude: coordinate.lon, step_deg: 2 })
    }).then(r => (r.ok ? r.json() : null))
      .then((data: { available: boolean; skyline: SkylinePoint[]; terrain_source: string; site_elevation_m: number | null } | null) => {
        if (!abort.signal.aborted && data?.available && data.skyline.some(p => p.elevation_deg !== null)) {
          setSkyline({ points: data.skyline, source: data.terrain_source, elevation: data.site_elevation_m });
        }
      }).catch(() => undefined);
    return () => abort.abort();
  }, [coordinate.lat, coordinate.lon]);
  const horizonAt = (az: number) => {
    if (!skyline) return null;
    const known = skyline.points.filter(p => p.elevation_deg !== null);
    const nearest = known.reduce((best, p) => Math.abs(((p.azimuth_deg - az + 540) % 360) - 180) < Math.abs(((best.azimuth_deg - az + 540) % 360) - 180) ? p : best, known[0]);
    return nearest.elevation_deg;
  };

  const day = instant.slice(0, 10);
  const [samples, setSamples] = useState<TrackSample[]>([]);
  useEffect(() => {
    const abort = new AbortController(); setSamples([]);
    fetch(`${API}/api/timeline`, {
      method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: coordinate.lat, longitude: coordinate.lon, center_datetime_utc: day + 'T12:00:00Z', hours_before: 354, hours_after: 354, step_hours: 1 })
    }).then(response => { if (!response.ok) throw new Error('Sky timeline unavailable'); return response.json(); })
      .then((data: { samples: TrackSample[] }) => { if (!abort.signal.aborted) setSamples(data.samples); })
      .catch(() => { if (!abort.signal.aborted) setSamples([]); });
    return () => abort.abort();
  }, [coordinate.lat, coordinate.lon, day]);

  const skySamples = useMemo(() => ({
    sun: samples.map(s => ({ datetime_utc: s.datetime_utc, azimuth: s.solar_azimuth_deg, elevation: s.solar_elevation_deg })),
    earth: samples.map(s => ({ datetime_utc: s.datetime_utc, azimuth: s.earth_azimuth_deg, elevation: s.earth_elevation_deg, distance: s.earth_distance_km }))
  }), [samples]);
  const earthTrackSamples = useMemo(() => {
    const center = Date.parse(day + 'T12:00:00Z');
    const halfWindow = EARTH_TRACK_DAYS * 24 * 3600000 / 2;
    return skyTrackWindow(skySamples.earth, new Date(center - halfWindow).toISOString(), new Date(center + halfWindow).toISOString(), 1);
  }, [skySamples.earth, day]);
  const tracks = useMemo(() => ({
    sun: skyTrackSegments(skySamples.sun, 1).filter(segment => segment.length > 1)
      .map(segment => segment.map(s => skyDirection(s.azimuth!, s.elevation!))),
    earth: skyTrackSegments(earthTrackSamples, 1).filter(segment => segment.length > 1)
      .map(segment => segment.map(s => skyDirection(s.azimuth!, s.elevation!)))
  }), [skySamples.sun, earthTrackSamples]);

  let conditions = environment ?? computeEquilibriumConditions(coordinate, instant);
  // Use the track's position at the selected time even while environment requests lag.
  // Interpolating sightline vectors also avoids false turns at 0/360 degrees or zenith.
  const sunPosition = skyTrackPosition(skySamples.sun, instant, 1);
  const earthPosition = skyTrackPosition(skySamples.earth, instant, 1);
  if (sunPosition) {
    conditions = { ...conditions,
      solar: { ...conditions.solar, azimuth_deg: sunPosition.azimuth, elevation_deg: sunPosition.elevation },
      positions: { ...conditions.positions,
        sun: { ...conditions.positions.sun, azimuth_deg: sunPosition.azimuth, elevation_deg: sunPosition.elevation }
      }
    };
  }
  if (earthPosition) {
    conditions = { ...conditions, datetime_utc: instant,
      positions: { ...conditions.positions,
        earth: { ...conditions.positions.earth, azimuth_deg: earthPosition.azimuth, elevation_deg: earthPosition.elevation,
          distance_km: earthPosition.distance ?? conditions.positions.earth.distance_km, above_horizon: earthPosition.elevation > 0 }
      }, sources: { ...conditions.sources, astronomy: 'Astronomy timeline ? interpolated 1-hour samples' }
    };
  }
  const earthAvailable = earthPosition !== null;
  const look = (body: 'sun' | 'earth') => {
    const position = conditions.positions[body];
    setHeading(position.azimuth_deg); setPitch(Math.max(-20, Math.min(80, position.elevation_deg)));
    setFov(body === 'earth' ? 25 : 45);
  };
  const bearing = ((heading % 360) + 360) % 360;
  const zoom = (factor: number) => setFov(f => Math.max(8, Math.min(90, f * factor)));
  const sunEl = conditions.solar.elevation_deg;
  const earthEl = conditions.positions.earth.elevation_deg;
  const sunHorizon = horizonAt(conditions.solar.azimuth_deg);
  const earthHorizon = horizonAt(conditions.positions.earth.azimuth_deg);
  const status = (el: number, horizon: number | null) =>
    el < 0 ? ' (below horizon)' : horizon !== null && el <= horizon ? ` (hidden by terrain, ridge ${horizon.toFixed(1)}°)` : horizon !== null ? ' (in view)' : '';

  return <section className="crater-view sv-view" aria-label="View from the lunar surface">
    <div className="crater-canvas"
      onWheel={event => zoom(event.deltaY > 0 ? 1.1 : 0.9)}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, heading, pitch };
      }} onPointerMove={event => {
        if (!drag.current) return;
        const k = fov / 85;
        setHeading(drag.current.heading - (event.clientX - drag.current.x) * 0.2 * k);
        setPitch(Math.max(-30, Math.min(85, drag.current.pitch + (event.clientY - drag.current.y) * 0.15 * k)));
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <Canvas shadows camera={{ position: [0, EYE, 0], fov: 70, near: 0.05, far: 400 }} frameloop="demand" dpr={[1, 1.5]} gl={{ antialias: true }}>
        <Scene earthAvailable={earthAvailable} environment={conditions} heading={heading} pitch={pitch} fov={fov} paths={paths} tracks={tracks} skyline={skyline?.points ?? null} />
      </Canvas>
    </div>

    <header className="crater-heading">
      <button type="button" onClick={onExit}><ArrowLeft size={16} /> Back to globe</button>
      <div><h2>Surface view</h2><p>{siteName}{skyline?.elevation != null && ` · ${Math.round(skyline.elevation).toLocaleString()} m`}</p></div>
    </header>

    <div className="sv-readouts">
      <span className="sv-time">{mode === 'live' ? <b className="sv-live">LIVE</b> : mode === 'play' ? <b>Time lapse</b> : null}{formatZonedDateTime(instant, timeZone)}</span>
      {sunEl <= 0 && <span className="sv-night">Lunar night · ground lit by earthshine (exposure boosted)</span>}
      <span><i className="sv-dot is-sun" />Sun {sunEl.toFixed(1)}° up · bearing {conditions.solar.azimuth_deg.toFixed(0)}°{status(sunEl, sunHorizon)}</span>
      <span><i className="sv-dot is-earth" />Earth {earthAvailable ? `${earthEl.toFixed(1)}° up · bearing ${conditions.positions.earth.azimuth_deg.toFixed(0)}°${status(earthEl, earthHorizon)}` : 'needs the analysis server'}</span>
    </div>

    <LocationMap coordinate={coordinate} bearing={bearing} siteName={siteName} />

    <div className="sv-zoom" role="group" aria-label="Zoom">
      <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom in"><ZoomIn size={18} /></button>
      <span>{(85 / fov).toFixed(1)}×</span>
      <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom out"><ZoomOut size={18} /></button>
    </div>

    <div className="crater-controls">
      <div className="crater-actions">
        <button type="button" onClick={() => look('sun')}><Sun size={16} /> Look at Sun</button>
        <button type="button" disabled={!earthAvailable} onClick={() => look('earth')}><Eye size={16} /> Look at Earth</button>
        <button type="button" aria-pressed={mode === 'live'} onClick={() => setMode(mode === 'live' ? 'selected' : 'live')}>Live now</button>
        <button type="button" aria-pressed={mode === 'play'} onClick={() => setMode(mode === 'play' ? 'selected' : 'play')}>{mode === 'play' ? <Pause size={16} /> : <Play size={16} />} {mode === 'play' ? 'Pause' : 'Time lapse'}</button>
        <label><input type="checkbox" disabled={!samples.length} checked={paths} onChange={event => setPaths(event.target.checked)} /> Sky paths <i className="sv-dot is-sun" /> Sun <i className="sv-dot is-earth" /> Earth</label>
      </div>
      <div className="crater-look-controls">
        <label>Bearing {bearing.toFixed(0)}°<input type="range" min="0" max="360" value={bearing} onChange={event => setHeading(Number(event.target.value))} /></label>
        <label>Look up {pitch.toFixed(0)}°<input type="range" min="-30" max="85" value={pitch} onChange={event => setPitch(Number(event.target.value))} /></label>
      </div>
      <p>Drag to look around, scroll to zoom. At night the scene is exposed like a long-exposure camera; the ground is lit by earthshine. Sun and Earth positions are computed for this site and time; the Sun path covers one lunar day (±14.75 days), while the Earth path spans about 27.55 days of libration. Blue endpoint dots mark the sampled limits; the path need not close exactly. {skyline ? `The distant skyline is measured terrain (${skyline.source}, out to 150 km); the nearby ground and small craters are illustrative.` : (coordinate.lat <= -80 ? 'The ground is an illustrative regolith landscape; install the LOLA polar DEM to see the real skyline.' : 'The ground is an illustrative regolith landscape; the installed LOLA DEM covers 80°S to the pole, so this site has no measured skyline.')} Sun and Earth are drawn at true angular size. The yellow Sun path and blue Earth path are hidden wherever the lunar terrain blocks the view.</p>
      <small>Positions: {conditions.sources.astronomy}{!earthAvailable && ' · Connect the analysis server for Earth positions and sky paths.'}</small>
    </div>
  </section>;
}

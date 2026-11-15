import { useMemo } from 'react';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

/** One alt-az sample of a body's track across the local sky. */
export type SkyTrackPoint = { azimuthDeg: number; elevationDeg: number };

export type HorizonSky3DProps = {
  sun: { azimuthDeg: number; elevationDeg: number; visible: boolean };
  earth: { azimuthDeg: number; elevationDeg: number; visible: boolean };
  /** Sun positions over the sampled window, from the backend timeline. */
  sunTrack: SkyTrackPoint[];
  /** Earth positions over the same window (its libration loop). */
  earthTrack: SkyTrackPoint[];
  /**
   * Vertical exaggeration applied to elevations for display only. Polar sites
   * see the Sun and Earth within a few degrees of the horizon, which is
   * invisible at true scale. 1 = true geometry.
   */
  exaggeration: number;
};

/** Dome radius in scene units. */
const R = 10;

/**
 * Exaggerate an elevation for display without letting it pass the zenith.
 * Scaling the tangent keeps 0 deg at 0 deg and 90 deg at 90 deg, and is
 * near-linear for the small angles where exaggeration actually matters.
 */
function displayElevation(elevationDeg: number, factor: number): number {
  if (factor === 1) return elevationDeg;
  const e = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(elevationDeg, -89.9, 89.9));
  return THREE.MathUtils.radToDeg(Math.atan(Math.tan(e) * factor));
}

/**
 * Local horizon frame to scene coordinates.
 * North = -Z, East = +X, Up = +Y; azimuth is clockwise from North.
 */
function altAzToVector(azimuthDeg: number, elevationDeg: number, radius = R): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(
    radius * Math.cos(el) * Math.sin(az),
    radius * Math.sin(el),
    -radius * Math.cos(el) * Math.cos(az)
  );
}

/** Horizontal circle at a fixed elevation (altitude ring). */
function altitudeRing(elevationDeg: number, segments = 128): THREE.Vector3[] {
  return Array.from({ length: segments + 1 }, (_, i) =>
    altAzToVector((i / segments) * 360, elevationDeg)
  );
}

/** Quarter great circle from horizon to zenith at a fixed azimuth. */
function meridian(azimuthDeg: number, segments = 48): THREE.Vector3[] {
  return Array.from({ length: segments + 1 }, (_, i) =>
    altAzToVector(azimuthDeg, (i / segments) * 90)
  );
}

function trackPoints(track: SkyTrackPoint[], factor: number): THREE.Vector3[] {
  return track.map((p) =>
    altAzToVector(p.azimuthDeg, displayElevation(p.elevationDeg, factor), R * 0.995)
  );
}

function Body({
  label, color, azimuthDeg, elevationDeg, visible, size, factor
}: {
  label: string;
  color: string;
  azimuthDeg: number;
  elevationDeg: number;
  visible: boolean;
  size: number;
  factor: number;
}) {
  const position = altAzToVector(azimuthDeg, displayElevation(elevationDeg, factor));
  const footprint = altAzToVector(azimuthDeg, 0);
  footprint.y = 0.01;

  return (
    <group>
      {/* Line of sight from the observer: the antenna or panel pointing ray. */}
      <Line
        points={[[0, 0.15, 0], position.toArray()]}
        color={color}
        lineWidth={1.5}
        transparent
        opacity={visible ? 0.85 : 0.3}
        dashed={!visible}
        dashSize={0.3}
        gapSize={0.2}
      />
      {/* Drop line to the horizon, so the azimuth reads at a glance. */}
      <Line points={[position.toArray(), footprint.toArray()]} color={color} lineWidth={1} transparent opacity={0.35} />
      <mesh position={position}>
        <sphereGeometry args={[size, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={visible ? 1 : 0.4} />
      </mesh>
      <mesh position={position}>
        <sphereGeometry args={[size * 1.9, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={visible ? 0.18 : 0.06} depthWrite={false} />
      </mesh>
      <Html position={position} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <div className="hz3-label" style={{ borderColor: color, transform: 'translateY(-38px)' }}>
          <b style={{ color }}>{label}</b>
          <span>
            {elevationDeg >= 0 ? '+' : ''}
            {elevationDeg.toFixed(2)}&deg; alt &middot; {azimuthDeg.toFixed(1)}&deg; az
          </span>
          {!visible && <em>below horizon</em>}
        </div>
      </Html>
    </group>
  );
}

const CARDINALS: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
const MERIDIAN_AZIMUTHS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

function SkyScene({ sun, earth, sunTrack, earthTrack, exaggeration }: HorizonSky3DProps) {
  const rings = useMemo(
    () => [10, 30, 60].map((e) => ({ e, pts: altitudeRing(displayElevation(e, exaggeration)) })),
    [exaggeration]
  );
  const horizon = useMemo(() => altitudeRing(0), []);
  const meridians = useMemo(() => MERIDIAN_AZIMUTHS.map((a) => meridian(a)), []);
  const sunPath = useMemo(() => trackPoints(sunTrack, exaggeration), [sunTrack, exaggeration]);
  const earthPath = useMemo(() => trackPoints(earthTrack, exaggeration), [earthTrack, exaggeration]);

  return (
    <>
      {/* Ground: the local lunar surface. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <circleGeometry args={[R * 1.08, 96]} />
        <meshBasicMaterial color="#2a2b30" />
      </mesh>
      <gridHelper args={[R * 2.1, 21, '#4b4f5c', '#34363f']} position-y={0.005} />

      {/* Sky dome shell (upper hemisphere only). */}
      <mesh>
        <sphereGeometry args={[R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#0d1830" transparent opacity={0.28} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Horizon and altitude rings. */}
      <Line points={horizon} color="#e2e8f0" lineWidth={2} />
      {rings.map(({ e, pts }) => (
        <group key={e}>
          <Line
            points={pts}
            color={e === 10 ? '#fbbf24' : '#64748b'}
            lineWidth={1}
            transparent
            opacity={e === 10 ? 0.7 : 0.45}
            dashed
            dashSize={0.25}
            gapSize={0.2}
          />
          <Html position={pts[32]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
            <span className="hz3-ring">+{e}&deg;</span>
          </Html>
        </group>
      ))}
      {meridians.map((pts, i) => (
        <Line key={i} points={pts} color="#64748b" lineWidth={0.8} transparent opacity={0.22} />
      ))}

      {/* Cardinal points on the horizon. */}
      {CARDINALS.map(([name, az]) => (
        <Html key={name} position={altAzToVector(az, 0, R * 1.13)} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <span className={`hz3-cardinal ${name === 'N' ? 'is-north' : ''}`}>{name}</span>
        </Html>
      ))}

      {/* Real tracks from the backend timeline; omitted when unavailable. */}
      {sunPath.length > 1 && <Line points={sunPath} color="#fbbf24" lineWidth={2} transparent opacity={0.75} />}
      {earthPath.length > 1 && <Line points={earthPath} color="#38bdf8" lineWidth={2} transparent opacity={0.75} />}

      {/* Observer / lander at the site. */}
      <mesh position-y={0.15}>
        <cylinderGeometry args={[0.18, 0.28, 0.3, 16]} />
        <meshBasicMaterial color="#e5e7eb" />
      </mesh>

      <Body label="Sun" color="#fbbf24" size={0.42} factor={exaggeration} {...sun} />
      <Body label="Earth" color="#38bdf8" size={0.36} factor={exaggeration} {...earth} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={6}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2 - 0.02}
        target={[0, 1, 0]}
      />
    </>
  );
}

/**
 * 3D topocentric sky: the local horizon as seen by a lander at the site, with
 * the Sun and Earth at their true azimuth/elevation (optionally vertically
 * exaggerated, always labelled) and their real tracks over the sampled window.
 */
export function HorizonSky3D(props: HorizonSky3DProps) {
  return (
    <Canvas
      // Viewed from the south, looking north and slightly down: North sits at
      // the back, East on the right, West on the left, the whole dome in frame.
      camera={{ position: [0, 13, 24], fov: 45, near: 0.1, far: 200 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={['#04070e']} />
      <SkyScene {...props} />
    </Canvas>
  );
}

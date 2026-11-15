import { Html, OrbitControls, Stars } from '@react-three/drei';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import {
  Camera, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3,
  Crosshair, Download, FileSpreadsheet, LocateFixed, MapPin, Maximize2, Moon,
  Orbit, Play, RotateCcw, Sun
} from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  Crater, EARTH_RADIUS, EARTH_TEXTURE_URL, EnvironmentResult, ForecastResult,
  LunarCoordinate, MOON_RADIUS, MOON_TEXTURE_URL, createEarthTexture,
  createMoonTexture, latLonToVector3, vector3ToLatLon
} from '../lib/lunar';
import { ForecastChart } from './ForecastChart';

type PlanetName = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
type FocusBody = 'sun' | PlanetName | 'moon';
type StaticView = 'free' | 'top' | 'bottom' | 'left' | 'right';
type ViewName = StaticView | FocusBody;
type PanelName = 'system' | 'location' | 'environment' | 'forecast';
type MoonGroupRef = React.MutableRefObject<THREE.Group | null>;
type BodyRefs = React.MutableRefObject<Partial<Record<FocusBody, THREE.Group | null>>>;

type PlanetDefinition = {
  name: PlanetName;
  label: string;
  semiMajorAxisAu: number;
  eccentricity: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  longitudePerihelionDeg: number;
  meanLongitudeDeg: number;
  ratesPerCentury: {
    semiMajorAxisAu: number;
    eccentricity: number;
    inclinationDeg: number;
    meanLongitudeDeg: number;
    longitudePerihelionDeg: number;
    ascendingNodeDeg: number;
  };
  periodDays: number;
  radius: number;
  color: string;
  axialTiltDeg: number;
  rotationPeriodDays: number;
  rings?: { inner: number; outer: number; color: string };
};

type SceneState = {
  instant?: string;
  hovered: LunarCoordinate | null;
  coordinate: LunarCoordinate | null;
  craters: Crater[];
  view: ViewName;
  showCraters: boolean;
  showOrbits: boolean;
  timeScale: number;
  navigationKey: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_BASE ?? '';
const MOON_ORBIT_RADIUS = 6.4;
const MOON_ORBIT_ECCENTRICITY = 0.0549;
const MOON_ORBIT_DAYS = 27.321661;
const MOON_ORBIT_INCLINATION = THREE.MathUtils.degToRad(5.145);
const SIMULATED_DAYS_PER_SECOND = 1;
/**
 * Planet display radius, in units, from the body's true equatorial radius.
 *
 * Sizes are kept in correct proportion *to each other* — Jupiter really is
 * 11.2x Earth and Mercury 0.38x — then scaled up by a single constant so the
 * small bodies stay visible. They are deliberately NOT to scale against orbit
 * distances: at true scale Earth would be 0.0004 units across next to a
 * 60-unit orbital radius, i.e. invisible.
 *
 * The Sun is the one exception (see SUN_DISPLAY_RADIUS): at a true 109x Earth
 * it would engulf Mercury's orbit.
 */
const EARTH_DISPLAY_RADIUS = 1.3;
const EARTH_RADIUS_KM = 6371;
const planetDisplayRadius = (equatorialRadiusKm: number) =>
  (equatorialRadiusKm / EARTH_RADIUS_KM) * EARTH_DISPLAY_RADIUS;

/** Sun radius, compressed. True scale (109x Earth = 142 units) is unusable. */
const SUN_DISPLAY_RADIUS = 9;

// JPL Solar System Dynamics, Table 1 (1800-2050): base elements at J2000
// and their rates per Julian century. https://ssd.jpl.nasa.gov/planets/approx_pos.html
// `radius` is derived from each body's real equatorial radius in km.
const PLANETS: PlanetDefinition[] = [
  { name: 'mercury', label: 'Mercury', semiMajorAxisAu: 0.38709927, eccentricity: 0.20563593, inclinationDeg: 7.00497902, ascendingNodeDeg: 48.33076593, longitudePerihelionDeg: 77.45779628, meanLongitudeDeg: 252.25032350, ratesPerCentury: { semiMajorAxisAu: 0.00000037, eccentricity: 0.00001906, inclinationDeg: -0.00594749, meanLongitudeDeg: 149472.67411175, longitudePerihelionDeg: 0.16047689, ascendingNodeDeg: -0.12534081 }, periodDays: 87.969, radius: planetDisplayRadius(2439.7), color: '#aaa59e', axialTiltDeg: 0.03, rotationPeriodDays: 58.646 },
  { name: 'venus', label: 'Venus', semiMajorAxisAu: 0.72333566, eccentricity: 0.00677672, inclinationDeg: 3.39467605, ascendingNodeDeg: 76.67984255, longitudePerihelionDeg: 131.60246718, meanLongitudeDeg: 181.97909950, ratesPerCentury: { semiMajorAxisAu: 0.00000390, eccentricity: -0.00004107, inclinationDeg: -0.00078890, meanLongitudeDeg: 58517.81538729, longitudePerihelionDeg: 0.00268329, ascendingNodeDeg: -0.27769418 }, periodDays: 224.701, radius: planetDisplayRadius(6051.8), color: '#d6aa68', axialTiltDeg: 177.36, rotationPeriodDays: -243.025 },
  { name: 'earth', label: 'Earth', semiMajorAxisAu: 1.00000261, eccentricity: 0.01671123, inclinationDeg: -0.00001531, ascendingNodeDeg: 0, longitudePerihelionDeg: 102.93768193, meanLongitudeDeg: 100.46457166, ratesPerCentury: { semiMajorAxisAu: 0.00000562, eccentricity: -0.00004392, inclinationDeg: -0.01294668, meanLongitudeDeg: 35999.37244981, longitudePerihelionDeg: 0.32327364, ascendingNodeDeg: 0 }, periodDays: 365.256, radius: planetDisplayRadius(6371.0), color: '#4f8bc9', axialTiltDeg: 23.44, rotationPeriodDays: 0.9973 },
  { name: 'mars', label: 'Mars', semiMajorAxisAu: 1.52371034, eccentricity: 0.09339410, inclinationDeg: 1.84969142, ascendingNodeDeg: 49.55953891, longitudePerihelionDeg: -23.94362959, meanLongitudeDeg: -4.55343205, ratesPerCentury: { semiMajorAxisAu: 0.00001847, eccentricity: 0.00007882, inclinationDeg: -0.00813131, meanLongitudeDeg: 19140.30268499, longitudePerihelionDeg: 0.44441088, ascendingNodeDeg: -0.29257343 }, periodDays: 686.980, radius: planetDisplayRadius(3389.5), color: '#bd6443', axialTiltDeg: 25.19, rotationPeriodDays: 1.026 },
  { name: 'jupiter', label: 'Jupiter', semiMajorAxisAu: 5.20288700, eccentricity: 0.04838624, inclinationDeg: 1.30439695, ascendingNodeDeg: 100.47390909, longitudePerihelionDeg: 14.72847983, meanLongitudeDeg: 34.39644051, ratesPerCentury: { semiMajorAxisAu: -0.00011607, eccentricity: -0.00013253, inclinationDeg: -0.00183714, meanLongitudeDeg: 3034.74612775, longitudePerihelionDeg: 0.21252668, ascendingNodeDeg: 0.20469106 }, periodDays: 4332.59, radius: planetDisplayRadius(69911), color: '#c89e79', axialTiltDeg: 3.13, rotationPeriodDays: 0.414 },
  { name: 'saturn', label: 'Saturn', semiMajorAxisAu: 9.53667594, eccentricity: 0.05386179, inclinationDeg: 2.48599187, ascendingNodeDeg: 113.66242448, longitudePerihelionDeg: 92.59887831, meanLongitudeDeg: 49.95424423, ratesPerCentury: { semiMajorAxisAu: -0.00125060, eccentricity: -0.00050991, inclinationDeg: 0.00193609, meanLongitudeDeg: 1222.49362201, longitudePerihelionDeg: -0.41897216, ascendingNodeDeg: -0.28867794 }, periodDays: 10759.22, radius: planetDisplayRadius(58232), color: '#d9c18a', axialTiltDeg: 26.73, rotationPeriodDays: 0.444, rings: { inner: 1.35, outer: 2.35, color: '#bfae82' } },
  { name: 'uranus', label: 'Uranus', semiMajorAxisAu: 19.18916464, eccentricity: 0.04725744, inclinationDeg: 0.77263783, ascendingNodeDeg: 74.01692503, longitudePerihelionDeg: 170.95427630, meanLongitudeDeg: 313.23810451, ratesPerCentury: { semiMajorAxisAu: -0.00196176, eccentricity: -0.00004397, inclinationDeg: -0.00242939, meanLongitudeDeg: 428.48202785, longitudePerihelionDeg: 0.40805281, ascendingNodeDeg: 0.04240589 }, periodDays: 30688.5, radius: planetDisplayRadius(25362), color: '#8bd4da', axialTiltDeg: 97.77, rotationPeriodDays: -0.718, rings: { inner: 1.35, outer: 1.72, color: '#8caaad' } },
  { name: 'neptune', label: 'Neptune', semiMajorAxisAu: 30.06992276, eccentricity: 0.00859048, inclinationDeg: 1.77004347, ascendingNodeDeg: 131.78422574, longitudePerihelionDeg: 44.96476227, meanLongitudeDeg: -55.12002969, ratesPerCentury: { semiMajorAxisAu: 0.00026291, eccentricity: 0.00005105, inclinationDeg: 0.00035372, meanLongitudeDeg: 218.45945325, longitudePerihelionDeg: -0.32241464, ascendingNodeDeg: -0.00508664 }, periodDays: 60182, radius: planetDisplayRadius(24622), color: '#557bdb', axialTiltDeg: 28.32, rotationPeriodDays: 0.671 }
];
const PLANET_BY_NAME = Object.fromEntries(PLANETS.map((planet) => [planet.name, planet])) as Record<PlanetName, PlanetDefinition>;
/**
 * Display units per astronomical unit.
 *
 * Orbits are drawn to **true relative scale**: a linear map from AU, with no
 * compression. That is what makes the system read correctly — the four
 * terrestrial planets crowd in near the Sun while the gas giants sit far out,
 * and each ellipse keeps its real eccentricity and inclination.
 *
 * An earlier logarithmic mapping (`12 + 25·log10(1 + 4a)`) squeezed the whole
 * system into a 2.9× radial range instead of the true 78×, which is precisely
 * why every orbit looked like an evenly spaced concentric circle.
 */
const AU_TO_UNITS = 60;

/** Semi-major axis in display units. Linear in AU — true to scale. */
const visualOrbitRadius = (semiMajorAxisAu: number) => semiMajorAxisAu * AU_TO_UNITS;
const staticCameraTargets: Record<StaticView, { position: [number, number, number]; target: [number, number, number] }> = {
  // Framed for the new true-to-scale distances (Jupiter 312u, Saturn 572u).
  // The default is an oblique ~28 deg view, which is what makes the orbital
  // inclinations and the off-centre Sun readable; a top-down view flattens
  // every ellipse into an apparent circle.
  free: { position: [230, 320, 560], target: [0, 0, 0] },
  top: { position: [0, 780, 0.01], target: [0, 0, 0] },
  bottom: { position: [0, -780, 0.01], target: [0, 0, 0] },
  left: { position: [0, 95, 700], target: [0, 0, 0] },
  right: { position: [0, 95, -700], target: [0, 0, 0] }
};

const isStaticView = (view: ViewName): view is StaticView => ['free', 'top', 'bottom', 'left', 'right'].includes(view);
const focusDistance = (view: FocusBody) => {
  if (view === 'sun') return 14;
  if (view === 'moon') return 4.1;
  return Math.max(4.4, PLANET_BY_NAME[view].radius * 4.2);
};

function CameraRig({ view, coordinate, navigationKey, moonGroup, bodyRefs }: {
  view: ViewName;
  coordinate: LunarCoordinate | null;
  navigationKey: number;
  moonGroup: MoonGroupRef;
  bodyRefs: BodyRefs;
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const desiredPosition = useRef(new THREE.Vector3());
  const desiredTarget = useRef(new THREE.Vector3());
  const trackedTarget = useRef(new THREE.Vector3());
  const animating = useRef(false);
  const { camera, size } = useThree();

  useEffect(() => {
    const isMobile = size.width < 700;
    const preset = isStaticView(view) ? staticCameraTargets[view] : staticCameraTargets.free;
    const target = new THREE.Vector3(...preset.target);
    const position = new THREE.Vector3(...preset.position);

    if (coordinate && navigationKey > 0 && moonGroup.current) {
      const localPoint = latLonToVector3(coordinate.lat, coordinate.lon, MOON_RADIUS * 1.015);
      const worldPoint = moonGroup.current.localToWorld(localPoint.clone());
      const moonCenter = moonGroup.current.getWorldPosition(new THREE.Vector3());
      const outward = worldPoint.clone().sub(moonCenter).normalize();
      target.copy(worldPoint);
      position.copy(worldPoint).add(outward.multiplyScalar(isMobile ? 4 : 3.1));
      position.y += isMobile ? 0.35 : 0.18;
    } else if (!isStaticView(view)) {
      const body = view === 'moon' ? moonGroup.current : bodyRefs.current[view];
      if (body) body.getWorldPosition(target);
      const distance = focusDistance(view);
      position.copy(target).add(new THREE.Vector3(distance * 0.35, distance * 0.28, distance));
    } else if (isMobile && view === 'free') {
      target.set(0, 0, 0);
      position.set(0, 72, 172);
    } else if (isMobile) {
      position.sub(target).multiplyScalar(1.38).add(target);
    }

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = isMobile ? 58 : 45;
      camera.updateProjectionMatrix();
    }
    desiredPosition.current.copy(position);
    desiredTarget.current.copy(target);
    trackedTarget.current.copy(target);
    animating.current = true;
  }, [bodyRefs, camera, coordinate, moonGroup, navigationKey, size.width, view]);

  useFrame(() => {
    if (!controls.current) return;
    if (animating.current) {
      camera.position.lerp(desiredPosition.current, 0.09);
      controls.current.target.lerp(desiredTarget.current, 0.11);
      controls.current.update();
      if (camera.position.distanceTo(desiredPosition.current) < 0.015 && controls.current.target.distanceTo(desiredTarget.current) < 0.015) {
        camera.position.copy(desiredPosition.current);
        controls.current.target.copy(desiredTarget.current);
        trackedTarget.current.copy(desiredTarget.current);
        animating.current = false;
      }
      return;
    }

    const trackedBody = !isStaticView(view) && !(view === 'moon' && coordinate)
      ? (view === 'moon' ? moonGroup.current : bodyRefs.current[view])
      : null;
    if (trackedBody) {
      const nextTarget = trackedBody.getWorldPosition(new THREE.Vector3());
      const movement = nextTarget.clone().sub(trackedTarget.current);
      camera.position.add(movement);
      controls.current.target.copy(nextTarget);
      trackedTarget.current.copy(nextTarget);
      controls.current.update();
    }
  });

  return <OrbitControls ref={controls} enableDamping dampingFactor={0.065} minDistance={0.75} maxDistance={4200} zoomSpeed={0.82} rotateSpeed={0.58} panSpeed={0.62} onStart={() => { animating.current = false; }} makeDefault />;
}

function orientOrbitalPoint(point: THREE.Vector3, inclination = 0, ascendingNode = 0, argumentPerihelion = 0) {
  const cosNode = Math.cos(ascendingNode);
  const sinNode = Math.sin(ascendingNode);
  const cosPerihelion = Math.cos(argumentPerihelion);
  const sinPerihelion = Math.sin(argumentPerihelion);
  const cosInclination = Math.cos(inclination);
  const sinInclination = Math.sin(inclination);
  const xPerihelion = point.x;
  const zPerihelion = point.z;

  return new THREE.Vector3(
    (cosNode * cosPerihelion - sinNode * sinPerihelion * cosInclination) * xPerihelion
      + (-cosNode * sinPerihelion - sinNode * cosPerihelion * cosInclination) * zPerihelion,
    sinPerihelion * sinInclination * xPerihelion + cosPerihelion * sinInclination * zPerihelion,
    (sinNode * cosPerihelion + cosNode * sinPerihelion * cosInclination) * xPerihelion
      + (-sinNode * sinPerihelion + cosNode * cosPerihelion * cosInclination) * zPerihelion
  );
}

function solveKeplerEquation(meanAnomaly: number, eccentricity: number) {
  let eccentricAnomaly = meanAnomaly + eccentricity * Math.sin(meanAnomaly);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const correction = (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly)
      / (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= correction;
    if (Math.abs(correction) < 1e-12) break;
  }
  return eccentricAnomaly;
}

function solveOrbit(days: number, radius: number, eccentricity: number, periodDays: number, phase = 0, inclination = 0, ascendingNode = 0, argumentPerihelion = 0) {
  const meanAnomaly = ((days / periodDays) * Math.PI * 2 + phase) % (Math.PI * 2);
  const eccentricAnomaly = solveKeplerEquation(meanAnomaly, eccentricity);
  return orientOrbitalPoint(new THREE.Vector3(
    radius * (Math.cos(eccentricAnomaly) - eccentricity),
    0,
    radius * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly)
  ), inclination, ascendingNode, argumentPerihelion);
}

type OrbitalElements = {
  semiMajorAxisAu: number;
  eccentricity: number;
  inclination: number;
  meanAnomaly: number;
  ascendingNode: number;
  argumentPerihelion: number;
};

function planetElementsAt(daysSinceJ2000: number, planet: PlanetDefinition): OrbitalElements {
  const centuriesSinceJ2000 = daysSinceJ2000 / 36525;
  const atDate = (base: number, rate: number) => base + rate * centuriesSinceJ2000;
  const semiMajorAxisAu = atDate(planet.semiMajorAxisAu, planet.ratesPerCentury.semiMajorAxisAu);
  const eccentricity = atDate(planet.eccentricity, planet.ratesPerCentury.eccentricity);
  const inclinationDeg = atDate(planet.inclinationDeg, planet.ratesPerCentury.inclinationDeg);
  const meanLongitudeDeg = atDate(planet.meanLongitudeDeg, planet.ratesPerCentury.meanLongitudeDeg);
  const longitudePerihelionDeg = atDate(planet.longitudePerihelionDeg, planet.ratesPerCentury.longitudePerihelionDeg);
  const ascendingNodeDeg = atDate(planet.ascendingNodeDeg, planet.ratesPerCentury.ascendingNodeDeg);

  return {
    semiMajorAxisAu,
    eccentricity,
    inclination: THREE.MathUtils.degToRad(inclinationDeg),
    meanAnomaly: THREE.MathUtils.degToRad(THREE.MathUtils.euclideanModulo(meanLongitudeDeg - longitudePerihelionDeg + 180, 360) - 180),
    ascendingNode: THREE.MathUtils.degToRad(ascendingNodeDeg),
    argumentPerihelion: THREE.MathUtils.degToRad(longitudePerihelionDeg - ascendingNodeDeg)
  };
}

function planetPosition(daysSinceJ2000: number, planet: PlanetDefinition) {
  const elements = planetElementsAt(daysSinceJ2000, planet);
  const eccentricAnomaly = solveKeplerEquation(elements.meanAnomaly, elements.eccentricity);
  const semiMajorAxis = visualOrbitRadius(elements.semiMajorAxisAu);
  return orientOrbitalPoint(new THREE.Vector3(
    semiMajorAxis * (Math.cos(eccentricAnomaly) - elements.eccentricity),
    0,
    semiMajorAxis * Math.sqrt(1 - elements.eccentricity * elements.eccentricity) * Math.sin(eccentricAnomaly)
  ), elements.inclination, elements.ascendingNode, elements.argumentPerihelion);
}

function OrbitPath({ radius, eccentricity, visible, color = '#52647a', inclination = 0, ascendingNode = 0, argumentPerihelion = 0 }: {
  radius: number;
  eccentricity: number;
  visible: boolean;
  color?: string;
  inclination?: number;
  ascendingNode?: number;
  argumentPerihelion?: number;
}) {
  const line = useMemo(() => {
    const points = Array.from({ length: 241 }, (_, index) => {
      const eccentricAnomaly = index / 240 * Math.PI * 2;
      return orientOrbitalPoint(new THREE.Vector3(
        radius * (Math.cos(eccentricAnomaly) - eccentricity),
        0,
        radius * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly)
      ), inclination, ascendingNode, argumentPerihelion);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.38 }));
  }, [argumentPerihelion, ascendingNode, color, eccentricity, inclination, radius]);
  return visible ? <primitive object={line} /> : null;
}

function PlanetOrbitPath({ planet, visible }: { planet: PlanetDefinition; visible: boolean }) {
  const elements = useMemo(() => {
    const daysSinceJ2000 = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
    return planetElementsAt(daysSinceJ2000, planet);
  }, [planet]);
  const semiMajorAxis = visualOrbitRadius(elements.semiMajorAxisAu);
  const perihelion = useMemo(() => orientOrbitalPoint(
    new THREE.Vector3(semiMajorAxis * (1 - elements.eccentricity), 0, 0),
    elements.inclination,
    elements.ascendingNode,
    elements.argumentPerihelion
  ), [elements, semiMajorAxis]);
  const aphelion = useMemo(() => orientOrbitalPoint(
    new THREE.Vector3(-semiMajorAxis * (1 + elements.eccentricity), 0, 0),
    elements.inclination,
    elements.ascendingNode,
    elements.argumentPerihelion
  ), [elements, semiMajorAxis]);

  if (!visible) return null;
  return (
    <>
      <OrbitPath
        radius={semiMajorAxis}
        eccentricity={elements.eccentricity}
        visible
        color={planet.name === 'earth' ? '#6f8197' : '#3d4c60'}
        inclination={elements.inclination}
        ascendingNode={elements.ascendingNode}
        argumentPerihelion={elements.argumentPerihelion}
      />
      <mesh position={perihelion}><sphereGeometry args={[0.11, 10, 10]} /><meshBasicMaterial color="#f2ae62" toneMapped={false} /></mesh>
      <mesh position={aphelion}><sphereGeometry args={[0.11, 10, 10]} /><meshBasicMaterial color="#6da7d9" toneMapped={false} /></mesh>
    </>
  );
}

function SunBody({ bodyRef, onFocus }: { bodyRef: (node: THREE.Group | null) => void; onFocus: () => void }) {
  return (
    <group ref={bodyRef}>
      <mesh onClick={(event) => { event.stopPropagation(); onFocus(); }}><sphereGeometry args={[SUN_DISPLAY_RADIUS, 64, 64]} /><meshBasicMaterial color="#ffd15b" toneMapped={false} /></mesh>
      {/* Soft corona shell. Purely decorative. */}
      <mesh><sphereGeometry args={[SUN_DISPLAY_RADIUS * 1.3, 32, 32]} /><meshBasicMaterial color="#ffb445" transparent opacity={0.13} depthWrite={false} /></mesh>
      <Html distanceFactor={18} position={[0, -5.2, 0]} center zIndexRange={[4, 0]}><div className="space-label sun-label">Sun</div></Html>
    </group>
  );
}

function PlanetBody({ planet, timeScale, onFocus }: { planet: PlanetDefinition; timeScale: number; onFocus: () => void }) {
  const surface = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!surface.current || timeScale === 0) return;
    surface.current.rotation.y += delta * SIMULATED_DAYS_PER_SECOND * timeScale * Math.PI * 2 / planet.rotationPeriodDays;
  });

  return (
    <group>
      <group rotation-z={THREE.MathUtils.degToRad(planet.axialTiltDeg)}>
        <mesh ref={surface} onClick={(event) => { event.stopPropagation(); onFocus(); }}>
          <sphereGeometry args={[planet.radius, 64, 64]} />
          <meshBasicMaterial color={planet.color} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[planet.radius * 1.018, 40, 40]} />
          <meshBasicMaterial color={planet.color} transparent opacity={0.12} depthWrite={false} />
        </mesh>
        {planet.rings && (
          <mesh rotation-x={Math.PI / 2}>
            <ringGeometry args={[planet.radius * planet.rings.inner, planet.radius * planet.rings.outer, 128]} />
            <meshBasicMaterial color={planet.rings.color} transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )}
      </group>
      <Html distanceFactor={13} position={[0, -planet.radius * 1.55 - 0.35, 0]} center zIndexRange={[4, 0]}>
        <div className="space-label">{planet.label}</div>
      </Html>
    </group>
  );
}

function AsteroidBelt({ visible }: { visible: boolean }) {
  const positions = useMemo(() => {
    const inner = visualOrbitRadius(2.1);
    const outer = visualOrbitRadius(3.3);
    const values = new Float32Array(1200 * 3);
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let index = 0; index < 1200; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = inner + random() * (outer - inner);
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = (random() - 0.5) * 0.75;
      values[index * 3 + 2] = Math.sin(angle) * radius;
    }
    return values;
  }, []);

  if (!visible) return null;
  return (
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#8b8276" size={0.075} transparent opacity={0.42} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function EarthBody({ timeScale }: { timeScale: number }) {
  const earth = useRef<THREE.Mesh>(null);
  const fallback = useMemo(() => createEarthTexture(), []);
  const [texture, setTexture] = useState<THREE.Texture>(fallback);
  useEffect(() => { new THREE.TextureLoader().load(EARTH_TEXTURE_URL, (loaded) => { loaded.colorSpace = THREE.SRGBColorSpace; setTexture(loaded); }); }, []);
  useFrame((_, delta) => { if (earth.current) earth.current.rotation.y += delta * Math.PI * 2 * SIMULATED_DAYS_PER_SECOND * timeScale; });
  return (
    <group rotation-z={THREE.MathUtils.degToRad(23.44)}>
      {/*
        meshBasicMaterial is unlit: the texture renders at full, even brightness
        across the whole globe with no terminator or shaded limb. This is a
        deliberate presentation choice - the scientific illumination state still
        comes from the API and is reported in the Environment panel.
      */}
      <mesh ref={earth}><sphereGeometry args={[EARTH_RADIUS, 96, 96]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
      <mesh><sphereGeometry args={[EARTH_RADIUS * 1.02, 48, 48]} /><meshBasicMaterial color="#9fd0ff" transparent opacity={0.1} depthWrite={false} /></mesh>
      <Html distanceFactor={12} position={[0, -4.2, 0]} center zIndexRange={[4, 0]}><div className="space-label">Earth</div></Html>
    </group>
  );
}

function SelectionMarker({ coordinate }: { coordinate: LunarCoordinate }) {
  const position = useMemo(() => latLonToVector3(coordinate.lat, coordinate.lon, MOON_RADIUS * 1.025), [coordinate]);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize()), [position]);
  return <group position={position} quaternion={quaternion}><mesh><ringGeometry args={[0.055, 0.078, 32]} /><meshBasicMaterial color="#ffb84d" side={THREE.DoubleSide} transparent opacity={0.95} /></mesh><mesh position={[0, 0, 0.018]}><circleGeometry args={[0.018, 24]} /><meshBasicMaterial color="#fff3c6" side={THREE.DoubleSide} /></mesh></group>;
}

function MoonSystem({ state, moonGroup, onHover, onSelect }: { state: SceneState; moonGroup: MoonGroupRef; onHover: (coordinate: LunarCoordinate | null) => void; onSelect: (coordinate: LunarCoordinate) => void }) {
  const moon = useRef<THREE.Mesh>(null);
  const fallback = useMemo(() => createMoonTexture(state.craters), [state.craters]);
  const [texture, setTexture] = useState<THREE.Texture>(fallback);
  useEffect(() => { new THREE.TextureLoader().load(MOON_TEXTURE_URL, (loaded) => { loaded.colorSpace = THREE.SRGBColorSpace; setTexture(loaded); }); }, []);
  const coordinateAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => vector3ToLatLon(moon.current?.worldToLocal(event.point.clone()) ?? event.point.clone());

  return (
    <group ref={moonGroup} scale={0.5}>
      <mesh ref={moon} onPointerMove={(event) => { event.stopPropagation(); onHover(coordinateAt(event)); }} onPointerOut={() => onHover(null)} onClick={(event) => { event.stopPropagation(); onSelect(coordinateAt(event)); }}>
        {/* Unlit material: even, solid colour across the sphere, no shadow side. */}
        <sphereGeometry args={[MOON_RADIUS, 128, 128]} /><meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {state.showCraters && state.craters.map((crater) => <mesh key={crater.name} position={latLonToVector3(crater.lat, crater.lon, MOON_RADIUS * 1.014)}><sphereGeometry args={[Math.max(0.018, Math.min(0.09, crater.diameterKm / 2100)), 12, 12]} /><meshBasicMaterial color="#f0c766" transparent opacity={0.88} /></mesh>)}
      {state.coordinate && <SelectionMarker coordinate={state.coordinate} />}
      {/*
        zIndexRange keeps drei's HTML overlay beneath the dashboard chrome
        (navbar z-20, panels z-9, dock z-10) so labels never cover the UI.
      */}
      <Html distanceFactor={7} position={[0, -1.72, 0]} center zIndexRange={[4, 0]}><div className="space-label">Moon</div></Html>
    </group>
  );
}

function SolarSystemSimulation({ state, bodyRefs, moonGroup, onHover, onSelect, onFocus }: {
  state: SceneState;
  bodyRefs: BodyRefs;
  moonGroup: MoonGroupRef;
  onHover: (coordinate: LunarCoordinate | null) => void;
  onSelect: (coordinate: LunarCoordinate) => void;
  onFocus: (body: FocusBody) => void;
}) {
  const simulationDays = useRef((Date.now() - Date.UTC(2000, 0, 1, 12)) / 86_400_000);

  useFrame((_, delta) => {
    if (state.instant) simulationDays.current = (Date.parse(state.instant) - Date.UTC(2000, 0, 1, 12)) / 86400000;
    else simulationDays.current += delta * SIMULATED_DAYS_PER_SECOND * state.timeScale;
    PLANETS.forEach((planet) => bodyRefs.current[planet.name]?.position.copy(planetPosition(simulationDays.current, planet)));
    if (moonGroup.current) {
      const moonPosition = solveOrbit(simulationDays.current, MOON_ORBIT_RADIUS, MOON_ORBIT_ECCENTRICITY, MOON_ORBIT_DAYS, 2.3);
      moonGroup.current.position.copy(moonPosition);
      const orbitalAngle = Math.atan2(moonPosition.z, moonPosition.x);
      moonGroup.current.rotation.y = Math.PI - orbitalAngle;
    }
  });

  return (
    <>
      {PLANETS.map((planet) => (
        <group key={planet.name} position={planetPosition(state.instant ? (Date.parse(state.instant) - Date.UTC(2000, 0, 1, 12)) / 86400000 : simulationDays.current, planet)} ref={(node) => { bodyRefs.current[planet.name] = node; }} onClick={(event) => { event.stopPropagation(); onFocus(planet.name); }}>
          {planet.name === 'earth' ? (
            <>
              <group scale={planet.radius / EARTH_RADIUS}><EarthBody timeScale={state.timeScale} /></group>
              <group rotation-x={MOON_ORBIT_INCLINATION}>
                <OrbitPath radius={MOON_ORBIT_RADIUS} eccentricity={MOON_ORBIT_ECCENTRICITY} visible={state.showOrbits} color="#788a9f" />
                <MoonSystem state={state} moonGroup={moonGroup} onHover={onHover} onSelect={onSelect} />
              </group>
            </>
          ) : <PlanetBody planet={planet} timeScale={state.timeScale} onFocus={() => onFocus(planet.name)} />}
        </group>
      ))}
    </>
  );
}

function SceneCanvas({ state, setState, onSelect, onFocus }: { state: SceneState; setState: React.Dispatch<React.SetStateAction<SceneState>>; onSelect: (coordinate: LunarCoordinate) => void; onFocus: (body: FocusBody) => void }) {
  const bodyRefs = useRef<Partial<Record<FocusBody, THREE.Group | null>>>({});
  const moonGroup = useRef<THREE.Group | null>(null);
  return (
    <Canvas camera={{ position: [230, 320, 560], fov: 45, near: 0.01, far: 20000 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      {/* The camera depth range supports close lunar inspection and the full Neptune orbit. */}
      <color attach="background" args={['#02030a']} />
      <Suspense fallback={null}>
        {/*
          No lights: every body uses an unlit (basic) material, so the globes
          read as smooth, evenly coloured spheres with no shaded hemisphere.
        */}
        <Stars radius={230} depth={130} count={7200} factor={4.7} saturation={0} fade speed={0.24} />
        <SunBody bodyRef={(node) => { bodyRefs.current.sun = node; }} onFocus={() => onFocus('sun')} />
        {PLANETS.map((planet) => <PlanetOrbitPath key={`${planet.name}-orbit`} planet={planet} visible={state.showOrbits} />)}
        <AsteroidBelt visible={state.showOrbits} />
        <SolarSystemSimulation state={state} bodyRefs={bodyRefs} moonGroup={moonGroup} onHover={(hovered) => setState((prev) => ({ ...prev, hovered }))} onSelect={onSelect} onFocus={onFocus} />
        <CameraRig view={state.view} coordinate={state.view === 'moon' ? state.coordinate : null} navigationKey={state.navigationKey} moonGroup={moonGroup} bodyRefs={bodyRefs} />
      </Suspense>
    </Canvas>
  );
}

export function SolarSystemViewport({ instant, coordinate, craters, onSelect }: { instant: string; coordinate: LunarCoordinate | null; craters: Crater[]; onSelect: (point: LunarCoordinate) => void }) {
  const [scene, setScene] = useState<SceneState>({ instant, coordinate, craters, hovered: null, view: 'earth', showCraters: false, showOrbits: true, timeScale: 0, navigationKey: 0 });
  const state = { ...scene, instant, coordinate, craters };
  return <>
    <SceneCanvas state={state} setState={setScene} onSelect={onSelect} onFocus={view => setScene(s => ({ ...s, view, navigationKey: 0 }))} />
    <div className="sl-orbit-controls"><label>Orbital perspective<select value={scene.view} onChange={e => setScene(s => ({ ...s, view: e.target.value as ViewName, navigationKey: 0 }))}>
      <option value="free">System overview</option><option value="top">Top view</option><option value="sun">Sun</option>{PLANETS.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}<option value="moon">Moon</option>
    </select></label><p>Shared observation time · Illustrative lunar orbit · Planetary JPL approximation · Body sizes enlarged</p></div>
  </>;
}

function IconButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? 'icon-button active' : 'icon-button'} onClick={onClick} title={label} aria-label={label}>{children}</button>;
}

const inputDate = (date: Date) => {
  return date.toISOString().slice(0, 16);
};
const dateTimeParts = (value: string) => {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return { year, month, day, hour, minute };
};
const zonedDateTimeToUtcIso = (value: string, timeZone: string) => {
  if (timeZone === 'UTC') return new Date(`${value}:00Z`).toISOString();
  const desired = dateTimeParts(value);
  const desiredAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  });
  let estimate = desiredAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(estimate)).map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    estimate = desiredAsUtc - (representedAsUtc - estimate);
  }
  return new Date(estimate).toISOString();
};
const inputDateInZone = (date: Date, timeZone: string) => {
  if (timeZone === 'UTC') return inputDate(date);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const availableTimeZones = () => {
  const intlWithZones = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fallback = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
  return Array.from(new Set(['UTC', browserZone, ...(intlWithZones.supportedValuesOf?.('timeZone') ?? fallback)].filter(Boolean)));
};
/**
 * Split a `datetime-local` value ("YYYY-MM-DDTHH:mm") into display parts.
 *
 * Parsed as plain text rather than through `new Date()`: the value carries no
 * zone, and the surrounding UI already states which zone it is in. Letting
 * `Date` apply the browser's local offset would silently shift the readout.
 */
const readoutDateTime = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return { date: '--', time: '--:--' };
  const [, year, month, day, hour, minute] = match;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    date: `${day} ${months[Number(month) - 1]} ${year}`,
    time: `${hour}:${minute}`
  };
};

/** Signed degrees -> magnitude + hemisphere letter, for the large readout. */
const readoutCoordinate = (value: string, positive: string, negative: string) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { value: '--', hemisphere: '' };
  return {
    value: `${Math.abs(numeric).toFixed(2)}°`,
    hemisphere: numeric >= 0 ? positive : negative
  };
};

const cardinal = (value: number, positive: string, negative: string) => `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`;

export function LunarEnvironmentExplorer() {
  const now = useMemo(() => new Date(), []);
  const timeZones = useMemo(availableTimeZones, []);
  const [state, setState] = useState<SceneState>({ hovered: null, coordinate: null, craters: [], view: 'free', showCraters: true, showOrbits: true, timeScale: 1, navigationKey: 0 });
  const [timeZone, setTimeZone] = useState('UTC');
  const [latitude, setLatitude] = useState('-89.40');
  const [longitude, setLongitude] = useState('137.30');
  const [analysisTime, setAnalysisTime] = useState(inputDate(now));
  const [startDate, setStartDate] = useState(inputDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))));
  const [endDate, setEndDate] = useState(inputDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7))));
  const [stepHours, setStepHours] = useState(1);
  const [environment, setEnvironment] = useState<EnvironmentResult | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelName>('system');
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => { fetch(`${API_BASE}/api/moon/features`).then((response) => response.json()).then((craters: Crater[]) => setState((prev) => ({ ...prev, craters }))).catch(() => undefined); }, []);

  // Probe the backend once so the navbar can state plainly whether the
  // analysis engine is reachable, rather than failing silently on first click.
  useEffect(() => {
    fetch(`${API_BASE}/api/status`)
      .then((response) => { if (!response.ok) throw new Error('offline'); return response.json(); })
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  const changeTimeZone = (nextTimeZone: string) => {
    if (nextTimeZone === timeZone) return;
    const preserveInstant = (value: string) => inputDateInZone(new Date(zonedDateTimeToUtcIso(value, timeZone)), nextTimeZone);
    setAnalysisTime((value) => preserveInstant(value));
    setStartDate((value) => preserveInstant(value));
    setEndDate((value) => preserveInstant(value));
    setTimeZone(nextTimeZone);
  };

  const requestEnvironment = async (coordinate: LunarCoordinate) => {
    const response = await fetch(`${API_BASE}/api/environment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: coordinate.lat, longitude: coordinate.lon, datetime_utc: zonedDateTimeToUtcIso(analysisTime, timeZone), include_sun_events: false }) });
    if (!response.ok) throw new Error((await response.json()).detail ?? 'Environment analysis failed.');
    setEnvironment(await response.json());
  };

  const selectCoordinate = async (coordinate: LunarCoordinate) => {
    const clean = { lat: Math.max(-90, Math.min(90, coordinate.lat)), lon: Math.max(-180, Math.min(180, coordinate.lon)) };
    setLatitude(clean.lat.toFixed(4)); setLongitude(clean.lon.toFixed(4));
    setState((prev) => ({ ...prev, coordinate: clean, view: 'moon', timeScale: 0, navigationKey: prev.navigationKey + 1 }));
    setError(null);
    try {
      await requestEnvironment(clean);
      setActivePanel('environment');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Analysis failed.');
    }
  };

  const navigate = () => {
    const coordinate = { lat: Number(latitude), lon: Number(longitude) };
    if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lon) || Math.abs(coordinate.lat) > 90 || Math.abs(coordinate.lon) > 180) { setError('Latitude must be −90 to 90 and longitude must be −180 to 180.'); return; }
    void selectCoordinate(coordinate);
  };

  const forecastPayload = () => ({ latitude: Number(latitude), longitude: Number(longitude), start_datetime_utc: zonedDateTimeToUtcIso(startDate, timeZone), end_datetime_utc: zonedDateTimeToUtcIso(endDate, timeZone), step_hours: stepHours, display_timezone: timeZone });

  const generateForecast = async () => {
    setLoading(true); setError(null);
    try {
      const requested = { lat: Number(latitude), lon: Number(longitude) };
      if (!Number.isFinite(requested.lat) || !Number.isFinite(requested.lon) || Math.abs(requested.lat) > 90 || Math.abs(requested.lon) > 180) throw new Error('Enter valid lunar coordinates before generating a forecast.');
      if (!state.coordinate || state.coordinate.lat !== requested.lat || state.coordinate.lon !== requested.lon) await selectCoordinate(requested);
      const response = await fetch(`${API_BASE}/api/forecast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forecastPayload()) });
      if (!response.ok) throw new Error((await response.json()).detail ?? 'Forecast generation failed.');
      setForecast(await response.json());
      setActivePanel('forecast');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Forecast generation failed.'); } finally { setLoading(false); }
  };

  const exportXlsx = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/export/xlsx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forecastPayload()) });
      if (!response.ok) throw new Error((await response.json()).detail ?? 'Excel export failed.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `lunar-forecast-${latitude}-${longitude}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Excel export failed.'); } finally { setLoading(false); }
  };

  const setView = (view: ViewName) => setState((prev) => ({ ...prev, view, coordinate: view === 'moon' ? prev.coordinate : null, navigationKey: view === 'moon' ? prev.navigationKey : 0 }));
  const focusedPlanet = !isStaticView(state.view) && state.view !== 'sun' && state.view !== 'moon'
    ? PLANET_BY_NAME[state.view]
    : null;

  return (
    <main className="viewer-shell">
      <SceneCanvas state={state} setState={setState} onSelect={(coordinate) => void selectCoordinate(coordinate)} onFocus={(body) => setView(body)} />
      <header className="main-navbar">
        <div className="brand">
          <span className="brand-mark"><Orbit size={18} /></span>
          <div className="brand-copy"><strong>Solar System Explorer</strong><small>ORBITAL + LUNAR DIGITAL TWIN</small></div>
        </div>

        <nav className="primary-nav" aria-label="Application sections">
          <button type="button" aria-current={activePanel === 'system'} className={activePanel === 'system' ? 'active' : ''} onClick={() => setActivePanel('system')}><Orbit size={14} /> <span>Solar system</span></button>
          <button type="button" aria-current={activePanel === 'location'} className={activePanel === 'location' ? 'active' : ''} onClick={() => setActivePanel('location')}><MapPin size={14} /> <span>Location</span></button>
          <button type="button" aria-current={activePanel === 'environment'} className={activePanel === 'environment' ? 'active' : ''} onClick={() => setActivePanel('environment')}><Sun size={14} /> <span>Environment</span></button>
          <button type="button" aria-current={activePanel === 'forecast'} className={activePanel === 'forecast' ? 'active' : ''} onClick={() => setActivePanel('forecast')}><CalendarDays size={14} /> <span>Forecast</span></button>
        </nav>

        <div className="nav-tail">
          <span
            className={`status-pill ${online === false ? 'is-offline' : online ? 'is-online' : 'is-pending'}`}
            title={online === false ? 'The analysis backend is unreachable on port 8000.' : 'Analysis backend reachable.'}
          >
            <i aria-hidden="true" />
            {online === false ? 'Offline' : online ? 'Engine ready' : 'Connecting'}
          </span>
          <span className="nav-divider" />
          <div className="view-toolbar" aria-label="Camera views">
            <IconButton label="Free camera" active={state.view === 'free'} onClick={() => setView('free')}><Camera size={15} /></IconButton>
            <IconButton label="Top view" active={state.view === 'top'} onClick={() => setView('top')}><ChevronUp size={15} /></IconButton>
            <IconButton label="Bottom view" active={state.view === 'bottom'} onClick={() => setView('bottom')}><ChevronDown size={15} /></IconButton>
            <IconButton label="Left side" active={state.view === 'left'} onClick={() => setView('left')}><ChevronLeft size={15} /></IconButton>
            <IconButton label="Right side" active={state.view === 'right'} onClick={() => setView('right')}><ChevronRight size={15} /></IconButton>
            <IconButton label="Sun focus" active={state.view === 'sun'} onClick={() => setView('sun')}><Sun size={15} /></IconButton>
            <IconButton label="Earth focus" active={state.view === 'earth'} onClick={() => setView('earth')}><LocateFixed size={15} /></IconButton>
            <IconButton label="Moon focus" active={state.view === 'moon'} onClick={() => setView('moon')}><Maximize2 size={15} /></IconButton>
          </div>
        </div>
      </header>

      <aside className="workspace-panel glass-panel">
        <div className="timezone-control">
          <Clock3 size={14} />
          <label>Time zone<select value={timeZone} onChange={(event) => changeTimeZone(event.target.value)}>{timeZones.map((zone) => <option key={zone} value={zone}>{zone === 'UTC' ? 'UTC' : zone.replace(/_/g, ' ')}</option>)}</select></label>
          <small>Local entries are converted to UTC for calculations.</small>
        </div>
        {activePanel === 'system' && <section className="panel-section">
        <div className="section-heading"><span>01 / EXPLORE</span><h1>Whole solar system</h1><p>Follow the eight planets using JPL elements and rates in the J2000 ecliptic frame.</p></div>
        <div className="system-scale-note"><Orbit size={15} /><p>The Sun is at one focus of every orbit. Kepler's equation produces faster motion near perihelion and slower motion near aphelion. Positions start at the current UTC epoch.</p></div>
        <div className="orbit-legend"><span><i className="perihelion-dot" /> Perihelion</span><span><i className="aphelion-dot" /> Aphelion</span><small>Orbit elements valid 1800–2050</small></div>
        <div className="body-selector" aria-label="Focus a celestial body">
          <button className={state.view === 'sun' ? 'active' : ''} onClick={() => setView('sun')}><i style={{ background: '#ffd15b' }} /><span>Sun</span><small>System centre</small></button>
          {PLANETS.map((planet) => <button key={planet.name} className={state.view === planet.name ? 'active' : ''} onClick={() => setView(planet.name)}><i style={{ background: planet.color }} /><span>{planet.label}</span><small>{planet.semiMajorAxisAu.toFixed(planet.semiMajorAxisAu < 10 ? 2 : 1)} AU</small></button>)}
          <button className={state.view === 'moon' ? 'active' : ''} onClick={() => setView('moon')}><i style={{ background: '#c8c7c2' }} /><span>Moon</span><small>Earth satellite</small></button>
        </div>
        <div className="orbit-readout">
          <span>Current focus</span>
          <strong>{focusedPlanet?.label ?? (!isStaticView(state.view) ? state.view.charAt(0).toUpperCase() + state.view.slice(1) : 'System overview')}</strong>
          {focusedPlanet && <div><p><b>{focusedPlanet.periodDays < 1000 ? focusedPlanet.periodDays.toFixed(1) : Math.round(focusedPlanet.periodDays).toLocaleString()}</b> day orbit</p><p><b>{focusedPlanet.eccentricity.toFixed(4)}</b> eccentricity</p><p><b>{focusedPlanet.inclinationDeg.toFixed(2)}°</b> inclination</p></div>}
          {state.view === 'sun' && <p>The Sun is fixed at the heliocentric origin used by this display model.</p>}
          {state.view === 'moon' && <p>The Moon travels around the moving Earth with a 27.32 day sidereal period and 5.15° inclination.</p>}
          {isStaticView(state.view) && <p>Select a body to fly to it. Drag to orbit, scroll to zoom, and use the view controls for top, bottom and side perspectives.</p>}
        </div>
        </section>}

        {activePanel === 'location' && <section className="panel-section">
        <div className="section-heading"><span>02 / SELECT</span><h1>Lunar location</h1><p>Enter a coordinate or click directly on the Moon.</p></div>
        <div className="coordinate-fields"><label>Latitude (°)<input type="number" min="-90" max="90" step="0.0001" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label><label>Longitude (°)<input type="number" min="-180" max="180" step="0.0001" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label></div>
        <label className="full-field">Analysis time ({timeZone})<input type="datetime-local" value={analysisTime} onChange={(event) => setAnalysisTime(event.target.value)} /></label>
        <button className="primary-button full-button" onClick={navigate}><Crosshair size={16} /> Navigate to location</button>
        <div className="instruction-list"><span><b>01</b> Choose a coordinate</span><span><b>02</b> Center the camera</span><span><b>03</b> Review the environment</span></div>
        </section>}

        {activePanel === 'environment' && <section className="panel-section">
        <div className="section-heading"><span>03 / ANALYSE</span><h1>Surface environment</h1><p>Model output for the selected coordinate and UTC time.</p></div>
        <div className="selected-heading"><span>Selected location</span><strong>{state.coordinate ? `${cardinal(state.coordinate.lat, 'N', 'S')}, ${cardinal(state.coordinate.lon, 'E', 'W')}` : 'No location selected'}</strong></div>
        <div className="science-metrics"><div className="metric-card primary"><span>Surface temperature</span><strong>{environment ? `${environment.thermal.temperature_c.toFixed(1)} °C` : '—'}</strong><small>{environment ? `${environment.thermal.temperature_k.toFixed(1)} K` : 'Select a location'}</small></div><div className="metric-card"><span>Terrain irradiance</span><strong>{environment ? environment.solar.solar_irradiance_w_m2.toFixed(1) : '—'}</strong><small>W/m²</small></div><div className="metric-card"><span>Horizontal irradiance</span><strong>{environment ? environment.solar.horizontal_irradiance_w_m2.toFixed(1) : '—'}</strong><small>W/m²</small></div><div className="metric-card"><span>Solar elevation</span><strong>{environment ? `${environment.solar.elevation_deg.toFixed(1)}°` : '—'}</strong><small>{environment ? (environment.solar.illuminated ? 'Sunlit' : 'Shadowed') : 'Illumination'}</small></div></div>
        {environment && <div className="fidelity-note"><span>{environment.fidelity.astronomy}</span><span>{environment.fidelity.terrain}</span><p>{environment.fidelity.overall_note}</p></div>}
        {!environment && <button className="primary-button full-button" onClick={() => setActivePanel('location')}><MapPin size={15} /> Select a location</button>}
        </section>}

        {activePanel === 'forecast' && <section className="panel-section forecast-section">
        <div className="section-heading"><span>04 / PREDICT</span><h1>Environment forecast</h1><p>Generate a UTC series, inspect the graphs, then export the same data.</p></div>
        <div className="forecast-form"><div className="date-fields"><label>Start date ({timeZone})<input type="datetime-local" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>End date ({timeZone})<input type="datetime-local" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><label className="full-field">Sampling interval<select value={stepHours} onChange={(event) => setStepHours(Number(event.target.value))}><option value={1}>1 hour</option><option value={3}>3 hours</option><option value={6}>6 hours</option><option value={12}>12 hours</option><option value={24}>24 hours</option></select></label><div className="forecast-actions"><button className="primary-button" onClick={() => void generateForecast()} disabled={loading}>{loading ? <span className="spinner" aria-hidden="true" /> : <Play size={15} />}{loading ? 'Calculating…' : 'Generate forecast'}</button><button className="secondary-button" onClick={() => void exportXlsx()} disabled={loading} title="Download the same forecast as an .xlsx workbook"><FileSpreadsheet size={15} /><Download size={13} /> Excel</button></div></div>
        {forecast && forecast.samples.length > 0 && <div className="charts"><div className="chart-summary"><span>{forecast.sample_count} predictions</span><small>{forecast.model_name}</small></div><ForecastChart samples={forecast.samples} field="temperature_c" title="Surface temperature" unit="°C" color="#f5b85b" /><ForecastChart samples={forecast.samples} field="solar_irradiance_w_m2" title="Terrain irradiance" unit="W/m²" color="#79bfff" /></div>}
        </section>}
        {error && <div className="error-banner">{error}</div>}
      </aside>

      {/*
        Mission readout: the four values the user is actually reasoning about,
        sized to be legible at a glance from across the room. Mirrors the form
        inputs rather than owning state, so it can never disagree with them.
      */}
      <div className="mission-readout" aria-label="Selected epoch and coordinate">
        <div className="readout-cell">
          <span>Date</span>
          <strong>{readoutDateTime(analysisTime).date}</strong>
        </div>
        <div className="readout-cell">
          <span>Time ({timeZone})</span>
          <strong>{readoutDateTime(analysisTime).time}</strong>
        </div>
        <div className="readout-divider" />
        <div className="readout-cell">
          <span>Latitude</span>
          <strong>
            {readoutCoordinate(latitude, 'N', 'S').value}
            <em>{readoutCoordinate(latitude, 'N', 'S').hemisphere}</em>
          </strong>
        </div>
        <div className="readout-cell">
          <span>Longitude</span>
          <strong>
            {readoutCoordinate(longitude, 'E', 'W').value}
            <em>{readoutCoordinate(longitude, 'E', 'W').hemisphere}</em>
          </strong>
        </div>
      </div>

      <div className="pointer-status"><span>Surface pointer</span><strong>{state.hovered ? `${cardinal(state.hovered.lat, 'N', 'S')}, ${cardinal(state.hovered.lon, 'E', 'W')}` : 'Move over the Moon'}</strong></div>

      <section className="control-dock"><button className={state.showCraters ? 'text-button active' : 'text-button'} onClick={() => setState((prev) => ({ ...prev, showCraters: !prev.showCraters }))}><Crosshair size={15} /> Craters</button><button className={state.showOrbits ? 'text-button active' : 'text-button'} onClick={() => setState((prev) => ({ ...prev, showOrbits: !prev.showOrbits }))}><Orbit size={15} /> Orbits</button><button className="text-button" onClick={() => setState((prev) => ({ ...prev, view: 'free', coordinate: null, navigationKey: 0, timeScale: 1 }))}><RotateCcw size={15} /> Reset</button><label className="speed-control"><Sun size={15} /><input aria-label="Simulation days per second" type="range" min="0" max="8" step="0.25" value={state.timeScale} onChange={(event) => setState((prev) => ({ ...prev, timeScale: Number(event.target.value) }))} /><span>{state.timeScale.toFixed(2)} d/s</span></label></section>
    </main>
  );
}

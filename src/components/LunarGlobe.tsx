import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls as Controls } from 'three-stdlib';
import { Crater, LunarCoordinate, MOON_RADIUS as R, MOON_TEXTURE_URL } from '../lib/lunar';
import { latLonToVector3, vector3ToLatLon } from '../lib/lunar3d';

import { computeEquilibriumConditions } from '../lib/lunarPhysics';
import type { MapLayer, TerrainLayer } from '../lib/science';

export type LunarView = 'near' | 'far' | 'north' | 'south' | 'east' | 'west';
export type GlobeProps = {
  coordinate: LunarCoordinate | null;
  focusCoordinate: LunarCoordinate | null;
  view: LunarView;
  navigation: number;
  grid: boolean;
  craters: Crater[];
  selectedName?: string;
  siteMarkers?: Array<{ name: string; lat: number; lon: number }>;
  showCraters: boolean;
  onSelect: (point: LunarCoordinate) => void;
  onSelectMarker?: (marker: { name: string; lat: number; lon: number }) => void;
  onHover: (point: LunarCoordinate | null) => void;
  hoverCoordinate?: LunarCoordinate | null;
  pointerColor?: string;
  mapLayer?: MapLayer;
  layerOpacity?: number;
  layerInstant?: string;
  terrainLayer?: TerrainLayer | null;
  /** Fly in close to the surface (used by "Zoom to south pole"). */
  closeUp?: boolean;
  /** Camera framing; 'polar' is the south-pole close-up, 'surface' a close look at the focus point. */
  zoom?: 'overview' | 'polar' | 'surface';
  /** Named features labelled on the surface while `closeUp` is on. */
  featureLabels?: Crater[];
};

/** Basin-scale features are useful as labelled outlines, but an opaque cap at
 * this size hides most of the globe and looks like a detached flat disk. */
const MAX_FILLED_HIGHLIGHT_DIAMETER_KM = 400;

/** The crater to outline: matched by the selected site's name, else the crater the selected point lies inside. */
export function findHighlightedCrater(craters: Crater[], selectedName: string | undefined, point: LunarCoordinate | null): Crater | undefined {
  const name = selectedName?.toLowerCase() ?? '';
  const byName = craters
    .filter((c) => name.includes(c.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (byName) return byName;
  if (!point) return undefined;
  const target = latLonToVector3(point.lat, point.lon, 1);
  return craters
    .map((c) => ({ c, km: target.angleTo(latLonToVector3(c.lat, c.lon, 1)) * 1737.4 }))
    // Do not implicitly select continent-sized basins merely because an
    // arbitrary point lies inside them. They remain selectable by name.
    .filter(({ c, km }) => c.diameterKm >= 1
      && c.diameterKm <= MAX_FILLED_HIGHLIGHT_DIAMETER_KM
      && km <= c.diameterKm / 2)
    .sort((a, b) => a.c.diameterKm - b.c.diameterKm)[0]?.c;
}

function Navigation({ coordinate, view, navigation, zoom = 'overview', craters, selectedName }: Pick<GlobeProps, 'coordinate' | 'view' | 'navigation' | 'zoom' | 'craters' | 'selectedName'>) {
  const controls = useRef<Controls>(null);
  const goal = useRef(new THREE.Vector3(5.2, 0.25, 0));
  const moving = useRef(true);
  const target = useRef(new THREE.Vector3());
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const preset: Record<LunarView, [number, number]> = { near: [0, 0], far: [0, 180], north: [89.9, 0], south: [-89.9, 0], east: [0, 90], west: [0, -90] };
    const crater = findHighlightedCrater(craters, selectedName, coordinate);
    const focus = zoom === 'surface' && crater && !crater.name.startsWith('Apollo') ? crater : coordinate;
    const [lat, lon] = focus ? [focus.lat, focus.lon] : preset[view];
    const normal = latLonToVector3(lat, lon, 1);
    const fit = Math.max(1, size.height / Math.max(1, size.width));
    if (zoom === 'overview') {
      target.current.set(0, 0, 0);
      goal.current.copy(normal.multiplyScalar((coordinate ? 3.8 : 4.5) * fit));
    } else {
      target.current.copy(normal).multiplyScalar(R);
      const diameter = (crater?.diameterKm ?? 35) / 1737.4 * R;
      const distance = zoom === 'polar' ? R * .5 : Math.max(.025, diameter * 1.65) * fit;
      goal.current.copy(normal.multiplyScalar(R + distance));
    }
    moving.current = true;
    invalidate();
  }, [coordinate, view, navigation, zoom, craters, selectedName, size.width, size.height, invalidate]);
  useFrame((_, delta) => {
    if (!moving.current || !controls.current) return;
    const blend = 1 - Math.exp(-6 * delta);
    const radius = THREE.MathUtils.lerp(camera.position.length(), goal.current.length(), blend);
    const direction = camera.position.clone().normalize().lerp(goal.current.clone().normalize(), blend).normalize();
    camera.position.copy(direction.multiplyScalar(radius));
    controls.current.target.lerp(target.current, blend);
    controls.current.update();
    if (camera.position.distanceTo(goal.current) < .0001 && controls.current.target.distanceTo(target.current) < .0001) moving.current = false;
    else invalidate();
  });
  return <OrbitControls ref={controls} makeDefault enableDamping enablePan={false} enableRotate={zoom === 'overview'} minDistance={zoom === 'overview' ? R * 1.02 : .01} maxDistance={12} zoomSpeed={0.7} rotateSpeed={0.5} onStart={() => { moving.current = false; }} />;
}

function Graticule() {
  const lines = useMemo(() => {
    const result: THREE.Line[] = [];
    const material = new THREE.LineBasicMaterial({ color: '#91aab5', transparent: true, opacity: 0.22 });
    for (let lat = -60; lat <= 60; lat += 30) {
      result.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 181 }, (_, i) => latLonToVector3(lat, i * 2 - 180, R * 1.002))), material));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      result.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 91 }, (_, i) => latLonToVector3(i * 2 - 90, lon, R * 1.002))), material));
    }
    return result;
  }, []);
  useEffect(() => () => { lines.forEach(line => line.geometry.dispose()); (lines[0].material as THREE.Material).dispose(); }, [lines]);
  return <group>{lines.map((line, i) => <primitive object={line} key={i} />)}</group>;
}

/**
 * Animated concentric water ripple wave in black color.
 * Replicates liquid wave propagation: expands in diameter and attenuates in opacity.
 */
export function BlackWaterRippleWave({
  phaseOffset,
  speed = 0.75,
  baseInner = 0.016,
  baseOuter = 0.024
}: {
  phaseOffset: number;
  speed?: number;
  baseInner?: number;
  baseOuter?: number;
}) {
  const waveRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const crestMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!waveRef.current || !matRef.current) return;
    const progress = (clock.elapsedTime * speed + phaseOffset) % 1.0;
    
    // Wave radius expansion: start at 0.35x and expand to 2.85x
    const scale = 0.35 + progress * 2.5;
    waveRef.current.scale.set(scale, scale, 1);
    
    // Water ripple fluid dissipation: high initial crest fading smoothly to zero at perimeter
    const opacity = Math.pow(1 - progress, 1.45) * 0.92;
    matRef.current.opacity = opacity;
    if (crestMatRef.current) {
      crestMatRef.current.opacity = opacity * 0.35;
    }
  });

  return (
    <group ref={waveRef}>
      {/* Primary Black Water Ripple Ring */}
      <mesh>
        <ringGeometry args={[baseInner, baseOuter, 48]} />
        <meshBasicMaterial
          ref={matRef}
          color="#000000"
          transparent
          opacity={0.88}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Subtle specular crest highlight for liquid depth against dark terrain */}
      <mesh position={[0, 0, 0.0004]}>
        <ringGeometry args={[baseOuter - 0.001, baseOuter + 0.0015, 48]} />
        <meshBasicMaterial
          ref={crestMatRef}
          color="#ffffff"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Animated Black Water Ripple Marker on the Lunar Surface.
 * Emits continuous concentric fluid ripple waves in black color from the selected coordinate.
 */
export function BlackWaterRippleMarker({
  coordinate,
  radius = R * 1.008,
  scale = 1
}: {
  coordinate: LunarCoordinate;
  radius?: number;
  scale?: number;
}) {
  const position = useMemo(
    () => latLonToVector3(coordinate.lat, coordinate.lon, radius),
    [coordinate, radius]
  );
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize()),
    [position]
  );

  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      {/* 4 Continuous concentric expanding black water ripple waves */}
      <BlackWaterRippleWave phaseOffset={0.0} speed={0.72} />
      <BlackWaterRippleWave phaseOffset={0.25} speed={0.72} />
      <BlackWaterRippleWave phaseOffset={0.5} speed={0.72} />
      <BlackWaterRippleWave phaseOffset={0.75} speed={0.72} />

      {/* Epicenter droplet impact core in deep black */}
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[0.006, 32]} />
        <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
      </mesh>
      {/* Epicenter hairline contrast border for visibility across dark craters */}
      <mesh position={[0, 0, 0.001]}>
        <ringGeometry args={[0.0058, 0.0075, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.65} side={THREE.DoubleSide} />
      </mesh>
      {/* Stationary inner black anchor ring */}
      <mesh position={[0, 0, 0.0015]}>
        <ringGeometry args={[0.009, 0.0135, 40]} />
        <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * Precision 3D Moon Surface Pointer
 * Follows mouse hover in the vibrant electric cyan pointer color with a targeting reticle.
 */
export function MoonHoverPointer({
  coordinate,
  color = '#00f2fe',
  radius = R * 1.006,
  scale = 1
}: {
  coordinate: LunarCoordinate;
  color?: string;
  radius?: number;
  scale?: number;
}) {
  const position = useMemo(
    () => latLonToVector3(coordinate.lat, coordinate.lon, radius),
    [coordinate, radius]
  );
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize()),
    [position]
  );
  const reticleRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!reticleRef.current) return;
    const pulse = 1 + 0.12 * Math.sin(clock.elapsedTime * 4.5);
    reticleRef.current.scale.set(pulse, pulse, 1);
  });

  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      <group ref={reticleRef}>
        {/* Outer reticle ring in vibrant pointer color */}
        <mesh>
          <ringGeometry args={[0.013, 0.017, 36]} />
          <meshBasicMaterial color={color} transparent opacity={0.88} side={THREE.DoubleSide} />
        </mesh>
        {/* Center precision pip */}
        <mesh position={[0, 0, 0.001]}>
          <circleGeometry args={[0.0032, 16]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        {/* Precision targeting crosshairs (N, S, E, W tick marks) */}
        <mesh position={[0, 0.021, 0.001]}>
          <planeGeometry args={[0.0018, 0.006]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.021, 0.001]}>
          <planeGeometry args={[0.0018, 0.006]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0.021, 0, 0.001]}>
          <planeGeometry args={[0.006, 0.0018]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-0.021, 0, 0.001]}>
          <planeGeometry args={[0.006, 0.0018]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function ScientificOverlay(props: GlobeProps) {
  const layer = props.mapLayer ?? 'imagery';
  const instant = props.layerInstant ?? '2000-01-01T12:00:00Z';
  const points = useMemo(() => (props.terrainLayer?.points ?? []).filter(p => layer === 'elevation' ? p.elevation_m !== null : p.slope_deg !== null), [props.terrainLayer, layer]);
  const geometry = useMemo(() => {
    if (layer === 'imagery') return null;
    const color = new THREE.Color();
    if (layer === 'elevation' || layer === 'slope') {
      const values = points.map(p => (layer === 'elevation' ? p.elevation_m : p.slope_deg)!);
      const min = Math.min(...values); const max = Math.max(...values);
      const positions: number[] = []; const colors: number[] = [];
      points.forEach((p, i) => {
        positions.push(...latLonToVector3(p.lat, p.lon, R * 1.006).toArray());
        color.setHSL((1 - (values[i] - min) / Math.max(1, max - min)) * .66, .85, .55); colors.push(color.r, color.g, color.b);
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); return g;
    }
    const g = new THREE.SphereGeometry(R * 1.003, 72, 36);
    const positions = g.getAttribute('position'); const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const coordinate = vector3ToLatLon(new THREE.Vector3().fromBufferAttribute(positions, i));
      const env = computeEquilibriumConditions(coordinate, instant);
      const t = layer === 'illumination' ? env.solar.horizontal_irradiance_w_m2 / 1361 : (env.thermal.temperature_c + 173.15) / 300;
      color.setHSL((1 - Math.max(0, Math.min(1, t))) * .66, .85, .48); colors.push(color.r, color.g, color.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); return g;
  }, [layer, instant, points]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  if (layer === 'elevation' || layer === 'slope') return <points geometry={geometry}
    onPointerMove={e => { const p = points[e.index ?? -1]; if (p) { e.stopPropagation(); props.onHover(p); } }}
    onPointerOut={() => props.onHover(null)}
    onClick={e => { const p = points[e.index ?? -1]; if (p && e.delta < 5) { e.stopPropagation(); props.onSelect(p); } }}>
      <pointsMaterial vertexColors transparent opacity={props.layerOpacity ?? .65} size={.016} sizeAttenuation depthWrite={false} toneMapped={false} />
    </points>;
  return <mesh geometry={geometry}
    onPointerMove={e => { e.stopPropagation(); props.onHover(vector3ToLatLon(e.point)); }}
    onPointerOut={() => props.onHover(null)}
    onClick={e => { e.stopPropagation(); if (e.delta < 5) props.onSelect(vector3ToLatLon(e.point)); }}>
      <meshBasicMaterial vertexColors transparent opacity={props.layerOpacity ?? .65} depthWrite={false} toneMapped={false} />
    </mesh>;
}

/** Circular footprint following the reference sphere; not a traced crater rim. */
function CraterHighlight({ crater }: { crater: Crater }) {
  const showFill = crater.diameterKm <= MAX_FILLED_HIGHLIGHT_DIAMETER_KM;
  const geometry = useMemo(() => {
    const normal = latLonToVector3(crater.lat, crater.lon, 1);
    const reference = Math.abs(normal.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(reference, normal).normalize();
    const north = new THREE.Vector3().crossVectors(normal, east).normalize();
    const angle = crater.diameterKm / (2 * 1737.4);
    const positions = [...normal.clone().multiplyScalar(R * 1.00015).toArray()];
    const outline: THREE.Vector3[] = [], indices: number[] = [];
    const segments = Math.max(96, Math.ceil(2 * Math.PI * Math.sin(angle) / .02));
    const rings = Math.max(12, Math.ceil(angle / .02));
    // Radial subdivision keeps the fill above the curved reference surface.
    for (let ring = 1; ring <= rings; ring++) {
      const rho = angle * ring / rings;
      for (let i = 0; i <= segments; i++) {
        const theta = i / segments * Math.PI * 2;
        const point = normal.clone().multiplyScalar(Math.cos(rho))
          .addScaledVector(east, Math.sin(rho) * Math.cos(theta))
          .addScaledVector(north, Math.sin(rho) * Math.sin(theta)).multiplyScalar(R * 1.00015);
        positions.push(...point.toArray());
        if (ring === rings) outline.push(point);
        if (i === segments) continue;
        const current = 1 + (ring - 1) * (segments + 1) + i;
        if (ring === 1) indices.push(0, current, current + 1);
        else {
          const previous = current - (segments + 1);
          indices.push(previous, current, current + 1, previous, current + 1, previous + 1);
        }
      }
    }
    const fill = new THREE.BufferGeometry(); fill.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); fill.setIndex(indices);
    return { fill, rim: new THREE.BufferGeometry().setFromPoints(outline) };
  }, [crater]);
  useEffect(() => () => { geometry.fill.dispose(); geometry.rim.dispose(); }, [geometry]);
  return <group>
    {showFill && <mesh geometry={geometry.fill}><meshBasicMaterial color="#f6c967" transparent opacity={.14} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} /></mesh>}
    <lineLoop geometry={geometry.rim}><lineBasicMaterial color="#ffd98b" transparent opacity={showFill ? .9 : .7} depthWrite={false} /></lineLoop>
  </group>;
}

function Surface(rawProps: GlobeProps) {
  const props = { ...rawProps, closeUp: rawProps.closeUp || rawProps.zoom === 'polar' };
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(() => {
    let active = true;
    const loaded = new THREE.TextureLoader().load(MOON_TEXTURE_URL, image => {
      image.colorSpace = THREE.SRGBColorSpace;
      if (active) setTexture(image);
    }, undefined, () => { if (active) setFailed(true); });
    return () => { active = false; loaded.dispose(); };
  }, []);
  const point = (event: ThreeEvent<PointerEvent | MouseEvent>) => vector3ToLatLon(mesh.current!.worldToLocal(event.point.clone()));
  const selectedCrater = useMemo(
    () => findHighlightedCrater([...props.craters, ...(props.featureLabels ?? [])], props.selectedName, props.coordinate),
    [props.craters, props.featureLabels, props.selectedName, props.coordinate]
  );

  return <>
    <mesh
      ref={mesh}
      onPointerMove={e => { e.stopPropagation(); props.onHover(point(e)); }}
      onPointerOut={() => props.onHover(null)}
      onClick={e => { e.stopPropagation(); if (e.delta < 5) props.onSelect(point(e)); }}
    >
      <sphereGeometry args={[R, 96, 64]} />
      <meshStandardMaterial key={texture?.uuid ?? 'loading'} map={texture} color={texture ? '#dbe5f5' : '#899095'} roughness={1} metalness={0} />
    </mesh>
    <ScientificOverlay {...props} />
    {props.grid && <Graticule />}
    {props.showCraters && props.craters.map(crater => (
      <mesh
        key={crater.name}
        position={latLonToVector3(crater.lat, crater.lon, props.zoom === 'surface' ? R * 1.0002 : R * 1.005)}
        onClick={e => { e.stopPropagation(); (props.onSelectMarker ?? props.onSelect)(crater); }}
      >
        <sphereGeometry args={[props.zoom === 'surface' ? .00015 : props.zoom === 'polar' ? .0015 : .007, 8, 8]} />
        <meshBasicMaterial color="#c4dccd" />
      </mesh>
    ))}

    {selectedCrater && !selectedCrater.name.startsWith('Apollo') && <CraterHighlight crater={selectedCrater} />}

    {props.closeUp && props.featureLabels?.map((f) => (
      <Html key={`f-${f.name}`} center position={latLonToVector3(f.lat, f.lon, R * 1.01)} zIndexRange={[20, 0]}>
        <span className={`sl-feature-label${selectedCrater?.name === f.name ? ' is-selected' : ''}`}>{f.name}</span>
      </Html>
    ))}

    {props.siteMarkers?.filter(marker => props.selectedName === marker.name).map(marker => (
      <Html key={marker.name} center occlude position={latLonToVector3(marker.lat, marker.lon, R * 1.001)} zIndexRange={[25, 0]}>
        <button
          type="button"
          className={`sl-globe-site-label${props.selectedName === marker.name ? ' is-selected' : ''}`}
          onClick={event => { event.stopPropagation(); (props.onSelectMarker ?? props.onSelect)(marker); }}
        >{marker.name}</button>
      </Html>
    ))}

    {/* Black Water Ripple Marker on Selected Coordinate */}
    {props.coordinate && props.zoom !== 'surface' && <BlackWaterRippleMarker coordinate={props.coordinate} scale={props.zoom === 'polar' ? .25 : 1} />}

    {/* Vibrantly Colored Moon Hover Pointer on Mouse Tracking */}
    {props.hoverCoordinate && (
      <MoonHoverPointer
        coordinate={props.hoverCoordinate}
        color={props.pointerColor || '#00f2fe'}
        scale={props.zoom === 'surface' ? .05 : props.zoom === 'polar' ? .25 : 1}
        radius={props.zoom === 'surface' ? R * 1.0003 : R * 1.006}
      />
    )}

    {failed && <Html center position={[0, -1.3, 0]}><span className="sl-texture-error">Lunar imagery unavailable</span></Html>}
    <Navigation coordinate={props.zoom === 'polar' ? null : props.focusCoordinate} view={props.zoom === 'polar' ? 'south' : props.view} navigation={props.navigation} zoom={props.zoom ?? (props.closeUp ? 'polar' : 'overview')} craters={props.craters} selectedName={props.selectedName} />
  </>;
}

export function LunarGlobe(props: GlobeProps) {
  return <Canvas frameloop="demand" raycaster={{ params: { Mesh: {}, Line: { threshold: 1 }, LOD: {}, Points: { threshold: .012 }, Sprite: {} } }} camera={{ position: [5.2, 0.25, 0], fov: 42, near: 0.01, far: 150 }} dpr={[1, 1.25]} gl={{ antialias: true }}>
    <color attach="background" args={['#020710']} />
    <ambientLight intensity={0.35} />
    <directionalLight position={[5, -3, 2]} intensity={2} />
    <Stars radius={60} depth={30} count={1500} factor={3} saturation={0.15} />
    <Surface {...props} />
  </Canvas>;
}

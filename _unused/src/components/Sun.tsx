import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

import {
  SUN_DISPLAY_DISTANCE,
  SUN_DISPLAY_RADIUS,
  SUN_LIGHT_DISTANCE,
  SUN_SEGMENTS
} from '../utils/constants';
import { scientificToDisplay } from '../utils/coordinates';

export interface SunProps {
  /**
   * Unit vector to the Sun in the lunar body-fixed frame, straight from the
   * API. **This is the source of truth for the scene lighting** — the light's
   * position is derived from it, never the other way round.
   */
  sunVectorBody: number[] | null;
  /** True Sun-Moon distance, shown in the label. */
  sunDistanceKm: number | null;
}

/**
 * The Sun: a bright sphere plus the directional light that lights the Moon.
 *
 * The data flow required by the spec is:
 *
 * ```text
 * backend scientific sun vector -> frontend -> Three.js light position
 * ```
 *
 * So the terminator you see on the Moon corresponds to the terminator the
 * backend computed, and the visual and the numbers can never disagree.
 *
 * Distance is compressed for display (the real Sun is ~86,000 Moon-radii
 * away). Because the light is directional, only its *direction* matters, so
 * compression changes nothing about the illumination geometry.
 */
export function Sun({ sunVectorBody, sunDistanceKm }: SunProps) {
  const hasVector = Boolean(sunVectorBody && sunVectorBody.length >= 3);

  const spherePosition = useMemo(() => {
    if (!hasVector) return new THREE.Vector3(SUN_DISPLAY_DISTANCE, 0, 0);
    return scientificToDisplay(sunVectorBody as number[], SUN_DISPLAY_DISTANCE);
  }, [sunVectorBody, hasVector]);

  const lightPosition = useMemo(() => {
    if (!hasVector) return new THREE.Vector3(SUN_LIGHT_DISTANCE, 0, 0);
    return scientificToDisplay(sunVectorBody as number[], SUN_LIGHT_DISTANCE);
  }, [sunVectorBody, hasVector]);

  return (
    <group>
      {/*
        Directional (not point) light: the Sun is effectively at infinity, so
        its rays are parallel across the Moon. A point light at a compressed
        distance would wrongly curve the terminator.
      */}
      <directionalLight
        position={lightPosition}
        intensity={2.6}
        color="#fff6e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />

      {/*
        Very low ambient fill. Real lunar night is lit only by earthshine and
        starlight; a pure-black night side would be unreadable on screen, so
        this is a deliberate, tiny visualisation concession. It does not feed
        any calculation.
      */}
      <ambientLight intensity={0.05} color="#8fa4c4" />

      <group position={spherePosition}>
        <mesh>
          <sphereGeometry args={[SUN_DISPLAY_RADIUS, SUN_SEGMENTS, SUN_SEGMENTS]} />
          <meshBasicMaterial color="#ffd964" toneMapped={false} />
        </mesh>
        {/* Soft corona. */}
        <mesh>
          <sphereGeometry args={[SUN_DISPLAY_RADIUS * 1.35, 24, 24]} />
          <meshBasicMaterial color="#ffb03a" transparent opacity={0.16} depthWrite={false} />
        </mesh>

        <Html center distanceFactor={40} position={[0, -SUN_DISPLAY_RADIUS * 1.8, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded border border-solar-500/40 bg-space-950/80 px-2 py-0.5 text-2xs font-mono uppercase tracking-widest text-solar-400">
            Sun
            {sunDistanceKm !== null && (
              <span className="ml-1.5 text-regolith-400 normal-case tracking-normal">
                {(sunDistanceKm / 1e6).toFixed(2)}M km
              </span>
            )}
          </div>
        </Html>
      </group>
    </group>
  );
}

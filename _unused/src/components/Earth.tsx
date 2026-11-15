import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { EARTH_DISPLAY_DISTANCE, EARTH_DISPLAY_RADIUS, EARTH_SEGMENTS } from '../utils/constants';
import { scientificToDisplay } from '../utils/coordinates';
import { createEarthTexture } from '../utils/textures';

export interface EarthProps {
  /**
   * Unit vector to Earth in the lunar body-fixed frame, from the API.
   * The *direction* is scientific; the distance it is drawn at is not.
   */
  earthVectorBody: number[] | null;
  /** True Earth-Moon distance, shown in the label. */
  earthDistanceKm: number | null;
}

/**
 * Earth, drawn for spatial context.
 *
 * Positioned along the true selenographic direction to Earth so the near-side
 * orientation of the scene is meaningful, but at a heavily compressed
 * distance: the real Earth is ~221 Moon-radii away and would be a few pixels
 * wide at any zoom that shows the Moon.
 *
 * Per the spec this is contextual visualisation only, so surface detail is
 * intentionally low-fidelity.
 */
export function Earth({ earthVectorBody, earthDistanceKm }: EarthProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => createEarthTexture(), []);

  const position = useMemo(() => {
    if (!earthVectorBody || earthVectorBody.length < 3) {
      // Fall back to the mean sub-Earth direction (lat 0, lon 0) until the
      // first analysis returns.
      return new THREE.Vector3(EARTH_DISPLAY_DISTANCE, 0, 0);
    }
    return scientificToDisplay(earthVectorBody, EARTH_DISPLAY_DISTANCE);
  }, [earthVectorBody]);

  // A slow spin is cosmetic only; nothing reads Earth's orientation.
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.05;
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[EARTH_DISPLAY_RADIUS, EARTH_SEGMENTS, EARTH_SEGMENTS]} />
        <meshStandardMaterial map={texture} roughness={0.9} metalness={0} />
      </mesh>

      {/* Thin atmospheric halo. */}
      <mesh>
        <sphereGeometry args={[EARTH_DISPLAY_RADIUS * 1.03, 32, 32]} />
        <meshBasicMaterial color="#9fd4ff" transparent opacity={0.13} depthWrite={false} />
      </mesh>

      <Html center distanceFactor={14} position={[0, -EARTH_DISPLAY_RADIUS * 1.9, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded border border-cryo-500/40 bg-space-950/80 px-2 py-0.5 text-2xs font-mono uppercase tracking-widest text-cryo-400">
          Earth
          {earthDistanceKm !== null && (
            <span className="ml-1.5 text-regolith-400 normal-case tracking-normal">
              {Math.round(earthDistanceKm).toLocaleString('en-US')} km
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

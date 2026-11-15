import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { MARKER_DISPLAY_RADIUS, MOON_DISPLAY_RADIUS } from '../utils/constants';
import { formatLatitude, formatLongitude, latLonToDisplay } from '../utils/coordinates';

export interface CoordinateMarkerProps {
  latitude: number;
  longitude: number;
  /** Tints the marker to match the illumination state of the site. */
  illuminated?: boolean | null;
  /** Show the lat/lon label beside the pin. */
  showLabel?: boolean;
}

/**
 * A pin marking the selected surface coordinate.
 *
 * Floats at 1.01 Moon-radii — just clear of the surface, so it never
 * z-fights with the sphere but still reads as being on the ground (the spec's
 * `moon radius = 1` / `marker radius = 1.01` guidance).
 *
 * The stem points radially outward, i.e. along the local "up" direction, which
 * is also the spherical surface normal at that coordinate.
 */
export function CoordinateMarker({
  latitude,
  longitude,
  illuminated,
  showLabel = true
}: CoordinateMarkerProps) {
  const pulseRef = useRef<THREE.Mesh>(null);

  const { position, quaternion } = useMemo(() => {
    const surfacePoint = latLonToDisplay(latitude, longitude, MARKER_DISPLAY_RADIUS);
    // Orient the pin so its local +Y aligns with the outward radial direction.
    const up = surfacePoint.clone().normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      up
    );
    return { position: surfacePoint, quaternion: orientation };
  }, [latitude, longitude]);

  // Gentle pulse so the marker stays findable against a busy texture.
  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const scale = 1 + 0.22 * Math.sin(clock.elapsedTime * 2.4);
    pulseRef.current.scale.setScalar(scale);
  });

  const color = illuminated === false ? '#5ec8f2' : '#ff5f4d';

  return (
    <group position={position} quaternion={quaternion}>
      {/* Halo ring flat against the surface. */}
      <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.035, 0.055, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>

      {/* Stem along the local vertical. */}
      <mesh position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.09, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Pin head. */}
      <mesh position={[0, 0.098, 0]}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {showLabel && (
        <Html
          center
          distanceFactor={4}
          position={[0, 0.2, 0]}
          // Hidden when the marker rotates behind the Moon.
          occlude={false}
          zIndexRange={[10, 0]}
        >
          <div className="pointer-events-none select-none whitespace-nowrap rounded border border-white/15 bg-space-950/85 px-2 py-1 font-mono text-2xs leading-tight text-regolith-100 shadow-lg">
            <div>{formatLatitude(latitude, 2)}</div>
            <div>{formatLongitude(longitude, 2)}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * A dim marker following the pointer across the surface.
 *
 * Purely a hover affordance — it never triggers an analysis request.
 */
export function HoverMarker({ latitude, longitude }: { latitude: number; longitude: number }) {
  const position = useMemo(
    () => latLonToDisplay(latitude, longitude, MOON_DISPLAY_RADIUS * 1.006),
    [latitude, longitude]
  );
  const quaternion = useMemo(() => {
    const up = position.clone().normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  }, [position]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.018, 0.028, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

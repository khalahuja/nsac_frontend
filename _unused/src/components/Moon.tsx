import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import { MOON_DISPLAY_RADIUS, MOON_SEGMENTS } from '../utils/constants';
import { pickCoordinateFromEvent } from '../utils/moonPicking';
import { createMoonTexture } from '../utils/textures';
import type { LunarFeature } from '../types/lunar';

export interface MoonProps {
  /** Named features used to annotate the procedural texture. */
  features: LunarFeature[];
  /** Called with the selenographic coordinate of a click on the surface. */
  onSelect: (latitude: number, longitude: number) => void;
  /** Called continuously while the pointer moves over the surface. */
  onHover: (coordinate: { latitude: number; longitude: number } | null) => void;
}

/**
 * The Moon: a textured sphere that reports lat/lon when clicked.
 *
 * ## Why the mesh never rotates
 *
 * The Moon's body-fixed frame *is* the latitude/longitude frame. Spinning the
 * mesh would decouple the two and make every pick wrong unless the rotation
 * were inverted first. Time of day is instead expressed by moving the Sun
 * light, whose direction comes from the backend — which is also what the spec
 * requires (backend vector is the source of truth, not the light position).
 *
 * ## Picking
 *
 * R3F raycasts for us; `event.point` is the world-space hit. Because the mesh
 * sits at the origin unrotated, that point converts straight to lat/lon via
 * `displayToLatLon`.
 */
export function Moon({ features, onSelect, onHover }: MoonProps) {
  // Texture generation is ~50 ms of canvas work, so build it only when the
  // feature catalogue actually changes.
  const texture = useMemo(() => createMoonTexture(features), [features]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const picked = pickCoordinateFromEvent(event);
    if (picked) onSelect(picked.latitude, picked.longitude);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const picked = pickCoordinateFromEvent(event);
    onHover(picked);
  };

  return (
    <mesh
      castShadow
      receiveShadow
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerOut={() => onHover(null)}
      // Hint to the browser that the surface is interactive.
      onPointerOver={() => {
        document.body.style.cursor = 'crosshair';
      }}
      onPointerLeave={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <sphereGeometry args={[MOON_DISPLAY_RADIUS, MOON_SEGMENTS, MOON_SEGMENTS]} />
      {/*
        The colour map doubles as a bump map: the crater rings and speckle in
        the texture give believable relief at a fraction of the cost of a real
        displacement map, and no extra texture upload.
        Regolith is optically rough, hence roughness 1 / metalness 0.
      */}
      <meshStandardMaterial
        map={texture}
        bumpMap={texture}
        bumpScale={0.035}
        roughness={1}
        metalness={0}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

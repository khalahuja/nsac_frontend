/**
 * Turning a pointer event on the Moon mesh into a selenographic coordinate.
 *
 * React Three Fiber already raycasts for us: `ThreeEvent.point` is the
 * intersection in **world** space. The work here is to move that point into
 * the Moon's local frame and then into lat/lon, which
 * {@link displayToLatLon} does.
 *
 * The Moon mesh is deliberately never rotated in the scene - its body-fixed
 * frame *is* the lat/lon frame, so a fixed mesh keeps picking exact. Time of
 * day is expressed by moving the light, not by spinning the Moon.
 */

import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import { displayToLatLon } from './coordinates';

/** A picked surface location. */
export interface PickedCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Convert a world-space intersection point to lunar lat/lon.
 *
 * @param worldPoint - Intersection point in world space.
 * @param moonCenter - The Moon's centre in world space (the origin in this
 *   scene, but passed explicitly so the function stays layout-independent).
 * @returns The latitude/longitude of the hit, or `null` if the point
 *   coincides with the Moon's centre and no direction can be derived.
 */
export function pickCoordinateFromWorldPoint(
  worldPoint: THREE.Vector3,
  moonCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
): PickedCoordinate | null {
  const local = worldPoint.clone().sub(moonCenter);
  if (local.lengthSq() < 1e-12) return null;
  return displayToLatLon(local);
}

/**
 * Convert an R3F pointer event on the Moon mesh to lunar lat/lon.
 *
 * @param event - The R3F pointer/click event.
 * @param moonCenter - The Moon's centre in world space.
 */
export function pickCoordinateFromEvent(
  event: ThreeEvent<PointerEvent | MouseEvent>,
  moonCenter?: THREE.Vector3
): PickedCoordinate | null {
  return pickCoordinateFromWorldPoint(event.point, moonCenter);
}

/**
 * Whether a surface point faces the camera.
 *
 * A ray through a sphere hits both the near and far side; R3F reports the
 * nearest intersection first, so this is mostly a guard for callers that
 * inspect later intersections themselves.
 *
 * @param surfacePoint - Point on the sphere, relative to its centre.
 * @param cameraPosition - Camera position, relative to the same centre.
 */
export function isFacingCamera(
  surfacePoint: THREE.Vector3,
  cameraPosition: THREE.Vector3
): boolean {
  return surfacePoint.clone().normalize().dot(cameraPosition.clone().normalize()) > 0;
}

/**
 * Angular distance between two lunar coordinates, in degrees.
 *
 * Uses the haversine formula, which stays accurate for small separations where
 * the plain spherical law of cosines loses precision.
 */
export function angularDistanceDeg(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const phi1 = toRad(latitudeA);
  const phi2 = toRad(latitudeB);
  const deltaPhi = toRad(latitudeB - latitudeA);
  const deltaLambda = toRad(longitudeB - longitudeA);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 180) / Math.PI;
}

/** Great-circle surface distance between two lunar coordinates, in kilometres. */
export function surfaceDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
  radiusKm = 1737.4
): number {
  const angleDeg = angularDistanceDeg(latitudeA, longitudeA, latitudeB, longitudeB);
  return (angleDeg * Math.PI * radiusKm) / 180;
}

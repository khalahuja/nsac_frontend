/**
 * Coordinate conversions.
 *
 * Two distinct coordinate systems exist in this app and must never be
 * confused:
 *
 * ## 1. Scientific frame (lunar body-fixed, IAU_MOON)
 *
 * Identical to the backend's frame in `backend/app/services/geometry.py`:
 *
 * - `+Z` -> lunar north pole
 * - `+X` -> lat 0, lon 0 (the mean sub-Earth point)
 * - `+Y` -> lat 0, lon +90E
 * - Latitude north positive, longitude **east** positive.
 *
 * All Sun/Earth vectors received from the API are in this frame. Nothing here
 * is scaled for display.
 *
 * ## 2. Display frame (Three.js scene)
 *
 * Three.js is Y-up, and `SphereGeometry`'s default UV layout determines where
 * an equirectangular texture lands. The mapping below is the conventional one
 * for that layout, so a texture drawn with `x = (lon + 180) / 360 * width` and
 * `y = (90 - lat) / 180 * height` lines up with the geometry.
 *
 * The two frames are related by a fixed axis swap:
 *
 * ```text
 * display = (x_sci, z_sci, -y_sci)
 * science = (x_disp, -z_disp, y_disp)
 * ```
 *
 * Distances in the display frame are visually compressed (see `constants.ts`);
 * **no scientific quantity is ever derived from display coordinates.**
 */

import * as THREE from 'three';

/** Degrees to radians. */
export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Radians to degrees. */
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Clamp a value into an inclusive range. */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Wrap a longitude into [-180, +180].
 *
 * Exactly `+180` is preserved rather than folded to `-180`, matching the
 * backend, so a user who types 180 sees 180 echoed back.
 */
export function normalizeLongitude(longitude: number): number {
  if (longitude === 180) return 180;
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

/** Clamp a latitude into [-90, +90]. */
export const normalizeLatitude = (latitude: number): number => clamp(latitude, -90, 90);

// ---------------------------------------------------------------------------
// Scientific frame
// ---------------------------------------------------------------------------

/** A Cartesian triple in the lunar body-fixed frame. */
export interface ScientificVector {
  x: number;
  y: number;
  z: number;
}

/**
 * Convert lat/lon to a Cartesian vector in the **scientific** body-fixed frame.
 *
 * ```text
 * r = radius * (cos(phi)cos(lambda), cos(phi)sin(lambda), sin(phi))
 * ```
 *
 * @param latitude - Latitude in degrees, north positive.
 * @param longitude - Longitude in degrees, east positive.
 * @param radius - Radial distance (any unit); defaults to a unit vector.
 * @returns The body-fixed Cartesian vector.
 */
export function latLonToCartesian(
  latitude: number,
  longitude: number,
  radius = 1
): ScientificVector {
  const phi = toRadians(latitude);
  const lambda = toRadians(longitude);
  const cosPhi = Math.cos(phi);
  return {
    x: radius * cosPhi * Math.cos(lambda),
    y: radius * cosPhi * Math.sin(lambda),
    z: radius * Math.sin(phi)
  };
}

/**
 * Convert a **scientific** body-fixed Cartesian vector to lat/lon.
 *
 * Inverse of {@link latLonToCartesian}. At the poles longitude is degenerate
 * and `atan2(0, 0) = 0` is returned.
 *
 * @returns Latitude in [-90, 90] and longitude in [-180, 180], both degrees.
 */
export function cartesianToLatLon(
  x: number,
  y: number,
  z: number
): { latitude: number; longitude: number } {
  const radius = Math.sqrt(x * x + y * y + z * z);
  if (radius < 1e-12) {
    throw new Error('Cannot derive lat/lon from a zero-length vector');
  }
  const latitude = toDegrees(Math.asin(clamp(z / radius, -1, 1)));
  const longitude = toDegrees(Math.atan2(y, x));
  return { latitude, longitude: normalizeLongitude(longitude) };
}

/**
 * Outward unit surface normal of a spherical Moon at the given coordinate.
 *
 * Matches the backend's `spherical_surface_normal`.
 */
export function surfaceNormal(latitude: number, longitude: number): ScientificVector {
  return latLonToCartesian(latitude, longitude, 1);
}

// ---------------------------------------------------------------------------
// Display frame
// ---------------------------------------------------------------------------

/**
 * Convert a scientific body-fixed vector into a Three.js display vector.
 *
 * Applies the fixed axis swap `display = (x, z, -y)`. Use this for any vector
 * the backend supplies (Sun direction, Earth direction) before positioning
 * something in the scene.
 *
 * @param vector - Body-fixed vector, typically a unit direction.
 * @param scale - Display-space length to scale the (normalised) direction to.
 */
export function scientificToDisplay(
  vector: ScientificVector | number[],
  scale = 1
): THREE.Vector3 {
  const [x, y, z] = Array.isArray(vector)
    ? [vector[0] ?? 0, vector[1] ?? 0, vector[2] ?? 0]
    : [vector.x, vector.y, vector.z];
  return new THREE.Vector3(x, z, -y).normalize().multiplyScalar(scale);
}

/** Convert a Three.js display vector back into the scientific frame. */
export function displayToScientific(vector: THREE.Vector3): ScientificVector {
  return { x: vector.x, y: -vector.z, z: vector.y };
}

/**
 * Convert lat/lon directly to a position in the Three.js **display** frame.
 *
 * Equivalent to `scientificToDisplay(latLonToCartesian(...))` but written out
 * in the spherical form conventional for Three.js sphere texturing:
 *
 * ```text
 * phi   = (90 - latitude)   in radians   (polar angle from +Y)
 * theta = (longitude + 180) in radians   (azimuth)
 * ```
 *
 * @param radius - Display-space radius, e.g. `MOON_DISPLAY_RADIUS * 1.01` to
 *   float a marker just above the surface.
 */
export function latLonToDisplay(
  latitude: number,
  longitude: number,
  radius = 1
): THREE.Vector3 {
  const phi = toRadians(90 - latitude);
  const theta = toRadians(longitude + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Convert a point in the Three.js **display** frame to lunar lat/lon.
 *
 * Inverse of {@link latLonToDisplay}. This is what turns a raycast hit on the
 * Moon mesh into a selenographic coordinate.
 *
 * @param point - Position **relative to the Moon's centre** in display space.
 */
export function displayToLatLon(
  point: THREE.Vector3
): { latitude: number; longitude: number } {
  const unit = point.clone().normalize();
  const latitude = toDegrees(Math.asin(clamp(unit.y, -1, 1)));
  const longitude = toDegrees(Math.atan2(unit.z, -unit.x)) - 180;
  return { latitude, longitude: normalizeLongitude(longitude) };
}

// ---------------------------------------------------------------------------
// Local topocentric frame
// ---------------------------------------------------------------------------

/**
 * Local East/North/Up unit vectors in the **scientific** frame.
 *
 * Mirrors the backend's `local_enu_basis`. Provided so the UI can reason about
 * azimuth without a round trip.
 */
export function localEnuBasis(
  latitude: number,
  longitude: number
): { east: ScientificVector; north: ScientificVector; up: ScientificVector } {
  const phi = toRadians(latitude);
  const lambda = toRadians(longitude);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);

  return {
    east: { x: -sinLambda, y: cosLambda, z: 0 },
    north: { x: -sinPhi * cosLambda, y: -sinPhi * sinLambda, z: cosPhi },
    up: { x: cosPhi * cosLambda, y: cosPhi * sinLambda, z: sinPhi }
  };
}

/** Compass point label for an azimuth in degrees (0 = N, clockwise). */
export function azimuthToCompass(azimuthDeg: number): string {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16;
  return points[index] as string;
}

/** Format a latitude with a hemisphere suffix, e.g. `89.400 deg S`. */
export function formatLatitude(latitude: number, digits = 3): string {
  const hemisphere = latitude >= 0 ? 'N' : 'S';
  return `${Math.abs(latitude).toFixed(digits)}° ${hemisphere}`;
}

/** Format a longitude with a hemisphere suffix, e.g. `137.300 deg E`. */
export function formatLongitude(longitude: number, digits = 3): string {
  const hemisphere = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(longitude).toFixed(digits)}° ${hemisphere}`;
}

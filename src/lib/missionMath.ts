/** Two-body and statistical screens. These are not flight trajectory models. */
export const LUNAR_MU = 4902.800066; // km^3/s^2
export const LUNAR_RADIUS_KM = 1737.4;

export function landingScreen(sigma: number, radius: number, terrain: number, vehicle: number) {
  if (![sigma, radius, terrain, vehicle].every(Number.isFinite) || sigma <= 0 || radius <= 0 || terrain < 0 || terrain > 100 || vehicle < 0 || vehicle > 100) {
    throw new Error('Use positive dispersion and radius, and success factors between 0 and 100%.');
  }
  const containment = -Math.expm1(-(radius ** 2) / (2 * sigma ** 2));
  return { containment, combined: containment * terrain / 100 * vehicle / 100 };
}

export function orbitInsertion(vInfinity: number, periapsis: number, apoapsis: number) {
  if (![vInfinity, periapsis, apoapsis].every(Number.isFinite) || vInfinity < 0 || periapsis <= 0 || apoapsis < periapsis) {
    throw new Error('Apolune must be at least perilune; altitudes must be positive and arrival speed nonnegative.');
  }
  const rp = LUNAR_RADIUS_KM + periapsis;
  const a = (rp + LUNAR_RADIUS_KM + apoapsis) / 2;
  const approachSpeed = Math.sqrt(vInfinity ** 2 + 2 * LUNAR_MU / rp);
  const orbitSpeed = Math.sqrt(LUNAR_MU * (2 / rp - 1 / a));
  return { approachSpeed, orbitSpeed, loi: approachSpeed - orbitSpeed, orbitalPeriodHours: 2 * Math.PI * Math.sqrt(a ** 3 / LUNAR_MU) / 3600 };
}

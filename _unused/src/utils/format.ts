/**
 * Display formatting helpers.
 *
 * The rule throughout: a value the backend reported as `null` renders as an
 * explicit "not measured" marker, never as `0` or a blank that could be
 * mistaken for a reading.
 */

/** Rendered in place of any unavailable measurement. */
export const NOT_MEASURED = '—';

/**
 * Format a nullable number, or the not-measured marker.
 *
 * @param value - The value, or `null`/`undefined` if unavailable.
 * @param digits - Decimal places.
 * @param unit - Optional unit suffix.
 */
export function formatNumber(
  value: number | null | undefined,
  digits = 2,
  unit = ''
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NOT_MEASURED;
  const suffix = unit ? ` ${unit}` : '';
  return `${value.toFixed(digits)}${suffix}`;
}

/** Format an angle in degrees. */
export function formatDegrees(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NOT_MEASURED;
  return `${value.toFixed(digits)}°`;
}

/** Format an irradiance in W/m^2, dropping decimals for large values. */
export function formatIrradiance(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NOT_MEASURED;
  return `${value.toFixed(value >= 100 ? 0 : 1)} W/m²`;
}

/** Format a temperature in Kelvin. */
export function formatKelvin(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NOT_MEASURED;
  return `${value.toFixed(digits)} K`;
}

/** Format a temperature in degrees Celsius. */
export function formatCelsius(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NOT_MEASURED;
  return `${value.toFixed(digits)} °C`;
}

/** Format a distance in kilometres with thousands separators. */
export function formatDistanceKm(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NOT_MEASURED;
  return `${Math.round(value).toLocaleString('en-US')} km`;
}

/**
 * Format an ISO timestamp as a compact UTC string.
 *
 * @example "2026-09-26 12:00 UTC"
 */
export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return NOT_MEASURED;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_MEASURED;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/** Short axis label for a chart tick, e.g. `26 Sep 12:00`. */
export function formatChartTick(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${pad(date.getUTCHours())}:00`;
}

/**
 * Describe a time offset relative to a reference instant.
 *
 * @example "in 6.2 h", "14.7 d ago"
 */
export function formatRelative(iso: string | null, referenceIso: string): string {
  if (!iso) return NOT_MEASURED;
  const target = new Date(iso).getTime();
  const reference = new Date(referenceIso).getTime();
  if (Number.isNaN(target) || Number.isNaN(reference)) return NOT_MEASURED;

  const deltaHours = (target - reference) / 3_600_000;
  const magnitude = Math.abs(deltaHours);
  const amount = magnitude >= 48 ? `${(magnitude / 24).toFixed(1)} d` : `${magnitude.toFixed(1)} h`;
  return deltaHours >= 0 ? `in ${amount}` : `${amount} ago`;
}

/**
 * Current UTC time as a `datetime-local` input value (`YYYY-MM-DDTHH:mm`).
 *
 * The browser renders `datetime-local` in the user's local zone, so the app
 * labels the field explicitly as UTC and treats the value as UTC throughout.
 */
export function currentUtcInputValue(): string {
  return toUtcInputValue(new Date());
}

/** Convert a `Date` to a `datetime-local` value using its UTC fields. */
export function toUtcInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/**
 * Convert a `datetime-local` value into an ISO-8601 UTC instant.
 *
 * The input carries no zone, and we define it to *be* UTC, so the `Z` is
 * appended rather than letting `new Date()` apply the local offset.
 *
 * @returns An ISO string, or `null` if the value is not a valid instant.
 */
export function utcInputValueToIso(value: string): string | null {
  if (!value) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const parsed = new Date(`${withSeconds}Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

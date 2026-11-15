/** Wall-time conversion with explicit handling of daylight-saving gaps/folds. */
type DateParts = Record<string, string>;

const zonedParts = (instant: string | number | Date, zone: string, includeSeconds = false): DateParts =>
  Object.fromEntries(new Intl.DateTimeFormat('en-CA-u-hc-h23', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' as const } : {})
  }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));

export function isSupportedTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localInput(instant: string | Date, zone: string): string {
  const parts = zonedParts(instant, zone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatZonedDateTime(instant: string | Date, zone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short'
  }).format(new Date(instant));
}

function offsetAt(instant: number, zone: string): number {
  const parts = zonedParts(instant, zone, true);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return representedAsUtc - Math.floor(instant / 1000) * 1000;
}

export function utcInput(value: string, zone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a complete date and time.');
  if (!isSupportedTimeZone(zone)) throw new Error(`The time zone ${zone} is not supported by this browser.`);

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  const isValid = check.getUTCFullYear() === year
    && check.getUTCMonth() === month - 1
    && check.getUTCDate() === day
    && check.getUTCHours() === hour
    && check.getUTCMinutes() === minute;
  if (!isValid) throw new Error('Enter a valid date and time.');

  // Collect every offset near the requested wall time. This covers ordinary
  // DST transitions as well as zones with half-hour and historical shifts.
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    offsets.add(offsetAt(wall + hours * 3600000, zone));
  }

  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => localInput(new Date(instant), zone) === value)
    .sort((a, b) => a - b);
  if (!matches.length) {
    throw new Error(`This local time does not exist in ${zone} because the clocks change. Choose another time.`);
  }

  // Repeated autumn times resolve to the earlier occurrence.
  return new Date(matches[0]).toISOString();
}

export function timeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const fallback = ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'];
  const available = intl.supportedValuesOf?.('timeZone') ?? fallback;
  const preferred = ['UTC', browserZone, 'Asia/Kolkata'];
  return [...new Set([...preferred, ...available])].filter(isSupportedTimeZone);
}

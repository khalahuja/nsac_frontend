import * as THREE from 'three';

export type SkySample = { datetime_utc: string; azimuth: number | null; elevation: number | null; distance?: number | null };
const valid = (s: SkySample) => Number.isFinite(Date.parse(s.datetime_utc)) && typeof s.azimuth === 'number'
  && Number.isFinite(s.azimuth) && typeof s.elevation === 'number' && Number.isFinite(s.elevation);
const direction = (s: SkySample) => {
  const az = THREE.MathUtils.degToRad(s.azimuth!), el = THREE.MathUtils.degToRad(s.elevation!);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
};

/** Preserve gaps instead of drawing invented connections across absent positions. */
export function skyTrackSegments(samples: SkySample[], stepHours: number): SkySample[][] {
  const segments: SkySample[][] = [];
  let segment: SkySample[] = [];
  for (const s of samples) {
    const previous = segment[segment.length - 1];
    const gap = previous ? Date.parse(s.datetime_utc) - Date.parse(previous.datetime_utc) : 0;
    if (!valid(s) || (previous && (gap <= 0 || gap > stepHours * 3600000 * 1.01))) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (valid(s)) segment.push(s);
  }
  if (segment.length) segments.push(segment);
  return segments;
}

/** Same sightline as the rendered segment, including azimuth wrap and zenith crossings. */
export function skyTrackPosition(samples: SkySample[], instant: string, stepHours: number) {
  const time = Date.parse(instant);
  if (!Number.isFinite(time)) return null;
  for (const segment of skyTrackSegments(samples, stepHours)) {
    const next = segment.findIndex(s => Date.parse(s.datetime_utc) >= time);
    if (next < 0) continue;
    const after = segment[next];
    const exact = Date.parse(after.datetime_utc) === time;
    if (!exact && next === 0) continue;
    const before = exact ? after : segment[next - 1];
    const fraction = exact ? 0 : (time - Date.parse(before.datetime_utc)) / (Date.parse(after.datetime_utc) - Date.parse(before.datetime_utc));
    const vector = direction(before).lerp(direction(after), fraction).normalize();
    const distance = typeof before.distance === 'number' && Number.isFinite(before.distance) && before.distance > 0
      && typeof after.distance === 'number' && Number.isFinite(after.distance) && after.distance > 0
      ? before.distance + (after.distance - before.distance) * fraction : null;
    return { azimuth: (THREE.MathUtils.radToDeg(Math.atan2(vector.x, -vector.z)) + 360) % 360,
      elevation: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(vector.y, -1, 1))), distance };
  }
  return null;
}


/** Clip a sampled path to exact time boundaries without bridging missing data. */
export function skyTrackWindow(samples: SkySample[], start: string, end: string, stepHours: number): SkySample[] {
  const first = Date.parse(start), last = Date.parse(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return [];
  const result = samples.filter(sample => {
    const time = Date.parse(sample.datetime_utc);
    return time >= first && time <= last;
  });
  for (const [time, index] of [[first, 0], [last, 1]] as const) {
    if (result.some(sample => Date.parse(sample.datetime_utc) === time)) continue;
    const datetime_utc = new Date(time).toISOString();
    const position = skyTrackPosition(samples, datetime_utc, stepHours);
    if (position) {
      const sample = { datetime_utc, ...position };
      if (index === 0) result.unshift(sample); else result.push(sample);
    }
  }
  return result;
}

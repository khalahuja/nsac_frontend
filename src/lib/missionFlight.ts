type FlightStage = { outputs: Record<string, number | string | boolean | null> };
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function missionFlightTimes(stages: FlightStage[], departureUtc: string, progress = 0) {
  const output = (key: string) => stages.find(stage => stage.outputs[key] != null)?.outputs[key];
  const departure = date(output('chosen_launch_utc')) ?? date(output('departure_utc')) ?? date(departureUtc);
  const arrival = date(output('arrival_utc'));
  const injection = date(output('tli_utc'));
  const parking = date(output('parking_orbit_utc'));
  const raiseStart = date(output('orbit_raise_start_utc'));
  const staging = date(output('staging_orbit_utc'));
  const landing = date(output('estimated_landing_utc'));
  const burnMinutes = numeric(output('powered_descent_minutes')) ?? numeric(output('ideal_burn_minutes'));
  const descent = date(output('descent_start_utc')) ?? (arrival !== null && landing !== null
    ? Math.max(arrival, landing - (burnMinutes ?? 0) * 60000) : null);
  const p = Math.max(0, Math.min(1, progress));
  const mix = (start: number | null, end: number | null, fraction: number) =>
    start !== null && end !== null ? start + (end - start) * fraction : null;
  const current = injection === null
    ? (p <= .2 ? departure : p <= .65 ? mix(departure, arrival, (p - .2) / .45) : p <= .85 ? mix(arrival, descent, (p - .65) / .2) : mix(descent, landing, (p - .85) / .15))
    : p < .04 ? mix(departure, parking ?? departure, p / .04)
      : p < .1 && staging !== null ? mix(parking, raiseStart, (p - .04) / .06)
      : p < .14 && staging !== null ? mix(raiseStart, staging, (p - .1) / .04)
      : p < .2 ? mix(staging ?? parking, injection, (p - (staging !== null ? .14 : .04)) / (staging !== null ? .06 : .16))
      : p < .65 ? mix(injection, arrival, (p - .2) / .45) : p < .85 ? mix(arrival, descent, (p - .65) / .2) : mix(descent, landing, (p - .85) / .15);
  return { departure, injection, arrival, landing, current,
    tli: numeric(output('tli_delta_v_km_s')), coast: numeric(output('coast_days')), capture: numeric(output('loi_delta_v_km_s')) };
}

export function flightDate(value: number | null) {
  if (value === null) return 'Pending';
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

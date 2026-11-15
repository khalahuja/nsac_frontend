import { SOUTH_POLE_FEATURES } from './southPole';
import { Crater, EnvironmentResult, ForecastResult, ForecastSample, LunarCoordinate } from './lunar';

export const DEFAULT_CRATERS: Crater[] = [
  { name: 'Apollo 11', lat: 0.6741, lon: 23.4729, diameterKm: 0.1, note: 'Mare Tranquillitatis · First crewed landing (1969)' },
  { name: 'Apollo 12', lat: -3.0124, lon: -23.4216, diameterKm: 0.1, note: 'Oceanus Procellarum · Visited Surveyor 3 (1969)' },
  { name: 'Apollo 14', lat: -3.6453, lon: -17.4714, diameterKm: 0.1, note: 'Fra Mauro formation · Imbrium ejecta (1971)' },
  { name: 'Apollo 15', lat: 26.1322, lon: 3.6339, diameterKm: 0.1, note: 'Hadley-Apennine · Lunar rover debut (1971)' },
  { name: 'Apollo 16', lat: -8.9730, lon: 15.5002, diameterKm: 0.1, note: 'Descartes highlands (1972)' },
  { name: 'Apollo 17', lat: 20.1908, lon: 30.7717, diameterKm: 0.1, note: 'Taurus-Littrow valley (1972)' },
  { name: 'Tycho', lat: -43.31, lon: -11.36, diameterKm: 85, note: 'Southern highlands · Prominent young ray system' },
  { name: 'Copernicus', lat: 9.62, lon: -20.08, diameterKm: 93, note: 'Oceanus Procellarum · Terraced walls & central peaks' },
  { name: 'Aristarchus', lat: 23.7, lon: -47.4, diameterKm: 40, note: 'Nearside plateau · Highest albedo feature on the Moon' },
  { name: 'Kepler', lat: 8.1, lon: -38.0, diameterKm: 32, note: 'Oceanus Procellarum · Prominent ray system' },
  { name: 'Plato', lat: 51.6, lon: -9.3, diameterKm: 101, note: 'Mare Imbrium north rim · Dark lava-flooded crater' },
  { name: 'Archimedes', lat: 29.7, lon: -4.0, diameterKm: 83, note: 'Mare Imbrium eastern rim · Smooth basaltic floor' },
  { name: 'Clavius', lat: -58.4, lon: -14.4, diameterKm: 225, note: 'Southern highlands · One of largest ancient craters' },
  // South-polar craters from the USGS/IAU gazetteer (see lib/southPole.ts).
  ...SOUTH_POLE_FEATURES.filter((f) => f.kind === 'crater')
];

const SOLAR_CONSTANT = 1361; // W/m² at 1 AU
const ALBEDO = 0.12;
const EMISSIVITY = 0.95;
const STEFAN_BOLTZMANN = 5.670374419e-8;
const NIGHT_TEMP_FLOOR_K = 100;
const KELVIN_OFFSET = 273.15;
const SYNODIC_MONTH_DAYS = 29.530588853;

/** Approximate subsolar longitude and latitude on the Moon at UTC epoch */
export function estimateSubsolarPoint(datetimeUtc: string): { subsolarLatDeg: number; subsolarLonDeg: number } {
  const epoch2000 = Date.UTC(2000, 0, 1, 12);
  const timeMs = Date.parse(datetimeUtc);
  const days = (timeMs - epoch2000) / 86400000;
  // Moon mean synodic phase: 0° is new moon (sun over far side lon 180°), 180° is full moon (sun over near side lon 0°)
  const meanPhaseDeg = ((days / SYNODIC_MONTH_DAYS) * 360) % 360;
  const subsolarLonDeg = ((180 - meanPhaseDeg + 540) % 360) - 180;
  // Lunar axial tilt relative to the ecliptic is only ~1.54°
  const subsolarLatDeg = 1.54 * Math.sin((days / 365.256) * Math.PI * 2);
  return { subsolarLatDeg, subsolarLonDeg };
}

/** Compute instantaneous solar geometry & radiative equilibrium temperature */
export function computeEquilibriumConditions(coordinate: LunarCoordinate, datetimeUtc: string): EnvironmentResult {
  const { subsolarLatDeg, subsolarLonDeg } = estimateSubsolarPoint(datetimeUtc);

  const latRad = (coordinate.lat * Math.PI) / 180;
  const lonRad = (coordinate.lon * Math.PI) / 180;
  const subLatRad = (subsolarLatDeg * Math.PI) / 180;
  const subLonRad = (subsolarLonDeg * Math.PI) / 180;

  // Cosine of solar zenith angle (incidence angle to local horizontal normal)
  const cosZenith = Math.sin(latRad) * Math.sin(subLatRad) + Math.cos(latRad) * Math.cos(subLatRad) * Math.cos(lonRad - subLonRad);
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, cosZenith))) * (180 / Math.PI);
  const illuminated = elevationDeg > 0;
  const incidenceAngleDeg = Math.acos(Math.max(-1, Math.min(1, cosZenith))) * (180 / Math.PI);

  // Solar azimuth calculation
  const y = Math.sin(subLonRad - lonRad);
  const x = Math.cos(latRad) * Math.tan(subLatRad) - Math.sin(latRad) * Math.cos(subLonRad - lonRad);
  let azimuthDeg = Math.atan2(y, x) * (180 / Math.PI);
  if (azimuthDeg < 0) azimuthDeg += 360;

  const horizontalIrradiance = Math.max(0, cosZenith) * SOLAR_CONSTANT;
  const solarIrradiance = illuminated ? SOLAR_CONSTANT : 0;

  // Browser-only fallback: mean sub-Earth point (0, 0) on a spherical Moon.
  // This includes site geometry but deliberately omits optical libration.
  const earthElevationDeg = Math.asin(Math.max(-1, Math.min(1, Math.cos(latRad) * Math.cos(lonRad)))) * 180 / Math.PI;
  const earthAzimuthDeg = (Math.atan2(-Math.sin(lonRad), -Math.sin(latRad) * Math.cos(lonRad)) * 180 / Math.PI + 360) % 360;
  const earthVisible = earthElevationDeg > 0;

  // Radiative equilibrium temperature
  const qAbsorbed = (1 - ALBEDO) * horizontalIrradiance;
  const qBackground = EMISSIVITY * STEFAN_BOLTZMANN * Math.pow(NIGHT_TEMP_FLOOR_K, 4);
  const tempK = Math.pow((qAbsorbed + qBackground) / (EMISSIVITY * STEFAN_BOLTZMANN), 0.25);
  const tempC = tempK - KELVIN_OFFSET;

  return {
    coordinate: { latitude: coordinate.lat, longitude: coordinate.lon },
    datetime_utc: datetimeUtc,
    solar: {
      elevation_deg: Number(elevationDeg.toFixed(2)),
      azimuth_deg: Number(azimuthDeg.toFixed(2)),
      incidence_angle_deg: Number(incidenceAngleDeg.toFixed(2)),
      illuminated,
      terrain_shadowed: false,
      solar_irradiance_w_m2: Number(solarIrradiance.toFixed(1)),
      horizontal_irradiance_w_m2: Number(horizontalIrradiance.toFixed(1))
    },
    thermal: {
      temperature_k: Number(tempK.toFixed(1)),
      temperature_c: Number(tempC.toFixed(1)),
      model: 'instantaneous-radiative-equilibrium',
      confidence: 'experimental'
    },
    terrain: {
      elevation_m: null,
      slope_deg: 0,
      source: 'IAU 1737.4 km reference sphere (analytic fallback)',
      is_measured: false
    },
    positions: {
      sun: { azimuth_deg: azimuthDeg, elevation_deg: elevationDeg, distance_km: 149597870, above_horizon: illuminated },
      earth: { azimuth_deg: earthAzimuthDeg, elevation_deg: earthElevationDeg, distance_km: 384400, above_horizon: earthVisible },
      reference: 'IAU_MOON body-fixed frame'
    },
    sources: {
      astronomy: 'Analytic Keplerian solar ephemeris',
      terrain: 'Spherical reference model',
      temperature: 'Radiative equilibrium with 100 K night floor',
      diviner: 'Uncalibrated'
    },
    fidelity: {
      astronomy: 'Analytic ephemeris (subsolar drift)',
      terrain: 'Spherical reference surface',
      temperature: 'Simplified radiative equilibrium model',
      overall_note: 'Instantaneous estimate with 100 K darkness floor and standard regolith emissivity (0.95).'
    },
    accuracy_notes: [
      'Albedo assumed at 0.12 across all terrain.',
      'Surface has zero thermal inertia in this instantaneous mode.',
      'Connect analysis backend on port 8000 for high-order SPICE ephemerides.'
    ]
  };
}

/** Compute simulated forecast series across date range */
export function computeSimulatedForecast(
  coordinate: LunarCoordinate,
  startUtc: string,
  endUtc: string,
  stepHours: number
): ForecastResult {
  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);
  const stepMs = stepHours * 3600000;
  const sampleCount = Math.min(1200, Math.max(2, Math.floor((endMs - startMs) / stepMs) + 1));

  const samples: ForecastSample[] = [];
  let currentTempK = NIGHT_TEMP_FLOOR_K + 20;

  for (let i = 0; i < sampleCount; i++) {
    const currentMs = startMs + i * stepMs;
    const currentIso = new Date(currentMs).toISOString();
    const env = computeEquilibriumConditions(coordinate, currentIso);
    const teq = env.thermal.temperature_k;

    // Thermal relaxation model
    const tauHours = env.solar.illuminated ? 10 : 55;
    const dt = stepHours;
    currentTempK = teq + (currentTempK - teq) * Math.exp(-dt / tauHours);
    const currentTempC = currentTempK - KELVIN_OFFSET;

    samples.push({
      datetime_utc: currentIso,
      temperature_k: Number(currentTempK.toFixed(1)),
      temperature_c: Number(currentTempC.toFixed(1)),
      solar_irradiance_w_m2: env.solar.solar_irradiance_w_m2,
      horizontal_irradiance_w_m2: env.solar.horizontal_irradiance_w_m2,
      solar_elevation_deg: env.solar.elevation_deg,
      solar_azimuth_deg: env.solar.azimuth_deg,
      incidence_angle_deg: env.solar.incidence_angle_deg,
      illuminated: env.solar.illuminated,
      earth_elevation_deg: env.positions.earth.elevation_deg,
      earth_azimuth_deg: env.positions.earth.azimuth_deg,
      earth_distance_km: 384400,
      earth_visible: env.positions.earth.above_horizon
    });
  }

  const illuminatedCount = samples.filter(s => s.illuminated).length;
  const totalHorizontalEnergy = samples.reduce((acc, s) => acc + s.horizontal_irradiance_w_m2 * stepHours, 0);

  return {
    coordinate: { latitude: coordinate.lat, longitude: coordinate.lon },
    start_datetime_utc: startUtc,
    end_datetime_utc: endUtc,
    step_hours: stepHours,
    sample_count: samples.length,
    samples,
    earth_visibility_windows: samples[0]?.earth_visible ? [{ start_utc: startUtc, end_utc: endUtc, duration_hours: Math.max(0, (Date.parse(samples[samples.length - 1].datetime_utc) - Date.parse(samples[0].datetime_utc)) / 3600000) }] : [],
    earth_visible_hours: samples[0]?.earth_visible ? samples.length * stepHours : 0,
    sun_above_horizon_hours: illuminatedCount * stepHours,
    horizontal_energy_wh_m2: Math.round(totalHorizontalEnergy),
    min_earth_elevation_deg: 0,
    position_notes: 'Browser fallback: Earth uses a mean sub-Earth point (0°, 0°); lunar libration and eclipses are not modelled. Earth-contact searches require the analysis server.',
    sources: {
      astronomy: 'Analytic ephemeris',
      terrain: 'Spherical datum',
      temperature: 'Dual-decay thermal relaxation model',
      diviner: 'Uncalibrated'
    },
    fidelity: {
      astronomy: 'Analytic solar model',
      terrain: 'Reference sphere',
      temperature: 'Thermal response (tau_sun=10h, tau_dark=55h)',
      overall_note: 'Experimental temperature response curve tracking diurnal heating and cooling.'
    },
    model_name: 'Selene Experimental Diurnal Model',
    model_notes: '10 h sunlit and 55 h dark relaxation response time constants. Earth uses the mean sub-Earth point; libration and eclipses are not modelled.'
  };
}

/** Export forecast data as a formatted CSV file */
export function downloadForecastCsv(forecast: ForecastResult, siteName: string) {
  const headers = [
    'Datetime (UTC)',
    'Temperature (°C)',
    'Temperature (K)',
    'Horizontal Irradiance (W/m²)',
    'Solar Irradiance (W/m²)',
    'Earth Elevation (°)',
    'Solar Elevation (°)',
    'Solar Azimuth (°)',
    'Illumination',
    'Terrain shadow',
    'Sun visibility margin (degrees)',
    'Earth visibility margin (degrees)',
    'Earth visible'
  ];

  const rows = forecast.samples.map(s => [
    s.datetime_utc,
    s.temperature_c.toFixed(1),
    s.temperature_k.toFixed(1),
    s.horizontal_irradiance_w_m2.toFixed(1),
    s.solar_irradiance_w_m2.toFixed(1),
    s.earth_elevation_deg.toFixed(2),
    s.solar_elevation_deg.toFixed(2),
    s.solar_azimuth_deg.toFixed(2),
    s.illuminated ? 'Sunlit' : 'Shadowed',
    s.terrain_shadowed == null ? 'Unknown' : s.terrain_shadowed ? 'Yes' : 'No',
    s.solar_horizon_margin_deg?.toFixed(3) ?? '',
    s.earth_horizon_margin_deg?.toFixed(3) ?? '',
    s.earth_visible ? 'Yes' : 'No'
  ]);

  const csvContent = [
    `# Selene Lunar Environmental Forecast: ${siteName}`,
    `# Latitude: ${forecast.coordinate.latitude.toFixed(4)}°, Longitude: ${forecast.coordinate.longitude.toFixed(4)}°`,
    `# Step Hours: ${forecast.step_hours}, Samples: ${forecast.sample_count}`,
    '# Astronomy source: ' + forecast.sources.astronomy,
    '# Terrain source: ' + forecast.sources.terrain,
    '# Terrain skyline applied throughout: ' + (forecast.terrain_visibility_available ? 'Yes' : 'No or mixed coverage'),
    '# Position notes: ' + forecast.position_notes,
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `selene-forecast-${siteName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

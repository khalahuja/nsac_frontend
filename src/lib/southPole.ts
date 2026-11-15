import type { Crater } from './lunar';

/**
 * South-polar features and NASA candidate landing regions.
 *
 * Feature centres and diameters: the USGS/IAU Gazetteer of Planetary
 * Nomenclature centre-point file (MOON_nomenclature_center_pts), longitudes
 * converted from 0–360°E to −180..180°. Page for each feature:
 * https://planetarynames.wr.usgs.gov/Feature/<gazetteerId>
 *
 * Craters are drawn as circles of the catalogue diameter: an approximate
 * footprint, not a traced rim. "Mons" entries are mountains; their size is the
 * catalogue extent.
 */

export type PolarFeature = Crater & { gazetteerId: number; kind: 'crater' | 'mountain' };
type RawFeature = Omit<PolarFeature, 'note'> & { note?: string };

export const GAZETTEER_URL = 'https://planetarynames.wr.usgs.gov/Feature/';

const RAW_FEATURES: RawFeature[] = [
  { name: 'Shackleton', gazetteerId: 5450, kind: 'crater', lat: -89.67, lon: 129.78, diameterKm: 20.92, note: 'Permanently shadowed floor; M3 surface-ice detections (Li et al. 2018)' },
  { name: 'Haworth', gazetteerId: 14502, kind: 'crater', lat: -87.45, lon: -5.17, diameterKm: 51.42, note: 'Permanently shadowed; M3 surface-ice detections' },
  { name: 'de Gerlache', gazetteerId: 1439, kind: 'crater', lat: -88.48, lon: -88.34, diameterKm: 32.71, note: 'Permanently shadowed; M3 surface-ice detections' },
  { name: 'Faustini', gazetteerId: 1919, kind: 'crater', lat: -87.18, lon: 84.31, diameterKm: 42.48, note: 'Permanently shadowed; M3 surface-ice detections' },
  { name: 'Shoemaker', gazetteerId: 5494, kind: 'crater', lat: -88.14, lon: 45.91, diameterKm: 51.82, note: 'Permanently shadowed; M3 surface-ice detections' },
  { name: 'Sverdrup', gazetteerId: 5782, kind: 'crater', lat: -88.32, lon: -153.39, diameterKm: 32.83, note: 'M3 surface-ice detections' },
  { name: 'Cabeus', gazetteerId: 953, kind: 'crater', lat: -85.33, lon: -42.13, diameterKm: 100.58, note: 'LCROSS impact 9 Oct 2009: 5.6 ± 2.9 % water ice by mass (Colaprete et al. 2010)' },
  { name: 'Cabeus B', gazetteerId: 8058, kind: 'crater', lat: -82.26, lon: -54.58, diameterKm: 59.62 },
  { name: 'Nobile', gazetteerId: 4321, kind: 'crater', lat: -85.28, lon: 53.27, diameterKm: 79.27 },
  { name: 'Amundsen', gazetteerId: 247, kind: 'crater', lat: -84.44, lon: 83.07, diameterKm: 103.39 },
  { name: 'Malapert', gazetteerId: 3603, kind: 'crater', lat: -85.0, lon: 11.4, diameterKm: 72.38 },
  { name: 'Mons Malapert', gazetteerId: 16338, kind: 'mountain', lat: -85.98, lon: -1.67, diameterKm: 67, note: 'Massif; name adopted by the IAU 26 Aug 2024' },
  { name: 'Mons Mouton', gazetteerId: 16070, kind: 'mountain', lat: -84.6, lon: 31.0, diameterKm: 130, note: 'Massif; name adopted by the IAU 13 May 2022' },
  { name: 'Slater', gazetteerId: 15325, kind: 'crater', lat: -88.08, lon: 111.29, diameterKm: 25.12 },
  { name: 'Wiechert', gazetteerId: 6541, kind: 'crater', lat: -84.03, lon: 164.7, diameterKm: 40.82 },
  { name: 'Scott', gazetteerId: 5395, kind: 'crater', lat: -82.35, lon: 48.52, diameterKm: 107.82 },
  { name: "Idel'son", gazetteerId: 2650, kind: 'crater', lat: -81.35, lon: 112.69, diameterKm: 59.82 },
  { name: 'Kocher', gazetteerId: 14535, kind: 'crater', lat: -84.47, lon: -134.02, diameterKm: 24.03 }
];

export const SOUTH_POLE_FEATURES: PolarFeature[] = RAW_FEATURES.map((f) => ({
  ...f,
  note: `USGS/IAU feature ${f.gazetteerId}${f.note ? ` · ${f.note}` : ''} · catalogue-size circle, not a traced rim`
}));

/**
 * NASA's nine candidate landing regions announced 28 Oct 2024
 * (https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/).
 *
 * NASA has not published centre coordinates for these regions, so each is
 * placed at its nearest IAU-named feature and must be read as "near here",
 * not as a boundary. Since Feb 2026 Artemis III is an Earth-orbit test flight
 * and the first crewed landing is planned for Artemis IV.
 */
export type CandidateRegion = { name: string; lat: number; lon: number; anchor: string };

export const CANDIDATE_REGIONS: CandidateRegion[] = [
  { name: 'Peak near Cabeus B', anchor: 'Cabeus B', lat: -82.26, lon: -54.58 },
  { name: 'Haworth', anchor: 'Haworth', lat: -87.45, lon: -5.17 },
  { name: 'Malapert Massif', anchor: 'Mons Malapert', lat: -85.98, lon: -1.67 },
  { name: 'Mons Mouton Plateau', anchor: 'Mons Mouton', lat: -84.6, lon: 31.0 },
  { name: 'Mons Mouton', anchor: 'Mons Mouton', lat: -84.6, lon: 31.0 },
  { name: 'Nobile Rim 1', anchor: 'Nobile', lat: -85.28, lon: 53.27 },
  { name: 'Nobile Rim 2', anchor: 'Nobile', lat: -85.28, lon: 53.27 },
  { name: 'de Gerlache Rim 2', anchor: 'de Gerlache', lat: -88.48, lon: -88.34 },
  { name: 'Slater Plain', anchor: 'Slater', lat: -88.08, lon: 111.29 }
];

export const CANDIDATE_REGIONS_SOURCE =
  'NASA candidate landing regions (announced Oct 2024). NASA publishes no centre coordinates; each is shown at its nearest IAU-named feature.';

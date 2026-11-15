/**
 * Display-frame constants.
 *
 * **None of these affect any scientific result.** They only control how the
 * scene is drawn. Real Sun-Moon and Earth-Moon distances (1.5e8 km and 3.8e5
 * km against a 1737 km Moon) would put the Sun ~86,000 Moon-radii away, which
 * is unusable on screen, so distances are visually compressed while
 * *directions* stay exactly as the backend computed them.
 */

/** Moon radius in display units. The scene is Moon-centric. */
export const MOON_DISPLAY_RADIUS = 1;

/**
 * Radius at which the selected-coordinate marker floats.
 *
 * 1% above the surface: far enough to avoid z-fighting with the Moon mesh,
 * close enough to read as "on the ground".
 */
export const MARKER_DISPLAY_RADIUS = MOON_DISPLAY_RADIUS * 1.01;

/** Earth's drawn radius. Compressed; the true ratio is ~3.67 Moon radii. */
export const EARTH_DISPLAY_RADIUS = 0.55;

/** Distance at which Earth is drawn. True mean distance is ~221 Moon radii. */
export const EARTH_DISPLAY_DISTANCE = 7.5;

/** The Sun's drawn radius. Purely cosmetic. */
export const SUN_DISPLAY_RADIUS = 2.2;

/** Distance at which the Sun sphere is drawn, along the true Sun direction. */
export const SUN_DISPLAY_DISTANCE = 34;

/** Distance of the directional light. Beyond the Sun sphere so shadows read well. */
export const SUN_LIGHT_DISTANCE = 40;

/** Sphere tessellation. 96x96 is smooth at any practical zoom without cost. */
export const MOON_SEGMENTS = 96;
export const EARTH_SEGMENTS = 48;
export const SUN_SEGMENTS = 32;

/** OrbitControls limits, in display units from the Moon's centre. */
export const CAMERA_MIN_DISTANCE = 1.35;
export const CAMERA_MAX_DISTANCE = 22;

/** Default camera position: off to one side and slightly above the equator. */
export const DEFAULT_CAMERA_POSITION: [number, number, number] = [2.6, 1.5, 3.1];

/** Camera distance used when focusing on the selected coordinate. */
export const FOCUS_CAMERA_DISTANCE = 2.4;

/** Procedural texture resolution. 2048x1024 is a 2:1 equirectangular map. */
export const TEXTURE_WIDTH = 2048;
export const TEXTURE_HEIGHT = 1024;

/** Debounce delay for coordinate/time inputs, in milliseconds. */
export const INPUT_DEBOUNCE_MS = 400;

/** Timeline window presets offered in the UI. */
export interface TimelineWindowPreset {
  label: string;
  hoursBefore: number;
  hoursAfter: number;
  stepHours: number;
}

/**
 * Presets from a few days up to a full lunar day.
 *
 * One synodic month is 29.53 Earth days = 708.7 h, so +/-355 h covers a
 * complete lunar day-night cycle.
 */
export const TIMELINE_PRESETS: TimelineWindowPreset[] = [
  { label: '±24 h', hoursBefore: 24, hoursAfter: 24, stepHours: 1 },
  { label: '±72 h', hoursBefore: 72, hoursAfter: 72, stepHours: 3 },
  { label: '±7 d', hoursBefore: 168, hoursAfter: 168, stepHours: 4 },
  { label: 'Lunar day', hoursBefore: 355, hoursAfter: 355, stepHours: 6 }
];

/** Physical constants echoed from the backend, for client-side labelling. */
export const MOON_RADIUS_KM = 1737.4;
export const SYNODIC_MONTH_HOURS = 708.7341;
export const ABSOLUTE_ZERO_C = -273.15;

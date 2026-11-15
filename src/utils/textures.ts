/**
 * Procedural equirectangular textures for the Moon and Earth.
 *
 * ## Scope and honesty
 *
 * These are **visualization aids only**. The lunar texture places the major
 * maria at their real selenographic coordinates and draws the named craters
 * from the backend's feature catalogue at their published positions, but the
 * fine-scale crater field and shading are synthetic. Nothing drawn here is
 * ever read back as data: surface elevation, slope and temperature all come
 * from the API, which reports `null` when it has no measurement.
 *
 * A seeded PRNG is used rather than `Math.random()` so the Moon looks
 * identical on every reload - a texture that reshuffles itself each refresh
 * would imply the surface itself is arbitrary.
 *
 * Replacing these with real NASA imagery (LROC WAC global mosaic, LOLA
 * hillshade) means dropping an equirectangular image into `data/textures/`
 * and loading it with drei's `useTexture` instead of calling these builders.
 *
 * ## Orientation
 *
 * Both textures use the standard 2:1 equirectangular layout that matches
 * `latLonToDisplay` in `coordinates.ts`:
 *
 * ```text
 * x = (longitude + 180) / 360 * width
 * y = (90 - latitude)   / 180 * height
 * ```
 */

import * as THREE from 'three';

import { TEXTURE_HEIGHT, TEXTURE_WIDTH } from './constants';
import type { LunarFeature } from '../types/lunar';

/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * Fast, and good enough for scattering decorative craters. Seeded so the
 * output is stable across reloads.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Map lat/lon to pixel coordinates in an equirectangular canvas. */
function latLonToPixel(
  latitude: number,
  longitude: number,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: ((longitude + 180) / 360) * width,
    y: ((90 - latitude) / 180) * height
  };
}

/** The major lunar maria, at their approximate real centres and extents. */
const MARIA: ReadonlyArray<{ lat: number; lon: number; rx: number; ry: number }> = [
  { lat: 18, lon: -17, rx: 190, ry: 110 }, // Mare Imbrium
  { lat: 28, lon: -3, rx: 145, ry: 100 }, // Mare Frigoris region
  { lat: 17, lon: 59, rx: 120, ry: 84 }, // Mare Crisium
  { lat: 10, lon: 20, rx: 180, ry: 130 }, // Mare Serenitatis / Tranquillitatis
  { lat: -4, lon: -39, rx: 150, ry: 90 }, // Oceanus Procellarum
  { lat: 0, lon: -25, rx: 100, ry: 70 } // Mare Cognitum / Nubium
];

/**
 * Build the lunar surface texture.
 *
 * @param features - Named craters from `/api/moon/features`, drawn at their
 *   published coordinates. Pass an empty array if the catalogue is unavailable.
 * @returns A `CanvasTexture` ready to use as a colour or bump map.
 */
export function createMoonTexture(features: LunarFeature[] = []): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');

  const random = createRandom(0x10a4);

  // Base regolith gradient: highlands are brighter than the mare basins.
  const base = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, '#c8c5b9');
  base.addColorStop(0.5, '#7f7c73');
  base.addColorStop(1, '#aaa69b');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Fine-grained speckle to break up the flat gradient.
  for (let index = 0; index < 4200; index += 1) {
    const shade = 95 + random() * 70;
    context.fillStyle = `rgba(${shade},${shade},${shade},${random() * 0.18})`;
    context.fillRect(
      random() * canvas.width,
      random() * canvas.height,
      1 + random() * 3,
      1 + random() * 3
    );
  }

  // Dark basaltic maria at their real positions.
  for (const mare of MARIA) {
    const { x, y } = latLonToPixel(mare.lat, mare.lon, canvas.width, canvas.height);
    context.fillStyle = 'rgba(58,58,57,0.45)';
    context.beginPath();
    context.ellipse(x, y, mare.rx, mare.ry, 0.2, 0, Math.PI * 2);
    context.fill();
  }

  // Named craters from the catalogue, plus a decorative minor crater field.
  const minorCraters: LunarFeature[] = Array.from({ length: 420 }, () => ({
    name: 'minor',
    lat: random() * 170 - 85,
    lon: random() * 360 - 180,
    diameterKm: 8 + random() * 90,
    note: ''
  }));

  for (const crater of [...features, ...minorCraters]) {
    const { x, y } = latLonToPixel(crater.lat, crater.lon, canvas.width, canvas.height);
    const radius = Math.max(3, Math.min(40, crater.diameterKm / 10));
    const isNamed = crater.name !== 'minor';

    context.strokeStyle = isNamed ? 'rgba(28,28,27,0.65)' : 'rgba(35,35,34,0.32)';
    context.lineWidth = isNamed ? 2.5 : 1;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();

    // Offset highlight suggesting a raised rim lit from the upper left.
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.beginPath();
    context.arc(x - radius * 0.28, y - radius * 0.35, radius * 0.42, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Build a contextual Earth texture.
 *
 * Deliberately low fidelity: the MVP shows Earth for orientation only, and the
 * spec does not require cartographic accuracy here.
 */
export function createEarthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');

  const random = createRandom(0x2e17);

  const ocean = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  ocean.addColorStop(0, '#0a2e66');
  ocean.addColorStop(0.5, '#0b5a85');
  ocean.addColorStop(1, '#092650');
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const landmasses = [
    { x: 0.22, y: 0.38, w: 0.18, h: 0.26, r: -0.25 },
    { x: 0.31, y: 0.63, w: 0.12, h: 0.22, r: 0.35 },
    { x: 0.52, y: 0.36, w: 0.25, h: 0.2, r: 0.12 },
    { x: 0.57, y: 0.58, w: 0.18, h: 0.24, r: -0.18 },
    { x: 0.76, y: 0.55, w: 0.14, h: 0.12, r: 0.2 },
    { x: 0.46, y: 0.78, w: 0.5, h: 0.08, r: 0 }
  ];

  context.filter = 'blur(1px)';
  for (const land of landmasses) {
    context.save();
    context.translate(land.x * canvas.width, land.y * canvas.height);
    context.rotate(land.r);
    const gradient = context.createRadialGradient(0, 0, 4, 0, 0, land.w * canvas.width);
    gradient.addColorStop(0, '#86a85e');
    gradient.addColorStop(0.65, '#426b39');
    gradient.addColorStop(1, '#b49b66');
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(0, 0, land.w * canvas.width, land.h * canvas.height, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  context.filter = 'none';

  // Scattered cloud bands.
  for (let index = 0; index < 125; index += 1) {
    context.save();
    context.translate(random() * canvas.width, random() * canvas.height);
    context.rotate((random() - 0.5) * 0.8);
    context.fillStyle = 'rgba(245,250,255,0.46)';
    context.beginPath();
    context.ellipse(0, 0, 110 + random() * 270, 12 + random() * 35, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

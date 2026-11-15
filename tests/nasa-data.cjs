const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const load = name => {
  const result = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/lib/' + name + '.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env.VITE_API_BASE': '""', 'import.meta.env.VITE_API_BASE_URL': '""' } });
  const mod = new Module(name); mod._compile(result.outputFiles[0].text, name + '.js'); return mod.exports;
};
const { forecastMetrics } = load('forecastMetrics');
const sample = (hour, margin, extra={}) => ({
  datetime_utc: new Date(Date.UTC(2026,0,1) + hour*3600000).toISOString(),
  solar_elevation_deg: 10, incidence_angle_deg: 30, solar_horizon_margin_deg: margin,
  earth_horizon_margin_deg: margin, earth_elevation_deg: 10,
  horizontal_irradiance_w_m2: 10, ...extra
});
const series = [sample(0,-1),sample(3,1),sample(6,-1),sample(7,-2)];
const metrics = forecastMetrics(series);
assert.equal(metrics.sunlit_hours,3);
assert.equal(metrics.earth_visible_hours,3);
assert.equal(metrics.sun_above_horizon_hours,7);
assert.equal(metrics.horizontal_energy_wh_m2,70,'Endpoint rows and a short final interval must not add extra energy.');
assert.equal(metrics.longest_darkness_hours,2.5);
assert.equal(metrics.darkness_boundary_limited,true);
assert.equal(metrics.sun_visibility_windows.length,1);
const continuous = forecastMetrics([sample(0,1),sample(1,1),sample(2,1),sample(3,1)]);
assert.equal(continuous.sun_visibility_windows.length,1,'A window crossing a fetched chunk boundary stays joined.');
assert.equal(continuous.sunlit_hours,3);
assert.equal(continuous.longest_darkness_hours,0);
const allDark = forecastMetrics([sample(0,-1),sample(7,-1)]);
assert.equal(allDark.longest_darkness_hours,7);
assert.equal(allDark.darkness_boundary_limited,true);
const { imageryPixel } = load('nasaData');
const matrix={width:2,height:1,tile_width:256,tile_height:256,top_left:[-1000,1000],pixel_size:10};
assert.deepEqual(imageryPixel({projection:'eq'},matrix,0,0),[256,128]);
assert.deepEqual(imageryPixel({projection:'south'},matrix,-90,0),[100,100]);
console.log('NASA forecast integration, chunk boundaries and native lunar map-coordinate checks passed.');

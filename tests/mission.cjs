const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/missionMath.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleUnderTest = new Module(filename); moduleUnderTest._compile(compiled, filename);
const { landingScreen, orbitInsertion, LUNAR_MU, LUNAR_RADIUS_KM } = moduleUnderTest.exports;
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
// Rayleigh CDF: one sigma radius contains 39.35%, two sigma 86.47%.
close(landingScreen(1, 1, 100, 100).containment, 1 - Math.exp(-.5));
close(landingScreen(1, 2, 100, 100).combined, 1 - Math.exp(-2));
close(landingScreen(35, 100, 0, 99.5).combined, 0);
assert.ok(landingScreen(1e8, 1, 100, 100).combined > 0, 'small CDF remains numerically stable');
for (const args of [[0, 10, 100, 100], [35, -1, 100, 100], [35, 10, 101, 90], [35, 10, 90, -1]]) assert.throws(() => landingScreen(...args));
// Parabolic arrival into a circular orbit: delta-v = (sqrt(2)-1) v_c.
const circular = orbitInsertion(0, 100, 100);
const vc = Math.sqrt(LUNAR_MU / (LUNAR_RADIUS_KM + 100));
close(circular.orbitSpeed, vc); close(circular.loi, (Math.sqrt(2) - 1) * vc);
assert.ok(circular.orbitalPeriodHours > 1.9 && circular.orbitalPeriodHours < 2.0);
assert.ok(orbitInsertion(.8, 100, 1000).loi < orbitInsertion(.8, 100, 100).loi);
for (const args of [[.8, 100, 50], [-1, 100, 100], [.8, -10, 100], [NaN, 100, 100]]) assert.throws(() => orbitInsertion(...args));
console.log('Landing CDF, probability bounds, circular/elliptic LOI and invalid-orbit checks passed.');

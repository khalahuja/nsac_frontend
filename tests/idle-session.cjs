const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/idleSession.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const tested = new Module(filename); tested._compile(compiled, filename);
const { createIdleTimer, SESSION_IDLE_MS } = tested.exports;
function fixture() {
  let now = 1000000, expired = 0, id = 0;
  const jobs = new Map();
  const timer = createIdleTimer({ now: () => now, schedule: fn => { jobs.set(++id, fn); return id; }, cancel: key => jobs.delete(key) }, now, () => expired++);
  return { timer, advance: ms => now += ms, expired: () => expired, jobs };
}
assert.equal(SESSION_IDLE_MS, 180000);
{
  const f = fixture(); f.advance(179999); assert.equal(f.timer.check(), true);
  f.advance(1); assert.equal(f.timer.check(), false); assert.equal(f.expired(), 1);
  f.timer.check(); assert.equal(f.expired(), 1);
}
{
  const f = fixture(); f.advance(120000); assert.equal(f.timer.activity(), true);
  f.advance(179999); assert.equal(f.timer.check(), true);
  f.advance(1); f.timer.check(); assert.equal(f.expired(), 1);
}
{
  const f = fixture(); f.advance(600000); // Browser suspended; timeout did not run.
  assert.equal(f.timer.activity(), false); assert.equal(f.expired(), 1);
}
{
  const f = fixture(); f.advance(200000);
  assert.equal(f.timer.synchronize(1190000), true); // Input in another tab 10 seconds ago.
  assert.equal(f.expired(), 0); f.advance(170000); f.timer.check(); assert.equal(f.expired(), 1);
}
{
  const f = fixture(); f.timer.dispose(); assert.equal(f.jobs.size, 0);
  f.advance(600000); f.timer.check(); assert.equal(f.expired(), 0);
}
console.log('Idle timer: exact deadline, active input, suspended tab, cross-tab synchronization and cleanup passed.');

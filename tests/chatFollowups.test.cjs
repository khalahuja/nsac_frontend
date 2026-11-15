const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(resolve(__dirname, '../src/lib/chatFollowups.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
vm.runInThisContext('(function(exports) {' + compiled + '\n})', { filename: 'chatFollowups.ts' })(api);
const { summarizeSearch, followupOptions } = api;

test('only completed, bounded result summaries enter the next turn', () => {
  assert.equal(summarizeSearch(), null);
  assert.equal(summarizeSearch({ status: 'loading' }), null);
  assert.deepEqual(summarizeSearch({ status: 'windows', windows: [{ start: 'private-detail' }] }), { kind: 'windows', match_count: 1 });
  assert.deepEqual(summarizeSearch({ status: 'error', message: 'internal failure detail' }), { kind: 'error' });
});

for (const [status, field] of [['windows', 'windows'], ['mission', 'candidates'], ['ranking', 'sites']]) {
  test(status + ' with no matches offers diagnosis instead of successful-result questions', () => {
    const result = followupOptions(['Explain the best result'], { status, [field]: [] });
    assert.ok(result.includes('Which constraint should I reconsider?'));
    assert.ok(!result.includes('Explain the best result'));
    assert.ok(result.every(text => text.length <= 60));
  });
}

test('wait for results before offering follow-ups and suppress them on failure', () => {
  assert.deepEqual(followupOptions(['Explain the best result'], { status: 'loading' }), []);
  assert.deepEqual(followupOptions(['Explain the best result'], { status: 'error' }), []);
});

test('retain relevant successful-result options, remove duplicates and incomplete labels', () => {
  assert.deepEqual(followupOptions(['Explain the constraints', 'Explain the constraints?', 'x'.repeat(61), 'Compare these sites'], { status: 'ranking', sites: [{}] }),
    ['Explain the constraints', 'Compare these sites']);
});

test('an intentional empty clarification does not get unrelated fallback chips', () => {
  assert.deepEqual(followupOptions([]), []);
  assert.deepEqual(followupOptions(undefined), []);
});

const recoverySource = readFileSync(resolve(__dirname, '../src/lib/chatRecovery.ts'), 'utf8');
const recoveryCompiled = ts.transpileModule(recoverySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const recovery = {};
vm.runInThisContext('(function(exports) {' + recoveryCompiled + '\n})', { filename: 'chatRecovery.ts' })(recovery);
const { localChatNavigation, retryDelay, retryLabel, historyForSend } = recovery;

test('explicit navigation needs no model, including calculator pages', () => {
  assert.deepEqual(localChatNavigation('Open the Earth-visibility plot'), { page: 'horizon' });
  assert.deepEqual(localChatNavigation('Open the battery calculator'), { page: 'battery' });
  assert.deepEqual(localChatNavigation('Show surface shadows'), { page: 'surface' });
});

test('navigation never discards requested calculations or constraints', () => {
  assert.equal(localChatNavigation('Find a launch window with eight days of sunlight'), null);
  assert.equal(localChatNavigation('Open science windows and require Earth contact'), null);
  assert.equal(localChatNavigation('How does terrain affect battery requirements?'), null);
});

test('provider cooldown honors fractional retry times, with a safe fallback', () => {
  assert.equal(retryDelay(503, new Headers({ 'X-Selene-Error': 'upstream_rate_limit', 'Retry-After': '120.5' })), 121);
  assert.equal(retryDelay(503, new Headers()), null);
  assert.equal(retryDelay(429, new Headers({ 'Retry-After': '-1' })), 60);
  assert.equal(retryDelay(429, new Headers({ 'Retry-After': 'Infinity' })), 60);
  assert.equal(retryLabel(121), 'Retry in 3m');
});

test('one-click retry preserves the original turn without duplicating it', () => {
  const turns = [{ role: 'assistant', content: 'Previous answer' }, { role: 'user', content: 'My request' }];
  assert.deepEqual(historyForSend(turns, { role: 'user', content: 'My request' }, true), turns);
  assert.equal(historyForSend(turns, { role: 'user', content: 'New request' }, true).length, 3);
  assert.equal(turns.length, 2);
});

test('Earth-visibility follow-up focuses the existing comparison without AI', () => {
  assert.deepEqual(localChatNavigation('Compare their Earth visibility', 'compare'),
    { page: 'compare', compare_focus: 'earth_visibility' });
  assert.deepEqual(localChatNavigation('Compare their Earth contact?', 'compare'),
    { page: 'compare', compare_focus: 'earth_visibility' });
});

test('comparison shortcut does not guess sites or drop extra conditions', () => {
  assert.equal(localChatNavigation('Compare their Earth visibility', 'selene'), null);
  assert.equal(localChatNavigation('Compare their Earth visibility in March 2028', 'compare'), null);
  assert.equal(localChatNavigation('Compare their Earth visibility and require sunlight', 'compare'), null);
});

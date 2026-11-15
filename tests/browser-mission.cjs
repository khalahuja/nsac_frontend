const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const targets = await (await fetch('http://127.0.0.1:9228/json')).json();
  const target = targets.find(t => t.type === 'page' && t.url.includes('5173'));
  if (!target) throw new Error('Mission preview browser is unavailable.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map(), errors = [];
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params }));
  });
  socket.onmessage = async event => {
    const message = JSON.parse(event.data);
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      const body = message.params.request.url.endsWith('/config') ? { challenge_required: false, site_key: '' } : { reply: 'Opened landing probability with your 50 m dispersion and 150 m radius. Other fields use the visible example assumptions.', action: { page: 'landing', inputs: { sigma_m: 50, radius_m: 150 } }, options: [] };
      await call('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
    }
  };
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const state = await evaluate("({ url:location.href, text:document.body.innerText.slice(0,1600), heading:document.querySelector('.fx-head h2')?.textContent })");
    throw new Error('Timed out: ' + expression + '\n' + JSON.stringify(state) + '\nErrors: ' + errors.join(', '));
  };
  const route = async slug => { await evaluate(`location.hash=${JSON.stringify('#' + slug)}`); await waitFor(`location.hash===${JSON.stringify('#' + slug)}`); };
  const field = (label, value) => evaluate(`(() => {
    const form = document.querySelector('.fx-main > div:not([hidden]) form');
    const l = [...form.querySelectorAll('label')].find(l => l.textContent.includes(${JSON.stringify(label)}));
    const input = document.getElementById(l.htmlFor);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  const outputDir = path.resolve(__dirname, 'previews'); fs.mkdirSync(outputDir, { recursive: true });
  const screenshot = async name => { const data = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outputDir, name + '.png'), Buffer.from(data.data, 'base64')); };
  try {
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: 'http://localhost:5173/#landing' });
    await waitFor("!!document.querySelector('.fx-head') && document.querySelector('.fx-head h2').textContent.includes('Landing')");
    assert.equal(await evaluate("document.querySelectorAll('.atlas-nav > a').length"), 5);
    assert.equal(await evaluate("document.querySelector('.atlas-nav [aria-current]').textContent.trim()"), 'Landing probability');
    await screenshot('mission-landing-desktop');
    await field('Vehicle success assumption', 105);
    await waitFor("!!document.querySelector('.fx-main > div:not([hidden]) [role=alert]')");
    await field('Vehicle success assumption', 99.5);
    await route('orbit');
    await waitFor("document.querySelector('.fx-head h2').textContent.includes('Orbit')");
    await field('Perilune altitude', 200);
    await waitFor("document.querySelector('.fx-main > div:not([hidden]) [role=alert]')?.textContent.includes('Apolune')");
    await field('Apolune altitude', 200);
    await waitFor("!document.querySelector('.fx-main > div:not([hidden]) [role=alert]')");
    assert.equal(await evaluate("document.querySelectorAll('.fx-timeline li').length"), 6);
    await screenshot('mission-orbit-desktop');
    await route('water'); await waitFor("document.querySelector('.fx-head h2').textContent.includes('Water')");
    assert.equal(await evaluate("document.querySelector('.fx-main > div:not([hidden]) .fx-evidence-check input').checked"), false);
    await route('moon'); await waitFor("!!document.querySelector('.sl-polar-overview') && !!document.querySelector('canvas')");
    await evaluate("document.querySelector('.sl-polar-layout button').click()");
    await evaluate("new Promise(resolve=>setTimeout(resolve,1500))");
    await screenshot('mission-pole-desktop');
    // Deterministic UI contract: mock only the assistant's reply, not calculations.
    await call('Fetch.enable', { patterns: [{ urlPattern: '*/api/chat*', requestStage: 'Request' }] });
    await evaluate("document.querySelector('.sc-launcher').click()");
    await waitFor("!!document.querySelector('.sc-panel')");
    await evaluate("new Promise(resolve=>setTimeout(resolve,500))");
    await evaluate("(() => { const input=document.querySelector('.sc-composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Open landing probability with 50 m dispersion and 150 m radius'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    await evaluate("document.querySelector('.sc-composer').requestSubmit()");
    await waitFor("location.hash==='#landing' && !!document.querySelector('.sc-card')");
    await waitFor("document.querySelector('.fx-main > div:not([hidden]) input[type=number]').value==='50'");
    assert.equal(await evaluate("[...document.querySelectorAll('.fx-main > div:not([hidden]) input[type=number]')][1].value"), '150');
    await screenshot('mission-chat-desktop');
    await evaluate("document.querySelector('.sc-launcher').click()");
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await screenshot('mission-landing-mobile');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'mobile viewport has no horizontal overflow');
    await evaluate("document.querySelector('.sc-launcher').click()");
    await screenshot('mission-chat-mobile');
    for (const slug of ['moon', 'sky', 'compare', 'forecast', 'science-windows', 'landing', 'orbit', 'water', 'candidates', 'solar', 'battery', 'radio', 'line-of-sight', 'temperature', 'sky-envelope', 'constants', 'models']) {
      await route(slug); await evaluate("new Promise(resolve=>setTimeout(resolve,350))");
      assert.ok(await evaluate("!!document.querySelector('.atlas-nav [aria-current]')"), `${slug} has its own selected navigation entry`);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${slug} has no mobile document overflow`);
    }
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('17 feature routes, landing/orbit validation, water defaults, south-pole controls, chatbot navigation and form values, and mobile overflow passed. Assistant response was mocked.');
  } finally { await call('Browser.close').catch(() => {}); socket.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

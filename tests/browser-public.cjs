const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { if (await fn()) return; } catch {}
    await sleep(100);
  }
  throw new Error('Timed out: ' + label);
}
let server, browser, socket, call;
(async () => {
  server = spawn(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'),
    'preview', '--host', '127.0.0.1', '--port', '5184', '--strictPort'],
    { cwd: path.join(root, 'frontend'), windowsHide: true, stdio: 'ignore' });
  await until(async () => (await fetch('http://127.0.0.1:5184')).ok, 'production preview');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'selene-public-'));
  const executable = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find(file => fs.existsSync(file));
  assert.ok(executable, 'Headless Edge or Chrome is required');
  browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=9234',
    '--remote-allow-origins=http://localhost:9234', '--user-data-dir=' + profile, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
  let target;
  await until(async () => {
    target = (await (await fetch('http://127.0.0.1:9234/json')).json()).find(tab => tab.type === 'page');
    return !!target;
  }, 'headless browser');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0, chats = 0;
  const pending = new Map(), authRequests = [], errors = [];
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = async event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (request) message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method !== 'Fetch.requestPaused') return;
    const { request, requestId } = message.params;
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/auth/')) authRequests.push(url.pathname);
    let status = 200, body = {}, headers = [{ name: 'Content-Type', value: 'application/json' }];
    if (url.pathname === '/api/chat/config') body = { challenge_required: false, site_key: '' };
    else if (url.pathname === '/api/craters') body = [];
    else if (url.pathname === '/api/status') body = { status: 'ok', astronomy_source: 'simple-analytic-ephemeris', terrain_source: 'flat-sphere' };
    else if (url.pathname === '/api/chat') {
      chats++;
      if (chats === 1) body = { reply: '<img src=x onerror="window.__xss=true">', action: null, options: [] };
      else {
        status = 429; body = { detail: 'Too many messages from your network. Please wait 60 seconds and try again.' };
        headers.push({ name: 'Retry-After', value: '60' });
      }
    }
    await call('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: headers,
      body: Buffer.from(JSON.stringify(body)).toString('base64') });
  };
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  for (const hash of ['login', 'signup', 'operations']) {
    await call('Page.navigate', { url: 'http://127.0.0.1:5184/#' + hash });
    await until(() => evaluate("!!document.querySelector('.sl-navbar')"), 'public route #' + hash);
    assert.equal(await evaluate("!!document.querySelector('.auth-page, .auth-loading, .account-nav')"), false);
    assert.equal(await evaluate("document.querySelectorAll('a[href=\"#login\"], a[href=\"#signup\"]').length"), 0);
  }
  assert.deepEqual(authRequests, [], 'The public app must never request account endpoints');
  await evaluate("document.querySelector('.sc-launcher').click()");
  await until(() => evaluate("!!document.querySelector('.sc-composer textarea')"), 'assistant');
  async function sendQuestion() {
    await evaluate("(function(){const el=document.querySelector('.sc-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Explain the mission constraints');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await until(() => evaluate("!!document.querySelector('.sc-send:not(:disabled)')"), 'send ready');
    await evaluate("document.querySelector('.sc-send').click()");
  }
  await sendQuestion();
  await until(() => evaluate("!!document.querySelector('.sc-turn.is-assistant .sc-bubble')"), 'assistant response');
  assert.equal(await evaluate("document.querySelectorAll('.sc-log img').length"), 0);
  assert.equal(await evaluate("window.__xss === true"), false, 'Untrusted assistant text must not execute HTML');
  await sendQuestion();
  await until(() => evaluate("document.querySelector('.sc-error')?.textContent.includes('Retry in')"), 'rate-limit cooldown');
  assert.equal(await evaluate("document.querySelector('.sc-retry').disabled"), true);
  assert.equal(chats, 2);
  assert.deepEqual(errors, []);
  console.log('PASS: login/signup bookmarks open the app; no account requests; assistant HTML stays text; 429 shows a retry cooldown.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (call && socket?.readyState === WebSocket.OPEN) {
    await Promise.race([call('Browser.close').catch(() => {}), sleep(1000)]);
  }
  if (socket) socket.close();
  if (browser) browser.kill();
  if (server) server.kill();
});

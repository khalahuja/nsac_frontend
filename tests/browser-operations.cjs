const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const previews = path.join(__dirname, 'previews');
fs.mkdirSync(previews, { recursive: true });
const python = path.join(root, 'env/Scripts/python.exe');
const fixture = JSON.parse(execFileSync(python, ['-c', `import json; from datetime import datetime, timezone, timedelta; from backend.app.services.operations import OperationsRequest,MissionRequirements,plan_operations; from backend.app.services.providers import build_providers; from backend.app.config import Settings; start=datetime(2027,1,1,tzinfo=timezone.utc); r=OperationsRequest(latitude=-89.4398,longitude=-137.17,landing_start_utc=start,landing_end_utc=start+timedelta(days=2),requirements=MissionRequirements(mission_hours=48,min_both_hours=0)); print(json.dumps(plan_operations(r,build_providers(Settings(use_spice=False,use_terrain_dem=False,use_terrain_shadows=False,use_diviner=False)))))`], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'] }));
let server, edge, socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, limit=30000) { const end=Date.now()+limit; while(Date.now()<end) { try { if(await fn()) return; } catch {} await delay(150); } throw new Error('Timed out: '+label); }
(async () => {
  // Use a separate Vite port and browser profile, so existing user sessions stay isolated.
  server=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5181','--strictPort'],{cwd:path.join(root,'frontend'),windowsHide:true,stdio:'ignore'});
  await until(async()=> (await fetch('http://127.0.0.1:5181')).ok,'Vite test server');
  edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9231','--remote-allow-origins=http://localhost:9231',`--user-data-dir=${path.join(previews,'operations-edge')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let target;
  await until(async()=> { target=(await(await fetch('http://127.0.0.1:9231/json')).json()).find(t=>t.type==='page');return !!target; },'headless Edge');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0; const pending=new Map(), errors=[]; const requests=[];
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  socket.onmessage=async event=>{
    const message=JSON.parse(event.data);
    if(message.id){const req=pending.get(message.id);pending.delete(message.id);if(req)message.error?req.reject(new Error(message.error.message)):req.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if(message.method==='Fetch.requestPaused'){
      try {
        const {request,requestId}=message.params; const url=new URL(request.url); let body;
        if(url.pathname.startsWith('/api/auth/'))body=url.pathname.endsWith('/config')?{challenge_required:false,site_key:''}:{id:1,name:'Operations test',email:'operations@example.test',idle_expires_at:Date.now()/1000+180};
        else if(url.pathname==='/api/chat/config')body={challenge_required:false,site_key:''};
        else if(url.pathname==='/api/mission/operations'){
          const payload=JSON.parse(request.postData);requests.push(payload);body={...fixture,request:payload};
        } else if(url.pathname==='/api/chat'){
          const payload=JSON.parse(request.postData);const operations=structuredClone(payload.operations_context);
          assert.equal(payload.page,'operations');assert.ok(operations);
          operations.requirements.min_sunlight_pct=80;
          body={reply:'Review the updated minimum sunlight; other requirements are preserved.',action:{page:'operations',operations},options:[]};
        } else if(url.pathname==='/api/status')body={};
        else if(url.pathname==='/api/moon/features')body=[];
        else {await call('Fetch.failRequest',{requestId,errorReason:'ConnectionRefused'});return;}
        await call('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
      } catch(error){errors.push(error.message);}
    }
  };
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{try {await until(()=>evaluate(expression),expression,45000);} catch(error) {console.error(await evaluate("({url:location.href,text:document.body.innerText.slice(0,2500)})"));console.error('Browser exceptions:',errors);await call('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(previews,'operations-failure.png'),Buffer.from(r.data,'base64')));throw error;}};
  const click=text=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button');b.click();})()`);
  const field=(label,value)=>evaluate(`(()=>{const l=[...document.querySelectorAll('.ops-form label')].find(l=>l.textContent.includes(${JSON.stringify(label)}));const el=l.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await call('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('selene.auth.thisTab','1');localStorage.setItem('selene.auth.lastActivity',String(Date.now()));`});
  await call('Page.navigate',{url:'http://127.0.0.1:5181/?lat=-89.4398&lon=-137.17&start=2027-01-01T00%3A00%3A00Z&end=2027-01-03T00%3A00%3A00Z&tz=UTC#operations'});
  await wait(`!!document.querySelector('.ops-form')`);
  await field('Mission duration',48);await field('Minimum sunlight + contact overlap',0);
  await click('Find best landing dates');
  await wait(`document.querySelectorAll('.ops-track').length===3`);
  assert.equal(requests.length,1);assert.equal(requests[0].requirements.mission_hours,48);
  assert.equal(await evaluate(`document.querySelectorAll('.ops-nearby g[role=button]').length`),8);
  assert.equal(await evaluate(`document.querySelectorAll('.ops-checks > div').length`),5);
  await evaluate(`document.querySelectorAll('.ops-date-list button')[1].click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.ops-date-list button')[1].getAttribute('aria-pressed')`),'true');
  await evaluate(`(()=>{const el=document.querySelector('.ops-timeline input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'12');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`document.querySelector('.ops-timeline label').textContent.includes('hour 12')`);
  await evaluate(`document.querySelectorAll('.ops-nearby g[role=button]')[2].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  assert.match(await evaluate(`document.querySelector('.ops-alternative h3').textContent`),/E alternative/);
  await click('Use this landing time');await wait(`document.querySelectorAll('.ops-track').length===3`);
  await call('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(previews,'operations-desktop.png'),Buffer.from(r.data,'base64')));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await delay(250);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`),'mobile page must not overflow');
  assert.ok(await evaluate(`document.querySelector('.ops-page').getBoundingClientRect().right<=window.innerWidth+1`),'operations workspace must fit mobile');
  await call('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(previews,'operations-mobile.png'),Buffer.from(r.data,'base64')));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await click('Ask the assistant');
  await wait(`!!document.querySelector('.sc-composer textarea')`);
  const chatInput=`document.querySelector('.sc-composer textarea')`;
  await evaluate(`(()=>{const el=${chatInput};Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Set minimum sunlight to 80%');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`!!document.querySelector('.sc-send:not(:disabled)')`);
  await evaluate(`document.querySelector('.sc-send').click()`);
  await wait(`!!document.querySelector('.sc-card')`);
  assert.equal(await evaluate(`document.querySelector('.ops-form input[type=number]').value`),'48');
  await click('Apply mission settings');
  await wait(`document.querySelectorAll('.ops-form input[type=number]')[1].value==='80'`);
  assert.equal(await evaluate(`document.querySelectorAll('.ops-track').length`),0,'applying settings invalidates old results');
  // Close chat before selecting a new alternative in the next run.
  assert.deepEqual(errors,[]);
  console.log('Operations browser checks passed: search, 3 tracks, 5 checks, 8 alternatives, cursor, date selection, mobile fit and chatbot review/apply.');
  await call('Browser.close');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(socket)socket.close();if(edge)edge.kill();if(server)server.kill();});

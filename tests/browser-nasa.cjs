const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const previews = path.join(__dirname, 'previews');
fs.mkdirSync(previews, {recursive:true});
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(fn,label,limit=45000) {
  const end=Date.now()+limit;
  while(Date.now()<end) { try { if(await fn()) return; } catch {} await delay(200); }
  throw Error('Timed out: '+label);
}
let api, server, edge, socket;
const errors=[], serviceResponses=[], imageryResponses=[];
(async()=>{
  api=spawn(path.join(root,'env/Scripts/python.exe'),['-m','uvicorn','tests.nasa_preview:app','--host','127.0.0.1','--port','8014'],{cwd:path.join(root,'backend'),windowsHide:true,stdio:'ignore'});
  await until(async()=> (await fetch('http://127.0.0.1:8014/api/status')).ok,'NASA preview API');
  server=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--config','tests/nasa-vite.config.ts'],{cwd:path.join(root,'frontend'),windowsHide:true,stdio:'ignore'});
  await until(async()=> (await fetch('http://127.0.0.1:5184')).ok,'NASA preview frontend');
  edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
    '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=9234','--remote-allow-origins=http://localhost:9234',
    '--user-data-dir='+path.join(previews,'nasa-edge'),'about:blank'
  ],{windowsHide:true,stdio:'ignore'});
  let target;
  await until(async()=>{ target=(await(await fetch('http://127.0.0.1:9234/json')).json()).find(t=>t.type==='page');return !!target; },'NASA preview browser');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  socket.onmessage=async event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Network.responseReceived' && m.params.response.url.includes('/tiles/Moon/'))imageryResponses.push(m.params.response.status);
    if(m.method==='Network.responseReceived' && m.params.response.url.includes('/api/nasa/'))serviceResponses.push({url:m.params.response.url,status:m.params.response.status});
    if(m.method==='Fetch.requestPaused'){
      const {requestId,request}=m.params;const url=new URL(request.url);
      const body=url.pathname.startsWith('/api/auth/')?{id:1,name:'NASA test',email:'nasa@example.test',idle_expires_at:Date.now()/1000+180}:{challenge_required:false,site_key:''};
      await call('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
    }
  };
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{try{await until(()=>evaluate(expression),expression,60000);}catch(e){console.error(await evaluate('document.body.innerText.slice(-5000)'));throw e;}};
  const click=text=>evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+JSON.stringify(text)+');if(!b)throw Error("Missing button");b.click();})()');
  const screenshot=async name=>{const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(previews,name+'.png'),Buffer.from(r.data,'base64'));};
  const input=(label,value)=>evaluate('(()=>{const l=[...document.querySelectorAll(".nasa-page label")].find(l=>l.textContent.includes('+JSON.stringify(label)+'));const el=l.querySelector("input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,'+JSON.stringify(String(value))+');el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await call('Fetch.enable',{patterns:[{urlPattern:'*/api/auth/*'},{urlPattern:'*/api/chat/config'}]});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"sessionStorage.setItem('selene.auth.thisTab','1');localStorage.setItem('selene.auth.lastActivity',String(Date.now()));"});
  await call('Page.navigate',{url:'http://127.0.0.1:5184/?lat=-89.4398&lon=-137.17&start=2027-01-01T00%3A00%3A00Z&end=2027-01-02T00%3A00%3A00Z&t=2027-01-01T00%3A00%3A00Z&tz=UTC#nasa-data'});
  await wait('document.querySelectorAll(".nasa-terrain-layout svg rect").length===625');
  assert.ok(await evaluate('document.querySelector(".nasa-source").textContent.includes("5 m")'),'Real high-resolution source is visible.');
  assert.ok(await evaluate('document.querySelector(".nasa-cell-readout").textContent.includes("1958.48")'),'Native LOLA elevation is rendered.');
  await screenshot('nasa-terrain-desktop');
  await wait('!!document.querySelector(".nasa-map svg image")');
  await evaluate('document.querySelector(".nasa-map").scrollIntoView({block:"center"})');
  await delay(2000);
  await screenshot('nasa-polar-imagery-desktop');
  await evaluate('window.scrollTo(0,0)');
  await input('Slope limit',1);await click('Update terrain');
  await wait('document.querySelector(".nasa-cell-readout")?.textContent.includes("hazard")');
  await click('Observed temperature');await click('Compare temperatures');
  await wait('!!document.querySelector(".nasa-thermal-chart")');
  assert.ok(await evaluate('document.querySelector(".nasa-page table").textContent.includes("PCP_AVG_TBOL")'),'Real local-time profile is visible.');
  await screenshot('nasa-temperature-desktop');
  await click('Water evidence');
  await wait('document.querySelector(".nasa-page table")?.textContent.includes("LCROSS")');
  await wait('!!document.querySelector(".nasa-map svg")');
  assert.ok(await evaluate('document.querySelector(".nasa-page").textContent.includes("146.14 ppm H")'),'Real native hydrogen bin is visible.');
  const collection={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-137.2,-89.45],[-137.1,-89.45],[-137.1,-89.43],[-137.2,-89.43],[-137.2,-89.45]]]},properties:{name:'Test sourced polygon',evidence_type:'resource_potential',source_url:'https://example.test/fixture',note:'Test fixture, not NASA data.'}}]};
  const fixture=path.join(previews,'nasa-evidence-fixture.geojson');fs.writeFileSync(fixture,JSON.stringify(collection));
  const document=await call('DOM.getDocument');const fileNode=await call('DOM.querySelector',{nodeId:document.root.nodeId,selector:'.nasa-page input[type=file]'});
  await call('DOM.setFileInputFiles',{nodeId:fileNode.nodeId,files:[fixture]});
  await wait('document.querySelector(".nasa-page table")?.textContent.includes("Test sourced polygon")');
  assert.ok(await evaluate('document.querySelector(".nasa-page table").textContent.includes("Resource proxies")'),'Imported proxies keep their evidence category.');
  assert.ok(await evaluate('document.querySelector(".nasa-page table").textContent.includes("Site inside footprint")'),'Actual footprint geometry is evaluated.');
  await screenshot('nasa-water-desktop');
  await click('JPL validation');await click('Check against JPL Horizons');
  await wait('!!document.querySelector(".nasa-metrics")');
  assert.equal(await evaluate('document.querySelectorAll(".nasa-page tbody tr").length'),4,'Two dates produce four body comparisons.');
  console.log('Live JPL report:',await evaluate('document.querySelector(".nasa-metrics").innerText'));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('document.querySelector(".sc-teaser button")?.click()');
  await evaluate('document.querySelector(".nasa-card").scrollIntoView({block:"start"})');
  await screenshot('nasa-validation-mobile');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Validation page fits mobile width.');
  for(const tab of ['Terrain & imagery','Observed temperature','Water evidence']){
    await click(tab);await delay(400);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),tab+' fits mobile width.');
  }
  assert.deepEqual(errors,[],'No browser runtime exceptions.');
  assert.ok(serviceResponses.some(r=>r.url.endsWith('/terrain')&&r.status===200));
  assert.ok(serviceResponses.some(r=>r.url.endsWith('/thermal')&&r.status===200));
  assert.ok(serviceResponses.some(r=>r.url.endsWith('/validate')&&r.status===200));
  console.log('NASA imagery responses:',imageryResponses);
  console.log('NASA workspace: real terrain/uncertainty, Diviner profile, evidence import, JPL reports, desktop/mobile layouts and runtime checks passed. Only account verification and chat configuration were mocked.');
  await call('Browser.close').catch(()=>{});
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  socket?.close();edge?.kill();server?.kill();api?.kill();
});

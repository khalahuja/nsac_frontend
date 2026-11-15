import { API } from '../lib/apiEndpoints';
import { describeFetchError } from '../lib/offline';
import { useEffect, useMemo, useState } from 'react';
import type { LunarCoordinate } from '../lib/lunar';
import '../trajectory.css';
import '../surface-verify.css';
type Result={available:boolean;terrain_source:string;astronomy_source:string;reason:string|null;sun:{azimuth_deg:number;elevation_deg:number};earth:{azimuth_deg:number;elevation_deg:number};skyline:{azimuth_deg:number;elevation_deg:number|null}[];grid:{x:number;y:number;slope_deg:number|null;shadowed:boolean|null;sunlit:boolean|null;hazard:boolean|null;inside_footprint:boolean}[];safe_fraction:number|null;sunlit_fraction:number|null;coverage_fraction:number|null;collision_count:number|null;shadow_model_available?:boolean;limitations?:string};

function SurfaceAnalysisCore({coordinate,siteName,instant,onInstantChange}:{coordinate:LunarCoordinate;siteName:string;instant:string;onInstantChange:(s:string)=>void}){
 const [radius,setRadius]=useState(500),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[playing,setPlaying]=useState(false);
 useEffect(()=>{if(!playing)return;const t=window.setInterval(()=>onInstantChange(new Date(Date.parse(instant)+3600000).toISOString()),800);return()=>window.clearInterval(t)},[playing,instant,onInstantChange]);
 useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>{fetch(`${API}/api/surface/screen`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:coordinate.lat,longitude:coordinate.lon,datetime_utc:instant,radius_m:radius}),signal:controller.signal}).then(r=>{if(!r.ok)throw new Error(`Surface analysis failed (${r.status})`);return r.json()}).then(v=>{setResult(v);setError('')}).catch(e=>{if(e.name!=='AbortError')setError(describeFetchError(e,'Surface safety analysis'))})},250);return()=>{window.clearTimeout(timer);controller.abort()}},[coordinate.lat,coordinate.lon,instant,radius]);
 const path=useMemo(()=>result?.skyline.filter(s=>s.elevation_deg!==null).map(s=>{const a=s.azimuth_deg*Math.PI/180,r=80+(s.elevation_deg??0)*2;return `${180+r*Math.sin(a)},${180-r*Math.cos(a)}`}).join(' ')??'',[result]);
 const solar=result?.sun,earth=result?.earth;
 const blocked=(az:number,el:number)=>{const index=Math.round(az/10)%36;const height=result?.skyline[index]?.elevation_deg;return height==null?null:el<=height};
 return <section className="sa-page"><header><span>Local terrain / sky geometry</span><h1>Surface safety & moving shadows</h1><p>{siteName} · {Math.abs(coordinate.lat).toFixed(3)}° {coordinate.lat<0?'S':'N'}, {coordinate.lon.toFixed(3)}° E</p></header><div className="sa-controls"><label>Footprint radius, m<input type="number" min="50" max="5000" value={radius} onChange={e=>setRadius(Number(e.target.value))}/></label><label>UTC time<input type="datetime-local" value={instant.slice(0,16)} onChange={e=>{const date=new Date(e.target.value+'Z');if(Number.isFinite(date.getTime()))onInstantChange(date.toISOString())}}/></label><button onClick={()=>setPlaying(!playing)}>{playing?'Pause':'Play shadows'}</button></div>{error&&<p role="alert">{error}</p>}{result&&!result.available&&<p className="sa-unavailable">{result.reason} Astronomy: {result.astronomy_source}.</p>}{result?.available&&<><div className="sa-kpis"><div><span>Sun above terrain</span><strong>{blocked(solar!.azimuth_deg,solar!.elevation_deg)===null?'Unknown':blocked(solar!.azimuth_deg,solar!.elevation_deg)?'No':'Yes'}</strong></div><div><span>Earth above terrain</span><strong>{blocked(earth!.azimuth_deg,earth!.elevation_deg)===null?'Unknown':blocked(earth!.azimuth_deg,earth!.elevation_deg)?'No':'Yes'}</strong></div><div><span>Safe footprint cells</span><strong>{result.safe_fraction===null?'Unknown':`${(result.safe_fraction*100).toFixed(0)}%`}</strong></div><div><span>Sunlit footprint</span><strong>{result.sunlit_fraction===null?'Unknown':`${(result.sunlit_fraction*100).toFixed(0)}%`}</strong></div><div><span>Slope collisions</span><strong>{result.collision_count??'Unknown'}</strong></div></div><div className="sa-grid"><article><h2>360° radial skyline dome</h2><svg viewBox="0 0 360 360" role="img" aria-label="Radial terrain horizon obstruction"><circle cx="180" cy="180" r="80" fill="#182228" stroke="#3c5058"/><circle cx="180" cy="180" r="120" fill="none" stroke="#43545c"/><polyline points={path} fill="#658c90" fillOpacity=".35" stroke="#9ec9c6" strokeWidth="2"/><circle cx="180" cy="180" r="4" fill="#fff"/><text x="177" y="25">N</text><text x="334" y="185">E</text><text x="178" y="344">S</text><text x="19" y="185">W</text></svg><p>Line radius shows the highest DEM horizon angle for each azimuth. Sun: {solar?.azimuth_deg.toFixed(1)}° / {solar?.elevation_deg.toFixed(1)}°; Earth: {earth?.azimuth_deg.toFixed(1)}° / {earth?.elevation_deg.toFixed(1)}°.</p></article><article><h2>Terrain shadow & collision map</h2><div className="sa-cells">{result.grid.map(g=><span key={`${g.x}:${g.y}`} title={`Slope ${g.slope_deg?.toFixed(1)??'unknown'}°; shadow ${g.shadowed===null?'unknown':g.shadowed?'yes':'no'}`} className={`${g.hazard?'hazard':''} ${g.sunlit===false?'shadow':''} ${!g.inside_footprint?'outside':''}`}/>)}</div><p>{result.shadow_model_available?'Terrain-cast shadows from the loaded DEM.':'Terrain shadows unavailable; enable USE_TERRAIN_SHADOWS.'} Red marks slope above 12°.</p></article></div><p className="sa-note">Terrain: {result.terrain_source}. Ephemeris: {result.astronomy_source}. {result.limitations}</p></>}</section>
}

type HorizonsAngles = { sun: { azimuth_deg: number; elevation_deg: number }; earth: { azimuth_deg: number; elevation_deg: number } };

export function SurfaceAnalysisPage(props: { coordinate: LunarCoordinate; siteName: string; instant: string; onInstantChange: (s: string) => void }) {
  const [angles, setAngles] = useState<HorizonsAngles | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const verify = async () => {
    setBusy(true); setError(''); setAngles(null);
    try {
      const response = await fetch(`${API}/api/surface/horizons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: props.coordinate.lat, longitude: props.coordinate.lon, datetime_utc: props.instant, radius_m: 500 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? 'JPL Horizons is unavailable.');
      setAngles(body);
    } catch (cause) { setError(describeFetchError(cause, 'The JPL Horizons check')); }
    finally { setBusy(false); }
  };
  return <div className="sa-wrap"><div className="sa-verify"><button onClick={() => void verify()} disabled={busy}>{busy ? 'Checking JPL…' : 'Verify Sun & Earth with JPL Horizons'}</button>{angles && <span>JPL Sun {angles.sun.azimuth_deg.toFixed(1)}° az / {angles.sun.elevation_deg.toFixed(1)}° el · Earth {angles.earth.azimuth_deg.toFixed(1)}° az / {angles.earth.elevation_deg.toFixed(1)}° el</span>}{error && <span role="alert">{error}</span>}</div><SurfaceAnalysisCore {...props}/></div>;
}

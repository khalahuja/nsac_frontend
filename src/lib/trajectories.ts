/** Patched-conic screening catalogue. No spacecraft state integration is implied. */
const MU_EARTH = 398600.4418; // km^3/s^2
const MU_MOON = 4902.8001;
const EARTH_RADIUS = 6378.137;
const MOON_ORBIT = 384400;
const MOON_RADIUS = 1737.4;
const g0 = 9.80665;
const rad = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);

/** Abbreviated ELP-2000 position, matching the backend's analytic lunar model. */
export function moonPosition(utc: string | number): [number, number, number] {
  const milliseconds = typeof utc === 'number' ? utc : Date.parse(utc);
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid UTC instant');
  const day = (milliseconds - J2000) / 86400000;
  const L = (218.316 + 13.176396 * day) * rad;
  const M = (357.529 + .98560028 * day) * rad;
  const Mp = (134.963 + 13.064993 * day) * rad;
  const D = (297.850 + 12.190749 * day) * rad;
  const F = (93.272 + 13.229350 * day) * rad;
  const lon = L + (6.289 * Math.sin(Mp) + 1.274 * Math.sin(2 * D - Mp) + .658 * Math.sin(2 * D) + .214 * Math.sin(2 * Mp) - .186 * Math.sin(M) - .114 * Math.sin(2 * F)) * rad;
  const lat = (5.128 * Math.sin(F) + .280 * Math.sin(Mp + F) - .277 * Math.sin(F - Mp) - .173 * Math.sin(2 * D - F)) * rad;
  const range = 385000.56 - 20905.355 * Math.cos(Mp) - 3699.111 * Math.cos(2 * D - Mp) - 2955.968 * Math.cos(2 * D) - 569.925 * Math.cos(2 * Mp);
  return [range * Math.cos(lat) * Math.cos(lon), range * Math.cos(lat) * Math.sin(lon), range * Math.sin(lat)];
}

export type Transfer = { id: number; launchUtc: string; arrivalUtc: string; perigeeKm: number; lunarPeriluneKm: number; coastDays: number; tliMs: number; loiMs: number; totalDvMs: number; arrivalKm: number; phaseErrorDeg: number; closeApproach: boolean; moonPoint: [number,number,number]; points: [number,number,number][] };

export function generateTransfers(startUtc: string, count = 2400): Transfer[] {
  const epoch = Date.parse(startUtc);
  if (!Number.isFinite(epoch)) return [];
  const records: Transfer[] = [];
  const target=moonPosition(epoch+4.9*86400000);
  const fixedHeading=Math.atan2(target[1],target[0]);
  for (let i=0;i<count;i++) {
    const perigeeKm=180+(i%12)*20;
    const lunarPeriluneKm=50+(Math.floor(i/12)%8)*25;
    const departureOffsetDays=Math.floor(i/96)*.5;
    const apogeeKm=330000+(Math.floor(i/8)%12)*5500;
    const rp=EARTH_RADIUS+perigeeKm, ra=apogeeKm, a=(rp+ra)/2, e=(ra-rp)/(ra+rp);
    const vParking=Math.sqrt(MU_EARTH/rp), vTransfer=Math.sqrt(MU_EARTH*(2/rp-1/a));
    const tliMs=(vTransfer-vParking)*1000;
    const coastDays=Math.PI*Math.sqrt(a*a*a/MU_EARTH)/86400;
    const launchMs=epoch+departureOffsetDays*86400000;
    const arrivalMs=launchMs+coastDays*86400000;
    const moon=moonPosition(arrivalMs);
    const arrivalKm=Math.hypot(ra*Math.cos(fixedHeading)-moon[0],ra*Math.sin(fixedHeading)-moon[1],moon[2]);
    const moonHeading=Math.atan2(moon[1],moon[0]);
    const phaseErrorDeg=Math.abs(Math.atan2(Math.sin(moonHeading-fixedHeading),Math.cos(moonHeading-fixedHeading))/rad);
    const lunarVInfinity=Math.abs(Math.sqrt(MU_EARTH/Math.hypot(...moon))-Math.sqrt(Math.max(0,2*MU_EARTH/ra-MU_EARTH/a)));
    const rL=MOON_RADIUS+lunarPeriluneKm;
    const loiMs=(Math.sqrt(lunarVInfinity*lunarVInfinity+2*MU_MOON/rL)-Math.sqrt(MU_MOON/rL))*1000;
    const launchUtc=new Date(launchMs).toISOString();
    const points: [number,number,number][]=[];
    for(let j=0;j<=96;j++) { const nu=Math.PI*j/96; const radius=a*(1-e*e)/(1+e*Math.cos(nu)); const angle=fixedHeading+nu-Math.PI; points.push([radius*Math.cos(angle)/MOON_ORBIT,radius*Math.sin(angle)/MOON_ORBIT,0]); }
    records.push({id:i+1,launchUtc,arrivalUtc:new Date(arrivalMs).toISOString(),perigeeKm,lunarPeriluneKm,coastDays,tliMs,loiMs,totalDvMs:tliMs+loiMs,arrivalKm,phaseErrorDeg,closeApproach:arrivalKm<10000,moonPoint:moon.map(value=>value/MOON_ORBIT) as [number,number,number],points});
  }
  return records;
}

export function propellantForDeltaV(dryKg: number, wetKg: number, ispS: number, deltaVms: number) {
  if (![dryKg,wetKg,ispS,deltaVms].every(Number.isFinite)||dryKg<=0||wetKg<=dryKg||ispS<=0||deltaVms<0) return null;
  const possible=ispS*g0*Math.log(wetKg/dryKg);
  const required=wetKg*(1-Math.exp(-deltaVms/(ispS*g0)));
  return {possible,required,margin:possible-deltaVms};
}

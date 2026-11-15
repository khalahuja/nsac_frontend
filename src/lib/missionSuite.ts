import type { ForecastResult, ForecastSample, LunarCoordinate } from './lunar';

export type MissionInputs = {
  arrayAreaM2: number; arrayEfficiency: number; batteryKwh: number; baseLoadW: number;
  heaterLoadW: number; batteryDod: number; landingSigmaM: number; hazardFreePct: number;
  maxSlopeDeg: number; txPowerW: number; txGainDbi: number; rxGainDbi: number;
  frequencyGhz: number; dataRateKbps: number; dryMassKg: number; propellantKg: number;
  ispS: number; descentDvMs: number; roverRangeKm: number; roverWhKm: number;
};

export const DEFAULT_MISSION_INPUTS: MissionInputs = {
  arrayAreaM2: 4, arrayEfficiency: 0.29, batteryKwh: 18, baseLoadW: 320,
  heaterLoadW: 180, batteryDod: 0.8, landingSigmaM: 75, hazardFreePct: 88,
  maxSlopeDeg: 12, txPowerW: 20, txGainDbi: 18, rxGainDbi: 48,
  frequencyGhz: 8.4, dataRateKbps: 256, dryMassKg: 1100, propellantKg: 650,
  ispS: 315, descentDvMs: 1850, roverRangeKm: 12, roverWhKm: 210
};

const longestRun = (samples: ForecastSample[], predicate: (s: ForecastSample) => boolean, step: number) => {
  let run = 0, best = 0;
  samples.forEach(sample => { run = predicate(sample) ? run + step : 0; best = Math.max(best, run); });
  return best;
};

export function analyseMission(forecast: ForecastResult, input: MissionInputs, coordinate: LunarCoordinate, slopeDeg: number | null) {
  const samples = forecast.samples;
  const hours = Math.max(forecast.step_hours, samples.length * forecast.step_hours);
  const energyGeneratedKwh = samples.reduce((sum, s) => sum + s.horizontal_irradiance_w_m2 * input.arrayAreaM2 * input.arrayEfficiency * forecast.step_hours / 1000, 0);
  const loadKwh = input.baseLoadW * hours / 1000;
  const longestNightH = longestRun(samples, s => !s.illuminated, forecast.step_hours);
  const longestBlackoutH = longestRun(samples, s => !s.earth_visible, forecast.step_hours);
  const survivalLoadW = input.baseLoadW + input.heaterLoadW;
  const usableBatteryKwh = input.batteryKwh * input.batteryDod;
  const requiredBatteryKwh = longestNightH * survivalLoadW / 1000;
  const powerMarginKwh = energyGeneratedKwh + usableBatteryKwh - loadKwh;
  const fsplDb = 92.45 + 20 * Math.log10(384400) + 20 * Math.log10(input.frequencyGhz);
  const receivedDbw = 10 * Math.log10(input.txPowerW) + input.txGainDbi + input.rxGainDbi - fsplDb - 3;
  const noiseDbw = -228.6 + 10 * Math.log10(290) + 10 * Math.log10(input.dataRateKbps * 1000);
  const ebN0Db = receivedDbw - noiseDbw;
  const initialMass = input.dryMassKg + input.propellantKg;
  const availableDvMs = input.ispS * 9.80665 * Math.log(initialMass / input.dryMassKg);
  const propellantNeededKg = initialMass * (1 - Math.exp(-input.descentDvMs / (input.ispS * 9.80665)));
  const landingContainmentPct = (1 - Math.exp(-Math.pow(150 / input.landingSigmaM, 2) / 2)) * 100;
  const landingSuccessPct = landingContainmentPct * input.hazardFreePct / 100;
  const slopeSafe = slopeDeg === null ? null : slopeDeg <= input.maxSlopeDeg;
  const thermalMin = Math.min(...samples.map(s => s.temperature_c));
  const thermalMax = Math.max(...samples.map(s => s.temperature_c));
  const contactPct = samples.filter(s => s.earth_visible).length / Math.max(1, samples.length) * 100;
  const sunlightPct = samples.filter(s => s.illuminated).length / Math.max(1, samples.length) * 100;
  const totalSunlightH = samples.filter(s => s.illuminated).length * forecast.step_hours;
  const totalContactH = samples.filter(s => s.earth_visible).length * forecast.step_hours;
  const samplingErrorH = forecast.step_hours;
  const feasible = powerMarginKwh >= 0 && requiredBatteryKwh <= usableBatteryKwh && ebN0Db >= 3 && availableDvMs >= input.descentDvMs && landingSuccessPct >= 70 && slopeSafe !== false;
  const score = Math.max(0, Math.min(100, 50 + Math.min(20, powerMarginKwh) + Math.min(10, ebN0Db - 3) + (landingSuccessPct - 70) / 2 + (slopeSafe === false ? -25 : 5)));
  return { hours, energyGeneratedKwh, loadKwh, longestNightH, longestBlackoutH, totalSunlightH, totalContactH, samplingErrorH, usableBatteryKwh, requiredBatteryKwh, powerMarginKwh, fsplDb, receivedDbw, ebN0Db, availableDvMs, propellantNeededKg, landingContainmentPct, landingSuccessPct, slopeSafe, thermalMin, thermalMax, contactPct, sunlightPct, feasible, score, coordinate };
}

export type VerdictStatus = 'pass' | 'caution' | 'fail';

export type SubsystemVerdict = {
  id: string;
  name: string;
  status: VerdictStatus;
  headline: string;
  recommendation?: string;
};

export type FeasibilityScorecard = {
  overallStatus: VerdictStatus;
  passCount: number;
  cautionCount: number;
  failCount: number;
  verdicts: SubsystemVerdict[];
};

export function evaluateScorecard(result: ReturnType<typeof analyseMission>, input: MissionInputs): FeasibilityScorecard {
  const verdicts: SubsystemVerdict[] = [];

  if (result.powerMarginKwh < 0) {
    verdicts.push({
      id: 'power',
      name: 'Power & Generation',
      status: 'fail',
      headline: `Energy deficit of ${Math.abs(result.powerMarginKwh).toFixed(1)} kWh`,
      recommendation: `Increase solar array by ${(Math.abs(result.powerMarginKwh) / 8).toFixed(1)} m² or reduce base load by ${Math.round(result.loadKwh * 1000 / result.hours * 0.2)} W.`
    });
  } else if (result.powerMarginKwh < result.loadKwh * 0.15) {
    verdicts.push({
      id: 'power',
      name: 'Power & Generation',
      status: 'caution',
      headline: `Tight power margin (+${result.powerMarginKwh.toFixed(1)} kWh, <15% reserve)`,
      recommendation: 'Add modest solar margin to buffer against lunar dust accumulation.'
    });
  } else {
    verdicts.push({
      id: 'power',
      name: 'Power & Generation',
      status: 'pass',
      headline: `Healthy energy surplus (+${result.powerMarginKwh.toFixed(1)} kWh)`
    });
  }

  if (result.usableBatteryKwh < result.requiredBatteryKwh) {
    const deficitKwh = result.requiredBatteryKwh - result.usableBatteryKwh;
    const capacityToAdd = input.batteryDod > 0 ? `${(deficitKwh / input.batteryDod).toFixed(1)} kWh` : 'usable';
    verdicts.push({
      id: 'battery',
      name: 'Darkness Survival',
      status: 'fail',
      headline: `Depletes battery before dawn (${result.longestNightH.toFixed(0)} h shadow)`,
      recommendation: `Add ${capacityToAdd} battery capacity or reduce survival heater load.`
    });
  } else if (result.requiredBatteryKwh > 0 && result.usableBatteryKwh < result.requiredBatteryKwh * 1.25) {
    verdicts.push({
      id: 'battery',
      name: 'Darkness Survival',
      status: 'caution',
      headline: 'Survives night but margin is under 25%',
      recommendation: 'Cold soak degradation may drop battery below minimum state of charge.'
    });
  } else {
    verdicts.push({
      id: 'battery',
      name: 'Darkness Survival',
      status: 'pass',
      headline: `Survives longest night (${result.longestNightH.toFixed(0)} h) with reserve`
    });
  }

  if (result.ebN0Db < 3) {
    verdicts.push({
      id: 'comms',
      name: 'Direct-to-Earth Link',
      status: 'fail',
      headline: `Eb/N0 below threshold (${result.ebN0Db.toFixed(1)} dB < 3 dB)`,
      recommendation: 'Increase transmit power, use a higher-gain antenna, or drop the data rate.'
    });
  } else if (result.ebN0Db < 6 || result.contactPct < 60) {
    verdicts.push({
      id: 'comms',
      name: 'Direct-to-Earth Link',
      status: 'caution',
      headline: `Marginal link (${result.ebN0Db.toFixed(1)} dB) or intermittent contact (${result.contactPct.toFixed(0)}%)`,
      recommendation: 'Schedule downlinks only during optimal Earth elevation windows.'
    });
  } else {
    verdicts.push({
      id: 'comms',
      name: 'Direct-to-Earth Link',
      status: 'pass',
      headline: `Robust link (${result.ebN0Db.toFixed(1)} dB) & ${result.contactPct.toFixed(0)}% contact`
    });
  }

  if (result.slopeSafe === false) {
    verdicts.push({
      id: 'landing',
      name: 'Landing Site Safety',
      status: 'fail',
      headline: `Measured slope exceeds maximum lander tilt (${input.maxSlopeDeg}°)`,
      recommendation: 'Target a flatter plateau or increase landing leg stroke/tilt tolerance.'
    });
  } else if (result.landingSuccessPct < 70) {
    verdicts.push({
      id: 'landing',
      name: 'Landing Site Safety',
      status: 'fail',
      headline: `Landing success probability is low (${result.landingSuccessPct.toFixed(1)}%)`,
      recommendation: 'Reduce 1σ landing dispersion with precision hazard-detection lidar.'
    });
  } else if (result.landingSuccessPct < 85) {
    verdicts.push({
      id: 'landing',
      name: 'Landing Site Safety',
      status: 'caution',
      headline: `Moderate landing confidence (${result.landingSuccessPct.toFixed(1)}%)`,
      recommendation: 'Confirm terrain boulder hazard distribution with LROC NAC imagery.'
    });
  } else {
    verdicts.push({
      id: 'landing',
      name: 'Landing Site Safety',
      status: 'pass',
      headline: `High landing confidence (${result.landingSuccessPct.toFixed(1)}%)`
    });
  }

  if (input.descentDvMs > 0) {
    if (result.availableDvMs < input.descentDvMs) {
      verdicts.push({
        id: 'propulsion',
        name: 'Descent Propulsion',
        status: 'fail',
        headline: `Δv deficit: ${result.availableDvMs.toFixed(0)} m/s available vs ${input.descentDvMs.toFixed(0)} m/s required`,
        recommendation: `Add ${Math.max(0, result.propellantNeededKg - input.propellantKg).toFixed(0)} kg propellant or lighten dry mass.`
      });
    } else if (result.availableDvMs < input.descentDvMs + 100) {
      verdicts.push({
        id: 'propulsion',
        name: 'Descent Propulsion',
        status: 'caution',
        headline: 'Meets Δv, but reserve is tight (<100 m/s margin)',
        recommendation: 'Include at least 150 m/s reserve for terminal hazard-avoidance hover.'
      });
    } else {
      verdicts.push({
        id: 'propulsion',
        name: 'Descent Propulsion',
        status: 'pass',
        headline: `Sufficient Δv (+${(result.availableDvMs - input.descentDvMs).toFixed(0)} m/s reserve)`
      });
    }
  }

  const failCount = verdicts.filter(verdict => verdict.status === 'fail').length;
  const cautionCount = verdicts.filter(verdict => verdict.status === 'caution').length;
  const passCount = verdicts.filter(verdict => verdict.status === 'pass').length;

  return {
    overallStatus: failCount > 0 ? 'fail' : cautionCount > 0 ? 'caution' : 'pass',
    passCount,
    cautionCount,
    failCount,
    verdicts
  };
}

export function uncertaintyBand(base: ReturnType<typeof analyseMission>) {
  return {
    powerMargin: [base.powerMarginKwh - Math.abs(base.energyGeneratedKwh) * .18, base.powerMarginKwh + Math.abs(base.energyGeneratedKwh) * .12] as const,
    landingSuccess: [Math.max(0, base.landingSuccessPct - 9), Math.min(100, base.landingSuccessPct + 5)] as const,
    deltaV: [base.availableDvMs * .97, base.availableDvMs * 1.03] as const,
    sensitivities: [
      { name: 'Solar incidence & dust', impact: 18 }, { name: 'Landing dispersion', impact: 14 },
      { name: 'Battery degradation', impact: 11 }, { name: 'Terrain position error', impact: 9 }
    ]
  };
}

export function schedule(samples: ForecastSample[], step: number) {
  return samples.slice(0, 12).map((s, index) => ({
    time: s.datetime_utc,
    durationH: step,
    activity: !s.illuminated ? 'Survival heating' : !s.earth_visible ? 'Payload science' : index % 3 === 0 ? 'Downlink & telemetry' : 'Charge + payload ops',
    powerW: !s.illuminated ? 500 : !s.earth_visible ? 420 : 610,
    state: s.illuminated ? 'sunlit' : 'shadow'
  }));
}

export function downloadMissionReport(report: unknown, site: string) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `selene-mission-${site.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

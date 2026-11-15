import type { MissionInputs } from './missionSuite';

export type MissionPreset = {
  id: string;
  name: string;
  agencyOrCompany: string;
  description: string;
  category: 'crewed' | 'clps' | 'rover';
  inputs: MissionInputs;
};

export const MISSION_PRESETS: MissionPreset[] = [
  {
    id: 'clps-small',
    name: 'CLPS Small Lander (Nova-C / Peregrine Class)',
    agencyOrCompany: 'NASA CLPS (Commercial)',
    description: 'Small commercial lander: 50–100 kg payload, short-duration surface mission during local lunar day.',
    category: 'clps',
    inputs: {
      arrayAreaM2: 2.2,
      arrayEfficiency: 0.28,
      batteryKwh: 4.5,
      baseLoadW: 140,
      heaterLoadW: 90,
      batteryDod: 0.8,
      landingSigmaM: 85,
      hazardFreePct: 85,
      maxSlopeDeg: 12,
      txPowerW: 15,
      txGainDbi: 16,
      rxGainDbi: 48,
      frequencyGhz: 8.4,
      dataRateKbps: 128,
      dryMassKg: 620,
      propellantKg: 1300,
      ispS: 310,
      descentDvMs: 1850,
      roverRangeKm: 0,
      roverWhKm: 0
    }
  },
  {
    id: 'clps-medium',
    name: 'CLPS Utility Lander (Blue Ghost Class)',
    agencyOrCompany: 'NASA CLPS (Firefly)',
    description: 'Medium lander designed for transit and extended lunar daylight science operations with multi-instrument payloads.',
    category: 'clps',
    inputs: {
      arrayAreaM2: 3.8,
      arrayEfficiency: 0.30,
      batteryKwh: 12.0,
      baseLoadW: 240,
      heaterLoadW: 150,
      batteryDod: 0.8,
      landingSigmaM: 60,
      hazardFreePct: 90,
      maxSlopeDeg: 12,
      txPowerW: 25,
      txGainDbi: 20,
      rxGainDbi: 50,
      frequencyGhz: 8.4,
      dataRateKbps: 256,
      dryMassKg: 1050,
      propellantKg: 2100,
      ispS: 315,
      descentDvMs: 1850,
      roverRangeKm: 0,
      roverWhKm: 0
    }
  },
  {
    id: 'viper-rover',
    name: 'Polar Prospecting Rover (VIPER Class)',
    agencyOrCompany: 'NASA Ames / CLPS Delivery',
    description: 'Mobile rover prospecting volatiles inside and near South Pole PSRs with strict shadow battery limits.',
    category: 'rover',
    inputs: {
      arrayAreaM2: 1.2,
      arrayEfficiency: 0.30,
      batteryKwh: 5.5,
      baseLoadW: 110,
      heaterLoadW: 80,
      batteryDod: 0.85,
      landingSigmaM: 50,
      hazardFreePct: 92,
      maxSlopeDeg: 15,
      txPowerW: 10,
      txGainDbi: 14,
      rxGainDbi: 48,
      frequencyGhz: 8.4,
      dataRateKbps: 64,
      dryMassKg: 450,
      propellantKg: 0,
      ispS: 300,
      descentDvMs: 0,
      roverRangeKm: 15,
      roverWhKm: 180
    }
  },
  {
    id: 'artemis-hls',
    name: 'Artemis Crewed HLS (Human Landing System)',
    agencyOrCompany: 'NASA Artemis',
    description: 'Heavy crewed polar lander supporting astronauts, high life-support base loads, and multi-day surface EVA stays.',
    category: 'crewed',
    inputs: {
      arrayAreaM2: 24.0,
      arrayEfficiency: 0.32,
      batteryKwh: 75.0,
      baseLoadW: 2800,
      heaterLoadW: 1200,
      batteryDod: 0.8,
      landingSigmaM: 30,
      hazardFreePct: 95,
      maxSlopeDeg: 8,
      txPowerW: 50,
      txGainDbi: 26,
      rxGainDbi: 54,
      frequencyGhz: 8.4,
      dataRateKbps: 2048,
      dryMassKg: 28000,
      propellantKg: 42000,
      ispS: 360,
      descentDvMs: 1950,
      roverRangeKm: 20,
      roverWhKm: 350
    }
  }
];

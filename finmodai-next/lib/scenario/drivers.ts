import type { ScenarioBaseline } from '@/lib/data/scenarioBaseline';

export type ScenarioDrivers = {
  revenueGrowth: number[]; // 5-year vector
  targetEbitdaMargin: number;
  marginRampYears: number;
  salesToCapital: number;
  terminalGrowth: number;
  discountRate: number;
};

type SectorProfile = {
  baseGrowth: number;
  growthCeiling: number;
  marginTargetAdj: number;
  salesToCapital: number;
  terminalGrowth: number;
  discountRate: number;
};

const DEFAULT_PROFILE: SectorProfile = {
  baseGrowth: 0.06,
  growthCeiling: 0.12,
  marginTargetAdj: 0.0,
  salesToCapital: 1.8,
  terminalGrowth: 0.0225,
  discountRate: 0.105,
};

const SECTOR_PROFILES: Array<[RegExp, SectorProfile]> = [
  [/technology/i, { baseGrowth: 0.10, growthCeiling: 0.18, marginTargetAdj: 0.02, salesToCapital: 2.2, terminalGrowth: 0.025, discountRate: 0.10 }],
  [/health/i, { baseGrowth: 0.07, growthCeiling: 0.14, marginTargetAdj: 0.01, salesToCapital: 2.0, terminalGrowth: 0.025, discountRate: 0.095 }],
  [/financial/i, { baseGrowth: 0.06, growthCeiling: 0.12, marginTargetAdj: 0.0, salesToCapital: 2.5, terminalGrowth: 0.0225, discountRate: 0.10 }],
  [/consumer/i, { baseGrowth: 0.06, growthCeiling: 0.12, marginTargetAdj: -0.005, salesToCapital: 1.7, terminalGrowth: 0.0225, discountRate: 0.105 }],
  [/energy/i, { baseGrowth: 0.04, growthCeiling: 0.10, marginTargetAdj: -0.01, salesToCapital: 1.2, terminalGrowth: 0.02, discountRate: 0.115 }],
  [/industrial/i, { baseGrowth: 0.05, growthCeiling: 0.11, marginTargetAdj: -0.005, salesToCapital: 1.5, terminalGrowth: 0.0225, discountRate: 0.11 }],
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getSectorProfile(sector: string | null): SectorProfile {
  const key = sector || '';
  for (const [pattern, profile] of SECTOR_PROFILES) {
    if (pattern.test(key)) return profile;
  }
  return DEFAULT_PROFILE;
}

function profitabilityAdjustment(baseline: ScenarioBaseline): number {
  const ebitda = baseline.ebitda_margin;
  const net = baseline.net_margin;
  const score = clamp((ebitda - 0.2) + (net - 0.08), -0.06, 0.06);
  return score;
}

function buildGrowthVector(baseGrowth: number, ceiling: number, bias: number): number[] {
  const year1 = clamp(baseGrowth + bias, 0.0, ceiling);
  const year2 = clamp(year1 - 0.01, 0.0, ceiling);
  const year3 = clamp(year2 - 0.01, 0.0, ceiling);
  const year4 = clamp(year3 - 0.005, 0.0, ceiling);
  const year5 = clamp(year4 - 0.005, 0.0, ceiling);
  return [year1, year2, year3, year4, year5];
}

function buildTargetMargin(baseline: ScenarioBaseline, profile: SectorProfile, marginAdj: number): number {
  const base = baseline.ebitda_margin;
  const target = base + profile.marginTargetAdj + marginAdj;
  return clamp(target, 0.05, 0.6);
}

function buildDrivers(
  baseline: ScenarioBaseline,
  sector: string | null,
  growthAdj: number,
  marginAdj: number,
  discountAdj: number
): ScenarioDrivers {
  const profile = getSectorProfile(sector);
  const profitabilityBias = profitabilityAdjustment(baseline);
  const growthVector = buildGrowthVector(profile.baseGrowth, profile.growthCeiling, profitabilityBias + growthAdj);
  const targetMargin = buildTargetMargin(baseline, profile, marginAdj);

  return {
    revenueGrowth: growthVector,
    targetEbitdaMargin: targetMargin,
    marginRampYears: 3,
    salesToCapital: profile.salesToCapital,
    terminalGrowth: profile.terminalGrowth,
    discountRate: clamp(profile.discountRate + discountAdj, 0.06, 0.16),
  };
}

export function BaseCaseDrivers(baseline: ScenarioBaseline, sector: string | null): ScenarioDrivers {
  return buildDrivers(baseline, sector, 0, 0, 0);
}

export function BullCaseDrivers(baseline: ScenarioBaseline, sector: string | null): ScenarioDrivers {
  return buildDrivers(baseline, sector, 0.02, 0.01, -0.005);
}

export function BearCaseDrivers(baseline: ScenarioBaseline, sector: string | null): ScenarioDrivers {
  return buildDrivers(baseline, sector, -0.02, -0.01, 0.005);
}


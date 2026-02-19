import type { ScenarioAssumptions } from '@/lib/scenarioEngine';

export type ScenarioTemplateKind = 'standard';

export function standardScenarioTemplate(sector: string | null): ScenarioAssumptions[] {
  const s = (sector || '').toLowerCase();

  // Deltas are deterministic "stress knobs" applied on top of the Base case drivers.
  // These are assumptions, not sourced financial statement data.
  const growthSwing = s.includes('technology') ? 0.03 : s.includes('energy') ? 0.02 : 0.025;
  const marginSwing = s.includes('technology') ? 0.02 : s.includes('financial') ? 0.01 : 0.015;
  const waccSwing = s.includes('energy') ? 0.015 : 0.01;
  const terminalSwing = 0.0025;

  return [
    { name: 'Base Case' },
    {
      name: 'Bull Case',
      revenueGrowthDelta: growthSwing,
      ebitdaMarginDelta: marginSwing,
      waccDelta: -waccSwing,
      terminalGrowthDelta: terminalSwing,
    },
    {
      name: 'Bear Case',
      revenueGrowthDelta: -growthSwing,
      ebitdaMarginDelta: -marginSwing,
      waccDelta: waccSwing,
      terminalGrowthDelta: -terminalSwing,
    },
  ];
}


export type SensitivityInput = {
  terminalGrowth: number;
  wacc: number;
  growthPath: number[];
  valuationRangeSpreadPct?: number | null;
};

export type SensitivityResult = {
  isHighlySensitive: boolean;
  primarySensitivity: 'terminal' | 'wacc' | 'growth';
  explanation: string;
};

export function detectSensitivity({
  terminalGrowth,
  wacc,
  growthPath,
  valuationRangeSpreadPct,
}: SensitivityInput): SensitivityResult {
  const waccPct = wacc * 100;
  const tgPct = terminalGrowth * 100;

  const isTerminalLow = terminalGrowth < 0.01;
  const isRangeWide =
    typeof valuationRangeSpreadPct === 'number' && valuationRangeSpreadPct > 40;
  const isGrowthDeclining =
    growthPath.length > 1 && (growthPath.at(-1) ?? 0) < (growthPath[0] ?? 0);
  const isWaccHighWithDecline = wacc > 0.09 && isGrowthDeclining;

  const isHighlySensitive = isTerminalLow || isRangeWide || isWaccHighWithDecline;

  let primarySensitivity: SensitivityResult['primarySensitivity'];
  let explanation: string;

  if (isTerminalLow) {
    primarySensitivity = 'terminal';
    explanation = `Terminal growth of ${tgPct.toFixed(1)}% is near the lower bound — small changes in this assumption drive large valuation swings.`;
  } else if (isRangeWide) {
    primarySensitivity = 'terminal';
    explanation = `Scenario spread of ${(valuationRangeSpreadPct ?? 0).toFixed(0)}% across bull/bear cases indicates high assumption sensitivity.`;
  } else if (isWaccHighWithDecline) {
    primarySensitivity = 'wacc';
    explanation = `${waccPct.toFixed(1)}% WACC combined with declining revenue growth amplifies discount rate sensitivity.`;
  } else if (isGrowthDeclining) {
    primarySensitivity = 'growth';
    explanation = 'Declining revenue growth path compresses terminal value reliability.';
  } else {
    primarySensitivity = 'terminal';
    explanation = '';
  }

  return { isHighlySensitive, primarySensitivity, explanation };
}

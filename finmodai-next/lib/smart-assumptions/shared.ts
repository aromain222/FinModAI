import type { SmartAssumptionResult } from '@/lib/smart-assumptions/types';

export function buildNormalizedSmartAssumptionOverrides(result: SmartAssumptionResult): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  if (typeof result.suggestions.revenue_growth === 'number') overrides.revenue_growth = result.suggestions.revenue_growth;
  if (typeof result.suggestions.operating_margin === 'number') overrides.ebit_margin = result.suggestions.operating_margin;
  if (typeof result.suggestions.wacc === 'number') overrides.wacc = result.suggestions.wacc;
  if (typeof result.suggestions.terminal_growth_rate === 'number') overrides.terminal_growth = result.suggestions.terminal_growth_rate;
  return overrides;
}

export function buildAnalystSmartAssumptionOverrides(
  existingInputs: Record<string, unknown>,
  result: SmartAssumptionResult,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const applyArrayOrScalar = (key: string, value: number | null) => {
    if (typeof value !== 'number' || !(key in existingInputs)) return;
    const current = existingInputs[key];
    if (Array.isArray(current) && current.every((item) => typeof item === 'number')) {
      overrides[key] = current.map(() => value);
      return;
    }
    overrides[key] = value;
  };

  applyArrayOrScalar('revenueGrowth', result.suggestions.revenue_growth);
  if ('ebitMargin' in existingInputs) {
    applyArrayOrScalar('ebitMargin', result.suggestions.operating_margin);
  } else if ('ebitdaMargin' in existingInputs) {
    applyArrayOrScalar('ebitdaMargin', result.suggestions.operating_margin);
  }
  applyArrayOrScalar('wacc', result.suggestions.wacc);
  applyArrayOrScalar('terminalGrowth', result.suggestions.terminal_growth_rate);
  return overrides;
}

export function buildSmartAssumptionReply(result: SmartAssumptionResult): string {
  const changed = result.changedDrivers
    .map((driver) => {
      const oldLabel = driver.old !== null ? `${(driver.old * 100).toFixed(1)}%` : 'n/a';
      const newLabel = driver.new !== null ? `${(driver.new * 100).toFixed(1)}%` : 'n/a';
      return `${driver.label} ${oldLabel} → ${newLabel}`;
    })
    .join(', ');
  const topReasons = result.changedDrivers.slice(0, 2).map((driver) => driver.rationale).join(' ');
  const confidenceSummary = Array.from(new Set(Object.values(result.driverConfidence))).join(', ');
  return [
    changed
      ? `Applied smart assumptions for ${result.subject.companyName ?? result.subject.ticker ?? 'the company'}: ${changed}.`
      : `Applied conservative smart assumptions for ${result.subject.companyName ?? result.subject.ticker ?? 'the company'}.`,
    topReasons || result.provenanceSummary.companyProfile,
    `Confidence: ${confidenceSummary}.`,
  ].join(' ');
}

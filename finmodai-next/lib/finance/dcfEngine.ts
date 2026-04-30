export type DCFInputs = {
  growth: number;
  margin: number;
  discountRate: number;
  terminalGrowth?: number;
};

export type DCFResult = {
  value: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function runDCF({ growth, margin, discountRate, terminalGrowth = 0.025 }: DCFInputs): DCFResult {
  const normalizedGrowth = clamp(growth, -0.2, 0.35);
  const normalizedMargin = clamp(margin, 0.01, 0.6);
  const normalizedDiscountRate = clamp(discountRate, 0.04, 0.25);
  const normalizedTerminalGrowth = clamp(
    terminalGrowth,
    -0.02,
    Math.min(0.04, normalizedDiscountRate - 0.01)
  );
  const revenue = 100;
  const years = 5;
  let value = 0;
  let finalYearCashFlow = 0;

  for (let t = 1; t <= years; t++) {
    const projectedRevenue = revenue * Math.pow(1 + normalizedGrowth, t);
    const cashFlow = projectedRevenue * normalizedMargin;
    finalYearCashFlow = cashFlow;
    value += cashFlow / Math.pow(1 + normalizedDiscountRate, t);
  }

  const terminalCashFlow = finalYearCashFlow * (1 + normalizedTerminalGrowth);
  const terminalValue = terminalCashFlow / (normalizedDiscountRate - normalizedTerminalGrowth);
  value += terminalValue / Math.pow(1 + normalizedDiscountRate, years);

  return { value };
}

export function applyModelImpact(
  base: DCFInputs,
  deltas: { growth_delta: number; margin_delta: number; discount_rate_delta: number }
): DCFInputs {
  return {
    growth: clamp(base.growth + deltas.growth_delta, -0.2, 0.35),
    margin: clamp(base.margin + deltas.margin_delta, 0.01, 0.6),
    discountRate: clamp(base.discountRate + deltas.discount_rate_delta, 0.04, 0.25),
    terminalGrowth: base.terminalGrowth,
  };
}

export const DEFAULT_BASE_MODEL: DCFInputs = {
  growth: 0.08,
  margin: 0.18,
  discountRate: 0.10,
  terminalGrowth: 0.025,
};

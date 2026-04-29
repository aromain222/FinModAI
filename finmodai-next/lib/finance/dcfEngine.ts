export type DCFInputs = {
  growth: number;
  margin: number;
  discountRate: number;
};

export type DCFResult = {
  value: number;
};

export function runDCF({ growth, margin, discountRate }: DCFInputs): DCFResult {
  const revenue = 100;
  const years = 5;
  let value = 0;
  for (let t = 1; t <= years; t++) {
    const projectedRevenue = revenue * Math.pow(1 + growth, t);
    const cashFlow = projectedRevenue * margin;
    value += cashFlow / Math.pow(1 + discountRate, t);
  }
  return { value };
}

export function applyModelImpact(
  base: DCFInputs,
  deltas: { growth_delta: number; margin_delta: number; discount_rate_delta: number }
): DCFInputs {
  return {
    growth: base.growth + deltas.growth_delta,
    margin: base.margin + deltas.margin_delta,
    discountRate: base.discountRate + deltas.discount_rate_delta,
  };
}

export const DEFAULT_BASE_MODEL: DCFInputs = {
  growth: 0.08,
  margin: 0.18,
  discountRate: 0.10,
};

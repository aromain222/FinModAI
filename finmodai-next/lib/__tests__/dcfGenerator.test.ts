import { describe, it, expect } from 'vitest';
import { normalizeDCFInputs, computeDCFSeries } from '../dcfGenerator';

describe('Apple DCF regression', () => {
  it('produces positive EV and a non-null price per share', () => {
    const inputs = normalizeDCFInputs({
      ticker: 'AAPL',
      years: [2025, 2026, 2027, 2028, 2029],
      revenueByYear: [410000, 430000, 450000, 470000, 490000],
      ebitMargin: 0.28,
      taxRate: 0.18,
      daPercentOfRevenue: 0.02,
      changeInWCPercentOfRevenue: 0.01,
      capexPercentOfRevenue: 0.04,
      wacc: 0.09,
      terminalGrowth: 0.025,
      netDebtMillions: -40_000, // net cash position
      sharesOutstandingMillions: 15_000,
    });

    const results = computeDCFSeries(inputs);

    expect(results.enterpriseValue).toBeGreaterThan(0);
    expect(results.pricePerShare).not.toBeNull();
  });
});

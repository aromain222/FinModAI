import { computeScaledDcf } from '../scaledDcf';

describe('computeScaledDcf', () => {
  test('produces reasonable share price for scaled inputs', () => {
    const result = computeScaledDcf({
      currentFcfM: 200, // $200M
      growthRate: 8,
      terminalGrowth: 2,
      wacc: 10,
      forecastYears: 5,
      netDebtM: 1_000,
      sharesOutstandingM: 100,
    });

    expect(result.enterpriseValueM).toBeGreaterThan(0);
    expect(result.equityValueM).toBeGreaterThan(0);
    expect(result.impliedPricePerShare).toBeGreaterThan(0);
  });
});

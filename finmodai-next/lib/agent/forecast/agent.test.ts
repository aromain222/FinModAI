import { describe, expect, it } from 'vitest';

import { runForecastAgent } from '@/lib/agent/forecast/agent';

describe('CapitalBase Forecast Agent', () => {
  it('returns REQUEST_DATA first when no data provided', async () => {
    const out = await runForecastAgent({
      userRequest: 'Forecast Apple over the next 4 years',
      ticker: 'AAPL',
      horizonYears: 4,
    });

    expect(out.action).toBe('REQUEST_DATA');
    expect(out.required.priceHistory?.range).toBeDefined();
    expect(out.required.fundamentals?.metrics).toEqual(['revenue', 'ebitda_margin', 'fcf', 'shares']);
    expect(out.required.sectorBenchmarks?.sector).toBeDefined();
  });

  it('returns FORECAST_RESULT when data is provided', async () => {
    const out = await runForecastAgent({
      userRequest: 'Forecast AAPL over the next 4 years',
      ticker: 'AAPL',
      horizonYears: 4,
      data: {
        priceHistory: {
          ticker: 'AAPL',
          points: [
            { t: '2019-01-02', close: 39 },
            { t: '2024-01-02', close: 185 },
          ],
        },
        fundamentals: {
          ticker: 'AAPL',
          annual: [
            { year: 2019, revenue: 260_000, ebitda: 75_000, fcf: 60_000, shares: 19_000 },
            { year: 2020, revenue: 275_000, ebitda: 78_000, fcf: 65_000, shares: 18_500 },
            { year: 2021, revenue: 300_000, ebitda: 90_000, fcf: 85_000, shares: 17_500 },
            { year: 2022, revenue: 325_000, ebitda: 95_000, fcf: 92_000, shares: 16_500 },
            { year: 2023, revenue: 340_000, ebitda: 102_000, fcf: 95_000, shares: 16_000 },
          ],
          ttm: {
            revenue: 340_000,
            ebitdaMarginPct: 30,
            fcf: 95_000,
            shares: 16_000,
            evToEbitda: 22,
          },
        },
      },
    });

    expect(out.action).toBe('FORECAST_RESULT');
    expect(out.ticker).toBe('AAPL');
    expect(out.dataCoverage.label).toBeDefined();
    expect(out.historicalContext.revenueCAGR_5Y).not.toBeNull();
    expect(out.historicalContext.currentMultiple?.value).not.toBeNull();
    expect(out.scenarios.base.revenueGrowth).not.toBeNull();
    expect(out.scenarios.base.impliedCAGR).not.toBeNull();
    expect(out.priceRange.base).not.toBeNull();
    expect(out.recommendedModels.length).toBeGreaterThanOrEqual(3);
  });

  it('marks missing data rather than inventing values', async () => {
    const out = await runForecastAgent({
      userRequest: 'Forecast AAPL over the next 4 years',
      ticker: 'AAPL',
      horizonYears: 4,
      data: {
        priceHistory: { ticker: 'AAPL', points: [{ t: '2024-01-02', close: 185 }] },
        fundamentals: { ticker: 'AAPL' },
      },
    });

    expect(out.action).toBe('FORECAST_RESULT');
    expect(out.dataCoverage.missing.length).toBeGreaterThan(0);
    expect(out.scenarios.base.revenueGrowth).toBeNull();
    expect(out.priceRange.base).toBeNull();
  });
});


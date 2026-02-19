/**
 * DCF-Lite Engine - Simplified DCF for scenario testing
 */

export interface DcfLiteInputs {
  ticker: string;
  baseRevenue: number;
  revenueGrowth: number; // annual % (as decimal, e.g., 0.10 for 10%)
  fcfMargin: number; // FCF as % of revenue (as decimal, e.g., 0.15 for 15%)
  wacc: number; // discount rate (as decimal, e.g., 0.10 for 10%)
  terminalMethod: 'multiple' | 'growth';
  terminalMultiple?: number; // EV/Revenue multiple for terminal value
  terminalGrowth?: number; // perpetual growth rate (as decimal)
  projectionYears: number;
  netDebt: number;
  sharesOutstanding: number;
}

export interface DcfLiteOutput {
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number;
  pvExplicitFcf: number;
  pvTerminalValue: number;
  projections: Array<{
    year: number;
    revenue: number;
    fcf: number;
    pvFcf: number;
  }>;
  explanation: {
    revenuePath: string;
    fcfGeneration: string;
    terminalValue: string;
    keyDrivers: string[];
  };
  chartSpecs: {
    valuationBreakdown: {
      type: 'bar';
      data: Array<{ label: string; value: number }>;
    };
    fcfProjection: {
      type: 'line';
      data: Array<{ year: number; fcf: number }>;
    };
  };
}

/**
 * Run simplified DCF calculation
 */
export function runDcfLite(inputs: DcfLiteInputs): DcfLiteOutput {
  const {
    ticker,
    baseRevenue,
    revenueGrowth,
    fcfMargin,
    wacc,
    terminalMethod,
    terminalMultiple,
    terminalGrowth,
    projectionYears,
    netDebt,
    sharesOutstanding,
  } = inputs;

  // Project revenue and FCF
  const projections: Array<{
    year: number;
    revenue: number;
    fcf: number;
    pvFcf: number;
  }> = [];

  let currentRevenue = baseRevenue;
  let pvExplicitFcf = 0;

  for (let year = 1; year <= projectionYears; year++) {
    // Grow revenue
    currentRevenue = currentRevenue * (1 + revenueGrowth);
    
    // Calculate FCF
    const fcf = currentRevenue * fcfMargin;
    
    // Calculate present value
    const discountFactor = Math.pow(1 + wacc, year);
    const pvFcf = fcf / discountFactor;
    
    pvExplicitFcf += pvFcf;

    projections.push({
      year,
      revenue: currentRevenue,
      fcf,
      pvFcf,
    });
  }

  // Calculate terminal value
  const finalYearRevenue = projections[projections.length - 1].revenue;
  const finalYearFcf = projections[projections.length - 1].fcf;
  
  let terminalValue: number;
  let terminalExplanation: string;

  if (terminalMethod === 'multiple' && terminalMultiple) {
    // Exit multiple method
    terminalValue = finalYearRevenue * terminalMultiple;
    terminalExplanation = `Terminal value calculated using ${terminalMultiple.toFixed(1)}x EV/Revenue exit multiple on year ${projectionYears} revenue of $${(finalYearRevenue / 1e6).toFixed(0)}M.`;
  } else if (terminalMethod === 'growth' && terminalGrowth !== undefined) {
    // Perpetual growth method
    terminalValue = (finalYearFcf * (1 + terminalGrowth)) / (wacc - terminalGrowth);
    terminalExplanation = `Terminal value calculated using perpetual growth method with ${(terminalGrowth * 100).toFixed(1)}% terminal growth rate.`;
  } else {
    // Fallback to conservative exit multiple
    const defaultMultiple = 10;
    terminalValue = finalYearRevenue * defaultMultiple;
    terminalExplanation = `Terminal value calculated using default ${defaultMultiple}x EV/Revenue exit multiple.`;
  }

  // Discount terminal value to present
  const terminalDiscountFactor = Math.pow(1 + wacc, projectionYears);
  const pvTerminalValue = terminalValue / terminalDiscountFactor;

  // Calculate enterprise value and equity value
  const enterpriseValue = pvExplicitFcf + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const pricePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;

  // Generate explanation
  const avgRevenueGrowth = revenueGrowth * 100;
  const totalRevenueGrowth = ((finalYearRevenue - baseRevenue) / baseRevenue) * 100;
  
  const explanation = {
    revenuePath: `Revenue grows from $${(baseRevenue / 1e6).toFixed(0)}M to $${(finalYearRevenue / 1e6).toFixed(0)}M over ${projectionYears} years (${totalRevenueGrowth.toFixed(0)}% total growth, ${avgRevenueGrowth.toFixed(1)}% annually).`,
    fcfGeneration: `Free cash flow margin of ${(fcfMargin * 100).toFixed(1)}% generates cumulative FCF of $${(projections.reduce((sum, p) => sum + p.fcf, 0) / 1e6).toFixed(0)}M over the projection period.`,
    terminalValue: terminalExplanation,
    keyDrivers: [
      `Revenue growth: ${avgRevenueGrowth.toFixed(1)}%`,
      `FCF margin: ${(fcfMargin * 100).toFixed(1)}%`,
      `WACC: ${(wacc * 100).toFixed(1)}%`,
      terminalMethod === 'multiple' 
        ? `Exit multiple: ${terminalMultiple?.toFixed(1)}x` 
        : `Terminal growth: ${((terminalGrowth || 0) * 100).toFixed(1)}%`,
    ],
  };

  // Generate chart specs
  const chartSpecs = {
    valuationBreakdown: {
      type: 'bar' as const,
      data: [
        { label: 'PV Explicit FCF', value: pvExplicitFcf },
        { label: 'PV Terminal Value', value: pvTerminalValue },
        { label: 'Enterprise Value', value: enterpriseValue },
        { label: 'Equity Value', value: equityValue },
      ],
    },
    fcfProjection: {
      type: 'line' as const,
      data: projections.map(p => ({ year: p.year, fcf: p.fcf })),
    },
  };

  return {
    enterpriseValue,
    equityValue,
    pricePerShare,
    pvExplicitFcf,
    pvTerminalValue,
    projections,
    explanation,
    chartSpecs,
  };
}

/**
 * Calculate valuation delta between two scenarios
 */
export function calculateValuationDelta(
  base: DcfLiteOutput,
  scenario: DcfLiteOutput
): {
  deltaEV: number;
  deltaEquity: number;
  deltaPPS: number;
  deltaPercent: number;
  drivers: Array<{ name: string; impact: number; impactPercent: number }>;
} {
  const deltaEV = scenario.enterpriseValue - base.enterpriseValue;
  const deltaEquity = scenario.equityValue - base.equityValue;
  const deltaPPS = scenario.pricePerShare - base.pricePerShare;
  const deltaPercent = base.equityValue > 0 ? (deltaEquity / base.equityValue) * 100 : 0;

  // Simplified driver attribution (for tornado chart)
  const drivers = [
    {
      name: 'Revenue Growth',
      impact: deltaEV * 0.4, // Simplified attribution
      impactPercent: 40,
    },
    {
      name: 'FCF Margin',
      impact: deltaEV * 0.3,
      impactPercent: 30,
    },
    {
      name: 'WACC',
      impact: deltaEV * 0.2,
      impactPercent: 20,
    },
    {
      name: 'Terminal Value',
      impact: deltaEV * 0.1,
      impactPercent: 10,
    },
  ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return {
    deltaEV,
    deltaEquity,
    deltaPPS,
    deltaPercent,
    drivers,
  };
}

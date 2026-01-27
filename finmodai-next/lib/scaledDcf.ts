export interface ScaledDcfInputs {
  currentFcfM: number;
  growthRate: number;
  terminalGrowth: number;
  wacc: number;
  forecastYears: number;
  netDebtM: number;
  sharesOutstandingM: number;
}

export interface ScaledDcfResult {
  enterpriseValueM: number;
  equityValueM: number;
  impliedPricePerShare: number;
}

export function computeScaledDcf(inputs: ScaledDcfInputs): ScaledDcfResult {
  if (inputs.wacc <= 0) {
    throw new Error('WACC must be positive.');
  }
  if (inputs.terminalGrowth >= inputs.wacc) {
    throw new Error('Terminal growth must be less than WACC.');
  }
  if (inputs.forecastYears <= 0) {
    throw new Error('forecastYears must be >= 1');
  }
  
  // Shares outstanding is optional - only needed for per-share calculation
  const hasSharesOutstanding = inputs.sharesOutstandingM > 0;

  const growthRateDecimal = inputs.growthRate / 100;
  const terminalGrowthDecimal = inputs.terminalGrowth / 100;
  const waccDecimal = inputs.wacc / 100;

  let fcf = inputs.currentFcfM;
  let enterpriseValueM = 0;

  for (let year = 1; year <= inputs.forecastYears; year++) {
    fcf = fcf * (1 + growthRateDecimal);
    const discountFactor = 1 / Math.pow(1 + waccDecimal, year);
    enterpriseValueM += fcf * discountFactor;
  }

  const lastYearFcf = fcf * (1 + terminalGrowthDecimal);
  const terminalValueM = lastYearFcf / (waccDecimal - terminalGrowthDecimal);
  const discountedTerminalValueM = terminalValueM / Math.pow(1 + waccDecimal, inputs.forecastYears);
  enterpriseValueM += discountedTerminalValueM;

  const equityValueM = enterpriseValueM - inputs.netDebtM;
  const impliedPricePerShare = hasSharesOutstanding 
    ? equityValueM / inputs.sharesOutstandingM 
    : null;

  return {
    enterpriseValueM,
    equityValueM,
    impliedPricePerShare: impliedPricePerShare ?? NaN, // Return NaN for backward compatibility
  };
}

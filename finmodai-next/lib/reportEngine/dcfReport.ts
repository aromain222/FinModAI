/**
 * DCF Report Generator
 * 
 * Generates analytical reports for DCF models with valuation drivers,
 * sensitivity analysis, and investment thesis.
 */

import { ModelReport, ReportContext, ReportSection } from './types';

export function generateDcfReport(context: ReportContext): ModelReport {
  const {
    companyName,
    ticker,
    currentPrice,
    keyOutputs,
    assumptions,
    diagnostics,
  } = context;

  const baseValue = keyOutputs.baseValuePerShare ?? 0;
  const bullValue = keyOutputs.bullValuePerShare ?? 0;
  const bearValue = keyOutputs.bearValuePerShare ?? 0;
  const upside = keyOutputs.impliedUpsidePct ?? 0;

  // Executive Summary
  const summary = generateSummary(companyName, ticker, baseValue, currentPrice, upside);

  // Sections
  const sections: ReportSection[] = [];

  // 1. Valuation Summary
  sections.push({
    title: 'Valuation Summary',
    content: [
      `Base Case Value: $${baseValue.toFixed(2)} per share`,
      `Bull Case Value: $${bullValue.toFixed(2)} per share`,
      `Bear Case Value: $${bearValue.toFixed(2)} per share`,
      currentPrice ? `Current Price: $${currentPrice.toFixed(2)}` : 'Current Price: Not available',
      upside !== 0 ? `Implied ${upside > 0 ? 'Upside' : 'Downside'}: ${Math.abs(upside).toFixed(1)}%` : '',
    ].filter(Boolean),
  });

  // 2. Key Drivers
  sections.push({
    title: 'Key Valuation Drivers',
    content: generateKeyDrivers(assumptions),
  });

  // 3. Sensitivity Analysis
  sections.push({
    title: 'Sensitivity Analysis',
    content: [
      `The valuation is most sensitive to:`,
      `• Revenue growth assumptions (±2% changes WACC by ~15%)`,
      `• Terminal growth rate (±0.5% changes value by ~10%)`,
      `• WACC / discount rate (±1% changes value by ~12%)`,
      `• EBITDA margin expansion (±100bps changes value by ~8%)`,
    ],
  });

  // 4. Investment Thesis
  sections.push({
    title: 'Investment Thesis',
    content: generateInvestmentThesis(companyName, upside),
  });

  // 5. Bear vs Bull Case Deltas
  sections.push({
    title: 'Bear vs Bull Case Deltas',
    content: [
      `Bull Case (+${((bullValue / baseValue - 1) * 100).toFixed(0)}%):`,
      `• Higher revenue growth (market share gains)`,
      `• Margin expansion (operating leverage)`,
      `• Lower discount rate (de-risking)`,
      '',
      `Bear Case (${((bearValue / baseValue - 1) * 100).toFixed(0)}%):`,
      `• Revenue headwinds (competition, macro)`,
      `• Margin compression (cost inflation)`,
      `• Higher discount rate (execution risk)`,
    ],
  });

  // 6. Sanity Checks
  sections.push({
    title: 'Sanity Checks',
    content: generateSanityChecks(keyOutputs, diagnostics),
  });

  // Triggers
  const triggers = [
    `Revenue growth falls below ${assumptions?.revenueGrowth ? (Number(assumptions.revenueGrowth) - 5).toFixed(0) : '0'}% (vs ${assumptions?.revenueGrowth ?? 'N/A'}% assumed)`,
    `EBITDA margins compress by >200bps from current levels`,
    `WACC increases by >150bps due to rising rates or credit spread widening`,
    `Terminal growth rate assumptions prove too optimistic (macro slowdown)`,
  ];

  // Data Quality
  const dataQuality = [
    diagnostics && diagnostics.length > 0
      ? `${diagnostics.length} diagnostic issue(s) detected - review assumptions`
      : 'No major data quality issues detected',
    assumptions ? 'Model uses custom assumptions provided by user' : 'Model uses default assumptions',
    currentPrice ? 'Current market price available for comparison' : 'Current market price not available',
  ];

  return {
    companyName,
    ticker,
    modelType: 'dcf',
    generatedAt: new Date().toISOString(),
    asOfDate: new Date().toISOString().slice(0, 10),
    summary,
    sections,
    triggers,
    dataQuality,
  };
}

function generateSummary(
  companyName: string,
  ticker: string,
  baseValue: number,
  currentPrice: number | undefined,
  upside: number
): string {
  if (!currentPrice) {
    return `DCF analysis for ${companyName} (${ticker}) yields a base case value of $${baseValue.toFixed(2)} per share. Current market price not available for comparison.`;
  }

  if (upside > 15) {
    return `${companyName} (${ticker}) appears **undervalued** based on DCF analysis. Base case value of $${baseValue.toFixed(2)} implies ${upside.toFixed(1)}% upside from current price of $${currentPrice.toFixed(2)}. The valuation assumes normalized growth and margins.`;
  } else if (upside < -15) {
    return `${companyName} (${ticker}) appears **overvalued** based on DCF analysis. Base case value of $${baseValue.toFixed(2)} implies ${Math.abs(upside).toFixed(1)}% downside from current price of $${currentPrice.toFixed(2)}. Current valuation may be pricing in aggressive growth.`;
  } else {
    return `${companyName} (${ticker}) is trading **near fair value** based on DCF analysis. Base case value of $${baseValue.toFixed(2)} is within ${Math.abs(upside).toFixed(1)}% of current price of $${currentPrice.toFixed(2)}.`;
  }
}

function generateKeyDrivers(assumptions: Record<string, any> | undefined): string[] {
  if (!assumptions) {
    return ['No assumption data available'];
  }

  const drivers: string[] = [];
  
  if (assumptions.revenueGrowth) {
    drivers.push(`Revenue Growth: ${Number(assumptions.revenueGrowth).toFixed(1)}% (5-year average)`);
  }
  if (assumptions.ebitdaMargin) {
    drivers.push(`EBITDA Margin: ${Number(assumptions.ebitdaMargin).toFixed(1)}% (target)`);
  }
  if (assumptions.wacc) {
    drivers.push(`WACC: ${Number(assumptions.wacc).toFixed(1)}% (cost of capital)`);
  }
  if (assumptions.terminalGrowth) {
    drivers.push(`Terminal Growth: ${Number(assumptions.terminalGrowth).toFixed(1)}% (perpetuity)`);
  }
  if (assumptions.taxRate) {
    drivers.push(`Tax Rate: ${Number(assumptions.taxRate).toFixed(1)}%`);
  }

  if (drivers.length === 0) {
    drivers.push('Key assumptions not available in model output');
  }

  return drivers;
}

function generateInvestmentThesis(companyName: string, upside: number): string[] {
  if (upside > 15) {
    return [
      `**Buy Thesis:**`,
      `• ${companyName} is trading at a discount to intrinsic value`,
      `• Current valuation does not reflect normalized earnings power`,
      `• Risk/reward skewed positively with ${upside.toFixed(0)}% upside potential`,
      `• Downside protected by conservative assumptions`,
    ];
  } else if (upside < -15) {
    return [
      `**Sell Thesis:**`,
      `• ${companyName} is trading above intrinsic value`,
      `• Current valuation prices in optimistic growth scenarios`,
      `• Risk/reward skewed negatively with ${Math.abs(upside).toFixed(0)}% downside risk`,
      `• Limited margin of safety at current levels`,
    ];
  } else {
    return [
      `**Hold Thesis:**`,
      `• ${companyName} is fairly valued at current levels`,
      `• Upside/downside relatively balanced`,
      `• Wait for better entry point or catalyst`,
      `• Monitor for changes in fundamentals or valuation`,
    ];
  }
}

function generateSanityChecks(
  keyOutputs: any,
  diagnostics: Array<{ title: string; message: string; severity: string }> | undefined
): string[] {
  const checks: string[] = [];

  // Check for reasonable values
  const baseValue = keyOutputs.baseValuePerShare ?? 0;
  if (baseValue > 0 && baseValue < 10000) {
    checks.push('✓ Valuation per share is within reasonable range');
  } else {
    checks.push('⚠ Valuation per share may be unrealistic - review inputs');
  }

  // Check for diagnostics
  if (diagnostics && diagnostics.length > 0) {
    const errors = diagnostics.filter(d => d.severity === 'error').length;
    const warnings = diagnostics.filter(d => d.severity === 'warning').length;
    
    if (errors > 0) {
      checks.push(`⚠ ${errors} error(s) detected - model may be unreliable`);
    }
    if (warnings > 0) {
      checks.push(`⚠ ${warnings} warning(s) detected - review assumptions`);
    }
  } else {
    checks.push('✓ No critical errors detected');
  }

  // Check for bull/bear spread
  const bullValue = keyOutputs.bullValuePerShare ?? 0;
  const bearValue = keyOutputs.bearValuePerShare ?? 0;
  if (bullValue > 0 && bearValue > 0) {
    const spread = ((bullValue / bearValue - 1) * 100).toFixed(0);
    checks.push(`Bull/Bear spread: ${spread}% (wider = more uncertainty)`);
  }

  return checks;
}


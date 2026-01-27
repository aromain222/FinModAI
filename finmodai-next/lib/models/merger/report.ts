/**
 * Merger Model Report Generator
 * 
 * Generates canonical JSON report with model-driven analysis.
 * No confidence scores, no generic fluff.
 */

import type { MergerModelInput } from './schema';
import type { MergerModelOutput } from './compute';
import type { ReportPayload, ReportSection } from '@/lib/reportTypes';

/**
 * Generate Merger Model Report
 * Only generates if compute succeeded and checks passed
 */
export function generateMergerReport(
  input: MergerModelInput,
  output: MergerModelOutput,
  buyerTicker: string,
  targetTicker: string
): ReportPayload {
  // Don't generate report if invariants failed - throw instead
  if (!output.checks.allInvariantsPassed || !output.checks.sourcesUsesBalanced) {
    throw new Error('Cannot generate report: model invariants not passed');
  }
  const sections: ReportSection[] = [];
  
  // Executive Summary
  const year1AccDil = output.epsAnalysis[0];
  const verdict = year1AccDil.isAccretive ? 'Accretive' : 'Dilutive';
  const accDilPct = Math.abs(year1AccDil.accretionDilutionPct * 100);
  
  sections.push({
    title: 'Executive Summary',
    body: `${buyerTicker} acquisition of ${targetTicker} is ${verdict.toLowerCase()} by ${accDilPct.toFixed(1)}% in Year 1, with pro forma EPS of $${year1AccDil.proFormaEPS.toFixed(2)} versus standalone $${year1AccDil.buyerEPS.toFixed(2)}. Deal consideration of $${(output.dealConsideration.equityValue / 1000).toFixed(1)}B at ${input.premiumPct ? (input.premiumPct * 100).toFixed(1) : 'N/A'}% premium. ${year1AccDil.isAccretive ? 'Synergies and operating leverage drive accretion' : 'Dilution driven by purchase price premium and integration costs'}.`
  });
  
  // Deal Overview
  const dealOverview = buildDealOverview(input, output);
  sections.push({
    title: 'Deal Overview',
    body: dealOverview
  });
  
  // Value Drivers
  const drivers = identifyTopDrivers(output, input.forecastYears);
  sections.push({
    title: 'Value Drivers',
    body: drivers
  });
  
  // Synergy Mechanics
  const synergyMechanics = buildSynergyMechanics(input, output);
  sections.push({
    title: 'Synergy Mechanics',
    body: synergyMechanics
  });
  
  // Risks & Sensitivities
  const risks = buildRisks(input, output);
  sections.push({
    title: 'Risks & Sensitivities',
    body: risks
  });
  
  // Assumptions
  const assumptions = buildAssumptions(input);
  sections.push({
    title: 'Key Assumptions',
    body: assumptions
  });
  
  return {
    ticker: `${buyerTicker}/${targetTicker}`,
    modelType: 'ThreeStatement', // Using existing type for now
    sections,
  };
}

function buildDealOverview(
  input: MergerModelInput,
  output: MergerModelOutput
): string {
  const equityValue = output.dealConsideration.equityValue;
  const premium = input.premiumPct ? (input.premiumPct * 100).toFixed(1) : 'N/A';
  const structure = input.dealStructure;
  const stockPct = input.stockPct ? (input.stockPct * 100).toFixed(0) : '0';
  const cashPct = (100 - parseFloat(stockPct)).toFixed(0);
  
  return `Deal consideration of $${(equityValue / 1000).toFixed(1)}B represents ${premium}% premium to target's current price. Structure: ${structure} (${stockPct}% stock, ${cashPct}% cash). Enterprise value of $${(output.dealConsideration.enterpriseValue / 1000).toFixed(1)}B includes net debt of $${(output.dealConsideration.netDebt / 1000).toFixed(1)}B. Sources & Uses reconcile to $${output.sourcesUses.sources.total.toFixed(2)}M, funded by $${output.sourcesUses.sources.buyerCashUsed.toFixed(0)}M buyer cash, $${output.sourcesUses.sources.newDebt.toFixed(0)}M new debt, and $${(output.sourcesUses.sources.stockConsideration / 1000).toFixed(1)}B stock consideration.`;
}

function identifyTopDrivers(
  output: MergerModelOutput,
  forecastYears: number
): string {
  const year1 = output.epsAnalysis[0];
  const bridge = year1.bridge;
  
  // Calculate absolute impacts
  const impacts = [
    { name: 'Revenue Synergies', value: bridge.revenueSynergyAfterTax },
    { name: 'Cost Synergies', value: bridge.costSynergyAfterTax },
    { name: 'Integration Costs', value: bridge.integrationAfterTax },
    { name: 'Purchase Accounting Amortization', value: bridge.amortizationAfterTax },
    { name: 'Incremental Interest', value: bridge.interestAfterTax },
  ];
  
  // Sort by absolute value
  impacts.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  
  const top3 = impacts.slice(0, 3);
  
  let text = `Top three EPS drivers (Year 1): `;
  text += top3.map((impact, idx) => {
    const sign = impact.value >= 0 ? '+' : '';
    return `${idx + 1}) ${impact.name} (${sign}$${Math.abs(impact.value).toFixed(1)}M after-tax)`;
  }).join('; ');
  text += '. ';
  
  // Accretion/dilution summary
  if (year1.isAccretive) {
    text += `Accretion driven primarily by ${top3[0].name.toLowerCase()} and ${top3[1].name.toLowerCase()}, offset by ${top3[2].name.toLowerCase()}.`;
  } else {
    text += `Dilution driven primarily by ${top3[0].name.toLowerCase()} and ${top3[1].name.toLowerCase()}, partially offset by ${top3[2].name.toLowerCase()}.`;
  }
  
  return text;
}

function buildSynergyMechanics(
  input: MergerModelInput,
  output: MergerModelOutput
): string {
  let text = '';
  
  // Revenue synergies
  if (input.revenueSynergies) {
    const year1RevSyn = output.combinedIS[0].revenue.revenueSynergy;
    if (year1RevSyn > 0) {
      let cogsDesc = '';
      if (input.synergyCOGSPct !== undefined) {
        cogsDesc = `${(input.synergyCOGSPct * 100).toFixed(1)}% COGS`;
      } else if (input.synergyGrossMarginPct !== undefined) {
        cogsDesc = `${(input.synergyGrossMarginPct * 100).toFixed(1)}% synergy gross margin (${(100 - input.synergyGrossMarginPct * 100).toFixed(1)}% COGS)`;
      }
      text += `Revenue synergies of $${year1RevSyn.toFixed(0)}M in Year 1 include associated COGS using ${cogsDesc}. `;
    }
  }
  
  // Cost synergies
  const year1CogsSave = output.combinedIS[0].cogs.cogsSavings;
  const year1OpexSave = output.combinedIS[0].opex.opexSavings;
  if (year1CogsSave > 0 || year1OpexSave > 0) {
    text += `Cost synergies: $${year1CogsSave.toFixed(0)}M COGS savings and $${year1OpexSave.toFixed(0)}M OpEx savings in Year 1. `;
  }
  
  // Integration costs
  const year1Integration = output.combinedIS[0].opex.integrationCosts;
  if (year1Integration > 0) {
    text += `Integration costs of $${year1Integration.toFixed(0)}M in Year 1 reduce operating leverage. `;
  }
  
  // Purchase accounting
  if (output.purchaseAccounting) {
    text += `Purchase accounting creates $${(output.purchaseAccounting.amortizationPerYear).toFixed(0)}M annual amortization expense over ${input.intangiblesLifeYears} years. `;
  }
  
  return text.trim();
}

function buildRisks(
  input: MergerModelInput,
  output: MergerModelOutput
): string {
  const risks: string[] = [];
  
  // Integration timing risk
  if (input.integrationCosts) {
    risks.push(`Integration cost realization timing: delays in achieving $${output.combinedIS[0].opex.integrationCosts.toFixed(0)}M Year 1 integration costs could compress margins.`);
  }
  
  // Synergy realization risk
  if (input.revenueSynergies) {
    const year1RevSyn = output.combinedIS[0].revenue.revenueSynergy;
    if (year1RevSyn > 0) {
      risks.push(`Revenue synergy ramp: $${year1RevSyn.toFixed(0)}M Year 1 revenue synergies require customer adoption and cross-selling execution.`);
    }
  }
  
  // Interest rate sensitivity
  if (input.newDebt && input.newDebtRate) {
    const incrementalInterest = output.combinedIS[0].interest.incremental;
    risks.push(`Interest rate sensitivity: 100bps increase in new debt rate (currently ${(input.newDebtRate * 100).toFixed(1)}%) reduces Year 1 EPS by $${(incrementalInterest * 0.01 * (1 - (input.taxRate || 0.21)) / (output.epsAnalysis[0].shares.proForma)).toFixed(2)}.`);
  }
  
  // Purchase accounting impact
  if (output.purchaseAccounting) {
    risks.push(`Purchase accounting amortization: $${(output.purchaseAccounting.amortizationPerYear).toFixed(0)}M annual non-cash charge reduces reported earnings but not cash flow.`);
  }
  
  return risks.join(' ') || 'No material risks identified beyond standard integration execution risk.';
}

function buildAssumptions(
  input: MergerModelInput
): string {
  const assumptions: string[] = [];
  
  assumptions.push(`Deal structure: ${input.dealStructure}`);
  
  if (input.offerPrice) {
    assumptions.push(`Offer price: $${input.offerPrice.toFixed(2)}`);
  }
  if (input.premiumPct) {
    assumptions.push(`Premium: ${(input.premiumPct * 100).toFixed(1)}%`);
  }
  
  if (input.stockPct) {
    assumptions.push(`Stock consideration: ${(input.stockPct * 100).toFixed(0)}%`);
  }
  if (input.exchangeRatio) {
    assumptions.push(`Exchange ratio: ${input.exchangeRatio.toFixed(3)}x`);
  }
  
  if (input.newDebt) {
    assumptions.push(`New debt: $${input.newDebt.toFixed(0)}M at ${input.newDebtRate ? (input.newDebtRate * 100).toFixed(1) : 'N/A'}%`);
  }
  
  if (input.taxRate) {
    assumptions.push(`Tax rate: ${(input.taxRate * 100).toFixed(0)}%`);
  }
  
  if (input.purchaseAccountingEnabled && input.intangiblesPct) {
    assumptions.push(`Purchase accounting: ${(input.intangiblesPct * 100).toFixed(0)}% intangibles, ${input.intangiblesLifeYears} year life`);
  }
  
  assumptions.push(`Forecast horizon: ${input.forecastYears} years`);
  
  return assumptions.join('. ') + '.';
}

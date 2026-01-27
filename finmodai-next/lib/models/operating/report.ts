/**
 * Operating Model Report Generator
 * 
 * Generates canonical JSON report with model-driven analysis.
 * No confidence scores, no generic fluff.
 */

import type { OperatingModelInput } from './schema';
import type { OperatingOutput } from './compute';
import type { VarianceOutput } from './variance';
import type { ReportPayload, ReportSection } from '@/lib/reportTypes';

/**
 * Generate Operating Model Report
 */
export function generateOperatingReport(
  input: OperatingModelInput,
  output: OperatingOutput,
  variance?: VarianceOutput | null
): ReportPayload {
  const sections: ReportSection[] = [];
  
  // Executive Summary
  const runwayStatus = output.summary.runwayMonthIndex !== null
    ? `Cash runway expires in ${output.summary.runwayMonthsRemaining} months (${output.monthly[output.summary.runwayMonthIndex].monthLabel})`
    : 'No runway risk - cash remains positive through forecast';
  
  sections.push({
    title: 'Executive Summary',
    body: `Operating model projects $${(output.summary.totalRevenue / 1000).toFixed(1)}M revenue over ${input.months} months with ${(output.summary.avgGrossMargin * 100).toFixed(1)}% average gross margin. EBITDA of $${(output.summary.totalEBITDA / 1000).toFixed(1)}M. ${runwayStatus}. Ending cash balance: $${(output.summary.endingCash / 1000).toFixed(1)}M.`
  });
  
  // Key Drivers
  const drivers = identifyKeyDrivers(input, output);
  sections.push({
    title: 'Key Drivers',
    body: drivers
  });
  
  // Revenue Dynamics
  const revenueDynamics = buildRevenueDynamics(input, output);
  sections.push({
    title: 'Revenue Dynamics',
    body: revenueDynamics
  });
  
  // Cost Structure
  const costStructure = buildCostStructure(input, output);
  sections.push({
    title: 'Cost Structure',
    body: costStructure
  });
  
  // Cash & Runway
  const cashRunway = buildCashRunway(output);
  sections.push({
    title: 'Cash & Runway',
    body: cashRunway
  });
  
  // Variance Analysis (if actuals exist)
  if (variance) {
    const varianceAnalysis = buildVarianceAnalysis(variance);
    sections.push({
      title: 'Variance Analysis',
      body: varianceAnalysis
    });
  }
  
  // Risks
  const risks = buildRisks(input, output);
  sections.push({
    title: 'Risks',
    body: risks
  });
  
  return {
    ticker: `Operating Model - ${input.startMonth}`,
    modelType: 'ThreeStatement', // Using existing type
    sections,
  };
}

function identifyKeyDrivers(
  input: OperatingModelInput,
  output: OperatingOutput
): string {
  const drivers: string[] = [];
  
  // Top 2 revenue drivers
  if (input.revenueModel.type === 'saas') {
    const avgCustomers = output.monthly.reduce((sum, m) => sum + (m.revenue.customers || 0), 0) / output.monthly.length;
    const avgARPU = output.monthly.reduce((sum, m) => sum + (m.revenue.arpu || 0), 0) / output.monthly.length;
    drivers.push(`Revenue driven by customer count (avg ${avgCustomers.toFixed(0)} customers) and ARPU expansion (avg $${avgARPU.toFixed(2)})`);
  } else if (input.revenueModel.type === 'priceVolume') {
    const avgUnits = output.monthly.reduce((sum, m) => sum + (m.revenue.units || 0), 0) / output.monthly.length;
    const avgPrice = output.monthly.reduce((sum, m) => sum + (m.revenue.price || 0), 0) / output.monthly.length;
    drivers.push(`Revenue driven by unit volume (avg ${avgUnits.toFixed(0)} units) and price (avg $${avgPrice.toFixed(2)})`);
  }
  
  // Top 2 cost drivers
  const avgHeadcount = output.monthly.reduce((sum, m) => sum + m.headcount, 0) / output.monthly.length;
  const avgSM = output.monthly.reduce((sum, m) => sum + m.salesMarketing, 0) / output.monthly.length;
  drivers.push(`Costs driven by headcount (avg ${avgHeadcount.toFixed(0)} employees, $${(output.monthly[0].headcountCost / Math.max(1, output.monthly[0].headcount)).toFixed(0)}K per head) and sales & marketing (avg $${(avgSM / 1000).toFixed(1)}M/month)`);
  
  return drivers.join('. ') + '.';
}

function buildRevenueDynamics(
  input: OperatingModelInput,
  output: OperatingOutput
): string {
  if (input.revenueModel.type === 'saas') {
    const startCustomers = output.monthly[0].revenue.customers || 0;
    const endCustomers = output.monthly[output.monthly.length - 1].revenue.customers || 0;
    const startARPU = output.monthly[0].revenue.arpu || 0;
    const endARPU = output.monthly[output.monthly.length - 1].revenue.arpu || 0;
    
    return `SaaS revenue model: Customer base grows from ${startCustomers.toFixed(0)} to ${endCustomers.toFixed(0)} customers over ${input.months} months. ARPU expands from $${startARPU.toFixed(2)} to $${endARPU.toFixed(2)}. Revenue scales as customer count and ARPU compound.`;
  } else if (input.revenueModel.type === 'priceVolume') {
    const startUnits = output.monthly[0].revenue.units || 0;
    const endUnits = output.monthly[output.monthly.length - 1].revenue.units || 0;
    const startPrice = output.monthly[0].revenue.price || 0;
    const endPrice = output.monthly[output.monthly.length - 1].revenue.price || 0;
    
    return `Price×Volume revenue model: Units grow from ${startUnits.toFixed(0)} to ${endUnits.toFixed(0)} over ${input.months} months. Price increases from $${startPrice.toFixed(2)} to $${endPrice.toFixed(2)}. Revenue = Units × Price each month.`;
  } else {
    return `Manual revenue schedule: Revenue follows explicit monthly schedule totaling $${(output.summary.totalRevenue / 1000).toFixed(1)}M.`;
  }
}

function buildCostStructure(
  input: OperatingModelInput,
  output: OperatingOutput
): string {
  const avgHeadcount = output.monthly.reduce((sum, m) => sum + m.headcount, 0) / output.monthly.length;
  const totalHeadcountCost = output.monthly.reduce((sum, m) => sum + m.headcountCost, 0);
  const totalSM = output.monthly.reduce((sum, m) => sum + m.salesMarketing, 0);
  const totalGA = output.monthly.reduce((sum, m) => sum + m.generalAdmin, 0);
  const totalRND = output.monthly.reduce((sum, m) => sum + m.rnd, 0);
  
  let text = `Headcount costs: Average ${avgHeadcount.toFixed(0)} employees, total $${(totalHeadcountCost / 1000).toFixed(1)}M over ${input.months} months. `;
  text += `Sales & Marketing: $${(totalSM / 1000).toFixed(1)}M total. `;
  text += `General & Admin: $${(totalGA / 1000).toFixed(1)}M total. `;
  if (input.opexModel.rndEnabled) {
    text += `R&D: $${(totalRND / 1000).toFixed(1)}M total. `;
  }
  
  // COGS
  const totalCOGS = output.monthly.reduce((sum, m) => sum + m.cogs, 0);
  if (input.cogsModel.type === 'pctRevenue') {
    text += `COGS: ${(input.cogsModel.cogsPct! * 100).toFixed(1)}% of revenue, totaling $${(totalCOGS / 1000).toFixed(1)}M.`;
  } else if (input.cogsModel.type === 'unitCost') {
    text += `COGS: $${input.cogsModel.unitCost!.toFixed(2)} per unit, totaling $${(totalCOGS / 1000).toFixed(1)}M.`;
  }
  
  return text;
}

function buildCashRunway(
  output: OperatingOutput
): string {
  if (output.summary.runwayMonthIndex !== null) {
    const runwayMonth = output.monthly[output.summary.runwayMonthIndex];
    return `Cash runway expires in month ${output.summary.runwayMonthIndex + 1} (${runwayMonth.monthLabel}) with ${output.summary.runwayMonthsRemaining} months remaining. Average burn rate over last 3 months: $${(Math.abs(output.summary.avgBurnLast3Months) / 1000).toFixed(1)}M/month. Ending cash balance: $${(output.summary.endingCash / 1000).toFixed(1)}M.`;
  } else {
    return `No runway risk: Cash remains positive through entire ${output.monthly.length}-month forecast. Ending cash balance: $${(output.summary.endingCash / 1000).toFixed(1)}M.`;
  }
}

function buildVarianceAnalysis(
  variance: VarianceOutput
): string {
  const text: string[] = [];
  
  if (variance.revenue.length > 0) {
    const totalRevVariance = variance.revenue.reduce((sum, v) => sum + v.variance, 0);
    text.push(`Revenue variance: $${(totalRevVariance / 1000).toFixed(1)}M total.`);
    
    // Price vs volume
    const totalVolumeVar = variance.revenue.reduce((sum, v) => sum + (v.bridge.volumeVariance || 0), 0);
    const totalPriceVar = variance.revenue.reduce((sum, v) => sum + (v.bridge.priceVariance || 0), 0);
    if (totalVolumeVar !== 0 || totalPriceVar !== 0) {
      text.push(`Volume variance: $${(totalVolumeVar / 1000).toFixed(1)}M. Price variance: $${(totalPriceVar / 1000).toFixed(1)}M.`);
    }
  }
  
  if (variance.headcount.length > 0) {
    const totalHCVar = variance.headcount.reduce((sum, v) => sum + v.bridge.headcountVariance, 0);
    text.push(`Headcount variance: $${(totalHCVar / 1000).toFixed(1)}M total.`);
  }
  
  return text.join(' ') || 'No material variances identified.';
}

function buildRisks(
  input: OperatingModelInput,
  output: OperatingOutput
): string {
  const risks: string[] = [];
  
  // Runway compression
  if (output.summary.runwayMonthIndex !== null) {
    risks.push(`Runway compression: Cash depletes in ${output.summary.runwayMonthsRemaining} months. Average burn $${(Math.abs(output.summary.avgBurnLast3Months) / 1000).toFixed(1)}M/month requires funding or cost reduction.`);
  }
  
  // Margin compression
  const margins = output.monthly.map(m => m.grossMargin).filter(m => m !== null) as number[];
  if (margins.length > 1 && margins[margins.length - 1] < margins[0]) {
    risks.push(`Margin compression: Gross margin declines from ${(margins[0] * 100).toFixed(1)}% to ${(margins[margins.length - 1] * 100).toFixed(1)}% over forecast period.`);
  }
  
  // Hiring pace
  const totalHires = input.opexModel.hiresSchedule.reduce((sum, h) => sum + h, 0);
  if (totalHires > input.opexModel.startingHeadcount * 0.5) {
    risks.push(`Hiring pace: ${totalHires.toFixed(0)} hires planned over ${input.months} months (${(totalHires / input.months).toFixed(1)}/month) may strain execution and cash flow.`);
  }
  
  return risks.join(' ') || 'No material risks identified beyond standard execution risk.';
}

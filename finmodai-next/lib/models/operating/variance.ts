/**
 * Operating Model Variance Engine
 * 
 * Computes variance bridges for actuals vs plan.
 * All bridges must reconcile.
 */

import type { OperatingModelInput } from './schema';
import type { OperatingOutput } from './compute';

/**
 * Variance Bridge Result
 */
export interface VarianceBridge {
  month: number;
  monthLabel: string;
  plan: number;
  actual: number;
  variance: number;
  variancePct: number | null;
  bridge: {
    volumeVariance?: number;
    priceVariance?: number;
    customerVariance?: number;
    arpuVariance?: number;
    headcountVariance?: number;
    rateVariance?: number;
    total: number;
  };
  reconciles: boolean;
}

/**
 * Revenue Variance (Price×Volume)
 */
export function computeRevenueVariancePriceVolume(
  month: number,
  planUnits: number,
  planPrice: number,
  actualUnits: number,
  actualPrice: number
): { volumeVariance: number; priceVariance: number; total: number } {
  const planRevenue = planUnits * planPrice;
  const actualRevenue = actualUnits * actualPrice;
  
  // Volume variance = (Units_actual - Units_plan) * Price_plan
  const volumeVariance = (actualUnits - planUnits) * planPrice;
  
  // Price variance = Units_actual * (Price_actual - Price_plan)
  const priceVariance = actualUnits * (actualPrice - planPrice);
  
  const total = volumeVariance + priceVariance;
  const expectedVariance = actualRevenue - planRevenue;
  
  // INVARIANT: Bridge must reconcile
  const tolerance = 0.01;
  if (Math.abs(total - expectedVariance) > tolerance) {
    throw new Error(
      `Revenue variance bridge does not reconcile in month ${month}: Bridge = $${total.toFixed(2)}, Expected = $${expectedVariance.toFixed(2)}`
    );
  }
  
  return { volumeVariance, priceVariance, total };
}

/**
 * Revenue Variance (SaaS)
 */
export function computeRevenueVarianceSaaS(
  month: number,
  planCustomers: number,
  planARPU: number,
  actualCustomers: number,
  actualARPU: number
): { customerVariance: number; arpuVariance: number; total: number } {
  const planRevenue = planCustomers * planARPU;
  const actualRevenue = actualCustomers * actualARPU;
  
  // Customer variance (holding ARPU at plan)
  const customerVariance = (actualCustomers - planCustomers) * planARPU;
  
  // ARPU variance (holding customers at actual)
  const arpuVariance = actualCustomers * (actualARPU - planARPU);
  
  const total = customerVariance + arpuVariance;
  const expectedVariance = actualRevenue - planRevenue;
  
  // INVARIANT: Bridge must reconcile
  const tolerance = 0.01;
  if (Math.abs(total - expectedVariance) > tolerance) {
    throw new Error(
      `Revenue variance bridge does not reconcile in month ${month}: Bridge = $${total.toFixed(2)}, Expected = $${expectedVariance.toFixed(2)}`
    );
  }
  
  return { customerVariance, arpuVariance, total };
}

/**
 * Headcount Cost Variance
 */
export function computeHeadcountVariance(
  month: number,
  planHeadcount: number,
  planCostPerHead: number,
  actualHeadcount: number,
  actualCostPerHead?: number
): { headcountVariance: number; rateVariance?: number; total: number } {
  const planCost = planHeadcount * planCostPerHead;
  const actualCost = actualHeadcount * (actualCostPerHead || planCostPerHead);
  
  // Headcount variance = (HC_actual - HC_plan) * cost_plan
  const headcountVariance = (actualHeadcount - planHeadcount) * planCostPerHead;
  
  // Rate variance = HC_actual * (cost_actual - cost_plan) (if actual cost provided)
  let rateVariance: number | undefined;
  if (actualCostPerHead !== undefined) {
    rateVariance = actualHeadcount * (actualCostPerHead - planCostPerHead);
  }
  
  const total = headcountVariance + (rateVariance || 0);
  const expectedVariance = actualCost - planCost;
  
  // INVARIANT: Bridge must reconcile
  const tolerance = 0.01;
  if (Math.abs(total - expectedVariance) > tolerance) {
    throw new Error(
      `Headcount variance bridge does not reconcile in month ${month}: Bridge = $${total.toFixed(2)}, Expected = $${expectedVariance.toFixed(2)}`
    );
  }
  
  return { headcountVariance, rateVariance, total };
}

/**
 * Compute All Variances
 */
export interface VarianceOutput {
  revenue: VarianceBridge[];
  cogs: VarianceBridge[];
  opex: VarianceBridge[];
  headcount: VarianceBridge[];
  allReconcile: boolean;
}

export function computeVariances(
  input: OperatingModelInput,
  output: OperatingOutput
): VarianceOutput | null {
  // If no actuals, return null
  if (!input.actuals) {
    return null;
  }
  
  const actuals = input.actuals;
  const months = input.months;
  
  // Check if any actuals exist
  const hasRevenueActuals = actuals.revenue && actuals.revenue.length > 0;
  const hasCogsActuals = actuals.cogs && actuals.cogs.length > 0;
  const hasOpexActuals = actuals.opex && actuals.opex.length > 0;
  const hasHeadcountActuals = actuals.headcount && actuals.headcount.length > 0;
  
  if (!hasRevenueActuals && !hasCogsActuals && !hasOpexActuals && !hasHeadcountActuals) {
    return null;
  }
  
  // Validate actuals length
  if (hasRevenueActuals && actuals.revenue!.length !== months) {
    throw new Error(`Revenue actuals length (${actuals.revenue!.length}) must match months (${months})`);
  }
  if (hasCogsActuals && actuals.cogs!.length !== months) {
    throw new Error(`COGS actuals length (${actuals.cogs!.length}) must match months (${months})`);
  }
  if (hasOpexActuals && actuals.opex!.length !== months) {
    throw new Error(`Opex actuals length (${actuals.opex!.length}) must match months (${months})`);
  }
  if (hasHeadcountActuals && actuals.headcount!.length !== months) {
    throw new Error(`Headcount actuals length (${actuals.headcount!.length}) must match months (${months})`);
  }
  
  const revenueVariances: VarianceBridge[] = [];
  const cogsVariances: VarianceBridge[] = [];
  const opexVariances: VarianceBridge[] = [];
  const headcountVariances: VarianceBridge[] = [];
  
  // Compute variances month by month
  for (let month = 0; month < months; month++) {
    const monthly = output.monthly[month];
    
    // Revenue variance
    if (hasRevenueActuals && actuals.revenue![month] !== undefined) {
      const planRevenue = monthly.revenue.total;
      const actualRevenue = actuals.revenue![month];
      const variance = actualRevenue - planRevenue;
      
      let bridge: any = {};
      
      if (input.revenueModel.type === 'priceVolume') {
        const planUnits = monthly.revenue.units || 0;
        const planPrice = monthly.revenue.price || 0;
        // For actuals, we'd need actual units/price - for now, estimate from revenue
        // In production, would require actual units/price inputs
        const actualUnits = planUnits; // Placeholder - would need actual input
        const actualPrice = actualRevenue / Math.max(1, actualUnits);
        const revBridge = computeRevenueVariancePriceVolume(month + 1, planUnits, planPrice, actualUnits, actualPrice);
        bridge = { volumeVariance: revBridge.volumeVariance, priceVariance: revBridge.priceVariance, total: revBridge.total };
      } else if (input.revenueModel.type === 'saas') {
        const planCustomers = monthly.revenue.customers || 0;
        const planARPU = monthly.revenue.arpu || 0;
        // For actuals, we'd need actual customers/ARPU - for now, estimate
        const actualCustomers = planCustomers; // Placeholder
        const actualARPU = actualRevenue / Math.max(1, actualCustomers);
        const revBridge = computeRevenueVarianceSaaS(month + 1, planCustomers, planARPU, actualCustomers, actualARPU);
        bridge = { customerVariance: revBridge.customerVariance, arpuVariance: revBridge.arpuVariance, total: revBridge.total };
      } else {
        // Manual - no bridge, just total variance
        bridge = { total: variance };
      }
      
      revenueVariances.push({
        month: month + 1,
        monthLabel: monthly.monthLabel,
        plan: planRevenue,
        actual: actualRevenue,
        variance,
        variancePct: planRevenue > 0 ? (variance / planRevenue) : null,
        bridge,
        reconciles: Math.abs(bridge.total - variance) < 0.01,
      });
    }
    
    // COGS variance
    if (hasCogsActuals && actuals.cogs![month] !== undefined) {
      const planCogs = monthly.cogs;
      const actualCogs = actuals.cogs![month];
      const variance = actualCogs - planCogs;
      
      cogsVariances.push({
        month: month + 1,
        monthLabel: monthly.monthLabel,
        plan: planCogs,
        actual: actualCogs,
        variance,
        variancePct: planCogs > 0 ? (variance / planCogs) : null,
        bridge: { total: variance }, // Simple variance, no bridge
        reconciles: true,
      });
    }
    
    // Opex variance
    if (hasOpexActuals && actuals.opex![month] !== undefined) {
      const planOpex = monthly.totalOpex;
      const actualOpex = actuals.opex![month];
      const variance = actualOpex - planOpex;
      
      opexVariances.push({
        month: month + 1,
        monthLabel: monthly.monthLabel,
        plan: planOpex,
        actual: actualOpex,
        variance,
        variancePct: planOpex > 0 ? (variance / planOpex) : null,
        bridge: { total: variance }, // Simple variance, no bridge
        reconciles: true,
      });
    }
    
    // Headcount variance
    if (hasHeadcountActuals && actuals.headcount![month] !== undefined) {
      const planHeadcount = monthly.headcount;
      const planCostPerHead = input.opexModel.fullyLoadedCostPerHead;
      const actualHeadcount = actuals.headcount![month];
      
      const headcountBridge = computeHeadcountVariance(
        month + 1,
        planHeadcount,
        planCostPerHead,
        actualHeadcount
      );
      
      const planCost = planHeadcount * planCostPerHead;
      const actualCost = actualHeadcount * planCostPerHead; // Using plan cost if actual not provided
      const variance = actualCost - planCost;
      
      headcountVariances.push({
        month: month + 1,
        monthLabel: monthly.monthLabel,
        plan: planCost,
        actual: actualCost,
        variance,
        variancePct: planCost > 0 ? (variance / planCost) : null,
        bridge: {
          headcountVariance: headcountBridge.headcountVariance,
          rateVariance: headcountBridge.rateVariance,
          total: headcountBridge.total,
        },
        reconciles: headcountBridge.total === variance,
      });
    }
  }
  
  // Check all reconcile
  const allReconcile = [
    ...revenueVariances,
    ...cogsVariances,
    ...opexVariances,
    ...headcountVariances,
  ].every(v => v.reconciles);
  
  if (!allReconcile) {
    throw new Error('One or more variance bridges do not reconcile');
  }
  
  return {
    revenue: revenueVariances,
    cogs: cogsVariances,
    opex: opexVariances,
    headcount: headcountVariances,
    allReconcile,
  };
}

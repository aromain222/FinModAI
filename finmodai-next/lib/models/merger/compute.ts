/**
 * Merger Model Core Computation
 * 
 * Deterministic math - no LLM, no guessing.
 * All calculations must tie out.
 * Hard invariants - fail loudly if violated.
 */

import type { MergerModelInput } from './schema';
import { buildMaDealInputs } from './buildMaDealInputs';
import { computeMaOutputsSafe } from './maOutputs';
import type { MaDealInputs, SelectedMaCompany } from './maDealInputs';
import type { LTMFinancials } from '@/lib/getLTMFinancials';

/**
 * Company Financial Data (pulled from APIs)
 */
export interface CompanyFinancials {
  name?: string;
  ticker: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  ebit: number;
  da: number;
  interestExpense: number;
  netIncome: number;
  sharesOutstanding: number;
  cash: number;
  debt: number;
  price: number;
  taxRate?: number;
}

/**
 * Synergy Schedule Helper
 */
function getSynergyValue(
  schedule: { runRate?: number; rampYears?: number; year1?: number; year2?: number; year3?: number; year4?: number; year5?: number } | undefined,
  year: number
): number {
  if (!schedule) return 0;
  
  // Year-by-year takes precedence
  if (year === 1 && schedule.year1 !== undefined) return schedule.year1;
  if (year === 2 && schedule.year2 !== undefined) return schedule.year2;
  if (year === 3 && schedule.year3 !== undefined) return schedule.year3;
  if (year === 4 && schedule.year4 !== undefined) return schedule.year4;
  if (year === 5 && schedule.year5 !== undefined) return schedule.year5;
  
  // Use run-rate + ramp
  if (schedule.runRate !== undefined && schedule.rampYears !== undefined) {
    const rampFactor = Math.min(year / schedule.rampYears, 1);
    return schedule.runRate * rampFactor;
  }
  
  return 0;
}

/**
 * Deal Consideration Calculation
 */
export interface DealConsideration {
  offerPrice: number;
  equityValue: number;
  netDebt: number;
  enterpriseValue: number;
  stockConsideration: number;
  cashConsideration: number;
  newShares: number;
}

export function computeDealConsideration(
  input: MergerModelInput,
  targetFinancials: CompanyFinancials,
  buyerFinancials: CompanyFinancials
): DealConsideration {
  // INVARIANT 1: Offer mechanics
  let offerPrice = input.offerPrice;
  if (!offerPrice && input.premiumPct !== undefined) {
    // Need unaffected target price
    const unaffectedTargetPrice = input.targetUnaffectedPriceOverride || targetFinancials.price;
    if (!unaffectedTargetPrice || unaffectedTargetPrice <= 0) {
      throw new Error('Cannot compute offer price: need either offerPrice, or premiumPct with target unaffected price');
    }
    offerPrice = unaffectedTargetPrice * (1 + input.premiumPct);
  }
  if (!offerPrice || offerPrice <= 0) {
    throw new Error('Cannot compute offer price: need either offerPrice or premiumPct with target price');
  }
  
  // INVARIANT 2: Consideration mechanics
  if (!targetFinancials.sharesOutstanding || targetFinancials.sharesOutstanding <= 0) {
    throw new Error('Target shares outstanding must be > 0');
  }
  
  // Equity value
  const equityValue = offerPrice * targetFinancials.sharesOutstanding;
  
  // Net debt
  const netDebt = (targetFinancials.debt || 0) - (targetFinancials.cash || 0);
  
  // Enterprise value
  const enterpriseValue = equityValue + netDebt;
  
  // Stock consideration
  let stockConsideration = 0;
  let newShares = 0;
  
  if (input.dealStructure === 'stock' || input.dealStructure === 'mixed') {
    // Need buyer price
    const buyerPrice = input.buyerPriceOverride || buyerFinancials.price;
    if (!buyerPrice || buyerPrice <= 0) {
      throw new Error('Cannot compute stock consideration: need buyer price (pullable or override)');
    }
    
    if (input.exchangeRatio !== undefined) {
      newShares = targetFinancials.sharesOutstanding * input.exchangeRatio;
      stockConsideration = newShares * buyerPrice;
    } else if (input.stockPct !== undefined) {
      stockConsideration = equityValue * input.stockPct;
      newShares = stockConsideration / buyerPrice;
    } else {
      throw new Error('Cannot compute stock consideration: need either stockPct or exchangeRatio');
    }
  }
  
  // Cash consideration
  const cashConsideration = equityValue - stockConsideration;
  
  // INVARIANT: Cash consideration cannot be negative
  if (cashConsideration < 0) {
    throw new Error(`Invalid mix/exchange ratio: cash consideration negative ($${Math.abs(cashConsideration).toFixed(2)}M)`);
  }
  
  return {
    offerPrice,
    equityValue,
    netDebt,
    enterpriseValue,
    stockConsideration,
    cashConsideration,
    newShares,
  };
}

/**
 * Sources & Uses Reconciliation
 */
export interface SourcesUses {
  uses: {
    equityValue: number;
    feesCash: number;
    debtRefi: number;
    total: number;
  };
  sources: {
    buyerCashUsed: number;
    newDebt: number;
    stockConsideration: number;
    total: number;
  };
  reconciliation: number;
}

export function computeSourcesUses(
  dealConsideration: DealConsideration,
  input: MergerModelInput,
  buyerFinancials: CompanyFinancials
): SourcesUses {
  // INVARIANT 3: Funding mechanics - min cash constraint
  const minCash = input.minCash || 0;
  const buyerCash = buyerFinancials.cash || 0;
  const maxCashUsable = Math.max(0, buyerCash - minCash);
  
  const buyerCashUsed = input.buyerCashUsed || 0;
  if (buyerCashUsed > maxCashUsable) {
    throw new Error(
      `Buyer cash used ($${buyerCashUsed.toFixed(2)}M) violates min cash constraint. Max usable: $${maxCashUsable.toFixed(2)}M (buyer cash $${buyerCash.toFixed(2)}M - min cash $${minCash.toFixed(2)}M)`
    );
  }
  
  // Fees
  const feesCash = input.feesTotal !== undefined 
    ? input.feesTotal 
    : ((input.transactionFees || 0) + (input.financingFees || 0));
  
  const debtRefi = input.debtRefi || 0;
  
  const uses = {
    equityValue: dealConsideration.equityValue,
    feesCash,
    debtRefi,
    total: dealConsideration.equityValue + feesCash + debtRefi,
  };
  
  const sources = {
    buyerCashUsed,
    newDebt: input.newDebt || 0,
    stockConsideration: dealConsideration.stockConsideration,
    total: buyerCashUsed + (input.newDebt || 0) + dealConsideration.stockConsideration,
  };
  
  // INVARIANT 4: Funding must cover cash uses
  const cashNeeded = dealConsideration.cashConsideration + feesCash + debtRefi;
  const cashAvailable = buyerCashUsed + (input.newDebt || 0);
  
  if (cashNeeded > cashAvailable) {
    throw new Error(
      `Insufficient funding for cash uses. Needed: $${cashNeeded.toFixed(2)}M (cash consideration $${dealConsideration.cashConsideration.toFixed(2)}M + fees $${feesCash.toFixed(2)}M + debt refi $${debtRefi.toFixed(2)}M), Available: $${cashAvailable.toFixed(2)}M`
    );
  }
  
  // INVARIANT 5: Sources & Uses must balance
  const reconciliation = sources.total - uses.total;
  
  if (Math.abs(reconciliation) > 1) {
    throw new Error(
      `Sources & Uses out of balance by $${Math.abs(reconciliation).toFixed(2)}M. Sources = $${sources.total.toFixed(2)}M, Uses = $${uses.total.toFixed(2)}M`
    );
  }
  
  return { uses, sources, reconciliation };
}

/**
 * Combined Income Statement (Year-by-Year)
 */
export interface CombinedIncomeStatement {
  year: number;
  revenue: {
    buyer: number;
    target: number;
    revenueSynergy: number;
    total: number;
  };
  cogs: {
    buyer: number;
    target: number;
    synergyCOGS: number; // From revenue synergies
    cogsSavings: number; // Cost synergies
    total: number;
  };
  grossProfit: number;
  opex: {
    buyer: number;
    target: number;
    opexSavings: number; // Cost synergies
    integrationCosts: number;
    total: number;
  };
  ebitda: number;
  da: number;
  amortization: number; // Purchase accounting
  ebit: number;
  interest: {
    buyer: number;
    target: number;
    incremental: number; // From new debt
    total: number;
  };
  ebt: number;
  taxes: number;
  netIncome: number;
}

/**
 * Forecast Base Financials (simplified - assumes flat for now)
 * TODO: Add growth assumptions
 */
function forecastBaseFinancials(
  base: CompanyFinancials,
  year: number,
  years: number
): CompanyFinancials {
  // Simplified: assume flat for now (can be enhanced with growth assumptions)
  return {
    ...base,
    revenue: base.revenue,
    cogs: base.cogs,
    grossProfit: base.grossProfit,
    opex: base.opex,
    ebitda: base.ebitda,
    ebit: base.ebit,
    interestExpense: base.interestExpense,
  };
}

export function computeCombinedIncomeStatement(
  year: number,
  input: MergerModelInput,
  buyerFinancials: CompanyFinancials,
  targetFinancials: CompanyFinancials,
  dealConsideration: DealConsideration,
  intangiblesValue: number,
  intangiblesLifeYears: number
): CombinedIncomeStatement {
  // Forecast base financials (simplified - flat for now)
  const buyer = forecastBaseFinancials(buyerFinancials, year, input.forecastYears);
  const target = forecastBaseFinancials(targetFinancials, year, input.forecastYears);
  
  // Revenue synergies
  const revenueSynergy = getSynergyValue(input.revenueSynergies, year);
  
  // INVARIANT 6: Synergy revenue requires COGS assumption
  let synergyCOGS = 0;
  if (revenueSynergy > 0) {
    if (input.synergyCOGSPct !== undefined) {
      synergyCOGS = revenueSynergy * input.synergyCOGSPct;
    } else if (input.synergyGrossMarginPct !== undefined) {
      synergyCOGS = revenueSynergy * (1 - input.synergyGrossMarginPct);
    } else {
      throw new Error(`Revenue synergies of $${revenueSynergy.toFixed(2)}M in Year ${year} require synergyCOGSPct or synergyGrossMarginPct`);
    }
  }
  
  // Cost synergies
  const cogsSavings = getSynergyValue(input.cogsSavings, year);
  const opexSavings = getSynergyValue(input.opexSavings, year);
  
  // Integration costs (from explicit array - required)
  let integrationCostsSchedule = input.integrationCosts;
  if (!integrationCostsSchedule || integrationCostsSchedule.length !== input.forecastYears) {
    console.warn('[merger] Integration costs missing or invalid; defaulting to zeros for legacy outputs', {
      forecastYears: input.forecastYears,
    });
    integrationCostsSchedule = Array(input.forecastYears).fill(0);
  }
  const integrationCosts = integrationCostsSchedule[year - 1] || 0;
  
  // Combined revenue
  const revenue = {
    buyer: buyer.revenue,
    target: target.revenue,
    revenueSynergy,
    total: buyer.revenue + target.revenue + revenueSynergy,
  };
  
  // Combined COGS
  const cogs = {
    buyer: buyer.cogs,
    target: target.cogs,
    synergyCOGS,
    cogsSavings,
    total: buyer.cogs + target.cogs + synergyCOGS - cogsSavings,
  };
  
  // Gross profit
  const grossProfit = revenue.total - cogs.total;
  
  // Combined opex
  const opex = {
    buyer: buyer.opex,
    target: target.opex,
    opexSavings,
    integrationCosts,
    total: buyer.opex + target.opex - opexSavings + integrationCosts,
  };
  
  // EBITDA
  const ebitda = grossProfit - opex.total;
  
  // Depreciation & Amortization (base)
  const da = (buyer.da || 0) + (target.da || 0);
  if (da === 0) {
    // Warn but don't fail - D&A might be missing
    console.warn(`D&A is zero for Year ${year} - consider providing override`);
  }
  
  // Purchase accounting amortization
  const amortization = intangiblesValue > 0 ? intangiblesValue / intangiblesLifeYears : 0;
  
  // EBIT
  const ebit = ebitda - da - amortization;
  
  // Interest
  const incrementalInterest = (input.newDebt || 0) * (input.newDebtRate || 0);
  const interest = {
    buyer: buyer.interestExpense || 0,
    target: target.interestExpense || 0,
    incremental: incrementalInterest,
    total: (buyer.interestExpense || 0) + (target.interestExpense || 0) + incrementalInterest,
  };
  
  // EBT
  const ebt = ebit - interest.total;
  
  // Taxes
  const taxRate = buyerFinancials.taxRate || targetFinancials.taxRate || input.taxRate || 0.25;
  if (!buyerFinancials.taxRate && !targetFinancials.taxRate && input.taxRate === undefined) {
    console.warn('[merger] Tax rate missing; defaulting to 25% for legacy outputs', { year });
  }
  const taxes = ebt * taxRate;
  
  // Net Income
  const netIncome = ebt - taxes;
  
  return {
    year,
    revenue,
    cogs,
    grossProfit,
    opex,
    ebitda,
    da,
    amortization,
    ebit,
    interest,
    ebt,
    taxes,
    netIncome,
  };
}

/**
 * EPS & Accretion/Dilution
 */
export interface EPSAnalysis {
  buyerEPS: number;
  proFormaEPS: number;
  accretionDilutionPct: number;
  isAccretive: boolean;
  shares: {
    buyer: number;
    newShares: number;
    proForma: number;
  };
  bridge: {
    buyerNI: number;
    targetNI: number;
    revenueSynergyAfterTax: number;
    costSynergyAfterTax: number;
    integrationAfterTax: number;
    amortizationAfterTax: number;
    interestAfterTax: number;
    total: number;
  };
}

export function computeEPSAnalysis(
  year: number,
  combinedIS: CombinedIncomeStatement,
  buyerFinancials: CompanyFinancials,
  targetFinancials: CompanyFinancials,
  newShares: number,
  input: MergerModelInput
): EPSAnalysis {
  // INVARIANT 7: Buyer EPS must be valid
  if (!buyerFinancials.sharesOutstanding || buyerFinancials.sharesOutstanding <= 0) {
    throw new Error('Buyer shares outstanding must be > 0');
  }
  
  const buyerEPS = buyerFinancials.netIncome / buyerFinancials.sharesOutstanding;
  if (!isFinite(buyerEPS) || buyerEPS === 0) {
    throw new Error(`Buyer EPS is invalid: ${buyerEPS} (NI: $${buyerFinancials.netIncome.toFixed(2)}M, Shares: ${buyerFinancials.sharesOutstanding.toFixed(2)}M)`);
  }
  
  // Pro forma EPS
  const proFormaShares = buyerFinancials.sharesOutstanding + newShares;
  if (proFormaShares <= 0) {
    throw new Error(`Pro forma shares must be > 0 (buyer: ${buyerFinancials.sharesOutstanding}, new: ${newShares})`);
  }
  
  const proFormaEPS = combinedIS.netIncome / proFormaShares;
  
  // Accretion/Dilution
  const accretionDilutionPct = (proFormaEPS / buyerEPS) - 1;
  const isAccretive = accretionDilutionPct > 0;
  
  // Tax rate
  const taxRate = buyerFinancials.taxRate || targetFinancials.taxRate || input.taxRate || 0.25;
  if (!buyerFinancials.taxRate && !targetFinancials.taxRate && input.taxRate === undefined) {
    console.warn('[merger] Tax rate missing; defaulting to 25% for legacy outputs', { year });
  }
  
  // INVARIANT 8: EPS Bridge must tie to Pro Forma NI
  // Revenue synergies net of associated COGS, after tax
  const revenueSynergyAfterTax = (combinedIS.revenue.revenueSynergy - combinedIS.cogs.synergyCOGS) * (1 - taxRate);
  
  // Cost synergies after tax
  const costSynergyAfterTax = (combinedIS.cogs.cogsSavings + combinedIS.opex.opexSavings) * (1 - taxRate);
  
  // Integration costs after tax (negative)
  const integrationAfterTax = -combinedIS.opex.integrationCosts * (1 - taxRate);
  
  // Amortization after tax (negative)
  const amortizationAfterTax = -combinedIS.amortization * (1 - taxRate);
  
  // Incremental interest after tax (negative)
  const interestAfterTax = -combinedIS.interest.incremental * (1 - taxRate);
  
  // Target NI contribution (use forecasted target NI - for now use base, TODO: forecast)
  const targetNI = targetFinancials.netIncome;
  
  const bridge = {
    buyerNI: buyerFinancials.netIncome,
    targetNI,
    revenueSynergyAfterTax,
    costSynergyAfterTax,
    integrationAfterTax,
    amortizationAfterTax,
    interestAfterTax,
    total: buyerFinancials.netIncome + targetNI + 
           revenueSynergyAfterTax + costSynergyAfterTax + 
           integrationAfterTax + amortizationAfterTax + interestAfterTax,
  };
  
  // INVARIANT 8: Verify bridge ties to combined IS (HARD)
  const tolerance = 0.01; // $10K
  const bridgeTotal = bridge.buyerNI + bridge.targetNI + 
                      bridge.revenueSynergyAfterTax + bridge.costSynergyAfterTax + 
                      bridge.integrationAfterTax + bridge.amortizationAfterTax + bridge.interestAfterTax;
  const diff = Math.abs(bridgeTotal - combinedIS.netIncome);
  if (diff > tolerance) {
    throw new Error(
      `EPS bridge does not tie to Pro Forma NI by $${diff.toFixed(2)}M. Bridge = $${bridgeTotal.toFixed(2)}M, Combined IS = $${combinedIS.netIncome.toFixed(2)}M. Bridge components: Buyer NI $${bridge.buyerNI.toFixed(2)}M, Target NI $${bridge.targetNI.toFixed(2)}M, Rev Syn $${bridge.revenueSynergyAfterTax.toFixed(2)}M, Cost Syn $${bridge.costSynergyAfterTax.toFixed(2)}M, Integration $${bridge.integrationAfterTax.toFixed(2)}M, Amort $${bridge.amortizationAfterTax.toFixed(2)}M, Interest $${bridge.interestAfterTax.toFixed(2)}M`
    );
  }
  
  // Update bridge.total to match calculated value
  bridge.total = bridgeTotal;
  
  return {
    buyerEPS,
    proFormaEPS,
    accretionDilutionPct,
    isAccretive,
    shares: {
      buyer: buyerFinancials.sharesOutstanding,
      newShares,
      proForma: proFormaShares,
    },
    bridge,
  };
}

/**
 * Main Computation Output
 */
export interface MergerModelOutput {
  maInputs?: MaDealInputs;
  maV1?: ReturnType<typeof computeMaOutputsSafe>;
  dealConsideration: DealConsideration;
  sourcesUses: SourcesUses;
  combinedIS: CombinedIncomeStatement[];
  epsAnalysis: EPSAnalysis[];
  purchaseAccounting: {
    intangiblesValue: number;
    amortizationPerYear: number;
  } | null;
  checks: {
    sourcesUsesBalanced: boolean;
    epsBridgeTies: boolean;
    allInvariantsPassed: boolean;
  };
}

export function computeMergerModel(
  input: MergerModelInput,
  buyerFinancials: CompanyFinancials,
  targetFinancials: CompanyFinancials
): MergerModelOutput {
  let maV1: ReturnType<typeof computeMaOutputsSafe> | undefined;
  let maDealInputs: MaDealInputs | undefined;
  try {
    const acquirer: SelectedMaCompany = {
      name: buyerFinancials.name ?? '',
      ticker: buyerFinancials.ticker,
      sharePrice: buyerFinancials.price,
      sharesOutstanding: buyerFinancials.sharesOutstanding,
      netIncome: buyerFinancials.netIncome,
    };
    const target: SelectedMaCompany = {
      name: targetFinancials.name ?? '',
      ticker: targetFinancials.ticker,
      sharePrice: targetFinancials.price,
      sharesOutstanding: targetFinancials.sharesOutstanding,
      netIncome: targetFinancials.netIncome,
    };
    maDealInputs = buildMaDealInputs(acquirer, target, {
      dealStructure: input.dealStructure,
      premiumPct: input.premiumPct,
      stockPct: input.stockPct,
      feesTotal: input.feesTotal,
      revenueSynergies: input.revenueSynergies,
      cogsSavings: input.cogsSavings,
      opexSavings: input.opexSavings,
    });
    maV1 = computeMaOutputsSafe(maDealInputs);
  } catch (error: any) {
    maV1 = computeMaOutputsSafe(null, error?.message || 'Missing M&A inputs');
  }

  // Deal consideration
  const dealConsideration = computeDealConsideration(input, targetFinancials, buyerFinancials);
  
  // Sources & Uses
  const sourcesUses = computeSourcesUses(dealConsideration, input, buyerFinancials);
  
  // Purchase accounting
  let purchaseAccounting: { intangiblesValue: number; amortizationPerYear: number } | null = null;
  let intangiblesValue = 0;
  let intangiblesLifeYears = 1;
  
  if (input.purchaseAccountingEnabled && input.intangiblesPct !== undefined && input.intangiblesLifeYears !== undefined) {
    intangiblesValue = dealConsideration.equityValue * input.intangiblesPct;
    intangiblesLifeYears = input.intangiblesLifeYears;
    purchaseAccounting = {
      intangiblesValue,
      amortizationPerYear: intangiblesValue / intangiblesLifeYears,
    };
  }
  
  // Combined Income Statement (year-by-year)
  const combinedIS: CombinedIncomeStatement[] = [];
  for (let year = 1; year <= input.forecastYears; year++) {
    combinedIS.push(
      computeCombinedIncomeStatement(
        year,
        input,
        buyerFinancials,
        targetFinancials,
        dealConsideration,
        intangiblesValue,
        intangiblesLifeYears
      )
    );
  }
  
  // EPS Analysis (year-by-year)
  const epsAnalysis: EPSAnalysis[] = [];
  for (let year = 1; year <= input.forecastYears; year++) {
    epsAnalysis.push(
      computeEPSAnalysis(
        year,
        combinedIS[year - 1],
        buyerFinancials,
        targetFinancials,
        dealConsideration.newShares,
        input
      )
    );
  }
  
  // Validation checks
  const checks = {
    sourcesUsesBalanced: Math.abs(sourcesUses.reconciliation) <= 1,
    epsBridgeTies: epsAnalysis.every(eps => Math.abs(eps.bridge.total - combinedIS[eps.year - 1].netIncome) <= 0.01),
    allInvariantsPassed: true, // If we got here, all invariants passed
  };
  
  return {
    maInputs: maDealInputs,
    maV1,
    dealConsideration,
    sourcesUses,
    combinedIS,
    epsAnalysis,
    purchaseAccounting,
    checks,
  };
}

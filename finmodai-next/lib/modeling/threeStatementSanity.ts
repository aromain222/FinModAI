/**
 * Three-Statement Model Identity Checks and Repair Logic
 * 
 * Enforces hard accounting constraints and attempts deterministic repairs.
 */

import type { ThreeStatementModel } from '@/lib/threeStatementGenerator';

export type IdentityCheckResult = {
  passed: boolean;
  issues: Array<{
    constraint: string;
    period: number;
    expected: number;
    actual: number;
    difference: number;
  }>;
  warnings: string[];
};

export type RepairResult = {
  repaired: boolean;
  model: ThreeStatementModel;
  repairs: string[];
  warnings: string[];
};

const TOLERANCE = 0.01; // 1 cent tolerance for rounding errors
const TOLERANCE_PCT = 0.001; // 0.1% tolerance for percentage-based checks

/**
 * Check all accounting identities
 */
export function checkThreeStatementIdentities(model: ThreeStatementModel): IdentityCheckResult {
  const issues: IdentityCheckResult['issues'] = [];
  const warnings: string[] = [];

  for (let i = 0; i < model.years.length; i++) {
    const year = model.years[i];

    // 1) EBT = EBIT - InterestExpense
    const ebit = model.incomeStatement.ebit[i];
    const interestExpense = model.incomeStatement.interestExpense[i];
    const ebt = model.incomeStatement.ebt[i];
    const expectedEBT = ebit - interestExpense;
    const ebtDiff = Math.abs(ebt - expectedEBT);
    if (ebtDiff > TOLERANCE) {
      issues.push({
        constraint: 'EBT = EBIT - InterestExpense',
        period: i,
        expected: expectedEBT,
        actual: ebt,
        difference: ebtDiff,
      });
    }

    // 2) NetIncome = EBT - Taxes
    const taxes = model.incomeStatement.taxes[i];
    const netIncome = model.incomeStatement.netIncome[i];
    const expectedNetIncome = ebt - taxes;
    const niDiff = Math.abs(netIncome - expectedNetIncome);
    if (niDiff > TOLERANCE) {
      issues.push({
        constraint: 'NetIncome = EBT - Taxes',
        period: i,
        expected: expectedNetIncome,
        actual: netIncome,
        difference: niDiff,
      });
    }

    // 3) Taxes must be 0 if EBT < 0 (unless explicitly modeling tax benefit/NOL usage)
    if (ebt < 0 && taxes > TOLERANCE) {
      issues.push({
        constraint: 'Taxes must be 0 if EBT < 0',
        period: i,
        expected: 0,
        actual: taxes,
        difference: taxes,
      });
    }

    // 4) Taxes must be >= 0 if EBT > 0
    if (ebt > 0 && taxes < -TOLERANCE) {
      issues.push({
        constraint: 'Taxes must be >= 0 if EBT > 0',
        period: i,
        expected: Math.max(0, ebt * 0.21), // Assume 21% tax rate
        actual: taxes,
        difference: Math.abs(taxes),
      });
    }

    // 5) InterestExpense must be derived from debt (check if reasonable)
    // This is checked in the repair logic, not here

    // 6) Debt roll-forward: EndDebt[t] = BeginDebt[t] + Issuance[t] - Repayment[t]
    // Note: We don't have issuance/repayment in the model, so we check consistency
    if (i > 0) {
      const prevDebt = model.balanceSheet.longTermDebt[i - 1];
      const currDebt = model.balanceSheet.longTermDebt[i];
      const debtChange = currDebt - prevDebt;
      // Check if debt change is reasonable (should match CFF debt component)
      // This is a soft check - we'll validate in repair
    }

    // 7) Cash roll-forward: EndCash[t] = BeginCash[t] + CFO[t] + CFI[t] + CFF[t]
    const beginCash = i === 0 ? model.balanceSheet.cash[0] : model.balanceSheet.cash[i - 1];
    const cfo = model.cashFlow.cfo[i];
    const cfi = model.cashFlow.cfi[i];
    const cff = model.cashFlow.cff[i];
    const netChange = model.cashFlow.netChangeInCash[i];
    const expectedNetChange = cfo + cfi + cff;
    const cashChangeDiff = Math.abs(netChange - expectedNetChange);
    if (cashChangeDiff > TOLERANCE) {
      issues.push({
        constraint: 'NetChangeInCash = CFO + CFI + CFF',
        period: i,
        expected: expectedNetChange,
        actual: netChange,
        difference: cashChangeDiff,
      });
    }

    const expectedEndCash = beginCash + netChange;
    const actualEndCash = model.balanceSheet.cash[i];
    const endCashDiff = Math.abs(actualEndCash - expectedEndCash);
    if (endCashDiff > TOLERANCE) {
      issues.push({
        constraint: 'EndCash = BeginCash + NetChangeInCash',
        period: i,
        expected: expectedEndCash,
        actual: actualEndCash,
        difference: endCashDiff,
      });
    }

    // 8) Balance sheet balances: Assets = Liabilities + Equity (within tolerance)
    const assets =
      model.balanceSheet.cash[i] +
      model.balanceSheet.accountsReceivable[i] +
      model.balanceSheet.inventory[i] +
      model.balanceSheet.ppe[i];
    const liabilities =
      model.balanceSheet.accountsPayable[i] +
      model.balanceSheet.accruedLiabilities[i] +
      model.balanceSheet.longTermDebt[i];
    const equity =
      model.balanceSheet.retainedEarnings[i] + model.balanceSheet.shareholderEquity[i];
    const totalLE = liabilities + equity;
    const bsDiff = Math.abs(assets - totalLE);
    const bsDiffPct = assets > 0 ? bsDiff / assets : bsDiff;
    if (bsDiffPct > TOLERANCE_PCT) {
      issues.push({
        constraint: 'Assets = Liabilities + Equity',
        period: i,
        expected: totalLE,
        actual: assets,
        difference: bsDiff,
      });
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Attempt one deterministic repair pass
 */
export function repairThreeStatementModel(
  model: ThreeStatementModel,
  assumptions: {
    interestRate: number;
    taxRate: number;
    debtAmortization?: number;
  }
): RepairResult {
  const repairs: string[] = [];
  const warnings: string[] = [];
  const repaired = { ...model };

  // Deep clone arrays to avoid mutating original
  const cloneArray = <T>(arr: T[]): T[] => [...arr];

  repaired.incomeStatement = {
    revenue: cloneArray(model.incomeStatement.revenue),
    cogs: cloneArray(model.incomeStatement.cogs),
    grossProfit: cloneArray(model.incomeStatement.grossProfit),
    operatingExpenses: cloneArray(model.incomeStatement.operatingExpenses),
    depreciation: cloneArray(model.incomeStatement.depreciation),
    ebit: cloneArray(model.incomeStatement.ebit),
    interestExpense: cloneArray(model.incomeStatement.interestExpense),
    ebt: cloneArray(model.incomeStatement.ebt),
    taxes: cloneArray(model.incomeStatement.taxes),
    netIncome: cloneArray(model.incomeStatement.netIncome),
  };

  repaired.balanceSheet = {
    cash: cloneArray(model.balanceSheet.cash),
    accountsReceivable: cloneArray(model.balanceSheet.accountsReceivable),
    inventory: cloneArray(model.balanceSheet.inventory),
    ppe: cloneArray(model.balanceSheet.ppe),
    accountsPayable: cloneArray(model.balanceSheet.accountsPayable),
    accruedLiabilities: cloneArray(model.balanceSheet.accruedLiabilities),
    longTermDebt: cloneArray(model.balanceSheet.longTermDebt),
    retainedEarnings: cloneArray(model.balanceSheet.retainedEarnings),
    shareholderEquity: cloneArray(model.balanceSheet.shareholderEquity),
  };

  repaired.cashFlow = {
    cfo: cloneArray(model.cashFlow.cfo),
    cfi: cloneArray(model.cashFlow.cfi),
    cff: cloneArray(model.cashFlow.cff),
    netChangeInCash: cloneArray(model.cashFlow.netChangeInCash),
  };

  // Repair pass 1: Fix interest expense from debt schedule
  for (let i = 0; i < repaired.years.length; i++) {
    const beginDebt = i === 0 ? repaired.balanceSheet.longTermDebt[0] : repaired.balanceSheet.longTermDebt[i - 1];
    const endDebt = repaired.balanceSheet.longTermDebt[i];
    const avgDebt = (beginDebt + endDebt) / 2;
    const expectedInterest = avgDebt * assumptions.interestRate;
    const actualInterest = repaired.incomeStatement.interestExpense[i];
    
    if (Math.abs(actualInterest - expectedInterest) > TOLERANCE) {
      repaired.incomeStatement.interestExpense[i] = expectedInterest;
      repairs.push(`Period ${i}: Recalculated interest expense from debt schedule (${expectedInterest.toFixed(2)})`);
    }
  }

  // Repair pass 2: Recompute EBT from EBIT - InterestExpense
  for (let i = 0; i < repaired.years.length; i++) {
    const ebit = repaired.incomeStatement.ebit[i];
    const interestExpense = repaired.incomeStatement.interestExpense[i];
    const expectedEBT = ebit - interestExpense;
    const actualEBT = repaired.incomeStatement.ebt[i];
    
    if (Math.abs(actualEBT - expectedEBT) > TOLERANCE) {
      repaired.incomeStatement.ebt[i] = expectedEBT;
      repairs.push(`Period ${i}: Recalculated EBT = EBIT - InterestExpense (${expectedEBT.toFixed(2)})`);
    }
  }

  // Repair pass 3: Recompute taxes from EBT and taxRate
  for (let i = 0; i < repaired.years.length; i++) {
    const ebt = repaired.incomeStatement.ebt[i];
    let expectedTaxes: number;
    
    if (ebt < 0) {
      // No taxes on losses (unless explicitly modeling NOL usage - not implemented)
      expectedTaxes = 0;
    } else {
      expectedTaxes = ebt * assumptions.taxRate;
    }
    
    const actualTaxes = repaired.incomeStatement.taxes[i];
    
    if (Math.abs(actualTaxes - expectedTaxes) > TOLERANCE) {
      repaired.incomeStatement.taxes[i] = expectedTaxes;
      repairs.push(`Period ${i}: Recalculated taxes from EBT (${expectedTaxes.toFixed(2)})`);
    }
  }

  // Repair pass 4: Recompute NetIncome from EBT - Taxes
  for (let i = 0; i < repaired.years.length; i++) {
    const ebt = repaired.incomeStatement.ebt[i];
    const taxes = repaired.incomeStatement.taxes[i];
    const expectedNetIncome = ebt - taxes;
    const actualNetIncome = repaired.incomeStatement.netIncome[i];
    
    if (Math.abs(actualNetIncome - expectedNetIncome) > TOLERANCE) {
      repaired.incomeStatement.netIncome[i] = expectedNetIncome;
      repairs.push(`Period ${i}: Recalculated NetIncome = EBT - Taxes (${expectedNetIncome.toFixed(2)})`);
    }
  }

  // Repair pass 5: Recompute cash roll-forward
  for (let i = 0; i < repaired.years.length; i++) {
    const beginCash = i === 0 ? repaired.balanceSheet.cash[0] : repaired.balanceSheet.cash[i - 1];
    const cfo = repaired.cashFlow.cfo[i];
    const cfi = repaired.cashFlow.cfi[i];
    const cff = repaired.cashFlow.cff[i];
    const expectedNetChange = cfo + cfi + cff;
    const actualNetChange = repaired.cashFlow.netChangeInCash[i];
    
    if (Math.abs(actualNetChange - expectedNetChange) > TOLERANCE) {
      repaired.cashFlow.netChangeInCash[i] = expectedNetChange;
      repairs.push(`Period ${i}: Recalculated NetChangeInCash = CFO + CFI + CFF (${expectedNetChange.toFixed(2)})`);
    }
    
    const expectedEndCash = beginCash + expectedNetChange;
    const actualEndCash = repaired.balanceSheet.cash[i];
    
    if (Math.abs(actualEndCash - expectedEndCash) > TOLERANCE) {
      repaired.balanceSheet.cash[i] = Math.max(0, expectedEndCash); // Cash can't go negative
      repairs.push(`Period ${i}: Recalculated EndCash = BeginCash + NetChangeInCash (${expectedEndCash.toFixed(2)})`);
    }
  }

  // Repair pass 6: Recompute retained earnings from NetIncome
  for (let i = 0; i < repaired.years.length; i++) {
    const beginRetained = i === 0 ? repaired.balanceSheet.retainedEarnings[0] : repaired.balanceSheet.retainedEarnings[i - 1];
    const netIncome = repaired.incomeStatement.netIncome[i];
    // Assume no dividends for now (would need dividend assumptions)
    const expectedRetained = beginRetained + netIncome;
    const actualRetained = repaired.balanceSheet.retainedEarnings[i];
    
    if (Math.abs(actualRetained - expectedRetained) > TOLERANCE) {
      repaired.balanceSheet.retainedEarnings[i] = expectedRetained;
      repairs.push(`Period ${i}: Recalculated RetainedEarnings = BeginRetained + NetIncome (${expectedRetained.toFixed(2)})`);
    }
  }

  // Repair pass 7: Balance sheet balancing (adjust equity to balance)
  for (let i = 0; i < repaired.years.length; i++) {
    const assets =
      repaired.balanceSheet.cash[i] +
      repaired.balanceSheet.accountsReceivable[i] +
      repaired.balanceSheet.inventory[i] +
      repaired.balanceSheet.ppe[i];
    const liabilities =
      repaired.balanceSheet.accountsPayable[i] +
      repaired.balanceSheet.accruedLiabilities[i] +
      repaired.balanceSheet.longTermDebt[i];
    const retained = repaired.balanceSheet.retainedEarnings[i];
    const requiredEquity = assets - liabilities - retained;
    const actualEquity = repaired.balanceSheet.shareholderEquity[i];
    
    const equityDiff = Math.abs(requiredEquity - actualEquity);
    const equityDiffPct = Math.abs(requiredEquity) > 0 ? equityDiff / Math.abs(requiredEquity) : equityDiff;
    
    if (equityDiffPct > TOLERANCE_PCT) {
      repaired.balanceSheet.shareholderEquity[i] = Math.max(0, requiredEquity); // Equity can't go negative
      repairs.push(`Period ${i}: Adjusted ShareholderEquity to balance sheet (${requiredEquity.toFixed(2)})`);
    }
  }

  return {
    repaired: repairs.length > 0,
    model: repaired,
    repairs,
    warnings,
  };
}


/**
 * LBO Identity Checks and Repair Logic
 * 
 * Enforces hard accounting constraints for LBO models.
 */

import { safeNumber } from '@/lib/utils/safeNumber';

export interface LBOIdentityIssues {
  ebtIssues: Array<{ period: number; expected: number; actual: number }>;
  netIncomeIssues: Array<{ period: number; expected: number; actual: number }>;
  taxIssues: Array<{ period: number; ebt: number; taxes: number }>;
  interestIssues: Array<{ period: number; expected: number; actual: number }>;
  cashRollForwardIssues: Array<{ period: number; expected: number; actual: number }>;
  debtRollForwardIssues: Array<{ period: number; expected: number; actual: number }>;
}

const TOLERANCE = 0.01; // 1 cent tolerance

/**
 * Check LBO identities
 */
export function checkLBOIdentities(params: {
  ebit: number[];
  interestExpense: number[];
  ebt: number[];
  taxes: number[];
  netIncome: number[];
  cashFlow: number[];
  cashBalances: number[];
  openingDebt: number[];
  endingDebt: number[];
  debtPaydown: number[];
}): { passed: boolean; issues: LBOIdentityIssues } {
  const issues: LBOIdentityIssues = {
    ebtIssues: [],
    netIncomeIssues: [],
    taxIssues: [],
    interestIssues: [],
    cashRollForwardIssues: [],
    debtRollForwardIssues: [],
  };

  for (let i = 0; i < params.ebit.length; i++) {
    // EBT = EBIT - Interest
    const expectedEBT = safeNumber(params.ebit[i]) - safeNumber(params.interestExpense[i]);
    const actualEBT = safeNumber(params.ebt[i]);
    if (Math.abs(expectedEBT - actualEBT) > TOLERANCE) {
      issues.ebtIssues.push({ period: i, expected: expectedEBT, actual: actualEBT });
    }

    // NetIncome = EBT - Taxes
    const expectedNetIncome = safeNumber(params.ebt[i]) - safeNumber(params.taxes[i]);
    const actualNetIncome = safeNumber(params.netIncome[i]);
    if (Math.abs(expectedNetIncome - actualNetIncome) > TOLERANCE) {
      issues.netIncomeIssues.push({ period: i, expected: expectedNetIncome, actual: actualNetIncome });
    }

    // Taxes = 0 if EBT < 0
    const ebt = safeNumber(params.ebt[i]);
    const taxes = safeNumber(params.taxes[i]);
    if (ebt < 0 && taxes > TOLERANCE) {
      issues.taxIssues.push({ period: i, ebt, taxes });
    }

    // Cash roll-forward
    if (i > 0) {
      const expectedCash = safeNumber(params.cashBalances[i - 1]) + safeNumber(params.cashFlow[i]);
      const actualCash = safeNumber(params.cashBalances[i]);
      if (Math.abs(expectedCash - actualCash) > TOLERANCE) {
        issues.cashRollForwardIssues.push({ period: i, expected: expectedCash, actual: actualCash });
      }
    }

    // Debt roll-forward
    if (i > 0) {
      const expectedDebt = safeNumber(params.openingDebt[i]) - safeNumber(params.debtPaydown[i]);
      const actualDebt = safeNumber(params.endingDebt[i]);
      if (Math.abs(expectedDebt - actualDebt) > TOLERANCE) {
        issues.debtRollForwardIssues.push({ period: i, expected: expectedDebt, actual: actualDebt });
      }
    }
  }

  const hasIssues =
    issues.ebtIssues.length > 0 ||
    issues.netIncomeIssues.length > 0 ||
    issues.taxIssues.length > 0 ||
    issues.interestIssues.length > 0 ||
    issues.cashRollForwardIssues.length > 0 ||
    issues.debtRollForwardIssues.length > 0;

  return {
    passed: !hasIssues,
    issues,
  };
}


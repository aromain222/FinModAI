/**
 * Shared Precision Calculations using decimal.js
 * 
 * Critical financial calculations that require high precision:
 * - IRR (Internal Rate of Return)
 * - MOIC (Multiple on Invested Capital)
 * - Debt roll-forward
 * - Interest expense
 * 
 * This is the SINGLE SOURCE OF TRUTH for precision calculations across all models.
 * 
 * Usage:
 *   const irr = calculateIRR(initialInvestment, exitValue, years);
 *   const moic = calculateMOIC(exitValue, initialInvestment);
 *   const moicAlt = moic(exitValue, initialInvestment); // Alias for consistency
 *   const debtEnd = rollForwardDebt(startDebt, interestRate, payment);
 */

import Decimal from 'decimal.js';

// Configure Decimal.js for financial precision
Decimal.set({ 
  precision: 28,  // High precision for financial calculations
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

/**
 * Calculate IRR (Internal Rate of Return) from cash flows
 * 
 * @param cashFlows - Array of cash flows, first is negative (investment), last is positive (exit)
 * @returns IRR as decimal (e.g., 0.25 = 25%)
 */
export function irr(cashFlows: number[]): number {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) {
    return 0;
  }
  
  if (cashFlows[0] >= 0) {
    return 0; // Invalid: first cash flow should be negative
  }
  
  if (cashFlows[cashFlows.length - 1] <= 0) {
    return 0; // Invalid: last cash flow should be positive
  }
  
  try {
    const initialInvestment = new Decimal(cashFlows[0]).neg(); // Make positive
    const exitValue = new Decimal(cashFlows[cashFlows.length - 1]);
    const years = cashFlows.length - 1;
    
    // Simple IRR: (exitValue / initialInvestment) ^ (1/years) - 1
    const ratio = exitValue.div(initialInvestment);
    if (ratio.lte(0)) {
      return 0;
    }
    
    const irrDecimal = ratio.pow(new Decimal(1).div(years)).minus(1);
    const irrNum = irrDecimal.toNumber();
    
    // Clamp to reasonable range
    if (!Number.isFinite(irrNum) || irrNum < -0.99 || irrNum > 10) {
      return Math.max(-0.99, Math.min(10, irrNum));
    }
    
    return irrNum;
  } catch (error) {
    console.warn('[precision] IRR calculation failed:', error);
    // Fallback to simple calculation
    const initial = Math.abs(cashFlows[0]);
    const exit = cashFlows[cashFlows.length - 1];
    const years = cashFlows.length - 1;
    return Math.pow(exit / initial, 1/years) - 1;
  }
}

/**
 * Calculate IRR (Internal Rate of Return) from entry/exit values
 * Simplified wrapper for LBO/Merger use cases
 * 
 * @param initialInvestment - Initial cash outflow (negative)
 * @param exitValue - Final cash inflow (positive)
 * @param years - Holding period in years
 * @returns IRR as decimal (e.g., 0.25 = 25%)
 */
export function calculateIRR(
  initialInvestment: number,
  exitValue: number,
  years: number
): number {
  if (!Number.isFinite(initialInvestment) || !Number.isFinite(exitValue) || !Number.isFinite(years)) {
    return 0;
  }
  
  if (initialInvestment >= 0 || exitValue <= 0 || years <= 0 || years > 50) {
    return 0;
  }
  
  // Build cash flow array: negative investment, zeros for intermediate years, positive exit
  const cashFlows = [initialInvestment, ...Array(years - 1).fill(0), exitValue];
  return irr(cashFlows);
}

/**
 * Calculate MOIC (Multiple on Invested Capital)
 * 
 * @param exitEquity - Final equity value
 * @param entryEquity - Initial equity investment
 * @returns MOIC as number (e.g., 2.5 = 2.5x)
 */
export function moic(exitEquity: number, entryEquity: number): number {
  if (!Number.isFinite(exitEquity) || !Number.isFinite(entryEquity)) {
    return 0;
  }
  
  if (entryEquity <= 0) {
    return 0;
  }
  
  try {
    const exit = new Decimal(exitEquity);
    const entry = new Decimal(entryEquity);
    
    return exit.div(entry).toNumber();
  } catch (error) {
    console.warn('[precision] MOIC calculation failed:', error);
    return exitEquity / entryEquity;
  }
}

/**
 * Calculate MOIC (Multiple on Invested Capital) - Alias for consistency
 * 
 * @param exitValue - Final equity value
 * @param initialInvestment - Initial equity investment
 * @returns MOIC as number (e.g., 2.5 = 2.5x)
 */
export function calculateMOIC(
  exitValue: number,
  initialInvestment: number
): number {
  return moic(exitValue, initialInvestment);
}

/**
 * Roll forward debt with interest and payment
 * 
 * @param startDebt - Beginning debt balance
 * @param interestRate - Annual interest rate (as decimal, e.g., 0.08 = 8%)
 * @param payment - Principal payment (positive = paydown)
 * @returns Ending debt balance
 */
export function rollForwardDebt(
  startDebt: number,
  interestRate: number,
  payment: number = 0
): number {
  if (!Number.isFinite(startDebt) || !Number.isFinite(interestRate)) {
    return startDebt || 0;
  }
  
  try {
    const debt = new Decimal(startDebt);
    const rate = new Decimal(interestRate);
    const pay = new Decimal(payment || 0);
    
    // EndDebt = StartDebt * (1 + InterestRate) - Payment
    // For simplicity, assuming interest accrues annually
    const interestAccrued = debt.mul(rate);
    const endDebt = debt.plus(interestAccrued).minus(pay);
    
    // Debt cannot go negative
    return Math.max(0, endDebt.toNumber());
  } catch (error) {
    console.warn('[precision] Debt roll-forward failed:', error);
    // Fallback to simple calculation
    const endDebt = startDebt * (1 + interestRate) - (payment || 0);
    return Math.max(0, endDebt);
  }
}

/**
 * Calculate interest expense for a period
 * 
 * @param averageDebt - Average debt balance for the period
 * @param interestRate - Annual interest rate (as decimal)
 * @param periodFraction - Fraction of year (e.g., 0.25 = quarterly)
 * @returns Interest expense
 */
export function calculateInterestExpense(
  averageDebt: number,
  interestRate: number,
  periodFraction: number = 1.0
): number {
  if (!Number.isFinite(averageDebt) || !Number.isFinite(interestRate)) {
    return 0;
  }
  
  if (averageDebt <= 0) {
    return 0;
  }
  
  try {
    const debt = new Decimal(averageDebt);
    const rate = new Decimal(interestRate);
    const period = new Decimal(periodFraction);
    
    const interest = debt.mul(rate).mul(period);
    
    return Math.max(0, interest.toNumber());
  } catch (error) {
    console.warn('[precision] Interest expense calculation failed:', error);
    // Fallback to simple calculation
    return Math.max(0, averageDebt * interestRate * periodFraction);
  }
}

/**
 * Calculate debt schedule over multiple periods
 * 
 * @param startDebt - Initial debt balance
 * @param interestRate - Annual interest rate (as decimal)
 * @param payments - Array of principal payments per period
 * @param periodsPerYear - Number of periods per year (e.g., 4 = quarterly)
 * @returns Array of debt balances per period
 */
export function calculateDebtSchedule(
  startDebt: number,
  interestRate: number,
  payments: number[],
  periodsPerYear: number = 4
): number[] {
  if (!Number.isFinite(startDebt) || !Number.isFinite(interestRate)) {
    return [];
  }
  
  const schedule: number[] = [];
  let currentDebt = new Decimal(startDebt);
  const rate = new Decimal(interestRate);
  const periodRate = rate.div(periodsPerYear);
  
  for (let i = 0; i < payments.length; i++) {
    const payment = new Decimal(payments[i] || 0);
    
    // Interest accrues first
    const interestAccrued = currentDebt.mul(periodRate);
    currentDebt = currentDebt.plus(interestAccrued);
    
    // Then payment is applied
    currentDebt = currentDebt.minus(payment);
    
    // Debt cannot go negative
    if (currentDebt.lt(0)) {
      currentDebt = new Decimal(0);
    }
    
    schedule.push(currentDebt.toNumber());
  }
  
  return schedule;
}

/**
 * Safe number conversion (ensures finite, handles edge cases)
 */
export function safeDecimal(value: unknown): Decimal {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Decimal(value);
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      return new Decimal(parsed);
    }
  }
  return new Decimal(0);
}

/**
 * Convert Decimal to number (safely)
 */
export function decimalToNumber(value: Decimal, defaultValue: number = 0): number {
  try {
    const num = value.toNumber();
    return Number.isFinite(num) ? num : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Precision Calculations using decimal.js
 * 
 * Critical financial calculations that require high precision:
 * - IRR (Internal Rate of Return)
 * - MOIC (Multiple on Invested Capital)
 * - Debt roll-forward
 * - Interest expense
 * - Safe division and percentage changes
 * 
 * Usage:
 *   const irr = calculateIRR(initialInvestment, exitValue, years);
 *   const moic = calculateMOIC(exitValue, initialInvestment);
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
    throw new Error('IRR requires at least 2 cash flows');
  }
  
  if (cashFlows[0] >= 0) {
    throw new Error('First cash flow must be negative (investment)');
  }
  
  if (cashFlows[cashFlows.length - 1] <= 0) {
    throw new Error('Last cash flow must be positive (exit)');
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
 * Safe division (returns 0 if denominator is 0)
 * 
 * @param numerator - Numerator
 * @param denominator - Denominator
 * @returns Result of division, or 0 if denominator is 0
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return 0;
  }
  
  if (denominator === 0 || Math.abs(denominator) < 1e-10) {
    return 0;
  }
  
  try {
    return new Decimal(numerator).div(denominator).toNumber();
  } catch (error) {
    console.warn('[precision] Safe division failed:', error);
    return 0;
  }
}

/**
 * Calculate percentage change
 * 
 * @param newValue - New value
 * @param oldValue - Old value
 * @returns Percentage change as decimal (e.g., 0.25 = 25%)
 */
export function pctChange(newValue: number, oldValue: number): number {
  if (!Number.isFinite(newValue) || !Number.isFinite(oldValue)) {
    return 0;
  }
  
  if (oldValue === 0 || Math.abs(oldValue) < 1e-10) {
    return 0;
  }
  
  try {
    const newVal = new Decimal(newValue);
    const oldVal = new Decimal(oldValue);
    
    return newVal.minus(oldVal).div(oldVal).toNumber();
  } catch (error) {
    console.warn('[precision] Percentage change calculation failed:', error);
    return (newValue - oldValue) / oldValue;
  }
}

/**
 * Calculate IRR from entry/exit (simplified for LBO/Merger)
 * 
 * @param initialInvestment - Initial cash outflow (negative)
 * @param exitValue - Final cash inflow (positive)
 * @param years - Holding period in years
 * @returns IRR as decimal
 */
export function calculateIRR(
  initialInvestment: number,
  exitValue: number,
  years: number
): number {
  return irr([initialInvestment, ...Array(years - 1).fill(0), exitValue]);
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
    const interestAccrued = debt.mul(rate);
    const endDebt = debt.plus(interestAccrued).minus(pay);
    
    // Debt cannot go negative
    return Math.max(0, endDebt.toNumber());
  } catch (error) {
    console.warn('[precision] Debt roll-forward failed:', error);
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
    return Math.max(0, averageDebt * interestRate * periodFraction);
  }
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

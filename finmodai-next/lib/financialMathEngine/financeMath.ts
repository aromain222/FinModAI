/**
 * CapitalBase Financial Math Engine
 * Finance Math Library
 * 
 * Provides NPV, IRR, XNPV, XIRR, and discount factor calculations
 * Uses robust numerical methods with convergence checks
 */

/**
 * Calculate discount factor for a given rate and time period
 * @param rate Annual interest rate (as decimal, e.g., 0.10 for 10%)
 * @param years Time period in years
 * @param dayCountBasis Day count basis ('ACTUAL_365' or 'ACTUAL_360')
 * @returns Discount factor
 */
export function discountFactor(
  rate: number,
  years: number,
  dayCountBasis: 'ACTUAL_365' | 'ACTUAL_360' = 'ACTUAL_365'
): number {
  if (rate < 0 || years < 0) {
    throw new Error('Rate and years must be non-negative');
  }
  
  // Standard continuous compounding: DF = 1 / (1 + r)^t
  return 1 / Math.pow(1 + rate, years);
}

/**
 * Calculate discount factor using actual days
 * @param rate Annual interest rate (as decimal)
 * @param startDate Start date
 * @param endDate End date
 * @param dayCountBasis Day count basis
 * @returns Discount factor
 */
export function discountFactorDays(
  rate: number,
  startDate: Date,
  endDate: Date,
  dayCountBasis: 'ACTUAL_365' | 'ACTUAL_360' = 'ACTUAL_365'
): number {
  if (endDate < startDate) {
    throw new Error('End date must be after start date');
  }
  
  const daysDiff = Math.floor(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysPerYear = dayCountBasis === 'ACTUAL_365' ? 365 : 360;
  const years = daysDiff / daysPerYear;
  
  return discountFactor(rate, years, dayCountBasis);
}

/**
 * Calculate Net Present Value (NPV)
 * @param cashFlows Array of cash flows (first is typically initial investment, negative)
 * @param discountRate Discount rate (as decimal)
 * @returns NPV
 */
export function npv(cashFlows: number[], discountRate: number): number {
  if (cashFlows.length === 0) {
    return 0;
  }
  
  if (discountRate < -1) {
    throw new Error('Discount rate must be >= -100%');
  }
  
  let npv = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    const df = discountFactor(discountRate, i);
    npv += cashFlows[i] * df;
  }
  
  return npv;
}

/**
 * Calculate Net Present Value with irregular dates (XNPV)
 * @param cashFlows Array of cash flows
 * @param dates Array of dates corresponding to cash flows
 * @param discountRate Discount rate (as decimal)
 * @param dayCountBasis Day count basis
 * @returns XNPV
 */
export function xnpv(
  cashFlows: number[],
  dates: Date[],
  discountRate: number,
  dayCountBasis: 'ACTUAL_365' | 'ACTUAL_360' = 'ACTUAL_365'
): number {
  if (cashFlows.length !== dates.length) {
    throw new Error('Cash flows and dates arrays must have same length');
  }
  
  if (cashFlows.length === 0) {
    return 0;
  }
  
  if (discountRate < -1) {
    throw new Error('Discount rate must be >= -100%');
  }
  
  const firstDate = dates[0];
  let xnpv = 0;
  
  for (let i = 0; i < cashFlows.length; i++) {
    const df = discountFactorDays(discountRate, firstDate, dates[i], dayCountBasis);
    xnpv += cashFlows[i] * df;
  }
  
  return xnpv;
}

/**
 * Calculate Internal Rate of Return (IRR) using Newton-Raphson method
 * @param cashFlows Array of cash flows
 * @param guess Initial guess for IRR (default 0.1 = 10%)
 * @param maxIterations Maximum iterations (default 100)
 * @param tolerance Convergence tolerance (default 1e-6)
 * @returns IRR as decimal, or null if cannot converge
 */
export function irr(
  cashFlows: number[],
  guess: number = 0.1,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): number | null {
  if (cashFlows.length < 2) {
    return null;
  }
  
  // Check if all cash flows have same sign (no IRR possible)
  const allPositive = cashFlows.every(cf => cf >= 0);
  const allNegative = cashFlows.every(cf => cf <= 0);
  if (allPositive || allNegative) {
    return null;
  }
  
  // Bounds for bisection fallback
  const minRate = -0.99; // -99%
  const maxRate = 10.0; // 1000%
  
  let rate = guess;
  
  // Newton-Raphson iteration
  for (let iter = 0; iter < maxIterations; iter++) {
    // Calculate NPV and its derivative
    let npv = 0;
    let npvDerivative = 0;
    
    for (let i = 0; i < cashFlows.length; i++) {
      const df = discountFactor(rate, i);
      npv += cashFlows[i] * df;
      
      if (i > 0) {
        // Derivative of DF with respect to rate
        const dfDerivative = -i * df / (1 + rate);
        npvDerivative += cashFlows[i] * dfDerivative;
      }
    }
    
    // Check convergence
    if (Math.abs(npv) < tolerance) {
      // Validate rate is in reasonable bounds
      if (rate >= minRate && rate <= maxRate) {
        return rate;
      }
    }
    
    // Update rate using Newton-Raphson: r_new = r_old - NPV / NPV'
    if (Math.abs(npvDerivative) > tolerance) {
      const newRate = rate - npv / npvDerivative;
      
      // Bounds check
      if (newRate < minRate) {
        rate = minRate;
      } else if (newRate > maxRate) {
        rate = maxRate;
      } else {
        rate = newRate;
      }
    } else {
      // Derivative too small - try bisection
      return irrBisection(cashFlows, minRate, maxRate, tolerance);
    }
  }
  
  // Newton-Raphson didn't converge - try bisection
  return irrBisection(cashFlows, minRate, maxRate, tolerance);
}

/**
 * Calculate IRR using bisection method (fallback)
 */
function irrBisection(
  cashFlows: number[],
  minRate: number,
  maxRate: number,
  tolerance: number
): number | null {
  let low = minRate;
  let high = maxRate;
  const maxIterations = 100;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const mid = (low + high) / 2;
    const npvMid = npv(cashFlows, mid);
    
    if (Math.abs(npvMid) < tolerance) {
      return mid;
    }
    
    const npvLow = npv(cashFlows, low);
    
    if ((npvLow < 0 && npvMid > 0) || (npvLow > 0 && npvMid < 0)) {
      high = mid;
    } else {
      low = mid;
    }
    
    if (high - low < tolerance) {
      return (low + high) / 2;
    }
  }
  
  return null;
}

/**
 * Calculate Extended Internal Rate of Return (XIRR) with irregular dates
 * @param cashFlows Array of cash flows
 * @param dates Array of dates corresponding to cash flows
 * @param guess Initial guess for XIRR (default 0.1)
 * @param maxIterations Maximum iterations (default 100)
 * @param tolerance Convergence tolerance (default 1e-6)
 * @param dayCountBasis Day count basis
 * @returns XIRR as decimal, or null if cannot converge
 */
export function xirr(
  cashFlows: number[],
  dates: Date[],
  guess: number = 0.1,
  maxIterations: number = 100,
  tolerance: number = 1e-6,
  dayCountBasis: 'ACTUAL_365' | 'ACTUAL_360' = 'ACTUAL_365'
): number | null {
  if (cashFlows.length !== dates.length) {
    throw new Error('Cash flows and dates arrays must have same length');
  }
  
  if (cashFlows.length < 2) {
    return null;
  }
  
  // Check if all cash flows have same sign
  const allPositive = cashFlows.every(cf => cf >= 0);
  const allNegative = cashFlows.every(cf => cf <= 0);
  if (allPositive || allNegative) {
    return null;
  }
  
  const minRate = -0.99;
  const maxRate = 10.0;
  
  let rate = guess;
  const firstDate = dates[0];
  
  // Newton-Raphson iteration
  for (let iter = 0; iter < maxIterations; iter++) {
    let xnpv = 0;
    let xnpvDerivative = 0;
    
    for (let i = 0; i < cashFlows.length; i++) {
      const daysDiff = Math.floor(
        (dates[i].getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysPerYear = dayCountBasis === 'ACTUAL_365' ? 365 : 360;
      const years = daysDiff / daysPerYear;
      
      const df = discountFactor(rate, years);
      xnpv += cashFlows[i] * df;
      
      if (years > 0) {
        const dfDerivative = -years * df / (1 + rate);
        xnpvDerivative += cashFlows[i] * dfDerivative;
      }
    }
    
    if (Math.abs(xnpv) < tolerance) {
      if (rate >= minRate && rate <= maxRate) {
        return rate;
      }
    }
    
    if (Math.abs(xnpvDerivative) > tolerance) {
      const newRate = rate - xnpv / xnpvDerivative;
      
      if (newRate < minRate) {
        rate = minRate;
      } else if (newRate > maxRate) {
        rate = maxRate;
      } else {
        rate = newRate;
      }
    } else {
      // Fallback to bisection
      return xirrBisection(cashFlows, dates, minRate, maxRate, tolerance, dayCountBasis);
    }
  }
  
  return xirrBisection(cashFlows, dates, minRate, maxRate, tolerance, dayCountBasis);
}

/**
 * Calculate XIRR using bisection method (fallback)
 */
function xirrBisection(
  cashFlows: number[],
  dates: Date[],
  minRate: number,
  maxRate: number,
  tolerance: number,
  dayCountBasis: 'ACTUAL_365' | 'ACTUAL_360'
): number | null {
  let low = minRate;
  let high = maxRate;
  const maxIterations = 100;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const mid = (low + high) / 2;
    const xnpvMid = xnpv(cashFlows, dates, mid, dayCountBasis);
    
    if (Math.abs(xnpvMid) < tolerance) {
      return mid;
    }
    
    const xnpvLow = xnpv(cashFlows, dates, low, dayCountBasis);
    
    if ((xnpvLow < 0 && xnpvMid > 0) || (xnpvLow > 0 && xnpvMid < 0)) {
      high = mid;
    } else {
      low = mid;
    }
    
    if (high - low < tolerance) {
      return (low + high) / 2;
    }
  }
  
  return null;
}

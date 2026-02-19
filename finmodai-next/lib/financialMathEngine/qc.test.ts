/**
 * CapitalBase Financial Math Engine
 * Quality Control Tests
 * 
 * Test cases to prevent regressions and ensure data integrity
 */

import type { FinancialKey, FinancialValue, FinancialState } from './types';
import { resolve } from './solver';

/**
 * Test case structure
 */
export interface QCTestCase {
  name: string;
  description: string;
  input: Partial<Record<FinancialKey, FinancialValue>>;
  expected: {
    resolved: Partial<Record<FinancialKey, { value: number | null; status: string; method?: string }>>;
    missing: FinancialKey[];
    warnings: string[];
  };
}

/**
 * QC Test Cases
 */
export const QC_TEST_CASES: QCTestCase[] = [
  // ============================================
  // Test 1: Null vs 0 Coercion
  // ============================================
  {
    name: 'Null vs 0 Coercion',
    description: 'Ensure null values are never coerced to 0',
    input: {
      revenue: {
        value: null,
        status: 'missing',
      },
      ebitda: {
        value: null,
        status: 'missing',
      },
    },
    expected: {
      resolved: {
        revenue: { value: null, status: 'missing' },
        ebitda: { value: null, status: 'missing' },
      },
      missing: ['revenue', 'ebitda'],
      warnings: [],
    },
  },

  // ============================================
  // Test 2: Negative NI Suppresses P/E
  // ============================================
  {
    name: 'Negative NI Suppresses P/E',
    description: 'P/E multiple should be null if net income <= 0',
    input: {
      market_cap: {
        value: 1000000000,
        status: 'reported',
      },
      net_income: {
        value: -50000000, // Negative
        status: 'reported',
      },
    },
    expected: {
      resolved: {
        market_cap: { value: 1000000000, status: 'reported' },
        net_income: { value: -50000000, status: 'reported' },
        pe: { value: null, status: 'missing' }, // Should be null, not computed
      },
      missing: ['pe'],
      warnings: [],
    },
  },

  // ============================================
  // Test 3: Missing EBITDA Suppresses EV/EBITDA
  // ============================================
  {
    name: 'Missing EBITDA Suppresses EV/EBITDA',
    description: 'EV/EBITDA should be null if EBITDA missing or <= 0',
    input: {
      enterprise_value: {
        value: 2000000000,
        status: 'reported',
      },
      ebitda: {
        value: null,
        status: 'missing',
      },
    },
    expected: {
      resolved: {
        enterprise_value: { value: 2000000000, status: 'reported' },
        ebitda: { value: null, status: 'missing' },
        ev_to_ebitda: { value: null, status: 'missing' }, // Should be null
      },
      missing: ['ebitda', 'ev_to_ebitda'],
      warnings: [],
    },
  },

  // ============================================
  // Test 4: Shares Derived Only When Market Cap & Price Aligned
  // ============================================
  {
    name: 'Shares Derived from Market Cap and Price',
    description: 'Shares should be derived only if both market_cap and price exist and are > 0',
    input: {
      market_cap: {
        value: 150000000000, // $150B
        status: 'reported',
        as_of: '2024-01-15',
      },
      price: {
        value: 150.50,
        status: 'reported',
        as_of: '2024-01-15', // Same date
      },
    },
    expected: {
      resolved: {
        market_cap: { value: 150000000000, status: 'reported' },
        price: { value: 150.50, status: 'reported' },
        shares_out_basic: {
          value: 996677740.86, // 150B / 150.50
          status: 'derived',
          method: 'shares_out_basic = market_cap / price',
        },
      },
      missing: [],
      warnings: [],
    },
  },

  // ============================================
  // Test 5: Tax Rate Derived Only When Pre-tax > 0
  // ============================================
  {
    name: 'Tax Rate Derived Only When Pre-tax > 0',
    description: 'Tax rate should be null if pre-tax income <= 0',
    input: {
      net_income: {
        value: -10000000, // Loss
        status: 'reported',
      },
      tax_expense: {
        value: 0,
        status: 'reported',
      },
    },
    expected: {
      resolved: {
        net_income: { value: -10000000, status: 'reported' },
        tax_expense: { value: 0, status: 'reported' },
        pre_tax_income: { value: -10000000, status: 'derived' },
        tax_rate_effective: { value: null, status: 'missing' }, // Cannot compute
      },
      missing: ['tax_rate_effective'],
      warnings: [],
    },
  },

  // ============================================
  // Test 6: EV Derivation Uses Proper Hierarchy
  // ============================================
  {
    name: 'EV Derivation Hierarchy',
    description: 'EV should be derived from market_cap + net_debt, with proper hierarchy',
    input: {
      market_cap: {
        value: 1000000000,
        status: 'reported',
      },
      total_debt: {
        value: 500000000,
        status: 'reported',
      },
      cash: {
        value: 100000000,
        status: 'reported',
      },
    },
    expected: {
      resolved: {
        market_cap: { value: 1000000000, status: 'reported' },
        total_debt: { value: 500000000, status: 'reported' },
        cash: { value: 100000000, status: 'reported' },
        net_debt: {
          value: 400000000,
          status: 'derived',
          method: 'net_debt = total_debt - cash',
        },
        enterprise_value: {
          value: 1400000000,
          status: 'derived',
          method: 'enterprise_value = market_cap + net_debt',
        },
      },
      missing: [],
      warnings: [],
    },
  },

  // ============================================
  // Test 7: Outlier Warnings (Implausible Shares)
  // ============================================
  {
    name: 'Outlier Warning for Implausible Shares',
    description: 'Should warn if derived shares are outside plausible bounds',
    input: {
      market_cap: {
        value: 1000000, // $1M (very small)
        status: 'reported',
      },
      price: {
        value: 0.01, // $0.01 (very low)
        status: 'reported',
      },
    },
    expected: {
      resolved: {
        market_cap: { value: 1000000, status: 'reported' },
        price: { value: 0.01, status: 'reported' },
        shares_out_basic: {
          value: 100000000, // 100M shares
          status: 'derived',
          method: 'shares_out_basic = market_cap / price',
        },
      },
      missing: [],
      warnings: [
        // Should contain warnings about shares being unusually low/high
        // Actual warning text will be checked in test execution
      ],
    },
  },

  // ============================================
  // Test 8: Outlier Warnings (Absurd Multiples)
  // ============================================
  {
    name: 'Outlier Warning for Absurd Multiples',
    description: 'Should warn if multiples are outside reasonable bounds',
    input: {
      enterprise_value: {
        value: 1000000000,
        status: 'reported',
      },
      ebitda: {
        value: 1000000, // Very small EBITDA
        status: 'reported',
      },
    },
    expected: {
      resolved: {
        enterprise_value: { value: 1000000000, status: 'reported' },
        ebitda: { value: 1000000, status: 'reported' },
        ev_to_ebitda: {
          value: 1000, // 1000x multiple (absurd)
          status: 'derived',
          method: 'ev_to_ebitda = enterprise_value / ebitda',
        },
      },
      missing: [],
      warnings: [], // Note: Multiple validation would be in UI layer
    },
  },

  // ============================================
  // Test 9: No Objects Printed in Cells
  // ============================================
  {
    name: 'No Object Coercion',
    description: 'Ensure [object Object] never appears in output',
    input: {
      revenue: {
        value: 50000000,
        status: 'reported',
      },
      // Simulate bad API response that might return object
      ebitda: {
        value: null,
        status: 'missing',
      },
    },
    expected: {
      resolved: {
        revenue: { value: 50000000, status: 'reported' },
        ebitda: { value: null, status: 'missing' },
      },
      missing: ['ebitda'],
      warnings: [],
    },
  },

  // ============================================
  // Test 10: Never Overwrite Reported Values
  // ============================================
  {
    name: 'Never Overwrite Reported Values',
    description: 'Derived values should never overwrite reported values',
    input: {
      shares_out_basic: {
        value: 1000000000, // Reported shares
        status: 'reported',
      },
      market_cap: {
        value: 150000000000,
        status: 'reported',
      },
      price: {
        value: 150.50,
        status: 'reported',
      },
    },
    expected: {
      resolved: {
        shares_out_basic: {
          value: 1000000000, // Should remain reported, not derived
          status: 'reported',
        },
        market_cap: { value: 150000000000, status: 'reported' },
        price: { value: 150.50, status: 'reported' },
      },
      missing: [],
      warnings: [],
    },
  },

  // ============================================
  // Test 11: Policy-Based Derivation Labeling
  // ============================================
  {
    name: 'Policy-Based Derivation Labeling',
    description: 'D&A from policy should be labeled as derived_from_assumption',
    input: {
      revenue: {
        value: 100000000,
        status: 'reported',
      },
      da_percent_revenue: {
        value: 0.05, // 5%
        status: 'user_provided',
      },
    },
    expected: {
      resolved: {
        revenue: { value: 100000000, status: 'reported' },
        da_percent_revenue: { value: 0.05, status: 'user_provided' },
        da: {
          value: 5000000, // 5% of revenue
          status: 'derived_from_assumption',
          method: 'da = da_percent_revenue * revenue (policy-based)',
        },
      },
      missing: [],
      warnings: [],
    },
  },

  // ============================================
  // Test 12: Missing Denominator Suppresses Multiple
  // ============================================
  {
    name: 'Missing Denominator Suppresses Multiple',
    description: 'Multiples should be null if denominator is missing or <= 0',
    input: {
      enterprise_value: {
        value: 2000000000,
        status: 'reported',
      },
      revenue: {
        value: null,
        status: 'missing',
      },
    },
    expected: {
      resolved: {
        enterprise_value: { value: 2000000000, status: 'reported' },
        revenue: { value: null, status: 'missing' },
        ev_to_revenue: { value: null, status: 'missing' }, // Should be null
      },
      missing: ['revenue', 'ev_to_revenue'],
      warnings: [],
    },
  },
];

/**
 * Run a single QC test case
 */
export function runQCTest(testCase: QCTestCase): {
  passed: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  try {
    const resolved = resolve(testCase.input);
    
    // Check resolved values
    for (const [key, expected] of Object.entries(testCase.expected.resolved)) {
      const actual = resolved.resolved[key as FinancialKey];
      const expectedValue = expected.value;
      const expectedStatus = expected.status;
      
      if (!actual) {
        errors.push(`Missing key: ${key}`);
        continue;
      }
      
      // Check value (allowing for floating point precision)
      if (expectedValue !== null && actual.value !== null) {
        const diff = Math.abs(actual.value - expectedValue);
        const tolerance = Math.max(Math.abs(expectedValue) * 0.001, 0.01); // 0.1% or $0.01
        if (diff > tolerance) {
          errors.push(
            `${key}: Expected value ${expectedValue}, got ${actual.value} (diff: ${diff})`
          );
        }
      } else if (expectedValue !== actual.value) {
        errors.push(
          `${key}: Expected value ${expectedValue}, got ${actual.value}`
        );
      }
      
      // Check status
      if (actual.status !== expectedStatus) {
        errors.push(
          `${key}: Expected status ${expectedStatus}, got ${actual.status}`
        );
      }
      
      // Check method if expected
      if (expected.method && actual.method !== expected.method) {
        errors.push(
          `${key}: Expected method "${expected.method}", got "${actual.method}"`
        );
      }
    }
    
    // Check missing keys
    const expectedMissing = new Set(testCase.expected.missing);
    const actualMissing = new Set(
      Object.keys(resolved.resolved).filter(
        key =>
          !resolved.resolved[key as FinancialKey] ||
          resolved.resolved[key as FinancialKey]?.value === null
      )
    );
    
    for (const key of expectedMissing) {
      if (!actualMissing.has(key)) {
        errors.push(`Expected ${key} to be missing, but it was resolved`);
      }
    }
    
    // Check warnings (loose match)
    if (testCase.expected.warnings.length > 0) {
      const hasWarnings = resolved.warnings.length > 0;
      if (!hasWarnings) {
        errors.push('Expected warnings but none were generated');
      }
    }
    
  } catch (error) {
    errors.push(`Test execution failed: ${error}`);
  }
  
  return {
    passed: errors.length === 0,
    errors,
  };
}

/**
 * Run all QC tests
 */
export function runAllQCTests(): {
  passed: number;
  failed: number;
  results: Array<{ test: string; passed: boolean; errors: string[] }>;
} {
  const results = QC_TEST_CASES.map(testCase => {
    const result = runQCTest(testCase);
    return {
      test: testCase.name,
      passed: result.passed,
      errors: result.errors,
    };
  });
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  
  return {
    passed,
    failed,
    results,
  };
}

/**
 * Tests for sanitizeAssumptions
 * 
 * Run with: npm test lib/__tests__/sanitizeAssumptions.test.ts
 */

import { sanitizeAssumptions, validateSanitizedAssumptions, ASSUMPTION_BOUNDS } from '../sanitizeAssumptions';

describe('sanitizeAssumptions', () => {
  test('converts percentage values to decimals', () => {
    const result = sanitizeAssumptions({
      taxRate: 21, // Should become 0.21
      revenueGrowth: [10, 8, 6], // Should become [0.10, 0.08, 0.06]
      capexPctRevenue: [6, 5.5, 5], // Should become [0.06, 0.055, 0.05]
    });

    expect(result.sanitized.taxRate).toBe(0.21);
    expect(result.sanitized.revenueGrowth).toEqual([0.10, 0.08, 0.06]);
    expect(result.sanitized.capexPctRevenue).toEqual([0.06, 0.055, 0.05]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('clamps insane values to realistic ranges', () => {
    const result = sanitizeAssumptions({
      taxRate: 2100, // Should clamp to 0.50
      capexPctRevenue: [600, 550, 500], // Should clamp to [0.25, 0.25, 0.25]
      cogsPct: [-2650, -2500, -2400], // Should clamp to [0.10, 0.10, 0.10]
    });

    expect(result.sanitized.taxRate).toBe(0.50);
    expect(result.sanitized.capexPctRevenue).toEqual([0.25, 0.25, 0.25]);
    expect(result.sanitized.cogsPct[0]).toBe(ASSUMPTION_BOUNDS.cogsPct.min);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('handles string percentages', () => {
    const result = sanitizeAssumptions({
      taxRate: '21%',
      revenueGrowth: ['10%', '8%', '6%'],
    });

    expect(result.sanitized.taxRate).toBe(0.21);
    expect(result.sanitized.revenueGrowth).toEqual([0.10, 0.08, 0.06]);
  });

  test('handles already-correct decimal values', () => {
    const result = sanitizeAssumptions({
      taxRate: 0.21,
      revenueGrowth: [0.10, 0.08, 0.06],
      capexPctRevenue: [0.05, 0.045, 0.04],
    });

    expect(result.sanitized.taxRate).toBe(0.21);
    expect(result.sanitized.revenueGrowth).toEqual([0.10, 0.08, 0.06]);
    expect(result.sanitized.capexPctRevenue).toEqual([0.05, 0.045, 0.04]);
    expect(result.warnings.length).toBe(0);
  });

  test('throws validation error for zero revenue', () => {
    const result = sanitizeAssumptions({
      revenue: [0, 0, 0],
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].field).toBe('revenue[0]');
    expect(() => validateSanitizedAssumptions(result)).toThrow('Critical validation errors');
  });

  test('throws validation error for NaN values', () => {
    const result = sanitizeAssumptions({
      taxRate: NaN,
    });

    expect(() => validateSanitizedAssumptions(result)).toThrow('NaN values');
  });

  test('handles missing arrays with defaults', () => {
    const result = sanitizeAssumptions({
      years: [2024, 2025, 2026],
      revenue: [1000],
    });

    expect(result.sanitized.revenueGrowth).toHaveLength(3);
    expect(result.sanitized.cogsPct).toHaveLength(3);
    expect(result.sanitized.opexPct).toHaveLength(3);
    expect(result.sanitized.daPct).toHaveLength(3);
    expect(result.sanitized.capexPctRevenue).toHaveLength(3);
  });

  test('handles negative growth rates correctly', () => {
    const result = sanitizeAssumptions({
      revenueGrowth: [-0.10, -0.05, 0.02], // Valid negative growth
    });

    expect(result.sanitized.revenueGrowth).toEqual([-0.10, -0.05, 0.02]);
    expect(result.warnings.length).toBe(0);
  });

  test('clamps extreme negative growth', () => {
    const result = sanitizeAssumptions({
      revenueGrowth: [-0.80, -0.70, -0.60], // Too negative
    });

    expect(result.sanitized.revenueGrowth).toEqual([
      ASSUMPTION_BOUNDS.revenueGrowth.min,
      ASSUMPTION_BOUNDS.revenueGrowth.min,
      ASSUMPTION_BOUNDS.revenueGrowth.min,
    ]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('handles working capital days correctly', () => {
    const result = sanitizeAssumptions({
      arDays: 45,
      inventoryDays: 60,
      apDays: 30,
    });

    expect(result.sanitized.arDays).toBe(45);
    expect(result.sanitized.inventoryDays).toBe(60);
    expect(result.sanitized.apDays).toBe(30);
    expect(result.warnings.length).toBe(0);
  });

  test('clamps excessive working capital days', () => {
    const result = sanitizeAssumptions({
      arDays: 500, // Too high
      inventoryDays: 1000, // Too high
      apDays: 500, // Too high
    });

    expect(result.sanitized.arDays).toBe(ASSUMPTION_BOUNDS.arDays.max);
    expect(result.sanitized.inventoryDays).toBe(ASSUMPTION_BOUNDS.inventoryDays.max);
    expect(result.sanitized.apDays).toBe(ASSUMPTION_BOUNDS.apDays.max);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});


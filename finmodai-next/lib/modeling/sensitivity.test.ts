import { describe, it, expect, vi } from 'vitest';
import { oneWaySensitivity, twoWaySensitivity } from './sensitivity';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

// Mock computeDCFSeries
vi.mock('@/lib/dcfGenerator', () => ({
  computeDCFSeries: vi.fn((inputs) => {
    const { wacc, revenueByYear, ebitMargin } = inputs;
    // Simple mock: enterprise value based on revenue and WACC
    const avgRevenue = revenueByYear.reduce((a: number, b: number) => a + b, 0) / revenueByYear.length;
    const enterpriseValue = (avgRevenue * (1 + ebitMargin)) / wacc;
    return {
      enterpriseValue,
      equityValue: enterpriseValue * 0.9,
      pricePerShare: enterpriseValue / 1000,
      isValid: true,
    };
  }),
}));

const createMockDCFArtifact = (inputs: Array<{ key: string; value: number; label: string; unit?: string }>): ModelAndVizArtifact => ({
  model: {
    kind: 'dcf',
    title: 'Test DCF Model',
    index: {
      frequency: 'yearly',
      periods: ['2024', '2025', '2026'],
    },
    inputs: inputs.map((inp) => ({
      key: inp.key,
      label: inp.label,
      value: inp.value,
      unit: inp.unit,
      source: 'user' as const,
    })),
    equations: [],
    outputs: [
      { key: 'enterpriseValue', label: 'Enterprise Value', unit: '$M' },
      { key: 'equityValue', label: 'Equity Value', unit: '$M' },
    ],
  },
  evaluation: {
    asOf: new Date().toISOString(),
    rows: [],
    summary: [
      { key: 'enterpriseValue', label: 'Enterprise Value', value: 1000, unit: '$M' },
    ],
  },
  charts: [],
});

describe('oneWaySensitivity', () => {
  it('should compute sensitivity for DCF inputs', async () => {
    const artifact = createMockDCFArtifact([
      { key: 'wacc', value: 0.09, label: 'WACC', unit: '%' },
      { key: 'revenue0M', value: 10000, label: 'Starting Revenue', unit: '$M' },
      { key: 'ebitMargin', value: 0.25, label: 'EBIT Margin', unit: '%' },
    ]);

    const result = await oneWaySensitivity(artifact, 'enterpriseValue', 0.1, 8);

    expect(result.metric_key).toBe('enterpriseValue');
    expect(result.impacts.length).toBeGreaterThan(0);
    expect(result.impacts[0]).toHaveProperty('input_key');
    expect(result.impacts[0]).toHaveProperty('delta_down');
    expect(result.impacts[0]).toHaveProperty('delta_up');
  });

  it('should sort impacts by absolute max impact (descending)', async () => {
    const artifact = createMockDCFArtifact([
      { key: 'wacc', value: 0.09, label: 'WACC', unit: '%' },
      { key: 'revenue0M', value: 10000, label: 'Starting Revenue', unit: '$M' },
    ]);

    const result = await oneWaySensitivity(artifact, 'enterpriseValue', 0.1, 8);

    if (result.impacts.length >= 2) {
      expect(result.impacts[0].abs_max_impact).toBeGreaterThanOrEqual(result.impacts[1].abs_max_impact);
    }
  });

  it('should limit results to top N', async () => {
    const artifact = createMockDCFArtifact([
      { key: 'wacc', value: 0.09, label: 'WACC', unit: '%' },
      { key: 'revenue0M', value: 10000, label: 'Starting Revenue', unit: '$M' },
      { key: 'ebitMargin', value: 0.25, label: 'EBIT Margin', unit: '%' },
      { key: 'taxRate', value: 0.21, label: 'Tax Rate', unit: '%' },
    ]);

    const result = await oneWaySensitivity(artifact, 'enterpriseValue', 0.1, 2);

    expect(result.impacts.length).toBeLessThanOrEqual(2);
  });

  it('should handle invalid metric key gracefully', async () => {
    const artifact = createMockDCFArtifact([
      { key: 'wacc', value: 0.09, label: 'WACC', unit: '%' },
    ]);

    const result = await oneWaySensitivity(artifact, 'nonexistent_metric', 0.1, 8);

    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('twoWaySensitivity', () => {
  it('should create a sensitivity grid', async () => {
    const artifact = createMockDCFArtifact([
      { key: 'wacc', value: 0.09, label: 'WACC', unit: '%' },
      { key: 'revenue0M', value: 10000, label: 'Starting Revenue', unit: '$M' },
      { key: 'ebitMargin', value: 0.25, label: 'EBIT Margin', unit: '%' },
    ]);

    const result = await twoWaySensitivity(artifact, 'enterpriseValue', 'wacc', 'revenue0M', 5, 0.2);

    expect(result.x_steps.length).toBe(5);
    expect(result.y_steps.length).toBe(5);
    expect(result.grid.length).toBe(5);
    expect(result.grid[0].length).toBe(5);
  });

  it('should handle missing inputs', async () => {
    const artifact = createMockDCFArtifact([
      { key: 'wacc', value: 0.09, label: 'WACC', unit: '%' },
    ]);

    const result = await twoWaySensitivity(artifact, 'enterpriseValue', 'wacc', 'nonexistent', 5, 0.2);

    expect(result.warnings).toContain('inputs_not_found');
    expect(result.grid.length).toBe(0);
  });
});


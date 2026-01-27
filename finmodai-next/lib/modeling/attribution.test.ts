import { describe, it, expect } from 'vitest';
import { computeAttribution } from './attribution';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

describe('computeAttribution', () => {
  const createMockArtifact = (overrides?: Partial<ModelAndVizArtifact>): ModelAndVizArtifact => ({
    model: {
      kind: 'forecast',
      title: 'Test Model',
      index: { frequency: 'quarterly', periods: ['Q1 2024', 'Q2 2024', 'Q3 2024'] },
      inputs: [
        { key: 'price', label: 'Price', value: 10, unit: '$', source: 'user' },
        { key: 'volume', label: 'Volume', value: 100, unit: 'units', source: 'user' },
      ],
      equations: [],
      outputs: [{ key: 'revenue', label: 'Revenue', unit: '$' }],
    },
    evaluation: {
      asOf: new Date().toISOString(),
      rows: [
        { period: 'Q1 2024', revenue: 1000, price: 10, volume: 100 },
        { period: 'Q2 2024', revenue: 1100, price: 11, volume: 100 },
        { period: 'Q3 2024', revenue: 1200, price: 12, volume: 100 },
      ],
      summary: [],
    },
    charts: [],
    ...overrides,
  });

  it('should compute driver contributions for simple model', () => {
    const artifact = createMockArtifact();
    const result = computeAttribution(artifact);

    expect(result.primary_metric).toBe('Revenue');
    expect(result.contributions.length).toBeGreaterThan(0);
    expect(result.contributions[0]).toHaveProperty('driver');
    expect(result.contributions[0]).toHaveProperty('direction');
    expect(result.contributions[0]).toHaveProperty('magnitude');
    expect(result.contributions[0]).toHaveProperty('explanation');
  });

  it('should handle models with no drivers', () => {
    const artifact = createMockArtifact({
      model: {
        kind: 'forecast',
        title: 'Test Model',
        index: { frequency: 'quarterly', periods: ['Q1 2024'] },
        inputs: [],
        equations: [],
        outputs: [{ key: 'revenue', label: 'Revenue', unit: '$' }],
      },
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [{ period: 'Q1 2024', revenue: 100 }],
        summary: [],
      },
      charts: [],
    });

    const result = computeAttribution(artifact);
    expect(result.primary_metric).toBe('Revenue');
    expect(result.contributions.length).toBe(0);
  });

  it('should filter out placeholder inputs', () => {
    const artifact = createMockArtifact({
      model: {
        kind: 'forecast',
        title: 'Test Model',
        index: { frequency: 'quarterly', periods: ['Q1 2024', 'Q2 2024'] },
        inputs: [
          { key: 'price', label: 'Price', value: 10, unit: '$', source: 'user' },
          { key: 'baseline', label: 'Baseline', value: 100, unit: 'index', source: 'placeholder', notes: 'Placeholder' },
        ],
        equations: [],
        outputs: [{ key: 'revenue', label: 'Revenue', unit: '$' }],
      },
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [
          { period: 'Q1 2024', revenue: 1000, price: 10 },
          { period: 'Q2 2024', revenue: 1100, price: 11 },
        ],
        summary: [],
      },
      charts: [],
    });

    const result = computeAttribution(artifact);
    // Should not include 'baseline' as a driver
    const baselineContributions = result.contributions.filter((c) => c.driver.toLowerCase().includes('baseline'));
    expect(baselineContributions.length).toBe(0);
  });

  it('should limit to top 8 drivers', () => {
    const artifact = createMockArtifact({
      model: {
        kind: 'forecast',
        title: 'Test Model',
        index: { frequency: 'quarterly', periods: ['Q1 2024', 'Q2 2024', 'Q3 2024'] },
        inputs: Array.from({ length: 15 }, (_, i) => ({
          key: `driver_${i}`,
          label: `Driver ${i}`,
          value: 10 + i,
          unit: '$',
          source: 'user' as const,
        })),
        equations: [],
        outputs: [{ key: 'revenue', label: 'Revenue', unit: '$' }],
      },
      evaluation: {
        asOf: new Date().toISOString(),
        rows: Array.from({ length: 3 }, (_, i) => ({
          period: `Q${i + 1} 2024`,
          revenue: 1000 + i * 100,
          ...Object.fromEntries(Array.from({ length: 15 }, (_, j) => [`driver_${j}`, 10 + i + j])),
        })),
        summary: [],
      },
      charts: [],
    });

    const result = computeAttribution(artifact);
    expect(result.contributions.length).toBeLessThanOrEqual(8);
  });

  it('should return valid structure even with empty rows', () => {
    const artifact = createMockArtifact({
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [],
        summary: [],
      },
    });

    const result = computeAttribution(artifact);
    expect(result.primary_metric).toBe('Revenue');
    expect(result.contributions).toEqual([]);
  });
});


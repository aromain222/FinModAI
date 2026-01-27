import { describe, it, expect } from 'vitest';
import { validateModel } from './validation';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

describe('validateModel', () => {
  const createMockArtifact = (overrides?: Partial<ModelAndVizArtifact>): ModelAndVizArtifact => ({
    model: {
      kind: 'forecast',
      title: 'Test Model',
      index: { frequency: 'quarterly', periods: ['Q1 2024', 'Q2 2024', 'Q3 2024'] },
      inputs: [],
      equations: [],
      outputs: [{ key: 'revenue', label: 'Revenue', unit: '$' }],
    },
    evaluation: {
      asOf: new Date().toISOString(),
      rows: [
        { period: 'Q1 2024', revenue: 100 },
        { period: 'Q2 2024', revenue: 110 },
        { period: 'Q3 2024', revenue: 120 },
      ],
      summary: [],
    },
    charts: [],
    ...overrides,
  });

  it('should detect negative revenue', () => {
    const artifact = createMockArtifact({
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [
          { period: 'Q1 2024', revenue: -10 },
          { period: 'Q2 2024', revenue: 100 },
        ],
        summary: [],
      },
    });

    const result = validateModel(artifact);
    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.code === 'negative_value')).toBe(true);
  });

  it('should detect extreme margins (>95%)', () => {
    const artifact = createMockArtifact({
      model: {
        kind: 'forecast',
        title: 'Test Model',
        index: { frequency: 'quarterly', periods: ['Q1 2024'] },
        inputs: [],
        equations: [],
        outputs: [{ key: 'margin', label: 'Profit Margin', unit: '%' }],
      },
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [{ period: 'Q1 2024', margin: 98 }],
        summary: [],
      },
      charts: [],
    });

    const result = validateModel(artifact);
    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.code === 'extreme_margin')).toBe(true);
  });

  it('should detect extreme growth rates (>200%)', () => {
    const artifact = createMockArtifact({
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [
          { period: 'Q1 2024', revenue: 100 },
          { period: 'Q2 2024', revenue: 350 }, // 250% growth
        ],
        summary: [],
      },
    });

    const result = validateModel(artifact);
    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.code === 'extreme_growth')).toBe(true);
  });

  it('should detect discontinuous jumps (>3x)', () => {
    const artifact = createMockArtifact({
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [
          { period: 'Q1 2024', revenue: 100 },
          { period: 'Q2 2024', revenue: 400 }, // 4x jump
        ],
        summary: [],
      },
    });

    const result = validateModel(artifact);
    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.code === 'discontinuous_jump')).toBe(true);
  });

  it('should detect NPV without discounting', () => {
    const artifact = createMockArtifact({
      model: {
        kind: 'dcf',
        title: 'DCF Model',
        index: { frequency: 'yearly', periods: ['2024', '2025', '2026'] },
        inputs: [
          { key: 'revenue', label: 'Revenue', value: 100, unit: '$' },
          // No WACC input
        ],
        equations: [],
        outputs: [{ key: 'npv', label: 'NPV', unit: '$' }],
      },
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [
          { period: '2024', npv: 100 },
          { period: '2025', npv: 110 },
          { period: '2026', npv: 120 },
        ],
        summary: [],
      },
      charts: [],
    });

    const result = validateModel(artifact);
    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.code === 'npv_no_discounting')).toBe(true);
  });

  it('should detect scenario ordering issues (upside < base)', () => {
    const artifact = createMockArtifact({
      model: {
        kind: 'forecast',
        title: 'Scenario Model',
        index: { frequency: 'quarterly', periods: ['Q1 2024'] },
        inputs: [
          { key: 'base_revenue', label: 'Base Revenue', value: 100, unit: '$' },
          { key: 'upside_revenue', label: 'Upside Revenue', value: 90, unit: '$' }, // Upside < base
          { key: 'downside_revenue', label: 'Downside Revenue', value: 80, unit: '$' },
        ],
        equations: [],
        outputs: [{ key: 'revenue', label: 'Revenue', unit: '$' }],
      },
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [{ period: 'Q1 2024', revenue: 100 }],
        summary: [
          { key: 'base', label: 'Base', value: 100 },
          { key: 'upside', label: 'Upside', value: 90 },
          { key: 'downside', label: 'Downside', value: 80 },
        ],
      },
      charts: [],
    });

    const result = validateModel(artifact);
    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.code === 'scenario_ordering' && w.message.includes('Upside'))).toBe(true);
  });

  it('should pass for valid model', () => {
    const artifact = createMockArtifact({
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [
          { period: 'Q1 2024', revenue: 100 },
          { period: 'Q2 2024', revenue: 110 },
          { period: 'Q3 2024', revenue: 120 },
        ],
        summary: [],
      },
    });

    const result = validateModel(artifact);
    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBe(0);
  });
});


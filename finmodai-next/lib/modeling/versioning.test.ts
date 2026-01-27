import { describe, it, expect } from 'vitest';
import { compareVersionWithCurrent } from './versioning';
import type { ModelVersion } from './versioning';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

describe('compareVersionWithCurrent', () => {
  const createMockVersion = (overrides?: Partial<ModelVersion>): ModelVersion => ({
    id: 'version-1',
    artifact_id: 'artifact-1',
    user_id: 'user-1',
    created_at: new Date().toISOString(),
    label: 'Test Version',
    notes: null,
    base_inputs: [
      { key: 'revenue', label: 'Revenue', value: 1000, unit: '$M', source: 'user' },
      { key: 'growth', label: 'Growth Rate', value: 10, unit: '%', source: 'user' },
    ],
    scenario_overrides: null,
    formula_overrides: [
      { key: 'revenue_formula', label: 'Revenue Formula', definition: 'Revenue * (1 + Growth)' },
    ],
    derived_key_outputs: {
      revenue_first: 1000,
      revenue_last: 1500,
    },
    ...overrides,
  });

  const createMockArtifact = (overrides?: Partial<ModelAndVizArtifact>): ModelAndVizArtifact => ({
    model: {
      kind: 'forecast',
      title: 'Test Model',
      index: { frequency: 'quarterly', periods: ['Q1 2024', 'Q2 2024'] },
      inputs: [
        { key: 'revenue', label: 'Revenue', value: 1200, unit: '$M', source: 'user' },
        { key: 'growth', label: 'Growth Rate', value: 15, unit: '%', source: 'user' },
      ],
      equations: [
        { key: 'revenue_formula', label: 'Revenue Formula', definition: 'Revenue * (1 + Growth / 100)' },
      ],
      outputs: [{ key: 'revenue', label: 'Revenue', unit: '$M' }],
    },
    evaluation: {
      asOf: new Date().toISOString(),
      rows: [
        { period: 'Q1 2024', revenue: 1200 },
        { period: 'Q2 2024', revenue: 1380 },
      ],
      summary: [
        { key: 'revenue_first', label: 'First Period Revenue', value: 1200 },
        { key: 'revenue_last', label: 'Last Period Revenue', value: 1380 },
      ],
    },
    charts: [],
    ...overrides,
  });

  it('should detect input changes', () => {
    const version = createMockVersion();
    const current = createMockArtifact();
    const comparison = compareVersionWithCurrent(version, current);

    expect(comparison.inputs_changed.length).toBeGreaterThan(0);
    const revenueChange = comparison.inputs_changed.find((c) => c.key === 'revenue');
    expect(revenueChange).toBeDefined();
    expect(revenueChange?.before).toBe(1000);
    expect(revenueChange?.after).toBe(1200);
    expect(revenueChange?.delta).toBe(200);
  });

  it('should detect formula changes', () => {
    const version = createMockVersion();
    const current = createMockArtifact();
    const comparison = compareVersionWithCurrent(version, current);

    expect(comparison.formulas_changed.length).toBeGreaterThan(0);
    const formulaChange = comparison.formulas_changed.find((c) => c.key === 'revenue_formula');
    expect(formulaChange).toBeDefined();
    expect(formulaChange?.before).toBe('Revenue * (1 + Growth)');
    expect(formulaChange?.after).toBe('Revenue * (1 + Growth / 100)');
  });

  it('should detect output changes with percentage deltas', () => {
    const version = createMockVersion({
      derived_key_outputs: {
        revenue_first: 1000,
        revenue_last: 1500,
      },
    });
    const current = createMockArtifact({
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [],
        summary: [
          { key: 'revenue_first', label: 'First Period Revenue', value: 1200 },
          { key: 'revenue_last', label: 'Last Period Revenue', value: 1800 },
        ],
      },
    });
    const comparison = compareVersionWithCurrent(version, current);

    expect(comparison.outputs_changed.length).toBeGreaterThan(0);
    const outputChange = comparison.outputs_changed.find((c) => c.key === 'revenue_last');
    expect(outputChange).toBeDefined();
    expect(outputChange?.before).toBe(1500);
    expect(outputChange?.after).toBe(1800);
    expect(outputChange?.delta).toBe(300);
    expect(outputChange?.delta_pct).toBeCloseTo(20.0); // (300 / 1500) * 100
  });

  it('should detect added inputs', () => {
    const version = createMockVersion();
    const current = createMockArtifact({
      model: {
        kind: 'forecast',
        title: 'Test Model',
        index: { frequency: 'quarterly', periods: ['Q1 2024'] },
        inputs: [
          { key: 'revenue', label: 'Revenue', value: 1000, unit: '$M', source: 'user' },
          { key: 'growth', label: 'Growth Rate', value: 10, unit: '%', source: 'user' },
          { key: 'margin', label: 'Margin', value: 25, unit: '%', source: 'user' }, // New input
        ],
        equations: [],
        outputs: [],
      },
      evaluation: { asOf: new Date().toISOString(), rows: [], summary: [] },
      charts: [],
    });
    const comparison = compareVersionWithCurrent(version, current);

    const addedInput = comparison.inputs_changed.find((c) => c.key === 'margin');
    expect(addedInput).toBeDefined();
    expect(addedInput?.before).toBeNull();
    expect(addedInput?.after).toBe(25);
  });

  it('should detect removed inputs', () => {
    const version = createMockVersion({
      base_inputs: [
        { key: 'revenue', label: 'Revenue', value: 1000, unit: '$M', source: 'user' },
        { key: 'growth', label: 'Growth Rate', value: 10, unit: '%', source: 'user' },
        { key: 'margin', label: 'Margin', value: 25, unit: '%', source: 'user' },
      ],
    });
    const current = createMockArtifact({
      model: {
        kind: 'forecast',
        title: 'Test Model',
        index: { frequency: 'quarterly', periods: ['Q1 2024'] },
        inputs: [
          { key: 'revenue', label: 'Revenue', value: 1000, unit: '$M', source: 'user' },
          { key: 'growth', label: 'Growth Rate', value: 10, unit: '%', source: 'user' },
          // margin removed
        ],
        equations: [],
        outputs: [],
      },
      evaluation: { asOf: new Date().toISOString(), rows: [], summary: [] },
      charts: [],
    });
    const comparison = compareVersionWithCurrent(version, current);

    const removedInput = comparison.inputs_changed.find((c) => c.key === 'margin');
    expect(removedInput).toBeDefined();
    expect(removedInput?.before).toBe(25);
    expect(removedInput?.after).toBeNull();
  });

  it('should return empty comparison when no changes', () => {
    const version = createMockVersion();
    const current = createMockArtifact({
      model: {
        kind: 'forecast',
        title: 'Test Model',
        index: { frequency: 'quarterly', periods: ['Q1 2024', 'Q2 2024'] },
        inputs: [
          { key: 'revenue', label: 'Revenue', value: 1000, unit: '$M', source: 'user' },
          { key: 'growth', label: 'Growth Rate', value: 10, unit: '%', source: 'user' },
        ],
        equations: [
          { key: 'revenue_formula', label: 'Revenue Formula', definition: 'Revenue * (1 + Growth)' },
        ],
        outputs: [],
      },
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [],
        summary: [
          { key: 'revenue_first', label: 'First Period Revenue', value: 1000 },
          { key: 'revenue_last', label: 'Last Period Revenue', value: 1500 },
        ],
      },
      charts: [],
    });
    const comparison = compareVersionWithCurrent(version, current);

    expect(comparison.inputs_changed.length).toBe(0);
    expect(comparison.formulas_changed.length).toBe(0);
    expect(comparison.outputs_changed.length).toBe(0);
  });
});


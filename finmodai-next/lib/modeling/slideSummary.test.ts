import { describe, it, expect } from 'vitest';
import { generateSlideSummary } from './slideSummary';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import type { AgentOutput } from '@/lib/ai/schemas';
import type { OneWaySensitivityResult } from './sensitivity';

const createMockArtifact = (): ModelAndVizArtifact => ({
  model: {
    kind: 'dcf',
    title: 'AAPL — DCF Model',
    index: { frequency: 'yearly', periods: ['2024', '2025', '2026'] },
    inputs: [
      { key: 'revenue0M', label: 'Starting Revenue', value: 10000, unit: '$M', source: 'user' },
      { key: 'growth', label: 'Revenue Growth', value: 0.08, unit: '%', source: 'inferred' },
      { key: 'wacc', label: 'WACC', value: 0.09, unit: '%', source: 'placeholder' },
    ],
    outputs: [
      { key: 'enterpriseValue', label: 'Enterprise Value', unit: '$M' },
      { key: 'equityValue', label: 'Equity Value', unit: '$M' },
    ],
    objective_metric_key: 'enterpriseValue',
    objective_metric_label: 'Enterprise Value',
    equations: [],
  },
  evaluation: {
    asOf: new Date().toISOString(),
    rows: [
      { period: '2024', enterpriseValue: 1000, equityValue: 900 },
      { period: '2025', enterpriseValue: 1100, equityValue: 1000 },
      { period: '2026', enterpriseValue: 1200, equityValue: 1100 },
    ],
    summary: [
      { key: 'enterpriseValue', label: 'Enterprise Value', value: 1200, unit: '$M' },
      { key: 'equityValue', label: 'Equity Value', value: 1100, unit: '$M' },
      { key: 'upside', label: 'Upside Scenario', value: 1400, unit: '$M' },
      { key: 'downside', label: 'Downside Scenario', value: 1000, unit: '$M' },
    ],
  },
  charts: [],
});

const createMockOutput = (): AgentOutput => ({
  id: 'test-id',
  type: 'MODEL_AND_VIZ',
  title: 'AAPL DCF Model',
  summary: 'Should we invest in AAPL?',
  confidence: 0.8,
  inference: { inferred: true, method: 'rules', reason: 'test' },
  model_recommendation: { required: false, helpful: false, reason: 'n/a' },
  clarifying_questions: [],
  render_hints: { primary_chart_type: 'line', primary_table_columns: [] },
  warnings: [],
  assumptions_summary: {
    placeholder_count: 1,
    high_impact_placeholders: ['WACC'],
    notes: '1 placeholder assumption detected. High-impact placeholders: WACC',
  },
  artifact: createMockArtifact() as any,
});

const createMockSensitivityResult = (): OneWaySensitivityResult => ({
  metric_key: 'enterpriseValue',
  metric_label: 'Enterprise Value',
  metric_base_value: 1200,
  impacts: [
    {
      input_key: 'growth',
      input_label: 'Revenue Growth',
      base_value: 0.08,
      down_value: 0.072,
      up_value: 0.088,
      metric_down: 1100,
      metric_base: 1200,
      metric_up: 1300,
      delta_down: -100,
      delta_up: 100,
      impact_down_pct: -8.3,
      impact_up_pct: 8.3,
      abs_max_impact: 100,
    },
    {
      input_key: 'wacc',
      input_label: 'WACC',
      base_value: 0.09,
      down_value: 0.081,
      up_value: 0.099,
      metric_down: 1350,
      metric_base: 1200,
      metric_up: 1100,
      delta_down: 150,
      delta_up: -100,
      impact_down_pct: 12.5,
      impact_up_pct: -8.3,
      abs_max_impact: 150,
    },
  ],
  warnings: [],
});

describe('generateSlideSummary', () => {
  it('should generate complete slide summary with all sections', () => {
    const output = createMockOutput();
    const artifact = createMockArtifact();
    const sensitivity = createMockSensitivityResult();

    const summary = generateSlideSummary(output, artifact, sensitivity);

    expect(summary).toContain('DECISION QUESTION');
    expect(summary).toContain('OBJECTIVE METRIC');
    expect(summary).toContain('Enterprise Value');
    expect(summary).toContain('SCENARIO DELTAS');
    expect(summary).toContain('TOP 3 DRIVERS');
    expect(summary).toContain('KEY ASSUMPTIONS');
    expect(summary).toContain('NEXT DATA TO REQUEST');
  });

  it('should include objective metric and base value', () => {
    const output = createMockOutput();
    const artifact = createMockArtifact();

    const summary = generateSlideSummary(output, artifact, null);

    expect(summary).toContain('OBJECTIVE METRIC');
    expect(summary).toContain('Enterprise Value');
    expect(summary).toContain('$1.20B'); // 1200M = 1.2B
  });

  it('should include upside/downside deltas when available', () => {
    const output = createMockOutput();
    const artifact = createMockArtifact();

    const summary = generateSlideSummary(output, artifact, null);

    expect(summary).toContain('SCENARIO DELTAS');
    expect(summary).toContain('Upside');
    expect(summary).toContain('Downside');
  });

  it('should include top drivers from sensitivity analysis', () => {
    const output = createMockOutput();
    const artifact = createMockArtifact();
    const sensitivity = createMockSensitivityResult();

    const summary = generateSlideSummary(output, artifact, sensitivity);

    expect(summary).toContain('TOP 3 DRIVERS');
    expect(summary).toContain('WACC');
    expect(summary).toContain('Revenue Growth');
    expect(summary).toMatch(/\d+\.\s+\w+.*:.*±/); // Format: "1. Driver: ±$X"
  });

  it('should include key assumptions with confidence tags', () => {
    const output = createMockOutput();
    const artifact = createMockArtifact();

    const summary = generateSlideSummary(output, artifact, null);

    expect(summary).toContain('KEY ASSUMPTIONS');
    expect(summary).toContain('[USER]');
    expect(summary).toContain('[INFERRED]');
    expect(summary).toContain('[PLACEHOLDER]');
    expect(summary).toContain('Starting Revenue');
    expect(summary).toContain('WACC');
  });

  it('should include next data requests from placeholders', () => {
    const output = createMockOutput();
    const artifact = createMockArtifact();

    const summary = generateSlideSummary(output, artifact, null);

    expect(summary).toContain('NEXT DATA TO REQUEST');
    expect(summary).toContain('WACC');
    expect(summary).toMatch(/\d+\.\s+Provide/); // Format: "1. Provide..."
  });

  it('should handle missing sensitivity results gracefully', () => {
    const output = createMockOutput();
    const artifact = createMockArtifact();

    const summary = generateSlideSummary(output, artifact, null);

    expect(summary).not.toContain('TOP 3 DRIVERS');
    expect(summary).toContain('OBJECTIVE METRIC');
    expect(summary).toContain('KEY ASSUMPTIONS');
  });

  it('should handle missing decision question gracefully', () => {
    const output = { ...createMockOutput(), summary: 'No decision question here' };
    const artifact = createMockArtifact();

    const summary = generateSlideSummary(output, artifact, null);

    expect(summary).not.toContain('DECISION QUESTION');
    expect(summary).toContain('OBJECTIVE METRIC');
  });

  it('should format large values correctly', () => {
    const artifact = createMockArtifact();
    artifact.evaluation.summary = [
      { key: 'enterpriseValue', label: 'Enterprise Value', value: 5_000_000_000, unit: '$M' },
    ];
    const output = createMockOutput();
    output.artifact = artifact as any;

    const summary = generateSlideSummary(output, artifact, null);

    expect(summary).toContain('$5000.00B'); // 5B in billions
  });

  it('should handle non-MODEL_AND_VIZ outputs', () => {
    const output = { ...createMockOutput(), type: 'FORECAST_BLUEPRINT' as any };
    const artifact = createMockArtifact();

    const summary = generateSlideSummary(output, artifact, null);

    expect(summary).toContain('only available for MODEL_AND_VIZ');
  });
});


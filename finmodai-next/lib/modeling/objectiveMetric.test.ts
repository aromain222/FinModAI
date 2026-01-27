import { describe, it, expect } from 'vitest';
import { inferObjectiveMetricFromPrompt, getObjectiveMetric, findOutputByKey } from './objectiveMetric';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

describe('inferObjectiveMetricFromPrompt', () => {
  const baseOutputs = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'operating_profit', label: 'Operating Profit' },
    { key: 'free_cash_flow', label: 'Free Cash Flow' },
    { key: 'churn_rate', label: 'Churn Rate' },
  ];

  it('should select profit/cash metrics when prompt mentions profit/margin/cash', () => {
    const result = inferObjectiveMetricFromPrompt('Improve profitability and cash flow', baseOutputs);
    expect(['operating_profit', 'free_cash_flow']).toContain(result.key);
    expect(result.confidence).toBeGreaterThanOrEqual('medium');
  });

  it('should select revenue for growth-focused prompts', () => {
    const result = inferObjectiveMetricFromPrompt('Grow revenue and scale the business', baseOutputs);
    expect(result.key).toBe('revenue');
    expect(result.confidence).toBeGreaterThanOrEqual('medium');
  });

  it('should select churn/retention for retention-focused prompts', () => {
    const result = inferObjectiveMetricFromPrompt('Reduce churn and improve retention', baseOutputs);
    expect(result.key).toBe('churn_rate');
    expect(result.confidence).toBeGreaterThanOrEqual('medium');
  });

  it('should default to revenue when unclear', () => {
    const result = inferObjectiveMetricFromPrompt('Build a financial model', baseOutputs);
    expect(result.key).toBe('revenue');
    expect(result.confidence).toBe('low');
  });

  it('should handle multiple indicators (profit priority)', () => {
    const result = inferObjectiveMetricFromPrompt('Grow revenue and improve profit margins', baseOutputs);
    expect(['operating_profit', 'free_cash_flow']).toContain(result.key);
  });

  it('should handle empty outputs gracefully', () => {
    const result = inferObjectiveMetricFromPrompt('Improve profitability', []);
    expect(result.key).toBe('unknown');
    expect(result.label).toBe('Unknown');
  });
});

describe('getObjectiveMetric', () => {
  it('should return explicitly set objective metric', () => {
    const artifact: ModelAndVizArtifact = {
      model: {
        kind: 'forecast',
        title: 'Test',
        index: { frequency: 'quarterly', periods: ['Q1'] },
        inputs: [],
        outputs: [
          { key: 'revenue', label: 'Revenue' },
          { key: 'profit', label: 'Profit' },
        ],
        objective_metric_key: 'profit',
        objective_metric_label: 'Profit',
      },
      evaluation: { asOf: new Date().toISOString(), rows: [], summary: [] },
      charts: [],
    };

    const result = getObjectiveMetric(artifact);
    expect(result.key).toBe('profit');
    expect(result.label).toBe('Profit');
    expect(result.confidence).toBe('high');
  });

  it('should fallback to first output if not set', () => {
    const artifact: ModelAndVizArtifact = {
      model: {
        kind: 'forecast',
        title: 'Test',
        index: { frequency: 'quarterly', periods: ['Q1'] },
        inputs: [],
        outputs: [
          { key: 'revenue', label: 'Revenue' },
          { key: 'profit', label: 'Profit' },
        ],
      },
      evaluation: { asOf: new Date().toISOString(), rows: [], summary: [] },
      charts: [],
    };

    const result = getObjectiveMetric(artifact);
    expect(result.key).toBe('revenue');
    expect(result.label).toBe('Revenue');
    expect(result.confidence).toBe('low');
  });
});

describe('findOutputByKey', () => {
  const outputs = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'operating_profit', label: 'Operating Profit' },
    { key: 'free_cash_flow', label: 'Free Cash Flow' },
  ];

  it('should find exact match', () => {
    const result = findOutputByKey(outputs, 'revenue');
    expect(result?.key).toBe('revenue');
  });

  it('should find case-insensitive match', () => {
    const result = findOutputByKey(outputs, 'REVENUE');
    expect(result?.key).toBe('revenue');
  });

  it('should find partial match', () => {
    const result = findOutputByKey(outputs, 'profit');
    expect(result?.key).toBe('operating_profit');
  });

  it('should return null if not found', () => {
    const result = findOutputByKey(outputs, 'nonexistent');
    expect(result).toBeNull();
  });
});


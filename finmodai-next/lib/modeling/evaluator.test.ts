import { describe, it, expect } from 'vitest';
import { evaluateModel } from './evaluator';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

describe('evaluator', () => {
  describe('basic arithmetic', () => {
    it('should evaluate simple addition', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1', '2024 Q2'],
          },
          inputs: [
            { key: 'revenue', label: 'Revenue', value: 1000 },
            { key: 'cost', label: 'Cost', value: 600 },
          ],
          equations: [
            { key: 'profit', label: 'Profit', definition: 'revenue - cost' },
          ],
          outputs: [
            { key: 'profit', label: 'Profit' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.validation.passed).toBe(true);
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].profit).toBe(400);
      expect(result.series.profit).toEqual([400, 400]);
    });

    it('should evaluate multiplication and division', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'units', label: 'Units', value: 100 },
            { key: 'price', label: 'Price', value: 10 },
          ],
          equations: [
            { key: 'revenue', label: 'Revenue', definition: 'units * price' },
            { key: 'margin', label: 'Margin', definition: 'revenue / units' },
          ],
          outputs: [
            { key: 'revenue', label: 'Revenue' },
            { key: 'margin', label: 'Margin' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.rows[0].revenue).toBe(1000);
      expect(result.rows[0].margin).toBe(10);
    });
  });

  describe('min/max/abs', () => {
    it('should evaluate min function', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'a', label: 'A', value: 10 },
            { key: 'b', label: 'B', value: 5 },
          ],
          equations: [
            { key: 'min_val', label: 'Min', definition: 'min(a, b)' },
          ],
          outputs: [
            { key: 'min_val', label: 'Min' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.rows[0].min_val).toBe(5);
    });

    it('should evaluate max function', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'a', label: 'A', value: 10 },
            { key: 'b', label: 'B', value: 5 },
          ],
          equations: [
            { key: 'max_val', label: 'Max', definition: 'max(a, b)' },
          ],
          outputs: [
            { key: 'max_val', label: 'Max' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.rows[0].max_val).toBe(10);
    });

    it('should evaluate abs function', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'value', label: 'Value', value: -15 },
          ],
          equations: [
            { key: 'abs_val', label: 'Abs', definition: 'abs(value)' },
          ],
          outputs: [
            { key: 'abs_val', label: 'Abs' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.rows[0].abs_val).toBe(15);
    });
  });

  describe('time indexing', () => {
    it('should evaluate x[t] for current period', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1', '2024 Q2'],
          },
          inputs: [
            { key: 'revenue', label: 'Revenue', value: 1000 },
          ],
          equations: [
            { key: 'revenue_current', label: 'Revenue Current', definition: 'revenue[t]' },
          ],
          outputs: [
            { key: 'revenue_current', label: 'Revenue Current' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.rows.length).toBe(2);
      expect(result.rows[0].revenue_current).toBe(1000);
      expect(result.rows[1].revenue_current).toBe(1000);
    });

    it('should evaluate x[t-1] for previous period', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1', '2024 Q2', '2024 Q3'],
          },
          inputs: [
            { key: 'revenue', label: 'Revenue', value: 1000 },
          ],
          equations: [
            { key: 'revenue_growth', label: 'Revenue Growth', definition: 'revenue[t] - revenue[t-1]' },
          ],
          outputs: [
            { key: 'revenue_growth', label: 'Revenue Growth' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.rows.length).toBe(3);
      // First period: revenue[t-1] doesn't exist, so should be 0 or revenue - 0
      // Since revenue[t-1] evaluates to 0 when index < 0, revenue_growth = 1000 - 0 = 1000
      expect(result.rows[0].revenue_growth).toBe(1000); // revenue[t] - revenue[t-1] = 1000 - 0
      expect(result.rows[1].revenue_growth).toBe(0); // Same revenue, so growth is 0
      expect(result.rows[2].revenue_growth).toBe(0);
    });
  });

  describe('references by key', () => {
    it('should evaluate formulas referencing other variables', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'revenue', label: 'Revenue', value: 1000 },
            { key: 'margin_pct', label: 'Margin %', value: 0.3 },
          ],
          equations: [
            { key: 'gross_profit', label: 'Gross Profit', definition: 'revenue * margin_pct' },
            { key: 'net_profit', label: 'Net Profit', definition: 'gross_profit * 0.7' },
          ],
          outputs: [
            { key: 'gross_profit', label: 'Gross Profit' },
            { key: 'net_profit', label: 'Net Profit' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.rows[0].gross_profit).toBe(300);
      expect(result.rows[0].net_profit).toBe(210);
    });
  });

  describe('validation', () => {
    it('should detect missing references', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'revenue', label: 'Revenue', value: 1000 },
          ],
          equations: [
            { key: 'profit', label: 'Profit', definition: 'revenue - undefined_var' },
          ],
          outputs: [
            { key: 'profit', label: 'Profit' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.validation.passed).toBe(false);
      expect(result.validation.issues.some(i => i.code === 'missing_references')).toBe(true);
    });

    it('should detect circular dependencies', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'base', label: 'Base', value: 100 },
          ],
          equations: [
            { key: 'a', label: 'A', definition: 'b + base' },
            { key: 'b', label: 'B', definition: 'a + base' },
          ],
          outputs: [
            { key: 'a', label: 'A' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.validation.passed).toBe(false);
      expect(result.validation.issues.some(i => i.code === 'circular_dependency')).toBe(true);
    });
  });

  describe('output structure', () => {
    it('should return tables, series, charts, and graph', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1', '2024 Q2'],
          },
          inputs: [
            { key: 'revenue', label: 'Revenue', value: 1000 },
          ],
          equations: [
            { key: 'profit', label: 'Profit', definition: 'revenue * 0.3' },
          ],
          outputs: [
            { key: 'profit', label: 'Profit' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = evaluateModel(artifact);

      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBe(2);
      expect(result.series).toBeDefined();
      expect(result.series.profit).toBeDefined();
      expect(result.charts).toBeDefined();
      expect(result.charts.length).toBe(1);
      expect(result.graph).toBeDefined();
      expect(result.graph.nodes).toBeDefined();
      expect(result.graph.edges).toBeDefined();
      expect(result.validation).toBeDefined();
    });
  });
});

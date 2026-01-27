import { describe, it, expect } from 'vitest';
import { checkModelSanity, computeDecisionSignal, applyClampedInputs } from './sanity';
import { evaluateModel } from './evaluator';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

describe('sanity', () => {
  describe('checkModelSanity', () => {
    it('should flag negative revenue/price/units', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'revenue', label: 'Revenue', value: -1000 },
            { key: 'price', label: 'Price', value: -50 },
          ],
          equations: [],
          outputs: [
            { key: 'revenue', label: 'Revenue' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = checkModelSanity(artifact);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.code === 'negative_revenue_price_units')).toBe(true);
      expect(result.clamped_inputs.revenue).toBe(0);
      expect(result.clamped_inputs.price).toBe(0);
    });

    it('should flag percentages > 100%', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'churn_rate', label: 'Churn Rate', value: 150, unit: '%' },
            { key: 'margin_pct', label: 'Margin %', value: 1.5 },
          ],
          equations: [],
          outputs: [],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = checkModelSanity(artifact);

      expect(result.issues.some(i => i.code === 'exceeds_max_percentage')).toBe(true);
    });

    it('should flag growth rates outside bounds', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'growth_rate', label: 'Growth Rate', value: -0.6 }, // Too negative
            { key: 'revenue_growth', label: 'Revenue Growth', value: 1.5 }, // Too high (decimal format, should be <= 1.0)
          ],
          equations: [],
          outputs: [],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const result = checkModelSanity(artifact);

      expect(result.issues.some(i => i.code === 'growth_too_negative')).toBe(true);
      expect(result.issues.some(i => i.code === 'growth_too_high')).toBe(true);
    });

    it('should detect exponential blowups', () => {
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
          equations: [],
          outputs: [
            { key: 'revenue', label: 'Revenue' },
          ],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const evaluationOutput = evaluateModel(artifact);
      
      // Manually create a blowup scenario
      evaluationOutput.series.revenue = [1000, 5000]; // 400% growth

      const result = checkModelSanity(artifact, evaluationOutput);

      expect(result.issues.some(i => i.code === 'exponential_blowup')).toBe(true);
    });
  });

  describe('computeDecisionSignal', () => {
    it('should compute decision signal from objective metric', () => {
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
            { key: 'growth', label: 'Growth', value: 0.1 },
          ],
          equations: [
            { key: 'profit', label: 'Profit', definition: 'revenue * 0.3' },
          ],
          outputs: [
            { key: 'profit', label: 'Profit' },
          ],
          objective_metric_key: 'profit',
          objective_metric_label: 'Profit',
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const evaluationOutput = evaluateModel(artifact);
      const signal = computeDecisionSignal(artifact, evaluationOutput);

      expect(signal).toBeDefined();
      expect(signal?.direction).toBeDefined();
      expect(signal?.magnitude).toBeGreaterThanOrEqual(0);
      expect(signal?.magnitude).toBeLessThanOrEqual(1);
      expect(signal?.explanation).toBeDefined();
    });

    it('should return null if no objective metric', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [],
          equations: [],
          outputs: [],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const evaluationOutput = evaluateModel(artifact);
      const signal = computeDecisionSignal(artifact, evaluationOutput);

      expect(signal).toBeNull();
    });
  });

  describe('applyClampedInputs', () => {
    it('should apply clamped inputs to artifact', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'revenue', label: 'Revenue', value: -1000 },
            { key: 'growth', label: 'Growth', value: 0.1 },
          ],
          equations: [],
          outputs: [],
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const clamped = { revenue: 0 };
      const result = applyClampedInputs(artifact, clamped);

      expect(result.model.inputs.find(i => i.key === 'revenue')?.value).toBe(0);
      expect(result.model.inputs.find(i => i.key === 'growth')?.value).toBe(0.1); // Unchanged
    });
  });
});


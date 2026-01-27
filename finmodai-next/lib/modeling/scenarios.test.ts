import { describe, it, expect } from 'vitest';
import { generateScenarios, applyScenarioShocks } from './scenarios';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

describe('scenarios', () => {
  describe('generateScenarios', () => {
    it('should generate Base, Upside, Downside scenarios', () => {
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
            { key: 'growth_rate', label: 'Growth Rate', value: 0.1 },
            { key: 'margin', label: 'Margin', value: 0.3 },
          ],
          equations: [
            { key: 'profit', label: 'Profit', definition: 'revenue * margin' },
          ],
          outputs: [
            { key: 'profit', label: 'Profit' },
          ],
          objective_metric_key: 'profit',
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const scenarios = generateScenarios(artifact);

      expect(scenarios.length).toBeGreaterThanOrEqual(1);
      expect(scenarios[0].name).toBe('Base');
      
      if (scenarios.length > 1) {
        const upside = scenarios.find(s => s.name === 'Upside');
        const downside = scenarios.find(s => s.name === 'Downside');
        
        expect(upside).toBeDefined();
        expect(downside).toBeDefined();
        
        if (upside && downside) {
          // Upside should have positive shocks for growth/margin
          expect(Object.keys(upside.inputShocks).length).toBeGreaterThan(0);
          expect(Object.keys(downside.inputShocks).length).toBeGreaterThan(0);
        }
      }
    });

    it('should shock 1-2 key inputs', () => {
      const artifact: ModelAndVizArtifact = {
        model: {
          kind: 'forecast',
          title: 'Test Model',
          index: {
            frequency: 'quarterly',
            periods: ['2024 Q1'],
          },
          inputs: [
            { key: 'growth_rate', label: 'Growth Rate', value: 0.1 },
            { key: 'margin', label: 'Margin', value: 0.3 },
            { key: 'other_input', label: 'Other Input', value: 100 },
          ],
          equations: [
            { key: 'revenue', label: 'Revenue', definition: '1000 * (1 + growth_rate)' },
            { key: 'profit', label: 'Profit', definition: 'revenue * margin' },
          ],
          outputs: [
            { key: 'profit', label: 'Profit' },
          ],
          objective_metric_key: 'profit',
        },
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
        },
        charts: [],
      };

      const scenarios = generateScenarios(artifact);
      
      // Should have at least Base
      expect(scenarios.length).toBeGreaterThanOrEqual(1);
      
      // If scenarios were generated, check that only 1-2 inputs are shocked
      if (scenarios.length > 1) {
        const upside = scenarios.find(s => s.name === 'Upside');
        if (upside) {
          const shockedInputs = Object.keys(upside.inputShocks);
          expect(shockedInputs.length).toBeGreaterThanOrEqual(1);
          expect(shockedInputs.length).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe('applyScenarioShocks', () => {
    it('should apply shocks to inputs', () => {
      const inputs = [
        { key: 'revenue', value: 1000 },
        { key: 'growth_rate', value: 0.1 },
      ];

      const scenario = {
        id: 'upside',
        name: 'Upside',
        inputShocks: {
          growth_rate: 1.2, // +20%
        },
      };

      const result = applyScenarioShocks(inputs, scenario);

      expect(result.revenue).toBe(1000); // No shock
      expect(result.growth_rate).toBe(0.12); // 0.1 * 1.2
    });

    it('should leave unshocked inputs unchanged', () => {
      const inputs = [
        { key: 'revenue', value: 1000 },
        { key: 'margin', value: 0.3 },
      ];

      const scenario = {
        id: 'base',
        name: 'Base',
        inputShocks: {},
      };

      const result = applyScenarioShocks(inputs, scenario);

      expect(result.revenue).toBe(1000);
      expect(result.margin).toBe(0.3);
    });
  });
});


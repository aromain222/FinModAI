import { describe, it, expect } from 'vitest';
import { buildModelFromPrompt } from './modelBuilder';
import { ModelAndVizArtifactSchema } from './schemas';

describe('modelBuilder', () => {
  describe('buildModelFromPrompt', () => {
    it('should build a forecast model for revenue growth prompt', () => {
      const artifact = buildModelFromPrompt('Forecast revenue for next 4 quarters');
      
      expect(artifact.model.kind).toBe('forecast');
      expect(artifact.model.index.frequency).toBe('quarterly');
      expect(artifact.model.index.periods.length).toBe(4);
      expect(artifact.model.inputs.length).toBeGreaterThan(0);
      expect(artifact.model.outputs.length).toBeGreaterThan(0);
      expect(artifact.evaluation.rows.length).toBe(4);
      expect(artifact.model.objective_metric_key).toBeDefined();
    });

    it('should default to 8 quarterly periods if no timeframe specified', () => {
      const artifact = buildModelFromPrompt('Forecast revenue growth');
      
      expect(artifact.model.index.frequency).toBe('quarterly');
      expect(artifact.model.index.periods.length).toBe(8);
    });

    it('should extract growth rate from prompt', () => {
      const artifact = buildModelFromPrompt('Forecast revenue with 15% growth');
      
      const growthInput = artifact.model.inputs.find(i => i.key === 'growthRate');
      expect(growthInput).toBeDefined();
      expect(growthInput?.value).toBe(15);
    });

    it('should build margin-focused model when profitability mentioned', () => {
      const artifact = buildModelFromPrompt('Forecast revenue and profitability for next 8 quarters');
      
      const marginInput = artifact.model.inputs.find(i => i.key === 'grossMargin');
      expect(marginInput).toBeDefined();
      expect(artifact.model.outputs.some(o => o.key === 'grossProfit')).toBe(true);
    });

    it('should build units model when units mentioned', () => {
      const artifact = buildModelFromPrompt('Forecast unit sales for next 6 months');
      
      const unitsOutput = artifact.model.outputs.find(o => o.key === 'units');
      expect(unitsOutput).toBeDefined();
      expect(unitsOutput?.key).toBe('units');
      expect(artifact.model.outputs.some(o => o.key === 'revenue')).toBe(true);
    });

    it('should include ticker in title when present', () => {
      const artifact = buildModelFromPrompt('Forecast AAPL revenue', { ticker: 'AAPL' });
      
      expect(artifact.model.title).toContain('AAPL');
    });

    it('should label all assumptions with source', () => {
      const artifact = buildModelFromPrompt('Forecast revenue growth');
      
      artifact.model.inputs.forEach(input => {
        expect(input.source).toBeDefined();
        expect(['user', 'inferred', 'placeholder']).toContain(input.source);
      });
    });

    it('should have explainable equations', () => {
      const artifact = buildModelFromPrompt('Forecast revenue for next 4 quarters');
      
      expect(artifact.model.equations.length).toBeGreaterThan(0);
      artifact.model.equations.forEach(eq => {
        expect(eq.definition).toBeTruthy();
        expect(eq.label).toBeTruthy();
      });
    });

    it('should compute evaluation rows deterministically', () => {
      const artifact = buildModelFromPrompt('Forecast revenue for next 4 quarters');
      
      expect(artifact.evaluation.rows.length).toBe(4);
      artifact.evaluation.rows.forEach(row => {
        expect(row.period).toBeTruthy();
        // Check that values are numbers or null (no undefined)
        Object.values(row).forEach(val => {
          if (val !== null && val !== undefined) {
            expect(typeof val === 'string' || typeof val === 'number').toBe(true);
          }
        });
      });
    });

    it('should include summary metrics', () => {
      const artifact = buildModelFromPrompt('Forecast revenue for next 4 quarters');
      
      expect(artifact.evaluation.summary.length).toBeGreaterThan(0);
      artifact.evaluation.summary.forEach(s => {
        expect(s.key).toBeTruthy();
        expect(s.label).toBeTruthy();
        expect(s.value !== undefined).toBe(true);
      });
    });

    it('should validate output against schema', () => {
      const artifact = buildModelFromPrompt('Forecast revenue for next 4 quarters');
      
      const validation = ModelAndVizArtifactSchema.safeParse(artifact);
      expect(validation.success).toBe(true);
    });

    it('should throw error for non-model prompts', () => {
      expect(() => {
        buildModelFromPrompt('What is revenue recognition?');
      }).toThrow(/does not require a model/);
    });

    it('should handle pricing impact prompts', () => {
      const artifact = buildModelFromPrompt('Calculate the impact of raising prices by 15% on revenue');
      
      expect(artifact.model.kind).toBe('forecast');
      expect(artifact.model.title.toLowerCase()).toContain('impact');
    });

    it('should handle tradeoff prompts', () => {
      const artifact = buildModelFromPrompt('Model the tradeoff between growth and margin');
      
      expect(artifact.model.kind).toBe('forecast');
      expect(artifact.model.title.toLowerCase()).toMatch(/tradeoff|balance|priorit/i);
    });
  });
});


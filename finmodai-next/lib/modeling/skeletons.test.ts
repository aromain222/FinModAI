import { describe, it, expect } from 'vitest';
import { selectSkeleton, buildModelFromSkeleton, MODEL_SKELETONS } from './skeletons';

describe('skeletons', () => {
  describe('selectSkeleton', () => {
    it('should select profitability_bridge for profitability prompts', () => {
      const skeleton = selectSkeleton('How can we improve profitability?');
      
      expect(skeleton).toBeDefined();
      expect(skeleton?.id).toBe('profitability_bridge');
    });

    it('should select saas_growth for SaaS prompts', () => {
      const skeleton = selectSkeleton('Model ARR growth with churn');
      
      expect(skeleton).toBeDefined();
      expect(skeleton?.id).toBe('saas_growth');
    });

    it('should select pricing_sensitivity for pricing prompts', () => {
      const skeleton = selectSkeleton('What is the impact of a price increase?');
      
      expect(skeleton).toBeDefined();
      expect(skeleton?.id).toBe('pricing_sensitivity');
    });

    it('should select churn_roi for churn prompts', () => {
      const skeleton = selectSkeleton('Calculate ROI of churn reduction');
      
      expect(skeleton).toBeDefined();
      expect(skeleton?.id).toBe('churn_roi');
    });

    it('should select market_entry_light for market entry prompts', () => {
      const skeleton = selectSkeleton('Should we enter a new market?');
      
      expect(skeleton).toBeDefined();
      expect(skeleton?.id).toBe('market_entry_light');
    });

    it('should return null for non-matching prompts', () => {
      const skeleton = selectSkeleton('What is revenue?');
      
      expect(skeleton).toBeNull();
    });
  });

  describe('buildModelFromSkeleton', () => {
    it('should build model artifact with quarterly periods', () => {
      const skeleton = MODEL_SKELETONS[0];
      const artifact = buildModelFromSkeleton(skeleton);
      
      expect(artifact.model?.index.frequency).toBe('quarterly');
      expect(artifact.model?.index.periods.length).toBe(8);
    });

    it('should have 6-12 inputs', () => {
      for (const skeleton of MODEL_SKELETONS) {
        const artifact = buildModelFromSkeleton(skeleton);
        const inputCount = artifact.model?.inputs.length || 0;
        
        expect(inputCount).toBeGreaterThanOrEqual(6);
        expect(inputCount).toBeLessThanOrEqual(12);
      }
    });

    it('should have 2-4 charts', () => {
      for (const skeleton of MODEL_SKELETONS) {
        const artifact = buildModelFromSkeleton(skeleton);
        const chartCount = artifact.charts?.length || 0;
        
        expect(chartCount).toBeGreaterThanOrEqual(2);
        expect(chartCount).toBeLessThanOrEqual(4);
      }
    });

    it('should have objective_metric_key set', () => {
      for (const skeleton of MODEL_SKELETONS) {
        const artifact = buildModelFromSkeleton(skeleton);
        
        expect(artifact.model?.objective_metric_key).toBeDefined();
        expect(artifact.model?.objective_metric_label).toBeDefined();
      }
    });

    it('should have equations for all outputs', () => {
      for (const skeleton of MODEL_SKELETONS) {
        const artifact = buildModelFromSkeleton(skeleton);
        
        if (artifact.model?.outputs && artifact.model?.equations) {
          // Each output should have an equation or be an input
          const outputKeys = new Set(artifact.model.outputs.map(o => o.key));
          const equationKeys = new Set(artifact.model.equations.map(e => e.key));
          const inputKeys = new Set(artifact.model.inputs.map(i => i.key));
          
          for (const outputKey of outputKeys) {
            expect(equationKeys.has(outputKey) || inputKeys.has(outputKey)).toBe(true);
          }
        }
      }
    });
  });
});


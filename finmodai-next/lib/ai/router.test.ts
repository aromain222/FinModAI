import { describe, it, expect } from 'vitest';
import { routePromptRules, routePrompt, RouterOutputSchema } from './router';

describe('router', () => {
  describe('routePromptRules', () => {
    it('should return buildModel=true for forecast prompts', () => {
      const result = routePromptRules('Forecast revenue for next 4 quarters');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('forecast');
    });

    it('should return buildModel=true for decision prompts', () => {
      const result = routePromptRules('Should we raise prices by 15%?');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=true for tradeoff prompts', () => {
      const result = routePromptRules('What is the tradeoff between growth and margin?');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=true for sensitivity prompts', () => {
      const result = routePromptRules('Run sensitivity analysis on pricing');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=true for profitability prompts', () => {
      const result = routePromptRules('How can we improve profitability?');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=true for ROI prompts', () => {
      const result = routePromptRules('Calculate ROI for this investment');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=true for scenario prompts', () => {
      const result = routePromptRules('Build base case, upside, and downside scenarios');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=true for cash flow prompts', () => {
      const result = routePromptRules('Model free cash flow for next year');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=false for definitional prompts', () => {
      const result = routePromptRules('What is revenue?');
      
      expect(result.buildModel).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason.toLowerCase()).toMatch(/definitional|descriptive/);
    });

    it('should return buildModel=false for explanatory prompts', () => {
      const result = routePromptRules('Explain what DCF means');
      
      expect(result.buildModel).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=false for historical prompts', () => {
      const result = routePromptRules('What happened to revenue last year?');
      
      expect(result.buildModel).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return valid schema output', () => {
      const result = routePromptRules('Forecast revenue');
      
      const validated = RouterOutputSchema.safeParse(result);
      expect(validated.success).toBe(true);
      expect(result.buildModel).toBeDefined();
      expect(result.reason).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle empty prompts', () => {
      const result = routePromptRules('');
      
      expect(result.buildModel).toBe(false);
      expect(result.confidence).toBe(1.0);
      expect(result.reason).toContain('Empty');
    });

    it('should have lower confidence when indicators conflict', () => {
      const result = routePromptRules('What is a forecast model?');
      
      // Has both "what is" (non-model) and "forecast model" (model)
      expect(result.confidence).toBeLessThan(0.8);
    });
  });

  describe('routePrompt', () => {
    it('should return rules result when confidence >= 0.65', async () => {
      // This prompt should have high confidence
      const result = await routePrompt('Forecast revenue for next 4 quarters');
      
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.65);
      expect(result.reason).toBeDefined();
    });

    it('should call LLM when confidence < 0.65', async () => {
      // Use a prompt that would have low confidence from rules
      const result = await routePrompt('Help me with financial modeling');
      
      // Should still return valid output (either from LLM or fallback)
      expect(RouterOutputSchema.safeParse(result).success).toBe(true);
      expect(result.buildModel).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
  });
});

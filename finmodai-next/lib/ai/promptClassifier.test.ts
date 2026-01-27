import { describe, it, expect } from 'vitest';
import { classifyPrompt } from './promptClassifier';

describe('promptClassifier', () => {
  describe('classifyPrompt', () => {
    it('should return buildModel=true for forecasting prompts', () => {
      const result = classifyPrompt('Forecast revenue for next 4 quarters');
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('Model required');
    });

    it('should return buildModel=true for scenario prompts', () => {
      const result = classifyPrompt('What if we raise prices by 15%?');
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('Model required');
    });

    it('should return buildModel=true for ROI prompts', () => {
      const result = classifyPrompt('What is the ROI of this investment?');
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=true for tradeoff prompts', () => {
      const result = classifyPrompt('Should we prioritize growth vs margin?');
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('growth_margin_tradeoff');
    });

    it('should return buildModel=true for sensitivity prompts', () => {
      const result = classifyPrompt('Run a sensitivity analysis on pricing');
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return buildModel=false for definitional prompts', () => {
      const result = classifyPrompt('What is revenue recognition?');
      expect(result.buildModel).toBe(false);
      expect(result.reason).toContain('definitional');
    });

    it('should return buildModel=false for descriptive prompts', () => {
      const result = classifyPrompt('Explain how revenue recognition works');
      expect(result.buildModel).toBe(false);
      expect(result.reason).toContain('descriptive');
    });

    it('should return buildModel=false for historical prompts', () => {
      const result = classifyPrompt('What happened to our revenue last year?');
      expect(result.buildModel).toBe(false);
    });

    it('should handle empty prompts', () => {
      const result = classifyPrompt('');
      expect(result.buildModel).toBe(false);
      expect(result.confidence).toBe(1.0);
      expect(result.reason).toContain('Empty');
    });

    it('should return valid confidence range', () => {
      const results = [
        classifyPrompt('Forecast revenue for next 4 quarters'),
        classifyPrompt('What is a DCF?'),
        classifyPrompt('Run sensitivity analysis'),
      ];

      results.forEach((result) => {
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should handle complex prompts with multiple indicators', () => {
      const result = classifyPrompt(
        'Build a forecast model showing revenue growth vs margin tradeoffs over the next 8 quarters with sensitivity analysis'
      );
      expect(result.buildModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7); // High confidence with multiple signals
    });

    it('should prioritize model indicators over non-model indicators', () => {
      const result = classifyPrompt(
        'What is forecasting? Forecast revenue for Q1-Q4'
      );
      // Even though "What is" is definitional, "forecast" should win
      expect(result.buildModel).toBe(true);
    });
  });
});


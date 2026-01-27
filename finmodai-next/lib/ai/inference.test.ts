import { describe, expect, it, vi } from 'vitest';

import { inferOutputType, inferOutputTypeRules } from './inference';

describe('output type inference', () => {
  it('classifies obvious prompts via rules', async () => {
    const sql = await inferOutputType('Write a SQL query to join orders and users');
    expect(sql.type).toBe('SQL_QUERY');
    expect(sql.method).toBe('rules');
    expect(sql.confidence).toBeGreaterThan(0.7);

    const slides = await inferOutputType('Create a slide deck outline for an investor update');
    expect(slides.type).toBe('SLIDE_OUTLINE');
    expect(slides.method).toBe('rules');

    const scenario = await inferOutputType('Create base/upside/downside scenarios for TSLA margins');
    expect(scenario.type).toBe('SCENARIO_ENGINE');
    expect(scenario.method).toBe('rules');

    const impact = await inferOutputType('Event: hurricane hits Gulf Coast — market impact');
    expect(impact.type).toBe('MARKET_IMPACT_BRIEF');
    expect(impact.method).toBe('rules');
  });

  it('uses LLM only when rules are uncertain', async () => {
    const llm = vi.fn(async () => ({ type: 'CHECKLIST' }));

    const uncertain = await inferOutputType('Create a plan', { llmInferType: llm });
    expect(uncertain.method).toBe('llm');
    expect(uncertain.type).toBe('CHECKLIST');
    expect(llm).toHaveBeenCalledTimes(1);

    llm.mockClear();
    const certain = await inferOutputType('Write a SQL query: select * from users', { llmInferType: llm });
    expect(certain.type).toBe('SQL_QUERY');
    expect(certain.method).toBe('rules');
    expect(llm).toHaveBeenCalledTimes(0);
  });

  it('falls back to rules when LLM returns invalid type', async () => {
    const llm = vi.fn(async () => ({ type: 'NOT_A_REAL_TYPE' }));
    const out = await inferOutputType('Create a plan', { llmInferType: llm });
    expect(out.method).toBe('rules');
    expect(out.reason).toContain('llm_invalid_type');
  });

  it('marks ambiguous when low confidence', () => {
    const out = inferOutputTypeRules('Plan');
    expect(out.ambiguous).toBe(true);
    expect(out.confidence).toBeLessThan(0.6);
  });
});


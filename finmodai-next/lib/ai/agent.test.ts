import { describe, expect, it } from 'vitest';

import { AgentOutputSchema } from './schemas';
import { __private__, runOutputAgent } from './agent';

describe('ai output agent', () => {
  it('infers output type deterministically', () => {
    expect(__private__.inferOutputTypeRules('Write a SQL query to join orders and users').type).toBe('SQL_QUERY');
    expect(__private__.inferOutputTypeRules('Create a slide deck outline for an investor update').type).toBe('SLIDE_OUTLINE');
    expect(__private__.inferOutputTypeRules('Create base/upside/downside scenarios for TSLA margins').type).toBe('SCENARIO_ENGINE');
    expect(__private__.inferOutputTypeRules('Event: hurricane hits Gulf Coast — market impact').type).toBe('MARKET_IMPACT_BRIEF');
  });

  it('returns valid output without LLM', async () => {
    const output = await runOutputAgent({ prompt: 'Forecast Xbox sales in Q4' });
    const parsed = AgentOutputSchema.parse(output);
    expect(parsed.type).toBe('FORECAST_BLUEPRINT');
    expect(parsed.id).toMatch(/[0-9a-f-]{36}/i);
    expect(parsed.render_hints.primary_blocks.length).toBeGreaterThan(0);
    expect(parsed.render_blocks.length).toBeGreaterThan(0);
  });

  it('validates example prompts across types', async () => {
    const out1 = await runOutputAgent({ prompt: 'Forecast Xbox sales in Q4' });
    AgentOutputSchema.parse(out1);

    const out2 = await runOutputAgent({ prompt: 'Create a downside/base/upside scenario for NVDA gross margin next 6 quarters' });
    AgentOutputSchema.parse(out2);

    const out3 = await runOutputAgent({ prompt: 'Event: major hurricane hits Gulf Coast — market impact brief' });
    AgentOutputSchema.parse(out3);
  });

  it('resolves clarifying questions with followup answers', async () => {
    const ambiguousPrompt = 'Forecast Xbox sales scenario';
    const first = AgentOutputSchema.parse(await __private__.runOutputAgentInternal({ prompt: ambiguousPrompt }, { llm: null }));
    expect(first.clarifying_questions.length).toBeGreaterThan(0);

    const followup_answers = Object.fromEntries(first.clarifying_questions.map((q) => [q, 'Answered']));
    const second = AgentOutputSchema.parse(
      await __private__.runOutputAgentInternal(
        {
          prompt: ambiguousPrompt,
          followup_answers,
        },
        { llm: null }
      )
    );

    expect(second.clarifying_questions.length).toBe(0);
    expect(second.confidence).toBeGreaterThan(first.confidence);
  });

  it('retries once when LLM output fails schema validation', async () => {
    const calls: Array<{ mode: string; issues?: string[] }> = [];

    const fakeLlm = async (req: any) => {
      calls.push({ mode: req.mode, issues: req.issues });
      if (req.mode === 'generate') {
        return { title: 'Bad', summary: 'Bad', confidence: 0.5, clarifying_questions: [], warnings: [] }; // missing artifact
      }
      return {
        title: 'Fixed',
        summary: 'Fixed summary',
        confidence: 0.6,
        clarifying_questions: [],
        warnings: [],
        artifact: req.draftArtifact,
      };
    };

    const output = await __private__.runOutputAgentInternal(
      { prompt: 'Create a scenario engine for margins' },
      { llm: fakeLlm }
    );

    const parsed = AgentOutputSchema.parse(output);
    expect(parsed.title).toBe('Fixed');
    expect(calls.map((c) => c.mode)).toEqual(['generate', 'fix']);
  });
});

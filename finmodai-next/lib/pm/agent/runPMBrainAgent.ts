import OpenAI from 'openai';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import {
  pmBrainAgentInputSchema,
  pmBrainAgentJsonSchema,
  type PMBrainAgentInput,
  type PMBrainAgentRunResult,
} from '@/lib/pm/agent/schemas';
import { buildPMBrainAgentUserPrompt, PM_BRAIN_AGENT_SYSTEM_PROMPT } from '@/lib/pm/agent/prompt';
import { fallbackPMBrainDecision, normalizePMBrainDecision, parsePMBrainAgentJson } from '@/lib/pm/agent/parser';

const MAX_OUTPUT_TOKENS = 900;

function responseText(response: unknown): string {
  const candidate = response as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
  };
  if (typeof candidate.output_text === 'string' && candidate.output_text.trim()) return candidate.output_text;
  for (const chunk of candidate.output ?? []) {
    for (const item of chunk.content ?? []) {
      if ((item.type === 'output_text' || item.type === 'text') && typeof item.text === 'string') {
        return item.text;
      }
    }
  }
  throw new Error('PM Brain Agent returned no text payload.');
}

function fallback(input: PMBrainAgentInput, error: unknown): PMBrainAgentRunResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    decision: fallbackPMBrainDecision(input, message),
    source: 'fallback',
    error: message,
  };
}

export async function runPMBrainAgent(input: unknown): Promise<PMBrainAgentRunResult> {
  const parsedInput = pmBrainAgentInputSchema.parse(input);
  const apiKey = getOpenAIKey('service') || getOpenAIKey('user');
  if (!apiKey) return fallback(parsedInput, 'OpenAI API key is not configured.');

  const client = new OpenAI({ apiKey });
  const models = getOpenAIModelCandidates(process.env.PM_BRAIN_AGENT_MODEL, process.env.OPENAI_MODEL, 'gpt-4o-mini');
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const response = await client.responses.create({
        model,
        temperature: 0.15,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: [
          { role: 'system', content: PM_BRAIN_AGENT_SYSTEM_PROMPT },
          { role: 'user', content: buildPMBrainAgentUserPrompt(parsedInput) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: pmBrainAgentJsonSchema.name,
            schema: pmBrainAgentJsonSchema.schema,
            strict: true,
          },
        },
      } as never);

      const parsedDecision = parsePMBrainAgentJson(responseText(response), parsedInput.ticker);
      return {
        ok: true,
        decision: normalizePMBrainDecision(parsedDecision, parsedInput.ticker),
        source: 'openai',
        model,
      };
    } catch (err) {
      lastError = err;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[pm-brain-agent] model failed', {
          model,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return fallback(parsedInput, lastError ?? 'PM Brain Agent failed across all model candidates.');
}

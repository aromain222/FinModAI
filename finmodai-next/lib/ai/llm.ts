import 'server-only';

import OpenAI from 'openai';
import { ENV } from '@/lib/env/server';
import { logger } from '@/lib/api/logger';

/**
 * LLM Client wrapper
 * Handles OpenAI API calls with retry logic and error handling
 */

export type LLMCallOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  userPrompt: string;
  responseFormat?: { type: 'json_object' };
  traceId?: string;
};

export type LLMResponse = {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!ENV.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: ENV.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Call OpenAI API with retry logic
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const { traceId = 'unknown', systemPrompt, userPrompt, model = ENV.OPENAI_MODEL || 'gpt-4o-mini', temperature = 0.3, maxTokens = 4000, responseFormat } = options;

  if (!ENV.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const client = getOpenAIClient();

  try {
    logger.info({ traceId, model, hasSystemPrompt: !!systemPrompt }, 'llm:call:start');

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const startTime = Date.now();
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(responseFormat && { response_format: responseFormat }),
    });

    const elapsed = Date.now() - startTime;
    const content = completion.choices[0]?.message?.content || '';

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const usage = completion.usage ? {
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens,
    } : undefined;

    logger.info(
      {
        traceId,
        model,
        elapsed,
        usage,
        contentLength: content.length,
      },
      'llm:call:success'
    );

    return {
      content,
      usage,
    };
  } catch (error: any) {
    logger.error(
      {
        traceId,
        model,
        error: error?.message || String(error),
        code: error?.code,
      },
      'llm:call:error'
    );
    throw error;
  }
}

/**
 * Parse JSON from LLM response with retry support
 */
export function parseJSONResponse<T>(content: string, traceId?: string): T {
  try {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : content.trim();

    // Remove leading/trailing whitespace and any non-JSON prefix
    const cleaned = jsonString.replace(/^[^{]*/, '').replace(/[^}]*$/, '');

    const parsed = JSON.parse(cleaned) as T;
    return parsed;
  } catch (error: any) {
    logger.error(
      {
        traceId,
        error: error?.message || String(error),
        contentPreview: content.substring(0, 200),
      },
      'llm:parse_json:error'
    );
    throw new Error(`Failed to parse JSON response: ${error?.message || String(error)}`);
  }
}


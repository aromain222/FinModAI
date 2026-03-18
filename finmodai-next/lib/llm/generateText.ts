import OpenAI from 'openai';
import {
  getAnthropicKeyCandidates,
  getAnthropicModelCandidates,
  type AnthropicClientType,
} from '@/lib/anthropicKey';
import {
  getOpenAIKeyCandidates,
  getOpenAIModelCandidates,
  type OpenAIClientType,
} from '@/lib/openaiKey';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ProviderPreference = 'anthropic' | 'openai';

export type GenerateTextParams = {
  messages: LlmMessage[];
  clientType?: OpenAIClientType | AnthropicClientType;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: ProviderPreference;
  openAiModels?: string[];
  anthropicModels?: string[];
};

export type GenerateTextResult = {
  text: string;
  provider: ProviderPreference;
  model: string;
};

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0)));
}

function normalizeMessages(messages: LlmMessage[]): { system: string | null; chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const systemParts: string[] = [];
  const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const message of messages) {
    if (!message.content?.trim()) continue;
    if (message.role === 'system') {
      systemParts.push(message.content.trim());
      continue;
    }
    chatMessages.push({ role: message.role, content: message.content.trim() });
  }
  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : null,
    chatMessages,
  };
}

function extractOpenAIText(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const row = response as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = row.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim().length > 0) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part === 'object' && 'text' in part ? (part as { text?: unknown }).text : null))
      .filter((part): part is string => typeof part === 'string')
      .join('\n')
      .trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

async function generateWithOpenAI(params: GenerateTextParams): Promise<GenerateTextResult | null> {
  const clientType = params.clientType ?? 'service';
  const apiKeys = getOpenAIKeyCandidates(clientType);
  const models = dedupe(params.openAiModels ?? getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4'));
  if (!apiKeys.length || !models.length) return null;

  const { system, chatMessages } = normalizeMessages(params.messages);
  const openAiMessages = system ? [{ role: 'system' as const, content: system }, ...chatMessages] : chatMessages;
  if (!openAiMessages.some((message) => message.role === 'user')) return null;

  let lastError: unknown = null;
  for (const apiKey of apiKeys) {
    const client = new OpenAI({ apiKey });
    for (const model of models) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: openAiMessages,
          temperature: params.temperature ?? 0.2,
          max_tokens: params.maxTokens ?? 900,
        });
        const text = extractOpenAIText(completion);
        if (text) {
          return { text, provider: 'openai', model };
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function generateWithAnthropic(params: GenerateTextParams): Promise<GenerateTextResult | null> {
  const clientType = params.clientType ?? 'service';
  const apiKeys = getAnthropicKeyCandidates(clientType);
  const models = dedupe(params.anthropicModels ?? getAnthropicModelCandidates(process.env.ANTHROPIC_MODEL));
  if (!apiKeys.length || !models.length) return null;

  const { system, chatMessages } = normalizeMessages(params.messages);
  if (!chatMessages.some((message) => message.role === 'user')) return null;

  let lastError: unknown = null;
  for (const apiKey of apiKeys) {
    for (const model of models) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            system: system ?? undefined,
            messages: chatMessages.map((message) => ({
              role: message.role,
              content: [{ type: 'text', text: message.content }],
            })),
            temperature: params.temperature ?? 0.2,
            max_tokens: params.maxTokens ?? 900,
          }),
          cache: 'no-store',
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Anthropic request failed (${response.status}): ${text}`);
        }
        const payload = (await response.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };
        const text = (payload.content ?? [])
          .filter((part) => part?.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text!.trim())
          .filter(Boolean)
          .join('\n')
          .trim();
        if (text) {
          return { text, provider: 'anthropic', model };
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

export async function generateTextWithProviderFallback(params: GenerateTextParams): Promise<GenerateTextResult | null> {
  const providerOrder: ProviderPreference[] =
    (params.preferredProvider ?? 'anthropic') === 'anthropic' ? ['anthropic', 'openai'] : ['openai', 'anthropic'];

  let lastError: unknown = null;
  for (const provider of providerOrder) {
    try {
      const result = provider === 'anthropic' ? await generateWithAnthropic(params) : await generateWithOpenAI(params);
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

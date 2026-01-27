import OpenAI from 'openai';
import { z } from 'zod';
import { ENV, keysPresent } from '@/lib/env/server';

const openai = keysPresent.openai ? new OpenAI({ apiKey: ENV.OPENAI_API_KEY as string }) : null;

const SourceSchema = z.object({
  name: z.string(),
  url: z.string().url().nullable(),
  snippet: z.string().nullable(),
});

const OpenAiFactsSchema = z.object({
  shares_outstanding: z.number().nullable(),
  shares_units: z.enum(['shares', 'millions', 'billions']).nullable(),
  market_price: z.number().nullable(),
  currency: z.string().nullable(),
  net_debt: z.number().nullable(),
  as_of_date: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  sources: z.array(SourceSchema).default([]),
});

export type OpenAiFacts = z.infer<typeof OpenAiFactsSchema>;

const clip = (text: string, max = 9000) => (text.length > max ? `${text.slice(0, max)}\n...[TRUNCATED]` : text);

export async function openaiExtractFacts(params: {
  ticker: string;
  sources: Array<{ url: string; text: string }>;
  candidates?: Record<string, any>;
}): Promise<OpenAiFacts | null> {
  if (!openai) return null;
  if (!params.sources.length) return null;

  const bundle = params.sources
    .map((s, idx) => `SOURCE ${idx + 1}\nURL: ${s.url}\nTEXT:\n${clip(s.text)}\n`)
    .join('\n---\n');

  const prompt = [
    `Ticker: ${params.ticker}`,
    params.candidates ? `Known candidates: ${JSON.stringify(params.candidates)}` : null,
    'Extract the most recent shares outstanding and market price if present. Net debt is optional.',
    'Use only provided sources. If not present, return null.',
    bundle,
  ]
    .filter(Boolean)
    .join('\n\n');

  const schemaJson = {
    name: 'enriched_facts',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        shares_outstanding: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        shares_units: { anyOf: [{ type: 'string', enum: ['shares', 'millions', 'billions'] }, { type: 'null' }] },
        market_price: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        currency: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        net_debt: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        as_of_date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              url: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              snippet: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
            required: ['name', 'url', 'snippet'],
          },
        },
      },
      required: [
        'shares_outstanding',
        'shares_units',
        'market_price',
        'currency',
        'net_debt',
        'as_of_date',
        'notes',
        'confidence',
        'sources',
      ],
    },
    strict: true,
  };

  try {
    const resp = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      temperature: 0,
      text: {
        format: {
          type: 'json_schema',
          name: schemaJson.name,
          schema: schemaJson.schema,
          strict: schemaJson.strict,
        },
      },
      input: [
        {
          role: 'system',
          content:
            'You extract factual financial data from provided sources only. Do not guess. Return nulls if missing.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const outText = resp.output_text?.trim() ?? '';
    const parsed = JSON.parse(outText);
    const validated = OpenAiFactsSchema.safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
}

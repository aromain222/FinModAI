import OpenAI from 'openai';
import { z } from 'zod';
import { getOpenAIKey } from '@/lib/openaiKey';

export type NetDebtRefineInput = {
  companyName: string;
  ticker: string;
  sector: string;
  revenueLtm: number;
  ebitdaLtm: number | null;
  netIncomeLtm: number | null;
  fallback: {
    netDebt: number;
    ndToEbitda: number | null;
    confidence: 'high' | 'medium' | 'low';
    notes: string[];
  };
};

export type NetDebtRefineOutput = {
  netDebt: number;
  method: 'AI_REFINED' | 'RULES';
  confidence: 'medium' | 'low';
  assumptions: {
    ndToEbitda: number | null;
    notes: string[];
  };
};

export const NET_DEBT_AI_PROMPT = `
You are a senior financial analyst. Return JSON ONLY with keys:
{
  "estimatedNetDebt": number,
  "impliedNdToEbitda": number|null,
  "reasoning": string,
  "confidence": "medium"|"low"
}
Rules:
- Use USD millions.
- Reasoning must be 1-2 sentences.
- Do not include any extra keys or text outside JSON.
`.trim();

const AiResponseSchema = z.object({
  estimatedNetDebt: z.number(),
  impliedNdToEbitda: z.number().nullable(),
  reasoning: z.string(),
  confidence: z.enum(['medium', 'low']),
});

const cache = new Map<string, NetDebtRefineOutput>();

const safeJsonParse = (raw: string): unknown => {
  const trimmed = raw.trim().replace(/^```json|```$/g, '').trim();
  return JSON.parse(trimmed);
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildCacheKey(input: NetDebtRefineInput): string {
  const asOfDate = new Date().toISOString().slice(0, 10);
  return `${input.ticker.toUpperCase()}_${asOfDate}`;
}

export async function refineNetDebtWithAI(
  input: NetDebtRefineInput,
  forceAI: boolean = false
): Promise<NetDebtRefineOutput> {
  if (!forceAI && input.fallback.confidence !== 'low') {
    return {
      netDebt: input.fallback.netDebt,
      method: 'RULES',
      confidence: input.fallback.confidence === 'high' ? 'medium' : input.fallback.confidence,
      assumptions: {
        ndToEbitda: input.fallback.ndToEbitda,
        notes: input.fallback.notes,
      },
    };
  }

  const cacheKey = buildCacheKey(input);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const apiKey = getOpenAIKey('service');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured for net debt refinement.');
  }

  const openai = new OpenAI({ apiKey });
  const payload = {
    companyName: input.companyName,
    ticker: input.ticker,
    sector: input.sector,
    revenueLtm: input.revenueLtm,
    ebitdaLtm: input.ebitdaLtm,
    netIncomeLtm: input.netIncomeLtm,
    fallback: input.fallback,
  };

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: NET_DEBT_AI_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content || '';
  const parsed = AiResponseSchema.parse(safeJsonParse(content));

  let netDebt = parsed.estimatedNetDebt;
  let impliedNdToEbitda = parsed.impliedNdToEbitda;
  let confidence: 'medium' | 'low' = parsed.confidence;
  const notes = [
    parsed.reasoning,
    `AI refinement from fallback confidence=${input.fallback.confidence}.`,
  ];

  if (input.ebitdaLtm !== null && input.ebitdaLtm > 0) {
    const lower = -1.0;
    const upper = 5.0;
    const currentMultiple = netDebt / input.ebitdaLtm;
    if (currentMultiple < lower || currentMultiple > upper) {
      const clampedMultiple = clamp(currentMultiple, lower, upper);
      netDebt = clampedMultiple * input.ebitdaLtm;
      impliedNdToEbitda = clampedMultiple;
      confidence = 'low';
      notes.push(`Clamped ND/EBITDA to ${clampedMultiple.toFixed(2)}x.`);
    }
  }

  const output: NetDebtRefineOutput = {
    netDebt,
    method: 'AI_REFINED',
    confidence,
    assumptions: {
      ndToEbitda: impliedNdToEbitda ?? null,
      notes,
    },
  };

  cache.set(cacheKey, output);
  return output;
}

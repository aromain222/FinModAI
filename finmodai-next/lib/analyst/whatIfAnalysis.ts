import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

const WHAT_IF_SYSTEM_PROMPT = `You are a financial modeling assistant.

You must support "what-if" analysis on a live financial model.

When a user asks a hypothetical (e.g. "what if margins drop 2%" or "what if rates fall 100bps"):

1. Identify which model variable is being changed:

* revenue growth
* operating margin
* discount rate

2. Apply the change to the existing base model.

3. Recompute valuation relative to the base case.

4. Output the result in structured format.

---

## OUTPUT FORMAT (JSON ONLY)

{
  "change_applied": {
    "variable": "growth|margin|discount_rate",
    "delta": number
  },
  "base_valuation": number,
  "new_valuation": number,
  "percent_change": number,
  "direction": "up|down",
  "interpretation": ""
}

---

## RULES

* Do NOT re-extract events
* Do NOT summarize
* Only modify the specified variable
* Keep all other assumptions constant
* Be precise and consistent
* Output valid JSON only

Your goal is to simulate how changes in assumptions affect valuation in real time.`;

export const whatIfResultSchema = z.object({
  change_applied: z.object({
    variable: z.enum(['growth', 'margin', 'discount_rate']),
    delta: z.number(),
  }),
  base_valuation: z.number(),
  new_valuation: z.number(),
  percent_change: z.number(),
  direction: z.enum(['up', 'down']),
  interpretation: z.string(),
});

export type WhatIfResult = z.infer<typeof whatIfResultSchema>;

export type WhatIfInput = {
  query: string;
  base_assumptions: {
    revenue_growth: number;
    operating_margin: number;
    discount_rate: number;
    base_valuation?: number;
  };
};

function extractJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('no JSON object found');
  return JSON.parse(stripped.slice(first, last + 1));
}

export async function getWhatIfAnalysis(input: WhatIfInput): Promise<WhatIfResult | null> {
  try {
    const context = [
      `User question: ${input.query}`,
      `Base assumptions:`,
      `  revenue_growth: ${input.base_assumptions.revenue_growth}`,
      `  operating_margin: ${input.base_assumptions.operating_margin}`,
      `  discount_rate: ${input.base_assumptions.discount_rate}`,
      input.base_assumptions.base_valuation != null
        ? `  base_valuation: ${input.base_assumptions.base_valuation}`
        : null,
    ].filter(Boolean).join('\n');

    const response = await generateTextWithProviderFallback({
      clientType: 'service',
      preferredProvider: 'anthropic',
      temperature: 0.1,
      maxTokens: 400,
      messages: [
        { role: 'system', content: WHAT_IF_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
    });

    if (!response?.text) return null;

    const parsed = whatIfResultSchema.safeParse(extractJson(response.text));
    if (!parsed.success) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

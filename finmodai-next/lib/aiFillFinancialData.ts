import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';

type NullableNumber = number | null | undefined;

export type AiFillCompanyInput = {
  ticker: string;
  company_name?: string | null;
  share_price?: NullableNumber;
  market_cap?: NullableNumber;
  enterprise_value?: NullableNumber;
  shares_outstanding?: NullableNumber;
  [key: string]: unknown;
};

type AiFillPatch = {
  share_price: number | null;
  market_cap: number | null;
  enterprise_value: number | null;
  shares_outstanding: number | null;
};

type AiCompanyCacheRow = {
  ticker: string;
  share_price: number | null;
  market_cap: number | null;
  enterprise_value: number | null;
  updated_at?: string | null;
  source?: string | null;
};

const FIELDS: Array<keyof AiFillPatch> = [
  'share_price',
  'market_cap',
  'enterprise_value',
  'shares_outstanding',
];

const aiOutputSchema = z.object({
  share_price: z.number().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  enterprise_value: z.number().nullable().optional(),
  shares_outstanding: z.number().nullable().optional(),
});

function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function toValidPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined;
}

function missingFields(input: AiFillCompanyInput): Array<keyof AiFillPatch> {
  return FIELDS.filter((field) => isMissing(input[field]));
}

function applyPatchOnlyToMissing<T extends AiFillCompanyInput>(
  base: T,
  patch: Partial<AiFillPatch>
): T {
  const next = { ...base };
  for (const field of FIELDS) {
    if (!isMissing(base[field])) continue;
    const candidate = toValidPositiveNumber(patch[field]);
    if (candidate !== null) {
      next[field] = candidate;
    }
  }
  return next;
}

function cleanTicker(value: string): string {
  return value.trim().toUpperCase();
}

function safeParseJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  return JSON.parse(trimmed);
}

async function readAiCache(ticker: string): Promise<Partial<AiFillPatch> | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('ai_company_data')
    .select('ticker, share_price, market_cap, enterprise_value, updated_at, source')
    .eq('ticker', ticker)
    .maybeSingle<AiCompanyCacheRow>();

  if (error) {
    console.warn('[aiFillFinancialData] ai_company_data cache read failed:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    share_price: toValidPositiveNumber(data.share_price),
    market_cap: toValidPositiveNumber(data.market_cap),
    enterprise_value: toValidPositiveNumber(data.enterprise_value),
  };
}

async function writeAiCache(
  ticker: string,
  patch: Partial<AiFillPatch>
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return;

  const payload = {
    ticker,
    share_price: toValidPositiveNumber(patch.share_price),
    market_cap: toValidPositiveNumber(patch.market_cap),
    enterprise_value: toValidPositiveNumber(patch.enterprise_value),
    updated_at: new Date().toISOString(),
    source: 'ai_estimate',
  };

  const hasAnyCacheableValue =
    payload.share_price !== null || payload.market_cap !== null || payload.enterprise_value !== null;
  if (!hasAnyCacheableValue) return;

  const { error } = await supabase
    .from('ai_company_data')
    .upsert(payload, { onConflict: 'ticker' });

  if (error) {
    console.warn('[aiFillFinancialData] ai_company_data cache write failed:', error.message);
  }
}

function buildPrompt(company: AiFillCompanyInput): string {
  const existingData = {
    share_price: company.share_price ?? null,
    market_cap: company.market_cap ?? null,
    enterprise_value: company.enterprise_value ?? null,
    shares_outstanding: company.shares_outstanding ?? null,
  };

  return `You are a financial data assistant.

Fill in the missing financial fields for the company below.

Return ONLY valid JSON with the same keys.

Company: ${company.company_name ?? company.ticker}
Ticker: ${company.ticker}

Existing Data:
${JSON.stringify(existingData, null, 2)}

Rules:
- Only fill fields that are null
- Do not modify existing values
- Use realistic public market estimates
- If uncertain return null`;
}

async function generateAiPatch(company: AiFillCompanyInput): Promise<Partial<AiFillPatch> | null> {
  const apiKey = getOpenAIKey('service');
  if (!apiKey) {
    console.warn('[aiFillFinancialData] OpenAI key not configured; skipping AI generation');
    return null;
  }

  const client = new OpenAI({ apiKey });
  const prompt = buildPrompt(company);
  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4-pro', 'gpt-5.4');
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a financial data assistant. Return JSON only. Do not include markdown or explanatory text.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) continue;

      const parsedJson = safeParseJsonObject(raw);
      const parsed = aiOutputSchema.safeParse(parsedJson);
      if (!parsed.success) {
        console.warn('[aiFillFinancialData] AI JSON failed schema validation', {
          model,
          issues: parsed.error.issues.map((issue) => issue.message),
        });
        continue;
      }

      return {
        share_price: toValidPositiveNumber(parsed.data.share_price),
        market_cap: toValidPositiveNumber(parsed.data.market_cap),
        enterprise_value: toValidPositiveNumber(parsed.data.enterprise_value),
        shares_outstanding: toValidPositiveNumber(parsed.data.shares_outstanding),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn('[aiFillFinancialData] AI generation failed across model candidates');
  }
  return null;
}

/**
 * Fill missing financial fields for demo/company data.
 *
 * Merge order:
 * 1. API data (input object)
 * 2. AI cache (ai_company_data table)
 * 3. AI generation (OpenAI), only if fields remain missing
 */
export async function aiFillFinancialData<T extends AiFillCompanyInput>(company: T): Promise<T> {
  const ticker = cleanTicker(company.ticker || '');
  if (!ticker) return company;

  const normalizedInput = { ...company, ticker };
  const initialMissing = missingFields(normalizedInput);
  if (initialMissing.length === 0) {
    return normalizedInput;
  }

  const cachedPatch = await readAiCache(ticker);
  const withCache = cachedPatch
    ? applyPatchOnlyToMissing(normalizedInput, cachedPatch)
    : normalizedInput;

  const remainingAfterCache = missingFields(withCache);
  if (remainingAfterCache.length === 0) {
    return withCache;
  }

  const aiPatch = await generateAiPatch(withCache);
  if (!aiPatch) {
    return withCache;
  }

  const merged = applyPatchOnlyToMissing(withCache, aiPatch);
  const newlyFilled = FIELDS.some((field) => isMissing(withCache[field]) && !isMissing(merged[field]));

  if (newlyFilled) {
    await writeAiCache(ticker, aiPatch);
  }

  return merged;
}

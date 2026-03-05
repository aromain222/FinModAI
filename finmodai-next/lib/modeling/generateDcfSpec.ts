import OpenAI from 'openai';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { applyDcfOverrides, DcfOverridesSchema, DcfSpec, DcfSpecSchema, type DcfOverrides } from '@/lib/modeling/dcfSpec';

type CompanySeed = {
  name: string;
  ticker?: string;
  currency: string;
};

const DEFAULT_WACC = 0.1;
const DEFAULT_TERMINAL_G = 0.025;
const DEFAULT_YEARS = 5;

function inferCompany(prompt: string): CompanySeed {
  const text = prompt.toLowerCase();

  if (/(\bgoogle\b|\balphabet\b|\bgoogl\b|\bgoog\b)/i.test(text)) {
    return { name: 'Alphabet Inc.', ticker: 'GOOGL', currency: 'USD' };
  }

  const tickerMatch = prompt.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/);
  const ticker = tickerMatch?.[0];

  const entityMatch =
    prompt.match(/for\s+([A-Za-z0-9.&\-\s]{2,80})/i) ||
    prompt.match(/on\s+([A-Za-z0-9.&\-\s]{2,80})/i);

  const inferredName = entityMatch?.[1]?.trim();
  return {
    name: inferredName || ticker || 'Target Company',
    ticker,
    currency: 'USD',
  };
}

function bounded(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function makeGordonSensitivity(baseG: number): number[] {
  const raw = [baseG - 0.01, baseG - 0.005, baseG, baseG + 0.005, baseG + 0.01].map((v) => bounded(v, 0, 0.06));
  return Array.from(new Set(raw.map((n) => Number(n.toFixed(4)))));
}

function makeWaccSensitivity(baseWacc: number): number[] {
  const raw = [
    baseWacc - 0.02,
    baseWacc - 0.015,
    baseWacc - 0.01,
    baseWacc - 0.005,
    baseWacc,
    baseWacc + 0.005,
    baseWacc + 0.01,
    baseWacc + 0.015,
    baseWacc + 0.02,
  ].map((v) => bounded(v, 0.04, 0.2));

  return Array.from(new Set(raw.map((n) => Number(n.toFixed(4)))));
}

function defaultGrowthPath(years: number): number[] {
  const first = 0.11;
  const step = 0.015;
  return Array.from({ length: years }, (_, idx) => Number(bounded(first - idx * step, 0.025, 0.2).toFixed(4)));
}

function defaultMarginPath(years: number, baseMargin: number): number[] {
  return Array.from({ length: years }, (_, idx) => Number(bounded(baseMargin + idx * 0.004, 0, 0.6).toFixed(4)));
}

function buildDefaultSpec(prompt: string, inferred: CompanySeed): DcfSpec {
  const years = DEFAULT_YEARS;
  const currentYear = new Date().getFullYear();
  const isAlphabet = inferred.ticker === 'GOOGL';

  const baseRevenue = isAlphabet ? 350_000 : 25_000;
  const baseEbitMargin = isAlphabet ? 0.29 : 0.22;
  const terminalMethod: 'gordon' = 'gordon';

  const spec: DcfSpec = {
    company: {
      name: inferred.name,
      ticker: inferred.ticker,
      currency: inferred.currency,
    },
    periods: {
      start_year: currentYear,
      years,
    },
    base_year: {
      revenue: baseRevenue,
      ebit_margin: baseEbitMargin,
    },
    forecast: {
      revenue_growth: defaultGrowthPath(years),
      ebit_margin: defaultMarginPath(years, baseEbitMargin),
      tax_rate: 0.21,
      da_pct_rev: 0.03,
      capex_pct_rev: 0.045,
      nwc_pct_rev: 0.012,
    },
    valuation: {
      wacc: DEFAULT_WACC,
      terminal: terminalMethod === 'gordon' ? { method: 'gordon', g: DEFAULT_TERMINAL_G } : { method: 'exit_multiple', exit_multiple: 12 },
    },
    outputs: {
      sensitivity: {
        wacc: makeWaccSensitivity(DEFAULT_WACC),
        terminal_g: makeGordonSensitivity(DEFAULT_TERMINAL_G),
      },
    },
  };

  return DcfSpecSchema.parse(spec);
}

function extractJson(text: string): string {
  const raw = text.trim();
  if (raw.startsWith('{') && raw.endsWith('}')) return raw;

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return raw.slice(first, last + 1);
  }
  throw new Error('LLM output did not contain a JSON object');
}

function buildSystemPrompt(defaultSpec: DcfSpec): string {
  return [
    'You are CapitalBase DCF Spec Generator.',
    'Return ONLY valid JSON. No markdown, no prose, no code fences.',
    'Output must match this structure exactly: company, periods, base_year, forecast, valuation, outputs.',
    'No citations and no fabricated citations.',
    'Use conservative assumptions when user input is sparse.',
    'If prompt says Google, map to Alphabet Inc. with ticker GOOGL and currency USD.',
    'Ranges:',
    '- ebit margins 0 to 0.6',
    '- tax 0 to 0.4',
    '- wacc 0.04 to 0.2',
    '- terminal g 0 to 0.06',
    '- years 3 to 15',
    `Use this default baseline unless explicitly requested otherwise: ${JSON.stringify(defaultSpec)}`,
  ].join('\n');
}

async function generateWithLlm(prompt: string, defaultSpec: DcfSpec): Promise<DcfSpec | null> {
  const apiKey = getOpenAIKey('service') || getOpenAIKey('user');
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });
  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-4o-mini', 'gpt-4.1-mini');

  let lastError: unknown = null;
  for (const model of models) {
    try {
      const response = await openai.responses.create({
        model,
        temperature: 0,
        max_output_tokens: 1400,
        input: [
          { role: 'system', content: buildSystemPrompt(defaultSpec) },
          {
            role: 'user',
            content: `User prompt: ${prompt}\nReturn only the JSON DCF spec object.`,
          },
        ],
      });

      const raw = typeof response.output_text === 'string' ? response.output_text : '';
      const parsed = JSON.parse(extractJson(raw));
      return DcfSpecSchema.parse(parsed);
    } catch (error) {
      lastError = error;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[generateDcfSpec] model attempt failed', {
          model,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (process.env.NODE_ENV !== 'production' && lastError) {
    console.warn('[generateDcfSpec] falling back to deterministic defaults', {
      message: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }
  return null;
}

export async function generateDcfSpec(prompt: string, overrides?: DcfOverrides): Promise<DcfSpec> {
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!cleanPrompt) {
    throw new Error('prompt is required');
  }

  const parsedOverrides = DcfOverridesSchema.parse(overrides);
  const inferred = inferCompany(cleanPrompt);
  const defaultSpec = buildDefaultSpec(cleanPrompt, inferred);

  const modelSpec = await generateWithLlm(cleanPrompt, defaultSpec);
  const chosen = modelSpec ?? defaultSpec;

  return applyDcfOverrides(chosen, parsedOverrides);
}

import OpenAI from 'openai';
import { DcfSpecSchema, type DcfSpec } from '@/lib/modeling/dcfSpec';
import { evaluateDcfSpec } from '@/lib/modeling/buildDcfWorkbook';
import { loadDemoSnapshots, type DemoCompanySnapshot } from '@/lib/demo/demoSnapshotStore';
import { getOpenAIKeyCandidates, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { inferTickerFromPrompt } from '@/lib/analyst/retrieval';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';

export type AnalystDcfScenarioKey = 'base' | 'bull' | 'bear';

export type AnalystDcfScenarioResult = {
  name: 'Base' | 'Bull' | 'Bear';
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number | null;
  marketPrice: number | null;
  upsidePct: number | null;
  netDebt: number;
  stagePv: number;
  terminalValue: number;
  pvTerminalValue: number;
  terminalValueWeight: number | null;
};

export type AnalystDcfDemoPayload = {
  prompt: string;
  ticker: string;
  companyName: string;
  sector: string | null;
  currency: string;
  years: number;
  source: string;
  asOfDate: string | null;
  memo: string;
  warnings: string[];
  notes: string[];
  baseMetrics: {
    revenueLtm: number;
    ebitdaLtm: number;
    netIncomeLtm: number;
    cash: number;
    totalDebt: number;
    netDebt: number;
    sharesOutstanding: number | null;
    sharePrice: number | null;
    marketCap: number | null;
  };
  assumptions: {
    revenueGrowth: number[];
    ebitMargin: number[];
    taxRate: number;
    daPctRevenue: number;
    capexPctRevenue: number;
    nwcPctRevenue: number;
    wacc: number;
    terminalGrowth: number;
  };
  forecast: Array<{
    year: number;
    revenue: number;
    ebit: number;
    fcff: number;
  }>;
  scenarios: Record<AnalystDcfScenarioKey, AnalystDcfScenarioResult>;
};

type PromptParseResult = {
  years: number;
  impliedTicker?: string;
  overrides: Partial<{
    wacc: number;
    terminalGrowth: number;
  }>;
  tone: 'base' | 'bull' | 'bear';
};

type DeterministicAssumptions = {
  revenueGrowth: number[];
  ebitMargin: number[];
  taxRate: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  wacc: number;
  terminalGrowth: number;
  notes: string[];
};

type AiAssumptionPatch = Partial<DeterministicAssumptions>;

type ResolvedCompany = {
  ticker: string;
  snapshot: DemoCompanySnapshot;
  source: string;
  asOfDate: string | null;
};

const DEFAULT_YEARS = 5;
const COMPANY_SUFFIX_RE =
  /\b(incorporated|inc|corp|corporation|holdings|holding|group|plc|limited|ltd|co|company)\b/gi;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizePromptText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCompanyName(value: string): string {
  return normalizePromptText(value).replace(COMPANY_SUFFIX_RE, '').replace(/\s+/g, ' ').trim();
}

function parsePercentLike(match: RegExpMatchArray | null): number | undefined {
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed > 1 ? parsed / 100 : parsed;
}

export function parseDcfPrompt(prompt: string, explicitTicker?: string): PromptParseResult {
  const cleanPrompt = prompt.trim();
  const yearsMatch =
    cleanPrompt.match(/\b(\d{1,2})\s*[- ]?year\b/i) ||
    cleanPrompt.match(/\b(\d{1,2})Y\b/i);
  const years = clamp(Number(yearsMatch?.[1] || DEFAULT_YEARS), 3, 10);

  const wacc =
    parsePercentLike(cleanPrompt.match(/\b(?:at|with)?\s*(\d{1,2}(?:\.\d+)?)\s*%?\s*wacc\b/i)) ??
    parsePercentLike(cleanPrompt.match(/\bwacc\s*(?:of|at|=)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i));
  const terminalGrowth =
    parsePercentLike(cleanPrompt.match(/\b(?:at|with)?\s*(\d(?:\.\d+)?)\s*%?\s*(?:terminal growth|terminal g)\b/i)) ??
    parsePercentLike(cleanPrompt.match(/\b(?:terminal growth|terminal g)\s*(?:of|at|=)?\s*(\d(?:\.\d+)?)\s*%/i));

  const normalizedPrompt = normalizePromptText(cleanPrompt);
  let tone: 'base' | 'bull' | 'bear' = 'base';
  if (/\b(aggressive|bull|upside|optimistic)\b/.test(normalizedPrompt)) tone = 'bull';
  if (/\b(conservative|bear|downside|stress)\b/.test(normalizedPrompt)) tone = 'bear';

  return {
    years,
    impliedTicker: explicitTicker?.trim().toUpperCase() || inferTickerFromPrompt(cleanPrompt),
    overrides: {
      ...(typeof wacc === 'number' ? { wacc: clamp(wacc, 0.05, 0.18) } : {}),
      ...(typeof terminalGrowth === 'number' ? { terminalGrowth: clamp(terminalGrowth, 0.01, 0.04) } : {}),
    },
    tone,
  };
}

function resolveCompanyFromPrompt(
  prompt: string,
  explicitTicker: string | undefined,
  snapshots: Record<string, DemoCompanySnapshot>
): ResolvedCompany | null {
  const parsed = parseDcfPrompt(prompt, explicitTicker);

  const tickerCandidates = [explicitTicker, parsed.impliedTicker]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toUpperCase());

  for (const ticker of tickerCandidates) {
    if (snapshots[ticker]) {
      return {
        ticker,
        snapshot: snapshots[ticker],
        source: 'demo_company_snapshots',
        asOfDate: snapshots[ticker]?.updatedAt ?? null,
      };
    }
  }

  const normalizedPrompt = normalizePromptText(prompt);
  let best: ResolvedCompany | null = null;
  let bestScore = 0;

  for (const [ticker, snapshot] of Object.entries(snapshots)) {
    const fullName = normalizePromptText(snapshot.companyName || '');
    const strippedName = normalizeCompanyName(snapshot.companyName || '');
    if (!fullName && !strippedName) continue;

    let score = 0;
    if (strippedName && normalizedPrompt.includes(strippedName)) score = Math.max(score, strippedName.length);
    if (fullName && normalizedPrompt.includes(fullName)) score = Math.max(score, fullName.length + 10);

    if (score > bestScore) {
      bestScore = score;
      best = {
        ticker,
        snapshot,
        source: 'demo_company_snapshots',
        asOfDate: snapshot.updatedAt ?? null,
      };
    }
  }

  return best;
}

function mapStoredProfileToSnapshot(
  resolved: Awaited<ReturnType<typeof resolveCompanyProfile>>
): ResolvedCompany | null {
  if (!resolved?.snapshot) return null;

  return {
    ticker: resolved.company.ticker,
    source: 'company_snapshots',
    asOfDate: resolved.snapshot.asOfDate ?? null,
    snapshot: {
      ticker: resolved.company.ticker,
      companyName: resolved.company.name,
      sector: resolved.company.sector ?? resolved.company.companyType ?? null,
      revenueLtm: resolved.snapshot.revenueLtm,
      ebitdaLtm: resolved.snapshot.ebitdaLtm ?? resolved.snapshot.ebitLtm,
      netIncomeLtm: resolved.snapshot.netIncomeLtm,
      cash: resolved.snapshot.cash,
      totalDebt: resolved.snapshot.totalDebt,
      sharesOutstanding: resolved.snapshot.sharesOutstanding,
      sharePrice: resolved.latestPrice?.close ?? null,
      marketCap: resolved.snapshot.marketCap,
      updatedAt: resolved.snapshot.asOfDate ?? null,
    },
  };
}

async function resolveCompanyForDcf(prompt: string, explicitTicker?: string): Promise<ResolvedCompany | null> {
  const stored = await resolveCompanyProfile({ prompt, ticker: explicitTicker });
  const storedResolved = mapStoredProfileToSnapshot(stored);
  if (storedResolved?.snapshot.revenueLtm && storedResolved.snapshot.revenueLtm > 0) {
    return storedResolved;
  }

  const snapshots = await loadDemoSnapshots();
  return resolveCompanyFromPrompt(prompt, explicitTicker, snapshots);
}

function defaultGrowthCurve(years: number, sector: string | null, revenueLtm: number): number[] {
  const normalizedSector = normalizePromptText(sector || '');
  let first = 0.07;
  let last = 0.03;

  if (/(software|internet|technology|communication)/.test(normalizedSector)) {
    first = 0.09;
    last = 0.04;
  } else if (/(consumer|retail)/.test(normalizedSector)) {
    first = 0.07;
    last = 0.03;
  } else if (/(industrial|energy|materials|utilities)/.test(normalizedSector)) {
    first = 0.06;
    last = 0.025;
  } else if (/(financial|bank|insurance)/.test(normalizedSector)) {
    first = 0.055;
    last = 0.025;
  }

  if (revenueLtm > 250_000) {
    first -= 0.01;
    last -= 0.005;
  }

  if (years === 1) return [Number(clamp(first, 0.01, 0.18).toFixed(4))];

  return Array.from({ length: years }, (_, index) => {
    const progress = index / Math.max(years - 1, 1);
    const value = first + (last - first) * progress;
    return Number(clamp(value, 0.01, 0.18).toFixed(4));
  });
}

function defaultMarginCurve(years: number, baseMargin: number, tone: PromptParseResult['tone']): number[] {
  const uplift = tone === 'bull' ? 0.015 : tone === 'bear' ? -0.015 : 0.005;
  const terminal = clamp(baseMargin + uplift, 0.08, 0.42);
  if (years === 1) return [Number(terminal.toFixed(4))];

  return Array.from({ length: years }, (_, index) => {
    const progress = index / Math.max(years - 1, 1);
    const value = baseMargin + (terminal - baseMargin) * progress;
    return Number(clamp(value, 0.08, 0.45).toFixed(4));
  });
}

export function buildDeterministicAssumptions(
  snapshot: DemoCompanySnapshot,
  parsed: PromptParseResult
): DeterministicAssumptions {
  const revenueLtm = snapshot.revenueLtm ?? 0;
  const ebitdaMargin =
    revenueLtm > 0 && typeof snapshot.ebitdaLtm === 'number' ? snapshot.ebitdaLtm / revenueLtm : 0.28;
  const daPctRevenue = clamp(ebitdaMargin > 0.3 ? 0.025 : 0.03, 0.02, 0.04);
  const baseEbitMargin = clamp(ebitdaMargin - daPctRevenue, 0.12, 0.38);

  const sector = snapshot.sector || null;
  const normalizedSector = normalizePromptText(sector || '');

  let taxRate = 0.21;
  let capexPctRevenue = /(software|internet)/.test(normalizedSector) ? 0.035 : 0.045;
  let nwcPctRevenue = /(software|internet)/.test(normalizedSector) ? 0.01 : 0.015;
  let wacc = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.09 : 0.1;
  let terminalGrowth = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.03 : 0.025;

  if (parsed.tone === 'bull') {
    wacc -= 0.005;
    terminalGrowth += 0.0025;
  } else if (parsed.tone === 'bear') {
    wacc += 0.005;
    terminalGrowth -= 0.0025;
    capexPctRevenue += 0.0025;
  }

  if (typeof parsed.overrides.wacc === 'number') wacc = parsed.overrides.wacc;
  if (typeof parsed.overrides.terminalGrowth === 'number') terminalGrowth = parsed.overrides.terminalGrowth;

  const notes = [
    `Base year revenue uses stored LTM revenue of $${revenueLtm.toLocaleString('en-US')} million.`,
    `Operating margin anchors off available EBITDA with a ${Math.round(daPctRevenue * 1000) / 10}% D&A assumption.`,
    'Discount rate and terminal growth are deterministic modeling assumptions, not market-calibrated cost of capital outputs.',
  ];

  return {
    revenueGrowth: defaultGrowthCurve(parsed.years, sector, revenueLtm),
    ebitMargin: defaultMarginCurve(parsed.years, baseEbitMargin, parsed.tone),
    taxRate,
    daPctRevenue,
    capexPctRevenue,
    nwcPctRevenue,
    wacc: clamp(wacc, 0.06, 0.16),
    terminalGrowth: clamp(terminalGrowth, 0.01, 0.04),
    notes,
  };
}

function mergeAssumptions(
  base: DeterministicAssumptions,
  patch: AiAssumptionPatch,
  years: number
): DeterministicAssumptions {
  const revenueGrowth = Array.isArray(patch.revenueGrowth)
    ? patch.revenueGrowth.slice(0, years).map((value) => clamp(value, -0.05, 0.25))
    : base.revenueGrowth;
  const ebitMargin = Array.isArray(patch.ebitMargin)
    ? patch.ebitMargin.slice(0, years).map((value) => clamp(value, 0.05, 0.5))
    : base.ebitMargin;

  return {
    revenueGrowth: revenueGrowth.length === years ? revenueGrowth : base.revenueGrowth,
    ebitMargin: ebitMargin.length === years ? ebitMargin : base.ebitMargin,
    taxRate: typeof patch.taxRate === 'number' ? clamp(patch.taxRate, 0.1, 0.35) : base.taxRate,
    daPctRevenue: typeof patch.daPctRevenue === 'number' ? clamp(patch.daPctRevenue, 0.01, 0.05) : base.daPctRevenue,
    capexPctRevenue:
      typeof patch.capexPctRevenue === 'number' ? clamp(patch.capexPctRevenue, 0.015, 0.1) : base.capexPctRevenue,
    nwcPctRevenue:
      typeof patch.nwcPctRevenue === 'number' ? clamp(patch.nwcPctRevenue, -0.02, 0.05) : base.nwcPctRevenue,
    wacc: typeof patch.wacc === 'number' ? clamp(patch.wacc, 0.06, 0.16) : base.wacc,
    terminalGrowth:
      typeof patch.terminalGrowth === 'number' ? clamp(patch.terminalGrowth, 0.01, 0.04) : base.terminalGrowth,
    notes: Array.isArray(patch.notes) && patch.notes.length > 0
      ? patch.notes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).slice(0, 4)
      : base.notes,
  };
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const slice = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return JSON.parse(slice);
}

async function generateAiAssumptionPatch(params: {
  prompt: string;
  companyName: string;
  ticker: string;
  sector: string | null;
  revenueLtm: number;
  ebitdaMargin: number | null;
  years: number;
  defaults: DeterministicAssumptions;
  apiKeys: string[];
}): Promise<AiAssumptionPatch | null> {
  if (params.apiKeys.length === 0) return null;

  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4-pro', 'gpt-5.4');
  const systemPrompt = [
    'You are generating assumptions for a DCF demo inside an investor product.',
    'Return JSON only. No markdown or prose.',
    `Return arrays with exactly ${params.years} values for revenueGrowth and ebitMargin.`,
    'Stay conservative and internally consistent with the provided scale and sector.',
    'Assumption fields: revenueGrowth, ebitMargin, taxRate, daPctRevenue, capexPctRevenue, nwcPctRevenue, wacc, terminalGrowth, notes.',
    'Use decimals, not percentages.',
  ].join(' ');

  const userPrompt = JSON.stringify(
    {
      prompt: params.prompt,
      company: params.companyName,
      ticker: params.ticker,
      sector: params.sector,
      baseMetrics: {
        revenueLtm: params.revenueLtm,
        ebitdaMargin: params.ebitdaMargin,
      },
      defaultAssumptions: params.defaults,
    },
    null,
    2
  );

  for (const apiKey of params.apiKeys) {
    const client = new OpenAI({ apiKey });
    for (const model of models) {
      try {
        const completion = await client.chat.completions.create({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) continue;
        const parsed = extractJsonObject(content) as Record<string, unknown>;
        return {
          revenueGrowth: Array.isArray(parsed.revenueGrowth)
            ? parsed.revenueGrowth.filter((value): value is number => typeof value === 'number')
            : undefined,
          ebitMargin: Array.isArray(parsed.ebitMargin)
            ? parsed.ebitMargin.filter((value): value is number => typeof value === 'number')
            : undefined,
          taxRate: typeof parsed.taxRate === 'number' ? parsed.taxRate : undefined,
          daPctRevenue: typeof parsed.daPctRevenue === 'number' ? parsed.daPctRevenue : undefined,
          capexPctRevenue: typeof parsed.capexPctRevenue === 'number' ? parsed.capexPctRevenue : undefined,
          nwcPctRevenue: typeof parsed.nwcPctRevenue === 'number' ? parsed.nwcPctRevenue : undefined,
          wacc: typeof parsed.wacc === 'number' ? parsed.wacc : undefined,
          terminalGrowth: typeof parsed.terminalGrowth === 'number' ? parsed.terminalGrowth : undefined,
          notes: Array.isArray(parsed.notes)
            ? parsed.notes.filter((value): value is string => typeof value === 'string')
            : undefined,
        };
      } catch {
        // fall through to deterministic assumptions
      }
    }
  }

  return null;
}

function makeSensitivityWacc(baseWacc: number): number[] {
  return [-0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015]
    .map((delta) => Number(clamp(baseWacc + delta, 0.06, 0.16).toFixed(4)))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function makeSensitivityTerminalGrowth(baseGrowth: number): number[] {
  return [-0.01, -0.005, 0, 0.005, 0.01]
    .map((delta) => Number(clamp(baseGrowth + delta, 0.01, 0.04).toFixed(4)))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function buildScenarioAssumptions(
  assumptions: DeterministicAssumptions,
  key: AnalystDcfScenarioKey
): DeterministicAssumptions {
  if (key === 'base') return assumptions;

  const growthDelta = key === 'bull' ? 0.015 : -0.015;
  const marginDelta = key === 'bull' ? 0.01 : -0.015;
  const waccDelta = key === 'bull' ? -0.0075 : 0.01;
  const terminalDelta = key === 'bull' ? 0.005 : -0.005;

  return {
    ...assumptions,
    revenueGrowth: assumptions.revenueGrowth.map((value) => Number(clamp(value + growthDelta, -0.03, 0.28).toFixed(4))),
    ebitMargin: assumptions.ebitMargin.map((value) => Number(clamp(value + marginDelta, 0.06, 0.48).toFixed(4))),
    wacc: Number(clamp(assumptions.wacc + waccDelta, 0.06, 0.18).toFixed(4)),
    terminalGrowth: Number(clamp(assumptions.terminalGrowth + terminalDelta, 0.01, 0.04).toFixed(4)),
  };
}

function buildDcfSpec(params: {
  years: number;
  startYear: number;
  ticker: string;
  companyName: string;
  revenueLtm: number;
  currentEbitMargin: number;
  assumptions: DeterministicAssumptions;
}): DcfSpec {
  return DcfSpecSchema.parse({
    company: {
      name: params.companyName,
      ticker: params.ticker,
      currency: 'USD',
    },
    periods: {
      start_year: params.startYear,
      years: params.years,
    },
    base_year: {
      revenue: params.revenueLtm,
      ebit_margin: clamp(params.currentEbitMargin, 0.08, 0.4),
    },
    forecast: {
      revenue_growth: params.assumptions.revenueGrowth,
      ebit_margin: params.assumptions.ebitMargin,
      tax_rate: params.assumptions.taxRate,
      da_pct_rev: params.assumptions.daPctRevenue,
      capex_pct_rev: params.assumptions.capexPctRevenue,
      nwc_pct_rev: params.assumptions.nwcPctRevenue,
    },
    valuation: {
      wacc: params.assumptions.wacc,
      terminal: {
        method: 'gordon',
        g: params.assumptions.terminalGrowth,
      },
    },
    outputs: {
      sensitivity: {
        wacc: makeSensitivityWacc(params.assumptions.wacc),
        terminal_g: makeSensitivityTerminalGrowth(params.assumptions.terminalGrowth),
      },
    },
  });
}

function evaluateScenario(params: {
  key: AnalystDcfScenarioKey;
  spec: DcfSpec;
  netDebt: number;
  sharesOutstanding: number | null;
  marketPrice: number | null;
}): {
  scenario: AnalystDcfScenarioResult;
  forecast: AnalystDcfDemoPayload['forecast'];
} {
  const evaluation = evaluateDcfSpec(params.spec);
  const equityValue = evaluation.enterpriseValue - params.netDebt;
  const pricePerShare =
    typeof params.sharesOutstanding === 'number' && params.sharesOutstanding > 0
      ? equityValue / params.sharesOutstanding
      : null;
  const upsidePct =
    pricePerShare !== null && params.marketPrice !== null && params.marketPrice > 0
      ? pricePerShare / params.marketPrice - 1
      : null;
  const terminalValueWeight =
    evaluation.enterpriseValue !== 0 ? evaluation.pvTerminalValue / evaluation.enterpriseValue : null;

  const forecast = evaluation.revenue.map((revenue, index) => ({
    year: params.spec.periods.start_year + index + 1,
    revenue,
    ebit: evaluation.ebit[index],
    fcff: evaluation.fcff[index],
  }));

  return {
    scenario: {
      name: params.key === 'bull' ? 'Bull' : params.key === 'bear' ? 'Bear' : 'Base',
      enterpriseValue: evaluation.enterpriseValue,
      equityValue,
      pricePerShare,
      marketPrice: params.marketPrice,
      upsidePct,
      netDebt: params.netDebt,
      stagePv: evaluation.stagePv,
      terminalValue: evaluation.terminalValue,
      pvTerminalValue: evaluation.pvTerminalValue,
      terminalValueWeight,
    },
    forecast,
  };
}

function buildDeterministicMemo(payload: AnalystDcfDemoPayload): string {
  const base = payload.scenarios.base;
  const upsideText =
    base.upsidePct === null
      ? 'Market price comparison is not available in the cached demo dataset.'
      : base.upsidePct >= 0
        ? `Base case implies ${Math.abs(base.upsidePct * 100).toFixed(1)}% upside versus the cached reference price.`
        : `Base case implies ${Math.abs(base.upsidePct * 100).toFixed(1)}% downside versus the cached reference price.`;
  const terminalMix =
    base.terminalValueWeight === null ? 'Terminal value mix is not available.' : `Terminal value represents ${(base.terminalValueWeight * 100).toFixed(1)}% of enterprise value.`;

  return [
    `${payload.companyName} screens as a long-duration valuation where cash flow compounding and discount-rate discipline drive most of the result.`,
    `${upsideText} ${terminalMix}`,
    `The underwriting debate is whether revenue growth can decelerate into the terminal period without giving back too much operating margin.`,
  ].join(' ');
}

async function generateAiMemo(
  payload: AnalystDcfDemoPayload,
  apiKeys: string[]
): Promise<string | null> {
  if (apiKeys.length === 0) return null;

  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4-pro', 'gpt-5.4');
  const systemPrompt = [
    'You are writing a short investment memo for a demo DCF output.',
    'Keep it to 3 sentences.',
    'Do not mention missing live data, APIs, or implementation details.',
    'Focus on valuation, key drivers, and what would change the thesis.',
  ].join(' ');
  const userPrompt = JSON.stringify(
    {
      company: payload.companyName,
      ticker: payload.ticker,
      sector: payload.sector,
      baseCase: payload.scenarios.base,
      bullCase: payload.scenarios.bull,
      bearCase: payload.scenarios.bear,
      assumptions: payload.assumptions,
    },
    null,
    2
  );

  for (const apiKey of apiKeys) {
    const client = new OpenAI({ apiKey });
    for (const model of models) {
      try {
        const response = await client.responses.create({
          model,
          temperature: 0.4,
          max_output_tokens: 180,
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
          return response.output_text.trim();
        }
      } catch {
        // fall through to deterministic memo
      }
    }
  }

  return null;
}

function buildReply(payload: AnalystDcfDemoPayload): string {
  const formatPrice = (value: number | null) => (value === null ? 'n/a' : `$${value.toFixed(2)}`);
  const formatPct = (value: number | null) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
  const base = payload.scenarios.base;
  const bull = payload.scenarios.bull;
  const bear = payload.scenarios.bear;

  return [
    'VALUATION SUMMARY',
    `- Base case implied value: ${formatPrice(base.pricePerShare)} per share on $${base.enterpriseValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}M EV.`,
    `- Bull case implied value: ${formatPrice(bull.pricePerShare)} per share.`,
    `- Bear case implied value: ${formatPrice(bear.pricePerShare)} per share.`,
    '',
    'KEY ASSUMPTIONS',
    `- Forecast horizon: ${payload.years} years.`,
    `- Revenue growth path: ${payload.assumptions.revenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(', ')}.`,
    `- EBIT margin path: ${payload.assumptions.ebitMargin.map((value) => `${(value * 100).toFixed(1)}%`).join(', ')}.`,
    `- WACC / terminal growth: ${(payload.assumptions.wacc * 100).toFixed(1)}% / ${(payload.assumptions.terminalGrowth * 100).toFixed(1)}%.`,
    `- Base case upside vs cached price: ${formatPct(base.upsidePct)}.`,
    '',
    'INVESTMENT MEMO',
    payload.memo,
  ].join('\n');
}

export async function generateAnalystDcfDemo(params: {
  prompt: string;
  explicitTicker?: string;
}): Promise<{
  reply: string;
  payload: AnalystDcfDemoPayload;
}> {
  const resolved = await resolveCompanyForDcf(params.prompt, params.explicitTicker);

  if (!resolved?.snapshot) {
    throw new Error('No matching company profile was found for this prompt.');
  }

  const parsed = parseDcfPrompt(params.prompt, resolved.ticker);
  const snapshot = resolved.snapshot;
  const companyName = snapshot.companyName || resolved.ticker;
  const revenueLtm = snapshot.revenueLtm ?? 0;
  if (!(revenueLtm > 0)) {
    throw new Error(`Cached demo financials for ${resolved.ticker} are incomplete.`);
  }

  const ebitdaLtm = snapshot.ebitdaLtm ?? 0;
  const netIncomeLtm = snapshot.netIncomeLtm ?? 0;
  const cash = snapshot.cash ?? 0;
  const totalDebt = snapshot.totalDebt ?? 0;
  const netDebt = totalDebt - cash;
  const sharesOutstanding = typeof snapshot.sharesOutstanding === 'number' && snapshot.sharesOutstanding > 0
    ? snapshot.sharesOutstanding
    : null;
  const sharePrice = typeof snapshot.sharePrice === 'number' && snapshot.sharePrice > 0 ? snapshot.sharePrice : null;
  const marketCap = typeof snapshot.marketCap === 'number' && snapshot.marketCap > 0 ? snapshot.marketCap : null;
  const ebitdaMargin = revenueLtm > 0 && ebitdaLtm > 0 ? ebitdaLtm / revenueLtm : null;

  const defaultAssumptions = buildDeterministicAssumptions(snapshot, parsed);
  const aiPatch = await generateAiAssumptionPatch({
    prompt: params.prompt,
    companyName,
    ticker: resolved.ticker,
    sector: snapshot.sector ?? null,
    revenueLtm,
    ebitdaMargin,
    years: parsed.years,
    defaults: defaultAssumptions,
    apiKeys: getOpenAIKeyCandidates('user'),
  });
  const assumptions = mergeAssumptions(defaultAssumptions, aiPatch ?? {}, parsed.years);

  const currentEbitMargin = clamp(
    assumptions.ebitMargin[0] ?? (ebitdaMargin !== null ? ebitdaMargin - assumptions.daPctRevenue : 0.2),
    0.08,
    0.4
  );

  const scenarioResults = {
    base: null as AnalystDcfScenarioResult | null,
    bull: null as AnalystDcfScenarioResult | null,
    bear: null as AnalystDcfScenarioResult | null,
  };
  let forecast: AnalystDcfDemoPayload['forecast'] = [];

  for (const key of ['base', 'bull', 'bear'] as const) {
    const scenarioAssumptions = buildScenarioAssumptions(assumptions, key);
    const spec = buildDcfSpec({
      years: parsed.years,
      startYear: new Date().getUTCFullYear(),
      ticker: resolved.ticker,
      companyName,
      revenueLtm,
      currentEbitMargin,
      assumptions: scenarioAssumptions,
    });

    const evaluated = evaluateScenario({
      key,
      spec,
      netDebt,
      sharesOutstanding,
      marketPrice: sharePrice,
    });
    scenarioResults[key] = evaluated.scenario;
    if (key === 'base') forecast = evaluated.forecast;
  }

  const payload: AnalystDcfDemoPayload = {
    prompt: params.prompt,
    ticker: resolved.ticker,
    companyName,
    sector: snapshot.sector ?? null,
    currency: 'USD',
    years: parsed.years,
    source: resolved.source,
    asOfDate: resolved.asOfDate ?? snapshot.updatedAt ?? null,
    memo: '',
    warnings: [
      ...(sharePrice === null ? ['Cached share price unavailable; upside/downside may be blank.'] : []),
      ...(sharesOutstanding === null ? ['Cached shares outstanding unavailable; implied share price may be blank.'] : []),
    ],
    notes: assumptions.notes,
    baseMetrics: {
      revenueLtm,
      ebitdaLtm,
      netIncomeLtm,
      cash,
      totalDebt,
      netDebt,
      sharesOutstanding,
      sharePrice,
      marketCap,
    },
    assumptions: {
      revenueGrowth: assumptions.revenueGrowth,
      ebitMargin: assumptions.ebitMargin,
      taxRate: assumptions.taxRate,
      daPctRevenue: assumptions.daPctRevenue,
      capexPctRevenue: assumptions.capexPctRevenue,
      nwcPctRevenue: assumptions.nwcPctRevenue,
      wacc: assumptions.wacc,
      terminalGrowth: assumptions.terminalGrowth,
    },
    forecast,
    scenarios: {
      base: scenarioResults.base as AnalystDcfScenarioResult,
      bull: scenarioResults.bull as AnalystDcfScenarioResult,
      bear: scenarioResults.bear as AnalystDcfScenarioResult,
    },
  };

  payload.memo = (await generateAiMemo(payload, getOpenAIKeyCandidates('user'))) ?? buildDeterministicMemo(payload);

  return {
    reply: buildReply(payload),
    payload,
  };
}

import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import type { SwingSleevePosition, SwingThesisSleeve } from '@/lib/pm/types';
import type { RankedStock } from '@/lib/ranking/types';

const text = (min: number, max: number) => z.string().transform(value => value.trim().slice(0, max)).pipe(z.string().min(min).max(max));

const sleeveDraftSchema = z.object({
  decision: z.enum(['build', 'watch', 'pass']),
  theme: text(5, 100),
  thesis: text(30, 700),
  whyNow: text(20, 500),
  whatIsPriced: text(10, 500),
  transmissionPath: z.array(text(5, 220)).min(2).max(6),
  invalidation: text(10, 400),
  confidence: z.number().int().min(0).max(100),
  cashWeightPct: z.number().min(0).max(40),
  positions: z.array(z.object({
    ticker: z.string().min(1).max(10),
    weightPct: z.number().positive().max(60),
    role: z.enum(['core', 'catalyst', 'diversifier']),
    thesis: text(10, 360),
    entryCondition: text(5, 240),
    invalidation: text(5, 240),
  })).max(6),
  portfolioRisks: z.array(text(5, 220)).min(1).max(6),
  monitor: z.array(text(5, 220)).min(2).max(8),
});

type SleeveDraft = z.infer<typeof sleeveDraftSchema>;

function extractJson(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function round(value: number, decimals = 1): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

/** Normalize model-proposed weights to the investable share of the sleeve. */
export function normalizeSleeveWeights(weights: number[], cashWeightPct: number): number[] {
  const investable = round(100 - Math.min(40, Math.max(0, cashWeightPct)));
  const clean = weights.map(value => Number.isFinite(value) && value > 0 ? value : 0);
  const total = clean.reduce((sum, value) => sum + value, 0);
  if (clean.length === 0) return [];
  if (total <= 0) {
    const equal = round(investable / clean.length);
    const result = clean.map(() => equal);
    result[result.length - 1] = round(investable - result.slice(0, -1).reduce((sum, value) => sum + value, 0));
    return result;
  }
  const result = clean.map(value => round((value / total) * investable));
  result[result.length - 1] = round(investable - result.slice(0, -1).reduce((sum, value) => sum + value, 0));
  return result;
}

export function forecastScenario(stock: RankedStock, horizonDays: number): SwingSleevePosition['forecast'] {
  const base = stock.meta.forecastReturnPct;
  if (base === null || !Number.isFinite(base)) {
    return {
      horizonDays,
      bearReturnPct: null,
      baseReturnPct: null,
      bullReturnPct: null,
      source: 'No provider-backed forecast available',
    };
  }
  const spread = 4 + (10 - stock.breakdown.riskAdjustment) * 0.9;
  return {
    horizonDays,
    bearReturnPct: round(base - spread),
    baseReturnPct: round(base),
    bullReturnPct: round(base + spread),
    source: stock.meta.dataSource === 'live'
      ? 'CapitalBase ranked forecast with risk-band scenario overlay'
      : 'Fallback ranked forecast; refresh before sizing',
  };
}

function compactRankedStock(stock: RankedStock) {
  return {
    ticker: stock.ticker,
    companyName: stock.meta.companyName ?? null,
    sector: stock.meta.sector ?? null,
    subsector: stock.meta.subsector ?? null,
    score: stock.score,
    signal: stock.signal,
    primaryReason: stock.primaryReason,
    mainRisk: stock.mainRisk,
    forecastReturnPct: stock.meta.forecastReturnPct,
    dataSource: stock.meta.dataSource,
    breakdown: stock.breakdown,
    catalysts: (stock.meta.catalysts ?? []).slice(0, 3).map(catalyst => ({
      title: catalyst.title,
      channel: catalyst.channel,
      direction: catalyst.direction,
      confidence: catalyst.confidence,
      priced: catalyst.priced,
      reason: catalyst.reason,
      horizon: catalyst.horizon,
    })),
  };
}

function promptForSleeve(params: {
  idea: string | null;
  horizonDays: number;
  maxPositions: number;
  stocks: RankedStock[];
}): { system: string; user: string } {
  const system = `You are Claude acting as a disciplined swing-trading PM. Build thesis-first, evidence-backed 1-3 month research sleeves. Start with what is priced, then identify what changes estimates, the multiple/risk premium, and positioning. A forecast is directional evidence, not certainty. Reject weak ideas. Never invent prices, dates, company facts, catalysts, or data outside the supplied ranked board. Return strict JSON only.`;
  const task = params.idea
    ? `Test this user thesis and improve or reject it: "${params.idea}"`
    : 'Originate the strongest coherent swing thesis supported by at least two names in the ranked board.';
  const user = `${task}

Decision horizon: ${params.horizonDays} days.
Maximum positions: ${params.maxPositions}.

RANKED BOARD EVIDENCE:
${JSON.stringify(params.stocks.map(compactRankedStock))}

Return only this JSON shape:
{
  "decision": "build|watch|pass",
  "theme": "short theme name",
  "thesis": "the investable thesis and market miss",
  "whyNow": "why this is timely inside the horizon",
  "whatIsPriced": "what consensus/current price already appears to discount",
  "transmissionPath": ["event -> estimate/multiple/positioning channel -> stock impact"],
  "invalidation": "the fastest way the whole sleeve thesis breaks",
  "confidence": 0,
  "cashWeightPct": 0,
  "positions": [{
    "ticker": "exact ticker from the ranked board",
    "weightPct": 0,
    "role": "core|catalyst|diversifier",
    "thesis": "why this name expresses the sleeve thesis",
    "entryCondition": "specific score, catalyst, or price-action confirmation required",
    "invalidation": "name-specific break condition"
  }],
  "portfolioRisks": ["cross-position or macro risk"],
  "monitor": ["specific evidence to recheck during the horizon"]
}

Rules:
- For build or watch, use 2-${params.maxPositions} unique tickers and only tickers in the supplied board. For pass, positions may be empty.
- Prefer live rows. Treat fallback rows as low-confidence and do not let them anchor the sleeve.
- A build decision requires a coherent transmission path, at least one real catalyst channel, and acceptable risk-adjusted setup.
- If forecast and catalysts conflict, use watch and state the confirmation needed.
- Do not use paper-trading language or claim an order will be submitted.
- Keep cash when the setup is early, correlated, or only partially confirmed.
- Position weights must total 100 minus cashWeightPct.`;
  return { system, user };
}

export async function buildThesisSleeve(params: {
  idea?: string | null;
  horizonDays: number;
  maxPositions: number;
  capitalUsd?: number | null;
  rankedStocks: RankedStock[];
  rankedAt: string;
}): Promise<SwingThesisSleeve> {
  const live = params.rankedStocks.filter(stock => stock.meta.dataSource === 'live');
  const candidatePool = (live.length >= 8 ? live : params.rankedStocks)
    .filter(stock => stock.score >= 4)
    .slice(0, 28);
  if (candidatePool.length < 2) throw new Error('Not enough ranked candidates to build a sleeve. Refresh the ranked board first.');

  const { system, user } = promptForSleeve({
    idea: params.idea?.trim() || null,
    horizonDays: params.horizonDays,
    maxPositions: params.maxPositions,
    stocks: candidatePool,
  });
  const generated = await generateTextWithProviderFallback({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    preferredProvider: 'anthropic',
    temperature: 0.15,
    maxTokens: 2200,
    timeoutMs: 55_000,
  });
  if (!generated) throw new Error('Claude was unavailable for sleeve research.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(generated.text));
  } catch (error) {
    throw new Error(`Claude returned invalid sleeve JSON: ${error instanceof Error ? error.message : 'parse failed'}`);
  }
  const checked = sleeveDraftSchema.safeParse(parsed);
  if (!checked.success) {
    throw new Error(`Claude sleeve failed validation: ${checked.error.issues.slice(0, 4).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }

  const byTicker = new Map(candidatePool.map(stock => [stock.ticker.toUpperCase(), stock]));
  const seen = new Set<string>();
  const selected = checked.data.positions.filter(position => {
    const ticker = position.ticker.toUpperCase();
    if (!byTicker.has(ticker) || seen.has(ticker)) return false;
    seen.add(ticker);
    return true;
  }).slice(0, params.maxPositions);
  if (checked.data.decision !== 'pass' && selected.length < 2) {
    throw new Error('Claude did not select at least two valid ranked-board tickers.');
  }

  const cashWeightPct = round(checked.data.cashWeightPct);
  const normalizedWeights = normalizeSleeveWeights(selected.map(position => position.weightPct), cashWeightPct);
  const capital = params.capitalUsd && params.capitalUsd > 0 ? params.capitalUsd : null;
  const positions: SwingSleevePosition[] = selected.map((position, index) => {
    const ticker = position.ticker.toUpperCase();
    const stock = byTicker.get(ticker)!;
    const weightPct = normalizedWeights[index];
    const topCatalyst = (stock.meta.catalysts ?? []).find(catalyst => catalyst.direction !== 'neutral')
      ?? stock.meta.catalysts?.[0];
    return {
      ticker,
      companyName: stock.meta.companyName ?? null,
      weightPct,
      notionalUsd: capital === null ? null : round(capital * weightPct / 100, 0),
      role: position.role,
      rankScore: stock.score,
      signal: stock.signal,
      thesis: position.thesis,
      entryCondition: position.entryCondition,
      keyCatalyst: topCatalyst?.title ?? 'No verified dated catalyst in the ranked evidence; require price/score confirmation.',
      invalidation: position.invalidation,
      forecast: forecastScenario(stock, params.horizonDays),
    };
  });

  const fallbackCandidates = candidatePool.filter(stock => stock.meta.dataSource !== 'live').length;
  const warnings = [
    ...(fallbackCandidates > 0 ? [`${fallbackCandidates} candidate rows used fallback ranking data.`] : []),
    ...(positions.some(position => position.forecast.baseReturnPct === null) ? ['At least one selected name lacks a provider-backed price forecast.'] : []),
    'Scenario returns are directional research ranges, not guaranteed outcomes.',
  ];

  return {
    generatedAt: new Date().toISOString(),
    horizonDays: params.horizonDays,
    decision: checked.data.decision,
    theme: checked.data.theme,
    thesis: checked.data.thesis,
    whyNow: checked.data.whyNow,
    whatIsPriced: checked.data.whatIsPriced,
    transmissionPath: checked.data.transmissionPath,
    invalidation: checked.data.invalidation,
    confidence: checked.data.confidence,
    cashWeightPct,
    positions,
    portfolioRisks: checked.data.portfolioRisks,
    monitor: checked.data.monitor,
    evidenceQuality: {
      rankedAt: params.rankedAt,
      liveCandidates: candidatePool.length - fallbackCandidates,
      fallbackCandidates,
      warnings,
    },
    provider: generated.provider,
    model: generated.model,
  };
}

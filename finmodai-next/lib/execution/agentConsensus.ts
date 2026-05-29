/**
 * Agent Consensus
 *
 * Runs 5 investor personas in parallel for each candidate ticker.
 * All persona calls for a single ticker fire concurrently (Promise.all).
 * All tickers also fire concurrently (Promise.all).
 *
 * Uses claude-haiku for every persona call — fast + cheap.
 *
 * The output map (ticker → ConsensusResult) is consumed by the debate stage
 * to rank candidates by avg_conviction before synthesis.
 */

import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import type { UserIntent } from './userIntent';
import type { AssetMetadata } from './assetMetadata';
import type { RankedStock } from '@/lib/ranking/types';

export type AgentSignal = 'strong_buy' | 'buy' | 'hold' | 'sell';

export type PersonaOutput = {
  persona:         string;
  signal:          AgentSignal;
  conviction:      number;   // 0-10
  thesis:          string;
  risk:            string;
  theme_fit_score: number;   // 0-10
};

export type ConsensusResult = {
  ticker:              string;
  avg_conviction:      number;
  signal_distribution: { strong_buy: number; buy: number; hold: number; sell: number };
  outputs:             PersonaOutput[];
};

// ── Persona definitions ───────────────────────────────────────────────────────

const PERSONAS = [
  {
    name:  'Growth (Druckenmiller)',
    style: `momentum investing, earnings acceleration, narrative momentum, industry leadership,
TAM expansion. Focus on whether this company is accelerating — revenue growth rate,
earnings revisions, and the macro cycle supporting the thesis.`,
  },
  {
    name:  'Value (Buffett)',
    style: `moat analysis, cashflow quality, margin of safety, normalized earnings power,
owner economics. Focus on price paid vs intrinsic value, durability of competitive
advantage, and management capital allocation quality.`,
  },
  {
    name:  'Quant (Renaissance)',
    style: `technical signals, mean reversion probability, volatility regime, factor exposure.
Focus on price action quality, 52-week position, momentum factor, and short interest
as a contrarian signal.`,
  },
  {
    name:  'Macro (Soros)',
    style: `sector tailwinds, rates environment, geopolitical context, cycle positioning,
reflexivity. Focus on whether the macro backdrop actively supports this name or whether
it is swimming against the current.`,
  },
  {
    name:  'Contrarian',
    style: `actively looking for reasons the consensus is wrong. Focus on crowding risk,
sentiment excess, hidden weaknesses, red flags bulls are ignoring, and potential
catalysts for thesis failure.`,
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = cleaned.indexOf('{');
  const last  = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('no JSON object');
  return JSON.parse(cleaned.slice(first, last + 1));
}

function safeSignal(s: unknown): AgentSignal {
  if (s === 'strong_buy' || s === 'buy' || s === 'hold' || s === 'sell') return s;
  return 'hold';
}

function clamp(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? def : Math.max(lo, Math.min(hi, n));
}

// ── Single persona evaluation ─────────────────────────────────────────────────

async function runPersona(
  persona: (typeof PERSONAS)[number],
  stock:   RankedStock,
  asset:   AssetMetadata | null,
  intent:  UserIntent,
): Promise<PersonaOutput> {
  const { ticker } = stock;

  const themeCtx = intent.themes.length > 0
    ? `User's requested themes: ${intent.themes.join(', ')}.`
    : 'No specific theme requested.';

  const assetCtx = asset
    ? `Name: ${asset.name} | Sector: ${asset.sector} | Industry: ${asset.industry}
Business: ${asset.business_summary}`
    : `Ticker: ${ticker} (no business metadata — evaluate from market data and name only)`;

  const breakdownLines = Object.entries(stock.breakdown)
    .map(([k, v]) => `  ${k}: ${(v as number).toFixed(1)}/10`)
    .join('\n');

  const forecastCtx = stock.meta.forecastReturnPct != null
    ? `Forecast return: ${stock.meta.forecastReturnPct.toFixed(1)}% (${stock.horizonWeeks}wk)`
    : 'Forecast: unavailable';

  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    anthropicModels:   ['claude-haiku-4-5-20251001'],
    clientType:        'user',
    temperature:       0.3,
    maxTokens:         350,
    messages: [
      {
        role:    'system',
        content: `You are ${persona.name}, an expert investor. Your style: ${persona.style}

Evaluate this stock for inclusion in a user's portfolio. Be specific and direct.
Return ONLY valid JSON — no text before or after the JSON object.`,
      },
      {
        role:    'user',
        content: `${themeCtx}
Risk profile: ${intent.risk_profile}
${assetCtx}

Market data for ${ticker}:
  Composite score: ${stock.score}/10 (${stock.signal})
  ${forecastCtx}
  Primary reason: ${stock.primaryReason}
  Main risk: ${stock.mainRisk}
Score breakdown:
${breakdownLines}

From YOUR perspective as ${persona.name}, evaluate ${ticker}.

Return this JSON (no extra fields, no markdown):
{
  "persona": "${persona.name}",
  "signal": "strong_buy" | "buy" | "hold" | "sell",
  "conviction": <number 0-10>,
  "thesis": "<2-3 sentences specific to THIS ticker and your style>",
  "risk": "<specific risk — name a metric, competitor, product, or number>",
  "theme_fit_score": <number 0-10>
}`,
      },
    ],
  }).catch(() => null);

  try {
    const parsed = extractJson(result?.text ?? '{}') as Record<string, unknown>;
    return {
      persona:         persona.name,
      signal:          safeSignal(parsed.signal),
      conviction:      clamp(parsed.conviction, 0, 10, 5),
      thesis:          typeof parsed.thesis === 'string' ? parsed.thesis : '',
      risk:            typeof parsed.risk   === 'string' ? parsed.risk   : '',
      theme_fit_score: clamp(parsed.theme_fit_score, 0, 10, 5),
    };
  } catch {
    // Graceful fallback — don't crash the whole pipeline
    return {
      persona:         persona.name,
      signal:          'hold',
      conviction:      5,
      thesis:          '',
      risk:            '',
      theme_fit_score: 5,
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs all 5 personas for each stock concurrently.
 * Returns a map from ticker to ConsensusResult.
 * Failures for individual tickers are swallowed so the pipeline
 * continues with fewer candidates rather than failing entirely.
 */
export async function runAgentConsensus(
  stocks:   RankedStock[],
  assetMap: Map<string, AssetMetadata | null>,
  intent:   UserIntent,
): Promise<Map<string, ConsensusResult>> {
  const settled = await Promise.allSettled(
    stocks.map(async stock => {
      const asset   = assetMap.get(stock.ticker) ?? null;
      const outputs = await Promise.all(
        PERSONAS.map(p => runPersona(p, stock, asset, intent)),
      );

      const total = outputs.length;
      const avg_conviction = total > 0
        ? Math.round((outputs.reduce((s, o) => s + o.conviction, 0) / total) * 10) / 10
        : 0;

      const dist: ConsensusResult['signal_distribution'] = { strong_buy: 0, buy: 0, hold: 0, sell: 0 };
      for (const o of outputs) dist[o.signal]++;

      return { ticker: stock.ticker, avg_conviction, signal_distribution: dist, outputs } satisfies ConsensusResult;
    }),
  );

  const map = new Map<string, ConsensusResult>();
  for (const r of settled) {
    if (r.status === 'fulfilled') map.set(r.value.ticker, r.value);
  }
  return map;
}

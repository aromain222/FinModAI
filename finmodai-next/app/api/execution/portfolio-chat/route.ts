/**
 * POST /api/execution/portfolio-chat
 *
 * Multi-agent portfolio builder:
 *   1. Screen live universe (top 25 by volume)
 *   2. Score all 25 in parallel via ranking engine
 *   3. Run hedge-fund consensus in parallel for top 6 buy candidates
 *   4. OpenAI PM synthesises: picks 5 best positions matching user's intent
 *
 * ~30–40s end-to-end; fits Hobby maxDuration=60.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';
import { screenUniverse } from '@/lib/execution/universalScreener';
import { scoreMultiple } from '@/lib/ranking/score';
import type { RankedStock } from '@/lib/ranking/types';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

export type PortfolioPosition = {
  ticker:          string;
  score:           number;
  action:          string;
  confidence:      number;
  suggestedWeight: number;
  sizing:          string;
  thesis:          string;
  risk:            string;
  bullishCount:    number;
  bearishCount:    number;
  totalPersonas:   number;
};

export type PortfolioChatResponse = {
  positions:     PortfolioPosition[];
  narrative:     string;
  positionCount: number;
  scoredAt:      string;
};

type HedgeFundResult = {
  ticker:    string;
  consensus: { bullish: number; bearish: number; neutral: number };
  decision:  { action: string; confidence: number; sizing?: string; reasoning: string } | null;
};

function appUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

async function runHedgeFund(ticker: string, baseUrl: string): Promise<HedgeFundResult | null> {
  try {
    const res = await fetch(`${baseUrl}/api/hedge-fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as HedgeFundResult;
    return data;
  } catch {
    return null;
  }
}

async function synthesisePortfolio(
  client: OpenAI,
  userMessage: string,
  stocks: Array<{ stock: RankedStock; hf: HedgeFundResult | null }>,
): Promise<{ positions: Omit<PortfolioPosition, 'bullishCount' | 'bearishCount' | 'totalPersonas'>[]; narrative: string }> {
  const stockSummaries = stocks.map(({ stock, hf }) => {
    const consensus = hf ? `${hf.consensus.bullish}/${hf.consensus.bullish + hf.consensus.bearish + hf.consensus.neutral} investors bullish` : 'consensus unavailable';
    const decision  = hf?.decision ? `PM: ${hf.decision.action} (${hf.decision.confidence}% confidence)` : '';
    return `${stock.ticker}: score=${stock.score}/10, sector=${stock.meta.sector ?? 'N/A'}, ${consensus}. ${decision}. Reason: ${stock.primaryReason}. Risk: ${stock.mainRisk}`;
  }).join('\n');

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a portfolio manager building a diversified equity portfolio. Respond only in the JSON format requested.',
      },
      {
        role: 'user',
        content: `User request: "${userMessage}"

Candidate stocks (pre-screened and scored):
${stockSummaries}

Select the best 5 stocks that best match the user's intent. Allocate portfolio weights (must sum to 100). For each position write a 2-sentence thesis and 1-sentence risk.

Return JSON:
{
  "narrative": "2-3 sentence overall portfolio summary",
  "positions": [
    {
      "ticker": string,
      "score": number,
      "action": "Buy" | "Overweight" | "Hold",
      "confidence": 0-100,
      "suggestedWeight": number,
      "sizing": "Starter" | "Build" | "Full position",
      "thesis": string,
      "risk": string
    }
  ]
}`,
      },
    ],
  });

  const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as {
    narrative?: string;
    positions?: Omit<PortfolioPosition, 'bullishCount' | 'bearishCount' | 'totalPersonas'>[];
  };

  return {
    narrative: parsed.narrative ?? 'Portfolio recommendation ready.',
    positions: Array.isArray(parsed.positions) ? parsed.positions : [],
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let message = 'Build me a diversified 5-stock portfolio';
  try {
    const body = await req.json() as { message?: string };
    if (body.message) message = String(body.message).slice(0, 500);
  } catch { /* use default */ }

  const apiKey = getOpenAIKey('user');
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  try {
    const origin = appUrl(req);

    // 1. Screen + score
    const screen  = await screenUniverse(25);
    const ranked  = await scoreMultiple(screen.tickers, origin, 6);
    const buyable = ranked
      .filter(s => s.score >= 6.0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (buyable.length === 0) {
      return NextResponse.json({
        positions: [],
        narrative: 'No strong buy candidates in the current universe (score < 6.0). Market conditions may be unfavourable — try again tomorrow.',
        positionCount: 0,
        scoredAt: new Date().toISOString(),
      } satisfies PortfolioChatResponse);
    }

    // 2. Run hedge-fund consensus in parallel for top candidates
    const hedgeFundResults = await Promise.all(
      buyable.map(stock => runHedgeFund(stock.ticker, origin)),
    );

    const stocksWithHF = buyable.map((stock, i) => ({
      stock,
      hf: hedgeFundResults[i],
    }));

    // 3. Synthesise with OpenAI PM
    const { positions: rawPositions, narrative } = await synthesisePortfolio(client, message, stocksWithHF);

    // Merge hedge-fund signal counts into each position
    const positions: PortfolioPosition[] = rawPositions.map(pos => {
      const hf = hedgeFundResults[buyable.findIndex(s => s.ticker === pos.ticker)] ?? null;
      const total = hf ? hf.consensus.bullish + hf.consensus.bearish + hf.consensus.neutral : 0;
      return {
        ...pos,
        bullishCount:  hf?.consensus.bullish  ?? 0,
        bearishCount:  hf?.consensus.bearish  ?? 0,
        totalPersonas: total,
      };
    });

    return NextResponse.json({
      positions,
      narrative,
      positionCount: positions.length,
      scoredAt: new Date().toISOString(),
    } satisfies PortfolioChatResponse);

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Portfolio generation failed' },
      { status: 500 },
    );
  }
}

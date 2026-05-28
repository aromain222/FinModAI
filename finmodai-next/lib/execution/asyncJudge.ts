/**
 * Async quality judges — fire-and-forget after a portfolio ships.
 * These don't block the user response; they emit telemetry via console.info/warn.
 *
 * B2 — thesis-vs-business contradiction (Haiku)
 * E1 — thesis specificity scoring (Haiku)
 * E3 — near-duplicate thesis detection (embedding cosine similarity)
 * A5 — weighted portfolio beta sanity (stub — requires price history source)
 */

import type OpenAI from 'openai';
import type { AssetMetadata } from './assetMetadata';
import type { UserIntent } from './userIntent';
import type { SynthesizedPosition } from './synthesisValidation';

// ── Cosine similarity (exported for unit tests) ────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export function findNearDuplicates(
  tickers: string[],
  embeddings: number[][],
  threshold = 0.85,
): Array<{ tickers: [string, string]; similarity: number }> {
  const pairs: Array<{ tickers: [string, string]; similarity: number }> = [];
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim > threshold) {
        pairs.push({
          tickers:    [tickers[i], tickers[j]],
          similarity: Math.round(sim * 1000) / 1000,
        });
      }
    }
  }
  return pairs;
}

// ── B2: Thesis-vs-business consistency ────────────────────────────────────

async function judgeB2(
  ticker: string,
  name: string,
  sector: string,
  businessSummary: string,
  thesis: string,
  themes: string[],
  client: OpenAI,
): Promise<{ contradicts: boolean; explanation: string } | null> {
  try {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are reviewing financial analysis for factual accuracy. Return JSON only.',
        },
        {
          role: 'user',
          content: `Themes requested: ${themes.length > 0 ? themes.join(', ') : 'none'}.
Portfolio includes ${ticker} (${name}, ${sector}).
Business: ${businessSummary}

Thesis written: "${thesis}"

Does this thesis make claims that contradict what ${ticker} actually is or does?
Return JSON: { "contradicts": boolean, "explanation": string }`,
        },
      ],
    });
    const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as {
      contradicts?: boolean; explanation?: string;
    };
    return {
      contradicts: parsed.contradicts === true,
      explanation: parsed.explanation ?? '',
    };
  } catch {
    return null;
  }
}

// ── E1: Thesis specificity scoring ────────────────────────────────────────

async function judgeE1(
  thesis: string,
  client: OpenAI,
): Promise<{ score: number; reasoning: string } | null> {
  try {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 80,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `Score this investment thesis on specificity 0–3:
0 = Pure boilerplate; could apply to any stock
1 = Names the sector or theme but no specifics
2 = Names a metric, product, or competitor
3 = Cites a specific number, date, or chart level

Thesis: "${thesis}"
Return JSON: { "score": number, "reasoning": string }`,
        },
      ],
    });
    const parsed = JSON.parse(resp.choices[0].message.content ?? '{}') as {
      score?: number; reasoning?: string;
    };
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(3, Math.round(parsed.score))) : 0;
    return { score, reasoning: parsed.reasoning ?? '' };
  } catch {
    return null;
  }
}

// ── E3: Embedding-based near-duplicate detection ──────────────────────────

async function embedTheses(theses: string[], client: OpenAI): Promise<number[][] | null> {
  try {
    const resp = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: theses,
    });
    return resp.data.map(d => d.embedding);
  } catch {
    return null;
  }
}

// ── Main runner (fire-and-forget) ──────────────────────────────────────────

export async function runAsyncJudges(
  positions: SynthesizedPosition[],
  intent: UserIntent,
  assetMap: Map<string, AssetMetadata | null>,
  client: OpenAI,
): Promise<void> {
  const label = `[async-judge] ${positions.map(p => p.ticker).join(',')}`;

  try {
    // B2 + E1: per-position checks
    const perPos = await Promise.allSettled(
      positions.map(async pos => {
        const asset = assetMap.get(pos.ticker);
        const events: string[] = [];

        if (asset?.business_summary && pos.thesis) {
          const b2 = await judgeB2(pos.ticker, asset.name, asset.sector,
            asset.business_summary, pos.thesis, intent.themes, client);
          if (b2?.contradicts) {
            events.push(`B2_contradiction:${pos.ticker}`);
            console.warn(`${label} [B2] thesis contradicts business for ${pos.ticker}: ${b2.explanation}`);
          }
        }

        if (pos.thesis) {
          const e1 = await judgeE1(pos.thesis, client);
          if (e1 !== null && e1.score <= 1) {
            events.push(`E1_boilerplate:${pos.ticker}(score=${e1.score})`);
            console.warn(`${label} [E1] boilerplate thesis on ${pos.ticker} score=${e1.score}: ${e1.reasoning}`);
          }
        }

        return events;
      }),
    );

    const allEvents = perPos.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (allEvents.length > 0) {
      console.info(`${label} quality events: ${allEvents.join(', ')}`);
    }

    // E3: embedding-based near-duplicate thesis detection
    const validPositions = positions.filter(p => p.thesis?.trim());
    if (validPositions.length >= 2) {
      const embeddings = await embedTheses(validPositions.map(p => p.thesis), client);
      if (embeddings) {
        const dupes = findNearDuplicates(validPositions.map(p => p.ticker), embeddings);
        for (const d of dupes) {
          console.warn(`${label} [E3] near-duplicate thesis: ${d.tickers[0]} ↔ ${d.tickers[1]} similarity=${d.similarity}`);
        }
      }
    }

    // A5: weighted beta (stub — requires price-history source)
    // TODO: integrate Polygon or Tiingo beta endpoint, compute weighted_beta(positions)
    // Expected: intent.risk_profile === 'aggressive' → weighted_beta >= 1.2

  } catch (err) {
    console.error(`${label} judge error:`, err instanceof Error ? err.message : err);
  }
}

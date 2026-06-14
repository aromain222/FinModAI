import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import type { PortfolioPosition } from '@/lib/pm/types';
import type { QuantScoreSnapshot } from '@/lib/pm/monitoring/types';

export const pmAnalysisSchema = z.object({
  targetPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  thesisSummary: z.string().min(20).max(600),
  whyWeOwnIt: z.string().min(20).max(800),
  primaryDriver: z.string().min(5).max(160),
  mainRisk: z.string().min(5).max(160),
  keyRisks: z.array(z.string()).min(1).max(6),
  catalysts: z.array(z.string()).min(1).max(6),
  sellConditions: z.array(z.string()).min(1).max(6),
  invalidationConditions: z.array(z.string()).min(1).max(6),
  convictionScore: z.number().int().min(0).max(100),
  timeHorizon: z.enum(['swing', 'position', 'core', 'tactical']),
  nextCatalyst: z.string().min(5).max(220),
});

export type PMAnalysisResult = z.infer<typeof pmAnalysisSchema>;

function formatScoutSummary(snapshots: QuantScoreSnapshot[]): string {
  if (snapshots.length === 0) return 'No scout coverage yet.';
  const lines = snapshots
    .slice(0, 6)
    .map(s =>
      `  - ${s.analystName.replace(' Analyst', '')}: ${s.signal} ${Math.round(s.score)}/100 — ${(s.reasoning || '').replace(/\s+/g, ' ').slice(0, 220)}`,
    );
  return lines.join('\n');
}

function buildPrompt(input: {
  ticker: string;
  position: PortfolioPosition;
  snapshots: QuantScoreSnapshot[];
}): { system: string; user: string } {
  const p = input.position;
  const avg = input.snapshots.length > 0
    ? input.snapshots.reduce((sum, s) => sum + s.score, 0) / input.snapshots.length
    : null;
  const entry = p.entryPrice ?? (p.costBasis != null && p.shares ? p.costBasis / p.shares : null);
  const pnlPct = entry != null && p.currentPrice != null
    ? ((p.currentPrice - entry) / entry) * 100
    : null;

  const system = `You are a disciplined buy-side portfolio manager managing real capital. For each position, you produce a concrete plan: target price, stop loss, written thesis, and conditions that would change your mind. You are decisive but honest about uncertainty. You output strict JSON only — no prose, no code fences, no commentary outside the JSON.`;

  const user = `Position to analyze
Ticker: ${input.ticker}
Company: ${p.companyName ?? input.ticker}
Shares: ${p.shares ?? '?'}
Entry price: ${entry != null ? '$' + entry.toFixed(2) : 'unknown'}
Current price: ${p.currentPrice != null ? '$' + p.currentPrice.toFixed(2) : 'unknown'}
Cost basis: ${p.costBasis != null ? '$' + p.costBasis.toFixed(2) : 'unknown'}
Position value: ${p.notionalExposure != null ? '$' + p.notionalExposure.toFixed(2) : 'unknown'}
Current allocation: ${p.currentAllocation != null ? p.currentAllocation.toFixed(1) + '%' : 'unknown'}
P&L since entry: ${pnlPct != null ? (pnlPct > 0 ? '+' : '') + pnlPct.toFixed(1) + '%' : 'unknown'}
Time horizon hint: ${p.timeHorizon ?? 'not set'}

Scout signals (six independent analysts, most recent reads)
Average composite score: ${avg != null ? avg.toFixed(1) + '/100' : 'no coverage'}
${formatScoutSummary(input.snapshots)}

Return ONLY a JSON object with this exact shape:
{
  "targetPrice": <number, your 6-12 month price target>,
  "stopLoss": <number, hard exit below this price>,
  "thesisSummary": "<1-2 sentence position summary>",
  "whyWeOwnIt": "<3-5 sentence written thesis citing concrete drivers>",
  "primaryDriver": "<single most important driver in <140 chars>",
  "mainRisk": "<single biggest risk in <140 chars>",
  "keyRisks": ["risk 1", "risk 2", "risk 3"],
  "catalysts": ["upcoming catalyst 1", "catalyst 2", "..."],
  "sellConditions": ["trim/exit if X", "trim/exit if Y"],
  "invalidationConditions": ["thesis breaks if A", "thesis breaks if B"],
  "convictionScore": <integer 0-100, how strongly you'd defend this position>,
  "timeHorizon": "<one of: swing | position | core | tactical>",
  "nextCatalyst": "<single most-watched upcoming event/data point>"
}

Guidelines:
- Target price should reflect a 6-12 month base case, not a moonshot. Anchor to multiples, growth, or analyst comp.
- Stop loss should be a level where the thesis is materially wrong (often -8% to -15% from entry for swings, wider for cores).
- Conviction score: 80+ for high-conviction core, 60-79 for solid position, 40-59 for watchlist-grade, <40 means consider exiting.
- Be specific about catalysts (e.g. "FY25 Q2 earnings on Feb 22") not generic ("next earnings").
- If scouts disagree, weigh fundamentals + valuation more heavily than sentiment/technicals.`;

  return { system, user };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  return trimmed;
}

export async function analyzePosition(input: {
  ticker: string;
  position: PortfolioPosition;
  snapshots: QuantScoreSnapshot[];
}): Promise<{ ok: true; analysis: PMAnalysisResult; provider: string; model: string } | { ok: false; reason: string }> {
  const { system, user } = buildPrompt(input);
  const llmResult = await generateTextWithProviderFallback({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    maxTokens: 1500,
    timeoutMs: 45_000,
    preferredProvider: 'anthropic',
  });
  if (!llmResult) {
    return { ok: false, reason: 'llm_unavailable' };
  }
  const jsonStr = extractJson(llmResult.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { ok: false, reason: `json_parse_failed: ${(err as Error).message}` };
  }
  const result = pmAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: `schema_violation: ${result.error.errors.slice(0, 3).map(e => `${e.path.join('.')}: ${e.message}`).join('; ')}` };
  }
  return { ok: true, analysis: result.data, provider: llmResult.provider, model: llmResult.model };
}

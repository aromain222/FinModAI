import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import type { PortfolioPosition } from '@/lib/pm/types';
import type { QuantScoreSnapshot } from '@/lib/pm/monitoring/types';
import {
  DEFAULT_RESEARCH_HORIZON_DAYS,
  formatResearchPacketForPrompt,
  type ResearchPacket,
} from '@/lib/pm/research/researchPacketContract';

function boundedString(min: number, max: number) {
  return z.string()
    .transform(value => value.trim().slice(0, max))
    .pipe(z.string().min(min).max(max));
}

const decisionList = z.array(boundedString(3, 260)).min(1).max(6);

export const pmAnalysisSchema = z.object({
  targetPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  thesisSummary: boundedString(20, 600),
  whyWeOwnIt: boundedString(20, 800),
  primaryDriver: boundedString(5, 160),
  mainRisk: boundedString(5, 160),
  keyRisks: decisionList,
  catalysts: decisionList,
  sellConditions: decisionList,
  invalidationConditions: decisionList,
  convictionScore: z.number().int().min(0).max(100),
  timeHorizon: z.enum(['swing', 'position', 'core', 'tactical']),
  nextCatalyst: boundedString(5, 220),
  whatIsPriced: boundedString(0, 500).optional().default('Evidence was insufficient to isolate market expectations.'),
  upsidePath: boundedString(0, 500).optional().default('Requires estimates, catalyst, and price confirmation.'),
  downsidePath: boundedString(0, 500).optional().default('Thesis risk remains tied to weaker estimates or risk-premium expansion.'),
  confirmation: boundedString(0, 300).optional().default('Wait for verified fundamental or price confirmation.'),
  targetBasis: boundedString(0, 300).optional().default('Target constrained to available horizon evidence.'),
  evidenceGaps: z.array(boundedString(1, 160)).max(12).optional().default([]),
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
  researchPacket?: ResearchPacket;
}): { system: string; user: string } {
  const p = input.position;
  const avg = input.snapshots.length > 0
    ? input.snapshots.reduce((sum, s) => sum + s.score, 0) / input.snapshots.length
    : null;
  const entry = p.entryPrice ?? (p.costBasis != null && p.shares ? p.costBasis / p.shares : null);
  const pnlPct = entry != null && p.currentPrice != null
    ? ((p.currentPrice - entry) / entry) * 100
    : null;

  const horizonDays = input.researchPacket?.horizon.days ?? DEFAULT_RESEARCH_HORIZON_DAYS;
  const packetContext = input.researchPacket
    ? formatResearchPacketForPrompt(input.researchPacket)
    : 'VERIFIED RESEARCH PACKET: unavailable. Do not invent company facts, catalyst dates, estimates, or positioning.';
  const system = `You are a disciplined buy-side portfolio manager managing real capital over an explicit ${horizonDays}-day horizon. Produce a decision-ready plan grounded only in supplied evidence. Missing evidence is unknown, not neutral. You output strict JSON only — no prose, no code fences, no commentary outside the JSON.`;

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

${packetContext}

Scout signals (six functional research roles, most recent reads)
Average composite score: ${avg != null ? avg.toFixed(1) + '/100' : 'no coverage'}
${formatScoutSummary(input.snapshots)}

Return ONLY a JSON object with this exact shape:
{
  "targetPrice": <number, your base-case price at the end of the ${horizonDays}-day window>,
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
  "nextCatalyst": "<single most-watched upcoming event/data point>",
  "whatIsPriced": "<what current expectations already discount>",
  "upsidePath": "<what changes estimates or the multiple positively>",
  "downsidePath": "<fastest path to thesis failure>",
  "confirmation": "<specific evidence needed before sizing up>",
  "targetBasis": "<supplied forecast, consensus, valuation, or price evidence used>",
  "evidenceGaps": ["missing input that limits conviction"]
}

Guidelines:
- Target price must reflect the ${horizonDays}-day base case, not a 6-12 month target. Keep it inside the supplied forecast range when one exists.
- Stop loss should be a level where the thesis is materially wrong (often -8% to -15% from entry for swings, wider for cores).
- Conviction score: 80+ for high-conviction core, 60-79 for solid position, 40-59 for watchlist-grade, <40 means consider exiting.
- Name a catalyst date only when the verified packet supplies it. Otherwise state the confirming datapoint without inventing a date.
- If scouts disagree, weigh fundamentals + valuation more heavily than sentiment/technicals.
- If fundamentals or price-path evidence is missing, cap conviction below 60 and list the gap.
- Do not claim options flow, short interest, peer multiples, estimate revisions, or management guidance unless supplied.`;

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
  researchPacket?: ResearchPacket;
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
  const packet = input.researchPacket;
  const currentPrice = packet?.market.price.value ?? input.position.currentPrice;
  const lowerReturn = packet?.pricePath.lowerReturnPct.value ?? null;
  const upperReturn = packet?.pricePath.upperReturnPct.value ?? null;
  let targetPrice = result.data.targetPrice;
  let targetBasis = result.data.targetBasis;
  if (currentPrice && lowerReturn !== null && upperReturn !== null) {
    const lower = currentPrice * (1 + lowerReturn / 100);
    const upper = currentPrice * (1 + upperReturn / 100);
    const min = Math.min(lower, upper);
    const max = Math.max(lower, upper);
    const constrained = Math.min(max, Math.max(min, targetPrice));
    if (Math.abs(constrained - targetPrice) > 0.005) {
      targetPrice = Math.round(constrained * 100) / 100;
      targetBasis = `${packet?.horizon.days ?? DEFAULT_RESEARCH_HORIZON_DAYS}-day target constrained to the verified forecast range.`;
    }
  }
  const packetGaps = packet?.quality.missing ?? ['verified_research_packet'];
  const weakCoverage = !packet || packet.quality.coveragePct < 50;
  const missingCoreEvidence = packetGaps.includes('company_fundamentals') || packetGaps.includes('price_history_and_forecast');
  const convictionScore = weakCoverage || missingCoreEvidence
    ? Math.min(59, result.data.convictionScore)
    : result.data.convictionScore;

  return {
    ok: true,
    analysis: {
      ...result.data,
      targetPrice,
      targetBasis,
      convictionScore,
      evidenceGaps: Array.from(new Set([...result.data.evidenceGaps, ...packetGaps])).slice(0, 12),
    },
    provider: llmResult.provider,
    model: llmResult.model,
  };
}

/**
 * Investment Assistant Orchestrator
 *
 * Routes user messages to one of five analysis modes, maintains session
 * context, and builds tight analyst prompts that tie to the 1–3 month
 * investment horizon.
 *
 * Modes
 *   explain   – why is this stock ranked here
 *   evaluate  – buy / wait / avoid verdict with conviction level
 *   challenge – push back on assumptions in the ranking
 *   compare   – compare two or more stocks side-by-side
 *   pitch     – structured investment pitch (thesis, risk, positioning)
 *
 * Design constraints
 *   - Intent detection is regex-based: zero LLM cost, deterministic, testable
 *   - Each mode builds a tightly-scoped prompt; no generic ChatGPT preambles
 *   - Every response must mention: catalysts, key risk, 1–3 month window
 *   - Fallback defaults to 'explain' so context is never lost
 */

import type { ScoreBreakdown, RankedStock, EventItem } from '@/lib/ranking/types';
import { WEIGHTS } from '@/lib/ranking/score';

// ── Public types ───────────────────────────────────────────────────────────

export type InvestmentMode = 'explain' | 'evaluate' | 'challenge' | 'compare' | 'pitch';

/**
 * Full context for one investment assistant session.
 * Callers assemble this from /api/rank + /api/events + /api/timesfm output.
 */
export type OrchestratorContext = {
  primaryTicker:     string;
  score:             number;
  signal:            'green' | 'yellow' | 'red';
  horizonWeeks:      number;
  breakdown:         ScoreBreakdown;
  primaryReason:     string;
  mainRisk:          string;
  forecastReturnPct: number | null;
  catalystCount:     number;
  /** Raw event items — used to surface catalyst titles in prompts */
  events:            Pick<EventItem, 'title' | 'headline' | 'kind' | 'direction' | 'magnitude'>[];
  /** Closing-price series from /api/timesfm historical.prices (last N) */
  recentPrices:      number[];
  /** Optional ranked peers for compare mode */
  peers:             Pick<RankedStock, 'ticker' | 'score' | 'signal' | 'primaryReason' | 'mainRisk' | 'breakdown'>[];
  /** Conversation history — role + content tuples */
  history:           { role: 'user' | 'assistant'; content: string }[];
};

export type OrchestratorMessage = {
  role:    'system' | 'user' | 'assistant';
  content: string;
};

export type DetectionResult = {
  mode:       InvestmentMode;
  confidence: 'high' | 'low';
};

// ── House style injected into every system prompt ─────────────────────────

const HOUSE_STYLE = `
Write like a serious early-career buy-side analyst.
Every answer must be exactly four lines using these labels:
Current stance: Bullish / Neutral / Bearish.
Why now: what matters in the next 1-3 months.
Key driver: the single most important factor.
Main risk: what breaks the thesis.
Keep each line short. No markdown bullets, no extra paragraphs, no descriptive setup without a decision.
`.trim();

// ── Mode detection ─────────────────────────────────────────────────────────

const MODE_PATTERNS: Record<InvestmentMode, RegExp> = {
  explain: /\b(why|explain|ranked|ranking|score|how did|what drives?|reason|breakdown|basis|criteria|methodology|weight)\b/i,

  evaluate: /\b(buy|sell|wait|hold|avoid|invest|should i|worth(?: it)?|position|entry|timing|act on|pull the trigger|add|trim|exit|conviction|verdict|recommendation|trade)\b/i,

  challenge: /\b(wrong|pushback|push back|disagree|counter|challenge|bear case|what if|weakness|flaw|overrat|overstat|assumption|skeptic|poke hole|devil|too optimistic|too bullish|overpric|miss(ed)?|risk to|downside to)\b/i,

  compare: /\b(vs\.?|versus|compar|better|worse|which|both|against|between|relative|peers?|alternatives?|over|under)\b/i,

  // Require multi-word phrases for pitch to avoid eating generic words like "case" or "thesis"
  pitch: /\b(pitch|write.?up|one.?pager|investment case|investment note|investment thesis|structured pitch|write me a|draft (?:a|an|the)|memo format)\b/i,
};

/**
 * Deterministically classifies a user message into one of the five modes.
 * Pattern priority: evaluate > challenge > pitch > compare > explain.
 * challenge beats pitch so "push back on the bull thesis" routes correctly.
 * Returns low confidence when the winning match is ambiguous with another mode.
 */
export function detectMode(
  message:  string,
  context?: Pick<OrchestratorContext, 'primaryTicker' | 'peers'>,
): DetectionResult {
  const matched: InvestmentMode[] = [];

  // Test in priority order
  const priority: InvestmentMode[] = ['evaluate', 'challenge', 'pitch', 'compare', 'explain'];
  for (const mode of priority) {
    if (MODE_PATTERNS[mode].test(message)) matched.push(mode);
  }

  if (matched.length === 0) return { mode: 'explain', confidence: 'low' };

  // compare only fires if there's actually a second stock named
  const compareIdx = matched.indexOf('compare');
  if (compareIdx !== -1 && context?.peers?.length === 0) {
    const tickerLike = /\b[A-Z]{2,5}\b/g;
    const tokens     = message.match(tickerLike) ?? [];
    const stopwords  = new Set(['VS', 'OR', 'AND', 'THE', 'FOR', 'BUY', 'SELL', 'HOLD', 'WATCH']);
    const candidates = tokens.filter(
      t => !stopwords.has(t) && t !== (context?.primaryTicker ?? '').toUpperCase(),
    );
    if (candidates.length === 0) {
      // Downgrade — no peer named; remove compare from consideration
      matched.splice(compareIdx, 1);
    }
  }

  const winner = matched[0] ?? 'explain';
  return {
    mode:       winner,
    confidence: matched.length > 1 ? 'low' : 'high',
  };
}

// ── Shared context serialiser ──────────────────────────────────────────────

function serializeStockContext(ctx: OrchestratorContext): string {
  const signalLabel = ctx.signal === 'green' ? 'BUY' : ctx.signal === 'yellow' ? 'WATCH' : 'AVOID';
  const returnLine  =
    ctx.forecastReturnPct != null
      ? `Quantitative model: ${ctx.forecastReturnPct >= 0 ? '+' : ''}${ctx.forecastReturnPct.toFixed(1)}% projected over ${ctx.horizonWeeks} weeks.`
      : 'No live return forecast available.';

  const bdLines = (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).map(k => {
    const labels: Record<keyof typeof WEIGHTS, string> = {
      forecastSignal:   'Forecast Signal',
      catalystStrength: 'Catalyst Strength',
      momentum:         'Momentum',
      earningsSetup:    'Earnings Setup',
      valuationSignal:  'Valuation Signal',
      riskAdjustment:   'Risk / Volatility',
    };
    return `  ${labels[k]}: ${ctx.breakdown[k].toFixed(1)}/10  (wt ${Math.round(WEIGHTS[k] * 100)}%)`;
  });

  const topEvents = ctx.events
    .slice(0, 5)
    .map(e => {
      const dir = e.direction ?? 'neutral';
      const mag = e.magnitude ?? '';
      const title = e.title ?? e.headline ?? 'unnamed event';
      return `  [${dir}${mag ? '/' + mag : ''}] ${title}`;
    })
    .join('\n');

  return [
    `Ticker: ${ctx.primaryTicker}  |  Signal: ${signalLabel}  |  Score: ${ctx.score.toFixed(1)}/10`,
    `Horizon: ${ctx.horizonWeeks} weeks  |  ${returnLine}`,
    '',
    'Score breakdown:',
    bdLines.join('\n'),
    '',
    `Primary driver: ${ctx.primaryReason}`,
    `Key risk: ${ctx.mainRisk}`,
    '',
    `Catalysts on record (${ctx.catalystCount}):`,
    topEvents || '  None available',
  ].join('\n');
}

function serializePeers(peers: OrchestratorContext['peers']): string {
  if (peers.length === 0) return '  None provided.';
  return peers
    .map(p => {
      const sig = p.signal === 'green' ? 'BUY' : p.signal === 'yellow' ? 'WATCH' : 'AVOID';
      return `  ${p.ticker}  ${sig}  ${p.score.toFixed(1)}/10  |  ${p.primaryReason}`;
    })
    .join('\n');
}

// ── Per-mode prompt builders ───────────────────────────────────────────────

function buildSystemPrompt(mode: InvestmentMode, ctx: OrchestratorContext): string {
  const signalLabel = ctx.signal === 'green' ? 'BUY' : ctx.signal === 'yellow' ? 'WATCH' : 'AVOID';

  const modeInstruction: Record<InvestmentMode, string> = {
    explain: `Explain clearly and concisely why ${ctx.primaryTicker} received a ${signalLabel} signal at ${ctx.score.toFixed(1)}/10. Walk through the dominant scoring components, what the catalyst picture looks like, and where the risk sits. Tie everything to the ${ctx.horizonWeeks}-week window — not the multi-year story.`,

    evaluate: `Give a direct buy / wait / avoid verdict on ${ctx.primaryTicker} for the ${ctx.horizonWeeks}-week window. State your conviction level (high / medium / low). Lead with the judgment. Name the one catalyst that would confirm the thesis and the one that would invalidate it. Close with a one-sentence positioning guide.`,

    challenge: `Act as a sharp skeptic pushing back on the ${signalLabel} ranking for ${ctx.primaryTicker}. Identify the weakest assumptions in the scoring model, argue for the bear case, and name the factors the model may be underweighting. Be intellectually adversarial — not gratuitously negative, but genuinely challenging. End with what evidence would change your skeptical view.`,

    compare: `Compare ${ctx.primaryTicker} (${signalLabel}, ${ctx.score.toFixed(1)}) against the provided peer(s). Focus on: which has the better near-term catalyst setup, where the risk profiles differ, and which represents better risk-adjusted opportunity over the ${ctx.horizonWeeks}-week window. End with a ranked preference.`,

    pitch: `Write a structured investment pitch for ${ctx.primaryTicker} targeting the ${ctx.horizonWeeks}-week window. Structure: (1) headline thesis — one sentence; (2) bull case — three specific, mechanism-grounded points; (3) bear case — two genuine risks; (4) near-term catalysts — what could move it in the window; (5) positioning — entry, sizing, exit/stop logic. Tight, no generic filler.`,
  };

  return [
    'You are a buy-side equity analyst. Your job is to give decision-useful analysis, not to narrate facts.',
    '',
    HOUSE_STYLE,
    '',
    `Current task: ${modeInstruction[mode]}`,
    '',
    'Hard output constraints:',
    '- Output exactly 4 lines, no more.',
    '- Line 1 starts with "Current stance:" and must be Bullish, Neutral, or Bearish.',
    '- Line 2 starts with "Why now:" and must reference the next 1-3 months.',
    '- Line 3 starts with "Key driver:" and names the most important factor.',
    '- Line 4 starts with "Main risk:" and names what breaks the thesis.',
    '- No markdown bullets. No preamble. No long explanations.',
  ].join('\n');
}

function buildUserMessage(
  mode:    InvestmentMode,
  message: string,
  ctx:     OrchestratorContext,
): string {
  const stockBlock = serializeStockContext(ctx);
  const peerBlock  = mode === 'compare' ? `\nPeer stocks:\n${serializePeers(ctx.peers)}\n` : '';

  return [
    '=== STOCK CONTEXT ===',
    stockBlock,
    peerBlock,
    '=== USER QUESTION ===',
    message,
  ]
    .filter(Boolean)
    .join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Builds the full message list ready to pass to `openai.chat.completions.create`.
 * Includes conversation history so context carries across turns.
 */
export function buildOrchestratorMessages(
  mode:    InvestmentMode,
  message: string,
  ctx:     OrchestratorContext,
): OrchestratorMessage[] {
  const system: OrchestratorMessage = {
    role:    'system',
    content: buildSystemPrompt(mode, ctx),
  };

  const history: OrchestratorMessage[] = ctx.history.map(h => ({
    role:    h.role,
    content: h.content,
  }));

  const user: OrchestratorMessage = {
    role:    'user',
    content: buildUserMessage(mode, message, ctx),
  };

  return [system, ...history, user];
}

/**
 * Produces a streaming Response for use directly in a Next.js route handler.
 * Handles OpenAI model failover and returns a plain-text stream.
 */
export async function streamOrchestratorResponse(params: {
  message:  string;
  mode:     InvestmentMode;
  ctx:      OrchestratorContext;
  openai:   import('openai').default;
  models:   string[];
}): Promise<Response> {
  const { message, mode, ctx, openai, models } = params;
  const messages = buildOrchestratorMessages(mode, message, ctx);

  const maxTokens = 140;

  let stream: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
  let lastErr: unknown;

  for (const model of models) {
    try {
      stream = await openai.chat.completions.create({
        model,
        temperature: modeTemperature(mode),
        max_tokens:  maxTokens,
        stream:      true,
        messages,
      });
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!stream) {
    console.error('[orchestrator] all models failed:', lastErr);
    const fallback = staticFallback(mode, ctx);
    return new Response(fallback, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream!) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        console.error('[orchestrator] stream error:', err);
        controller.enqueue(encoder.encode('\n[Analysis interrupted]'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function modeTemperature(mode: InvestmentMode): number {
  switch (mode) {
    case 'pitch':     return 0.30;
    case 'challenge': return 0.40; // slight variation keeps the pushback fresh
    case 'compare':   return 0.20;
    case 'evaluate':  return 0.15; // verdict should be stable
    case 'explain':   return 0.20;
  }
}

/**
 * Deterministic fallback when the AI provider is unavailable.
 * Always includes signal, score, primary reason, main risk, and horizon.
 */
function staticFallback(mode: InvestmentMode, ctx: OrchestratorContext): string {
  const { primaryTicker: t, score, signal, horizonWeeks: hw, primaryReason, mainRisk, forecastReturnPct } = ctx;
  const stance = signal === 'green' ? 'Bullish' : signal === 'yellow' ? 'Neutral' : 'Bearish';
  const returnLine  =
    forecastReturnPct != null
      ? `Forecast adds ${forecastReturnPct >= 0 ? '+' : ''}${forecastReturnPct.toFixed(1)}% over ${hw} weeks.`
      : `The ${hw}-week setup depends on the next catalyst.`;
  const modeDriver = mode === 'challenge'
    ? `Weakest point is whether ${mainRisk}`
    : mode === 'compare'
      ? 'Relative rank versus peers depends on catalyst quality and risk'
      : primaryReason;

  return [
    `Current stance: ${stance} (${t}, ${score.toFixed(1)}/10).`,
    `Why now: ${returnLine}`,
    `Key driver: ${modeDriver}.`,
    `Main risk: ${mainRisk}.`,
  ].join('\n');
}

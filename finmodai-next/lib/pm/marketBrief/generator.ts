import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import type { EventItem } from '@/lib/news/api/shared';
import { isXConfigured, searchX, tickerQuery, sectorQuery, macroQuery, type XSearchResult } from '@/lib/pm/marketBrief/xClient';
import { buildMarketStatePacket } from '@/lib/pm/marketState/buildMarketState';
import { formatMarketStateForPrompt, type MarketStatePacket } from '@/lib/pm/marketState/marketStateContract';

// ── Schema for the structured brief ──────────────────────────────────────────

export const marketBriefSchema = z.object({
  marketMood: z.enum(['bullish', 'neutral', 'bearish', 'mixed']),
  marketMoodWhy: z.string().min(10).max(600),
  executiveSummary: z.array(z.string()).min(3).max(6),
  topTopics: z.array(z.object({
    topic: z.string(),
    whyTrending: z.string(),
    relevantTickers: z.array(z.string()).default([]),
    relevantSectors: z.array(z.string()).default([]),
    confidence: z.enum(['low', 'medium', 'high']),
    sources: z.array(z.string()).default([]),
  })).default([]),
  portfolioAlerts: z.array(z.object({
    ticker: z.string(),
    companyName: z.string().nullable().optional(),
    mentionVolume: z.enum(['normal', 'elevated', 'spiking']),
    sentiment: z.enum(['bullish', 'neutral', 'bearish', 'mixed']),
    keyPoints: z.array(z.string()).default([]),
    potentialThesisImpact: z.string().nullable().optional(),
  })).default([]),
  macroSignals: z.object({
    ratesFed: z.string().nullable().optional(),
    inflation: z.string().nullable().optional(),
    jobsEconomy: z.string().nullable().optional(),
    commoditiesEnergy: z.string().nullable().optional(),
    crypto: z.string().nullable().optional(),
    geopolitics: z.string().nullable().optional(),
  }).default({}),
  bullishArguments: z.array(z.string()).default([]),
  bearishArguments: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  recommendedAgentReviews: z.array(z.object({
    ticker: z.string().nullable().optional(),
    sector: z.string().nullable().optional(),
    reason: z.string(),
  })).default([]),
  confidence: z.enum(['low', 'medium', 'high']),
  pmHandoff: z.object({
    whatChanged: z.string(),
    deservesAttention: z.string(),
    canIgnore: z.string(),
  }),
});

export type MarketBriefAnalysis = z.infer<typeof marketBriefSchema>;

export type MarketBriefRecord = {
  id: string;
  runAt: string;
  runLabel: string; // e.g. "open" | "mid-morning" | "noon" | "afternoon" | "close" | "manual"
  source: 'x_trending_lookup' | 'news_pipeline' | 'hybrid';
  tickersCovered: string[];
  sectorsCovered: string[];
  summary: string;
  analysis: MarketBriefAnalysis;
  xSamplesCount: number;
  newsEventsCount: number;
  createdAt: string;
  updatedAt: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const SECTORS_TO_SCAN = [
  'AI',
  'fintech',
  'crypto',
  'cloud / software',
  'semiconductors',
  'energy',
  'consumer markets',
] as const;

const MACRO_THEMES = [
  'Fed rate cuts',
  'CPI inflation',
  'jobs report',
  'Treasury yields',
  'oil prices',
  'AI capex',
  'crypto regulation',
  'earnings season',
] as const;

export const RUN_LABELS = {
  '6':  'pre-open',
  '10': 'mid-morning',
  '12': 'noon',
  '14': 'afternoon',
  '16': 'close',
} as const;

export function runLabelForNow(now = new Date()): string {
  // ET-aware label. Vercel runs in UTC; convert to ET to pick the right slot.
  const utcHour = now.getUTCHours();
  const etHour = (utcHour - 4 + 24) % 24; // EDT in June; rough but stable
  const slot = String(etHour) as keyof typeof RUN_LABELS;
  return RUN_LABELS[slot] ?? 'manual';
}

// ── Signal gathering ──────────────────────────────────────────────────────────

type RawSignals = {
  tickersCovered: string[];
  sectorsCovered: string[];
  events: EventItem[];
  xSamples: Map<string, XSearchResult>;
  marketState: MarketStatePacket;
};

async function fetchRecentEvents(origin: string): Promise<EventItem[]> {
  // /api/events range param accepts: 1D | 3D | 1W | 1M | 3M. Anything else returns
  // 400 invalid_params. Widen progressively.
  for (const range of ['1D', '3D', '1W'] as const) {
    try {
      const res = await fetch(`${origin}/api/events?range=${range}&limit=50`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { events?: EventItem[]; items?: EventItem[] } | null;
      const items = data?.events ?? data?.items ?? [];
      if (items.length > 0) return items;
    } catch {
      // try next range
    }
  }
  return [];
}

async function gatherSignals(origin: string): Promise<RawSignals> {
  const [positions, events, marketState] = await Promise.all([
    listPositions({ limit: 200 }),
    fetchRecentEvents(origin),
    buildMarketStatePacket({ origin }),
  ]);
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch' || p.status === 'trimmed');
  const tickers = [...new Set(active.map(p => p.ticker.toUpperCase()))];
  const sectorsCovered = [...SECTORS_TO_SCAN];

  // X search — only if token is set. Cap queries to keep within rate limits.
  const xSamples = new Map<string, XSearchResult>();
  if (isXConfigured()) {
    const queries: Array<[string, string]> = [];
    // Ticker queries (cap at 8 to control rate-limit burn)
    for (const t of tickers.slice(0, 8)) queries.push([`ticker:${t}`, tickerQuery(t)]);
    // Sector queries
    for (const s of SECTORS_TO_SCAN.slice(0, 4)) queries.push([`sector:${s}`, sectorQuery(s)]);
    // Macro queries
    for (const m of MACRO_THEMES.slice(0, 4)) queries.push([`macro:${m}`, macroQuery(m)]);

    const results = await Promise.allSettled(queries.map(async ([key, q]) => {
      const r = await searchX(q, 10);
      return { key, r };
    }));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.r) xSamples.set(r.value.key, r.value.r);
    }
  }

  return { tickersCovered: tickers, sectorsCovered, events, xSamples, marketState };
}

// ── Prompt construction ──────────────────────────────────────────────────────

function topMentionedTickers(events: EventItem[]): Array<{ ticker: string; mentions: number; direction: 'up' | 'down' | 'flat' }> {
  const counts = new Map<string, { mentions: number; up: number; down: number }>();
  for (const ev of events) {
    for (const tk of ev.impacted_tickers ?? []) {
      const ticker = tk.ticker?.toUpperCase().trim();
      if (!ticker || ticker.length > 6) continue;
      const cur = counts.get(ticker) ?? { mentions: 0, up: 0, down: 0 };
      cur.mentions += 1;
      if (tk.direction === 'up') cur.up += 1;
      if (tk.direction === 'down') cur.down += 1;
      counts.set(ticker, cur);
    }
  }
  return [...counts.entries()]
    .map(([ticker, v]) => ({
      ticker,
      mentions: v.mentions,
      direction: (v.up > v.down ? 'up' : v.down > v.up ? 'down' : 'flat') as 'up' | 'down' | 'flat',
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 20);
}

function formatXBundle(xSamples: Map<string, XSearchResult>): string {
  if (xSamples.size === 0) return 'X search disabled (no X_BEARER_TOKEN). Use news + events only.';
  const sections: string[] = [];
  for (const [key, result] of xSamples) {
    if (result.tweets.length === 0) continue;
    const lines = result.tweets.slice(0, 5).map(t => {
      const text = t.text.replace(/\s+/g, ' ').slice(0, 220);
      return `  - [${t.likeCount}♥ ${t.retweetCount}↻] ${text}`;
    });
    sections.push(`Query "${key}" (${result.totalReturned} hits):\n${lines.join('\n')}`);
  }
  return sections.join('\n\n');
}

function buildPrompt(signals: RawSignals, previousSummary: string | null): { system: string; user: string } {
  const topTickers = topMentionedTickers(signals.events);
  const recentEventLines = signals.events
    .slice(0, 20)
    .map(e => `  - [${e.published_at?.slice(0, 16) ?? '?'}] ${e.title}`)
    .join('\n') || '  (no events in range)';

  const system = `You are a buy-side market-intelligence analyst writing a short, structured situation brief for a PM. You read X chatter and news events, then synthesize what matters. You output STRICT JSON only — no prose outside the JSON. You do NOT recommend trades. You distinguish verified news from social sentiment, flag rumors as rumors, and admit when signal is low.`;

  const user = `Tracked tickers (${signals.tickersCovered.length}): ${signals.tickersCovered.join(', ') || 'none'}
Sectors to scan: ${signals.sectorsCovered.join(', ')}
Run time: ${new Date().toISOString()}
Previous run summary: ${previousSummary ?? 'none'}

${formatMarketStateForPrompt(signals.marketState)}

Top mentioned tickers in recent events (last 24h):
${topTickers.length === 0 ? '  (none)' : topTickers.map(t => `  - ${t.ticker}: ${t.mentions} mentions, net ${t.direction}`).join('\n')}

Recent event headlines:
${recentEventLines}

X social signal:
${formatXBundle(signals.xSamples)}

Now produce the JSON brief with this exact shape:
{
  "marketMood": "bullish|neutral|bearish|mixed",
  "marketMoodWhy": "<1-2 sentence justification>",
  "executiveSummary": ["bullet 1", "bullet 2", "bullet 3", ...],   // 3-5 bullets
  "topTopics": [
    { "topic": "...", "whyTrending": "...", "relevantTickers": ["..."], "relevantSectors": ["..."], "confidence": "low|medium|high", "sources": ["..."] }
  ],
  "portfolioAlerts": [
    { "ticker": "...", "companyName": "...", "mentionVolume": "normal|elevated|spiking", "sentiment": "bullish|neutral|bearish|mixed", "keyPoints": ["..."], "potentialThesisImpact": "..." }
  ],
  "macroSignals": {
    "ratesFed": "...", "inflation": "...", "jobsEconomy": "...", "commoditiesEnergy": "...", "crypto": "...", "geopolitics": "..."
  },
  "bullishArguments": ["..."],
  "bearishArguments": ["..."],
  "riskFlags": ["..."],
  "recommendedAgentReviews": [
    { "ticker": "...", "sector": "...", "reason": "..." }
  ],
  "confidence": "low|medium|high",
  "pmHandoff": {
    "whatChanged": "1-2 sentences vs prior run",
    "deservesAttention": "single sentence on top focus",
    "canIgnore": "1 sentence on noise to skip"
  }
}

Rules:
- Anchor market mood in the verified market state. Social chatter cannot override price, breadth, volatility, rates, or cross-asset evidence.
- Distinguish index/sector tape from company-specific catalysts and state the transmission channel.
- Only include portfolioAlerts for tickers in the tracked list.
- Confidence "low" is OK — say so honestly when signal is thin.
- Quote at most 1-2 X posts per topic; never recommend trades.
- If nothing material is happening: marketMood "neutral", executiveSummary first bullet "No major signal detected.", confidence "low".
- recommendedAgentReviews should suggest which CapitalBase agent should look closer (e.g. "Senior Investment Committee" for thesis re-eval, "Macro scout" for rates).`;

  return { system, user };
}

function extractJson(text: string): string {
  const fence = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const t = text.trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) return t.slice(first, last + 1);
  return t;
}

/**
 * Best-effort JSON repair for common LLM output failures:
 *  - trailing commas inside arrays/objects
 *  - truncated output (response hit token limit mid-string/array/object)
 * Returns a parseable JSON string or null if unrepairable.
 */
function tryRepairJson(raw: string): string | null {
  let s = raw.trim();
  // Remove trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');

  // Try direct parse first
  try { JSON.parse(s); return s; } catch {}

  // Truncation: greedy close based on bracket stack
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length === 0) lastSafe = i;
    }
  }

  // If we ended mid-string, close the string and back out to the last comma boundary.
  if (inString) {
    const lastCommaInString = s.lastIndexOf(',');
    if (lastCommaInString > 0) s = s.slice(0, lastCommaInString);
    s = s.replace(/,(\s*)$/, '$1');
    inString = false;
  }

  // Re-evaluate stack after the string truncation
  const stack2: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack2.push(ch);
    else if (ch === '}' || ch === ']') stack2.pop();
  }
  // Close any open brackets in reverse order
  while (stack2.length > 0) {
    const open = stack2.pop();
    s += open === '{' ? '}' : ']';
  }
  s = s.replace(/,(\s*[}\]])/g, '$1');

  try { JSON.parse(s); return s; } catch {}

  // Last resort: cut to last balanced object
  if (lastSafe > 0) {
    const cut = s.slice(0, lastSafe + 1).replace(/,(\s*[}\]])/g, '$1');
    try { JSON.parse(cut); return cut; } catch {}
  }
  return null;
}

// ── Public entry ─────────────────────────────────────────────────────────────

export type GenerateBriefInput = {
  origin: string;
  runLabel?: string;
  previousSummary?: string | null;
};

export type GenerateBriefResult =
  | { ok: true; record: MarketBriefRecord }
  | { ok: false; reason: string };

export async function generateMarketBrief(input: GenerateBriefInput): Promise<GenerateBriefResult> {
  const runAt = new Date().toISOString();
  const runLabel = input.runLabel ?? runLabelForNow();
  const signals = await gatherSignals(input.origin);

  // Per spec: "If there is no important signal, say 'No major signal detected.'"
  // Don't error — let the LLM produce a thin brief with confidence=low.
  const { system, user } = buildPrompt(signals, input.previousSummary ?? null);
  const llm = await generateTextWithProviderFallback({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    maxTokens: 4000,
    timeoutMs: 75_000,
    preferredProvider: 'anthropic',
  });
  if (!llm) return { ok: false, reason: 'llm_unavailable' };

  const raw = extractJson(llm.text);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const repaired = tryRepairJson(raw);
    if (repaired) {
      try { parsed = JSON.parse(repaired); } catch { parsed = null; }
    }
  }
  if (parsed == null) {
    return { ok: false, reason: 'json_parse_failed_after_repair' };
  }
  const validated = marketBriefSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, reason: `schema_violation: ${validated.error.errors.slice(0, 3).map(e => `${e.path.join('.')}: ${e.message}`).join('; ')}` };
  }

  const analysis = validated.data;
  const summary = analysis.executiveSummary.slice(0, 3).join(' · ').slice(0, 380);
  const source: MarketBriefRecord['source'] = signals.xSamples.size > 0
    ? (signals.events.length > 0 ? 'hybrid' : 'x_trending_lookup')
    : 'news_pipeline';

  const xSamplesCount = [...signals.xSamples.values()].reduce((sum, r) => sum + r.tweets.length, 0);

  return {
    ok: true,
    record: {
      id: crypto.randomUUID(),
      runAt,
      runLabel,
      source,
      tickersCovered: signals.tickersCovered,
      sectorsCovered: signals.sectorsCovered,
      summary,
      analysis,
      xSamplesCount,
      newsEventsCount: signals.events.length,
      createdAt: runAt,
      updatedAt: runAt,
    },
  };
}

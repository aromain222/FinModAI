import { z } from 'zod';
import type { StockQuote } from '@/app/api/quotes/route';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import { getUpcomingEntries } from '@/lib/macroCalendar';
import { listPMRecords } from '@/lib/pm/persistence/store';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { listTheses } from '@/lib/pm/thesis/thesisStore';
import { buildMarketStatePacket } from '@/lib/pm/marketState/buildMarketState';
import type { MarketStatePacket } from '@/lib/pm/marketState/marketStateContract';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import type { InvestmentDecision, PMAlert, PortfolioPosition, PositionThesis } from '@/lib/pm/types';
import { isXConfigured, macroQuery, searchX } from '@/lib/pm/marketBrief/xClient';

const positionActionSchema = z.enum(['hold', 'add_watch', 'trim_watch', 'review']);

const memoSchema = z.object({
  executiveSummary: z.array(z.string().min(1)).min(3).max(6),
  portfolioRead: z.string().min(20).max(900),
  whatChanged: z.array(z.string().min(1)).min(1).max(8),
  lookingAhead: z.array(z.string().min(1)).min(1).max(10),
  positionViews: z.array(z.object({
    ticker: z.string().min(1),
    action: positionActionSchema,
    thesisUpdate: z.string().min(8).max(700),
    thesisPerformance: z.string().min(8).max(500),
    macroImpact: z.string().min(8).max(600),
    pricePlan: z.string().min(8).max(600),
    whyNow: z.string().min(8).max(500),
    nextCatalyst: z.string().min(3).max(300),
    mainRisk: z.string().min(3).max(300),
    invalidation: z.string().min(3).max(300),
  })).max(40),
});

type MemoAnalysis = z.infer<typeof memoSchema>;

export type DailyPortfolioPosition = {
  ticker: string;
  companyName: string | null;
  portfolioRole: string | null;
  marketValue: number | null;
  weightPct: number | null;
  price: number | null;
  dayChangePct: number | null;
  dayPnl: number | null;
  costBasis: number | null;
  returnSinceCostPct: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  upsideToTargetPct: number | null;
  downsideToStopPct: number | null;
  conviction: number | null;
  thesisStatus: string | null;
  thesisSummary: string | null;
  thesisConvictionChange: number | null;
  addConditions: string[];
  sellConditions: string[];
  invalidationConditions: string[];
  priceForecast: {
    horizonDays: number;
    bearCasePrice: number | null;
    baseCasePrice: number | null;
    bullCasePrice: number | null;
    source: string | null;
    asOf: string | null;
    methodology: string | null;
  } | null;
  catalysts: string[];
  keyRisks: string[];
  alerts: Array<{ severity: string; title: string; summary: string }>;
  latestDecision: { action: string; confidence: number; rationale: string } | null;
};

export type DailyPortfolioBrief = {
  id: string;
  ticker: null;
  runLabel: 'post_close' | 'manual';
  asOf: string;
  tradingDate: string;
  createdAt: string;
  updatedAt: string;
  source: {
    quotesAvailable: number;
    positionsCovered: number;
    marketStateCoveragePct: number;
    marketStateFallback: boolean;
    /** Optional for briefs persisted before macro provenance was added. */
    macroSources?: string[];
    warnings: string[];
  };
  portfolio: {
    marketValue: number | null;
    dayPnl: number | null;
    dayReturnPct: number | null;
    activePositions: number;
    strengthening: number;
    weakeningOrBroken: number;
  };
  market: {
    regime: MarketStatePacket['regime'];
    regimeConfidence: number;
    spyChangePct: number | null;
    vix: number | null;
    us10y: number | null;
    breadthNetPct: number | null;
    sectorLeaders: Array<{ name: string; changePct: number }>;
    sectorLaggards: Array<{ name: string; changePct: number }>;
  };
  positions: DailyPortfolioPosition[];
  analysis: MemoAnalysis;
  charts: {
    dailyPnlAttribution: Array<{ ticker: string; pnl: number; dayChangePct: number | null }>;
    priceLevels: Array<{ ticker: string; upsideToTargetPct: number | null; downsideToStopPct: number | null }>;
  };
};

type MacroSignal = {
  theme: string;
  summary: string;
  source: 'X';
  observedAt: string | null;
  url: string | null;
  unverified: true;
};

const MACRO_X_THEMES = [
  'Federal Reserve inflation interest rates',
  'AI capital spending semiconductors',
  'US consumer spending retail',
] as const;

type EventLike = {
  title?: unknown;
  published_at?: unknown;
  impacted_tickers?: unknown;
};

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number | null, decimals = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clean(value: string | null | undefined): string | null {
  const next = value?.replace(/\s+/g, ' ').trim();
  return next ? next : null;
}

function safeWarning(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'unknown_error');
  return message
    .replace(/(?:sk-ant-|sk-)[A-Za-z0-9_-]+/g, '[redacted_api_key]')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
}

function dayLabel(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1]!.trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return first >= 0 && last > first ? text.slice(first, last + 1) : text;
}

function eventTickers(event: EventLike): string[] {
  if (!Array.isArray(event.impacted_tickers)) return [];
  return event.impacted_tickers.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const ticker = (item as { ticker?: unknown }).ticker;
    return typeof ticker === 'string' && ticker.trim() ? [ticker.toUpperCase().trim()] : [];
  });
}

async function fetchQuotes(origin: string, tickers: string[], requestHeaders?: Headers): Promise<Map<string, StockQuote>> {
  if (tickers.length === 0) return new Map();
  try {
    const response = await fetch(`${origin}/api/quotes?symbols=${encodeURIComponent(tickers.join(','))}`, {
      cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: internalRequestHeaders(requestHeaders),
    });
    if (!response.ok) return new Map();
    const payload = await response.json() as { quotes?: StockQuote[] };
    return new Map((payload.quotes ?? []).map(quote => [quote.ticker.toUpperCase(), quote]));
  } catch {
    return new Map();
  }
}

async function fetchEvents(origin: string, requestHeaders?: Headers): Promise<EventLike[]> {
  try {
    const response = await fetch(`${origin}/api/events?range=1D&limit=100`, {
      cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: internalRequestHeaders(requestHeaders),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { events?: EventLike[] };
    return Array.isArray(payload.events) ? payload.events : [];
  } catch {
    return [];
  }
}

async function fetchMacroSignals(): Promise<MacroSignal[]> {
  if (!isXConfigured()) return [];
  const results = await Promise.all(MACRO_X_THEMES.map(async theme => ({
    theme,
    result: await searchX(macroQuery(theme), 10),
  })));
  return results.flatMap(({ theme, result }) => {
    const tweet = result?.tweets
      .slice()
      .sort((a, b) => (b.likeCount + b.retweetCount + b.replyCount) - (a.likeCount + a.retweetCount + a.replyCount))[0];
    return tweet ? [{
      theme,
      summary: clean(tweet.text) ?? 'No usable text returned.',
      source: 'X' as const,
      observedAt: tweet.createdAt || null,
      url: tweet.url || null,
      unverified: true as const,
    }] : [];
  });
}

export function selectSectorExtremes(
  sectors: Array<{ name: string; changePct: number }>,
  minimumSectorCount = 4,
): Pick<DailyPortfolioBrief['market'], 'sectorLeaders' | 'sectorLaggards'> {
  const unique = [...new Map(sectors
    .filter(sector => sector.name.trim() && Number.isFinite(sector.changePct))
    .map(sector => [sector.name.trim().toLowerCase(), { name: sector.name.trim(), changePct: sector.changePct }])).values()];
  if (unique.length < minimumSectorCount) return { sectorLeaders: [], sectorLaggards: [] };
  const sideCount = Math.min(3, Math.floor(unique.length / 2));
  const sorted = [...unique].sort((a, b) => b.changePct - a.changePct);
  const sectorLeaders = sorted.slice(0, sideCount);
  const leaderNames = new Set(sectorLeaders.map(sector => sector.name.toLowerCase()));
  const sectorLaggards = sorted.slice().reverse().filter(sector => !leaderNames.has(sector.name.toLowerCase())).slice(0, sideCount);
  return { sectorLeaders, sectorLaggards };
}

function positionMarketValue(position: PortfolioPosition, quote: StockQuote | undefined): number | null {
  const price = finite(quote?.price) ?? finite(position.currentPrice);
  const shares = finite(position.shares);
  if (price !== null && shares !== null) return round(price * shares);
  return finite(position.notionalExposure);
}

function positionPnl(position: PortfolioPosition, quote: StockQuote | undefined, marketValue: number | null): number | null {
  const shares = finite(position.shares);
  const changeAbs = finite(quote?.changeAbs);
  if (shares !== null && changeAbs !== null) return round(shares * changeAbs);
  const changePct = finite(quote?.changePct);
  return marketValue !== null && changePct !== null ? round(marketValue * changePct / 100) : null;
}

export function buildPositionSnapshots(params: {
  positions: PortfolioPosition[];
  quotes: Map<string, StockQuote>;
  theses: PositionThesis[];
  alerts: PMAlert[];
  decisions: InvestmentDecision[];
}): DailyPortfolioPosition[] {
  const thesisByTicker = new Map(params.theses.map(thesis => [thesis.ticker.toUpperCase(), thesis]));
  const alertsByTicker = new Map<string, PMAlert[]>();
  for (const alert of params.alerts) {
    if (!alert.ticker) continue;
    const key = alert.ticker.toUpperCase();
    alertsByTicker.set(key, [...(alertsByTicker.get(key) ?? []), alert]);
  }
  const decisionsByTicker = new Map<string, InvestmentDecision[]>();
  for (const decision of params.decisions) {
    const key = decision.ticker.toUpperCase();
    decisionsByTicker.set(key, [...(decisionsByTicker.get(key) ?? []), decision]);
  }
  const base = params.positions.map(position => {
    const ticker = position.ticker.toUpperCase();
    const quote = params.quotes.get(ticker);
    const thesis = thesisByTicker.get(ticker);
    const price = finite(quote?.price) ?? finite(position.currentPrice);
    const marketValue = positionMarketValue(position, quote);
    const targetPrice = finite(position.targetPrice);
    const stopLoss = finite(position.stopLoss);
    const relatedAlerts = (alertsByTicker.get(ticker) ?? []).slice(0, 3).map(alert => ({
      severity: alert.severity, title: alert.title, summary: alert.summary,
    }));
    const decision = (decisionsByTicker.get(ticker) ?? [])[0] ?? null;
    const latestHistory = thesis?.history?.at(-1);
    const costBasis = finite(position.entryPrice) ?? finite(position.costBasis);
    const forecast = thesis?.researchEvidence?.priceForecast;
    return {
      ticker,
      companyName: position.companyName,
      portfolioRole: position.portfolioRole ?? null,
      marketValue,
      weightPct: null,
      price,
      dayChangePct: finite(quote?.changePct),
      dayPnl: positionPnl(position, quote, marketValue),
      costBasis,
      returnSinceCostPct: price !== null && costBasis !== null && costBasis > 0 ? round((price / costBasis - 1) * 100, 1) : null,
      targetPrice,
      stopLoss,
      upsideToTargetPct: price !== null && targetPrice !== null && price > 0 ? round((targetPrice / price - 1) * 100, 1) : null,
      downsideToStopPct: price !== null && stopLoss !== null && price > 0 ? round((stopLoss / price - 1) * 100, 1) : null,
      conviction: finite(thesis?.convictionScore) ?? finite(position.convictionScore),
      thesisStatus: thesis?.thesisStatus ?? position.thesisIntegrity ?? null,
      thesisSummary: clean(thesis?.currentThesis) ?? clean(thesis?.thesisSummary) ?? clean(position.pmNotes),
      thesisConvictionChange: latestHistory?.convictionBefore !== null && latestHistory?.convictionBefore !== undefined
        ? round(latestHistory.convictionAfter - latestHistory.convictionBefore, 1)
        : null,
      addConditions: thesis?.addConditions?.slice(0, 3) ?? [],
      sellConditions: thesis?.sellConditions?.slice(0, 3) ?? [],
      invalidationConditions: thesis?.invalidationConditions?.slice(0, 3) ?? [],
      priceForecast: forecast ? {
        horizonDays: forecast.horizonDays,
        bearCasePrice: finite(forecast.bearCasePrice),
        baseCasePrice: finite(forecast.baseCasePrice),
        bullCasePrice: finite(forecast.bullCasePrice),
        source: clean(forecast.source),
        asOf: clean(forecast.asOf),
        methodology: clean(forecast.methodology),
      } : null,
      catalysts: thesis?.catalysts?.slice(0, 3) ?? [],
      keyRisks: thesis?.keyRisks?.slice(0, 3) ?? [],
      alerts: relatedAlerts,
      latestDecision: decision ? { action: decision.action, confidence: decision.confidence, rationale: decision.rationale } : null,
    } satisfies DailyPortfolioPosition;
  });
  const total = base.reduce((sum, item) => sum + (item.marketValue ?? 0), 0);
  return base
    .map(item => ({ ...item, weightPct: total > 0 && item.marketValue !== null ? round(item.marketValue / total * 100, 1) : null }))
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
}

export function fallbackAnalysis(params: {
  positions: DailyPortfolioPosition[];
  market: DailyPortfolioBrief['market'];
  upcoming: string[];
}): MemoAnalysis {
  const positionViews = params.positions.map(position => {
    const stressed = position.thesisStatus === 'broken' || position.thesisStatus === 'weakening'
      || (position.dayChangePct ?? 0) <= -3 || position.alerts.some(alert => alert.severity === 'high' || alert.severity === 'critical');
    const positive = position.thesisStatus === 'strengthening' && (position.dayChangePct ?? 0) >= 0;
    return {
      ticker: position.ticker,
      action: stressed ? 'review' as const : positive ? 'add_watch' as const : 'hold' as const,
      thesisUpdate: position.thesisSummary ?? 'No stored thesis update is available; refresh the position review.',
      thesisPerformance: position.returnSinceCostPct === null
        ? `The return versus recorded cost is unavailable; stored thesis status is ${position.thesisStatus ?? 'unrated'}.`
        : `The position is ${position.returnSinceCostPct >= 0 ? 'up' : 'down'} ${Math.abs(position.returnSinceCostPct).toFixed(1)}% versus recorded cost; stored thesis status is ${position.thesisStatus ?? 'unrated'}.`,
      macroImpact: 'No model-generated macro transmission view is available in the deterministic fallback; use the verified calendar and market regime above.',
      pricePlan: position.priceForecast?.baseCasePrice !== null && position.priceForecast?.baseCasePrice !== undefined
        ? `${position.priceForecast.horizonDays}-day provider path: bear $${position.priceForecast.bearCasePrice?.toFixed(2) ?? '—'}, base $${position.priceForecast.baseCasePrice.toFixed(2)}, bull $${position.priceForecast.bullCasePrice?.toFixed(2) ?? '—'}. Recorded target ${position.targetPrice === null ? 'unavailable' : `$${position.targetPrice.toFixed(2)}`}; stop ${position.stopLoss === null ? 'unavailable' : `$${position.stopLoss.toFixed(2)}`}.`
        : `Provider forecast unavailable. Recorded target ${position.targetPrice === null ? 'unavailable' : `$${position.targetPrice.toFixed(2)}`}; stop ${position.stopLoss === null ? 'unavailable' : `$${position.stopLoss.toFixed(2)}`}. Add only when a stored add condition is met.`,
      whyNow: position.dayChangePct === null ? 'Daily quote was unavailable; monitor the next verified close.' : `The position moved ${position.dayChangePct >= 0 ? '+' : ''}${position.dayChangePct.toFixed(1)}% on the latest session.`,
      nextCatalyst: position.catalysts[0] ?? 'No dated company catalyst is stored.',
      mainRisk: position.keyRisks[0] ?? position.alerts[0]?.summary ?? 'No new high-severity portfolio alert is stored.',
      invalidation: position.stopLoss !== null ? `Price below $${position.stopLoss.toFixed(2)} is the recorded stop.` : 'Use the stored thesis invalidation before changing size.',
    };
  });
  const weak = params.positions.filter(position => position.thesisStatus === 'weakening' || position.thesisStatus === 'broken').map(position => position.ticker);
  return {
    executiveSummary: [
      `${params.positions.length} active position${params.positions.length === 1 ? '' : 's'} are covered in this memo.`,
      `Market regime is ${params.market.regime.replace('_', ' ')} (${params.market.regimeConfidence}/100 confidence).`,
      weak.length > 0 ? `Thesis attention is required for ${weak.join(', ')}.` : 'No stored thesis is marked weakening or broken.',
    ],
    portfolioRead: 'Deterministic fallback: review the position-level evidence below before changing risk. The memo has not added any unsourced trade claim.',
    whatChanged: weak.length > 0 ? [`Stored thesis status deteriorated for ${weak.join(', ')}.`] : ['No material stored thesis-status change was detected.'],
    lookingAhead: params.upcoming.length > 0 ? params.upcoming : ['No high-importance macro event is on the stored seven-day calendar.'],
    positionViews,
  };
}

function promptForMemo(params: {
  positions: DailyPortfolioPosition[];
  market: DailyPortfolioBrief['market'];
  recentEvents: string[];
  upcoming: string[];
  macroSignals: MacroSignal[];
}): { system: string; user: string } {
  const system = `You are a buy-side portfolio manager writing a daily post-close portfolio memo. Use ONLY the supplied facts. Explain the transmission path from each relevant macro trend to revenue, margins, valuation, or risk for every held stock. Do not invent earnings dates, price levels, investor positioning, macro facts, or reasons for a stock move. X posts are explicitly unverified sentiment/positioning texture and cannot establish a fact. A missing field must be called unavailable. Price scenarios must repeat supplied provider-backed or PM-recorded levels; never create a new price. Add/trim/exit language must be conditional on stored thesis conditions, targets, or stops. Actions are monitoring labels only, never execution instructions. Write in direct PM language: what changed, what is priced, next catalyst, risk, and invalidation. Return strict JSON only.`;
  const user = JSON.stringify({
    market: params.market,
    positions: params.positions,
    lastSessionHeadlines: params.recentEvents,
    nextSevenDays: params.upcoming,
    unverifiedXMacroSignals: params.macroSignals,
    requiredShape: {
      executiveSummary: ['3-6 bullets'], portfolioRead: 'short PM paragraph', whatChanged: ['facts only'], lookingAhead: ['calendar/catalyst items'],
      positionViews: [{ ticker: 'each supplied ticker exactly once', action: 'hold|add_watch|trim_watch|review', thesisUpdate: 'current thesis in plain English', thesisPerformance: 'performance versus cost plus thesis status/conviction evidence', macroImpact: 'trend -> business/valuation transmission -> direction; state unavailable when unsupported', pricePlan: 'supplied bear/base/bull and stored add/target/stop conditions only', whyNow: '...', nextCatalyst: '...', mainRisk: '...', invalidation: '...' }],
    },
  });
  return { system, user };
}

export async function generateDailyPortfolioBrief(input: {
  origin: string;
  runLabel?: DailyPortfolioBrief['runLabel'];
  now?: Date;
  requestHeaders?: Headers;
}): Promise<DailyPortfolioBrief> {
  const now = input.now ?? new Date();
  const [positions, theses, alerts, decisions, marketState, events, macroSignals] = await Promise.all([
    listPositions({ limit: 200 }),
    listTheses({ limit: 300 }),
    listPMRecords<PMAlert>('pm_alerts', { limit: 300 }),
    listPMRecords<InvestmentDecision>('pm_investment_decisions', { limit: 300 }),
    buildMarketStatePacket({ origin: input.origin, now, requestHeaders: input.requestHeaders }),
    fetchEvents(input.origin, input.requestHeaders),
    fetchMacroSignals(),
  ]);
  const active = positions.filter(position => ['active', 'trimmed'].includes(position.status));
  const tickers = active.map(position => position.ticker.toUpperCase());
  const quotes = await fetchQuotes(input.origin, tickers, input.requestHeaders);
  const positionSnapshots = buildPositionSnapshots({ positions: active, quotes, theses, alerts, decisions });
  const sectorExtremes = selectSectorExtremes(marketState.sectors);
  const market: DailyPortfolioBrief['market'] = {
    regime: marketState.regime,
    regimeConfidence: marketState.regimeConfidence,
    spyChangePct: marketState.tape.spyChangePct.value,
    vix: marketState.tape.vix.value,
    us10y: marketState.tape.us10y.value,
    breadthNetPct: marketState.breadth.netPct,
    ...sectorExtremes,
  };
  const upcoming = getUpcomingEntries(now, 7).map(entry => `${entry.date}: ${entry.event}${entry.notes ? ` — ${entry.notes}` : ''}`);
  const recentEvents = events
    .filter(event => eventTickers(event).some(ticker => tickers.includes(ticker)))
    .slice(0, 12)
    .flatMap(event => typeof event.title === 'string' ? [event.title] : []);
  const fallback = fallbackAnalysis({ positions: positionSnapshots, market, upcoming });
  let analysis = fallback;
  let memoWarning: string | null = null;
  if (positionSnapshots.length > 0) {
    const prompt = promptForMemo({ positions: positionSnapshots, market, recentEvents, upcoming, macroSignals });
    try {
      const response = await generateTextWithProviderFallback({
        messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
        temperature: 0.15,
        maxTokens: 5_000,
        timeoutMs: 150_000,
        preferredProvider: 'anthropic',
      });
      const parsed = response ? memoSchema.safeParse(JSON.parse(extractJson(response.text))) : null;
      if (parsed?.success) {
        const byTicker = new Map(parsed.data.positionViews.map(view => [view.ticker.toUpperCase(), view]));
        analysis = {
          ...parsed.data,
          positionViews: positionSnapshots.map(position => byTicker.get(position.ticker) ?? fallback.positionViews.find(view => view.ticker === position.ticker)!),
        };
      } else if (!response) {
        memoWarning = 'daily_memo_llm_fallback:no_provider_response';
      } else {
        memoWarning = `daily_memo_llm_fallback:invalid_response:${parsed?.error.issues[0]?.message ?? 'invalid_json'}`;
      }
    } catch (error) {
      // The deterministic memo is intentionally useful when LLM output is unavailable.
      memoWarning = `daily_memo_llm_fallback:${safeWarning(error)}`;
    }
  }
  const totalValue = positionSnapshots.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const totalPnl = positionSnapshots.reduce((sum, position) => sum + (position.dayPnl ?? 0), 0);
  const positionsWithPnl = positionSnapshots.filter(position => position.dayPnl !== null).length;
  const freshQuoteCount = [...quotes.values()].filter(quote => finite(quote.price) !== null).length;
  const warnings = [
    ...(freshQuoteCount < tickers.length ? ['some_position_quotes_unavailable'] : []),
    ...marketState.quality.warnings,
    ...(marketState.quality.fallback ? ['market_state_fallback'] : []),
    ...(!isXConfigured() ? ['x_macro_signals_not_configured'] : macroSignals.length === 0 ? ['x_macro_signals_unavailable'] : []),
    ...(memoWarning ? [memoWarning] : []),
  ];
  return {
    id: crypto.randomUUID(),
    ticker: null,
    runLabel: input.runLabel ?? 'manual',
    asOf: now.toISOString(),
    tradingDate: dayLabel(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    source: {
      quotesAvailable: freshQuoteCount,
      positionsCovered: positionSnapshots.length,
      marketStateCoveragePct: marketState.quality.coveragePct,
      marketStateFallback: marketState.quality.fallback,
      macroSources: [...new Set(['CapitalBase event pipeline', 'CapitalBase macro calendar', ...macroSignals.map(signal => signal.source)])],
      warnings,
    },
    portfolio: {
      marketValue: totalValue > 0 ? round(totalValue) : null,
      dayPnl: positionsWithPnl > 0 ? round(totalPnl) : null,
      dayReturnPct: totalValue > 0 && positionsWithPnl > 0 ? round(totalPnl / totalValue * 100, 2) : null,
      activePositions: positionSnapshots.length,
      strengthening: positionSnapshots.filter(position => position.thesisStatus === 'strengthening').length,
      weakeningOrBroken: positionSnapshots.filter(position => position.thesisStatus === 'weakening' || position.thesisStatus === 'broken').length,
    },
    market,
    positions: positionSnapshots,
    analysis,
    charts: {
      dailyPnlAttribution: positionSnapshots.map(position => ({ ticker: position.ticker, pnl: position.dayPnl ?? 0, dayChangePct: position.dayChangePct })),
      priceLevels: positionSnapshots.map(position => ({ ticker: position.ticker, upsideToTargetPct: position.upsideToTargetPct, downsideToStopPct: position.downsideToStopPct })),
    },
  };
}

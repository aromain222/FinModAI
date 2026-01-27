/**
 * Market Brief View Model (DATA-FIRST + MORE CERTAIN)
 * 
 * This is the ONLY place that decides what appears in Market Brief.
 * All UI components should read from this view-model, not directly from APIs.
 * 
 * Structure:
 * - Data-first: Benchmark, Breadth, Headlines at top
 * - More Certain: Base case, Who Wins/Loses, Mechanisms, Watch-outs
 */

import { mapDriverTagsToSectors } from './sectorTickerMapper';

export type MarketBriefViewModel = {
  // DATA-FIRST SECTIONS (always render if data exists)
  benchmark: {
    ticker: string;
    returnPct: number | null;
    asOf: string;
    source: string;
  } | null;
  breadth: {
    sectorsUp: number;
    sectorsDown: number;
    winners: Array<{ sector: string; etf: string; returnPct: number }>;
    losers: Array<{ sector: string; etf: string; returnPct: number }>;
    coverage?: string; // e.g., "9/11 tickers"
  } | null;
  headlines: Array<{
    title: string;
    impact: string; // e.g., "Rates", "Energy", "Earnings", "Geopolitics"
    publishedAt: string;
    source?: string;
    marketImpact?: string; // 2-3 sentence deterministic base case
  }>;
  
  // MORE CERTAIN NARRATIVE
  baseCase: string; // 2-3 sentences, decisive
  whoWins: Array<{
    sector: string;
    etf: string;
    tickers: string[];
    reason?: string;
  }>;
  whoLoses: Array<{
    sector: string;
    etf: string;
    tickers: string[];
    reason?: string;
  }>;
  mechanisms: Array<{
    channel: string; // e.g., "Front-end yields ↑ → discount rates ↑ → duration assets ↓"
  }>;
  watchOuts: Array<string>; // Max 3 bullets, use "could" here
  watchNext?: {
    items: Array<{ label: string; date?: string; why: string }>;
    isGeneric?: boolean;
  };
  
  // LEGACY FIELDS (for backwards compatibility)
  snapshot: {
    title: string;
    tone: 'risk_on' | 'neutral' | 'risk_off';
    summary: string;
    confidence: 'high' | 'medium' | 'low';
    confidenceReason?: string;
  };
  sourcesStatus: {
    primarySource: string;
    usedFallback: boolean;
    lastUpdated: string;
    coverageNotes: string[];
  };
};

type EnrichPayload = {
  macroSummary?: string;
  marketNarrative?: string;
  keyDrivers?: string[];
  risks?: string[];
  sentiment?: 'Bullish' | 'Neutral' | 'Bearish';
  timestamp?: string;
};

type ProviderMeta = {
  asOf?: string;
  providerUsed?: string;
  stale?: boolean;
  traceId?: string;
};

type BenchmarkData = {
  ticker: string;
  returnPct: number | null;
  asOf: string;
  source: string;
};

type BreadthData = {
  sectorsUp: number;
  sectorsDown: number;
  winners: Array<{ sector: string; etf: string; returnPct: number }>;
  losers: Array<{ sector: string; etf: string; returnPct: number }>;
  coverage?: string;
};

type HeadlineData = {
  title: string;
  impact: string; // e.g., "Rates", "Energy", "Earnings", "Geopolitics"
  publishedAt: string;
  source?: string;
  marketImpact?: string; // 2-3 sentence deterministic base case
};

type MarketBriefData = {
  enrichData?: {
    data?: EnrichPayload;
    meta?: ProviderMeta;
  };
  indicesMeta?: ProviderMeta | undefined; // Explicitly allow undefined
  benchmark?: BenchmarkData;
  breadth?: BreadthData;
  headlines?: HeadlineData[];
  sectorMomentum?: Array<{
    sector: string;
    score: number;
    direction: 'up' | 'down' | 'flat';
    etf?: string;
  }>;
};

/**
 * Parses a driver string into label and detail.
 * Supports format: "label: detail" or just "label"
 */
function parseDriver(driver: string): { label: string; detail: string } {
  const parts = driver.includes(':') ? driver.split(':', 2) : [driver];
  return {
    label: parts[0]?.trim() || driver,
    detail: parts[1]?.trim() || '',
  };
}

/**
 * Determines confidence level based on data quality, coverage, and gaps
 */
function determineConfidence(
  narrative: string | null,
  hasDrivers: boolean,
  hasRisks: boolean,
  timestamp?: string,
  dataGaps?: Array<{ label: string; detail: string }>
): 'high' | 'medium' | 'low' {
  if (!narrative || narrative.trim().length < 50) return 'low';
  
  // Count data gaps to assess coverage quality
  const gapsCount = dataGaps && dataGaps.length > 0 ? dataGaps.length : 0;
  const hasSignificantGaps = gapsCount >= 2; // Multiple gaps indicate poor coverage
  
  const hasRecentTimestamp = timestamp && (Date.now() - new Date(timestamp).getTime()) < 24 * 60 * 60 * 1000;
  const hasCompleteData = hasDrivers && hasRisks && hasRecentTimestamp;
  
  // High confidence: complete data coverage, good narrative quality, no significant gaps
  if (hasCompleteData && narrative.length > 200 && !hasSignificantGaps) return 'high';
  
  // Medium confidence: some data available, minor gaps acceptable, or missing one component
  if ((hasDrivers || hasRisks) && !hasSignificantGaps && narrative.length >= 100) return 'medium';
  
  // Low confidence: significant data gaps, missing critical components, or poor narrative
  return 'low';
}

/**
 * Maps sentiment to market tone
 */
function mapSentimentToTone(sentiment?: 'Bullish' | 'Neutral' | 'Bearish'): 'risk_on' | 'neutral' | 'risk_off' {
  if (sentiment === 'Bullish') return 'risk_on';
  if (sentiment === 'Bearish') return 'risk_off';
  return 'neutral';
}

/**
 * Checks if narrative is valid and meaningful
 */
function isValidSnapshot(narrative?: string): boolean {
  if (!narrative || typeof narrative !== 'string') return false;
  
  const trimmed = narrative.trim();
  if (trimmed.length < 20) return false;
  
  const lower = trimmed.toLowerCase();
  if (lower.includes('unavailable')) return false;
  if (lower.includes('commentary unavailable at this time')) return false;
  if (lower.includes('coming soon')) return false;
  
  return true;
}

/**
 * Generates coverage notes based on data availability and quality
 * Market Brief only tracks coverage for enrich data and indices (snapshot context)
 */
function generateCoverageNotes(data: MarketBriefData): string[] {
  const notes: string[] = [];
  
  if (data.indicesMeta?.stale) {
    notes.push('Market indices: Using cached data (stale)');
  }
  
  if (data.enrichData?.meta?.stale) {
    notes.push('Market enrichment: Using cached data (stale)');
  }
  
  if (data.indicesMeta?.providerUsed === 'fallback' || 
      data.enrichData?.meta?.providerUsed === 'fallback') {
    notes.push('Some data sources using fallback providers');
  }
  
  return notes;
}

/**
 * Determines primary data source from Market Brief sources
 * Market Brief only uses enrich data and indices (not sector/chart/headlines)
 */
function determinePrimarySource(data: MarketBriefData): string {
  const sources: string[] = [];
  
  if (data.enrichData?.meta?.providerUsed && data.enrichData.meta.providerUsed !== 'fallback') {
    sources.push(data.enrichData.meta.providerUsed);
  }
  
  if (data.indicesMeta?.providerUsed && data.indicesMeta.providerUsed !== 'fallback') {
    sources.push(data.indicesMeta.providerUsed);
  }
  
  if (sources.length > 0) {
    return sources[0]; // Return first non-fallback source
  }
  
  return data.enrichData?.meta?.providerUsed || 
         data.indicesMeta?.providerUsed || 
         'unknown';
}

/**
 * Determines if fallback sources were used
 * Market Brief only tracks enrich data and indices sources
 */
function usedFallback(data: MarketBriefData): boolean {
  return !!(
    data.enrichData?.meta?.providerUsed === 'fallback' ||
    data.indicesMeta?.providerUsed === 'fallback'
  );
}

/**
 * Gets the most recent update timestamp
 * Market Brief only tracks enrich data and indices timestamps
 */
function getLastUpdated(data: MarketBriefData): string {
  const timestamps: string[] = [];
  
  if (data.enrichData?.data?.timestamp) timestamps.push(data.enrichData.data.timestamp);
  if (data.indicesMeta?.asOf) timestamps.push(data.indicesMeta.asOf);
  
  if (timestamps.length === 0) return new Date().toISOString();
  
  // Return most recent timestamp
  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

/**
 * Extracts watch next items tied causally to the market summary
 * Items should connect to what's driving markets based on the summary
 */
function extractWatchNext(
  data: MarketBriefData,
  summary: string
): {
  items: Array<{ label: string; date?: string; why: string }>;
} {
  const summaryLower = summary.toLowerCase();
  const items: Array<{ label: string; date?: string; why: string }> = [];
  
  // Tie items to what's mentioned in the summary
  if (summaryLower.includes('inflation') || summaryLower.includes('cpi')) {
    items.push({
      label: 'Next CPI print',
      date: undefined,
      why: 'Recent inflation trends mentioned in summary will be validated by next release',
    });
  }
  
  if (summaryLower.includes('fed') || summaryLower.includes('rate') || summaryLower.includes('fomc')) {
    items.push({
      label: 'Next FOMC messaging',
      date: undefined,
      why: 'Fed policy signals referenced in summary will be updated by upcoming communications',
    });
  }
  
  if (summaryLower.includes('unemployment') || summaryLower.includes('jobs')) {
    items.push({
      label: 'Next jobs report',
      date: undefined,
      why: 'Labor market conditions highlighted in summary will be confirmed by upcoming data',
    });
  }
  
  if (summaryLower.includes('earnings') || summaryLower.includes('corporate')) {
    items.push({
      label: 'Earnings season updates',
      date: undefined,
      why: 'Corporate performance trends mentioned in summary will be validated by upcoming reports',
    });
  }
  
  // Fallback to default items if summary doesn't mention key topics (max 3 total)
  const defaults: Array<{ label: string; date?: string; why: string }> = [
    {
      label: 'Next CPI print',
      date: undefined,
      why: 'Inflation data shapes Fed policy and market expectations',
    },
    {
      label: 'Next FOMC messaging',
      date: undefined,
      why: 'Fed communications drive rate expectations and market sentiment',
    },
    {
      label: 'Earnings season breadth',
      date: undefined,
      why: 'Corporate earnings trends indicate economic health and market direction',
    },
  ];
  
  // Combine causal items with defaults, removing duplicates
  const combined = [...items];
  for (const defaultItem of defaults) {
    if (!combined.find(item => item.label === defaultItem.label) && combined.length < 3) {
      combined.push(defaultItem);
    }
  }
  
  return {
    items: combined.slice(0, 3), // Max 3 items
  };
}

/**
 * Generates a fallback market summary when data is insufficient
 * Always provides a narrative, even if data-limited
 */
function generateFallbackSummary(data: MarketBriefData): string {
  const hasMacroData = data.enrichData?.data?.macroSummary || data.enrichData?.data?.marketNarrative;
  const hasIndexData = data.indicesMeta;
  
  if (!hasMacroData && !hasIndexData) {
    return 'Market data is currently unavailable. Without macro indicators (CPI, unemployment, Fed Funds) and index returns, we cannot provide a detailed market analysis at this time. Refresh to retry data retrieval.';
  }
  
  if (!hasMacroData) {
    return 'Limited market context available. Index returns are present, but macro indicators (CPI, unemployment, Fed Funds) are missing, which restricts our ability to assess fundamental drivers. Monitor key macro releases for updated analysis.';
  }
  
  if (!hasIndexData) {
    return 'Macro data is available, but index returns are missing. Without SPY/QQQ performance data, we cannot assess recent market behavior relative to fundamental indicators. Refresh to retry data retrieval.';
  }
  
  // This shouldn't happen if we're calling fallback, but provide a generic message
  return 'Market analysis is being generated with limited data coverage. The summary reflects available information but may have reduced confidence due to data gaps.';
}

/**
 * Generates confidence reason for tooltip
 */
function generateConfidenceReason(
  confidence: 'high' | 'medium' | 'low',
  hasDrivers: boolean,
  hasRisks: boolean,
  hasRecentTimestamp: boolean,
  gapsCount: number
): string {
  if (confidence === 'high') {
    return 'High confidence: Complete data coverage with recent macro indicators, market drivers, and risk analysis.';
  }
  if (confidence === 'medium') {
    const reasons: string[] = [];
    if (!hasDrivers) reasons.push('drivers missing');
    if (!hasRisks) reasons.push('risk analysis missing');
    if (!hasRecentTimestamp) reasons.push('stale data');
    if (gapsCount > 0) reasons.push(`${gapsCount} data gap${gapsCount > 1 ? 's' : ''}`);
    return `Medium confidence: Most data available, but ${reasons.join(', ')}.`;
  }
  const reasons: string[] = [];
  if (!hasDrivers && !hasRisks) reasons.push('drivers and risks missing');
  else if (!hasDrivers) reasons.push('drivers missing');
  else if (!hasRisks) reasons.push('risk analysis missing');
  if (gapsCount >= 2) reasons.push('multiple data gaps');
  if (!hasRecentTimestamp) reasons.push('stale data');
  return `Low confidence: ${reasons.join(', ')}. Summary is best-effort with limited data.`;
}

/**
 * Generates data limitations (max 1-2 bullets)
 */
function generateDataLimitations(data: MarketBriefData, hasValidSnapshot: boolean): Array<{ label: string; detail: string }> {
  const limitations: Array<{ label: string; detail: string }> = [];
  
  if (!hasValidSnapshot) {
    const hasMacroData = data.enrichData?.data?.macroSummary || data.enrichData?.data?.marketNarrative;
    const hasIndexData = data.indicesMeta;
    
    if (!hasMacroData) {
      limitations.push({
        label: 'Macro indicators unavailable',
        detail: 'CPI, unemployment, and Fed Funds data needed for full analysis',
      });
    }
    if (!hasIndexData && limitations.length < 2) {
      limitations.push({
        label: 'Index returns unavailable',
        detail: 'SPY/QQQ performance data needed for market context',
      });
    }
  }
  
  // Keep max 2 limitations
  return limitations.slice(0, 2);
}

/**
 * Generates "more certain" base case narrative (2-3 sentences, decisive)
 * Derived from actual market facts: benchmark return, breadth, headline tags
 */
function generateBaseCase(
  data: MarketBriefData,
  benchmark: BenchmarkData | null,
  breadth: BreadthData | null,
  driverTags: string[]
): string {
  const benchmarkReturn = benchmark?.returnPct ?? null;
  const hasPositiveBreadth = breadth && breadth.sectorsUp > breadth.sectorsDown;
  const hasNegativeBreadth = breadth && breadth.sectorsDown > breadth.sectorsUp;
  const headlineTags = (data.headlines || []).map((h) => h.impact);
  const topHeadlineTag = headlineTags.length > 0 
    ? headlineTags.reduce((a, b, i, arr) => arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b, headlineTags[0])
    : null;
  
  const sentences: string[] = [];
  
  // Sentence 1: Benchmark fact (if available)
  if (benchmarkReturn !== null && benchmark) {
    const direction = benchmarkReturn >= 0 ? 'higher' : 'lower';
    const magnitude = Math.abs(benchmarkReturn);
    const magnitudeDesc = magnitude > 2 ? 'significantly' : magnitude > 1 ? 'moderately' : 'slightly';
    sentences.push(`${benchmark.ticker} is ${magnitudeDesc} ${direction} ${benchmarkReturn >= 0 ? '+' : ''}${benchmarkReturn.toFixed(2)}% over the selected period`);
  } else if (benchmark) {
    sentences.push(`${benchmark.ticker} data is available but return calculation is pending`);
  }
  
  // Sentence 2: Breadth fact (if available)
  if (breadth) {
    if (hasPositiveBreadth) {
      sentences.push(`${breadth.sectorsUp} sectors are advancing vs ${breadth.sectorsDown} declining, indicating positive breadth`);
      if (breadth.winners.length > 0) {
        const topWinner = breadth.winners[0];
        sentences[sentences.length - 1] += ` with ${topWinner.sector} (${topWinner.etf}) leading gains`;
      }
    } else if (hasNegativeBreadth) {
      sentences.push(`${breadth.sectorsDown} sectors are declining vs ${breadth.sectorsUp} advancing, indicating negative breadth`);
      if (breadth.losers.length > 0) {
        const topLoser = breadth.losers[0];
        sentences[sentences.length - 1] += ` with ${topLoser.sector} (${topLoser.etf}) underperforming`;
      }
    } else if (breadth.sectorsUp === breadth.sectorsDown) {
      sentences.push(`Market breadth is balanced with ${breadth.sectorsUp} sectors up and ${breadth.sectorsDown} down`);
    }
  }
  
  // Sentence 3: Headline-driven context (if available)
  if (topHeadlineTag && topHeadlineTag !== 'Macro') {
    if (topHeadlineTag === 'Rates') {
      sentences.push('Rate-sensitive sectors are responding to Fed policy signals');
    } else if (topHeadlineTag === 'Energy') {
      sentences.push('Energy price movements are driving sector rotation');
    } else if (topHeadlineTag === 'Earnings') {
      sentences.push('Corporate earnings trends are shaping market sentiment');
    } else if (topHeadlineTag === 'Geopolitics') {
      sentences.push('Geopolitical developments are influencing risk sentiment');
    }
  }
  
  // Fallback if no facts available
  if (sentences.length === 0) {
    return 'Base case: Market data is being collected. Analysis will update as facts become available.';
  }
  
  // Combine into 2-3 sentences
  return `Base case: ${sentences.slice(0, 2).join('. ')}. ${sentences[2] || 'Monitor key drivers for directional shifts'}.`;
}

/**
 * Generates mechanisms (likely channels)
 */
function generateMechanisms(driverTags: string[]): Array<{ channel: string }> {
  const mechanisms: Array<{ channel: string }> = [];
  const hasRates = driverTags.some((tag) => /rate|fed|yield/i.test(tag));
  const hasEnergy = driverTags.some((tag) => /energy|oil/i.test(tag));
  const hasGeopolitics = driverTags.some((tag) => /geopolit|war/i.test(tag));
  
  if (hasRates) {
    mechanisms.push({
      channel: 'Front-end yields ↑ → discount rates ↑ → duration assets ↓',
    });
    mechanisms.push({
      channel: 'Curve steepening/flattening → banks margin impact',
    });
  }
  
  if (hasEnergy) {
    mechanisms.push({
      channel: 'Energy prices ↑ → input costs ↑ → margins compress for energy-intensive sectors',
    });
  }
  
  if (hasGeopolitics) {
    mechanisms.push({
      channel: 'Geopolitical risk ↑ → safe-haven flows → defensive sectors outperform',
    });
  }
  
  if (mechanisms.length === 0) {
    mechanisms.push({
      channel: 'Sector rotation driven by earnings expectations and macro data',
    });
  }
  
  return mechanisms.slice(0, 4); // Max 4 mechanisms
}

/**
 * Generates watch-outs (max 3 bullets, use "could" here)
 */
function generateWatchOuts(
  data: MarketBriefData,
  driverTags: string[]
): string[] {
  const watchOuts: string[] = [];
  
  const hasRates = driverTags.some((tag) => /rate|fed/i.test(tag));
  const hasEnergy = driverTags.some((tag) => /energy|oil/i.test(tag));
  const hasGeopolitics = driverTags.some((tag) => /geopolit/i.test(tag));
  
  if (hasRates) {
    watchOuts.push('Fed pivot could reverse rate-sensitive underperformance');
  }
  
  if (hasEnergy) {
    watchOuts.push('Energy price volatility could disrupt sector rotation');
  }
  
  if (hasGeopolitics) {
    watchOuts.push('Geopolitical escalation could trigger broader risk-off');
  }
  
  // Add data quality watch-outs
  if (!data.benchmark || !data.breadth) {
    watchOuts.push('Limited data coverage could mask underlying trends');
  }
  
  return watchOuts.slice(0, 3); // Max 3 watch-outs
}

/**
 * Builds the Market Brief view model from raw API data
 * DATA-FIRST + MORE CERTAIN approach
 */
export function buildMarketBriefViewModel(data: MarketBriefData): MarketBriefViewModel {
  // Extract driver tags from keyDrivers
  const driverTags = (data.enrichData?.data?.keyDrivers || [])
    .filter((d) => typeof d === 'string' && d.trim())
    .map((d) => d.trim());
  
  // Map drivers to sectors/tickers
  const { winners: sectorWinners, losers: sectorLosers } = mapDriverTagsToSectors(
    driverTags,
    data.sectorMomentum
  );
  
  // Build benchmark
  const benchmark = data.benchmark || null;
  
  // Build breadth
  const breadth = data.breadth || null;
  
  // Build headlines (limit to 5)
  const headlines = (data.headlines || []).slice(0, 5);
  
  // Generate base case
  const baseCase = generateBaseCase(data, benchmark, breadth, driverTags);
  
  // Generate mechanisms
  const mechanisms = generateMechanisms(driverTags);
  
  // Generate watch-outs
  const watchOuts = generateWatchOuts(data, driverTags);
  
  // Build who wins/loses from sector mapper
  const whoWins = sectorWinners.map((w) => ({
    sector: w.sector,
    etf: w.etf,
    tickers: w.tickers,
  }));
  
  const whoLoses = sectorLosers.map((l) => ({
    sector: l.sector,
    etf: l.etf,
    tickers: l.tickers,
  }));
  
  // Legacy snapshot (for backwards compatibility)
  const narrative = data.enrichData?.data?.marketNarrative;
  const hasValidSnapshot = isValidSnapshot(narrative);
  const summary = hasValidSnapshot && narrative
    ? narrative.trim()
    : baseCase; // Use base case as fallback
  
  const confidence = determineConfidence(
    summary,
    driverTags.length > 0,
    (data.enrichData?.data?.risks || []).length > 0,
    data.enrichData?.data?.timestamp,
    []
  );
  
  const confidenceReason = generateConfidenceReason(
    confidence,
    driverTags.length > 0,
    (data.enrichData?.data?.risks || []).length > 0,
    data.enrichData?.data?.timestamp ? (Date.now() - new Date(data.enrichData.data.timestamp).getTime()) < 24 * 60 * 60 * 1000 : false,
    0
  );
  
  const snapshot = {
    title: 'Market Summary',
    tone: hasValidSnapshot ? mapSentimentToTone(data.enrichData?.data?.sentiment) : 'neutral',
    summary: baseCase, // Use base case as primary summary
    confidence,
    confidenceReason,
  };
  
  // Build sources status
  const sourcesStatus = {
    primarySource: determinePrimarySource(data),
    usedFallback: usedFallback(data),
    lastUpdated: getLastUpdated(data),
    coverageNotes: generateCoverageNotes(data),
  };
  
  // Extract watch next items (tied to base case)
  const watchNext = extractWatchNext(data, baseCase);
  
  return {
    benchmark,
    breadth,
    headlines,
    baseCase,
    whoWins,
    whoLoses,
    mechanisms,
    watchOuts,
    watchNext,
    snapshot,
    sourcesStatus,
  };
}


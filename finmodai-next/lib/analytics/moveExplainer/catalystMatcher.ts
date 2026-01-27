/**
 * Catalyst Matcher
 * Matches news/events to price moves deterministically
 * Enhanced with after-hours attribution, headline clustering, and improved scoring
 */

import type { MoveEvent, NewsItem, EventItem, Catalyst, CatalystEvidence } from './types';
import { getTradingDateForNews } from './tradingHours';
import { deduplicateHeadlines } from './headlineClustering';

/**
 * Normalize date for comparison (YYYY-MM-DD)
 */
function normalizeDate(date: string): string {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Get date window for catalyst matching
 */
function getDateWindow(moveDate: string, interval: 'daily' | 'weekly'): { start: string; end: string } {
  const move = new Date(moveDate);
  
  if (interval === 'daily') {
    // Same day ±1 day
    const start = new Date(move);
    start.setDate(start.getDate() - 1);
    const end = new Date(move);
    end.setDate(end.getDate() + 1);
    
    return {
      start: normalizeDate(start.toISOString()),
      end: normalizeDate(end.toISOString()),
    };
  } else {
    // Weekly: within that week (Monday-Sunday)
    const dayOfWeek = move.getDay();
    const monday = new Date(move);
    monday.setDate(move.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    return {
      start: normalizeDate(monday.toISOString()),
      end: normalizeDate(sunday.toISOString()),
    };
  }
}

/**
 * Check if a date is within the window
 */
function isInWindow(dateStr: string, window: { start: string; end: string }): boolean {
  const date = normalizeDate(dateStr);
  return date >= window.start && date <= window.end;
}

/**
 * Strong keywords that indicate significant events
 */
const STRONG_KEYWORDS = [
  // Earnings
  'earnings', 'eps', 'beat', 'miss', 'guidance', 'raised', 'lowered', 'surprise',
  // SEC filings
  'sec', '10-k', '10-q', '8-k', 'filing', 'form',
  // Regulatory/legal
  'doj', 'fda', 'approval', 'rejection', 'investigation', 'lawsuit', 'settlement',
  // M&A
  'acquisition', 'merger', 'takeover', 'buyout', 'deal', 'agreement',
  // Analyst actions
  'downgrade', 'upgrade', 'initiate', 'price target', 'rating', 'analyst',
  // Macro events
  'cpi', 'jobs report', 'fed', 'interest rate', 'inflation', 'unemployment',
  // Company-specific
  'ceo', 'cto', 'cfo', 'resign', 'hire', 'launch', 'product',
];

/**
 * Authoritative event type priority (higher = more authoritative)
 */
const EVENT_TYPE_PRIORITY: Record<string, number> = {
  earnings: 100,
  guidance: 90,
  filing: 70,
  analyst: 50,
  macro: 40,
  other: 20,
};

/**
 * Major credible sources (positive weight)
 */
const MAJOR_SOURCES = [
  'reuters', 'bloomberg', 'wsj', 'wall street journal', 
  'ft', 'financial times', 'cnbc', 'marketwatch', 
  'yahoo finance', 'barrons', 'forbes', 'business insider',
  'polygon', 'sec', 'finnhub',
];

/**
 * Low-credibility sources (negative weight)
 */
const LOW_CREDIBILITY_SOURCES = [
  'reddit', 'twitter', 'x.com', 'blog', 'medium', 
  'seeking alpha', 'motley fool', 'benzinga',
  'news-detected', // Inferred events
];

/**
 * Get source credibility score
 */
function getSourceCredibilityScore(source?: string): number {
  if (!source) return 0;
  
  const sourceLower = source.toLowerCase();
  
  // Major sources get positive score
  if (MAJOR_SOURCES.some(major => sourceLower.includes(major))) {
    return 15;
  }
  
  // Low-credibility sources get negative score
  if (LOW_CREDIBILITY_SOURCES.some(low => sourceLower.includes(low))) {
    return -10;
  }
  
  return 0;
}

/**
 * Score a candidate news/event item with improved scoring
 */
function scoreCandidate(
  item: NewsItem | EventItem,
  move: MoveEvent,
  interval: 'daily' | 'weekly'
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  
  // Event type priority (authoritative events get highest scores)
  if ('type' in item && item.type) {
    const priority = EVENT_TYPE_PRIORITY[item.type] || 0;
    score += priority;
    reasons.push(`${item.type}_event_priority:${priority}`);
  }
  
  // Recency: closer to move date = higher score
  const itemDate = 'publishedAt' in item ? item.publishedAt : item.date;
  const moveDate = new Date(move.date);
  const itemDateTime = new Date(itemDate);
  const daysDiff = Math.abs((itemDateTime.getTime() - moveDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff <= 1) {
    score += 30;
    reasons.push('very_recent');
  } else if (daysDiff <= 2) {
    score += 20;
    reasons.push('recent');
  } else if (daysDiff <= 3) {
    score += 10;
    reasons.push('somewhat_recent');
  }
  
  // Keyword matching (only for news items, events already scored by type)
  if (!('type' in item) || item.type === 'other') {
    const text = (item.title + ' ' + ('summary' in item && item.summary ? item.summary : '')).toLowerCase();
    const matchedKeywords: string[] = [];
    
    for (const keyword of STRONG_KEYWORDS) {
      if (text.includes(keyword)) {
        score += 15;
        matchedKeywords.push(keyword);
      }
    }
    
    if (matchedKeywords.length > 0) {
      reasons.push(`keywords:${matchedKeywords.join(',')}`);
    }
  }
  
  // Source credibility (major sources get bonus, low-credibility get penalty)
  const source = 'source' in item ? item.source : undefined;
  const credibilityScore = getSourceCredibilityScore(source);
  if (credibilityScore > 0) {
    score += credibilityScore;
    reasons.push('major_source');
  } else if (credibilityScore < 0) {
    score += credibilityScore; // Negative, so subtracts
    reasons.push('low_credibility_source');
  }
  
  // Direction match (for earnings/guidance, positive news should match up moves)
  const text = (item.title + ' ' + ('summary' in item && item.summary ? item.summary : '')).toLowerCase();
  if (move.returnPct > 0 && (text.includes('beat') || text.includes('raised') || text.includes('upgrade'))) {
    score += 5;
    reasons.push('direction_match_positive');
  }
  if (move.returnPct < 0 && (text.includes('miss') || text.includes('lowered') || text.includes('downgrade'))) {
    score += 5;
    reasons.push('direction_match_negative');
  }
  
  return { score, reasons };
}

/**
 * Match catalysts to a move event
 */
export function matchCatalysts(
  move: MoveEvent,
  news: NewsItem[],
  events: EventItem[],
  interval: 'daily' | 'weekly'
): Catalyst {
  const window = getDateWindow(move.date, interval);
  
  // Apply after-hours attribution to news items
  const newsWithTradingDates = news.map(n => ({
    ...n,
    tradingDate: getTradingDateForNews(n.publishedAt),
  }));
  
  // Filter news by trading date (after-hours attribution)
  const newsCandidates = newsWithTradingDates.filter(n => 
    isInWindow(n.tradingDate, window)
  ).map(({ tradingDate, ...rest }) => rest); // Remove tradingDate before clustering
  
  // Cluster and deduplicate headlines
  const deduplicatedNews = deduplicateHeadlines(newsCandidates);
  
  // Find event candidates within window
  const eventCandidates = events.filter(e => isInWindow(e.date, window));
  
  // Score all candidates separately
  const scoredNewsCandidates: Array<{
    item: NewsItem;
    score: number;
    reasons: string[];
    evidence: CatalystEvidence;
  }> = [];
  
  const scoredEventCandidates: Array<{
    item: EventItem;
    score: number;
    reasons: string[];
    evidence: CatalystEvidence;
  }> = [];
  
  for (const item of deduplicatedNews) {
    const { score, reasons } = scoreCandidate(item, move, interval);
    scoredNewsCandidates.push({
      item,
      score,
      reasons,
      evidence: {
        kind: 'news',
        title: item.title,
        url: item.url,
        source: item.source,
        publishedAt: item.publishedAt,
      },
    });
  }
  
  for (const item of eventCandidates) {
    const { score, reasons } = scoreCandidate(item, move, interval);
    scoredEventCandidates.push({
      item,
      score,
      reasons,
      evidence: {
        kind: 'event',
        title: item.title,
        url: item.url,
        source: item.source,
        date: item.date,
      },
    });
  }
  
  // Combine and sort all candidates by score
  const scoredCandidates = [
    ...scoredNewsCandidates.map(c => ({ ...c, item: c.item as NewsItem | EventItem })),
    ...scoredEventCandidates.map(c => ({ ...c, item: c.item as NewsItem | EventItem })),
  ];
  
  // Sort by score (descending)
  scoredCandidates.sort((a, b) => b.score - a.score);
  
  // Determine confidence and create catalyst
  if (scoredCandidates.length === 0) {
    return {
      label: 'No single dominant headline found',
      confidence: 'low',
      evidence: [],
      rationale: 'Move may reflect broader market/sector positioning or multiple small headlines.',
    };
  }
  
  const topCandidate = scoredCandidates[0];
  const top3 = scoredCandidates.slice(0, 3);
  const top5Events = scoredEventCandidates.slice(0, 5);
  const top5News = scoredNewsCandidates.slice(0, 5);
  
  // Improved confidence determination:
  // High: (1 authoritative event) OR (2+ supporting headlines with score >= 40)
  // Medium: (1 headline with score >= 40) OR (multiple headlines with score >= 30)
  // Low: otherwise
  let confidence: 'high' | 'medium' | 'low';
  
  const hasAuthoritativeEvent = top5Events.some(e => {
    const eventType = e.item.type;
    return eventType === 'earnings' || eventType === 'guidance' || eventType === 'filing';
  });
  
  const highScoreHeadlines = scoredNewsCandidates.filter(c => c.score >= 40);
  const mediumScoreHeadlines = scoredNewsCandidates.filter(c => c.score >= 30);
  
  if (hasAuthoritativeEvent || highScoreHeadlines.length >= 2) {
    confidence = 'high';
  } else if (topCandidate.score >= 40 || mediumScoreHeadlines.length >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  // Generate label
  let label = topCandidate.item.title;
  if (topCandidate.item.title.length > 60) {
    label = topCandidate.item.title.substring(0, 60) + '...';
  }
  
  // Build rationale with source information
  const eventSources = top5Events.map(e => e.evidence.source || 'unknown').filter(s => s !== 'news-detected');
  const inferredCount = top5Events.filter(e => (e.evidence.source || '').includes('news-detected')).length;
  const rationaleParts = [
    `Match score: ${topCandidate.score}`,
    topCandidate.reasons.join(', '),
    `${top3.length} candidate${top3.length > 1 ? 's' : ''} found`,
  ];
  if (eventSources.length > 0) {
    rationaleParts.push(`Authoritative sources: ${Array.from(new Set(eventSources)).join(', ')}`);
  }
  if (inferredCount > 0) {
    rationaleParts.push(`${inferredCount} event${inferredCount > 1 ? 's' : ''} inferred from news`);
  }
  const rationale = rationaleParts.join('. ') + '.';
  
  return {
    label,
    confidence,
    evidence: top3.map(c => c.evidence),
    eventEvidence: top5Events.map(c => c.evidence),
    newsEvidence: top5News.map(c => c.evidence),
    rationale,
  };
}


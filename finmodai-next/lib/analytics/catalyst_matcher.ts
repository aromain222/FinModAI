/**
 * Deterministic Catalyst Matcher
 * Matches news and events to price moves without hallucinations
 */

import type { MoveEvent } from './move_detection';
import type { NewsItem, EventItem } from '../lib/market_data/providers/types';

/**
 * Catalyst Evidence
 */
export type CatalystEvidence = {
  title: string;
  url?: string;
  source?: string;
  publishedAt?: string; // For news items
};

/**
 * Catalyst Result
 */
export type Catalyst = {
  label: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: CatalystEvidence[];
  rationale: string;
};

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date is a trading day (Monday-Friday)
 */
function isTradingDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Monday = 1, Friday = 5
}

/**
 * Get next trading day (skip weekends)
 */
function getNextTradingDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (!isTradingDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/**
 * Get previous trading day (skip weekends)
 */
function getPreviousTradingDay(date: Date): Date {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  while (!isTradingDay(prev)) {
    prev.setDate(prev.getDate() - 1);
  }
  return prev;
}

/**
 * Get date window for catalyst matching
 */
function getDateWindow(moveDate: string, interval: 'daily' | 'weekly'): { start: string; end: string } {
  const move = new Date(moveDate);
  if (isNaN(move.getTime())) {
    throw new Error(`Invalid move date: ${moveDate}`);
  }

  if (interval === 'daily') {
    // Same day ±1 trading day
    const start = getPreviousTradingDay(move);
    const end = getNextTradingDay(move);

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
  'earnings',
  'eps',
  'beat',
  'miss',
  'guidance',
  'raised',
  'lowered',
  'surprise',
  'quarterly results',
  // SEC filings
  'sec',
  '10-k',
  '10-q',
  '8-k',
  'filing',
  'form',
  // Regulatory/legal
  'doj',
  'fda',
  'approval',
  'rejection',
  'investigation',
  'lawsuit',
  'settlement',
  // M&A
  'acquisition',
  'merger',
  'takeover',
  'buyout',
  'deal',
  'agreement',
  // Analyst actions
  'downgrade',
  'upgrade',
  'initiate',
  'price target',
  'rating',
  'analyst',
  // Macro events
  'cpi',
  'jobs report',
  'fed',
  'interest rate',
  'inflation',
  'unemployment',
  // Company-specific
  'ceo',
  'cto',
  'cfo',
  'resign',
  'hire',
  'launch',
  'product',
];

/**
 * Event type priority (higher = more authoritative)
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
  'reuters',
  'bloomberg',
  'wsj',
  'wall street journal',
  'ft',
  'financial times',
  'cnbc',
  'marketwatch',
  'yahoo finance',
  'barrons',
  'forbes',
  'business insider',
  'polygon',
  'sec',
  'finnhub',
];

/**
 * Low-credibility sources (negative weight)
 */
const LOW_CREDIBILITY_SOURCES = ['reddit', 'twitter', 'x.com', 'blog', 'medium', 'seeking alpha', 'motley fool', 'benzinga'];

/**
 * Get source credibility score
 */
function getSourceCredibilityScore(source?: string): number {
  if (!source) return 0;

  const sourceLower = source.toLowerCase();

  // Major sources get positive score
  if (MAJOR_SOURCES.some((major) => sourceLower.includes(major))) {
    return 15;
  }

  // Low-credibility sources get negative score
  if (LOW_CREDIBILITY_SOURCES.some((low) => sourceLower.includes(low))) {
    return -10;
  }

  return 0;
}

/**
 * Score a candidate news/event item
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
    if (priority > 0) {
      score += priority;
      reasons.push(`event_type:${item.type}`);
    }
  }

  // Recency: closer to move date = higher score
  const itemDate = 'publishedAt' in item ? item.publishedAt : item.date;
  const itemDateNormalized = normalizeDate(itemDate);
  const moveDateNormalized = normalizeDate(move.date);

  if (itemDateNormalized === moveDateNormalized) {
    score += 20; // Same day
    reasons.push('same_day');
  } else if (interval === 'daily') {
    const daysDiff = Math.abs(
      (new Date(itemDateNormalized).getTime() - new Date(moveDateNormalized).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysDiff === 1) {
      score += 10; // ±1 day
      reasons.push('adjacent_day');
    }
  } else {
    // Weekly: within same week
    score += 15;
    reasons.push('same_week');
  }

  // Strong keywords in title
  const title = item.title.toLowerCase();
  const summary = 'summary' in item && item.summary ? item.summary.toLowerCase() : '';
  const text = title + ' ' + summary;

  let keywordCount = 0;
  for (const keyword of STRONG_KEYWORDS) {
    if (text.includes(keyword)) {
      keywordCount++;
      score += 5; // Each keyword adds 5 points
    }
  }

  if (keywordCount > 0) {
    reasons.push(`keywords:${keywordCount}`);
  }

  // Source credibility
  const source = 'source' in item ? item.source : undefined;
  const credibilityScore = getSourceCredibilityScore(source);
  if (credibilityScore > 0) {
    score += credibilityScore;
    reasons.push('major_source');
  } else if (credibilityScore < 0) {
    score += credibilityScore; // Penalize
    reasons.push('low_credibility_source');
  }

  // Direction match (if we can infer direction from text)
  const isPositiveMove = move.direction === 'up';
  const hasPositiveKeywords = ['beat', 'raised', 'upgrade', 'approval', 'acquisition', 'deal'].some((kw) =>
    text.includes(kw)
  );
  const hasNegativeKeywords = ['miss', 'lowered', 'downgrade', 'rejection', 'lawsuit', 'investigation'].some(
    (kw) => text.includes(kw)
  );

  if ((isPositiveMove && hasPositiveKeywords) || (!isPositiveMove && hasNegativeKeywords)) {
    score += 10;
    reasons.push('direction_match');
  } else if ((isPositiveMove && hasNegativeKeywords) || (!isPositiveMove && hasPositiveKeywords)) {
    score -= 5; // Penalize direction mismatch
    reasons.push('direction_mismatch');
  }

  return { score, reasons };
}

/**
 * Match catalysts to a move event
 * Deterministic algorithm - no hallucinations
 */
export function matchCatalysts(
  move: MoveEvent,
  news: NewsItem[],
  events: EventItem[],
  interval: 'daily' | 'weekly'
): Catalyst {
  const window = getDateWindow(move.date, interval);

  // Find candidates within window
  const newsCandidates = news.filter((n) => isInWindow(n.publishedAt, window));
  const eventCandidates = events.filter((e) => isInWindow(e.date, window));

  if (newsCandidates.length === 0 && eventCandidates.length === 0) {
    return {
      label: 'No dominant headline found',
      confidence: 'low',
      evidence: [],
      rationale: 'No news or events found within the matching window.',
    };
  }

  // Score all candidates
  type ScoredCandidate = {
    item: NewsItem | EventItem;
    score: number;
    reasons: string[];
    evidence: CatalystEvidence;
  };

  const scoredCandidates: ScoredCandidate[] = [];

  // Score news items
  for (const item of newsCandidates) {
    const { score, reasons } = scoreCandidate(item, move, interval);
    scoredCandidates.push({
      item,
      score,
      reasons,
      evidence: {
        title: item.title,
        url: item.url,
        source: item.source,
        publishedAt: item.publishedAt,
      },
    });
  }

  // Score event items
  for (const item of eventCandidates) {
    const { score, reasons } = scoreCandidate(item, move, interval);
    scoredCandidates.push({
      item,
      score,
      reasons,
      evidence: {
        title: item.title,
        url: item.url,
        source: item.source,
      },
    });
  }

  // Sort by score (descending)
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Take top candidates
  const top3 = scoredCandidates.slice(0, 3);
  const topCandidate = scoredCandidates[0];

  if (!topCandidate || topCandidate.score < 30) {
    // Low confidence - no strong match
    return {
      label: 'No dominant headline found',
      confidence: 'low',
      evidence: top3.map((c) => c.evidence),
      rationale: `No strong catalyst match found. Top candidate score: ${topCandidate?.score || 0}. Found ${scoredCandidates.length} candidate(s) within window.`,
    };
  }

  // Determine confidence based on score and number of supporting items
  let confidence: 'high' | 'medium' | 'low';
  const hasAuthoritativeEvent = eventCandidates.some((e) => {
    const eventType = e.type;
    return eventType === 'earnings' || eventType === 'guidance' || eventType === 'filing';
  });

  if (topCandidate.score >= 100 || (topCandidate.score >= 80 && hasAuthoritativeEvent)) {
    confidence = 'high';
  } else if (topCandidate.score >= 50 || (topCandidate.score >= 40 && top3.length >= 2)) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Generate label from top candidate (deterministic, no LLM)
  let label = topCandidate.item.title;

  // If multiple strong candidates, create composite label
  if (top3.length >= 2 && top3[0].score >= 40 && top3[1].score >= 40) {
    const titles = top3.slice(0, 2).map((c) => c.item.title);
    label = titles.join(' + ');
  }

  // Truncate if too long
  if (label.length > 100) {
    label = label.substring(0, 97) + '...';
  }

  // Generate rationale
  const rationaleParts = [
    `Match score: ${topCandidate.score}`,
    topCandidate.reasons.slice(0, 3).join(', '), // Top 3 reasons
    `${scoredCandidates.length} candidate(s) found`,
  ];

  if (hasAuthoritativeEvent) {
    rationaleParts.push('Authoritative event source found');
  }

  const rationale = rationaleParts.join('. ') + '.';

  return {
    label,
    confidence,
    evidence: top3.map((c) => c.evidence),
    rationale,
  };
}


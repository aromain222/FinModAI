/**
 * Macro Events Deduplication
 * Groups headlines by canonical event title and selects representative sources
 */

import type { RawNewsItem, MacroEvent, MacroEventWindow, MacroEventConfidence, MacroEventCategory } from './types';
import { normalizeToCanonicalTitle, isReputableSource } from './normalize';
import { generateObservedImpact } from './impact';
import { generateChannelsAndUncertainty } from './channels';
import { generateMacroEventSynthesis } from '@/lib/ai/macro_event_synthesis';

/**
 * Group headlines by canonical event title within time window
 * @param items Raw news items
 * @param timeWindowHours Hours to consider for grouping (default: 48)
 * @returns Map of canonical title -> items in that group
 */
export function groupByCanonicalTitle(
  items: RawNewsItem[],
  timeWindowHours: number = 48
): Map<string, RawNewsItem[]> {
  const groups = new Map<string, RawNewsItem[]>();
  const now = Date.now();
  const cutoff = now - timeWindowHours * 60 * 60 * 1000;

  for (const item of items) {
    const publishedAt = new Date(item.publishedAt).getTime();
    
    // Skip items older than time window
    if (publishedAt < cutoff) continue;

    const { canonicalTitle } = normalizeToCanonicalTitle(item);
    
    if (!groups.has(canonicalTitle)) {
      groups.set(canonicalTitle, []);
    }
    groups.get(canonicalTitle)!.push(item);
  }

  return groups;
}

/**
 * Select representative source headline from a group
 * Prefers reputable sources (Reuters/AP/Bloomberg/WSJ/FT), otherwise most recent
 */
function selectRepresentativeSource(group: RawNewsItem[]): RawNewsItem {
  if (group.length === 0) throw new Error('Empty group');

  // Separate reputable and non-reputable sources
  const reputable = group.filter((item) => isReputableSource(item.source));
  const nonReputable = group.filter((item) => !isReputableSource(item.source));

  // If we have reputable sources, pick most recent
  if (reputable.length > 0) {
    return reputable.sort((a, b) => {
      const aTime = new Date(a.publishedAt).getTime();
      const bTime = new Date(b.publishedAt).getTime();
      return bTime - aTime; // Most recent first
    })[0]!;
  }

  // Otherwise, pick most recent from all
  return group.sort((a, b) => {
    const aTime = new Date(a.publishedAt).getTime();
    const bTime = new Date(b.publishedAt).getTime();
    return bTime - aTime; // Most recent first
  })[0]!;
}

/**
 * Calculate confidence based on sources and event type
 */
function calculateConfidence(
  group: RawNewsItem[],
  canonicalTitle: string
): MacroEventConfidence {
  const reputableCount = group.filter((item) => isReputableSource(item.source)).length;
  const isScheduledRelease = /release|report|data|print/i.test(canonicalTitle) && 
    /CPI|PPI|PCE|GDP|jobs|employment|payroll|unemployment|FOMC|fed.*funds/i.test(canonicalTitle);

  // High confidence: >=2 reputable sources OR scheduled macro release
  if (reputableCount >= 2 || isScheduledRelease) {
    return 'high';
  }

  // Medium confidence: 1 reputable source
  if (reputableCount >= 1) {
    return 'medium';
  }

  // Low confidence: no reputable sources
  return 'low';
}

/**
 * Determine event window based on recency and content
 */
function determineWindow(group: RawNewsItem[]): MacroEventWindow {
  if (group.length === 0) return 'known';

  const now = Date.now();
  const mostRecent = group
    .map((item) => ({ item, time: new Date(item.publishedAt).getTime() }))
    .sort((a, b) => b.time - a.time)[0];

  if (!mostRecent) return 'known';

  const ageHours = (now - mostRecent.time) / (1000 * 60 * 60);
  const haystack = `${mostRecent.item.title} ${mostRecent.item.summary || ''}`.toLowerCase();

  // Breaking: last 2 hours or contains "breaking"
  if (ageHours < 2 || /breaking|just.*in|developing|live|urgent/i.test(haystack)) {
    return 'breaking';
  }

  // Scheduled: contains scheduling keywords
  if (/scheduled|upcoming|expected|announcement|meeting|release|report|data.*release/i.test(haystack)) {
    return 'scheduled';
  }

  // Developing: 2-24 hours old
  if (ageHours < 24) {
    return 'developing';
  }

  // Known: older than 24 hours
  return 'known';
}

/**
 * Deduplicate and transform grouped items into MacroEvents
 * @param groups Map of canonical title -> items
 * @param marketData Optional market data for impact calculation (deprecated - now uses generateObservedImpact)
 * @returns Deduplicated MacroEvents array, sorted by recency
 */
export async function deduplicateToEvents(
  groups: Map<string, RawNewsItem[]>,
  marketData?: { changePct?: number | null; points?: Array<{ t: string; close: number }> }
): Promise<MacroEvent[]> {
  const eventBuilders: Array<{
    id: string;
    title: string;
    category: MacroEventCategory;
    window: MacroEventWindow;
    confidence: MacroEventConfidence;
    eventTime: string | null;
    sources: Array<{ title: string; url: string; source: string; publishedAt: string }>;
    summary: string;
    observedMetrics: Array<{ label: string; value: string; note?: string }>;
    marketImpact: {
      observed: Array<{ label: string; value: string; note?: string }>;
      likely_channels: string[];
      uncertainty: string[];
    };
  }> = [];

  // First pass: Build all events with deterministic data
  for (const [canonicalTitle, group] of groups.entries()) {
    if (group.length === 0) continue;

    const { category } = normalizeToCanonicalTitle(group[0]!);
    const representative = selectRepresentativeSource(group);
    const confidence = calculateConfidence(group, canonicalTitle);
    const window = determineWindow(group);

    // Collect all sources for this event
    const sources = group
      .map((item) => ({
        title: item.title || 'Untitled',
        url: item.url || '',
        source: item.source || 'Unknown',
        publishedAt: item.publishedAt,
      }))
      .sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1)); // Most recent first

    // Use most recent publishedAt as event_time
    const eventTime = sources[0]?.publishedAt || null;

    // Generate summary from representative and group
    const summary = generateEventSummary(representative, group, category);

    // Generate observed market impact metrics (async)
    const observedMetrics = await generateObservedImpact(eventTime, category);

    // Generate market impact with observed metrics
    const marketImpact = generateMarketImpactForCategory(category, summary, observedMetrics);

    // Generate unique ID
    const id = generateEventId(canonicalTitle, eventTime);

    eventBuilders.push({
      id,
      title: canonicalTitle,
      category,
      window,
      confidence,
      eventTime,
      sources,
      summary,
      observedMetrics,
      marketImpact,
    });
  }

  // Second pass: Generate AI synthesis in parallel (optional, with timeout)
  // Only generate synthesis for reasonable number of events (performance consideration)
  const synthesisPromises = eventBuilders.slice(0, 10).map(async (builder) => {
    try {
      const synthesisInput = {
        canonicalTitle: builder.title,
        category: builder.category,
        sourceHeadlines: builder.sources.map((s) => ({ title: s.title })),
        observedMetrics: builder.observedMetrics,
      };
      // Use Promise.race with timeout to avoid hanging (5s timeout per event)
      const synthesisPromise = generateMacroEventSynthesis(synthesisInput, builder.id);
      const timeoutPromise = new Promise<MacroEvent['ai_synthesis'] | null>((resolve) => {
        setTimeout(() => resolve(null), 5000);
      });
      const synthesis = await Promise.race([synthesisPromise, timeoutPromise]);
      return { id: builder.id, synthesis };
    } catch (error) {
      // Fail silently - AI synthesis is optional
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[dedupe] Failed to generate AI synthesis for ${builder.title}:`, error);
      }
      return { id: builder.id, synthesis: null };
    }
  });

  // Wait for all synthesis attempts in parallel (with timeout protection)
  const synthesisResults = await Promise.allSettled(synthesisPromises);
  const synthesisMap = new Map<string, MacroEvent['ai_synthesis']>();

  for (const result of synthesisResults) {
    if (result.status === 'fulfilled' && result.value.synthesis) {
      synthesisMap.set(result.value.id, result.value.synthesis);
    }
  }

  // Build final events with optional AI synthesis
  const events: MacroEvent[] = eventBuilders.map((builder) => ({
    id: builder.id,
    title: builder.title,
    category: builder.category,
    window: builder.window,
    confidence: builder.confidence,
    event_time: builder.eventTime,
    sources: builder.sources,
    market_impact: builder.marketImpact,
    summary: builder.summary,
    ...(synthesisMap.has(builder.id) ? { ai_synthesis: synthesisMap.get(builder.id)! } : {}),
  }));

  // Sort by window (breaking first), then by event_time (most recent first)
  return events.sort((a, b) => {
    const windowOrder: Record<MacroEventWindow, number> = {
      breaking: 0,
      developing: 1,
      known: 2,
      scheduled: 3,
    };
    const windowDiff = windowOrder[a.window] - windowOrder[b.window];
    if (windowDiff !== 0) return windowDiff;

    const aTime = a.event_time ? new Date(a.event_time).getTime() : 0;
    const bTime = b.event_time ? new Date(b.event_time).getTime() : 0;
    return bTime - aTime; // Most recent first
  });
}

/**
 * Generate deterministic event ID from canonical title and time
 */
function generateEventId(canonicalTitle: string, eventTime: string | null): string {
  // Create stable ID from canonical title + date
  const dateStr = eventTime ? new Date(eventTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const titleHash = canonicalTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  
  return `${dateStr}-${titleHash}`;
}

/**
 * Generate event summary from representative and group
 */
function generateEventSummary(representative: RawNewsItem, group: RawNewsItem[], category: MacroEventCategory): string {
  const summaries = group
    .map((item) => item.summary || '')
    .filter((s) => s.trim().length > 20)
    .slice(0, 3);

  if (summaries.length === 0) {
    // Fallback to titles
    const titles = group.slice(0, 2).map((item) => item.title || '').filter(Boolean);
    return titles.join('. ').trim() + (titles.length > 0 ? '.' : 'No details available.');
  }

  // Combine summaries, remove hype
  let combined = summaries.join(' ');
  combined = combined
    .replace(/\b(breaking|exclusive|shocking|stunning|devastating|crushing|surge|plunge|rally|crash)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Create 2-4 sentences
  const sentences = combined.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  if (sentences.length <= 4) {
    return sentences.join('. ').trim() + (sentences.length > 0 && !sentences[sentences.length - 1]?.match(/[.!?]$/) ? '.' : '');
  }

  return sentences.slice(0, 3).join('. ').trim() + '.';
}

/**
 * Generate market impact for a category using observed metrics and deterministic channels/uncertainty
 * @param category Event category
 * @param summary Event summary (unused but kept for signature compatibility)
 * @param observedMetrics Pre-computed observed market metrics
 */
function generateMarketImpactForCategory(
  category: MacroEventCategory,
  summary: string,
  observedMetrics: Array<{ label: string; value: string; note?: string }>
): {
  observed: Array<{ label: string; value: string; note?: string }>;
  likely_channels: string[];
  uncertainty: string[];
} {
  // Get deterministic channels and uncertainty based on category
  const { likely_channels, uncertainty } = generateChannelsAndUncertainty(category);

  return { observed: observedMetrics, likely_channels, uncertainty };
}


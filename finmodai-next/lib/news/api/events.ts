import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnrichmentForHeadline, getModelImpactForEvent } from '@/lib/news/enrichment';
import { getEventExtraction } from '@/lib/news/eventExtraction';
import { inferEventImpact } from '@/lib/news/eventImpact';
import { assessHeadlineRelevance, type RelevanceEventType } from '@/lib/news/relevance';
import { resolveMacroEventImageById } from '@/lib/macroEventImages';
import {
  dedupeByUrl,
  dedupeHeadlines,
  demoPublishedAt,
  demoScenariosForTag,
  enrichEventScores,
  evaluateRelevantHeadlines,
  filterEventsByFreshness,
  filterHeadlinesByFreshness,
  hashId,
  type Confidence,
  type Direction,
  type EventItem,
  type EventsResponse,
  getSupabaseClient,
  type HeadlineItem,
  isDev,
  isRealNewsUrl,
  normalizeIso,
  type Params,
  type ProviderName,
  type RelevantHeadline,
  withEventImageFallback,
} from '@/lib/news/api/shared';
import { handleHeadlines } from '@/lib/news/api/headlines';

function biasToDirection(bias: string): Direction {
  if (bias === 'Risk-On' || bias === 'Dovish') return 'up';
  if (bias === 'Risk-Off' || bias === 'Hawkish') return 'down';
  return 'mixed';
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

function clampSentence(text: string, maxChars = 220): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const sliced = normalized.slice(0, maxChars);
  const cutAt = sliced.lastIndexOf(' ');
  return `${(cutAt > 120 ? sliced.slice(0, cutAt) : sliced).trim()}...`;
}

function toPlainNarrative(text: string, maxSentences: number): string {
  const sentences = splitSentences(text).map((sentence) => clampSentence(sentence));
  if (sentences.length === 0) return clampSentence(text);
  return sentences.slice(0, maxSentences).join(' ');
}

function sectorDirectionSummary(direction: Direction): string {
  if (direction === 'up') return 'up';
  if (direction === 'down') return 'down';
  if (direction === 'mixed') return 'mixed';
  return 'unclear';
}

function buildReadableImpact(rawImpact: string, sectors: Array<{ sector: string; direction: Direction }>): string {
  const normalizedRaw = rawImpact.replace(/^market impact:\s*/i, '').trim();
  const baseSentences = splitSentences(normalizedRaw).map((sentence) => clampSentence(sentence, 260));
  const sectorList = sectors.slice(0, 3).map((item) => item.sector);
  const sectorText = sectorList.length > 0 ? sectorList.join(', ') : 'macro-sensitive sectors';
  const coreSentences: string[] = [];
  if (baseSentences.length > 0) coreSentences.push(baseSentences[0]);
  if (baseSentences.length > 1) coreSentences.push(baseSentences[1]);
  if (baseSentences.length > 2) coreSentences.push(baseSentences[2]);
  if (coreSentences.length < 2) coreSentences.push(`Primary transmission should run through rates, USD, and credit spreads, with earliest sector expression likely in ${sectorText}.`);
  if (coreSentences.length < 3) coreSentences.push('Confirmation should come from 2Y/10Y yields, DXY, VIX, and IG/HY spreads within 1-3 sessions; if those diverge, treat the move as low-conviction.');
  const lead = coreSentences.slice(0, 3).join(' ');
  const winnersLosers = sectors.slice(0, 4).map((item) => `${item.sector} ${sectorDirectionSummary(item.direction)}`).join('; ');
  const winnersLosersText = winnersLosers.length > 0 ? winnersLosers : 'broad index proxies mixed';
  return [
    `Market impact: ${lead}`,
    `Likely winners/losers: ${winnersLosersText}.`,
    'Monitoring anchors: 2Y/10Y yields, DXY, VIX, IG/HY spreads.',
    'Invalidation trigger: if volatility and credit spreads fail to confirm within 1-3 sessions.',
  ].join(' ');
}

function ensureNarrative(base: string, minimum: number, extras: string[]): string {
  const sentences = splitSentences(base);
  for (const extra of extras) {
    if (sentences.length >= minimum) break;
    if (!sentences.includes(extra)) sentences.push(extra);
  }
  return sentences.join(' ');
}

function ensureImpactPrefix(text: string): string {
  if (/^market impact:/i.test(text)) return text;
  return `Market impact: ${text}`.trim();
}

function makeDetailedEvent(event: EventItem): EventItem {
  const sectorNames = event.impacted_sectors.map((sector) => sector.sector).slice(0, 3);
  const aiSummary = toPlainNarrative(
    ensureNarrative(event.ai_summary, 2, [
      `Catalyst concentration is highest in ${sectorNames.length > 0 ? sectorNames.join(', ') : 'macro-sensitive sectors'}.`,
      'Validate with 2Y/10Y, DXY, VIX, and IG/HY spreads.',
    ]),
    3
  );
  const whyItMatters = ensureImpactPrefix(buildReadableImpact(event.why_it_matters, event.impacted_sectors));
  return { ...event, ai_summary: aiSummary, why_it_matters: whyItMatters };
}

/** Exported for use as absolute last-resort fallback in the events API route. */
export function buildDemoEventsFallback(params: Params): EventItem[] {
  return buildDemoEvents(params, params.limit).map(enrichEventScores);
}

function buildDemoEvents(params: Params, limit = params.limit): EventItem[] {
  const selected = demoScenariosForTag(params.tag).slice(0, Math.min(limit, demoScenariosForTag(params.tag).length));
  return selected.map((scenario, index) => {
    const published = demoPublishedAt(params, index, selected.length);
    const inferred = inferEventImpact({ eventType: scenario.eventType, title: scenario.eventTitle, description: scenario.description });
    const impactedTickers =
      inferred.affectedTickers.length > 0
        ? inferred.affectedTickers.map((ticker) => ({ ticker: ticker.ticker, direction: ticker.direction as Direction, rationale: ticker.rationale }))
        : [{ ticker: 'SPY', direction: biasToDirection(inferred.bias), rationale: 'Broad market proxy for demo event impact.' }];
    const event = makeDetailedEvent({
      id: hashId(`demo-event:${scenario.key}:${published}`),
      title: scenario.eventTitle,
      what_happened: `${scenario.headline}. ${scenario.description}`,
      ai_summary: toPlainNarrative(ensureNarrative(scenario.description, 2, ['This is generated from demo market data to keep event coverage available.', 'Use rates, FX, volatility, and credit as confirmation signals.']), 3),
      why_it_matters: ensureImpactPrefix(buildReadableImpact(ensureNarrative(inferred.whyItMatters, 2, [scenario.description]), inferred.affectedSectors.map((sector) => ({ sector: sector.sector, direction: sector.direction as Direction })))),
      impacted_sectors:
        inferred.affectedSectors.length > 0
          ? inferred.affectedSectors.map((sector) => ({ sector: sector.sector, direction: sector.direction as Direction, rationale: sector.rationale }))
          : [{ sector: 'Technology', direction: 'mixed', rationale: 'Fallback sector mapping for demo event.' }],
      impacted_tickers: impactedTickers,
      watch_items: inferred.watchItems.length > 0 ? inferred.watchItems.slice(0, 6) : ['Track 2Y/10Y yields, DXY, VIX, and IG/HY spreads for confirmation.'],
      sources: [{ source: scenario.source, title: scenario.headline, url: scenario.url, published_at: published }],
      confidence: inferred.confidence,
      published_at: published,
      tags: Array.from(new Set([...scenario.topics, scenario.eventType, 'demo'])),
    } satisfies EventItem);
    return withEventImageFallback(event, scenario.eventType);
  });
}

const THEME_PATTERNS: Array<{ token: string; pattern: RegExp }> = [
  { token: 'fed', pattern: /\b(federal reserve|fomc|fed)\b/i },
  { token: 'cpi', pattern: /\b(cpi|pce|inflation|price pressures?)\b/i },
  { token: 'yields', pattern: /\b(treasury yields?|bond yields?|term premium|auction)\b/i },
  { token: 'oil', pattern: /\b(oil|wti|brent|opec|crude|eia)\b/i },
  { token: 'dxy', pattern: /\b(dxy|usd|dollar|yen|euro|fx|currency)\b/i },
  { token: 'jobs', pattern: /\b(payrolls?|jobs?|unemployment|labor market)\b/i },
  { token: 'credit', pattern: /\b(credit spreads?|high yield|default|ig spread|funding stress)\b/i },
  { token: 'geopolitics', pattern: /\b(war|sanctions?|ceasefire|trade war|tariffs?|geopolitical)\b/i },
  { token: 'earnings', pattern: /\b(earnings|guidance|revisions?|profit warning)\b/i },
];

function detectThemeToken(item: RelevantHeadline): string {
  const text = `${item.title}\n${item.description ?? ''}`;
  for (const candidate of THEME_PATTERNS) {
    if (candidate.pattern.test(text)) return candidate.token;
  }
  return 'macro';
}

function toThemeLabel(token: string): string {
  const labels: Record<string, string> = {
    fed: 'Fed Policy',
    cpi: 'Inflation Data',
    yields: 'Treasury Yields',
    oil: 'Energy Complex',
    dxy: 'Dollar and FX',
    jobs: 'Labor Market',
    credit: 'Credit Conditions',
    geopolitics: 'Geopolitical Risk',
    earnings: 'Earnings Cycle',
    macro: 'Macro Regime',
  };
  return labels[token] ?? 'Macro Regime';
}

function toEventBaseTitle(eventType: RelevanceEventType): string {
  const titles: Record<RelevanceEventType, string> = {
    policy: 'Policy Path Repricing',
    rates: 'Rates and Duration Repricing',
    inflation: 'Inflation Trend Reassessment',
    growth: 'Growth Momentum Reassessment',
    energy: 'Energy Shock Transmission',
    fx: 'FX Regime Shift',
    credit: 'Credit Risk Repricing',
    geopolitics: 'Geopolitical Risk Transmission',
    equities: 'Equity Risk Regime Shift',
    other: 'Macro Cross-Asset Repricing',
  };
  return titles[eventType];
}

function toFocusHeadline(title: string): string {
  const cleaned = title
    .replace(/\s*\|\s*[^|]+$/g, '')
    .replace(/\s*-\s*(Reuters|Bloomberg|CNBC|WSJ|FT|Financial Times)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/).filter(Boolean).slice(0, 10).join(' ');
}

function synthesizeEventTitle(eventType: RelevanceEventType, theme: string, focus?: string): string {
  const focusLabel = typeof focus === 'string' ? focus.trim() : '';
  if (focusLabel.length > 0) return `${toThemeLabel(theme)} — ${focusLabel}`;
  return `${toThemeLabel(theme)} — ${toEventBaseTitle(eventType)}`;
}

function normalizeEventKey(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function clusterRelevantHeadlines(relevant: RelevantHeadline[], limit: number): Array<{ eventType: RelevanceEventType; theme: string; items: RelevantHeadline[] }> {
  const buckets = new Map<string, { eventType: RelevanceEventType; theme: string; items: RelevantHeadline[] }>();
  for (const item of relevant) {
    if (item.relevance.eventType === 'other') continue;
    const theme = detectThemeToken(item);
    const key = `${item.relevance.eventType}:${theme}`;
    const existing = buckets.get(key);
    if (existing) existing.items.push(item);
    else buckets.set(key, { eventType: item.relevance.eventType, theme, items: [item] });
  }
  const clusters = Array.from(buckets.values())
    .map((cluster) => ({
      ...cluster,
      items: cluster.items.sort((a, b) => {
        const scoreDiff = b.relevance.score - a.relevance.score;
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }).slice(0, 5),
    }))
    .sort((a, b) => {
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      const avgA = a.items.reduce((sum, item) => sum + item.relevance.score, 0) / Math.max(a.items.length, 1);
      const avgB = b.items.reduce((sum, item) => sum + item.relevance.score, 0) / Math.max(b.items.length, 1);
      if (avgB !== avgA) return avgB - avgA;
      const latestA = Math.max(...a.items.map((item) => new Date(item.publishedAt).getTime()));
      const latestB = Math.max(...b.items.map((item) => new Date(item.publishedAt).getTime()));
      return latestB - latestA;
    });
  const multiSource = clusters.filter((cluster) => {
    const uniqueUrls = new Set(cluster.items.map((item) => item.url));
    const uniqueSources = new Set(cluster.items.map((item) => item.source.toLowerCase()));
    if (cluster.items.length >= 2 && uniqueUrls.size >= 2) return true;
    const leadScore = cluster.items[0]?.relevance.score ?? 0;
    return uniqueSources.size >= 1 && leadScore >= 48;
  });
  const selected = multiSource.length > 0 ? multiSource : clusters;
  return selected.slice(0, limit);
}

function toEventTypeLabel(eventType: RelevanceEventType): string {
  const labels: Record<RelevanceEventType, string> = {
    policy: 'policy',
    rates: 'rates',
    inflation: 'inflation',
    growth: 'growth',
    energy: 'energy',
    fx: 'FX',
    credit: 'credit',
    geopolitics: 'geopolitics',
    equities: 'equities',
    other: 'macro',
  };
  return labels[eventType];
}

function buildMarketContextSnapshot(relevant: RelevantHeadline[], params: Params) {
  if (relevant.length === 0) {
    return {
      summaryLine: `Current market context (${params.range}, topic=${params.tag}): limited high-confidence headlines, so treat event impact as low conviction until confirmed by rates, USD, credit, and breadth.`,
      themeLine: 'Current driver mix: macro (1).',
      headlineLines: [] as string[],
    };
  }
  const eventTypeCounts = new Map<RelevanceEventType, number>();
  const themeCounts = new Map<string, number>();
  for (const item of relevant) {
    const eventType = item.relevance.eventType;
    const theme = detectThemeToken(item);
    eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) ?? 0) + 1);
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }
  const topEventTypes = Array.from(eventTypeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([eventType, count]) => `${toEventTypeLabel(eventType)} (${count})`);
  const topThemes = Array.from(themeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([theme, count]) => `${toThemeLabel(theme)} (${count})`);
  const headlineLines = relevant.slice(0, 8).map((item) => `${item.source}: ${item.title}`);
  return {
    summaryLine: `Current market context (${params.range}, topic=${params.tag}): dominant drivers are ${topEventTypes.join(', ') || 'macro'}. Focus on what changed now and what confirms it in 1-5 sessions.`,
    themeLine: `Current driver mix: ${topThemes.join(', ') || 'Macro Regime (1)'}.`,
    headlineLines,
  };
}

function toEventFromCluster(cluster: { eventType: RelevanceEventType; theme: string; items: RelevantHeadline[] }): EventItem {
  const lead = cluster.items[0];
  const focusHeadline = toFocusHeadline(lead?.title ?? '');
  const title = synthesizeEventTitle(cluster.eventType, cluster.theme, focusHeadline);
  const related = cluster.items.slice(1, 3).map((item) => item.title);
  const whatHappened = related.length > 0 ? `${lead.title}. Related: ${related.join('; ')}.` : lead.title;
  const impactSeed = inferEventImpact({ eventType: cluster.eventType, title, description: whatHappened });
  const publishedAt = normalizeIso(cluster.items.map((item) => item.publishedAt).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]);
  return {
    id: hashId(`${cluster.eventType}:${cluster.theme}:${cluster.items.map((item) => item.url).join('|')}`),
    title,
    what_happened: whatHappened,
    ai_summary: toPlainNarrative(ensureNarrative(impactSeed.whyItMatters, 2, [`Catalyst cluster is concentrated in ${toThemeLabel(cluster.theme).toLowerCase()}.`, 'Transmission should be tracked through rates, FX, and credit channels.']), 3),
    why_it_matters: ensureImpactPrefix(buildReadableImpact(ensureNarrative(impactSeed.whyItMatters, 3, ['Watch 2Y/10Y, DXY, VIX, and IG/HY spreads to confirm whether the move is broadening.', 'If those anchors diverge from price action, the shock is likely being absorbed rather than repriced.']), impactSeed.affectedSectors.map((sector) => ({ sector: sector.sector, direction: sector.direction as Direction })))),
    impacted_sectors: impactSeed.affectedSectors.map((sector) => ({ sector: sector.sector, direction: sector.direction as Direction, rationale: sector.rationale })),
    impacted_tickers: impactSeed.affectedTickers.map((ticker) => ({ ticker: ticker.ticker, direction: ticker.direction as Direction, rationale: ticker.rationale })),
    watch_items: impactSeed.watchItems,
    sources: cluster.items.map((item) => ({ source: item.source, title: item.title, url: item.url, published_at: normalizeIso(item.publishedAt) })),
    confidence: impactSeed.confidence,
    published_at: publishedAt,
    tags: Array.from(new Set([...cluster.items.flatMap((item) => item.tags ?? []), cluster.eventType, cluster.theme])),
  };
}

function dedupeEvents(events: EventItem[]): EventItem[] {
  const byKey = new Map<string, EventItem>();
  for (const event of events) {
    const key = `${normalizeEventKey(event.title)}|${normalizeEventKey(event.what_happened).slice(0, 140)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      continue;
    }
    const existingTs = new Date(existing.published_at).getTime();
    const currentTs = new Date(event.published_at).getTime();
    const keepCurrent = currentTs > existingTs || event.sources.length > existing.sources.length || event.ai_summary.length > existing.ai_summary.length;
    byKey.set(key, keepCurrent ? { ...event, sources: dedupeByUrl([...existing.sources, ...event.sources]) } : { ...existing, sources: dedupeByUrl([...existing.sources, ...event.sources]) });
  }
  return Array.from(byKey.values()).sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
}

async function upsertEvents(supabase: SupabaseClient, events: EventItem[], params: Params, errors: string[], provider: ProviderName | null): Promise<number> {
  if (events.length === 0) return 0;
  const modernRows = events.map((event) => ({
    published_at: event.published_at,
    provider: provider || 'supabase',
    title: event.title,
    description: event.what_happened,
    event_type: event.tags?.[0] || 'macro',
    tags: event.tags || [],
    affected_tickers: event.impacted_tickers.map((t) => t.ticker),
    affected_sectors: event.impacted_sectors.map((s) => s.sector),
    importance: event.confidence === 'high' ? 5 : event.confidence === 'medium' ? 3 : 2,
  }));
  const modernResult = await supabase.from('macro_events').upsert(modernRows, { onConflict: 'provider,title,published_at' }).select('id');
  if (!modernResult.error) {
    const rows = Array.isArray(modernResult.data) ? modernResult.data.filter((row): row is { id: string } => Boolean(row && typeof (row as { id?: unknown }).id === 'string')) : [];
    for (const row of rows) {
      try {
        await resolveMacroEventImageById(supabase, row.id);
      } catch (imageError) {
        const message = imageError instanceof Error ? imageError.message : 'resolve_failed';
        errors.push(`macro_event_image_resolve:${message}`);
        if (isDev()) console.error('[api/news] macro event image resolve failed', { id: row.id, message });
      }
    }
    return modernRows.length;
  }
  const insertResult = await supabase.from('macro_events').insert(modernRows).select('id');
  if (!insertResult.error) {
    const rows = Array.isArray(insertResult.data) ? insertResult.data.filter((row): row is { id: string } => Boolean(row && typeof (row as { id?: unknown }).id === 'string')) : [];
    for (const row of rows) {
      try {
        await resolveMacroEventImageById(supabase, row.id);
      } catch (imageError) {
        const message = imageError instanceof Error ? imageError.message : 'resolve_failed';
        errors.push(`macro_event_image_resolve:${message}`);
      }
    }
    return modernRows.length;
  }
  errors.push(`supabase_upsert_events:${insertResult.error.message}`);
  if (isDev()) console.error('[api/news] supabase upsert events failed', { modern: modernResult.error.message, insert: insertResult.error.message, range: params.range });
  return 0;
}

async function readEventsFromSupabase(supabase: SupabaseClient, params: Params, errors: string[]): Promise<EventItem[]> {
  const attempts: Array<{ dateColumn: string; filterValue: string }> = [
    { dateColumn: 'published_at', filterValue: params.fromIso },
    { dateColumn: 'created_at', filterValue: params.fromIso },
  ];
  for (const attempt of attempts) {
    const query = await supabase.from('macro_events').select('*').gte(attempt.dateColumn, attempt.filterValue).order(attempt.dateColumn, { ascending: false }).limit(params.limit);
    if (query.error) continue;
    const rows = Array.isArray(query.data) ? query.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
    const mapped = rows.map((row, index) => {
      const sourceUrls = Array.isArray(row.source_urls) ? row.source_urls.filter((u): u is string => typeof u === 'string') : [];
      const impactedAssets = Array.isArray(row.impacted_assets) ? row.impacted_assets.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
      const impactedSectors = Array.isArray(row.impacted_sectors) ? row.impacted_sectors.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
      const affectedTickers = Array.isArray(row.affected_tickers) ? row.affected_tickers.filter((x): x is string => typeof x === 'string') : [];
      const affectedSectors = Array.isArray(row.affected_sectors) ? row.affected_sectors.filter((x): x is string => typeof x === 'string') : [];
      const published = normalizeIso(row.published_at ?? row.created_at);
      const title = typeof row.title === 'string' ? row.title : `Macro Event ${index + 1}`;
      const oneLine = (typeof row.description === 'string' ? row.description : null) ?? (typeof row.one_line === 'string' ? row.one_line : null) ?? title;
      const confidence: Confidence = row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low' ? row.confidence : 'medium';
      const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [];
      const relevance = assessHeadlineRelevance({ title, description: oneLine, source: 'supabase', minScore: 0 });
      const inferredImpact = inferEventImpact({ eventType: relevance.eventType, title, description: oneLine });
      const normalizedEvent: EventItem = {
        id: typeof row.id === 'string' ? row.id : hashId(`${title}-${published}`),
        title,
        what_happened: oneLine,
        ai_summary: oneLine || inferredImpact.whyItMatters,
        why_it_matters: typeof row.why_it_matters === 'string' ? row.why_it_matters : inferredImpact.whyItMatters,
        impacted_sectors:
          affectedSectors.length > 0
            ? affectedSectors.map((sector) => ({ sector, direction: 'unknown' as Direction }))
            : impactedSectors.map((sector) => ({
                sector: typeof sector.sector === 'string' ? sector.sector : 'Unknown',
                direction: sector.direction === 'up' || sector.direction === 'down' || sector.direction === 'mixed' || sector.direction === 'unknown' ? sector.direction : 'unknown',
                rationale: typeof sector.rationale === 'string' ? sector.rationale : undefined,
              })),
        impacted_tickers:
          affectedTickers.length > 0
            ? affectedTickers.map((ticker) => ({ ticker, direction: 'unknown' as Direction }))
            : impactedAssets.map((asset) => ({
                ticker: typeof asset.label === 'string' ? asset.label : 'UNKNOWN',
                direction: asset.dir === 'up' || asset.dir === 'down' || asset.dir === 'mixed' || asset.dir === 'unknown' ? asset.dir : 'unknown',
                rationale: typeof asset.rationale === 'string' ? asset.rationale : undefined,
              })),
        watch_items: ['Track rates and volatility confirmation.', 'Monitor breadth and sector rotation persistence.', 'Watch incoming macro releases for validation.'],
        sources: sourceUrls.length > 0 ? sourceUrls.map((url) => ({ source: 'cached', title, url, published_at: published })) : [],
        confidence,
        published_at: published,
        image_url: typeof row.image_url === 'string' ? row.image_url : undefined,
        image_thumb_url: typeof row.image_thumb_url === 'string' ? row.image_thumb_url : undefined,
        image_provider: typeof row.image_provider === 'string' ? row.image_provider : undefined,
        image_source_url: typeof row.image_source_url === 'string' ? row.image_source_url : undefined,
        image_author: typeof row.image_author === 'string' ? row.image_author : undefined,
        image_author_url: typeof row.image_author_url === 'string' ? row.image_author_url : undefined,
        image_query: typeof row.image_query === 'string' ? row.image_query : undefined,
        image_cached_at: typeof row.image_cached_at === 'string' ? row.image_cached_at : undefined,
        tags,
      };
      return withEventImageFallback(
        makeDetailedEvent({
          ...normalizedEvent,
          ai_summary: normalizedEvent.ai_summary || inferredImpact.whyItMatters,
          why_it_matters: normalizedEvent.why_it_matters || inferredImpact.whyItMatters,
          impacted_sectors: normalizedEvent.impacted_sectors.length > 0 ? normalizedEvent.impacted_sectors : inferredImpact.affectedSectors.map((sector) => ({ sector: sector.sector, direction: sector.direction as Direction, rationale: sector.rationale })),
          impacted_tickers:
            normalizedEvent.impacted_tickers.length > 0
              ? normalizedEvent.impacted_tickers
              : inferredImpact.affectedTickers.length > 0
              ? inferredImpact.affectedTickers.map((ticker) => ({ ticker: ticker.ticker, direction: ticker.direction as Direction, rationale: ticker.rationale }))
              : [{ ticker: 'SPY', direction: inferredImpact.bias === 'Risk-On' || inferredImpact.bias === 'Dovish' ? 'up' : inferredImpact.bias === 'Risk-Off' || inferredImpact.bias === 'Hawkish' ? 'down' : 'mixed', rationale: 'Broad market proxy for first-order event impact.' }],
        } satisfies EventItem),
        typeof row.event_type === 'string' ? row.event_type : typeof row.title === 'string' ? row.title : null
      );
    });
    return mapped.map((event) => ({ ...event, sources: event.sources.filter((source) => isRealNewsUrl(source.url)) })).slice(0, params.limit);
  }
  const demo = await supabase.from('demo_macro_events').select('*').order('event_date', { ascending: false }).limit(params.limit);
  if (demo.error) {
    errors.push(`supabase_read_demo_events:${demo.error.message}`);
    errors.push('supabase_read_events:table_or_columns_unavailable');
    return [];
  }
  const demoRows = Array.isArray(demo.data) ? demo.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
  return demoRows.map((row, index) => {
    const published = normalizeIso(row.event_date ?? row.created_at);
    const title = typeof row.title === 'string' ? row.title : `Macro Event ${index + 1}`;
    const oneLine = typeof row.one_line === 'string' ? row.one_line : title;
    const confidence: Confidence = row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low' ? row.confidence : 'medium';
    const relevance = assessHeadlineRelevance({ title, description: oneLine, source: 'supabase', minScore: 0 });
    const inferredImpact = inferEventImpact({ eventType: relevance.eventType, title, description: oneLine });
    const impactedSectors = Array.isArray(row.impacted_sectors) ? row.impacted_sectors.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
    const impactedAssets = Array.isArray(row.impacted_assets) ? row.impacted_assets.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
    const sources = Array.isArray(row.sources)
      ? row.sources.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')).map((src) => ({
          source: typeof src.source === 'string' ? src.source : 'cached',
          title: typeof src.title === 'string' ? src.title : title,
          url: typeof src.url === 'string' ? src.url : '',
          published_at: published,
        })).filter((src) => isRealNewsUrl(src.url))
      : [];
    return withEventImageFallback(
      makeDetailedEvent({
        id: typeof row.id === 'string' ? row.id : hashId(`${title}-${published}`),
        title,
        what_happened: oneLine,
        ai_summary: oneLine || inferredImpact.whyItMatters,
        why_it_matters: typeof row.why_it_matters === 'string' ? row.why_it_matters : inferredImpact.whyItMatters,
        impacted_sectors:
          impactedSectors.length > 0
            ? impactedSectors.map((sector) => ({
                sector: typeof sector.sector === 'string' ? sector.sector : 'Unknown',
                direction: sector.direction === 'up' || sector.direction === 'down' || sector.direction === 'mixed' || sector.direction === 'unknown' ? sector.direction : 'unknown',
                rationale: typeof sector.rationale === 'string' ? sector.rationale : undefined,
              }))
            : inferredImpact.affectedSectors.map((sector) => ({ sector: sector.sector, direction: sector.direction as Direction, rationale: sector.rationale })),
        impacted_tickers:
          impactedAssets.length > 0
            ? impactedAssets.map((asset) => ({
                ticker: typeof asset.label === 'string' ? asset.label : 'SPY',
                direction: asset.dir === 'up' || asset.dir === 'down' || asset.dir === 'mixed' || asset.dir === 'unknown' ? asset.dir : 'unknown',
                rationale: typeof asset.rationale === 'string' ? asset.rationale : undefined,
              }))
            : inferredImpact.affectedTickers.map((ticker) => ({ ticker: ticker.ticker, direction: ticker.direction as Direction, rationale: ticker.rationale })),
        watch_items: inferredImpact.watchItems,
        sources,
        confidence,
        published_at: published,
        image_url: typeof row.image_url === 'string' ? row.image_url : undefined,
        image_thumb_url: typeof row.image_thumb_url === 'string' ? row.image_thumb_url : undefined,
        image_provider: typeof row.image_provider === 'string' ? row.image_provider : undefined,
        image_source_url: typeof row.image_source_url === 'string' ? row.image_source_url : undefined,
        image_author: typeof row.image_author === 'string' ? row.image_author : undefined,
        image_author_url: typeof row.image_author_url === 'string' ? row.image_author_url : undefined,
        image_query: typeof row.image_query === 'string' ? row.image_query : undefined,
        image_cached_at: typeof row.image_cached_at === 'string' ? row.image_cached_at : undefined,
        tags: Array.from(new Set([relevance.eventType])),
      } satisfies EventItem),
      typeof row.event_type === 'string' ? row.event_type : typeof row.title === 'string' ? row.title : null
    );
  }).slice(0, params.limit);
}

export async function handleEvents(params: Params, supabase: SupabaseClient | null): Promise<EventsResponse> {
  const errors: string[] = [];
  const headlinesPayload = await handleHeadlines({ ...params, type: 'headlines' }, null);
  const liveItems = headlinesPayload.items as HeadlineItem[];
  const freshLiveEventHeadlines = filterHeadlinesByFreshness(dedupeHeadlines(liveItems), params.fromIso);
  const strictLive = evaluateRelevantHeadlines(freshLiveEventHeadlines, 35);
  const softLive = evaluateRelevantHeadlines(freshLiveEventHeadlines, 26);
  const looseLive = evaluateRelevantHeadlines(freshLiveEventHeadlines, 10);
  const selectedForEvents = strictLive.accepted.length >= 8 ? strictLive.accepted : softLive.accepted.length >= 6 ? softLive.accepted : looseLive.accepted;
  const contextSnapshot = buildMarketContextSnapshot(selectedForEvents, params);
  const eventClusters = clusterRelevantHeadlines(selectedForEvents, Math.max(params.limit * 2, 24));
  const baseEvents = dedupeEvents(eventClusters.map(toEventFromCluster)).slice(0, params.limit);
  const secondaryEvents = dedupeEvents(eventClusters.flatMap((cluster) => cluster.items.slice(1, 3).map((item) => toEventFromCluster({ eventType: cluster.eventType, theme: cluster.theme, items: [item] }))));
  const seededEvents = dedupeEvents([...baseEvents, ...secondaryEvents]).slice(0, params.limit);

  if (isDev()) console.debug('[api/news][events][live]', { rawCount: liveItems.length, normalizedCount: dedupeHeadlines(liveItems).length, relevantCount: strictLive.accepted.length, droppedNoiseCount: strictLive.droppedNoiseCount, eventClusterCount: eventClusters.length, minScoreUsed: strictLive.accepted.length >= 8 ? 35 : softLive.accepted.length >= 6 ? 26 : 10, seededCount: seededEvents.length });

  const derivedLiveEvents = await Promise.all(
    seededEvents.map(async (event) => {
      const primarySource = event.sources[0];
      if (!primarySource) return event;
      try {
        const [enrichment, modelImpact, extraction] = await Promise.all([
          getEnrichmentForHeadline({
            title: event.title,
            description: `${event.what_happened}\nSources: ${event.sources.slice(0, 4).map((source) => `${source.source}: ${source.title}`).join(' | ')}`,
            mode: 'general',
            contextLines: [contextSnapshot.summaryLine, contextSnapshot.themeLine, ...contextSnapshot.headlineLines, `Current event to analyze: ${event.title}`],
            url: `event://${hashId(`${event.id}|${event.title}|${event.sources.map((source) => source.url).join('|')}`)}`,
          }),
          getModelImpactForEvent({ title: event.title, description: event.what_happened }),
          getEventExtraction({ title: event.title, description: event.what_happened }),
        ]);
        return {
          ...event,
          ai_summary: enrichment.ai_summary ?? event.ai_summary,
          why_it_matters: enrichment.why_it_matters ?? event.why_it_matters,
          impacted_sectors: enrichment.impacted_sectors.length > 0 ? enrichment.impacted_sectors : event.impacted_sectors,
          impacted_tickers: enrichment.impacted_tickers.length > 0 ? enrichment.impacted_tickers : event.impacted_tickers,
          confidence: enrichment.confidence ?? event.confidence,
          model_impact: modelImpact ?? undefined,
          event_extraction: extraction ?? undefined,
        } satisfies EventItem;
      } catch (error) {
        if (isDev()) console.error('[api/news] event enrichment failed', { title: event.title, url: primarySource.url, message: error instanceof Error ? error.message : String(error) });
        return event;
      }
    })
  );

  let ingested = 0;
  if (supabase && derivedLiveEvents.length > 0) ingested = await upsertEvents(supabase, derivedLiveEvents, params, errors, headlinesPayload.provider);

  let supabaseEvents: EventItem[] = [];
  const minimumEvents = Math.min(params.limit, params.range === '1D' ? 4 : params.range === '3D' ? 7 : 9);
  if (supabase && (ingested > 0 || derivedLiveEvents.length < minimumEvents)) supabaseEvents = filterEventsByFreshness(await readEventsFromSupabase(supabase, params, errors), params.fromIso);

  const liveDetailed = derivedLiveEvents.map(makeDetailedEvent);
  const cachedDetailed = supabaseEvents.map(makeDetailedEvent);
  const blended = filterEventsByFreshness(dedupeEvents([...liveDetailed, ...cachedDetailed]), params.fromIso).slice(0, params.limit);
  const demoEvents = buildDemoEvents(params, params.limit);
  const supplemented = blended.length >= minimumEvents ? blended : filterEventsByFreshness(dedupeEvents([...blended, ...demoEvents]), params.fromIso).slice(0, params.limit);

  if (supplemented.length > 0) {
    const fromSupabase = supplemented.filter((event) => cachedDetailed.some((cached) => cached.id === event.id)).length;
    const usedDemoFallback = supplemented.some((event) => (event.tags ?? []).includes('demo'));
    const responseErrors = usedDemoFallback ? [...errors, 'fallback:demo_events'] : errors;
    const scored = supplemented.map(enrichEventScores);
    return {
      ok: true,
      provider: headlinesPayload.provider ?? (fromSupabase > 0 ? 'supabase' : usedDemoFallback ? 'demo' : 'newsapi'),
      items: scored,
      events: scored,
      meta: { ingested, fromSupabase, errors: responseErrors },
    };
  }
  return { ok: true, provider: headlinesPayload.provider ?? (supabase ? 'supabase' : 'none'), items: [], events: [], meta: { ingested: 0, fromSupabase: 0, errors } };
}

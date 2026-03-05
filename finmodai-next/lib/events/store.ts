import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MarketEvent, MarketEventsView, MarketEventSource } from '@/lib/news/marketEventsTypes';
import { marketEventSchema } from '@/lib/news/marketEventsTypes';

export type ExistingEventMeta = {
  id: string;
  fingerprint: string;
  lastUpdatedAt: string;
  keyEntities: string[];
  summaryBullets: string[];
  sourceUrls: Set<string>;
  status: 'developing' | 'confirmed' | 'resolved';
};

export type EventUpsertPayload = {
  fingerprint: string;
  event: MarketEvent;
  keyEntities: string[];
  sources: MarketEventSource[];
};

function parseIso(value: unknown): string {
  if (typeof value !== 'string') return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function finalScore(event: MarketEvent): number {
  return event.severity;
}

function deriveLegacyMarketImpact(value: unknown): Record<string, string> {
  const targets = asStringArray(value).map((item) => item.toLowerCase());
  const impact: Record<string, string> = {};
  if (targets.includes('equities')) impact.equities = 'Market-moving equity impact flagged in legacy event.';
  if (targets.includes('rates')) impact.rates = 'Rates sensitivity flagged in legacy event.';
  if (targets.includes('fx')) impact.fx = 'FX sensitivity flagged in legacy event.';
  if (targets.includes('oil')) impact.oil = 'Oil sensitivity flagged in legacy event.';
  if (targets.includes('credit')) impact.credit = 'Credit sensitivity flagged in legacy event.';
  const sectorLike = targets.filter((item) => !['equities', 'rates', 'fx', 'oil', 'credit'].includes(item));
  if (sectorLike.length) impact.sectors = `Sector exposure: ${sectorLike.join(', ')}`;
  if (!Object.keys(impact).length) impact.equities = 'Legacy event stored without structured market impact.';
  return impact;
}

export function getSupabaseServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function isEventsCacheFresh(supabase: SupabaseClient, maxAgeMs: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('market_events')
    .select('last_updated_at')
    .order('last_updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || typeof data.last_updated_at !== 'string') return false;
  const ts = new Date(data.last_updated_at).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
}

export async function readExistingEventMeta(
  supabase: SupabaseClient,
  fingerprints: string[]
): Promise<Map<string, ExistingEventMeta>> {
  const out = new Map<string, ExistingEventMeta>();
  if (!fingerprints.length) return out;

  const { data, error } = await supabase
    .from('market_events')
    .select(
      'id,fingerprint,last_updated_at,key_entities,summary_bullets,status,market_event_sources(url)'
      // legacy summary_bullets kept for keyword diffing; new fields are handled at read time.
    )
    .in('fingerprint', fingerprints);
  if (error || !Array.isArray(data)) return out;

  for (const row of data as Array<Record<string, unknown>>) {
    const fingerprint = typeof row.fingerprint === 'string' ? row.fingerprint : '';
    if (!fingerprint) continue;
    const sourcesRaw = Array.isArray(row.market_event_sources) ? row.market_event_sources : [];
    const sourceUrls = new Set<string>();
    for (const source of sourcesRaw) {
      if (!source || typeof source !== 'object') continue;
      const url = (source as Record<string, unknown>).url;
      if (typeof url === 'string' && url.trim()) sourceUrls.add(url.trim());
    }
    out.set(fingerprint, {
      id: typeof row.id === 'string' ? row.id : '',
      fingerprint,
      lastUpdatedAt: parseIso(row.last_updated_at),
      keyEntities: asStringArray(row.key_entities),
      summaryBullets: asStringArray(row.summary_bullets),
      sourceUrls,
      status:
        row.status === 'confirmed' || row.status === 'resolved' || row.status === 'developing'
          ? row.status
          : 'developing',
    });
  }
  return out;
}

export async function upsertEvents(
  supabase: SupabaseClient,
  payloads: EventUpsertPayload[]
): Promise<{ stored: number; sampleFingerprints: string[] }> {
  if (!payloads.length) return { stored: 0, sampleFingerprints: [] };

  const rows = payloads.map((item) => ({
    fingerprint: item.fingerprint,
    title: item.event.title,
    event_type: item.event.eventType,
    status: item.event.status,
    impact_targets: Object.entries(item.event.marketImpact)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key]) => key),
    bias: 'Mixed',
    horizon: item.event.horizon,
    severity: item.event.severity,
    confidence: Math.max(60, Math.min(95, item.event.severity)),
    summary_bullets: item.event.drivers,
    drivers: item.event.drivers,
    market_impact: item.event.marketImpact,
    transmission_path: item.event.transmissionPath,
    watch_next: item.event.watchNext,
    key_entities: item.keyEntities,
    first_seen_at: item.event.firstSeenAt,
    last_updated_at: item.event.lastUpdatedAt,
  }));

  const upserted = await supabase
    .from('market_events')
    .upsert(rows, { onConflict: 'fingerprint' })
    .select('id,fingerprint');
  if (upserted.error || !Array.isArray(upserted.data)) {
    return { stored: 0, sampleFingerprints: [] };
  }

  const idByFingerprint = new Map<string, string>();
  for (const row of upserted.data as Array<Record<string, unknown>>) {
    const id = typeof row.id === 'string' ? row.id : '';
    const fp = typeof row.fingerprint === 'string' ? row.fingerprint : '';
    if (id && fp) idByFingerprint.set(fp, id);
  }

  const sourceRows: Array<{
    event_id: string;
    source_name: string;
    url: string;
    published_at: string;
    title: string | null;
    snippet: string | null;
    image_url: string | null;
  }> = [];
  for (const payload of payloads) {
    const eventId = idByFingerprint.get(payload.fingerprint);
    if (!eventId) continue;
    for (const source of payload.sources.slice(0, 12)) {
      sourceRows.push({
        event_id: eventId,
        source_name: source.name,
        url: source.url,
        published_at: parseIso(source.publishedAt),
        title: source.title || null,
        snippet: source.snippet || null,
        image_url: source.imageUrl || null,
      });
    }
  }

  if (sourceRows.length > 0) {
    await supabase.from('market_event_sources').upsert(sourceRows, { onConflict: 'event_id,url' });
  }

  return {
    stored: rows.length,
    sampleFingerprints: rows.slice(0, 8).map((row) => String(row.fingerprint).slice(0, 12)),
  };
}

export async function markStaleEventsResolved(supabase: SupabaseClient, staleDays: number): Promise<void> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('market_events')
    .update({ status: 'resolved' })
    .neq('status', 'resolved')
    .lt('last_updated_at', cutoff);
}

export async function readActiveOrResolvedEvents(
  supabase: SupabaseClient,
  params: {
    view: MarketEventsView;
    limit: number;
    minSeverity: number;
    maxLookbackDays: number;
  }
): Promise<MarketEvent[]> {
  const { data, error } = await supabase
    .from('market_events')
    .select(
      'id,fingerprint,title,event_type,status,horizon,severity,drivers,market_impact,transmission_path,summary_bullets,watch_next,key_entities,first_seen_at,last_updated_at,market_event_sources(source_name,url,published_at,title,snippet,image_url)'
    )
    .order('severity', { ascending: false })
    .order('last_updated_at', { ascending: false })
    .limit(300);
  if (error || !Array.isArray(data)) return [];

  const cutoffMs = Date.now() - params.maxLookbackDays * 24 * 60 * 60 * 1000;
  const mapped: MarketEvent[] = [];

  for (const row of data as Array<Record<string, unknown>>) {
    const rawSources = Array.isArray(row.market_event_sources) ? row.market_event_sources : [];
    const sources = rawSources
      .map((source): MarketEventSource | null => {
        if (!source || typeof source !== 'object') return null;
        const src = source as Record<string, unknown>;
        if (typeof src.url !== 'string' || !src.url.trim()) return null;
        return {
          name: typeof src.source_name === 'string' && src.source_name.trim() ? src.source_name : 'Source',
          url: src.url,
          publishedAt: parseIso(src.published_at),
          title: typeof src.title === 'string' && src.title.trim() ? src.title : undefined,
          snippet: typeof src.snippet === 'string' && src.snippet.trim() ? src.snippet : undefined,
          imageUrl: typeof src.image_url === 'string' && src.image_url.trim() ? src.image_url : undefined,
        };
      })
      .filter((item): item is MarketEventSource => item !== null)
      .slice(0, 8);
    if (!sources.length) continue;

    try {
      const event = marketEventSchema.parse({
        id: typeof row.id === 'string' ? row.id : '',
        title: typeof row.title === 'string' ? row.title : 'Event',
        eventType: row.event_type,
        drivers: asStringArray(row.drivers ?? row.summary_bullets),
        marketImpact:
          row.market_impact && typeof row.market_impact === 'object'
            ? (row.market_impact as Record<string, unknown>)
            : deriveLegacyMarketImpact((row as Record<string, unknown>).impact_targets),
        transmissionPath: (() => {
          const path = asStringArray(row.transmission_path);
          return path.length ? path : ['Legacy cached event -> structured transmission path not yet populated'];
        })(),
        watchNext: asStringArray(row.watch_next),
        horizon: row.horizon,
        severity: typeof row.severity === 'number' ? row.severity : 0,
        status: row.status,
        firstSeenAt: parseIso(row.first_seen_at),
        lastUpdatedAt: parseIso(row.last_updated_at),
        sources,
      });

      const isResolved = event.status === 'resolved';
      const isActive = !isResolved && new Date(event.lastUpdatedAt).getTime() >= cutoffMs && event.severity >= params.minSeverity;
      if (params.view === 'resolved') {
        if (isResolved) mapped.push(event);
      } else if (isActive) {
        mapped.push(event);
      }
    } catch {
      // skip malformed rows
    }
  }

  mapped.sort((a, b) => {
    if (params.view === 'active') {
      const scoreDiff = finalScore(b) - finalScore(a);
      if (scoreDiff !== 0) return scoreDiff;
    }
    return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
  });

  return mapped.slice(0, params.limit);
}

import { getSupabaseServerClient } from '@/lib/supabaseClient';
import type { MacroEvent } from '@/lib/macroEvents';

type MacroEventRow = {
  event_key: string;
  event_title: string;
  what_happened: string;
  why_it_matters: Array<{ tag: string; text: string }>;
  region: string;
  country_codes: string[];
  impact_tags: string[];
  confidence: number;
  entities: string[];
  published_at: string;
  updated_at: string;
};

type MacroEventSourceRow = {
  event_key: string;
  url: string;
  source: string;
  title: string;
  published_at: string;
};

export async function upsertMacroEvents(events: MacroEvent[]): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase || events.length === 0) return;

  const eventRows: MacroEventRow[] = events.map((e) => ({
    event_key: e.id,
    event_title: e.eventTitle,
    what_happened: e.whatHappened,
    why_it_matters: e.whyItMatters,
    region: e.region,
    country_codes: e.countryCodes,
    impact_tags: e.impactTags,
    confidence: e.confidence,
    entities: e.entities,
    published_at: e.publishedAt,
    updated_at: e.updatedAt,
  }));

  const sourceRows: MacroEventSourceRow[] = events.flatMap((e) =>
    e.sources.map((s) => ({
      event_key: e.id,
      url: s.url,
      source: s.source,
      title: s.title,
      published_at: s.publishedAt,
    }))
  );

  const { error: eventError } = await (supabase.from('macro_events') as any).upsert(eventRows, { onConflict: 'event_key' });

  if (eventError) {
    console.error('[macroEventsStore] event upsert failed', eventError);
  }

  const { error: sourceError } = await (supabase.from('macro_event_sources') as any).upsert(sourceRows, { onConflict: 'url' });

  if (sourceError) {
    console.error('[macroEventsStore] source upsert failed', sourceError);
  }
}

export async function fetchRecentMacroEvents(days: number, minConfidence = 0.7): Promise<MacroEvent[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: eventRows, error } = await (supabase.from('macro_events') as any)
    .select('event_key,event_title,what_happened,why_it_matters,region,country_codes,impact_tags,confidence,entities,published_at,updated_at')
    .gte('published_at', since)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(5);

  if (error || !eventRows || eventRows.length === 0) return [];

  const rows = eventRows as MacroEventRow[];
  const keys = rows.map((r) => r.event_key);
  const { data: sourceRows } = await (supabase.from('macro_event_sources') as any)
    .select('event_key,url,source,title,published_at')
    .in('event_key', keys);

  const sourcesByKey = new Map<string, any[]>();
  (sourceRows || []).forEach((row: any) => {
    const list = sourcesByKey.get(row.event_key) || [];
    list.push(row);
    sourcesByKey.set(row.event_key, list);
  });

  return eventRows.map((row: any) => ({
    id: row.event_key,
    eventTitle: row.event_title,
    whatHappened: row.what_happened,
    whyItMatters: row.why_it_matters || [],
    region: row.region,
    countryCodes: row.country_codes || [],
    impactTags: row.impact_tags || [],
    confidence: row.confidence,
    importanceScore: row.confidence ?? 0.6,
    entities: row.entities || [],
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    sources: (sourcesByKey.get(row.event_key) || []).map((s) => ({
      url: s.url,
      source: s.source,
      title: s.title,
      publishedAt: s.published_at,
    })),
  }));
}

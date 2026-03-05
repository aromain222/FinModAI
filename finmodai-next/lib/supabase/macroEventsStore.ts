import { resolveMacroEventImageById } from '@/lib/macroEventImages';
import { getSupabaseServiceClient } from '@/lib/events/store';
import { getMacroEventFallbackImage } from '@/lib/macroEventImageQueries';
import type { MacroEvent } from '@/lib/macroEvents';

type MacroEventRow = {
  id?: string;
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
  image_url?: string | null;
  image_thumb_url?: string | null;
  image_provider?: string | null;
  image_source_url?: string | null;
  image_author?: string | null;
  image_author_url?: string | null;
};

type MacroEventSourceRow = {
  event_key: string;
  url: string;
  source: string;
  title: string;
  published_at: string;
  image_url?: string | null;
};

export async function upsertMacroEvents(events: MacroEvent[]): Promise<void> {
  const supabase = getSupabaseServiceClient();
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
      image_url: s.imageUrl ?? null,
    }))
  );

  const { data: persistedRows, error: eventError } = await (supabase.from('macro_events') as any)
    .upsert(eventRows, { onConflict: 'event_key' })
    .select('id');

  if (eventError) {
    console.error('[macroEventsStore] event upsert failed', eventError);
  } else if (Array.isArray(persistedRows)) {
    for (const row of persistedRows as Array<{ id?: string }>) {
      if (!row?.id) continue;
      try {
        await resolveMacroEventImageById(supabase, row.id);
      } catch (imageError) {
        console.error('[macroEventsStore] image resolve failed', row.id, imageError);
      }
    }
  }

  const { error: sourceError } = await (supabase.from('macro_event_sources') as any).upsert(sourceRows, { onConflict: 'url' });

  if (sourceError) {
    console.error('[macroEventsStore] source upsert failed', sourceError);
  }
}

export async function fetchRecentMacroEvents(days: number, minConfidence = 0.7): Promise<MacroEvent[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: eventRows, error } = await (supabase.from('macro_events') as any)
    .select('event_key,event_title,what_happened,why_it_matters,region,country_codes,impact_tags,confidence,entities,published_at,updated_at,image_url,image_thumb_url,image_provider,image_source_url,image_author,image_author_url')
    .gte('published_at', since)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(5);

  if (error || !eventRows || eventRows.length === 0) return [];

  const rows = eventRows as MacroEventRow[];
  const keys = rows.map((r) => r.event_key);
  const { data: sourceRows } = await (supabase.from('macro_event_sources') as any)
    .select('event_key,url,source,title,published_at,image_url')
    .in('event_key', keys);

  const sourcesByKey = new Map<string, any[]>();
  (sourceRows || []).forEach((row: any) => {
    const list = sourcesByKey.get(row.event_key) || [];
    list.push(row);
    sourcesByKey.set(row.event_key, list);
  });

  return eventRows.map((row: any) => {
    const fallbackCategory = row.impact_tags?.[0] ?? row.region ?? row.event_title;
    const fallbackHero = getMacroEventFallbackImage(fallbackCategory, 'hero');
    const fallbackThumb = getMacroEventFallbackImage(fallbackCategory, 'thumb');
    return {
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
        imageUrl: s.image_url ?? undefined,
      })),
      imageUrl: row.image_url ?? fallbackHero,
      imageThumbUrl: row.image_thumb_url ?? row.image_url ?? fallbackThumb,
      imageProvider: row.image_provider ?? undefined,
      imageSourceUrl: row.image_source_url ?? undefined,
      imageAuthor: row.image_author ?? undefined,
      imageAuthorUrl: row.image_author_url ?? undefined,
    };
  });
}

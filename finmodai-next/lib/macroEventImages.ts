import type { SupabaseClient } from '@supabase/supabase-js';
import { buildHeadlineImageQuery, hashHeadline } from '@/lib/headlineQuery';
import { normalizeCategory, CATEGORY_TO_PEXELS_QUERIES, type MacroEventImageCategory } from '@/lib/macroEventImageQueries';
import { searchPexelsPhotos } from '@/lib/pexels';

type MacroEventImageCacheRow = {
  category: string;
  query: string;
  image_url: string;
  thumb_url: string;
  provider: string;
  source_url: string;
  author: string | null;
  author_url: string | null;
  cached_at: string;
  expires_at: string;
};

type MacroEventImageRow = {
  id: string;
  title: string | null;
  event_title?: string | null;
  category?: string | null;
  event_type: string | null;
  impact_score?: number | null;
  importance?: number | null;
  is_featured?: boolean | null;
  event_rank?: number | null;
  image_url: string | null;
  image_thumb_url: string | null;
  image_provider: string | null;
  image_source_url: string | null;
  image_author: string | null;
  image_author_url: string | null;
  image_query: string | null;
  image_cached_at: string | null;
};

type MacroEventHeadlineImageCacheRow = {
  headline_hash: string;
  headline: string;
  category: string | null;
  query: string;
  image_url: string;
  thumb_url: string;
  provider: string;
  source_url: string;
  author: string | null;
  author_url: string | null;
  cached_at: string;
  expires_at: string;
};

export type MacroEventResolvedImage = {
  image_url: string;
  image_thumb_url: string;
  image_provider: 'pexels';
  image_source_url: string;
  image_author: string | null;
  image_author_url: string | null;
  image_query: string;
  image_cached_at: string;
};

export type ResolveMacroEventImageResult = {
  ok: boolean;
  mode:
    | 'already_set'
    | 'headline_cache_hit'
    | 'headline_fetched'
    | 'category_cache_hit'
    | 'category_fetched'
    | 'fallback'
    | 'not_found';
  data?: MacroEventResolvedImage;
  category?: MacroEventImageCategory;
  error?: string;
};

export type BackfillMacroEventImagesResult = {
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function headlineOf(row: MacroEventImageRow): string {
  if (typeof row.title === 'string' && row.title.trim()) return row.title.trim();
  if (typeof row.event_title === 'string' && row.event_title.trim()) return row.event_title.trim();
  return '';
}

function qualifiesForHeadlineImage(row: MacroEventImageRow): boolean {
  const impactScore =
    typeof row.impact_score === 'number' && Number.isFinite(row.impact_score)
      ? row.impact_score
      : typeof row.importance === 'number' && Number.isFinite(row.importance)
        ? row.importance >= 5
          ? 9
          : row.importance >= 4
            ? 8
            : row.importance >= 3
              ? 7
              : row.importance >= 2
                ? 5
                : 3
        : 0;
  const isFeatured = row.is_featured === true;
  const eventRank = typeof row.event_rank === 'number' && Number.isFinite(row.event_rank) ? row.event_rank : null;

  return impactScore >= 7 || isFeatured || (eventRank !== null && eventRank <= 10);
}

function chooseQuery(category: MacroEventImageCategory, headline?: string | null): string {
  const base = CATEGORY_TO_PEXELS_QUERIES[category][0] ?? CATEGORY_TO_PEXELS_QUERIES.default[0];
  const safeHeadline = typeof headline === 'string' ? headline.toLowerCase() : '';
  if (category === 'ai_semis' && /nvidia|chip|gpu|data center|ai/i.test(safeHeadline)) {
    return CATEGORY_TO_PEXELS_QUERIES.ai_semis[0];
  }
  if (category === 'energy' && /oil|crude|opec|refinery/i.test(safeHeadline)) {
    return CATEGORY_TO_PEXELS_QUERIES.energy[0];
  }
  if (category === 'supply_chain' && /ship|freight|port|cargo/i.test(safeHeadline)) {
    return CATEGORY_TO_PEXELS_QUERIES.supply_chain[0];
  }
  return base;
}

function toResolvedImageFromCache(row: MacroEventImageCacheRow): MacroEventResolvedImage {
  return {
    image_url: row.image_url,
    image_thumb_url: row.thumb_url,
    image_provider: 'pexels',
    image_source_url: row.source_url,
    image_author: row.author,
    image_author_url: row.author_url,
    image_query: row.query,
    image_cached_at: nowIso(),
  };
}

function toResolvedImageFromHeadlineCache(row: MacroEventHeadlineImageCacheRow): MacroEventResolvedImage {
  return {
    image_url: row.image_url,
    image_thumb_url: row.thumb_url,
    image_provider: 'pexels',
    image_source_url: row.source_url,
    image_author: row.author,
    image_author_url: row.author_url,
    image_query: row.query,
    image_cached_at: nowIso(),
  };
}

function pickPhotoUrls(photo: Awaited<ReturnType<typeof searchPexelsPhotos>>[number]): MacroEventResolvedImage | null {
  const imageUrl = photo.src.landscape ?? photo.src.large2x ?? photo.src.large ?? photo.src.original;
  const thumbUrl = photo.src.medium ?? photo.src.small ?? photo.src.tiny ?? photo.src.landscape ?? imageUrl;
  if (!imageUrl || !thumbUrl) return null;

  return {
    image_url: imageUrl,
    image_thumb_url: thumbUrl,
    image_provider: 'pexels',
    image_source_url: photo.url,
    image_author: photo.photographer ?? null,
    image_author_url: photo.photographer_url ?? null,
    image_query: '',
    image_cached_at: nowIso(),
  };
}

async function updateMacroEventImage(
  supabase: SupabaseClient,
  eventId: string,
  image: MacroEventResolvedImage,
  category: MacroEventImageCategory
): Promise<void> {
  const payload = {
    category,
    image_url: image.image_url,
    image_thumb_url: image.image_thumb_url,
    image_provider: image.image_provider,
    image_source_url: image.image_source_url,
    image_author: image.image_author,
    image_author_url: image.image_author_url,
    image_query: image.image_query,
    image_cached_at: image.image_cached_at,
  };

  const { error } = await (supabase.from('macro_events') as any).update(payload).eq('id', eventId);
  if (error) {
    throw new Error(`MACRO_EVENT_UPDATE_FAILED:${error.message}`);
  }
}

async function resolveFromHeadlineCache(
  supabase: SupabaseClient,
  row: MacroEventImageRow,
  category: MacroEventImageCategory
): Promise<ResolveMacroEventImageResult | null> {
  if (!qualifiesForHeadlineImage(row)) return null;

  const headline = headlineOf(row);
  if (!headline) return null;

  const headlineHash = hashHeadline(headline);
  const { data: cachedRows, error: cacheError } = await (supabase.from('event_headline_images') as any)
    .select('headline_hash,headline,category,query,image_url,thumb_url,provider,source_url,author,author_url,cached_at,expires_at')
    .eq('headline_hash', headlineHash)
    .gt('expires_at', nowIso())
    .order('expires_at', { ascending: false })
    .limit(1);

  if (!cacheError && Array.isArray(cachedRows) && cachedRows.length > 0) {
    const cached = toResolvedImageFromHeadlineCache(cachedRows[0] as MacroEventHeadlineImageCacheRow);
    try {
      await updateMacroEventImage(supabase, row.id, cached, category);
      return { ok: true, mode: 'headline_cache_hit', category, data: cached };
    } catch (updateError) {
      return {
        ok: false,
        mode: 'headline_cache_hit',
        category,
        error: updateError instanceof Error ? updateError.message : 'Failed to persist headline cached image',
      };
    }
  }

  const query = buildHeadlineImageQuery({ headline, category });

  let photos;
  try {
    photos = await searchPexelsPhotos(query);
  } catch {
    return null;
  }

  const firstPhoto = photos.map(pickPhotoUrls).find((item): item is MacroEventResolvedImage => Boolean(item));
  if (!firstPhoto) return null;

  const resolved: MacroEventResolvedImage = {
    ...firstPhoto,
    image_query: query,
    image_cached_at: nowIso(),
  };

  const cachePayload = {
    headline_hash: headlineHash,
    headline,
    category,
    query,
    image_url: resolved.image_url,
    thumb_url: resolved.image_thumb_url,
    provider: 'pexels',
    source_url: resolved.image_source_url,
    author: resolved.image_author,
    author_url: resolved.image_author_url,
    cached_at: resolved.image_cached_at,
    expires_at: addDaysIso(30),
  };

  const { error: cacheWriteError } = await (supabase.from('event_headline_images') as any).upsert(cachePayload, {
    onConflict: 'headline_hash',
  });
  if (cacheWriteError) {
    console.error('[macroEventImages] headline cache upsert failed', cacheWriteError.message);
  }

  try {
    await updateMacroEventImage(supabase, row.id, resolved, category);
    return { ok: true, mode: 'headline_fetched', category, data: resolved };
  } catch (updateError) {
    return {
      ok: false,
      mode: 'headline_fetched',
      category,
      error: updateError instanceof Error ? updateError.message : 'Failed to persist headline image',
    };
  }
}

async function resolveFromCategoryCache(
  supabase: SupabaseClient,
  row: MacroEventImageRow,
  category: MacroEventImageCategory
): Promise<ResolveMacroEventImageResult> {
  const { data: cacheRows, error: cacheError } = await (supabase.from('event_category_images') as any)
    .select('category,query,image_url,thumb_url,provider,source_url,author,author_url,cached_at,expires_at')
    .eq('category', category)
    .gt('expires_at', nowIso())
    .order('expires_at', { ascending: false })
    .limit(1);

  if (!cacheError && Array.isArray(cacheRows) && cacheRows.length > 0) {
    const cached = toResolvedImageFromCache(cacheRows[0] as MacroEventImageCacheRow);
    try {
      await updateMacroEventImage(supabase, row.id, cached, category);
    } catch (updateError) {
      return {
        ok: false,
        mode: 'category_cache_hit',
        category,
        error: updateError instanceof Error ? updateError.message : 'Failed to persist cached image',
      };
    }
    return { ok: true, mode: 'category_cache_hit', category, data: cached };
  }

  const query = chooseQuery(category, headlineOf(row));

  let photos;
  try {
    photos = await searchPexelsPhotos(query);
  } catch (pexelsError) {
    const bestEffortPayload = {
      category,
      image_provider: 'pexels',
      image_query: query,
      image_cached_at: nowIso(),
    };
    await (supabase.from('macro_events') as any).update(bestEffortPayload).eq('id', row.id);
    return {
      ok: false,
      mode: 'fallback',
      category,
      error: pexelsError instanceof Error ? pexelsError.message : 'Pexels lookup failed',
    };
  }

  const firstPhoto = photos.map(pickPhotoUrls).find((item): item is MacroEventResolvedImage => Boolean(item));
  if (!firstPhoto) {
    const bestEffortPayload = {
      category,
      image_provider: 'pexels',
      image_query: query,
      image_cached_at: nowIso(),
    };
    await (supabase.from('macro_events') as any).update(bestEffortPayload).eq('id', row.id);
    return { ok: false, mode: 'fallback', category, error: 'No Pexels results for query' };
  }

  const resolved: MacroEventResolvedImage = {
    ...firstPhoto,
    image_query: query,
    image_cached_at: nowIso(),
  };

  const cachePayload = {
    category,
    query,
    image_url: resolved.image_url,
    thumb_url: resolved.image_thumb_url,
    provider: 'pexels',
    source_url: resolved.image_source_url,
    author: resolved.image_author,
    author_url: resolved.image_author_url,
    cached_at: resolved.image_cached_at,
    expires_at: addDaysIso(14),
  };

  const { error: cacheWriteError } = await (supabase.from('event_category_images') as any).upsert(cachePayload, {
    onConflict: 'category',
  });

  if (cacheWriteError) {
    console.error('[macroEventImages] category cache upsert failed', cacheWriteError.message);
  }

  try {
    await updateMacroEventImage(supabase, row.id, resolved, category);
  } catch (updateError) {
    return {
      ok: false,
      mode: 'category_fetched',
      category,
      error: updateError instanceof Error ? updateError.message : 'Failed to persist fetched image',
    };
  }

  return { ok: true, mode: 'category_fetched', category, data: resolved };
}

export async function resolveMacroEventImageById(
  supabase: SupabaseClient,
  eventId: string
): Promise<ResolveMacroEventImageResult> {
  const { data, error } = await (supabase.from('macro_events') as any)
    .select('*')
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    return { ok: false, mode: 'not_found', error: error.message };
  }

  const row = data as MacroEventImageRow | null;
  if (!row?.id) {
    return { ok: false, mode: 'not_found', error: 'Macro event not found' };
  }

  const category = normalizeCategory(row.category ?? row.event_type ?? row.title ?? row.event_title);

  if (row.image_url) {
    return {
      ok: true,
      mode: 'already_set',
      category,
      data: {
        image_url: row.image_url,
        image_thumb_url: row.image_thumb_url ?? row.image_url,
        image_provider: 'pexels',
        image_source_url: row.image_source_url ?? row.image_url,
        image_author: row.image_author,
        image_author_url: row.image_author_url,
        image_query: row.image_query ?? chooseQuery(category, headlineOf(row)),
        image_cached_at: row.image_cached_at ?? nowIso(),
      },
    };
  }

  const headlineResolved = await resolveFromHeadlineCache(supabase, row, category);
  if (headlineResolved) {
    return headlineResolved;
  }

  return resolveFromCategoryCache(supabase, row, category);
}

export async function backfillMacroEventImages(
  supabase: SupabaseClient,
  limit = 50
): Promise<BackfillMacroEventImagesResult> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 50;
  const { data, error } = await (supabase.from('macro_events') as any)
    .select('id')
    .is('image_url', null)
    .order('published_at', { ascending: false })
    .limit(safeLimit);

  if (error || !Array.isArray(data)) {
    return { processed: 0, updated: 0, skipped: 0, failed: 0 };
  }

  const result: BackfillMacroEventImagesResult = {
    processed: data.length,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of data as Array<{ id?: string }>) {
    if (!row.id) {
      result.skipped += 1;
      continue;
    }
    const resolved = await resolveMacroEventImageById(supabase, row.id);
    if (
      resolved.ok &&
      (
        resolved.mode === 'headline_cache_hit' ||
        resolved.mode === 'headline_fetched' ||
        resolved.mode === 'category_cache_hit' ||
        resolved.mode === 'category_fetched' ||
        resolved.mode === 'already_set'
      )
    ) {
      result.updated += 1;
    } else if (resolved.mode === 'fallback' || resolved.mode === 'not_found') {
      result.skipped += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

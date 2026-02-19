import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { headlineEnrichmentSchema } from '@/lib/news/types';
import { deterministicFallback, getEnrichmentForHeadline } from '@/lib/news/enrichment';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

const requestSchema = z.object({
  headline: z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    url: z.string().url(),
  }),
});

function toFallbackHeadline(payload: unknown): { title: string; description: string | null } {
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    const headline = row.headline && typeof row.headline === 'object' ? (row.headline as Record<string, unknown>) : null;
    const titleRaw = headline?.title;
    const descriptionRaw = headline?.description;
    return {
      title: typeof titleRaw === 'string' && titleRaw.trim().length > 0 ? titleRaw : 'Market headline',
      description: typeof descriptionRaw === 'string' && descriptionRaw.trim().length > 0 ? descriptionRaw : null,
    };
  }
  return { title: 'Market headline', description: null };
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fallback = deterministicFallback(toFallbackHeadline(rawBody));
      return NextResponse.json(headlineEnrichmentSchema.parse(fallback), { status: 200 });
    }

    const enrichment = await getEnrichmentForHeadline({
      title: parsed.data.headline.title,
      description: parsed.data.headline.description ?? null,
      url: parsed.data.headline.url,
    });

    return NextResponse.json(headlineEnrichmentSchema.parse(enrichment));
  } catch (error) {
    console.error('[api/news/headlines/enrich] failed', error);
    const fallback = deterministicFallback(toFallbackHeadline(rawBody));
    return NextResponse.json(headlineEnrichmentSchema.parse(fallback), { status: 200 });
  }
}

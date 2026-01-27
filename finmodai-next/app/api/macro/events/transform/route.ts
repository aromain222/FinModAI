import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transformNewsToEvents } from '@/lib/macro/events/transform';
import { NewsItemSchema } from '@/lib/schemas/news';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  range: z.enum(['1D', '1W', '1M']).optional().default('1W'),
});

export async function POST(request: NextRequest) {
  const traceId = crypto.randomUUID();

  try {
    const body = await request.json();
    const { items, marketData } = z
      .object({
        items: z.array(NewsItemSchema),
        marketData: z
          .object({
            changePct: z.number().nullable().optional(),
            points: z
              .array(
                z.object({
                  t: z.string(),
                  close: z.number(),
                })
              )
              .optional(),
          })
          .optional(),
      })
      .parse(body);

    const events = await transformNewsToEvents(items, marketData);

    return NextResponse.json({
      ok: true,
      data: { events },
      meta: {
        traceId,
        itemsCount: items.length,
        eventsCount: events.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'TRANSFORM_ERROR', message: error?.message || 'Unknown error' },
        meta: { traceId },
      },
      { status: 400 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateOperatingModelPreview, generateFallbackPreview } from '@/lib/view_models/operatingModelPreview';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  ticker: z.string().min(1).max(10),
  sector: z.string().optional(),
  marketCap: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  cash: z.number().nullable().optional(),
  burnRate: z.number().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const traceId = crypto.randomUUID();
  let parsedBody: z.infer<typeof RequestSchema> | null = null;

  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      // SAFETY RULE: Never return error - use fallback preview
      console.warn('[OperatingModelPreviewAPI] Invalid request body, using fallback:', parsed.error.errors);
      parsedBody = { ticker: (body?.ticker as string) || 'UNKNOWN', sector: body?.sector };
    } else {
      parsedBody = parsed.data;
    }

    const { ticker, sector, marketCap, revenue, cash, burnRate } = parsedBody;

    // SAFETY RULE: generateOperatingModelPreview never returns null - always provides preview
    const preview = await generateOperatingModelPreview({
      ticker,
      sector,
      marketCap: marketCap ?? null,
      revenue: revenue ?? null,
      cash: cash ?? null,
      burnRate: burnRate ?? null,
    });

    // SAFETY RULE: Never return empty state - preview is always valid
    return NextResponse.json(preview);
  } catch (error: any) {
    // SAFETY RULE: Log internally but always return preview (never error state)
    console.error('[OperatingModelPreviewAPI] Error:', error);
    
    // Return fallback preview instead of error
    const ticker = parsedBody?.ticker || 'UNKNOWN';
    const sector = parsedBody?.sector;
    const fallback = generateFallbackPreview({
      ticker,
      sector,
      marketCap: null,
      revenue: null,
      cash: null,
      burnRate: null,
    });
    
    return NextResponse.json(fallback);
  }
}


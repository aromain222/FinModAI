/**
 * Operating Model Generation API (lightweight)
 *
 * The operating model is experimental; this route validates inputs and returns a
 * simple, deterministic preview. Excel export happens in `/api/models/operating/download`.
 */

import { NextResponse } from 'next/server';
import { OperatingModelInputSchema, getMissingOperatingInputs } from '@/lib/models/operating/schema';
import { computeOperatingModel } from '@/lib/models/operating/compute';
import { computeVariances } from '@/lib/models/operating/variance';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const missing = getMissingOperatingInputs(body);
    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing required inputs', missingRequired: missing },
        { status: 400 }
      );
    }

    const parseResult = OperatingModelInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid input data', details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const input = parseResult.data;
    const output = await computeOperatingModel(input);
    const variance = await computeVariances(input, output);

    return NextResponse.json({
      ok: true,
      modelId: `operating-${Date.now()}`,
      ticker: input.ticker,
      modelType: 'operating',
      output,
      variance,
      preview: {
        sheetName: 'Cover',
        columns: ['Metric', 'Value'],
        rows: [
          ['Ticker', input.ticker],
          ['Base Revenue', input.revenue],
          ['Revenue Growth', input.revenueGrowth ?? null],
          ['EBITDA Margin', input.ebitdaMargin ?? null],
        ],
      },
      appliedDefaults: [],
      warnings: [],
      blocks: [],
      diagnostics: [],
    });
  } catch (error: any) {
    console.error('[operating] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to generate operating model' },
      { status: 500 }
    );
  }
}


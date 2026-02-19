/**
 * Merger Model Generation API (lightweight)
 *
 * This route validates user inputs and returns pulled public context used by the
 * download route. Excel generation happens in `/api/models/merger/download`.
 */

import { NextResponse } from 'next/server';
import { MergerModelInputSchema, getMissingMergerInputs } from '@/lib/models/merger/schema';
import { getLTMFinancials, type LTMFinancials } from '@/lib/getLTMFinancials';
import { isDemoMode } from '@/lib/demo/isDemoMode';
import { isDemoTickerAvailable } from '@/lib/data/providers/demoProvider';

export const runtime = 'nodejs';

function derivePriceFromMarketCap(ltm: Partial<LTMFinancials> | null): number | null {
  const marketCap = typeof ltm?.marketCap === 'number' ? ltm.marketCap : null;
  const shares = typeof ltm?.sharesOutstanding === 'number' ? ltm.sharesOutstanding : null;
  if (!marketCap || !shares || shares <= 0) return null;
  return marketCap / shares;
}

export async function POST(req: Request) {
  try {
    if (!isDemoMode()) {
      return NextResponse.json(
        { ok: false, error: 'Demo mode is required.' },
        { status: 400 }
      );
    }
    const body = await req.json();

    // Pull public context (best-effort) to support conditional validation.
    const buyerTickerRaw = body.acquirerTicker || body.buyerTicker;
    let buyerLTM: LTMFinancials | null = null;
    let targetLTM: LTMFinancials | null = null;

    if (buyerTickerRaw) {
      const demoAllowed = await isDemoTickerAvailable(buyerTickerRaw);
      if (!demoAllowed) {
        return NextResponse.json(
          {
            ok: false,
            error: 'This demo ticker is not in the curated demo set. Choose a demo company.',
          },
          { status: 400 }
        );
      }
    }
    if (body.targetTicker) {
      const demoAllowed = await isDemoTickerAvailable(body.targetTicker);
      if (!demoAllowed) {
        return NextResponse.json(
          {
            ok: false,
            error: 'This demo ticker is not in the curated demo set. Choose a demo company.',
          },
          { status: 400 }
        );
      }
    }

    try {
      if (buyerTickerRaw) buyerLTM = await getLTMFinancials(buyerTickerRaw);
    } catch {}
    try {
      if (body.targetTicker) targetLTM = await getLTMFinancials(body.targetTicker);
    } catch {}

    const pulledData = {
      buyer: buyerLTM
        ? {
            price: derivePriceFromMarketCap(buyerLTM),
            shares: buyerLTM.sharesOutstanding ?? null,
            cash: buyerLTM.cash ?? null,
            marketCap: buyerLTM.marketCap ?? null,
          }
        : undefined,
      target: targetLTM
        ? {
            price: derivePriceFromMarketCap(targetLTM),
            shares: targetLTM.sharesOutstanding ?? null,
            cash: targetLTM.cash ?? null,
            debt: targetLTM.totalDebt ?? null,
            marketCap: targetLTM.marketCap ?? null,
          }
        : undefined,
    };

    // Validate required inputs with pulled data context.
    const missing = getMissingMergerInputs(body, pulledData);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing required inputs',
          missingRequired: missing,
          pulledData,
        },
        { status: 400 }
      );
    }

    // Parse and validate with Zod.
    const parseResult = MergerModelInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid input data',
          details: parseResult.error.errors,
          pulledData,
        },
        { status: 400 }
      );
    }

    const input = parseResult.data;

    return NextResponse.json({
      ok: true,
      modelId: `merger-${Date.now()}`,
      ticker: `${input.acquirerTicker}/${input.targetTicker}`,
      pulledData,
    });
  } catch (error: any) {
    console.error('[merger] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Failed to validate merger model inputs',
      },
      { status: 500 }
    );
  }
}

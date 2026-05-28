import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { alpacaPaperCredentials, submitAlpacaPaperOrder } from '@/lib/execution/alpacaPaper';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const positionOrderSchema = z.object({
  ticker: z.string().min(1).max(10),
  side: z.enum(['buy', 'sell']),
  shares: z.number().positive().optional(),
  notional: z.number().positive().optional(),
}).refine(value => value.shares != null || value.notional != null, {
  message: 'Provide either shares or notional.',
  path: ['shares'],
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.ALPACA_AUTO_PAPER_ENABLED !== 'true') {
    return NextResponse.json({ skipped: true, reason: 'paper trading not enabled' });
  }

  const credentials = alpacaPaperCredentials();
  if (!credentials.configured) {
    return NextResponse.json(
      { error: 'Alpaca paper credentials are not configured.' },
      { status: 503 },
    );
  }

  try {
    const input = positionOrderSchema.parse(await readJson(req));

    const order = await submitAlpacaPaperOrder({
      symbol: input.ticker.toUpperCase(),
      side: input.side,
      type: 'market',
      time_in_force: 'day',
      ...(input.shares != null
        ? { qty: String(input.shares) }
        : { notional: String(input.notional) }),
    });

    return NextResponse.json({ submitted: true, order }, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not submit position order', 400);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { alpacaPaperCredentials, getAlpacaPaperAccount, listAlpacaPaperOrders } from '@/lib/execution/alpacaPaper';
import { previewPaperExecution, submitApprovedPaperExecution } from '@/lib/execution/orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const paperOrderSchema = z.object({
  decisionId: z.string().min(1),
  dryRun: z.boolean().optional().default(true),
  qty: z.number().positive().optional(),
  notional: z.number().positive().optional(),
  orderType: z.enum(['market', 'limit']).optional().default('market'),
  limitPrice: z.number().positive().optional(),
  timeInForce: z.enum(['day', 'gtc']).optional().default('day'),
  extendedHours: z.boolean().optional().default(false),
}).refine(value => value.qty != null || value.notional != null, {
  message: 'Provide either qty or notional.',
  path: ['qty'],
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const credentials = alpacaPaperCredentials();
  if (!credentials.configured) {
    return NextResponse.json({
      mode: 'paper',
      configured: false,
      message: 'Set ALPACA_API_KEY_ID and ALPACA_SECRET_KEY to enable Alpaca paper trading.',
    });
  }

  try {
    const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('limit') ?? 25)));
    const [account, orders] = await Promise.all([
      getAlpacaPaperAccount(),
      listAlpacaPaperOrders(limit),
    ]);
    return NextResponse.json({ mode: 'paper', configured: true, account, orders });
  } catch (err) {
    return jsonError(err, 'Could not load Alpaca paper account', 502);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const input = paperOrderSchema.parse(await readJson(req));
    if (input.dryRun) {
      const preview = await previewPaperExecution(input);
      return NextResponse.json({ ...preview, submitted: false });
    }

    const result = await submitApprovedPaperExecution(input);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not submit paper order', 400);
  }
}

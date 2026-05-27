import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { runAutoPaperTrader } from '@/lib/execution/autoPaperTrader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const autoPaperSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  notional: z.number().positive().optional(),
  minConfidence: z.number().min(0).max(100).optional(),
  maxOrders: z.number().int().min(1).max(10).optional(),
  autoApprove: z.boolean().optional().default(false),
  approvalMinConfidence: z.number().min(0).max(100).optional(),
});

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.EXECUTION_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function queryInput(req: NextRequest): z.infer<typeof autoPaperSchema> {
  return autoPaperSchema.parse({
    dryRun: req.nextUrl.searchParams.get('dryRun') === 'false' ? false : true,
    notional: req.nextUrl.searchParams.get('notional') ? Number(req.nextUrl.searchParams.get('notional')) : undefined,
    minConfidence: req.nextUrl.searchParams.get('minConfidence') ? Number(req.nextUrl.searchParams.get('minConfidence')) : undefined,
    maxOrders: req.nextUrl.searchParams.get('maxOrders') ? Number(req.nextUrl.searchParams.get('maxOrders')) : undefined,
    autoApprove: req.nextUrl.searchParams.get('autoApprove') === 'true',
    approvalMinConfidence: req.nextUrl.searchParams.get('approvalMinConfidence') ? Number(req.nextUrl.searchParams.get('approvalMinConfidence')) : undefined,
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const input = queryInput(req);
    const result = await runAutoPaperTrader({ ...input, dryRun: true });
    return NextResponse.json({
      ...result,
      message: 'Dry-run only. Add autoApprove=true to preview PM Agent approvals. Use POST with Authorization plus paper env flags to submit.',
    });
  } catch (err) {
    return jsonError(err, 'Could not preview auto paper trader');
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const input = autoPaperSchema.parse(await readJson(req));
    if (!input.dryRun && !isAuthorized(req)) {
      return NextResponse.json({
        error: 'Unauthorized. Auto paper execution or PM Agent auto-approval requires Authorization: Bearer EXECUTION_CRON_SECRET or CRON_SECRET.',
      }, { status: 401 });
    }

    const result = await runAutoPaperTrader(input);
    return NextResponse.json({
      ...result,
      message: result.submitted > 0
        ? 'Submitted approved PM decisions to Alpaca paper trading.'
        : result.enabled
          ? 'No paper orders submitted.'
          : 'Auto paper trading is disabled. Set ALPACA_AUTO_PAPER_ENABLED=true to submit.',
    });
  } catch (err) {
    return jsonError(err, 'Could not run auto paper trader');
  }
}

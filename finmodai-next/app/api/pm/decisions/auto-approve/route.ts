import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { autoApprovePaperDecisions } from '@/lib/pm/decisions/autoApprove';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const autoApproveSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  minConfidence: z.number().min(0).max(100).optional(),
  maxApprovals: z.number().int().min(1).max(10).optional(),
});

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.EXECUTION_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(): Promise<NextResponse> {
  try {
    const result = await autoApprovePaperDecisions({ dryRun: true });
    return NextResponse.json({
      ...result,
      message: 'Dry-run only. POST with Authorization and PM_AGENT_AUTO_APPROVAL_ENABLED=true to approve paper decisions.',
    });
  } catch (err) {
    return jsonError(err, 'Could not preview PM Agent auto-approval');
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const input = autoApproveSchema.parse(await readJson(req));
    if (!input.dryRun && !isAuthorized(req)) {
      return NextResponse.json({
        error: 'Unauthorized. PM Agent auto-approval requires Authorization: Bearer EXECUTION_CRON_SECRET or CRON_SECRET.',
      }, { status: 401 });
    }
    const result = await autoApprovePaperDecisions(input);
    return NextResponse.json({
      ...result,
      message: result.approved.length > 0
        ? 'PM Agent approved paper-trade decisions.'
        : result.enabled
          ? 'No PM decisions met auto-approval criteria.'
          : 'PM Agent auto-approval is disabled. Set PM_AGENT_AUTO_APPROVAL_ENABLED=true.',
    });
  } catch (err) {
    return jsonError(err, 'Could not run PM Agent auto-approval');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { updateDecision } from '@/lib/pm/decisions/decisionStore';
import type { PMApprovalStatus } from '@/lib/pm/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const approveSchema = z.object({
  action: z.enum(['approve', 'reject', 'defer']),
  note: z.string().optional(),
  approvedBy: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = approveSchema.parse(await readJson(req));

    const statusMap: Record<'approve' | 'reject' | 'defer', PMApprovalStatus> = {
      approve: 'approved',
      reject: 'rejected',
      defer: 'deferred',
    };

    const decision = await updateDecision(id, {
      approvalStatus: statusMap[body.action],
      approvedBy: body.approvedBy ?? 'pm',
      approvalNote: body.note,
      updatedAt: new Date().toISOString(),
    });

    if (!decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }
    return NextResponse.json({ decision });
  } catch (err) {
    return jsonError(err, 'Could not update decision');
  }
}

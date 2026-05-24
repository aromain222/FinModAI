import { NextRequest, NextResponse } from 'next/server';
import { idPatchSchema, tickerQuerySchema } from '@/lib/pm/schemas';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { listDecisions, saveDecision, updateDecision } from '@/lib/pm/decisions/decisionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = tickerQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const decisions = await listDecisions(parsed);
  return NextResponse.json({ decisions });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const decision = await saveDecision(await readJson(req));
    return NextResponse.json({ decision }, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not save decision');
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { id, patch } = idPatchSchema.parse(await readJson(req));
    const decision = await updateDecision(id, patch);
    return decision
      ? NextResponse.json({ decision })
      : NextResponse.json({ error: 'Decision not found' }, { status: 404 });
  } catch (err) {
    return jsonError(err, 'Could not update decision');
  }
}

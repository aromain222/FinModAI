import { NextRequest, NextResponse } from 'next/server';
import { idPatchSchema } from '@/lib/pm/schemas';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { generateWeeklyMemo } from '@/lib/pm/reports/generateWeeklyMemo';
import { listWeeklyMemos, saveWeeklyMemo, updateWeeklyMemo } from '@/lib/pm/reports/weeklyMemoStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function currentWeekRange(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const day = now.getUTCDay();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
  return { weekStart: start.toISOString().slice(0, 10), weekEnd: end.toISOString().slice(0, 10) };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const limit = Math.max(1, Math.min(52, Number(req.nextUrl.searchParams.get('limit') ?? 12)));
  const memos = await listWeeklyMemos({ limit });
  return NextResponse.json({ memos });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await readJson(req);
    if (typeof body === 'object' && body && 'generate' in body) {
      const record = body as { weekStart?: unknown; weekEnd?: unknown };
      const fallback = currentWeekRange();
      const memo = await generateWeeklyMemo({
        weekStart: typeof record.weekStart === 'string' ? record.weekStart : fallback.weekStart,
        weekEnd: typeof record.weekEnd === 'string' ? record.weekEnd : fallback.weekEnd,
      });
      return NextResponse.json({ memo }, { status: 201 });
    }
    const memo = await saveWeeklyMemo(body);
    return NextResponse.json({ memo }, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not save weekly memo');
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { id, patch } = idPatchSchema.parse(await readJson(req));
    const memo = await updateWeeklyMemo(id, patch);
    return memo
      ? NextResponse.json({ memo })
      : NextResponse.json({ error: 'Weekly memo not found' }, { status: 404 });
  } catch (err) {
    return jsonError(err, 'Could not update weekly memo');
  }
}

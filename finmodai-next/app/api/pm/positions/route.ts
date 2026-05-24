import { NextRequest, NextResponse } from 'next/server';
import { idPatchSchema, tickerQuerySchema } from '@/lib/pm/schemas';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { listPositions, savePosition, updatePosition } from '@/lib/pm/portfolio/positionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = tickerQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const positions = await listPositions(parsed);
  return NextResponse.json({ positions });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const position = await savePosition(await readJson(req));
    return NextResponse.json({ position }, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not save position');
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { id, patch } = idPatchSchema.parse(await readJson(req));
    const position = await updatePosition(id, patch);
    return position
      ? NextResponse.json({ position })
      : NextResponse.json({ error: 'Position not found' }, { status: 404 });
  } catch (err) {
    return jsonError(err, 'Could not update position');
  }
}

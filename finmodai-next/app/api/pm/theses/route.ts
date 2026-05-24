import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { idPatchSchema, tickerQuerySchema } from '@/lib/pm/schemas';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { listTheses, saveThesis, updateThesisRecord } from '@/lib/pm/thesis/thesisStore';
import { updateThesis } from '@/lib/pm/thesis/updateThesis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const thesisUpdateRequest = z.object({
  ticker: z.string().min(1),
  newEvidence: z.string().min(1),
  newThesisSummary: z.string().optional(),
  convictionScore: z.number().min(0).max(100).optional(),
  source: z.enum(['agent', 'event', 'user', 'score_change', 'manual']).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = tickerQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const theses = await listTheses(parsed);
  return NextResponse.json({ theses });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await readJson(req);
    if (typeof body === 'object' && body && 'newEvidence' in body) {
      const result = await updateThesis(thesisUpdateRequest.parse(body));
      return NextResponse.json(result, { status: 201 });
    }
    const thesis = await saveThesis(body);
    return NextResponse.json({ thesis }, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not save thesis');
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { id, patch } = idPatchSchema.parse(await readJson(req));
    const thesis = await updateThesisRecord(id, patch);
    return thesis
      ? NextResponse.json({ thesis })
      : NextResponse.json({ error: 'Thesis not found' }, { status: 404 });
  } catch (err) {
    return jsonError(err, 'Could not update thesis');
  }
}

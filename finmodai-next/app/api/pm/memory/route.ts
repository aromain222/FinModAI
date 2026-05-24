import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { tickerQuerySchema } from '@/lib/pm/schemas';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { listMemory, saveMemory } from '@/lib/pm/memory/memoryStore';
import { getRelevantMemory } from '@/lib/pm/memory/getRelevantMemory';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const memoryQuerySchema = tickerQuerySchema.extend({
  relevant: z.coerce.boolean().optional().default(false),
  themes: z.string().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = memoryQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const themes = parsed.themes?.split(',').map(theme => theme.trim()).filter(Boolean);
  const memory = parsed.relevant
    ? await getRelevantMemory({ ticker: parsed.ticker, themes, limit: parsed.limit })
    : await listMemory({ ticker: parsed.ticker, limit: parsed.limit });
  return NextResponse.json({ memory });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const memory = await saveMemory(await readJson(req));
    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not save memory');
  }
}

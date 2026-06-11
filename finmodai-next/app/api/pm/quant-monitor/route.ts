import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, readJson } from '@/lib/pm/api/http';
import {
  listQuantScores,
  listQuantSignalEvents,
} from '@/lib/pm/monitoring/store';
import { runQuantMonitoring } from '@/lib/pm/monitoring/runQuantMonitoring';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const monitorRequestSchema = z.object({
  ticker: z.string().trim().min(1).max(16).transform(value => value.toUpperCase()),
  autoEscalate: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase();
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') ?? 250);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(1, Math.trunc(requestedLimit)))
    : 250;
  const [snapshots, events] = await Promise.all([
    listQuantScores({ ticker, limit }),
    listQuantSignalEvents({ ticker, limit }),
  ]);
  return NextResponse.json({ snapshots, events });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const input = monitorRequestSchema.parse(await readJson(req));
    const result = await runQuantMonitoring({
      ...input,
      origin: new URL(req.url).origin,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error, 'Could not run quant monitoring');
  }
}

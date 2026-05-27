import { NextRequest, NextResponse } from 'next/server';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { runPMBrainAgent } from '@/lib/pm/agent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const result = await runPMBrainAgent(await readJson(req));
    return NextResponse.json(result, { status: result.ok ? 200 : 200 });
  } catch (err) {
    return jsonError(err, 'Could not run PM Brain Agent');
  }
}

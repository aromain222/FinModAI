import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  getInvestmentEventAnalysisRun,
  listInvestmentEventAnalysisRuns,
  saveInvestmentEventAnalysisRun,
} from '@/lib/investment-analysis/eventAnalysisPersistence';
import type { SaveInvestmentEventAnalysisRunInput } from '@/lib/investment-analysis/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('id');
  const ticker = searchParams.get('ticker') ?? undefined;
  const eventCategory = searchParams.get('eventCategory') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 25, 1), 100) : 25;

  try {
    if (runId) {
      const run = await getInvestmentEventAnalysisRun(supabase, user.id, runId);
      return NextResponse.json({ run });
    }

    const runs = await listInvestmentEventAnalysisRuns(supabase, user.id, {
      ticker,
      eventCategory,
      limit,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch event-aware analysis runs.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = (await request.json()) as SaveInvestmentEventAnalysisRunInput | null;

  if (!payload?.company?.ticker || !payload?.company?.companyName) {
    return NextResponse.json({ error: 'company ticker and company name are required.' }, { status: 400 });
  }

  if (!payload?.originalPrompt?.trim()) {
    return NextResponse.json({ error: 'originalPrompt is required.' }, { status: 400 });
  }

  if (
    !payload.parsedPromptContext ||
    !payload.baseAssumptions ||
    !payload.assumptionDeltas ||
    !payload.adjustedAssumptions ||
    !payload.valuationOutputs
  ) {
    return NextResponse.json(
      {
        error:
          'parsedPromptContext, baseAssumptions, assumptionDeltas, adjustedAssumptions, and valuationOutputs are required.',
      },
      { status: 400 },
    );
  }

  try {
    const run = await saveInvestmentEventAnalysisRun(supabase, user.id, payload);
    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save investment event analysis run.' },
      { status: 500 },
    );
  }
}

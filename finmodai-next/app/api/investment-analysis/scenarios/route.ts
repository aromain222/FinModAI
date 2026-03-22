import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  getSavedInvestmentScenario,
  listSavedInvestmentScenarios,
  saveInvestmentScenario,
} from '@/lib/investment-analysis/scenarioPersistence';
import type { SaveInvestmentScenarioInput } from '@/lib/investment-analysis/types';

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
  const scenarioId = searchParams.get('id');
  const ticker = searchParams.get('ticker') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 25, 1), 100) : 25;

  try {
    if (scenarioId) {
      const scenario = await getSavedInvestmentScenario(supabase, user.id, scenarioId);
      return NextResponse.json({ scenario });
    }

    const scenarios = await listSavedInvestmentScenarios(supabase, user.id, { ticker, limit });
    return NextResponse.json({ scenarios });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch saved scenarios.' },
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

  const payload = (await request.json()) as SaveInvestmentScenarioInput | null;

  if (!payload?.company?.ticker || !payload?.company?.companyName) {
    return NextResponse.json({ error: 'company ticker and company name are required.' }, { status: 400 });
  }
  if (!payload?.scenarioName?.trim()) {
    return NextResponse.json({ error: 'scenarioName is required.' }, { status: 400 });
  }
  if (!payload.assumptions || !payload.valuation || !payload.chartPayload) {
    return NextResponse.json(
      { error: 'assumptions, valuation, and chartPayload are required.' },
      { status: 400 },
    );
  }

  try {
    const scenario = await saveInvestmentScenario(supabase, user.id, payload);
    return NextResponse.json({ scenario });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save investment scenario.' },
      { status: 500 },
    );
  }
}

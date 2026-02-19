import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { BaseAssumptions, runDcf, runForecast, ScenarioAssumptions } from '@/lib/scenarioEngine';
import { buildScenarioBaselineFromDemo } from '@/lib/scenarios/demoBaseline';

export async function POST(request: Request) {
  const body = await request.json();
  const assumptions: BaseAssumptions | undefined = body?.assumptions;
  const name: string | undefined = body?.name;
  const ticker: string | undefined = body?.ticker;

  const demoMode = process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  if (!name) {
    return NextResponse.json({ error: 'name is required.' }, { status: 400 });
  }
  if (!demoMode && !assumptions) {
    return NextResponse.json({ error: 'assumptions are required.' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedTicker = (ticker ?? assumptions?.ticker ?? '').toUpperCase().trim();
  if (!resolvedTicker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }
  const base = demoMode ? (await buildScenarioBaselineFromDemo(resolvedTicker)).base : sanitizeBaseAssumptions(assumptions as BaseAssumptions);
  const scenario: ScenarioAssumptions = {
    name,
    revenueGrowthDelta: 0,
    ebitdaMarginDelta: 0,
    waccDelta: 0,
    terminalGrowthDelta: 0,
  };

  const dcf = await runDcf(base, scenario, 5);
  const forecastYearly = await runForecast(base, scenario, 5);

  const { data: scenarioRow, error } = await supabase
      .from('scenarios')
      .insert({
        user_id: user.id,
        name: scenario.name,
        type: 'custom',
        ticker: resolvedTicker,
        assumptions: scenario,
      })
    .select()
    .single();

  if (error || !scenarioRow) {
    console.error('Custom scenario insert error', error);
    return NextResponse.json({ error: 'Failed to store scenario.' }, { status: 500 });
  }

  const { error: resultError } = await supabase.from('scenario_results').insert({
    scenario_id: scenarioRow.id,
    dcf_output: dcf,
    forecast_output: {
      yearly: forecastYearly
    }
  });

  if (resultError) {
    console.error('Custom scenario result error', resultError);
    return NextResponse.json({ error: 'Failed to store scenario results.' }, { status: 500 });
  }

  return NextResponse.json({
    scenario: scenarioRow,
    dcf,
    forecast: {
      yearly: forecastYearly
    }
  });
}

function sanitizeBaseAssumptions(input: BaseAssumptions): BaseAssumptions {
  return {
    ...input,
    ticker: (input.ticker || '').toUpperCase(),
    revenue: Number(input.revenue) || 1,
    revenueGrowth: Number(input.revenueGrowth) || 0,
    ebitdaMargin: Number(input.ebitdaMargin) || 0,
    taxRate: input.taxRate !== undefined ? Number(input.taxRate) : 0.21,
    wacc: input.wacc !== undefined ? Number(input.wacc) : 0.1,
    terminalGrowth: input.terminalGrowth !== undefined ? Number(input.terminalGrowth) : 0.02,
    capexPctRevenue: input.capexPctRevenue !== undefined ? Number(input.capexPctRevenue) : 0.05,
    nwcPctRevenue: input.nwcPctRevenue !== undefined ? Number(input.nwcPctRevenue) : 0.1,
    netDebt: input.netDebt !== undefined ? Number(input.netDebt) : 0,
    sharesOutstanding: input.sharesOutstanding !== undefined ? Number(input.sharesOutstanding) : undefined,
  };
}

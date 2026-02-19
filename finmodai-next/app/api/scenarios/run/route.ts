import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
  BaseAssumptions,
  ScenarioAssumptions,
  createStandardScenarios,
  runDcf,
  runForecast,
  ForecastResult,
  DcfResult,
  computeDeltaVsBase,
} from '@/lib/scenarioEngine';
import { buildScenarioBaselineFromDemo } from '@/lib/scenarios/demoBaseline';
import { standardScenarioTemplate } from '@/lib/scenarios/templates';

type ScenarioPayload = {
  scenario: ScenarioAssumptions;
  dcf: DcfResult;
  forecast: {
    yearly: ForecastResult;
  };
  deltaVsBase: ReturnType<typeof computeDeltaVsBase>;
  recordId: string;
  kind: 'base' | 'bull' | 'bear';
};

export async function POST(request: Request) {
  const body = await request.json();
  const baseAssumptions: BaseAssumptions | undefined = body?.baseAssumptions;
  const tickerOverride: string | undefined = body?.ticker;

  const demoMode = process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  if (!demoMode && (!baseAssumptions || typeof baseAssumptions !== 'object')) {
    return NextResponse.json({ error: 'baseAssumptions are required.' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedTicker = (tickerOverride ?? baseAssumptions?.ticker ?? '').toUpperCase().trim();
  if (!resolvedTicker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }
  const baseline = demoMode ? await buildScenarioBaselineFromDemo(resolvedTicker) : null;
  const base = demoMode ? baseline!.base : sanitizeBaseAssumptions(baseAssumptions as BaseAssumptions);
  const scenarios = demoMode ? standardScenarioTemplate(baseline!.sector) : createStandardScenarios();
  const results: ScenarioPayload[] = [];

  const baseDcf = await runDcf(base, { name: 'Base Case' }, 5);

  for (const scenario of scenarios) {
    const kind: ScenarioPayload['kind'] =
      scenario.name.toLowerCase().includes('bull') ? 'bull' :
      scenario.name.toLowerCase().includes('bear') ? 'bear' :
      'base';

    const dcf = await runDcf(base, scenario, 5);
    const forecastYearly = await runForecast(base, scenario, 5);
    const deltaVsBase = computeDeltaVsBase(baseDcf, dcf, base, scenario);

    const { data: scenarioRow, error: scenarioError } = await supabase
      .from('scenarios')
      .insert({
        user_id: user.id,
        name: scenario.name,
        type: kind,
        ticker: resolvedTicker,
        assumptions: scenario,
      })
      .select()
      .single();

    if (scenarioError || !scenarioRow) {
      console.error('Scenario insert error', scenarioError);
      return NextResponse.json({ error: 'Failed to persist scenario.' }, { status: 500 });
    }

    const { error: resultError } = await supabase.from('scenario_results').insert({
      scenario_id: scenarioRow.id,
      dcf_output: dcf,
      forecast_output: {
        yearly: forecastYearly,
      },
    });

    if (resultError) {
      console.error('Scenario result insert error', resultError);
      return NextResponse.json({ error: 'Failed to persist scenario result.' }, { status: 500 });
    }

    results.push({
      scenario,
      dcf,
      forecast: { yearly: forecastYearly },
      deltaVsBase,
      recordId: scenarioRow.id,
      kind,
    });
  }

  return NextResponse.json({
    base: results.find((r) => r.kind === 'base') ?? null,
    bull: results.find((r) => r.kind === 'bull') ?? null,
    bear: results.find((r) => r.kind === 'bear') ?? null,
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

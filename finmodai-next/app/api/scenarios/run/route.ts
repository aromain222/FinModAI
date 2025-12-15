import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
  BaseAssumptions,
  ScenarioAssumptions,
  generateBaseCase,
  generateBullCase,
  generateBearCase,
  runDcf,
  runForecast,
  ForecastResult,
  DcfResult
} from '@/lib/scenarioEngine';

type ScenarioPayload = {
  scenario: ScenarioAssumptions;
  dcf: DcfResult;
  forecast: {
    quarterly: ForecastResult;
    yearly: ForecastResult;
  };
  recordId: string;
};

export async function POST(request: Request) {
  const body = await request.json();
  const baseAssumptions: BaseAssumptions | undefined = body?.baseAssumptions;
  const ticker: string | undefined = body?.ticker;

  if (!baseAssumptions || typeof baseAssumptions !== 'object') {
    return NextResponse.json({ error: 'baseAssumptions are required.' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sanitized = sanitizeBaseAssumptions(baseAssumptions);

  const scenarios = [generateBaseCase, generateBullCase, generateBearCase].map((fn) =>
    fn({ ...sanitized, ticker })
  );

  const results: ScenarioPayload[] = [];

  for (const scenario of scenarios) {
    const dcf = runDcf(scenario);
    const forecastQuarterly = runForecast(scenario, { periods: 4, frequency: 'quarterly' });
    const forecastYearly = runForecast(scenario, {
      periods: scenario.forecastYears ?? 5,
      frequency: 'yearly'
    });

    const { data: scenarioRow, error: scenarioError } = await supabase
      .from('scenarios')
      .insert({
        user_id: user.id,
        name: scenario.name,
        type: scenario.type,
        ticker: scenario.ticker,
        assumptions: scenario
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
        quarterly: forecastQuarterly,
        yearly: forecastYearly
      }
    });

    if (resultError) {
      console.error('Scenario result insert error', resultError);
      return NextResponse.json({ error: 'Failed to persist scenario result.' }, { status: 500 });
    }

    results.push({
      scenario,
      dcf,
      forecast: {
        quarterly: forecastQuarterly,
        yearly: forecastYearly
      },
      recordId: scenarioRow.id
    });
  }

  // TODO: apply plan-based gating (e.g., free-tier returns only base scenario)

  return NextResponse.json({
    base: results.find((r) => r.scenario.type === 'base'),
    bull: results.find((r) => r.scenario.type === 'bull'),
    bear: results.find((r) => r.scenario.type === 'bear')
  });
}

function sanitizeBaseAssumptions(input: BaseAssumptions): BaseAssumptions {
  return {
    ...input,
    revenue: Number(input.revenue) || 1,
    revenueGrowth: Number(input.revenueGrowth) || 0,
    ebitdaMargin: Number(input.ebitdaMargin) || 0,
    taxRate: Number(input.taxRate) || 0.21,
    capexPercent: Number(input.capexPercent) || 0.05,
    wacc: Number(input.wacc) || 0.1,
    terminalGrowth: Number(input.terminalGrowth) || 0.02,
    netDebt: Number(input.netDebt ?? 0),
    sharesOutstanding: input.sharesOutstanding ? Number(input.sharesOutstanding) : undefined,
    forecastYears: input.forecastYears ? Number(input.forecastYears) : 5
  };
}


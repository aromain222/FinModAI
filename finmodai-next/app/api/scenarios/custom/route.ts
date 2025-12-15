import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { BaseAssumptions, runDcf, runForecast, ScenarioAssumptions } from '@/lib/scenarioEngine';

export async function POST(request: Request) {
  const body = await request.json();
  const assumptions: ScenarioAssumptions | BaseAssumptions | undefined = body?.assumptions;
  const name: string | undefined = body?.name;
  const ticker: string | undefined = body?.ticker;

  if (!assumptions || !name) {
    return NextResponse.json({ error: 'name and assumptions are required.' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sanitized = sanitizeAssumptions(assumptions as BaseAssumptions);

  const scenario: ScenarioAssumptions = {
    ...sanitized,
    name,
    type: 'custom',
    ticker: ticker ?? sanitized.ticker
  };

  const dcf = runDcf(scenario);
  const forecastQuarterly = runForecast(scenario, { periods: 4, frequency: 'quarterly' });
  const forecastYearly = runForecast(scenario, {
    periods: scenario.forecastYears ?? 5,
    frequency: 'yearly'
  });

  const { data: scenarioRow, error } = await supabase
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

  if (error || !scenarioRow) {
    console.error('Custom scenario insert error', error);
    return NextResponse.json({ error: 'Failed to store scenario.' }, { status: 500 });
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
    console.error('Custom scenario result error', resultError);
    return NextResponse.json({ error: 'Failed to store scenario results.' }, { status: 500 });
  }

  return NextResponse.json({
    scenario: scenarioRow,
    dcf,
    forecast: {
      quarterly: forecastQuarterly,
      yearly: forecastYearly
    }
  });
}

function sanitizeAssumptions(input: BaseAssumptions): ScenarioAssumptions {
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
    forecastYears: input.forecastYears ? Number(input.forecastYears) : 5,
    name: input['name'] ?? 'Custom Scenario',
    type: 'custom'
  };
}


import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { BaseAssumptions, ScenarioAssumptions, runForecast } from '@/lib/scenarioEngine';

export async function POST(request: Request) {
  const body = await request.json();
  const baseAssumptions: BaseAssumptions | undefined = body?.baseAssumptions;
  const ticker: string | undefined = body?.ticker;
  const periods: number = Number(body?.periods ?? 4);
  const frequency: 'quarterly' | 'yearly' = body?.frequency === 'yearly' ? 'yearly' : 'quarterly';

  if (!baseAssumptions) {
    return NextResponse.json({ error: 'baseAssumptions required' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scenario: ScenarioAssumptions = {
    ...baseAssumptions,
    name: `${frequency === 'quarterly' ? 'Quarterly' : 'Yearly'} Forecast`,
    type: 'custom',
    ticker
  };

  const forecast = runForecast(scenario, { periods, frequency });

  return NextResponse.json(forecast);
}


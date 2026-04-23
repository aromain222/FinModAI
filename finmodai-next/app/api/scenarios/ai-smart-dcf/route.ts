import { NextResponse } from 'next/server';

import {
  buildAiSmartDcfReport,
  RATES_DOWN_100BPS_SCENARIO,
  TESLA_BASE_CASE,
  type GroundedBaseCase,
  type MacroScenario,
} from '@/lib/scenarios/aiSmartDcf';

type RequestBody = {
  baseCase?: GroundedBaseCase;
  scenario?: MacroScenario;
};

export async function POST(request: Request) {
  let body: RequestBody = {};

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }

  try {
    const report = buildAiSmartDcfReport(body.baseCase ?? TESLA_BASE_CASE, body.scenario ?? RATES_DOWN_100BPS_SCENARIO);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build AI smart DCF scenario.' },
      { status: 400 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { runStrictFinancialPipeline } from '@/lib/data/financial-extraction/strict/orchestrator';
import type {
  StrictExplicitAssumptions,
  StrictFinancialPeriodType,
  StrictPipelineRequest,
} from '@/lib/data/financial-extraction/strict/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isPeriodType(value: unknown): value is StrictFinancialPeriodType {
  return value === 'annual' || value === 'quarterly' || value === 'ltm';
}

function parseRequest(body: any): StrictPipelineRequest {
  const ticker = normalizeNullableString(body?.ticker);
  const targetModelType = normalizeNullableString(body?.target_model_type);
  const periodType = body?.period_type;

  if (!ticker) {
    throw new Error('ticker is required');
  }
  if (!targetModelType) {
    throw new Error('target_model_type is required');
  }
  if (!isPeriodType(periodType)) {
    throw new Error('period_type must be annual, quarterly, or ltm');
  }

  const explicitAssumptionsBody = body?.explicit_assumptions && typeof body.explicit_assumptions === 'object'
    ? body.explicit_assumptions
    : {};
  const explicitAssumptions: StrictExplicitAssumptions = {
    wacc: normalizeNumber(explicitAssumptionsBody.wacc),
    terminal_growth: normalizeNumber(explicitAssumptionsBody.terminal_growth),
    tax_rate: normalizeNumber(explicitAssumptionsBody.tax_rate),
  };

  return {
    ticker: ticker.toUpperCase(),
    company_identifier: normalizeNullableString(body?.company_identifier),
    period_type: periodType,
    target_model_type: targetModelType,
    explicit_assumptions: explicitAssumptions,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseRequest(body);
    const result = await runStrictFinancialPipeline(parsed);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      status: 'FAILURE',
      step: 'SOURCE_FETCHER',
      reason: error instanceof Error ? error.message : 'Invalid strict pipeline request.',
      missing_fields: [],
      conflicts: [],
    });
  }
}

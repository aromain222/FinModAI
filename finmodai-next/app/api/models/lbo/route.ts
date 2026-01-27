import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { LboDealInputsSchema } from '@/lib/models/lbo/dealInputs';
import { runLboPipeline } from '@/lib/models/lbo/pipeline';
import { getLTMFinancials } from '@/lib/getLTMFinancials';
import type { ScaledFinancials } from '@/lib/financials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEV_BYPASS_USER_ID = '00000000-0000-0000-0000-000000000000';

const normalizeNullableString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return undefined;
  return trimmed;
};

const normalizeDealInputPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return payload;
  const company = payload.company && typeof payload.company === 'object' ? payload.company : {};
  return {
    ...payload,
    company: {
      ...company,
      name: normalizeNullableString(company.name),
      ticker: normalizeNullableString(company.ticker),
    },
  };
};

const parseJson = (value: any) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const resolveOperatingAssumptions = (assumptions: Record<string, any> | null) => {
  if (!assumptions) {
    return {};
  }
  const sliderOverrides = assumptions.sliderOverrides ?? {};
  const scenarioConfigBase = assumptions.scenarioConfig?.base ?? {};
  const scenarioInputsBase = assumptions.scenarioInputs?.base ?? {};

  const readPercent = (value: any): number | undefined => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return undefined;
    return num / 100;
  };

  return {
    revenueGrowth:
      sliderOverrides.revenueGrowth ??
      readPercent(scenarioInputsBase.revenueGrowthPct) ??
      readPercent(scenarioConfigBase.revenueGrowth),
    ebitdaMargin:
      sliderOverrides.ebitdaMargin ??
      readPercent(scenarioInputsBase.ebitdaMarginPct) ??
      readPercent(scenarioConfigBase.ebitdaMargin),
    taxRate:
      sliderOverrides.taxRate ??
      readPercent(assumptions.taxRate),
    capexPercent: sliderOverrides.capexPercent,
    daPercent: sliderOverrides.daPercent,
    nwcPercent: sliderOverrides.nwcPercent,
  };
};

const buildFieldErrors = (issues: Array<{ path: (string | number)[]; message: string }>) => {
  const fieldErrors: Record<string, string> = {};
  issues.forEach((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
    if (!fieldErrors[path]) {
      fieldErrors[path] = issue.message;
    }
  });
  return fieldErrors;
};

const allowedShape: Record<string, any> = {
  company: { name: true, ticker: true },
  entry: { ebitdaMultiple: true, offerPremiumPct: true },
  exit: { ebitdaMultiple: true, holdPeriodYears: true },
  leverage: { targetDebtToEbitda: true },
  debtPricing: { termLoanBRatePct: true, revolverRatePct: true },
  fees: { transactionFeePct: true, financingFeePct: true },
  liquidity: { minimumCashMm: true },
  advanced: {
    rolloverEquityPct: true,
    preferredEquity: { amountMm: true },
    subordinatedNotesMm: true,
    minimumCashAtCloseMm: true,
  },
};

const collectUnsupportedFields = (
  value: unknown,
  shape: Record<string, any>,
  prefix = ''
): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  Object.keys(value as Record<string, unknown>).forEach((key) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (!(key in shape)) {
      result.push(nextPath);
      return;
    }
    const shapeEntry = shape[key];
    if (shapeEntry && typeof shapeEntry === 'object') {
      const nested = (value as Record<string, unknown>)[key];
      result.push(...collectUnsupportedFields(nested, shapeEntry, nextPath));
    }
  });
  return result;
};

export async function POST(req: Request) {
  const traceId = randomUUID();

  try {
    const url = new URL(req.url);
    const modelId = url.searchParams.get('modelId')?.trim();
    if (!modelId) {
      return NextResponse.json(
        {
          error: 'INVALID_LBO_INPUTS',
          message: 'modelId query param is required.',
          fieldErrors: { modelId: 'modelId is required' },
          traceId,
        },
        { status: 400 }
      );
    }

    const supabase = supabaseRouteClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    const devBypass =
      process.env.NODE_ENV !== 'production' &&
      (process.env.BYPASS_AUTH === '1' || process.env.DEMO_BYPASS_AUTH === '1' || process.env.DEMO_MODE === '1');
    const userId = devBypass ? DEV_BYPASS_USER_ID : session?.user?.id;

    if (!userId || sessionError) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Authentication required.',
          traceId,
        },
        { status: 401 }
      );
    }

    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, user_id, ticker, model_type, assumptions')
      .eq('id', modelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (modelError) {
      return NextResponse.json(
        {
          error: 'DATABASE_ERROR',
          message: modelError.message,
          traceId,
        },
        { status: 500 }
      );
    }

    if (!model) {
      return NextResponse.json(
        {
          error: 'MODEL_NOT_FOUND',
          message: 'Model record not found. Create the model first.',
          traceId,
        },
        { status: 404 }
      );
    }

    if (model.model_type && model.model_type.toLowerCase() !== 'lbo') {
      return NextResponse.json(
        {
          error: 'INVALID_LBO_INPUTS',
          message: 'Model type is not LBO.',
          traceId,
        },
        { status: 400 }
      );
    }

    const rawBody = await req.json();
    const normalizedBody = normalizeDealInputPayload(rawBody);
    const unsupportedFields = collectUnsupportedFields(normalizedBody, allowedShape);
    if (unsupportedFields.length > 0) {
      return NextResponse.json(
        {
          error: 'UNSUPPORTED_LBO_FIELDS',
          message: 'These fields are not supported for LBO yet.',
          fields: unsupportedFields,
          traceId,
        },
        { status: 400 }
      );
    }

    const parseResult = LboDealInputsSchema.safeParse(normalizedBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'INVALID_LBO_INPUTS',
          message: 'LBO deal inputs are invalid.',
          fieldErrors: buildFieldErrors(parseResult.error.errors),
          traceId,
        },
        { status: 400 }
      );
    }

    const dealInputs = parseResult.data;
    if (!dealInputs.company?.name) {
      return NextResponse.json(
        {
          error: 'INVALID_LBO_INPUTS',
          message: 'Company name is required.',
          fieldErrors: { 'company.name': 'Company name is required' },
          traceId,
        },
        { status: 400 }
      );
    }

    const ltmFinancials = await getLTMFinancials(dealInputs.company.ticker);
    const normalizedFinancials: ScaledFinancials = {
      revenueM: ltmFinancials.revenue,
      ebitdaM: ltmFinancials.ebitda,
      ebitM: ltmFinancials.ebit,
      fcfM: ltmFinancials.netIncome,
      netDebtM: ltmFinancials.netDebt,
      sharesOutstandingM: ltmFinancials.sharesOutstanding,
      marketCapM: ltmFinancials.marketCap,
    };

    const modelAssumptions = parseJson(model.assumptions) as Record<string, any> | null;
    const operatingAssumptions = resolveOperatingAssumptions(modelAssumptions);

    const pipelineResult = await runLboPipeline(dealInputs, {
      traceId,
      modelId,
      normalizedFinancials,
      operatingAssumptions,
    });

    const downloadUrl = pipelineResult.artifact?.downloadUrl ?? null;
    const fileName = pipelineResult.artifact?.fileName ?? `${dealInputs.company.ticker}-lbo.xlsx`;
    const r2Key = pipelineResult.artifact?.provider === 'r2' ? pipelineResult.artifact.key : null;

    await supabase
      .from('models')
      .update({
        status: pipelineResult.status === 'success' ? 'ready' : 'partial',
        r2_key: r2Key,
        file_name: fileName,
        preview: pipelineResult.preview ? JSON.stringify(pipelineResult.preview) : null,
        results: {
          modelType: 'lbo',
          ticker: dealInputs.company.ticker,
          downloadUrl,
          download_url: downloadUrl,
          fileName,
          file_name: fileName,
          lboSummary: pipelineResult.lboSummary,
          lboOutput: pipelineResult.lboOutput,
          preview: pipelineResult.preview,
          warnings: pipelineResult.warnings ?? [],
          appliedDefaults: pipelineResult.appliedDefaults ?? [],
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', modelId)
      .eq('user_id', userId);

    return NextResponse.json({
      success: true,
      modelId,
      ticker: dealInputs.company.ticker,
      modelType: 'lbo',
      status: pipelineResult.status === 'success' ? 'ready' : 'partial',
      lboSummary: pipelineResult.lboSummary,
      lboOutput: pipelineResult.lboOutput,
      preview: pipelineResult.preview,
      downloadUrl,
      appliedDefaults: pipelineResult.appliedDefaults ?? [],
      warnings: pipelineResult.warnings ?? [],
      blocks: [],
      traceId,
    });
  } catch (error: any) {
    console.error('[lbo] Generation failed', { traceId, error });
    return NextResponse.json(
      {
        error: 'LBO_GENERATION_FAILED',
        message: error?.message || 'Failed to generate LBO model.',
        traceId,
      },
      { status: 500 }
    );
  }
}

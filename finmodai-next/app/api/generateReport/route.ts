// @ts-nocheck
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { randomUUID } from 'crypto';

import type { ReportContext, ReportModelType } from '@/lib/reportPrompts';
import { generateModelReport } from '@/lib/reportGenerator';
import { createReportPdf } from '@/lib/reportPdf';

export const runtime = 'nodejs';

const MODEL_TYPE_MAP: Record<string, ReportModelType> = {
  dcf: 'dcf',
  'reverse-dcf': 'reverse-dcf',
  lbo: 'lbo',
  comps: 'comps',
  'football-field': 'football-field',
  precedents: 'precedents',
  scorecard: 'scorecard',
  merger: 'merger',
  'ma-accretion-dilution': 'ma-accretion-dilution',
  operating: 'operating',
  'debt-capacity-lite': 'debt-capacity-lite',
  'three_statement': 'three-statement',
  'three-statement': 'three-statement',
  three_statement: 'three-statement',
  THREE_STATEMENT: 'three-statement',
  COMPS: 'comps',
  FOOTBALL_FIELD: 'football-field',
  MERGER: 'merger',
  PRECEDENTS: 'precedents',
  LBO: 'lbo',
  CAP_TABLE: 'cap-table',
  SAAS_OPERATING_MODEL: 'saas-operating-model',
  'cap-table': 'cap-table',
  'saas-operating-model': 'saas-operating-model',
  'dividend-discount-model': 'dividend-discount-model',
  'residual-income-model': 'residual-income-model',
  'debt-amortization-refi': 'debt-amortization-refi',
  'buyback-eps-accretion': 'buyback-eps-accretion',
  'purchase-price-allocation': 'purchase-price-allocation',
  'working-capital-schedule': 'working-capital-schedule',
  'ppe-depreciation-schedule': 'ppe-depreciation-schedule',
  'runway-burn': 'runway-burn',
  'vc-returns-irr': 'vc-returns-irr',
  'inventory-cogs': 'inventory-cogs',
  'revenue-recognition-asc606': 'revenue-recognition-asc606',
};

interface GenerateReportRequest {
  ticker?: string;
  companyName?: string;
  industry?: string;
  macro?: string;
  sector?: string;
  risks?: string;
  upside?: string;
  modelType?: string;
  modelRunId?: string;
  asOfDate?: string;
  modelData?: any;
  contextOverrides?: Partial<ReportContext>;
  reportInput?: Partial<ReportContext>;
}

export async function POST(req: Request) {
  try {
    const payload: GenerateReportRequest = await req.json();
    const ticker =
      payload.ticker?.trim().toUpperCase() ||
      payload.companyName?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_') ||
      'PRIVATE';
    const normalizedType = normalizeModelType(payload.modelType);

    if (!normalizedType) {
      return NextResponse.json({ error: 'modelType is required' }, { status: 400 });
    }

    const context = buildReportContext({
      payload,
      ticker,
      modelType: normalizedType,
    });

    const generatedReport = await generateModelReport(context);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await createReportPdf(generatedReport, {
        ticker,
        companyName: context.companyName,
        modelType: normalizedType,
        asOfDate: context.asOfDate,
      });
    } catch (err) {
      throw new Error(`Failed to render report PDF: ${(err as Error)?.message ?? 'unknown error'}`);
    }

    const pdfBase64 = pdfBuffer.toString('base64');

    let pdfUrl: string | null = null;
    let persistedId: string | null = null;
    let persistedCreatedAt: string | null = null;

    try {
      const supabase = createRouteHandlerClient({ cookies });
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const storagePath = buildStoragePath({
        userId: user?.id ?? 'anonymous',
        ticker,
        modelType: normalizedType,
      });

      const upload = await supabase.storage.from('reports').upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

      if (upload.error) {
        throw upload.error;
      }

      const { data: publicUrlData } = supabase.storage.from('reports').getPublicUrl(storagePath);
      pdfUrl = publicUrlData?.publicUrl ?? null;

      const insert = await supabase
        .from('model_reports')
        .insert({
          model_run_id: payload.modelRunId ?? null,
          ticker,
          model_type: normalizedType,
          title: generatedReport.title,
          summary_text: generatedReport.summaryText,
          pdf_url: pdfUrl,
        })
        .select('id, created_at')
        .single();

      persistedId = insert.data?.id ?? null;
      persistedCreatedAt = insert.data?.created_at ?? null;
    } catch (storageError) {
      console.error('[generateReport] Storage/persistence failure', {
        ticker,
        modelType: normalizedType,
        message: (storageError as Error)?.message,
      });
      // We still return the report so the user can download it even if persistence fails.
    }

    // Validate report before returning
    let isValid = false;
    if (generatedReport.reportPayload) {
      const { validateReportPayload, normalizeReportPayload } = await import('@/lib/reportTypes');
      if (validateReportPayload(generatedReport.reportPayload)) {
        isValid = true;
      } else {
        // Try to normalize and validate again
        const normalized = normalizeReportPayload(generatedReport.reportPayload);
        if (validateReportPayload(normalized)) {
          generatedReport.reportPayload = normalized;
          isValid = true;
        } else {
          console.error('[generateReport] Generated report failed validation after normalization', {
            ticker,
            modelType: normalizedType,
            sectionsCount: normalized.sections.length,
          });
          // Still return it, but mark as potentially invalid
        }
      }
    } else {
      // If no payload, check markdown has content
      isValid = generatedReport.markdownBody && generatedReport.markdownBody.trim().length > 0;
      if (!isValid) {
        console.error('[generateReport] Generated report has no content', {
          ticker,
          modelType: normalizedType,
        });
      }
    }

    // Block completion if validation fails
    if (!isValid && (!generatedReport.markdownBody || generatedReport.markdownBody.trim().length === 0)) {
      return NextResponse.json(
        { error: 'Report generation failed validation. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reportId: persistedId ?? randomUUID(),
      ticker,
      modelType: normalizedType,
      title: generatedReport.title,
      summaryText: generatedReport.summaryText,
      pdfUrl,
      pdfBase64,
      createdAt: persistedCreatedAt ?? new Date().toISOString(),
      reportText: generatedReport.markdownBody,
      reportPayload: generatedReport.reportPayload, // Include canonical structure
      insightCards: [],
    });
  } catch (error) {
    console.error('[GENERATE_REPORT_ERROR]', {
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
    });
    const message = error instanceof Error ? error.message : 'Failed to generate report';
    const status = /required|insufficient inputs/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function normalizeModelType(modelType?: string | null): ReportModelType | null {
  if (!modelType) return null;
  return MODEL_TYPE_MAP[modelType] ?? null;
}

function buildReportContext({
  payload,
  ticker,
  modelType,
}: {
  payload: GenerateReportRequest;
  ticker: string;
  modelType: ReportModelType;
}): ReportContext {
  const base: ReportContext = {
    ticker,
    companyName: payload.companyName,
    industry: payload.industry,
    modelType,
    asOfDate: payload.asOfDate ?? new Date().toISOString().slice(0, 10),
    keyOutputs: {},
    macro: payload.macro,
    sector: payload.sector,
    risks: payload.risks,
    upside: payload.upside,
    data: payload.modelData ?? {},
  };

  const derivedFromModel = deriveContextFromModelData(payload.modelData);
  const overrideSource = payload.contextOverrides ?? payload.reportInput;

  return mergeContexts(base, derivedFromModel, overrideSource);
}

function deriveContextFromModelData(modelData: any): Partial<ReportContext> {
  if (!modelData) return {};

  const dcfSummary = modelData.dcfSummary ?? modelData.scenarioSummaries?.base;
  const compsValuation = modelData.assumptions?.compsModel?.impliedValuation;
  const compsData = modelData.assumptions?.compsModel;
  const currentPrice = compsData?.metadata?.currentPrice;
  const scenarioSummaries = modelData.scenarioSummaries;
  const threeStatement = modelData.threeStatementSummary;

  const baseValue =
    dcfSummary?.valuationResults?.pricePerShare ?? compsValuation?.blendedValuePerShare ?? undefined;
  const bullValue =
    scenarioSummaries?.bull?.valuationResults?.pricePerShare ?? compsValuation?.bullValuePerShare ?? undefined;
  const bearValue =
    scenarioSummaries?.bear?.valuationResults?.pricePerShare ?? compsValuation?.bearValuePerShare ?? undefined;

  const leverageEntry = modelData.lboSummary?.debtSchedule?.[0]?.leverageMultiple;
  const revenueSeries = Array.isArray(threeStatement?.incomeStatement?.revenue) ? threeStatement.incomeStatement.revenue : [];
  const ebitdaSeries = Array.isArray(threeStatement?.incomeStatement?.ebitda) ? threeStatement.incomeStatement.ebitda : [];
  const endingCashSeries = Array.isArray(threeStatement?.cashFlow?.endingCash) ? threeStatement.cashFlow.endingCash : [];
  const debtSeries = Array.isArray(threeStatement?.balanceSheet?.debt) ? threeStatement.balanceSheet.debt : [];
  const revenueStart =
    revenueSeries.length && typeof revenueSeries[0] === 'number' ? revenueSeries[0] : undefined;
  const revenueEnd =
    revenueSeries.length && typeof revenueSeries[revenueSeries.length - 1] === 'number'
      ? revenueSeries[revenueSeries.length - 1]
      : undefined;
  const periods = revenueSeries.length;
  const revenueCagrPct =
    revenueStart && revenueEnd && revenueStart > 0 && periods > 1
      ? (Math.pow(revenueEnd / revenueStart, 1 / (periods - 1)) - 1) * 100
      : undefined;
  const endingCash =
    endingCashSeries.length && typeof endingCashSeries[endingCashSeries.length - 1] === 'number'
      ? endingCashSeries[endingCashSeries.length - 1]
      : undefined;
  const endingDebt =
    debtSeries.length && typeof debtSeries[debtSeries.length - 1] === 'number'
      ? debtSeries[debtSeries.length - 1]
      : undefined;
  const endingRevenue =
    revenueSeries.length && typeof revenueSeries[revenueSeries.length - 1] === 'number'
      ? revenueSeries[revenueSeries.length - 1]
      : undefined;
  const endingEbitda =
    ebitdaSeries.length && typeof ebitdaSeries[ebitdaSeries.length - 1] === 'number'
      ? ebitdaSeries[ebitdaSeries.length - 1]
      : undefined;
  const endingEbitdaMarginPct =
    endingRevenue && endingEbitda !== undefined && endingRevenue !== 0
      ? (endingEbitda / endingRevenue) * 100
      : undefined;

  const keyOutputs: ReportContext['keyOutputs'] = {
    baseValuePerShare: baseValue,
    bullValuePerShare: bullValue,
    bearValuePerShare: bearValue,
    impliedUpsidePct: computeUpside(baseValue, currentPrice),
    entryMultiple: modelData.lboSummary?.entry?.entryMultiple,
    exitMultiple: modelData.lboSummary?.exit?.exitMultiple,
    irr: modelData.lboSummary?.exit?.irr ? modelData.lboSummary.exit.irr * 100 : undefined,
    ltmMetrics: compsData?.ltm
      ? {
          revenue: compsData.ltm.revenue,
          ebitda: compsData.ltm.ebitda,
          ebitdaMarginPct: compsData.ltm.ebitdaMarginPct,
          fcfMarginPct: compsData.ltm.fcfMarginPct,
        }
      : undefined,
    threeStatement:
      revenueSeries.length > 0
        ? {
            revenueCagrPct,
            endingRevenue,
            endingEbitda,
            endingEbitdaMarginPct,
            endingCash,
            endingDebt,
          }
        : undefined,
  };

  const notes = [];
  if (leverageEntry) {
    notes.push(`Entry leverage approx. ${leverageEntry.toFixed(1)}x net debt / EBITDA.`);
  }
  if (modelData.assumptions?.scenarioNotes) {
    notes.push(modelData.assumptions.scenarioNotes);
  }

  return {
    companyName: threeStatement?.companyName ?? undefined,
    keyOutputs,
    scenarioContext: modelData.scenarioContext ?? undefined,
    highLevelNotes: notes.length ? notes.join(' ') : undefined,
    macro: modelData.macroContext ?? modelData.macro ?? undefined,
    sector: modelData.sectorContext ?? modelData.sector ?? undefined,
    risks: modelData.riskSummary ?? modelData.risks ?? undefined,
    upside: modelData.upsideSummary ?? modelData.upside ?? undefined,
    industry: modelData.industryDescription ?? compsData?.metadata?.industry ?? undefined,
  };
}

function mergeContexts(base: ReportContext, ...partials: Array<Partial<ReportContext> | undefined>): ReportContext {
  return partials.reduce((acc, partial) => {
    if (!partial) return acc;
    if (partial.companyName) acc.companyName = partial.companyName;
    if (partial.industry) acc.industry = partial.industry;
    if (partial.asOfDate) acc.asOfDate = partial.asOfDate;
    if (partial.macro) acc.macro = partial.macro;
    if (partial.sector) acc.sector = partial.sector;
    if (partial.risks) acc.risks = partial.risks;
    if (partial.upside) acc.upside = partial.upside;
    if (partial.scenarioContext) acc.scenarioContext = partial.scenarioContext;
    if (partial.highLevelNotes) {
      acc.highLevelNotes = acc.highLevelNotes
        ? `${acc.highLevelNotes}\n${partial.highLevelNotes}`
        : partial.highLevelNotes;
    }
    acc.keyOutputs = {
      ...acc.keyOutputs,
      ...(partial.keyOutputs ?? {}),
    };
    return acc;
  }, base);
}

function computeUpside(target?: number, current?: number): number | undefined {
  if (target === undefined || current === undefined || current === 0) return undefined;
  return ((target - current) / current) * 100;
}

function buildStoragePath({
  userId,
  ticker,
  modelType,
}: {
  userId: string;
  ticker: string;
  modelType: ReportModelType;
}): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${userId}/${ticker}/${modelType}-${timestamp}.pdf`;
}

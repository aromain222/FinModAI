import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createRun, findRunByHash, updateRun } from '@/lib/modelRunStore';
import { isObjectStoreConfigured, objectExists, uploadBufferAndSign } from '@/lib/storage/objectStore';
import { POST as generateModelPost } from '@/app/api/generateModel/route';
import { isDemoMode, isDemoModeFromRequest } from '@/lib/demo/isDemoMode';
import { runWithDemoMode } from '@/lib/demo/demoContext';
import { isDemoTickerAvailable } from '@/lib/data/providers/demoProvider';
import { fromManual, fromTicker, manualPayloadFromRequest } from '@/lib/modelInputs/adapters';
import type { ModelInputs } from '@/types/modelInputs';
import { normalizeModelInputs } from '@/lib/modelInputs/defensive';
import { runModel } from '@/src/core/engine/runModel';
import { buildExcelFromModelOutputs } from '@/src/core/export/excel';
import { compareScenarios } from '@/src/core/engine/compare';
import type { Scenario } from '@/src/core/engine/scenario';
import { runSensitivity } from '@/src/core/engine/sensitivity';
import { buildDocumentFromPreview } from '@/lib/models/schema/fromPreview';

type GeneratedPayload = {
  preview?: unknown;
  modelDocument?: unknown;
  dcfSummary?: unknown;
  lboSummary?: unknown;
  debtCapacityLite?: unknown;
  scorecardSummary?: unknown;
  assumptions?: unknown;
  diagnostics?: unknown;
  warnings?: unknown;
  appliedDefaults?: unknown;
  coreModelOutputs?: unknown;
  coreInputs?: unknown;
  liveDataFallback?: boolean;
  scenarioComparison?: unknown;
  scenarioSummaries?: unknown;
};

const SUPPORTED_MODEL_TYPES = new Set([
  'dcf',
  'reverse-dcf',
  'debt-capacity-lite',
  'three-statement',
  'lbo',
  'comps',
  'scorecard',
]);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
  return `{${entries.join(',')}}`;
}

function hashInputs(payload: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function parseDataUriToBuffer(dataUri: string): Buffer {
  const base64Part = dataUri.split(',')[1] || '';
  return Buffer.from(base64Part, 'base64');
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  stage: 'validate' | 'generate' | 'upload' | 'unknown'
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      stage,
      status: 'failed',
      state: 'failed',
    },
    { status }
  );
}

function isPrivateManualMode(body: any): boolean {
  if (!body || typeof body !== 'object') return false;
  const requestedDataSource = String(body.dataSource || body.source || '').toLowerCase();
  if (requestedDataSource === 'manual') return true;
  const companyMode = String(body.companyMode || body.mode || '').toLowerCase();
  if (companyMode === 'private') return true;
  if (body.manualMode === true) return true;
  const manualInputs = body.manualInputs;
  if (manualInputs && typeof manualInputs === 'object') {
    const hasRevenue =
      typeof manualInputs.revenue === 'number' &&
      Number.isFinite(manualInputs.revenue) &&
      manualInputs.revenue > 0;
    const hasCompanyName = typeof body.companyName === 'string' && body.companyName.trim().length > 0;
    return hasRevenue || hasCompanyName;
  }
  return false;
}

function buildCorePreview(outputs: any) {
  const years = Array.isArray(outputs?.statements?.projectionYears)
    ? outputs.statements.projectionYears
    : [];
  const revenue = Array.isArray(outputs?.statements?.revenue) ? outputs.statements.revenue : [];
  const ebit = Array.isArray(outputs?.statements?.ebit) ? outputs.statements.ebit : [];
  const fcf = Array.isArray(outputs?.statements?.fcf) ? outputs.statements.fcf : [];
  return {
    sheetName: 'DCF Summary',
    columns: ['Metric', ...years.map((year: number) => String(year))],
    rows: [
      ['Revenue', ...revenue],
      ['EBIT', ...ebit],
      ['FCF', ...fcf],
      [],
      ['Enterprise Value', outputs?.summary?.enterpriseValue ?? null],
      ['Equity Value', outputs?.summary?.equityValue ?? null],
      ['Implied Share Price', outputs?.summary?.impliedSharePrice ?? null],
    ],
  };
}

const asFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
};

const toDecimalPercent = (value: unknown): number | undefined => {
  const numeric = asFiniteNumber(value);
  if (numeric === undefined) return undefined;
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
};

const buildScenarioOverride = (raw: any): Scenario['assumptionsOverride'] => {
  if (!raw || typeof raw !== 'object') return undefined;
  const mapped: Record<string, number> = {};

  const growth = toDecimalPercent(raw?.revenueGrowthPct);
  const margins = toDecimalPercent(raw?.ebitdaMarginPct);
  const daPct = toDecimalPercent(raw?.daPctRevenuePct);
  const wacc = toDecimalPercent(raw?.waccPct);
  const terminalGrowth = toDecimalPercent(raw?.terminalGrowthPct);
  const nwcPct = toDecimalPercent(raw?.deltaNwcPct);
  const capexPct = toDecimalPercent(raw?.capexPctRevenuePct);
  const taxRate = toDecimalPercent(raw?.taxRatePct);

  if (growth !== undefined) mapped.growth = growth;
  if (margins !== undefined) mapped.margins = margins;
  if (daPct !== undefined) mapped.daPct = daPct;
  if (wacc !== undefined) mapped.wacc = wacc;
  if (terminalGrowth !== undefined) mapped.terminalGrowth = terminalGrowth;
  if (nwcPct !== undefined) mapped.nwcPct = nwcPct;
  if (capexPct !== undefined) mapped.capexPct = capexPct;
  if (taxRate !== undefined) mapped.taxRate = taxRate;

  return Object.keys(mapped).length > 0 ? mapped : undefined;
};

const buildCenteredRange = (
  base: number,
  range: number,
  step: number,
  min: number,
  max: number
): number[] => {
  const safeRange = Math.max(0, range);
  const safeStep = Math.max(step, 0.0001);
  const start = Math.max(min, base - safeRange);
  const end = Math.min(max, base + safeRange);
  const values: number[] = [];
  for (let current = start; current <= end + 1e-9; current += safeStep) {
    values.push(Number(current.toFixed(6)));
    if (values.length > 101) break;
  }
  if (values.length === 0) {
    values.push(Number(base.toFixed(6)));
  }
  if (!values.includes(Number(base.toFixed(6)))) {
    values.push(Number(base.toFixed(6)));
    values.sort((a, b) => a - b);
  }
  return values;
};

export async function generateRunForModelType({
  req,
  modelTypeRaw,
  body,
}: {
  req: NextRequest;
  modelTypeRaw: string;
  body: any;
}) {
  const demoEnabled = isDemoModeFromRequest(req) || isDemoMode();
  if (!demoEnabled) {
    return errorResponse(400, 'demo_mode_required', 'Demo mode is required for model generation.', 'validate');
  }

  return runWithDemoMode(true, async () => {
    try {
  const modelType = String(modelTypeRaw || '').toLowerCase();
  if (!SUPPORTED_MODEL_TYPES.has(modelType)) {
    return errorResponse(400, 'unsupported_model_type', `Unsupported model type: ${modelType}`, 'validate');
  }

  const isPrivateMode = isPrivateManualMode(body);
  const privateCompanyName =
    typeof body?.companyName === 'string' ? body.companyName.trim() : '';
  const privateTickerFallback = privateCompanyName
    ? privateCompanyName.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'PRIVATE'
    : 'PRIVATE';
  const ticker = String(body?.ticker || (isPrivateMode ? privateTickerFallback : '')).trim().toUpperCase();
  const asOfDate = String(body?.asOfDate || new Date().toISOString().slice(0, 10));
  let modelInputs: ModelInputs | null = null;

  if (!ticker && !isPrivateMode) {
    return NextResponse.json(
      {
        ok: true,
        status: 'assumptions_required',
        state: 'assumptions_required',
        missingInputs: ['ticker'],
        message: 'Ticker is required.',
      },
      { status: 200 }
    );
  }

  if (isDemoMode() && !isPrivateMode) {
    const demoAllowed = await isDemoTickerAvailable(ticker);
    if (!demoAllowed) {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        state: 'failed',
        code: 'DEMO_NOT_FOUND',
        message: 'This demo ticker is not in the curated demo set. Choose a demo company.',
      },
      { status: 400 }
    );
    }
  }

  try {
    const rawInputs = isPrivateMode
      ? fromManual(manualPayloadFromRequest({ ...body, ticker }) as any)
      : await fromTicker(ticker);
    const normalized = normalizeModelInputs(rawInputs, { modelType });
    if (!normalized.ok || !normalized.value) {
      return errorResponse(
        400,
        'model_inputs_invalid',
        normalized.issues.map((issue) => issue.message).join(' ') || 'Model inputs are invalid.',
        'validate'
      );
    }
    modelInputs = normalized.value;
  } catch (normalizationError: any) {
    return errorResponse(
      400,
      isPrivateMode ? 'manual_inputs_invalid' : 'ticker_inputs_invalid',
      normalizationError?.message ||
        (isPrivateMode
          ? 'Manual inputs are incomplete or invalid.'
          : `Unable to normalize ticker inputs for ${ticker}.`),
      'validate'
    );
  }

  const payloadForHash = {
    modelType,
    ticker,
    asOfDate,
    inputs: body,
    modelInputs,
  };
  const inputsHash = hashInputs(payloadForHash);

  const existing = findRunByHash(inputsHash);
  if (existing?.status === 'generated' && (existing.storageKey || existing.dataUrl)) {
    const generatedResult = (existing.result || {}) as GeneratedPayload;
    return NextResponse.json({
      ok: true,
      status: 'generated',
      state: 'generated',
      runId: existing.id,
      storageKey: existing.storageKey,
      downloadUrl: null,
      ...generatedResult,
    });
  }
  if (existing?.status === 'generating') {
    return NextResponse.json({ ok: true, status: 'generating', state: 'generating', runId: existing.id });
  }

  const run = createRun({
    userId: null,
    modelType,
    ticker,
    asOfDate,
    inputsHash,
    status: 'generating',
  });
  console.log('[model-run] status transition', { runId: run.id, from: 'new', to: 'generating', ticker, modelType });

  try {
    if (modelType === 'dcf') {
      const dataSourceId = isPrivateMode ? 'manual' : 'ticker';
      const coreParams = isPrivateMode
        ? {
            formData: {
              ...(body?.manualInputs && typeof body.manualInputs === 'object' ? body.manualInputs : {}),
              companyName: body?.companyName,
              currency: body?.currency,
              ticker,
            },
            asOfDate,
          }
        : {
            ticker,
            asOfDate,
          };

      const scenarioInputs = body?.scenarioInputs && typeof body.scenarioInputs === 'object' ? body.scenarioInputs : {};
      const includeScenarioComparison = body?.includeScenarios === true;
      const baseOverride = buildScenarioOverride((scenarioInputs as any)?.base);
      const baseScenario: Scenario | undefined = baseOverride
        ? {
            id: 'base',
            name: 'Base',
            assumptionsOverride: baseOverride,
            createdAt: new Date().toISOString(),
          }
        : undefined;

      const baseResult = await runModel({
        templateId: 'dcf',
        dataSourceId: dataSourceId as 'ticker' | 'manual',
        params: coreParams as any,
        options: { asOfDate, scenarioId: baseScenario?.id },
        scenario: baseScenario,
      });

      if (!baseResult.ok || !baseResult.outputs || !baseResult.inputs) {
        const issueMessage =
          baseResult.issues.find((entry) => entry.severity === 'error')?.message ||
          'Core engine failed to generate DCF output.';
        updateRun(run.id, {
          status: 'failed',
          errorMessage: issueMessage,
        });
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'core_engine_failed',
            message: issueMessage,
            issues: baseResult.issues,
          },
          { status: 400 }
        );
      }

      const scenarioOutputs: Array<{
        scenarioId: string;
        scenarioName: string;
        outputs: (typeof baseResult.outputs);
      }> = [
        {
          scenarioId: baseScenario?.id || 'base',
          scenarioName: baseScenario?.name || 'Base',
          outputs: baseResult.outputs,
        },
      ];

      const runOptionalScenario = async (scenarioId: string, scenarioName: string, rawScenario: any) => {
        const assumptionsOverride = buildScenarioOverride(rawScenario);
        if (!assumptionsOverride) return;
        const scenario: Scenario = {
          id: scenarioId,
          name: scenarioName,
          assumptionsOverride,
          createdAt: new Date().toISOString(),
        };
        const scenarioResult = await runModel({
          templateId: 'dcf',
          dataSourceId: dataSourceId as 'ticker' | 'manual',
          params: coreParams as any,
          options: { asOfDate, scenarioId: scenario.id },
          scenario,
        });
        if (!scenarioResult.ok || !scenarioResult.outputs) {
          const scenarioFailure =
            scenarioResult.issues.find((entry) => entry.severity === 'error')?.message ||
            `Failed to run ${scenarioName} scenario.`;
          console.warn('[model-run] scenario failed', { runId: run.id, scenarioId, message: scenarioFailure });
          return;
        }
        scenarioOutputs.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          outputs: scenarioResult.outputs,
        });
      };

      if (includeScenarioComparison) {
        await runOptionalScenario('bull', 'Bull', (scenarioInputs as any)?.bull);
        await runOptionalScenario('bear', 'Bear', (scenarioInputs as any)?.bear);
      }

      const scenarioComparison = compareScenarios(scenarioOutputs as any);

      const requestedDcfSensitivity =
        body?.sensitivity?.dcf && typeof body.sensitivity.dcf === 'object'
          ? body.sensitivity.dcf
          : {};
      const baseWacc = asFiniteNumber(baseResult.outputs.summary.wacc) ?? 0.1;
      const baseTerminalGrowth = asFiniteNumber(baseResult.inputs.assumptions.terminalGrowth) ?? 0.025;
      const waccRange = toDecimalPercent(requestedDcfSensitivity?.waccRangePct) ?? 0.02;
      const waccStep = toDecimalPercent(requestedDcfSensitivity?.waccStepPct) ?? 0.005;
      const terminalGrowthRange = toDecimalPercent(requestedDcfSensitivity?.terminalGrowthRangePct) ?? 0.01;
      const terminalGrowthStep = toDecimalPercent(requestedDcfSensitivity?.terminalGrowthStepPct) ?? 0.0025;
      const waccAxis = buildCenteredRange(baseWacc, waccRange, waccStep, 0.04, 0.3);
      const terminalGrowthAxis = buildCenteredRange(baseTerminalGrowth, terminalGrowthRange, terminalGrowthStep, -0.02, 0.08);

      const sensitivityResult = await runSensitivity({
        templateId: 'dcf',
        dataSourceId: dataSourceId as 'ticker' | 'manual',
        baseParams: coreParams as any,
        variableA: 'terminalGrowth',
        rangeA: terminalGrowthAxis,
        variableB: 'wacc',
        rangeB: waccAxis,
        scenario: baseScenario,
        maxIterations: 225,
        metric: 'impliedSharePrice',
      });

      const sensitivityWarnings = sensitivityResult.warnings || [];
      if (!sensitivityResult.ok) {
        const sensitivityIssue = sensitivityResult.issues.find((entry) => entry.severity === 'error');
        if (sensitivityIssue) {
          sensitivityWarnings.push(`Sensitivity fallback: ${sensitivityIssue.message}`);
        }
      }

      const dcfSensitivity = {
        base: {
          wacc: baseWacc,
          terminalGrowth: baseTerminalGrowth,
          pricePerShare: asFiniteNumber(baseResult.outputs.summary.impliedSharePrice) ?? null,
        },
        rows: sensitivityResult.yAxis || waccAxis,
        cols: sensitivityResult.xAxis || terminalGrowthAxis,
        values: (sensitivityResult.grid || []).map((row) =>
          row.map((cell) => (Number.isFinite(cell) ? Number(cell) : null))
        ),
        config: {
          waccRangePct: Number((waccRange * 100).toFixed(4)),
          waccStepPct: Number((waccStep * 100).toFixed(4)),
          terminalGrowthRangePct: Number((terminalGrowthRange * 100).toFixed(4)),
          terminalGrowthStepPct: Number((terminalGrowthStep * 100).toFixed(4)),
        },
      };

      const workbookBuffer = await buildExcelFromModelOutputs({
        templateId: 'dcf',
        modelOutputs: baseResult.outputs,
        companyName: baseResult.inputs.company.name,
      });

      const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbookBuffer.toString('base64')}`;
      let storageKey: string | undefined;
      let dataUrl: string | undefined;

      if (isObjectStoreConfigured()) {
        storageKey = `models/${run.id}.xlsx`;
        await uploadBufferAndSign({
          key: storageKey,
          buffer: workbookBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          expiresInSeconds: 900,
        });

        const exists = await objectExists(storageKey);
        console.log('[model-run] upload confirmation', { runId: run.id, storageKey, exists });
        if (!exists) {
          updateRun(run.id, { status: 'failed', errorMessage: 'Workbook upload verification failed' });
          return errorResponse(500, 'upload_verification_failed', 'Workbook upload verification failed', 'upload');
        }
      } else {
        dataUrl = dataUri;
      }

      const preview = buildCorePreview(baseResult.outputs);
      const modelDocument = buildDocumentFromPreview(preview, {
        ticker: baseResult.inputs.company.ticker || ticker || 'PRIVATE',
        modelType: 'dcf',
        asOfDate,
        currency: baseResult.inputs.company.currency || 'USD',
        units: 'millions',
      });

      const scenarioSummaries = scenarioOutputs.reduce<Record<string, any>>((acc, entry) => {
        acc[entry.scenarioId] = {
          name: entry.scenarioName,
          valuationResults: {
            enterpriseValue: entry.outputs.summary.enterpriseValue,
            equityValue: entry.outputs.summary.equityValue ?? null,
            pricePerShare: entry.outputs.summary.impliedSharePrice ?? null,
          },
        };
        return acc;
      }, {});

      const generatedResult: GeneratedPayload = {
        preview,
        modelDocument,
        dcfSummary: {
          valuationResults: {
            enterpriseValue: baseResult.outputs.summary.enterpriseValue,
            equityValue: baseResult.outputs.summary.equityValue ?? null,
            pricePerShare: baseResult.outputs.summary.impliedSharePrice ?? null,
          },
          results: {
            enterpriseValue: baseResult.outputs.summary.enterpriseValue,
            equityValue: baseResult.outputs.summary.equityValue ?? null,
            pricePerShare: baseResult.outputs.summary.impliedSharePrice ?? null,
          },
          inputs: baseResult.inputs,
          sensitivity: dcfSensitivity,
          scenarioComparison,
        },
        assumptions: baseResult.outputs.audit.assumptionsUsed,
        diagnostics: [],
        warnings: [
          ...baseResult.warnings,
          ...baseResult.issues
            .filter((entry) => entry.severity === 'warning')
            .map((entry) => entry.message),
          ...sensitivityWarnings,
        ],
        appliedDefaults: [],
        coreModelOutputs: baseResult.outputs,
        coreInputs: baseResult.inputs,
        liveDataFallback: baseResult.inputs.metadata?.liveDataFallback === true,
        scenarioComparison,
        scenarioSummaries,
      };

      updateRun(run.id, {
        status: 'generated',
        storageKey,
        dataUrl,
        fileSize: workbookBuffer.length,
        result: generatedResult as Record<string, unknown>,
      });
      console.log('[model-run] status transition', {
        runId: run.id,
        from: 'generating',
        to: 'generated',
        storageKey: storageKey || null,
        engine: 'core',
      });

      return NextResponse.json({
        ok: true,
        status: 'generated',
        state: 'generated',
        runId: run.id,
        storageKey,
        downloadUrl: null,
        ...generatedResult,
      });
    }

    const internalReq = new NextRequest(`${req.nextUrl.origin}/api/generateModel?format=json`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-capitalbase-inline-download': '1',
      },
      body: JSON.stringify({
        ...body,
        ticker,
        modelType,
        modelInputs,
      }),
    });

    const generationResponse = await generateModelPost(internalReq);
    const generationJson = await generationResponse.json();

    if (!generationResponse.ok) {
      updateRun(run.id, {
        status: 'failed',
        errorMessage: generationJson?.message || generationJson?.error || 'generateModel failed',
      });
      return errorResponse(
        generationResponse.status,
        generationJson?.code || 'generate_model_failed',
        generationJson?.message || generationJson?.error || 'Model generation failed',
        'generate'
      );
    }

    if (generationJson?.state === 'assumptions_required') {
      updateRun(run.id, {
        status: 'assumptions_required',
        result: {
          missingInputs: generationJson?.missing || [],
          requiredInputs: generationJson?.requiredInputs || [],
          estimatedInputs: generationJson?.estimated || [],
        },
      });
      console.log('[model-run] status transition', { runId: run.id, from: 'generating', to: 'assumptions_required' });
      return NextResponse.json({
        ok: true,
        status: 'assumptions_required',
        state: 'assumptions_required',
        runId: run.id,
        missingInputs: generationJson?.missing || [],
        requiredInputs: generationJson?.requiredInputs || [],
        estimatedInputs: generationJson?.estimated || [],
        message: generationJson?.message || 'Required assumptions are missing.',
      });
    }

    const dataUri = generationJson?.downloadUrl;
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
      updateRun(run.id, { status: 'failed', errorMessage: 'Missing inline workbook data in generation response' });
      return errorResponse(500, 'missing_download_data', 'Generation response did not include workbook data', 'generate');
    }

    const workbookBuffer = parseDataUriToBuffer(dataUri);
    let storageKey: string | undefined;
    let dataUrl: string | undefined;

    if (isObjectStoreConfigured()) {
      storageKey = `models/${run.id}.xlsx`;
      await uploadBufferAndSign({
        key: storageKey,
        buffer: workbookBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        expiresInSeconds: 900,
      });

      const exists = await objectExists(storageKey);
      console.log('[model-run] upload confirmation', { runId: run.id, storageKey, exists });
      if (!exists) {
        updateRun(run.id, { status: 'failed', errorMessage: 'Workbook upload verification failed' });
        return errorResponse(500, 'upload_verification_failed', 'Workbook upload verification failed', 'upload');
      }
    } else {
      dataUrl = dataUri;
    }

    const generatedResult: GeneratedPayload = {
      preview: generationJson?.preview,
      modelDocument: generationJson?.modelDocument,
      dcfSummary: generationJson?.dcfSummary,
      lboSummary: generationJson?.lboSummary,
      debtCapacityLite: generationJson?.debtCapacityLite,
      scorecardSummary: generationJson?.scorecardSummary,
      assumptions: generationJson?.assumptions,
      diagnostics: generationJson?.diagnostics,
      warnings: generationJson?.warnings,
      appliedDefaults: generationJson?.appliedDefaults,
    };

    updateRun(run.id, {
      status: 'generated',
      storageKey,
      dataUrl,
      fileSize: workbookBuffer.length,
      result: generatedResult as Record<string, unknown>,
    });
    console.log('[model-run] status transition', {
      runId: run.id,
      from: 'generating',
      to: 'generated',
      storageKey: storageKey || null,
    });

    return NextResponse.json({
      ok: true,
      status: 'generated',
      state: 'generated',
      runId: run.id,
      storageKey,
      downloadUrl: null,
      ...generatedResult,
    });
  } catch (error: any) {
    updateRun(run.id, {
      status: 'failed',
      errorMessage: error?.message || 'Generation failed',
    });
    console.log('[model-run] status transition', {
      runId: run.id,
      from: 'generating',
      to: 'failed',
      error: error?.message || 'Generation failed',
    });
    return errorResponse(500, 'run_generation_failed', error?.message || 'Failed to generate model run', 'unknown');
  }
    } catch (error: any) {
      console.error('[model-run] unhandled error', error);
      return errorResponse(500, 'run_unhandled_error', error?.message || 'Unexpected error', 'unknown');
    }
  });
}

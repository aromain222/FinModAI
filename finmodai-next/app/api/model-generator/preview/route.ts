import { NextRequest, NextResponse } from 'next/server';
import { detectCoreTemplatePrompt } from '@/lib/analyst/coreModelTemplates';
import { classifyPrompt, type ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import { getClarificationDecision } from '@/lib/model-generator/clarify';
import { extractInputs, type ExtractedModelInputs } from '@/lib/model-generator/extractInputs';
import { getLatestComparableRun } from '@/lib/model-generator/runHistory';
import * as dcfTemplate from '@/lib/model-generator/templates/dcf';
import * as threeStatementTemplate from '@/lib/model-generator/templates/threeStatement';
import * as capTableTemplate from '@/lib/model-generator/templates/capTable';
import * as saasOperatingTemplate from '@/lib/model-generator/templates/saasOperating';
import * as compsTemplate from '@/lib/model-generator/templates/comps';
import * as precedentsTemplate from '@/lib/model-generator/templates/precedents';
import * as lboTemplate from '@/lib/model-generator/templates/lbo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PreviewBuilder = {
  getPreview: (inputs: ExtractedModelInputs) => { title: string; tabs: string[] };
};

const TEMPLATE_MAP: Record<ModelGeneratorType, PreviewBuilder> = {
  DCF: dcfTemplate as PreviewBuilder,
  THREE_STATEMENT: threeStatementTemplate as PreviewBuilder,
  CAP_TABLE: capTableTemplate as PreviewBuilder,
  SAAS_OPERATING_MODEL: saasOperatingTemplate as PreviewBuilder,
  COMPS: compsTemplate as PreviewBuilder,
  PRECEDENTS: precedentsTemplate as PreviewBuilder,
  LBO: lboTemplate as PreviewBuilder,
};

const KEY_OUTPUTS: Record<ModelGeneratorType, string[]> = {
  DCF: ['Enterprise Value', 'Equity Value', 'Implied Share Price', 'Sensitivity Table'],
  THREE_STATEMENT: ['Revenue CAGR', 'EBITDA Margin', 'Ending Cash', 'Debt Balance'],
  CAP_TABLE: ['Post-Money Valuation', 'Founder Dilution', 'New Investor Ownership', 'Option Pool Impact'],
  SAAS_OPERATING_MODEL: ['ARR Growth', 'Gross Margin', 'CAC Payback', 'LTV:CAC'],
  COMPS: ['Peer Trading Multiples', 'Implied Valuation Range', 'Premium / Discount View', 'Peer Set Summary'],
  PRECEDENTS: ['Transaction Multiples', 'Control Premium', 'Implied Valuation Range', 'Pitch Summary'],
  LBO: ['MOIC', 'IRR', 'Exit Equity Value', 'Debt Paydown'],
};

function buildUnsupportedResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      modelType: null,
      extractedInputs: {},
      missingInputs: [],
      defaultsUsed: {},
      provenanceSummary: null,
      comparisonSummary: null,
      supported: false,
      needsClarification: false,
      previewSummary: null,
      recentRun: null,
      message,
    },
    { status }
  );
}

function buildCoreTemplateResponse(prompt: string) {
  const payload = detectCoreTemplatePrompt(prompt);
  if (!payload) return null;

  return NextResponse.json({
    modelType: null,
    extractedInputs: {},
    missingInputs: [],
    defaultsUsed: {},
    provenanceSummary: null,
    comparisonSummary: null,
    supported: true,
    needsClarification: false,
    previewSummary: null,
    recentRun: null,
    handoffOnly: true,
    coreTemplateModel: payload,
    message:
      payload.surface === 'template_library'
        ? 'This model already exists in CapitalBase as a deterministic finance-native template. Open the model wizard to set assumptions and download the workbook.'
        : 'This workflow already exists in CapitalBase as a dedicated model builder. Open the builder to configure assumptions and export the workbook through the correct engine.',
  });
}

function extractComparableAssumptions(inputs: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(['modelType', 'source', 'companyName', 'ticker', 'companyType']);
  return Object.fromEntries(Object.entries(inputs).filter(([key]) => !skip.has(key)));
}

function computeChangedKeys(previous: Record<string, unknown>, current: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return Array.from(keys).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const clarificationAnswer = typeof body?.clarificationAnswer === 'string' ? body.clarificationAnswer.trim() : '';
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    const inputOverrides =
      body?.inputOverrides && typeof body.inputOverrides === 'object' && !Array.isArray(body.inputOverrides)
        ? (body.inputOverrides as Record<string, unknown>)
        : undefined;

    if (!prompt) {
      return buildUnsupportedResponse('Prompt is required.');
    }

    const modelType = classifyPrompt(prompt);
    if (!modelType) {
      const coreTemplateResponse = buildCoreTemplateResponse(prompt);
      if (coreTemplateResponse) {
        return coreTemplateResponse;
      }
      return buildUnsupportedResponse(
        'Unsupported prompt. Direct prompt generation currently supports DCF, three-statement, cap table, SaaS operating, comps, precedents, and LBO. Broader finance-native models should route into their dedicated CapitalBase workflows.'
      );
    }

    const extraction = await extractInputs(prompt, modelType, { clarificationAnswer, inputOverrides });
    const clarification = getClarificationDecision(modelType, extraction.missingCriticalInputs);
    const templatePreview = TEMPLATE_MAP[modelType].getPreview(extraction.extractedInputs);
    const latestRun = await getLatestComparableRun({
      surface: 'model_generator',
      sessionId: sessionId || null,
      modelType,
      companyName: 'companyName' in extraction.extractedInputs ? extraction.extractedInputs.companyName : null,
      ticker: 'ticker' in extraction.extractedInputs ? extraction.extractedInputs.ticker ?? null : null,
    });
    const currentAssumptions = extractComparableAssumptions(extraction.extractedInputs as Record<string, unknown>);
    const comparisonSummary =
      latestRun?.latestVersion
        ? {
            previousVersionNumber: latestRun.latestVersion.versionNumber,
            currentVersionNumber: latestRun.latestVersion.versionNumber + 1,
            changedKeys: computeChangedKeys(latestRun.latestVersion.assumptions, currentAssumptions),
          }
        : null;

    return NextResponse.json({
      modelType,
      extractedInputs: extraction.extractedInputs,
      missingInputs: extraction.missingInputs,
      defaultsUsed: extraction.defaultsUsed,
      provenanceSummary: extraction.provenanceSummary,
      comparisonSummary,
      supported: true,
      needsClarification: clarification.needsClarification,
      clarificationQuestion: clarification.clarificationQuestion,
      previewSummary: {
        modelName: templatePreview.title,
        tabs: templatePreview.tabs,
        keyOutputs: KEY_OUTPUTS[modelType],
      },
      recentRun: latestRun
        ? {
            runId: latestRun.id,
            status: latestRun.status,
            createdAt: latestRun.createdAt,
            versionNumber: latestRun.latestVersion?.versionNumber ?? null,
          }
        : null,
    });
  } catch (error) {
    return buildUnsupportedResponse(error instanceof Error ? error.message : 'Unable to preview model.', 500);
  }
}

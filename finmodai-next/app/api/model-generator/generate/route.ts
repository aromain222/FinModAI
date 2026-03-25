import { NextRequest, NextResponse } from 'next/server';
import { classifyPrompt, type ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import { getClarificationDecision } from '@/lib/model-generator/clarify';
import {
  type CompsModelInputs,
  extractInputs,
  type CapTableModelInputs,
  type DcfModelInputs,
  type FootballFieldModelInputs,
  type LboModelInputs,
  type PrecedentsModelInputs,
  type SaasOperatingModelInputs,
  type ThreeStatementModelInputs,
} from '@/lib/model-generator/extractInputs';
import { savePromptModelRunVersion } from '@/lib/model-generator/runHistory';
import * as dcfTemplate from '@/lib/model-generator/templates/dcf';
import * as threeStatementTemplate from '@/lib/model-generator/templates/threeStatement';
import * as capTableTemplate from '@/lib/model-generator/templates/capTable';
import * as saasOperatingTemplate from '@/lib/model-generator/templates/saasOperating';
import * as compsTemplate from '@/lib/model-generator/templates/comps';
import * as footballFieldTemplate from '@/lib/model-generator/templates/footballField';
import * as precedentsTemplate from '@/lib/model-generator/templates/precedents';
import * as lboTemplate from '@/lib/model-generator/templates/lbo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type WorkbookBuilder = {
  buildWorkbook: (
    inputs:
      | DcfModelInputs
      | ThreeStatementModelInputs
      | CapTableModelInputs
      | SaasOperatingModelInputs
      | CompsModelInputs
      | FootballFieldModelInputs
      | PrecedentsModelInputs
      | LboModelInputs
  ) => Promise<{
    xlsx: { writeBuffer: () => Promise<Buffer | Uint8Array | ArrayBuffer> };
  }>;
};

const TEMPLATE_MAP: Record<ModelGeneratorType, WorkbookBuilder> = {
  DCF: dcfTemplate as WorkbookBuilder,
  THREE_STATEMENT: threeStatementTemplate as WorkbookBuilder,
  CAP_TABLE: capTableTemplate as WorkbookBuilder,
  SAAS_OPERATING_MODEL: saasOperatingTemplate as WorkbookBuilder,
  COMPS: compsTemplate as WorkbookBuilder,
  FOOTBALL_FIELD: footballFieldTemplate as WorkbookBuilder,
  PRECEDENTS: precedentsTemplate as WorkbookBuilder,
  LBO: lboTemplate as WorkbookBuilder,
};

function sanitizeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'model';
}

function buildFilename(
  modelType: ModelGeneratorType,
  inputs:
    | DcfModelInputs
    | ThreeStatementModelInputs
    | CapTableModelInputs
    | SaasOperatingModelInputs
    | CompsModelInputs
    | FootballFieldModelInputs
    | PrecedentsModelInputs
    | LboModelInputs
): string {
  if (inputs.modelType === 'CAP_TABLE') {
    return `CapitalBase_${sanitizeFilename(inputs.roundType)}_Cap_Table.xlsx`;
  }
  const base = 'companyName' in inputs ? inputs.companyName : modelType;
  if (modelType === 'COMPS') {
    return `CapitalBase_${sanitizeFilename(base)}_Comparable_Analysis.xlsx`;
  }
  if (modelType === 'FOOTBALL_FIELD') {
    return `CapitalBase_${sanitizeFilename(base)}_Football_Field.xlsx`;
  }
  if (modelType === 'PRECEDENTS') {
    return `CapitalBase_${sanitizeFilename(base)}_Precedent_Transactions.xlsx`;
  }
  if (modelType === 'LBO') {
    return `CapitalBase_${sanitizeFilename(base)}_Sponsor_LBO.xlsx`;
  }
  return `CapitalBase_${sanitizeFilename(base)}_${modelType}.xlsx`;
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
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const modelType = classifyPrompt(prompt);
    if (!modelType) {
      return NextResponse.json(
        { error: 'Unsupported prompt. This MVP supports DCF, three-statement, cap table, SaaS operating, comps, football field, precedents, and LBO models.' },
        { status: 400 }
      );
    }

    const extraction = await extractInputs(prompt, modelType, { clarificationAnswer, inputOverrides });
    const clarification = getClarificationDecision(modelType, extraction.missingCriticalInputs);
    if (clarification.needsClarification) {
      return NextResponse.json(
        {
          error: clarification.clarificationQuestion || 'Additional inputs are required before generating this model.',
          needsClarification: true,
          clarificationQuestion: clarification.clarificationQuestion,
          missingInputs: extraction.missingInputs,
        },
        { status: 400 }
      );
    }

    const workbook = await TEMPLATE_MAP[modelType].buildWorkbook(extraction.extractedInputs);
    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const responseBody = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const filename = buildFilename(modelType, extraction.extractedInputs);
    let persisted: Awaited<ReturnType<typeof savePromptModelRunVersion>> | null = null;
    try {
      persisted = await savePromptModelRunVersion({
        surface: 'model_generator',
        sessionId: sessionId || null,
        prompt,
        modelType,
        companyName: 'companyName' in extraction.extractedInputs ? extraction.extractedInputs.companyName : null,
        ticker: 'ticker' in extraction.extractedInputs ? extraction.extractedInputs.ticker ?? null : null,
        status: 'generated',
        assumptions: extraction.extractedInputs as Record<string, unknown>,
        defaultsUsed: extraction.defaultsUsed,
        extractedInputs: extraction.extractedInputs as Record<string, unknown>,
        provenance: extraction.provenanceSummary,
        workbookFilename: filename,
      });
    } catch {
      persisted = null;
    }

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
        ...(persisted
          ? {
              'X-CapitalBase-Run-Id': persisted.runId,
              'X-CapitalBase-Version-Number': String(persisted.version.versionNumber),
            }
          : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate workbook.' },
      { status: 500 }
    );
  }
}

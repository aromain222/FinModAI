import { hasAnyAnthropicKey } from '@/lib/anthropicKey';
import type { AttachmentStatementSnapshot } from '@/lib/analyst/pdfFinancialStatements';
import type { AttachmentDrivenModelType } from '@/lib/analyst/modelReadiness';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

export type ExtractedFieldSource = 'deterministic_pdf' | 'claude_pdf_extraction' | 'user_override';
export type ProviderTrace = 'deterministic' | 'claude' | 'mixed';

export type ExtractedField<T> = {
  value: T | null;
  units: string | null;
  source: ExtractedFieldSource;
  confidence: number;
  warnings: string[];
};

export type ExtractionCategoryMap = Record<string, ExtractedField<unknown>>;

export type ModelExtractionCategorySet = {
  identity: ExtractionCategoryMap;
  valuationBase: ExtractionCategoryMap;
  balanceSheet: ExtractionCategoryMap;
  capexAndDa: ExtractionCategoryMap;
  capitalization: ExtractionCategoryMap;
  marketContext: ExtractionCategoryMap;
  modelSpecific: Partial<Record<AttachmentDrivenModelType, ExtractionCategoryMap>>;
};

export type ExtractionFieldConflict = {
  field: string;
  deterministicValue: unknown;
  claudeValue: unknown;
  resolution: 'deterministic' | 'claude' | 'user_override';
  warning: string;
};

export type AttachmentModelExtractionContext = {
  snapshot: AttachmentStatementSnapshot | null;
  categories: ModelExtractionCategorySet;
  fieldConflicts: ExtractionFieldConflict[];
  providerTrace: ProviderTrace;
  missingRequiredFields: string[];
};

type ClaudeSnapshotField =
  | 'companyName'
  | 'ticker'
  | 'reportEndDate'
  | 'fiscalPeriod'
  | 'periodType'
  | 'currency'
  | 'revenue'
  | 'grossProfit'
  | 'operatingIncome'
  | 'ebitda'
  | 'netIncome'
  | 'cash'
  | 'totalDebt'
  | 'sharesOutstanding'
  | 'capex'
  | 'depreciationAndAmortization';

type ClaudeFieldPayload = {
  value?: string | number | null;
  confidence?: number;
  note?: string;
};

type ClaudeExtractionPayload = {
  fields?: Partial<Record<ClaudeSnapshotField, ClaudeFieldPayload>>;
  warnings?: string[];
};

const REQUIRED_FIELDS_BY_MODEL: Record<AttachmentDrivenModelType, string[]> = {
  DCF: ['companyName', 'baseRevenue', 'profitabilityAnchor', 'cashOrDebt', 'sharesOutstanding'],
  THREE_STATEMENT: ['companyName', 'baseRevenue', 'grossLayer', 'opexLayer', 'cash', 'debt'],
  COMPS: ['companyName', 'subjectRevenueOrEbitda'],
  LBO: ['companyName', 'revenue', 'ebitda', 'cashOrDebt'],
};

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildField<T>(value: T | null, units: string | null, source: ExtractedFieldSource, confidence: number, warnings: string[] = []): ExtractedField<T> {
  return {
    value,
    units,
    source,
    confidence,
    warnings,
  };
}

function getOverrideNumber(overrides: Record<string, unknown>, key: string): number | null {
  const value = overrides[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getNestedNumber(overrides: Record<string, unknown>, path: string): number | null {
  const value = path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, overrides);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getOverrideText(overrides: Record<string, unknown>, key: string): string | null {
  return textValue(overrides[key]);
}

function buildModelSpecificCategorySet(
  modelType: AttachmentDrivenModelType,
  snapshot: AttachmentStatementSnapshot | null,
  overrides: Record<string, unknown>,
): ExtractionCategoryMap {
  const companyName = getOverrideText(overrides, 'companyName') ?? snapshot?.companyName ?? snapshot?.ticker ?? null;
  const baseRevenue = getOverrideNumber(overrides, 'baseRevenue') ?? snapshot?.revenue ?? null;
  const grossMarginOverride = getOverrideNumber(overrides, 'grossMargin');
  const opexOverride = getOverrideNumber(overrides, 'opexPctRevenue');
  const revenue = getOverrideNumber(overrides, 'revenue') ?? snapshot?.revenue ?? null;
  const ebitda = getOverrideNumber(overrides, 'ebitda') ?? snapshot?.ebitda ?? snapshot?.operatingIncome ?? null;
  const subjectRevenue = getNestedNumber(overrides, 'subject.revenue') ?? snapshot?.revenue ?? null;
  const subjectEbitda = getNestedNumber(overrides, 'subject.ebitda') ?? snapshot?.ebitda ?? null;
  const profitabilityAnchor =
    getOverrideNumber(overrides, 'ebitMargin') ??
    (typeof snapshot?.operatingIncome === 'number' && typeof snapshot?.revenue === 'number' && snapshot.revenue > 0
      ? snapshot.operatingIncome / snapshot.revenue
      : typeof snapshot?.ebitda === 'number' && typeof snapshot?.revenue === 'number' && snapshot.revenue > 0
        ? snapshot.ebitda / snapshot.revenue
        : null);
  const grossLayer =
    grossMarginOverride ??
    (typeof snapshot?.grossProfit === 'number' && typeof snapshot?.revenue === 'number' && snapshot.revenue > 0
      ? snapshot.grossProfit / snapshot.revenue
      : null);
  const opexLayer =
    opexOverride ??
    (typeof snapshot?.grossProfit === 'number' &&
    typeof snapshot?.operatingIncome === 'number' &&
    typeof snapshot?.revenue === 'number' &&
    snapshot.revenue > 0
      ? (snapshot.grossProfit - snapshot.operatingIncome) / snapshot.revenue
      : null);
  const cashOrDebt = getOverrideNumber(overrides, 'cash') ?? getOverrideNumber(overrides, 'debt') ?? snapshot?.cash ?? snapshot?.totalDebt ?? null;

  switch (modelType) {
    case 'DCF':
      return {
        companyName: buildField(companyName, null, getOverrideText(overrides, 'companyName') ? 'user_override' : 'deterministic_pdf', 1),
        baseRevenue: buildField(baseRevenue, 'currency', getOverrideNumber(overrides, 'baseRevenue') !== null ? 'user_override' : 'deterministic_pdf', 1),
        profitabilityAnchor: buildField(profitabilityAnchor, 'percent', getOverrideNumber(overrides, 'ebitMargin') !== null ? 'user_override' : 'deterministic_pdf', 1),
        cashOrDebt: buildField(cashOrDebt, 'currency', getOverrideNumber(overrides, 'cash') !== null || getOverrideNumber(overrides, 'debt') !== null ? 'user_override' : 'deterministic_pdf', 1),
        sharesOutstanding: buildField(getOverrideNumber(overrides, 'sharesOutstanding') ?? snapshot?.sharesOutstanding ?? null, 'shares', getOverrideNumber(overrides, 'sharesOutstanding') !== null ? 'user_override' : 'deterministic_pdf', 1),
      };
    case 'THREE_STATEMENT':
      return {
        companyName: buildField(companyName, null, getOverrideText(overrides, 'companyName') ? 'user_override' : 'deterministic_pdf', 1),
        baseRevenue: buildField(baseRevenue, 'currency', getOverrideNumber(overrides, 'baseRevenue') !== null ? 'user_override' : 'deterministic_pdf', 1),
        grossLayer: buildField(grossLayer, 'percent', grossMarginOverride !== null ? 'user_override' : 'deterministic_pdf', 1),
        opexLayer: buildField(opexLayer, 'percent', opexOverride !== null ? 'user_override' : 'deterministic_pdf', 1),
        cash: buildField(getOverrideNumber(overrides, 'cash') ?? snapshot?.cash ?? null, 'currency', getOverrideNumber(overrides, 'cash') !== null ? 'user_override' : 'deterministic_pdf', 1),
        debt: buildField(getOverrideNumber(overrides, 'debt') ?? snapshot?.totalDebt ?? null, 'currency', getOverrideNumber(overrides, 'debt') !== null ? 'user_override' : 'deterministic_pdf', 1),
      };
    case 'COMPS':
      return {
        companyName: buildField(companyName, null, getOverrideText(overrides, 'companyName') ? 'user_override' : 'deterministic_pdf', 1),
        subjectRevenueOrEbitda: buildField(subjectRevenue ?? subjectEbitda, 'currency', getNestedNumber(overrides, 'subject.revenue') !== null || getNestedNumber(overrides, 'subject.ebitda') !== null ? 'user_override' : 'deterministic_pdf', 1),
      };
    case 'LBO':
      return {
        companyName: buildField(companyName, null, getOverrideText(overrides, 'companyName') ? 'user_override' : 'deterministic_pdf', 1),
        revenue: buildField(revenue, 'currency', getOverrideNumber(overrides, 'revenue') !== null ? 'user_override' : 'deterministic_pdf', 1),
        ebitda: buildField(ebitda, 'currency', getOverrideNumber(overrides, 'ebitda') !== null ? 'user_override' : 'deterministic_pdf', 1),
        cashOrDebt: buildField(cashOrDebt, 'currency', getOverrideNumber(overrides, 'cash') !== null || getOverrideNumber(overrides, 'debt') !== null ? 'user_override' : 'deterministic_pdf', 1),
      };
  }
}

export function buildAttachmentExtractionCategories(
  modelType: AttachmentDrivenModelType,
  snapshot: AttachmentStatementSnapshot | null,
  overrides: Record<string, unknown> = {},
): ModelExtractionCategorySet {
  return {
    identity: {
      companyName: buildField(getOverrideText(overrides, 'companyName') ?? snapshot?.companyName ?? null, null, getOverrideText(overrides, 'companyName') ? 'user_override' : 'deterministic_pdf', 1),
      ticker: buildField(snapshot?.ticker ?? null, null, 'deterministic_pdf', 1),
      reportEndDate: buildField(snapshot?.reportEndDate ?? null, null, 'deterministic_pdf', 1),
      fiscalPeriod: buildField(snapshot?.fiscalPeriod ?? null, null, 'deterministic_pdf', 1),
      periodType: buildField(snapshot?.periodType ?? null, null, 'deterministic_pdf', 1),
      currency: buildField(snapshot?.currency ?? null, null, 'deterministic_pdf', 1),
      units: buildField(snapshot?.units ?? null, null, 'deterministic_pdf', 1),
    },
    valuationBase: {
      revenue: buildField(snapshot?.revenue ?? null, 'currency', 'deterministic_pdf', 1),
      grossProfit: buildField(snapshot?.grossProfit ?? null, 'currency', 'deterministic_pdf', 1),
      operatingIncome: buildField(snapshot?.operatingIncome ?? null, 'currency', 'deterministic_pdf', 1),
      ebitda: buildField(snapshot?.ebitda ?? null, 'currency', 'deterministic_pdf', 1),
      netIncome: buildField(snapshot?.netIncome ?? null, 'currency', 'deterministic_pdf', 1),
    },
    balanceSheet: {
      cash: buildField(getOverrideNumber(overrides, 'cash') ?? snapshot?.cash ?? null, 'currency', getOverrideNumber(overrides, 'cash') !== null ? 'user_override' : 'deterministic_pdf', 1),
      debt: buildField(getOverrideNumber(overrides, 'debt') ?? snapshot?.totalDebt ?? null, 'currency', getOverrideNumber(overrides, 'debt') !== null ? 'user_override' : 'deterministic_pdf', 1),
    },
    capexAndDa: {
      capex: buildField(snapshot?.capex ?? null, 'currency', 'deterministic_pdf', 1),
      depreciationAndAmortization: buildField(snapshot?.depreciationAndAmortization ?? null, 'currency', 'deterministic_pdf', 1),
    },
    capitalization: {
      sharesOutstanding: buildField(getOverrideNumber(overrides, 'sharesOutstanding') ?? snapshot?.sharesOutstanding ?? null, 'shares', getOverrideNumber(overrides, 'sharesOutstanding') !== null ? 'user_override' : 'deterministic_pdf', 1),
    },
    marketContext: {},
    modelSpecific: {
      [modelType]: buildModelSpecificCategorySet(modelType, snapshot, overrides),
    },
  };
}

function hasFieldValue(field: ExtractedField<unknown> | undefined): boolean {
  if (!field) return false;
  if (typeof field.value === 'number') return Number.isFinite(field.value);
  return typeof field.value === 'string' ? field.value.trim().length > 0 : field.value !== null && field.value !== undefined;
}

function computeMissingRequiredFields(modelType: AttachmentDrivenModelType, categories: ModelExtractionCategorySet): string[] {
  const modelSpecific = categories.modelSpecific[modelType] ?? {};
  return REQUIRED_FIELDS_BY_MODEL[modelType].filter((field) => !hasFieldValue(modelSpecific[field]));
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

function parseClaudeValue(field: ClaudeSnapshotField, payload: ClaudeFieldPayload | undefined): string | number | null | undefined {
  if (!payload) return undefined;
  if (field === 'companyName' || field === 'ticker' || field === 'reportEndDate' || field === 'fiscalPeriod' || field === 'periodType' || field === 'currency') {
    return textValue(payload.value);
  }
  return numberValue(payload.value);
}

function valuesMateriallyDiffer(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' && typeof right === 'number') {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    const base = Math.max(Math.abs(left), Math.abs(right), 1);
    return Math.abs(left - right) / base > 0.05;
  }
  return String(left ?? '').trim() !== String(right ?? '').trim();
}

function mergeClaudeSnapshot(params: {
  snapshot: AttachmentStatementSnapshot | null;
  payload: ClaudeExtractionPayload;
  overrides: Record<string, unknown>;
}): { snapshot: AttachmentStatementSnapshot | null; fieldConflicts: ExtractionFieldConflict[]; providerTrace: ProviderTrace } {
  const base = params.snapshot;
  if (!base?.source) {
    return {
      snapshot: base,
      fieldConflicts: [],
      providerTrace: params.payload.fields && Object.keys(params.payload.fields).length > 0 ? 'claude' : 'deterministic',
    };
  }

  const next: AttachmentStatementSnapshot = {
    ...base,
    warnings: [...base.warnings],
  };
  const conflicts: ExtractionFieldConflict[] = [];
  let addedClaudeField = false;

  const fields = params.payload.fields ?? {};
  for (const [field, rawPayload] of Object.entries(fields) as Array<[ClaudeSnapshotField, ClaudeFieldPayload]>) {
    const claudeValue = parseClaudeValue(field, rawPayload);
    if (claudeValue === undefined || claudeValue === null || claudeValue === '') continue;
    const currentValue = next[field];
    if (currentValue === null || currentValue === undefined || currentValue === 'unknown') {
      (next as Record<string, unknown>)[field] = claudeValue;
      addedClaudeField = true;
      continue;
    }
    if (valuesMateriallyDiffer(currentValue, claudeValue)) {
      conflicts.push({
        field,
        deterministicValue: currentValue,
        claudeValue,
        resolution: 'deterministic',
        warning: `Claude disagreed with deterministic extraction for ${field}; kept deterministic value.`,
      });
    }
  }

  if (Array.isArray(params.payload.warnings) && params.payload.warnings.length > 0) {
    next.warnings = Array.from(new Set([...next.warnings, ...params.payload.warnings.filter((warning) => typeof warning === 'string' && warning.trim().length > 0)]));
  }

  return {
    snapshot: next,
    fieldConflicts: conflicts,
    providerTrace: addedClaudeField ? 'mixed' : 'deterministic',
  };
}

async function extractClaudeRecovery(params: {
  modelType: AttachmentDrivenModelType;
  prompt: string;
  snapshot: AttachmentStatementSnapshot | null;
  attachmentText?: string | null;
  attachmentSummary?: string | null;
}): Promise<ClaudeExtractionPayload | null> {
  const sourceText = (params.attachmentText ?? params.attachmentSummary ?? '').trim();
  if (!sourceText || !hasAnyAnthropicKey()) return null;

  const excerpt = sourceText.slice(0, 60000);
  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    clientType: 'service',
    temperature: 0,
    maxTokens: 1800,
    messages: [
      {
        role: 'system',
        content:
          'You extract finance statement fields from PDF text into strict JSON. Return JSON only. Use absolute USD amounts and absolute share counts, not display units like "millions". Do not annualize quarterly figures. If a field is not supported by the text, omit it. Preserve ambiguity in warnings instead of guessing.',
      },
      {
        role: 'user',
        content: [
          `Model type: ${params.modelType}`,
          `User prompt: ${params.prompt}`,
          `Current deterministic snapshot: ${JSON.stringify(params.snapshot ?? null)}`,
          'Return JSON with shape {"fields":{"fieldName":{"value":...,"confidence":0-1,"note":"..."}},"warnings":["..."]}.',
          'Allowed field names: companyName, ticker, reportEndDate, fiscalPeriod, periodType, currency, revenue, grossProfit, operatingIncome, ebitda, netIncome, cash, totalDebt, sharesOutstanding, capex, depreciationAndAmortization.',
          `PDF text excerpt:\n${excerpt}`,
        ].join('\n\n'),
      },
    ],
  });
  const payloadText = result?.text ? extractJsonObject(result.text) : null;
  if (!payloadText) return null;

  try {
    return JSON.parse(payloadText) as ClaudeExtractionPayload;
  } catch {
    return null;
  }
}

export async function resolveAttachmentModelExtraction(params: {
  modelType: AttachmentDrivenModelType;
  prompt: string;
  snapshot: AttachmentStatementSnapshot | null;
  inputOverrides?: Record<string, unknown>;
  attachmentText?: string | null;
  attachmentSummary?: string | null;
}): Promise<AttachmentModelExtractionContext> {
  const overrides = params.inputOverrides ?? {};
  const baseCategories = buildAttachmentExtractionCategories(params.modelType, params.snapshot, overrides);
  const baseMissing = computeMissingRequiredFields(params.modelType, baseCategories);
  if (baseMissing.length === 0) {
    return {
      snapshot: params.snapshot,
      categories: baseCategories,
      fieldConflicts: [],
      providerTrace: 'deterministic',
      missingRequiredFields: [],
    };
  }

  const claudePayload = await extractClaudeRecovery({
    modelType: params.modelType,
    prompt: params.prompt,
    snapshot: params.snapshot,
    attachmentText: params.attachmentText,
    attachmentSummary: params.attachmentSummary,
  });
  if (!claudePayload) {
    return {
      snapshot: params.snapshot,
      categories: baseCategories,
      fieldConflicts: [],
      providerTrace: 'deterministic',
      missingRequiredFields: baseMissing,
    };
  }

  const merged = mergeClaudeSnapshot({
    snapshot: params.snapshot,
    payload: claudePayload,
    overrides,
  });
  const categories = buildAttachmentExtractionCategories(params.modelType, merged.snapshot, overrides);
  const missingRequiredFields = computeMissingRequiredFields(params.modelType, categories);

  return {
    snapshot: merged.snapshot,
    categories,
    fieldConflicts: merged.fieldConflicts,
    providerTrace: merged.providerTrace,
    missingRequiredFields,
  };
}

import type { AttachmentStatementSnapshot } from '@/lib/analyst/pdfFinancialStatements';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type {
  DcfModelInputs,
  ExtractedModelInputs,
  LboModelInputs,
  ThreeStatementModelInputs,
} from '@/lib/model-generator/extractInputs';

export type AttachmentScaleValidation = {
  ok: boolean;
  failedFields: string[];
  message: string;
};

export type AnalystFieldDisplaySemantic =
  | 'model_millions_currency'
  | 'model_millions_shares'
  | 'currency'
  | 'percent'
  | 'multiple'
  | 'number';

export type AnalystFieldDisplayMap = Record<string, AnalystFieldDisplaySemantic>;

type SupportedAttachmentScaleModel = Extract<ModelGeneratorType, 'DCF' | 'THREE_STATEMENT' | 'LBO'>;

const RELATIVE_TOLERANCE = 0.05;
const ORDER_OF_MAGNITUDE_RATIO = 50;

function relativeDifference(left: number, right: number): number {
  const base = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / base;
}

function isMagnitudeMismatch(left: number, right: number): boolean {
  const a = Math.abs(left);
  const b = Math.abs(right);
  if (a === 0 || b === 0) return false;
  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio >= ORDER_OF_MAGNITUDE_RATIO;
}

function collectMismatch(
  failedFields: Set<string>,
  reasons: string[],
  field: string,
  modeled: number | null | undefined,
  expected: number | null | undefined,
) {
  if (typeof modeled !== 'number' || !Number.isFinite(modeled)) return;
  if (typeof expected !== 'number' || !Number.isFinite(expected)) return;
  if (relativeDifference(modeled, expected) <= RELATIVE_TOLERANCE && !isMagnitudeMismatch(modeled, expected)) return;

  failedFields.add(field);
  reasons.push(`${field} modeled at ${modeled} but attachment normalized to ${expected}`);
}

function collectPercentMismatch(
  failedFields: Set<string>,
  reasons: string[],
  field: string,
  modeled: number | null | undefined,
  numerator: number | null | undefined,
  denominator: number | null | undefined,
) {
  if (
    typeof modeled !== 'number' ||
    !Number.isFinite(modeled) ||
    typeof numerator !== 'number' ||
    !Number.isFinite(numerator) ||
    typeof denominator !== 'number' ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return;
  }

  const expected = numerator / denominator;
  if (relativeDifference(modeled, expected) <= RELATIVE_TOLERANCE) return;
  failedFields.add(field);
  reasons.push(`${field} modeled at ${modeled} but attachment implies ${expected}`);
}

function validateDcf(
  inputs: DcfModelInputs,
  snapshot: AttachmentStatementSnapshot,
  _overrides: Record<string, unknown> | undefined,
): AttachmentScaleValidation {
  const failedFields = new Set<string>();
  const reasons: string[] = [];

  collectMismatch(failedFields, reasons, 'baseRevenue', inputs.baseRevenue, snapshot.revenue);
  collectMismatch(failedFields, reasons, 'cash', inputs.cash, snapshot.cash);
  collectMismatch(failedFields, reasons, 'debt', inputs.debt, snapshot.totalDebt);
  collectMismatch(
    failedFields,
    reasons,
    'sharesOutstanding',
    inputs.sharesOutstanding,
    snapshot.sharesOutstanding,
  );
  collectPercentMismatch(
    failedFields,
    reasons,
    'ebitMargin',
    inputs.ebitMargin[0] ?? null,
    snapshot.operatingIncome ?? snapshot.ebitda,
    snapshot.revenue,
  );

  return {
    ok: failedFields.size === 0,
    failedFields: Array.from(failedFields),
    message:
      failedFields.size === 0
        ? 'Attachment-backed model inputs reconciled to the normalized statement snapshot.'
        : `Attachment parsed successfully, but unit normalization failed for ${Array.from(failedFields).join(', ')}. The model was stopped to avoid a mis-scaled output. ${reasons.join('; ')}`,
  };
}

function validateThreeStatement(
  inputs: ThreeStatementModelInputs,
  snapshot: AttachmentStatementSnapshot,
  _overrides: Record<string, unknown> | undefined,
): AttachmentScaleValidation {
  const failedFields = new Set<string>();
  const reasons: string[] = [];

  collectMismatch(failedFields, reasons, 'baseRevenue', inputs.baseRevenue, snapshot.revenue);
  collectMismatch(failedFields, reasons, 'cash', inputs.cash, snapshot.cash);
  collectMismatch(failedFields, reasons, 'debt', inputs.debt, snapshot.totalDebt);
  collectPercentMismatch(
    failedFields,
    reasons,
    'grossMargin',
    inputs.grossMargin,
    snapshot.grossProfit,
    snapshot.revenue,
  );
  if (
    typeof snapshot.grossProfit === 'number' &&
    Number.isFinite(snapshot.grossProfit) &&
    typeof snapshot.operatingIncome === 'number' &&
    Number.isFinite(snapshot.operatingIncome)
  ) {
    collectPercentMismatch(
      failedFields,
      reasons,
      'opexPctRevenue',
      inputs.opexPctRevenue,
      snapshot.grossProfit - snapshot.operatingIncome,
      snapshot.revenue,
    );
  }

  return {
    ok: failedFields.size === 0,
    failedFields: Array.from(failedFields),
    message:
      failedFields.size === 0
        ? 'Attachment-backed model inputs reconciled to the normalized statement snapshot.'
        : `Attachment parsed successfully, but unit normalization failed for ${Array.from(failedFields).join(', ')}. The model was stopped to avoid a mis-scaled output. ${reasons.join('; ')}`,
  };
}

function validateLbo(
  inputs: LboModelInputs,
  snapshot: AttachmentStatementSnapshot,
  _overrides: Record<string, unknown> | undefined,
): AttachmentScaleValidation {
  const failedFields = new Set<string>();
  const reasons: string[] = [];

  collectMismatch(failedFields, reasons, 'revenue', inputs.revenue, snapshot.revenue);
  collectMismatch(failedFields, reasons, 'ebitda', inputs.ebitda, snapshot.ebitda ?? snapshot.operatingIncome);
  const expectedNetDebt =
    typeof snapshot.totalDebt === 'number' && Number.isFinite(snapshot.totalDebt)
      ? snapshot.totalDebt - (snapshot.cash ?? 0)
      : null;
  collectMismatch(failedFields, reasons, 'netDebt', inputs.netDebt, expectedNetDebt);

  return {
    ok: failedFields.size === 0,
    failedFields: Array.from(failedFields),
    message:
      failedFields.size === 0
        ? 'Attachment-backed model inputs reconciled to the normalized statement snapshot.'
        : `Attachment parsed successfully, but unit normalization failed for ${Array.from(failedFields).join(', ')}. The model was stopped to avoid a mis-scaled output. ${reasons.join('; ')}`,
  };
}

export function validateAttachmentDrivenModelScale(params: {
  modelType: SupportedAttachmentScaleModel;
  extractedInputs: ExtractedModelInputs;
  attachmentSnapshot: AttachmentStatementSnapshot | null;
  inputOverrides?: Record<string, unknown>;
}): AttachmentScaleValidation {
  const { modelType, extractedInputs, attachmentSnapshot, inputOverrides } = params;
  if (!attachmentSnapshot) {
    return {
      ok: true,
      failedFields: [],
      message: 'No attachment snapshot was available for scale validation.',
    };
  }

  switch (modelType) {
    case 'DCF':
      return validateDcf(extractedInputs as DcfModelInputs, attachmentSnapshot, inputOverrides);
    case 'THREE_STATEMENT':
      return validateThreeStatement(
        extractedInputs as ThreeStatementModelInputs,
        attachmentSnapshot,
        inputOverrides,
      );
    case 'LBO':
      return validateLbo(extractedInputs as LboModelInputs, attachmentSnapshot, inputOverrides);
  }
}

export function buildAnalystFieldDisplayMap(
  modelType: ModelGeneratorType,
): AnalystFieldDisplayMap {
  switch (modelType) {
    case 'DCF':
      return {
        baseRevenue: 'model_millions_currency',
        cash: 'model_millions_currency',
        debt: 'model_millions_currency',
        marketCap: 'model_millions_currency',
        sharesOutstanding: 'model_millions_shares',
        sharePrice: 'currency',
        revenueGrowth: 'percent',
        ebitMargin: 'percent',
        taxRate: 'percent',
        daPctRevenue: 'percent',
        capexPctRevenue: 'percent',
        nwcPctRevenue: 'percent',
        wacc: 'percent',
        terminalGrowth: 'percent',
        years: 'number',
      };
    case 'THREE_STATEMENT':
      return {
        baseRevenue: 'model_millions_currency',
        cash: 'model_millions_currency',
        debt: 'model_millions_currency',
        revenueGrowth: 'percent',
        grossMargin: 'percent',
        opexPctRevenue: 'percent',
        taxRate: 'percent',
        capexPctRevenue: 'percent',
        daPctRevenue: 'percent',
        years: 'number',
      };
    case 'LBO':
      return {
        revenue: 'model_millions_currency',
        ebitda: 'model_millions_currency',
        netDebt: 'model_millions_currency',
        sharesOutstanding: 'model_millions_shares',
        sharePrice: 'currency',
        entryMultiple: 'multiple',
        exitMultiple: 'multiple',
        debtPercent: 'percent',
        equityPercent: 'percent',
        interestRate: 'percent',
        amortizationPercent: 'percent',
        cashSweepPercent: 'percent',
        revenueGrowth: 'percent',
        ebitdaMargin: 'percent',
        capexPctRevenue: 'percent',
        deltaNwcPctRevenue: 'percent',
        taxRate: 'percent',
        holdingPeriodYears: 'number',
      };
    default:
      return {};
  }
}

import type { LboDealInputs } from '@/lib/models/lbo/dealInputs';

export type SelectedCompany = {
  ticker: string;
  name: string;
  cik?: string;
  exchange?: string;
};

export type LboDealFormValues = {
  entryMultiple: string;
  exitEBITDAMultiple: string;
  offerPremium: string;
  exitYear: string;
  leverageMultiple: string;
  termLoanBRate: string;
  revolverRate: string;
  transactionFeesPercent: string;
  financingFeesPercent: string;
  minimumCashBalance: string;
};

export type LboAdvancedFormValues = {
  managementRolloverPct?: string;
  preferredEquityAmount?: string;
  subordinatedNotesAmount?: string;
  minimumCashAtClose?: string;
};

export type LboDealInputErrorDetails = {
  fieldErrors: Record<string, string>;
};

export class LboDealInputError extends Error {
  fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.name = 'LboDealInputError';
    this.fieldErrors = fieldErrors;
  }
}

const normalizeString = (value: string | undefined | null) => (value ?? '').trim();

const parseRequiredNumber = (value: string, field: string, label: string, errors: Record<string, string>): number => {
  const trimmed = normalizeString(value);
  if (!trimmed) {
    errors[field] = `${label} is required`;
    return NaN;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    errors[field] = `${label} must be a valid number`;
    return NaN;
  }
  return parsed;
};

const parseOptionalNumber = (value?: string): number | undefined => {
  const trimmed = normalizeString(value);
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
};

export function buildLboDealInputs(
  selectedCompany: SelectedCompany | null | undefined,
  formValues: LboDealFormValues,
  advancedValues?: LboAdvancedFormValues
): LboDealInputs {
  const fieldErrors: Record<string, string> = {};

  if (!selectedCompany?.name || !selectedCompany?.name.trim()) {
    fieldErrors['company.name'] = 'Company name is required';
  }
  if (!selectedCompany?.ticker || !selectedCompany?.ticker.trim()) {
    fieldErrors['company.ticker'] = 'Company ticker is required';
  }

  const entryMultiple = parseRequiredNumber(
    formValues.entryMultiple,
    'entry.ebitdaMultiple',
    'Entry EBITDA multiple',
    fieldErrors
  );
  const exitMultiple = parseRequiredNumber(
    formValues.exitEBITDAMultiple,
    'exit.ebitdaMultiple',
    'Exit EBITDA multiple',
    fieldErrors
  );
  const offerPremiumPct = parseRequiredNumber(
    formValues.offerPremium,
    'entry.offerPremiumPct',
    'Offer premium (%)',
    fieldErrors
  );
  const holdPeriodYears = parseRequiredNumber(
    formValues.exitYear,
    'exit.holdPeriodYears',
    'Hold period (years)',
    fieldErrors
  );
  const targetDebtToEbitda = parseRequiredNumber(
    formValues.leverageMultiple,
    'leverage.targetDebtToEbitda',
    'Target leverage (Debt / EBITDA)',
    fieldErrors
  );
  const termLoanBRatePct = parseRequiredNumber(
    formValues.termLoanBRate,
    'debtPricing.termLoanBRatePct',
    'Term Loan B rate (%)',
    fieldErrors
  );
  const revolverRatePct = parseRequiredNumber(
    formValues.revolverRate,
    'debtPricing.revolverRatePct',
    'Revolver rate (%)',
    fieldErrors
  );
  const transactionFeePct = parseRequiredNumber(
    formValues.transactionFeesPercent,
    'fees.transactionFeePct',
    'Transaction fees (%)',
    fieldErrors
  );
  const financingFeePct = parseRequiredNumber(
    formValues.financingFeesPercent,
    'fees.financingFeePct',
    'Financing fees (%)',
    fieldErrors
  );
  const minimumCashMm = parseRequiredNumber(
    formValues.minimumCashBalance,
    'liquidity.minimumCashMm',
    'Minimum cash balance ($MM)',
    fieldErrors
  );

  if (Object.keys(fieldErrors).length > 0) {
    throw new LboDealInputError('LBO deal inputs are incomplete or invalid.', fieldErrors);
  }

  const rolloverEquityPct = parseOptionalNumber(advancedValues?.managementRolloverPct);
  const preferredEquityAmount = parseOptionalNumber(advancedValues?.preferredEquityAmount);
  const subordinatedNotesMm = parseOptionalNumber(advancedValues?.subordinatedNotesAmount);
  const minimumCashAtCloseMm = parseOptionalNumber(advancedValues?.minimumCashAtClose);

  const advanced =
    rolloverEquityPct !== undefined ||
    preferredEquityAmount !== undefined ||
    subordinatedNotesMm !== undefined ||
    minimumCashAtCloseMm !== undefined
      ? {
          rolloverEquityPct,
          preferredEquity: preferredEquityAmount !== undefined ? { amountMm: preferredEquityAmount } : undefined,
          subordinatedNotesMm,
          minimumCashAtCloseMm,
        }
      : undefined;

  return {
    company: {
      name: selectedCompany!.name.trim(),
      ticker: selectedCompany!.ticker.trim().toUpperCase(),
    },
    entry: {
      ebitdaMultiple: entryMultiple,
      offerPremiumPct,
    },
    exit: {
      ebitdaMultiple: exitMultiple,
      holdPeriodYears,
    },
    leverage: {
      targetDebtToEbitda,
    },
    debtPricing: {
      termLoanBRatePct,
      revolverRatePct,
    },
    fees: {
      transactionFeePct,
      financingFeePct,
    },
    liquidity: {
      minimumCashMm,
    },
    advanced,
  };
}

export function buildLboPayload(params: {
  selectedCompany: SelectedCompany | null | undefined;
  formValues: LboDealFormValues;
  advancedValues?: LboAdvancedFormValues;
}): LboDealInputs {
  return buildLboDealInputs(params.selectedCompany, params.formValues, params.advancedValues);
}

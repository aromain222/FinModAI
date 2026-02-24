export type DebtCapacityLiteInputs = {
  maxLeverage: number;
  minInterestCoverage: number;
  interestRate: number; // decimal
};

export type DebtCapacityLiteSummary = {
  label: 'Debt Capacity Lite (Demo assumptions)';
  leverageCap: number;
  coverageCap: number;
  maxDebt: number;
  bindingConstraint: 'leverage' | 'coverage';
  headroomVsNetDebt: number | null;
  currentNetDebt: number | null;
  inputs: {
    ebitda: number;
    maxLeverage: number;
    minInterestCoverage: number;
    interestRate: number;
  };
  formattedOutput: string;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseNumeric = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(/[$,%\s,]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export function parseDebtCapacityLiteInputs(raw: any): {
  maxLeverage: number;
  minInterestCoverage: number;
  interestRatePct: number;
} | null {
  const source = raw && typeof raw === 'object' ? raw : {};
  const maxLeverage = parseNumeric(source.maxLeverage);
  const minInterestCoverage = parseNumeric(source.minInterestCoverage);
  const interestRatePct = parseNumeric(source.interestRatePct ?? source.interestRate);

  if (
    maxLeverage === undefined ||
    minInterestCoverage === undefined ||
    interestRatePct === undefined
  ) {
    return null;
  }

  return {
    maxLeverage,
    minInterestCoverage,
    interestRatePct,
  };
}

export function validateDebtCapacityLiteInputs(inputs: {
  maxLeverage: number;
  minInterestCoverage: number;
  interestRatePct: number;
}): { ok: true; value: DebtCapacityLiteInputs } | { ok: false; message: string } {
  if (!isFiniteNumber(inputs.maxLeverage) || inputs.maxLeverage <= 0 || inputs.maxLeverage > 20) {
    return { ok: false, message: 'maxLeverage must be > 0 and <= 20x.' };
  }
  if (
    !isFiniteNumber(inputs.minInterestCoverage) ||
    inputs.minInterestCoverage <= 0 ||
    inputs.minInterestCoverage > 20
  ) {
    return { ok: false, message: 'minInterestCoverage must be > 0 and <= 20x.' };
  }
  if (!isFiniteNumber(inputs.interestRatePct) || inputs.interestRatePct <= 0 || inputs.interestRatePct > 100) {
    return { ok: false, message: 'interestRate (%) must be > 0 and <= 100.' };
  }

  return {
    ok: true,
    value: {
      maxLeverage: inputs.maxLeverage,
      minInterestCoverage: inputs.minInterestCoverage,
      interestRate: inputs.interestRatePct / 100,
    },
  };
}

export function buildDebtCapacityLiteSummary(params: {
  ebitda: number;
  currentNetDebt?: number | null;
  inputs: DebtCapacityLiteInputs;
}): DebtCapacityLiteSummary {
  const { ebitda, currentNetDebt = null, inputs } = params;
  if (!isFiniteNumber(ebitda) || ebitda <= 0) {
    throw new Error('EBITDA must be positive for Debt Capacity Lite.');
  }
  if (!isFiniteNumber(inputs.interestRate) || inputs.interestRate <= 0) {
    throw new Error('Interest rate must be positive for Debt Capacity Lite.');
  }
  if (!isFiniteNumber(inputs.minInterestCoverage) || inputs.minInterestCoverage <= 0) {
    throw new Error('Minimum interest coverage must be positive for Debt Capacity Lite.');
  }

  const leverageCap = ebitda * inputs.maxLeverage;
  const coverageCap = ebitda / inputs.minInterestCoverage / inputs.interestRate;
  const maxDebt = Math.min(leverageCap, coverageCap);
  const bindingConstraint = leverageCap <= coverageCap ? 'leverage' : 'coverage';
  const headroomVsNetDebt =
    currentNetDebt !== null && isFiniteNumber(currentNetDebt) ? maxDebt - currentNetDebt : null;

  const formattedOutput = `Debt Capacity Lite (Demo assumptions): max debt ${maxDebt.toFixed(
    2
  )} ($M), binding on ${bindingConstraint}.`;

  return {
    label: 'Debt Capacity Lite (Demo assumptions)',
    leverageCap,
    coverageCap,
    maxDebt,
    bindingConstraint,
    headroomVsNetDebt,
    currentNetDebt: currentNetDebt !== null && isFiniteNumber(currentNetDebt) ? currentNetDebt : null,
    inputs: {
      ebitda,
      maxLeverage: inputs.maxLeverage,
      minInterestCoverage: inputs.minInterestCoverage,
      interestRate: inputs.interestRate,
    },
    formattedOutput,
  };
}

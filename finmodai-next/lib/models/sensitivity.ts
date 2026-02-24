import { runLboModel, type LboInputs } from '../lboEngine';

export type DcfSensitivityConfig = {
  waccRangePct: number;
  waccStepPct: number;
  terminalGrowthRangePct: number;
  terminalGrowthStepPct: number;
};

export type LboSensitivityConfig = {
  entryRange: number;
  entryStep: number;
  exitRange: number;
  exitStep: number;
};

export type DcfSensitivityTable = {
  type: 'dcf';
  metric: 'pricePerShare';
  rows: number[]; // WACC (decimal)
  cols: number[]; // Terminal growth (decimal)
  values: Array<Array<number | null>>;
  base: {
    wacc: number;
    terminalGrowth: number;
    pricePerShare: number;
  };
  config: DcfSensitivityConfig;
};

export type DcfSensitivityContext = {
  wacc: number;
  terminalGrowth: number;
  basePricePerShare: number;
  evaluatePrice: (params: { wacc: number; terminalGrowth: number }) => number | null;
};

export type LboSensitivityTable = {
  type: 'lbo';
  primaryMetric: 'irr';
  rows: number[]; // Entry multiple
  cols: number[]; // Exit multiple
  irr: Array<Array<number | null>>;
  moic: Array<Array<number | null>>;
  base: {
    entryMultiple: number;
    exitMultiple: number;
    irr: number;
    moic: number;
  };
  config: LboSensitivityConfig;
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const DEFAULT_DCF_SENSITIVITY_CONFIG: DcfSensitivityConfig = {
  waccRangePct: 2.0,
  waccStepPct: 0.5,
  terminalGrowthRangePct: 1.0,
  terminalGrowthStepPct: 0.25,
};

export const DEFAULT_LBO_SENSITIVITY_CONFIG: LboSensitivityConfig = {
  entryRange: 2.0,
  entryStep: 0.5,
  exitRange: 2.0,
  exitStep: 0.5,
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

const roundTo = (value: number, decimals: number = 6): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

const buildCenteredRange = (
  center: number,
  range: number,
  step: number,
  options?: { min?: number; max?: number }
): number[] => {
  const min = options?.min ?? Number.NEGATIVE_INFINITY;
  const max = options?.max ?? Number.POSITIVE_INFINITY;
  const start = center - range;
  const end = center + range;
  const values: number[] = [];
  for (let value = start; value <= end + 1e-9; value += step) {
    const clamped = Math.min(max, Math.max(min, value));
    values.push(roundTo(clamped));
  }
  return Array.from(new Set(values));
};

export function parseDcfSensitivityConfig(raw: any): ParseResult<DcfSensitivityConfig> {
  if (!raw || typeof raw !== 'object') {
    return { ok: true, value: { ...DEFAULT_DCF_SENSITIVITY_CONFIG } };
  }

  const waccRangePct = parseNumeric(raw.waccRangePct ?? raw.waccRange);
  const waccStepPct = parseNumeric(raw.waccStepPct ?? raw.waccStep);
  const terminalGrowthRangePct = parseNumeric(
    raw.terminalGrowthRangePct ?? raw.tgRangePct ?? raw.terminalRange
  );
  const terminalGrowthStepPct = parseNumeric(
    raw.terminalGrowthStepPct ?? raw.tgStepPct ?? raw.terminalStep
  );

  const value: DcfSensitivityConfig = {
    waccRangePct:
      waccRangePct !== undefined ? waccRangePct : DEFAULT_DCF_SENSITIVITY_CONFIG.waccRangePct,
    waccStepPct: waccStepPct !== undefined ? waccStepPct : DEFAULT_DCF_SENSITIVITY_CONFIG.waccStepPct,
    terminalGrowthRangePct:
      terminalGrowthRangePct !== undefined
        ? terminalGrowthRangePct
        : DEFAULT_DCF_SENSITIVITY_CONFIG.terminalGrowthRangePct,
    terminalGrowthStepPct:
      terminalGrowthStepPct !== undefined
        ? terminalGrowthStepPct
        : DEFAULT_DCF_SENSITIVITY_CONFIG.terminalGrowthStepPct,
  };

  if (value.waccRangePct <= 0 || value.waccRangePct > 10) {
    return { ok: false, error: 'DCF sensitivity waccRangePct must be between 0 and 10.' };
  }
  if (value.waccStepPct <= 0 || value.waccStepPct > 2) {
    return { ok: false, error: 'DCF sensitivity waccStepPct must be between 0 and 2.' };
  }
  if (value.terminalGrowthRangePct <= 0 || value.terminalGrowthRangePct > 5) {
    return { ok: false, error: 'DCF sensitivity terminalGrowthRangePct must be between 0 and 5.' };
  }
  if (value.terminalGrowthStepPct <= 0 || value.terminalGrowthStepPct > 1) {
    return { ok: false, error: 'DCF sensitivity terminalGrowthStepPct must be between 0 and 1.' };
  }

  const waccPoints = Math.floor((value.waccRangePct * 2) / value.waccStepPct) + 1;
  const terminalPoints =
    Math.floor((value.terminalGrowthRangePct * 2) / value.terminalGrowthStepPct) + 1;
  if (waccPoints > 41 || terminalPoints > 41) {
    return {
      ok: false,
      error: 'DCF sensitivity grid too large. Reduce range or increase step.',
    };
  }
  return { ok: true, value };
}

export function parseLboSensitivityConfig(raw: any): ParseResult<LboSensitivityConfig> {
  if (!raw || typeof raw !== 'object') {
    return { ok: true, value: { ...DEFAULT_LBO_SENSITIVITY_CONFIG } };
  }

  const entryRange = parseNumeric(raw.entryRange ?? raw.entryRangeX ?? raw.range);
  const entryStep = parseNumeric(raw.entryStep ?? raw.entryStepX ?? raw.step);
  const exitRange = parseNumeric(raw.exitRange ?? raw.exitRangeX ?? raw.range);
  const exitStep = parseNumeric(raw.exitStep ?? raw.exitStepX ?? raw.step);

  const value: LboSensitivityConfig = {
    entryRange: entryRange !== undefined ? entryRange : DEFAULT_LBO_SENSITIVITY_CONFIG.entryRange,
    entryStep: entryStep !== undefined ? entryStep : DEFAULT_LBO_SENSITIVITY_CONFIG.entryStep,
    exitRange: exitRange !== undefined ? exitRange : DEFAULT_LBO_SENSITIVITY_CONFIG.exitRange,
    exitStep: exitStep !== undefined ? exitStep : DEFAULT_LBO_SENSITIVITY_CONFIG.exitStep,
  };

  if (value.entryRange <= 0 || value.entryRange > 10) {
    return { ok: false, error: 'LBO sensitivity entryRange must be between 0 and 10.' };
  }
  if (value.entryStep <= 0 || value.entryStep > 2) {
    return { ok: false, error: 'LBO sensitivity entryStep must be between 0 and 2.' };
  }
  if (value.exitRange <= 0 || value.exitRange > 10) {
    return { ok: false, error: 'LBO sensitivity exitRange must be between 0 and 10.' };
  }
  if (value.exitStep <= 0 || value.exitStep > 2) {
    return { ok: false, error: 'LBO sensitivity exitStep must be between 0 and 2.' };
  }

  const entryPoints = Math.floor((value.entryRange * 2) / value.entryStep) + 1;
  const exitPoints = Math.floor((value.exitRange * 2) / value.exitStep) + 1;
  if (entryPoints > 41 || exitPoints > 41) {
    return {
      ok: false,
      error: 'LBO sensitivity grid too large. Reduce range or increase step.',
    };
  }

  return { ok: true, value };
}

export function buildDcfSensitivityTable(
  context: DcfSensitivityContext,
  config: DcfSensitivityConfig = DEFAULT_DCF_SENSITIVITY_CONFIG
): DcfSensitivityTable {
  const baseWacc = Number(context.wacc || 0.1);
  const baseTerminalGrowth = Number(context.terminalGrowth || 0.025);
  const basePricePerShare = Number(context.basePricePerShare || 0);

  const rows = buildCenteredRange(baseWacc * 100, config.waccRangePct, config.waccStepPct, {
    min: 0.5,
    max: 60,
  }).map((v) => v / 100);
  const cols = buildCenteredRange(
    baseTerminalGrowth * 100,
    config.terminalGrowthRangePct,
    config.terminalGrowthStepPct,
    { min: -10, max: 20 }
  ).map((v) => v / 100);

  const values = rows.map((wacc) =>
    cols.map((terminalGrowth) => {
      if (wacc <= terminalGrowth + 0.001) {
        return null;
      }
      const price = context.evaluatePrice({ wacc, terminalGrowth });
      return Number.isFinite(price) ? (price as number) : null;
    })
  );

  return {
    type: 'dcf',
    metric: 'pricePerShare',
    rows,
    cols,
    values,
    base: {
      wacc: baseWacc,
      terminalGrowth: baseTerminalGrowth,
      pricePerShare: basePricePerShare,
    },
    config,
  };
}

export function buildLboSensitivityTable(
  baseInputs: LboInputs,
  config: LboSensitivityConfig = DEFAULT_LBO_SENSITIVITY_CONFIG
): LboSensitivityTable {
  const baseOutput = runLboModel({ ...baseInputs });
  const rows = buildCenteredRange(
    baseInputs.entryMultiple,
    config.entryRange,
    config.entryStep,
    { min: 0.5, max: 50 }
  );
  const cols = buildCenteredRange(
    baseInputs.exitMultiple,
    config.exitRange,
    config.exitStep,
    { min: 0.5, max: 50 }
  );

  const irr: Array<Array<number | null>> = [];
  const moic: Array<Array<number | null>> = [];
  for (const entryMultiple of rows) {
    const irrRow: Array<number | null> = [];
    const moicRow: Array<number | null> = [];
    for (const exitMultiple of cols) {
      try {
        const output = runLboModel({
          ...baseInputs,
          entryMultiple,
          exitMultiple,
        });
        irrRow.push(Number.isFinite(output.returns.irr) ? output.returns.irr : null);
        moicRow.push(Number.isFinite(output.returns.moic) ? output.returns.moic : null);
      } catch {
        irrRow.push(null);
        moicRow.push(null);
      }
    }
    irr.push(irrRow);
    moic.push(moicRow);
  }

  return {
    type: 'lbo',
    primaryMetric: 'irr',
    rows,
    cols,
    irr,
    moic,
    base: {
      entryMultiple: baseInputs.entryMultiple,
      exitMultiple: baseInputs.exitMultiple,
      irr: baseOutput.returns.irr,
      moic: baseOutput.returns.moic,
    },
    config,
  };
}

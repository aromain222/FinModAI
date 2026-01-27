/**
 * LBO Model Pipeline (canonical LboDealInputs)
 *
 * Generates workbook + preview + outputs using the LBO engine.
 * Returns canonical artifact metadata plus LBO summary/output payloads.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { CanonicalPipelineOutput } from '@/lib/models/runModelPipeline';
import type { ScaledFinancials } from '@/lib/financials';
import type { LboEngineOutput, RunLboModelParams } from '@/lib/lboEngine';
import { buildLboWorkbook } from '@/lib/lboEngine';
import { readLboValuationOutputs } from '@/lib/models/lbo/workbookOutputs';
import type { LboDealInputs } from '@/lib/models/lbo/dealInputs';
import { LboDealInputsSchema } from '@/lib/models/lbo/dealInputs';
import type { LBOOutput, LboOutputField } from '@/lib/models/outputTypes';
import { buildLboPreview } from '@/lib/modeling/preview';
import type { LboAdvancedOptions } from '@/types/lbo';
import { checkR2Env, uploadXlsxToR2 } from '@/lib/r2';

const LOCAL_EXPORT_DIR = '.local-model-exports';

type LboOperatingAssumptions = {
  revenueGrowth: number;
  ebitdaMargin: number;
  capexPercent: number;
  daPercent: number;
  nwcPercent: number;
  taxRate: number;
};

type LboPipelineOptions = {
  traceId: string;
  modelId?: string;
  normalizedFinancials?: ScaledFinancials | null;
  operatingAssumptions?: Partial<LboOperatingAssumptions>;
};

export type LboPipelineResult = CanonicalPipelineOutput & {
  lboSummary: LboEngineOutput;
  lboOutput: LBOOutput;
  appliedDefaults: Array<{ field: string; value: number; reason: string }>;
};

const requireFinite = (value: number | undefined, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`Missing required LBO input: ${label}`);
  }
  return value;
};

const normalizeOperatingAssumptions = (
  provided: Partial<LboOperatingAssumptions> | undefined,
  normalizedFinancials: ScaledFinancials | null | undefined
): { assumptions: LboOperatingAssumptions; appliedDefaults: Array<{ field: string; value: number; reason: string }> } => {
  const appliedDefaults: Array<{ field: string; value: number; reason: string }> = [];
  const fallback = (value: number | undefined, field: keyof LboOperatingAssumptions, defaultValue: number, reason: string) => {
    if (Number.isFinite(value)) {
      return value as number;
    }
    appliedDefaults.push({ field, value: defaultValue, reason });
    return defaultValue;
  };

  const derivedMargin =
    normalizedFinancials && normalizedFinancials.revenueM > 0
      ? normalizedFinancials.ebitdaM / normalizedFinancials.revenueM
      : undefined;

  const assumptions: LboOperatingAssumptions = {
    revenueGrowth: fallback(
      provided?.revenueGrowth,
      'revenueGrowth',
      0.05,
      'Default revenue growth used (no scenario override provided).'
    ),
    ebitdaMargin: fallback(
      provided?.ebitdaMargin,
      'ebitdaMargin',
      Number.isFinite(derivedMargin) ? (derivedMargin as number) : 0.25,
      'Default EBITDA margin used (no scenario override provided).'
    ),
    capexPercent: fallback(
      provided?.capexPercent,
      'capexPercent',
      0.04,
      'Default capex percent used.'
    ),
    daPercent: fallback(
      provided?.daPercent,
      'daPercent',
      0.04,
      'Default D&A percent used.'
    ),
    nwcPercent: fallback(
      provided?.nwcPercent,
      'nwcPercent',
      0.02,
      'Default NWC percent used.'
    ),
    taxRate: fallback(
      provided?.taxRate,
      'taxRate',
      0.25,
      'Default tax rate used.'
    ),
  };

  return { assumptions, appliedDefaults };
};

const toPercent = (value: number): number => value * 100;

const mapAdvancedOptions = (advanced?: LboDealInputs['advanced']): LboAdvancedOptions | undefined => {
  if (!advanced) {
    return undefined;
  }
  const mapped: LboAdvancedOptions = {};
  if (typeof advanced.rolloverEquityPct === 'number') {
    mapped.managementRolloverPct = Math.max(0, advanced.rolloverEquityPct / 100);
  }
  if (typeof advanced.preferredEquity?.amountMm === 'number') {
    mapped.preferredEquityAmount = advanced.preferredEquity.amountMm;
  }
  if (typeof advanced.subordinatedNotesMm === 'number') {
    mapped.subordinatedNotesAmount = advanced.subordinatedNotesMm;
  }
  if (typeof advanced.minimumCashAtCloseMm === 'number') {
    mapped.minimumCashAtClose = advanced.minimumCashAtCloseMm;
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined;
};

const toSourceUseRows = (entries: Record<string, number>, labelMap: Record<string, string>) =>
  Object.entries(entries).map(([key, amount]) => ({
    item: labelMap[key] ?? key,
    amount: Number.isFinite(amount) ? amount : 0,
  }));

const buildLboOutput = (summary: LboEngineOutput, inputs: LboDealInputs, valuation: LBOOutput['valuation']): LBOOutput => {
  const sources = summary.sourcesAndUses?.sources ?? {
    sponsorEquity: 0,
    managementRollover: 0,
    termLoan: 0,
    revolver: 0,
  };
  const uses = summary.sourcesAndUses?.uses ?? {
    equityPurchase: 0,
    fees: 0,
    netRefinancedDebt: 0,
  };

  const sourcesRows = toSourceUseRows(sources, {
    sponsorEquity: 'Sponsor Equity',
    managementRollover: 'Management Rollover',
    termLoan: 'Term Loan',
    revolver: 'Revolver',
  });
  const usesRows = toSourceUseRows(uses, {
    equityPurchase: 'Equity Purchase',
    fees: 'Fees',
    netRefinancedDebt: 'Refinanced Debt',
  });
  const sourcesTotal = sourcesRows.reduce((sum, row) => sum + row.amount, 0);
  const usesTotal = usesRows.reduce((sum, row) => sum + row.amount, 0);
  const reconciliation = sourcesTotal - usesTotal;

  const debtSchedule = summary.debtSchedule || [];
  const totalDebtAt = (idx: number) => {
    const row = debtSchedule[idx];
    if (!row) return 0;
    return (row.endingDebt ?? 0) + (row.revolverBalance ?? 0);
  };
  const year0Debt = summary.netDebt;
  const year1Debt = debtSchedule.length > 0 ? totalDebtAt(0) : year0Debt;
  const year2Debt = debtSchedule.length > 1 ? totalDebtAt(1) : year1Debt;
  const exitDebt = debtSchedule.length > 0 ? totalDebtAt(debtSchedule.length - 1) : year2Debt;

  return {
    dealTerms: {
      entryMultiple: summary.entry.entryMultiple,
      entryPrice: summary.entry.entryEV,
      leverageMultiple: summary.entry.leverageMultiple,
      holdPeriod: inputs.exit.holdPeriodYears,
      exitMultiple: summary.exit.exitMultiple,
    },
    sourcesAndUses: {
      sources: sourcesRows,
      uses: usesRows,
      sourcesTotal,
      usesTotal,
      reconciles: Math.abs(reconciliation) < 0.01,
      mismatch: Math.abs(reconciliation) >= 0.01 ? reconciliation : undefined,
    },
    returns: {
      irr: summary.exit.irr,
      moic: summary.exit.moic,
    },
    debtPaydown: {
      year0: year0Debt,
      year1: year1Debt,
      year2: year2Debt,
      exit: exitDebt,
      periods: ['Year 0', 'Year 1', 'Year 2', `Exit (Year ${inputs.exit.holdPeriodYears})`],
    },
    modelChecks: {
      sourcesUsesBalanced: Math.abs(reconciliation) < 0.01,
    },
    valuation,
  };
};

const ensureValuation = (valuation: LBOOutput['valuation']): LBOOutput['valuation'] => {
  const fallback: LboOutputField<number> = { reason: 'Workbook valuation outputs unavailable' };
  return {
    enterpriseValue: valuation.enterpriseValue ?? fallback,
    equityValue: valuation.equityValue ?? fallback,
    netDebt: valuation.netDebt ?? fallback,
    sharesOutstanding: valuation.sharesOutstanding ?? fallback,
    pricePerShare: valuation.pricePerShare ?? fallback,
    irr: valuation.irr ?? fallback,
    moic: valuation.moic ?? fallback,
    units: valuation.units ?? { reason: 'Workbook valuation outputs unavailable' },
  };
};

export async function runLboPipeline(
  rawInputs: LboDealInputs,
  options: LboPipelineOptions
): Promise<LboPipelineResult> {
  const traceId = options.traceId;
  const modelId = options.modelId ?? randomUUID();

  const parsed = LboDealInputsSchema.parse(rawInputs);
  const ticker = parsed.company.ticker;
  const companyName = parsed.company.name;

  const normalizedFinancials = options.normalizedFinancials;
  if (!normalizedFinancials) {
    throw new Error('Missing required LBO input: normalized financials');
  }

  const { assumptions: operatingAssumptions, appliedDefaults } = normalizeOperatingAssumptions(
    options.operatingAssumptions,
    normalizedFinancials
  );

  const sliderAssumptions: RunLboModelParams['sliderAssumptions'] = {
    revenueGrowth: requireFinite(operatingAssumptions.revenueGrowth, 'Revenue growth'),
    ebitdaMargin: requireFinite(operatingAssumptions.ebitdaMargin, 'EBITDA margin'),
    capexPercent: requireFinite(operatingAssumptions.capexPercent, 'Capex percent'),
    daPercent: requireFinite(operatingAssumptions.daPercent, 'D&A percent'),
    nwcPercent: requireFinite(operatingAssumptions.nwcPercent, 'NWC percent'),
    taxRate: requireFinite(operatingAssumptions.taxRate, 'Tax rate'),
    entryMultiple: requireFinite(parsed.entry.ebitdaMultiple, 'Entry EBITDA multiple'),
    exitMultiple: requireFinite(parsed.exit.ebitdaMultiple, 'Exit EBITDA multiple'),
    leverageMultiple: requireFinite(parsed.leverage.targetDebtToEbitda, 'Target leverage'),
    transactionFeesPercent: requireFinite(parsed.fees.transactionFeePct / 100, 'Transaction fees (%)'),
    offerPremium: requireFinite(parsed.entry.offerPremiumPct / 100, 'Offer premium (%)'),
    forecastYears: requireFinite(parsed.exit.holdPeriodYears, 'Hold period (years)'),
    termLoanBRate: requireFinite(parsed.debtPricing.termLoanBRatePct / 100, 'Term Loan B rate (%)'),
    revolverRate: requireFinite(parsed.debtPricing.revolverRatePct / 100, 'Revolver rate (%)'),
    minimumCash: requireFinite(parsed.liquidity.minimumCashMm, 'Minimum cash balance'),
    financingFeesPercent: requireFinite(parsed.fees.financingFeePct / 100, 'Financing fees (%)'),
  };

  const { getSector } = await import('@/lib/sectorMapping');
  const sectorHint = getSector(ticker, companyName);

  const workbook = new ExcelJS.Workbook();
  const { summary } = await buildLboWorkbook({
    workbook,
    ticker,
    companyName,
    sectorHint,
    normalizedFinancials,
    sliderAssumptions,
    excelOverrides: {},
    advancedOptions: mapAdvancedOptions(parsed.advanced),
  });

  const valuationOutputs = ensureValuation(readLboValuationOutputs(workbook));
  const lboOutput = buildLboOutput(summary, parsed, valuationOutputs);

  const previewAssumptions = {
    entryMultiple: parsed.entry.ebitdaMultiple,
    exitMultiple: parsed.exit.ebitdaMultiple,
    revenueGrowth: toPercent(operatingAssumptions.revenueGrowth),
    ebitdaMargin: toPercent(operatingAssumptions.ebitdaMargin),
  };
  const preview = buildLboPreview(summary, previewAssumptions);

  const buffer = await workbook.xlsx.writeBuffer();
  const workbookBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  const missingR2Env = checkR2Env();
  const canUseLocalExport = process.env.NODE_ENV !== 'production';
  const safeKeyTicker = ticker.replace(/[^A-Z0-9]+/gi, '').toUpperCase() || 'MODEL';
  const filename = `${safeKeyTicker}-lbo.xlsx`;
  const r2Key = `models/${modelId}/${safeKeyTicker}-lbo.xlsx`;

  let downloadUrl: string;
  let filePath: string | undefined;
  let artifactProvider: 'r2' | 'local';
  let artifactKey: string;

  if (missingR2Env.length > 0) {
    if (!canUseLocalExport) {
      throw new Error(`R2 env missing: ${missingR2Env.join(', ')}`);
    }
    const localDir = path.resolve(process.cwd(), LOCAL_EXPORT_DIR, modelId);
    await mkdir(localDir, { recursive: true });
    filePath = path.join(localDir, filename);
    await writeFile(filePath, workbookBuffer);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    downloadUrl = new URL(`/api/models/${encodeURIComponent(modelId)}/download-local`, baseUrl).toString();
    artifactProvider = 'local';
    artifactKey = filePath;
  } else {
    downloadUrl = await uploadXlsxToR2({
      key: r2Key,
      buffer: workbookBuffer,
      filename,
    });
    artifactProvider = 'r2';
    artifactKey = r2Key;
  }

  return {
    modelId,
    traceId,
    status: 'success',
    artifact: {
      provider: artifactProvider,
      key: artifactKey,
      downloadUrl,
      fileName: filename,
    },
    preview,
    metrics: preview?.keyMetrics,
    warnings: [],
    lboSummary: summary,
    lboOutput,
    appliedDefaults,
  };
}

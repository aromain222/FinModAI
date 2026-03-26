import type ExcelJS from 'exceljs';
import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import { DcfSpecSchema, type DcfSpec } from '@/lib/modeling/dcfSpec';
import { buildDcfWorkbook, evaluateDcfSpec } from '@/lib/modeling/buildDcfWorkbook';
import {
  mergeAndCenter,
  setupSheet,
  styleFormula,
  styleLabel,
  styleOutput,
  styleSectionHeader,
  styleTableHeader,
  styleThinGrid,
  styleTitle,
} from '@/lib/model-generator/excel/formatting';

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function safeNumber(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'dcf_model';
}

function buildSensitivityAxis(base: number, deltas: number[], min: number, max: number): number[] {
  return deltas
    .map((delta) => Number(Math.min(max, Math.max(min, base + delta)).toFixed(4)))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function normalizeYears(payload: AnalystDcfDemoPayload): number {
  const candidates = [
    payload.years,
    payload.forecast?.length,
    payload.assumptions?.revenueGrowth?.length,
    payload.assumptions?.ebitMargin?.length,
  ].filter((value): value is number => Number.isInteger(value) && value > 0);
  return Math.min(10, Math.max(3, candidates[0] ?? 5));
}

function normalizeSeries(series: number[] | null | undefined, years: number, fallback: number): number[] {
  const cleaned = (series ?? []).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (cleaned.length >= years) return cleaned.slice(0, years);
  const fill = cleaned[cleaned.length - 1] ?? fallback;
  return [...cleaned, ...Array.from({ length: years - cleaned.length }, () => fill)];
}

function buildNormalizedPayload(payload: AnalystDcfDemoPayload): AnalystDcfDemoPayload {
  const years = normalizeYears(payload);
  const inferredMargin =
    payload.baseMetrics.revenueLtm > 0 && payload.baseMetrics.ebitdaLtm > 0
      ? Math.max(0.08, Math.min(0.4, payload.baseMetrics.ebitdaLtm / payload.baseMetrics.revenueLtm - safeNumber(payload.assumptions?.daPctRevenue, 0.03)))
      : 0.2;

  const normalizedAssumptions = {
    revenueGrowth: normalizeSeries(payload.assumptions?.revenueGrowth, years, 0.06),
    ebitMargin: normalizeSeries(payload.assumptions?.ebitMargin, years, inferredMargin),
    taxRate: safeNumber(payload.assumptions?.taxRate, 0.21),
    daPctRevenue: safeNumber(payload.assumptions?.daPctRevenue, 0.03),
    capexPctRevenue: safeNumber(payload.assumptions?.capexPctRevenue, 0.04),
    nwcPctRevenue: safeNumber(payload.assumptions?.nwcPctRevenue, 0.01),
    wacc: safeNumber(payload.assumptions?.wacc, 0.095),
    terminalGrowth: safeNumber(payload.assumptions?.terminalGrowth, 0.03),
  };

  const normalized: AnalystDcfDemoPayload = {
    ...payload,
    years,
    assumptions: normalizedAssumptions,
    forecast: Array.isArray(payload.forecast) ? payload.forecast.filter((row) => row && Number.isFinite(row.year)) : [],
  };

  return normalized;
}

function mapPayloadToSpec(payload: AnalystDcfDemoPayload): DcfSpec {
  const firstForecastYear = payload.forecast[0]?.year ?? new Date().getUTCFullYear() + 1;
  const startYear = firstForecastYear - 1;
  const baseEbitMargin = payload.assumptions.ebitMargin[0] ?? 0.2;

  return DcfSpecSchema.parse({
    company: {
      name: payload.companyName,
      ticker: payload.ticker,
      currency: payload.currency,
    },
    periods: {
      start_year: startYear,
      years: payload.years,
    },
    base_year: {
      revenue: safeNumber(payload.baseMetrics.revenueLtm, 0),
      ebit_margin: baseEbitMargin,
    },
    forecast: {
      revenue_growth: [...payload.assumptions.revenueGrowth],
      ebit_margin: [...payload.assumptions.ebitMargin],
      tax_rate: payload.assumptions.taxRate,
      da_pct_rev: payload.assumptions.daPctRevenue,
      capex_pct_rev: payload.assumptions.capexPctRevenue,
      nwc_pct_rev: payload.assumptions.nwcPctRevenue,
    },
    valuation: {
      wacc: payload.assumptions.wacc,
      terminal: {
        method: 'gordon',
        g: payload.assumptions.terminalGrowth,
      },
    },
    outputs: {
      sensitivity: {
        wacc: buildSensitivityAxis(payload.assumptions.wacc, [-0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015], 0.06, 0.16),
        terminal_g: buildSensitivityAxis(payload.assumptions.terminalGrowth, [-0.01, -0.005, 0, 0.005, 0.01], 0.01, 0.04),
      },
    },
  });
}

function ensureForecast(payload: AnalystDcfDemoPayload, spec: DcfSpec): AnalystDcfDemoPayload['forecast'] {
  if (payload.forecast.length >= payload.years) {
    return payload.forecast.slice(0, payload.years);
  }

  const evaluation = evaluateDcfSpec(spec);
  return evaluation.revenue.map((revenue, index) => ({
    year: spec.periods.start_year + index + 1,
    revenue,
    ebit: evaluation.ebit[index],
    fcff: evaluation.fcff[index],
  }));
}

function appendSummarySheet(workbook: ExcelJS.Workbook, payload: AnalystDcfDemoPayload) {
  const sheet = workbook.addWorksheet('Demo Summary');
  setupSheet(sheet, {
    freezeRows: 3,
    freezeCols: 1,
    tabColor: 'FF1D4ED8',
    columnWidths: [28, 18, 28, 28, 18, 28],
  });

  sheet.getCell('A1').value = `${payload.companyName} DCF Demo Summary`;
  mergeAndCenter(sheet, 'A1:F1');
  styleTitle(sheet.getCell('A1'));

  styleSectionHeader(sheet, 3, 'Run Context', 6);
  [
    ['Prompt', payload.prompt, 'Prompt run from Analyst Chat'],
    ['Ticker', payload.ticker, payload.companyName],
    ['Generated', formatDate(new Date()), 'Workbook export date'],
    ['As of date', payload.asOfDate ? payload.asOfDate.slice(0, 10) : 'n/a', 'Snapshot reference date'],
    ['Source', payload.source, 'Analyst Chat demo payload source'],
  ].forEach(([label, value, context], index) => {
    const row = 4 + index;
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`B${row}`).value = value;
    sheet.getCell(`C${row}`).value = context;
    styleLabel(sheet.getCell(`A${row}`));
    styleFormula(sheet.getCell(`B${row}`));
    styleFormula(sheet.getCell(`C${row}`));
  });
  styleThinGrid(sheet, 4, 8, 1, 3);

  styleSectionHeader(sheet, 10, 'Valuation Readout', 6);
  styleTableHeader(sheet, 11, 1, 6);
  ['Metric', 'Value', 'Context', 'Metric', 'Value', 'Context'].forEach((label, index) => {
    sheet.getCell(11, 1 + index).value = label;
  });
  [
    ['Base EV', payload.scenarios.base.enterpriseValue, 'currency', 'Base enterprise value'],
    ['Base Equity Value', payload.scenarios.base.equityValue, 'currency', 'Base equity value'],
    ['Base Value / Share', payload.scenarios.base.pricePerShare, 'currency', 'Base implied share price'],
    ['Cached Price', payload.baseMetrics.sharePrice, 'currency', 'Current price anchor'],
    ['Upside / Downside', payload.scenarios.base.upsidePct, 'percent', 'Base case vs cached price'],
    ['Terminal Mix', payload.scenarios.base.terminalValueWeight, 'percent', 'Terminal value as % of EV'],
  ].forEach(([label, value, kind, context], index) => {
    const row = 12 + Math.floor(index / 2);
    const colOffset = index % 2 === 0 ? 0 : 3;
    sheet.getCell(row, 1 + colOffset).value = label;
    sheet.getCell(row, 2 + colOffset).value = value ?? 'n/a';
    sheet.getCell(row, 3 + colOffset).value = context;
    styleLabel(sheet.getCell(row, 1 + colOffset));
    styleFormula(sheet.getCell(row, 2 + colOffset), value === null ? undefined : (kind as 'currency' | 'percent'));
    styleFormula(sheet.getCell(row, 3 + colOffset));
  });
  styleThinGrid(sheet, 11, 14, 1, 6);

  styleSectionHeader(sheet, 16, 'Scenario Summary', 6);
  styleTableHeader(sheet, 17, 1, 6);
  ['Scenario', 'EV', 'Equity Value', 'Value / Share', 'Upside / Downside', 'Terminal Mix'].forEach((label, index) => {
    sheet.getCell(17, 1 + index).value = label;
  });

  (['bear', 'base', 'bull'] as const).forEach((key, index) => {
    const scenario = payload.scenarios[key];
    const row = 18 + index;
    sheet.getCell(`A${row}`).value = scenario.name;
    sheet.getCell(`B${row}`).value = scenario.enterpriseValue;
    sheet.getCell(`C${row}`).value = scenario.equityValue;
    sheet.getCell(`D${row}`).value = scenario.pricePerShare;
    sheet.getCell(`E${row}`).value = scenario.upsidePct;
    sheet.getCell(`F${row}`).value = scenario.terminalValueWeight;
    styleLabel(sheet.getCell(`A${row}`));
    ['B', 'C', 'D'].forEach((col) => styleOutput(sheet.getCell(`${col}${row}`), 'currency'));
    ['E', 'F'].forEach((col) => styleOutput(sheet.getCell(`${col}${row}`), 'percent'));
  });
  styleThinGrid(sheet, 17, 20, 1, 6);

  styleSectionHeader(sheet, 22, 'Base Metrics', 6);
  styleTableHeader(sheet, 23, 1, 6);
  ['Metric', 'Value', 'Context', 'Metric', 'Value', 'Context'].forEach((label, index) => {
    sheet.getCell(23, 1 + index).value = label;
  });
  [
    ['LTM Revenue', payload.baseMetrics.revenueLtm, 'currency', 'Revenue base year'],
    ['LTM EBITDA', payload.baseMetrics.ebitdaLtm, 'currency', 'EBITDA anchor'],
    ['Net Income', payload.baseMetrics.netIncomeLtm, 'currency', 'Latest net income'],
    ['Cash', payload.baseMetrics.cash, 'currency', 'Cash balance'],
    ['Total Debt', payload.baseMetrics.totalDebt, 'currency', 'Gross debt balance'],
    ['Net Debt', payload.baseMetrics.netDebt, 'currency', 'Debt less cash'],
    ['Shares Outstanding', payload.baseMetrics.sharesOutstanding, 'number', 'Diluted share count'],
    ['Cached Price', payload.baseMetrics.sharePrice, 'currency', 'Snapshot share price'],
  ].forEach(([label, value, kind, context], index) => {
    const row = 24 + Math.floor(index / 2);
    const colOffset = index % 2 === 0 ? 0 : 3;
    sheet.getCell(row, 1 + colOffset).value = label;
    sheet.getCell(row, 2 + colOffset).value = value ?? 'n/a';
    sheet.getCell(row, 3 + colOffset).value = context;
    styleLabel(sheet.getCell(row, 1 + colOffset));
    styleFormula(sheet.getCell(row, 2 + colOffset), value === null ? undefined : (kind as 'currency' | 'number'));
    styleFormula(sheet.getCell(row, 3 + colOffset));
  });
  styleThinGrid(sheet, 23, 27, 1, 6);

  styleSectionHeader(sheet, 29, 'Key Assumptions', 6);
  styleTableHeader(sheet, 30, 1, 6);
  ['Metric', 'Value', 'Context', 'Metric', 'Value', 'Context'].forEach((label, index) => {
    sheet.getCell(30, 1 + index).value = label;
  });
  [
    ['WACC', payload.assumptions.wacc, 'percent', 'Discount rate'],
    ['Terminal Growth', payload.assumptions.terminalGrowth, 'percent', 'Perpetuity growth'],
    ['Tax Rate', payload.assumptions.taxRate, 'percent', 'Modeled tax rate'],
    ['D&A % Revenue', payload.assumptions.daPctRevenue, 'percent', 'Depreciation and amortization'],
    ['Capex % Revenue', payload.assumptions.capexPctRevenue, 'percent', 'Capital intensity'],
    ['NWC % Revenue', payload.assumptions.nwcPctRevenue, 'percent', 'Working capital drag'],
  ].forEach(([label, value, kind, context], index) => {
    const row = 31 + Math.floor(index / 2);
    const colOffset = index % 2 === 0 ? 0 : 3;
    sheet.getCell(row, 1 + colOffset).value = label;
    sheet.getCell(row, 2 + colOffset).value = value;
    sheet.getCell(row, 3 + colOffset).value = context;
    styleLabel(sheet.getCell(row, 1 + colOffset));
    styleFormula(sheet.getCell(row, 2 + colOffset), kind as 'percent');
    styleFormula(sheet.getCell(row, 3 + colOffset));
  });
  styleThinGrid(sheet, 30, 33, 1, 6);

  styleSectionHeader(sheet, 35, 'Forecast Snapshot', 4);
  styleTableHeader(sheet, 36, 1, 4);
  ['Year', 'Revenue', 'EBIT', 'FCFF'].forEach((label, index) => {
    sheet.getCell(36, 1 + index).value = label;
  });
  payload.forecast.forEach((row, index) => {
    const excelRow = 37 + index;
    sheet.getCell(`A${excelRow}`).value = row.year;
    sheet.getCell(`B${excelRow}`).value = row.revenue;
    sheet.getCell(`C${excelRow}`).value = row.ebit;
    sheet.getCell(`D${excelRow}`).value = row.fcff;
    styleFormula(sheet.getCell(`A${excelRow}`), 'number');
    styleFormula(sheet.getCell(`B${excelRow}`), 'currency');
    styleFormula(sheet.getCell(`C${excelRow}`), 'currency');
    styleFormula(sheet.getCell(`D${excelRow}`), 'currency');
  });
  styleThinGrid(sheet, 36, 36 + payload.forecast.length, 1, 4);

  const notesStartRow = 37 + payload.forecast.length + 2;
  styleSectionHeader(sheet, notesStartRow, 'Memo & Notes', 6);
  sheet.mergeCells(`A${notesStartRow + 1}:F${notesStartRow + 3}`);
  sheet.getCell(`A${notesStartRow + 1}`).value = payload.memo;
  styleFormula(sheet.getCell(`A${notesStartRow + 1}`));
  sheet.getCell(`A${notesStartRow + 1}`).alignment = { wrapText: true, vertical: 'top' };

  let rowPointer = notesStartRow + 5;
  if (payload.notes.length > 0) {
    sheet.getCell(`A${rowPointer}`).value = 'Model Notes';
    styleLabel(sheet.getCell(`A${rowPointer}`));
    rowPointer += 1;
    payload.notes.forEach((note) => {
      sheet.mergeCells(`A${rowPointer}:F${rowPointer}`);
      sheet.getCell(`A${rowPointer}`).value = `- ${note}`;
      styleFormula(sheet.getCell(`A${rowPointer}`));
      rowPointer += 1;
    });
  }

  if (payload.warnings.length > 0) {
    rowPointer += 1;
    sheet.getCell(`A${rowPointer}`).value = 'Warnings';
    styleLabel(sheet.getCell(`A${rowPointer}`));
    rowPointer += 1;
    payload.warnings.forEach((warning) => {
      sheet.mergeCells(`A${rowPointer}:F${rowPointer}`);
      sheet.getCell(`A${rowPointer}`).value = `- ${warning}`;
      styleFormula(sheet.getCell(`A${rowPointer}`));
      rowPointer += 1;
    });
  }
}

export async function buildAnalystDcfDemoWorkbook(payload: AnalystDcfDemoPayload): Promise<ExcelJS.Workbook> {
  const normalizedPayload = buildNormalizedPayload(payload);
  if (!(normalizedPayload.baseMetrics.revenueLtm > 0)) {
    throw new Error('DCF export failed because revenue is missing from the Analyst Chat payload.');
  }

  const spec = mapPayloadToSpec(normalizedPayload);
  const workbook = await buildDcfWorkbook(spec);
  appendSummarySheet(workbook, {
    ...normalizedPayload,
    forecast: ensureForecast(normalizedPayload, spec),
  });
  const summarySheetIndex = workbook.worksheets.findIndex((sheet) => sheet.name === 'Demo Summary');
  const activeTab = summarySheetIndex >= 0 ? summarySheetIndex : 0;
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 10_000,
      height: 20_000,
      firstSheet: 0,
      activeTab,
      visibility: 'visible',
    },
  ];
  return workbook;
}

export function buildAnalystDcfFilename(payload: AnalystDcfDemoPayload): string {
  return `CapitalBase_${sanitizeFilename(payload.companyName)}_${sanitizeFilename(payload.ticker)}_DCF_Demo.xlsx`;
}

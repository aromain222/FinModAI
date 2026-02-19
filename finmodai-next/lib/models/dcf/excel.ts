/**
 * DCF Model Excel Generator
 * Institutional-grade DCF model with all required tabs.
 * Uses shared styles for print/freeze and consistent typography.
 */

import ExcelJS from 'exceljs';
import OpenAI from 'openai';
import {
  createNormalStyle,
  createHeaderStyle,
  createInputStyle,
  createFormulaStyle,
  createTotalStyle,
  createSubHeaderStyle,
  applyNumberFormat as baseApplyNumberFormat,
  applyBorders,
  NUMBER_FORMATS,
  setColumnWidths,
  COLORS,
} from '../../excel/formatting';
import {
  applyWorkbookDefaults,
  applySheetDefaults,
  setColumnWidths as setColWidthsKit,
  hideUnusedArea,
  titleBar,
  sectionHeader,
  tableHeader,
  zebraRows,
  inputCell as styleKitInputCell,
  outputCell as styleKitOutputCell,
  bodyCell as styleKitBodyCell,
  borderBox,
} from '../../excel/styleKit';
import { getOpenAIKey } from '@/lib/openaiKey';

const MONEY_NUM_FMT = '#,##0;(#,##0)';
const PERCENT_NUM_FMT = '0.0%';
const SHARES_NUM_FMT = '#,##0.0';
const UNITS_TITLE = 'All figures in USD millions unless otherwise noted.';
const EDITABLE_INPUT_NOTE = 'Blue/filled cells are editable inputs. Other cells are formula-driven.';

function applyNumberFormat(cell: ExcelJS.Cell, format: keyof typeof NUMBER_FORMATS | string): void {
  if (format === 'CURRENCY' || format === 'CURRENCY_NEGATIVE' || format === 'CURRENCY_DECIMALS' || format === MONEY_NUM_FMT) {
    cell.numFmt = MONEY_NUM_FMT;
    return;
  }
  if (format === 'PERCENTAGE' || format === 'PERCENTAGE_DECIMALS') {
    cell.numFmt = PERCENT_NUM_FMT;
    return;
  }
  if (format === 'INTEGER') {
    cell.numFmt = SHARES_NUM_FMT;
    return;
  }
  baseApplyNumberFormat(cell, format);
}

function applyUnitsTitleLine(sheet: ExcelJS.Worksheet): void {
  sheet.getCell(2, 1).value = UNITS_TITLE;
}

function deriveLtmMetrics(output: DCFOutput): { revenueLtm: number; ebitdaLtm: number; netIncomeLtm: number } {
  const revenueLtm = toNumber(output.inputs.revenue, 0);
  const ebitdaMargin = toNumber(output.inputs.ebitdaMargin, 0.25);
  const ebitMargin = toNumber(output.inputs.ebitMargin, Math.max(ebitdaMargin - toNumber(output.inputs.depreciationPctRevenue, 0.05), 0));
  const taxRate = toNumber(output.inputs.taxRate, 0.25);
  const ebitdaLtm = revenueLtm * ebitdaMargin;
  const netIncomeLtm = revenueLtm * ebitMargin * (1 - taxRate);
  return { revenueLtm, ebitdaLtm, netIncomeLtm };
}

async function generateModelBriefSummary(params: {
  companyName: string;
  ticker: string;
  sector: string;
  asOfDate: string;
  enterpriseValue: number;
  equityValue: number;
  impliedPrice: number;
  marketPrice: number | null;
  impliedUpsidePct: number | null;
  wacc: number;
  terminalGrowth: number;
  terminalSharePct: number;
  netDebt: number | null;
  netDebtSource: string;
}): Promise<string> {
  const fallback = `As of ${params.asOfDate}, ${params.companyName} (${params.ticker}) is modeled with enterprise value of ${params.enterpriseValue.toFixed(0)} and equity value of ${params.equityValue.toFixed(0)} in USD millions. Implied value per share is ${params.impliedPrice.toFixed(2)}${params.marketPrice !== null ? ` versus a market price of ${params.marketPrice.toFixed(2)}` : ''}. Core valuation drivers are ${(
    params.wacc * 100
  ).toFixed(1)}% WACC and ${(params.terminalGrowth * 100).toFixed(1)}% terminal growth. Terminal value contributes ${(
    params.terminalSharePct * 100
  ).toFixed(1)}% of enterprise value, which increases duration risk to discount-rate changes. Net debt is ${params.netDebt !== null ? params.netDebt.toFixed(0) : 'unavailable'} and sourced as ${params.netDebtSource}.`;

  const apiKey = getOpenAIKey('service');
  if (!apiKey) return fallback;

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = `Write one paragraph only (4-6 sentences) in a structured institutional tone for an investment committee model brief. No hype, no marketing language. Clearly articulate key valuation drivers and principal risks.\n\nInputs (USD millions unless noted):\n- Company: ${params.companyName}\n- Ticker: ${params.ticker}\n- Sector: ${params.sector}\n- As of date: ${params.asOfDate}\n- Enterprise value: ${params.enterpriseValue}\n- Equity value: ${params.equityValue}\n- Implied price per share: ${params.impliedPrice}\n- Market price: ${params.marketPrice ?? 'N/A'}\n- Implied upside (%): ${params.impliedUpsidePct ?? 'N/A'}\n- WACC (%): ${(params.wacc * 100).toFixed(2)}\n- Terminal growth (%): ${(params.terminalGrowth * 100).toFixed(2)}\n- Terminal value contribution to EV (%): ${(params.terminalSharePct * 100).toFixed(2)}\n- Net debt: ${params.netDebt ?? 'N/A'}\n- Net debt source: ${params.netDebtSource}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a senior sell-side valuation analyst writing concise investment committee summaries.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 220,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return fallback;
    return content.replace(/\n+/g, ' ');
  } catch {
    return fallback;
  }
}

async function createModelBriefSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  companyName: string,
  output: DCFOutput,
  derived: ReturnType<typeof deriveDcfValues>
): Promise<void> {
  const sheet = workbook.addWorksheet('Model Brief');
  const lastDataCol = 4;
  const asOfDate = new Date().toISOString().slice(0, 10);
  const sector = ((output.inputs as any).sector as string) || 'N/A';
  const ltm = deriveLtmMetrics(output);
  const impliedUpsidePct =
    derived.marketPrice !== null && derived.marketPrice !== 0
      ? output.valuation.pricePerShare / derived.marketPrice - 1
      : null;
  const terminalSharePct =
    output.valuation.enterpriseValue !== 0 ? output.valuation.pvOfTerminalValue / output.valuation.enterpriseValue : 0;
  const netDebtSourceLabel =
    output.inputs.netDebtSource === 'estimated_ai' || output.inputs.netDebtSource === 'estimated_rules'
      ? 'Estimated'
      : output.inputs.netDebtSource === 'reported'
      ? 'Reported'
      : 'Unavailable';

  let row = titleBar(sheet, 'Model Brief', lastDataCol);
  applyUnitsTitleLine(sheet);
  row += 1;

  sectionHeader(sheet, row, 'Company Overview', lastDataCol);
  row += 1;

  const companyOverviewRows: Array<{ label: string; value: string | number | null; format?: string }> = [
    { label: 'Company Name', value: companyName },
    { label: 'Ticker', value: ticker },
    { label: 'Sector', value: sector },
    { label: 'As of Date', value: asOfDate },
    { label: 'Revenue (LTM)', value: ltm.revenueLtm, format: 'CURRENCY' },
    { label: 'EBITDA (LTM)', value: ltm.ebitdaLtm, format: 'CURRENCY' },
    { label: 'Net Income (LTM)', value: ltm.netIncomeLtm, format: 'CURRENCY' },
  ];

  for (const item of companyOverviewRows) {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const valueCell = sheet.getCell(row, 2);
    if (item.value === null || item.value === '') {
      applyMutedValue(valueCell);
    } else {
      valueCell.value = item.value as any;
      if (item.format) applyNumberFormat(valueCell, item.format);
      styleKitBodyCell(valueCell);
    }
    row += 1;
  }

  row += 1;
  sectionHeader(sheet, row, 'Valuation Snapshot', lastDataCol);
  row += 1;

  const valuationRows: Array<{ label: string; value: number | null; format: string }> = [
    { label: 'Enterprise Value', value: output.valuation.enterpriseValue, format: 'CURRENCY' },
    { label: 'Equity Value', value: output.valuation.equityValue, format: 'CURRENCY' },
    { label: 'Implied Price per Share', value: output.valuation.pricePerShare, format: 'CURRENCY' },
    { label: 'Market Price', value: derived.marketPrice, format: 'CURRENCY' },
    { label: 'Implied Upside %', value: impliedUpsidePct, format: 'PERCENTAGE' },
  ];

  for (const item of valuationRows) {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const valueCell = sheet.getCell(row, 2);
    if (item.value === null) {
      applyMutedValue(valueCell);
    } else {
      valueCell.value = item.value;
      applyNumberFormat(valueCell, item.format);
      styleKitOutputCell(valueCell);
    }
    row += 1;
  }

  row += 1;
  sectionHeader(sheet, row, 'Key Assumptions', lastDataCol);
  row += 1;

  const keyAssumptionsRows: Array<{ label: string; value: number | null; format: string }> = [
    { label: 'Revenue Growth', value: toNumber(output.inputs.revenueGrowth, 0.08), format: 'PERCENTAGE' },
    { label: 'EBITDA Margin', value: toNumber(output.inputs.ebitdaMargin, 0.25), format: 'PERCENTAGE' },
    { label: 'WACC', value: toNumber(output.inputs.wacc, 0.1), format: 'PERCENTAGE' },
    { label: 'Terminal Growth', value: toNumber(output.inputs.terminalGrowth, 0.025), format: 'PERCENTAGE' },
    { label: `Net Debt (${netDebtSourceLabel})`, value: derived.netDebt, format: 'CURRENCY' },
  ];

  for (const item of keyAssumptionsRows) {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const valueCell = sheet.getCell(row, 2);
    if (item.value === null) {
      applyMutedValue(valueCell);
    } else {
      valueCell.value = item.value;
      applyNumberFormat(valueCell, item.format);
      styleKitOutputCell(valueCell);
    }
    row += 1;
  }

  row += 1;
  sectionHeader(sheet, row, 'Risk Notes', lastDataCol);
  row += 1;
  const riskRows: Array<{ label: string; value: string | number; format?: string }> = [
    { label: '% of EV from Terminal Value', value: terminalSharePct, format: 'PERCENTAGE' },
    {
      label: 'Leverage sensitivity note',
      value:
        derived.netDebt !== null && output.valuation.enterpriseValue > 0 && derived.netDebt / output.valuation.enterpriseValue > 0.35
          ? 'Higher leverage increases equity sensitivity to EV downside and financing assumptions.'
          : 'Leverage profile is moderate; EV-to-equity transmission remains manageable under base case assumptions.',
    },
    {
      label: 'WACC sensitivity note',
      value:
        terminalSharePct > 0.6
          ? 'Valuation is duration-heavy; modest increases in WACC can compress implied equity value materially.'
          : 'Valuation remains sensitive to discount rate changes, but terminal-value concentration is within typical range.',
    },
  ];

  for (const item of riskRows) {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = item.value as any;
    if (item.format) applyNumberFormat(valueCell, item.format);
    valueCell.alignment = { vertical: 'top', horizontal: item.format ? 'right' : 'left', wrapText: true };
    valueCell.font = createNormalStyle().font;
    row += 1;
  }

  row += 1;
  sectionHeader(sheet, row, 'Executive Summary', lastDataCol);
  row += 1;

  const summary = await generateModelBriefSummary({
    companyName,
    ticker,
    sector,
    asOfDate,
    enterpriseValue: output.valuation.enterpriseValue,
    equityValue: output.valuation.equityValue,
    impliedPrice: output.valuation.pricePerShare,
    marketPrice: derived.marketPrice,
    impliedUpsidePct,
    wacc: toNumber(output.inputs.wacc, 0.1),
    terminalGrowth: toNumber(output.inputs.terminalGrowth, 0.025),
    terminalSharePct,
    netDebt: derived.netDebt,
    netDebtSource: netDebtSourceLabel,
  });

  sheet.mergeCells(row, 1, row + 3, lastDataCol);
  const summaryCell = sheet.getCell(row, 1);
  summaryCell.value = summary;
  summaryCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  summaryCell.font = createNormalStyle().font;

  setColWidthsKit(sheet, [34, 34, 18, 18]);
  const lastUsedRow = row + 3;
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

export interface DCFInputs {
  ticker: string;
  companyName?: string;
  revenue: number | number[];
  revenueGrowth?: number | number[];
  ebitdaMargin?: number | number[];
  ebitMargin?: number | number[];
  taxRate?: number;
  depreciationPctRevenue?: number | number[];
  capexPctRevenue?: number | number[];
  nwcPctRevenue?: number | number[];
  wacc?: number;
  waccComponents?: {
    riskFreeRate?: number;
    equityRiskPremium?: number;
    beta?: number;
    costOfDebt?: number;
    taxRate?: number;
    debtToEquity?: number;
    debtPct?: number;
    equityPct?: number;
  };
  terminalGrowth?: number;
  exitMultiple?: number;
  useExitMultiple?: boolean;
  projectionYears?: number;
  netDebt?: number | null;
  netDebtSource?: 'reported' | 'estimated_rules' | 'estimated_ai' | 'unknown';
  netDebtNote?: string;
  sharesOutstanding?: number | null;
  sharesSource?: 'Reported' | 'Derived (Mkt Cap ÷ Price)' | 'User Provided' | 'Unavailable';
  currency?: string;
  cash?: number | null;
  totalDebt?: number | null;
  marketPrice?: number;
  marketCap?: number;
  price?: number;
  sharePrice?: number;
  // Data source tracking
  dataSources?: {
    revenue?: 'Reported' | 'Derived' | 'User';
    ebitda?: 'Reported' | 'Derived' | 'User';
    sharesOutstanding?: 'Reported' | 'Derived' | 'User';
    wacc?: 'Reported' | 'Derived' | 'User';
    [key: string]: 'Reported' | 'Derived' | 'User' | undefined;
  };
}

export interface DCFOutput {
  ticker: string;
  companyName: string;
  inputs: DCFInputs;
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    ebit: number;
    nopat: number;
    depreciation: number;
    capex: number;
    nwcChange: number;
    unleveredFCF: number;
  }>;
  valuation: {
    pvOfProjectedFCF: number;
    terminalValue: number;
    pvOfTerminalValue: number;
    enterpriseValue: number;
    netDebt: number | null;
    equityValue: number;
    sharesOutstanding: number;
    pricePerShare: number;
  };
  waccBreakdown?: {
    riskFreeRate: number;
    equityRiskPremium: number;
    beta: number;
    costOfEquity: number;
    costOfDebt: number;
    taxRate: number;
    debtToEquity: number;
    wacc: number;
  };
}

function toNumber(value: number | number[] | undefined, fallback: number): number {
  if (Array.isArray(value)) {
    const first = value.find(v => typeof v === 'number' && isFinite(v));
    return typeof first === 'number' ? first : fallback;
  }
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function setFormula(cell: ExcelJS.Cell, formula: string, result: number | string | null): void {
  cell.value = { formula, result: result ?? undefined };
}

function isFormulaCell(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!('formula' in value)) return false;
  const formulaValue = (value as { formula?: unknown }).formula;
  return typeof formulaValue === 'string' && formulaValue.trim().length > 0;
}

function colToLetter(col: number): string {
  let letter = '';
  let temp = col;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

const INPUT_FILL = 'FFE6F2FF';
const STYLE_KIT_INPUT_FILL = 'FFE8F4FC';
const INPUT_FILL_ARGB_VALUES = new Set([INPUT_FILL, STYLE_KIT_INPUT_FILL]);

function isInputCell(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill;
  if (!fill || fill.type !== 'pattern') return false;
  const patternFill = fill as ExcelJS.FillPattern;
  const argb = patternFill.fgColor?.argb;
  return typeof argb === 'string' && INPUT_FILL_ARGB_VALUES.has(argb.toUpperCase());
}

function addEditableInputNote(
  sheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  endCol: number
): void {
  const cell = sheet.getCell(row, startCol);
  cell.value = EDITABLE_INPUT_NOTE;
  cell.style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, size: 9, italic: true, color: { argb: COLORS.BORDER_GREY } },
    alignment: { vertical: 'middle', horizontal: 'right', wrapText: true },
  };
  if (endCol > startCol) {
    try {
      sheet.mergeCells(row, startCol, row, endCol);
    } catch {
      // merge may already exist depending on downstream transforms
    }
  }
}

async function applyFormulaModelProtection(
  workbook: ExcelJS.Workbook,
  modelType: 'dcf' | 'comps'
): Promise<void> {
  const keyFormulaAddresses: string[] = [];
  let countInputsUnlocked = 0;
  let countFormulaCells = 0;

  for (const sheet of workbook.worksheets) {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const inputCell = isInputCell(cell);
        const formulaCell = isFormulaCell(cell);
        if (!inputCell && !formulaCell) return;

        if (inputCell) {
          cell.protection = { ...(cell.protection ?? {}), locked: false };
          countInputsUnlocked += 1;
        } else {
          cell.protection = { ...(cell.protection ?? {}), locked: true };
        }

        if (formulaCell) {
          countFormulaCells += 1;
          if (keyFormulaAddresses.length < 12) {
            keyFormulaAddresses.push(`${sheet.name}!${cell.address}`);
          }
        }
      });
    });

    await sheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertRows: false,
      insertColumns: false,
      deleteRows: false,
      deleteColumns: false,
      sort: false,
      autoFilter: true,
      pivotTables: false,
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug({
      modelType,
      countInputsUnlocked,
      countFormulaCells,
      keyFormulaAddresses,
    });
  }
}

function applyLabelStyle(cell: ExcelJS.Cell): void {
  cell.style = {
    ...createNormalStyle(),
    alignment: { vertical: 'middle', horizontal: 'left' },
  };
}

function applyInputCellStyle(cell: ExcelJS.Cell): void {
  const base = createInputStyle();
  cell.style = {
    ...base,
    font: { ...base.font, color: { argb: COLORS.BLACK } },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: INPUT_FILL },
    },
    border: {
      top: { style: 'medium', color: { argb: COLORS.BORDER_GREY } },
      bottom: { style: 'medium', color: { argb: COLORS.BORDER_GREY } },
      left: { style: 'medium', color: { argb: COLORS.BORDER_GREY } },
      right: { style: 'medium', color: { argb: COLORS.BORDER_GREY } },
    },
    alignment: { vertical: 'middle', horizontal: 'right' },
  };
}

function applyMutedValue(cell: ExcelJS.Cell): void {
  cell.value = '—';
  cell.style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: 'FF9CA3AF' }, italic: true },
    alignment: { vertical: 'middle', horizontal: 'right' },
  };
}

function applyEstimatedValueStyle(cell: ExcelJS.Cell): void {
  const base = createNormalStyle();
  cell.style = {
    ...base,
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF4CC' },
    },
    font: { ...base.font, color: { argb: COLORS.BLACK } },
    alignment: { vertical: 'middle', horizontal: 'right' },
  };
}

function applyZebraStriping(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): void {
  for (let row = startRow; row <= endRow; row++) {
    if ((row - startRow) % 2 === 1) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = worksheet.getCell(row, col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.LIGHT_GREY },
        };
      }
    }
  }
}

function setSheetDefaults(sheet: ExcelJS.Worksheet, freezeRow: number, freezeCol: number = 1): void {
  sheet.properties.showGridLines = false;
  sheet.views = [{ state: 'frozen', xSplit: freezeCol, ySplit: freezeRow }];
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function deriveDcfValues(output: DCFOutput) {
  const inputs = output.inputs as any;
  const rawShares =
    asNumber(output.valuation?.sharesOutstanding) ??
    asNumber(inputs.sharesOutstanding) ??
    asNumber(inputs.sharesOutstandingMillions);
  const sharesOutstanding = rawShares ?? 0;
  const sharesMissing = !(sharesOutstanding > 0);
  const sharesSafe = sharesMissing ? 1 : sharesOutstanding;

  const rawNetDebt =
    asNumber(inputs.netDebt) ??
    asNumber(inputs.netDebtMillions) ??
    asNumber(output.valuation?.netDebt);
  const cash = asNumber(inputs.cash) ?? asNumber(inputs.cashMillions);
  const totalDebt = asNumber(inputs.totalDebt) ?? asNumber(inputs.totalDebtMillions);
  const netDebt =
    rawNetDebt ??
    (cash !== null && totalDebt !== null ? totalDebt - cash : null);
  const netDebtMissing = netDebt === null;
  const netDebtForMath = netDebt ?? 0;

  const directMarketPrice =
    asNumber(inputs.marketPrice) ??
    asNumber(inputs.price) ??
    asNumber(inputs.sharePrice);
  const marketCap = asNumber(inputs.marketCap) ?? asNumber(inputs.market_cap);
  const marketPrice =
    directMarketPrice ??
    (marketCap !== null && sharesOutstanding > 0 ? marketCap / sharesOutstanding : null);

  return {
    sharesOutstanding,
    sharesSafe,
    sharesMissing,
    netDebt,
    netDebtMissing,
    netDebtForMath,
    cash,
    totalDebt,
    marketPrice,
  };
}

function getValuationRowMap(projectionYears: number) {
  const inputsStartRow = 5;
  const waccRow = 5;
  const terminalGrowthRow = 6;
  const netDebtInputRow = 7;
  const sharesInputRow = 8;
  const marketPriceInputRow = 9;
  const headerRow = 11;
  const startDataRow = 12;
  const endDataRow = startDataRow + projectionYears - 1;
  const terminalValueRow = endDataRow + 2;
  const pvTerminalRow = terminalValueRow + 1;
  const pvFcfRow = pvTerminalRow + 1;
  const enterpriseValueRow = pvFcfRow + 1;
  const bridgeStartRow = enterpriseValueRow + 3;
  const marketCompareStartRow = bridgeStartRow + 7;
  const marketPriceRow = marketCompareStartRow + 2;
  const premiumRow = marketCompareStartRow + 3;
  const diffRow = marketCompareStartRow + 4;
  return {
    headerRow,
    startDataRow,
    endDataRow,
    terminalValueRow,
    pvTerminalRow,
    pvFcfRow,
    enterpriseValueRow,
    bridgeStartRow,
    netDebtRow: bridgeStartRow + 1,
    equityRow: bridgeStartRow + 2,
    sharesRow: bridgeStartRow + 3,
    priceRow: bridgeStartRow + 4,
    marketPriceRow,
    premiumRow,
    diffRow,
    waccRow,
    terminalGrowthRow,
    netDebtInputRow,
    sharesInputRow,
    marketPriceInputRow,
    marketCompareStartRow,
  };
}

/**
 * Generate comprehensive DCF model workbook
 */
export async function generateDCFWorkbook(
  output: DCFOutput
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  applyWorkbookDefaults(workbook, { company: 'CapitalBase' });
  workbook.calcProperties.fullCalcOnLoad = true;
  const ticker = output.ticker.toUpperCase();
  const companyName = output.companyName || ticker;
  const derived = deriveDcfValues(output);

  // Sheet 1: Model Brief
  await createModelBriefSheet(workbook, ticker, companyName, output, derived);

  // Create all tabs
  createDCFSummarySheet(workbook, ticker, companyName, output, derived);
  createDCFAssumptionsSheet(workbook, ticker, output.inputs, derived);
  createForecastSheet(workbook, ticker, output, derived);
  createValuationSheet(workbook, ticker, output, derived);
  createSensitivitiesSheet(workbook, ticker, output, derived);
  createDCFChecksSheet(workbook, ticker, output, derived);
  createDCFSourcesNotesSheet(workbook, ticker, output.inputs);
  await applyFormulaModelProtection(workbook, 'dcf');

  return workbook;
}

/**
 * Create DCF Summary sheet
 */
function createDCFSummarySheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  companyName: string,
  output: DCFOutput,
  derived: ReturnType<typeof deriveDcfValues>
): void {
  const sheet = workbook.addWorksheet('Summary');
  const projectionYears = output.projections.length;
  const valuationRows = getValuationRowMap(projectionYears);
  const lastDataCol = 4;

  let row = titleBar(sheet, 'Discounted Cash Flow Analysis', lastDataCol);
  applyUnitsTitleLine(sheet);
  addEditableInputNote(sheet, 3, 3, 5);
  row += 1;

  // Key Outputs
  sectionHeader(sheet, row, 'Valuation Outputs', 2);
  row++;
  const outputsStartRow = row;

  const outputs = [
    { label: 'Enterprise Value', formula: `='Valuation'!$B$${valuationRows.enterpriseValueRow}`, value: output.valuation.enterpriseValue, format: 'CURRENCY' },
    { label: 'Equity Value', formula: `='Valuation'!$B$${valuationRows.equityRow}`, value: output.valuation.equityValue, format: 'CURRENCY' },
    { label: 'Implied Price/Share', formula: `='Valuation'!$B$${valuationRows.priceRow}`, value: output.valuation.pricePerShare, format: 'CURRENCY_DECIMALS' },
    { label: 'Market Share Price (manual)', formula: `='Valuation'!$B$${valuationRows.marketPriceInputRow}`, value: derived.marketPrice ?? null, format: 'CURRENCY_DECIMALS' },
    { label: 'Implied vs Market', formula: `='Valuation'!$B$${valuationRows.premiumRow}`, value: null, format: 'PERCENTAGE' },
  ];

  outputs.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    setFormula(sheet.getCell(row, 2), item.formula, item.value);
    applyNumberFormat(sheet.getCell(row, 2), item.format as keyof typeof NUMBER_FORMATS);
    styleKitOutputCell(sheet.getCell(row, 2));
    row++;
  });
  zebraRows(sheet, outputsStartRow, outputsStartRow + outputs.length - 1, 1, 2);

  row += 2;

  // Value Drivers (PV Breakdown)
  sectionHeader(sheet, row, 'Value Drivers (PV Breakdown)', 2);
  row++;
  const driversStartRow = row;

  const valueDrivers = [
    { label: 'PV of Projected FCF', formula: `='Valuation'!$B$${valuationRows.pvFcfRow}`, value: output.valuation.pvOfProjectedFCF, format: 'CURRENCY' },
    { label: 'PV of Terminal Value', formula: `='Valuation'!$B$${valuationRows.pvTerminalRow}`, value: output.valuation.pvOfTerminalValue, format: 'CURRENCY' },
    { label: 'Enterprise Value', formula: `='Valuation'!$B$${valuationRows.enterpriseValueRow}`, value: output.valuation.enterpriseValue, format: 'CURRENCY', isTotal: true },
  ];

  valueDrivers.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    if (item.isTotal) {
      sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { vertical: 'middle', horizontal: 'left' } };
    } else {
      applyLabelStyle(sheet.getCell(row, 1));
    }
    setFormula(sheet.getCell(row, 2), item.formula, item.value);
    applyNumberFormat(sheet.getCell(row, 2), item.format as keyof typeof NUMBER_FORMATS);
    styleKitOutputCell(sheet.getCell(row, 2));
    row++;
  });
  zebraRows(sheet, driversStartRow, driversStartRow + valueDrivers.length - 1, 1, 2);

  row += 2;

  // Valuation Bridge (EV -> Equity -> Price)
  sectionHeader(sheet, row, 'Valuation Bridge', 2);
  row++;
  const bridgeStartRow = row;
  const bridgeNetDebtEstimated =
    output.inputs.netDebtSource === 'estimated_rules' || output.inputs.netDebtSource === 'estimated_ai';

  const bridge = [
    { label: 'Enterprise Value', formula: `='Valuation'!$B$${valuationRows.bridgeStartRow}`, value: output.valuation.enterpriseValue, format: 'CURRENCY', isTotal: true },
    { label: 'Less: Net Debt', formula: `='Valuation'!$B$${valuationRows.netDebtRow}`, value: derived.netDebtForMath * -1, format: '#,##0;(#,##0)' },
    { label: 'Equity Value', formula: `='Valuation'!$B$${valuationRows.equityRow}`, value: output.valuation.enterpriseValue - derived.netDebtForMath, format: '#,##0;(#,##0)', isTotal: true },
    { label: 'Shares Outstanding (mm)', formula: `='Valuation'!$B$${valuationRows.sharesRow}`, value: derived.sharesOutstanding || derived.sharesSafe, format: 'INTEGER' },
    { label: 'Implied Price/Share', formula: `='Valuation'!$B$${valuationRows.priceRow}`, value: derived.sharesSafe > 0 ? (output.valuation.enterpriseValue - derived.netDebtForMath) / derived.sharesSafe : 0, format: 'CURRENCY_DECIMALS', isTotal: true },
  ];

  bridge.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    if (item.isTotal) {
      sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { vertical: 'middle', horizontal: 'left' } };
    } else {
      applyLabelStyle(sheet.getCell(row, 1));
    }
    setFormula(sheet.getCell(row, 2), item.formula, item.value);
    applyNumberFormat(sheet.getCell(row, 2), item.format as keyof typeof NUMBER_FORMATS | string);
    styleKitOutputCell(sheet.getCell(row, 2));
    row++;
  });
  zebraRows(sheet, bridgeStartRow, bridgeStartRow + bridge.length - 1, 1, 2);
  if (bridgeNetDebtEstimated) {
    sheet.getCell(row, 1).value = '* Net debt estimated; see Key Assumptions.';
    sheet.getCell(row, 1).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, italic: true, color: { argb: COLORS.BORDER_GREY } },
    };
    row++;
  }

  row += 2;

  // Key Assumptions Table
  sectionHeader(sheet, row, 'Key Assumptions', 2);
  row++;
  const assumptionsStartRow = row;

  const netDebtSource = output.inputs.netDebtSource ?? (derived.netDebtMissing ? 'unknown' : 'reported');
  const netDebtIsEstimated = netDebtSource === 'estimated_rules' || netDebtSource === 'estimated_ai';
  const netDebtLabel = netDebtSource === 'estimated_ai' ? 'Net Debt (USD mm) — Estimated' : 'Net Debt (USD mm)';
  const netDebtNote =
    output.inputs.netDebtNote ||
    (netDebtSource === 'estimated_ai'
      ? 'Estimated via AI due to missing cash/debt fields.'
      : netDebtIsEstimated
      ? 'Net debt estimated.'
      : netDebtSource === 'unknown'
      ? 'Net debt unavailable.'
      : undefined);

  const assumptions = [
    { label: 'Revenue Growth', formula: "='Assumptions'!$E$7", value: toNumber(output.inputs.revenueGrowth, 0.08), format: 'PERCENTAGE' },
    { label: 'EBITDA Margin', formula: "='Assumptions'!$E$8", value: toNumber(output.inputs.ebitdaMargin, 0.25), format: 'PERCENTAGE' },
    { label: 'Capex % Revenue', formula: "='Assumptions'!$E$9", value: toNumber(output.inputs.capexPctRevenue, 0.04), format: 'PERCENTAGE' },
    { label: 'ΔNWC % Revenue', formula: "='Assumptions'!$E$10", value: toNumber(output.inputs.nwcPctRevenue, 0.10), format: 'PERCENTAGE' },
    { label: 'Effective Tax Rate', formula: "='Assumptions'!$B$22", value: output.inputs.taxRate || 0, format: 'PERCENTAGE' },
    { label: 'Terminal Growth', formula: "='Assumptions'!$E$11", value: output.inputs.terminalGrowth || 0, format: 'PERCENTAGE' },
    { label: 'Discount Rate (WACC)', formula: "='Assumptions'!$E$12", value: output.inputs.wacc || 0, format: 'PERCENTAGE' },
    { label: 'Exit Multiple (if used)', formula: "='Assumptions'!$B$38", value: output.inputs.exitMultiple ?? 0, format: 'DECIMAL' },
    { label: 'Forecast Horizon (Years)', formula: "='Assumptions'!$B$39", value: output.inputs.projectionYears ?? projectionYears, format: 'DECIMAL' },
    {
      label: netDebtLabel,
      formula: "='Assumptions'!$B$31",
      value: derived.netDebt ?? null,
      format: '#,##0;(#,##0)',
      estimated: netDebtIsEstimated,
      note: netDebtSource === 'estimated_ai' ? 'Estimated via AI due to missing cash/debt fields.' : netDebtNote,
    },
    { label: 'Shares Outstanding (mm)', formula: "='Assumptions'!$B$32", value: output.valuation.sharesOutstanding, format: 'INTEGER' },
  ];

  assumptions.forEach(assumption => {
    sheet.getCell(row, 1).value = assumption.label;
    if ((assumption as any).estimated) {
      const labelCell = sheet.getCell(row, 1);
      applyLabelStyle(labelCell);
      labelCell.font = { ...labelCell.font, italic: true };
    } else {
      applyLabelStyle(sheet.getCell(row, 1));
    }
    setFormula(sheet.getCell(row, 2), assumption.formula, assumption.value);
    applyNumberFormat(sheet.getCell(row, 2), assumption.format as keyof typeof NUMBER_FORMATS | string);
    if ((assumption as any).estimated) {
      applyEstimatedValueStyle(sheet.getCell(row, 2));
    } else {
      styleKitOutputCell(sheet.getCell(row, 2));
    }
    if ((assumption as any).note) {
      try {
        sheet.getCell(row, 2).note = {
          texts: [{ font: { size: 9 }, text: (assumption as any).note }],
        };
      } catch {
        /* comments may not be supported */
      }
    }
    row++;
  });
  zebraRows(sheet, assumptionsStartRow, assumptionsStartRow + assumptions.length - 1, 1, 2);

  row += 2;

  // Sensitivity Snapshot
  sectionHeader(sheet, row, 'Sensitivity Snapshot (WACC × Terminal Growth)', 4);
  row++;

  tableHeader(sheet, row, 1, 4);
  sheet.getCell(row, 1).value = 'WACC \\ g';
  sheet.getCell(row, 2).value = 0.02;
  sheet.getCell(row, 3).value = 0.025;
  sheet.getCell(row, 4).value = 0.03;
  for (let col = 2; col <= 4; col++) {
    applyNumberFormat(sheet.getCell(row, col), 'PERCENTAGE');
  }
  row++;

  const sensitivityRows = [
    { wacc: 0.09, refRow: 6 },
    { wacc: 0.10, refRow: 7 },
    { wacc: 0.11, refRow: 8 },
  ];

  sensitivityRows.forEach((item) => {
    sheet.getCell(row, 1).value = item.wacc;
    applyNumberFormat(sheet.getCell(row, 1), 'PERCENTAGE');
    styleKitBodyCell(sheet.getCell(row, 1));

    setFormula(sheet.getCell(row, 2), `='Sensitivities'!$C$${item.refRow}`, null);
    setFormula(sheet.getCell(row, 3), `='Sensitivities'!$D$${item.refRow}`, null);
    setFormula(sheet.getCell(row, 4), `='Sensitivities'!$E$${item.refRow}`, null);

    for (let col = 2; col <= 4; col++) {
      applyNumberFormat(sheet.getCell(row, col), 'CURRENCY_DECIMALS');
      styleKitOutputCell(sheet.getCell(row, col));
    }
    row++;
  });

  row += 2;

  // Shares Source
  sheet.getCell(row, 1).value = 'Shares Source';
  sheet.getCell(row, 2).value = output.inputs.sharesSource || 'Reported';
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: output.inputs.sharesSource === 'User Provided' ? 'FF0066CC' : 'FF000000' } },
  };

  const lastUsedRow = row;
  setColWidthsKit(sheet, [38, 28, 20, 18, 18]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/**
 * Create DCF Assumptions sheet
 */
function createDCFAssumptionsSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  inputs: DCFInputs,
  derived: ReturnType<typeof deriveDcfValues>
): void {
  const sheet = workbook.addWorksheet('Assumptions');
  const lastDataCol = 5;

  const baseGrowth = toNumber(inputs.revenueGrowth, 0.08);
  const baseMargin = toNumber(inputs.ebitdaMargin, 0.25);
  const baseCapex = toNumber(inputs.capexPctRevenue, 0.04);
  const baseNwc = toNumber(inputs.nwcPctRevenue, 0.10);
  const baseTerminal = toNumber(inputs.terminalGrowth, 0.025);
  const baseWacc = toNumber(inputs.wacc, 0.10);

  const bullGrowth = clamp(baseGrowth + 0.03, -0.5, 1);
  const bearGrowth = clamp(baseGrowth - 0.03, -0.5, 1);
  const bullMargin = clamp(baseMargin + 0.02, -0.5, 0.9);
  const bearMargin = clamp(baseMargin - 0.02, -0.5, 0.9);
  const bullCapex = clamp(baseCapex - 0.005, 0, 0.5);
  const bearCapex = clamp(baseCapex + 0.005, 0, 0.5);
  const bullNwc = clamp(baseNwc - 0.01, -0.5, 0.5);
  const bearNwc = clamp(baseNwc + 0.01, -0.5, 0.5);
  const bullTerminal = clamp(baseTerminal + 0.005, -0.05, 0.05);
  const bearTerminal = clamp(baseTerminal - 0.005, -0.05, 0.05);
  const bullWacc = clamp(baseWacc - 0.01, 0.01, 0.3);
  const bearWacc = clamp(baseWacc + 0.01, 0.01, 0.3);

  const waccComponents = inputs.waccComponents || {};

  let row = titleBar(sheet, 'Discounted Cash Flow Analysis', lastDataCol);
  applyUnitsTitleLine(sheet);
  row += 1;

  // Active scenario
  sheet.getCell(row, 1).value = 'Active Scenario';
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).value = 'Base';
  styleKitInputCell(sheet.getCell(row, 2));
  sheet.getCell(row, 2).dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"Base,Bull,Bear"'],
  };
  row += 2;

  // Core assumptions
  sectionHeader(sheet, row, 'Core Assumptions', lastDataCol);
  row++;

  sheet.getCell(row, 1).value = 'Assumption';
  sheet.getCell(row, 2).value = 'Base';
  sheet.getCell(row, 3).value = 'Bull';
  sheet.getCell(row, 4).value = 'Bear';
  sheet.getCell(row, 5).value = 'Active';
  tableHeader(sheet, row, 1, lastDataCol);
  const coreStartRow = row + 1;
  row++;

  const coreRows = [
    { label: 'Revenue Growth (%)', base: baseGrowth, bull: bullGrowth, bear: bearGrowth },
    { label: 'EBITDA Margin (%)', base: baseMargin, bull: bullMargin, bear: bearMargin },
    { label: 'Capex % Revenue (%)', base: baseCapex, bull: bullCapex, bear: bearCapex },
    { label: 'ΔNWC % Revenue (%)', base: baseNwc, bull: bullNwc, bear: bearNwc },
    { label: 'Terminal Growth Rate (%)', base: baseTerminal, bull: bullTerminal, bear: bearTerminal },
    { label: 'Discount Rate (WACC) (%)', base: baseWacc, bull: bullWacc, bear: bearWacc },
  ];

  const useAdvancedRow = coreStartRow + coreRows.length + 2;

  coreRows.forEach((item, idx) => {
    const rowIndex = coreStartRow + idx;
    sheet.getCell(rowIndex, 1).value = item.label;
    applyLabelStyle(sheet.getCell(rowIndex, 1));

    sheet.getCell(rowIndex, 2).value = item.base;
    sheet.getCell(rowIndex, 3).value = item.bull;
    sheet.getCell(rowIndex, 4).value = item.bear;
    for (let col = 2; col <= 4; col++) {
      applyNumberFormat(sheet.getCell(rowIndex, col), 'PERCENTAGE_DECIMALS');
      styleKitInputCell(sheet.getCell(rowIndex, col));
    }

    // Active column
    if (item.label === 'Discount Rate (WACC) (%)') {
      setFormula(
        sheet.getCell(rowIndex, 5),
        `=IF($B$${useAdvancedRow}=TRUE,$B$27,INDEX($B$${coreStartRow}:$D$${coreStartRow + coreRows.length - 1},ROW()-${coreStartRow - 1},MATCH($B$3,$B$${coreStartRow - 1}:$D$${coreStartRow - 1},0)))`,
        item.base
      );
    } else {
      setFormula(
        sheet.getCell(rowIndex, 5),
        `=INDEX($B$${coreStartRow}:$D$${coreStartRow + coreRows.length - 1},ROW()-${coreStartRow - 1},MATCH($B$3,$B$${coreStartRow - 1}:$D$${coreStartRow - 1},0))`,
        item.base
      );
    }
    applyNumberFormat(sheet.getCell(rowIndex, 5), 'PERCENTAGE_DECIMALS');
    sheet.getCell(rowIndex, 5).style = createFormulaStyle();
  });
  zebraRows(sheet, coreStartRow, coreStartRow + coreRows.length - 1, 1, lastDataCol);

  row = coreStartRow + coreRows.length + 1;

  // Advanced overrides
  sectionHeader(sheet, row, 'Advanced Overrides (Optional)', 2);
  row++;

  sheet.getCell(row, 1).value = 'Use Advanced Overrides';
  sheet.getCell(row, 2).value = false;
  styleKitInputCell(sheet.getCell(row, 2));
  row++;

  const advancedStartRow = row;
  const advancedItems = [
    { label: 'Risk-Free Rate (%)', value: waccComponents.riskFreeRate },
    { label: 'Equity Risk Premium (ERP) (%)', value: waccComponents.equityRiskPremium },
    { label: 'Beta', value: waccComponents.beta },
    { label: 'Cost of Debt (%)', value: waccComponents.costOfDebt },
    { label: 'Debt %', value: waccComponents.debtPct },
    { label: 'Equity %', value: waccComponents.equityPct },
    { label: 'Effective Tax Rate (%)', value: waccComponents.taxRate ?? inputs.taxRate },
    { label: 'D&A % Revenue (Optional)', value: inputs.depreciationPctRevenue ?? 0.05 },
  ];

  advancedItems.forEach((item, idx) => {
    const rowIndex = advancedStartRow + idx;
    sheet.getCell(rowIndex, 1).value = item.label;
    applyLabelStyle(sheet.getCell(rowIndex, 1));
    const value = Array.isArray(item.value) ? item.value[0] : item.value;
    if (value !== undefined && value !== null) {
      sheet.getCell(rowIndex, 2).value = value;
      if (item.label.includes('%') || item.label.includes('Rate') || item.label.includes('Premium')) {
        applyNumberFormat(sheet.getCell(rowIndex, 2), 'PERCENTAGE_DECIMALS');
      } else {
        applyNumberFormat(sheet.getCell(rowIndex, 2), 'DECIMAL');
      }
      styleKitInputCell(sheet.getCell(rowIndex, 2));
    } else {
      sheet.getCell(rowIndex, 2).value = null;
      styleKitInputCell(sheet.getCell(rowIndex, 2));
    }
  });
  zebraRows(sheet, advancedStartRow, advancedStartRow + advancedItems.length - 1, 1, 2);

  row = advancedStartRow + advancedItems.length + 1;

  sectionHeader(sheet, row, 'WACC Calculation', 2);
  row++;

  // Cost of equity
  sheet.getCell(row, 1).value = 'Cost of Equity';
  setFormula(
    sheet.getCell(row, 2),
    `=IF(OR(ISBLANK($B$${advancedStartRow}),ISBLANK($B$${advancedStartRow + 1}),ISBLANK($B$${advancedStartRow + 2})),"",$B$${advancedStartRow} + $B$${advancedStartRow + 1}*$B$${advancedStartRow + 2})`,
    null
  );
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE_DECIMALS');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  // WACC (Advanced)
  sheet.getCell(row, 1).value = 'WACC (Advanced)';
  setFormula(
    sheet.getCell(row, 2),
    `=IF($B$${useAdvancedRow}=TRUE,IF(OR(ISBLANK($B$${advancedStartRow + 3}),ISBLANK($B$${advancedStartRow + 4}),ISBLANK($B$${advancedStartRow + 5}),ISBLANK($B$${advancedStartRow + 6})),"",($B$${advancedStartRow + 5}/($B$${advancedStartRow + 4}+$B$${advancedStartRow + 5}))*$B$${row - 1}+($B$${advancedStartRow + 4}/($B$${advancedStartRow + 4}+$B$${advancedStartRow + 5}))*$B$${advancedStartRow + 3}*(1-$B$${advancedStartRow + 6})), "")`,
    null
  );
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE_DECIMALS');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row += 2;

  // Fetched data
  sectionHeader(sheet, row, 'Fetched Data', 2);
  row++;

  sheet.getCell(row, 1).value = 'LTM Revenue (USD millions)';
  sheet.getCell(row, 2).value = Array.isArray(inputs.revenue) ? inputs.revenue[0] : inputs.revenue;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'Net Debt (USD millions)';
  sheet.getCell(row, 2).value = derived.netDebtMissing ? null : derived.netDebt;
  applyNumberFormat(sheet.getCell(row, 2), '#,##0;(#,##0)');
  styleKitInputCell(sheet.getCell(row, 2));
  if (derived.netDebtMissing) {
    try {
      sheet.getCell(row, 2).note = { texts: [{ font: { size: 9 }, text: 'Enter net debt to complete equity bridge.' }] };
    } catch {
      // comments may not be supported in all environments
    }
  }
  row++;

  sheet.getCell(row, 1).value = 'Shares Outstanding (millions)';
  sheet.getCell(row, 2).value = derived.sharesMissing ? null : derived.sharesSafe;
  applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
  styleKitInputCell(sheet.getCell(row, 2));
  row++;

  sheet.getCell(row, 1).value = 'As-of Date';
  sheet.getCell(row, 2).value = new Date().toISOString().slice(0, 10);
  sheet.getCell(row, 2).style = createNormalStyle();
  row++;

  sheet.getCell(row, 1).value = 'Currency / Units';
  sheet.getCell(row, 2).value = `${inputs.currency || 'USD'} / millions`;
  sheet.getCell(row, 2).style = createNormalStyle();
  row += 2;

  sectionHeader(sheet, row, 'Terminal Value Method', 2);
  row++;

  sheet.getCell(row, 1).value = 'Use Exit Multiple';
  sheet.getCell(row, 2).value = !!inputs.useExitMultiple;
  sheet.getCell(row, 1).style = createNormalStyle();
  styleKitInputCell(sheet.getCell(row, 2));
  row++;

  sheet.getCell(row, 1).value = 'Exit Multiple (EV/EBITDA)';
  sheet.getCell(row, 2).value = inputs.exitMultiple ?? null;
  sheet.getCell(row, 1).style = createNormalStyle();
  applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
  styleKitInputCell(sheet.getCell(row, 2));
  row++;

  sheet.getCell(row, 1).value = 'Forecast Horizon (Years)';
  sheet.getCell(row, 2).value = inputs.projectionYears ?? 5;
  applyLabelStyle(sheet.getCell(row, 1));
  applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
  styleKitInputCell(sheet.getCell(row, 2));

  const lastUsedRow = row;
  setColWidthsKit(sheet, [28, 18, 18, 18, 18]);
  // Hidden flags for checks (do not alter layout)
  sheet.getCell(31, 5).value = derived.netDebtMissing;
  sheet.getCell(32, 5).value = derived.sharesMissing;
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/**
 * Create Forecast sheet
 */
function createForecastSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: DCFOutput,
  derived: ReturnType<typeof deriveDcfValues>
): void {
  const sheet = workbook.addWorksheet('Forecast');
  const projectionYears = output.projections.length;
  const lastDataCol = projectionYears + 1;
  const assumptionsSheet = 'Assumptions';
  const ltmRevenueCell = `${assumptionsSheet}!$B$30`;
  const growthCell = `${assumptionsSheet}!$E$7`;
  const ebitdaMarginCell = `${assumptionsSheet}!$E$8`;
  const capexCell = `${assumptionsSheet}!$E$9`;
  const nwcCell = `${assumptionsSheet}!$E$10`;
  const taxRateCell = `${assumptionsSheet}!$B$22`;
  const daCell = `${assumptionsSheet}!$B$23`;

  let row = titleBar(sheet, 'Discounted Cash Flow Analysis', lastDataCol);
  applyUnitsTitleLine(sheet);

  // Headers
  const headerRow = row;
  sheet.getCell(headerRow, 1).value = 'Year';
  output.projections.forEach((proj, idx) => {
    const cell = sheet.getCell(headerRow, idx + 2);
    const displayYear = proj.year > 1900 ? proj.year : new Date().getFullYear() + idx + 1;
    cell.value = displayYear;
  });
  tableHeader(sheet, headerRow, 1, lastDataCol);
  row++;

  const revenueRow = row;
  const ebitdaRow = row + 1;
  const daRow = row + 2;
  const ebitRow = row + 3;
  const taxRow = row + 4;
  const nopatRow = row + 5;
  const capexRow = row + 6;
  const nwcRow = row + 7;
  const fcfRow = row + 8;

  const labels = [
    { label: 'Revenue', row: revenueRow },
    { label: 'EBITDA', row: ebitdaRow },
    { label: 'D&A', row: daRow },
    { label: 'EBIT', row: ebitRow },
    { label: 'Taxes', row: taxRow },
    { label: 'NOPAT', row: nopatRow },
    { label: 'Capex', row: capexRow },
    { label: 'ΔNWC', row: nwcRow },
    { label: 'Unlevered FCF', row: fcfRow },
  ];

  labels.forEach(item => {
    sheet.getCell(item.row, 1).value = item.label;
    if (item.label === 'Unlevered FCF') {
      sheet.getCell(item.row, 1).style = { ...createTotalStyle(), alignment: { vertical: 'middle', horizontal: 'left' } };
    } else {
      applyLabelStyle(sheet.getCell(item.row, 1));
    }
  });

  for (let i = 0; i < projectionYears; i++) {
    const col = i + 2;
    const colLetter = colToLetter(col);
    const prevColLetter = colToLetter(col - 1);

    // Revenue
    const revenueFormula =
      i === 0
        ? `=${ltmRevenueCell}*(1+${growthCell})`
        : `=${prevColLetter}${revenueRow}*(1+${growthCell})`;
    setFormula(sheet.getCell(revenueRow, col), revenueFormula, output.projections[i]?.revenue ?? null);
    applyNumberFormat(sheet.getCell(revenueRow, col), 'CURRENCY');
    sheet.getCell(revenueRow, col).style = createFormulaStyle();

    // EBITDA
    setFormula(
      sheet.getCell(ebitdaRow, col),
      `=${colLetter}${revenueRow}*${ebitdaMarginCell}`,
      output.projections[i]?.ebitda ?? null
    );
    applyNumberFormat(sheet.getCell(ebitdaRow, col), 'CURRENCY');
    sheet.getCell(ebitdaRow, col).style = createFormulaStyle();

    // D&A
    setFormula(
      sheet.getCell(daRow, col),
      `=${colLetter}${revenueRow}*${daCell}`,
      output.projections[i]?.depreciation ?? null
    );
    applyNumberFormat(sheet.getCell(daRow, col), 'CURRENCY');
    sheet.getCell(daRow, col).style = createFormulaStyle();

    // EBIT
    setFormula(
      sheet.getCell(ebitRow, col),
      `=${colLetter}${ebitdaRow}-${colLetter}${daRow}`,
      output.projections[i]?.ebit ?? null
    );
    applyNumberFormat(sheet.getCell(ebitRow, col), 'CURRENCY');
    sheet.getCell(ebitRow, col).style = createFormulaStyle();

    // Taxes (negative)
    setFormula(
      sheet.getCell(taxRow, col),
      `=IF(${colLetter}${ebitRow}>0,-${colLetter}${ebitRow}*${taxRateCell},0)`,
      output.projections[i]?.ebit ? -(output.projections[i]?.ebit * (output.inputs.taxRate || 0)) : 0
    );
    applyNumberFormat(sheet.getCell(taxRow, col), 'CURRENCY');
    sheet.getCell(taxRow, col).style = createFormulaStyle();

    // NOPAT
    setFormula(
      sheet.getCell(nopatRow, col),
      `=${colLetter}${ebitRow}+${colLetter}${taxRow}`,
      output.projections[i]?.nopat ?? null
    );
    applyNumberFormat(sheet.getCell(nopatRow, col), 'CURRENCY');
    sheet.getCell(nopatRow, col).style = createFormulaStyle();

    // Capex (negative)
    setFormula(
      sheet.getCell(capexRow, col),
      `=-${colLetter}${revenueRow}*${capexCell}`,
      output.projections[i]?.capex ? -output.projections[i]?.capex : null
    );
    applyNumberFormat(sheet.getCell(capexRow, col), 'CURRENCY');
    sheet.getCell(capexRow, col).style = createFormulaStyle();

    // ΔNWC
    const nwcFormula =
      i === 0
        ? `=-((${colLetter}${revenueRow}*${nwcCell})-(${ltmRevenueCell}*${nwcCell}))`
        : `=-((${colLetter}${revenueRow}*${nwcCell})-(${prevColLetter}${revenueRow}*${nwcCell}))`;
    setFormula(
      sheet.getCell(nwcRow, col),
      nwcFormula,
      output.projections[i]?.nwcChange ? -output.projections[i]?.nwcChange : null
    );
    applyNumberFormat(sheet.getCell(nwcRow, col), 'CURRENCY');
    sheet.getCell(nwcRow, col).style = createFormulaStyle();

    // Unlevered FCF
    setFormula(
      sheet.getCell(fcfRow, col),
      `=${colLetter}${nopatRow}+${colLetter}${daRow}+${colLetter}${capexRow}+${colLetter}${nwcRow}`,
      output.projections[i]?.unleveredFCF ?? null
    );
    applyNumberFormat(sheet.getCell(fcfRow, col), 'CURRENCY');
    sheet.getCell(fcfRow, col).style = createTotalStyle();
  }

  const lastUsedRow = fcfRow;
  setColWidthsKit(sheet, [22, ...Array(projectionYears).fill(16)]);
  zebraRows(sheet, revenueRow, lastUsedRow, 1, lastDataCol);
  borderBox(sheet, headerRow, 1, lastUsedRow, lastDataCol);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/**
 * Create Valuation sheet
 * Layout: Header, Inputs (WACC, g, Net Debt, Shares, Market Share Price), PV Schedule (Year|DF|FCF|PV),
 * Terminal block, EV summary, Equity bridge, Market comparison, Checks.
 */
function createValuationSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: DCFOutput,
  derived: ReturnType<typeof deriveDcfValues>
): void {
  const sheet = workbook.addWorksheet('Valuation');
  const projectionYears = output.projections.length;
  const valuationRows = getValuationRowMap(projectionYears);
  const waccCell = '$B$5';
  const gCell = '$B$6';
  const useExitMultipleCell = "'Assumptions'!$B$37";
  const exitMultipleCell = "'Assumptions'!$B$38";
  const lastColLetter = colToLetter(projectionYears + 1);
  const lastDataCol = 4;

  let row = titleBar(sheet, 'Discounted Cash Flow Analysis', lastDataCol);
  applyUnitsTitleLine(sheet);
  addEditableInputNote(sheet, 3, 1, lastDataCol);
  row += 1;

  // B) Valuation & Share Price — Inputs (boxed)
  sectionHeader(sheet, row, 'Valuation & Share Price', lastDataCol);
  row++;

  sheet.getCell(row, 1).value = 'WACC (Used)';
  setFormula(sheet.getCell(row, 2), "='Assumptions'!$E$12", output.inputs.wacc ?? 0);
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'Terminal Growth (g)';
  setFormula(sheet.getCell(row, 2), "='Assumptions'!$E$11", output.inputs.terminalGrowth ?? 0);
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'Net Debt';
  setFormula(sheet.getCell(row, 2), "='Assumptions'!$B$31", derived.netDebt);
  applyNumberFormat(sheet.getCell(row, 2), '#,##0;(#,##0)');
  sheet.getCell(row, 2).style = createFormulaStyle();
  applyLabelStyle(sheet.getCell(row, 1));
  try {
    sheet.getCell(row, 2).note = { texts: [{ font: { size: 9 }, text: 'Debt – Cash. Used to convert Enterprise Value to Equity Value.' }] };
  } catch {
    /* comments may not be supported in all environments */
  }
  row++;

  sheet.getCell(row, 1).value = 'Shares Outstanding';
  setFormula(sheet.getCell(row, 2), "='Assumptions'!$B$32", derived.sharesOutstanding || derived.sharesSafe);
  applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'Market Share Price (manual)';
  sheet.getCell(row, 2).value = derived.marketPrice ?? null;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
  applyLabelStyle(sheet.getCell(row, 1));
  styleKitInputCell(sheet.getCell(row, 2));
  row += 2;

  // C) Present Value Schedule: Year | Discount Factor | FCF | PV of FCF
  const pvHeaderRow = row;
  sheet.getCell(pvHeaderRow, 1).value = 'Year';
  sheet.getCell(pvHeaderRow, 2).value = 'Discount Factor';
  sheet.getCell(pvHeaderRow, 3).value = 'FCF';
  sheet.getCell(pvHeaderRow, 4).value = 'PV of FCF';
  tableHeader(sheet, pvHeaderRow, 1, lastDataCol);
  row++;

  const startDataRow = row;
  for (let i = 0; i < projectionYears; i++) {
    const yearValue =
      output.projections[i].year > 1900 ? output.projections[i].year : new Date().getFullYear() + i + 1;
    sheet.getCell(row, 1).value = yearValue;
    styleKitBodyCell(sheet.getCell(row, 1));
    sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left' };

    const df = 1 / Math.pow(1 + (output.inputs.wacc ?? 0.1), i + 1);
    const discountFactorCell = sheet.getCell(row, 2);
    setFormula(discountFactorCell, `=1/(1+${waccCell})^${i + 1}`, df);
    discountFactorCell.numFmt = '0.000';
    discountFactorCell.style = createFormulaStyle();

    const colLetter = colToLetter(i + 2);
    const fcfCell = sheet.getCell(row, 3);
    setFormula(fcfCell, `='Forecast'!${colLetter}12`, output.projections[i]?.unleveredFCF ?? 0);
    applyNumberFormat(fcfCell, 'CURRENCY');
    fcfCell.style = createFormulaStyle();

    const pvCell = sheet.getCell(row, 4);
    setFormula(pvCell, `=C${row}*B${row}`, (output.projections[i]?.unleveredFCF ?? 0) * df);
    applyNumberFormat(pvCell, 'CURRENCY');
    pvCell.style = createFormulaStyle();
    row++;
  }

  row++;

  // D) Terminal Value block
  sheet.getCell(row, 1).value = 'Terminal Value (end of last forecast year)';
  setFormula(
    sheet.getCell(row, 2),
    `=IF(${useExitMultipleCell}=TRUE,'Forecast'!${lastColLetter}5*${exitMultipleCell},IF(${waccCell}<=${gCell},NA(),'Forecast'!${lastColLetter}12*(1+${gCell})/(${waccCell}-${gCell})))`,
    output.valuation.terminalValue
  );
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'PV of Terminal Value';
  setFormula(
    sheet.getCell(row, 2),
    `=B${valuationRows.terminalValueRow}/(1+${waccCell})^${projectionYears}`,
    output.valuation.pvOfTerminalValue
  );
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  // E) Enterprise Value summary (bold)
  sheet.getCell(row, 1).value = 'PV of Projected FCFs';
  setFormula(
    sheet.getCell(row, 2),
    `=SUM($D$${startDataRow}:$D$${valuationRows.endDataRow})`,
    output.valuation.pvOfProjectedFCF
  );
  applyLabelStyle(sheet.getCell(row, 1));
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'PV of Terminal Value';
  setFormula(sheet.getCell(row, 2), `=B${valuationRows.pvTerminalRow}`, output.valuation.pvOfTerminalValue);
  applyLabelStyle(sheet.getCell(row, 1));
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'Enterprise Value';
  setFormula(sheet.getCell(row, 2), `=B${valuationRows.pvFcfRow}+B${valuationRows.pvTerminalRow}`, output.valuation.enterpriseValue);
  sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { vertical: 'middle', horizontal: 'left' } };
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createTotalStyle();
  row += 2;

  // F) Equity Value bridge (boxed)
  sectionHeader(sheet, row, 'Equity Value bridge', lastDataCol);
  row++;

  sheet.getCell(row, 1).value = 'Enterprise Value';
  setFormula(sheet.getCell(row, 2), `=B${valuationRows.enterpriseValueRow}`, output.valuation.enterpriseValue);
  sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { horizontal: 'left' } };
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createTotalStyle();
  row++;

  sheet.getCell(row, 1).value = '(-) Net Debt';
  setFormula(sheet.getCell(row, 2), "=-'Assumptions'!$B$31", -derived.netDebtForMath);
  applyNumberFormat(sheet.getCell(row, 2), '#,##0;(#,##0)');
  sheet.getCell(row, 2).style = createFormulaStyle();
  applyLabelStyle(sheet.getCell(row, 1));
  row++;

  sheet.getCell(row, 1).value = '= Equity Value';
  setFormula(sheet.getCell(row, 2), `=B${valuationRows.bridgeStartRow}+B${valuationRows.netDebtRow}`, output.valuation.enterpriseValue - derived.netDebtForMath);
  sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { horizontal: 'left' } };
  applyNumberFormat(sheet.getCell(row, 2), '#,##0;(#,##0)');
  sheet.getCell(row, 2).style = createTotalStyle();
  row++;

  sheet.getCell(row, 1).value = '(/) Shares Outstanding';
  setFormula(sheet.getCell(row, 2), "='Assumptions'!$B$32", derived.sharesOutstanding || derived.sharesSafe);
  applyLabelStyle(sheet.getCell(row, 1));
  applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = '= Implied Share Price';
  setFormula(
    sheet.getCell(row, 2),
    `=IF(B${valuationRows.sharesRow}>0,B${valuationRows.equityRow}/B${valuationRows.sharesRow},"")`,
    derived.sharesSafe > 0 ? (output.valuation.enterpriseValue - derived.netDebtForMath) / derived.sharesSafe : 0
  );
  sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { horizontal: 'left' } };
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
  sheet.getCell(row, 2).style = createTotalStyle();
  row += 2;
  if (output.inputs.netDebtSource === 'estimated_rules' || output.inputs.netDebtSource === 'estimated_ai') {
    sheet.getCell(row, 1).value = '* Net debt estimated; see Key Assumptions.';
    sheet.getCell(row, 1).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, italic: true, color: { argb: COLORS.BORDER_GREY } },
    };
    row += 1;
  }

  // G) Market comparison (boxed): N/A when Market Share Price blank or 0
  sectionHeader(sheet, row, 'Market comparison', lastDataCol);
  row++;

  sheet.getCell(row, 1).value = 'Implied Share Price';
  setFormula(sheet.getCell(row, 2), `=B${valuationRows.priceRow}`, derived.sharesSafe > 0 ? (output.valuation.enterpriseValue - derived.netDebtForMath) / derived.sharesSafe : null);
  applyLabelStyle(sheet.getCell(row, 1));
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'Market Share Price (input)';
  setFormula(sheet.getCell(row, 2), `=B${valuationRows.marketPriceInputRow}`, derived.marketPrice ?? null);
  applyLabelStyle(sheet.getCell(row, 1));
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = '= Upside / (Downside) %';
  setFormula(
    sheet.getCell(row, 2),
    `=IF(OR(B${valuationRows.marketPriceInputRow}=0,B${valuationRows.marketPriceInputRow}=""),"N/A",B${valuationRows.priceRow}/B${valuationRows.marketPriceInputRow}-1)`,
    null
  );
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).numFmt = '0.0%';
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = '= $ Difference per share';
  setFormula(
    sheet.getCell(row, 2),
    `=IF(OR(B${valuationRows.marketPriceInputRow}=0,B${valuationRows.marketPriceInputRow}=""),"N/A",B${valuationRows.priceRow}-B${valuationRows.marketPriceInputRow})`,
    null
  );
  applyLabelStyle(sheet.getCell(row, 1));
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row += 2;

  // Checks
  sheet.getCell(row, 1).value = 'Shares must be > 0';
  setFormula(sheet.getCell(row, 2), `=IF(B${valuationRows.sharesInputRow}<=0,"WARN: Shares must be > 0","OK")`, derived.sharesOutstanding > 0 ? 'OK' : 'WARN: Shares must be > 0');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'WACC must be greater than terminal growth';
  setFormula(sheet.getCell(row, 2), `=IF(${waccCell}<=${gCell},"WARN: WACC must be > g","OK")`, (output.inputs.wacc ?? 0) > (output.inputs.terminalGrowth ?? 0) ? 'OK' : 'WARN: WACC must be > g');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, 2).style = createFormulaStyle();

  const valuationLastRow = row;
  setColWidthsKit(sheet, [38, 18, 16, 16]);
  zebraRows(sheet, startDataRow, valuationRows.endDataRow, 1, lastDataCol);
  borderBox(sheet, 5, 1, 9, 2);
  borderBox(sheet, valuationRows.bridgeStartRow - 1, 1, valuationRows.priceRow, 2);
  borderBox(sheet, valuationRows.marketCompareStartRow - 1, 1, valuationRows.diffRow, 2);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: valuationLastRow });
  hideUnusedArea(sheet, lastDataCol, valuationLastRow);
}

/**
 * Create Sensitivities sheet
 */
function createSensitivitiesSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: DCFOutput,
  derived: ReturnType<typeof deriveDcfValues>
): void {
  const sheet = workbook.addWorksheet('Sensitivities');
  const lastDataCol = 6;
  const projectionYears = output.projections.length;
  const lastColLetter = colToLetter(projectionYears + 1);
  const fcfRange = `'Forecast'!$B$12:$${lastColLetter}12`;
  const fcfLast = `'Forecast'!$${lastColLetter}$12`;
  const netDebtCell = "'Assumptions'!$B$31";
  const sharesCell = "'Assumptions'!$B$32";
  const baseMarginCell = "'Assumptions'!$E$8";
  const gCell = "'Assumptions'!$E$11";

  let row = titleBar(sheet, 'Discounted Cash Flow Analysis', lastDataCol);
  applyUnitsTitleLine(sheet);
  row += 1;

  // WACC × Terminal Growth Grid (required)
  sectionHeader(sheet, row, 'WACC × Terminal Growth Sensitivity', lastDataCol);
  row++;

  // Create grid
  const waccValues = [0.08, 0.09, 0.10, 0.11, 0.12];
  const growthValues = [0.01, 0.02, 0.025, 0.03, 0.04];

  const growthHeaderRow = row;
  sheet.getCell(row, 1).value = 'WACC \\ Terminal Growth';
  growthValues.forEach((g, idx) => {
    sheet.getCell(row, idx + 2).value = g;
    applyNumberFormat(sheet.getCell(row, idx + 2), 'PERCENTAGE');
  });
  row++;

  waccValues.forEach(wacc => {
    sheet.getCell(row, 1).value = wacc;
    applyNumberFormat(sheet.getCell(row, 1), 'PERCENTAGE');
    growthValues.forEach((_, idx) => {
      const colLetter = colToLetter(idx + 2);
      const waccCell = `$A${row}`;
      const growthCell = `${colLetter}$${growthHeaderRow}`;
      const formula = `=IF(OR(${waccCell}<=${growthCell},${sharesCell}<=0),"",((NPV(${waccCell},${fcfRange})+(${fcfLast}*(1+${growthCell})/(${waccCell}-${growthCell}))/POWER(1+${waccCell},${projectionYears}))-${netDebtCell})/${sharesCell})`;
      setFormula(sheet.getCell(row, idx + 2), formula, null);
      applyNumberFormat(sheet.getCell(row, idx + 2), 'CURRENCY_DECIMALS');
      sheet.getCell(row, idx + 2).style = createFormulaStyle();
    });
    row++;
  });

  row += 2;

  // WACC × EBITDA Margin Grid
  sectionHeader(sheet, row, 'WACC × EBITDA Margin Sensitivity', lastDataCol);
  row++;

  const baseMargin = toNumber(output.inputs.ebitdaMargin, 0.25);
  const marginValues = [
    clamp(baseMargin - 0.05, 0, 1),
    clamp(baseMargin - 0.025, 0, 1),
    clamp(baseMargin, 0, 1),
    clamp(baseMargin + 0.025, 0, 1),
    clamp(baseMargin + 0.05, 0, 1),
  ];

  const marginHeaderRow = row;
  sheet.getCell(row, 1).value = 'WACC \\ EBITDA Margin';
  marginValues.forEach((margin, idx) => {
    sheet.getCell(row, idx + 2).value = margin;
    applyNumberFormat(sheet.getCell(row, idx + 2), 'PERCENTAGE');
  });
  row++;

  waccValues.forEach(wacc => {
    sheet.getCell(row, 1).value = wacc;
    applyNumberFormat(sheet.getCell(row, 1), 'PERCENTAGE');
    marginValues.forEach((_, idx) => {
      const colLetter = colToLetter(idx + 2);
      const waccCell = `$A${row}`;
      const marginCell = `${colLetter}$${marginHeaderRow}`;
      const ratio = `(${marginCell}/${baseMarginCell})`;
      const formula = `=IF(OR(${waccCell}<=${gCell},${sharesCell}<=0),"",((NPV(${waccCell},${fcfRange})*${ratio}+(${fcfLast}*${ratio}*(1+${gCell})/(${waccCell}-${gCell}))/POWER(1+${waccCell},${projectionYears}))-${netDebtCell})/${sharesCell})`;
      setFormula(sheet.getCell(row, idx + 2), formula, null);
      applyNumberFormat(sheet.getCell(row, idx + 2), 'CURRENCY_DECIMALS');
      sheet.getCell(row, idx + 2).style = createFormulaStyle();
    });
    row++;
  });

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [25, 15, 15, 15, 15, 15]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/**
 * Create DCF Checks sheet
 */
function createDCFChecksSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: DCFOutput,
  derived: ReturnType<typeof deriveDcfValues>
): void {
  const sheet = workbook.addWorksheet('Checks');
  const lastDataCol = 3;
  const valuationRows = getValuationRowMap(output.projections.length);

  let row = titleBar(sheet, 'Discounted Cash Flow Analysis', lastDataCol);
  applyUnitsTitleLine(sheet);
  row += 1;

  // Guardrails
  sectionHeader(sheet, row, 'Guardrails', lastDataCol);
  row++;

  const guardrails = [
    { label: 'WACC > Terminal Growth', formula: `=IF('Assumptions'!$E$12<='Assumptions'!$E$11,"FAIL","OK")` },
    { label: 'LTM Revenue >= $1,000mm', formula: `=IF('Assumptions'!$B$30<1000,"FAIL","OK")` },
    { label: 'Shares Outstanding Provided', formula: `=IF('Assumptions'!$E$32=TRUE,"FAIL","OK")` },
    { label: 'Net Debt Missing Inputs', formula: `=IF('Assumptions'!$E$31=TRUE,"WARN","OK")` },
    { label: 'Shares Outstanding in Range', formula: `=IF(OR('Assumptions'!$B$32<1,'Assumptions'!$B$32>100000),"WARN","OK")` },
    { label: 'Exit Multiple Required If Enabled', formula: `=IF('Assumptions'!$B$37=TRUE,IF('Assumptions'!$B$38>0,"OK","FAIL"),"OK")` },
    { label: 'EV Reconciles (PV FCF + PV TV)', formula: `=IF(ABS('Valuation'!$B$${valuationRows.enterpriseValueRow}-('Valuation'!$B$${valuationRows.pvFcfRow}+'Valuation'!$B$${valuationRows.pvTerminalRow}))>1,"FAIL","OK")` },
    { label: 'Price per Share <= $50,000', formula: `=IF('Valuation'!$B$${valuationRows.priceRow}>50000,"WARN","OK")` },
    { label: 'Enterprise Value >= 0', formula: `=IF('Valuation'!$B$${valuationRows.enterpriseValueRow}<0,"WARN","OK")` },
    { label: 'Equity Value >= 0', formula: `=IF('Valuation'!$B$${valuationRows.equityRow}<0,"WARN","OK")` },
  ];

  guardrails.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    setFormula(sheet.getCell(row, 2), item.formula, null);
    sheet.getCell(row, 2).style = createFormulaStyle();
    row++;
  });

  row += 2;

  // EV Method Reconciliation
  sectionHeader(sheet, row, 'EV Method Reconciliation', lastDataCol);
  row++;

  sheet.getCell(row, 1).value = 'PV of Projected FCF';
  setFormula(sheet.getCell(row, 2), `='Valuation'!$B$${valuationRows.pvFcfRow}`, output.valuation.pvOfProjectedFCF);
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  row++;

  sheet.getCell(row, 1).value = 'PV of Terminal Value';
  setFormula(sheet.getCell(row, 2), `='Valuation'!$B$${valuationRows.pvTerminalRow}`, output.valuation.pvOfTerminalValue);
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  row++;

  sheet.getCell(row, 1).value = 'Enterprise Value';
  setFormula(sheet.getCell(row, 2), `='Valuation'!$B$${valuationRows.enterpriseValueRow}`, output.valuation.enterpriseValue);
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  row++;

  sheet.getCell(row, 1).value = 'Terminal Value % of EV';
  setFormula(sheet.getCell(row, 2), `=IF('Valuation'!$B$${valuationRows.enterpriseValueRow}>0,'Valuation'!$B$${valuationRows.pvTerminalRow}/'Valuation'!$B$${valuationRows.enterpriseValueRow},0)`, null);
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createFormulaStyle();
  sheet.getCell(row, 3).value = 'Unusual if outside 50-90%';
  sheet.getCell(row, 3).style = createNormalStyle();
  row += 2;

  // FCF Build Check
  sectionHeader(sheet, row, 'FCF Build Check', lastDataCol);
  row++;

  output.projections.forEach((proj, idx) => {
    const calculatedFCF = proj.nopat + proj.depreciation - proj.capex - proj.nwcChange;
    const diff = Math.abs(calculatedFCF - proj.unleveredFCF);
    const isCorrect = diff < 0.01;

    sheet.getCell(row, 1).value = `Year ${proj.year}`;
    sheet.getCell(row, 2).value = diff;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    sheet.getCell(row, 2).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, color: { argb: isCorrect ? 'FF008000' : 'FFFF0000' } },
    };
    row++;
  });

  const checksLastRow = row - 1;
  setColWidthsKit(sheet, [25, 15, 30]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, lastCol: lastDataCol, lastRow: checksLastRow });
  hideUnusedArea(sheet, lastDataCol, checksLastRow);
}

/**
 * Create DCF Sources & Notes sheet
 */
function createDCFSourcesNotesSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  inputs: DCFInputs
): void {
  const sheet = workbook.addWorksheet('Sources & Notes');
  const lastDataCol = 2;

  let row = titleBar(sheet, 'Discounted Cash Flow Analysis', lastDataCol);
  applyUnitsTitleLine(sheet);
  row += 1;

  // Data Sources
  sectionHeader(sheet, row, 'Data Sources', lastDataCol);
  row++;

  const dataSources = inputs.dataSources || {};
  const sourceItems = [
    { label: 'Revenue', source: dataSources.revenue || 'Reported' },
    { label: 'EBITDA', source: dataSources.ebitda || 'Reported' },
    { label: 'Shares Outstanding', source: inputs.sharesSource || 'Reported' },
    { label: 'WACC', source: dataSources.wacc || 'User' },
  ];

  sourceItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 2).value = item.source;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, color: { argb: item.source === 'User' ? 'FF0066CC' : 'FF000000' } },
    };
    row++;
  });

  row += 2;

  // Classification
  sectionHeader(sheet, row, 'Input Classification', lastDataCol);
  row++;

  const classifications = [
    { label: 'Fetched', detail: 'LTM Revenue, Net Debt, Shares Outstanding' },
    { label: 'Assumed', detail: 'Revenue Growth, EBITDA Margin, Capex %, ΔNWC %, Terminal Growth, Discount Rate' },
    { label: 'Advanced Override', detail: 'Risk-Free Rate, ERP, Beta, Cost of Debt, Capital Structure, Tax Rate' },
    { label: 'Calculated', detail: 'Revenue, EBITDA, EBIT, NOPAT, UFCF, Discount Factors, Valuation Outputs' },
  ];

  classifications.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 2).value = item.detail;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).style = { ...createNormalStyle(), alignment: { wrapText: true } };
    row++;
  });

  row += 2;

  // Notes
  sectionHeader(sheet, row, 'Notes', lastDataCol);
  row++;

  const notes = [
    'WACC components require user inputs if missing (no guessing beta/ERP)',
    'Tax rate may be derived from historical pre-tax + tax expense if available',
    'Shares may be derived from Market Cap ÷ Price if available',
    'FCF build starts from EBIT with consistent path',
    'D&A, Capex, NWC must be historical-ratio-based or user inputs',
    'Terminal value flagged if outside typical 60-80% of EV range',
  ];

  notes.forEach(note => {
    sheet.getCell(row, 1).value = `• ${note}`;
    sheet.getCell(row, 1).style = { ...createNormalStyle(), alignment: { wrapText: true } };
    row++;
  });

  const sourcesLastRow = row - 1;
  setColWidthsKit(sheet, [50, 20]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, lastCol: lastDataCol, lastRow: sourcesLastRow });
  hideUnusedArea(sheet, lastDataCol, sourcesLastRow);
}

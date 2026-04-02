import ExcelJS from 'exceljs';
import type { DcfModelInputs } from '@/lib/model-generator/extractInputs';
import { finalizeChecksSheet, writeCheckRow } from '@/lib/model-generator/excel/checks';
import { addEquationsSheet, type EquationRow } from '@/lib/model-generator/excel/equations';
import {
  styleAccentOutput,
  applyWorkbookMeta,
  col,
  enableWorkbookRecalculation,
  finalizeWorkbookCompatibility,
  mergeAndCenter,
  setupSheet,
  styleFormula,
  styleInput,
  styleLabel,
  styleModelMeta,
  styleNarrativeBlock,
  styleOutput,
  styleSectionHeader,
  styleSubtitle,
  styleSubTotal,
  styleTableHeader,
  styleThinGrid,
  styleTitle,
  styleTotal,
} from '@/lib/model-generator/excel/formatting';
import { defineNamedCell, defineNamedCells } from '@/lib/model-generator/excel/namedRanges';

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function yearName(prefix: string, year: string) {
  return `${prefix}_${year.replace(/[^A-Za-z0-9]/g, '')}`;
}

function buildAxis(base: number, step: number, size: number, floor = 0): number[] {
  const start = base - step * Math.floor(size / 2);
  return Array.from({ length: size }, (_, index) => Number(Math.max(start + step * index, floor).toFixed(4)));
}

type DcfForecastCacheRow = {
  year: string;
  revenue: number;
  revenueGrowth: number;
  ebitMargin: number;
  ebit: number;
  taxes: number;
  nopat: number;
  da: number;
  capex: number;
  endingNwc: number;
  deltaNwc: number;
  ufcf: number;
  discountPeriod: number;
  discountFactor: number;
  pvFcf: number;
  ebitda: number;
};

type DcfWorkbookCache = {
  baseYear: {
    revenue: number;
    ebitMargin: number;
    ebit: number;
    taxes: number;
    nopat: number;
    da: number;
    capex: number;
    endingNwc: number;
    deltaNwc: number;
    ufcf: number;
  };
  forecast: DcfForecastCacheRow[];
  pvExplicitFcf: number;
  exitMultipleTv: number;
  perpetuityTv: number;
  selectedTv: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  impliedSharePrice: number;
  valueDriverMix: {
    explicitFcfPctEv: number;
    terminalValuePctEv: number;
    netDebtPctEv: number;
    equityValuePctEv: number;
  };
  sensitivity: {
    perpetuity: Array<Array<number | ''>>;
    exitMultiple: Array<Array<number | ''>>;
  };
};

function formulaValue(formula: string, result: number | string): ExcelJS.CellValue {
  return { formula, result };
}

function roundCache(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(6));
}

function computeDcfWorkbookCache(
  inputs: DcfModelInputs,
  forecastYears: string[],
  waccAxis: number[],
  growthAxis: number[],
  multipleAxis: number[],
  exitMultiple: number,
  terminalMethod: 'Perpetuity Growth' | 'Exit Multiple'
): DcfWorkbookCache {
  const baseRevenue = inputs.baseRevenue;
  const baseEbitMargin = inputs.ebitMargin[0] ?? 0;
  const baseEbit = baseRevenue * baseEbitMargin;
  const baseTaxes = Math.max(baseEbit, 0) * inputs.taxRate;
  const baseNopat = baseEbit - baseTaxes;
  const baseDa = baseRevenue * inputs.daPctRevenue;
  const baseCapex = baseRevenue * inputs.capexPctRevenue;
  const baseEndingNwc = baseRevenue * inputs.nwcPctRevenue;
  const baseDeltaNwc = 0;
  const baseUfcf = baseNopat + baseDa - baseCapex - baseDeltaNwc;

  let previousRevenue = baseRevenue;
  let previousEndingNwc = baseEndingNwc;

  const forecast = forecastYears.map((year, index) => {
    const revenueGrowth = inputs.revenueGrowth[index] ?? 0;
    const ebitMargin = inputs.ebitMargin[index] ?? inputs.ebitMargin[inputs.ebitMargin.length - 1] ?? 0;
    const revenue = previousRevenue * (1 + revenueGrowth);
    const ebit = revenue * ebitMargin;
    const taxes = Math.max(ebit, 0) * inputs.taxRate;
    const nopat = ebit - taxes;
    const da = revenue * inputs.daPctRevenue;
    const capex = revenue * inputs.capexPctRevenue;
    const endingNwc = revenue * inputs.nwcPctRevenue;
    const deltaNwc = endingNwc - previousEndingNwc;
    const ufcf = nopat + da - capex - deltaNwc;
    const discountPeriod = index + 1;
    const discountFactor = 1 / (1 + inputs.wacc) ** discountPeriod;
    const pvFcf = ufcf * discountFactor;
    const ebitda = ebit + da;

    previousRevenue = revenue;
    previousEndingNwc = endingNwc;

    return {
      year,
      revenue: roundCache(revenue),
      revenueGrowth: roundCache(revenueGrowth),
      ebitMargin: roundCache(ebitMargin),
      ebit: roundCache(ebit),
      taxes: roundCache(taxes),
      nopat: roundCache(nopat),
      da: roundCache(da),
      capex: roundCache(capex),
      endingNwc: roundCache(endingNwc),
      deltaNwc: roundCache(deltaNwc),
      ufcf: roundCache(ufcf),
      discountPeriod,
      discountFactor: roundCache(discountFactor),
      pvFcf: roundCache(pvFcf),
      ebitda: roundCache(ebitda),
    };
  });

  const lastForecast = forecast[forecast.length - 1];
  const pvExplicitFcf = roundCache(forecast.reduce((sum, row) => sum + row.pvFcf, 0));
  const exitMultipleTv = roundCache((lastForecast?.ebitda ?? 0) * exitMultiple);
  const perpetuityTv =
    inputs.wacc > inputs.terminalGrowth
      ? roundCache(((lastForecast?.ufcf ?? 0) * (1 + inputs.terminalGrowth)) / (inputs.wacc - inputs.terminalGrowth))
      : 0;
  const selectedTv = terminalMethod === 'Exit Multiple' ? exitMultipleTv : perpetuityTv;
  const pvTerminalValue = roundCache(selectedTv * (lastForecast?.discountFactor ?? 0));
  const enterpriseValue = roundCache(pvExplicitFcf + pvTerminalValue);
  const netDebt = roundCache(inputs.debt - inputs.cash);
  const equityValue = roundCache(enterpriseValue - netDebt);
  const impliedSharePrice = inputs.sharesOutstanding > 0 ? roundCache(equityValue / inputs.sharesOutstanding) : 0;

  const perpetuitySensitivity = waccAxis.map((wacc) =>
    growthAxis.map((terminalGrowth) => {
      if (terminalGrowth >= wacc) return '';
      const explicitPv = forecast.reduce((sum, row, index) => sum + row.ufcf / (1 + wacc) ** (index + 1), 0);
      const terminalValue = ((lastForecast?.ufcf ?? 0) * (1 + terminalGrowth)) / (wacc - terminalGrowth);
      const pvTv = terminalValue / (1 + wacc) ** inputs.years;
      return roundCache((explicitPv + pvTv - netDebt) / inputs.sharesOutstanding);
    })
  );
  const exitMultipleSensitivity = waccAxis.map((wacc) =>
    multipleAxis.map((multiple) => {
      const explicitPv = forecast.reduce((sum, row, index) => sum + row.ufcf / (1 + wacc) ** (index + 1), 0);
      const pvTv = ((lastForecast?.ebitda ?? 0) * multiple) / (1 + wacc) ** inputs.years;
      return roundCache((explicitPv + pvTv - netDebt) / inputs.sharesOutstanding);
    })
  );

  return {
    baseYear: {
      revenue: roundCache(baseRevenue),
      ebitMargin: roundCache(baseEbitMargin),
      ebit: roundCache(baseEbit),
      taxes: roundCache(baseTaxes),
      nopat: roundCache(baseNopat),
      da: roundCache(baseDa),
      capex: roundCache(baseCapex),
      endingNwc: roundCache(baseEndingNwc),
      deltaNwc: roundCache(baseDeltaNwc),
      ufcf: roundCache(baseUfcf),
    },
    forecast,
    pvExplicitFcf,
    exitMultipleTv,
    perpetuityTv,
    selectedTv: roundCache(selectedTv),
    pvTerminalValue,
    enterpriseValue,
    netDebt,
    equityValue,
    impliedSharePrice,
    valueDriverMix: {
      explicitFcfPctEv: enterpriseValue !== 0 ? roundCache(pvExplicitFcf / enterpriseValue) : 0,
      terminalValuePctEv: enterpriseValue !== 0 ? roundCache(pvTerminalValue / enterpriseValue) : 0,
      netDebtPctEv: enterpriseValue !== 0 ? roundCache(netDebt / enterpriseValue) : 0,
      equityValuePctEv: enterpriseValue !== 0 ? roundCache(equityValue / enterpriseValue) : 0,
    },
    sensitivity: {
      perpetuity: perpetuitySensitivity,
      exitMultiple: exitMultipleSensitivity,
    },
  };
}

const RANGE_NAMES = {
  forecastYears: 'CB_ForecastYears',
  baseRevenue: 'CB_BaseRevenue',
  cashBalance: 'CB_CashBalance',
  debtBalance: 'CB_DebtBalance',
  sharesOutstanding: 'CB_SharesOutstanding',
  currentSharePrice: 'CB_CurrentSharePrice',
  wacc: 'CB_WACC',
  terminalGrowth: 'CB_TerminalGrowth',
  exitMultiple: 'CB_ExitMultiple',
  terminalMethod: 'CB_TerminalMethod',
  taxRate: 'CB_TaxRate',
  daPctRevenue: 'CB_DAPctRevenue',
  capexPctRevenue: 'CB_CapexPctRevenue',
  nwcPctRevenue: 'CB_NWCPctRevenue',
  pvExplicitFcf: 'CB_PVExplicitFCF',
  pvTerminalValue: 'CB_PVTerminalValue',
  enterpriseValue: 'CB_EnterpriseValue',
  netDebt: 'CB_NetDebt',
  equityValue: 'CB_EquityValue',
  impliedSharePrice: 'CB_ImpliedSharePrice',
} as const;

export function getPreview(inputs: DcfModelInputs) {
  return {
    title: `${inputs.companyName} DCF`,
    tabs: ['Cover', 'Assumptions', 'Operating Forecast', 'DCF Valuation', 'Sensitivity', 'Equations', 'Checks'],
    keyAssumptions: {
      years: inputs.years,
      wacc: inputs.wacc,
      terminalGrowth: inputs.terminalGrowth,
    },
  };
}

export async function buildWorkbook(inputs: DcfModelInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  const baseYear = generatedAt.getFullYear() - 1;
  const forecastYears = Array.from({ length: inputs.years }, (_, index) => `${baseYear + index + 1}E`);
  const lastForecastYear = forecastYears[forecastYears.length - 1];
  const sharePrice = inputs.sharePrice ?? 0;
  const exitMultiple = 14;
  const terminalMethod: 'Perpetuity Growth' | 'Exit Multiple' = 'Perpetuity Growth';
  const waccAxis = buildAxis(inputs.wacc, 0.005, 5, 0.05);
  const growthAxis = buildAxis(inputs.terminalGrowth, 0.005, 5, 0);
  const multipleAxis = [10, 12, 14, 16, 18];
  const cache = computeDcfWorkbookCache(inputs, forecastYears, waccAxis, growthAxis, multipleAxis, exitMultiple, terminalMethod);
  const equations: EquationRow[] = [];

  applyWorkbookMeta(workbook, `${inputs.companyName} DCF Valuation`);
  enableWorkbookRecalculation(workbook);

  const coverSheet = workbook.addWorksheet('Cover');
  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  const forecastSheet = workbook.addWorksheet('Operating Forecast');
  const valuationSheet = workbook.addWorksheet('DCF Valuation');
  const sensitivitySheet = workbook.addWorksheet('Sensitivity');
  const checksSheet = workbook.addWorksheet('Checks');

  setupSheet(coverSheet, { freezeRows: 2, freezeCols: 0, tabColor: 'FF1D4ED8', columnWidths: [28, 18, 18, 18, 24, 18, 18, 18] });
  setupSheet(assumptionsSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF2563EB', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14, 14] });
  setupSheet(forecastSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF0F766E', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14, 14] });
  setupSheet(valuationSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF047857', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14, 14] });
  setupSheet(sensitivitySheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF7C3AED', columnWidths: [24, 12, 14, 14, 14, 14, 14, 14] });
  setupSheet(checksSheet, { freezeRows: 3, freezeCols: 1, tabColor: 'FFB45309', columnWidths: [30, 16, 36, 18] });

  coverSheet.getCell('A1').value = `${inputs.companyName} Discounted Cash Flow`;
  mergeAndCenter(coverSheet, 'A1:H1');
  styleTitle(coverSheet.getCell('A1'));
  coverSheet.getCell('A2').value =
    'Decision-useful DCF template with a single assumptions panel, linked operating forecast, valuation bridge, sensitivity, equations, and checks.';
  mergeAndCenter(coverSheet, 'A2:H2');
  styleSubtitle(coverSheet.getCell('A2'));
  styleModelMeta(coverSheet, 4, 'Company', inputs.companyName);
  styleModelMeta(coverSheet, 5, 'Ticker', inputs.ticker || 'N/A');
  styleModelMeta(coverSheet, 6, 'Generated', formatDate(generatedAt));
  styleModelMeta(coverSheet, 7, 'Source', inputs.source);
  styleModelMeta(coverSheet, 8, 'Input legend', 'Blue cells are editable inputs. Green cells are formula-driven outputs.');

  styleSectionHeader(coverSheet, 10, 'Assumption Snapshot', 3);
  coverSheet.getCell('A11').value = 'Forecast years';
  coverSheet.getCell('B11').value = formulaValue(`=${RANGE_NAMES.forecastYears}`, inputs.years);
  coverSheet.getCell('A12').value = 'WACC';
  coverSheet.getCell('B12').value = formulaValue(`=${RANGE_NAMES.wacc}`, inputs.wacc);
  coverSheet.getCell('A13').value = 'Terminal growth';
  coverSheet.getCell('B13').value = formulaValue(`=${RANGE_NAMES.terminalGrowth}`, inputs.terminalGrowth);
  coverSheet.getCell('A14').value = 'Exit multiple';
  coverSheet.getCell('B14').value = formulaValue(`=${RANGE_NAMES.exitMultiple}`, exitMultiple);
  coverSheet.getCell('A15').value = 'Terminal method';
  coverSheet.getCell('B15').value = formulaValue(`=${RANGE_NAMES.terminalMethod}`, terminalMethod);
  ['A11', 'A12', 'A13', 'A14', 'A15'].forEach((ref) => styleLabel(coverSheet.getCell(ref)));
  styleFormula(coverSheet.getCell('B11'), 'number');
  styleFormula(coverSheet.getCell('B12'), 'percent');
  styleFormula(coverSheet.getCell('B13'), 'percent');
  styleFormula(coverSheet.getCell('B14'), 'multiple');
  styleFormula(coverSheet.getCell('B15'));

  styleSectionHeader(coverSheet, 10, 'Valuation Snapshot', 7);
  coverSheet.getCell('E11').value = 'Enterprise Value';
  coverSheet.getCell('F11').value = formulaValue(`=${RANGE_NAMES.enterpriseValue}`, cache.enterpriseValue);
  coverSheet.getCell('E12').value = 'Equity Value';
  coverSheet.getCell('F12').value = formulaValue(`=${RANGE_NAMES.equityValue}`, cache.equityValue);
  coverSheet.getCell('E13').value = 'Implied Share Price';
  coverSheet.getCell('F13').value = formulaValue(`=${RANGE_NAMES.impliedSharePrice}`, cache.impliedSharePrice);
  coverSheet.getCell('E14').value = 'PV of Explicit FCF';
  coverSheet.getCell('F14').value = formulaValue(`=${RANGE_NAMES.pvExplicitFcf}`, cache.pvExplicitFcf);
  coverSheet.getCell('E15').value = 'PV of Terminal Value';
  coverSheet.getCell('F15').value = formulaValue(`=${RANGE_NAMES.pvTerminalValue}`, cache.pvTerminalValue);
  ['E11', 'E12', 'E13', 'E14', 'E15'].forEach((ref) => styleLabel(coverSheet.getCell(ref)));
  styleAccentOutput(coverSheet.getCell('F11'), 'currency');
  styleAccentOutput(coverSheet.getCell('F12'), 'currency');
  styleAccentOutput(coverSheet.getCell('F13'), 'currency');
  styleOutput(coverSheet.getCell('F14'), 'currency');
  styleOutput(coverSheet.getCell('F15'), 'currency');
  styleThinGrid(coverSheet, 11, 15, 1, 2);
  styleThinGrid(coverSheet, 11, 15, 5, 6);

  styleSectionHeader(coverSheet, 18, 'Valuation Bridge', 3);
  coverSheet.getCell('A19').value = 'PV of Explicit FCF';
  coverSheet.getCell('B19').value = formulaValue(`=${RANGE_NAMES.pvExplicitFcf}`, cache.pvExplicitFcf);
  coverSheet.getCell('A20').value = 'PV of Terminal Value';
  coverSheet.getCell('B20').value = formulaValue(`=${RANGE_NAMES.pvTerminalValue}`, cache.pvTerminalValue);
  coverSheet.getCell('A21').value = 'Enterprise Value';
  coverSheet.getCell('B21').value = formulaValue(`=${RANGE_NAMES.enterpriseValue}`, cache.enterpriseValue);
  coverSheet.getCell('A22').value = 'Net debt / (cash)';
  coverSheet.getCell('B22').value = formulaValue(`=${RANGE_NAMES.netDebt}`, cache.netDebt);
  coverSheet.getCell('A23').value = 'Equity Value';
  coverSheet.getCell('B23').value = formulaValue(`=${RANGE_NAMES.equityValue}`, cache.equityValue);
  ['A19', 'A20', 'A21', 'A22', 'A23'].forEach((ref) => styleLabel(coverSheet.getCell(ref)));
  ['B19', 'B20', 'B21', 'B22', 'B23'].forEach((ref, index) =>
    index === 2 || index === 4 ? styleOutput(coverSheet.getCell(ref), 'currency') : styleFormula(coverSheet.getCell(ref), 'currency')
  );

  styleSectionHeader(coverSheet, 18, 'Sensitivity Snapshot', 8);
  coverSheet.getCell('E19').value = 'Implied Share Price';
  coverSheet.getCell('F19').value = formulaValue(`=${RANGE_NAMES.impliedSharePrice}`, cache.impliedSharePrice);
  coverSheet.getCell('E20').value = 'Current Share Price';
  coverSheet.getCell('F20').value = formulaValue(`=${RANGE_NAMES.currentSharePrice}`, sharePrice);
  coverSheet.getCell('E21').value = 'Upside / (Downside)';
  coverSheet.getCell('F21').value = formulaValue(
    `=IF(${RANGE_NAMES.currentSharePrice}>0,${RANGE_NAMES.impliedSharePrice}/${RANGE_NAMES.currentSharePrice}-1,"")`,
    sharePrice > 0 ? roundCache(cache.impliedSharePrice / sharePrice - 1) : ''
  );
  coverSheet.getCell('E22').value = 'Low Sensitivity Price';
  coverSheet.getCell('F22').value = formulaValue(
    '=MIN(Sensitivity!C5:G9)',
    Math.min(...cache.sensitivity.perpetuity.flat().filter((value): value is number => typeof value === 'number'))
  );
  coverSheet.getCell('E23').value = 'High Sensitivity Price';
  coverSheet.getCell('F23').value = formulaValue(
    '=MAX(Sensitivity!C5:G9)',
    Math.max(...cache.sensitivity.perpetuity.flat().filter((value): value is number => typeof value === 'number'))
  );
  ['E19', 'E20', 'E21', 'E22', 'E23'].forEach((ref) => styleLabel(coverSheet.getCell(ref)));
  styleAccentOutput(coverSheet.getCell('F19'), 'currency');
  styleFormula(coverSheet.getCell('F20'), 'currency');
  styleAccentOutput(coverSheet.getCell('F21'), 'percent');
  styleFormula(coverSheet.getCell('F22'), 'currency');
  styleFormula(coverSheet.getCell('F23'), 'currency');
  styleThinGrid(coverSheet, 19, 23, 1, 2);
  styleThinGrid(coverSheet, 19, 23, 5, 6);

  coverSheet.getCell('A26').value =
    'Read the cover sheet first, then challenge the assumptions tab, inspect the FCF build, and only then rely on the valuation range. Terminal value should not do all the work.';
  mergeAndCenter(coverSheet, 'A26:H26');
  styleNarrativeBlock(coverSheet, 26, 1, 8);

  assumptionsSheet.getCell('A1').value = `${inputs.companyName} Valuation Assumptions`;
  mergeAndCenter(assumptionsSheet, 'A1:I1');
  styleTitle(assumptionsSheet.getCell('A1'));
  assumptionsSheet.getCell('A2').value =
    'Single source of truth for model inputs. Change assumptions here and follow the linked forecast, valuation, sensitivity, equations, and checks tabs.';
  mergeAndCenter(assumptionsSheet, 'A2:I2');
  styleSubtitle(assumptionsSheet.getCell('A2'));
  styleModelMeta(assumptionsSheet, 4, 'Base year', `${baseYear}A`);
  styleModelMeta(assumptionsSheet, 5, 'Model type', 'Unlevered DCF');

  styleSectionHeader(assumptionsSheet, 7, 'Operating Inputs', 4);
  assumptionsSheet.getCell('A8').value = 'Forecast years';
  assumptionsSheet.getCell('B8').value = inputs.years;
  assumptionsSheet.getCell('A9').value = 'Base revenue';
  assumptionsSheet.getCell('B9').value = inputs.baseRevenue;
  assumptionsSheet.getCell('A10').value = 'Cash';
  assumptionsSheet.getCell('B10').value = inputs.cash;
  assumptionsSheet.getCell('A11').value = 'Debt';
  assumptionsSheet.getCell('B11').value = inputs.debt;
  assumptionsSheet.getCell('A12').value = 'Shares outstanding';
  assumptionsSheet.getCell('B12').value = inputs.sharesOutstanding;
  assumptionsSheet.getCell('A13').value = 'Current share price';
  assumptionsSheet.getCell('B13').value = sharePrice;
  ['A8', 'A9', 'A10', 'A11', 'A12', 'A13'].forEach((ref) => styleLabel(assumptionsSheet.getCell(ref)));
  styleInput(assumptionsSheet.getCell('B8'), 'number');
  styleInput(assumptionsSheet.getCell('B9'), 'currency');
  styleInput(assumptionsSheet.getCell('B10'), 'currency');
  styleInput(assumptionsSheet.getCell('B11'), 'currency');
  styleInput(assumptionsSheet.getCell('B12'), 'number');
  styleInput(assumptionsSheet.getCell('B13'), 'currency');

  styleSectionHeader(assumptionsSheet, 15, 'Valuation Inputs', 4);
  assumptionsSheet.getCell('A15').value = 'WACC';
  assumptionsSheet.getCell('B15').value = inputs.wacc;
  assumptionsSheet.getCell('A16').value = 'Terminal growth';
  assumptionsSheet.getCell('B16').value = inputs.terminalGrowth;
  assumptionsSheet.getCell('A17').value = 'Exit EBITDA multiple';
  assumptionsSheet.getCell('B17').value = exitMultiple;
  assumptionsSheet.getCell('A18').value = 'Terminal method';
  assumptionsSheet.getCell('B18').value = terminalMethod;
  assumptionsSheet.getCell('A19').value = 'Tax rate';
  assumptionsSheet.getCell('B19').value = inputs.taxRate;
  assumptionsSheet.getCell('A20').value = 'D&A % revenue';
  assumptionsSheet.getCell('B20').value = inputs.daPctRevenue;
  assumptionsSheet.getCell('A21').value = 'Capex % revenue';
  assumptionsSheet.getCell('B21').value = inputs.capexPctRevenue;
  assumptionsSheet.getCell('A22').value = 'NWC % revenue';
  assumptionsSheet.getCell('B22').value = inputs.nwcPctRevenue;
  ['A15', 'A16', 'A17', 'A18', 'A19', 'A20', 'A21', 'A22'].forEach((ref) => styleLabel(assumptionsSheet.getCell(ref)));
  styleInput(assumptionsSheet.getCell('B15'), 'percent');
  styleInput(assumptionsSheet.getCell('B16'), 'percent');
  styleInput(assumptionsSheet.getCell('B17'), 'multiple');
  styleInput(assumptionsSheet.getCell('B18'));
  styleInput(assumptionsSheet.getCell('B19'), 'percent');
  styleInput(assumptionsSheet.getCell('B20'), 'percent');
  styleInput(assumptionsSheet.getCell('B21'), 'percent');
  styleInput(assumptionsSheet.getCell('B22'), 'percent');

  styleSectionHeader(assumptionsSheet, 24, 'Yearly Operating Drivers', 2 + inputs.years);
  styleTableHeader(assumptionsSheet, 25, 1, 2 + inputs.years);
  assumptionsSheet.getCell('A25').value = 'Driver';
  assumptionsSheet.getCell('B25').value = `${baseYear}A`;
  assumptionsSheet.getCell('A26').value = 'Revenue growth';
  assumptionsSheet.getCell('A27').value = 'EBIT margin';
  assumptionsSheet.getCell('A28').value = 'Capex % revenue';
  assumptionsSheet.getCell('A29').value = 'D&A % revenue';
  assumptionsSheet.getCell('A30').value = 'NWC % revenue';
  ['A26', 'A27', 'A28', 'A29', 'A30'].forEach((ref) => styleLabel(assumptionsSheet.getCell(ref)));
  forecastYears.forEach((year, index) => {
    const columnIndex = 3 + index;
    const letter = col(columnIndex);
    assumptionsSheet.getCell(25, columnIndex).value = year;
    assumptionsSheet.getCell(26, columnIndex).value = inputs.revenueGrowth[index];
    assumptionsSheet.getCell(27, columnIndex).value = inputs.ebitMargin[index];
    assumptionsSheet.getCell(28, columnIndex).value = inputs.capexPctRevenue;
    assumptionsSheet.getCell(29, columnIndex).value = inputs.daPctRevenue;
    assumptionsSheet.getCell(30, columnIndex).value = inputs.nwcPctRevenue;
    ['26', '27', '28', '29', '30'].forEach((row) => styleInput(assumptionsSheet.getCell(`${letter}${row}`), 'percent'));
  });

  defineNamedCells(workbook, assumptionsSheet, [
    { name: RANGE_NAMES.forecastYears, cellRef: 'B8' },
    { name: RANGE_NAMES.baseRevenue, cellRef: 'B9' },
    { name: RANGE_NAMES.cashBalance, cellRef: 'B10' },
    { name: RANGE_NAMES.debtBalance, cellRef: 'B11' },
    { name: RANGE_NAMES.sharesOutstanding, cellRef: 'B12' },
    { name: RANGE_NAMES.currentSharePrice, cellRef: 'B13' },
    { name: RANGE_NAMES.wacc, cellRef: 'B15' },
    { name: RANGE_NAMES.terminalGrowth, cellRef: 'B16' },
    { name: RANGE_NAMES.exitMultiple, cellRef: 'B17' },
    { name: RANGE_NAMES.terminalMethod, cellRef: 'B18' },
    { name: RANGE_NAMES.taxRate, cellRef: 'B19' },
    { name: RANGE_NAMES.daPctRevenue, cellRef: 'B20' },
    { name: RANGE_NAMES.capexPctRevenue, cellRef: 'B21' },
    { name: RANGE_NAMES.nwcPctRevenue, cellRef: 'B22' },
  ]);
  forecastYears.forEach((year, index) => {
    defineNamedCell(workbook, yearName('RevenueGrowth', year), assumptionsSheet, `${col(3 + index)}26`);
    defineNamedCell(workbook, yearName('EBITMargin', year), assumptionsSheet, `${col(3 + index)}27`);
    defineNamedCell(workbook, yearName('CapexPct', year), assumptionsSheet, `${col(3 + index)}28`);
    defineNamedCell(workbook, yearName('DAPct', year), assumptionsSheet, `${col(3 + index)}29`);
    defineNamedCell(workbook, yearName('NWCPct', year), assumptionsSheet, `${col(3 + index)}30`);
  });

  forecastSheet.getCell('A1').value = 'Operating Forecast';
  mergeAndCenter(forecastSheet, 'A1:I1');
  styleTitle(forecastSheet.getCell('A1'));
  styleSectionHeader(forecastSheet, 3, 'Unlevered Free Cash Flow Build', 2 + inputs.years);
  styleTableHeader(forecastSheet, 4, 1, 2 + inputs.years);
  forecastSheet.getCell('A4').value = 'Line Item';
  forecastSheet.getCell('B4').value = `${baseYear}A`;
  forecastYears.forEach((year, index) => {
    forecastSheet.getCell(4, 3 + index).value = year;
  });

  const forecastRows = {
    revenue: 5,
    revenueGrowth: 6,
    ebit: 7,
    ebitMargin: 8,
    taxes: 9,
    nopat: 10,
    da: 11,
    capex: 12,
    deltaNwc: 13,
    ufcf: 14,
  } as const;

  [
    [forecastRows.revenue, 'Revenue'],
    [forecastRows.revenueGrowth, 'Revenue growth'],
    [forecastRows.ebit, 'EBIT'],
    [forecastRows.ebitMargin, 'EBIT margin'],
    [forecastRows.taxes, 'Taxes'],
    [forecastRows.nopat, 'NOPAT'],
    [forecastRows.da, 'D&A'],
    [forecastRows.capex, 'Capex'],
    [forecastRows.deltaNwc, 'Change in NWC'],
    [forecastRows.ufcf, 'Unlevered FCF'],
  ].forEach(([row, label]) => {
    forecastSheet.getCell(`A${row}`).value = label;
    styleLabel(forecastSheet.getCell(`A${row}`));
  });

  forecastSheet.getCell(`B${forecastRows.revenue}`).value = formulaValue(`=${RANGE_NAMES.baseRevenue}`, cache.baseYear.revenue);
  forecastSheet.getCell(`B${forecastRows.revenueGrowth}`).value = '';
  forecastSheet.getCell(`B${forecastRows.ebitMargin}`).value = inputs.ebitMargin[0];
  forecastSheet.getCell(`B${forecastRows.ebit}`).value = formulaValue(`=B${forecastRows.revenue}*B${forecastRows.ebitMargin}`, cache.baseYear.ebit);
  forecastSheet.getCell(`B${forecastRows.taxes}`).value = formulaValue(`=MAX(B${forecastRows.ebit},0)*${RANGE_NAMES.taxRate}`, cache.baseYear.taxes);
  forecastSheet.getCell(`B${forecastRows.nopat}`).value = formulaValue(`=B${forecastRows.ebit}-B${forecastRows.taxes}`, cache.baseYear.nopat);
  forecastSheet.getCell(`B${forecastRows.da}`).value = formulaValue(`=B${forecastRows.revenue}*${RANGE_NAMES.daPctRevenue}`, cache.baseYear.da);
  forecastSheet.getCell(`B${forecastRows.capex}`).value = formulaValue(`=B${forecastRows.revenue}*${RANGE_NAMES.capexPctRevenue}`, cache.baseYear.capex);
  forecastSheet.getCell(`B${forecastRows.deltaNwc}`).value = 0;
  forecastSheet.getCell(`B${forecastRows.ufcf}`).value = formulaValue(`=B${forecastRows.nopat}+B${forecastRows.da}-B${forecastRows.capex}-B${forecastRows.deltaNwc}`, cache.baseYear.ufcf);
  styleFormula(forecastSheet.getCell(`B${forecastRows.revenue}`), 'currency');
  styleFormula(forecastSheet.getCell(`B${forecastRows.ebitMargin}`), 'percent');
  [forecastRows.ebit, forecastRows.taxes, forecastRows.nopat, forecastRows.da, forecastRows.capex, forecastRows.deltaNwc].forEach((row) =>
    styleFormula(forecastSheet.getCell(`B${row}`), 'currency')
  );
  styleOutput(forecastSheet.getCell(`B${forecastRows.ufcf}`), 'currency');

  let previousRevenueName: string = RANGE_NAMES.baseRevenue;
  let previousNwcValue: string = `B${forecastRows.revenue}*${yearName('NWCPct', forecastYears[0])}`;
  forecastYears.forEach((year, index) => {
    const letter = col(3 + index);
    const rowCache = cache.forecast[index];
    const revenueName = yearName('Revenue', year);
    const ebitName = yearName('EBIT', year);
    const nopatName = yearName('NOPAT', year);
    const daName = yearName('DA', year);
    const capexName = yearName('Capex', year);
    const deltaNwcName = yearName('DeltaNWC', year);
    const ufcfName = yearName('UFCF', year);
    const growthName = yearName('RevenueGrowth', year);
    const marginName = yearName('EBITMargin', year);
    const daPctName = yearName('DAPct', year);
    const capexPctName = yearName('CapexPct', year);
    const nwcPctName = yearName('NWCPct', year);

    forecastSheet.getCell(`${letter}${forecastRows.revenue}`).value = formulaValue(`=${previousRevenueName}*(1+${growthName})`, rowCache.revenue);
    forecastSheet.getCell(`${letter}${forecastRows.revenueGrowth}`).value = formulaValue(`=${growthName}`, rowCache.revenueGrowth);
    forecastSheet.getCell(`${letter}${forecastRows.ebit}`).value = formulaValue(`=${revenueName}*${marginName}`, rowCache.ebit);
    forecastSheet.getCell(`${letter}${forecastRows.ebitMargin}`).value = formulaValue(`=${marginName}`, rowCache.ebitMargin);
    forecastSheet.getCell(`${letter}${forecastRows.taxes}`).value = formulaValue(`=MAX(${ebitName},0)*${RANGE_NAMES.taxRate}`, rowCache.taxes);
    forecastSheet.getCell(`${letter}${forecastRows.nopat}`).value = formulaValue(`=${ebitName}-${letter}${forecastRows.taxes}`, rowCache.nopat);
    forecastSheet.getCell(`${letter}${forecastRows.da}`).value = formulaValue(`=${revenueName}*${daPctName}`, rowCache.da);
    forecastSheet.getCell(`${letter}${forecastRows.capex}`).value = formulaValue(`=${revenueName}*${capexPctName}`, rowCache.capex);
    forecastSheet.getCell(`${letter}${forecastRows.deltaNwc}`).value = formulaValue(`=(${revenueName}*${nwcPctName})-(${previousNwcValue})`, rowCache.deltaNwc);
    forecastSheet.getCell(`${letter}${forecastRows.ufcf}`).value = formulaValue(`=${nopatName}+${daName}-${capexName}-${deltaNwcName}`, rowCache.ufcf);

    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.revenue}`), 'currency');
    styleInput(forecastSheet.getCell(`${letter}${forecastRows.revenueGrowth}`), 'percent');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.ebit}`), 'currency');
    styleInput(forecastSheet.getCell(`${letter}${forecastRows.ebitMargin}`), 'percent');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.taxes}`), 'currency');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.nopat}`), 'currency');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.da}`), 'currency');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.capex}`), 'currency');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.deltaNwc}`), 'currency');
    styleOutput(forecastSheet.getCell(`${letter}${forecastRows.ufcf}`), 'currency');

    defineNamedCell(workbook, revenueName, forecastSheet, `${letter}${forecastRows.revenue}`);
    defineNamedCell(workbook, ebitName, forecastSheet, `${letter}${forecastRows.ebit}`);
    defineNamedCell(workbook, nopatName, forecastSheet, `${letter}${forecastRows.nopat}`);
    defineNamedCell(workbook, daName, forecastSheet, `${letter}${forecastRows.da}`);
    defineNamedCell(workbook, capexName, forecastSheet, `${letter}${forecastRows.capex}`);
    defineNamedCell(workbook, deltaNwcName, forecastSheet, `${letter}${forecastRows.deltaNwc}`);
    defineNamedCell(workbook, ufcfName, forecastSheet, `${letter}${forecastRows.ufcf}`);

    equations.push({
      metric: `Revenue ${year}`,
      description: 'Prior-year revenue times one plus revenue growth.',
      excelFormula: `=${previousRevenueName}*(1+${growthName})`,
      dependencies: `${previousRevenueName}, ${growthName}`,
      location: `'Operating Forecast'!${letter}${forecastRows.revenue}`,
    });
    equations.push({
      metric: `UFCF ${year}`,
      description: 'NOPAT plus D&A less capex less the change in NWC.',
      excelFormula: `=${nopatName}+${daName}-${capexName}-${deltaNwcName}`,
      dependencies: `${nopatName}, ${daName}, ${capexName}, ${deltaNwcName}`,
      location: `'Operating Forecast'!${letter}${forecastRows.ufcf}`,
    });

    previousRevenueName = revenueName;
    previousNwcValue = `${revenueName}*${nwcPctName}`;
  });
  styleSubTotal(forecastSheet, forecastRows.nopat, 1, 2 + inputs.years);
  styleTotal(forecastSheet, forecastRows.ufcf, 1, 2 + inputs.years);

  valuationSheet.getCell('A1').value = 'DCF Valuation';
  mergeAndCenter(valuationSheet, 'A1:I1');
  styleTitle(valuationSheet.getCell('A1'));
  styleSectionHeader(valuationSheet, 3, 'Valuation Summary', 4);
  valuationSheet.getCell('A4').value = 'PV of Explicit FCF';
  valuationSheet.getCell('A5').value = 'PV of Terminal Value';
  valuationSheet.getCell('A6').value = 'Enterprise Value';
  valuationSheet.getCell('A7').value = 'Net debt / (cash)';
  valuationSheet.getCell('A8').value = 'Equity Value';
  valuationSheet.getCell('A9').value = 'Value per Share';
  valuationSheet.getCell('A10').value = 'Current Share Price';
  ['A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'].forEach((ref) => styleLabel(valuationSheet.getCell(ref)));

  styleSectionHeader(valuationSheet, 12, 'Discounting Schedule', 2 + inputs.years);
  styleTableHeader(valuationSheet, 13, 1, 2 + inputs.years);
  valuationSheet.getCell('A13').value = 'Line Item';
  valuationSheet.getCell('B13').value = 'Units';
  forecastYears.forEach((year, index) => {
    valuationSheet.getCell(13, 3 + index).value = year;
  });
  const valRows = {
    ufcf: 14,
    period: 15,
    discountFactor: 16,
    pvFcf: 17,
    ebitda: 19,
    exitMultipleTv: 20,
    perpetuityTv: 21,
    selectedTv: 22,
    pvTv: 23,
  } as const;
  [
    [valRows.ufcf, 'Unlevered FCF'],
    [valRows.period, 'Discount period'],
    [valRows.discountFactor, 'Discount factor'],
    [valRows.pvFcf, 'PV of FCF'],
    [valRows.ebitda, 'EBITDA proxy'],
    [valRows.exitMultipleTv, 'Exit multiple TV'],
    [valRows.perpetuityTv, 'Perpetuity growth TV'],
    [valRows.selectedTv, 'Selected terminal value'],
    [valRows.pvTv, 'PV of terminal value'],
  ].forEach(([row, label]) => {
    valuationSheet.getCell(`A${row}`).value = label;
    styleLabel(valuationSheet.getCell(`A${row}`));
  });
  valuationSheet.getCell(`B${valRows.ufcf}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.period}`).value = 'Years';
  valuationSheet.getCell(`B${valRows.discountFactor}`).value = 'x';
  valuationSheet.getCell(`B${valRows.pvFcf}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.ebitda}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.exitMultipleTv}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.perpetuityTv}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.selectedTv}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.pvTv}`).value = '$mm';

  forecastYears.forEach((year, index) => {
    const letter = col(3 + index);
    valuationSheet.getCell(`${letter}${valRows.ufcf}`).value = formulaValue(`=${yearName('UFCF', year)}`, cache.forecast[index].ufcf);
    valuationSheet.getCell(`${letter}${valRows.period}`).value = index + 1;
    valuationSheet.getCell(`${letter}${valRows.discountFactor}`).value = formulaValue(`=1/(1+${RANGE_NAMES.wacc})^${index + 1}`, cache.forecast[index].discountFactor);
    valuationSheet.getCell(`${letter}${valRows.pvFcf}`).value = formulaValue(`=${letter}${valRows.ufcf}*${letter}${valRows.discountFactor}`, cache.forecast[index].pvFcf);
    valuationSheet.getCell(`${letter}${valRows.ebitda}`).value = formulaValue(`=${yearName('EBIT', year)}+${yearName('DA', year)}`, cache.forecast[index].ebitda);
    styleFormula(valuationSheet.getCell(`${letter}${valRows.ufcf}`), 'currency');
    styleFormula(valuationSheet.getCell(`${letter}${valRows.period}`), 'number');
    styleFormula(valuationSheet.getCell(`${letter}${valRows.discountFactor}`), 'multiple');
    styleFormula(valuationSheet.getCell(`${letter}${valRows.pvFcf}`), 'currency');
    styleFormula(valuationSheet.getCell(`${letter}${valRows.ebitda}`), 'currency');
  });

  const lastLetter = col(2 + inputs.years);
  valuationSheet.getCell(`C${valRows.exitMultipleTv}`).value = formulaValue(`=${lastLetter}${valRows.ebitda}*${RANGE_NAMES.exitMultiple}`, cache.exitMultipleTv);
  valuationSheet.getCell(`C${valRows.perpetuityTv}`).value = formulaValue(`=(${yearName('UFCF', lastForecastYear)}*(1+${RANGE_NAMES.terminalGrowth}))/(${RANGE_NAMES.wacc}-${RANGE_NAMES.terminalGrowth})`, cache.perpetuityTv);
  valuationSheet.getCell(`C${valRows.selectedTv}`).value = formulaValue(
    `=IF(${RANGE_NAMES.terminalMethod}="Exit Multiple",C${valRows.exitMultipleTv},C${valRows.perpetuityTv})`,
    cache.selectedTv
  );
  valuationSheet.getCell(`C${valRows.pvTv}`).value = formulaValue(`=C${valRows.selectedTv}*${lastLetter}${valRows.discountFactor}`, cache.pvTerminalValue);
  styleFormula(valuationSheet.getCell(`C${valRows.exitMultipleTv}`), 'currency');
  styleFormula(valuationSheet.getCell(`C${valRows.perpetuityTv}`), 'currency');
  styleOutput(valuationSheet.getCell(`C${valRows.selectedTv}`), 'currency');
  styleOutput(valuationSheet.getCell(`C${valRows.pvTv}`), 'currency');

  valuationSheet.getCell('B4').value = formulaValue(`=SUM(C${valRows.pvFcf}:${lastLetter}${valRows.pvFcf})`, cache.pvExplicitFcf);
  valuationSheet.getCell('B5').value = formulaValue(`=C${valRows.pvTv}`, cache.pvTerminalValue);
  valuationSheet.getCell('B6').value = formulaValue('=B4+B5', cache.enterpriseValue);
  valuationSheet.getCell('B7').value = formulaValue(`=${RANGE_NAMES.debtBalance}-${RANGE_NAMES.cashBalance}`, cache.netDebt);
  valuationSheet.getCell('B8').value = formulaValue('=B6-B7', cache.equityValue);
  valuationSheet.getCell('B9').value = formulaValue(`=IF(${RANGE_NAMES.sharesOutstanding}>0,B8/${RANGE_NAMES.sharesOutstanding},0)`, cache.impliedSharePrice);
  valuationSheet.getCell('B10').value = formulaValue(`=${RANGE_NAMES.currentSharePrice}`, sharePrice);
  styleOutput(valuationSheet.getCell('B4'), 'currency');
  styleOutput(valuationSheet.getCell('B5'), 'currency');
  styleTotal(valuationSheet, 6, 1, 2);
  styleFormula(valuationSheet.getCell('B7'), 'currency');
  styleTotal(valuationSheet, 8, 1, 2);
  styleOutput(valuationSheet.getCell('B9'), 'currency');
  styleFormula(valuationSheet.getCell('B10'), 'currency');

  defineNamedCells(workbook, valuationSheet, [
    { name: RANGE_NAMES.pvExplicitFcf, cellRef: 'B4' },
    { name: RANGE_NAMES.pvTerminalValue, cellRef: 'B5' },
    { name: RANGE_NAMES.enterpriseValue, cellRef: 'B6' },
    { name: RANGE_NAMES.netDebt, cellRef: 'B7' },
    { name: RANGE_NAMES.equityValue, cellRef: 'B8' },
    { name: RANGE_NAMES.impliedSharePrice, cellRef: 'B9' },
  ]);

  styleSectionHeader(valuationSheet, 25, 'Value Driver Mix', 4);
  valuationSheet.getCell('A26').value = 'Explicit FCF as % EV';
  valuationSheet.getCell('B26').value = formulaValue(`=IF(${RANGE_NAMES.enterpriseValue}<>0,${RANGE_NAMES.pvExplicitFcf}/${RANGE_NAMES.enterpriseValue},0)`, cache.valueDriverMix.explicitFcfPctEv);
  valuationSheet.getCell('A27').value = 'Terminal value as % EV';
  valuationSheet.getCell('B27').value = formulaValue(`=IF(${RANGE_NAMES.enterpriseValue}<>0,${RANGE_NAMES.pvTerminalValue}/${RANGE_NAMES.enterpriseValue},0)`, cache.valueDriverMix.terminalValuePctEv);
  valuationSheet.getCell('A28').value = 'Net debt as % EV';
  valuationSheet.getCell('B28').value = formulaValue(`=IF(${RANGE_NAMES.enterpriseValue}<>0,${RANGE_NAMES.netDebt}/${RANGE_NAMES.enterpriseValue},0)`, cache.valueDriverMix.netDebtPctEv);
  valuationSheet.getCell('A29').value = 'Equity value / EV';
  valuationSheet.getCell('B29').value = formulaValue(`=IF(${RANGE_NAMES.enterpriseValue}<>0,${RANGE_NAMES.equityValue}/${RANGE_NAMES.enterpriseValue},0)`, cache.valueDriverMix.equityValuePctEv);
  ['A26', 'A27', 'A28', 'A29'].forEach((ref) => styleLabel(valuationSheet.getCell(ref)));
  ['B26', 'B27', 'B28', 'B29'].forEach((ref) => styleOutput(valuationSheet.getCell(ref), 'percent'));
  styleThinGrid(valuationSheet, 26, 29, 1, 2);

  equations.push(
    {
      metric: 'Terminal value (perpetuity)',
      description: 'Terminal-year unlevered FCF grown by terminal growth and divided by the WACC spread.',
      excelFormula: `=(${yearName('UFCF', lastForecastYear)}*(1+${RANGE_NAMES.terminalGrowth}))/(${RANGE_NAMES.wacc}-${RANGE_NAMES.terminalGrowth})`,
      dependencies: `${yearName('UFCF', lastForecastYear)}, ${RANGE_NAMES.terminalGrowth}, ${RANGE_NAMES.wacc}`,
      location: `'DCF Valuation'!C21`,
    },
    {
      metric: 'Terminal value (exit multiple)',
      description: 'Terminal-year EBITDA multiplied by the assumed exit multiple.',
      excelFormula: `=${lastLetter}${valRows.ebitda}*${RANGE_NAMES.exitMultiple}`,
      dependencies: `${lastLetter}${valRows.ebitda}, ${RANGE_NAMES.exitMultiple}`,
      location: `'DCF Valuation'!C20`,
    },
    {
      metric: 'Enterprise value',
      description: 'Present value of explicit forecast plus present value of terminal value.',
      excelFormula: `=${RANGE_NAMES.pvExplicitFcf}+${RANGE_NAMES.pvTerminalValue}`,
      dependencies: `${RANGE_NAMES.pvExplicitFcf}, ${RANGE_NAMES.pvTerminalValue}`,
      location: `'DCF Valuation'!B6`,
    }
  );

  sensitivitySheet.getCell('A1').value = 'Sensitivity';
  mergeAndCenter(sensitivitySheet, 'A1:H1');
  styleTitle(sensitivitySheet.getCell('A1'));

  styleSectionHeader(sensitivitySheet, 3, 'WACC vs Terminal Growth', 8);
  styleTableHeader(sensitivitySheet, 4, 1, 7);
  sensitivitySheet.getCell('A4').value = 'WACC \\ Terminal g';
  growthAxis.forEach((value, index) => {
    sensitivitySheet.getCell(4, 3 + index).value = value;
    styleInput(sensitivitySheet.getCell(4, 3 + index), 'percent');
  });
  waccAxis.forEach((value, rowIndex) => {
    const row = 5 + rowIndex;
    sensitivitySheet.getCell(`B${row}`).value = value;
    styleInput(sensitivitySheet.getCell(`B${row}`), 'percent');
    growthAxis.forEach((_, colIndex) => {
      const terminalRef = `${col(3 + colIndex)}$4`;
      const waccRef = `$B${row}`;
      const explicitPv = forecastYears
        .map((year, index) => `${yearName('UFCF', year)}/(1+${waccRef})^${index + 1}`)
        .join('+');
      sensitivitySheet.getCell(row, 3 + colIndex).value = {
        formula:
          `=IF(${terminalRef}>=${waccRef},"",((` +
          `${explicitPv})+((` +
          `${yearName('UFCF', lastForecastYear)}*(1+${terminalRef}))/(${waccRef}-${terminalRef})` +
          `)/(1+${waccRef})^${inputs.years}-(${RANGE_NAMES.debtBalance}-${RANGE_NAMES.cashBalance}))/${RANGE_NAMES.sharesOutstanding})`,
        result: cache.sensitivity.perpetuity[rowIndex][colIndex] as number | string,
      };
      styleFormula(sensitivitySheet.getCell(row, 3 + colIndex), 'currency');
    });
  });

  styleSectionHeader(sensitivitySheet, 12, 'WACC vs Exit Multiple', 8);
  styleTableHeader(sensitivitySheet, 13, 1, 7);
  sensitivitySheet.getCell('A13').value = 'WACC \\ Exit multiple';
  multipleAxis.forEach((value, index) => {
    sensitivitySheet.getCell(13, 3 + index).value = value;
    styleInput(sensitivitySheet.getCell(13, 3 + index), 'multiple');
  });
  waccAxis.forEach((value, rowIndex) => {
    const row = 14 + rowIndex;
    sensitivitySheet.getCell(`B${row}`).value = value;
    styleInput(sensitivitySheet.getCell(`B${row}`), 'percent');
    multipleAxis.forEach((_, colIndex) => {
      const multipleRef = `${col(3 + colIndex)}$13`;
      const waccRef = `$B${row}`;
      const explicitPv = forecastYears
        .map((year, index) => `${yearName('UFCF', year)}/(1+${waccRef})^${index + 1}`)
        .join('+');
      sensitivitySheet.getCell(row, 3 + colIndex).value = {
        formula:
          `=((` +
          `${explicitPv})+((${lastLetter}${valRows.ebitda}*${multipleRef})/(1+${waccRef})^${inputs.years})-(${RANGE_NAMES.debtBalance}-${RANGE_NAMES.cashBalance}))/${RANGE_NAMES.sharesOutstanding}`,
        result: cache.sensitivity.exitMultiple[rowIndex][colIndex],
      };
      styleFormula(sensitivitySheet.getCell(row, 3 + colIndex), 'currency');
    });
  });

  checksSheet.getCell('A1').value = 'Checks';
  mergeAndCenter(checksSheet, 'A1:D1');
  styleTitle(checksSheet.getCell('A1'));
  styleTableHeader(checksSheet, 3, 1, 3);
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Result';
  checksSheet.getCell('C3').value = 'Commentary';
  writeCheckRow(checksSheet, 4, 'Terminal growth < WACC', `IF(${RANGE_NAMES.terminalGrowth}<${RANGE_NAMES.wacc},"PASS","FLAG")`, 'Perpetuity growth must remain below WACC.');
  writeCheckRow(checksSheet, 5, 'FCF is populated', `IF(COUNTA('Operating Forecast'!C14:${lastLetter}14)=${inputs.years},"PASS","FLAG")`, 'All forecast FCF cells should be populated.');
  writeCheckRow(checksSheet, 6, 'Sensitivity tables generated', 'IF(COUNTA(Sensitivity!C5:G9)+COUNTA(Sensitivity!C14:G18)=50,"PASS","FLAG")', 'Both sensitivity tables should be fully populated.');
  writeCheckRow(checksSheet, 7, 'Value per share available', `IF(AND(${RANGE_NAMES.sharesOutstanding}>0,${RANGE_NAMES.impliedSharePrice}>0),"PASS","FLAG")`, 'Share price requires a positive share count and valuation.');
  styleThinGrid(checksSheet, 4, 7, 1, 3);
  finalizeChecksSheet(checksSheet, 4, 7);

  addEquationsSheet(workbook, `${inputs.companyName} DCF`, equations);

  return finalizeWorkbookCompatibility(workbook);
}

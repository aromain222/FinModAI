import ExcelJS from 'exceljs';
import type { ThreeStatementModelInputs } from '@/lib/model-generator/extractInputs';
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
import { validateWorkbookFormulaTokens } from '@/lib/model-generator/excel/formulaValidation';

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function absoluteSheetRef(sheetName: string, column: string, row: number): string {
  return `'${sheetName}'!$${column}$${row}`;
}

export function getPreview(inputs: ThreeStatementModelInputs) {
  return {
    title: `${inputs.companyName} Forecast Model`,
    tabs: [
      'Control Panel',
      'Income Statement',
      'Balance Sheet',
      'Cash Flow',
      'Working Capital Schedule',
      'PP&E & Depreciation',
      'Debt Schedule',
      'Equations',
      'Checks',
    ],
    years: inputs.years,
  };
}

export async function buildWorkbook(inputs: ThreeStatementModelInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  const baseYear = generatedAt.getFullYear() - 1;
  const actualYear = `${baseYear}A`;
  const forecastYears = Array.from({ length: inputs.years }, (_, index) => `${baseYear + index + 1}E`);
  const lastForecastLetter = col(2 + inputs.years);
  const equations: EquationRow[] = [];

  applyWorkbookMeta(workbook, `${inputs.companyName} Forecast Model`);
  enableWorkbookRecalculation(workbook);

  const controlSheet = workbook.addWorksheet('Control Panel');
  const isSheet = workbook.addWorksheet('Income Statement');
  const bsSheet = workbook.addWorksheet('Balance Sheet');
  const cfSheet = workbook.addWorksheet('Cash Flow');
  const wcSheet = workbook.addWorksheet('Working Capital Schedule');
  const ppeSheet = workbook.addWorksheet('PP&E & Depreciation');
  const debtSheet = workbook.addWorksheet('Debt Schedule');
  const checksSheet = workbook.addWorksheet('Checks');

  setupSheet(controlSheet, { freezeRows: 2, freezeCols: 0, tabColor: 'FF1D4ED8', columnWidths: [30, 18, 18, 18, 22, 18, 18, 18] });
  setupSheet(isSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF0F766E', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14] });
  setupSheet(bsSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF047857', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14] });
  setupSheet(cfSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF2563EB', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14] });
  setupSheet(wcSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF7C3AED', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14] });
  setupSheet(ppeSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF0EA5E9', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14] });
  setupSheet(debtSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF9333EA', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14] });
  setupSheet(checksSheet, { freezeRows: 3, freezeCols: 1, tabColor: 'FFB45309', columnWidths: [30, 16, 36, 18] });

  controlSheet.getCell('A1').value = `${inputs.companyName} Forecast Model`;
  mergeAndCenter(controlSheet, 'A1:H1');
  styleTitle(controlSheet.getCell('A1'));
  controlSheet.getCell('A2').value =
    'Integrated forecast model with a single control panel, linked statements, cash bridge, working capital, PP&E, debt schedule, equations, and checks.';
  mergeAndCenter(controlSheet, 'A2:H2');
  styleSubtitle(controlSheet.getCell('A2'));
  styleModelMeta(controlSheet, 4, 'Company', inputs.companyName);
  styleModelMeta(controlSheet, 5, 'Ticker', inputs.ticker || 'N/A');
  styleModelMeta(controlSheet, 6, 'Generated', formatDate(generatedAt));
  styleModelMeta(controlSheet, 7, 'Source', inputs.source);
  styleModelMeta(controlSheet, 8, 'Input legend', 'Blue cells are editable forecast assumptions. Green cells are linked summary outputs.');

  styleSectionHeader(controlSheet, 10, 'Core Assumptions', 4);
  [
    ['Forecast years', inputs.years, 'number'],
    ['Base revenue', inputs.baseRevenue, 'currency'],
    ['Opening cash', inputs.cash, 'currency'],
    ['Opening debt', inputs.debt, 'currency'],
    ['Gross margin', inputs.grossMargin, 'percent'],
    ['Operating expense %', inputs.opexPctRevenue, 'percent'],
    ['Tax rate', inputs.taxRate, 'percent'],
    ['Capex % of revenue', inputs.capexPctRevenue, 'percent'],
    ['D&A % of revenue', inputs.daPctRevenue, 'percent'],
    ['DSO', 35, 'number'],
    ['DIO', 22, 'number'],
    ['DPO', 28, 'number'],
    ['Other current assets % rev.', 0.02, 'percent'],
    ['Other current liabilities % rev.', 0.03, 'percent'],
    ['Other assets', inputs.baseRevenue * 0.08, 'currency'],
    ['Other liabilities', inputs.baseRevenue * 0.04, 'currency'],
    ['Beginning PP&E', inputs.baseRevenue * 0.22, 'currency'],
    ['Beginning retained earnings', inputs.baseRevenue * 0.18, 'currency'],
    ['Common stock', inputs.baseRevenue * 0.12, 'currency'],
    ['Interest rate', 0.05, 'percent'],
    ['New debt', 0, 'currency'],
    ['Debt repayment', 0, 'currency'],
  ].forEach(([label, value, kind], index) => {
    const row = 11 + index;
    controlSheet.getCell(`A${row}`).value = label;
    controlSheet.getCell(`B${row}`).value = value;
    styleLabel(controlSheet.getCell(`A${row}`));
    styleInput(controlSheet.getCell(`B${row}`), kind as 'number' | 'currency' | 'percent');
  });
  const controlRefs = {
    baseRevenue: absoluteSheetRef('Control Panel', 'B', 12),
    openingCash: absoluteSheetRef('Control Panel', 'B', 13),
    openingDebt: absoluteSheetRef('Control Panel', 'B', 14),
    grossMargin: absoluteSheetRef('Control Panel', 'B', 15),
    opexPct: absoluteSheetRef('Control Panel', 'B', 16),
    taxRate: absoluteSheetRef('Control Panel', 'B', 17),
    capexPct: absoluteSheetRef('Control Panel', 'B', 18),
    daPct: absoluteSheetRef('Control Panel', 'B', 19),
    dso: absoluteSheetRef('Control Panel', 'B', 20),
    dio: absoluteSheetRef('Control Panel', 'B', 21),
    dpo: absoluteSheetRef('Control Panel', 'B', 22),
    otherCurrentAssetsPct: absoluteSheetRef('Control Panel', 'B', 23),
    otherCurrentLiabilitiesPct: absoluteSheetRef('Control Panel', 'B', 24),
    otherAssetsBase: absoluteSheetRef('Control Panel', 'B', 25),
    otherLiabilitiesBase: absoluteSheetRef('Control Panel', 'B', 26),
    beginningPpe: absoluteSheetRef('Control Panel', 'B', 27),
    beginningRetainedEarnings: absoluteSheetRef('Control Panel', 'B', 28),
    commonStock: absoluteSheetRef('Control Panel', 'B', 29),
    interestRate: absoluteSheetRef('Control Panel', 'B', 30),
    newDebt: absoluteSheetRef('Control Panel', 'B', 31),
    debtRepaymentInput: absoluteSheetRef('Control Panel', 'B', 32),
  } as const;
  const revenueGrowthRef = (columnIndex: number) => absoluteSheetRef('Control Panel', col(columnIndex), 37);

  styleSectionHeader(controlSheet, 10, 'Summary Metrics', 7);
  controlSheet.getCell('E11').value = 'Revenue CAGR';
  controlSheet.getCell('F11').value = { formula: `=('Income Statement'!$${lastForecastLetter}$5/'Income Statement'!$C$5)^(1/${inputs.years})-1` };
  controlSheet.getCell('E12').value = 'EBITDA margin';
  controlSheet.getCell('F12').value = { formula: `='Income Statement'!$${lastForecastLetter}$10/'Income Statement'!$${lastForecastLetter}$5` };
  controlSheet.getCell('E13').value = 'Ending cash';
  controlSheet.getCell('F13').value = { formula: `='Balance Sheet'!$${lastForecastLetter}$5` };
  controlSheet.getCell('E14').value = 'Debt balance';
  controlSheet.getCell('F14').value = { formula: `='Balance Sheet'!$${lastForecastLetter}$15` };
  ['E11', 'E12', 'E13', 'E14'].forEach((ref) => styleLabel(controlSheet.getCell(ref)));
  styleAccentOutput(controlSheet.getCell('F11'), 'percent');
  styleAccentOutput(controlSheet.getCell('F12'), 'percent');
  styleAccentOutput(controlSheet.getCell('F13'), 'currency');
  styleAccentOutput(controlSheet.getCell('F14'), 'currency');
  styleThinGrid(controlSheet, 11, 14, 5, 6);

  styleSectionHeader(controlSheet, 35, 'Revenue Growth Assumptions', 2 + inputs.years);
  styleTableHeader(controlSheet, 36, 1, 2 + inputs.years);
  controlSheet.getCell('A36').value = 'Driver';
  controlSheet.getCell('B36').value = actualYear;
  controlSheet.getCell('A37').value = 'Revenue growth';
  styleLabel(controlSheet.getCell('A37'));
  forecastYears.forEach((year, index) => {
    const cell = `${col(3 + index)}37`;
    controlSheet.getCell(cell).value = inputs.revenueGrowth[index];
    styleInput(controlSheet.getCell(cell), 'percent');
    controlSheet.getCell(36, 3 + index).value = year;
  });

  styleSectionHeader(controlSheet, 40, 'Margin Snapshot', 2 + inputs.years);
  styleTableHeader(controlSheet, 41, 1, 2 + inputs.years);
  controlSheet.getCell('A41').value = 'Metric';
  controlSheet.getCell('B41').value = actualYear;
  forecastYears.forEach((year, index) => {
    controlSheet.getCell(41, 3 + index).value = year;
  });
  controlSheet.getCell('A42').value = 'Gross Margin';
  controlSheet.getCell('A43').value = 'EBITDA Margin';
  controlSheet.getCell('A44').value = 'EBIT Margin';
  ['A42', 'A43', 'A44'].forEach((ref) => styleLabel(controlSheet.getCell(ref)));
  [actualYear, ...forecastYears].forEach((_, index) => {
    const letter = col(2 + index);
    controlSheet.getCell(`${letter}42`).value = { formula: `='Income Statement'!${letter}8` };
    controlSheet.getCell(`${letter}43`).value = { formula: `=IF('Income Statement'!${letter}5<>0,'Income Statement'!${letter}10/'Income Statement'!${letter}5,0)` };
    controlSheet.getCell(`${letter}44`).value = { formula: `=IF('Income Statement'!${letter}5<>0,'Income Statement'!${letter}12/'Income Statement'!${letter}5,0)` };
    ['42', '43', '44'].forEach((row) => styleFormula(controlSheet.getCell(`${letter}${row}`), 'percent'));
  });

  styleSectionHeader(controlSheet, 47, 'Terminal Year Cash Bridge', 4);
  controlSheet.getCell('A48').value = 'Cash from Operations';
  controlSheet.getCell('B48').value = { formula: `='Cash Flow'!${lastForecastLetter}8` };
  controlSheet.getCell('A49').value = 'Capex';
  controlSheet.getCell('B49').value = { formula: `='Cash Flow'!${lastForecastLetter}9` };
  controlSheet.getCell('A50').value = 'Debt Flows';
  controlSheet.getCell('B50').value = { formula: `='Cash Flow'!${lastForecastLetter}10` };
  controlSheet.getCell('A51').value = 'Net Change in Cash';
  controlSheet.getCell('B51').value = { formula: `='Cash Flow'!${lastForecastLetter}12` };
  controlSheet.getCell('A52').value = 'Ending Cash';
  controlSheet.getCell('B52').value = { formula: `='Cash Flow'!${lastForecastLetter}13` };
  ['A48', 'A49', 'A50', 'A51', 'A52'].forEach((ref) => styleLabel(controlSheet.getCell(ref)));
  ['B48', 'B49', 'B50', 'B51'].forEach((ref) => styleFormula(controlSheet.getCell(ref), 'currency'));
  styleAccentOutput(controlSheet.getCell('B52'), 'currency');
  styleThinGrid(controlSheet, 48, 52, 1, 2);
  controlSheet.getCell('E48').value =
    'Control panel is the only editable assumptions area. Use the linked statements and schedules to audit whether growth, margins, working capital, capex, and debt all reconcile.';
  controlSheet.mergeCells('E48:H52');
  styleNarrativeBlock(controlSheet, 48, 5, 8);

  const columns = [actualYear, ...forecastYears];

  wcSheet.getCell('A1').value = 'Working Capital Schedule';
  mergeAndCenter(wcSheet, 'A1:H1');
  styleTitle(wcSheet.getCell('A1'));
  styleTableHeader(wcSheet, 4, 1, 2 + inputs.years);
  wcSheet.getCell('A4').value = 'Line Item';
  wcSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    wcSheet.getCell(4, 3 + index).value = year;
  });
  const wcRows = {
    revenue: 5,
    cogs: 6,
    dso: 7,
    dio: 8,
    dpo: 9,
    ar: 10,
    inventory: 11,
    ap: 12,
    otherCa: 13,
    otherCl: 14,
    nwc: 15,
    deltaNwc: 16,
  } as const;
  [
    [wcRows.revenue, 'Revenue'],
    [wcRows.cogs, 'COGS'],
    [wcRows.dso, 'DSO'],
    [wcRows.dio, 'DIO'],
    [wcRows.dpo, 'DPO'],
    [wcRows.ar, 'Accounts receivable'],
    [wcRows.inventory, 'Inventory'],
    [wcRows.ap, 'Accounts payable'],
    [wcRows.otherCa, 'Other current assets'],
    [wcRows.otherCl, 'Other current liabilities'],
    [wcRows.nwc, 'Net working capital'],
    [wcRows.deltaNwc, 'Change in NWC'],
  ].forEach(([row, label]) => {
    wcSheet.getCell(`A${row}`).value = label;
    styleLabel(wcSheet.getCell(`A${row}`));
  });

  let previousRevenueRef = controlRefs.baseRevenue;
  let previousNwcRef = `${col(2)}${wcRows.nwc}`;
  columns.forEach((year, index) => {
    const letter = col(2 + index);
    if (index === 0) {
      wcSheet.getCell(`${letter}${wcRows.revenue}`).value = { formula: `=${controlRefs.baseRevenue}` };
    } else {
      const growthRef = revenueGrowthRef(2 + index);
      wcSheet.getCell(`${letter}${wcRows.revenue}`).value = { formula: `=${previousRevenueRef}*(1+${growthRef})` };
      equations.push({
        metric: `Revenue ${year}`,
        description: 'Prior year revenue multiplied by one plus the growth assumption.',
        excelFormula: `=${previousRevenueRef}*(1+${growthRef})`,
        dependencies: `${previousRevenueRef}, ${growthRef}`,
        location: `'Working Capital Schedule'!${letter}${wcRows.revenue}`,
      });
    }
    wcSheet.getCell(`${letter}${wcRows.cogs}`).value = { formula: `=-${letter}${wcRows.revenue}*(1-${controlRefs.grossMargin})` };
    wcSheet.getCell(`${letter}${wcRows.dso}`).value = { formula: `=${controlRefs.dso}` };
    wcSheet.getCell(`${letter}${wcRows.dio}`).value = { formula: `=${controlRefs.dio}` };
    wcSheet.getCell(`${letter}${wcRows.dpo}`).value = { formula: `=${controlRefs.dpo}` };
    wcSheet.getCell(`${letter}${wcRows.ar}`).value = { formula: `=${letter}${wcRows.revenue}*${letter}${wcRows.dso}/365` };
    wcSheet.getCell(`${letter}${wcRows.inventory}`).value = { formula: `=ABS(${letter}${wcRows.cogs})*${letter}${wcRows.dio}/365` };
    wcSheet.getCell(`${letter}${wcRows.ap}`).value = { formula: `=ABS(${letter}${wcRows.cogs})*${letter}${wcRows.dpo}/365` };
    wcSheet.getCell(`${letter}${wcRows.otherCa}`).value = { formula: `=${letter}${wcRows.revenue}*${controlRefs.otherCurrentAssetsPct}` };
    wcSheet.getCell(`${letter}${wcRows.otherCl}`).value = { formula: `=${letter}${wcRows.revenue}*${controlRefs.otherCurrentLiabilitiesPct}` };
    wcSheet.getCell(`${letter}${wcRows.nwc}`).value = {
      formula: `=${letter}${wcRows.ar}+${letter}${wcRows.inventory}+${letter}${wcRows.otherCa}-${letter}${wcRows.ap}-${letter}${wcRows.otherCl}`,
    };
    wcSheet.getCell(`${letter}${wcRows.deltaNwc}`).value =
      index === 0
        ? 0
        : { formula: `=${letter}${wcRows.nwc}-${previousNwcRef}` };
    styleFormula(wcSheet.getCell(`${letter}${wcRows.revenue}`), 'currency');
    styleFormula(wcSheet.getCell(`${letter}${wcRows.cogs}`), 'currency');
    [wcRows.dso, wcRows.dio, wcRows.dpo].forEach((row) => styleInput(wcSheet.getCell(`${letter}${row}`), 'number'));
    [wcRows.ar, wcRows.inventory, wcRows.ap, wcRows.otherCa, wcRows.otherCl, wcRows.nwc, wcRows.deltaNwc].forEach((row) =>
      styleFormula(wcSheet.getCell(`${letter}${row}`), 'currency')
    );

    previousRevenueRef = absoluteSheetRef('Working Capital Schedule', letter, wcRows.revenue);
    previousNwcRef = `${letter}${wcRows.nwc}`;
  });
  styleSubTotal(wcSheet, wcRows.nwc, 1, 2 + inputs.years);
  styleTotal(wcSheet, wcRows.deltaNwc, 1, 2 + inputs.years);

  ppeSheet.getCell('A1').value = 'PP&E and Depreciation';
  mergeAndCenter(ppeSheet, 'A1:H1');
  styleTitle(ppeSheet.getCell('A1'));
  styleTableHeader(ppeSheet, 4, 1, 2 + inputs.years);
  ppeSheet.getCell('A4').value = 'Line Item';
  ppeSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    ppeSheet.getCell(4, 3 + index).value = year;
  });
  const ppeRows = {
    beginningPpe: 5,
    capex: 6,
    depreciation: 7,
    endingPpe: 8,
  } as const;
  [
    [ppeRows.beginningPpe, 'Beginning PP&E'],
    [ppeRows.capex, 'Capex'],
    [ppeRows.depreciation, 'Depreciation'],
    [ppeRows.endingPpe, 'Ending PP&E'],
  ].forEach(([row, label]) => {
    ppeSheet.getCell(`A${row}`).value = label;
    styleLabel(ppeSheet.getCell(`A${row}`));
  });
  let previousPpeRef = controlRefs.beginningPpe;
  columns.forEach((year, index) => {
    const letter = col(2 + index);
    ppeSheet.getCell(`${letter}${ppeRows.beginningPpe}`).value = { formula: `=${previousPpeRef}` };
    ppeSheet.getCell(`${letter}${ppeRows.capex}`).value = { formula: `='Working Capital Schedule'!$${letter}$5*${controlRefs.capexPct}` };
    ppeSheet.getCell(`${letter}${ppeRows.depreciation}`).value = { formula: `='Working Capital Schedule'!$${letter}$5*${controlRefs.daPct}` };
    ppeSheet.getCell(`${letter}${ppeRows.endingPpe}`).value = { formula: `=${letter}${ppeRows.beginningPpe}+${letter}${ppeRows.capex}-${letter}${ppeRows.depreciation}` };
    [ppeRows.beginningPpe, ppeRows.capex, ppeRows.depreciation, ppeRows.endingPpe].forEach((row) =>
      styleFormula(ppeSheet.getCell(`${letter}${row}`), 'currency')
    );
    previousPpeRef = absoluteSheetRef('PP&E & Depreciation', letter, ppeRows.endingPpe);
  });
  styleTotal(ppeSheet, ppeRows.endingPpe, 1, 2 + inputs.years);

  debtSheet.getCell('A1').value = 'Debt Schedule';
  mergeAndCenter(debtSheet, 'A1:H1');
  styleTitle(debtSheet.getCell('A1'));
  styleTableHeader(debtSheet, 4, 1, 2 + inputs.years);
  debtSheet.getCell('A4').value = 'Line Item';
  debtSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    debtSheet.getCell(4, 3 + index).value = year;
  });
  const debtRows = {
    beginningDebt: 5,
    newDebt: 6,
    repayment: 7,
    endingDebt: 8,
    interestExpense: 9,
  } as const;
  [
    [debtRows.beginningDebt, 'Beginning debt'],
    [debtRows.newDebt, 'New debt'],
    [debtRows.repayment, 'Repayment'],
    [debtRows.endingDebt, 'Ending debt'],
    [debtRows.interestExpense, 'Interest expense'],
  ].forEach(([row, label]) => {
    debtSheet.getCell(`A${row}`).value = label;
    styleLabel(debtSheet.getCell(`A${row}`));
  });
  let previousDebtRef = controlRefs.openingDebt;
  columns.forEach((year, index) => {
    const letter = col(2 + index);
    debtSheet.getCell(`${letter}${debtRows.beginningDebt}`).value = { formula: `=${previousDebtRef}` };
    debtSheet.getCell(`${letter}${debtRows.newDebt}`).value = { formula: `=${controlRefs.newDebt}` };
    debtSheet.getCell(`${letter}${debtRows.repayment}`).value = { formula: `=${controlRefs.debtRepaymentInput}` };
    debtSheet.getCell(`${letter}${debtRows.endingDebt}`).value = {
      formula: `=${letter}${debtRows.beginningDebt}+${letter}${debtRows.newDebt}-${letter}${debtRows.repayment}`,
    };
    debtSheet.getCell(`${letter}${debtRows.interestExpense}`).value = {
      formula: `=((${letter}${debtRows.beginningDebt}+${letter}${debtRows.endingDebt})/2)*${controlRefs.interestRate}`,
    };
    [debtRows.beginningDebt, debtRows.newDebt, debtRows.repayment, debtRows.endingDebt, debtRows.interestExpense].forEach((row) =>
      styleFormula(debtSheet.getCell(`${letter}${row}`), 'currency')
    );
    previousDebtRef = absoluteSheetRef('Debt Schedule', letter, debtRows.endingDebt);
  });
  styleTotal(debtSheet, debtRows.endingDebt, 1, 2 + inputs.years);

  isSheet.getCell('A1').value = 'Income Statement';
  mergeAndCenter(isSheet, 'A1:H1');
  styleTitle(isSheet.getCell('A1'));
  styleTableHeader(isSheet, 4, 1, 2 + inputs.years);
  isSheet.getCell('A4').value = 'Line Item';
  isSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    isSheet.getCell(4, 3 + index).value = year;
  });
  const isRows = {
    revenue: 5,
    cogs: 6,
    grossProfit: 7,
    grossMargin: 8,
    opex: 9,
    ebitda: 10,
    da: 11,
    ebit: 12,
    interest: 13,
    ebt: 14,
    taxes: 15,
    netIncome: 16,
  } as const;
  [
    [isRows.revenue, 'Revenue'],
    [isRows.cogs, 'COGS'],
    [isRows.grossProfit, 'Gross Profit'],
    [isRows.grossMargin, 'Gross Margin'],
    [isRows.opex, 'Operating Expenses'],
    [isRows.ebitda, 'EBITDA'],
    [isRows.da, 'D&A'],
    [isRows.ebit, 'EBIT'],
    [isRows.interest, 'Interest Expense'],
    [isRows.ebt, 'EBT'],
    [isRows.taxes, 'Taxes'],
    [isRows.netIncome, 'Net Income'],
  ].forEach(([row, label]) => {
    isSheet.getCell(`A${row}`).value = label;
    styleLabel(isSheet.getCell(`A${row}`));
  });
  columns.forEach((year, index) => {
    const letter = col(2 + index);
    isSheet.getCell(`${letter}${isRows.revenue}`).value = { formula: `='Working Capital Schedule'!$${letter}$5` };
    isSheet.getCell(`${letter}${isRows.cogs}`).value = { formula: `='Working Capital Schedule'!$${letter}$6` };
    isSheet.getCell(`${letter}${isRows.grossProfit}`).value = { formula: `=${letter}${isRows.revenue}+${letter}${isRows.cogs}` };
    isSheet.getCell(`${letter}${isRows.grossMargin}`).value = { formula: `=IF(${letter}${isRows.revenue}<>0,${letter}${isRows.grossProfit}/${letter}${isRows.revenue},0)` };
    isSheet.getCell(`${letter}${isRows.opex}`).value = { formula: `=-${letter}${isRows.revenue}*${controlRefs.opexPct}` };
    isSheet.getCell(`${letter}${isRows.ebitda}`).value = { formula: `=${letter}${isRows.grossProfit}+${letter}${isRows.opex}` };
    isSheet.getCell(`${letter}${isRows.da}`).value = { formula: `=-'PP&E & Depreciation'!$${letter}$7` };
    isSheet.getCell(`${letter}${isRows.ebit}`).value = { formula: `=${letter}${isRows.ebitda}+${letter}${isRows.da}` };
    isSheet.getCell(`${letter}${isRows.interest}`).value = { formula: `=-'Debt Schedule'!$${letter}$9` };
    isSheet.getCell(`${letter}${isRows.ebt}`).value = { formula: `=${letter}${isRows.ebit}+${letter}${isRows.interest}` };
    isSheet.getCell(`${letter}${isRows.taxes}`).value = { formula: `=-MAX(${letter}${isRows.ebt},0)*${controlRefs.taxRate}` };
    isSheet.getCell(`${letter}${isRows.netIncome}`).value = { formula: `=${letter}${isRows.ebt}+${letter}${isRows.taxes}` };
    [isRows.revenue, isRows.cogs, isRows.grossProfit, isRows.opex, isRows.ebitda, isRows.da, isRows.ebit, isRows.interest, isRows.ebt, isRows.taxes].forEach((row) =>
      styleFormula(isSheet.getCell(`${letter}${row}`), 'currency')
    );
    styleFormula(isSheet.getCell(`${letter}${isRows.grossMargin}`), 'percent');
    styleOutput(isSheet.getCell(`${letter}${isRows.netIncome}`), 'currency');
    equations.push({
      metric: `Net income ${year}`,
      description: 'EBT plus taxes.',
      excelFormula: `=${letter}${isRows.ebt}+${letter}${isRows.taxes}`,
      dependencies: `${letter}${isRows.ebt}, ${letter}${isRows.taxes}`,
      location: `'Income Statement'!${letter}${isRows.netIncome}`,
    });
  });
  styleSubTotal(isSheet, isRows.grossProfit, 1, 2 + inputs.years);
  styleSubTotal(isSheet, isRows.ebitda, 1, 2 + inputs.years);
  styleSubTotal(isSheet, isRows.ebit, 1, 2 + inputs.years);
  styleTotal(isSheet, isRows.netIncome, 1, 2 + inputs.years);

  bsSheet.getCell('A1').value = 'Balance Sheet';
  mergeAndCenter(bsSheet, 'A1:H1');
  styleTitle(bsSheet.getCell('A1'));
  styleTableHeader(bsSheet, 4, 1, 2 + inputs.years);
  bsSheet.getCell('A4').value = 'Line Item';
  bsSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    bsSheet.getCell(4, 3 + index).value = year;
  });
  const bsRows = {
    cash: 5,
    ar: 6,
    inventory: 7,
    otherCa: 8,
    ppe: 9,
    otherAssets: 10,
    totalAssets: 11,
    ap: 13,
    otherCl: 14,
    debt: 15,
    otherLiabilities: 16,
    commonStock: 18,
    retainedEarnings: 19,
    totalLiabilitiesEquity: 20,
    balanceCheck: 21,
  } as const;
  [
    [bsRows.cash, 'Cash'],
    [bsRows.ar, 'A/R'],
    [bsRows.inventory, 'Inventory'],
    [bsRows.otherCa, 'Other Current Assets'],
    [bsRows.ppe, 'PP&E'],
    [bsRows.otherAssets, 'Other Assets'],
    [bsRows.totalAssets, 'Total Assets'],
    [bsRows.ap, 'A/P'],
    [bsRows.otherCl, 'Other Current Liabilities'],
    [bsRows.debt, 'Debt'],
    [bsRows.otherLiabilities, 'Other Liabilities'],
    [bsRows.commonStock, 'Common Stock'],
    [bsRows.retainedEarnings, 'Retained Earnings'],
    [bsRows.totalLiabilitiesEquity, 'Total Liabilities + Equity'],
    [bsRows.balanceCheck, 'Balance Check'],
  ].forEach(([row, label]) => {
    bsSheet.getCell(`A${row}`).value = label;
    styleLabel(bsSheet.getCell(`A${row}`));
  });
  let previousRetainedEarningsRef = controlRefs.beginningRetainedEarnings;
  columns.forEach((year, index) => {
    const letter = col(2 + index);
    bsSheet.getCell(`${letter}${bsRows.cash}`).value = { formula: `='Cash Flow'!$${letter}$13` };
    bsSheet.getCell(`${letter}${bsRows.ar}`).value = { formula: `='Working Capital Schedule'!$${letter}$10` };
    bsSheet.getCell(`${letter}${bsRows.inventory}`).value = { formula: `='Working Capital Schedule'!$${letter}$11` };
    bsSheet.getCell(`${letter}${bsRows.otherCa}`).value = { formula: `='Working Capital Schedule'!$${letter}$13` };
    bsSheet.getCell(`${letter}${bsRows.ppe}`).value = { formula: `='PP&E & Depreciation'!$${letter}$8` };
    bsSheet.getCell(`${letter}${bsRows.otherAssets}`).value = { formula: `=${controlRefs.otherAssetsBase}` };
    bsSheet.getCell(`${letter}${bsRows.totalAssets}`).value = {
      formula: `=${letter}${bsRows.cash}+${letter}${bsRows.ar}+${letter}${bsRows.inventory}+${letter}${bsRows.otherCa}+${letter}${bsRows.ppe}+${letter}${bsRows.otherAssets}`,
    };
    bsSheet.getCell(`${letter}${bsRows.ap}`).value = { formula: `='Working Capital Schedule'!$${letter}$12` };
    bsSheet.getCell(`${letter}${bsRows.otherCl}`).value = { formula: `='Working Capital Schedule'!$${letter}$14` };
    bsSheet.getCell(`${letter}${bsRows.debt}`).value = { formula: `='Debt Schedule'!$${letter}$8` };
    bsSheet.getCell(`${letter}${bsRows.otherLiabilities}`).value = { formula: `=${controlRefs.otherLiabilitiesBase}` };
    bsSheet.getCell(`${letter}${bsRows.commonStock}`).value = { formula: `=${controlRefs.commonStock}` };
    bsSheet.getCell(`${letter}${bsRows.retainedEarnings}`).value =
      index === 0
        ? { formula: `=${controlRefs.beginningRetainedEarnings}+'Income Statement'!$${letter}$16` }
        : { formula: `=${previousRetainedEarningsRef}+'Income Statement'!$${letter}$16` };
    bsSheet.getCell(`${letter}${bsRows.totalLiabilitiesEquity}`).value = {
      formula: `=${letter}${bsRows.ap}+${letter}${bsRows.otherCl}+${letter}${bsRows.debt}+${letter}${bsRows.otherLiabilities}+${letter}${bsRows.commonStock}+${letter}${bsRows.retainedEarnings}`,
    };
    bsSheet.getCell(`${letter}${bsRows.balanceCheck}`).value = { formula: `=${letter}${bsRows.totalAssets}-${letter}${bsRows.totalLiabilitiesEquity}` };
    [bsRows.cash, bsRows.ar, bsRows.inventory, bsRows.otherCa, bsRows.ppe, bsRows.otherAssets, bsRows.totalAssets, bsRows.ap, bsRows.otherCl, bsRows.debt, bsRows.otherLiabilities, bsRows.commonStock, bsRows.retainedEarnings, bsRows.balanceCheck].forEach((row) =>
      styleFormula(bsSheet.getCell(`${letter}${row}`), 'currency')
    );
    styleOutput(bsSheet.getCell(`${letter}${bsRows.totalLiabilitiesEquity}`), 'currency');
    previousRetainedEarningsRef = absoluteSheetRef('Balance Sheet', letter, bsRows.retainedEarnings);
  });
  styleSubTotal(bsSheet, bsRows.totalAssets, 1, 2 + inputs.years);
  styleTotal(bsSheet, bsRows.totalLiabilitiesEquity, 1, 2 + inputs.years);

  cfSheet.getCell('A1').value = 'Cash Flow';
  mergeAndCenter(cfSheet, 'A1:H1');
  styleTitle(cfSheet.getCell('A1'));
  styleTableHeader(cfSheet, 4, 1, 2 + inputs.years);
  cfSheet.getCell('A4').value = 'Line Item';
  cfSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    cfSheet.getCell(4, 3 + index).value = year;
  });
  const cfRows = {
    netIncome: 5,
    da: 6,
    deltaNwc: 7,
    cfo: 8,
    capex: 9,
    debtFlows: 10,
    equityFlows: 11,
    netChangeCash: 12,
    endingCash: 13,
  } as const;
  [
    [cfRows.netIncome, 'Net Income'],
    [cfRows.da, 'D&A'],
    [cfRows.deltaNwc, 'ΔWorking Capital'],
    [cfRows.cfo, 'Cash from Operations'],
    [cfRows.capex, 'Capex'],
    [cfRows.debtFlows, 'Debt issuance / repayment'],
    [cfRows.equityFlows, 'Equity issuance / buybacks'],
    [cfRows.netChangeCash, 'Net Change in Cash'],
    [cfRows.endingCash, 'Ending Cash'],
  ].forEach(([row, label]) => {
    cfSheet.getCell(`A${row}`).value = label;
    styleLabel(cfSheet.getCell(`A${row}`));
  });
  columns.forEach((year, index) => {
    const letter = col(2 + index);
    cfSheet.getCell(`${letter}${cfRows.netIncome}`).value = { formula: `='Income Statement'!$${letter}$16` };
    cfSheet.getCell(`${letter}${cfRows.da}`).value = { formula: `='PP&E & Depreciation'!$${letter}$7` };
    cfSheet.getCell(`${letter}${cfRows.deltaNwc}`).value = { formula: `=-'Working Capital Schedule'!$${letter}$16` };
    cfSheet.getCell(`${letter}${cfRows.cfo}`).value = { formula: `=${letter}${cfRows.netIncome}+${letter}${cfRows.da}+${letter}${cfRows.deltaNwc}` };
    cfSheet.getCell(`${letter}${cfRows.capex}`).value = { formula: `=-'PP&E & Depreciation'!$${letter}$6` };
    cfSheet.getCell(`${letter}${cfRows.debtFlows}`).value = { formula: `=${controlRefs.newDebt}-${controlRefs.debtRepaymentInput}` };
    cfSheet.getCell(`${letter}${cfRows.equityFlows}`).value = 0;
    cfSheet.getCell(`${letter}${cfRows.netChangeCash}`).value = { formula: `=${letter}${cfRows.cfo}+${letter}${cfRows.capex}+${letter}${cfRows.debtFlows}+${letter}${cfRows.equityFlows}` };
    cfSheet.getCell(`${letter}${cfRows.endingCash}`).value =
      index === 0
        ? { formula: `=${controlRefs.openingCash}+${letter}${cfRows.netChangeCash}` }
        : { formula: `=${col(1 + index)}${cfRows.endingCash}+${letter}${cfRows.netChangeCash}` };
    [cfRows.netIncome, cfRows.da, cfRows.deltaNwc, cfRows.cfo, cfRows.capex, cfRows.debtFlows, cfRows.equityFlows, cfRows.netChangeCash].forEach((row) =>
      styleFormula(cfSheet.getCell(`${letter}${row}`), 'currency')
    );
    styleOutput(cfSheet.getCell(`${letter}${cfRows.endingCash}`), 'currency');
    equations.push({
      metric: `Ending cash ${year}`,
      description: 'Prior-period ending cash plus current-period net change in cash.',
      excelFormula: index === 0 ? `=${controlRefs.openingCash}+${letter}${cfRows.netChangeCash}` : `=${col(1 + index)}${cfRows.endingCash}+${letter}${cfRows.netChangeCash}`,
      dependencies: index === 0 ? `${controlRefs.openingCash}, ${letter}${cfRows.netChangeCash}` : `${col(1 + index)}${cfRows.endingCash}, ${letter}${cfRows.netChangeCash}`,
      location: `'Cash Flow'!${letter}${cfRows.endingCash}`,
    });
  });
  styleSubTotal(cfSheet, cfRows.cfo, 1, 2 + inputs.years);
  styleSubTotal(cfSheet, cfRows.netChangeCash, 1, 2 + inputs.years);
  styleTotal(cfSheet, cfRows.endingCash, 1, 2 + inputs.years);

  styleSectionHeader(cfSheet, 16, 'Cash Bridge Summary', 2 + inputs.years);
  styleTableHeader(cfSheet, 17, 1, 2 + inputs.years);
  cfSheet.getCell('A17').value = 'Bridge Metric';
  cfSheet.getCell('B17').value = actualYear;
  forecastYears.forEach((year, index) => {
    cfSheet.getCell(17, 3 + index).value = year;
  });
  cfSheet.getCell('A18').value = 'CFO Margin';
  cfSheet.getCell('A19').value = 'Capex % Revenue';
  cfSheet.getCell('A20').value = 'Ending Cash % Revenue';
  ['A18', 'A19', 'A20'].forEach((ref) => styleLabel(cfSheet.getCell(ref)));
  columns.forEach((_, index) => {
    const letter = col(2 + index);
    cfSheet.getCell(`${letter}18`).value = { formula: `=IF('Income Statement'!${letter}5<>0,${letter}${cfRows.cfo}/'Income Statement'!${letter}5,0)` };
    cfSheet.getCell(`${letter}19`).value = { formula: `=IF('Income Statement'!${letter}5<>0,ABS(${letter}${cfRows.capex})/'Income Statement'!${letter}5,0)` };
    cfSheet.getCell(`${letter}20`).value = { formula: `=IF('Income Statement'!${letter}5<>0,${letter}${cfRows.endingCash}/'Income Statement'!${letter}5,0)` };
    ['18', '19', '20'].forEach((row) => styleFormula(cfSheet.getCell(`${letter}${row}`), 'percent'));
  });

  equations.push(
    {
      metric: 'Retained earnings',
      description: 'Prior retained earnings plus current net income.',
      excelFormula: `=${controlRefs.beginningRetainedEarnings}+'Income Statement'!$B$16`,
      dependencies: `${controlRefs.beginningRetainedEarnings}, 'Income Statement'!$B$16`,
      location: `'Balance Sheet'!C19:${lastForecastLetter}19`,
    },
    {
      metric: 'Balance sheet check',
      description: 'Total assets less total liabilities and equity.',
      excelFormula: `='Balance Sheet'!$C$11-'Balance Sheet'!$C$20`,
      dependencies: `'Balance Sheet'!$C$11, 'Balance Sheet'!$C$20`,
      location: `'Balance Sheet'!C21:${lastForecastLetter}21`,
    }
  );

  const balanceCheckFormula = columns
    .map((_, index) => `ABS('Balance Sheet'!$${col(2 + index)}$21)`)
    .join(',');
  const cashTieFormula = columns
    .map((_, index) => `ABS('Balance Sheet'!$${col(2 + index)}$5-'Cash Flow'!$${col(2 + index)}$13)`)
    .join(',');
  const retainedEarningsTieFormula = columns
    .map((year, index) => {
      const currentCol = col(2 + index);
      if (index === 0) {
        return `ABS('Balance Sheet'!$${currentCol}$19-(${controlRefs.beginningRetainedEarnings}+'Income Statement'!$${currentCol}$16))`;
      }
      const previousCol = col(1 + index);
      return `ABS('Balance Sheet'!$${currentCol}$19-('Balance Sheet'!$${previousCol}$19+'Income Statement'!$${currentCol}$16))`;
    })
    .join(',');
  const debtPopulatedFormula = `COUNTA('Debt Schedule'!C8:${lastForecastLetter}8)=${inputs.years}`;

  checksSheet.getCell('A1').value = 'Checks';
  mergeAndCenter(checksSheet, 'A1:D1');
  styleTitle(checksSheet.getCell('A1'));
  styleTableHeader(checksSheet, 3, 1, 3);
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Result';
  checksSheet.getCell('C3').value = 'Commentary';
  writeCheckRow(checksSheet, 4, 'Assets = Liabilities + Equity', `IF(MAX(${balanceCheckFormula})<0.5,"PASS","FLAG")`, 'Balance sheet should net to zero.');
  writeCheckRow(checksSheet, 5, 'Ending cash ties', `IF(MAX(${cashTieFormula})<0.5,"PASS","FLAG")`, 'Ending cash should tie between BS and CF.');
  writeCheckRow(checksSheet, 6, 'Retained earnings tie', `IF(MAX(${retainedEarningsTieFormula})<0.5,"PASS","FLAG")`, 'Retained earnings should roll forward from net income.');
  writeCheckRow(checksSheet, 7, 'Debt schedule populated', `IF(${debtPopulatedFormula},"PASS","FLAG")`, 'Debt schedule should be populated for every forecast year.');
  styleThinGrid(checksSheet, 4, 7, 1, 3);
  finalizeChecksSheet(checksSheet, 4, 7);

  addEquationsSheet(workbook, `${inputs.companyName} Three-Statement`, equations);
  validateWorkbookFormulaTokens(workbook, {
    allowedFunctions: ['IF', 'ABS', 'MAX', 'COUNTA'],
  });

  return finalizeWorkbookCompatibility(workbook);
}

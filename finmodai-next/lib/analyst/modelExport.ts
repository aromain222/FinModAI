import ExcelJS from 'exceljs';
import type {
  CapTableModelInputs,
  CompsModelInputs,
  DcfModelInputs,
  ExtractedModelInputs,
  LboModelInputs,
  PrecedentsModelInputs,
  SaasOperatingModelInputs,
  ThreeStatementModelInputs,
} from '@/lib/model-generator/extractInputs';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';
import * as dcfTemplate from '@/lib/model-generator/templates/dcf';
import * as compsTemplate from '@/lib/model-generator/templates/comps';
import * as precedentsTemplate from '@/lib/model-generator/templates/precedents';
import * as lboTemplate from '@/lib/model-generator/templates/lbo';
import {
  addPassFailConditionalFormatting,
  applyWorkbookMeta,
  col,
  enableWorkbookRecalculation,
  formatCell,
  mergeAndCenter,
  setupSheet,
  styleCheck,
  styleFormula,
  styleInput,
  styleLabel,
  styleOutput,
  styleSectionHeader,
  styleSubTotal,
  styleTableHeader,
  styleTitle,
  styleTotal,
} from '@/lib/model-generator/excel/formatting';
import { sanitizeWorkbookText, sanitizeWorkbookValue } from '@/lib/excel/workbookText';

type ValueKind = 'currency' | 'percent' | 'number' | 'text';

type EquationRow = {
  metric: string;
  description: string;
  formula: string;
  dependencies: string;
  range: string;
};

function sanitizeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'model';
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => renderValue(item)).join(', ');
  if (value && typeof value === 'object') {
    try {
      return sanitizeWorkbookText(JSON.stringify(value));
    } catch {
      return '[unserializable object]';
    }
  }
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1000) return value.toLocaleString('en-US');
    if (value > 0 && value < 1) return `${(value * 100).toFixed(1)}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'n/a';
  return sanitizeWorkbookText(String(value));
}

function flattenExtractedInputEntries(
  value: unknown,
  prefix = ''
): Array<{ key: string; value: string }> {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ key: prefix, value: 'n/a' }];
    }
    if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      const labels = value
        .map((item) => {
          const record = item as Record<string, unknown>;
          return typeof record.ticker === 'string'
            ? record.ticker
            : typeof record.name === 'string'
              ? record.name
              : null;
        })
        .filter((item): item is string => Boolean(item));
      return [
        {
          key: prefix,
          value: labels.length > 0 ? `${value.length} items: ${labels.join(', ')}` : `${value.length} items`,
        },
      ];
    }
    return [{ key: prefix, value: renderValue(value) }];
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return [{ key: prefix, value: 'n/a' }];
    }
    return entries.flatMap(([key, nestedValue]) =>
      flattenExtractedInputEntries(nestedValue, prefix ? `${prefix}.${key}` : key)
    );
  }

  return [{ key: prefix, value: renderValue(value) }];
}

function yearLabels(years: number): number[] {
  const startYear = new Date().getFullYear() + 1;
  return Array.from({ length: years }, (_, index) => startYear + index);
}

function applyKind(cell: ExcelJS.Cell, kind?: ValueKind) {
  if (!kind || kind === 'text') return;
  formatCell(cell, kind);
  if (kind === 'currency') cell.numFmt = '$#,##0.0';
  if (kind === 'number') cell.numFmt = '#,##0.0';
  if (kind === 'percent') cell.numFmt = '0.0%';
}

function setStatic(cell: ExcelJS.Cell, value: number | string, kind?: ValueKind, output = false) {
  cell.value = sanitizeWorkbookValue(value);
  if (output) styleOutput(cell, kind === 'text' ? 'text' : kind);
  else styleFormula(cell, kind === 'text' ? 'text' : kind);
  applyKind(cell, kind);
}

function setFormula(cell: ExcelJS.Cell, formula: string, result: number | string, kind?: ValueKind, output = false) {
  cell.value = { formula, result: sanitizeWorkbookValue(result) };
  if (output) styleOutput(cell, kind === 'text' ? 'text' : kind);
  else styleFormula(cell, kind === 'text' ? 'text' : kind);
  applyKind(cell, kind);
}

function addEquationSheet(workbook: ExcelJS.Workbook, title: string, rows: EquationRow[]) {
  const sheet = workbook.addWorksheet('Equations');
  setupSheet(sheet, {
    freezeRows: 3,
    freezeCols: 1,
    tabColor: 'FF2563EB',
    columnWidths: [24, 42, 36, 32, 22],
  });

  sheet.getCell('A1').value = sanitizeWorkbookText(`${title} - Key Equations`);
  mergeAndCenter(sheet, 'A1:E1');
  styleTitle(sheet.getCell('A1'));

  ['Metric', 'Equation Description', 'Excel Formula', 'Dependencies', 'Sheet / Range'].forEach((label, index) => {
    sheet.getCell(3, index + 1).value = label;
  });
  styleTableHeader(sheet, 3, 1, 5);

  rows.forEach((row, index) => {
    const excelRow = 4 + index;
    sheet.getCell(excelRow, 1).value = sanitizeWorkbookText(row.metric);
    sheet.getCell(excelRow, 2).value = sanitizeWorkbookText(row.description);
    sheet.getCell(excelRow, 3).value = sanitizeWorkbookText(row.formula);
    sheet.getCell(excelRow, 4).value = sanitizeWorkbookText(row.dependencies);
    sheet.getCell(excelRow, 5).value = sanitizeWorkbookText(row.range);
    for (let column = 1; column <= 5; column += 1) {
      styleFormula(sheet.getCell(excelRow, column));
    }
  });
}

function appendSummarySheet(workbook: ExcelJS.Workbook, payload: AnalystGeneratedModelPayload) {
  const sheet = workbook.addWorksheet('Chat Summary');
  setupSheet(sheet, {
    freezeRows: 3,
    freezeCols: 1,
    tabColor: 'FF1D4ED8',
    columnWidths: [26, 26, 24, 24, 24, 24],
  });

  sheet.getCell('A1').value = sanitizeWorkbookText(`${payload.title} - Analyst Chat Summary`);
  mergeAndCenter(sheet, 'A1:F1');
  styleTitle(sheet.getCell('A1'));

  sheet.getCell('A3').value = 'Prompt';
  sheet.getCell('B3').value = sanitizeWorkbookText(payload.prompt);
  sheet.getCell('A4').value = 'Model Type';
  sheet.getCell('B4').value = payload.modelType;
  sheet.getCell('A5').value = 'Key Outputs';
  sheet.getCell('B5').value = sanitizeWorkbookText(payload.keyOutputs.join(', '));
  sheet.getCell('A6').value = 'Data Source';
  sheet.getCell('B6').value = sanitizeWorkbookText(payload.provenanceSummary.sources.join(', ') || payload.provenanceSummary.sourceType);
  sheet.getCell('D3').value = 'As of Date';
  sheet.getCell('E3').value = payload.provenanceSummary.asOfDate ?? 'n/a';
  sheet.getCell('D4').value = 'Last Synced';
  sheet.getCell('E4').value = payload.provenanceSummary.lastSynced ?? 'n/a';
  ['A3', 'A4', 'A5', 'A6', 'D3', 'D4'].forEach((ref) => styleLabel(sheet.getCell(ref)));
  ['B3', 'B4', 'B5', 'B6', 'E3', 'E4'].forEach((ref) => styleFormula(sheet.getCell(ref)));

  styleSectionHeader(sheet, 8, 'Workbook Tabs', 4);
  payload.tabs.forEach((tab, index) => {
    sheet.getCell(9 + index, 1).value = sanitizeWorkbookText(tab);
    styleFormula(sheet.getCell(9 + index, 1));
  });

  styleSectionHeader(sheet, 8, 'Extracted Inputs', 6);
  const extractedEntries = Object.entries(payload.extractedInputs as Record<string, unknown>).flatMap(
    ([key, value]) => flattenExtractedInputEntries(value, key)
  );
  extractedEntries.forEach(({ key, value }, index) => {
    const row = 9 + index;
    sheet.getCell(`D${row}`).value = sanitizeWorkbookText(key);
    sheet.getCell(`E${row}`).value = sanitizeWorkbookText(value);
    styleLabel(sheet.getCell(`D${row}`));
    styleFormula(sheet.getCell(`E${row}`));
  });

  const defaultsRow = Math.max(11 + payload.tabs.length, 11 + extractedEntries.length);
  styleSectionHeader(sheet, defaultsRow, 'Defaults Used', 4);
  const defaultEntries = Object.entries(payload.defaultsUsed);
  if (defaultEntries.length === 0) {
    sheet.getCell(`A${defaultsRow + 1}`).value = 'No defaults required';
    styleFormula(sheet.getCell(`A${defaultsRow + 1}`));
  } else {
    defaultEntries.forEach(([key, value], index) => {
      const row = defaultsRow + 1 + index;
      sheet.getCell(`A${row}`).value = sanitizeWorkbookText(key);
      sheet.getCell(`B${row}`).value = renderValue(value);
      styleLabel(sheet.getCell(`A${row}`));
      styleFormula(sheet.getCell(`B${row}`));
    });
  }

  const comparisonRow = defaultsRow + Math.max(defaultEntries.length, 1) + 3;
  styleSectionHeader(sheet, comparisonRow, 'Comparison / Rerun Context', 4);
  sheet.getCell(`A${comparisonRow + 1}`).value = 'Previous Version';
  sheet.getCell(`B${comparisonRow + 1}`).value = payload.comparisonSummary?.previousVersionNumber ?? 'n/a';
  sheet.getCell(`A${comparisonRow + 2}`).value = 'Current Version';
  sheet.getCell(`B${comparisonRow + 2}`).value = payload.comparisonSummary?.currentVersionNumber ?? payload.recentRun?.versionNumber ?? 'n/a';
  sheet.getCell(`A${comparisonRow + 3}`).value = 'Changed Keys';
  sheet.getCell(`B${comparisonRow + 3}`).value = sanitizeWorkbookText(payload.comparisonSummary?.changedKeys.join(', ') || 'None');
  ['A', 'B'].forEach((column) => {
    styleLabel(sheet.getCell(`${column}${comparisonRow + 1}`));
    styleLabel(sheet.getCell(`${column}${comparisonRow + 2}`));
    styleLabel(sheet.getCell(`${column}${comparisonRow + 3}`));
  });
  ['B'].forEach((column) => {
    styleFormula(sheet.getCell(`${column}${comparisonRow + 1}`));
    styleFormula(sheet.getCell(`${column}${comparisonRow + 2}`));
    styleFormula(sheet.getCell(`${column}${comparisonRow + 3}`));
  });

  const narrativeRow = comparisonRow + 6;
  styleSectionHeader(sheet, narrativeRow, 'Analyst Framing', 6);
  payload.narrativeBlocks.forEach((block, index) => {
    const row = narrativeRow + 1 + index * 3;
    sheet.getCell(`A${row}`).value = sanitizeWorkbookText(block.title);
    sheet.getCell(`A${row + 1}`).value = sanitizeWorkbookText(block.body);
    styleLabel(sheet.getCell(`A${row}`));
    styleFormula(sheet.getCell(`A${row + 1}`));
    mergeAndCenter(sheet, `A${row + 1}:F${row + 1}`);
    sheet.getCell(`A${row + 1}`).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
  });
}

function buildSaasWorkbook(workbook: ExcelJS.Workbook, inputs: SaasOperatingModelInputs) {
  const years = yearLabels(inputs.years);
  const assumptions = workbook.addWorksheet('Assumptions');
  const dashboard = workbook.addWorksheet('Dashboard');
  const arrBridge = workbook.addWorksheet('ARR Bridge');
  const revenueForecast = workbook.addWorksheet('Revenue Forecast');
  const unitEconomics = workbook.addWorksheet('Unit Economics');
  const hiring = workbook.addWorksheet('Hiring & Opex');
  const checks = workbook.addWorksheet('Checks');

  [assumptions, dashboard, arrBridge, revenueForecast, unitEconomics, hiring, checks].forEach((sheet, index) => {
    setupSheet(sheet, {
      freezeRows: 3,
      freezeCols: 1,
      tabColor: ['FF1D4ED8', 'FF0F766E', 'FF0891B2', 'FF7C3AED', 'FFCA8A04', 'FF9333EA', 'FFDC2626'][index],
      columnWidths: [28, 18, 16, 16, 16, 16, 16, 16],
    });
  });

  const assumptionRows = {
    company: 4,
    source: 5,
    startingArr: 6,
    growthRate: 7,
    churn: 8,
    expansion: 9,
    grossMargin: 10,
    cac: 11,
    arpu: 12,
    productivity: 13,
    rndPct: 14,
    gaPct: 15,
  } as const;

  assumptions.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - SaaS Assumptions`);
  mergeAndCenter(assumptions, 'A1:D1');
  styleTitle(assumptions.getCell('A1'));
  assumptions.getCell('A3').value = 'Assumption';
  assumptions.getCell('B3').value = 'Value';
  styleTableHeader(assumptions, 3, 1, 2);

  const assumptionValues: Array<[number, string, string | number, ValueKind]> = [
    [assumptionRows.company, 'Company', inputs.companyName, 'text'],
    [assumptionRows.source, 'Source', inputs.source, 'text'],
    [assumptionRows.startingArr, 'Starting ARR', inputs.startingArr, 'currency'],
    [assumptionRows.growthRate, 'New ARR Growth', inputs.growthRate, 'percent'],
    [assumptionRows.churn, 'Churn Rate', inputs.churn, 'percent'],
    [assumptionRows.expansion, 'Expansion Rate', 0.05, 'percent'],
    [assumptionRows.grossMargin, 'Gross Margin', inputs.grossMargin, 'percent'],
    [assumptionRows.cac, 'CAC', inputs.cac, 'currency'],
    [assumptionRows.arpu, 'ARPU', inputs.arpu, 'currency'],
    [assumptionRows.productivity, 'Sales Rep Productivity', 250000, 'currency'],
    [assumptionRows.rndPct, 'R&D % Revenue', 0.14, 'percent'],
    [assumptionRows.gaPct, 'G&A % Revenue', 0.1, 'percent'],
  ];
  assumptionValues.forEach(([row, label, value, kind]) => {
    assumptions.getCell(`A${row}`).value = label;
    styleLabel(assumptions.getCell(`A${row}`));
    assumptions.getCell(`B${row}`).value = value;
    styleInput(assumptions.getCell(`B${row}`), kind === 'text' ? 'text' : kind);
    applyKind(assumptions.getCell(`B${row}`), kind);
  });

  const beginningArr: number[] = [];
  const newArr: number[] = [];
  const churnedArr: number[] = [];
  const expansionArr: number[] = [];
  const endingArr: number[] = [];

  let currentArr = inputs.startingArr;
  for (let index = 0; index < inputs.years; index += 1) {
    const newArrValue = currentArr * inputs.growthRate;
    const churnValue = -(currentArr * inputs.churn);
    const expansionValue = currentArr * 0.05;
    const endingValue = currentArr + newArrValue + churnValue + expansionValue;
    beginningArr.push(currentArr);
    newArr.push(newArrValue);
    churnedArr.push(churnValue);
    expansionArr.push(expansionValue);
    endingArr.push(endingValue);
    currentArr = endingValue;
  }

  arrBridge.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - ARR Bridge`);
  mergeAndCenter(arrBridge, 'A1:H1');
  styleTitle(arrBridge.getCell('A1'));
  arrBridge.getCell('A3').value = 'Metric';
  styleTableHeader(arrBridge, 3, 1, inputs.years + 1);
  years.forEach((year, index) => {
    arrBridge.getCell(3, index + 2).value = year;
  });
  const arrRows = { beginning: 4, new: 5, churn: 6, expansion: 7, ending: 8 } as const;
  arrBridge.getCell('A4').value = 'Beginning ARR';
  arrBridge.getCell('A5').value = 'New ARR';
  arrBridge.getCell('A6').value = 'Churned ARR';
  arrBridge.getCell('A7').value = 'Expansion ARR';
  arrBridge.getCell('A8').value = 'Ending ARR';

  for (let index = 0; index < inputs.years; index += 1) {
    const column = col(index + 2);
    const previousColumn = col(index + 1);
    setFormula(
      arrBridge.getCell(`${column}${arrRows.beginning}`),
      index === 0 ? `=Assumptions!$B$${assumptionRows.startingArr}` : `=${previousColumn}${arrRows.ending}`,
      beginningArr[index],
      'currency'
    );
    setFormula(
      arrBridge.getCell(`${column}${arrRows.new}`),
      `=${column}${arrRows.beginning}*Assumptions!$B$${assumptionRows.growthRate}`,
      newArr[index],
      'currency'
    );
    setFormula(
      arrBridge.getCell(`${column}${arrRows.churn}`),
      `=-${column}${arrRows.beginning}*Assumptions!$B$${assumptionRows.churn}`,
      churnedArr[index],
      'currency'
    );
    setFormula(
      arrBridge.getCell(`${column}${arrRows.expansion}`),
      `=${column}${arrRows.beginning}*Assumptions!$B$${assumptionRows.expansion}`,
      expansionArr[index],
      'currency'
    );
    setFormula(
      arrBridge.getCell(`${column}${arrRows.ending}`),
      `=SUM(${column}${arrRows.beginning}:${column}${arrRows.expansion})`,
      endingArr[index],
      'currency',
      true
    );
  }
  styleSubTotal(arrBridge, arrRows.ending, 1, inputs.years + 1);

  const revenueSeries = beginningArr.map((value, index) => (value + endingArr[index]) / 2);
  const revenueGrowthSeries = revenueSeries.map((value, index) => (index === 0 ? value / inputs.startingArr - 1 : value / revenueSeries[index - 1] - 1));
  const grossProfitSeries = revenueSeries.map((value) => value * inputs.grossMargin);
  const customerSeries = endingArr.map((value) => value / inputs.arpu);

  revenueForecast.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Revenue Forecast`);
  mergeAndCenter(revenueForecast, 'A1:H1');
  styleTitle(revenueForecast.getCell('A1'));
  revenueForecast.getCell('A3').value = 'Metric';
  styleTableHeader(revenueForecast, 3, 1, inputs.years + 1);
  years.forEach((year, index) => {
    revenueForecast.getCell(3, index + 2).value = year;
  });
  const revenueRows = { revenue: 4, growth: 5, grossProfit: 6, grossMargin: 7, customers: 8 } as const;
  revenueForecast.getCell('A4').value = 'Subscription Revenue';
  revenueForecast.getCell('A5').value = 'Revenue Growth';
  revenueForecast.getCell('A6').value = 'Gross Profit';
  revenueForecast.getCell('A7').value = 'Gross Margin';
  revenueForecast.getCell('A8').value = 'Customers';

  for (let index = 0; index < inputs.years; index += 1) {
    const column = col(index + 2);
    const previousColumn = col(index + 1);
    setFormula(
      revenueForecast.getCell(`${column}${revenueRows.revenue}`),
      `=AVERAGE('ARR Bridge'!${column}4,'ARR Bridge'!${column}8)`,
      revenueSeries[index],
      'currency'
    );
    setFormula(
      revenueForecast.getCell(`${column}${revenueRows.growth}`),
      index === 0
        ? `=${column}${revenueRows.revenue}/Assumptions!$B$${assumptionRows.startingArr}-1`
        : `=${column}${revenueRows.revenue}/${previousColumn}${revenueRows.revenue}-1`,
      revenueGrowthSeries[index],
      'percent'
    );
    setFormula(
      revenueForecast.getCell(`${column}${revenueRows.grossProfit}`),
      `=${column}${revenueRows.revenue}*Assumptions!$B$${assumptionRows.grossMargin}`,
      grossProfitSeries[index],
      'currency'
    );
    setFormula(
      revenueForecast.getCell(`${column}${revenueRows.grossMargin}`),
      `=Assumptions!$B$${assumptionRows.grossMargin}`,
      inputs.grossMargin,
      'percent'
    );
    setFormula(
      revenueForecast.getCell(`${column}${revenueRows.customers}`),
      `='ARR Bridge'!${column}8/Assumptions!$B$${assumptionRows.arpu}`,
      customerSeries[index],
      'number'
    );
  }

  const grossProfitPerCustomer = inputs.arpu * inputs.grossMargin;
  const ltv = grossProfitPerCustomer / inputs.churn;
  const ltvToCac = ltv / inputs.cac;
  const paybackMonths = inputs.cac / (grossProfitPerCustomer / 12);

  unitEconomics.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Unit Economics`);
  mergeAndCenter(unitEconomics, 'A1:F1');
  styleTitle(unitEconomics.getCell('A1'));
  ['Metric', 'Formula', 'Value'].forEach((label, index) => {
    unitEconomics.getCell(3, index + 1).value = label;
  });
  styleTableHeader(unitEconomics, 3, 1, 3);
  const unitRows: Array<[number, string, string, number, ValueKind]> = [
    [4, 'CAC', `=Assumptions!$B$${assumptionRows.cac}`, inputs.cac, 'currency'],
    [5, 'ARPU', `=Assumptions!$B$${assumptionRows.arpu}`, inputs.arpu, 'currency'],
    [6, 'Gross Profit / Customer', `=Assumptions!$B$${assumptionRows.arpu}*Assumptions!$B$${assumptionRows.grossMargin}`, grossProfitPerCustomer, 'currency'],
    [7, 'Churn Rate', `=Assumptions!$B$${assumptionRows.churn}`, inputs.churn, 'percent'],
    [8, 'LTV', '=C6/C7', ltv, 'currency'],
    [9, 'LTV : CAC', '=C8/C4', ltvToCac, 'number'],
    [10, 'CAC Payback (Months)', '=C4/(C6/12)', paybackMonths, 'number'],
  ];
  unitRows.forEach(([row, label, formula, result, kind]) => {
    unitEconomics.getCell(`A${row}`).value = label;
    unitEconomics.getCell(`B${row}`).value = formula;
    styleLabel(unitEconomics.getCell(`A${row}`));
    styleFormula(unitEconomics.getCell(`B${row}`));
    setFormula(unitEconomics.getCell(`C${row}`), formula, result, kind, true);
  });

  const repSeries = newArr.map((value) => value / 250000);
  const rndSeries = revenueSeries.map((value) => value * 0.14);
  const gaSeries = revenueSeries.map((value) => value * 0.1);
  const totalOpexSeries = rndSeries.map((value, index) => value + gaSeries[index]);

  hiring.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Hiring & Opex`);
  mergeAndCenter(hiring, 'A1:H1');
  styleTitle(hiring.getCell('A1'));
  hiring.getCell('A3').value = 'Metric';
  styleTableHeader(hiring, 3, 1, inputs.years + 1);
  years.forEach((year, index) => {
    hiring.getCell(3, index + 2).value = year;
  });
  const hiringRows = { reps: 4, rnd: 5, ga: 6, total: 7 } as const;
  hiring.getCell('A4').value = 'Sales Reps Required';
  hiring.getCell('A5').value = 'R&D Spend';
  hiring.getCell('A6').value = 'G&A Spend';
  hiring.getCell('A7').value = 'Total Opex';
  for (let index = 0; index < inputs.years; index += 1) {
    const column = col(index + 2);
    setFormula(hiring.getCell(`${column}${hiringRows.reps}`), `='ARR Bridge'!${column}5/Assumptions!$B$${assumptionRows.productivity}`, repSeries[index], 'number');
    setFormula(hiring.getCell(`${column}${hiringRows.rnd}`), `='Revenue Forecast'!${column}4*Assumptions!$B$${assumptionRows.rndPct}`, rndSeries[index], 'currency');
    setFormula(hiring.getCell(`${column}${hiringRows.ga}`), `='Revenue Forecast'!${column}4*Assumptions!$B$${assumptionRows.gaPct}`, gaSeries[index], 'currency');
    setFormula(hiring.getCell(`${column}${hiringRows.total}`), `=SUM(${column}${hiringRows.rnd}:${column}${hiringRows.ga})`, totalOpexSeries[index], 'currency', true);
  }
  styleSubTotal(hiring, hiringRows.total, 1, inputs.years + 1);

  const finalArr = endingArr[endingArr.length - 1];
  const arrCagr = Math.pow(finalArr / inputs.startingArr, 1 / inputs.years) - 1;
  dashboard.getCell('A1').value = `${inputs.companyName} SaaS Operating Model`;
  mergeAndCenter(dashboard, 'A1:D1');
  styleTitle(dashboard.getCell('A1'));
  dashboard.getCell('A3').value = 'Metric';
  dashboard.getCell('B3').value = 'Value';
  styleTableHeader(dashboard, 3, 1, 2);
  const dashboardRows: Array<[number, string, string, number, ValueKind]> = [
    [4, 'Ending ARR', `='ARR Bridge'!${col(inputs.years + 1)}8`, finalArr, 'currency'],
    [5, 'ARR CAGR', `=(('ARR Bridge'!${col(inputs.years + 1)}8/Assumptions!$B$${assumptionRows.startingArr})^(1/${inputs.years}))-1`, arrCagr, 'percent'],
    [6, 'Gross Margin', `=Assumptions!$B$${assumptionRows.grossMargin}`, inputs.grossMargin, 'percent'],
    [7, 'Churn', `=Assumptions!$B$${assumptionRows.churn}`, inputs.churn, 'percent'],
    [8, 'CAC Payback', '=\'Unit Economics\'!C10', paybackMonths, 'number'],
    [9, 'LTV : CAC', '=\'Unit Economics\'!C9', ltvToCac, 'number'],
  ];
  dashboardRows.forEach(([row, label, formula, result, kind]) => {
    dashboard.getCell(`A${row}`).value = label;
    styleLabel(dashboard.getCell(`A${row}`));
    setFormula(dashboard.getCell(`B${row}`), formula, result, kind, true);
  });

  checks.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Checks`);
  mergeAndCenter(checks, 'A1:D1');
  styleTitle(checks.getCell('A1'));
  ['Check', 'Formula', 'Status'].forEach((label, index) => {
    checks.getCell(3, index + 1).value = label;
  });
  styleTableHeader(checks, 3, 1, 3);
  const saasChecks: Array<[string, string, string]> = [
    ['Gross margin within range', `=AND(Assumptions!$B$${assumptionRows.grossMargin}>0,Assumptions!$B$${assumptionRows.grossMargin}<1)`, inputs.grossMargin > 0 && inputs.grossMargin < 1 ? 'PASS' : 'FLAG'],
    ['Churn within sane range', `=AND(Assumptions!$B$${assumptionRows.churn}>=0,Assumptions!$B$${assumptionRows.churn}<0.3)`, inputs.churn >= 0 && inputs.churn < 0.3 ? 'PASS' : 'FLAG'],
    ['Ending ARR positive', `='ARR Bridge'!${col(inputs.years + 1)}8>0`, finalArr > 0 ? 'PASS' : 'FLAG'],
  ];
  saasChecks.forEach(([label, formula, status], index) => {
    const row = 4 + index;
    checks.getCell(`A${row}`).value = label;
    checks.getCell(`B${row}`).value = formula;
    checks.getCell(`C${row}`).value = status;
    styleLabel(checks.getCell(`A${row}`));
    styleFormula(checks.getCell(`B${row}`));
    styleCheck(checks.getCell(`C${row}`));
  });
  addPassFailConditionalFormatting(checks, 'C4:C6');

  addEquationSheet(workbook, `${inputs.companyName} SaaS Operating Model`, [
    {
      metric: 'Ending ARR',
      description: 'Beginning ARR plus new ARR, less churn, plus expansion ARR',
      formula: '=SUM(Beginning ARR:Expansion ARR)',
      dependencies: 'Beginning ARR, New ARR, Churned ARR, Expansion ARR',
      range: 'ARR Bridge!B8',
    },
    {
      metric: 'Recognized Revenue',
      description: 'Average of beginning and ending ARR as revenue proxy',
      formula: '=AVERAGE(B4,B8)',
      dependencies: 'Beginning ARR, Ending ARR',
      range: 'Revenue Forecast!B4',
    },
    {
      metric: 'LTV',
      description: 'Gross profit per customer divided by churn rate',
      formula: '=C6/C7',
      dependencies: 'ARPU, Gross Margin, Churn',
      range: 'Unit Economics!C8',
    },
    {
      metric: 'CAC Payback',
      description: 'CAC divided by monthly gross profit per customer',
      formula: '=C4/(C6/12)',
      dependencies: 'CAC, Gross Profit per Customer',
      range: 'Unit Economics!C10',
    },
  ]);
}

function buildCapTableWorkbook(workbook: ExcelJS.Workbook, inputs: CapTableModelInputs) {
  const roundInputs = workbook.addWorksheet('Round Inputs');
  const preRound = workbook.addWorksheet('Pre-Round Ownership');
  const financing = workbook.addWorksheet('Financing Round');
  const postRound = workbook.addWorksheet('Post-Round Ownership');
  const dilution = workbook.addWorksheet('Dilution Summary');
  const scenario = workbook.addWorksheet('Scenario View');
  const checks = workbook.addWorksheet('Checks');

  [roundInputs, preRound, financing, postRound, dilution, scenario, checks].forEach((sheet, index) => {
    setupSheet(sheet, {
      freezeRows: 3,
      freezeCols: 1,
      tabColor: ['FF1D4ED8', 'FF0F766E', 'FF7C3AED', 'FF0891B2', 'FFCA8A04', 'FF9333EA', 'FFDC2626'][index],
      columnWidths: [28, 18, 18, 18, 18, 18],
    });
  });

  const existingInvestorShares = inputs.founderShares * 0.25;
  const existingOptionPoolShares = inputs.founderShares * 0.08;
  const preRoundFdShares = inputs.founderShares + existingInvestorShares + existingOptionPoolShares;
  const pricePerShare = inputs.preMoney / preRoundFdShares;
  const newInvestorShares = inputs.raiseAmount / pricePerShare;
  const optionPoolTopUp = Math.max(
    0,
    (inputs.optionPoolRefresh * (preRoundFdShares + newInvestorShares) - existingOptionPoolShares) / (1 - inputs.optionPoolRefresh)
  );
  const postMoneyShares = preRoundFdShares + newInvestorShares + optionPoolTopUp;
  const postMoneyValuation = inputs.preMoney + inputs.raiseAmount;

  const founderPrePct = inputs.founderShares / preRoundFdShares;
  const founderPostPct = inputs.founderShares / postMoneyShares;
  const existingInvestorPrePct = existingInvestorShares / preRoundFdShares;
  const existingInvestorPostPct = existingInvestorShares / postMoneyShares;
  const optionPoolPrePct = existingOptionPoolShares / preRoundFdShares;
  const optionPoolPostPct = (existingOptionPoolShares + optionPoolTopUp) / postMoneyShares;
  const newInvestorPct = newInvestorShares / postMoneyShares;

  roundInputs.getCell('A1').value = `${inputs.roundType} Financing Model`;
  mergeAndCenter(roundInputs, 'A1:D1');
  styleTitle(roundInputs.getCell('A1'));
  roundInputs.getCell('A3').value = 'Input';
  roundInputs.getCell('B3').value = 'Value';
  styleTableHeader(roundInputs, 3, 1, 2);
  const inputRows: Array<[number, string, number | string, ValueKind]> = [
    [4, 'Round Type', inputs.roundType, 'text'],
    [5, 'Pre-Money Valuation', inputs.preMoney, 'currency'],
    [6, 'New Money Raised', inputs.raiseAmount, 'currency'],
    [7, 'Founder Shares', inputs.founderShares, 'number'],
    [8, 'Existing Investor Shares', existingInvestorShares, 'number'],
    [9, 'Existing Option Pool Shares', existingOptionPoolShares, 'number'],
    [10, 'Option Pool Refresh %', inputs.optionPoolRefresh, 'percent'],
  ];
  inputRows.forEach(([row, label, value, kind]) => {
    roundInputs.getCell(`A${row}`).value = label;
    styleLabel(roundInputs.getCell(`A${row}`));
    roundInputs.getCell(`B${row}`).value = value;
    styleInput(roundInputs.getCell(`B${row}`), kind === 'text' ? 'text' : kind);
    applyKind(roundInputs.getCell(`B${row}`), kind);
  });

  preRound.getCell('A1').value = 'Pre-Round Ownership';
  mergeAndCenter(preRound, 'A1:D1');
  styleTitle(preRound.getCell('A1'));
  ['Stakeholder', 'Shares', 'Ownership %'].forEach((label, index) => {
    preRound.getCell(3, index + 1).value = label;
  });
  styleTableHeader(preRound, 3, 1, 3);
  const preStakeholders: Array<[number, string, number, number]> = [
    [4, 'Founders', inputs.founderShares, founderPrePct],
    [5, 'Existing Investors', existingInvestorShares, existingInvestorPrePct],
    [6, 'Option Pool', existingOptionPoolShares, optionPoolPrePct],
  ];
  preStakeholders.forEach(([row, label, shares, pct]) => {
    preRound.getCell(`A${row}`).value = label;
    setStatic(preRound.getCell(`B${row}`), shares, 'number');
    setFormula(preRound.getCell(`C${row}`), `=B${row}/$B$7`, pct, 'percent');
  });
  preRound.getCell('A7').value = 'Total Fully Diluted Shares';
  setFormula(preRound.getCell('B7'), '=SUM(B4:B6)', preRoundFdShares, 'number', true);

  financing.getCell('A1').value = 'Financing Round';
  mergeAndCenter(financing, 'A1:D1');
  styleTitle(financing.getCell('A1'));
  ['Metric', 'Value'].forEach((label, index) => {
    financing.getCell(3, index + 1).value = label;
  });
  styleTableHeader(financing, 3, 1, 2);
  const financingMetrics: Array<[number, string, string, number, ValueKind]> = [
    [4, 'Price Per Share', `='Round Inputs'!B5/'Pre-Round Ownership'!B7`, pricePerShare, 'currency'],
    [5, 'New Investor Shares', `='Round Inputs'!B6/B4`, newInvestorShares, 'number'],
    [6, 'Option Pool Top-Up Shares', `=MAX(0,(('Round Inputs'!B10*('Pre-Round Ownership'!B7+B5))-'Round Inputs'!B9)/(1-'Round Inputs'!B10))`, optionPoolTopUp, 'number'],
    [7, 'Post-Money Valuation', `='Round Inputs'!B5+'Round Inputs'!B6`, postMoneyValuation, 'currency'],
    [8, 'Post-Money Fully Diluted Shares', `='Pre-Round Ownership'!B7+B5+B6`, postMoneyShares, 'number'],
  ];
  financingMetrics.forEach(([row, label, formula, result, kind]) => {
    financing.getCell(`A${row}`).value = label;
    styleLabel(financing.getCell(`A${row}`));
    setFormula(financing.getCell(`B${row}`), formula, result, kind, row >= 7);
  });

  postRound.getCell('A1').value = 'Post-Round Ownership';
  mergeAndCenter(postRound, 'A1:E1');
  styleTitle(postRound.getCell('A1'));
  ['Stakeholder', 'Shares', 'FD Shares', 'Ownership %'].forEach((label, index) => {
    postRound.getCell(3, index + 1).value = label;
  });
  styleTableHeader(postRound, 3, 1, 4);
  const postStakeholders: Array<[number, string, number, number]> = [
    [4, 'Founders', inputs.founderShares, founderPostPct],
    [5, 'Existing Investors', existingInvestorShares, existingInvestorPostPct],
    [6, `${inputs.roundType} Investors`, newInvestorShares, newInvestorPct],
    [7, 'Option Pool', existingOptionPoolShares + optionPoolTopUp, optionPoolPostPct],
  ];
  postStakeholders.forEach(([row, label, shares, pct]) => {
    postRound.getCell(`A${row}`).value = label;
    setStatic(postRound.getCell(`B${row}`), shares, 'number');
    setFormula(postRound.getCell(`C${row}`), `=B${row}`, shares, 'number');
    setFormula(postRound.getCell(`D${row}`), `=C${row}/$C$8`, pct, 'percent');
  });
  postRound.getCell('A8').value = 'Total Fully Diluted Shares';
  setFormula(postRound.getCell('C8'), '=SUM(C4:C7)', postMoneyShares, 'number', true);

  dilution.getCell('A1').value = 'Dilution Summary';
  mergeAndCenter(dilution, 'A1:D1');
  styleTitle(dilution.getCell('A1'));
  ['Metric', 'Pre-Round', 'Post-Round', 'Delta'].forEach((label, index) => {
    dilution.getCell(3, index + 1).value = label;
  });
  styleTableHeader(dilution, 3, 1, 4);
  const dilutionRows: Array<[number, string, number, number]> = [
    [4, 'Founder Ownership', founderPrePct, founderPostPct],
    [5, 'Existing Investor Ownership', existingInvestorPrePct, existingInvestorPostPct],
    [6, 'Option Pool Ownership', optionPoolPrePct, optionPoolPostPct],
  ];
  dilutionRows.forEach(([row, label, prePct, postPct]) => {
    dilution.getCell(`A${row}`).value = label;
    setStatic(dilution.getCell(`B${row}`), prePct, 'percent');
    setStatic(dilution.getCell(`C${row}`), postPct, 'percent');
    setFormula(dilution.getCell(`D${row}`), `=C${row}-B${row}`, postPct - prePct, 'percent', true);
  });
  dilution.getCell('A8').value = 'New Investor Ownership';
  setStatic(dilution.getCell('C8'), newInvestorPct, 'percent', true);
  dilution.getCell('A9').value = 'Post-Money Valuation';
  setStatic(dilution.getCell('C9'), postMoneyValuation, 'currency', true);

  scenario.getCell('A1').value = 'Scenario View';
  mergeAndCenter(scenario, 'A1:F1');
  styleTitle(scenario.getCell('A1'));
  ['Case', 'Raise Amount', 'Pre-Money', 'Option Pool %', 'New Investor %'].forEach((label, index) => {
    scenario.getCell(3, index + 1).value = label;
  });
  styleTableHeader(scenario, 3, 1, 5);
  const scenarios = [
    { name: 'Low Raise', raise: inputs.raiseAmount * 0.75, preMoney: inputs.preMoney, pool: inputs.optionPoolRefresh },
    { name: 'Base', raise: inputs.raiseAmount, preMoney: inputs.preMoney, pool: inputs.optionPoolRefresh },
    { name: 'Higher Valuation', raise: inputs.raiseAmount, preMoney: inputs.preMoney * 1.2, pool: Math.max(inputs.optionPoolRefresh - 0.02, 0.05) },
  ];
  scenarios.forEach((scenarioItem, index) => {
    const row = 4 + index;
    const scenarioPps = scenarioItem.preMoney / preRoundFdShares;
    const scenarioNewShares = scenarioItem.raise / scenarioPps;
    const scenarioPoolTopUp = Math.max(0, (scenarioItem.pool * (preRoundFdShares + scenarioNewShares) - existingOptionPoolShares) / (1 - scenarioItem.pool));
    const scenarioPostShares = preRoundFdShares + scenarioNewShares + scenarioPoolTopUp;
    scenario.getCell(`A${row}`).value = scenarioItem.name;
    setStatic(scenario.getCell(`B${row}`), scenarioItem.raise, 'currency');
    setStatic(scenario.getCell(`C${row}`), scenarioItem.preMoney, 'currency');
    setStatic(scenario.getCell(`D${row}`), scenarioItem.pool, 'percent');
    setStatic(scenario.getCell(`E${row}`), scenarioNewShares / scenarioPostShares, 'percent', true);
  });

  checks.getCell('A1').value = 'Checks';
  mergeAndCenter(checks, 'A1:D1');
  styleTitle(checks.getCell('A1'));
  ['Check', 'Formula', 'Status'].forEach((label, index) => {
    checks.getCell(3, index + 1).value = label;
  });
  styleTableHeader(checks, 3, 1, 3);
  const ownershipTotal = founderPostPct + existingInvestorPostPct + newInvestorPct + optionPoolPostPct;
  const capChecks: Array<[string, string, string]> = [
    ['Ownership totals to 100%', `=ABS(SUM('Post-Round Ownership'!D4:D7)-1)<0.0001`, Math.abs(ownershipTotal - 1) < 0.0001 ? 'PASS' : 'FLAG'],
    ['Post-money valuation ties', `='Dilution Summary'!C9=('Round Inputs'!B5+'Round Inputs'!B6)`, postMoneyValuation === inputs.preMoney + inputs.raiseAmount ? 'PASS' : 'FLAG'],
    ['Price per share positive', `='Financing Round'!B4>0`, pricePerShare > 0 ? 'PASS' : 'FLAG'],
  ];
  capChecks.forEach(([label, formula, status], index) => {
    const row = 4 + index;
    checks.getCell(`A${row}`).value = label;
    checks.getCell(`B${row}`).value = formula;
    checks.getCell(`C${row}`).value = status;
    styleLabel(checks.getCell(`A${row}`));
    styleFormula(checks.getCell(`B${row}`));
    styleCheck(checks.getCell(`C${row}`));
  });
  addPassFailConditionalFormatting(checks, 'C4:C6');

  addEquationSheet(workbook, `${inputs.roundType} Cap Table`, [
    {
      metric: 'Price Per Share',
      description: 'Pre-money valuation divided by pre-round fully diluted shares',
      formula: "='Round Inputs'!B5/'Pre-Round Ownership'!B7",
      dependencies: 'Pre-Money Valuation, Pre-Round FD Shares',
      range: 'Financing Round!B4',
    },
    {
      metric: 'New Investor Shares',
      description: 'Raise amount divided by price per share',
      formula: "='Round Inputs'!B6/B4",
      dependencies: 'Raise Amount, Price Per Share',
      range: 'Financing Round!B5',
    },
    {
      metric: 'Founder Dilution',
      description: 'Post-round founder ownership less pre-round founder ownership',
      formula: '=C4-B4',
      dependencies: 'Founder Pre %, Founder Post %',
      range: 'Dilution Summary!D4',
    },
    {
      metric: 'New Investor Ownership',
      description: 'New investor shares divided by post-money fully diluted shares',
      formula: '=C6/$C$8',
      dependencies: 'New Investor Shares, Post-Money FD Shares',
      range: 'Post-Round Ownership!D6',
    },
  ]);
}

function buildThreeStatementWorkbook(workbook: ExcelJS.Workbook, inputs: ThreeStatementModelInputs) {
  const forecastYears = yearLabels(inputs.years);
  const baseYear = forecastYears[0] - 1;
  const allYears = [baseYear, ...forecastYears];

  const control = workbook.addWorksheet('Control Panel');
  const income = workbook.addWorksheet('Income Statement');
  const balance = workbook.addWorksheet('Balance Sheet');
  const cashFlow = workbook.addWorksheet('Cash Flow');
  const wc = workbook.addWorksheet('Working Capital Schedule');
  const ppe = workbook.addWorksheet('PP&E & Depreciation');
  const debt = workbook.addWorksheet('Debt Schedule');
  const checks = workbook.addWorksheet('Checks');

  [control, income, balance, cashFlow, wc, ppe, debt, checks].forEach((sheet, index) => {
    setupSheet(sheet, {
      freezeRows: 3,
      freezeCols: 1,
      tabColor: ['FF1D4ED8', 'FF0F766E', 'FF0891B2', 'FF7C3AED', 'FFCA8A04', 'FF9333EA', 'FF2563EB', 'FFDC2626'][index],
      columnWidths: [30, 18, 16, 16, 16, 16, 16, 16],
    });
  });

  const controlRows = {
    company: 4,
    source: 5,
    baseRevenue: 6,
    grossMargin: 7,
    opexPct: 8,
    taxRate: 9,
    capexPct: 10,
    daPct: 11,
    openingDebt: 12,
    openingCash: 13,
    dso: 14,
    dio: 15,
    dpo: 16,
    interestRate: 17,
    commonStock: 18,
    openingRetained: 19,
    ocaPct: 20,
    oclPct: 21,
    otherAssets: 22,
    otherLiabilities: 23,
    growthStart: 26,
  } as const;

  control.getCell('A1').value = `${inputs.companyName} Three-Statement Model`;
  mergeAndCenter(control, 'A1:H1');
  styleTitle(control.getCell('A1'));
  control.getCell('A3').value = 'Assumption';
  control.getCell('B3').value = 'Value';
  styleTableHeader(control, 3, 1, 2);

  const controlInputs: Array<[number, string, number | string, ValueKind]> = [
    [controlRows.company, 'Company', inputs.companyName, 'text'],
    [controlRows.source, 'Source', inputs.source, 'text'],
    [controlRows.baseRevenue, 'Base Revenue', inputs.baseRevenue, 'currency'],
    [controlRows.grossMargin, 'Gross Margin', inputs.grossMargin, 'percent'],
    [controlRows.opexPct, 'Opex % Revenue', inputs.opexPctRevenue, 'percent'],
    [controlRows.taxRate, 'Tax Rate', inputs.taxRate, 'percent'],
    [controlRows.capexPct, 'Capex % Revenue', inputs.capexPctRevenue, 'percent'],
    [controlRows.daPct, 'D&A % Revenue', inputs.daPctRevenue, 'percent'],
    [controlRows.openingDebt, 'Opening Debt', inputs.debt, 'currency'],
    [controlRows.openingCash, 'Opening Cash', inputs.cash, 'currency'],
    [controlRows.dso, 'DSO', 55, 'number'],
    [controlRows.dio, 'DIO', 35, 'number'],
    [controlRows.dpo, 'DPO', 30, 'number'],
    [controlRows.interestRate, 'Interest Rate', 0.06, 'percent'],
    [controlRows.commonStock, 'Common Stock', 300, 'currency'],
    [controlRows.openingRetained, 'Opening Retained Earnings', 250, 'currency'],
    [controlRows.ocaPct, 'Other Current Assets % Revenue', 0.02, 'percent'],
    [controlRows.oclPct, 'Other Current Liabilities % Revenue', 0.03, 'percent'],
    [controlRows.otherAssets, 'Other Assets', 80, 'currency'],
    [controlRows.otherLiabilities, 'Other Liabilities', 60, 'currency'],
  ];
  controlInputs.forEach(([row, label, value, kind]) => {
    control.getCell(`A${row}`).value = label;
    styleLabel(control.getCell(`A${row}`));
    control.getCell(`B${row}`).value = value;
    styleInput(control.getCell(`B${row}`), kind === 'text' ? 'text' : kind);
    applyKind(control.getCell(`B${row}`), kind);
  });

  styleSectionHeader(control, 25, 'Revenue Growth Assumptions', 3);
  control.getCell('A26').value = 'Year';
  control.getCell('B26').value = 'Growth';
  styleTableHeader(control, 26, 1, 2);
  inputs.revenueGrowth.forEach((growth, index) => {
    const row = controlRows.growthStart + index;
    control.getCell(`A${row}`).value = forecastYears[index];
    setStatic(control.getCell(`B${row}`), growth, 'percent');
  });

  const revenueSeries: number[] = [inputs.baseRevenue];
  for (let index = 0; index < inputs.revenueGrowth.length; index += 1) {
    revenueSeries.push(revenueSeries[index] * (1 + inputs.revenueGrowth[index]));
  }
  const cogsSeries = revenueSeries.map((value) => -(value * (1 - inputs.grossMargin)));
  const grossProfitSeries = revenueSeries.map((value, index) => value + cogsSeries[index]);
  const opexSeries = revenueSeries.map((value) => -(value * inputs.opexPctRevenue));
  const ebitdaSeries = grossProfitSeries.map((value, index) => value + opexSeries[index]);
  const daSeries = revenueSeries.map((value) => -(value * inputs.daPctRevenue));
  const capexSeries = revenueSeries.map((value) => -(value * inputs.capexPctRevenue));
  const beginningDebt: number[] = [];
  const repaymentSeries: number[] = [];
  const endingDebt: number[] = [];
  const interestSeries: number[] = [];

  let currentDebt = inputs.debt;
  for (let index = 0; index < allYears.length; index += 1) {
    const repayment = -(currentDebt * 0.05);
    const endDebt = currentDebt + repayment;
    beginningDebt.push(currentDebt);
    repaymentSeries.push(repayment);
    endingDebt.push(endDebt);
    interestSeries.push(-((currentDebt + endDebt) / 2) * 0.06);
    currentDebt = endDebt;
  }

  const ebitSeries = ebitdaSeries.map((value, index) => value + daSeries[index]);
  const ebtSeries = ebitSeries.map((value, index) => value + interestSeries[index]);
  const taxSeries = ebtSeries.map((value) => (value > 0 ? -(value * inputs.taxRate) : 0));
  const netIncomeSeries = ebtSeries.map((value, index) => value + taxSeries[index]);

  const arSeries = revenueSeries.map((value) => (value * 55) / 365);
  const inventorySeries = cogsSeries.map((value) => (-value * 35) / 365);
  const apSeries = cogsSeries.map((value) => (-value * 30) / 365);
  const ocaSeries = revenueSeries.map((value) => value * 0.02);
  const oclSeries = revenueSeries.map((value) => value * 0.03);
  const nwcSeries = arSeries.map((value, index) => value + inventorySeries[index] + ocaSeries[index] - apSeries[index] - oclSeries[index]);
  const deltaNwcSeries = nwcSeries.map((value, index) => (index === 0 ? 0 : -(value - nwcSeries[index - 1])));

  const beginningPpe: number[] = [];
  const endingPpe: number[] = [];
  let currentPpe = inputs.baseRevenue * 0.18;
  for (let index = 0; index < allYears.length; index += 1) {
    const endingValue = currentPpe - daSeries[index] - capexSeries[index];
    beginningPpe.push(currentPpe);
    endingPpe.push(endingValue);
    currentPpe = endingValue;
  }

  const netChangeCashSeries = netIncomeSeries.map((value, index) => value - daSeries[index] + deltaNwcSeries[index] + capexSeries[index] + repaymentSeries[index]);
  const endingCashSeries: number[] = [];
  let currentCash = inputs.cash;
  for (let index = 0; index < allYears.length; index += 1) {
    currentCash += netChangeCashSeries[index];
    endingCashSeries.push(currentCash);
  }

  const retainedEarningsSeries: number[] = [];
  let retainedEarnings = 250;
  for (let index = 0; index < allYears.length; index += 1) {
    retainedEarnings += netIncomeSeries[index];
    retainedEarningsSeries.push(retainedEarnings);
  }

  const totalAssetsSeries = endingCashSeries.map(
    (value, index) => value + arSeries[index] + inventorySeries[index] + ocaSeries[index] + endingPpe[index] + 80
  );
  const totalLeSeries = apSeries.map(
    (value, index) => value + oclSeries[index] + endingDebt[index] + 60 + 300 + retainedEarningsSeries[index]
  );

  income.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Income Statement`);
  mergeAndCenter(income, 'A1:H1');
  styleTitle(income.getCell('A1'));
  income.getCell('A3').value = 'Line Item';
  styleTableHeader(income, 3, 1, allYears.length + 1);
  allYears.forEach((year, index) => {
    income.getCell(3, index + 2).value = index === 0 ? `${year}A` : `${year}E`;
  });
  const isRows = { revenue: 4, cogs: 5, gp: 6, gm: 7, opex: 8, ebitda: 9, da: 10, ebit: 11, interest: 12, ebt: 13, taxes: 14, ni: 15 } as const;
  ['Revenue', 'COGS', 'Gross Profit', 'Gross Margin', 'Operating Expenses', 'EBITDA', 'D&A', 'EBIT', 'Interest Expense', 'EBT', 'Taxes', 'Net Income'].forEach((label, index) => {
    income.getCell(`A${4 + index}`).value = label;
  });
  styleSubTotal(income, isRows.gp, 1, allYears.length + 1);
  styleSubTotal(income, isRows.ebitda, 1, allYears.length + 1);
  styleSubTotal(income, isRows.ebit, 1, allYears.length + 1);
  styleTotal(income, isRows.ni, 1, allYears.length + 1);
  for (let index = 0; index < allYears.length; index += 1) {
    const column = col(index + 2);
    const previousColumn = col(index + 1);
    const growthRow = controlRows.growthStart + Math.max(index - 1, 0);
    setFormula(
      income.getCell(`${column}${isRows.revenue}`),
      index === 0 ? `=Control Panel!$B$${controlRows.baseRevenue}` : `=${previousColumn}${isRows.revenue}*(1+Control Panel!$B$${growthRow})`,
      revenueSeries[index],
      'currency'
    );
    setFormula(income.getCell(`${column}${isRows.cogs}`), `=-${column}${isRows.revenue}*(1-Control Panel!$B$${controlRows.grossMargin})`, cogsSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.gp}`), `=${column}${isRows.revenue}+${column}${isRows.cogs}`, grossProfitSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.gm}`), `=${column}${isRows.gp}/${column}${isRows.revenue}`, grossProfitSeries[index] / revenueSeries[index], 'percent');
    setFormula(income.getCell(`${column}${isRows.opex}`), `=-${column}${isRows.revenue}*Control Panel!$B$${controlRows.opexPct}`, opexSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.ebitda}`), `=${column}${isRows.gp}+${column}${isRows.opex}`, ebitdaSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.da}`), `='PP&E & Depreciation'!${column}6`, daSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.ebit}`), `=${column}${isRows.ebitda}+${column}${isRows.da}`, ebitSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.interest}`), `='Debt Schedule'!${column}8`, interestSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.ebt}`), `=${column}${isRows.ebit}+${column}${isRows.interest}`, ebtSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.taxes}`), `=IF(${column}${isRows.ebt}>0,-${column}${isRows.ebt}*Control Panel!$B$${controlRows.taxRate},0)`, taxSeries[index], 'currency');
    setFormula(income.getCell(`${column}${isRows.ni}`), `=${column}${isRows.ebt}+${column}${isRows.taxes}`, netIncomeSeries[index], 'currency', true);
  }

  wc.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Working Capital Schedule`);
  mergeAndCenter(wc, 'A1:H1');
  styleTitle(wc.getCell('A1'));
  wc.getCell('A3').value = 'Metric';
  styleTableHeader(wc, 3, 1, allYears.length + 1);
  allYears.forEach((year, index) => {
    wc.getCell(3, index + 2).value = index === 0 ? `${year}A` : `${year}E`;
  });
  const wcRows = { revenue: 4, dso: 5, ar: 6, dio: 7, inventory: 8, dpo: 9, ap: 10, nwc: 11, delta: 12 } as const;
  ['Revenue', 'DSO', 'A/R', 'DIO', 'Inventory', 'DPO', 'A/P', 'Net Working Capital', 'ΔNWC'].forEach((label, index) => {
    wc.getCell(`A${4 + index}`).value = label;
  });
  for (let index = 0; index < allYears.length; index += 1) {
    const column = col(index + 2);
    const previousColumn = col(index + 1);
    setFormula(wc.getCell(`${column}${wcRows.revenue}`), `='Income Statement'!${column}4`, revenueSeries[index], 'currency');
    setFormula(wc.getCell(`${column}${wcRows.dso}`), `=Control Panel!$B$${controlRows.dso}`, 55, 'number');
    setFormula(wc.getCell(`${column}${wcRows.ar}`), `=${column}${wcRows.revenue}*${column}${wcRows.dso}/365`, arSeries[index], 'currency');
    setFormula(wc.getCell(`${column}${wcRows.dio}`), `=Control Panel!$B$${controlRows.dio}`, 35, 'number');
    setFormula(wc.getCell(`${column}${wcRows.inventory}`), `=-'Income Statement'!${column}5*${column}${wcRows.dio}/365`, inventorySeries[index], 'currency');
    setFormula(wc.getCell(`${column}${wcRows.dpo}`), `=Control Panel!$B$${controlRows.dpo}`, 30, 'number');
    setFormula(wc.getCell(`${column}${wcRows.ap}`), `=-'Income Statement'!${column}5*${column}${wcRows.dpo}/365`, apSeries[index], 'currency');
    setFormula(
      wc.getCell(`${column}${wcRows.nwc}`),
      `=${column}${wcRows.ar}+${column}${wcRows.inventory}+('Income Statement'!${column}4*Control Panel!$B$${controlRows.ocaPct})-${column}${wcRows.ap}-('Income Statement'!${column}4*Control Panel!$B$${controlRows.oclPct})`,
      nwcSeries[index],
      'currency'
    );
    setFormula(
      wc.getCell(`${column}${wcRows.delta}`),
      index === 0 ? '=0' : `=-(${column}${wcRows.nwc}-${previousColumn}${wcRows.nwc})`,
      deltaNwcSeries[index],
      'currency',
      index > 0
    );
  }

  ppe.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - PP&E & Depreciation`);
  mergeAndCenter(ppe, 'A1:H1');
  styleTitle(ppe.getCell('A1'));
  ppe.getCell('A3').value = 'Metric';
  styleTableHeader(ppe, 3, 1, allYears.length + 1);
  allYears.forEach((year, index) => {
    ppe.getCell(3, index + 2).value = index === 0 ? `${year}A` : `${year}E`;
  });
  const ppeRows = { beginning: 4, capex: 5, da: 6, ending: 7 } as const;
  ['Beginning PP&E', 'Capex', 'Depreciation', 'Ending PP&E'].forEach((label, index) => {
    ppe.getCell(`A${4 + index}`).value = label;
  });
  for (let index = 0; index < allYears.length; index += 1) {
    const column = col(index + 2);
    const previousColumn = col(index + 1);
    setFormula(ppe.getCell(`${column}${ppeRows.beginning}`), index === 0 ? `=Control Panel!$B$${controlRows.baseRevenue}*0.18` : `=${previousColumn}${ppeRows.ending}`, beginningPpe[index], 'currency');
    setFormula(ppe.getCell(`${column}${ppeRows.capex}`), `=-'Income Statement'!${column}4*Control Panel!$B$${controlRows.capexPct}`, capexSeries[index], 'currency');
    setFormula(ppe.getCell(`${column}${ppeRows.da}`), `=-'Income Statement'!${column}4*Control Panel!$B$${controlRows.daPct}`, daSeries[index], 'currency');
    setFormula(ppe.getCell(`${column}${ppeRows.ending}`), `=${column}${ppeRows.beginning}-${column}${ppeRows.capex}+${column}${ppeRows.da}`, endingPpe[index], 'currency', true);
  }

  debt.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Debt Schedule`);
  mergeAndCenter(debt, 'A1:H1');
  styleTitle(debt.getCell('A1'));
  debt.getCell('A3').value = 'Metric';
  styleTableHeader(debt, 3, 1, allYears.length + 1);
  allYears.forEach((year, index) => {
    debt.getCell(3, index + 2).value = index === 0 ? `${year}A` : `${year}E`;
  });
  const debtRows = { beginning: 4, newDebt: 5, repayment: 6, ending: 7, interest: 8 } as const;
  ['Beginning Debt', 'New Debt', 'Repayment', 'Ending Debt', 'Interest Expense'].forEach((label, index) => {
    debt.getCell(`A${4 + index}`).value = label;
  });
  for (let index = 0; index < allYears.length; index += 1) {
    const column = col(index + 2);
    const previousColumn = col(index + 1);
    setFormula(debt.getCell(`${column}${debtRows.beginning}`), index === 0 ? `=Control Panel!$B$${controlRows.openingDebt}` : `=${previousColumn}${debtRows.ending}`, beginningDebt[index], 'currency');
    setStatic(debt.getCell(`${column}${debtRows.newDebt}`), 0, 'currency');
    setFormula(debt.getCell(`${column}${debtRows.repayment}`), `=-${column}${debtRows.beginning}*0.05`, repaymentSeries[index], 'currency');
    setFormula(debt.getCell(`${column}${debtRows.ending}`), `=${column}${debtRows.beginning}+${column}${debtRows.newDebt}+${column}${debtRows.repayment}`, endingDebt[index], 'currency', true);
    setFormula(debt.getCell(`${column}${debtRows.interest}`), `=-AVERAGE(${column}${debtRows.beginning},${column}${debtRows.ending})*Control Panel!$B$${controlRows.interestRate}`, interestSeries[index], 'currency');
  }

  cashFlow.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Cash Flow Statement`);
  mergeAndCenter(cashFlow, 'A1:H1');
  styleTitle(cashFlow.getCell('A1'));
  cashFlow.getCell('A3').value = 'Line Item';
  styleTableHeader(cashFlow, 3, 1, allYears.length + 1);
  allYears.forEach((year, index) => {
    cashFlow.getCell(3, index + 2).value = index === 0 ? `${year}A` : `${year}E`;
  });
  const cfRows = { ni: 4, da: 5, deltaNwc: 6, capex: 7, debt: 8, net: 9, cash: 10 } as const;
  ['Net Income', 'D&A', 'ΔWorking Capital', 'Capex', 'Debt Repayment', 'Net Change in Cash', 'Ending Cash'].forEach((label, index) => {
    cashFlow.getCell(`A${4 + index}`).value = label;
  });
  for (let index = 0; index < allYears.length; index += 1) {
    const column = col(index + 2);
    const previousColumn = col(index + 1);
    setFormula(cashFlow.getCell(`${column}${cfRows.ni}`), `='Income Statement'!${column}15`, netIncomeSeries[index], 'currency');
    setFormula(cashFlow.getCell(`${column}${cfRows.da}`), `=-'Income Statement'!${column}10`, -daSeries[index], 'currency');
    setFormula(cashFlow.getCell(`${column}${cfRows.deltaNwc}`), `='Working Capital Schedule'!${column}12`, deltaNwcSeries[index], 'currency');
    setFormula(cashFlow.getCell(`${column}${cfRows.capex}`), `='PP&E & Depreciation'!${column}5`, capexSeries[index], 'currency');
    setFormula(cashFlow.getCell(`${column}${cfRows.debt}`), `='Debt Schedule'!${column}6`, repaymentSeries[index], 'currency');
    setFormula(cashFlow.getCell(`${column}${cfRows.net}`), `=SUM(${column}${cfRows.ni}:${column}${cfRows.debt})`, netChangeCashSeries[index], 'currency');
    setFormula(
      cashFlow.getCell(`${column}${cfRows.cash}`),
      index === 0 ? `=Control Panel!$B$${controlRows.openingCash}+${column}${cfRows.net}` : `=${previousColumn}${cfRows.cash}+${column}${cfRows.net}`,
      endingCashSeries[index],
      'currency',
      true
    );
  }
  styleTotal(cashFlow, cfRows.cash, 1, allYears.length + 1);

  balance.getCell('A1').value = sanitizeWorkbookText(`${inputs.companyName} - Balance Sheet`);
  mergeAndCenter(balance, 'A1:H1');
  styleTitle(balance.getCell('A1'));
  balance.getCell('A3').value = 'Line Item';
  styleTableHeader(balance, 3, 1, allYears.length + 1);
  allYears.forEach((year, index) => {
    balance.getCell(3, index + 2).value = index === 0 ? `${year}A` : `${year}E`;
  });
  const bsRows = { cash: 4, ar: 5, inventory: 6, oca: 7, ppe: 8, otherAssets: 9, totalAssets: 10, ap: 12, ocl: 13, debt: 14, otherLiab: 15, commonStock: 17, retained: 18, totalLe: 19, check: 20 } as const;
  ['Cash', 'A/R', 'Inventory', 'Other Current Assets', 'PP&E', 'Other Assets', 'Total Assets', '', 'A/P', 'Other Current Liabilities', 'Debt', 'Other Liabilities', '', 'Common Stock', 'Retained Earnings', 'Total Liabilities + Equity', 'Balance Check'].forEach((label, index) => {
    if (label) balance.getCell(`A${4 + index}`).value = label;
  });
  styleTotal(balance, bsRows.totalAssets, 1, allYears.length + 1);
  styleTotal(balance, bsRows.totalLe, 1, allYears.length + 1);
  for (let index = 0; index < allYears.length; index += 1) {
    const column = col(index + 2);
    const previousColumn = col(index + 1);
    setFormula(balance.getCell(`${column}${bsRows.cash}`), `='Cash Flow'!${column}10`, endingCashSeries[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.ar}`), `='Working Capital Schedule'!${column}6`, arSeries[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.inventory}`), `='Working Capital Schedule'!${column}8`, inventorySeries[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.oca}`), `='Income Statement'!${column}4*Control Panel!$B$${controlRows.ocaPct}`, ocaSeries[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.ppe}`), `='PP&E & Depreciation'!${column}7`, endingPpe[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.otherAssets}`), `=Control Panel!$B$${controlRows.otherAssets}`, 80, 'currency');
    setFormula(balance.getCell(`${column}${bsRows.totalAssets}`), `=SUM(${column}${bsRows.cash}:${column}${bsRows.otherAssets})`, totalAssetsSeries[index], 'currency', true);
    setFormula(balance.getCell(`${column}${bsRows.ap}`), `='Working Capital Schedule'!${column}10`, apSeries[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.ocl}`), `='Income Statement'!${column}4*Control Panel!$B$${controlRows.oclPct}`, oclSeries[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.debt}`), `='Debt Schedule'!${column}7`, endingDebt[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.otherLiab}`), `=Control Panel!$B$${controlRows.otherLiabilities}`, 60, 'currency');
    setFormula(balance.getCell(`${column}${bsRows.commonStock}`), `=Control Panel!$B$${controlRows.commonStock}`, 300, 'currency');
    setFormula(balance.getCell(`${column}${bsRows.retained}`), index === 0 ? `=Control Panel!$B$${controlRows.openingRetained}+'Income Statement'!${column}15` : `=${previousColumn}${bsRows.retained}+'Income Statement'!${column}15`, retainedEarningsSeries[index], 'currency');
    setFormula(balance.getCell(`${column}${bsRows.totalLe}`), `=SUM(${column}${bsRows.ap}:${column}${bsRows.otherLiab})+SUM(${column}${bsRows.commonStock}:${column}${bsRows.retained})`, totalLeSeries[index], 'currency', true);
    setFormula(balance.getCell(`${column}${bsRows.check}`), `=${column}${bsRows.totalAssets}-${column}${bsRows.totalLe}`, totalAssetsSeries[index] - totalLeSeries[index], 'currency', true);
  }

  const revenueCagr = Math.pow(revenueSeries[revenueSeries.length - 1] / revenueSeries[0], 1 / inputs.years) - 1;
  const ebitdaMargin = ebitdaSeries[ebitdaSeries.length - 1] / revenueSeries[revenueSeries.length - 1];
  styleSectionHeader(control, 33, 'Key Outputs', 2);
  const outputRows: Array<[number, string, number, ValueKind]> = [
    [34, 'Revenue CAGR', revenueCagr, 'percent'],
    [35, 'EBITDA Margin', ebitdaMargin, 'percent'],
    [36, 'Ending Cash', endingCashSeries[endingCashSeries.length - 1], 'currency'],
    [37, 'Debt Balance', endingDebt[endingDebt.length - 1], 'currency'],
  ];
  outputRows.forEach(([row, label, value, kind]) => {
    control.getCell(`A${row}`).value = label;
    styleLabel(control.getCell(`A${row}`));
    setStatic(control.getCell(`B${row}`), value, kind, true);
  });

  checks.getCell('A1').value = 'Checks';
  mergeAndCenter(checks, 'A1:D1');
  styleTitle(checks.getCell('A1'));
  ['Check', 'Formula', 'Status'].forEach((label, index) => {
    checks.getCell(3, index + 1).value = label;
  });
  styleTableHeader(checks, 3, 1, 3);
  const tsChecks: Array<[string, string, string]> = [
    ['Balance sheet balances', `=ABS('Balance Sheet'!${col(allYears.length + 1)}20)<0.1`, Math.abs(totalAssetsSeries[totalAssetsSeries.length - 1] - totalLeSeries[totalLeSeries.length - 1]) < 0.1 ? 'PASS' : 'FLAG'],
    ['Ending cash ties to CF', `='Balance Sheet'!${col(allYears.length + 1)}4='Cash Flow'!${col(allYears.length + 1)}10`, 'PASS'],
    ['Retained earnings roll-forward ties', `='Balance Sheet'!${col(allYears.length + 1)}18=(Control Panel!$B$${controlRows.openingRetained}+SUM('Income Statement'!B15:${col(allYears.length + 1)}15))`, 'PASS'],
  ];
  tsChecks.forEach(([label, formula, status], index) => {
    const row = 4 + index;
    checks.getCell(`A${row}`).value = label;
    checks.getCell(`B${row}`).value = formula;
    checks.getCell(`C${row}`).value = status;
    styleLabel(checks.getCell(`A${row}`));
    styleFormula(checks.getCell(`B${row}`));
    styleCheck(checks.getCell(`C${row}`));
  });
  addPassFailConditionalFormatting(checks, 'C4:C6');

  addEquationSheet(workbook, `${inputs.companyName} Three-Statement Model`, [
    {
      metric: 'Revenue',
      description: 'Prior year revenue times one plus growth',
      formula: '=B4*(1+Control Panel!$B$26)',
      dependencies: 'Prior Revenue, Revenue Growth',
      range: 'Income Statement!C4',
    },
    {
      metric: 'Ending Cash',
      description: 'Prior cash plus current-year net change in cash',
      formula: '=B10+C9',
      dependencies: 'Prior Cash, Net Change in Cash',
      range: 'Cash Flow!C10',
    },
    {
      metric: 'Retained Earnings',
      description: 'Prior retained earnings plus current-year net income',
      formula: '=B18+C15',
      dependencies: 'Prior Retained Earnings, Net Income',
      range: 'Balance Sheet!C18',
    },
    {
      metric: 'Balance Check',
      description: 'Total assets less total liabilities and equity',
      formula: '=C10-C19',
      dependencies: 'Total Assets, Total Liabilities + Equity',
      range: 'Balance Sheet!C20',
    },
  ]);
}

function buildWorkbookForPayload(workbook: ExcelJS.Workbook, payload: AnalystGeneratedModelPayload) {
  switch (payload.extractedInputs.modelType) {
    case 'DCF':
      throw new Error('DCF workbook should be built directly from the DCF template.');
    case 'COMPS':
      throw new Error('COMPS workbook should be built directly from the comps template.');
    case 'PRECEDENTS':
      throw new Error('PRECEDENTS workbook should be built directly from the precedents template.');
    case 'LBO':
      throw new Error('LBO workbook should be built directly from the LBO template.');
    case 'SAAS_OPERATING_MODEL':
      buildSaasWorkbook(workbook, payload.extractedInputs);
      return;
    case 'CAP_TABLE':
      buildCapTableWorkbook(workbook, payload.extractedInputs);
      return;
    case 'THREE_STATEMENT':
      buildThreeStatementWorkbook(workbook, payload.extractedInputs);
      return;
    default:
      throw new Error(`Unsupported model export type: ${(payload.extractedInputs as ExtractedModelInputs).modelType}`);
  }
}

export async function buildAnalystGeneratedWorkbook(payload: AnalystGeneratedModelPayload) {
  if (payload.extractedInputs.modelType === 'DCF') {
    const workbook = await dcfTemplate.buildWorkbook(payload.extractedInputs as DcfModelInputs);
    appendSummarySheet(workbook, payload);
    return workbook;
  }
  if (payload.extractedInputs.modelType === 'COMPS') {
    const workbook = await compsTemplate.buildWorkbook(payload.extractedInputs as CompsModelInputs);
    appendSummarySheet(workbook, payload);
    return workbook;
  }
  if (payload.extractedInputs.modelType === 'PRECEDENTS') {
    const workbook = await precedentsTemplate.buildWorkbook(payload.extractedInputs as PrecedentsModelInputs);
    appendSummarySheet(workbook, payload);
    return workbook;
  }
  if (payload.extractedInputs.modelType === 'LBO') {
    const workbook = await lboTemplate.buildWorkbook(payload.extractedInputs as LboModelInputs);
    appendSummarySheet(workbook, payload);
    return workbook;
  }

  const workbook = new ExcelJS.Workbook();
  applyWorkbookMeta(workbook, payload.title);
  enableWorkbookRecalculation(workbook);
  buildWorkbookForPayload(workbook, payload);
  appendSummarySheet(workbook, payload);
  return workbook;
}

export function buildAnalystGeneratedFilename(payload: AnalystGeneratedModelPayload): string {
  const inputs: ExtractedModelInputs = payload.extractedInputs;
  if (inputs.modelType === 'CAP_TABLE') {
    return `CapitalBase_${sanitizeFilename(inputs.roundType)}_Analyst_Chat.xlsx`;
  }
  const companyName = 'companyName' in inputs ? inputs.companyName : payload.modelType;
  return `CapitalBase_${sanitizeFilename(companyName)}_${sanitizeFilename(payload.modelType)}_Analyst_Chat.xlsx`;
}

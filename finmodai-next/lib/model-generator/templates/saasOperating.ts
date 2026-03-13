import ExcelJS from 'exceljs';
import type { SaasOperatingModelInputs } from '@/lib/model-generator/extractInputs';
import { finalizeChecksSheet, writeCheckRow } from '@/lib/model-generator/excel/checks';
import { addEquationsSheet, type EquationRow } from '@/lib/model-generator/excel/equations';
import {
  applyWorkbookMeta,
  col,
  enableWorkbookRecalculation,
  mergeAndCenter,
  setupSheet,
  styleFormula,
  styleInput,
  styleLabel,
  styleModelMeta,
  styleOutput,
  styleSectionHeader,
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

export function getPreview(inputs: SaasOperatingModelInputs) {
  return {
    title: `${inputs.companyName} SaaS Operating Model`,
    tabs: ['Dashboard', 'Assumptions', 'ARR Bridge', 'Revenue Forecast', 'Unit Economics', 'Hiring & Opex', 'Equations', 'Checks'],
    startingArr: inputs.startingArr,
  };
}

export async function buildWorkbook(inputs: SaasOperatingModelInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  const baseYear = generatedAt.getFullYear() - 1;
  const actualYear = `${baseYear}A`;
  const forecastYears = Array.from({ length: inputs.years }, (_, index) => `${baseYear + index + 1}E`);
  const lastForecastYear = forecastYears[forecastYears.length - 1];
  const equations: EquationRow[] = [];

  applyWorkbookMeta(workbook, `${inputs.companyName} SaaS Operating Model`);
  enableWorkbookRecalculation(workbook);

  const dashboardSheet = workbook.addWorksheet('Dashboard');
  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  const arrSheet = workbook.addWorksheet('ARR Bridge');
  const revenueSheet = workbook.addWorksheet('Revenue Forecast');
  const unitSheet = workbook.addWorksheet('Unit Economics');
  const hiringSheet = workbook.addWorksheet('Hiring & Opex');
  const checksSheet = workbook.addWorksheet('Checks');

  setupSheet(dashboardSheet, { freezeRows: 2, freezeCols: 0, tabColor: 'FF1D4ED8', columnWidths: [30, 18, 18, 18, 22, 18] });
  setupSheet(assumptionsSheet, { freezeRows: 4, freezeCols: 1, tabColor: 'FF2563EB', columnWidths: [30, 18, 18, 18, 18, 18] });
  setupSheet(arrSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF0F766E', columnWidths: [28, 18, 14, 14, 14, 14, 14] });
  setupSheet(revenueSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF047857', columnWidths: [28, 18, 14, 14, 14, 14, 14] });
  setupSheet(unitSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF2563EB', columnWidths: [28, 18, 14, 14, 14, 14, 14] });
  setupSheet(hiringSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF7C3AED', columnWidths: [30, 18, 14, 14, 14, 14, 14] });
  setupSheet(checksSheet, { freezeRows: 3, freezeCols: 1, tabColor: 'FFB45309', columnWidths: [30, 16, 36, 18] });

  assumptionsSheet.getCell('A1').value = `${inputs.companyName} SaaS Assumptions`;
  mergeAndCenter(assumptionsSheet, 'A1:F1');
  styleTitle(assumptionsSheet.getCell('A1'));
  styleModelMeta(assumptionsSheet, 3, 'Company', inputs.companyName);
  styleModelMeta(assumptionsSheet, 4, 'Generated', formatDate(generatedAt));
  styleModelMeta(assumptionsSheet, 5, 'Source', inputs.source);

  styleSectionHeader(assumptionsSheet, 7, 'Operating Assumptions', 4);
  [
    ['Forecast years', inputs.years, 'number'],
    ['Starting ARR', inputs.startingArr, 'currency'],
    ['New ARR growth', inputs.growthRate, 'percent'],
    ['Gross churn', inputs.churn, 'percent'],
    ['Expansion / upsell rate', Math.min(inputs.growthRate * 0.22, 0.12), 'percent'],
    ['Gross margin', inputs.grossMargin, 'percent'],
    ['CAC', inputs.cac, 'currency'],
    ['ARPU', inputs.arpu, 'currency'],
    ['Sales productivity (ARR / rep)', 650000, 'currency'],
    ['S&M opex % revenue', 0.22, 'percent'],
    ['R&D opex % revenue', 0.14, 'percent'],
    ['G&A opex % revenue', 0.1, 'percent'],
    ['Average fully-loaded salary', 165000, 'currency'],
  ].forEach(([label, value, kind], index) => {
    const row = 8 + index;
    assumptionsSheet.getCell(`A${row}`).value = label;
    assumptionsSheet.getCell(`B${row}`).value = value;
    styleLabel(assumptionsSheet.getCell(`A${row}`));
    styleInput(assumptionsSheet.getCell(`B${row}`), kind as 'number' | 'currency' | 'percent');
  });

  defineNamedCells(workbook, assumptionsSheet, [
    { name: 'ForecastYears', cellRef: 'B8' },
    { name: 'StartingARR', cellRef: 'B9' },
    { name: 'NewARRGrowth', cellRef: 'B10' },
    { name: 'ChurnRate', cellRef: 'B11' },
    { name: 'ExpansionRate', cellRef: 'B12' },
    { name: 'GrossMargin', cellRef: 'B13' },
    { name: 'CAC', cellRef: 'B14' },
    { name: 'ARPU', cellRef: 'B15' },
    { name: 'SalesProductivity', cellRef: 'B16' },
    { name: 'SMPct', cellRef: 'B17' },
    { name: 'RDPct', cellRef: 'B18' },
    { name: 'GAPct', cellRef: 'B19' },
    { name: 'AverageSalary', cellRef: 'B20' },
  ]);

  arrSheet.getCell('A1').value = 'ARR Bridge';
  mergeAndCenter(arrSheet, 'A1:G1');
  styleTitle(arrSheet.getCell('A1'));
  styleTableHeader(arrSheet, 4, 1, 2 + inputs.years);
  arrSheet.getCell('A4').value = 'Line Item';
  arrSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    arrSheet.getCell(4, 3 + index).value = year;
  });
  const arrRows = {
    beginningArr: 5,
    newArr: 6,
    churnedArr: 7,
    expansionArr: 8,
    endingArr: 9,
    customers: 10,
    netNewCustomers: 11,
  } as const;
  [
    [arrRows.beginningArr, 'Beginning ARR'],
    [arrRows.newArr, 'New ARR'],
    [arrRows.churnedArr, 'Churned ARR'],
    [arrRows.expansionArr, 'Expansion ARR'],
    [arrRows.endingArr, 'Ending ARR'],
    [arrRows.customers, 'Ending customers'],
    [arrRows.netNewCustomers, 'Net new customers'],
  ].forEach(([row, label]) => {
    arrSheet.getCell(`A${row}`).value = label;
    styleLabel(arrSheet.getCell(`A${row}`));
  });

  let previousEndingArrName = 'StartingARR';
  let previousCustomerRef = 'B10';
  [actualYear, ...forecastYears].forEach((year, index) => {
    const letter = col(2 + index);
    const endingArrName = yearName('EndingARR', year);
    arrSheet.getCell(`${letter}${arrRows.beginningArr}`).value = index === 0 ? { formula: '=StartingARR' } : { formula: `=${previousEndingArrName}` };
    arrSheet.getCell(`${letter}${arrRows.newArr}`).value = index === 0 ? 0 : { formula: `=${letter}${arrRows.beginningArr}*NewARRGrowth` };
    arrSheet.getCell(`${letter}${arrRows.churnedArr}`).value = index === 0 ? 0 : { formula: `=-${letter}${arrRows.beginningArr}*ChurnRate` };
    arrSheet.getCell(`${letter}${arrRows.expansionArr}`).value = index === 0 ? 0 : { formula: `=${letter}${arrRows.beginningArr}*ExpansionRate` };
    arrSheet.getCell(`${letter}${arrRows.endingArr}`).value =
      index === 0
        ? { formula: '=StartingARR' }
        : { formula: `=${letter}${arrRows.beginningArr}+${letter}${arrRows.newArr}+${letter}${arrRows.churnedArr}+${letter}${arrRows.expansionArr}` };
    arrSheet.getCell(`${letter}${arrRows.customers}`).value = { formula: `=${endingArrName}/ARPU` };
    arrSheet.getCell(`${letter}${arrRows.netNewCustomers}`).value = index === 0 ? 0 : { formula: `=${letter}${arrRows.customers}-${previousCustomerRef}` };
    [arrRows.beginningArr, arrRows.newArr, arrRows.churnedArr, arrRows.expansionArr].forEach((row) =>
      styleFormula(arrSheet.getCell(`${letter}${row}`), 'currency')
    );
    styleOutput(arrSheet.getCell(`${letter}${arrRows.endingArr}`), 'currency');
    styleFormula(arrSheet.getCell(`${letter}${arrRows.customers}`), 'number');
    styleFormula(arrSheet.getCell(`${letter}${arrRows.netNewCustomers}`), 'number');
    defineNamedCell(workbook, endingArrName, arrSheet, `${letter}${arrRows.endingArr}`);
    previousEndingArrName = endingArrName;
    previousCustomerRef = `${letter}${arrRows.customers}`;
    if (index > 0) {
      equations.push({
        metric: `ARR bridge ${year}`,
        description: 'Beginning ARR plus new ARR plus expansion ARR less churn.',
        excelFormula: `=${letter}${arrRows.beginningArr}+${letter}${arrRows.newArr}+${letter}${arrRows.churnedArr}+${letter}${arrRows.expansionArr}`,
        dependencies: `${letter}${arrRows.beginningArr}, ${letter}${arrRows.newArr}, ${letter}${arrRows.churnedArr}, ${letter}${arrRows.expansionArr}`,
        location: `'ARR Bridge'!${letter}${arrRows.endingArr}`,
      });
    }
  });
  styleTotal(arrSheet, arrRows.endingArr, 1, 2 + inputs.years);

  revenueSheet.getCell('A1').value = 'Revenue Forecast';
  mergeAndCenter(revenueSheet, 'A1:G1');
  styleTitle(revenueSheet.getCell('A1'));
  styleTableHeader(revenueSheet, 4, 1, 2 + inputs.years);
  revenueSheet.getCell('A4').value = 'Line Item';
  revenueSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    revenueSheet.getCell(4, 3 + index).value = year;
  });
  const revenueRows = {
    beginningArr: 5,
    endingArr: 6,
    subscriptionRevenue: 7,
    growth: 8,
    grossProfit: 9,
    smOpex: 10,
    rdOpex: 11,
    gaOpex: 12,
    ebitda: 13,
  } as const;
  [
    [revenueRows.beginningArr, 'Beginning ARR'],
    [revenueRows.endingArr, 'Ending ARR'],
    [revenueRows.subscriptionRevenue, 'Subscription Revenue'],
    [revenueRows.growth, 'Topline Growth'],
    [revenueRows.grossProfit, 'Gross Profit'],
    [revenueRows.smOpex, 'S&M Opex'],
    [revenueRows.rdOpex, 'R&D Opex'],
    [revenueRows.gaOpex, 'G&A Opex'],
    [revenueRows.ebitda, 'EBITDA'],
  ].forEach(([row, label]) => {
    revenueSheet.getCell(`A${row}`).value = label;
    styleLabel(revenueSheet.getCell(`A${row}`));
  });
  let previousRevenueRef = `B${revenueRows.subscriptionRevenue}`;
  [actualYear, ...forecastYears].forEach((year, index) => {
    const letter = col(2 + index);
    const endingArrName = yearName('EndingARR', year);
    revenueSheet.getCell(`${letter}${revenueRows.beginningArr}`).value = { formula: `='ARR Bridge'!${letter}${arrRows.beginningArr}` };
    revenueSheet.getCell(`${letter}${revenueRows.endingArr}`).value = { formula: `=${endingArrName}` };
    revenueSheet.getCell(`${letter}${revenueRows.subscriptionRevenue}`).value =
      index === 0
        ? { formula: `=${endingArrName}` }
        : { formula: `=(${letter}${revenueRows.beginningArr}+${letter}${revenueRows.endingArr})/2` };
    revenueSheet.getCell(`${letter}${revenueRows.growth}`).value =
      index === 0 ? { formula: '=NewARRGrowth' } : { formula: `=${letter}${revenueRows.subscriptionRevenue}/${previousRevenueRef}-1` };
    revenueSheet.getCell(`${letter}${revenueRows.grossProfit}`).value = { formula: `=${letter}${revenueRows.subscriptionRevenue}*GrossMargin` };
    revenueSheet.getCell(`${letter}${revenueRows.smOpex}`).value = { formula: `=-${letter}${revenueRows.subscriptionRevenue}*SMPct` };
    revenueSheet.getCell(`${letter}${revenueRows.rdOpex}`).value = { formula: `=-${letter}${revenueRows.subscriptionRevenue}*RDPct` };
    revenueSheet.getCell(`${letter}${revenueRows.gaOpex}`).value = { formula: `=-${letter}${revenueRows.subscriptionRevenue}*GAPct` };
    revenueSheet.getCell(`${letter}${revenueRows.ebitda}`).value = {
      formula: `=${letter}${revenueRows.grossProfit}+${letter}${revenueRows.smOpex}+${letter}${revenueRows.rdOpex}+${letter}${revenueRows.gaOpex}`,
    };
    [revenueRows.beginningArr, revenueRows.endingArr, revenueRows.subscriptionRevenue, revenueRows.grossProfit, revenueRows.smOpex, revenueRows.rdOpex, revenueRows.gaOpex].forEach((row) =>
      styleFormula(revenueSheet.getCell(`${letter}${row}`), 'currency')
    );
    styleFormula(revenueSheet.getCell(`${letter}${revenueRows.growth}`), 'percent');
    styleOutput(revenueSheet.getCell(`${letter}${revenueRows.ebitda}`), 'currency');
    previousRevenueRef = `${letter}${revenueRows.subscriptionRevenue}`;
  });
  styleSubTotal(revenueSheet, revenueRows.grossProfit, 1, 2 + inputs.years);
  styleTotal(revenueSheet, revenueRows.ebitda, 1, 2 + inputs.years);

  unitSheet.getCell('A1').value = 'Unit Economics';
  mergeAndCenter(unitSheet, 'A1:G1');
  styleTitle(unitSheet.getCell('A1'));
  styleTableHeader(unitSheet, 4, 1, 2 + inputs.years);
  unitSheet.getCell('A4').value = 'Line Item';
  unitSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    unitSheet.getCell(4, 3 + index).value = year;
  });
  const unitRows = {
    customers: 5,
    cac: 6,
    gpPerCustomer: 7,
    ltv: 8,
    payback: 9,
    ltvCac: 10,
  } as const;
  [
    [unitRows.customers, 'Customers'],
    [unitRows.cac, 'CAC'],
    [unitRows.gpPerCustomer, 'Gross Profit / Customer'],
    [unitRows.ltv, 'LTV'],
    [unitRows.payback, 'CAC Payback (months)'],
    [unitRows.ltvCac, 'LTV : CAC'],
  ].forEach(([row, label]) => {
    unitSheet.getCell(`A${row}`).value = label;
    styleLabel(unitSheet.getCell(`A${row}`));
  });
  [actualYear, ...forecastYears].forEach((year, index) => {
    const letter = col(2 + index);
    unitSheet.getCell(`${letter}${unitRows.customers}`).value = { formula: `='ARR Bridge'!${letter}${arrRows.customers}` };
    unitSheet.getCell(`${letter}${unitRows.cac}`).value = { formula: '=CAC' };
    unitSheet.getCell(`${letter}${unitRows.gpPerCustomer}`).value = { formula: '=ARPU*GrossMargin' };
    unitSheet.getCell(`${letter}${unitRows.ltv}`).value = { formula: '=IF(ChurnRate>0,ARPU*GrossMargin/ChurnRate,"")' };
    unitSheet.getCell(`${letter}${unitRows.payback}`).value = { formula: `=IF(${letter}${unitRows.gpPerCustomer}>0,CAC/(${letter}${unitRows.gpPerCustomer}/12),"")` };
    unitSheet.getCell(`${letter}${unitRows.ltvCac}`).value = { formula: `=IF(CAC>0,${letter}${unitRows.ltv}/CAC,"")` };
    styleFormula(unitSheet.getCell(`${letter}${unitRows.customers}`), 'number');
    styleInput(unitSheet.getCell(`${letter}${unitRows.cac}`), 'currency');
    styleFormula(unitSheet.getCell(`${letter}${unitRows.gpPerCustomer}`), 'currency');
    styleFormula(unitSheet.getCell(`${letter}${unitRows.ltv}`), 'currency');
    styleOutput(unitSheet.getCell(`${letter}${unitRows.payback}`), 'number');
    styleOutput(unitSheet.getCell(`${letter}${unitRows.ltvCac}`), 'multiple');
    if (index > 0) {
      equations.push({
        metric: `LTV:CAC ${year}`,
        description: 'Lifetime value divided by customer acquisition cost.',
        excelFormula: `=${letter}${unitRows.ltv}/CAC`,
        dependencies: `${letter}${unitRows.ltv}, CAC`,
        location: `'Unit Economics'!${letter}${unitRows.ltvCac}`,
      });
    }
  });
  styleTotal(unitSheet, unitRows.ltvCac, 1, 2 + inputs.years);

  hiringSheet.getCell('A1').value = 'Hiring and Opex';
  mergeAndCenter(hiringSheet, 'A1:G1');
  styleTitle(hiringSheet.getCell('A1'));
  styleTableHeader(hiringSheet, 4, 1, 2 + inputs.years);
  hiringSheet.getCell('A4').value = 'Line Item';
  hiringSheet.getCell('B4').value = actualYear;
  forecastYears.forEach((year, index) => {
    hiringSheet.getCell(4, 3 + index).value = year;
  });
  const hiringRows = {
    salesReps: 5,
    salesPayroll: 6,
    rdHeadcount: 7,
    rdPayroll: 8,
    gaHeadcount: 9,
    gaPayroll: 10,
    totalPayroll: 11,
  } as const;
  [
    [hiringRows.salesReps, 'Sales headcount'],
    [hiringRows.salesPayroll, 'Sales payroll'],
    [hiringRows.rdHeadcount, 'R&D headcount'],
    [hiringRows.rdPayroll, 'R&D payroll'],
    [hiringRows.gaHeadcount, 'G&A headcount'],
    [hiringRows.gaPayroll, 'G&A payroll'],
    [hiringRows.totalPayroll, 'Total payroll'],
  ].forEach(([row, label]) => {
    hiringSheet.getCell(`A${row}`).value = label;
    styleLabel(hiringSheet.getCell(`A${row}`));
  });
  [actualYear, ...forecastYears].forEach((year, index) => {
    const letter = col(2 + index);
    const revenueRef = `'Revenue Forecast'!${letter}${revenueRows.subscriptionRevenue}`;
    hiringSheet.getCell(`${letter}${hiringRows.salesReps}`).value = { formula: `=ROUNDUP(${revenueRef}/SalesProductivity,0)` };
    hiringSheet.getCell(`${letter}${hiringRows.salesPayroll}`).value = { formula: `=${letter}${hiringRows.salesReps}*AverageSalary` };
    hiringSheet.getCell(`${letter}${hiringRows.rdHeadcount}`).value = { formula: `=ROUNDUP((${revenueRef}*RDPct)/AverageSalary,0)` };
    hiringSheet.getCell(`${letter}${hiringRows.rdPayroll}`).value = { formula: `=${letter}${hiringRows.rdHeadcount}*AverageSalary` };
    hiringSheet.getCell(`${letter}${hiringRows.gaHeadcount}`).value = { formula: `=ROUNDUP((${revenueRef}*GAPct)/AverageSalary,0)` };
    hiringSheet.getCell(`${letter}${hiringRows.gaPayroll}`).value = { formula: `=${letter}${hiringRows.gaHeadcount}*AverageSalary` };
    hiringSheet.getCell(`${letter}${hiringRows.totalPayroll}`).value = {
      formula: `=${letter}${hiringRows.salesPayroll}+${letter}${hiringRows.rdPayroll}+${letter}${hiringRows.gaPayroll}`,
    };
    [hiringRows.salesReps, hiringRows.rdHeadcount, hiringRows.gaHeadcount].forEach((row) =>
      styleFormula(hiringSheet.getCell(`${letter}${row}`), 'number')
    );
    [hiringRows.salesPayroll, hiringRows.rdPayroll, hiringRows.gaPayroll].forEach((row) =>
      styleFormula(hiringSheet.getCell(`${letter}${row}`), 'currency')
    );
    styleOutput(hiringSheet.getCell(`${letter}${hiringRows.totalPayroll}`), 'currency');
  });
  styleTotal(hiringSheet, hiringRows.totalPayroll, 1, 2 + inputs.years);

  dashboardSheet.getCell('A1').value = `${inputs.companyName} SaaS Dashboard`;
  mergeAndCenter(dashboardSheet, 'A1:F1');
  styleTitle(dashboardSheet.getCell('A1'));
  styleModelMeta(dashboardSheet, 3, 'Company', inputs.companyName);
  styleModelMeta(dashboardSheet, 4, 'Generated', formatDate(generatedAt));
  styleModelMeta(dashboardSheet, 5, 'Lens', 'Recurring revenue and unit economics');

  styleSectionHeader(dashboardSheet, 7, 'Topline Summary', 5);
  dashboardSheet.getCell('A8').value = 'Starting ARR';
  dashboardSheet.getCell('B8').value = { formula: '=StartingARR' };
  dashboardSheet.getCell('A9').value = 'Ending ARR';
  dashboardSheet.getCell('B9').value = { formula: `=${yearName('EndingARR', lastForecastYear)}` };
  dashboardSheet.getCell('A10').value = 'ARR CAGR';
  dashboardSheet.getCell('B10').value = { formula: `=(B9/B8)^(1/${inputs.years})-1` };
  dashboardSheet.getCell('D8').value = 'Gross Margin';
  dashboardSheet.getCell('E8').value = { formula: '=GrossMargin' };
  dashboardSheet.getCell('D9').value = 'Churn';
  dashboardSheet.getCell('E9').value = { formula: '=ChurnRate' };
  dashboardSheet.getCell('D10').value = 'LTV : CAC';
  dashboardSheet.getCell('E10').value = { formula: `AVERAGE('Unit Economics'!C10:${col(2 + inputs.years)}10)` };
  dashboardSheet.getCell('D11').value = 'CAC Payback';
  dashboardSheet.getCell('E11').value = { formula: `AVERAGE('Unit Economics'!C9:${col(2 + inputs.years)}9)` };
  ['A8', 'A9', 'A10', 'D8', 'D9', 'D10', 'D11'].forEach((ref) => styleLabel(dashboardSheet.getCell(ref)));
  styleOutput(dashboardSheet.getCell('B8'), 'currency');
  styleOutput(dashboardSheet.getCell('B9'), 'currency');
  styleOutput(dashboardSheet.getCell('B10'), 'percent');
  styleOutput(dashboardSheet.getCell('E8'), 'percent');
  styleOutput(dashboardSheet.getCell('E9'), 'percent');
  styleOutput(dashboardSheet.getCell('E10'), 'multiple');
  styleOutput(dashboardSheet.getCell('E11'), 'number');
  styleThinGrid(dashboardSheet, 8, 10, 1, 2);
  styleThinGrid(dashboardSheet, 8, 11, 4, 5);

  styleSectionHeader(dashboardSheet, 13, 'ARR Composition Snapshot', 5);
  dashboardSheet.getCell('A14').value = 'Beginning ARR';
  dashboardSheet.getCell('B14').value = { formula: `='ARR Bridge'!${col(2 + inputs.years)}5` };
  dashboardSheet.getCell('A15').value = 'New ARR';
  dashboardSheet.getCell('B15').value = { formula: `='ARR Bridge'!${col(2 + inputs.years)}6` };
  dashboardSheet.getCell('A16').value = 'Churned ARR';
  dashboardSheet.getCell('B16').value = { formula: `='ARR Bridge'!${col(2 + inputs.years)}7` };
  dashboardSheet.getCell('A17').value = 'Expansion ARR';
  dashboardSheet.getCell('B17').value = { formula: `='ARR Bridge'!${col(2 + inputs.years)}8` };
  dashboardSheet.getCell('A18').value = 'Ending ARR';
  dashboardSheet.getCell('B18').value = { formula: `='ARR Bridge'!${col(2 + inputs.years)}9` };
  ['A14', 'A15', 'A16', 'A17', 'A18'].forEach((ref) => styleLabel(dashboardSheet.getCell(ref)));
  ['B14', 'B15', 'B16', 'B17'].forEach((ref) => styleFormula(dashboardSheet.getCell(ref), 'currency'));
  styleOutput(dashboardSheet.getCell('B18'), 'currency');

  styleSectionHeader(dashboardSheet, 13, 'Forecast Snapshot', 7);
  styleTableHeader(dashboardSheet, 14, 4, 6);
  dashboardSheet.getCell('D14').value = 'Metric';
  dashboardSheet.getCell('E14').value = `${forecastYears[0]}`;
  dashboardSheet.getCell('F14').value = `${lastForecastYear}`;
  dashboardSheet.getCell('D15').value = 'ARR';
  dashboardSheet.getCell('D16').value = 'Revenue';
  dashboardSheet.getCell('D17').value = 'EBITDA';
  dashboardSheet.getCell('D18').value = 'Customers';
  ['D15', 'D16', 'D17', 'D18'].forEach((ref) => styleLabel(dashboardSheet.getCell(ref)));
  dashboardSheet.getCell('E15').value = { formula: `=${yearName('EndingARR', forecastYears[0])}` };
  dashboardSheet.getCell('F15').value = { formula: `=${yearName('EndingARR', lastForecastYear)}` };
  dashboardSheet.getCell('E16').value = { formula: `='Revenue Forecast'!C7` };
  dashboardSheet.getCell('F16').value = { formula: `='Revenue Forecast'!${col(2 + inputs.years)}7` };
  dashboardSheet.getCell('E17').value = { formula: `='Revenue Forecast'!C13` };
  dashboardSheet.getCell('F17').value = { formula: `='Revenue Forecast'!${col(2 + inputs.years)}13` };
  dashboardSheet.getCell('E18').value = { formula: `='ARR Bridge'!C10` };
  dashboardSheet.getCell('F18').value = { formula: `='ARR Bridge'!${col(2 + inputs.years)}10` };
  ['E15', 'F15', 'E16', 'F16', 'E17', 'F17'].forEach((ref) => styleFormula(dashboardSheet.getCell(ref), 'currency'));
  ['E18', 'F18'].forEach((ref) => styleFormula(dashboardSheet.getCell(ref), 'number'));
  styleThinGrid(dashboardSheet, 14, 18, 4, 6);

  styleSectionHeader(dashboardSheet, 21, 'Unit Economics Snapshot', 5);
  dashboardSheet.getCell('A22').value = 'ARPU';
  dashboardSheet.getCell('B22').value = { formula: '=ARPU' };
  dashboardSheet.getCell('A23').value = 'CAC';
  dashboardSheet.getCell('B23').value = { formula: '=CAC' };
  dashboardSheet.getCell('A24').value = 'Gross Profit / Customer';
  dashboardSheet.getCell('B24').value = { formula: `='Unit Economics'!${col(2 + inputs.years)}7` };
  dashboardSheet.getCell('A25').value = 'LTV';
  dashboardSheet.getCell('B25').value = { formula: `='Unit Economics'!${col(2 + inputs.years)}8` };
  dashboardSheet.getCell('A26').value = 'CAC Payback';
  dashboardSheet.getCell('B26').value = { formula: `='Unit Economics'!${col(2 + inputs.years)}9` };
  ['A22', 'A23', 'A24', 'A25', 'A26'].forEach((ref) => styleLabel(dashboardSheet.getCell(ref)));
  ['B22', 'B23', 'B24', 'B25'].forEach((ref) => styleOutput(dashboardSheet.getCell(ref), 'currency'));
  styleOutput(dashboardSheet.getCell('B26'), 'number');
  styleThinGrid(dashboardSheet, 22, 26, 1, 2);

  equations.push(
    {
      metric: 'Subscription revenue',
      description: 'Average of beginning and ending ARR as a simple annualized revenue proxy.',
      excelFormula: '=(BeginningARR+EndingARR)/2',
      dependencies: 'BeginningARR, EndingARR',
      location: `'Revenue Forecast'!C7:${col(2 + inputs.years)}7`,
    },
    {
      metric: 'CAC payback',
      description: 'CAC divided by monthly gross profit per customer.',
      excelFormula: '=CAC/((ARPU*GrossMargin)/12)',
      dependencies: 'CAC, ARPU, GrossMargin',
      location: `'Unit Economics'!C9:${col(2 + inputs.years)}9`,
    }
  );

  checksSheet.getCell('A1').value = 'Checks';
  mergeAndCenter(checksSheet, 'A1:D1');
  styleTitle(checksSheet.getCell('A1'));
  styleTableHeader(checksSheet, 3, 1, 3);
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Result';
  checksSheet.getCell('C3').value = 'Commentary';
  writeCheckRow(checksSheet, 4, 'Gross margin in range', 'IF(AND(GrossMargin>0,GrossMargin<1),"PASS","FLAG")', 'Gross margin should be between 0% and 100%.');
  writeCheckRow(checksSheet, 5, 'Churn in range', 'IF(AND(ChurnRate>=0,ChurnRate<0.25),"PASS","FLAG")', 'Flags churn rates above 25%.');
  writeCheckRow(checksSheet, 6, 'ARR bridge ties', `IF(MAX(ABS('ARR Bridge'!$C$9-('ARR Bridge'!$C$5+'ARR Bridge'!$C$6+'ARR Bridge'!$C$7+'ARR Bridge'!$C$8)),ABS('ARR Bridge'!$D$9-('ARR Bridge'!$D$5+'ARR Bridge'!$D$6+'ARR Bridge'!$D$7+'ARR Bridge'!$D$8)),ABS('ARR Bridge'!$E$9-('ARR Bridge'!$E$5+'ARR Bridge'!$E$6+'ARR Bridge'!$E$7+'ARR Bridge'!$E$8)),ABS('ARR Bridge'!$F$9-('ARR Bridge'!$F$5+'ARR Bridge'!$F$6+'ARR Bridge'!$F$7+'ARR Bridge'!$F$8)),ABS('ARR Bridge'!$G$9-('ARR Bridge'!$G$5+'ARR Bridge'!$G$6+'ARR Bridge'!$G$7+'ARR Bridge'!$G$8)))<0.5,"PASS","FLAG")`, 'Ending ARR should reconcile to the ARR bridge.');
  writeCheckRow(checksSheet, 7, 'CAC payback under 36 months', `IF(MAX('Unit Economics'!$C$9,'Unit Economics'!$D$9,'Unit Economics'!$E$9,'Unit Economics'!$F$9,'Unit Economics'!$G$9)<36,"PASS","FLAG")`, 'Flags long CAC payback profiles.');
  styleThinGrid(checksSheet, 4, 7, 1, 3);
  finalizeChecksSheet(checksSheet, 4, 7);

  addEquationsSheet(workbook, `${inputs.companyName} SaaS Operating Model`, equations);

  return workbook;
}

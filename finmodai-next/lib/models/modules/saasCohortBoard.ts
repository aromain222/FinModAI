import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
  configureWorkbookForRecalc,
  protectSheetIfConfigured,
  setCurrency,
  setInputCell,
  setOutputCell,
  setPercent,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';

export const SaasCohortBoardInputSchema = z.object({
  forecast_months: z.number().int().min(12).max(60).default(24),
  starting_arr: z.number().nonnegative(),
  new_arr_per_month: z.number().nonnegative(),
  logo_churn_pct: z.number().min(0).max(0.2).default(0.02),
  dollar_churn_pct: z.number().min(0).max(0.3).default(0.015),
  expansion_pct: z.number().min(0).max(0.3).default(0.02),
  gross_margin_pct: z.number().min(0).max(1),
  cac: z.number().nonnegative(),
  arpu_monthly: z.number().positive(),
  sales_cycle_months: z.number().min(0).max(24).default(3),
});

type SaasCohortBoardInput = z.infer<typeof SaasCohortBoardInputSchema>;

type ArrRow = {
  month: number;
  arrOpen: number;
  churnLoss: number;
  expansion: number;
  newArr: number;
  arrClose: number;
};

type SaasCohortBoardOutput = {
  arrRows: ArrRow[];
  nrr: number;
  grr: number;
  ltv: number;
  paybackMonths: number;
  ltvToCac: number;
  cohortGrid: number[][];
};

const saasCohortBoardUiSchema: UISchema = {
  sections: [
    {
      title: 'Core Inputs',
      fields: [
        { key: 'forecast_months', label: 'Forecast Months', type: 'number', required: true, defaultValue: 24 },
        { key: 'starting_arr', label: 'Starting ARR', type: 'currency', required: true, defaultValue: 12000000 },
        { key: 'new_arr_per_month', label: 'New ARR / Month', type: 'currency', required: true, defaultValue: 350000 },
        { key: 'logo_churn_pct', label: 'Logo Churn %', type: 'percent', required: true, defaultValue: 0.02 },
        { key: 'dollar_churn_pct', label: '$ Churn %', type: 'percent', required: true, defaultValue: 0.015 },
        { key: 'expansion_pct', label: 'Expansion %', type: 'percent', required: true, defaultValue: 0.02 },
        { key: 'gross_margin_pct', label: 'Gross Margin %', type: 'percent', required: true, defaultValue: 0.78 },
        { key: 'cac', label: 'CAC', type: 'currency', required: true, defaultValue: 9000 },
        { key: 'arpu_monthly', label: 'ARPU (monthly)', type: 'currency', required: true, defaultValue: 150 },
        { key: 'sales_cycle_months', label: 'Sales Cycle (months)', type: 'number', required: true, defaultValue: 3 },
      ],
    },
  ],
};

function computeSaasCohortBoard(input: SaasCohortBoardInput): SaasCohortBoardOutput {
  let arrOpen = input.starting_arr;
  const rows: ArrRow[] = [];
  for (let month = 1; month <= input.forecast_months; month += 1) {
    const churnLoss = arrOpen * input.dollar_churn_pct;
    const expansion = arrOpen * input.expansion_pct;
    const newArr = input.new_arr_per_month;
    const arrClose = arrOpen - churnLoss + expansion + newArr;
    rows.push({ month, arrOpen, churnLoss, expansion, newArr, arrClose });
    arrOpen = arrClose;
  }

  const grr = 1 - input.dollar_churn_pct;
  const nrr = 1 - input.dollar_churn_pct + input.expansion_pct;
  const netChurn = Math.max(0.001, input.dollar_churn_pct - input.expansion_pct);
  const ltv = (input.arpu_monthly * input.gross_margin_pct) / netChurn;
  const paybackMonths = input.cac / (input.arpu_monthly * input.gross_margin_pct);
  const ltvToCac = input.cac > 0 ? ltv / input.cac : 0;

  const cohortGrid: number[][] = [];
  for (let cohort = 0; cohort < 12; cohort += 1) {
    const row: number[] = [];
    for (let m = 0; m <= 12; m += 1) {
      row.push(Math.pow(1 - input.logo_churn_pct, m));
    }
    cohortGrid.push(row);
  }

  return {
    arrRows: rows,
    nrr,
    grr,
    ltv,
    paybackMonths,
    ltvToCac,
    cohortGrid,
  };
}

async function buildSaasCohortBoardWorkbook(
  input: SaasCohortBoardInput,
  output: SaasCohortBoardOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const inputsSheet = workbook.addWorksheet('Cohort Inputs');
  inputsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  inputsSheet.getColumn(1).width = 34;
  inputsSheet.getColumn(2).width = 18;
  inputsSheet.getCell('A1').value = 'SaaS Cohort Inputs';
  inputsSheet.getCell('A1').font = { bold: true, size: 14 };
  inputsSheet.getCell('A3').value = 'Input';
  inputsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(inputsSheet, 3, 1, 2);
  const inputRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Forecast Months', input.forecast_months, 'number'],
    ['Starting ARR', input.starting_arr, 'currency'],
    ['New ARR / Month', input.new_arr_per_month, 'currency'],
    ['Logo Churn %', input.logo_churn_pct, 'percent'],
    ['$ Churn %', input.dollar_churn_pct, 'percent'],
    ['Expansion %', input.expansion_pct, 'percent'],
    ['Gross Margin %', input.gross_margin_pct, 'percent'],
    ['CAC', input.cac, 'currency'],
    ['ARPU Monthly', input.arpu_monthly, 'currency'],
    ['Sales Cycle Months', input.sales_cycle_months, 'number'],
  ];
  inputRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    inputsSheet.getCell(row, 1).value = label;
    inputsSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(inputsSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(inputsSheet.getCell(row, 2));
    setInputCell(inputsSheet.getCell(row, 2));
    setOutputCell(inputsSheet.getCell(row, 1));
  });
  styleGrid(inputsSheet, 3, 13, 1, 2);

  const cohortSheet = workbook.addWorksheet('Cohort Retention Grid');
  cohortSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 2 }];
  cohortSheet.getColumn(1).width = 14;
  for (let col = 2; col <= 14; col += 1) cohortSheet.getColumn(col).width = 11;
  cohortSheet.getCell('A1').value = 'Cohort Retention Grid';
  cohortSheet.getCell('A1').font = { bold: true, size: 14 };
  cohortSheet.getCell('A3').value = 'Cohort';
  for (let m = 0; m <= 12; m += 1) cohortSheet.getCell(3, 2 + m).value = `M${m}`;
  styleHeaderRow(cohortSheet, 3, 1, 14);
  output.cohortGrid.forEach((row, rowIdx) => {
    const excelRow = 4 + rowIdx;
    cohortSheet.getCell(excelRow, 1).value = `C${rowIdx + 1}`;
    setOutputCell(cohortSheet.getCell(excelRow, 1));
    row.forEach((val, colIdx) => {
      cohortSheet.getCell(excelRow, 2 + colIdx).value = val;
      setPercent(cohortSheet.getCell(excelRow, 2 + colIdx));
      setOutputCell(cohortSheet.getCell(excelRow, 2 + colIdx));
    });
  });
  styleGrid(cohortSheet, 3, 15, 1, 14);

  const arrSheet = workbook.addWorksheet('ARR Bridge');
  arrSheet.views = [{ state: 'frozen', ySplit: 3 }];
  arrSheet.columns = [{ width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  arrSheet.getCell('A1').value = 'ARR Bridge';
  arrSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Month', 'ARR Open', 'Churn', 'Expansion', 'New ARR', 'ARR Close'].forEach((header, idx) => {
    arrSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(arrSheet, 3, 1, 6);
  output.arrRows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    arrSheet.getCell(excelRow, 1).value = row.month;
    arrSheet.getCell(excelRow, 2).value = row.arrOpen;
    arrSheet.getCell(excelRow, 3).value = -row.churnLoss;
    arrSheet.getCell(excelRow, 4).value = row.expansion;
    arrSheet.getCell(excelRow, 5).value = row.newArr;
    arrSheet.getCell(excelRow, 6).value = row.arrClose;
    for (let c = 2; c <= 6; c += 1) {
      setCurrency(arrSheet.getCell(excelRow, c));
      setOutputCell(arrSheet.getCell(excelRow, c));
    }
    setOutputCell(arrSheet.getCell(excelRow, 1));
  });
  styleGrid(arrSheet, 3, 3 + output.arrRows.length, 1, 6);

  const cacSheet = workbook.addWorksheet('CAC + Payback');
  cacSheet.views = [{ state: 'frozen', ySplit: 3 }];
  cacSheet.getColumn(1).width = 34;
  cacSheet.getColumn(2).width = 18;
  cacSheet.getCell('A1').value = 'CAC + Payback';
  cacSheet.getCell('A1').font = { bold: true, size: 14 };
  cacSheet.getCell('A3').value = 'Metric';
  cacSheet.getCell('B3').value = 'Value';
  styleHeaderRow(cacSheet, 3, 1, 2);
  const cacRows: Array<[string, number, 'currency' | 'number']> = [
    ['CAC', input.cac, 'currency'],
    ['Gross Profit / Account / Month', input.arpu_monthly * input.gross_margin_pct, 'currency'],
    ['Payback (months)', output.paybackMonths, 'number'],
  ];
  cacRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    cacSheet.getCell(row, 1).value = label;
    cacSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(cacSheet.getCell(row, 2));
    if (fmt === 'number') cacSheet.getCell(row, 2).numFmt = '0.00';
    setOutputCell(cacSheet.getCell(row, 1));
    setOutputCell(cacSheet.getCell(row, 2));
  });
  styleGrid(cacSheet, 3, 6, 1, 2);

  const ltvSheet = workbook.addWorksheet('LTV Model');
  ltvSheet.views = [{ state: 'frozen', ySplit: 3 }];
  ltvSheet.getColumn(1).width = 34;
  ltvSheet.getColumn(2).width = 18;
  ltvSheet.getCell('A1').value = 'LTV Model';
  ltvSheet.getCell('A1').font = { bold: true, size: 14 };
  ltvSheet.getCell('A3').value = 'Metric';
  ltvSheet.getCell('B3').value = 'Value';
  styleHeaderRow(ltvSheet, 3, 1, 2);
  const ltvRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['GRR', output.grr, 'percent'],
    ['NRR', output.nrr, 'percent'],
    ['LTV', output.ltv, 'currency'],
    ['LTV : CAC', output.ltvToCac, 'number'],
  ];
  ltvRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    ltvSheet.getCell(row, 1).value = label;
    ltvSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(ltvSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(ltvSheet.getCell(row, 2));
    if (fmt === 'number') ltvSheet.getCell(row, 2).numFmt = '0.00x';
    setOutputCell(ltvSheet.getCell(row, 1));
    setOutputCell(ltvSheet.getCell(row, 2));
  });
  styleGrid(ltvSheet, 3, 7, 1, 2);

  const summarySheet = workbook.addWorksheet('Summary Dashboard');
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 38;
  summarySheet.getColumn(2).width = 18;
  summarySheet.getColumn(3).width = 12;
  summarySheet.getCell('A1').value = 'Summary Dashboard';
  summarySheet.getCell('A1').font = { bold: true, size: 14 };
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  summarySheet.getCell('C3').value = 'Status';
  styleHeaderRow(summarySheet, 3, 1, 3);
  const endingArr = output.arrRows[output.arrRows.length - 1]?.arrClose ?? 0;
  summarySheet.getCell('A4').value = 'Ending ARR';
  summarySheet.getCell('B4').value = endingArr;
  summarySheet.getCell('C4').value = endingArr >= 0 ? 'OK' : 'WARN';
  summarySheet.getCell('A5').value = 'NRR';
  summarySheet.getCell('B5').value = output.nrr;
  summarySheet.getCell('C5').value = output.nrr >= 1 ? 'GOOD' : 'WATCH';
  summarySheet.getCell('A6').value = 'Payback Months';
  summarySheet.getCell('B6').value = output.paybackMonths;
  summarySheet.getCell('C6').value = output.paybackMonths <= 18 ? 'GOOD' : 'WATCH';
  setCurrency(summarySheet.getCell('B4'));
  setPercent(summarySheet.getCell('B5'));
  summarySheet.getCell('B6').numFmt = '0.00';
  for (let r = 4; r <= 6; r += 1) {
    setOutputCell(summarySheet.getCell(r, 1));
    setOutputCell(summarySheet.getCell(r, 2));
    setOutputCell(summarySheet.getCell(r, 3));
  }
  styleGrid(summarySheet, 3, 6, 1, 3);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 34;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  checksSheet.getCell('A1').value = 'Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'GRR <= 100%';
  checksSheet.getCell('B4').value = output.grr;
  checksSheet.getCell('C4').value = output.grr <= 1 ? 'PASS' : 'FAIL';
  checksSheet.getCell('A5').value = 'ARR never negative';
  checksSheet.getCell('B5').value = output.arrRows.every((r) => r.arrClose >= 0) ? 0 : 1;
  checksSheet.getCell('C5').value = output.arrRows.every((r) => r.arrClose >= 0) ? 'PASS' : 'FAIL';
  setPercent(checksSheet.getCell('B4'));
  checksSheet.getCell('B5').numFmt = '0';
  for (let r = 4; r <= 5; r += 1) {
    setOutputCell(checksSheet.getCell(r, 1));
    setOutputCell(checksSheet.getCell(r, 2));
    setOutputCell(checksSheet.getCell(r, 3));
  }
  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const saasCohortBoardModel: ModelDef<SaasCohortBoardInput, SaasCohortBoardOutput> = {
  slug: 'saas-cohort-board',
  name: 'SaaS Cohort + Unit Economics (Board-ready)',
  category: 'VC',
  description: 'Board-ready SaaS cohort retention, ARR bridge, unit economics, and KPI checks.',
  inputSchema: SaasCohortBoardInputSchema,
  uiSchema: saasCohortBoardUiSchema,
  compute: computeSaasCohortBoard,
  buildWorkbook: buildSaasCohortBoardWorkbook,
  filename: () => 'CapitalBase_SaaS_Cohort_Board.xlsx',
};

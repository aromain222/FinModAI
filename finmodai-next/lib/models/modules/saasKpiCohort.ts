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

export const SaasKpiCohortInputSchema = z.object({
  forecast_months: z.number().int().min(12).max(60),
  starting_arr: z.number().nonnegative(),
  new_arr_per_month: z.number().nonnegative(),
  churn_rate: z.number().min(0.001).max(0.5),
  cac: z.number().nonnegative(),
  gross_margin: z.number().min(0).max(1),
  arpu: z.number().positive(),
});

type SaasKpiCohortInput = z.infer<typeof SaasKpiCohortInputSchema>;

type ArrRow = {
  month: number;
  arrOpen: number;
  churnLoss: number;
  newArr: number;
  arrClose: number;
  mrrClose: number;
};

type SaasKpiCohortOutput = {
  arrRows: ArrRow[];
  nrrAnnual: number;
  ltv: number;
  cacPaybackMonths: number;
  cohortTable: number[][];
};

const saasUiSchema: UISchema = {
  sections: [
    {
      title: 'SaaS KPI Inputs',
      fields: [
        { key: 'forecast_months', label: 'Forecast Months', type: 'number', required: true, defaultValue: 24 },
        { key: 'starting_arr', label: 'Starting ARR', type: 'currency', required: true, defaultValue: 12000000 },
        { key: 'new_arr_per_month', label: 'New ARR / Month', type: 'currency', required: true, defaultValue: 300000 },
        { key: 'churn_rate', label: 'Monthly Churn Rate', type: 'percent', required: true, defaultValue: 0.015 },
        { key: 'cac', label: 'CAC', type: 'currency', required: true, defaultValue: 9000 },
        { key: 'gross_margin', label: 'Gross Margin', type: 'percent', required: true, defaultValue: 0.78 },
        { key: 'arpu', label: 'ARPU (Monthly)', type: 'currency', required: true, defaultValue: 150 },
      ],
    },
  ],
};

function computeSaasKpi(input: SaasKpiCohortInput): SaasKpiCohortOutput {
  const arrRows: ArrRow[] = [];

  let arrOpen = input.starting_arr;

  for (let month = 1; month <= input.forecast_months; month += 1) {
    const churnLoss = arrOpen * input.churn_rate;
    const newArr = input.new_arr_per_month;
    const arrClose = arrOpen - churnLoss + newArr;
    const mrrClose = arrClose / 12;

    arrRows.push({ month, arrOpen, churnLoss, newArr, arrClose, mrrClose });
    arrOpen = arrClose;
  }

  const nrrAnnual = Math.pow(1 - input.churn_rate, 12);
  const ltv = (input.arpu * input.gross_margin) / input.churn_rate;
  const cacPaybackMonths = input.cac / (input.arpu * input.gross_margin);

  const cohortTable: number[][] = [];
  const cohortCount = 12;
  const periods = 12;

  for (let cohort = 0; cohort < cohortCount; cohort += 1) {
    const row: number[] = [];
    for (let period = 0; period < periods; period += 1) {
      row.push(Math.pow(1 - input.churn_rate, period));
    }
    cohortTable.push(row);
  }

  return {
    arrRows,
    nrrAnnual,
    ltv,
    cacPaybackMonths,
    cohortTable,
  };
}

async function buildSaasWorkbook(input: SaasKpiCohortInput, output: SaasKpiCohortOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const arrSheet = workbook.addWorksheet('ARR Build');
  arrSheet.views = [{ state: 'frozen', ySplit: 3 }];
  arrSheet.columns = [{ width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];

  arrSheet.getCell('A1').value = 'ARR Build';
  arrSheet.getCell('A1').font = { bold: true, size: 14 };

  ['Month', 'ARR Open', 'Churn Loss', 'New ARR', 'ARR Close', 'MRR Close'].forEach((header, idx) => {
    arrSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(arrSheet, 3, 1, 6);

  output.arrRows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    arrSheet.getCell(excelRow, 1).value = row.month;
    arrSheet.getCell(excelRow, 2).value = row.arrOpen;
    arrSheet.getCell(excelRow, 3).value = row.churnLoss;
    arrSheet.getCell(excelRow, 4).value = row.newArr;
    arrSheet.getCell(excelRow, 5).value = row.arrClose;
    arrSheet.getCell(excelRow, 6).value = row.mrrClose;

    for (let col = 2; col <= 6; col += 1) {
      setCurrency(arrSheet.getCell(excelRow, col));
      setOutputCell(arrSheet.getCell(excelRow, col));
    }
    setOutputCell(arrSheet.getCell(excelRow, 1));
  });
  styleGrid(arrSheet, 3, 3 + output.arrRows.length, 1, 6);

  const cohortSheet = workbook.addWorksheet('Cohort Table');
  cohortSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 2 }];
  cohortSheet.getColumn(1).width = 16;
  for (let c = 2; c <= 13; c += 1) {
    cohortSheet.getColumn(c).width = 11;
  }

  cohortSheet.getCell('A1').value = 'Cohort Retention';
  cohortSheet.getCell('A1').font = { bold: true, size: 14 };
  cohortSheet.getCell('A3').value = 'Signup Month';
  for (let period = 0; period <= 11; period += 1) {
    cohortSheet.getCell(3, 2 + period).value = `Month ${period}`;
  }
  styleHeaderRow(cohortSheet, 3, 1, 13);

  output.cohortTable.forEach((row, rowIdx) => {
    const excelRow = 4 + rowIdx;
    cohortSheet.getCell(excelRow, 1).value = `2026-M${String(rowIdx + 1).padStart(2, '0')}`;
    setOutputCell(cohortSheet.getCell(excelRow, 1));

    row.forEach((retention, colIdx) => {
      const cell = cohortSheet.getCell(excelRow, 2 + colIdx);
      cell.value = retention;
      setPercent(cell);
      setOutputCell(cell);
    });
  });
  const nrrRow = 4 + output.cohortTable.length + 1;
  cohortSheet.getCell(nrrRow, 1).value = 'NRR (Annualized)';
  cohortSheet.getCell(nrrRow, 2).value = output.nrrAnnual;
  cohortSheet.getCell(nrrRow, 1).font = { bold: true };
  cohortSheet.getCell(nrrRow, 2).font = { bold: true };
  setPercent(cohortSheet.getCell(nrrRow, 2));
  setOutputCell(cohortSheet.getCell(nrrRow, 1));
  setOutputCell(cohortSheet.getCell(nrrRow, 2));
  styleGrid(cohortSheet, 3, nrrRow, 1, 13);

  const unitSheet = workbook.addWorksheet('Unit Economics');
  unitSheet.views = [{ state: 'frozen', ySplit: 3 }];
  unitSheet.getColumn(1).width = 34;
  unitSheet.getColumn(2).width = 20;
  unitSheet.getCell('A1').value = 'Unit Economics';
  unitSheet.getCell('A1').font = { bold: true, size: 14 };
  unitSheet.getCell('A3').value = 'Metric';
  unitSheet.getCell('B3').value = 'Value';
  styleHeaderRow(unitSheet, 3, 1, 2);

  const unitRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Starting ARR', input.starting_arr, 'currency'],
    ['New ARR / Month', input.new_arr_per_month, 'currency'],
    ['Monthly Churn Rate', input.churn_rate, 'percent'],
    ['Gross Margin', input.gross_margin, 'percent'],
    ['ARPU', input.arpu, 'currency'],
    ['NRR (Annualized)', output.nrrAnnual, 'percent'],
    ['LTV', output.ltv, 'currency'],
    ['CAC', input.cac, 'currency'],
    ['CAC Payback (Months)', output.cacPaybackMonths, 'number'],
    ['Ending ARR', output.arrRows[output.arrRows.length - 1]?.arrClose ?? 0, 'currency'],
  ];

  unitRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    unitSheet.getCell(row, 1).value = label;
    unitSheet.getCell(row, 2).value = value;

    if (fmt === 'currency') setCurrency(unitSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(unitSheet.getCell(row, 2));

    const isInput = ['Starting ARR', 'New ARR / Month', 'Monthly Churn Rate', 'Gross Margin', 'ARPU', 'CAC'].includes(label);
    if (isInput) setInputCell(unitSheet.getCell(row, 2));
    else setOutputCell(unitSheet.getCell(row, 2));

    setOutputCell(unitSheet.getCell(row, 1));
  });

  styleGrid(unitSheet, 3, 3 + unitRows.length, 1, 2);

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 38;
  summarySheet.getColumn(2).width = 18;
  summarySheet.getColumn(3).width = 16;
  summarySheet.getCell('A1').value = 'SaaS KPI Summary';
  summarySheet.getCell('A1').font = { bold: true, size: 14 };
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  summarySheet.getCell('C3').value = 'Status';
  styleHeaderRow(summarySheet, 3, 1, 3);

  const endingArr = output.arrRows[output.arrRows.length - 1]?.arrClose ?? 0;
  const summaryRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Starting ARR', input.starting_arr, 'currency'],
    ['Ending ARR', endingArr, 'currency'],
    ['NRR (Annualized)', output.nrrAnnual, 'percent'],
    ['LTV', output.ltv, 'currency'],
    ['CAC Payback (Months)', output.cacPaybackMonths, 'number'],
  ];
  summaryRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    summarySheet.getCell(row, 1).value = label;
    summarySheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(summarySheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(summarySheet.getCell(row, 2));
    if (fmt === 'number') summarySheet.getCell(row, 2).numFmt = '0.00';
    setOutputCell(summarySheet.getCell(row, 1));
    setOutputCell(summarySheet.getCell(row, 2));
  });

  const checkStart = 10;
  summarySheet.getCell(checkStart, 1).value = 'Checks';
  summarySheet.getCell(checkStart, 1).font = { bold: true };
  summarySheet.getCell(checkStart + 1, 1).value = 'NRR <= 100% in churn-only setup';
  summarySheet.getCell(checkStart + 1, 2).value = output.nrrAnnual;
  summarySheet.getCell(checkStart + 1, 3).value = output.nrrAnnual <= 1 ? 'PASS' : 'WARN';
  summarySheet.getCell(checkStart + 2, 1).value = 'Churn sign sanity (loss positive)';
  summarySheet.getCell(checkStart + 2, 2).value = output.arrRows.every((row) => row.churnLoss >= 0) ? 0 : 1;
  summarySheet.getCell(checkStart + 2, 3).value = output.arrRows.every((row) => row.churnLoss >= 0) ? 'PASS' : 'FAIL';
  summarySheet.getCell(checkStart + 3, 1).value = 'Runway growth not negative ARR';
  summarySheet.getCell(checkStart + 3, 2).value = endingArr;
  summarySheet.getCell(checkStart + 3, 3).value = endingArr >= 0 ? 'PASS' : 'FAIL';
  setPercent(summarySheet.getCell(checkStart + 1, 2));
  summarySheet.getCell(checkStart + 2, 2).numFmt = '0';
  setCurrency(summarySheet.getCell(checkStart + 3, 2));
  for (let row = checkStart + 1; row <= checkStart + 3; row += 1) {
    setOutputCell(summarySheet.getCell(row, 1));
    setOutputCell(summarySheet.getCell(row, 2));
    setOutputCell(summarySheet.getCell(row, 3));
  }
  styleGrid(summarySheet, 3, checkStart + 3, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));

  return workbook;
}

export const saasKpiCohortModel: ModelDef<SaasKpiCohortInput, SaasKpiCohortOutput> = {
  slug: 'saas-kpi-cohort',
  name: 'SaaS KPI + Cohort Model',
  category: 'VC',
  description: 'Track ARR evolution, cohort retention, and unit economics (NRR, LTV, CAC payback).',
  inputSchema: SaasKpiCohortInputSchema,
  uiSchema: saasUiSchema,
  compute: computeSaasKpi,
  buildWorkbook: buildSaasWorkbook,
  filename: () => 'CapitalBase_SaaS_KPI_Cohort.xlsx',
};

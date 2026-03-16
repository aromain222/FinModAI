import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
  addSheetTitle,
  applyWorksheetChrome,
  configureWorkbookForRecalc,
  protectSheetIfConfigured,
  setCurrency,
  setFormulaCell,
  setInputCell,
  setOutputCell,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';
import { toYearColumns } from '@/lib/models/modules/modelUtils';

export const PpeDepreciationScheduleInputSchema = z.object({
  start_year: z.number().int().min(2000).max(2100).default(2026),
  forecast_years: z.number().int().min(3).max(15).default(5),
  opening_gross_ppe: z.number().nonnegative(),
  opening_accum_depreciation: z.number().nonnegative(),
  capex_year_1: z.number().nonnegative(),
  capex_growth: z.number().min(-0.5).max(1),
  useful_life_years: z.number().int().min(2).max(40),
});

type PpeDepreciationScheduleInput = z.infer<typeof PpeDepreciationScheduleInputSchema>;

type PpeRow = {
  year: number;
  beginningGrossPpe: number;
  capex: number;
  endingGrossPpe: number;
  depreciation: number;
  endingAccumDep: number;
  netPpe: number;
};

type PpeDepreciationScheduleOutput = {
  years: number[];
  rows: PpeRow[];
  endingNetPpe: number;
};

const ppeDepreciationScheduleUiSchema: UISchema = {
  sections: [
    {
      title: 'PP&E Inputs',
      fields: [
        { key: 'start_year', label: 'Start Year', type: 'number', required: true, defaultValue: 2026 },
        { key: 'forecast_years', label: 'Forecast Years', type: 'number', required: true, defaultValue: 5 },
        { key: 'opening_gross_ppe', label: 'Opening Gross PP&E', type: 'currency', required: true, defaultValue: 3000 },
        { key: 'opening_accum_depreciation', label: 'Opening Accumulated Depreciation', type: 'currency', required: true, defaultValue: 1200 },
        { key: 'capex_year_1', label: 'Capex (Year 1)', type: 'currency', required: true, defaultValue: 450 },
        { key: 'capex_growth', label: 'Capex Growth', type: 'percent', required: true, defaultValue: 0.05 },
        { key: 'useful_life_years', label: 'Useful Life (Years)', type: 'number', required: true, defaultValue: 10 },
      ],
    },
  ],
};

function computePpeDepreciationSchedule(input: PpeDepreciationScheduleInput): PpeDepreciationScheduleOutput {
  const years = toYearColumns(input.start_year, input.forecast_years);
  const rows: PpeRow[] = [];
  let beginningGross = input.opening_gross_ppe;
  let beginningAccum = input.opening_accum_depreciation;
  let capex = input.capex_year_1;

  for (let idx = 0; idx < input.forecast_years; idx += 1) {
    if (idx > 0) capex *= 1 + input.capex_growth;
    const endingGrossPpe = beginningGross + capex;
    const depreciation = (beginningGross + capex / 2) / input.useful_life_years;
    const endingAccumDep = beginningAccum + depreciation;
    const netPpe = endingGrossPpe - endingAccumDep;
    rows.push({ year: years[idx], beginningGrossPpe: beginningGross, capex, endingGrossPpe, depreciation, endingAccumDep, netPpe });
    beginningGross = endingGrossPpe;
    beginningAccum = endingAccumDep;
  }

  return { years, rows, endingNetPpe: rows[rows.length - 1].netPpe };
}

async function buildPpeDepreciationScheduleWorkbook(input: PpeDepreciationScheduleInput, output: PpeDepreciationScheduleOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const assumptions = workbook.addWorksheet('Assumptions');
  applyWorksheetChrome(assumptions, { tabColor: 'FF1D4ED8' });
  assumptions.views = [{ state: 'frozen', ySplit: 3 }];
  assumptions.getColumn(1).width = 34;
  assumptions.getColumn(2).width = 18;
  addSheetTitle(assumptions, 'PP&E / Depreciation Assumptions', 2, 'Editable inputs are highlighted. All outputs are formula-linked.');
  assumptions.getCell('A3').value = 'Input';
  assumptions.getCell('B3').value = 'Value';
  styleHeaderRow(assumptions, 3, 1, 2);
  const assumptionRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Start Year', input.start_year, 'number'],
    ['Forecast Years', input.forecast_years, 'number'],
    ['Opening Gross PP&E', input.opening_gross_ppe, 'currency'],
    ['Opening Accumulated Depreciation', input.opening_accum_depreciation, 'currency'],
    ['Capex (Year 1)', input.capex_year_1, 'currency'],
    ['Capex Growth', input.capex_growth, 'percent'],
    ['Useful Life (Years)', input.useful_life_years, 'number'],
  ];
  assumptionRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    assumptions.getCell(row, 1).value = label;
    assumptions.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(assumptions.getCell(row, 2));
    if (fmt === 'percent') assumptions.getCell(row, 2).numFmt = '0.00%';
    if (fmt === 'number') assumptions.getCell(row, 2).numFmt = '#,##0';
    setInputCell(assumptions.getCell(row, 2));
    setOutputCell(assumptions.getCell(row, 1));
  });
  styleGrid(assumptions, 3, 10, 1, 2);

  const schedule = workbook.addWorksheet('PP&E Schedule');
  applyWorksheetChrome(schedule, { tabColor: 'FF0F766E' });
  schedule.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  schedule.getColumn(1).width = 24;
  output.years.forEach((_, idx) => (schedule.getColumn(2 + idx).width = 14));
  addSheetTitle(schedule, 'PP&E Roll-forward', 1 + output.years.length, 'Track gross PP&E, depreciation, accumulated depreciation, and net PP&E by year.');
  schedule.getCell('A3').value = 'Metric';
  output.years.forEach((year, idx) => (schedule.getCell(3, 2 + idx).value = year));
  styleHeaderRow(schedule, 3, 1, 1 + output.years.length);
  ['Beginning Gross PP&E', 'Capex', 'Ending Gross PP&E', 'Depreciation', 'Ending Accumulated Depreciation', 'Net PP&E'].forEach((label, idx) => {
    schedule.getCell(4 + idx, 1).value = label;
  });

  output.rows.forEach((row, idx) => {
    const col = 2 + idx;
    const colLetter = schedule.getColumn(col).letter as string;
    if (idx === 0) {
      setFormulaCell(schedule.getCell(4, col), '=Assumptions!$B$6', row.beginningGrossPpe);
      setFormulaCell(schedule.getCell(8, col), '=Assumptions!$B$7', input.opening_accum_depreciation);
    } else {
      setFormulaCell(schedule.getCell(4, col), `=${schedule.getColumn(col - 1).letter}6`, row.beginningGrossPpe);
      setFormulaCell(schedule.getCell(8, col), `=${schedule.getColumn(col - 1).letter}8+${schedule.getColumn(col - 1).letter}7`, row.endingAccumDep - row.depreciation);
    }
    if (idx === 0) {
      setFormulaCell(schedule.getCell(5, col), '=Assumptions!$B$8', row.capex);
    } else {
      setFormulaCell(schedule.getCell(5, col), `=${schedule.getColumn(col - 1).letter}5*(1+Assumptions!$B$9)`, row.capex);
    }
    setFormulaCell(schedule.getCell(6, col), `=${colLetter}4+${colLetter}5`, row.endingGrossPpe);
    setFormulaCell(schedule.getCell(7, col), `=(${colLetter}4+${colLetter}5/2)/Assumptions!$B$10`, row.depreciation);
    setFormulaCell(schedule.getCell(8, col), `=${colLetter}8+${colLetter}7`.replace(`${colLetter}8`, idx === 0 ? 'Assumptions!$B$7' : `${schedule.getColumn(col - 1).letter}8`), row.endingAccumDep);
    setFormulaCell(schedule.getCell(9, col), `=${colLetter}6-${colLetter}8`, row.netPpe);
    for (let r = 4; r <= 9; r += 1) {
      setCurrency(schedule.getCell(r, col));
      setOutputCell(schedule.getCell(r, col));
    }
  });
  styleGrid(schedule, 3, 9, 1, 1 + output.years.length);

  const summary = workbook.addWorksheet('Summary');
  applyWorksheetChrome(summary, { tabColor: 'FF334155' });
  summary.views = [{ state: 'frozen', ySplit: 3 }];
  summary.getColumn(1).width = 30;
  summary.getColumn(2).width = 18;
  addSheetTitle(summary, 'PP&E Summary', 2, 'Focus on ending net PP&E, depreciation burden, and capex level.');
  summary.getCell('A3').value = 'Metric';
  summary.getCell('B3').value = 'Value';
  styleHeaderRow(summary, 3, 1, 2);
  const lastCol = schedule.getColumn(1 + output.years.length).letter as string;
  const summaryRows: Array<[string, string, number]> = [
    ['Final-Year Net PP&E', `='PP&E Schedule'!${lastCol}9`, output.endingNetPpe],
    ['Final-Year Depreciation', `='PP&E Schedule'!${lastCol}7`, output.rows[output.rows.length - 1].depreciation],
    ['Final-Year Capex', `='PP&E Schedule'!${lastCol}5`, output.rows[output.rows.length - 1].capex],
  ];
  summaryRows.forEach(([label, formula, value], idx) => {
    const row = 4 + idx;
    summary.getCell(row, 1).value = label;
    setFormulaCell(summary.getCell(row, 2), formula, value);
    setCurrency(summary.getCell(row, 2));
    setOutputCell(summary.getCell(row, 1));
  });
  styleGrid(summary, 3, 6, 1, 2);

  const checks = workbook.addWorksheet('Checks');
  applyWorksheetChrome(checks, { tabColor: 'FFB45309' });
  checks.views = [{ state: 'frozen', ySplit: 3 }];
  checks.getColumn(1).width = 32;
  checks.getColumn(2).width = 18;
  checks.getColumn(3).width = 12;
  addSheetTitle(checks, 'Checks', 3, 'Use this tab to confirm the useful-life and PP&E roll-forward assumptions remain coherent.');
  checks.getCell('A3').value = 'Check';
  checks.getCell('B3').value = 'Value';
  checks.getCell('C3').value = 'Status';
  styleHeaderRow(checks, 3, 1, 3);
  checks.getCell('A4').value = 'Useful life > 0';
  setFormulaCell(checks.getCell('B4'), '=Assumptions!$B$10', input.useful_life_years);
  checks.getCell('B4').numFmt = '#,##0';
  setFormulaCell(checks.getCell('C4'), '=IF(B4>0,"PASS","FAIL")', input.useful_life_years > 0 ? 'PASS' : 'FAIL');
  checks.getCell('A5').value = 'Final net PP&E non-negative';
  setFormulaCell(checks.getCell('B5'), '=Summary!B4', output.endingNetPpe);
  setCurrency(checks.getCell('B5'));
  setFormulaCell(checks.getCell('C5'), '=IF(B5>=0,"PASS","REVIEW")', output.endingNetPpe >= 0 ? 'PASS' : 'REVIEW');
  styleGrid(checks, 3, 5, 1, 3);

  const equations = workbook.addWorksheet('Equations');
  applyWorksheetChrome(equations, { tabColor: 'FF64748B' });
  equations.getColumn(1).width = 24;
  equations.getColumn(2).width = 90;
  addSheetTitle(equations, 'Equations', 2, 'Audit trail for the PP&E and depreciation formulas used in the workbook.');
  equations.getCell('A3').value = 'Item';
  equations.getCell('B3').value = 'Equation';
  styleHeaderRow(equations, 3, 1, 2);
  const eqRows: Array<[string, string]> = [
    ['Ending gross PP&E', 'Beginning Gross PP&E + Capex'],
    ['Depreciation', '(Beginning Gross PP&E + 0.5 * Capex) / Useful Life'],
    ['Ending accumulated dep.', 'Beginning Accumulated Depreciation + Depreciation'],
    ['Net PP&E', 'Ending Gross PP&E - Ending Accumulated Depreciation'],
  ];
  eqRows.forEach(([item, eq], idx) => {
    const row = 4 + idx;
    equations.getCell(row, 1).value = item;
    equations.getCell(row, 2).value = eq;
    setOutputCell(equations.getCell(row, 1));
    setOutputCell(equations.getCell(row, 2));
  });
  styleGrid(equations, 3, 7, 1, 2);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const ppeDepreciationScheduleModel: ModelDef<PpeDepreciationScheduleInput, PpeDepreciationScheduleOutput> = {
  slug: 'ppe-depreciation-schedule',
  name: 'PP&E / Depreciation Schedule',
  category: 'Corporate Finance',
  description: 'Roll forward gross PP&E, capex, accumulated depreciation, and net PP&E with editable useful-life assumptions.',
  inputSchema: PpeDepreciationScheduleInputSchema,
  uiSchema: ppeDepreciationScheduleUiSchema,
  compute: computePpeDepreciationSchedule,
  buildWorkbook: buildPpeDepreciationScheduleWorkbook,
  filename: () => 'CapitalBase_PPE_Depreciation_Schedule.xlsx',
};

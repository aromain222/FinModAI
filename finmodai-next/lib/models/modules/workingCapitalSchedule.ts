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
  setPercent,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';
import { toYearColumns } from '@/lib/models/modules/modelUtils';

export const WorkingCapitalScheduleInputSchema = z.object({
  start_year: z.number().int().min(2000).max(2100).default(2026),
  forecast_years: z.number().int().min(3).max(15).default(5),
  revenue: z.number().positive(),
  revenue_growth: z.number().min(-0.5).max(1),
  cogs_pct: z.number().min(0).max(1),
  dso_days: z.number().min(0).max(180),
  inventory_days: z.number().min(0).max(365),
  ap_days: z.number().min(0).max(180),
});

type WorkingCapitalScheduleInput = z.infer<typeof WorkingCapitalScheduleInputSchema>;

type WorkingCapitalRow = {
  year: number;
  revenue: number;
  cogs: number;
  ar: number;
  inventory: number;
  ap: number;
  nwc: number;
  deltaNwc: number;
};

type WorkingCapitalScheduleOutput = {
  years: number[];
  rows: WorkingCapitalRow[];
  peakNwc: number;
};

const workingCapitalScheduleUiSchema: UISchema = {
  sections: [
    {
      title: 'Operating Inputs',
      fields: [
        { key: 'start_year', label: 'Start Year', type: 'number', required: true, defaultValue: 2026 },
        { key: 'forecast_years', label: 'Forecast Years', type: 'number', required: true, defaultValue: 5 },
        { key: 'revenue', label: 'Revenue (Year 1)', type: 'currency', required: true, defaultValue: 5000 },
        { key: 'revenue_growth', label: 'Revenue Growth', type: 'percent', required: true, defaultValue: 0.08 },
        { key: 'cogs_pct', label: 'COGS %', type: 'percent', required: true, defaultValue: 0.55 },
        { key: 'dso_days', label: 'DSO (Days)', type: 'number', required: true, defaultValue: 45 },
        { key: 'inventory_days', label: 'Inventory Days', type: 'number', required: true, defaultValue: 60 },
        { key: 'ap_days', label: 'AP Days', type: 'number', required: true, defaultValue: 40 },
      ],
    },
  ],
};

function computeWorkingCapitalSchedule(input: WorkingCapitalScheduleInput): WorkingCapitalScheduleOutput {
  const years = toYearColumns(input.start_year, input.forecast_years);
  const rows: WorkingCapitalRow[] = [];
  let revenue = input.revenue;
  let priorNwc = 0;

  for (let idx = 0; idx < input.forecast_years; idx += 1) {
    if (idx > 0) revenue *= 1 + input.revenue_growth;
    const cogs = revenue * input.cogs_pct;
    const ar = revenue * input.dso_days / 365;
    const inventory = cogs * input.inventory_days / 365;
    const ap = cogs * input.ap_days / 365;
    const nwc = ar + inventory - ap;
    const deltaNwc = nwc - priorNwc;
    rows.push({ year: years[idx], revenue, cogs, ar, inventory, ap, nwc, deltaNwc });
    priorNwc = nwc;
  }

  return { years, rows, peakNwc: Math.max(...rows.map((row) => row.nwc)) };
}

async function buildWorkingCapitalScheduleWorkbook(input: WorkingCapitalScheduleInput, output: WorkingCapitalScheduleOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const assumptions = workbook.addWorksheet('Assumptions');
  applyWorksheetChrome(assumptions, { tabColor: 'FF1D4ED8' });
  assumptions.views = [{ state: 'frozen', ySplit: 3 }];
  assumptions.getColumn(1).width = 30;
  assumptions.getColumn(2).width = 18;
  addSheetTitle(assumptions, 'Working Capital Assumptions', 2, 'Editable inputs are highlighted. All outputs are formula-linked.');
  assumptions.getCell('A3').value = 'Input';
  assumptions.getCell('B3').value = 'Value';
  styleHeaderRow(assumptions, 3, 1, 2);
  const rows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Start Year', input.start_year, 'number'],
    ['Forecast Years', input.forecast_years, 'number'],
    ['Revenue (Year 1)', input.revenue, 'currency'],
    ['Revenue Growth', input.revenue_growth, 'percent'],
    ['COGS %', input.cogs_pct, 'percent'],
    ['DSO', input.dso_days, 'number'],
    ['Inventory Days', input.inventory_days, 'number'],
    ['AP Days', input.ap_days, 'number'],
  ];
  rows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    assumptions.getCell(row, 1).value = label;
    assumptions.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(assumptions.getCell(row, 2));
    if (fmt === 'percent') setPercent(assumptions.getCell(row, 2));
    if (fmt === 'number') assumptions.getCell(row, 2).numFmt = '#,##0';
    setInputCell(assumptions.getCell(row, 2));
    setOutputCell(assumptions.getCell(row, 1));
  });
  styleGrid(assumptions, 3, 11, 1, 2);

  const schedule = workbook.addWorksheet('Working Capital');
  applyWorksheetChrome(schedule, { tabColor: 'FF0F766E' });
  schedule.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  schedule.getColumn(1).width = 22;
  output.years.forEach((_, idx) => (schedule.getColumn(2 + idx).width = 14));
  addSheetTitle(schedule, 'Working Capital Schedule', 1 + output.years.length, 'Track receivables, inventory, payables, and net working capital by year.');
  schedule.getCell('A3').value = 'Metric';
  output.years.forEach((year, idx) => (schedule.getCell(3, 2 + idx).value = year));
  styleHeaderRow(schedule, 3, 1, 1 + output.years.length);
  ['Revenue', 'COGS', 'Accounts Receivable', 'Inventory', 'Accounts Payable', 'Net Working Capital', 'Change in NWC'].forEach((label, idx) => {
    schedule.getCell(4 + idx, 1).value = label;
  });

  output.rows.forEach((row, idx) => {
    const col = 2 + idx;
    const colLetter = schedule.getColumn(col).letter as string;
    if (idx === 0) {
      setFormulaCell(schedule.getCell(4, col), '=Assumptions!$B$6', row.revenue);
    } else {
      setFormulaCell(schedule.getCell(4, col), `=${schedule.getColumn(col - 1).letter}4*(1+Assumptions!$B$7)`, row.revenue);
    }
    setFormulaCell(schedule.getCell(5, col), `=${colLetter}4*Assumptions!$B$8`, row.cogs);
    setFormulaCell(schedule.getCell(6, col), `=${colLetter}4*Assumptions!$B$9/365`, row.ar);
    setFormulaCell(schedule.getCell(7, col), `=${colLetter}5*Assumptions!$B$10/365`, row.inventory);
    setFormulaCell(schedule.getCell(8, col), `=${colLetter}5*Assumptions!$B$11/365`, row.ap);
    setFormulaCell(schedule.getCell(9, col), `=${colLetter}6+${colLetter}7-${colLetter}8`, row.nwc);
    if (idx === 0) {
      setFormulaCell(schedule.getCell(10, col), `=${colLetter}9`, row.deltaNwc);
    } else {
      setFormulaCell(schedule.getCell(10, col), `=${colLetter}9-${schedule.getColumn(col - 1).letter}9`, row.deltaNwc);
    }
    for (let r = 4; r <= 10; r += 1) {
      setCurrency(schedule.getCell(r, col));
      setOutputCell(schedule.getCell(r, col));
    }
  });
  styleGrid(schedule, 3, 10, 1, 1 + output.years.length);

  const summary = workbook.addWorksheet('Summary');
  applyWorksheetChrome(summary, { tabColor: 'FF334155' });
  summary.views = [{ state: 'frozen', ySplit: 3 }];
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 18;
  addSheetTitle(summary, 'Working Capital Summary', 2, 'Focus on peak working capital usage and the final-year cash drag.');
  summary.getCell('A3').value = 'Metric';
  summary.getCell('B3').value = 'Value';
  styleHeaderRow(summary, 3, 1, 2);
  const lastCol = schedule.getColumn(1 + output.years.length).letter as string;
  const summaryRows: Array<[string, string, number, 'currency']> = [
    ['Peak NWC', `=MAX('Working Capital'!B9:${lastCol}9)`, output.peakNwc, 'currency'],
    ['Final-Year NWC', `='Working Capital'!${lastCol}9`, output.rows[output.rows.length - 1].nwc, 'currency'],
    ['Final-Year Delta NWC', `='Working Capital'!${lastCol}10`, output.rows[output.rows.length - 1].deltaNwc, 'currency'],
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
  addSheetTitle(checks, 'Checks', 3, 'Use this tab to confirm the working capital assumptions remain within a defensible operating range.');
  checks.getCell('A3').value = 'Check';
  checks.getCell('B3').value = 'Value';
  checks.getCell('C3').value = 'Status';
  styleHeaderRow(checks, 3, 1, 3);
  checks.getCell('A4').value = 'DSO in normal range';
  setFormulaCell(checks.getCell('B4'), '=Assumptions!$B$9', input.dso_days);
  checks.getCell('B4').numFmt = '#,##0';
  setFormulaCell(checks.getCell('C4'), '=IF(AND(B4>=0,B4<=180),"PASS","REVIEW")', input.dso_days <= 180 ? 'PASS' : 'REVIEW');
  checks.getCell('A5').value = 'Peak NWC positive';
  setFormulaCell(checks.getCell('B5'), '=Summary!B4', output.peakNwc);
  setCurrency(checks.getCell('B5'));
  setFormulaCell(checks.getCell('C5'), '=IF(B5>=0,"PASS","REVIEW")', output.peakNwc >= 0 ? 'PASS' : 'REVIEW');
  styleGrid(checks, 3, 5, 1, 3);

  const equations = workbook.addWorksheet('Equations');
  applyWorksheetChrome(equations, { tabColor: 'FF64748B' });
  equations.getColumn(1).width = 24;
  equations.getColumn(2).width = 90;
  addSheetTitle(equations, 'Equations', 2, 'Audit trail for the working capital formulas used in the workbook.');
  equations.getCell('A3').value = 'Item';
  equations.getCell('B3').value = 'Equation';
  styleHeaderRow(equations, 3, 1, 2);
  const eqRows: Array<[string, string]> = [
    ['AR', 'Revenue * DSO / 365'],
    ['Inventory', 'COGS * Inventory Days / 365'],
    ['AP', 'COGS * AP Days / 365'],
    ['NWC', 'AR + Inventory - AP'],
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

export const workingCapitalScheduleModel: ModelDef<WorkingCapitalScheduleInput, WorkingCapitalScheduleOutput> = {
  slug: 'working-capital-schedule',
  name: 'Working Capital Schedule',
  category: 'Corporate Finance',
  description: 'Project receivables, inventory, payables, and the cash impact of working capital movements.',
  inputSchema: WorkingCapitalScheduleInputSchema,
  uiSchema: workingCapitalScheduleUiSchema,
  compute: computeWorkingCapitalSchedule,
  buildWorkbook: buildWorkingCapitalScheduleWorkbook,
  filename: () => 'CapitalBase_Working_Capital_Schedule.xlsx',
};

import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
  configureWorkbookForRecalc,
  protectSheetIfConfigured,
  setCurrency,
  setDate,
  setFormulaCell,
  setInputCell,
  setOutputCell,
  setPercent,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';

export const RunwayBurnInputSchema = z.object({
  start_date: z.string().min(1),
  forecast_months: z.number().int().min(6).max(60),
  starting_cash: z.number().nonnegative(),
  monthly_burn: z.number().nonnegative(),
  hiring_ramp: z.number().nonnegative(),
  revenue_growth: z.number().min(-0.5).max(1),
  fundraise_timing: z.number().int().min(1).max(60),
  fundraise_amount: z.number().nonnegative().default(0),
});

type RunwayBurnInput = z.infer<typeof RunwayBurnInputSchema>;

type CashRow = {
  monthIndex: number;
  monthLabel: string;
  burn: number;
  revenue: number;
  netBurn: number;
  fundraise: number;
  cashClose: number;
};

type RunwayBurnOutput = {
  rows: CashRow[];
  runwayMonths: number | null;
  cashOutDate: string | null;
  endingCash: number;
};

const runwayBurnUiSchema: UISchema = {
  sections: [
    {
      title: 'Runway Inputs',
      fields: [
        { key: 'start_date', label: 'Start Date (YYYY-MM-DD)', type: 'text', required: true, defaultValue: '2026-01-01' },
        { key: 'forecast_months', label: 'Forecast Months', type: 'number', required: true, defaultValue: 24 },
        { key: 'starting_cash', label: 'Starting Cash', type: 'currency', required: true, defaultValue: 8000000 },
        { key: 'monthly_burn', label: 'Monthly Burn', type: 'currency', required: true, defaultValue: 450000 },
        { key: 'hiring_ramp', label: 'Monthly Hiring Ramp (extra burn)', type: 'currency', required: true, defaultValue: 20000 },
        { key: 'revenue_growth', label: 'Monthly Revenue Growth', type: 'percent', required: true, defaultValue: 0.03 },
        { key: 'fundraise_timing', label: 'Fundraise Month #', type: 'number', required: true, defaultValue: 9 },
        { key: 'fundraise_amount', label: 'Fundraise Amount', type: 'currency', required: true, defaultValue: 5000000 },
      ],
    },
  ],
};

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

function addMonths(date: Date, count: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + count);
  return next;
}

function computeRunwayBurn(input: RunwayBurnInput): RunwayBurnOutput {
  const startDate = new Date(input.start_date);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('start_date must be a valid date string (YYYY-MM-DD)');
  }

  const baseRevenue = input.monthly_burn * 0.25;

  let cash = input.starting_cash;
  const rows: CashRow[] = [];
  let runwayMonths: number | null = null;
  let cashOutDate: string | null = null;

  for (let month = 1; month <= input.forecast_months; month += 1) {
    const burn = input.monthly_burn + input.hiring_ramp * (month - 1);
    const revenue = baseRevenue * Math.pow(1 + input.revenue_growth, month - 1);
    const netBurn = burn - revenue;
    const fundraise = month === input.fundraise_timing ? input.fundraise_amount : 0;

    cash = cash - netBurn + fundraise;

    const monthDate = addMonths(startDate, month - 1);

    rows.push({
      monthIndex: month,
      monthLabel: formatMonth(monthDate),
      burn,
      revenue,
      netBurn,
      fundraise,
      cashClose: cash,
    });

    if (cash <= 0 && runwayMonths === null) {
      runwayMonths = month;
      cashOutDate = monthDate.toISOString().slice(0, 10);
    }
  }

  return {
    rows,
    runwayMonths,
    cashOutDate,
    endingCash: cash,
  };
}

async function buildRunwayBurnWorkbook(input: RunwayBurnInput, output: RunwayBurnOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const startDate = new Date(input.start_date);

  const inputsSheet = workbook.addWorksheet('Inputs');
  inputsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  inputsSheet.getColumn(1).width = 36;
  inputsSheet.getColumn(2).width = 18;
  inputsSheet.getCell('A1').value = 'Runway Inputs';
  inputsSheet.getCell('A1').font = { bold: true, size: 14 };
  inputsSheet.getCell('A3').value = 'Input';
  inputsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(inputsSheet, 3, 1, 2);
  const inputRows: Array<[string, string | number | Date, 'date' | 'currency' | 'percent' | 'number']> = [
    ['Start Date', startDate, 'date'],
    ['Forecast Months', input.forecast_months, 'number'],
    ['Starting Cash', input.starting_cash, 'currency'],
    ['Monthly Burn', input.monthly_burn, 'currency'],
    ['Hiring Ramp', input.hiring_ramp, 'currency'],
    ['Revenue Growth', input.revenue_growth, 'percent'],
    ['Fundraise Timing', input.fundraise_timing, 'number'],
    ['Fundraise Amount', input.fundraise_amount, 'currency'],
    ['Base Revenue', input.monthly_burn * 0.25, 'currency'],
  ];
  inputRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    inputsSheet.getCell(row, 1).value = label;
    inputsSheet.getCell(row, 2).value = value as ExcelJS.CellValue;
    if (fmt === 'date') setDate(inputsSheet.getCell(row, 2));
    if (fmt === 'currency') setCurrency(inputsSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(inputsSheet.getCell(row, 2));
    if (fmt === 'number') inputsSheet.getCell(row, 2).numFmt = '#,##0';
    setInputCell(inputsSheet.getCell(row, 2));
    setOutputCell(inputsSheet.getCell(row, 1));
  });
  styleGrid(inputsSheet, 3, 12, 1, 2);

  const cashSheet = workbook.addWorksheet('Cash Forecast');
  cashSheet.views = [{ state: 'frozen', ySplit: 3 }];
  cashSheet.columns = [{ width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }];
  cashSheet.getCell('A1').value = 'Cash Forecast';
  cashSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Month', 'Period', 'Burn', 'Revenue', 'Net Burn', 'Fundraise', 'Cash Close'].forEach((header, idx) => {
    cashSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(cashSheet, 3, 1, 7);

  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    cashSheet.getCell(excelRow, 1).value = row.monthIndex;
    if (idx === 0) {
      setFormulaCell(cashSheet.getCell(excelRow, 2), '=Inputs!$B$4', startDate);
    } else {
      setFormulaCell(cashSheet.getCell(excelRow, 2), `=EDATE(B${excelRow - 1},1)`, addMonths(startDate, idx));
    }
    setDate(cashSheet.getCell(excelRow, 2));
    setFormulaCell(cashSheet.getCell(excelRow, 3), `=Inputs!$B$7+(A${excelRow}-1)*Inputs!$B$8`, row.burn);
    setFormulaCell(cashSheet.getCell(excelRow, 4), `=Inputs!$B$12*((1+Inputs!$B$9)^(A${excelRow}-1))`, row.revenue);
    setFormulaCell(cashSheet.getCell(excelRow, 5), `=C${excelRow}-D${excelRow}`, row.netBurn);
    setFormulaCell(cashSheet.getCell(excelRow, 6), `=IF(A${excelRow}=Inputs!$B$10,Inputs!$B$11,0)`, row.fundraise);
    if (idx === 0) {
      setFormulaCell(cashSheet.getCell(excelRow, 7), `=Inputs!$B$6-E${excelRow}+F${excelRow}`, row.cashClose);
    } else {
      setFormulaCell(cashSheet.getCell(excelRow, 7), `=G${excelRow - 1}-E${excelRow}+F${excelRow}`, row.cashClose);
    }
    for (let col = 3; col <= 7; col += 1) {
      setCurrency(cashSheet.getCell(excelRow, col));
      setOutputCell(cashSheet.getCell(excelRow, col));
    }
    setOutputCell(cashSheet.getCell(excelRow, 1));
    setOutputCell(cashSheet.getCell(excelRow, 2));
  });
  styleGrid(cashSheet, 3, 3 + output.rows.length, 1, 7);

  const lastCashRow = 3 + output.rows.length;
  const runwaySheet = workbook.addWorksheet('Runway Analysis');
  runwaySheet.views = [{ state: 'frozen', ySplit: 3 }];
  runwaySheet.getColumn(1).width = 34;
  runwaySheet.getColumn(2).width = 22;
  runwaySheet.getCell('A1').value = 'Runway Analysis';
  runwaySheet.getCell('A1').font = { bold: true, size: 14 };
  runwaySheet.getCell('A3').value = 'Metric';
  runwaySheet.getCell('B3').value = 'Value';
  styleHeaderRow(runwaySheet, 3, 1, 2);

  runwaySheet.getCell('A4').value = 'Runway (months)';
  setFormulaCell(runwaySheet.getCell('B4'), `=IFERROR(MATCH(TRUE,'Cash Forecast'!G4:G${lastCashRow}<=0,0),Inputs!$B$5)`, output.runwayMonths ?? input.forecast_months);
  runwaySheet.getCell('B4').numFmt = '#,##0';
  runwaySheet.getCell('A5').value = 'Cash-out Date';
  setFormulaCell(runwaySheet.getCell('B5'), `=IF(COUNTIF('Cash Forecast'!G4:G${lastCashRow},"<=0")=0,"No cash-out in forecast horizon",INDEX('Cash Forecast'!B4:B${lastCashRow},MATCH(TRUE,'Cash Forecast'!G4:G${lastCashRow}<=0,0)))`, output.cashOutDate ?? 'No cash-out in forecast horizon');
  if (output.cashOutDate) setDate(runwaySheet.getCell('B5'));
  runwaySheet.getCell('A6').value = 'Ending Cash';
  setFormulaCell(runwaySheet.getCell('B6'), `='Cash Forecast'!G${lastCashRow}`, output.endingCash);
  setCurrency(runwaySheet.getCell('B6'));
  runwaySheet.getCell('A7').value = 'Status';
  setFormulaCell(runwaySheet.getCell('B7'), '=IF(B6>=0,"PASS","WARN")', output.endingCash >= 0 ? 'PASS' : 'WARN');
  for (const cell of ['A4', 'B4', 'A5', 'B5', 'A6', 'B6', 'A7', 'B7']) setOutputCell(runwaySheet.getCell(cell));
  styleGrid(runwaySheet, 3, 7, 1, 2);

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
  checksSheet.getCell('A4').value = 'Ending cash non-negative';
  setFormulaCell(checksSheet.getCell('B4'), '=\'Runway Analysis\'!B6', output.endingCash);
  setCurrency(checksSheet.getCell('B4'));
  setFormulaCell(checksSheet.getCell('C4'), '=IF(B4>=0,"PASS","WARN")', output.endingCash >= 0 ? 'PASS' : 'WARN');
  checksSheet.getCell('A5').value = 'Fundraise timing within forecast';
  setFormulaCell(checksSheet.getCell('B5'), '=Inputs!$B$10<=Inputs!$B$5', input.fundraise_timing <= input.forecast_months);
  setFormulaCell(checksSheet.getCell('C5'), '=IF(B5,"PASS","FAIL")', input.fundraise_timing <= input.forecast_months ? 'PASS' : 'FAIL');
  for (let row = 4; row <= 5; row += 1) for (let col = 1; col <= 3; col += 1) setOutputCell(checksSheet.getCell(row, col));
  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));

  return workbook;
}

export const runwayBurnModel: ModelDef<RunwayBurnInput, RunwayBurnOutput> = {
  slug: 'runway-burn',
  name: 'Runway & Burn Model',
  category: 'VC',
  description: 'Forecast monthly cash burn and runway under hiring, revenue, and fundraise assumptions.',
  inputSchema: RunwayBurnInputSchema,
  uiSchema: runwayBurnUiSchema,
  compute: computeRunwayBurn,
  buildWorkbook: buildRunwayBurnWorkbook,
  filename: () => 'CapitalBase_Runway_Burn.xlsx',
};

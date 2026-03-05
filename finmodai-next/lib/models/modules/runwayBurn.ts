import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
  protectSheetIfConfigured,
  setCurrency,
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
    cashSheet.getCell(excelRow, 2).value = row.monthLabel;
    cashSheet.getCell(excelRow, 3).value = row.burn;
    cashSheet.getCell(excelRow, 4).value = row.revenue;
    cashSheet.getCell(excelRow, 5).value = row.netBurn;
    cashSheet.getCell(excelRow, 6).value = row.fundraise;
    cashSheet.getCell(excelRow, 7).value = row.cashClose;

    for (let col = 3; col <= 7; col += 1) {
      setCurrency(cashSheet.getCell(excelRow, col));
      setOutputCell(cashSheet.getCell(excelRow, col));
    }
    setOutputCell(cashSheet.getCell(excelRow, 1));
    setOutputCell(cashSheet.getCell(excelRow, 2));
  });
  styleGrid(cashSheet, 3, 3 + output.rows.length, 1, 7);

  const hiringSheet = workbook.addWorksheet('Hiring Plan');
  hiringSheet.views = [{ state: 'frozen', ySplit: 3 }];
  hiringSheet.getColumn(1).width = 36;
  hiringSheet.getColumn(2).width = 18;
  hiringSheet.getCell('A1').value = 'Hiring Plan Inputs';
  hiringSheet.getCell('A1').font = { bold: true, size: 14 };
  hiringSheet.getCell('A3').value = 'Input';
  hiringSheet.getCell('B3').value = 'Value';
  styleHeaderRow(hiringSheet, 3, 1, 2);

  const hiringRows: Array<[string, number | string, boolean]> = [
    ['Start Date', input.start_date, false],
    ['Forecast Months', input.forecast_months, false],
    ['Monthly Burn', input.monthly_burn, false],
    ['Hiring Ramp (extra burn / month)', input.hiring_ramp, false],
    ['Revenue Growth', input.revenue_growth, false],
    ['Fundraise Month', input.fundraise_timing, false],
    ['Fundraise Amount', input.fundraise_amount, false],
  ];

  hiringRows.forEach(([label, value, outputValue], idx) => {
    const row = 4 + idx;
    hiringSheet.getCell(row, 1).value = label;
    const cell = hiringSheet.getCell(row, 2);
    cell.value = value;

    if (!outputValue) setInputCell(cell);
    else setOutputCell(cell);

    if (label.includes('Burn') || label.includes('Amount') || label.includes('Ramp')) setCurrency(cell);
    if (label.includes('Growth')) setPercent(cell);

    setOutputCell(hiringSheet.getCell(row, 1));
  });

  styleGrid(hiringSheet, 3, 3 + hiringRows.length, 1, 2);

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
  runwaySheet.getCell('B4').value = output.runwayMonths ?? input.forecast_months;
  runwaySheet.getCell('A5').value = 'Cash-out Date';
  runwaySheet.getCell('B5').value = output.cashOutDate ?? 'No cash-out in forecast horizon';
  runwaySheet.getCell('A6').value = 'Ending Cash';
  runwaySheet.getCell('B6').value = output.endingCash;
  runwaySheet.getCell('A7').value = 'Status';
  runwaySheet.getCell('B7').value = output.endingCash >= 0 ? 'PASS' : 'WARN';

  setCurrency(runwaySheet.getCell('B6'));
  setOutputCell(runwaySheet.getCell('A4'));
  setOutputCell(runwaySheet.getCell('B4'));
  setOutputCell(runwaySheet.getCell('A5'));
  setOutputCell(runwaySheet.getCell('B5'));
  setOutputCell(runwaySheet.getCell('A6'));
  setOutputCell(runwaySheet.getCell('B6'));
  setOutputCell(runwaySheet.getCell('A7'));
  setOutputCell(runwaySheet.getCell('B7'));

  styleGrid(runwaySheet, 3, 7, 1, 2);

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

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

export const DividendDiscountInputSchema = z
  .object({
    current_dividend_per_share: z.number().positive(),
    near_term_growth: z.number().min(-0.5).max(0.5),
    terminal_growth: z.number().min(0).max(0.08),
    cost_of_equity: z.number().min(0.03).max(0.25),
    forecast_years: z.number().int().min(3).max(15).default(5),
    current_price: z.number().positive().default(0),
    payout_ratio: z.number().min(0).max(1).default(0.45),
  })
  .superRefine((input, ctx) => {
    if (input.terminal_growth >= input.cost_of_equity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['terminal_growth'],
        message: 'terminal_growth must be below cost_of_equity',
      });
    }
  });

type DividendDiscountInput = z.infer<typeof DividendDiscountInputSchema>;

type DividendRow = {
  year: number;
  dividendPerShare: number;
  growth: number;
  discountFactor: number;
  pvDividend: number;
};

type DividendDiscountOutput = {
  rows: DividendRow[];
  terminalDividend: number;
  terminalValue: number;
  pvTerminalValue: number;
  impliedValuePerShare: number;
  priceUpsidePct: number | null;
  impliedYield: number;
};

const dividendDiscountUiSchema: UISchema = {
  sections: [
    {
      title: 'Dividend Inputs',
      fields: [
        { key: 'current_dividend_per_share', label: 'Current Dividend / Share', type: 'currency', required: true, defaultValue: 6.00 },
        { key: 'near_term_growth', label: 'Near-term Dividend Growth', type: 'percent', required: true, defaultValue: 0.06 },
        { key: 'terminal_growth', label: 'Terminal Growth', type: 'percent', required: true, defaultValue: 0.025 },
        { key: 'cost_of_equity', label: 'Cost of Equity', type: 'percent', required: true, defaultValue: 0.09 },
        { key: 'forecast_years', label: 'Forecast Years', type: 'number', required: true, defaultValue: 5 },
        { key: 'current_price', label: 'Current Share Price', type: 'currency', required: true, defaultValue: 140 },
        { key: 'payout_ratio', label: 'Payout Ratio', type: 'percent', required: true, defaultValue: 0.45 },
      ],
    },
  ],
};

function computeDividendDiscount(input: DividendDiscountInput): DividendDiscountOutput {
  const rows: DividendRow[] = [];
  let dividend = input.current_dividend_per_share;

  for (let year = 1; year <= input.forecast_years; year += 1) {
    dividend *= 1 + input.near_term_growth;
    const discountFactor = 1 / Math.pow(1 + input.cost_of_equity, year);
    rows.push({
      year,
      dividendPerShare: dividend,
      growth: input.near_term_growth,
      discountFactor,
      pvDividend: dividend * discountFactor,
    });
  }

  const terminalDividend = rows[rows.length - 1].dividendPerShare * (1 + input.terminal_growth);
  const terminalValue = terminalDividend / (input.cost_of_equity - input.terminal_growth);
  const pvTerminalValue = terminalValue / Math.pow(1 + input.cost_of_equity, input.forecast_years);
  const impliedValuePerShare = rows.reduce((sum, row) => sum + row.pvDividend, 0) + pvTerminalValue;
  const priceUpsidePct = input.current_price > 0 ? impliedValuePerShare / input.current_price - 1 : null;
  const impliedYield = input.current_price > 0 ? input.current_dividend_per_share / input.current_price : 0;

  return {
    rows,
    terminalDividend,
    terminalValue,
    pvTerminalValue,
    impliedValuePerShare,
    priceUpsidePct,
    impliedYield,
  };
}

async function buildDividendDiscountWorkbook(
  input: DividendDiscountInput,
  output: DividendDiscountOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 34;
  assumptionsSheet.getColumn(2).width = 18;
  assumptionsSheet.getCell('A1').value = 'Dividend Discount Assumptions';
  assumptionsSheet.getCell('A1').font = { bold: true, size: 14 };
  assumptionsSheet.getCell('A3').value = 'Input';
  assumptionsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(assumptionsSheet, 3, 1, 2);
  const assumptionRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Current Dividend / Share', input.current_dividend_per_share, 'currency'],
    ['Near-term Growth', input.near_term_growth, 'percent'],
    ['Terminal Growth', input.terminal_growth, 'percent'],
    ['Cost of Equity', input.cost_of_equity, 'percent'],
    ['Forecast Years', input.forecast_years, 'number'],
    ['Current Price', input.current_price, 'currency'],
    ['Payout Ratio', input.payout_ratio, 'percent'],
  ];
  assumptionRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    assumptionsSheet.getCell(row, 1).value = label;
    assumptionsSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(assumptionsSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(assumptionsSheet.getCell(row, 2));
    if (fmt === 'number') assumptionsSheet.getCell(row, 2).numFmt = '#,##0';
    setInputCell(assumptionsSheet.getCell(row, 2));
    setOutputCell(assumptionsSheet.getCell(row, 1));
  });
  styleGrid(assumptionsSheet, 3, 10, 1, 2);

  const scheduleSheet = workbook.addWorksheet('Dividend Schedule');
  scheduleSheet.views = [{ state: 'frozen', ySplit: 3 }];
  scheduleSheet.columns = [
    { width: 12 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
  ];
  scheduleSheet.getCell('A1').value = 'Dividend Forecast';
  scheduleSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Year', 'Dividend / Share', 'Growth', 'Discount Factor', 'PV Dividend'].forEach((header, idx) => {
    scheduleSheet.getCell(3, idx + 1).value = header;
  });
  styleHeaderRow(scheduleSheet, 3, 1, 5);
  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    scheduleSheet.getCell(excelRow, 1).value = row.year;
    scheduleSheet.getCell(excelRow, 2).value = row.dividendPerShare;
    scheduleSheet.getCell(excelRow, 3).value = row.growth;
    scheduleSheet.getCell(excelRow, 4).value = row.discountFactor;
    scheduleSheet.getCell(excelRow, 5).value = row.pvDividend;
    setCurrency(scheduleSheet.getCell(excelRow, 2));
    setPercent(scheduleSheet.getCell(excelRow, 3));
    scheduleSheet.getCell(excelRow, 4).numFmt = '0.0000x';
    setCurrency(scheduleSheet.getCell(excelRow, 5));
    for (let c = 1; c <= 5; c += 1) setOutputCell(scheduleSheet.getCell(excelRow, c));
  });
  styleGrid(scheduleSheet, 3, 3 + output.rows.length, 1, 5);

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 34;
  summarySheet.getColumn(2).width = 18;
  summarySheet.getCell('A1').value = 'Valuation Summary';
  summarySheet.getCell('A1').font = { bold: true, size: 14 };
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  styleHeaderRow(summarySheet, 3, 1, 2);
  const summaryRows: Array<[string, number | string, 'currency' | 'percent' | 'text']> = [
    ['PV of Forecast Dividends', output.rows.reduce((sum, row) => sum + row.pvDividend, 0), 'currency'],
    ['PV of Terminal Value', output.pvTerminalValue, 'currency'],
    ['Implied Value / Share', output.impliedValuePerShare, 'currency'],
    ['Current Price', input.current_price, 'currency'],
    ['Upside / Downside', output.priceUpsidePct ?? 0, 'percent'],
    ['Current Dividend Yield', output.impliedYield, 'percent'],
  ];
  summaryRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    summarySheet.getCell(row, 1).value = label;
    summarySheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(summarySheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(summarySheet.getCell(row, 2));
    for (let c = 1; c <= 2; c += 1) setOutputCell(summarySheet.getCell(row, c));
  });
  styleGrid(summarySheet, 3, 9, 1, 2);

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
  const spread = input.cost_of_equity - input.terminal_growth;
  checksSheet.getCell('A4').value = 'Cost of equity > terminal growth';
  checksSheet.getCell('B4').value = spread;
  checksSheet.getCell('C4').value = spread > 0 ? 'PASS' : 'FAIL';
  setPercent(checksSheet.getCell('B4'));
  checksSheet.getCell('A5').value = 'Implied value / share finite';
  checksSheet.getCell('B5').value = output.impliedValuePerShare;
  checksSheet.getCell('C5').value = Number.isFinite(output.impliedValuePerShare) ? 'PASS' : 'FAIL';
  setCurrency(checksSheet.getCell('B5'));
  for (let row = 4; row <= 5; row += 1) {
    for (let col = 1; col <= 3; col += 1) setOutputCell(checksSheet.getCell(row, col));
  }
  styleGrid(checksSheet, 3, 5, 1, 3);

  const equationsSheet = workbook.addWorksheet('Equations');
  equationsSheet.getColumn(1).width = 28;
  equationsSheet.getColumn(2).width = 90;
  equationsSheet.getCell('A1').value = 'Equations';
  equationsSheet.getCell('A1').font = { bold: true, size: 14 };
  equationsSheet.getCell('A3').value = 'Item';
  equationsSheet.getCell('B3').value = 'Equation';
  styleHeaderRow(equationsSheet, 3, 1, 2);
  const equations: Array<[string, string]> = [
    ['Forecast dividend', 'DPS_t = DPS_(t-1) * (1 + near-term growth)'],
    ['Terminal value', 'TV = DPS_(n+1) / (cost of equity - terminal growth)'],
    ['Implied value / share', 'Value = sum(PV of forecast dividends) + PV of terminal value'],
  ];
  equations.forEach(([item, eq], idx) => {
    const row = 4 + idx;
    equationsSheet.getCell(row, 1).value = item;
    equationsSheet.getCell(row, 2).value = eq;
    setOutputCell(equationsSheet.getCell(row, 1));
    setOutputCell(equationsSheet.getCell(row, 2));
  });
  styleGrid(equationsSheet, 3, 6, 1, 2);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const dividendDiscountModel: ModelDef<DividendDiscountInput, DividendDiscountOutput> = {
  slug: 'dividend-discount-model',
  name: 'Dividend Discount Model',
  category: 'Corporate Finance',
  description: 'Value mature dividend-paying companies from forecast dividends, terminal growth, and cost of equity.',
  inputSchema: DividendDiscountInputSchema,
  uiSchema: dividendDiscountUiSchema,
  compute: computeDividendDiscount,
  buildWorkbook: buildDividendDiscountWorkbook,
  filename: () => 'CapitalBase_Dividend_Discount_Model.xlsx',
};

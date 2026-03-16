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
        { key: 'current_dividend_per_share', label: 'Current Dividend / Share', type: 'currency', required: true, defaultValue: 6.0 },
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

async function buildDividendDiscountWorkbook(input: DividendDiscountInput, output: DividendDiscountOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  applyWorksheetChrome(assumptionsSheet, { tabColor: 'FF1D4ED8' });
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 34;
  assumptionsSheet.getColumn(2).width = 18;
  addSheetTitle(assumptionsSheet, 'Dividend Discount Assumptions', 2, 'Editable inputs are highlighted. All outputs are formula-linked.');
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
  applyWorksheetChrome(scheduleSheet, { tabColor: 'FF0F766E' });
  scheduleSheet.views = [{ state: 'frozen', ySplit: 3 }];
  scheduleSheet.columns = [
    { width: 12 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
  ];
  addSheetTitle(scheduleSheet, 'Dividend Forecast', 5, 'Forecast dividends, discount factors, and present value by year.');
  ['Year', 'Dividend / Share', 'Growth', 'Discount Factor', 'PV Dividend'].forEach((header, idx) => {
    scheduleSheet.getCell(3, idx + 1).value = header;
  });
  styleHeaderRow(scheduleSheet, 3, 1, 5);
  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    scheduleSheet.getCell(excelRow, 1).value = row.year;
    if (idx === 0) {
      setFormulaCell(scheduleSheet.getCell(excelRow, 2), `=Assumptions!$B$4*(1+Assumptions!$B$5)`, row.dividendPerShare);
    } else {
      setFormulaCell(scheduleSheet.getCell(excelRow, 2), `=B${excelRow - 1}*(1+Assumptions!$B$5)`, row.dividendPerShare);
    }
    setFormulaCell(scheduleSheet.getCell(excelRow, 3), '=Assumptions!$B$5', row.growth);
    setFormulaCell(scheduleSheet.getCell(excelRow, 4), `=1/((1+Assumptions!$B$7)^A${excelRow})`, row.discountFactor);
    setFormulaCell(scheduleSheet.getCell(excelRow, 5), `=B${excelRow}*D${excelRow}`, row.pvDividend);
    setCurrency(scheduleSheet.getCell(excelRow, 2));
    setPercent(scheduleSheet.getCell(excelRow, 3));
    scheduleSheet.getCell(excelRow, 4).numFmt = '0.0000x';
    setCurrency(scheduleSheet.getCell(excelRow, 5));
    setOutputCell(scheduleSheet.getCell(excelRow, 1));
  });
  styleGrid(scheduleSheet, 3, 3 + output.rows.length, 1, 5);

  const lastScheduleRow = 3 + output.rows.length;
  const summarySheet = workbook.addWorksheet('Summary');
  applyWorksheetChrome(summarySheet, { tabColor: 'FF334155' });
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 34;
  summarySheet.getColumn(2).width = 18;
  addSheetTitle(summarySheet, 'Valuation Summary', 2, 'Focus on implied value, terminal contribution, and current yield.');
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  styleHeaderRow(summarySheet, 3, 1, 2);

  const summaryDefs: Array<[string, string, number | null, 'currency' | 'percent']> = [
    ['PV of Forecast Dividends', `=SUM('Dividend Schedule'!E4:E${lastScheduleRow})`, output.rows.reduce((sum, row) => sum + row.pvDividend, 0), 'currency'],
    ['Terminal Dividend', `='Dividend Schedule'!B${lastScheduleRow}*(1+Assumptions!$B$6)`, output.terminalDividend, 'currency'],
    ['Terminal Value', `=B5/(Assumptions!$B$7-Assumptions!$B$6)`, output.terminalValue, 'currency'],
    ['PV of Terminal Value', `=B6/((1+Assumptions!$B$7)^Assumptions!$B$8)`, output.pvTerminalValue, 'currency'],
    ['Implied Value / Share', '=B4+B7', output.impliedValuePerShare, 'currency'],
    ['Current Price', '=Assumptions!$B$9', input.current_price, 'currency'],
    ['Upside / Downside', '=IF(B9>0,B8/B9-1,0)', output.priceUpsidePct ?? 0, 'percent'],
    ['Current Dividend Yield', '=IF(Assumptions!$B$9>0,Assumptions!$B$4/Assumptions!$B$9,0)', output.impliedYield, 'percent'],
  ];
  summaryDefs.forEach(([label, formula, result, fmt], idx) => {
    const row = 4 + idx;
    summarySheet.getCell(row, 1).value = label;
    setFormulaCell(summarySheet.getCell(row, 2), formula, result);
    if (fmt === 'currency') setCurrency(summarySheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(summarySheet.getCell(row, 2));
    setOutputCell(summarySheet.getCell(row, 1));
  });
  styleGrid(summarySheet, 3, 11, 1, 2);

  const checksSheet = workbook.addWorksheet('Checks');
  applyWorksheetChrome(checksSheet, { tabColor: 'FFB45309' });
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 34;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  addSheetTitle(checksSheet, 'Checks', 3, 'Use this tab to confirm core model integrity before relying on the output.');
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'Cost of equity > terminal growth';
  setFormulaCell(checksSheet.getCell('B4'), '=Assumptions!$B$7-Assumptions!$B$6', input.cost_of_equity - input.terminal_growth);
  setPercent(checksSheet.getCell('B4'));
  setFormulaCell(checksSheet.getCell('C4'), '=IF(B4>0,"PASS","FAIL")', input.cost_of_equity > input.terminal_growth ? 'PASS' : 'FAIL');
  checksSheet.getCell('A5').value = 'Implied value / share finite';
  setFormulaCell(checksSheet.getCell('B5'), '=Summary!B8', output.impliedValuePerShare);
  setCurrency(checksSheet.getCell('B5'));
  setFormulaCell(checksSheet.getCell('C5'), '=IF(ISNUMBER(B5),"PASS","FAIL")', Number.isFinite(output.impliedValuePerShare) ? 'PASS' : 'FAIL');
  for (let row = 4; row <= 5; row += 1) for (let col = 1; col <= 3; col += 1) setOutputCell(checksSheet.getCell(row, col));
  styleGrid(checksSheet, 3, 5, 1, 3);

  const equationsSheet = workbook.addWorksheet('Equations');
  applyWorksheetChrome(equationsSheet, { tabColor: 'FF64748B' });
  equationsSheet.getColumn(1).width = 28;
  equationsSheet.getColumn(2).width = 90;
  addSheetTitle(equationsSheet, 'Equations', 2, 'Audit trail for the core valuation formulas used in the workbook.');
  equationsSheet.getCell('A3').value = 'Item';
  equationsSheet.getCell('B3').value = 'Equation';
  styleHeaderRow(equationsSheet, 3, 1, 2);
  const equations: Array<[string, string]> = [
    ['Dividend forecast', 'Dividend_t = Dividend_(t-1) * (1 + g)'],
    ['PV of dividend', 'PV Dividend = Dividend / (1 + ke)^t'],
    ['Terminal value', 'TV = Dividend_(t+1) / (ke - g_terminal)'],
    ['Implied value / share', 'Value = Sum(PV Dividends) + PV(Terminal Value)'],
  ];
  equations.forEach(([item, eq], idx) => {
    const row = 4 + idx;
    equationsSheet.getCell(row, 1).value = item;
    equationsSheet.getCell(row, 2).value = eq;
    setOutputCell(equationsSheet.getCell(row, 1));
    setOutputCell(equationsSheet.getCell(row, 2));
  });
  styleGrid(equationsSheet, 3, 7, 1, 2);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const dividendDiscountModel: ModelDef<DividendDiscountInput, DividendDiscountOutput> = {
  slug: 'dividend-discount-model',
  name: 'Dividend Discount Model',
  category: 'Corporate Finance',
  description: 'Forecast dividends, discount them to present value, and derive an implied per-share value under a stable dividend framework.',
  inputSchema: DividendDiscountInputSchema,
  uiSchema: dividendDiscountUiSchema,
  compute: computeDividendDiscount,
  buildWorkbook: buildDividendDiscountWorkbook,
  filename: () => 'CapitalBase_Dividend_Discount_Model.xlsx',
};

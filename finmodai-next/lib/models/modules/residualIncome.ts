import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
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

export const ResidualIncomeInputSchema = z
  .object({
    beginning_book_value_per_share: z.number().positive(),
    roe: z.number().min(0).max(0.5),
    payout_ratio: z.number().min(0).max(1),
    cost_of_equity: z.number().min(0.03).max(0.25),
    terminal_growth: z.number().min(0).max(0.06),
    forecast_years: z.number().int().min(3).max(15).default(5),
    current_price: z.number().positive().default(0),
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

type ResidualIncomeInput = z.infer<typeof ResidualIncomeInputSchema>;

type ResidualIncomeRow = {
  year: number;
  beginningBook: number;
  netIncome: number;
  dividend: number;
  endingBook: number;
  equityCharge: number;
  residualIncome: number;
  discountFactor: number;
  pvResidualIncome: number;
};

type ResidualIncomeOutput = {
  rows: ResidualIncomeRow[];
  terminalResidualIncome: number;
  terminalValue: number;
  pvTerminalValue: number;
  intrinsicValuePerShare: number;
  upsidePct: number | null;
};

const residualIncomeUiSchema: UISchema = {
  sections: [
    {
      title: 'Residual Income Inputs',
      fields: [
        { key: 'beginning_book_value_per_share', label: 'Beginning Book Value / Share', type: 'currency', required: true, defaultValue: 30 },
        { key: 'roe', label: 'Return on Equity', type: 'percent', required: true, defaultValue: 0.15 },
        { key: 'payout_ratio', label: 'Payout Ratio', type: 'percent', required: true, defaultValue: 0.35 },
        { key: 'cost_of_equity', label: 'Cost of Equity', type: 'percent', required: true, defaultValue: 0.09 },
        { key: 'terminal_growth', label: 'Terminal Growth', type: 'percent', required: true, defaultValue: 0.025 },
        { key: 'forecast_years', label: 'Forecast Years', type: 'number', required: true, defaultValue: 5 },
        { key: 'current_price', label: 'Current Share Price', type: 'currency', required: true, defaultValue: 55 },
      ],
    },
  ],
};

function computeResidualIncome(input: ResidualIncomeInput): ResidualIncomeOutput {
  const rows: ResidualIncomeRow[] = [];
  let bookValue = input.beginning_book_value_per_share;

  for (let year = 1; year <= input.forecast_years; year += 1) {
    const netIncome = bookValue * input.roe;
    const dividend = netIncome * input.payout_ratio;
    const endingBook = bookValue + netIncome - dividend;
    const equityCharge = bookValue * input.cost_of_equity;
    const residualIncome = netIncome - equityCharge;
    const discountFactor = 1 / Math.pow(1 + input.cost_of_equity, year);

    rows.push({
      year,
      beginningBook: bookValue,
      netIncome,
      dividend,
      endingBook,
      equityCharge,
      residualIncome,
      discountFactor,
      pvResidualIncome: residualIncome * discountFactor,
    });

    bookValue = endingBook;
  }

  const lastRow = rows[rows.length - 1];
  const terminalResidualIncome = lastRow.residualIncome * (1 + input.terminal_growth);
  const terminalValue = terminalResidualIncome / (input.cost_of_equity - input.terminal_growth);
  const pvTerminalValue = terminalValue / Math.pow(1 + input.cost_of_equity, input.forecast_years);
  const intrinsicValuePerShare = input.beginning_book_value_per_share + rows.reduce((sum, row) => sum + row.pvResidualIncome, 0) + pvTerminalValue;
  const upsidePct = input.current_price > 0 ? intrinsicValuePerShare / input.current_price - 1 : null;

  return {
    rows,
    terminalResidualIncome,
    terminalValue,
    pvTerminalValue,
    intrinsicValuePerShare,
    upsidePct,
  };
}

async function buildResidualIncomeWorkbook(input: ResidualIncomeInput, output: ResidualIncomeOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 36;
  assumptionsSheet.getColumn(2).width = 18;
  assumptionsSheet.getCell('A1').value = 'Residual Income Assumptions';
  assumptionsSheet.getCell('A1').font = { bold: true, size: 14 };
  assumptionsSheet.getCell('A3').value = 'Input';
  assumptionsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(assumptionsSheet, 3, 1, 2);
  const assumptionRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Beginning Book Value / Share', input.beginning_book_value_per_share, 'currency'],
    ['Return on Equity', input.roe, 'percent'],
    ['Payout Ratio', input.payout_ratio, 'percent'],
    ['Cost of Equity', input.cost_of_equity, 'percent'],
    ['Terminal Growth', input.terminal_growth, 'percent'],
    ['Forecast Years', input.forecast_years, 'number'],
    ['Current Share Price', input.current_price, 'currency'],
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

  const scheduleSheet = workbook.addWorksheet('Residual Income');
  scheduleSheet.views = [{ state: 'frozen', ySplit: 3 }];
  scheduleSheet.columns = [
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];
  scheduleSheet.getCell('A1').value = 'Residual Income Schedule';
  scheduleSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Year', 'Beg. BVPS', 'Net Income', 'Dividend', 'End BVPS', 'Equity Charge', 'Residual Income', 'Disc. Factor', 'PV RI'].forEach((header, idx) => {
    scheduleSheet.getCell(3, idx + 1).value = header;
  });
  styleHeaderRow(scheduleSheet, 3, 1, 9);
  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    scheduleSheet.getCell(excelRow, 1).value = row.year;
    if (idx === 0) {
      setFormulaCell(scheduleSheet.getCell(excelRow, 2), '=Assumptions!$B$4', row.beginningBook);
    } else {
      setFormulaCell(scheduleSheet.getCell(excelRow, 2), `=E${excelRow - 1}`, row.beginningBook);
    }
    setFormulaCell(scheduleSheet.getCell(excelRow, 3), `=B${excelRow}*Assumptions!$B$5`, row.netIncome);
    setFormulaCell(scheduleSheet.getCell(excelRow, 4), `=C${excelRow}*Assumptions!$B$6`, row.dividend);
    setFormulaCell(scheduleSheet.getCell(excelRow, 5), `=B${excelRow}+C${excelRow}-D${excelRow}`, row.endingBook);
    setFormulaCell(scheduleSheet.getCell(excelRow, 6), `=B${excelRow}*Assumptions!$B$7`, row.equityCharge);
    setFormulaCell(scheduleSheet.getCell(excelRow, 7), `=C${excelRow}-F${excelRow}`, row.residualIncome);
    setFormulaCell(scheduleSheet.getCell(excelRow, 8), `=1/((1+Assumptions!$B$7)^A${excelRow})`, row.discountFactor);
    setFormulaCell(scheduleSheet.getCell(excelRow, 9), `=G${excelRow}*H${excelRow}`, row.pvResidualIncome);
    for (const c of [2, 3, 4, 5, 6, 7, 9]) setCurrency(scheduleSheet.getCell(excelRow, c));
    scheduleSheet.getCell(excelRow, 8).numFmt = '0.0000x';
    setOutputCell(scheduleSheet.getCell(excelRow, 1));
  });
  styleGrid(scheduleSheet, 3, 3 + output.rows.length, 1, 9);

  const lastScheduleRow = 3 + output.rows.length;
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 34;
  summarySheet.getColumn(2).width = 18;
  summarySheet.getCell('A1').value = 'Valuation Summary';
  summarySheet.getCell('A1').font = { bold: true, size: 14 };
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  styleHeaderRow(summarySheet, 3, 1, 2);
  const summaryRows: Array<[string, string, number, 'currency' | 'percent']> = [
    ['Beginning Book Value / Share', '=Assumptions!$B$4', input.beginning_book_value_per_share, 'currency'],
    ['PV of Forecast Residual Income', `=SUM('Residual Income'!I4:I${lastScheduleRow})`, output.rows.reduce((sum, row) => sum + row.pvResidualIncome, 0), 'currency'],
    ['Terminal Residual Income', `='Residual Income'!G${lastScheduleRow}*(1+Assumptions!$B$8)`, output.terminalResidualIncome, 'currency'],
    ['PV of Terminal Residual Income', `=B6/(Assumptions!$B$7-Assumptions!$B$8)/((1+Assumptions!$B$7)^Assumptions!$B$9)`, output.pvTerminalValue, 'currency'],
    ['Intrinsic Value / Share', '=B4+B5+B7', output.intrinsicValuePerShare, 'currency'],
    ['Current Share Price', '=Assumptions!$B$10', input.current_price, 'currency'],
    ['Upside / Downside', '=IF(B9>0,B8/B9-1,0)', output.upsidePct ?? 0, 'percent'],
  ];
  summaryRows.forEach(([label, formula, value, fmt], idx) => {
    const row = 4 + idx;
    summarySheet.getCell(row, 1).value = label;
    setFormulaCell(summarySheet.getCell(row, 2), formula, value);
    if (fmt === 'currency') setCurrency(summarySheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(summarySheet.getCell(row, 2));
    setOutputCell(summarySheet.getCell(row, 1));
  });
  styleGrid(summarySheet, 3, 10, 1, 2);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 36;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  checksSheet.getCell('A1').value = 'Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'Cost of equity > terminal growth';
  setFormulaCell(checksSheet.getCell('B4'), '=Assumptions!$B$7-Assumptions!$B$8', input.cost_of_equity - input.terminal_growth);
  setPercent(checksSheet.getCell('B4'));
  setFormulaCell(checksSheet.getCell('C4'), '=IF(B4>0,"PASS","FAIL")', input.cost_of_equity > input.terminal_growth ? 'PASS' : 'FAIL');
  checksSheet.getCell('A5').value = 'Book value remains positive';
  setFormulaCell(checksSheet.getCell('B5'), `='Residual Income'!E${lastScheduleRow}`, output.rows[output.rows.length - 1].endingBook);
  setCurrency(checksSheet.getCell('B5'));
  setFormulaCell(checksSheet.getCell('C5'), '=IF(B5>0,"PASS","FAIL")', output.rows[output.rows.length - 1].endingBook > 0 ? 'PASS' : 'FAIL');
  for (let row = 4; row <= 5; row += 1) for (let col = 1; col <= 3; col += 1) setOutputCell(checksSheet.getCell(row, col));
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
    ['Net income', 'Net Income = Beginning Book Value * ROE'],
    ['Ending book value', 'Ending BV = Beginning BV + Net Income - Dividend'],
    ['Residual income', 'Residual Income = Net Income - (Cost of Equity * Beginning BV)'],
    ['Intrinsic value', 'Value = Beginning BV + PV(Forecast RI) + PV(Terminal RI)'],
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

export const residualIncomeModel: ModelDef<ResidualIncomeInput, ResidualIncomeOutput> = {
  slug: 'residual-income-model',
  name: 'Residual Income Model',
  category: 'Corporate Finance',
  description: 'Value equity from beginning book value and forecast residual income above the cost of equity charge.',
  inputSchema: ResidualIncomeInputSchema,
  uiSchema: residualIncomeUiSchema,
  compute: computeResidualIncome,
  buildWorkbook: buildResidualIncomeWorkbook,
  filename: () => 'CapitalBase_Residual_Income_Model.xlsx',
};

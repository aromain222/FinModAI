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

export const DebtAmortizationRefiInputSchema = z.object({
  opening_debt: z.number().positive(),
  opening_cash: z.number().min(0).default(0),
  ebitda: z.number().positive(),
  opening_interest_rate: z.number().min(0).max(0.25),
  annual_amortization_pct: z.number().min(0).max(1),
  annual_cash_sweep: z.number().min(0).default(0),
  forecast_years: z.number().int().min(3).max(15).default(5),
  refinance_year: z.number().int().min(1).max(15).default(3),
  refinance_rate: z.number().min(0).max(0.25),
  tax_rate: z.number().min(0).max(0.5).default(0.25),
});

type DebtAmortizationRefiInput = z.infer<typeof DebtAmortizationRefiInputSchema>;

type DebtRow = {
  year: number;
  beginningDebt: number;
  amortization: number;
  cashSweep: number;
  refinanceAmount: number;
  endingDebt: number;
  interestRate: number;
  interestExpense: number;
  netDebt: number;
  leverage: number;
  coverage: number;
};

type DebtAmortizationRefiOutput = {
  rows: DebtRow[];
  endingDebt: number;
  endingNetDebt: number;
  peakLeverage: number;
  minCoverage: number;
};

const debtAmortizationRefiUiSchema: UISchema = {
  sections: [
    {
      title: 'Debt Stack',
      fields: [
        { key: 'opening_debt', label: 'Opening Debt', type: 'currency', required: true, defaultValue: 2500 },
        { key: 'opening_cash', label: 'Opening Cash', type: 'currency', required: true, defaultValue: 400 },
        { key: 'ebitda', label: 'EBITDA', type: 'currency', required: true, defaultValue: 900 },
        { key: 'opening_interest_rate', label: 'Opening Interest Rate', type: 'percent', required: true, defaultValue: 0.075 },
        { key: 'annual_amortization_pct', label: 'Annual Amortization %', type: 'percent', required: true, defaultValue: 0.1 },
        { key: 'annual_cash_sweep', label: 'Annual Cash Sweep', type: 'currency', required: true, defaultValue: 100 },
      ],
    },
    {
      title: 'Refi Assumptions',
      fields: [
        { key: 'forecast_years', label: 'Forecast Years', type: 'number', required: true, defaultValue: 5 },
        { key: 'refinance_year', label: 'Refinance Year', type: 'number', required: true, defaultValue: 3 },
        { key: 'refinance_rate', label: 'Refinance Rate', type: 'percent', required: true, defaultValue: 0.065 },
        { key: 'tax_rate', label: 'Tax Rate', type: 'percent', required: true, defaultValue: 0.25 },
      ],
    },
  ],
};

function computeDebtAmortizationRefi(input: DebtAmortizationRefiInput): DebtAmortizationRefiOutput {
  const rows: DebtRow[] = [];
  let debt = input.opening_debt;
  let currentRate = input.opening_interest_rate;

  for (let year = 1; year <= input.forecast_years; year += 1) {
    const beginningDebt = debt;
    const amortization = Math.min(beginningDebt * input.annual_amortization_pct, beginningDebt);
    const debtAfterAmort = beginningDebt - amortization;
    const cashSweep = Math.min(input.annual_cash_sweep, debtAfterAmort);
    const postSweepDebt = debtAfterAmort - cashSweep;
    const refinanceAmount = year === input.refinance_year ? postSweepDebt : 0;
    const interestRate = year >= input.refinance_year ? input.refinance_rate : currentRate;
    const endingDebt = postSweepDebt;
    const interestExpense = ((beginningDebt + endingDebt) / 2) * interestRate;
    const netDebt = Math.max(endingDebt - input.opening_cash, 0);
    const leverage = input.ebitda > 0 ? endingDebt / input.ebitda : 0;
    const coverage = interestExpense > 0 ? input.ebitda / interestExpense : 999;

    rows.push({
      year,
      beginningDebt,
      amortization,
      cashSweep,
      refinanceAmount,
      endingDebt,
      interestRate,
      interestExpense,
      netDebt,
      leverage,
      coverage,
    });

    debt = endingDebt;
    if (year === input.refinance_year) currentRate = input.refinance_rate;
  }

  return {
    rows,
    endingDebt: rows[rows.length - 1].endingDebt,
    endingNetDebt: rows[rows.length - 1].netDebt,
    peakLeverage: Math.max(...rows.map((row) => row.leverage)),
    minCoverage: Math.min(...rows.map((row) => row.coverage)),
  };
}

async function buildDebtAmortizationRefiWorkbook(
  input: DebtAmortizationRefiInput,
  output: DebtAmortizationRefiOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 36;
  assumptionsSheet.getColumn(2).width = 18;
  assumptionsSheet.getCell('A1').value = 'Debt / Refi Assumptions';
  assumptionsSheet.getCell('A1').font = { bold: true, size: 14 };
  assumptionsSheet.getCell('A3').value = 'Input';
  assumptionsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(assumptionsSheet, 3, 1, 2);
  const assumptionRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Opening Debt', input.opening_debt, 'currency'],
    ['Opening Cash', input.opening_cash, 'currency'],
    ['EBITDA', input.ebitda, 'currency'],
    ['Opening Interest Rate', input.opening_interest_rate, 'percent'],
    ['Annual Amortization %', input.annual_amortization_pct, 'percent'],
    ['Annual Cash Sweep', input.annual_cash_sweep, 'currency'],
    ['Forecast Years', input.forecast_years, 'number'],
    ['Refinance Year', input.refinance_year, 'number'],
    ['Refinance Rate', input.refinance_rate, 'percent'],
    ['Tax Rate', input.tax_rate, 'percent'],
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
  styleGrid(assumptionsSheet, 3, 13, 1, 2);

  const scheduleSheet = workbook.addWorksheet('Debt Schedule');
  scheduleSheet.views = [{ state: 'frozen', ySplit: 3 }];
  scheduleSheet.columns = [
    { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 12 },
  ];
  scheduleSheet.getCell('A1').value = 'Debt Schedule';
  scheduleSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Year', 'Beg. Debt', 'Amort.', 'Cash Sweep', 'Refi Amt', 'End Debt', 'Rate', 'Interest', 'Net Debt', 'Leverage', 'Coverage'].forEach((header, idx) => {
    scheduleSheet.getCell(3, idx + 1).value = header;
  });
  styleHeaderRow(scheduleSheet, 3, 1, 11);
  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    scheduleSheet.getCell(excelRow, 1).value = row.year;
    scheduleSheet.getCell(excelRow, 2).value = row.beginningDebt;
    scheduleSheet.getCell(excelRow, 3).value = row.amortization;
    scheduleSheet.getCell(excelRow, 4).value = row.cashSweep;
    scheduleSheet.getCell(excelRow, 5).value = row.refinanceAmount;
    scheduleSheet.getCell(excelRow, 6).value = row.endingDebt;
    scheduleSheet.getCell(excelRow, 7).value = row.interestRate;
    scheduleSheet.getCell(excelRow, 8).value = row.interestExpense;
    scheduleSheet.getCell(excelRow, 9).value = row.netDebt;
    scheduleSheet.getCell(excelRow, 10).value = row.leverage;
    scheduleSheet.getCell(excelRow, 11).value = row.coverage;
    for (const c of [2,3,4,5,6,8,9]) setCurrency(scheduleSheet.getCell(excelRow, c));
    setPercent(scheduleSheet.getCell(excelRow, 7));
    scheduleSheet.getCell(excelRow, 10).numFmt = '0.00x';
    scheduleSheet.getCell(excelRow, 11).numFmt = '0.00x';
    for (let c = 1; c <= 11; c += 1) setOutputCell(scheduleSheet.getCell(excelRow, c));
  });
  styleGrid(scheduleSheet, 3, 3 + output.rows.length, 1, 11);

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 34;
  summarySheet.getColumn(2).width = 18;
  summarySheet.getCell('A1').value = 'Credit Summary';
  summarySheet.getCell('A1').font = { bold: true, size: 14 };
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  styleHeaderRow(summarySheet, 3, 1, 2);
  const summaryRows: Array<[string, number, 'currency' | 'multiple']> = [
    ['Ending Debt', output.endingDebt, 'currency'],
    ['Ending Net Debt', output.endingNetDebt, 'currency'],
    ['Peak Leverage', output.peakLeverage, 'multiple'],
    ['Minimum Coverage', output.minCoverage, 'multiple'],
  ];
  summaryRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    summarySheet.getCell(row, 1).value = label;
    summarySheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(summarySheet.getCell(row, 2));
    if (fmt === 'multiple') summarySheet.getCell(row, 2).numFmt = '0.00x';
    setOutputCell(summarySheet.getCell(row, 1));
    setOutputCell(summarySheet.getCell(row, 2));
  });
  styleGrid(summarySheet, 3, 7, 1, 2);

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
  checksSheet.getCell('A4').value = 'Ending debt non-negative';
  checksSheet.getCell('B4').value = output.endingDebt;
  checksSheet.getCell('C4').value = output.endingDebt >= 0 ? 'PASS' : 'FAIL';
  setCurrency(checksSheet.getCell('B4'));
  checksSheet.getCell('A5').value = 'Minimum coverage > 1.0x';
  checksSheet.getCell('B5').value = output.minCoverage;
  checksSheet.getCell('C5').value = output.minCoverage > 1 ? 'PASS' : 'FAIL';
  checksSheet.getCell('B5').numFmt = '0.00x';
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
    ['Debt paydown', 'Ending Debt = Beginning Debt - Amortization - Cash Sweep'],
    ['Interest expense', 'Interest = Average Debt * Interest Rate'],
    ['Leverage', 'Leverage = Ending Debt / EBITDA'],
    ['Coverage', 'Coverage = EBITDA / Interest Expense'],
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

export const debtAmortizationRefiModel: ModelDef<DebtAmortizationRefiInput, DebtAmortizationRefiOutput> = {
  slug: 'debt-amortization-refi',
  name: 'Debt Amortization / Refi Model',
  category: 'Corporate Finance',
  description: 'Model debt paydown, refinancing, leverage, and coverage under a simple capital structure plan.',
  inputSchema: DebtAmortizationRefiInputSchema,
  uiSchema: debtAmortizationRefiUiSchema,
  compute: computeDebtAmortizationRefi,
  buildWorkbook: buildDebtAmortizationRefiWorkbook,
  filename: () => 'CapitalBase_Debt_Amortization_Refi.xlsx',
};

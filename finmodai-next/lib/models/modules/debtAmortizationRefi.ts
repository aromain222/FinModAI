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

async function buildDebtAmortizationRefiWorkbook(input: DebtAmortizationRefiInput, output: DebtAmortizationRefiOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  applyWorksheetChrome(assumptionsSheet, { tabColor: 'FF1D4ED8' });
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 36;
  assumptionsSheet.getColumn(2).width = 18;
  addSheetTitle(assumptionsSheet, 'Debt / Refi Assumptions', 2, 'Editable inputs are highlighted. All outputs are formula-linked.');
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
  applyWorksheetChrome(scheduleSheet, { tabColor: 'FF0F766E' });
  scheduleSheet.views = [{ state: 'frozen', ySplit: 3 }];
  scheduleSheet.columns = [
    { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 12 },
  ];
  addSheetTitle(scheduleSheet, 'Debt Schedule', 11, 'Track amortization, sweep, refinancing, leverage, and coverage year by year.');
  ['Year', 'Beg. Debt', 'Amort.', 'Cash Sweep', 'Refi Amt', 'End Debt', 'Rate', 'Interest', 'Net Debt', 'Leverage', 'Coverage'].forEach((header, idx) => {
    scheduleSheet.getCell(3, idx + 1).value = header;
  });
  styleHeaderRow(scheduleSheet, 3, 1, 11);
  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    scheduleSheet.getCell(excelRow, 1).value = row.year;
    if (idx === 0) {
      setFormulaCell(scheduleSheet.getCell(excelRow, 2), '=Assumptions!$B$4', row.beginningDebt);
    } else {
      setFormulaCell(scheduleSheet.getCell(excelRow, 2), `=F${excelRow - 1}`, row.beginningDebt);
    }
    setFormulaCell(scheduleSheet.getCell(excelRow, 3), `=MIN(B${excelRow}*Assumptions!$B$8,B${excelRow})`, row.amortization);
    setFormulaCell(scheduleSheet.getCell(excelRow, 4), `=MIN(Assumptions!$B$9,B${excelRow}-C${excelRow})`, row.cashSweep);
    setFormulaCell(scheduleSheet.getCell(excelRow, 5), `=IF(A${excelRow}=Assumptions!$B$11,B${excelRow}-C${excelRow}-D${excelRow},0)`, row.refinanceAmount);
    setFormulaCell(scheduleSheet.getCell(excelRow, 6), `=MAX(0,B${excelRow}-C${excelRow}-D${excelRow})`, row.endingDebt);
    setFormulaCell(scheduleSheet.getCell(excelRow, 7), `=IF(A${excelRow}>=Assumptions!$B$11,Assumptions!$B$12,Assumptions!$B$7)`, row.interestRate);
    setFormulaCell(scheduleSheet.getCell(excelRow, 8), `=((B${excelRow}+F${excelRow})/2)*G${excelRow}`, row.interestExpense);
    setFormulaCell(scheduleSheet.getCell(excelRow, 9), `=MAX(F${excelRow}-Assumptions!$B$5,0)`, row.netDebt);
    setFormulaCell(scheduleSheet.getCell(excelRow, 10), `=IF(Assumptions!$B$6>0,F${excelRow}/Assumptions!$B$6,0)`, row.leverage);
    setFormulaCell(scheduleSheet.getCell(excelRow, 11), `=IF(H${excelRow}>0,Assumptions!$B$6/H${excelRow},999)`, row.coverage);
    for (const c of [2, 3, 4, 5, 6, 8, 9]) setCurrency(scheduleSheet.getCell(excelRow, c));
    setPercent(scheduleSheet.getCell(excelRow, 7));
    scheduleSheet.getCell(excelRow, 10).numFmt = '0.00x';
    scheduleSheet.getCell(excelRow, 11).numFmt = '0.00x';
    setOutputCell(scheduleSheet.getCell(excelRow, 1));
  });
  styleGrid(scheduleSheet, 3, 3 + output.rows.length, 1, 11);

  const lastScheduleRow = 3 + output.rows.length;
  const summarySheet = workbook.addWorksheet('Summary');
  applyWorksheetChrome(summarySheet, { tabColor: 'FF334155' });
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 34;
  summarySheet.getColumn(2).width = 18;
  addSheetTitle(summarySheet, 'Credit Summary', 2, 'Focus on ending debt, leverage profile, and minimum coverage.');
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  styleHeaderRow(summarySheet, 3, 1, 2);
  const summaryRows: Array<[string, string, number, 'currency' | 'multiple']> = [
    ['Ending Debt', `='Debt Schedule'!F${lastScheduleRow}`, output.endingDebt, 'currency'],
    ['Ending Net Debt', `='Debt Schedule'!I${lastScheduleRow}`, output.endingNetDebt, 'currency'],
    ['Peak Leverage', `=MAX('Debt Schedule'!J4:J${lastScheduleRow})`, output.peakLeverage, 'multiple'],
    ['Minimum Coverage', `=MIN('Debt Schedule'!K4:K${lastScheduleRow})`, output.minCoverage, 'multiple'],
  ];
  summaryRows.forEach(([label, formula, value, fmt], idx) => {
    const row = 4 + idx;
    summarySheet.getCell(row, 1).value = label;
    setFormulaCell(summarySheet.getCell(row, 2), formula, value);
    if (fmt === 'currency') setCurrency(summarySheet.getCell(row, 2));
    if (fmt === 'multiple') summarySheet.getCell(row, 2).numFmt = '0.00x';
    setOutputCell(summarySheet.getCell(row, 1));
  });
  styleGrid(summarySheet, 3, 7, 1, 2);

  const checksSheet = workbook.addWorksheet('Checks');
  applyWorksheetChrome(checksSheet, { tabColor: 'FFB45309' });
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 36;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  addSheetTitle(checksSheet, 'Checks', 3, 'Use this tab to confirm debt balances and coverage stay within an acceptable range.');
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'Ending debt non-negative';
  setFormulaCell(checksSheet.getCell('B4'), '=Summary!B4', output.endingDebt);
  setCurrency(checksSheet.getCell('B4'));
  setFormulaCell(checksSheet.getCell('C4'), '=IF(B4>=0,"PASS","FAIL")', output.endingDebt >= 0 ? 'PASS' : 'FAIL');
  checksSheet.getCell('A5').value = 'Minimum coverage > 1.0x';
  setFormulaCell(checksSheet.getCell('B5'), '=Summary!B7', output.minCoverage);
  checksSheet.getCell('B5').numFmt = '0.00x';
  setFormulaCell(checksSheet.getCell('C5'), '=IF(B5>1,"PASS","FAIL")', output.minCoverage > 1 ? 'PASS' : 'FAIL');
  for (let row = 4; row <= 5; row += 1) for (let col = 1; col <= 3; col += 1) setOutputCell(checksSheet.getCell(row, col));
  styleGrid(checksSheet, 3, 5, 1, 3);

  const equationsSheet = workbook.addWorksheet('Equations');
  applyWorksheetChrome(equationsSheet, { tabColor: 'FF64748B' });
  equationsSheet.getColumn(1).width = 28;
  equationsSheet.getColumn(2).width = 90;
  addSheetTitle(equationsSheet, 'Equations', 2, 'Audit trail for the debt and refinancing formulas used in the workbook.');
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
  name: 'Debt Amortization / Refi',
  category: 'Corporate Finance',
  description: 'Roll debt balances, scheduled amortization, cash sweeps, and refinancing assumptions into a credit summary.',
  inputSchema: DebtAmortizationRefiInputSchema,
  uiSchema: debtAmortizationRefiUiSchema,
  compute: computeDebtAmortizationRefi,
  buildWorkbook: buildDebtAmortizationRefiWorkbook,
  filename: () => 'CapitalBase_Debt_Amortization_Refi.xlsx',
};

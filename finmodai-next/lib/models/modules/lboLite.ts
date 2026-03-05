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
import { clamp } from '@/lib/models/modules/modelUtils';

const DebtTrancheSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  interest_rate: z.number().min(0).max(0.5),
});

export const LboLiteInputSchema = z
  .object({
    entry_multiple: z.number().min(3).max(30),
    ebitda: z.number().positive(),
    debt_tranches: z.array(DebtTrancheSchema).min(1),
    exit_multiple: z.number().min(3).max(30),
    holding_period: z.number().int().min(2).max(10),
  })
  .superRefine((input, ctx) => {
    const totalDebt = input.debt_tranches.reduce((sum, tranche) => sum + tranche.amount, 0);
    const entryEv = input.entry_multiple * input.ebitda;
    if (totalDebt >= entryEv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['debt_tranches'],
        message: 'total debt must be lower than entry enterprise value',
      });
    }
  });

type LboLiteInput = z.infer<typeof LboLiteInputSchema>;

type DebtScheduleRow = {
  year: number;
  debtOpen: number;
  interest: number;
  tax: number;
  maintenanceCapex: number;
  cashSweep: number;
  debtClose: number;
};

type LboLiteOutput = {
  entryEv: number;
  totalDebt: number;
  entryEquity: number;
  exitEv: number;
  remainingDebt: number;
  exitEquity: number;
  moic: number;
  irr: number;
  debtSchedule: DebtScheduleRow[];
  sensitivity: {
    entryAxis: number[];
    exitAxis: number[];
    irrGrid: number[][];
  };
};

const lboLiteUiSchema: UISchema = {
  sections: [
    {
      title: 'Core LBO Inputs',
      fields: [
        { key: 'entry_multiple', label: 'Entry Multiple', type: 'number', required: true, defaultValue: 10 },
        { key: 'ebitda', label: 'EBITDA', type: 'currency', required: true, defaultValue: 5000 },
        { key: 'exit_multiple', label: 'Exit Multiple', type: 'number', required: true, defaultValue: 12 },
        { key: 'holding_period', label: 'Holding Period (Years)', type: 'number', required: true, defaultValue: 5 },
      ],
    },
    {
      title: 'Debt Tranches',
      fields: [
        {
          key: 'debt_tranches',
          label: 'Debt Tranches',
          type: 'repeatableRows',
          minRows: 1,
          rowsSpec: [
            { key: 'name', label: 'Tranche', type: 'text', required: true },
            { key: 'amount', label: 'Amount', type: 'currency', required: true, defaultValue: 15000 },
            { key: 'interest_rate', label: 'Interest Rate', type: 'percent', required: true, defaultValue: 0.08 },
          ],
          defaultRows: [
            { name: 'Term Loan A', amount: 15000, interest_rate: 0.08 },
            { name: 'Term Loan B', amount: 7000, interest_rate: 0.1 },
          ],
        },
      ],
    },
  ],
};

function runLbo(entryMultiple: number, exitMultiple: number, input: LboLiteInput): Omit<LboLiteOutput, 'sensitivity'> {
  const entryEv = entryMultiple * input.ebitda;
  const balances = input.debt_tranches.map((tranche) => ({ ...tranche, balance: tranche.amount }));
  const totalDebt = balances.reduce((sum, tranche) => sum + tranche.balance, 0);
  const entryEquity = entryEv - totalDebt;

  const debtSchedule: DebtScheduleRow[] = [];

  for (let year = 1; year <= input.holding_period; year += 1) {
    const debtOpen = balances.reduce((sum, tranche) => sum + tranche.balance, 0);
    const interest = balances.reduce((sum, tranche) => sum + tranche.balance * tranche.interest_rate, 0);
    const taxable = Math.max(0, input.ebitda - interest);
    const tax = taxable * 0.25;
    const maintenanceCapex = input.ebitda * 0.15;
    const cashSweep = Math.max(0, input.ebitda - interest - tax - maintenanceCapex);
    const debtRepayment = Math.min(debtOpen, cashSweep);

    if (debtRepayment > 0 && debtOpen > 0) {
      balances.forEach((tranche) => {
        const share = tranche.balance / debtOpen;
        tranche.balance = Math.max(0, tranche.balance - debtRepayment * share);
      });
    }

    const debtClose = balances.reduce((sum, tranche) => sum + tranche.balance, 0);
    debtSchedule.push({
      year,
      debtOpen,
      interest,
      tax,
      maintenanceCapex,
      cashSweep: debtRepayment,
      debtClose,
    });
  }

  const remainingDebt = debtSchedule[debtSchedule.length - 1]?.debtClose ?? totalDebt;
  const exitEv = exitMultiple * input.ebitda;
  const exitEquity = exitEv - remainingDebt;
  const moic = exitEquity / entryEquity;
  const irr = Math.pow(moic, 1 / input.holding_period) - 1;

  return {
    entryEv,
    totalDebt,
    entryEquity,
    exitEv,
    remainingDebt,
    exitEquity,
    moic,
    irr,
    debtSchedule,
  };
}

function computeLboLite(input: LboLiteInput): LboLiteOutput {
  const base = runLbo(input.entry_multiple, input.exit_multiple, input);

  const entryAxis = [
    clamp(input.entry_multiple - 2, 3, 30),
    clamp(input.entry_multiple - 1, 3, 30),
    clamp(input.entry_multiple, 3, 30),
    clamp(input.entry_multiple + 1, 3, 30),
    clamp(input.entry_multiple + 2, 3, 30),
  ];

  const exitAxis = [
    clamp(input.exit_multiple - 2, 3, 30),
    clamp(input.exit_multiple - 1, 3, 30),
    clamp(input.exit_multiple, 3, 30),
    clamp(input.exit_multiple + 1, 3, 30),
    clamp(input.exit_multiple + 2, 3, 30),
  ];

  const irrGrid = entryAxis.map((entryMultiple) =>
    exitAxis.map((exitMultiple) => runLbo(entryMultiple, exitMultiple, input).irr),
  );

  return {
    ...base,
    sensitivity: {
      entryAxis,
      exitAxis,
      irrGrid,
    },
  };
}

async function buildLboLiteWorkbook(input: LboLiteInput, output: LboLiteOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const weightedInterestRate =
    input.debt_tranches.reduce((sum, tranche) => sum + tranche.amount * tranche.interest_rate, 0) / output.totalDebt;
  const feePct = 0.015;
  const fees = output.entryEv * feePct;
  const purchasePrice = output.entryEv - fees;
  const debtRepaymentTotal = output.debtSchedule.reduce((sum, row) => sum + row.cashSweep, 0);
  const firstYearTax = output.debtSchedule[0]?.tax ?? 0;
  const firstYearInterest = output.debtSchedule[0]?.interest ?? 0;
  const firstYearCapex = output.debtSchedule[0]?.maintenanceCapex ?? 0;
  const firstYearCashSweep = output.debtSchedule[0]?.cashSweep ?? 0;

  const sourcesSheet = workbook.addWorksheet('Sources & Uses');
  sourcesSheet.views = [{ state: 'frozen', ySplit: 3 }];
  sourcesSheet.getColumn(1).width = 36;
  sourcesSheet.getColumn(2).width = 18;
  sourcesSheet.getColumn(3).width = 18;

  sourcesSheet.getCell('A1').value = 'LBO Sources & Uses';
  sourcesSheet.getCell('A1').font = { bold: true, size: 14 };
  sourcesSheet.getCell('A3').value = 'Line Item';
  sourcesSheet.getCell('B3').value = 'Sources';
  sourcesSheet.getCell('C3').value = 'Uses';
  styleHeaderRow(sourcesSheet, 3, 1, 3);

  sourcesSheet.getCell('A4').value = 'Sources';
  sourcesSheet.getCell('A4').font = { bold: true };
  const debtLines = input.debt_tranches.map((tranche, idx) => {
    const row = 5 + idx;
    sourcesSheet.getCell(row, 1).value = `  ${tranche.name}`;
    sourcesSheet.getCell(row, 2).value = tranche.amount;
    setCurrency(sourcesSheet.getCell(row, 2));
    setInputCell(sourcesSheet.getCell(row, 2));
    setOutputCell(sourcesSheet.getCell(row, 1));
    return row;
  });

  const debtTotalRow = 5 + input.debt_tranches.length;
  sourcesSheet.getCell(debtTotalRow, 1).value = '  Total Debt';
  sourcesSheet.getCell(debtTotalRow, 2).value = output.totalDebt;
  sourcesSheet.getCell(debtTotalRow, 1).font = { bold: true };
  sourcesSheet.getCell(debtTotalRow, 2).font = { bold: true };
  setCurrency(sourcesSheet.getCell(debtTotalRow, 2));
  setOutputCell(sourcesSheet.getCell(debtTotalRow, 1));
  setOutputCell(sourcesSheet.getCell(debtTotalRow, 2));

  const equityRow = debtTotalRow + 1;
  sourcesSheet.getCell(equityRow, 1).value = '  Equity';
  sourcesSheet.getCell(equityRow, 2).value = output.entryEquity;
  setCurrency(sourcesSheet.getCell(equityRow, 2));
  setInputCell(sourcesSheet.getCell(equityRow, 2));
  setOutputCell(sourcesSheet.getCell(equityRow, 1));

  const sourceTotalRow = equityRow + 1;
  sourcesSheet.getCell(sourceTotalRow, 1).value = 'Total Sources';
  sourcesSheet.getCell(sourceTotalRow, 2).value = output.totalDebt + output.entryEquity;
  sourcesSheet.getCell(sourceTotalRow, 1).font = { bold: true };
  sourcesSheet.getCell(sourceTotalRow, 2).font = { bold: true };
  setCurrency(sourcesSheet.getCell(sourceTotalRow, 2));
  setOutputCell(sourcesSheet.getCell(sourceTotalRow, 1));
  setOutputCell(sourcesSheet.getCell(sourceTotalRow, 2));

  sourcesSheet.getCell('A4').value = 'Sources';
  const usesHeaderRow = 4;
  sourcesSheet.getCell(usesHeaderRow, 3).value = 'Uses';
  sourcesSheet.getCell(usesHeaderRow, 3).font = { bold: true };

  const purchaseRow = 5;
  sourcesSheet.getCell(purchaseRow, 1).value = 'Purchase Price';
  sourcesSheet.getCell(purchaseRow, 3).value = purchasePrice;
  setCurrency(sourcesSheet.getCell(purchaseRow, 3));
  setOutputCell(sourcesSheet.getCell(purchaseRow, 1));
  setOutputCell(sourcesSheet.getCell(purchaseRow, 3));

  const feeRow = 6;
  sourcesSheet.getCell(feeRow, 1).value = 'Transaction Fees (1.5%)';
  sourcesSheet.getCell(feeRow, 3).value = fees;
  setCurrency(sourcesSheet.getCell(feeRow, 3));
  setOutputCell(sourcesSheet.getCell(feeRow, 1));
  setOutputCell(sourcesSheet.getCell(feeRow, 3));

  const refiRow = 7;
  sourcesSheet.getCell(refiRow, 1).value = 'Debt Refi / Existing Debt';
  sourcesSheet.getCell(refiRow, 3).value = 0;
  setCurrency(sourcesSheet.getCell(refiRow, 3));
  setOutputCell(sourcesSheet.getCell(refiRow, 1));
  setOutputCell(sourcesSheet.getCell(refiRow, 3));

  const useTotalRow = 8;
  sourcesSheet.getCell(useTotalRow, 1).value = 'Total Uses';
  sourcesSheet.getCell(useTotalRow, 3).value = purchasePrice + fees;
  sourcesSheet.getCell(useTotalRow, 1).font = { bold: true };
  sourcesSheet.getCell(useTotalRow, 3).font = { bold: true };
  setCurrency(sourcesSheet.getCell(useTotalRow, 3));
  setOutputCell(sourcesSheet.getCell(useTotalRow, 1));
  setOutputCell(sourcesSheet.getCell(useTotalRow, 3));

  const checkRow = sourceTotalRow + 2;
  sourcesSheet.getCell(checkRow, 1).value = 'Sources - Uses Check';
  sourcesSheet.getCell(checkRow, 2).value = output.totalDebt + output.entryEquity - (purchasePrice + fees);
  sourcesSheet.getCell(checkRow, 3).value = Math.abs((output.totalDebt + output.entryEquity) - (purchasePrice + fees)) < 0.01 ? 'PASS' : 'FAIL';
  setCurrency(sourcesSheet.getCell(checkRow, 2));
  setOutputCell(sourcesSheet.getCell(checkRow, 1));
  setOutputCell(sourcesSheet.getCell(checkRow, 2));
  setOutputCell(sourcesSheet.getCell(checkRow, 3));
  styleGrid(sourcesSheet, 3, checkRow, 1, 3);

  const projectionsSheet = workbook.addWorksheet('Projections');
  projectionsSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  projectionsSheet.getColumn(1).width = 26;
  for (let col = 2; col <= 1 + input.holding_period; col += 1) {
    projectionsSheet.getColumn(col).width = 14;
  }

  projectionsSheet.getCell('A1').value = 'Operating Projections';
  projectionsSheet.getCell('A1').font = { bold: true, size: 14 };
  projectionsSheet.getCell(3, 1).value = 'Line Item';
  output.debtSchedule.forEach((row, idx) => {
    projectionsSheet.getCell(3, 2 + idx).value = `Year ${row.year}`;
  });
  styleHeaderRow(projectionsSheet, 3, 1, 1 + input.holding_period);

  const projectionRows: Array<[string, (row: DebtScheduleRow) => number, 'currency' | 'percent']> = [
    ['EBITDA', () => input.ebitda, 'currency'],
    ['Interest Expense', (r) => -r.interest, 'currency'],
    ['Taxes', (r) => -r.tax, 'currency'],
    ['Maintenance Capex', (r) => -r.maintenanceCapex, 'currency'],
    ['Cash Flow Available for Sweep', (r) => r.cashSweep, 'currency'],
    ['Debt / EBITDA', (r) => r.debtClose / input.ebitda, 'percent'],
  ];
  projectionRows.forEach(([label], idx) => {
    projectionsSheet.getCell(4 + idx, 1).value = label;
    setOutputCell(projectionsSheet.getCell(4 + idx, 1));
  });

  output.debtSchedule.forEach((row, yearIdx) => {
    const col = 2 + yearIdx;
    projectionRows.forEach(([, getter, fmt], idx) => {
      const cell = projectionsSheet.getCell(4 + idx, col);
      const value = getter(row);
      cell.value = value;
      if (fmt === 'currency') setCurrency(cell);
      if (fmt === 'percent') cell.numFmt = '0.00x';
      setOutputCell(cell);
    });
  });
  styleGrid(projectionsSheet, 3, 9, 1, 1 + input.holding_period);

  const debtSheet = workbook.addWorksheet('Debt Schedule');
  debtSheet.views = [{ state: 'frozen', ySplit: 3 }];
  debtSheet.columns = [{ width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  debtSheet.getCell('A1').value = 'Debt Schedule';
  debtSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Year', 'Debt Open', 'Debt Draw (+)', 'Repayment (-)', 'Interest', 'Cash Sweep', 'Debt Close'].forEach((header, idx) => {
    debtSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(debtSheet, 3, 1, 7);
  output.debtSchedule.forEach((row, idx) => {
    const excelRow = 4 + idx;
    debtSheet.getCell(excelRow, 1).value = row.year;
    debtSheet.getCell(excelRow, 2).value = row.debtOpen;
    debtSheet.getCell(excelRow, 3).value = 0;
    debtSheet.getCell(excelRow, 4).value = -row.cashSweep;
    debtSheet.getCell(excelRow, 5).value = row.interest;
    debtSheet.getCell(excelRow, 6).value = row.cashSweep;
    debtSheet.getCell(excelRow, 7).value = row.debtClose;
    for (let col = 2; col <= 7; col += 1) {
      setCurrency(debtSheet.getCell(excelRow, col));
      setOutputCell(debtSheet.getCell(excelRow, col));
    }
    setOutputCell(debtSheet.getCell(excelRow, 1));
  });

  styleGrid(debtSheet, 3, 3 + output.debtSchedule.length, 1, 7);

  const cashSweepSheet = workbook.addWorksheet('Cash Sweep');
  cashSweepSheet.views = [{ state: 'frozen', ySplit: 3 }];
  cashSweepSheet.columns = [{ width: 12 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  cashSweepSheet.getCell('A1').value = 'Cash Sweep Mechanics';
  cashSweepSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Year', 'EBITDA', 'Interest', 'Tax', 'Capex', 'Cash Sweep'].forEach((header, idx) => {
    cashSweepSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(cashSweepSheet, 3, 1, 6);
  output.debtSchedule.forEach((row, idx) => {
    const excelRow = 4 + idx;
    cashSweepSheet.getCell(excelRow, 1).value = row.year;
    cashSweepSheet.getCell(excelRow, 2).value = input.ebitda;
    cashSweepSheet.getCell(excelRow, 3).value = -row.interest;
    cashSweepSheet.getCell(excelRow, 4).value = -row.tax;
    cashSweepSheet.getCell(excelRow, 5).value = -row.maintenanceCapex;
    cashSweepSheet.getCell(excelRow, 6).value = row.cashSweep;
    for (let col = 2; col <= 6; col += 1) {
      setCurrency(cashSweepSheet.getCell(excelRow, col));
      setOutputCell(cashSweepSheet.getCell(excelRow, col));
    }
    setOutputCell(cashSweepSheet.getCell(excelRow, 1));
  });
  styleGrid(cashSweepSheet, 3, 3 + output.debtSchedule.length, 1, 6);

  const returnsSheet = workbook.addWorksheet('Returns');
  returnsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  returnsSheet.getColumn(1).width = 34;
  returnsSheet.getColumn(2).width = 18;
  for (let col = 4; col <= 10; col += 1) {
    returnsSheet.getColumn(col).width = 12;
  }

  returnsSheet.getCell('A1').value = 'Returns Summary';
  returnsSheet.getCell('A1').font = { bold: true, size: 14 };
  returnsSheet.getCell('A3').value = 'Metric';
  returnsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(returnsSheet, 3, 1, 2);

  const returnRows: Array<[string, number, 'currency' | 'percent' | 'multiple']> = [
    ['Entry EV', output.entryEv, 'currency'],
    ['Entry Equity', output.entryEquity, 'currency'],
    ['Exit EV', output.exitEv, 'currency'],
    ['Remaining Debt', output.remainingDebt, 'currency'],
    ['Exit Equity', output.exitEquity, 'currency'],
    ['MOIC', output.moic, 'multiple'],
    ['IRR', output.irr, 'percent'],
  ];
  returnRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    returnsSheet.getCell(row, 1).value = label;
    returnsSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(returnsSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(returnsSheet.getCell(row, 2));
    if (fmt === 'multiple') returnsSheet.getCell(row, 2).numFmt = '0.00x';
    setOutputCell(returnsSheet.getCell(row, 1));
    setOutputCell(returnsSheet.getCell(row, 2));
  });
  returnsSheet.getCell('A10').font = { bold: true };
  returnsSheet.getCell('B10').font = { bold: true };

  returnsSheet.getCell('A12').value = 'Equity Bridge';
  returnsSheet.getCell('A12').font = { bold: true };
  const equityBridgeRows: Array<[string, number]> = [
    ['Entry Equity', -output.entryEquity],
    ['Debt Paydown', debtRepaymentTotal],
    ['EV Change', output.exitEv - output.entryEv],
    ['Exit Equity', output.exitEquity],
  ];
  equityBridgeRows.forEach(([label, value], idx) => {
    const row = 13 + idx;
    returnsSheet.getCell(row, 1).value = `  ${label}`;
    returnsSheet.getCell(row, 2).value = value;
    setCurrency(returnsSheet.getCell(row, 2));
    setOutputCell(returnsSheet.getCell(row, 1));
    setOutputCell(returnsSheet.getCell(row, 2));
  });
  returnsSheet.getCell('A16').font = { bold: true };

  returnsSheet.getCell('D12').value = 'IRR Sensitivity (Entry x Exit)';
  returnsSheet.getCell('D12').font = { bold: true };
  returnsSheet.getCell('D13').value = 'Entry \\ Exit';
  styleHeaderRow(returnsSheet, 13, 4, 4 + output.sensitivity.exitAxis.length);
  output.sensitivity.exitAxis.forEach((value, idx) => {
    const cell = returnsSheet.getCell(13, 5 + idx);
    cell.value = value;
    cell.numFmt = '0.00x';
    setOutputCell(cell);
  });
  output.sensitivity.entryAxis.forEach((entryValue, rowIdx) => {
    const row = 14 + rowIdx;
    returnsSheet.getCell(row, 4).value = entryValue;
    returnsSheet.getCell(row, 4).numFmt = '0.00x';
    setOutputCell(returnsSheet.getCell(row, 4));
    output.sensitivity.irrGrid[rowIdx].forEach((irr, colIdx) => {
      const cell = returnsSheet.getCell(row, 5 + colIdx);
      cell.value = irr;
      setPercent(cell);
      setOutputCell(cell);
    });
  });
  styleGrid(
    returnsSheet,
    13,
    13 + output.sensitivity.entryAxis.length,
    4,
    4 + output.sensitivity.exitAxis.length,
  );

  const checkStartRow = 20;
  returnsSheet.getCell(checkStartRow, 1).value = 'Checks';
  returnsSheet.getCell(checkStartRow, 1).font = { bold: true };
  returnsSheet.getCell(checkStartRow + 1, 1).value = 'Debt draw positive / repayment negative sign';
  returnsSheet.getCell(checkStartRow + 1, 2).value = 'PASS';
  returnsSheet.getCell(checkStartRow + 2, 1).value = 'No negative closing debt';
  returnsSheet.getCell(checkStartRow + 2, 2).value = output.remainingDebt >= 0 ? 'PASS' : 'FAIL';
  returnsSheet.getCell(checkStartRow + 3, 1).value = 'Equity bridge ties';
  const equityBridgeCheck = -output.entryEquity + debtRepaymentTotal + (output.exitEv - output.entryEv) - output.exitEquity;
  returnsSheet.getCell(checkStartRow + 3, 2).value = Math.abs(equityBridgeCheck) < 0.01 ? 'PASS' : 'FAIL';
  for (let row = checkStartRow + 1; row <= checkStartRow + 3; row += 1) {
    setOutputCell(returnsSheet.getCell(row, 1));
    setOutputCell(returnsSheet.getCell(row, 2));
  }
  styleGrid(returnsSheet, checkStartRow, checkStartRow + 3, 1, 2);
  sourcesSheet.getCell(checkRow + 1, 1).value = 'Weighted Interest Rate';
  sourcesSheet.getCell(checkRow + 1, 2).value = weightedInterestRate;
  setPercent(sourcesSheet.getCell(checkRow + 1, 2));
  setOutputCell(sourcesSheet.getCell(checkRow + 1, 1));
  setOutputCell(sourcesSheet.getCell(checkRow + 1, 2));
  styleGrid(sourcesSheet, checkRow + 1, checkRow + 1, 1, 2);

  projectionsSheet.getCell('A11').value = 'Year 1 FCF Bridge';
  projectionsSheet.getCell('A11').font = { bold: true };
  projectionsSheet.getCell('A12').value = 'EBITDA';
  projectionsSheet.getCell('B12').value = input.ebitda;
  projectionsSheet.getCell('A13').value = 'Interest';
  projectionsSheet.getCell('B13').value = -firstYearInterest;
  projectionsSheet.getCell('A14').value = 'Tax';
  projectionsSheet.getCell('B14').value = -firstYearTax;
  projectionsSheet.getCell('A15').value = 'Capex';
  projectionsSheet.getCell('B15').value = -firstYearCapex;
  projectionsSheet.getCell('A16').value = 'Cash Sweep Capacity';
  projectionsSheet.getCell('B16').value = firstYearCashSweep;
  for (let row = 12; row <= 16; row += 1) {
    setCurrency(projectionsSheet.getCell(row, 2));
    setOutputCell(projectionsSheet.getCell(row, 1));
    setOutputCell(projectionsSheet.getCell(row, 2));
  }
  styleGrid(projectionsSheet, 11, 16, 1, 2);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));

  return workbook;
}

export const lboLiteModel: ModelDef<LboLiteInput, LboLiteOutput> = {
  slug: 'lbo-lite',
  name: 'LBO Model (Lite)',
  category: 'Corporate Finance',
  description: 'Lite LBO with sources/uses, debt sweep, exit equity, MOIC, IRR, and sensitivity.',
  inputSchema: LboLiteInputSchema,
  uiSchema: lboLiteUiSchema,
  compute: computeLboLite,
  buildWorkbook: buildLboLiteWorkbook,
  filename: () => 'CapitalBase_LBO_Lite.xlsx',
};

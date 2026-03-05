import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
  protectSheetIfConfigured,
  setCurrency,
  setInputCell,
  setOutputCell,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';

const EventTypeEnum = z.enum([
  'cash_revenue',
  'cash_expense',
  'cash_dividend',
  'issue_debt',
  'repay_debt',
]);

const BeginningBalancesSchema = z.object({
  cash: z.number().min(0),
  notes_payable: z.number().min(0),
  common_stock: z.number().min(0),
  retained_earnings: z.number().min(0),
});

const EventSchema = z.object({
  type: EventTypeEnum,
  amount: z.number().positive('amount must be > 0'),
});

export const AccountingEquationInputSchema = z.object({
  beginning: BeginningBalancesSchema,
  events: z.array(EventSchema).min(1, 'at least one event is required'),
});

type AccountingEquationInput = z.infer<typeof AccountingEquationInputSchema>;
type EventType = z.infer<typeof EventTypeEnum>;

type EquationRow = {
  step: string;
  eventType: EventType | null;
  amount: number | null;
  deltaAssets: number;
  deltaLiabilities: number;
  deltaEquity: number;
  assets: number;
  liabilities: number;
  equity: number;
  check: number;
};

type AccountingEquationOutput = {
  rows: EquationRow[];
  ending: {
    cash: number;
    notes_payable: number;
    common_stock: number;
    retained_earnings: number;
    assets: number;
    liabilities: number;
    equity: number;
    check: number;
  };
  maxAbsImbalance: number;
};

function eventLabel(type: EventType): string {
  switch (type) {
    case 'cash_revenue':
      return 'Cash revenue';
    case 'cash_expense':
      return 'Cash expense';
    case 'cash_dividend':
      return 'Cash dividend';
    case 'issue_debt':
      return 'Issue debt';
    case 'repay_debt':
      return 'Repay debt';
    default:
      return type;
  }
}

function buildRow(
  step: string,
  eventType: EventType | null,
  amount: number | null,
  deltaAssets: number,
  deltaLiabilities: number,
  deltaEquity: number,
  assets: number,
  liabilities: number,
  equity: number,
): EquationRow {
  const check = assets - (liabilities + equity);
  return {
    step,
    eventType,
    amount,
    deltaAssets,
    deltaLiabilities,
    deltaEquity,
    assets,
    liabilities,
    equity,
    check,
  };
}

function computeAccountingEquation(input: AccountingEquationInput): AccountingEquationOutput {
  let cash = input.beginning.cash;
  let notesPayable = input.beginning.notes_payable;
  const commonStock = input.beginning.common_stock;
  let retainedEarnings = input.beginning.retained_earnings;

  const rows: EquationRow[] = [];

  rows.push(
    buildRow(
      'Beginning balances',
      null,
      null,
      0,
      0,
      0,
      cash,
      notesPayable,
      commonStock + retainedEarnings,
    ),
  );

  input.events.forEach((event, index) => {
    let deltaAssets = 0;
    let deltaLiabilities = 0;
    let deltaEquity = 0;

    switch (event.type) {
      case 'cash_revenue': {
        deltaAssets = event.amount;
        deltaEquity = event.amount;
        cash += event.amount;
        retainedEarnings += event.amount;
        break;
      }
      case 'cash_expense': {
        deltaAssets = -event.amount;
        deltaEquity = -event.amount;
        cash -= event.amount;
        retainedEarnings -= event.amount;
        break;
      }
      case 'cash_dividend': {
        deltaAssets = -event.amount;
        deltaEquity = -event.amount;
        cash -= event.amount;
        retainedEarnings -= event.amount;
        break;
      }
      case 'issue_debt': {
        deltaAssets = event.amount;
        deltaLiabilities = event.amount;
        cash += event.amount;
        notesPayable += event.amount;
        break;
      }
      case 'repay_debt': {
        deltaAssets = -event.amount;
        deltaLiabilities = -event.amount;
        cash -= event.amount;
        notesPayable -= event.amount;
        break;
      }
    }

    rows.push(
      buildRow(
        `Event ${index + 1}: ${eventLabel(event.type)}`,
        event.type,
        event.amount,
        deltaAssets,
        deltaLiabilities,
        deltaEquity,
        cash,
        notesPayable,
        commonStock + retainedEarnings,
      ),
    );
  });

  rows.push(
    buildRow('Ending balances', null, null, 0, 0, 0, cash, notesPayable, commonStock + retainedEarnings),
  );

  const maxAbsImbalance = rows.reduce((acc, row) => Math.max(acc, Math.abs(row.check)), 0);

  return {
    rows,
    ending: {
      cash,
      notes_payable: notesPayable,
      common_stock: commonStock,
      retained_earnings: retainedEarnings,
      assets: cash,
      liabilities: notesPayable,
      equity: commonStock + retainedEarnings,
      check: cash - (notesPayable + commonStock + retainedEarnings),
    },
    maxAbsImbalance,
  };
}

const accountingEquationUiSchema: UISchema = {
  sections: [
    {
      title: 'Beginning Balances',
      description: 'Enter opening balances for the simple accounting equation setup.',
      fields: [
        {
          key: 'beginning.cash',
          label: 'Cash',
          type: 'currency',
          required: true,
          defaultValue: 100000,
        },
        {
          key: 'beginning.notes_payable',
          label: 'Notes Payable',
          type: 'currency',
          required: true,
          defaultValue: 40000,
        },
        {
          key: 'beginning.common_stock',
          label: 'Common Stock',
          type: 'currency',
          required: true,
          defaultValue: 50000,
        },
        {
          key: 'beginning.retained_earnings',
          label: 'Retained Earnings',
          type: 'currency',
          required: true,
          defaultValue: 10000,
        },
      ],
    },
    {
      title: 'Events',
      description: 'Each event updates assets, liabilities, and equity deterministically.',
      fields: [
        {
          key: 'events',
          label: 'Events',
          type: 'repeatableRows',
          required: true,
          minRows: 1,
          rowsSpec: [
            {
              key: 'type',
              label: 'Event Type',
              type: 'select',
              required: true,
              options: [
                { label: 'Cash Revenue', value: 'cash_revenue' },
                { label: 'Cash Expense', value: 'cash_expense' },
                { label: 'Cash Dividend', value: 'cash_dividend' },
                { label: 'Issue Debt', value: 'issue_debt' },
                { label: 'Repay Debt', value: 'repay_debt' },
              ],
            },
            {
              key: 'amount',
              label: 'Amount',
              type: 'currency',
              required: true,
              defaultValue: 1000,
            },
          ],
          defaultRows: [{ type: 'cash_revenue', amount: 5000 }],
        },
      ],
    },
  ],
};

async function buildAccountingEquationWorkbook(
  input: AccountingEquationInput,
  output: AccountingEquationOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const inputsSheet = workbook.addWorksheet('Inputs');
  inputsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  inputsSheet.columns = [
    { width: 28 },
    { width: 24 },
    { width: 18 },
  ];

  inputsSheet.getCell('A1').value = 'Accounting Equation Event Tracker - Inputs';
  inputsSheet.getCell('A1').font = { bold: true, size: 14 };

  inputsSheet.getCell('A3').value = 'Beginning Balances';
  inputsSheet.getCell('A3').font = { bold: true };

  const beginningRows: Array<[string, number]> = [
    ['Cash', input.beginning.cash],
    ['Notes Payable', input.beginning.notes_payable],
    ['Common Stock', input.beginning.common_stock],
    ['Retained Earnings', input.beginning.retained_earnings],
  ];

  beginningRows.forEach(([label, value], index) => {
    const row = 4 + index;
    inputsSheet.getCell(row, 1).value = label;
    const valueCell = inputsSheet.getCell(row, 2);
    valueCell.value = value;
    setCurrency(valueCell);
    setInputCell(valueCell);
  });

  inputsSheet.getCell('A10').value = 'Events';
  inputsSheet.getCell('A10').font = { bold: true };

  inputsSheet.getCell('A11').value = '#';
  inputsSheet.getCell('B11').value = 'Type';
  inputsSheet.getCell('C11').value = 'Amount';
  styleHeaderRow(inputsSheet, 11, 1, 3);

  input.events.forEach((event, index) => {
    const row = 12 + index;
    inputsSheet.getCell(row, 1).value = index + 1;
    const typeCell = inputsSheet.getCell(row, 2);
    typeCell.value = event.type;
    setInputCell(typeCell);

    const amountCell = inputsSheet.getCell(row, 3);
    amountCell.value = event.amount;
    setCurrency(amountCell);
    setInputCell(amountCell);
  });

  styleGrid(inputsSheet, 11, 11 + input.events.length, 1, 3);

  const equationSheet = workbook.addWorksheet('Equation Table');
  equationSheet.views = [{ state: 'frozen', ySplit: 3 }];
  equationSheet.columns = [
    { width: 28 },
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  equationSheet.getCell('A1').value = 'Accounting Equation Movement Table';
  equationSheet.getCell('A1').font = { bold: true, size: 14 };

  const headers = ['Step', 'Event Type', 'Amount', 'ΔAssets', 'ΔLiabilities', 'ΔEquity', 'Assets', 'Liabilities', 'Equity', 'A-(L+E)'];
  headers.forEach((header, idx) => {
    equationSheet.getCell(3, idx + 1).value = header;
  });
  styleHeaderRow(equationSheet, 3, 1, headers.length);

  output.rows.forEach((row, index) => {
    const excelRow = 4 + index;
    equationSheet.getCell(excelRow, 1).value = row.step;
    equationSheet.getCell(excelRow, 2).value = row.eventType;
    equationSheet.getCell(excelRow, 3).value = row.amount;
    equationSheet.getCell(excelRow, 4).value = row.deltaAssets;
    equationSheet.getCell(excelRow, 5).value = row.deltaLiabilities;
    equationSheet.getCell(excelRow, 6).value = row.deltaEquity;
    equationSheet.getCell(excelRow, 7).value = row.assets;
    equationSheet.getCell(excelRow, 8).value = row.liabilities;
    equationSheet.getCell(excelRow, 9).value = row.equity;
    equationSheet.getCell(excelRow, 10).value = { formula: `=G${excelRow}-(H${excelRow}+I${excelRow})` };

    for (let c = 3; c <= 10; c += 1) {
      const cell = equationSheet.getCell(excelRow, c);
      setCurrency(cell);
      setOutputCell(cell);
    }
    setOutputCell(equationSheet.getCell(excelRow, 1));
    setOutputCell(equationSheet.getCell(excelRow, 2));
  });

  styleGrid(equationSheet, 3, 3 + output.rows.length, 1, headers.length);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.columns = [{ width: 36 }, { width: 20 }, { width: 16 }];

  checksSheet.getCell('A1').value = 'Equation Integrity Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };

  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);

  const lastEquationRow = 3 + output.rows.length;

  checksSheet.getCell('A4').value = 'Maximum absolute imbalance across all rows';
  checksSheet.getCell('B4').value = output.maxAbsImbalance;
  checksSheet.getCell('C4').value = output.maxAbsImbalance < 0.01 ? 'PASS' : 'FAIL';

  checksSheet.getCell('A5').value = 'Ending row imbalance';
  checksSheet.getCell('B5').value = { formula: `'Equation Table'!J${lastEquationRow}` };
  checksSheet.getCell('C5').value = { formula: '=IF(ABS(B5)<0.01,"PASS","FAIL")' };

  for (let r = 4; r <= 5; r += 1) {
    setCurrency(checksSheet.getCell(r, 2));
    setOutputCell(checksSheet.getCell(r, 1));
    setOutputCell(checksSheet.getCell(r, 2));
    setOutputCell(checksSheet.getCell(r, 3));
  }

  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all([
    protectSheetIfConfigured(inputsSheet),
    protectSheetIfConfigured(equationSheet),
    protectSheetIfConfigured(checksSheet),
  ]);

  return workbook;
}

export const accountingEquationModel: ModelDef<AccountingEquationInput, AccountingEquationOutput> = {
  slug: 'accounting-equation',
  name: 'Accounting Equation Event Tracker',
  category: 'Accounting',
  description: 'Track transaction events and verify A = L + E on every row.',
  inputSchema: AccountingEquationInputSchema,
  uiSchema: accountingEquationUiSchema,
  compute: computeAccountingEquation,
  buildWorkbook: buildAccountingEquationWorkbook,
  filename: () => 'CapitalBase_Accounting_Equation.xlsx',
};

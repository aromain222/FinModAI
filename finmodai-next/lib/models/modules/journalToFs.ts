import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
  configureWorkbookForRecalc,
  protectSheetIfConfigured,
  setCurrency,
  setInputCell,
  setOutputCell,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';

const AccountTypeEnum = z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense', 'ContraAsset']);

type AccountType = z.infer<typeof AccountTypeEnum>;

const ChartAccountSchema = z.object({
  name: z.string().min(1, 'account name is required'),
  type: AccountTypeEnum,
});

const JournalEntrySchema = z
  .object({
    date: z.string().min(1, 'date is required'),
    account: z.string().min(1, 'account is required'),
    debit: z.number().min(0, 'debit cannot be negative'),
    credit: z.number().min(0, 'credit cannot be negative'),
  })
  .superRefine((entry, ctx) => {
    const debitPositive = entry.debit > 0;
    const creditPositive = entry.credit > 0;

    if (debitPositive === creditPositive) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['debit'],
        message: 'exactly one of debit or credit must be positive',
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credit'],
        message: 'exactly one of debit or credit must be positive',
      });
    }
  });

export const JournalToFsInputSchema = z
  .object({
    opening_retained_earnings: z.number(),
    chart_of_accounts: z.array(ChartAccountSchema).min(1, 'chart of accounts is required'),
    journal_entries: z.array(JournalEntrySchema).min(1, 'at least one journal entry is required'),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.chart_of_accounts.forEach((account, idx) => {
      const key = account.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['chart_of_accounts', idx, 'name'],
          message: 'duplicate account name',
        });
      }
      seen.add(key);
    });

    const accountSet = new Set(input.chart_of_accounts.map((a) => a.name.trim().toLowerCase()));
    input.journal_entries.forEach((entry, idx) => {
      if (!accountSet.has(entry.account.trim().toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['journal_entries', idx, 'account'],
          message: `account \"${entry.account}\" is not in chart of accounts`,
        });
      }
    });
  });

type JournalToFsInput = z.infer<typeof JournalToFsInputSchema>;

type LedgerRow = {
  account: string;
  type: AccountType;
  debitTotal: number;
  creditTotal: number;
  debitBalance: number;
  creditBalance: number;
  net: number;
};

type JournalToFsOutput = {
  ledgerRows: LedgerRow[];
  trialBalanceTotals: {
    debits: number;
    credits: number;
    difference: number;
    isBalanced: boolean;
  };
  incomeStatement: {
    revenue: number;
    cogs: number;
    operatingExpense: number;
    depreciationExpense: number;
    netIncome: number;
  };
  balanceSheet: {
    assetLines: Array<{ account: string; value: number }>;
    liabilityLines: Array<{ account: string; value: number }>;
    equityLines: Array<{ account: string; value: number }>;
    retainedEarningsAfterClose: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquityAfterClose: number;
    difference: number;
    isBalanced: boolean;
  };
};

const defaultChartOfAccounts: Array<{ name: string; type: AccountType }> = [
  { name: 'Cash', type: 'Asset' },
  { name: 'AR', type: 'Asset' },
  { name: 'Inventory', type: 'Asset' },
  { name: 'AP', type: 'Liability' },
  { name: 'Notes Payable', type: 'Liability' },
  { name: 'Common Stock', type: 'Equity' },
  { name: 'Retained Earnings', type: 'Equity' },
  { name: 'Revenue', type: 'Revenue' },
  { name: 'COGS', type: 'Expense' },
  { name: 'Operating Expense', type: 'Expense' },
  { name: 'Depreciation Expense', type: 'Expense' },
  { name: 'Accum Depreciation', type: 'ContraAsset' },
];

const accountTypeOptions = [
  { label: 'Asset', value: 'Asset' },
  { label: 'Liability', value: 'Liability' },
  { label: 'Equity', value: 'Equity' },
  { label: 'Revenue', value: 'Revenue' },
  { label: 'Expense', value: 'Expense' },
  { label: 'ContraAsset', value: 'ContraAsset' },
];

const journalToFsUiSchema: UISchema = {
  sections: [
    {
      title: 'Setup',
      fields: [
        {
          key: 'opening_retained_earnings',
          label: 'Opening Retained Earnings',
          type: 'currency',
          required: true,
          defaultValue: 0,
        },
      ],
    },
    {
      title: 'Chart of Accounts',
      description: 'Minimal account list, editable if you need additional lines.',
      fields: [
        {
          key: 'chart_of_accounts',
          label: 'Chart of Accounts',
          type: 'repeatableRows',
          required: true,
          minRows: defaultChartOfAccounts.length,
          rowsSpec: [
            { key: 'name', label: 'Account Name', type: 'text', required: true },
            {
              key: 'type',
              label: 'Account Type',
              type: 'select',
              required: true,
              options: accountTypeOptions,
            },
          ],
          defaultRows: defaultChartOfAccounts,
        },
      ],
    },
    {
      title: 'Journal Entries',
      description: 'Enter one row per debit or credit line. Debit XOR credit must hold per row.',
      fields: [
        {
          key: 'journal_entries',
          label: 'Journal Entries',
          type: 'repeatableRows',
          required: true,
          minRows: 1,
          rowsSpec: [
            { key: 'date', label: 'Date', type: 'text', required: true, defaultValue: '2026-01-01' },
            { key: 'account', label: 'Account', type: 'text', required: true, defaultValue: 'Cash' },
            { key: 'debit', label: 'Debit', type: 'currency', required: true, defaultValue: 0 },
            { key: 'credit', label: 'Credit', type: 'currency', required: true, defaultValue: 0 },
          ],
          defaultRows: [
            { date: '2026-01-01', account: 'Cash', debit: 10000, credit: 0 },
            { date: '2026-01-01', account: 'Common Stock', debit: 0, credit: 10000 },
          ],
        },
      ],
    },
  ],
};

function computeJournalToFs(input: JournalToFsInput): JournalToFsOutput {
  const ledgerMap = new Map<string, { type: AccountType; debitTotal: number; creditTotal: number }>();

  for (const account of input.chart_of_accounts) {
    ledgerMap.set(account.name, {
      type: account.type,
      debitTotal: 0,
      creditTotal: 0,
    });
  }

  for (const entry of input.journal_entries) {
    const ledger = ledgerMap.get(entry.account);
    if (!ledger) {
      throw new Error(`Unknown account in journal entry: ${entry.account}`);
    }
    ledger.debitTotal += entry.debit;
    ledger.creditTotal += entry.credit;
  }

  const ledgerRows: LedgerRow[] = input.chart_of_accounts.map((account) => {
    const totals = ledgerMap.get(account.name);
    if (!totals) {
      throw new Error(`Missing ledger totals for account: ${account.name}`);
    }

    const net = totals.debitTotal - totals.creditTotal;

    return {
      account: account.name,
      type: account.type,
      debitTotal: totals.debitTotal,
      creditTotal: totals.creditTotal,
      debitBalance: net > 0 ? net : 0,
      creditBalance: net < 0 ? -net : 0,
      net,
    };
  });

  const trialDebits = ledgerRows.reduce((sum, row) => sum + row.debitBalance, 0);
  const trialCredits = ledgerRows.reduce((sum, row) => sum + row.creditBalance, 0);
  const trialDifference = trialDebits - trialCredits;

  const byName = new Map(ledgerRows.map((row) => [row.account, row]));
  const creditNatureValue = (name: string): number => {
    const row = byName.get(name);
    if (!row) return 0;
    return row.creditTotal - row.debitTotal;
  };
  const debitNatureValue = (name: string): number => {
    const row = byName.get(name);
    if (!row) return 0;
    return row.debitTotal - row.creditTotal;
  };

  const revenue = creditNatureValue('Revenue');
  const cogs = debitNatureValue('COGS');
  const operatingExpense = debitNatureValue('Operating Expense');
  const depreciationExpense = debitNatureValue('Depreciation Expense');
  const netIncome = revenue - cogs - operatingExpense - depreciationExpense;

  const assetLines = ledgerRows
    .filter((row) => row.type === 'Asset' || row.type === 'ContraAsset')
    .map((row) => ({ account: row.account, value: row.net }));

  const liabilityLines = ledgerRows
    .filter((row) => row.type === 'Liability')
    .map((row) => ({ account: row.account, value: row.creditTotal - row.debitTotal }));

  const nonRetainedEquityLines = ledgerRows
    .filter((row) => row.type === 'Equity' && row.account !== 'Retained Earnings')
    .map((row) => ({ account: row.account, value: row.creditTotal - row.debitTotal }));

  const retainedEarningsAfterClose = input.opening_retained_earnings + netIncome;
  const equityLines = [
    ...nonRetainedEquityLines,
    { account: 'Retained Earnings (After Close)', value: retainedEarningsAfterClose },
  ];

  const totalAssets = assetLines.reduce((sum, line) => sum + line.value, 0);
  const totalLiabilities = liabilityLines.reduce((sum, line) => sum + line.value, 0);
  const totalEquityAfterClose = equityLines.reduce((sum, line) => sum + line.value, 0);
  const difference = totalAssets - (totalLiabilities + totalEquityAfterClose);

  return {
    ledgerRows,
    trialBalanceTotals: {
      debits: trialDebits,
      credits: trialCredits,
      difference: trialDifference,
      isBalanced: Math.abs(trialDifference) < 0.01,
    },
    incomeStatement: {
      revenue,
      cogs,
      operatingExpense,
      depreciationExpense,
      netIncome,
    },
    balanceSheet: {
      assetLines,
      liabilityLines,
      equityLines,
      retainedEarningsAfterClose,
      totalAssets,
      totalLiabilities,
      totalEquityAfterClose,
      difference,
      isBalanced: Math.abs(difference) < 0.01,
    },
  };
}

async function buildJournalToFsWorkbook(input: JournalToFsInput, output: JournalToFsOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const journalSheet = workbook.addWorksheet('Journal Entries');
  journalSheet.views = [{ state: 'frozen', ySplit: 6 }];
  journalSheet.columns = [{ width: 16 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 18 }];

  journalSheet.getCell('A1').value = 'Journal Entries';
  journalSheet.getCell('A1').font = { bold: true, size: 14 };
  journalSheet.getCell('A3').value = 'Opening Retained Earnings';
  journalSheet.getCell('B3').value = input.opening_retained_earnings;
  setCurrency(journalSheet.getCell('B3'));
  setInputCell(journalSheet.getCell('B3'));

  journalSheet.getCell('A5').value = 'Date';
  journalSheet.getCell('B5').value = 'Account';
  journalSheet.getCell('C5').value = 'Debit';
  journalSheet.getCell('D5').value = 'Credit';
  journalSheet.getCell('E5').value = 'Row Check';
  styleHeaderRow(journalSheet, 5, 1, 5);

  input.journal_entries.forEach((entry, idx) => {
    const row = 6 + idx;
    journalSheet.getCell(row, 1).value = entry.date;
    journalSheet.getCell(row, 2).value = entry.account;
    journalSheet.getCell(row, 3).value = entry.debit;
    journalSheet.getCell(row, 4).value = entry.credit;
    journalSheet.getCell(row, 5).value = Math.abs((entry.debit > 0 ? 1 : 0) + (entry.credit > 0 ? 1 : 0) - 1) === 0 ? 'OK' : 'ERR';
    setInputCell(journalSheet.getCell(row, 1));
    setInputCell(journalSheet.getCell(row, 2));
    setCurrency(journalSheet.getCell(row, 3));
    setCurrency(journalSheet.getCell(row, 4));
    setInputCell(journalSheet.getCell(row, 3));
    setInputCell(journalSheet.getCell(row, 4));
    setOutputCell(journalSheet.getCell(row, 5));
  });
  styleGrid(journalSheet, 5, 5 + input.journal_entries.length, 1, 5);

  const coaStart = 8 + input.journal_entries.length;
  journalSheet.getCell(coaStart, 1).value = 'Chart of Accounts';
  journalSheet.getCell(coaStart, 1).font = { bold: true };
  journalSheet.getCell(coaStart + 1, 1).value = 'Account';
  journalSheet.getCell(coaStart + 1, 2).value = 'Type';
  styleHeaderRow(journalSheet, coaStart + 1, 1, 2);
  input.chart_of_accounts.forEach((account, idx) => {
    const row = coaStart + 2 + idx;
    journalSheet.getCell(row, 1).value = account.name;
    journalSheet.getCell(row, 2).value = account.type;
    setInputCell(journalSheet.getCell(row, 1));
    setInputCell(journalSheet.getCell(row, 2));
  });
  styleGrid(journalSheet, coaStart + 1, coaStart + 1 + input.chart_of_accounts.length, 1, 2);

  const ledgerSheet = workbook.addWorksheet('Ledger');
  ledgerSheet.views = [{ state: 'frozen', ySplit: 3 }];
  ledgerSheet.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ledgerSheet.getCell('A1').value = 'General Ledger';
  ledgerSheet.getCell('A1').font = { bold: true, size: 14 };
  ledgerSheet.getCell('A3').value = 'Account';
  ledgerSheet.getCell('B3').value = 'Debit';
  ledgerSheet.getCell('C3').value = 'Credit';
  ledgerSheet.getCell('D3').value = 'Balance';
  styleHeaderRow(ledgerSheet, 3, 1, 4);

  let ledgerRow = 4;
  output.ledgerRows.forEach((row) => {
    ledgerSheet.getCell(ledgerRow, 1).value = `Account: ${row.account}`;
    ledgerSheet.getCell(ledgerRow, 1).font = { bold: true };
    setOutputCell(ledgerSheet.getCell(ledgerRow, 1));
    ledgerRow += 1;
    ledgerSheet.getCell(ledgerRow, 1).value = '  Totals';
    ledgerSheet.getCell(ledgerRow, 2).value = row.debitTotal;
    ledgerSheet.getCell(ledgerRow, 3).value = row.creditTotal;
    ledgerSheet.getCell(ledgerRow, 4).value = row.debitBalance > 0 ? row.debitBalance : -row.creditBalance;
    setCurrency(ledgerSheet.getCell(ledgerRow, 2));
    setCurrency(ledgerSheet.getCell(ledgerRow, 3));
    setCurrency(ledgerSheet.getCell(ledgerRow, 4));
    setOutputCell(ledgerSheet.getCell(ledgerRow, 1));
    setOutputCell(ledgerSheet.getCell(ledgerRow, 2));
    setOutputCell(ledgerSheet.getCell(ledgerRow, 3));
    setOutputCell(ledgerSheet.getCell(ledgerRow, 4));
    ledgerRow += 1;
  });
  styleGrid(ledgerSheet, 3, ledgerRow - 1, 1, 4);

  const trialSheet = workbook.addWorksheet('Trial Balance');
  trialSheet.views = [{ state: 'frozen', ySplit: 3 }];
  trialSheet.columns = [{ width: 34 }, { width: 18 }, { width: 18 }];

  trialSheet.getCell('A1').value = 'Trial Balance';
  trialSheet.getCell('A1').font = { bold: true, size: 14 };

  trialSheet.getCell('A3').value = 'Account';
  trialSheet.getCell('B3').value = 'Debits';
  trialSheet.getCell('C3').value = 'Credits';
  styleHeaderRow(trialSheet, 3, 1, 3);

  output.ledgerRows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    trialSheet.getCell(excelRow, 1).value = row.account;
    trialSheet.getCell(excelRow, 2).value = row.debitBalance;
    trialSheet.getCell(excelRow, 3).value = row.creditBalance;

    setOutputCell(trialSheet.getCell(excelRow, 1));
    setOutputCell(trialSheet.getCell(excelRow, 2));
    setOutputCell(trialSheet.getCell(excelRow, 3));
    setCurrency(trialSheet.getCell(excelRow, 2));
    setCurrency(trialSheet.getCell(excelRow, 3));
  });

  const totalRow = 4 + output.ledgerRows.length;
  trialSheet.getCell(totalRow, 1).value = 'Total';
  trialSheet.getCell(totalRow, 2).value = output.trialBalanceTotals.debits;
  trialSheet.getCell(totalRow, 3).value = output.trialBalanceTotals.credits;
  trialSheet.getCell(totalRow, 1).font = { bold: true };
  trialSheet.getCell(totalRow, 2).font = { bold: true };
  trialSheet.getCell(totalRow, 3).font = { bold: true };

  setCurrency(trialSheet.getCell(totalRow, 2));
  setCurrency(trialSheet.getCell(totalRow, 3));

  setOutputCell(trialSheet.getCell(totalRow, 1));
  setOutputCell(trialSheet.getCell(totalRow, 2));
  setOutputCell(trialSheet.getCell(totalRow, 3));

  styleGrid(trialSheet, 3, totalRow, 1, 3);

  const incomeSheet = workbook.addWorksheet('Income Statement');
  incomeSheet.views = [{ state: 'frozen', ySplit: 3 }];
  incomeSheet.columns = [{ width: 32 }, { width: 20 }];

  incomeSheet.getCell('A1').value = 'Income Statement (Lite)';
  incomeSheet.getCell('A1').font = { bold: true, size: 14 };

  incomeSheet.getCell('A3').value = 'Line Item';
  incomeSheet.getCell('B3').value = 'Amount';
  styleHeaderRow(incomeSheet, 3, 1, 2);

  const incomeRows: Array<[string, number]> = [
    ['Revenue', output.incomeStatement.revenue],
    ['COGS', output.incomeStatement.cogs],
    ['Operating Expense', output.incomeStatement.operatingExpense],
    ['Depreciation Expense', output.incomeStatement.depreciationExpense],
    ['Net Income', output.incomeStatement.netIncome],
  ];

  incomeRows.forEach(([label, value], idx) => {
    const row = 4 + idx;
    incomeSheet.getCell(row, 1).value = label;
    incomeSheet.getCell(row, 2).value = value;

    if (label === 'Net Income') {
      incomeSheet.getCell(row, 1).font = { bold: true };
      incomeSheet.getCell(row, 2).font = { bold: true };
    }

    setCurrency(incomeSheet.getCell(row, 2));
    setOutputCell(incomeSheet.getCell(row, 1));
    setOutputCell(incomeSheet.getCell(row, 2));
  });
  styleGrid(incomeSheet, 3, 8, 1, 2);

  const bsSheet = workbook.addWorksheet('Balance Sheet');
  bsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  bsSheet.columns = [{ width: 34 }, { width: 20 }];

  bsSheet.getCell('A1').value = 'Balance Sheet (Lite)';
  bsSheet.getCell('A1').font = { bold: true, size: 14 };

  let bsRow = 3;
  bsSheet.getCell(bsRow, 1).value = 'Assets';
  bsSheet.getCell(bsRow, 2).value = 'Amount';
  styleHeaderRow(bsSheet, bsRow, 1, 2);

  output.balanceSheet.assetLines.forEach((line) => {
    bsRow += 1;
    bsSheet.getCell(bsRow, 1).value = line.account;
    bsSheet.getCell(bsRow, 2).value = line.value;
    setCurrency(bsSheet.getCell(bsRow, 2));
    setOutputCell(bsSheet.getCell(bsRow, 1));
    setOutputCell(bsSheet.getCell(bsRow, 2));
  });

  bsRow += 1;
  bsSheet.getCell(bsRow, 1).value = 'Total Assets';
  bsSheet.getCell(bsRow, 2).value = output.balanceSheet.totalAssets;
  bsSheet.getCell(bsRow, 1).font = { bold: true };
  bsSheet.getCell(bsRow, 2).font = { bold: true };
  setCurrency(bsSheet.getCell(bsRow, 2));
  setOutputCell(bsSheet.getCell(bsRow, 1));
  setOutputCell(bsSheet.getCell(bsRow, 2));

  bsRow += 2;
  bsSheet.getCell(bsRow, 1).value = 'Liabilities';
  bsSheet.getCell(bsRow, 2).value = 'Amount';
  styleHeaderRow(bsSheet, bsRow, 1, 2);

  output.balanceSheet.liabilityLines.forEach((line) => {
    bsRow += 1;
    bsSheet.getCell(bsRow, 1).value = line.account;
    bsSheet.getCell(bsRow, 2).value = line.value;
    setCurrency(bsSheet.getCell(bsRow, 2));
    setOutputCell(bsSheet.getCell(bsRow, 1));
    setOutputCell(bsSheet.getCell(bsRow, 2));
  });

  bsRow += 1;
  bsSheet.getCell(bsRow, 1).value = 'Total Liabilities';
  bsSheet.getCell(bsRow, 2).value = output.balanceSheet.totalLiabilities;
  bsSheet.getCell(bsRow, 1).font = { bold: true };
  bsSheet.getCell(bsRow, 2).font = { bold: true };
  setCurrency(bsSheet.getCell(bsRow, 2));
  setOutputCell(bsSheet.getCell(bsRow, 1));
  setOutputCell(bsSheet.getCell(bsRow, 2));

  bsRow += 2;
  bsSheet.getCell(bsRow, 1).value = 'Equity';
  bsSheet.getCell(bsRow, 2).value = 'Amount';
  styleHeaderRow(bsSheet, bsRow, 1, 2);

  output.balanceSheet.equityLines.forEach((line) => {
    bsRow += 1;
    bsSheet.getCell(bsRow, 1).value = line.account;
    bsSheet.getCell(bsRow, 2).value = line.value;
    setCurrency(bsSheet.getCell(bsRow, 2));
    setOutputCell(bsSheet.getCell(bsRow, 1));
    setOutputCell(bsSheet.getCell(bsRow, 2));
  });

  bsRow += 1;
  bsSheet.getCell(bsRow, 1).value = 'Total Equity (after close)';
  bsSheet.getCell(bsRow, 2).value = output.balanceSheet.totalEquityAfterClose;
  bsSheet.getCell(bsRow, 1).font = { bold: true };
  bsSheet.getCell(bsRow, 2).font = { bold: true };
  setCurrency(bsSheet.getCell(bsRow, 2));
  setOutputCell(bsSheet.getCell(bsRow, 1));
  setOutputCell(bsSheet.getCell(bsRow, 2));

  bsRow += 1;
  bsSheet.getCell(bsRow, 1).value = 'Balance Sheet Difference';
  bsSheet.getCell(bsRow, 2).value = output.balanceSheet.difference;
  setCurrency(bsSheet.getCell(bsRow, 2));
  setOutputCell(bsSheet.getCell(bsRow, 1));
  setOutputCell(bsSheet.getCell(bsRow, 2));

  styleGrid(bsSheet, 3, bsRow, 1, 2);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.columns = [{ width: 36 }, { width: 20 }, { width: 16 }];

  checksSheet.getCell('A1').value = 'Control Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };

  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);

  checksSheet.getCell('A4').value = 'Trial Balance difference (Debits - Credits)';
  checksSheet.getCell('B4').value = output.trialBalanceTotals.difference;
  checksSheet.getCell('C4').value = output.trialBalanceTotals.isBalanced ? 'PASS' : 'FAIL';

  checksSheet.getCell('A5').value = 'Balance Sheet difference (Assets - L-E)';
  checksSheet.getCell('B5').value = output.balanceSheet.difference;
  checksSheet.getCell('C5').value = output.balanceSheet.isBalanced ? 'PASS' : 'FAIL';
  checksSheet.getCell('A6').value = 'Sign sanity: no negative trial totals';
  checksSheet.getCell('B6').value = output.trialBalanceTotals.debits >= 0 && output.trialBalanceTotals.credits >= 0 ? 0 : 1;
  checksSheet.getCell('C6').value = output.trialBalanceTotals.debits >= 0 && output.trialBalanceTotals.credits >= 0 ? 'PASS' : 'FAIL';

  setCurrency(checksSheet.getCell('B4'));
  setCurrency(checksSheet.getCell('B5'));
  checksSheet.getCell('B6').numFmt = '0';

  for (let r = 4; r <= 6; r += 1) {
    setOutputCell(checksSheet.getCell(r, 1));
    setOutputCell(checksSheet.getCell(r, 2));
    setOutputCell(checksSheet.getCell(r, 3));
  }

  styleGrid(checksSheet, 3, 6, 1, 3);

  await Promise.all(
    workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)),
  );

  return workbook;
}

export const journalToFsModel: ModelDef<JournalToFsInput, JournalToFsOutput> = {
  slug: 'journal-to-fs',
  name: 'Journal Entries -> Trial Balance -> Financial Statements (Lite)',
  category: 'Accounting',
  description: 'Post journal entries, generate trial balance, and output a simplified IS and BS with checks.',
  inputSchema: JournalToFsInputSchema,
  uiSchema: journalToFsUiSchema,
  compute: computeJournalToFs,
  buildWorkbook: buildJournalToFsWorkbook,
  filename: () => 'CapitalBase_Journal_to_FS.xlsx',
};

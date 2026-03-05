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

const ContractSchema = z.object({
  contract_name: z.string().min(1),
  start_month: z.number().int().min(1).max(60),
  term_months: z.number().int().min(1).max(120),
  contract_value: z.number().positive(),
  billing_frequency_months: z.number().int().min(1).max(24),
  upfront_pct: z.number().min(0).max(1).default(0),
  renewal_probability: z.number().min(0).max(1).default(0),
});

export const RevenueRecognitionAsc606InputSchema = z.object({
  horizon_months: z.number().int().min(12).max(120).default(36),
  contracts: z.array(ContractSchema).min(1),
});

type RevenueRecognitionAsc606Input = z.infer<typeof RevenueRecognitionAsc606InputSchema>;

type MonthlyRollforward = {
  month: number;
  bookings: number;
  billings: number;
  recognizedRevenue: number;
  deferredOpen: number;
  deferredClose: number;
};

type RevenueRecognitionAsc606Output = {
  rows: MonthlyRollforward[];
  totals: {
    bookings: number;
    billings: number;
    recognizedRevenue: number;
    deferredEnding: number;
  };
};

const revenueRecognitionAsc606UiSchema: UISchema = {
  sections: [
    {
      title: 'Horizon',
      fields: [{ key: 'horizon_months', label: 'Horizon (Months)', type: 'number', required: true, defaultValue: 36 }],
    },
    {
      title: 'Contracts Input',
      fields: [
        {
          key: 'contracts',
          label: 'Contracts',
          type: 'repeatableRows',
          required: true,
          minRows: 1,
          rowsSpec: [
            { key: 'contract_name', label: 'Contract Name', type: 'text', required: true },
            { key: 'start_month', label: 'Start Month #', type: 'number', required: true, defaultValue: 1 },
            { key: 'term_months', label: 'Term Months', type: 'number', required: true, defaultValue: 12 },
            { key: 'contract_value', label: 'Contract Value', type: 'currency', required: true, defaultValue: 120000 },
            { key: 'billing_frequency_months', label: 'Billing Freq (months)', type: 'number', required: true, defaultValue: 3 },
            { key: 'upfront_pct', label: 'Upfront %', type: 'percent', required: true, defaultValue: 0.2 },
            { key: 'renewal_probability', label: 'Renewal Probability', type: 'percent', required: true, defaultValue: 0 },
          ],
          defaultRows: [
            {
              contract_name: 'Contract A',
              start_month: 1,
              term_months: 12,
              contract_value: 120000,
              billing_frequency_months: 3,
              upfront_pct: 0.2,
              renewal_probability: 0,
            },
          ],
        },
      ],
    },
  ],
};

function computeRevenueRecognitionAsc606(input: RevenueRecognitionAsc606Input): RevenueRecognitionAsc606Output {
  const rows: MonthlyRollforward[] = [];
  let deferredOpen = 0;

  for (let month = 1; month <= input.horizon_months; month += 1) {
    let bookings = 0;
    let billings = 0;
    let recognizedRevenue = 0;

    for (const contract of input.contracts) {
      const start = contract.start_month;
      const end = contract.start_month + contract.term_months - 1;
      if (month === start) {
        bookings += contract.contract_value * (1 + contract.renewal_probability);
      }
      if (month < start || month > end) continue;

      const monthlyRevenue = contract.contract_value / contract.term_months;
      recognizedRevenue += monthlyRevenue;

      if (month === start) {
        billings += contract.contract_value * contract.upfront_pct;
      }
      const elapsed = month - start;
      const isBillingCycle = elapsed % contract.billing_frequency_months === 0;
      if (isBillingCycle) {
        const residual = contract.contract_value * (1 - contract.upfront_pct);
        const cycleCount = Math.ceil(contract.term_months / contract.billing_frequency_months);
        billings += residual / cycleCount;
      }
    }

    const deferredClose = deferredOpen + billings - recognizedRevenue;
    rows.push({
      month,
      bookings,
      billings,
      recognizedRevenue,
      deferredOpen,
      deferredClose,
    });
    deferredOpen = deferredClose;
  }

  return {
    rows,
    totals: {
      bookings: rows.reduce((sum, row) => sum + row.bookings, 0),
      billings: rows.reduce((sum, row) => sum + row.billings, 0),
      recognizedRevenue: rows.reduce((sum, row) => sum + row.recognizedRevenue, 0),
      deferredEnding: rows[rows.length - 1]?.deferredClose ?? 0,
    },
  };
}

async function buildRevenueRecognitionAsc606Workbook(
  input: RevenueRecognitionAsc606Input,
  output: RevenueRecognitionAsc606Output,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const contractsSheet = workbook.addWorksheet('Contracts Input');
  contractsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  contractsSheet.columns = [
    { width: 24 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
  ];
  contractsSheet.getCell('A1').value = 'Contracts Input';
  contractsSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Contract', 'Start', 'Term', 'Value', 'Billing Freq', 'Upfront %', 'Renewal %'].forEach((header, idx) => {
    contractsSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(contractsSheet, 3, 1, 7);
  input.contracts.forEach((contract, idx) => {
    const row = 4 + idx;
    contractsSheet.getCell(row, 1).value = contract.contract_name;
    contractsSheet.getCell(row, 2).value = contract.start_month;
    contractsSheet.getCell(row, 3).value = contract.term_months;
    contractsSheet.getCell(row, 4).value = contract.contract_value;
    contractsSheet.getCell(row, 5).value = contract.billing_frequency_months;
    contractsSheet.getCell(row, 6).value = contract.upfront_pct;
    contractsSheet.getCell(row, 7).value = contract.renewal_probability;
    setInputCell(contractsSheet.getCell(row, 1));
    setInputCell(contractsSheet.getCell(row, 2));
    setInputCell(contractsSheet.getCell(row, 3));
    setInputCell(contractsSheet.getCell(row, 4));
    setInputCell(contractsSheet.getCell(row, 5));
    setInputCell(contractsSheet.getCell(row, 6));
    setInputCell(contractsSheet.getCell(row, 7));
    setCurrency(contractsSheet.getCell(row, 4));
    setPercent(contractsSheet.getCell(row, 6));
    setPercent(contractsSheet.getCell(row, 7));
  });
  styleGrid(contractsSheet, 3, 3 + input.contracts.length, 1, 7);

  const deferredSheet = workbook.addWorksheet('Deferred Revenue Rollforward');
  deferredSheet.views = [{ state: 'frozen', ySplit: 3 }];
  deferredSheet.columns = [{ width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  deferredSheet.getCell('A1').value = 'Deferred Revenue Rollforward';
  deferredSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Month', 'Deferred Open', 'Billings', 'Revenue', 'Deferred Close'].forEach((header, idx) => {
    deferredSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(deferredSheet, 3, 1, 5);
  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    deferredSheet.getCell(excelRow, 1).value = row.month;
    deferredSheet.getCell(excelRow, 2).value = row.deferredOpen;
    deferredSheet.getCell(excelRow, 3).value = row.billings;
    deferredSheet.getCell(excelRow, 4).value = row.recognizedRevenue;
    deferredSheet.getCell(excelRow, 5).value = row.deferredClose;
    for (let c = 2; c <= 5; c += 1) {
      setCurrency(deferredSheet.getCell(excelRow, c));
      setOutputCell(deferredSheet.getCell(excelRow, c));
    }
    setOutputCell(deferredSheet.getCell(excelRow, 1));
  });
  styleGrid(deferredSheet, 3, 3 + output.rows.length, 1, 5);

  const recognizedSheet = workbook.addWorksheet('Recognized Revenue');
  recognizedSheet.views = [{ state: 'frozen', ySplit: 3 }];
  recognizedSheet.columns = [{ width: 10 }, { width: 18 }];
  recognizedSheet.getCell('A1').value = 'Recognized Revenue';
  recognizedSheet.getCell('A1').font = { bold: true, size: 14 };
  recognizedSheet.getCell('A3').value = 'Month';
  recognizedSheet.getCell('B3').value = 'Revenue';
  styleHeaderRow(recognizedSheet, 3, 1, 2);
  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    recognizedSheet.getCell(excelRow, 1).value = row.month;
    recognizedSheet.getCell(excelRow, 2).value = row.recognizedRevenue;
    setCurrency(recognizedSheet.getCell(excelRow, 2));
    setOutputCell(recognizedSheet.getCell(excelRow, 1));
    setOutputCell(recognizedSheet.getCell(excelRow, 2));
  });
  styleGrid(recognizedSheet, 3, 3 + output.rows.length, 1, 2);

  const bridgeSheet = workbook.addWorksheet('Bookings vs Billings vs Revenue');
  bridgeSheet.views = [{ state: 'frozen', ySplit: 3 }];
  bridgeSheet.columns = [{ width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }];
  bridgeSheet.getCell('A1').value = 'Bookings / Billings / Revenue';
  bridgeSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Month', 'Bookings', 'Billings', 'Revenue'].forEach((header, idx) => {
    bridgeSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(bridgeSheet, 3, 1, 4);
  output.rows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    bridgeSheet.getCell(excelRow, 1).value = row.month;
    bridgeSheet.getCell(excelRow, 2).value = row.bookings;
    bridgeSheet.getCell(excelRow, 3).value = row.billings;
    bridgeSheet.getCell(excelRow, 4).value = row.recognizedRevenue;
    for (let c = 2; c <= 4; c += 1) {
      setCurrency(bridgeSheet.getCell(excelRow, c));
      setOutputCell(bridgeSheet.getCell(excelRow, c));
    }
    setOutputCell(bridgeSheet.getCell(excelRow, 1));
  });
  const totalRow = 4 + output.rows.length;
  bridgeSheet.getCell(totalRow, 1).value = 'Total';
  bridgeSheet.getCell(totalRow, 2).value = output.totals.bookings;
  bridgeSheet.getCell(totalRow, 3).value = output.totals.billings;
  bridgeSheet.getCell(totalRow, 4).value = output.totals.recognizedRevenue;
  for (let c = 1; c <= 4; c += 1) {
    bridgeSheet.getCell(totalRow, c).font = { bold: true };
    setOutputCell(bridgeSheet.getCell(totalRow, c));
  }
  setCurrency(bridgeSheet.getCell(totalRow, 2));
  setCurrency(bridgeSheet.getCell(totalRow, 3));
  setCurrency(bridgeSheet.getCell(totalRow, 4));
  styleGrid(bridgeSheet, 3, totalRow, 1, 4);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 40;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  checksSheet.getCell('A1').value = 'Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'Deferred rollforward identity';
  checksSheet.getCell('B4').value = output.rows.reduce(
    (sum, row) => sum + (row.deferredClose - row.deferredOpen - row.billings + row.recognizedRevenue),
    0,
  );
  checksSheet.getCell('C4').value = Math.abs((checksSheet.getCell('B4').value as number) ?? 0) < 0.01 ? 'PASS' : 'FAIL';
  checksSheet.getCell('A5').value = 'Ending deferred non-negative';
  checksSheet.getCell('B5').value = output.totals.deferredEnding;
  checksSheet.getCell('C5').value = output.totals.deferredEnding >= -0.01 ? 'PASS' : 'WARN';
  setCurrency(checksSheet.getCell('B4'));
  setCurrency(checksSheet.getCell('B5'));
  for (let r = 4; r <= 5; r += 1) {
    setOutputCell(checksSheet.getCell(r, 1));
    setOutputCell(checksSheet.getCell(r, 2));
    setOutputCell(checksSheet.getCell(r, 3));
  }
  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const revenueRecognitionAsc606Model: ModelDef<RevenueRecognitionAsc606Input, RevenueRecognitionAsc606Output> = {
  slug: 'revenue-recognition-asc606',
  name: 'Revenue Recognition Schedule (ASC 606-lite)',
  category: 'Accounting',
  description: 'Contract-level monthly revenue recognition, deferred rollforward, and bookings/billings bridge.',
  inputSchema: RevenueRecognitionAsc606InputSchema,
  uiSchema: revenueRecognitionAsc606UiSchema,
  compute: computeRevenueRecognitionAsc606,
  buildWorkbook: buildRevenueRecognitionAsc606Workbook,
  filename: () => 'CapitalBase_Revenue_Recognition_ASC606.xlsx',
};

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

const ExistingInvestorSchema = z.object({
  name: z.string().min(1),
  shares: z.number().nonnegative(),
});

export const CapTableDilutionInputSchema = z.object({
  founders_shares: z.number().positive(),
  existing_investors: z.array(ExistingInvestorSchema).default([]),
  new_investment_amount: z.number().positive(),
  pre_money_valuation: z.number().positive(),
  option_pool_pct: z.number().min(0).max(0.4),
});

type CapTableDilutionInput = z.infer<typeof CapTableDilutionInputSchema>;

type OwnershipLine = {
  name: string;
  shares: number;
  ownershipPct: number;
  dilutionPct: number;
};

type CapTableDilutionOutput = {
  preMoneyShares: number;
  pricePerShare: number;
  newInvestorShares: number;
  optionPoolShares: number;
  postMoneyShares: number;
  ownershipLines: OwnershipLine[];
};

const capTableUiSchema: UISchema = {
  sections: [
    {
      title: 'Current Ownership',
      fields: [
        { key: 'founders_shares', label: 'Founder Shares', type: 'number', required: true, defaultValue: 8000000 },
        {
          key: 'existing_investors',
          label: 'Existing Investors',
          type: 'repeatableRows',
          minRows: 0,
          rowsSpec: [
            { key: 'name', label: 'Investor', type: 'text', required: true },
            { key: 'shares', label: 'Shares', type: 'number', required: true, defaultValue: 500000 },
          ],
          defaultRows: [{ name: 'Seed Fund', shares: 2000000 }],
        },
      ],
    },
    {
      title: 'Round Terms',
      fields: [
        {
          key: 'new_investment_amount',
          label: 'New Investment Amount',
          type: 'currency',
          required: true,
          defaultValue: 10000000,
        },
        { key: 'pre_money_valuation', label: 'Pre-Money Valuation', type: 'currency', required: true, defaultValue: 60000000 },
        { key: 'option_pool_pct', label: 'Option Pool % (Post)', type: 'percent', required: true, defaultValue: 0.1 },
      ],
    },
  ],
};

function computeCapTable(input: CapTableDilutionInput): CapTableDilutionOutput {
  const preMoneyShares = input.founders_shares + input.existing_investors.reduce((sum, investor) => sum + investor.shares, 0);
  const pricePerShare = input.pre_money_valuation / preMoneyShares;
  const newInvestorShares = input.new_investment_amount / pricePerShare;
  const optionPoolShares = (input.option_pool_pct * (preMoneyShares + newInvestorShares)) / (1 - input.option_pool_pct);
  const postMoneyShares = preMoneyShares + newInvestorShares + optionPoolShares;

  const preOwnership = (shares: number) => shares / preMoneyShares;
  const postOwnership = (shares: number) => shares / postMoneyShares;

  const lines: OwnershipLine[] = [];

  lines.push({
    name: 'Founders',
    shares: input.founders_shares,
    ownershipPct: postOwnership(input.founders_shares),
    dilutionPct: preOwnership(input.founders_shares) - postOwnership(input.founders_shares),
  });

  input.existing_investors.forEach((investor) => {
    lines.push({
      name: investor.name,
      shares: investor.shares,
      ownershipPct: postOwnership(investor.shares),
      dilutionPct: preOwnership(investor.shares) - postOwnership(investor.shares),
    });
  });

  lines.push({
    name: 'New Investor',
    shares: newInvestorShares,
    ownershipPct: postOwnership(newInvestorShares),
    dilutionPct: 0,
  });

  lines.push({
    name: 'Option Pool',
    shares: optionPoolShares,
    ownershipPct: postOwnership(optionPoolShares),
    dilutionPct: 0,
  });

  return {
    preMoneyShares,
    pricePerShare,
    newInvestorShares,
    optionPoolShares,
    postMoneyShares,
    ownershipLines: lines,
  };
}

async function buildCapTableWorkbook(input: CapTableDilutionInput, output: CapTableDilutionOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const preMoneySheet = workbook.addWorksheet('Pre-Money');
  preMoneySheet.views = [{ state: 'frozen', ySplit: 3 }];
  preMoneySheet.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 18 }];
  preMoneySheet.getCell('A1').value = 'Pre-Money Ownership';
  preMoneySheet.getCell('A1').font = { bold: true, size: 14 };

  ['Shareholder', 'Shares', '% Ownership', '$ Invested (implied)'].forEach((header, idx) => {
    preMoneySheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(preMoneySheet, 3, 1, 4);

  const preRows = [{ name: 'Founders', shares: input.founders_shares }, ...input.existing_investors.map((i) => ({ name: i.name, shares: i.shares }))];
  preRows.forEach((line, idx) => {
    const row = 4 + idx;
    preMoneySheet.getCell(row, 1).value = line.name;
    preMoneySheet.getCell(row, 2).value = line.shares;
    preMoneySheet.getCell(row, 3).value = line.shares / output.preMoneyShares;
    preMoneySheet.getCell(row, 4).value = line.shares * output.pricePerShare;
    preMoneySheet.getCell(row, 2).numFmt = '#,##0';
    preMoneySheet.getCell(row, 4).numFmt = '$#,##0.00';
    setPercent(preMoneySheet.getCell(row, 3));
    setOutputCell(preMoneySheet.getCell(row, 1));
    setOutputCell(preMoneySheet.getCell(row, 2));
    setOutputCell(preMoneySheet.getCell(row, 3));
    setOutputCell(preMoneySheet.getCell(row, 4));
  });
  const preTotalRow = 4 + preRows.length;
  preMoneySheet.getCell(preTotalRow, 1).value = 'Total';
  preMoneySheet.getCell(preTotalRow, 2).value = output.preMoneyShares;
  preMoneySheet.getCell(preTotalRow, 3).value = 1;
  preMoneySheet.getCell(preTotalRow, 4).value = input.pre_money_valuation;
  preMoneySheet.getCell(preTotalRow, 1).font = { bold: true };
  preMoneySheet.getCell(preTotalRow, 2).font = { bold: true };
  preMoneySheet.getCell(preTotalRow, 3).font = { bold: true };
  preMoneySheet.getCell(preTotalRow, 4).font = { bold: true };
  preMoneySheet.getCell(preTotalRow, 2).numFmt = '#,##0';
  setPercent(preMoneySheet.getCell(preTotalRow, 3));
  setCurrency(preMoneySheet.getCell(preTotalRow, 4));
  setOutputCell(preMoneySheet.getCell(preTotalRow, 1));
  setOutputCell(preMoneySheet.getCell(preTotalRow, 2));
  setOutputCell(preMoneySheet.getCell(preTotalRow, 3));
  setOutputCell(preMoneySheet.getCell(preTotalRow, 4));
  styleGrid(preMoneySheet, 3, preTotalRow, 1, 4);

  const roundSheet = workbook.addWorksheet('Round Modeling');
  roundSheet.views = [{ state: 'frozen', ySplit: 3 }];
  roundSheet.getColumn(1).width = 34;
  roundSheet.getColumn(2).width = 18;
  roundSheet.getCell('A1').value = 'Round Modeling';
  roundSheet.getCell('A1').font = { bold: true, size: 14 };

  roundSheet.getCell('A3').value = 'Item';
  roundSheet.getCell('B3').value = 'Value';
  styleHeaderRow(roundSheet, 3, 1, 2);

  const roundRows: Array<[string, number, boolean, 'currency' | 'percent' | 'shares']> = [
    ['Founders Shares', input.founders_shares, false, 'shares'],
    ['New Investment Amount', input.new_investment_amount, false, 'currency'],
    ['Pre-Money Valuation', input.pre_money_valuation, false, 'currency'],
    ['Option Pool %', input.option_pool_pct, false, 'percent'],
    ['Pre-Money Shares', output.preMoneyShares, true, 'shares'],
    ['Price Per Share', output.pricePerShare, true, 'currency'],
    ['New Investor Shares', output.newInvestorShares, true, 'shares'],
    ['Post-Money Shares', output.postMoneyShares, true, 'shares'],
  ];

  roundRows.forEach(([label, value, computed, fmt], idx) => {
    const row = 4 + idx;
    roundSheet.getCell(row, 1).value = label;
    roundSheet.getCell(row, 2).value = value;

    if (fmt === 'currency') setCurrency(roundSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(roundSheet.getCell(row, 2));
    if (fmt === 'shares') roundSheet.getCell(row, 2).numFmt = '#,##0';

    if (computed) setOutputCell(roundSheet.getCell(row, 2));
    else setInputCell(roundSheet.getCell(row, 2));

    setOutputCell(roundSheet.getCell(row, 1));
  });

  styleGrid(roundSheet, 3, 3 + roundRows.length, 1, 2);

  const dilutedSheet = workbook.addWorksheet('Fully Diluted');
  dilutedSheet.views = [{ state: 'frozen', ySplit: 3 }];
  dilutedSheet.columns = [{ width: 26 }, { width: 16 }, { width: 16 }, { width: 16 }];
  dilutedSheet.getCell('A1').value = 'Fully Diluted Ownership';
  dilutedSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Shareholder', 'Shares', '% Ownership', 'Dilution %'].forEach((header, idx) => {
    dilutedSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(dilutedSheet, 3, 1, 4);
  output.ownershipLines.forEach((line, idx) => {
    const row = 4 + idx;
    dilutedSheet.getCell(row, 1).value = line.name;
    dilutedSheet.getCell(row, 2).value = line.shares;
    dilutedSheet.getCell(row, 3).value = line.ownershipPct;
    dilutedSheet.getCell(row, 4).value = line.dilutionPct;
    dilutedSheet.getCell(row, 2).numFmt = '#,##0';
    setPercent(dilutedSheet.getCell(row, 3));
    setPercent(dilutedSheet.getCell(row, 4));
    setOutputCell(dilutedSheet.getCell(row, 1));
    setOutputCell(dilutedSheet.getCell(row, 2));
    setOutputCell(dilutedSheet.getCell(row, 3));
    setOutputCell(dilutedSheet.getCell(row, 4));
  });
  const dilutedTotalRow = 4 + output.ownershipLines.length;
  dilutedSheet.getCell(dilutedTotalRow, 1).value = 'Total';
  dilutedSheet.getCell(dilutedTotalRow, 2).value = output.postMoneyShares;
  dilutedSheet.getCell(dilutedTotalRow, 3).value = output.ownershipLines.reduce((sum, line) => sum + line.ownershipPct, 0);
  dilutedSheet.getCell(dilutedTotalRow, 4).value = output.ownershipLines.reduce((sum, line) => sum + line.dilutionPct, 0);
  dilutedSheet.getCell(dilutedTotalRow, 1).font = { bold: true };
  dilutedSheet.getCell(dilutedTotalRow, 2).font = { bold: true };
  dilutedSheet.getCell(dilutedTotalRow, 3).font = { bold: true };
  dilutedSheet.getCell(dilutedTotalRow, 2).numFmt = '#,##0';
  setPercent(dilutedSheet.getCell(dilutedTotalRow, 3));
  setPercent(dilutedSheet.getCell(dilutedTotalRow, 4));
  setOutputCell(dilutedSheet.getCell(dilutedTotalRow, 1));
  setOutputCell(dilutedSheet.getCell(dilutedTotalRow, 2));
  setOutputCell(dilutedSheet.getCell(dilutedTotalRow, 3));
  setOutputCell(dilutedSheet.getCell(dilutedTotalRow, 4));

  const checkRow = dilutedTotalRow + 2;
  dilutedSheet.getCell(checkRow, 1).value = 'Checks';
  dilutedSheet.getCell(checkRow, 1).font = { bold: true };
  dilutedSheet.getCell(checkRow + 1, 1).value = 'Ownership sums to ~100%';
  dilutedSheet.getCell(checkRow + 1, 2).value =
    Math.abs(output.ownershipLines.reduce((sum, line) => sum + line.ownershipPct, 0) - 1) < 0.0001 ? 'PASS' : 'FAIL';
  dilutedSheet.getCell(checkRow + 2, 1).value = 'Option pool visible';
  dilutedSheet.getCell(checkRow + 2, 2).value = output.optionPoolShares > 0 ? 'PASS' : 'WARN';
  setOutputCell(dilutedSheet.getCell(checkRow + 1, 1));
  setOutputCell(dilutedSheet.getCell(checkRow + 1, 2));
  setOutputCell(dilutedSheet.getCell(checkRow + 2, 1));
  setOutputCell(dilutedSheet.getCell(checkRow + 2, 2));
  styleGrid(dilutedSheet, 3, checkRow + 2, 1, 4);

  const optionPoolIdx = output.ownershipLines.findIndex((line) => line.name === 'Option Pool');
  const optionPoolRow = optionPoolIdx >= 0 ? 4 + optionPoolIdx : dilutedTotalRow;

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));

  return workbook;
}

export const capTableDilutionModel: ModelDef<CapTableDilutionInput, CapTableDilutionOutput> = {
  slug: 'cap-table-dilution',
  name: 'Cap Table + Dilution Model',
  category: 'VC',
  description: 'Model post-money ownership, dilution, and option pool effects for a financing round.',
  inputSchema: CapTableDilutionInputSchema,
  uiSchema: capTableUiSchema,
  compute: computeCapTable,
  buildWorkbook: buildCapTableWorkbook,
  filename: () => 'CapitalBase_CapTable_Dilution.xlsx',
};

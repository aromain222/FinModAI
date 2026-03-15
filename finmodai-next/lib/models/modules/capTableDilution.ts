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
        { key: 'new_investment_amount', label: 'New Investment Amount', type: 'currency', required: true, defaultValue: 10000000 },
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
  lines.push({ name: 'Founders', shares: input.founders_shares, ownershipPct: postOwnership(input.founders_shares), dilutionPct: preOwnership(input.founders_shares) - postOwnership(input.founders_shares) });
  input.existing_investors.forEach((investor) => {
    lines.push({ name: investor.name, shares: investor.shares, ownershipPct: postOwnership(investor.shares), dilutionPct: preOwnership(investor.shares) - postOwnership(investor.shares) });
  });
  lines.push({ name: 'New Investor', shares: newInvestorShares, ownershipPct: postOwnership(newInvestorShares), dilutionPct: 0 });
  lines.push({ name: 'Option Pool', shares: optionPoolShares, ownershipPct: postOwnership(optionPoolShares), dilutionPct: 0 });

  return { preMoneyShares, pricePerShare, newInvestorShares, optionPoolShares, postMoneyShares, ownershipLines: lines };
}

async function buildCapTableWorkbook(input: CapTableDilutionInput, output: CapTableDilutionOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const assumptions = workbook.addWorksheet('Assumptions');
  assumptions.views = [{ state: 'frozen', ySplit: 3 }];
  assumptions.columns = [{ width: 24 }, { width: 18 }];
  assumptions.getCell('A1').value = 'Cap Table Assumptions';
  assumptions.getCell('A1').font = { bold: true, size: 14 };
  assumptions.getCell('A3').value = 'Input';
  assumptions.getCell('B3').value = 'Value';
  styleHeaderRow(assumptions, 3, 1, 2);
  assumptions.getCell('A4').value = 'Founder Shares';
  assumptions.getCell('B4').value = input.founders_shares;
  assumptions.getCell('A5').value = 'New Investment Amount';
  assumptions.getCell('B5').value = input.new_investment_amount;
  assumptions.getCell('A6').value = 'Pre-Money Valuation';
  assumptions.getCell('B6').value = input.pre_money_valuation;
  assumptions.getCell('A7').value = 'Option Pool %';
  assumptions.getCell('B7').value = input.option_pool_pct;
  assumptions.getCell('A8').value = 'Existing Investor Shares';
  assumptions.getCell('B8').value = input.existing_investors.reduce((s,i)=>s+i.shares,0);
  assumptions.getCell('A9').value = 'Pre-Money Shares';
  setFormulaCell(assumptions.getCell('B9'), '=B4+B8', output.preMoneyShares);
  assumptions.getCell('A10').value = 'Price / Share';
  setFormulaCell(assumptions.getCell('B10'), '=B6/B9', output.pricePerShare);
  assumptions.getCell('A11').value = 'New Investor Shares';
  setFormulaCell(assumptions.getCell('B11'), '=B5/B10', output.newInvestorShares);
  assumptions.getCell('A12').value = 'Option Pool Shares';
  setFormulaCell(assumptions.getCell('B12'), '=(B7*(B9+B11))/(1-B7)', output.optionPoolShares);
  assumptions.getCell('A13').value = 'Post-Money Shares';
  setFormulaCell(assumptions.getCell('B13'), '=B9+B11+B12', output.postMoneyShares);
  for (const row of [4,5,6,8,9,10,11,12,13]) { assumptions.getCell(`B${row}`).numFmt = row === 10 ? '$#,##0.00' : '#,##0.00'; }
  setPercent(assumptions.getCell('B7'));
  for (let row = 4; row <= 13; row += 1) {
    setOutputCell(assumptions.getCell(row, 1));
    if (row <= 8) setInputCell(assumptions.getCell(row, 2));
    else setOutputCell(assumptions.getCell(row, 2));
  }
  setCurrency(assumptions.getCell('B5'));
  setCurrency(assumptions.getCell('B6'));
  styleGrid(assumptions, 3, 13, 1, 2);

  const preMoneySheet = workbook.addWorksheet('Pre-Money');
  preMoneySheet.views = [{ state: 'frozen', ySplit: 3 }];
  preMoneySheet.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 18 }];
  preMoneySheet.getCell('A1').value = 'Pre-Money Ownership';
  preMoneySheet.getCell('A1').font = { bold: true, size: 14 };
  ['Shareholder', 'Shares', '% Ownership', '$ Invested (implied)'].forEach((header, idx) => preMoneySheet.getCell(3, idx + 1).value = header);
  styleHeaderRow(preMoneySheet, 3, 1, 4);
  const preRows = [{ name: 'Founders', shares: input.founders_shares }, ...input.existing_investors.map((i) => ({ name: i.name, shares: i.shares }))];
  preRows.forEach((line, idx) => {
    const row = 4 + idx;
    preMoneySheet.getCell(row, 1).value = line.name;
    preMoneySheet.getCell(row, 2).value = line.shares;
    setFormulaCell(preMoneySheet.getCell(row, 3), `=B${row}/Assumptions!$B$9`, line.shares / output.preMoneyShares);
    setFormulaCell(preMoneySheet.getCell(row, 4), `=B${row}*Assumptions!$B$10`, line.shares * output.pricePerShare);
    preMoneySheet.getCell(row, 2).numFmt = '#,##0';
    setPercent(preMoneySheet.getCell(row, 3));
    setCurrency(preMoneySheet.getCell(row, 4));
    for (let c = 1; c <= 4; c += 1) setOutputCell(preMoneySheet.getCell(row, c));
  });
  const preTotalRow = 4 + preRows.length;
  preMoneySheet.getCell(preTotalRow, 1).value = 'Total';
  setFormulaCell(preMoneySheet.getCell(preTotalRow, 2), `=SUM(B4:B${preTotalRow - 1})`, output.preMoneyShares);
  setFormulaCell(preMoneySheet.getCell(preTotalRow, 3), '=1', 1);
  setFormulaCell(preMoneySheet.getCell(preTotalRow, 4), '=Assumptions!$B$6', input.pre_money_valuation);
  preMoneySheet.getCell(preTotalRow, 2).numFmt = '#,##0';
  setPercent(preMoneySheet.getCell(preTotalRow, 3));
  setCurrency(preMoneySheet.getCell(preTotalRow, 4));
  styleGrid(preMoneySheet, 3, preTotalRow, 1, 4);

  const dilutedSheet = workbook.addWorksheet('Fully Diluted');
  dilutedSheet.views = [{ state: 'frozen', ySplit: 3 }];
  dilutedSheet.columns = [{ width: 26 }, { width: 16 }, { width: 16 }, { width: 16 }];
  dilutedSheet.getCell('A1').value = 'Fully Diluted Ownership';
  dilutedSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Shareholder', 'Shares', '% Ownership', 'Dilution %'].forEach((header, idx) => dilutedSheet.getCell(3, idx + 1).value = header);
  styleHeaderRow(dilutedSheet, 3, 1, 4);
  output.ownershipLines.forEach((line, idx) => {
    const row = 4 + idx;
    dilutedSheet.getCell(row, 1).value = line.name;
    dilutedSheet.getCell(row, 2).value = line.shares;
    setFormulaCell(dilutedSheet.getCell(row, 3), `=B${row}/Assumptions!$B$13`, line.ownershipPct);
    const preRef = idx < preRows.length ? `IF(Assumptions!$B$9=0,0,B${row}/Assumptions!$B$9)` : '0';
    setFormulaCell(dilutedSheet.getCell(row, 4), `=${preRef}-C${row}`, line.dilutionPct);
    dilutedSheet.getCell(row, 2).numFmt = '#,##0';
    setPercent(dilutedSheet.getCell(row, 3));
    setPercent(dilutedSheet.getCell(row, 4));
    for (let c = 1; c <= 4; c += 1) setOutputCell(dilutedSheet.getCell(row, c));
  });
  const dilutedTotalRow = 4 + output.ownershipLines.length;
  dilutedSheet.getCell(dilutedTotalRow, 1).value = 'Total';
  setFormulaCell(dilutedSheet.getCell(dilutedTotalRow, 2), `=SUM(B4:B${dilutedTotalRow - 1})`, output.postMoneyShares);
  setFormulaCell(dilutedSheet.getCell(dilutedTotalRow, 3), `=SUM(C4:C${dilutedTotalRow - 1})`, output.ownershipLines.reduce((s,l)=>s+l.ownershipPct,0));
  setFormulaCell(dilutedSheet.getCell(dilutedTotalRow, 4), `=SUM(D4:D${dilutedTotalRow - 1})`, output.ownershipLines.reduce((s,l)=>s+l.dilutionPct,0));
  dilutedSheet.getCell(dilutedTotalRow, 2).numFmt = '#,##0';
  setPercent(dilutedSheet.getCell(dilutedTotalRow, 3));
  setPercent(dilutedSheet.getCell(dilutedTotalRow, 4));
  styleGrid(dilutedSheet, 3, dilutedTotalRow, 1, 4);

  const checks = workbook.addWorksheet('Checks');
  checks.views = [{ state: 'frozen', ySplit: 3 }];
  checks.getColumn(1).width = 32; checks.getColumn(2).width = 18; checks.getColumn(3).width = 12;
  checks.getCell('A1').value = 'Checks'; checks.getCell('A1').font = { bold: true, size: 14 };
  checks.getCell('A3').value = 'Check'; checks.getCell('B3').value = 'Value'; checks.getCell('C3').value = 'Status';
  styleHeaderRow(checks, 3, 1, 3);
  checks.getCell('A4').value = 'Ownership totals to 100%';
  setFormulaCell(checks.getCell('B4'), `='Fully Diluted'!C${dilutedTotalRow}`, output.ownershipLines.reduce((s,l)=>s+l.ownershipPct,0));
  setPercent(checks.getCell('B4'));
  setFormulaCell(checks.getCell('C4'), '=IF(ABS(B4-1)<0.0001,"PASS","FAIL")', 'PASS');
  checks.getCell('A5').value = 'Post-money shares positive';
  setFormulaCell(checks.getCell('B5'), '=Assumptions!$B$13', output.postMoneyShares);
  checks.getCell('B5').numFmt = '#,##0';
  setFormulaCell(checks.getCell('C5'), '=IF(B5>0,"PASS","FAIL")', output.postMoneyShares > 0 ? 'PASS' : 'FAIL');
  styleGrid(checks, 3, 5, 1, 3);

  const equations = workbook.addWorksheet('Equations');
  equations.getColumn(1).width = 24; equations.getColumn(2).width = 90;
  equations.getCell('A1').value = 'Equations'; equations.getCell('A1').font = { bold: true, size: 14 };
  equations.getCell('A3').value = 'Item'; equations.getCell('B3').value = 'Equation'; styleHeaderRow(equations, 3, 1, 2);
  [['Price / Share','Pre-Money Valuation / Pre-Money Shares'],['New Investor Shares','New Investment Amount / Price / Share'],['Option Pool Shares','(Pool % * (Pre + New)) / (1 - Pool %)'],['Post-Money Shares','Pre-Money Shares + New Investor Shares + Pool Shares']].forEach(([item,eq],idx)=>{const row=4+idx;equations.getCell(row,1).value=item;equations.getCell(row,2).value=eq;setOutputCell(equations.getCell(row,1));setOutputCell(equations.getCell(row,2));});
  styleGrid(equations, 3, 7, 1, 2);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const capTableDilutionModel: ModelDef<CapTableDilutionInput, CapTableDilutionOutput> = {
  slug: 'cap-table-dilution',
  name: 'Cap Table Dilution',
  category: 'VC',
  description: 'Model a financing round, option pool refresh, and post-money ownership dilution.',
  inputSchema: CapTableDilutionInputSchema,
  uiSchema: capTableUiSchema,
  compute: computeCapTable,
  buildWorkbook: buildCapTableWorkbook,
  filename: () => 'CapitalBase_Cap_Table_Dilution.xlsx',
};

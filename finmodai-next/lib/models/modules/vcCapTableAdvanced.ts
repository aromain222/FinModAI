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
  setPercent,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';

const ExistingInvestorSchema = z.object({
  name: z.string().min(1),
  shares: z.number().nonnegative(),
});

const SafeSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  valuation_cap: z.number().positive(),
  discount_pct: z.number().min(0).max(0.5),
  mfn_flag: z.enum(['yes', 'no']),
});

export const VcCapTableAdvancedInputSchema = z.object({
  founders_shares: z.number().positive(),
  existing_investors: z.array(ExistingInvestorSchema).default([]),
  safes_notes: z.array(SafeSchema).default([]),
  option_pool_target_pct: z.number().min(0).max(0.4),
  pre_money_valuation: z.number().positive(),
  new_money_amount: z.number().positive(),
  liquidation_preference_multiple: z.number().min(1).max(3).default(1),
  participating_preference: z.enum(['yes', 'no']).default('no'),
});

type VcCapTableAdvancedInput = z.infer<typeof VcCapTableAdvancedInputSchema>;

type Holder = {
  name: string;
  shares: number;
  ownershipPct: number;
};

type VcCapTableAdvancedOutput = {
  preMoneyShares: number;
  safeSharesTotal: number;
  roundPricePerShare: number;
  newInvestorShares: number;
  optionPoolShares: number;
  postMoneyShares: number;
  holders: Holder[];
  safeConversions: Array<{ name: string; conversionPrice: number; shares: number; mfn: string }>;
  scenarios: Array<{ exitValue: number; investorProceeds: number; commonProceeds: number }>;
};

const vcCapTableAdvancedUiSchema: UISchema = {
  sections: [
    {
      title: 'Stakeholders',
      fields: [
        { key: 'founders_shares', label: 'Founder Shares', type: 'number', required: true, defaultValue: 8000000 },
        {
          key: 'existing_investors',
          label: 'Existing Investors',
          type: 'repeatableRows',
          minRows: 0,
          rowsSpec: [
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'shares', label: 'Shares', type: 'number', required: true, defaultValue: 1000000 },
          ],
          defaultRows: [{ name: 'Seed Fund', shares: 2000000 }],
        },
      ],
    },
    {
      title: 'SAFEs / Notes',
      fields: [
        {
          key: 'safes_notes',
          label: 'SAFEs / Notes',
          type: 'repeatableRows',
          minRows: 0,
          rowsSpec: [
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'amount', label: 'Amount', type: 'currency', required: true, defaultValue: 1000000 },
            { key: 'valuation_cap', label: 'Valuation Cap', type: 'currency', required: true, defaultValue: 30000000 },
            { key: 'discount_pct', label: 'Discount %', type: 'percent', required: true, defaultValue: 0.2 },
            {
              key: 'mfn_flag',
              label: 'MFN',
              type: 'select',
              required: true,
              options: [
                { label: 'Yes', value: 'yes' },
                { label: 'No', value: 'no' },
              ],
              defaultValue: 'no',
            },
          ],
        },
      ],
    },
    {
      title: 'Round Terms',
      fields: [
        { key: 'option_pool_target_pct', label: 'Option Pool Target %', type: 'percent', required: true, defaultValue: 0.1 },
        { key: 'pre_money_valuation', label: 'Pre-money Valuation', type: 'currency', required: true, defaultValue: 60000000 },
        { key: 'new_money_amount', label: 'New Money', type: 'currency', required: true, defaultValue: 15000000 },
        {
          key: 'liquidation_preference_multiple',
          label: 'Liquidation Preference Multiple',
          type: 'number',
          required: true,
          defaultValue: 1,
        },
        {
          key: 'participating_preference',
          label: 'Participating Preference',
          type: 'select',
          required: true,
          options: [
            { label: 'No', value: 'no' },
            { label: 'Yes', value: 'yes' },
          ],
          defaultValue: 'no',
        },
      ],
    },
  ],
};

function computeVcCapTableAdvanced(input: VcCapTableAdvancedInput): VcCapTableAdvancedOutput {
  const preMoneyShares = input.founders_shares + input.existing_investors.reduce((sum, investor) => sum + investor.shares, 0);
  const preMoneyPrice = input.pre_money_valuation / preMoneyShares;
  const safeConversions = input.safes_notes.map((safe) => {
    const priceFromCap = safe.valuation_cap / preMoneyShares;
    const priceFromDiscount = preMoneyPrice * (1 - safe.discount_pct);
    const conversionPrice = Math.min(priceFromCap, priceFromDiscount);
    return {
      name: safe.name,
      conversionPrice,
      shares: safe.amount / conversionPrice,
      mfn: safe.mfn_flag,
    };
  });
  const safeSharesTotal = safeConversions.reduce((sum, safe) => sum + safe.shares, 0);
  const dilutedPreMoneyShares = preMoneyShares + safeSharesTotal;
  const roundPricePerShare = input.pre_money_valuation / dilutedPreMoneyShares;
  const newInvestorShares = input.new_money_amount / roundPricePerShare;
  const optionPoolShares =
    (input.option_pool_target_pct * (dilutedPreMoneyShares + newInvestorShares)) / (1 - input.option_pool_target_pct);
  const postMoneyShares = dilutedPreMoneyShares + newInvestorShares + optionPoolShares;

  const holders: Holder[] = [
    { name: 'Founders', shares: input.founders_shares, ownershipPct: input.founders_shares / postMoneyShares },
    ...input.existing_investors.map((investor) => ({
      name: investor.name,
      shares: investor.shares,
      ownershipPct: investor.shares / postMoneyShares,
    })),
    ...safeConversions.map((safe) => ({
      name: `${safe.name} (SAFE)`,
      shares: safe.shares,
      ownershipPct: safe.shares / postMoneyShares,
    })),
    { name: 'New Investor', shares: newInvestorShares, ownershipPct: newInvestorShares / postMoneyShares },
    { name: 'Option Pool', shares: optionPoolShares, ownershipPct: optionPoolShares / postMoneyShares },
  ];

  const exitValues = [
    input.pre_money_valuation * 0.5,
    input.pre_money_valuation,
    input.pre_money_valuation * 2,
    input.pre_money_valuation * 4,
  ];
  const investorOwnership = newInvestorShares / postMoneyShares;
  const prefClaim = input.new_money_amount * input.liquidation_preference_multiple;
  const scenarios = exitValues.map((exitValue) => {
    if (input.participating_preference === 'yes') {
      const prefPaid = Math.min(exitValue, prefClaim);
      const residual = Math.max(0, exitValue - prefPaid);
      const investorResidual = residual * investorOwnership;
      const investorProceeds = prefPaid + investorResidual;
      return { exitValue, investorProceeds, commonProceeds: Math.max(0, exitValue - investorProceeds) };
    }

    const asConverted = exitValue * investorOwnership;
    const investorProceeds = Math.max(Math.min(exitValue, prefClaim), asConverted);
    return { exitValue, investorProceeds, commonProceeds: Math.max(0, exitValue - investorProceeds) };
  });

  return {
    preMoneyShares,
    safeSharesTotal,
    roundPricePerShare,
    newInvestorShares,
    optionPoolShares,
    postMoneyShares,
    holders,
    safeConversions,
    scenarios,
  };
}

async function buildVcCapTableAdvancedWorkbook(
  input: VcCapTableAdvancedInput,
  output: VcCapTableAdvancedOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const stakeholdersSheet = workbook.addWorksheet('Stakeholders');
  stakeholdersSheet.views = [{ state: 'frozen', ySplit: 3 }];
  stakeholdersSheet.columns = [{ width: 24 }, { width: 16 }, { width: 16 }];
  stakeholdersSheet.getCell('A1').value = 'Stakeholders';
  stakeholdersSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Holder', 'Shares', 'Ownership %'].forEach((header, idx) => {
    stakeholdersSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(stakeholdersSheet, 3, 1, 3);
  output.holders.forEach((holder, idx) => {
    const row = 4 + idx;
    stakeholdersSheet.getCell(row, 1).value = holder.name;
    stakeholdersSheet.getCell(row, 2).value = holder.shares;
    stakeholdersSheet.getCell(row, 3).value = holder.ownershipPct;
    stakeholdersSheet.getCell(row, 2).numFmt = '#,##0';
    setPercent(stakeholdersSheet.getCell(row, 3));
    setOutputCell(stakeholdersSheet.getCell(row, 1));
    setOutputCell(stakeholdersSheet.getCell(row, 2));
    setOutputCell(stakeholdersSheet.getCell(row, 3));
  });
  styleGrid(stakeholdersSheet, 3, 3 + output.holders.length, 1, 3);

  const preSheet = workbook.addWorksheet('Pre-Round');
  preSheet.views = [{ state: 'frozen', ySplit: 3 }];
  preSheet.getColumn(1).width = 34;
  preSheet.getColumn(2).width = 18;
  preSheet.getCell('A1').value = 'Pre-Round';
  preSheet.getCell('A1').font = { bold: true, size: 14 };
  preSheet.getCell('A3').value = 'Metric';
  preSheet.getCell('B3').value = 'Value';
  styleHeaderRow(preSheet, 3, 1, 2);
  const preRows: Array<[string, number, 'currency' | 'number']> = [
    ['Pre-money valuation', input.pre_money_valuation, 'currency'],
    ['Pre-money shares', output.preMoneyShares, 'number'],
    ['SAFE shares (as converted)', output.safeSharesTotal, 'number'],
  ];
  preRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    preSheet.getCell(row, 1).value = label;
    preSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(preSheet.getCell(row, 2));
    if (fmt === 'number') preSheet.getCell(row, 2).numFmt = '#,##0';
    setOutputCell(preSheet.getCell(row, 1));
    setOutputCell(preSheet.getCell(row, 2));
  });
  styleGrid(preSheet, 3, 6, 1, 2);

  const safeSheet = workbook.addWorksheet('SAFEs - Notes');
  safeSheet.views = [{ state: 'frozen', ySplit: 3 }];
  safeSheet.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }];
  safeSheet.getCell('A1').value = 'SAFEs / Notes Conversion';
  safeSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Name', 'Conv. Price', 'Shares', 'Amount', 'MFN'].forEach((header, idx) => {
    safeSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(safeSheet, 3, 1, 5);
  output.safeConversions.forEach((safe, idx) => {
    const inputSafe = input.safes_notes[idx];
    const row = 4 + idx;
    safeSheet.getCell(row, 1).value = safe.name;
    safeSheet.getCell(row, 2).value = safe.conversionPrice;
    safeSheet.getCell(row, 3).value = safe.shares;
    safeSheet.getCell(row, 4).value = inputSafe.amount;
    safeSheet.getCell(row, 5).value = safe.mfn.toUpperCase();
    setCurrency(safeSheet.getCell(row, 2));
    safeSheet.getCell(row, 3).numFmt = '#,##0';
    setCurrency(safeSheet.getCell(row, 4));
    for (let c = 1; c <= 5; c += 1) {
      setOutputCell(safeSheet.getCell(row, c));
    }
  });
  styleGrid(safeSheet, 3, Math.max(4, 3 + output.safeConversions.length), 1, 5);

  const roundSheet = workbook.addWorksheet('Round Modeling');
  roundSheet.views = [{ state: 'frozen', ySplit: 3 }];
  roundSheet.getColumn(1).width = 34;
  roundSheet.getColumn(2).width = 18;
  roundSheet.getCell('A1').value = 'Round Modeling';
  roundSheet.getCell('A1').font = { bold: true, size: 14 };
  roundSheet.getCell('A3').value = 'Line';
  roundSheet.getCell('B3').value = 'Value';
  styleHeaderRow(roundSheet, 3, 1, 2);
  const roundRows: Array<[string, number, 'currency' | 'percent' | 'number', boolean]> = [
    ['Option Pool Target %', input.option_pool_target_pct, 'percent', true],
    ['New Money Amount', input.new_money_amount, 'currency', true],
    ['Round Price / Share', output.roundPricePerShare, 'currency', false],
    ['New Investor Shares', output.newInvestorShares, 'number', false],
    ['Option Pool Shares', output.optionPoolShares, 'number', false],
    ['Post-money Shares', output.postMoneyShares, 'number', false],
  ];
  roundRows.forEach(([label, value, fmt, isInput], idx) => {
    const row = 4 + idx;
    roundSheet.getCell(row, 1).value = label;
    roundSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(roundSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(roundSheet.getCell(row, 2));
    if (fmt === 'number') roundSheet.getCell(row, 2).numFmt = '#,##0';
    if (isInput) setInputCell(roundSheet.getCell(row, 2));
    else setOutputCell(roundSheet.getCell(row, 2));
    setOutputCell(roundSheet.getCell(row, 1));
  });
  styleGrid(roundSheet, 3, 9, 1, 2);

  const fdSheet = workbook.addWorksheet('Post-Round FD');
  fdSheet.views = [{ state: 'frozen', ySplit: 3 }];
  fdSheet.columns = [{ width: 24 }, { width: 16 }, { width: 16 }];
  fdSheet.getCell('A1').value = 'Post-Round Fully Diluted';
  fdSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Holder', 'Shares', 'Ownership %'].forEach((header, idx) => {
    fdSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(fdSheet, 3, 1, 3);
  output.holders.forEach((holder, idx) => {
    const row = 4 + idx;
    fdSheet.getCell(row, 1).value = holder.name;
    fdSheet.getCell(row, 2).value = holder.shares;
    fdSheet.getCell(row, 3).value = holder.ownershipPct;
    fdSheet.getCell(row, 2).numFmt = '#,##0';
    setPercent(fdSheet.getCell(row, 3));
    setOutputCell(fdSheet.getCell(row, 1));
    setOutputCell(fdSheet.getCell(row, 2));
    setOutputCell(fdSheet.getCell(row, 3));
  });
  styleGrid(fdSheet, 3, 3 + output.holders.length, 1, 3);

  const waterfallSheet = workbook.addWorksheet('Ownership Waterfall');
  waterfallSheet.views = [{ state: 'frozen', ySplit: 3 }];
  waterfallSheet.getColumn(1).width = 22;
  waterfallSheet.getColumn(2).width = 18;
  waterfallSheet.getColumn(3).width = 18;
  waterfallSheet.getCell('A1').value = 'Ownership Waterfall';
  waterfallSheet.getCell('A1').font = { bold: true, size: 14 };
  waterfallSheet.getCell('A3').value = 'Exit Value';
  waterfallSheet.getCell('B3').value = 'Investor Proceeds';
  waterfallSheet.getCell('C3').value = 'Common Proceeds';
  styleHeaderRow(waterfallSheet, 3, 1, 3);
  output.scenarios.forEach((scenario, idx) => {
    const row = 4 + idx;
    waterfallSheet.getCell(row, 1).value = scenario.exitValue;
    waterfallSheet.getCell(row, 2).value = scenario.investorProceeds;
    waterfallSheet.getCell(row, 3).value = scenario.commonProceeds;
    setCurrency(waterfallSheet.getCell(row, 1));
    setCurrency(waterfallSheet.getCell(row, 2));
    setCurrency(waterfallSheet.getCell(row, 3));
    setOutputCell(waterfallSheet.getCell(row, 1));
    setOutputCell(waterfallSheet.getCell(row, 2));
    setOutputCell(waterfallSheet.getCell(row, 3));
  });
  styleGrid(waterfallSheet, 3, 3 + output.scenarios.length, 1, 3);

  const scenarioSheet = workbook.addWorksheet('Scenario Table');
  scenarioSheet.views = [{ state: 'frozen', ySplit: 3 }];
  scenarioSheet.getColumn(1).width = 26;
  scenarioSheet.getColumn(2).width = 18;
  scenarioSheet.getCell('A1').value = 'Scenario Table';
  scenarioSheet.getCell('A1').font = { bold: true, size: 14 };
  scenarioSheet.getCell('A3').value = 'Metric';
  scenarioSheet.getCell('B3').value = 'Value';
  styleHeaderRow(scenarioSheet, 3, 1, 2);
  scenarioSheet.getCell('A4').value = 'Liquidation Preference Multiple';
  scenarioSheet.getCell('B4').value = input.liquidation_preference_multiple;
  scenarioSheet.getCell('A5').value = 'Participating Preference';
  scenarioSheet.getCell('B5').value = input.participating_preference.toUpperCase();
  scenarioSheet.getCell('A6').value = 'SAFE Shares Total';
  scenarioSheet.getCell('B6').value = output.safeSharesTotal;
  scenarioSheet.getCell('B6').numFmt = '#,##0';
  setInputCell(scenarioSheet.getCell('B4'));
  setInputCell(scenarioSheet.getCell('B5'));
  setOutputCell(scenarioSheet.getCell('B6'));
  for (const cell of ['A4', 'A5', 'A6']) setOutputCell(scenarioSheet.getCell(cell));
  styleGrid(scenarioSheet, 3, 6, 1, 2);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 34;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  checksSheet.getCell('A1').value = 'Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  const ownershipSum = output.holders.reduce((sum, holder) => sum + holder.ownershipPct, 0);
  checksSheet.getCell('A4').value = 'Ownership sums to 100%';
  checksSheet.getCell('B4').value = ownershipSum;
  checksSheet.getCell('C4').value = Math.abs(ownershipSum - 1) < 0.0001 ? 'PASS' : 'FAIL';
  checksSheet.getCell('A5').value = 'Post-money shares positive';
  checksSheet.getCell('B5').value = output.postMoneyShares;
  checksSheet.getCell('C5').value = output.postMoneyShares > 0 ? 'PASS' : 'FAIL';
  setPercent(checksSheet.getCell('B4'));
  checksSheet.getCell('B5').numFmt = '#,##0';
  for (let row = 4; row <= 5; row += 1) {
    setOutputCell(checksSheet.getCell(row, 1));
    setOutputCell(checksSheet.getCell(row, 2));
    setOutputCell(checksSheet.getCell(row, 3));
  }
  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const vcCapTableAdvancedModel: ModelDef<VcCapTableAdvancedInput, VcCapTableAdvancedOutput> = {
  slug: 'vc-cap-table-advanced',
  name: 'VC Cap Table (Rounds + SAFEs + Option Pool)',
  category: 'VC',
  description: 'Priced-round cap table with SAFE conversion mechanics, dilution, and waterfall scenarios.',
  inputSchema: VcCapTableAdvancedInputSchema,
  uiSchema: vcCapTableAdvancedUiSchema,
  compute: computeVcCapTableAdvanced,
  buildWorkbook: buildVcCapTableAdvancedWorkbook,
  filename: () => 'CapitalBase_VC_Cap_Table_Advanced.xlsx',
};

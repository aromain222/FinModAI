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
import { clamp } from '@/lib/models/modules/modelUtils';

export const MaAccretionDilutionInputSchema = z
  .object({
    acquirer_shares: z.number().positive(),
    acquirer_share_price: z.number().positive(),
    acquirer_net_income: z.number(),
    acquirer_tax_rate: z.number().min(0).max(0.5),
    target_net_income: z.number(),
    purchase_price: z.number().positive(),
    cost_synergies: z.number().default(0),
    revenue_synergies: z.number().default(0),
    synergy_realization_pct: z.number().min(0).max(1).default(0.7),
    financing_cash_pct: z.number().min(0).max(1),
    financing_debt_pct: z.number().min(0).max(1),
    financing_stock_pct: z.number().min(0).max(1),
    debt_rate: z.number().min(0).max(0.3),
    transaction_fees: z.number().min(0).default(0),
    amortization_years: z.number().int().min(1).max(30).default(10),
  })
  .superRefine((input, ctx) => {
    const mix = input.financing_cash_pct + input.financing_debt_pct + input.financing_stock_pct;
    if (Math.abs(mix - 1) > 0.0001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['financing_stock_pct'],
        message: 'financing mix must sum to 100%',
      });
    }
  });

type MaAccretionDilutionInput = z.infer<typeof MaAccretionDilutionInputSchema>;

type MaAccretionDilutionOutput = {
  purchasePriceAllocation: {
    goodwill: number;
    amortizableIntangibles: number;
    writeUp: number;
  };
  financing: {
    cash: number;
    debt: number;
    stock: number;
    newShares: number;
  };
  proForma: {
    standaloneEps: number;
    proFormaNetIncome: number;
    proFormaShares: number;
    proFormaEps: number;
    accretionDilutionPct: number;
    afterTaxSynergies: number;
    afterTaxInterest: number;
    afterTaxAmortization: number;
    afterTaxFees: number;
  };
  sensitivity: {
    synergyAxis: number[];
    stockMixAxis: number[];
    values: number[][];
  };
  checks: {
    financingTies: number;
  };
};

const maAccretionDilutionUiSchema: UISchema = {
  sections: [
    {
      title: 'Acquirer Inputs',
      fields: [
        { key: 'acquirer_shares', label: 'Acquirer Shares', type: 'number', required: true, defaultValue: 1000 },
        { key: 'acquirer_share_price', label: 'Acquirer Share Price', type: 'currency', required: true, defaultValue: 100 },
        { key: 'acquirer_net_income', label: 'Acquirer Net Income', type: 'currency', required: true, defaultValue: 1200 },
        { key: 'acquirer_tax_rate', label: 'Acquirer Tax Rate', type: 'percent', required: true, defaultValue: 0.25 },
      ],
    },
    {
      title: 'Target + Deal Terms',
      fields: [
        { key: 'target_net_income', label: 'Target Net Income', type: 'currency', required: true, defaultValue: 350 },
        { key: 'purchase_price', label: 'Purchase Price', type: 'currency', required: true, defaultValue: 6000 },
        { key: 'cost_synergies', label: 'Cost Synergies', type: 'currency', required: true, defaultValue: 120 },
        { key: 'revenue_synergies', label: 'Revenue Synergies (EBIT impact)', type: 'currency', required: true, defaultValue: 80 },
        { key: 'synergy_realization_pct', label: 'Synergy Realization %', type: 'percent', required: true, defaultValue: 0.7 },
      ],
    },
    {
      title: 'Financing',
      fields: [
        { key: 'financing_cash_pct', label: 'Cash %', type: 'percent', required: true, defaultValue: 0.3 },
        { key: 'financing_debt_pct', label: 'Debt %', type: 'percent', required: true, defaultValue: 0.4 },
        { key: 'financing_stock_pct', label: 'Stock %', type: 'percent', required: true, defaultValue: 0.3 },
        { key: 'debt_rate', label: 'Debt Rate', type: 'percent', required: true, defaultValue: 0.08 },
        { key: 'transaction_fees', label: 'Transaction Fees', type: 'currency', required: true, defaultValue: 90 },
        { key: 'amortization_years', label: 'Intangible Amort Years', type: 'number', required: true, defaultValue: 10 },
      ],
    },
  ],
};

function computeAccretionAt(
  input: MaAccretionDilutionInput,
  synergyMultiplier: number,
  stockPctOverride: number,
): MaAccretionDilutionOutput['proForma'] {
  const tax = input.acquirer_tax_rate;
  const cashPct = input.financing_cash_pct;
  const debtPct = clamp(input.financing_cash_pct + input.financing_debt_pct + input.financing_stock_pct - stockPctOverride - cashPct, 0, 1);
  const stockPct = clamp(stockPctOverride, 0, 1 - cashPct);
  const debt = input.purchase_price * debtPct;
  const stock = input.purchase_price * stockPct;
  const newShares = stock / input.acquirer_share_price;
  const amortizableIntangibles = input.purchase_price * 0.25;
  const amortization = amortizableIntangibles / input.amortization_years;
  const afterTaxSynergies = (input.cost_synergies + input.revenue_synergies) * input.synergy_realization_pct * synergyMultiplier * (1 - tax);
  const afterTaxInterest = debt * input.debt_rate * (1 - tax);
  const afterTaxAmortization = amortization * (1 - tax);
  const afterTaxFees = input.transaction_fees * (1 - tax);

  const proFormaNetIncome =
    input.acquirer_net_income +
    input.target_net_income +
    afterTaxSynergies -
    afterTaxInterest -
    afterTaxAmortization -
    afterTaxFees;
  const proFormaShares = input.acquirer_shares + newShares;
  const proFormaEps = proFormaNetIncome / proFormaShares;
  const standaloneEps = input.acquirer_net_income / input.acquirer_shares;
  const accretionDilutionPct = standaloneEps === 0 ? 0 : proFormaEps / standaloneEps - 1;

  return {
    standaloneEps,
    proFormaNetIncome,
    proFormaShares,
    proFormaEps,
    accretionDilutionPct,
    afterTaxSynergies,
    afterTaxInterest,
    afterTaxAmortization,
    afterTaxFees,
  };
}

function computeMaAccretionDilution(input: MaAccretionDilutionInput): MaAccretionDilutionOutput {
  const financing = {
    cash: input.purchase_price * input.financing_cash_pct,
    debt: input.purchase_price * input.financing_debt_pct,
    stock: input.purchase_price * input.financing_stock_pct,
    newShares: (input.purchase_price * input.financing_stock_pct) / input.acquirer_share_price,
  };

  const purchasePriceAllocation = {
    writeUp: input.purchase_price * 0.1,
    amortizableIntangibles: input.purchase_price * 0.25,
    goodwill: input.purchase_price * 0.65,
  };

  const proForma = computeAccretionAt(input, 1, input.financing_stock_pct);
  const synergyAxis = [0.5, 0.75, 1, 1.25, 1.5];
  const stockMixAxis = [
    clamp(input.financing_stock_pct - 0.2, 0, 1),
    clamp(input.financing_stock_pct - 0.1, 0, 1),
    clamp(input.financing_stock_pct, 0, 1),
    clamp(input.financing_stock_pct + 0.1, 0, 1),
    clamp(input.financing_stock_pct + 0.2, 0, 1),
  ];

  const values = synergyAxis.map((synergyMul) =>
    stockMixAxis.map((stockPct) => computeAccretionAt(input, synergyMul, stockPct).accretionDilutionPct),
  );

  return {
    purchasePriceAllocation,
    financing,
    proForma,
    sensitivity: { synergyAxis, stockMixAxis, values },
    checks: {
      financingTies: financing.cash + financing.debt + financing.stock - input.purchase_price,
    },
  };
}

async function buildMaAccretionDilutionWorkbook(
  input: MaAccretionDilutionInput,
  output: MaAccretionDilutionOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const assumptionsSheet = workbook.addWorksheet('Deal Assumptions');
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 36;
  assumptionsSheet.getColumn(2).width = 18;
  assumptionsSheet.getCell('A1').value = 'Deal Assumptions';
  assumptionsSheet.getCell('A1').font = { bold: true, size: 14 };
  assumptionsSheet.getCell('A3').value = 'Input';
  assumptionsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(assumptionsSheet, 3, 1, 2);
  const assumptionRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Acquirer Shares', input.acquirer_shares, 'number'],
    ['Acquirer Share Price', input.acquirer_share_price, 'currency'],
    ['Acquirer Net Income', input.acquirer_net_income, 'currency'],
    ['Acquirer Tax Rate', input.acquirer_tax_rate, 'percent'],
    ['Target Net Income', input.target_net_income, 'currency'],
    ['Purchase Price', input.purchase_price, 'currency'],
    ['Cost Synergies', input.cost_synergies, 'currency'],
    ['Revenue Synergies', input.revenue_synergies, 'currency'],
    ['Synergy Realization %', input.synergy_realization_pct, 'percent'],
  ];
  assumptionRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    assumptionsSheet.getCell(row, 1).value = label;
    assumptionsSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(assumptionsSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(assumptionsSheet.getCell(row, 2));
    setInputCell(assumptionsSheet.getCell(row, 2));
    setOutputCell(assumptionsSheet.getCell(row, 1));
  });
  styleGrid(assumptionsSheet, 3, 3 + assumptionRows.length, 1, 2);

  const ppaSheet = workbook.addWorksheet('Purchase Price Allocation');
  ppaSheet.views = [{ state: 'frozen', ySplit: 3 }];
  ppaSheet.getColumn(1).width = 34;
  ppaSheet.getColumn(2).width = 18;
  ppaSheet.getCell('A1').value = 'Purchase Price Allocation';
  ppaSheet.getCell('A1').font = { bold: true, size: 14 };
  ppaSheet.getCell('A3').value = 'Component';
  ppaSheet.getCell('B3').value = 'Value';
  styleHeaderRow(ppaSheet, 3, 1, 2);
  const ppaRows: Array<[string, number]> = [
    ['Write-up', output.purchasePriceAllocation.writeUp],
    ['Amortizable Intangibles', output.purchasePriceAllocation.amortizableIntangibles],
    ['Goodwill', output.purchasePriceAllocation.goodwill],
    ['Total Purchase Price', input.purchase_price],
  ];
  ppaRows.forEach(([label, value], idx) => {
    const row = 4 + idx;
    ppaSheet.getCell(row, 1).value = label;
    ppaSheet.getCell(row, 2).value = value;
    setCurrency(ppaSheet.getCell(row, 2));
    setOutputCell(ppaSheet.getCell(row, 1));
    setOutputCell(ppaSheet.getCell(row, 2));
  });
  ppaSheet.getCell('A7').font = { bold: true };
  ppaSheet.getCell('B7').font = { bold: true };
  styleGrid(ppaSheet, 3, 7, 1, 2);

  const adjustmentsSheet = workbook.addWorksheet('Pro Forma Adjustments');
  adjustmentsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  adjustmentsSheet.getColumn(1).width = 36;
  adjustmentsSheet.getColumn(2).width = 18;
  adjustmentsSheet.getCell('A1').value = 'Pro Forma Adjustments';
  adjustmentsSheet.getCell('A1').font = { bold: true, size: 14 };
  adjustmentsSheet.getCell('A3').value = 'Adjustment';
  adjustmentsSheet.getCell('B3').value = 'After-tax Impact';
  styleHeaderRow(adjustmentsSheet, 3, 1, 2);
  const adjustmentRows: Array<[string, number]> = [
    ['Synergies', output.proForma.afterTaxSynergies],
    ['Interest Expense', -output.proForma.afterTaxInterest],
    ['Amortization', -output.proForma.afterTaxAmortization],
    ['Transaction Fees', -output.proForma.afterTaxFees],
  ];
  adjustmentRows.forEach(([label, value], idx) => {
    const row = 4 + idx;
    adjustmentsSheet.getCell(row, 1).value = label;
    adjustmentsSheet.getCell(row, 2).value = value;
    setCurrency(adjustmentsSheet.getCell(row, 2));
    setOutputCell(adjustmentsSheet.getCell(row, 1));
    setOutputCell(adjustmentsSheet.getCell(row, 2));
  });
  styleGrid(adjustmentsSheet, 3, 7, 1, 2);

  const financingSheet = workbook.addWorksheet('Financing');
  financingSheet.views = [{ state: 'frozen', ySplit: 3 }];
  financingSheet.getColumn(1).width = 34;
  financingSheet.getColumn(2).width = 18;
  financingSheet.getCell('A1').value = 'Financing';
  financingSheet.getCell('A1').font = { bold: true, size: 14 };
  financingSheet.getCell('A3').value = 'Line';
  financingSheet.getCell('B3').value = 'Value';
  styleHeaderRow(financingSheet, 3, 1, 2);
  const financingRows: Array<[string, number, 'currency' | 'percent' | 'number', boolean]> = [
    ['Cash %', input.financing_cash_pct, 'percent', true],
    ['Debt %', input.financing_debt_pct, 'percent', true],
    ['Stock %', input.financing_stock_pct, 'percent', true],
    ['Debt Rate', input.debt_rate, 'percent', true],
    ['Cash Consideration', output.financing.cash, 'currency', false],
    ['Debt Financing', output.financing.debt, 'currency', false],
    ['Stock Financing', output.financing.stock, 'currency', false],
    ['New Shares Issued', output.financing.newShares, 'number', false],
  ];
  financingRows.forEach(([label, value, fmt, isInput], idx) => {
    const row = 4 + idx;
    financingSheet.getCell(row, 1).value = label;
    financingSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(financingSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(financingSheet.getCell(row, 2));
    if (isInput) setInputCell(financingSheet.getCell(row, 2));
    else setOutputCell(financingSheet.getCell(row, 2));
    setOutputCell(financingSheet.getCell(row, 1));
  });
  styleGrid(financingSheet, 3, 11, 1, 2);

  const pfIsSheet = workbook.addWorksheet('Pro Forma Income Statement');
  pfIsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  pfIsSheet.getColumn(1).width = 40;
  pfIsSheet.getColumn(2).width = 18;
  pfIsSheet.getCell('A1').value = 'Pro Forma Income Statement';
  pfIsSheet.getCell('A1').font = { bold: true, size: 14 };
  pfIsSheet.getCell('A3').value = 'Line';
  pfIsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(pfIsSheet, 3, 1, 2);
  const pfRows: Array<[string, number]> = [
    ['Acquirer Net Income', input.acquirer_net_income],
    ['Target Net Income', input.target_net_income],
    ['After-tax Synergies', output.proForma.afterTaxSynergies],
    ['After-tax Interest', -output.proForma.afterTaxInterest],
    ['After-tax Amortization', -output.proForma.afterTaxAmortization],
    ['After-tax Fees', -output.proForma.afterTaxFees],
    ['Pro Forma Net Income', output.proForma.proFormaNetIncome],
  ];
  pfRows.forEach(([label, value], idx) => {
    const row = 4 + idx;
    pfIsSheet.getCell(row, 1).value = label;
    pfIsSheet.getCell(row, 2).value = value;
    setCurrency(pfIsSheet.getCell(row, 2));
    setOutputCell(pfIsSheet.getCell(row, 1));
    setOutputCell(pfIsSheet.getCell(row, 2));
  });
  pfIsSheet.getCell('A10').font = { bold: true };
  pfIsSheet.getCell('B10').font = { bold: true };
  styleGrid(pfIsSheet, 3, 10, 1, 2);

  const accDilSheet = workbook.addWorksheet('Accretion - Dilution');
  accDilSheet.views = [{ state: 'frozen', ySplit: 3 }];
  accDilSheet.getColumn(1).width = 34;
  accDilSheet.getColumn(2).width = 18;
  accDilSheet.getCell('A1').value = 'Accretion / Dilution';
  accDilSheet.getCell('A1').font = { bold: true, size: 14 };
  accDilSheet.getCell('A3').value = 'Metric';
  accDilSheet.getCell('B3').value = 'Value';
  styleHeaderRow(accDilSheet, 3, 1, 2);
  const accRows: Array<[string, number, 'currency' | 'percent']> = [
    ['Standalone EPS', output.proForma.standaloneEps, 'currency'],
    ['Pro Forma EPS', output.proForma.proFormaEps, 'currency'],
    ['Accretion / Dilution %', output.proForma.accretionDilutionPct, 'percent'],
  ];
  accRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    accDilSheet.getCell(row, 1).value = label;
    accDilSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') accDilSheet.getCell(row, 2).numFmt = '$#,##0.000';
    if (fmt === 'percent') setPercent(accDilSheet.getCell(row, 2));
    setOutputCell(accDilSheet.getCell(row, 1));
    setOutputCell(accDilSheet.getCell(row, 2));
  });
  accDilSheet.getCell('A6').font = { bold: true };
  accDilSheet.getCell('B6').font = { bold: true };
  styleGrid(accDilSheet, 3, 6, 1, 2);

  const sensSheet = workbook.addWorksheet('Sensitivities');
  sensSheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }];
  sensSheet.getColumn(1).width = 24;
  sensSheet.getColumn(2).width = 16;
  output.sensitivity.stockMixAxis.forEach((_, idx) => {
    sensSheet.getColumn(3 + idx).width = 14;
  });
  sensSheet.getCell('A1').value = 'EPS Accretion / Dilution Sensitivity';
  sensSheet.getCell('A1').font = { bold: true, size: 14 };
  sensSheet.getCell('A3').value = 'Synergy \\ Stock Mix';
  output.sensitivity.stockMixAxis.forEach((stockMix, idx) => {
    sensSheet.getCell(3, 3 + idx).value = stockMix;
    setPercent(sensSheet.getCell(3, 3 + idx));
    setOutputCell(sensSheet.getCell(3, 3 + idx));
  });
  output.sensitivity.synergyAxis.forEach((synergyMul, rowIdx) => {
    const row = 4 + rowIdx;
    sensSheet.getCell(row, 2).value = synergyMul;
    sensSheet.getCell(row, 2).numFmt = '0.00x';
    setOutputCell(sensSheet.getCell(row, 2));
    output.sensitivity.values[rowIdx].forEach((value, colIdx) => {
      sensSheet.getCell(row, 3 + colIdx).value = value;
      setPercent(sensSheet.getCell(row, 3 + colIdx));
      setOutputCell(sensSheet.getCell(row, 3 + colIdx));
    });
  });
  styleHeaderRow(sensSheet, 3, 1, 2 + output.sensitivity.stockMixAxis.length);
  styleGrid(sensSheet, 3, 3 + output.sensitivity.synergyAxis.length, 2, 2 + output.sensitivity.stockMixAxis.length);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 34;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 14;
  checksSheet.getCell('A1').value = 'Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'Financing Sources = Purchase Price';
  checksSheet.getCell('B4').value = output.checks.financingTies;
  checksSheet.getCell('C4').value = Math.abs(output.checks.financingTies) < 0.01 ? 'PASS' : 'FAIL';
  checksSheet.getCell('A5').value = 'Accretion calc not NaN';
  checksSheet.getCell('B5').value = Number.isFinite(output.proForma.accretionDilutionPct) ? 0 : 1;
  checksSheet.getCell('C5').value = Number.isFinite(output.proForma.accretionDilutionPct) ? 'PASS' : 'FAIL';
  setCurrency(checksSheet.getCell('B4'));
  checksSheet.getCell('B5').numFmt = '0';
  for (let row = 4; row <= 5; row += 1) {
    setOutputCell(checksSheet.getCell(row, 1));
    setOutputCell(checksSheet.getCell(row, 2));
    setOutputCell(checksSheet.getCell(row, 3));
  }
  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const maAccretionDilutionModel: ModelDef<MaAccretionDilutionInput, MaAccretionDilutionOutput> = {
  slug: 'ma-accretion-dilution',
  name: 'M&A Accretion / Dilution Model',
  category: 'Corporate Finance',
  description: 'Banker-style accretion/dilution model with PPA, financing, pro forma EPS and sensitivities.',
  inputSchema: MaAccretionDilutionInputSchema,
  uiSchema: maAccretionDilutionUiSchema,
  compute: computeMaAccretionDilution,
  buildWorkbook: buildMaAccretionDilutionWorkbook,
  filename: () => 'CapitalBase_MA_Accretion_Dilution.xlsx',
};

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

export const BuybackEpsAccretionInputSchema = z.object({
  current_net_income: z.number().positive(),
  shares_outstanding: z.number().positive(),
  current_share_price: z.number().positive(),
  repurchase_amount: z.number().positive(),
  debt_funded_pct: z.number().min(0).max(1),
  debt_rate: z.number().min(0).max(0.25),
  tax_rate: z.number().min(0).max(0.5),
  repurchase_premium_pct: z.number().min(-0.2).max(0.5).default(0),
});

type BuybackEpsAccretionInput = z.infer<typeof BuybackEpsAccretionInputSchema>;

type BuybackEpsAccretionOutput = {
  repurchasePrice: number;
  sharesRepurchased: number;
  debtRaised: number;
  afterTaxInterest: number;
  standaloneEps: number;
  proFormaNetIncome: number;
  proFormaShares: number;
  proFormaEps: number;
  accretionPct: number;
  sensitivity: {
    priceAxis: number[];
    debtAxis: number[];
    values: number[][];
  };
};

const buybackEpsAccretionUiSchema: UISchema = {
  sections: [
    {
      title: 'Base Share Count',
      fields: [
        { key: 'current_net_income', label: 'Current Net Income', type: 'currency', required: true, defaultValue: 5000 },
        { key: 'shares_outstanding', label: 'Shares Outstanding', type: 'number', required: true, defaultValue: 1000 },
        { key: 'current_share_price', label: 'Current Share Price', type: 'currency', required: true, defaultValue: 100 },
      ],
    },
    {
      title: 'Buyback Assumptions',
      fields: [
        { key: 'repurchase_amount', label: 'Repurchase Amount', type: 'currency', required: true, defaultValue: 5000 },
        { key: 'debt_funded_pct', label: 'Debt-funded %', type: 'percent', required: true, defaultValue: 0.5 },
        { key: 'debt_rate', label: 'Debt Rate', type: 'percent', required: true, defaultValue: 0.06 },
        { key: 'tax_rate', label: 'Tax Rate', type: 'percent', required: true, defaultValue: 0.25 },
        { key: 'repurchase_premium_pct', label: 'Repurchase Premium', type: 'percent', required: true, defaultValue: 0.02 },
      ],
    },
  ],
};

function computeAccretionAt(
  input: BuybackEpsAccretionInput,
  pricePremiumPct: number,
  debtPct: number,
): { proFormaEps: number; accretionPct: number } {
  const repurchasePrice = input.current_share_price * (1 + pricePremiumPct);
  const sharesRepurchased = input.repurchase_amount / repurchasePrice;
  const debtRaised = input.repurchase_amount * debtPct;
  const afterTaxInterest = debtRaised * input.debt_rate * (1 - input.tax_rate);
  const standaloneEps = input.current_net_income / input.shares_outstanding;
  const proFormaNetIncome = input.current_net_income - afterTaxInterest;
  const proFormaShares = input.shares_outstanding - sharesRepurchased;
  const proFormaEps = proFormaNetIncome / proFormaShares;
  const accretionPct = standaloneEps === 0 ? 0 : proFormaEps / standaloneEps - 1;
  return { proFormaEps, accretionPct };
}

function computeBuybackEpsAccretion(input: BuybackEpsAccretionInput): BuybackEpsAccretionOutput {
  const repurchasePrice = input.current_share_price * (1 + input.repurchase_premium_pct);
  const sharesRepurchased = input.repurchase_amount / repurchasePrice;
  const debtRaised = input.repurchase_amount * input.debt_funded_pct;
  const afterTaxInterest = debtRaised * input.debt_rate * (1 - input.tax_rate);
  const standaloneEps = input.current_net_income / input.shares_outstanding;
  const proFormaNetIncome = input.current_net_income - afterTaxInterest;
  const proFormaShares = input.shares_outstanding - sharesRepurchased;
  const proFormaEps = proFormaNetIncome / proFormaShares;
  const accretionPct = standaloneEps === 0 ? 0 : proFormaEps / standaloneEps - 1;

  const priceAxis = [-0.05, 0, 0.05, 0.1, 0.15].map((delta) => clamp(input.repurchase_premium_pct + delta, -0.2, 0.5));
  const debtAxis = [-0.2, -0.1, 0, 0.1, 0.2].map((delta) => clamp(input.debt_funded_pct + delta, 0, 1));
  const values = priceAxis.map((premium) => debtAxis.map((debtPct) => computeAccretionAt(input, premium, debtPct).accretionPct));

  return {
    repurchasePrice,
    sharesRepurchased,
    debtRaised,
    afterTaxInterest,
    standaloneEps,
    proFormaNetIncome,
    proFormaShares,
    proFormaEps,
    accretionPct,
    sensitivity: { priceAxis, debtAxis, values },
  };
}

async function buildBuybackEpsAccretionWorkbook(
  input: BuybackEpsAccretionInput,
  output: BuybackEpsAccretionOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 36;
  assumptionsSheet.getColumn(2).width = 18;
  assumptionsSheet.getCell('A1').value = 'Buyback / EPS Accretion Assumptions';
  assumptionsSheet.getCell('A1').font = { bold: true, size: 14 };
  assumptionsSheet.getCell('A3').value = 'Input';
  assumptionsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(assumptionsSheet, 3, 1, 2);
  const assumptionRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Current Net Income', input.current_net_income, 'currency'],
    ['Shares Outstanding', input.shares_outstanding, 'number'],
    ['Current Share Price', input.current_share_price, 'currency'],
    ['Repurchase Amount', input.repurchase_amount, 'currency'],
    ['Debt-funded %', input.debt_funded_pct, 'percent'],
    ['Debt Rate', input.debt_rate, 'percent'],
    ['Tax Rate', input.tax_rate, 'percent'],
    ['Repurchase Premium', input.repurchase_premium_pct, 'percent'],
  ];
  assumptionRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    assumptionsSheet.getCell(row, 1).value = label;
    assumptionsSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(assumptionsSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(assumptionsSheet.getCell(row, 2));
    if (fmt === 'number') assumptionsSheet.getCell(row, 2).numFmt = '#,##0.00';
    setInputCell(assumptionsSheet.getCell(row, 2));
    setOutputCell(assumptionsSheet.getCell(row, 1));
  });
  styleGrid(assumptionsSheet, 3, 11, 1, 2);

  const bridgeSheet = workbook.addWorksheet('EPS Bridge');
  bridgeSheet.views = [{ state: 'frozen', ySplit: 3 }];
  bridgeSheet.getColumn(1).width = 36;
  bridgeSheet.getColumn(2).width = 18;
  bridgeSheet.getCell('A1').value = 'EPS Accretion / Dilution Bridge';
  bridgeSheet.getCell('A1').font = { bold: true, size: 14 };
  bridgeSheet.getCell('A3').value = 'Metric';
  bridgeSheet.getCell('B3').value = 'Value';
  styleHeaderRow(bridgeSheet, 3, 1, 2);
  const bridgeRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Repurchase Price', output.repurchasePrice, 'currency'],
    ['Shares Repurchased', output.sharesRepurchased, 'number'],
    ['Debt Raised', output.debtRaised, 'currency'],
    ['After-tax Interest', output.afterTaxInterest, 'currency'],
    ['Standalone EPS', output.standaloneEps, 'currency'],
    ['Pro Forma Net Income', output.proFormaNetIncome, 'currency'],
    ['Pro Forma Shares', output.proFormaShares, 'number'],
    ['Pro Forma EPS', output.proFormaEps, 'currency'],
    ['EPS Accretion / Dilution', output.accretionPct, 'percent'],
  ];
  bridgeRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    bridgeSheet.getCell(row, 1).value = label;
    bridgeSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(bridgeSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(bridgeSheet.getCell(row, 2));
    if (fmt === 'number') bridgeSheet.getCell(row, 2).numFmt = '#,##0.00';
    setOutputCell(bridgeSheet.getCell(row, 1));
    setOutputCell(bridgeSheet.getCell(row, 2));
  });
  styleGrid(bridgeSheet, 3, 12, 1, 2);

  const sensitivitySheet = workbook.addWorksheet('Sensitivity');
  sensitivitySheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }];
  sensitivitySheet.getColumn(1).width = 20;
  sensitivitySheet.getColumn(2).width = 16;
  sensitivitySheet.getCell('A1').value = 'EPS Accretion Sensitivity';
  sensitivitySheet.getCell('A1').font = { bold: true, size: 14 };
  sensitivitySheet.getCell('A3').value = 'Premium';
  sensitivitySheet.getCell('B3').value = 'Debt-funded %';
  output.sensitivity.debtAxis.forEach((value, idx) => {
    sensitivitySheet.getCell(4, 3 + idx).value = value;
    setPercent(sensitivitySheet.getCell(4, 3 + idx));
  });
  styleHeaderRow(sensitivitySheet, 4, 1, 2 + output.sensitivity.debtAxis.length);
  output.sensitivity.priceAxis.forEach((premium, rowIdx) => {
    const row = 5 + rowIdx;
    sensitivitySheet.getCell(row, 1).value = 'Repurchase Premium';
    sensitivitySheet.getCell(row, 2).value = premium;
    setPercent(sensitivitySheet.getCell(row, 2));
    output.sensitivity.values[rowIdx].forEach((value, colIdx) => {
      sensitivitySheet.getCell(row, 3 + colIdx).value = value;
      setPercent(sensitivitySheet.getCell(row, 3 + colIdx));
      setOutputCell(sensitivitySheet.getCell(row, 3 + colIdx));
    });
    setOutputCell(sensitivitySheet.getCell(row, 1));
    setOutputCell(sensitivitySheet.getCell(row, 2));
  });
  styleGrid(sensitivitySheet, 4, 4 + output.sensitivity.priceAxis.length, 1, 2 + output.sensitivity.debtAxis.length);

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
  checksSheet.getCell('A4').value = 'Pro forma shares remain positive';
  checksSheet.getCell('B4').value = output.proFormaShares;
  checksSheet.getCell('C4').value = output.proFormaShares > 0 ? 'PASS' : 'FAIL';
  checksSheet.getCell('B4').numFmt = '#,##0.00';
  checksSheet.getCell('A5').value = 'Accretion finite';
  checksSheet.getCell('B5').value = output.accretionPct;
  checksSheet.getCell('C5').value = Number.isFinite(output.accretionPct) ? 'PASS' : 'FAIL';
  setPercent(checksSheet.getCell('B5'));
  for (let row = 4; row <= 5; row += 1) for (let col = 1; col <= 3; col += 1) setOutputCell(checksSheet.getCell(row, col));
  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const buybackEpsAccretionModel: ModelDef<BuybackEpsAccretionInput, BuybackEpsAccretionOutput> = {
  slug: 'buyback-eps-accretion',
  name: 'Buyback / EPS Accretion Model',
  category: 'Corporate Finance',
  description: 'Model share repurchases, financing mix, and EPS accretion or dilution from a buyback program.',
  inputSchema: BuybackEpsAccretionInputSchema,
  uiSchema: buybackEpsAccretionUiSchema,
  compute: computeBuybackEpsAccretion,
  buildWorkbook: buildBuybackEpsAccretionWorkbook,
  filename: () => 'CapitalBase_Buyback_EPS_Accretion.xlsx',
};

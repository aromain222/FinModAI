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

function computeAccretionAt(input: BuybackEpsAccretionInput, pricePremiumPct: number, debtPct: number): { proFormaEps: number; accretionPct: number } {
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

async function buildBuybackEpsAccretionWorkbook(input: BuybackEpsAccretionInput, output: BuybackEpsAccretionOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  applyWorksheetChrome(assumptionsSheet, { tabColor: 'FF1D4ED8' });
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 36;
  assumptionsSheet.getColumn(2).width = 18;
  addSheetTitle(assumptionsSheet, 'Buyback / EPS Accretion Assumptions', 2, 'Editable inputs are highlighted. All outputs are formula-linked.');
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
  applyWorksheetChrome(bridgeSheet, { tabColor: 'FF0F766E' });
  bridgeSheet.views = [{ state: 'frozen', ySplit: 3 }];
  bridgeSheet.getColumn(1).width = 36;
  bridgeSheet.getColumn(2).width = 18;
  addSheetTitle(bridgeSheet, 'EPS Accretion / Dilution Bridge', 2, 'Bridge from funding mix and repurchase price to pro forma EPS.');
  bridgeSheet.getCell('A3').value = 'Metric';
  bridgeSheet.getCell('B3').value = 'Value';
  styleHeaderRow(bridgeSheet, 3, 1, 2);
  const bridgeRows: Array<[string, string, number, 'currency' | 'percent' | 'number']> = [
    ['Repurchase Price', '=Assumptions!$B$6*(1+Assumptions!$B$11)', output.repurchasePrice, 'currency'],
    ['Shares Repurchased', '=Assumptions!$B$7/B4', output.sharesRepurchased, 'number'],
    ['Debt Raised', '=Assumptions!$B$7*Assumptions!$B$8', output.debtRaised, 'currency'],
    ['After-tax Interest', '=B6*Assumptions!$B$9*(1-Assumptions!$B$10)', output.afterTaxInterest, 'currency'],
    ['Standalone EPS', '=Assumptions!$B$4/Assumptions!$B$5', output.standaloneEps, 'currency'],
    ['Pro Forma Net Income', '=Assumptions!$B$4-B7', output.proFormaNetIncome, 'currency'],
    ['Pro Forma Shares', '=Assumptions!$B$5-B5', output.proFormaShares, 'number'],
    ['Pro Forma EPS', '=B9/B10', output.proFormaEps, 'currency'],
    ['EPS Accretion / Dilution', '=IF(B8=0,0,B11/B8-1)', output.accretionPct, 'percent'],
  ];
  bridgeRows.forEach(([label, formula, value, fmt], idx) => {
    const row = 4 + idx;
    bridgeSheet.getCell(row, 1).value = label;
    setFormulaCell(bridgeSheet.getCell(row, 2), formula, value);
    if (fmt === 'currency') setCurrency(bridgeSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(bridgeSheet.getCell(row, 2));
    if (fmt === 'number') bridgeSheet.getCell(row, 2).numFmt = '#,##0.00';
    setOutputCell(bridgeSheet.getCell(row, 1));
  });
  styleGrid(bridgeSheet, 3, 12, 1, 2);

  const sensitivitySheet = workbook.addWorksheet('Sensitivity');
  applyWorksheetChrome(sensitivitySheet, { tabColor: 'FF7C3AED' });
  sensitivitySheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }];
  sensitivitySheet.getColumn(1).width = 20;
  sensitivitySheet.getColumn(2).width = 16;
  addSheetTitle(sensitivitySheet, 'EPS Accretion Sensitivity', 7, 'Stress the repurchase premium and debt-funded mix to see where accretion breaks.');
  sensitivitySheet.getCell('A3').value = 'Premium';
  sensitivitySheet.getCell('B3').value = 'Debt-funded %';
  output.sensitivity.debtAxis.forEach((value, idx) => {
    const cell = sensitivitySheet.getCell(4, 3 + idx);
    const delta = [-0.2, -0.1, 0, 0.1, 0.2][idx];
    setFormulaCell(cell, `=MAX(0,MIN(1,Assumptions!$B$8+${delta}))`, value);
    setPercent(cell);
  });
  styleHeaderRow(sensitivitySheet, 4, 1, 2 + output.sensitivity.debtAxis.length);
  output.sensitivity.priceAxis.forEach((premium, rowIdx) => {
    const row = 5 + rowIdx;
    sensitivitySheet.getCell(row, 1).value = 'Repurchase Premium';
    setFormulaCell(sensitivitySheet.getCell(row, 2), `=MAX(-20%,MIN(50%,Assumptions!$B$11+${[-0.05, 0, 0.05, 0.1, 0.15][rowIdx]}))`, premium);
    setPercent(sensitivitySheet.getCell(row, 2));
    output.sensitivity.values[rowIdx].forEach((value, colIdx) => {
      const col = 3 + colIdx;
      const debtCell = sensitivitySheet.getCell(4, col).address;
      setFormulaCell(
        sensitivitySheet.getCell(row, col),
        `=IF((Assumptions!$B$4/Assumptions!$B$5)=0,0,((Assumptions!$B$4-(Assumptions!$B$7*${debtCell}*Assumptions!$B$9*(1-Assumptions!$B$10)))/(Assumptions!$B$5-(Assumptions!$B$7/(Assumptions!$B$6*(1+$B${row})))))/(Assumptions!$B$4/Assumptions!$B$5)-1)`,
        value,
      );
      setPercent(sensitivitySheet.getCell(row, col));
      setOutputCell(sensitivitySheet.getCell(row, col));
    });
    setOutputCell(sensitivitySheet.getCell(row, 1));
    setOutputCell(sensitivitySheet.getCell(row, 2));
  });
  styleGrid(sensitivitySheet, 4, 4 + output.sensitivity.priceAxis.length, 1, 2 + output.sensitivity.debtAxis.length);

  const checksSheet = workbook.addWorksheet('Checks');
  applyWorksheetChrome(checksSheet, { tabColor: 'FFB45309' });
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 36;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  addSheetTitle(checksSheet, 'Checks', 3, 'Use this tab to confirm the buyback math and share count remain economically valid.');
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'Pro forma shares remain positive';
  setFormulaCell(checksSheet.getCell('B4'), '=IF(OR(Assumptions!$B$6=0,(1+Assumptions!$B$11)=0),0,Assumptions!$B$5-(Assumptions!$B$7/(Assumptions!$B$6*(1+Assumptions!$B$11))))', output.proFormaShares);
  checksSheet.getCell('B4').numFmt = '#,##0.00';
  setFormulaCell(checksSheet.getCell('C4'), '=IF(B4>0,"PASS","FAIL")', output.proFormaShares > 0 ? 'PASS' : 'FAIL');
  checksSheet.getCell('A5').value = 'Accretion finite';
  setFormulaCell(checksSheet.getCell('B5'), '=Bridge!B12', output.accretionPct);
  setPercent(checksSheet.getCell('B5'));
  setFormulaCell(checksSheet.getCell('C5'), '=IF(ISNUMBER(B5),"PASS","FAIL")', Number.isFinite(output.accretionPct) ? 'PASS' : 'FAIL');
  for (let row = 4; row <= 5; row += 1) for (let col = 1; col <= 3; col += 1) setOutputCell(checksSheet.getCell(row, col));
  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const buybackEpsAccretionModel: ModelDef<BuybackEpsAccretionInput, BuybackEpsAccretionOutput> = {
  slug: 'buyback-eps-accretion',
  name: 'Buyback / EPS Accretion',
  category: 'Corporate Finance',
  description: 'Measure the EPS impact of a share repurchase under varying pricing and financing assumptions.',
  inputSchema: BuybackEpsAccretionInputSchema,
  uiSchema: buybackEpsAccretionUiSchema,
  compute: computeBuybackEpsAccretion,
  buildWorkbook: buildBuybackEpsAccretionWorkbook,
  filename: () => 'CapitalBase_Buyback_EPS_Accretion.xlsx',
};

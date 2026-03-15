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

export const PurchasePriceAllocationInputSchema = z.object({
  purchase_price: z.number().positive(),
  acquired_net_assets_book: z.number().nonnegative(),
  inventory_step_up: z.number().nonnegative().default(0),
  ppe_step_up: z.number().nonnegative().default(0),
  customer_relationships: z.number().nonnegative().default(0),
  developed_technology: z.number().nonnegative().default(0),
  trade_name: z.number().nonnegative().default(0),
  deferred_tax_rate: z.number().min(0).max(0.5).default(0.25),
  customer_life_years: z.number().int().min(1).max(30).default(10),
  technology_life_years: z.number().int().min(1).max(30).default(7),
  trade_name_life_years: z.number().int().min(1).max(30).default(15),
});

type PurchasePriceAllocationInput = z.infer<typeof PurchasePriceAllocationInputSchema>;

type PpaOutput = {
  identifiableIntangibles: number;
  grossStepUp: number;
  deferredTaxLiability: number;
  goodwill: number;
  annualAmortization: {
    customer: number;
    technology: number;
    tradeName: number;
    total: number;
  };
  amortizationSchedule: Array<{
    year: number;
    customer: number;
    technology: number;
    tradeName: number;
    total: number;
  }>;
  checkTie: number;
};

const purchasePriceAllocationUiSchema: UISchema = {
  sections: [
    {
      title: 'Deal Inputs',
      fields: [
        { key: 'purchase_price', label: 'Purchase Price', type: 'currency', required: true, defaultValue: 5000 },
        { key: 'acquired_net_assets_book', label: 'Acquired Net Assets (Book)', type: 'currency', required: true, defaultValue: 1800 },
        { key: 'inventory_step_up', label: 'Inventory Step-up', type: 'currency', required: true, defaultValue: 100 },
        { key: 'ppe_step_up', label: 'PP&E Step-up', type: 'currency', required: true, defaultValue: 250 },
        { key: 'customer_relationships', label: 'Customer Relationships', type: 'currency', required: true, defaultValue: 900 },
        { key: 'developed_technology', label: 'Developed Technology', type: 'currency', required: true, defaultValue: 600 },
        { key: 'trade_name', label: 'Trade Name', type: 'currency', required: true, defaultValue: 300 },
        { key: 'deferred_tax_rate', label: 'Deferred Tax Rate', type: 'percent', required: true, defaultValue: 0.25 },
      ],
    },
    {
      title: 'Amortization Lives',
      fields: [
        { key: 'customer_life_years', label: 'Customer Life (Years)', type: 'number', required: true, defaultValue: 10 },
        { key: 'technology_life_years', label: 'Technology Life (Years)', type: 'number', required: true, defaultValue: 7 },
        { key: 'trade_name_life_years', label: 'Trade Name Life (Years)', type: 'number', required: true, defaultValue: 15 },
      ],
    },
  ],
};

function computePurchasePriceAllocation(input: PurchasePriceAllocationInput): PpaOutput {
  const identifiableIntangibles = input.customer_relationships + input.developed_technology + input.trade_name;
  const grossStepUp = input.inventory_step_up + input.ppe_step_up + identifiableIntangibles;
  const deferredTaxLiability = grossStepUp * input.deferred_tax_rate;
  const goodwill = input.purchase_price - input.acquired_net_assets_book - grossStepUp + deferredTaxLiability;
  const annualAmortization = {
    customer: input.customer_relationships / input.customer_life_years,
    technology: input.developed_technology / input.technology_life_years,
    tradeName: input.trade_name / input.trade_name_life_years,
    total: 0,
  };
  annualAmortization.total = annualAmortization.customer + annualAmortization.technology + annualAmortization.tradeName;
  const longestLife = Math.max(input.customer_life_years, input.technology_life_years, input.trade_name_life_years);
  const amortizationSchedule = Array.from({ length: longestLife }, (_, idx) => {
    const year = idx + 1;
    const customer = year <= input.customer_life_years ? annualAmortization.customer : 0;
    const technology = year <= input.technology_life_years ? annualAmortization.technology : 0;
    const tradeName = year <= input.trade_name_life_years ? annualAmortization.tradeName : 0;
    return { year, customer, technology, tradeName, total: customer + technology + tradeName };
  });
  const checkTie = input.acquired_net_assets_book + grossStepUp - deferredTaxLiability + goodwill - input.purchase_price;

  return {
    identifiableIntangibles,
    grossStepUp,
    deferredTaxLiability,
    goodwill,
    annualAmortization,
    amortizationSchedule,
    checkTie,
  };
}

async function buildPurchasePriceAllocationWorkbook(
  input: PurchasePriceAllocationInput,
  output: PpaOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 38;
  assumptionsSheet.getColumn(2).width = 18;
  assumptionsSheet.getCell('A1').value = 'Purchase Price Allocation Assumptions';
  assumptionsSheet.getCell('A1').font = { bold: true, size: 14 };
  assumptionsSheet.getCell('A3').value = 'Input';
  assumptionsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(assumptionsSheet, 3, 1, 2);
  const assumptionRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Purchase Price', input.purchase_price, 'currency'],
    ['Acquired Net Assets (Book)', input.acquired_net_assets_book, 'currency'],
    ['Inventory Step-up', input.inventory_step_up, 'currency'],
    ['PP&E Step-up', input.ppe_step_up, 'currency'],
    ['Customer Relationships', input.customer_relationships, 'currency'],
    ['Developed Technology', input.developed_technology, 'currency'],
    ['Trade Name', input.trade_name, 'currency'],
    ['Deferred Tax Rate', input.deferred_tax_rate, 'percent'],
    ['Customer Life', input.customer_life_years, 'number'],
    ['Technology Life', input.technology_life_years, 'number'],
    ['Trade Name Life', input.trade_name_life_years, 'number'],
  ];
  assumptionRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    assumptionsSheet.getCell(row, 1).value = label;
    assumptionsSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(assumptionsSheet.getCell(row, 2));
    if (fmt === 'percent') assumptionsSheet.getCell(row, 2).numFmt = '0.00%';
    if (fmt === 'number') assumptionsSheet.getCell(row, 2).numFmt = '#,##0';
    setInputCell(assumptionsSheet.getCell(row, 2));
    setOutputCell(assumptionsSheet.getCell(row, 1));
  });
  styleGrid(assumptionsSheet, 3, 14, 1, 2);

  const ppaSheet = workbook.addWorksheet('PPA Summary');
  ppaSheet.views = [{ state: 'frozen', ySplit: 3 }];
  ppaSheet.getColumn(1).width = 36;
  ppaSheet.getColumn(2).width = 18;
  ppaSheet.getCell('A1').value = 'Purchase Price Allocation';
  ppaSheet.getCell('A1').font = { bold: true, size: 14 };
  ppaSheet.getCell('A3').value = 'Component';
  ppaSheet.getCell('B3').value = 'Value';
  styleHeaderRow(ppaSheet, 3, 1, 2);
  const ppaRows: Array<[string, number]> = [
    ['Acquired Net Assets (Book)', input.acquired_net_assets_book],
    ['Inventory Step-up', input.inventory_step_up],
    ['PP&E Step-up', input.ppe_step_up],
    ['Identifiable Intangibles', output.identifiableIntangibles],
    ['Gross Step-up', output.grossStepUp],
    ['Deferred Tax Liability', -output.deferredTaxLiability],
    ['Goodwill', output.goodwill],
    ['Purchase Price', input.purchase_price],
  ];
  ppaRows.forEach(([label, value], idx) => {
    const row = 4 + idx;
    ppaSheet.getCell(row, 1).value = label;
    ppaSheet.getCell(row, 2).value = value;
    setCurrency(ppaSheet.getCell(row, 2));
    setOutputCell(ppaSheet.getCell(row, 1));
    setOutputCell(ppaSheet.getCell(row, 2));
  });
  styleGrid(ppaSheet, 3, 11, 1, 2);

  const amortSheet = workbook.addWorksheet('Amortization');
  amortSheet.views = [{ state: 'frozen', ySplit: 3 }];
  amortSheet.columns = [
    { width: 10 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];
  amortSheet.getCell('A1').value = 'Intangible Amortization Schedule';
  amortSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Year', 'Customer', 'Technology', 'Trade Name', 'Total'].forEach((header, idx) => {
    amortSheet.getCell(3, idx + 1).value = header;
  });
  styleHeaderRow(amortSheet, 3, 1, 5);
  output.amortizationSchedule.forEach((row, idx) => {
    const excelRow = 4 + idx;
    amortSheet.getCell(excelRow, 1).value = row.year;
    amortSheet.getCell(excelRow, 2).value = row.customer;
    amortSheet.getCell(excelRow, 3).value = row.technology;
    amortSheet.getCell(excelRow, 4).value = row.tradeName;
    amortSheet.getCell(excelRow, 5).value = row.total;
    for (let c = 2; c <= 5; c += 1) {
      setCurrency(amortSheet.getCell(excelRow, c));
      setOutputCell(amortSheet.getCell(excelRow, c));
    }
    setOutputCell(amortSheet.getCell(excelRow, 1));
  });
  styleGrid(amortSheet, 3, 3 + output.amortizationSchedule.length, 1, 5);

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
  checksSheet.getCell('A4').value = 'Purchase price tie';
  checksSheet.getCell('B4').value = output.checkTie;
  checksSheet.getCell('C4').value = Math.abs(output.checkTie) < 0.01 ? 'PASS' : 'FAIL';
  setCurrency(checksSheet.getCell('B4'));
  checksSheet.getCell('A5').value = 'Goodwill non-negative';
  checksSheet.getCell('B5').value = output.goodwill;
  checksSheet.getCell('C5').value = output.goodwill >= 0 ? 'PASS' : 'FAIL';
  setCurrency(checksSheet.getCell('B5'));
  for (let row = 4; row <= 5; row += 1) for (let col = 1; col <= 3; col += 1) setOutputCell(checksSheet.getCell(row, col));
  styleGrid(checksSheet, 3, 5, 1, 3);

  const equationsSheet = workbook.addWorksheet('Equations');
  equationsSheet.getColumn(1).width = 28;
  equationsSheet.getColumn(2).width = 90;
  equationsSheet.getCell('A1').value = 'Equations';
  equationsSheet.getCell('A1').font = { bold: true, size: 14 };
  equationsSheet.getCell('A3').value = 'Item';
  equationsSheet.getCell('B3').value = 'Equation';
  styleHeaderRow(equationsSheet, 3, 1, 2);
  const equations: Array<[string, string]> = [
    ['Identifiable intangibles', 'Customer + Technology + Trade Name'],
    ['Deferred tax liability', 'Gross Step-up * Deferred Tax Rate'],
    ['Goodwill', 'Purchase Price - Book Net Assets - Gross Step-up + DTL'],
    ['Annual amortization', 'Intangible Balance / Useful Life'],
  ];
  equations.forEach(([item, eq], idx) => {
    const row = 4 + idx;
    equationsSheet.getCell(row, 1).value = item;
    equationsSheet.getCell(row, 2).value = eq;
    setOutputCell(equationsSheet.getCell(row, 1));
    setOutputCell(equationsSheet.getCell(row, 2));
  });
  styleGrid(equationsSheet, 3, 7, 1, 2);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const purchasePriceAllocationModel: ModelDef<PurchasePriceAllocationInput, PpaOutput> = {
  slug: 'purchase-price-allocation',
  name: 'Purchase Price Allocation',
  category: 'Accounting',
  description: 'Allocate purchase price across net assets, identifiable intangibles, deferred tax liabilities, and goodwill.',
  inputSchema: PurchasePriceAllocationInputSchema,
  uiSchema: purchasePriceAllocationUiSchema,
  compute: computePurchasePriceAllocation,
  buildWorkbook: buildPurchasePriceAllocationWorkbook,
  filename: () => 'CapitalBase_Purchase_Price_Allocation.xlsx',
};

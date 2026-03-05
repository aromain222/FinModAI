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

const PurchaseSchema = z.object({
  period: z.number().int().min(1).max(120),
  units: z.number().nonnegative(),
  unit_cost: z.number().nonnegative(),
});

const SalesSchema = z.object({
  period: z.number().int().min(1).max(120),
  units: z.number().nonnegative(),
});

export const InventoryCogsInputSchema = z.object({
  beginning_units: z.number().nonnegative(),
  beginning_unit_cost: z.number().nonnegative(),
  purchases: z.array(PurchaseSchema).default([]),
  sales: z.array(SalesSchema).default([]),
  method: z.enum(['FIFO', 'LIFO', 'WAVG']),
});

type InventoryCogsInput = z.infer<typeof InventoryCogsInputSchema>;

type Layer = {
  originPeriod: number;
  units: number;
  unitCost: number;
};

type PeriodResult = {
  period: number;
  purchasedUnits: number;
  soldUnits: number;
  cogs: number;
  endingUnits: number;
  endingValue: number;
};

type InventoryCogsOutput = {
  periodResults: PeriodResult[];
  endingLayers: Layer[];
  totals: {
    cogs: number;
    endingUnits: number;
    endingValue: number;
  };
  checks: {
    overSoldPeriods: number;
  };
};

const inventoryCogsUiSchema: UISchema = {
  sections: [
    {
      title: 'Beginning Inventory',
      fields: [
        { key: 'beginning_units', label: 'Beginning Units', type: 'number', required: true, defaultValue: 1000 },
        { key: 'beginning_unit_cost', label: 'Beginning Unit Cost', type: 'currency', required: true, defaultValue: 10 },
        {
          key: 'method',
          label: 'Method',
          type: 'select',
          required: true,
          options: [
            { label: 'FIFO', value: 'FIFO' },
            { label: 'LIFO', value: 'LIFO' },
            { label: 'Weighted Avg', value: 'WAVG' },
          ],
          defaultValue: 'FIFO',
        },
      ],
    },
    {
      title: 'Purchases',
      fields: [
        {
          key: 'purchases',
          label: 'Purchases',
          type: 'repeatableRows',
          minRows: 0,
          rowsSpec: [
            { key: 'period', label: 'Period', type: 'number', required: true, defaultValue: 1 },
            { key: 'units', label: 'Units', type: 'number', required: true, defaultValue: 200 },
            { key: 'unit_cost', label: 'Unit Cost', type: 'currency', required: true, defaultValue: 11 },
          ],
          defaultRows: [
            { period: 1, units: 200, unit_cost: 11 },
            { period: 2, units: 250, unit_cost: 12 },
          ],
        },
      ],
    },
    {
      title: 'Sales',
      fields: [
        {
          key: 'sales',
          label: 'Sales Units',
          type: 'repeatableRows',
          minRows: 0,
          rowsSpec: [
            { key: 'period', label: 'Period', type: 'number', required: true, defaultValue: 1 },
            { key: 'units', label: 'Units Sold', type: 'number', required: true, defaultValue: 180 },
          ],
          defaultRows: [
            { period: 1, units: 180 },
            { period: 2, units: 220 },
          ],
        },
      ],
    },
  ],
};

function computeInventoryCogs(input: InventoryCogsInput): InventoryCogsOutput {
  const maxPeriod = Math.max(
    1,
    ...input.purchases.map((p) => p.period),
    ...input.sales.map((s) => s.period),
  );

  const purchasesByPeriod = new Map<number, Array<{ units: number; unitCost: number }>>();
  const salesByPeriod = new Map<number, number>();

  input.purchases.forEach((p) => {
    const list = purchasesByPeriod.get(p.period) ?? [];
    list.push({ units: p.units, unitCost: p.unit_cost });
    purchasesByPeriod.set(p.period, list);
  });
  input.sales.forEach((s) => {
    salesByPeriod.set(s.period, (salesByPeriod.get(s.period) ?? 0) + s.units);
  });

  const layers: Layer[] = [{ originPeriod: 0, units: input.beginning_units, unitCost: input.beginning_unit_cost }];
  const periodResults: PeriodResult[] = [];
  let overSoldPeriods = 0;

  for (let period = 1; period <= maxPeriod; period += 1) {
    const purchases = purchasesByPeriod.get(period) ?? [];
    const soldUnits = salesByPeriod.get(period) ?? 0;
    let purchasedUnits = 0;
    purchases.forEach((p) => {
      purchasedUnits += p.units;
      layers.push({ originPeriod: period, units: p.units, unitCost: p.unitCost });
    });

    let remainingToSell = soldUnits;
    let cogs = 0;

    if (input.method === 'WAVG') {
      const totalUnits = layers.reduce((sum, layer) => sum + layer.units, 0);
      const totalCost = layers.reduce((sum, layer) => sum + layer.units * layer.unitCost, 0);
      const avgCost = totalUnits > 0 ? totalCost / totalUnits : 0;
      const actualSold = Math.min(remainingToSell, totalUnits);
      cogs = actualSold * avgCost;
      const endingUnits = totalUnits - actualSold;
      layers.length = 0;
      layers.push({ originPeriod: period, units: endingUnits, unitCost: avgCost });
      if (actualSold < soldUnits) overSoldPeriods += 1;
      remainingToSell = 0;
    } else {
      while (remainingToSell > 0) {
        const candidateIndexes = layers
          .map((layer, idx) => ({ layer, idx }))
          .filter((x) => x.layer.units > 0);

        if (candidateIndexes.length === 0) {
          overSoldPeriods += 1;
          break;
        }

        const next =
          input.method === 'FIFO'
            ? candidateIndexes.reduce((best, cur) => (cur.idx < best.idx ? cur : best), candidateIndexes[0])
            : candidateIndexes.reduce((best, cur) => (cur.idx > best.idx ? cur : best), candidateIndexes[0]);

        const useUnits = Math.min(remainingToSell, next.layer.units);
        cogs += useUnits * next.layer.unitCost;
        next.layer.units -= useUnits;
        remainingToSell -= useUnits;
      }
    }

    const endingUnits = layers.reduce((sum, layer) => sum + layer.units, 0);
    const endingValue = layers.reduce((sum, layer) => sum + layer.units * layer.unitCost, 0);
    periodResults.push({ period, purchasedUnits, soldUnits, cogs, endingUnits, endingValue });
  }

  return {
    periodResults,
    endingLayers: layers.filter((layer) => layer.units > 0),
    totals: {
      cogs: periodResults.reduce((sum, row) => sum + row.cogs, 0),
      endingUnits: periodResults[periodResults.length - 1]?.endingUnits ?? 0,
      endingValue: periodResults[periodResults.length - 1]?.endingValue ?? 0,
    },
    checks: {
      overSoldPeriods,
    },
  };
}

async function buildInventoryCogsWorkbook(input: InventoryCogsInput, output: InventoryCogsOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const purchasesSheet = workbook.addWorksheet('Purchases');
  purchasesSheet.views = [{ state: 'frozen', ySplit: 3 }];
  purchasesSheet.columns = [{ width: 10 }, { width: 16 }, { width: 16 }];
  purchasesSheet.getCell('A1').value = `Purchases (${input.method})`;
  purchasesSheet.getCell('A1').font = { bold: true, size: 14 };
  purchasesSheet.getCell('A3').value = 'Period';
  purchasesSheet.getCell('B3').value = 'Units';
  purchasesSheet.getCell('C3').value = 'Unit Cost';
  styleHeaderRow(purchasesSheet, 3, 1, 3);

  const beginningRow = 4;
  purchasesSheet.getCell(beginningRow, 1).value = 0;
  purchasesSheet.getCell(beginningRow, 2).value = input.beginning_units;
  purchasesSheet.getCell(beginningRow, 3).value = input.beginning_unit_cost;
  setInputCell(purchasesSheet.getCell(beginningRow, 1));
  setInputCell(purchasesSheet.getCell(beginningRow, 2));
  setInputCell(purchasesSheet.getCell(beginningRow, 3));
  setCurrency(purchasesSheet.getCell(beginningRow, 3));

  input.purchases.forEach((row, idx) => {
    const excelRow = 5 + idx;
    purchasesSheet.getCell(excelRow, 1).value = row.period;
    purchasesSheet.getCell(excelRow, 2).value = row.units;
    purchasesSheet.getCell(excelRow, 3).value = row.unit_cost;
    setInputCell(purchasesSheet.getCell(excelRow, 1));
    setInputCell(purchasesSheet.getCell(excelRow, 2));
    setInputCell(purchasesSheet.getCell(excelRow, 3));
    setCurrency(purchasesSheet.getCell(excelRow, 3));
  });
  styleGrid(purchasesSheet, 3, 4 + input.purchases.length + 1, 1, 3);

  const layersSheet = workbook.addWorksheet('Inventory Layers');
  layersSheet.views = [{ state: 'frozen', ySplit: 3 }];
  layersSheet.columns = [{ width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }];
  layersSheet.getCell('A1').value = 'Ending Inventory Layers';
  layersSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Origin Period', 'Units', 'Unit Cost', 'Layer Value'].forEach((header, idx) => {
    layersSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(layersSheet, 3, 1, 4);
  output.endingLayers.forEach((layer, idx) => {
    const row = 4 + idx;
    layersSheet.getCell(row, 1).value = layer.originPeriod;
    layersSheet.getCell(row, 2).value = layer.units;
    layersSheet.getCell(row, 3).value = layer.unitCost;
    layersSheet.getCell(row, 4).value = layer.units * layer.unitCost;
    setCurrency(layersSheet.getCell(row, 3));
    setCurrency(layersSheet.getCell(row, 4));
    setOutputCell(layersSheet.getCell(row, 1));
    setOutputCell(layersSheet.getCell(row, 2));
    setOutputCell(layersSheet.getCell(row, 3));
    setOutputCell(layersSheet.getCell(row, 4));
  });
  const layerTotalRow = 4 + output.endingLayers.length;
  layersSheet.getCell(layerTotalRow, 1).value = 'Total';
  layersSheet.getCell(layerTotalRow, 2).value = output.totals.endingUnits;
  layersSheet.getCell(layerTotalRow, 4).value = output.totals.endingValue;
  layersSheet.getCell(layerTotalRow, 1).font = { bold: true };
  layersSheet.getCell(layerTotalRow, 2).font = { bold: true };
  layersSheet.getCell(layerTotalRow, 4).font = { bold: true };
  setCurrency(layersSheet.getCell(layerTotalRow, 4));
  setOutputCell(layersSheet.getCell(layerTotalRow, 1));
  setOutputCell(layersSheet.getCell(layerTotalRow, 2));
  setOutputCell(layersSheet.getCell(layerTotalRow, 4));
  styleGrid(layersSheet, 3, layerTotalRow, 1, 4);

  const cogsSheet = workbook.addWorksheet('COGS');
  cogsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  cogsSheet.columns = [{ width: 10 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }];
  cogsSheet.getCell('A1').value = 'COGS by Period';
  cogsSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Period', 'Purch Units', 'Sold Units', 'COGS', 'Ending Units', 'Ending Value'].forEach((header, idx) => {
    cogsSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(cogsSheet, 3, 1, 6);
  output.periodResults.forEach((row, idx) => {
    const excelRow = 4 + idx;
    cogsSheet.getCell(excelRow, 1).value = row.period;
    cogsSheet.getCell(excelRow, 2).value = row.purchasedUnits;
    cogsSheet.getCell(excelRow, 3).value = row.soldUnits;
    cogsSheet.getCell(excelRow, 4).value = row.cogs;
    cogsSheet.getCell(excelRow, 5).value = row.endingUnits;
    cogsSheet.getCell(excelRow, 6).value = row.endingValue;
    setCurrency(cogsSheet.getCell(excelRow, 4));
    setCurrency(cogsSheet.getCell(excelRow, 6));
    for (let c = 1; c <= 6; c += 1) {
      setOutputCell(cogsSheet.getCell(excelRow, c));
    }
  });
  const cogsTotalRow = 4 + output.periodResults.length;
  cogsSheet.getCell(cogsTotalRow, 1).value = 'Total';
  cogsSheet.getCell(cogsTotalRow, 4).value = output.totals.cogs;
  cogsSheet.getCell(cogsTotalRow, 5).value = output.totals.endingUnits;
  cogsSheet.getCell(cogsTotalRow, 6).value = output.totals.endingValue;
  cogsSheet.getCell(cogsTotalRow, 1).font = { bold: true };
  cogsSheet.getCell(cogsTotalRow, 4).font = { bold: true };
  cogsSheet.getCell(cogsTotalRow, 5).font = { bold: true };
  cogsSheet.getCell(cogsTotalRow, 6).font = { bold: true };
  setCurrency(cogsSheet.getCell(cogsTotalRow, 4));
  setCurrency(cogsSheet.getCell(cogsTotalRow, 6));
  for (let c = 1; c <= 6; c += 1) {
    setOutputCell(cogsSheet.getCell(cogsTotalRow, c));
  }
  styleGrid(cogsSheet, 3, cogsTotalRow, 1, 6);

  const endingSheet = workbook.addWorksheet('Ending Inventory');
  endingSheet.views = [{ state: 'frozen', ySplit: 3 }];
  endingSheet.getColumn(1).width = 30;
  endingSheet.getColumn(2).width = 18;
  endingSheet.getCell('A1').value = 'Ending Inventory Summary';
  endingSheet.getCell('A1').font = { bold: true, size: 14 };
  endingSheet.getCell('A3').value = 'Metric';
  endingSheet.getCell('B3').value = 'Value';
  styleHeaderRow(endingSheet, 3, 1, 2);
  const endingRows: Array<[string, number, 'currency' | 'number']> = [
    ['Method', input.method === 'FIFO' ? 1 : input.method === 'LIFO' ? 2 : 3, 'number'],
    ['Ending Units', output.totals.endingUnits, 'number'],
    ['Ending Value', output.totals.endingValue, 'currency'],
  ];
  endingRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    endingSheet.getCell(row, 1).value = label;
    endingSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(endingSheet.getCell(row, 2));
    setOutputCell(endingSheet.getCell(row, 1));
    setOutputCell(endingSheet.getCell(row, 2));
  });
  styleGrid(endingSheet, 3, 6, 1, 2);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 38;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  checksSheet.getCell('A1').value = 'Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'Oversold periods';
  checksSheet.getCell('B4').value = output.checks.overSoldPeriods;
  checksSheet.getCell('C4').value = output.checks.overSoldPeriods === 0 ? 'PASS' : 'WARN';
  checksSheet.getCell('A5').value = 'Ending inventory non-negative';
  checksSheet.getCell('B5').value = output.totals.endingValue;
  checksSheet.getCell('C5').value = output.totals.endingValue >= -0.01 ? 'PASS' : 'FAIL';
  checksSheet.getCell('B4').numFmt = '0';
  setCurrency(checksSheet.getCell('B5'));
  for (let row = 4; row <= 5; row += 1) {
    setOutputCell(checksSheet.getCell(row, 1));
    setOutputCell(checksSheet.getCell(row, 2));
    setOutputCell(checksSheet.getCell(row, 3));
  }
  styleGrid(checksSheet, 3, 5, 1, 3);

  workbook.definedNames.add(`'COGS'!$D$${cogsTotalRow}`, 'Total_COGS');
  workbook.definedNames.add(`'Ending Inventory'!$B$6`, 'Ending_Inventory_Value');

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const inventoryCogsModel: ModelDef<InventoryCogsInput, InventoryCogsOutput> = {
  slug: 'inventory-cogs',
  name: 'Inventory + COGS (FIFO / LIFO / WAVG)',
  category: 'Accounting',
  description: 'Compute COGS and ending inventory under FIFO, LIFO, or weighted-average costing.',
  inputSchema: InventoryCogsInputSchema,
  uiSchema: inventoryCogsUiSchema,
  compute: computeInventoryCogs,
  buildWorkbook: buildInventoryCogsWorkbook,
  filename: () => 'CapitalBase_Inventory_COGS.xlsx',
};

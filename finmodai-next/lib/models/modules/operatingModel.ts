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
import { toYearColumns } from '@/lib/models/modules/modelUtils';

export const OperatingModelInputSchema = z.object({
  start_year: z.number().int().min(2000).max(2100),
  forecast_years: z.number().int().min(3).max(15),
  units_sold: z.number().nonnegative(),
  price_per_unit: z.number().nonnegative(),
  growth_rate: z.number().min(-0.9).max(2),
  churn_rate: z.number().min(0).max(1).default(0),
  cogs_pct: z.number().min(0).max(1),
  opex_pct: z.number().min(0).max(1),
});

type OperatingModelInput = z.infer<typeof OperatingModelInputSchema>;

type OperatingRow = {
  year: number;
  units: number;
  price: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  opex: number;
  ebit: number;
  ebitMargin: number;
};

type OperatingModelOutput = {
  years: number[];
  rows: OperatingRow[];
};

const operatingModelUiSchema: UISchema = {
  sections: [
    {
      title: 'Operating Inputs',
      fields: [
        { key: 'start_year', label: 'Start Year', type: 'number', required: true, defaultValue: 2026 },
        { key: 'forecast_years', label: 'Forecast Years', type: 'number', required: true, defaultValue: 5 },
        { key: 'units_sold', label: 'Units Sold (Year 1)', type: 'number', required: true, defaultValue: 100000 },
        { key: 'price_per_unit', label: 'Price Per Unit', type: 'currency', required: true, defaultValue: 15 },
        { key: 'growth_rate', label: 'Growth Rate', type: 'percent', required: true, defaultValue: 0.12 },
        { key: 'churn_rate', label: 'Churn Rate', type: 'percent', required: true, defaultValue: 0.03 },
        { key: 'cogs_pct', label: 'COGS %', type: 'percent', required: true, defaultValue: 0.4 },
        { key: 'opex_pct', label: 'OpEx %', type: 'percent', required: true, defaultValue: 0.25 },
      ],
    },
  ],
};

function computeOperatingModel(input: OperatingModelInput): OperatingModelOutput {
  const years = toYearColumns(input.start_year, input.forecast_years);
  const rows: OperatingRow[] = [];

  let units = input.units_sold;

  for (let idx = 0; idx < input.forecast_years; idx += 1) {
    if (idx > 0) {
      units = units * (1 + input.growth_rate) * (1 - input.churn_rate);
    }

    const price = input.price_per_unit;
    const revenue = units * price;
    const cogs = revenue * input.cogs_pct;
    const grossProfit = revenue - cogs;
    const grossMargin = revenue === 0 ? 0 : grossProfit / revenue;
    const opex = revenue * input.opex_pct;
    const ebit = grossProfit - opex;
    const ebitMargin = revenue === 0 ? 0 : ebit / revenue;

    rows.push({
      year: years[idx],
      units,
      price,
      revenue,
      cogs,
      grossProfit,
      grossMargin,
      opex,
      ebit,
      ebitMargin,
    });
  }

  return { years, rows };
}

async function buildOperatingModelWorkbook(input: OperatingModelInput, output: OperatingModelOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const inputsSheet = workbook.addWorksheet('Inputs');
  inputsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  inputsSheet.getColumn(1).width = 30;
  inputsSheet.getColumn(2).width = 18;
  inputsSheet.getCell('A1').value = 'Operating Model Inputs';
  inputsSheet.getCell('A1').font = { bold: true, size: 14 };
  inputsSheet.getCell('A3').value = 'Input';
  inputsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(inputsSheet, 3, 1, 2);

  const fields: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Start Year', input.start_year, 'number'],
    ['Forecast Years', input.forecast_years, 'number'],
    ['Units Sold', input.units_sold, 'number'],
    ['Price Per Unit', input.price_per_unit, 'currency'],
    ['Growth Rate', input.growth_rate, 'percent'],
    ['Churn Rate', input.churn_rate, 'percent'],
    ['COGS %', input.cogs_pct, 'percent'],
    ['OpEx %', input.opex_pct, 'percent'],
  ];

  fields.forEach(([label, value, kind], idx) => {
    const row = 4 + idx;
    inputsSheet.getCell(row, 1).value = label;
    const cell = inputsSheet.getCell(row, 2);
    cell.value = value;
    setInputCell(cell);
    if (kind === 'currency') setCurrency(cell);
    if (kind === 'percent') setPercent(cell);
  });
  styleGrid(inputsSheet, 3, 3 + fields.length, 1, 2);

  const revenueSheet = workbook.addWorksheet('Revenue Build');
  revenueSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  revenueSheet.getColumn(1).width = 24;
  output.years.forEach((_, idx) => (revenueSheet.getColumn(2 + idx).width = 14));
  revenueSheet.getCell('A1').value = 'Revenue Build';
  revenueSheet.getCell('A1').font = { bold: true, size: 14 };
  revenueSheet.getCell('A3').value = 'Metric';
  output.years.forEach((year, idx) => (revenueSheet.getCell(3, 2 + idx).value = year));
  styleHeaderRow(revenueSheet, 3, 1, 1 + output.years.length);
  revenueSheet.getCell('A4').value = 'Units Sold';
  revenueSheet.getCell('A5').value = 'Price Per Unit';
  revenueSheet.getCell('A6').value = 'Revenue';

  output.rows.forEach((row, idx) => {
    const col = 2 + idx;
    revenueSheet.getCell(4, col).value = row.units;
    revenueSheet.getCell(5, col).value = row.price;
    revenueSheet.getCell(6, col).value = row.revenue;
    setCurrency(revenueSheet.getCell(5, col));
    setCurrency(revenueSheet.getCell(6, col));
    setOutputCell(revenueSheet.getCell(4, col));
    setOutputCell(revenueSheet.getCell(5, col));
    setOutputCell(revenueSheet.getCell(6, col));
  });
  styleGrid(revenueSheet, 3, 6, 1, 1 + output.years.length);

  const marginSheet = workbook.addWorksheet('Margin Build');
  marginSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  marginSheet.getColumn(1).width = 24;
  output.years.forEach((_, idx) => (marginSheet.getColumn(2 + idx).width = 14));
  marginSheet.getCell('A1').value = 'Margin Build';
  marginSheet.getCell('A1').font = { bold: true, size: 14 };
  marginSheet.getCell('A3').value = 'Metric';
  output.years.forEach((year, idx) => (marginSheet.getCell(3, 2 + idx).value = year));
  styleHeaderRow(marginSheet, 3, 1, 1 + output.years.length);

  marginSheet.getCell('A4').value = 'Revenue';
  marginSheet.getCell('A5').value = 'COGS';
  marginSheet.getCell('A6').value = 'Gross Profit';
  marginSheet.getCell('A7').value = 'Gross Margin';

  output.rows.forEach((row, idx) => {
    const col = 2 + idx;
    marginSheet.getCell(4, col).value = row.revenue;
    marginSheet.getCell(5, col).value = row.cogs;
    marginSheet.getCell(6, col).value = row.grossProfit;
    marginSheet.getCell(7, col).value = row.grossMargin;

    setCurrency(marginSheet.getCell(4, col));
    setCurrency(marginSheet.getCell(5, col));
    setCurrency(marginSheet.getCell(6, col));
    setPercent(marginSheet.getCell(7, col));

    setOutputCell(marginSheet.getCell(4, col));
    setOutputCell(marginSheet.getCell(5, col));
    setOutputCell(marginSheet.getCell(6, col));
    setOutputCell(marginSheet.getCell(7, col));
  });
  styleGrid(marginSheet, 3, 7, 1, 1 + output.years.length);

  const profitSheet = workbook.addWorksheet('Operating Profit');
  profitSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  profitSheet.getColumn(1).width = 24;
  output.years.forEach((_, idx) => (profitSheet.getColumn(2 + idx).width = 14));
  profitSheet.getCell('A1').value = 'Operating Profit';
  profitSheet.getCell('A1').font = { bold: true, size: 14 };
  profitSheet.getCell('A3').value = 'Metric';
  output.years.forEach((year, idx) => (profitSheet.getCell(3, 2 + idx).value = year));
  styleHeaderRow(profitSheet, 3, 1, 1 + output.years.length);

  profitSheet.getCell('A4').value = 'Gross Profit';
  profitSheet.getCell('A5').value = 'OpEx';
  profitSheet.getCell('A6').value = 'EBIT';
  profitSheet.getCell('A7').value = 'EBIT Margin';

  output.rows.forEach((row, idx) => {
    const col = 2 + idx;
    profitSheet.getCell(4, col).value = row.grossProfit;
    profitSheet.getCell(5, col).value = row.opex;
    profitSheet.getCell(6, col).value = row.ebit;
    profitSheet.getCell(7, col).value = row.ebitMargin;

    setCurrency(profitSheet.getCell(4, col));
    setCurrency(profitSheet.getCell(5, col));
    setCurrency(profitSheet.getCell(6, col));
    setPercent(profitSheet.getCell(7, col));

    setOutputCell(profitSheet.getCell(4, col));
    setOutputCell(profitSheet.getCell(5, col));
    setOutputCell(profitSheet.getCell(6, col));
    setOutputCell(profitSheet.getCell(7, col));
  });

  styleGrid(profitSheet, 3, 7, 1, 1 + output.years.length);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));

  return workbook;
}

export const operatingModel: ModelDef<OperatingModelInput, OperatingModelOutput> = {
  slug: 'operating-model',
  name: 'Operating Model (Revenue Driver Based)',
  category: 'Corporate Finance',
  description: 'Revenue-driver model that converts units and pricing assumptions into operating profit.',
  inputSchema: OperatingModelInputSchema,
  uiSchema: operatingModelUiSchema,
  compute: computeOperatingModel,
  buildWorkbook: buildOperatingModelWorkbook,
  filename: () => 'CapitalBase_Operating_Model.xlsx',
};

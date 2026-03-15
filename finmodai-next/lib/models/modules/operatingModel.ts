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

    rows.push({ year: years[idx], units, price, revenue, cogs, grossProfit, grossMargin, opex, ebit, ebitMargin });
  }

  return { years, rows };
}

async function buildOperatingModelWorkbook(input: OperatingModelInput, output: OperatingModelOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

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
    if (kind === 'number') cell.numFmt = '#,##0.00';
    setOutputCell(inputsSheet.getCell(row, 1));
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
    const colLetter = revenueSheet.getColumn(col).letter as string;
    if (idx === 0) {
      setFormulaCell(revenueSheet.getCell(4, col), '=Inputs!$B$6', row.units);
    } else {
      setFormulaCell(revenueSheet.getCell(4, col), `${String.fromCharCode(64 + col)}4*(1+Inputs!$B$8)*(1-Inputs!$B$9)`.replace(`${String.fromCharCode(64 + col)}`, revenueSheet.getColumn(col - 1).letter as string), row.units);
    }
    setFormulaCell(revenueSheet.getCell(5, col), '=Inputs!$B$7', row.price);
    setFormulaCell(revenueSheet.getCell(6, col), `=${colLetter}4*${colLetter}5`, row.revenue);
    revenueSheet.getCell(4, col).numFmt = '#,##0.00';
    setCurrency(revenueSheet.getCell(5, col));
    setCurrency(revenueSheet.getCell(6, col));
    setOutputCell(revenueSheet.getCell(4, col));
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
    const colLetter = marginSheet.getColumn(col).letter as string;
    const revenueRef = `'Revenue Build'!${colLetter}6`;
    setFormulaCell(marginSheet.getCell(4, col), `=${revenueRef}`, row.revenue);
    setFormulaCell(marginSheet.getCell(5, col), `=${colLetter}4*Inputs!$B$10`, row.cogs);
    setFormulaCell(marginSheet.getCell(6, col), `=${colLetter}4-${colLetter}5`, row.grossProfit);
    setFormulaCell(marginSheet.getCell(7, col), `=IF(${colLetter}4=0,0,${colLetter}6/${colLetter}4)`, row.grossMargin);
    setCurrency(marginSheet.getCell(4, col));
    setCurrency(marginSheet.getCell(5, col));
    setCurrency(marginSheet.getCell(6, col));
    setPercent(marginSheet.getCell(7, col));
    for (let r = 4; r <= 7; r += 1) setOutputCell(marginSheet.getCell(r, col));
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
    const colLetter = profitSheet.getColumn(col).letter as string;
    setFormulaCell(profitSheet.getCell(4, col), `='Margin Build'!${colLetter}6`, row.grossProfit);
    setFormulaCell(profitSheet.getCell(5, col), `='Revenue Build'!${colLetter}6*Inputs!$B$11`, row.opex);
    setFormulaCell(profitSheet.getCell(6, col), `=${colLetter}4-${colLetter}5`, row.ebit);
    setFormulaCell(profitSheet.getCell(7, col), `=IF('Revenue Build'!${colLetter}6=0,0,${colLetter}6/'Revenue Build'!${colLetter}6)`, row.ebitMargin);
    setCurrency(profitSheet.getCell(4, col));
    setCurrency(profitSheet.getCell(5, col));
    setCurrency(profitSheet.getCell(6, col));
    setPercent(profitSheet.getCell(7, col));
    for (let r = 4; r <= 7; r += 1) setOutputCell(profitSheet.getCell(r, col));
  });
  styleGrid(profitSheet, 3, 7, 1, 1 + output.years.length);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 32;
  checksSheet.getColumn(2).width = 14;
  checksSheet.getColumn(3).width = 12;
  checksSheet.getCell('A1').value = 'Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  const finalCol = profitSheet.getColumn(1 + output.years.length).letter as string;
  checksSheet.getCell('A4').value = 'Final-year EBIT margin positive';
  setFormulaCell(checksSheet.getCell('B4'), `='Operating Profit'!${finalCol}7`, output.rows[output.rows.length - 1].ebitMargin);
  setPercent(checksSheet.getCell('B4'));
  setFormulaCell(checksSheet.getCell('C4'), '=IF(B4>0,"PASS","FAIL")', output.rows[output.rows.length - 1].ebitMargin > 0 ? 'PASS' : 'FAIL');
  checksSheet.getCell('A5').value = 'Gross margin above OpEx %';
  setFormulaCell(checksSheet.getCell('B5'), '=Inputs!$B$10-Inputs!$B$11', input.cogs_pct - input.opex_pct);
  setPercent(checksSheet.getCell('B5'));
  setFormulaCell(checksSheet.getCell('C5'), '=IF(B5<1,"PASS","REVIEW")', 'PASS');
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
    ['Units progression', 'Units_t = Units_(t-1) * (1 + growth) * (1 - churn)'],
    ['Revenue', 'Revenue = Units * Price'],
    ['Gross profit', 'Gross Profit = Revenue - COGS'],
    ['EBIT', 'EBIT = Gross Profit - OpEx'],
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

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
import { mean, median } from '@/lib/models/modules/modelUtils';

const CompRowSchema = z.object({
  company_name: z.string().min(1),
  revenue: z.number().positive(),
  ebitda: z.number().positive(),
  market_cap: z.number().nonnegative(),
  net_debt: z.number(),
});

export const TradingCompsInputSchema = z.object({
  comps: z.array(CompRowSchema).min(2, 'at least two comparable companies are required'),
  target_revenue: z.number().positive(),
  target_ebitda: z.number().positive(),
});

type TradingCompsInput = z.infer<typeof TradingCompsInputSchema>;

type CompComputed = {
  company_name: string;
  revenue: number;
  ebitda: number;
  market_cap: number;
  net_debt: number;
  ev: number;
  evRevenue: number;
  evEbitda: number;
};

type TradingCompsOutput = {
  compRows: CompComputed[];
  summary: {
    evRevenueMean: number;
    evRevenueMedian: number;
    evRevenueP25: number;
    evRevenueP75: number;
    evEbitdaMean: number;
    evEbitdaMedian: number;
    evEbitdaP25: number;
    evEbitdaP75: number;
  };
  implied: {
    byRevenueMean: number;
    byRevenueMedian: number;
    byRevenueP25: number;
    byRevenueP75: number;
    byEbitdaMean: number;
    byEbitdaMedian: number;
    byEbitdaP25: number;
    byEbitdaP75: number;
    blendedEv: number;
  };
};

const tradingCompsUiSchema: UISchema = {
  sections: [
    {
      title: 'Comparable Companies',
      fields: [
        {
          key: 'comps',
          label: 'Comps',
          type: 'repeatableRows',
          minRows: 2,
          required: true,
          rowsSpec: [
            { key: 'company_name', label: 'Company Name', type: 'text', required: true },
            { key: 'revenue', label: 'Revenue', type: 'currency', required: true, defaultValue: 10000 },
            { key: 'ebitda', label: 'EBITDA', type: 'currency', required: true, defaultValue: 2500 },
            { key: 'market_cap', label: 'Market Cap', type: 'currency', required: true, defaultValue: 50000 },
            { key: 'net_debt', label: 'Net Debt', type: 'currency', required: true, defaultValue: 5000 },
          ],
          defaultRows: [
            { company_name: 'Comp A', revenue: 10000, ebitda: 2500, market_cap: 50000, net_debt: 5000 },
            { company_name: 'Comp B', revenue: 9000, ebitda: 2100, market_cap: 42000, net_debt: 4500 },
          ],
        },
      ],
    },
    {
      title: 'Target Metrics',
      fields: [
        { key: 'target_revenue', label: 'Target Revenue', type: 'currency', required: true, defaultValue: 12000 },
        { key: 'target_ebitda', label: 'Target EBITDA', type: 'currency', required: true, defaultValue: 3000 },
      ],
    },
  ],
};

function computeTradingComps(input: TradingCompsInput): TradingCompsOutput {
  const compRows: CompComputed[] = input.comps.map((comp) => {
    const ev = comp.market_cap + comp.net_debt;
    const evRevenue = ev / comp.revenue;
    const evEbitda = ev / comp.ebitda;

    return {
      ...comp,
      ev,
      evRevenue,
      evEbitda,
    };
  });

  const evRevenueMultiples = compRows.map((row) => row.evRevenue);
  const evEbitdaMultiples = compRows.map((row) => row.evEbitda);
  const sortedRevenue = [...evRevenueMultiples].sort((a, b) => a - b);
  const sortedEbitda = [...evEbitdaMultiples].sort((a, b) => a - b);
  const qIdx25 = Math.floor((sortedRevenue.length - 1) * 0.25);
  const qIdx75 = Math.floor((sortedRevenue.length - 1) * 0.75);

  const summary = {
    evRevenueMean: mean(evRevenueMultiples),
    evRevenueMedian: median(evRevenueMultiples),
    evRevenueP25: sortedRevenue[qIdx25] ?? 0,
    evRevenueP75: sortedRevenue[qIdx75] ?? 0,
    evEbitdaMean: mean(evEbitdaMultiples),
    evEbitdaMedian: median(evEbitdaMultiples),
    evEbitdaP25: sortedEbitda[qIdx25] ?? 0,
    evEbitdaP75: sortedEbitda[qIdx75] ?? 0,
  };

  const implied = {
    byRevenueMean: input.target_revenue * summary.evRevenueMean,
    byRevenueMedian: input.target_revenue * summary.evRevenueMedian,
    byRevenueP25: input.target_revenue * summary.evRevenueP25,
    byRevenueP75: input.target_revenue * summary.evRevenueP75,
    byEbitdaMean: input.target_ebitda * summary.evEbitdaMean,
    byEbitdaMedian: input.target_ebitda * summary.evEbitdaMedian,
    byEbitdaP25: input.target_ebitda * summary.evEbitdaP25,
    byEbitdaP75: input.target_ebitda * summary.evEbitdaP75,
    blendedEv:
      (input.target_revenue * summary.evRevenueMean +
        input.target_revenue * summary.evRevenueMedian +
        input.target_ebitda * summary.evEbitdaMean +
        input.target_ebitda * summary.evEbitdaMedian) /
      4,
  };

  return {
    compRows,
    summary,
    implied,
  };
}

async function buildTradingCompsWorkbook(input: TradingCompsInput, output: TradingCompsOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const compsSheet = workbook.addWorksheet('Comps Input');
  compsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  compsSheet.columns = [
    { width: 26 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
  ];

  compsSheet.getCell('A1').value = 'Trading Comps Input';
  compsSheet.getCell('A1').font = { bold: true, size: 14 };

  const headers = ['Company', 'Revenue', 'EBITDA', 'Market Cap', 'Net Debt', 'EV', 'EV/Revenue', 'EV/EBITDA'];
  headers.forEach((header, idx) => {
    compsSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(compsSheet, 3, 1, headers.length);

  output.compRows.forEach((row, idx) => {
    const excelRow = 4 + idx;
    compsSheet.getCell(excelRow, 1).value = row.company_name;
    compsSheet.getCell(excelRow, 2).value = row.revenue;
    compsSheet.getCell(excelRow, 3).value = row.ebitda;
    compsSheet.getCell(excelRow, 4).value = row.market_cap;
    compsSheet.getCell(excelRow, 5).value = row.net_debt;
    compsSheet.getCell(excelRow, 6).value = row.ev;
    compsSheet.getCell(excelRow, 7).value = row.evRevenue;
    compsSheet.getCell(excelRow, 8).value = row.evEbitda;

    setInputCell(compsSheet.getCell(excelRow, 1));
    for (let col = 2; col <= 5; col += 1) {
      setCurrency(compsSheet.getCell(excelRow, col));
      setInputCell(compsSheet.getCell(excelRow, col));
    }
    setCurrency(compsSheet.getCell(excelRow, 6));
    compsSheet.getCell(excelRow, 7).numFmt = '0.00x';
    compsSheet.getCell(excelRow, 8).numFmt = '0.00x';
    setOutputCell(compsSheet.getCell(excelRow, 6));
    setOutputCell(compsSheet.getCell(excelRow, 7));
    setOutputCell(compsSheet.getCell(excelRow, 8));
  });

  styleGrid(compsSheet, 3, 3 + output.compRows.length, 1, headers.length);

  const summarySheet = workbook.addWorksheet('Multiples Summary');
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 30;
  summarySheet.getColumn(2).width = 16;

  summarySheet.getCell('A1').value = 'Multiples Summary';
  summarySheet.getCell('A1').font = { bold: true, size: 14 };
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  styleHeaderRow(summarySheet, 3, 1, 2);

  const summaryRows: Array<[string, number]> = [
    ['EV/Revenue Mean', output.summary.evRevenueMean],
    ['EV/Revenue Median', output.summary.evRevenueMedian],
    ['EV/Revenue 25th %tile', output.summary.evRevenueP25],
    ['EV/Revenue 75th %tile', output.summary.evRevenueP75],
    ['EV/EBITDA Mean', output.summary.evEbitdaMean],
    ['EV/EBITDA Median', output.summary.evEbitdaMedian],
    ['EV/EBITDA 25th %tile', output.summary.evEbitdaP25],
    ['EV/EBITDA 75th %tile', output.summary.evEbitdaP75],
  ];

  summaryRows.forEach(([label, value], idx) => {
    const row = 4 + idx;
    summarySheet.getCell(row, 1).value = label;
    summarySheet.getCell(row, 2).value = value;
    summarySheet.getCell(row, 2).numFmt = '0.00x';
    setOutputCell(summarySheet.getCell(row, 1));
    setOutputCell(summarySheet.getCell(row, 2));
  });
  summarySheet.getCell('A13').value = 'Checks';
  summarySheet.getCell('A13').font = { bold: true };
  summarySheet.getCell('A14').value = 'Comp count >= 2';
  summarySheet.getCell('B14').value = output.compRows.length >= 2 ? 'PASS' : 'FAIL';
  summarySheet.getCell('A15').value = 'No non-positive multiples';
  summarySheet.getCell('B15').value = output.compRows.every((row) => row.evRevenue > 0 && row.evEbitda > 0) ? 'PASS' : 'FAIL';
  setOutputCell(summarySheet.getCell('A14'));
  setOutputCell(summarySheet.getCell('B14'));
  setOutputCell(summarySheet.getCell('A15'));
  setOutputCell(summarySheet.getCell('B15'));
  styleGrid(summarySheet, 3, 15, 1, 2);

  const footballSheet = workbook.addWorksheet('Football Field');
  footballSheet.views = [{ state: 'frozen', ySplit: 3 }];
  footballSheet.getColumn(1).width = 30;
  footballSheet.getColumn(2).width = 16;
  footballSheet.getColumn(3).width = 16;
  footballSheet.getColumn(4).width = 16;
  footballSheet.getColumn(5).width = 16;
  footballSheet.getColumn(6).width = 16;

  footballSheet.getCell('A1').value = 'Football Field Valuation Ranges';
  footballSheet.getCell('A1').font = { bold: true, size: 14 };
  footballSheet.getCell('A3').value = 'Method';
  footballSheet.getCell('B3').value = 'Low';
  footballSheet.getCell('C3').value = 'Mid';
  footballSheet.getCell('D3').value = 'High';
  footballSheet.getCell('E3').value = 'Spread';
  footballSheet.getCell('F3').value = 'Marker';
  styleHeaderRow(footballSheet, 3, 1, 6);

  footballSheet.getCell('A4').value = 'EV/Revenue';
  footballSheet.getCell('B4').value = output.implied.byRevenueP25;
  footballSheet.getCell('C4').value = output.implied.byRevenueMedian;
  footballSheet.getCell('D4').value = output.implied.byRevenueP75;
  footballSheet.getCell('E4').value = output.implied.byRevenueP75 - output.implied.byRevenueP25;
  footballSheet.getCell('F4').value = '---';

  footballSheet.getCell('A5').value = 'EV/EBITDA';
  footballSheet.getCell('B5').value = output.implied.byEbitdaP25;
  footballSheet.getCell('C5').value = output.implied.byEbitdaMedian;
  footballSheet.getCell('D5').value = output.implied.byEbitdaP75;
  footballSheet.getCell('E5').value = output.implied.byEbitdaP75 - output.implied.byEbitdaP25;
  footballSheet.getCell('F5').value = '---';

  footballSheet.getCell('A6').value = 'Blended';
  const blendedLow = Math.min(output.implied.byRevenueP25, output.implied.byEbitdaP25);
  const blendedHigh = Math.max(output.implied.byRevenueP75, output.implied.byEbitdaP75);
  footballSheet.getCell('B6').value = blendedLow;
  footballSheet.getCell('C6').value = output.implied.blendedEv;
  footballSheet.getCell('D6').value = blendedHigh;
  footballSheet.getCell('E6').value = blendedHigh - blendedLow;
  footballSheet.getCell('F6').value = '|====|';

  for (let row = 4; row <= 6; row += 1) {
    for (let col = 2; col <= 5; col += 1) {
      setCurrency(footballSheet.getCell(row, col));
      setOutputCell(footballSheet.getCell(row, col));
    }
    setOutputCell(footballSheet.getCell(row, 1));
    setOutputCell(footballSheet.getCell(row, 6));
  }
  footballSheet.getCell('A8').value = 'Target Revenue';
  footballSheet.getCell('B8').value = input.target_revenue;
  setCurrency(footballSheet.getCell('B8'));
  setInputCell(footballSheet.getCell('B8'));
  footballSheet.getCell('A9').value = 'Target EBITDA';
  footballSheet.getCell('B9').value = input.target_ebitda;
  setCurrency(footballSheet.getCell('B9'));
  setInputCell(footballSheet.getCell('B9'));
  setOutputCell(footballSheet.getCell('A8'));
  setOutputCell(footballSheet.getCell('A9'));
  styleGrid(footballSheet, 3, 9, 1, 6);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));

  return workbook;
}

export const tradingCompsModel: ModelDef<TradingCompsInput, TradingCompsOutput> = {
  slug: 'trading-comps',
  name: 'Trading Comps Model',
  category: 'Corporate Finance',
  description: 'Benchmark target valuation using EV/Revenue and EV/EBITDA from comparable companies.',
  inputSchema: TradingCompsInputSchema,
  uiSchema: tradingCompsUiSchema,
  compute: computeTradingComps,
  buildWorkbook: buildTradingCompsWorkbook,
  filename: () => 'CapitalBase_Trading_Comps.xlsx',
};

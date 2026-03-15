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
    return { ...comp, ev, evRevenue, evEbitda };
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
    blendedEv: (input.target_revenue * summary.evRevenueMean + input.target_revenue * summary.evRevenueMedian + input.target_ebitda * summary.evEbitdaMean + input.target_ebitda * summary.evEbitdaMedian) / 4,
  };

  return { compRows, summary, implied };
}

async function buildTradingCompsWorkbook(input: TradingCompsInput, output: TradingCompsOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const compsSheet = workbook.addWorksheet('Comps Input');
  compsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  compsSheet.columns = [{ width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }];
  compsSheet.getCell('A1').value = 'Trading Comps Input';
  compsSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Company', 'Revenue', 'EBITDA', 'Market Cap', 'Net Debt', 'EV', 'EV/Revenue', 'EV/EBITDA'].forEach((header, idx) => {
    compsSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(compsSheet, 3, 1, 8);
  input.comps.forEach((row, idx) => {
    const excelRow = 4 + idx;
    compsSheet.getCell(excelRow, 1).value = row.company_name;
    compsSheet.getCell(excelRow, 2).value = row.revenue;
    compsSheet.getCell(excelRow, 3).value = row.ebitda;
    compsSheet.getCell(excelRow, 4).value = row.market_cap;
    compsSheet.getCell(excelRow, 5).value = row.net_debt;
    setFormulaCell(compsSheet.getCell(excelRow, 6), `=D${excelRow}+E${excelRow}`, output.compRows[idx].ev);
    setFormulaCell(compsSheet.getCell(excelRow, 7), `=IF(B${excelRow}=0,0,F${excelRow}/B${excelRow})`, output.compRows[idx].evRevenue);
    setFormulaCell(compsSheet.getCell(excelRow, 8), `=IF(C${excelRow}=0,0,F${excelRow}/C${excelRow})`, output.compRows[idx].evEbitda);
    setInputCell(compsSheet.getCell(excelRow, 1));
    for (let col = 2; col <= 5; col += 1) {
      setCurrency(compsSheet.getCell(excelRow, col));
      setInputCell(compsSheet.getCell(excelRow, col));
    }
    setCurrency(compsSheet.getCell(excelRow, 6));
    compsSheet.getCell(excelRow, 7).numFmt = '0.00x';
    compsSheet.getCell(excelRow, 8).numFmt = '0.00x';
    for (let col = 6; col <= 8; col += 1) setOutputCell(compsSheet.getCell(excelRow, col));
  });
  styleGrid(compsSheet, 3, 3 + input.comps.length, 1, 8);

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.getColumn(1).width = 30;
  summarySheet.getColumn(2).width = 16;
  summarySheet.getCell('A1').value = 'Multiples Summary';
  summarySheet.getCell('A1').font = { bold: true, size: 14 };
  summarySheet.getCell('A3').value = 'Metric';
  summarySheet.getCell('B3').value = 'Value';
  styleHeaderRow(summarySheet, 3, 1, 2);
  const lastCompRow = 3 + input.comps.length;
  const summaryRows: Array<[string, string, number]> = [
    ['EV/Revenue Mean', `=AVERAGE('Comps Input'!G4:G${lastCompRow})`, output.summary.evRevenueMean],
    ['EV/Revenue Median', `=MEDIAN('Comps Input'!G4:G${lastCompRow})`, output.summary.evRevenueMedian],
    ['EV/Revenue 25th %tile', `=PERCENTILE.INC('Comps Input'!G4:G${lastCompRow},0.25)`, output.summary.evRevenueP25],
    ['EV/Revenue 75th %tile', `=PERCENTILE.INC('Comps Input'!G4:G${lastCompRow},0.75)`, output.summary.evRevenueP75],
    ['EV/EBITDA Mean', `=AVERAGE('Comps Input'!H4:H${lastCompRow})`, output.summary.evEbitdaMean],
    ['EV/EBITDA Median', `=MEDIAN('Comps Input'!H4:H${lastCompRow})`, output.summary.evEbitdaMedian],
    ['EV/EBITDA 25th %tile', `=PERCENTILE.INC('Comps Input'!H4:H${lastCompRow},0.25)`, output.summary.evEbitdaP25],
    ['EV/EBITDA 75th %tile', `=PERCENTILE.INC('Comps Input'!H4:H${lastCompRow},0.75)`, output.summary.evEbitdaP75],
  ];
  summaryRows.forEach(([label, formula, value], idx) => {
    const row = 4 + idx;
    summarySheet.getCell(row, 1).value = label;
    setFormulaCell(summarySheet.getCell(row, 2), formula, value);
    summarySheet.getCell(row, 2).numFmt = '0.00x';
    setOutputCell(summarySheet.getCell(row, 1));
  });
  styleGrid(summarySheet, 3, 11, 1, 2);

  const footballSheet = workbook.addWorksheet('Football Field');
  footballSheet.views = [{ state: 'frozen', ySplit: 3 }];
  footballSheet.getColumn(1).width = 30;
  footballSheet.getColumn(2).width = 16;
  footballSheet.getCell('A1').value = 'Implied EV Range';
  footballSheet.getCell('A1').font = { bold: true, size: 14 };
  footballSheet.getCell('A3').value = 'Metric';
  footballSheet.getCell('B3').value = 'Value';
  styleHeaderRow(footballSheet, 3, 1, 2);
  footballSheet.getCell('A4').value = 'Target Revenue';
  footballSheet.getCell('B4').value = input.target_revenue;
  footballSheet.getCell('A5').value = 'Target EBITDA';
  footballSheet.getCell('B5').value = input.target_ebitda;
  setCurrency(footballSheet.getCell('B4'));
  setCurrency(footballSheet.getCell('B5'));
  setInputCell(footballSheet.getCell('B4'));
  setInputCell(footballSheet.getCell('B5'));
  setOutputCell(footballSheet.getCell('A4'));
  setOutputCell(footballSheet.getCell('A5'));
  const impliedRows: Array<[string, string, number]> = [
    ['Implied EV (Revenue Mean)', '=B4*Summary!B4', output.implied.byRevenueMean],
    ['Implied EV (Revenue Median)', '=B4*Summary!B5', output.implied.byRevenueMedian],
    ['Implied EV (EBITDA Mean)', '=B5*Summary!B8', output.implied.byEbitdaMean],
    ['Implied EV (EBITDA Median)', '=B5*Summary!B9', output.implied.byEbitdaMedian],
    ['Blended EV', '=AVERAGE(B6:B9)', output.implied.blendedEv],
  ];
  impliedRows.forEach(([label, formula, value], idx) => {
    const row = 6 + idx;
    footballSheet.getCell(row, 1).value = label;
    setFormulaCell(footballSheet.getCell(row, 2), formula, value);
    setCurrency(footballSheet.getCell(row, 2));
    setOutputCell(footballSheet.getCell(row, 1));
  });
  styleGrid(footballSheet, 3, 10, 1, 2);

  const checksSheet = workbook.addWorksheet('Checks');
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 40;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  checksSheet.getCell('A1').value = 'Checks';
  checksSheet.getCell('A1').font = { bold: true, size: 14 };
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'Comp count >= 2';
  setFormulaCell(checksSheet.getCell('B4'), `=COUNT('Comps Input'!A4:A${lastCompRow})`, input.comps.length);
  setFormulaCell(checksSheet.getCell('C4'), '=IF(B4>=2,"PASS","FAIL")', input.comps.length >= 2 ? 'PASS' : 'FAIL');
  checksSheet.getCell('A5').value = 'No non-positive multiples';
  setFormulaCell(checksSheet.getCell('B5'), `=MIN('Comps Input'!G4:H${lastCompRow})`, Math.min(...output.compRows.flatMap((r)=>[r.evRevenue,r.evEbitda])));
  checksSheet.getCell('B5').numFmt = '0.00x';
  setFormulaCell(checksSheet.getCell('C5'), '=IF(B5>0,"PASS","FAIL")', output.compRows.every((r)=>r.evRevenue>0 && r.evEbitda>0) ? 'PASS' : 'FAIL');
  styleGrid(checksSheet, 3, 5, 1, 3);

  const equationsSheet = workbook.addWorksheet('Equations');
  equationsSheet.getColumn(1).width = 24;
  equationsSheet.getColumn(2).width = 90;
  equationsSheet.getCell('A1').value = 'Equations';
  equationsSheet.getCell('A1').font = { bold: true, size: 14 };
  equationsSheet.getCell('A3').value = 'Item';
  equationsSheet.getCell('B3').value = 'Equation';
  styleHeaderRow(equationsSheet, 3, 1, 2);
  [['EV','Market Cap + Net Debt'],['EV / Revenue','EV / Revenue'],['EV / EBITDA','EV / EBITDA'],['Blended EV','Average of selected implied EV outputs']].forEach(([item, eq], idx) => {
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

export const tradingCompsModel: ModelDef<TradingCompsInput, TradingCompsOutput> = {
  slug: 'trading-comps',
  name: 'Trading Comps',
  category: 'Banking',
  description: 'Compute peer trading multiples and implied enterprise value for a target company.',
  inputSchema: TradingCompsInputSchema,
  uiSchema: tradingCompsUiSchema,
  compute: computeTradingComps,
  buildWorkbook: buildTradingCompsWorkbook,
  filename: () => 'CapitalBase_Trading_Comps.xlsx',
};

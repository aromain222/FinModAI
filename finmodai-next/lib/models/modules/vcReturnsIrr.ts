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
import { clamp } from '@/lib/models/modules/modelUtils';

export const VcReturnsIrrInputSchema = z.object({
  investment_amount: z.number().positive(),
  ownership_pct: z.number().min(0).max(1),
  entry_valuation: z.number().positive(),
  exit_valuation: z.number().positive(),
  years_held: z.number().int().min(1).max(15),
});

type VcReturnsIrrInput = z.infer<typeof VcReturnsIrrInputSchema>;

type VcReturnsIrrOutput = {
  entryStakeValue: number;
  exitProceeds: number;
  moic: number;
  irr: number;
  sensitivity: Array<{ exit_valuation: number; moic: number; irr: number }>;
};

const vcReturnsUiSchema: UISchema = {
  sections: [
    {
      title: 'Investment Inputs',
      fields: [
        { key: 'investment_amount', label: 'Investment Amount', type: 'currency', required: true, defaultValue: 5000000 },
        { key: 'ownership_pct', label: 'Ownership %', type: 'percent', required: true, defaultValue: 0.12 },
        { key: 'entry_valuation', label: 'Entry Valuation', type: 'currency', required: true, defaultValue: 40000000 },
        { key: 'exit_valuation', label: 'Exit Valuation', type: 'currency', required: true, defaultValue: 180000000 },
        { key: 'years_held', label: 'Years Held', type: 'number', required: true, defaultValue: 5 },
      ],
    },
  ],
};

function computeVcReturnsIrr(input: VcReturnsIrrInput): VcReturnsIrrOutput {
  const entryStakeValue = input.entry_valuation * input.ownership_pct;
  const exitProceeds = input.exit_valuation * input.ownership_pct;
  const moic = exitProceeds / input.investment_amount;
  const irr = Math.pow(moic, 1 / input.years_held) - 1;

  const exitAxis = [
    clamp(input.exit_valuation * 0.7, 1, Number.MAX_SAFE_INTEGER),
    clamp(input.exit_valuation * 0.85, 1, Number.MAX_SAFE_INTEGER),
    input.exit_valuation,
    clamp(input.exit_valuation * 1.15, 1, Number.MAX_SAFE_INTEGER),
    clamp(input.exit_valuation * 1.3, 1, Number.MAX_SAFE_INTEGER),
  ];

  const sensitivity = exitAxis.map((exitValuation) => {
    const proceeds = exitValuation * input.ownership_pct;
    const moicScenario = proceeds / input.investment_amount;
    const irrScenario = Math.pow(moicScenario, 1 / input.years_held) - 1;
    return { exit_valuation: exitValuation, moic: moicScenario, irr: irrScenario };
  });

  return { entryStakeValue, exitProceeds, moic, irr, sensitivity };
}

async function buildVcReturnsWorkbook(input: VcReturnsIrrInput, output: VcReturnsIrrOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const inputsSheet = workbook.addWorksheet('Assumptions');
  inputsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  inputsSheet.getColumn(1).width = 32;
  inputsSheet.getColumn(2).width = 18;
  inputsSheet.getCell('A1').value = 'VC Returns Inputs';
  inputsSheet.getCell('A1').font = { bold: true, size: 14 };
  inputsSheet.getCell('A3').value = 'Input';
  inputsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(inputsSheet, 3, 1, 2);

  const rows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Investment Amount', input.investment_amount, 'currency'],
    ['Ownership %', input.ownership_pct, 'percent'],
    ['Entry Valuation', input.entry_valuation, 'currency'],
    ['Exit Valuation', input.exit_valuation, 'currency'],
    ['Years Held', input.years_held, 'number'],
  ];
  rows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    inputsSheet.getCell(row, 1).value = label;
    inputsSheet.getCell(row, 2).value = value;
    setInputCell(inputsSheet.getCell(row, 2));
    if (fmt === 'currency') setCurrency(inputsSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(inputsSheet.getCell(row, 2));
    if (fmt === 'number') inputsSheet.getCell(row, 2).numFmt = '#,##0';
    setOutputCell(inputsSheet.getCell(row, 1));
  });
  styleGrid(inputsSheet, 3, 8, 1, 2);

  const exitSheet = workbook.addWorksheet('Exit Scenarios');
  exitSheet.views = [{ state: 'frozen', ySplit: 3 }];
  exitSheet.columns = [{ width: 20 }, { width: 18 }, { width: 14 }, { width: 14 }];
  exitSheet.getCell('A1').value = 'Exit Scenarios';
  exitSheet.getCell('A1').font = { bold: true, size: 14 };
  ['Scenario', 'Exit Valuation', 'MOIC', 'IRR'].forEach((header, idx) => {
    exitSheet.getCell(3, 1 + idx).value = header;
  });
  styleHeaderRow(exitSheet, 3, 1, 4);
  const multipliers = [0.7, 0.85, 1, 1.15, 1.3];
  output.sensitivity.forEach((scenario, idx) => {
    const row = 4 + idx;
    exitSheet.getCell(row, 1).value = `Scenario ${idx + 1}`;
    setFormulaCell(exitSheet.getCell(row, 2), `=Assumptions!$B$7*${multipliers[idx]}`, scenario.exit_valuation);
    setFormulaCell(exitSheet.getCell(row, 3), `=B${row}*Assumptions!$B$5/Assumptions!$B$4`, scenario.moic);
    setFormulaCell(exitSheet.getCell(row, 4), `=B${row}*0+((C${row})^(1/Assumptions!$B$8))-1`, scenario.irr);
    setCurrency(exitSheet.getCell(row, 2));
    exitSheet.getCell(row, 3).numFmt = '0.00x';
    setPercent(exitSheet.getCell(row, 4));
    for (let c = 1; c <= 4; c += 1) setOutputCell(exitSheet.getCell(row, c));
  });
  styleGrid(exitSheet, 3, 3 + output.sensitivity.length, 1, 4);

  const irrSheet = workbook.addWorksheet('Summary');
  irrSheet.views = [{ state: 'frozen', ySplit: 3 }];
  irrSheet.getColumn(1).width = 30;
  irrSheet.getColumn(2).width = 18;
  irrSheet.getCell('A1').value = 'Returns Summary';
  irrSheet.getCell('A1').font = { bold: true, size: 14 };
  irrSheet.getCell('A3').value = 'Metric';
  irrSheet.getCell('B3').value = 'Value';
  styleHeaderRow(irrSheet, 3, 1, 2);

  const summaryRows: Array<[string, string, number, 'currency' | 'percent' | 'multiple']> = [
    ['Entry Stake Value', '=Assumptions!$B$6*Assumptions!$B$5', output.entryStakeValue, 'currency'],
    ['Exit Proceeds', '=Assumptions!$B$7*Assumptions!$B$5', output.exitProceeds, 'currency'],
    ['MOIC', '=B5/Assumptions!$B$4', output.moic, 'multiple'],
    ['IRR', '=IF(B6<=0,0,(B6^(1/Assumptions!$B$8))-1)', output.irr, 'percent'],
  ];
  summaryRows.forEach(([label, formula, value, fmt], idx) => {
    const row = 4 + idx;
    irrSheet.getCell(row, 1).value = label;
    setFormulaCell(irrSheet.getCell(row, 2), formula, value);
    if (fmt === 'currency') setCurrency(irrSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(irrSheet.getCell(row, 2));
    if (fmt === 'multiple') irrSheet.getCell(row, 2).numFmt = '0.00x';
    setOutputCell(irrSheet.getCell(row, 1));
  });
  styleGrid(irrSheet, 3, 7, 1, 2);

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
  checksSheet.getCell('A4').value = 'MOIC positive';
  setFormulaCell(checksSheet.getCell('B4'), '=Summary!B6', output.moic);
  checksSheet.getCell('B4').numFmt = '0.00x';
  setFormulaCell(checksSheet.getCell('C4'), '=IF(B4>0,"PASS","FAIL")', output.moic > 0 ? 'PASS' : 'FAIL');
  checksSheet.getCell('A5').value = 'IRR finite';
  setFormulaCell(checksSheet.getCell('B5'), '=Summary!B7', output.irr);
  setPercent(checksSheet.getCell('B5'));
  setFormulaCell(checksSheet.getCell('C5'), '=IF(ISNUMBER(B5),"PASS","FAIL")', Number.isFinite(output.irr) ? 'PASS' : 'FAIL');
  styleGrid(checksSheet, 3, 5, 1, 3);

  const equationsSheet = workbook.addWorksheet('Equations');
  equationsSheet.getColumn(1).width = 24;
  equationsSheet.getColumn(2).width = 90;
  equationsSheet.getCell('A1').value = 'Equations';
  equationsSheet.getCell('A1').font = { bold: true, size: 14 };
  equationsSheet.getCell('A3').value = 'Item';
  equationsSheet.getCell('B3').value = 'Equation';
  styleHeaderRow(equationsSheet, 3, 1, 2);
  [['Exit proceeds','Exit Valuation * Ownership %'],['MOIC','Exit Proceeds / Investment Amount'],['IRR','MOIC^(1/Years Held) - 1']].forEach(([item, eq], idx) => {
    const row = 4 + idx;
    equationsSheet.getCell(row, 1).value = item;
    equationsSheet.getCell(row, 2).value = eq;
    setOutputCell(equationsSheet.getCell(row, 1));
    setOutputCell(equationsSheet.getCell(row, 2));
  });
  styleGrid(equationsSheet, 3, 6, 1, 2);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));
  return workbook;
}

export const vcReturnsIrrModel: ModelDef<VcReturnsIrrInput, VcReturnsIrrOutput> = {
  slug: 'vc-returns-irr',
  name: 'VC Returns / IRR Model',
  category: 'VC',
  description: 'Estimate venture return outcomes from ownership, entry, exit, and hold period assumptions.',
  inputSchema: VcReturnsIrrInputSchema,
  uiSchema: vcReturnsUiSchema,
  compute: computeVcReturnsIrr,
  buildWorkbook: buildVcReturnsWorkbook,
  filename: () => 'CapitalBase_VC_Returns_IRR.xlsx',
};

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

    return {
      exit_valuation: exitValuation,
      moic: moicScenario,
      irr: irrScenario,
    };
  });

  return {
    entryStakeValue,
    exitProceeds,
    moic,
    irr,
    sensitivity,
  };
}

async function buildVcReturnsWorkbook(input: VcReturnsIrrInput, output: VcReturnsIrrOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const inputsSheet = workbook.addWorksheet('Investment Inputs');
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

  output.sensitivity.forEach((scenario, idx) => {
    const row = 4 + idx;
    exitSheet.getCell(row, 1).value = `Scenario ${idx + 1}`;
    exitSheet.getCell(row, 2).value = scenario.exit_valuation;
    exitSheet.getCell(row, 3).value = scenario.moic;
    exitSheet.getCell(row, 4).value = scenario.irr;

    setCurrency(exitSheet.getCell(row, 2));
    exitSheet.getCell(row, 3).numFmt = '0.00x';
    setPercent(exitSheet.getCell(row, 4));

    setOutputCell(exitSheet.getCell(row, 1));
    setOutputCell(exitSheet.getCell(row, 2));
    setOutputCell(exitSheet.getCell(row, 3));
    setOutputCell(exitSheet.getCell(row, 4));
  });
  styleGrid(exitSheet, 3, 3 + output.sensitivity.length, 1, 4);

  const irrSheet = workbook.addWorksheet('IRR - MOIC');
  irrSheet.views = [{ state: 'frozen', ySplit: 3 }];
  irrSheet.getColumn(1).width = 30;
  irrSheet.getColumn(2).width = 18;
  irrSheet.getCell('A1').value = 'Returns Summary';
  irrSheet.getCell('A1').font = { bold: true, size: 14 };

  irrSheet.getCell('A3').value = 'Metric';
  irrSheet.getCell('B3').value = 'Value';
  styleHeaderRow(irrSheet, 3, 1, 2);

  const summaryRows: Array<[string, number, 'currency' | 'percent' | 'multiple']> = [
    ['Entry Stake Value', output.entryStakeValue, 'currency'],
    ['Exit Proceeds', output.exitProceeds, 'currency'],
    ['MOIC', output.moic, 'multiple'],
    ['IRR', output.irr, 'percent'],
  ];

  summaryRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    irrSheet.getCell(row, 1).value = label;
    irrSheet.getCell(row, 2).value = value;

    if (fmt === 'currency') setCurrency(irrSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(irrSheet.getCell(row, 2));
    if (fmt === 'multiple') irrSheet.getCell(row, 2).numFmt = '0.00x';

    setOutputCell(irrSheet.getCell(row, 1));
    setOutputCell(irrSheet.getCell(row, 2));
  });

  irrSheet.getCell('A6').font = { bold: true };
  irrSheet.getCell('B6').font = { bold: true };

  styleGrid(irrSheet, 3, 7, 1, 2);

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

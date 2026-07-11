import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';

import { buildWorkbook as buildDcfWorkbook } from '@/lib/model-generator/templates/dcf';
import type { DcfModelInputs } from '@/lib/model-generator/extractInputs';

function makeAttachmentStyleDcfInputs(): DcfModelInputs {
  return {
    modelType: 'DCF',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    source: 'attachment_statement',
    years: 5,
    baseRevenue: 575_024,
    cash: 45_317,
    debt: 2_400,
    sharesOutstanding: 14_810.356,
    sharePrice: null,
    marketCap: null,
    revenueGrowth: [0.2, 0.16, 0.12, 0.1, 0.08],
    ebitMargin: [0.3537, 0.3587, 0.3637, 0.3687, 0.3737],
    taxRate: 0.18,
    daPctRevenue: 0.06,
    capexPctRevenue: 0.08,
    nwcPctRevenue: 0.02,
    wacc: 0.09,
    terminalGrowth: 0.025,
  };
}

async function reloadWorkbook(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  const compatibleBuffer = Buffer.from(buffer) as unknown as Parameters<typeof reloaded.xlsx.load>[0];
  await reloaded.xlsx.load(compatibleBuffer);
  return reloaded;
}

function numericFormulaResult(sheet: ExcelJS.Worksheet, cellRef: string): number {
  const value = sheet.getCell(cellRef).value;
  assert.ok(value && typeof value === 'object' && 'result' in value, `${sheet.name}!${cellRef} should contain a cached formula result`);
  const result = (value as { result?: unknown }).result;
  assert.equal(typeof result, 'number', `${sheet.name}!${cellRef} cached result should be numeric`);
  return result as number;
}

function numericRowResults(sheet: ExcelJS.Worksheet, cellRefs: string[]): number[] {
  return cellRefs.map((cellRef) => numericFormulaResult(sheet, cellRef));
}

test('DCF workbook persists large attachment-driven cached results for non-Excel viewers', async () => {
  const workbook = await reloadWorkbook(await buildDcfWorkbook(makeAttachmentStyleDcfInputs()));
  const forecast = workbook.getWorksheet('Operating Forecast');
  const valuation = workbook.getWorksheet('DCF Valuation');
  const cover = workbook.getWorksheet('Cover');

  assert.ok(forecast, 'Expected Operating Forecast worksheet');
  assert.ok(valuation, 'Expected DCF Valuation worksheet');
  assert.ok(cover, 'Expected Cover worksheet');

  assert.ok(numericFormulaResult(forecast, 'C5') > 600_000, 'Forecast revenue should stay in $mm scale');
  assert.ok(numericFormulaResult(forecast, 'C14') > 100_000, 'Forecast UFCF should not collapse toward zero');
  assert.ok(numericFormulaResult(valuation, 'B6') > 1_000_000, 'Enterprise value should stay in $mm scale');
  assert.ok(numericFormulaResult(valuation, 'B9') > 100, 'Implied share price should remain finance-scale');
  assert.ok(numericFormulaResult(cover, 'F11') > 1_000_000, 'Cover-sheet EV snapshot should cache the same large-scale value');
});

test('DCF workbook exit-multiple sensitivity moves across the 10x to 18x columns after reload', async () => {
  const workbook = await reloadWorkbook(await buildDcfWorkbook(makeAttachmentStyleDcfInputs()));
  const sensitivity = workbook.getWorksheet('Sensitivity');

  assert.ok(sensitivity, 'Expected Sensitivity worksheet');

  const firstRow = numericRowResults(sensitivity, ['C14', 'D14', 'E14', 'F14', 'G14']);
  const middleRow = numericRowResults(sensitivity, ['C16', 'D16', 'E16', 'F16', 'G16']);
  const lastRow = numericRowResults(sensitivity, ['C18', 'D18', 'E18', 'F18', 'G18']);

  assert.ok(firstRow[0] < firstRow[4], 'Sensitivity!C14:G14 should increase from 10x to 18x');
  assert.ok(middleRow[0] < middleRow[4], 'Sensitivity!C16:G16 should increase from 10x to 18x');
  assert.ok(lastRow[0] < lastRow[4], 'Sensitivity!C18:G18 should increase from 10x to 18x');

  assert.ok(firstRow[4] - firstRow[0] > 1, 'Sensitivity!C14:G14 should not be materially flat');
  assert.ok(middleRow[4] - middleRow[0] > 1, 'Sensitivity!C16:G16 should not be materially flat');
  assert.ok(lastRow[4] - lastRow[0] > 1, 'Sensitivity!C18:G18 should not be materially flat');
});

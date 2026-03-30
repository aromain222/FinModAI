import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';

import { buildWorkbook as buildDcfWorkbook } from '@/lib/model-generator/templates/dcf';
import { buildWorkbook as buildLboWorkbook } from '@/lib/model-generator/templates/lbo';
import type { DcfModelInputs, LboModelInputs } from '@/lib/model-generator/extractInputs';

function isAsciiSafe(value: string): boolean {
  return /^[\x09\x0A\x0D\x20-\x7E]*$/.test(value);
}

async function reloadWorkbook(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  return reloaded;
}

function collectWorkbookStrings(workbook: ExcelJS.Workbook): string[] {
  const values: string[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'string') values.push(cell.value);
        if (cell.note && typeof cell.note !== 'string' && Array.isArray(cell.note.texts)) {
          for (const noteText of cell.note.texts) {
            if (typeof noteText.text === 'string') values.push(noteText.text);
          }
        }
      });
    });
  });
  return values;
}

function assertWorkbookAsciiSafe(workbook: ExcelJS.Workbook, message: string): void {
  const badValues = collectWorkbookStrings(workbook).filter((value) => !isAsciiSafe(value));
  assert.deepEqual(badValues, [], message);
}

function assertWorkbookFontsCalibri(workbook: ExcelJS.Workbook, message: string): void {
  const badFonts: string[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.font?.name && cell.font.name !== 'Calibri') {
          badFonts.push(`${sheet.name}!${cell.address}:${cell.font.name}`);
        }
      });
    });
  });
  assert.deepEqual(badFonts, [], message);
}

function makeDcfInputs(): DcfModelInputs {
  return {
    modelType: 'DCF',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    source: 'attachment_statement',
    years: 5,
    baseRevenue: 575_024,
    cash: 45_317,
    debt: 95_281,
    sharesOutstanding: 14_810.356,
    sharePrice: null,
    marketCap: null,
    revenueGrowth: [0.2, 0.18, 0.14, 0.11, 0.09],
    ebitMargin: [0.354, 0.359, 0.364, 0.369, 0.374],
    taxRate: 0.18,
    daPctRevenue: 0.06,
    capexPctRevenue: 0.08,
    nwcPctRevenue: 0.02,
    wacc: 0.09,
    terminalGrowth: 0.025,
  };
}

function makeLboInputs(): LboModelInputs {
  return {
    modelType: 'LBO',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    source: 'attachment_statement',
    revenue: 575_024,
    ebitda: 216_000,
    netDebt: 49_964,
    entryMultiple: 12,
    exitMultiple: 11,
    debtPercent: 0.55,
    equityPercent: 0.45,
    interestRate: 0.07,
    amortizationPercent: 0.05,
    cashSweepPercent: 0.5,
    revenueGrowth: [0.08, 0.07, 0.06, 0.05, 0.04],
    ebitdaMargin: 0.375,
    capexPctRevenue: 0.03,
    deltaNwcPctRevenue: 0.01,
    taxRate: 0.23,
    holdingPeriodYears: 5,
    sharesOutstanding: 14_810.356,
    sharePrice: null,
  };
}

test('canonical DCF workbook export is ASCII-safe and uses Calibri for key styled cells', async () => {
  const workbook = await reloadWorkbook(await buildDcfWorkbook(makeDcfInputs()));

  assertWorkbookAsciiSafe(workbook, 'Canonical DCF workbook contains non-ASCII text');
  assertWorkbookFontsCalibri(workbook, 'Canonical DCF workbook contains non-Calibri fonts');

  const cover = workbook.getWorksheet('Cover');
  assert.equal(cover?.getCell('A1').value, 'Apple Inc. Discounted Cash Flow');
  assert.equal(cover?.getCell('A26').value, 'Read the cover sheet first, then challenge the assumptions tab, inspect the FCF build, and only then rely on the valuation range. Terminal value should not do all the work.');
  assert.equal(cover?.getCell('A1').font?.name, 'Calibri');
  assert.equal(workbook.getWorksheet('Assumptions')?.getCell('A7').font?.name, 'Calibri');
  assert.equal(workbook.getWorksheet('Operating Forecast')?.getCell('B10').font?.name, 'Calibri');
  assert.equal(workbook.getWorksheet('DCF Valuation')?.getCell('B6').font?.name, 'Calibri');
});

test('canonical LBO workbook export remains ASCII-safe and avoids disallowed fonts', async () => {
  const workbook = await reloadWorkbook(await buildLboWorkbook(makeLboInputs()));

  assertWorkbookAsciiSafe(workbook, 'Canonical LBO workbook contains non-ASCII text');
  assertWorkbookFontsCalibri(workbook, 'Canonical LBO workbook contains non-Calibri fonts');

  const summary = workbook.getWorksheet('LBO Summary');
  assert.ok(summary, 'Expected LBO Summary worksheet');
  assert.equal(summary?.getCell('A1').font?.name, 'Calibri');
});

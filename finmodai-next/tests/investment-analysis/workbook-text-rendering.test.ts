import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';

import { runLboModel } from '@/lib/lboEngine';
import { generateLBOWorkbook } from '@/lib/models/lbo/excel';
import { generateDCFWorkbook, type DCFOutput } from '@/lib/models/dcf/excel';
import { sanitizeWorkbookText } from '@/lib/excel/workbookText';
import { upsertModelBriefSheet, type ModelBriefReport } from '@/lib/models/modelBriefReport';
import { buildAnalystGeneratedWorkbook } from '@/lib/analyst/modelExport';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';

function isAsciiSafe(value: string): boolean {
  return /^[\x09\x0A\x0D\x20-\x7E]*$/.test(value);
}

function collectSheetStrings(sheet: ExcelJS.Worksheet): string[] {
  const values: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === 'string') values.push(cell.value);
      const note = cell.note;
      if (note && typeof note !== 'string' && Array.isArray(note.texts)) {
        for (const noteText of note.texts) {
          if (typeof noteText.text === 'string') values.push(noteText.text);
        }
      }
    });
  });
  return values;
}

function assertSheetAsciiSafe(sheet: ExcelJS.Worksheet, message: string): void {
  const badValues = collectSheetStrings(sheet).filter((value) => !isAsciiSafe(value));
  assert.deepEqual(badValues, [], message);
}

function makeDcfOutput(): DCFOutput {
  return {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    inputs: {
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      revenue: 400000,
      revenueGrowth: [0.08, 0.07, 0.06, 0.05, 0.04],
      ebitdaMargin: [0.31, 0.315, 0.32, 0.322, 0.325],
      ebitMargin: [0.28, 0.285, 0.29, 0.292, 0.295],
      taxRate: 0.16,
      depreciationPctRevenue: [0.03, 0.03, 0.03, 0.03, 0.03],
      capexPctRevenue: [0.03, 0.03, 0.03, 0.03, 0.03],
      nwcPctRevenue: [0.01, 0.01, 0.01, 0.01, 0.01],
      wacc: 0.095,
      terminalGrowth: 0.025,
      projectionYears: 5,
      netDebt: 45000,
      netDebtSource: 'estimated_ai',
      sharesOutstanding: 15500,
      marketPrice: 195,
    },
    projections: [
      { year: 2026, revenue: 432000, ebitda: 133920, ebit: 120960, nopat: 101606, depreciation: 12960, capex: 12960, nwcChange: 4320, unleveredFCF: 97286 },
      { year: 2027, revenue: 462240, ebitda: 145606, ebit: 131739, nopat: 110661, depreciation: 13867, capex: 13867, nwcChange: 4622, unleveredFCF: 106039 },
      { year: 2028, revenue: 489974, ebitda: 156792, ebit: 142093, nopat: 119358, depreciation: 14699, capex: 14699, nwcChange: 4900, unleveredFCF: 114458 },
      { year: 2029, revenue: 514473, ebitda: 165660, ebit: 150246, nopat: 126207, depreciation: 15434, capex: 15434, nwcChange: 5145, unleveredFCF: 121062 },
      { year: 2030, revenue: 535052, ebitda: 173892, ebit: 157156, nopat: 132011, depreciation: 16052, capex: 16052, nwcChange: 5351, unleveredFCF: 126660 },
    ],
    valuation: {
      pvOfProjectedFCF: 420000,
      terminalValue: 1850000,
      pvOfTerminalValue: 980000,
      enterpriseValue: 1400000,
      netDebt: 45000,
      equityValue: 1355000,
      sharesOutstanding: 15500,
      pricePerShare: 87.42,
    },
    waccBreakdown: {
      riskFreeRate: 0.043,
      equityRiskPremium: 0.055,
      beta: 1.1,
      costOfEquity: 0.1035,
      costOfDebt: 0.045,
      taxRate: 0.16,
      debtToEquity: 0.2,
      wacc: 0.095,
    },
  };
}

test('sanitizeWorkbookText converts workbook-hostile punctuation to ASCII-safe text', () => {
  assert.equal(
    sanitizeWorkbookText(`Entry EV is derived from EBITDA × entry multiple. Terminal value dominates — high sensitivity. • note. “Quotes” and it’s fine…`),
    `Entry EV is derived from EBITDA x entry multiple. Terminal value dominates - high sensitivity. - note. "Quotes" and it's fine...`
  );
});

test('LBO workbook narrative-heavy sheets are ASCII-safe', async () => {
  const output = runLboModel({
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    revenue: 245000,
    ebitda: 105000,
    entryMultiple: 12,
    exitMultiple: 11,
    transactionFeesPercent: 0.02,
    exitFeesPercent: 0.01,
    debtPercent: 0.55,
    equityPercent: 0.45,
    interestRate: 0.07,
    amortizationPercent: 0.05,
    cashSweepPercent: 0.5,
    revenueGrowth: [0.08, 0.07, 0.06, 0.05, 0.04],
    ebitdaMargin: 0.43,
    capexPctRevenue: 0.03,
    deltaNwcPctRevenue: 0.01,
    taxRate: 0.23,
    depreciationPctRevenue: 0.025,
    holdingPeriodYears: 5,
  });
  const workbook = await generateLBOWorkbook(output, {
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    revenue: 245000,
    ebitda: 105000,
    notes: ['Terminal value dominates — high sensitivity', 'Entry EV is derived from EBITDA × entry multiple.'],
  });

  assertSheetAsciiSafe(workbook.getWorksheet('LBO Summary')!, 'LBO Summary contains non-ASCII narrative text');
  assertSheetAsciiSafe(workbook.getWorksheet('Sources & Notes')!, 'LBO Sources & Notes contains non-ASCII narrative text');
});

test('DCF workbook summary and notes sheets are ASCII-safe', async () => {
  const workbook = await generateDCFWorkbook(makeDcfOutput());
  assertSheetAsciiSafe(workbook.getWorksheet('Model Brief')!, 'DCF Model Brief contains non-ASCII text');
  assertSheetAsciiSafe(workbook.getWorksheet('Sources & Notes')!, 'DCF Sources & Notes contains non-ASCII text');
});

test('model brief sheet sanitizes generated summary and placeholders before export', async () => {
  const workbook = new ExcelJS.Workbook();
  const report: ModelBriefReport = {
    modelType: 'dcf',
    companySnapshot: {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      sector: 'Technology',
      asOfDate: '2026-03-29',
      revenueLtm: 400000,
      ebitdaLtm: 125000,
      netIncomeLtm: 98000,
      netDebt: null,
      netDebtSource: 'Unavailable',
    },
    sections: [
      {
        title: 'Executive — Snapshot',
        rows: [
          { label: 'Note', value: 'Terminal value dominates — high sensitivity', format: 'text' },
          { label: 'Missing', value: null, format: 'text' },
        ],
      },
    ],
    summary: '“Investor takeaway” — use EBITDA × multiple, not a vibes-based output…',
  };

  await upsertModelBriefSheet(workbook, report);
  assertSheetAsciiSafe(workbook.getWorksheet('Model Brief')!, 'Model Brief sheet contains non-ASCII text after sanitization');
});

test('analyst export chat summary sanitizes unicode narrative before workbook export', async () => {
  const payload: AnalystGeneratedModelPayload = {
    prompt: 'Build a cap table — founder dilution × new round',
    modelType: 'CAP_TABLE',
    title: 'Seed round — summary',
    tabs: ['Summary — Overview', 'Checks'],
    keyOutputs: ['Post-money — fully diluted', 'Founder dilution'],
    scenarioContext: null,
    extractedInputs: {
      modelType: 'CAP_TABLE',
      roundType: 'Series “Seed”',
      preMoney: 12,
      raiseAmount: 4,
      founderShares: 100,
      optionPoolRefresh: 0.1,
    },
    defaultsUsed: {},
    provenanceSummary: {
      sourceType: 'prompt_defaults',
      sources: ['Prompt • user'],
      asOfDate: '2026-03-29',
      lastSynced: null,
      fallbackUsed: [],
    },
    comparisonSummary: {
      previousVersionNumber: 1,
      currentVersionNumber: 2,
      changedKeys: ['entry — price', 'option pool'],
    },
    recentRun: {
      runId: 'run_1',
      versionNumber: 2,
      createdAt: '2026-03-29T12:00:00Z',
      status: 'generated',
    },
    narrativeBlocks: [
      {
        title: 'Banker takeaway — round impact',
        body: 'Founder dilution remains manageable — but the option pool refresh × raise size does most of the work.',
      },
    ],
  };

  const workbook = await buildAnalystGeneratedWorkbook(payload);
  assertSheetAsciiSafe(workbook.getWorksheet('Chat Summary')!, 'Chat Summary contains non-ASCII narrative text');
});

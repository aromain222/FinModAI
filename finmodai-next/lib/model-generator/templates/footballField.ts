import ExcelJS from 'exceljs';
import type { FootballFieldModelInputs } from '@/lib/model-generator/extractInputs';
import { finalizeChecksSheet, writeCheckRow } from '@/lib/model-generator/excel/checks';
import { addEquationsSheet, type EquationRow } from '@/lib/model-generator/excel/equations';
import {
  applyWorkbookMeta,
  enableWorkbookRecalculation,
  setupSheet,
  styleAccentOutput,
  styleFormula,
  styleLabel,
  styleNarrativeBlock,
  styleOutput,
  styleSectionHeader,
  styleSubtitle,
  styleTableHeader,
  styleThinGrid,
  styleTitle,
} from '@/lib/model-generator/excel/formatting';

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function equityFromEnterpriseValue(enterpriseValue: number | null, netDebt: number | null): number | null {
  if (enterpriseValue === null) return null;
  return enterpriseValue - (netDebt ?? 0);
}

function pricePerShare(equityValue: number | null, sharesOutstanding: number | null): number | null {
  if (equityValue === null || sharesOutstanding === null || sharesOutstanding <= 0) return null;
  return equityValue / sharesOutstanding;
}

export function getPreview(inputs: FootballFieldModelInputs) {
  return {
    title: `${inputs.companyName} Football Field`,
    tabs: ['Summary', 'Football Field', 'Equations', 'Checks'],
  };
}

export async function buildWorkbook(inputs: FootballFieldModelInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  applyWorkbookMeta(workbook, `${inputs.companyName} Football Field`);
  enableWorkbookRecalculation(workbook);

  const summary = workbook.addWorksheet('Summary');
  const footballField = workbook.addWorksheet('Football Field');
  const checks = workbook.addWorksheet('Checks');

  setupSheet(summary, { freezeRows: 4, freezeCols: 1, tabColor: 'FF0F766E', columnWidths: [28, 18, 18, 18, 18, 20] });
  setupSheet(footballField, { freezeRows: 4, freezeCols: 1, tabColor: 'FF2563EB', columnWidths: [32, 16, 16, 16, 18, 18, 18] });
  setupSheet(checks, { freezeRows: 3, freezeCols: 1, tabColor: 'FFB45309', columnWidths: [28, 18, 34] });

  const equations: EquationRow[] = [];
  const rangesWithShareValues = inputs.ranges.map((range) => {
    const lowEquity = equityFromEnterpriseValue(range.lowValue, inputs.netDebt);
    const midEquity = equityFromEnterpriseValue(range.midValue, inputs.netDebt);
    const highEquity = equityFromEnterpriseValue(range.highValue, inputs.netDebt);
    return {
      ...range,
      lowEquity,
      midEquity,
      highEquity,
      lowPrice: pricePerShare(lowEquity, inputs.sharesOutstanding),
      midPrice: pricePerShare(midEquity, inputs.sharesOutstanding),
      highPrice: pricePerShare(highEquity, inputs.sharesOutstanding),
    };
  });

  summary.getCell('A1').value = `${inputs.companyName} Valuation Football Field`;
  summary.mergeCells('A1:F1');
  styleTitle(summary.getCell('A1'));
  summary.getCell('A2').value =
    'Banker-style valuation framing that lines up trading and transaction reference ranges in one place. Use it to compare valuation methods, not as a substitute for underlying model work.';
  summary.mergeCells('A2:F2');
  styleSubtitle(summary.getCell('A2'));
  summary.getCell('A3').value = 'Subject';
  summary.getCell('B3').value = inputs.companyName;
  summary.getCell('D3').value = 'Generated';
  summary.getCell('E3').value = dateStamp();
  summary.getCell('A4').value = 'Peer set';
  summary.getCell('B4').value = inputs.peerSetLabel;
  summary.getCell('D4').value = 'Source';
  summary.getCell('E4').value = inputs.source;
  ['A3', 'D3', 'A4', 'D4'].forEach((ref) => styleLabel(summary.getCell(ref)));
  ['B3', 'E3', 'B4', 'E4'].forEach((ref) => styleFormula(summary.getCell(ref)));

  const midpointPrices = rangesWithShareValues
    .map((range) => range.midPrice)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const midpointAverage =
    midpointPrices.length === 0 ? null : midpointPrices.reduce((total, value) => total + value, 0) / midpointPrices.length;
  const footballFieldTakeaway =
    midpointAverage == null || inputs.sharePrice == null
      ? 'The range set is incomplete. Fill the valuation methods and current share-price anchor before this goes into a banker book.'
      : midpointAverage / inputs.sharePrice - 1 > 0.1
        ? 'The midpoints screen above the current share price. Focus on whether the trading and transaction methods support the same upside case.'
        : midpointAverage / inputs.sharePrice - 1 < -0.1
          ? 'The midpoints screen below the current share price. The burden is on method selection and control-value framing to justify a premium read.'
          : 'The valuation methods cluster near the current share price. The key debate is spread, not direction.'
  ;

  styleSectionHeader(summary, 6, 'Banker Takeaway', 6);
  summary.getCell('A7').value = footballFieldTakeaway;
  summary.mergeCells('A7:F7');
  styleNarrativeBlock(summary, 7, 1, 6);

  styleSectionHeader(summary, 9, 'Selected Methodology', 6);
  summary.getCell('A10').value = 'Primary lens';
  summary.getCell('B10').value = 'Cross-check trading vs transaction ranges';
  summary.getCell('C10').value = 'Edit first';
  summary.getCell('D10').value = 'Method spread, net debt, and diluted shares';
  summary.getCell('E10').value = 'Pitch use';
  summary.getCell('F10').value = 'Board / banker valuation range';
  ['A10', 'C10', 'E10'].forEach((ref) => styleLabel(summary.getCell(ref)));
  ['B10', 'D10', 'F10'].forEach((ref) => styleFormula(summary.getCell(ref)));
  styleThinGrid(summary, 10, 10, 1, 6);

  styleSectionHeader(summary, 12, 'Subject Anchor', 5);
  const anchorRows = [
    ['Revenue', inputs.revenue],
    ['EBITDA', inputs.ebitda],
    ['Net Debt', inputs.netDebt],
    ['Current Price', inputs.sharePrice],
  ] as const;
  anchorRows.forEach((row, index) => {
    const excelRow = 13 + index;
    summary.getCell(excelRow, 1).value = row[0];
    summary.getCell(excelRow, 2).value = row[1];
    styleLabel(summary.getCell(excelRow, 1));
    styleAccentOutput(summary.getCell(excelRow, 2), 'currency');
  });

  styleSectionHeader(summary, 19, 'Range Snapshot', 6);
  styleTableHeader(summary, 20, 1, 6);
  ['Method', 'Low EV', 'Mid EV', 'High EV', 'Mid Equity', 'Mid Price / Share'].forEach((value, index) => {
    summary.getCell(20, index + 1).value = value;
  });
  rangesWithShareValues.forEach((range, index) => {
    const row = 21 + index;
    summary.getCell(row, 1).value = range.label;
    summary.getCell(row, 2).value = range.lowValue;
    summary.getCell(row, 3).value = range.midValue;
    summary.getCell(row, 4).value = range.highValue;
    summary.getCell(row, 5).value = range.midEquity;
    summary.getCell(row, 6).value = range.midPrice;
    styleLabel(summary.getCell(row, 1));
    [2, 3, 4, 5, 6].forEach((column) => styleOutput(summary.getCell(row, column), 'currency'));
  });
  styleThinGrid(summary, 20, 20 + rangesWithShareValues.length, 1, 6);
  const summaryNarrativeRow = 22 + rangesWithShareValues.length;
  summary.getCell(`A${summaryNarrativeRow}`).value =
    'Read this as a range-comparison sheet: trading ranges show where the market could price the subject, while precedent-style ranges show where control value may frame a deal discussion.';
  summary.mergeCells(`A${summaryNarrativeRow}:F${summaryNarrativeRow}`);
  styleNarrativeBlock(summary, summaryNarrativeRow, 1, 6);

  footballField.getCell('A1').value = `${inputs.companyName} Football Field`;
  footballField.mergeCells('A1:G1');
  styleTitle(footballField.getCell('A1'));
  footballField.getCell('A2').value =
    'Each row translates a valuation method into EV, equity value, and share-price framing using the same net debt and share-count anchors.';
  footballField.mergeCells('A2:G2');
  styleSubtitle(footballField.getCell('A2'));
  styleSectionHeader(footballField, 3, 'Valuation Ranges', 7);
  styleTableHeader(footballField, 4, 1, 7);
  ['Method', 'Low EV', 'Mid EV', 'High EV', 'Low Price', 'Mid Price', 'High Price'].forEach((value, index) => {
    footballField.getCell(4, index + 1).value = value;
  });
  rangesWithShareValues.forEach((range, index) => {
    const row = 5 + index;
    footballField.getCell(row, 1).value = range.label;
    footballField.getCell(row, 2).value = range.lowValue;
    footballField.getCell(row, 3).value = range.midValue;
    footballField.getCell(row, 4).value = range.highValue;
    footballField.getCell(row, 5).value = range.lowPrice;
    footballField.getCell(row, 6).value = range.midPrice;
    footballField.getCell(row, 7).value = range.highPrice;
    styleLabel(footballField.getCell(row, 1));
    [2, 3, 4, 5, 6, 7].forEach((column) => styleAccentOutput(footballField.getCell(row, column), 'currency'));
  });
  styleThinGrid(footballField, 4, 4 + rangesWithShareValues.length, 1, 7);
  const ffNarrativeRow = 6 + rangesWithShareValues.length;
  footballField.getCell(`A${ffNarrativeRow}`).value =
    'Methods should be compared for consistency and spread. Large gaps usually mean the subject economics, control framing, or peer selection need to be challenged before this goes into a banker deck.';
  footballField.mergeCells(`A${ffNarrativeRow}:G${ffNarrativeRow}`);
  styleNarrativeBlock(footballField, ffNarrativeRow, 1, 7);

  equations.push(
    {
      metric: 'Enterprise Value Range',
      description: 'Selected multiple multiplied by the relevant subject denominator.',
      excelFormula: '=SelectedMultiple * SubjectMetric',
      dependencies: 'Revenue or EBITDA, selected range multiple',
      location: 'Summary / Football Field',
    },
    {
      metric: 'Equity Value',
      description: 'Enterprise value less net debt.',
      excelFormula: '=EnterpriseValue - NetDebt',
      dependencies: 'EnterpriseValue, NetDebt',
      location: 'Summary / Football Field',
    },
    {
      metric: 'Price Per Share',
      description: 'Equity value divided by diluted shares outstanding.',
      excelFormula: '=EquityValue / SharesOutstanding',
      dependencies: 'EquityValue, SharesOutstanding',
      location: 'Summary / Football Field',
    }
  );
  addEquationsSheet(workbook, `${inputs.companyName} Football Field`, equations);

  checks.getCell('A1').value = `${inputs.companyName} Football Field Checks`;
  checks.mergeCells('A1:C1');
  styleTitle(checks.getCell('A1'));
  writeCheckRow(checks, 4, 'At least 2 populated methods', `IF(${rangesWithShareValues.filter((range) => range.midValue !== null).length}>=2,"PASS","FLAG")`, 'Football field should include more than one populated valuation method.');
  writeCheckRow(checks, 5, 'Net debt anchor available', `=${inputs.netDebt !== null ? '"PASS"' : '"FLAG"'}`, 'Need net debt to translate EV to equity value cleanly.');
  writeCheckRow(checks, 6, 'Share count anchor available', `=${inputs.sharesOutstanding !== null && inputs.sharesOutstanding > 0 ? '"PASS"' : '"FLAG"'}`, 'Need diluted shares to translate equity value into price-per-share outputs.');
  finalizeChecksSheet(checks, 4, 6);

  return workbook;
}

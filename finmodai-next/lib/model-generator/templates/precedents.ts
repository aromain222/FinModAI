import ExcelJS from 'exceljs';
import type { PrecedentsModelInputs } from '@/lib/model-generator/extractInputs';
import { finalizeChecksSheet, writeCheckRow } from '@/lib/model-generator/excel/checks';
import { addEquationsSheet, type EquationRow } from '@/lib/model-generator/excel/equations';
import {
  applyWorkbookMeta,
  enableWorkbookRecalculation,
  finalizeWorkbookCompatibility,
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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function minValue(values: number[]): number | null {
  return values.length > 0 ? Math.min(...values) : null;
}

function maxValue(values: number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null;
}

export function getPreview(inputs: PrecedentsModelInputs) {
  if (!inputs.companyName || inputs.companyName.trim().length === 0) {
    throw new Error('Precedents export requires a resolved subject company name.');
  }
  return {
    title: `${inputs.companyName} Precedent Transactions`,
    tabs: ['Summary', 'Transactions', 'Valuation', 'Equations', 'Checks'],
  };
}

export async function buildWorkbook(inputs: PrecedentsModelInputs): Promise<ExcelJS.Workbook> {
  if (!inputs.companyName || inputs.companyName.trim().length === 0) {
    throw new Error('Precedents export requires a resolved subject company name.');
  }
  if (typeof inputs.subjectRevenue !== 'number' && typeof inputs.subjectEbitda !== 'number') {
    throw new Error('Precedents export requires subject revenue or EBITDA before workbook generation.');
  }
  const workbook = new ExcelJS.Workbook();
  applyWorkbookMeta(workbook, `${inputs.companyName} Precedent Transactions`);
  enableWorkbookRecalculation(workbook);

  const summary = workbook.addWorksheet('Summary');
  const transactionsSheet = workbook.addWorksheet('Transactions');
  const valuation = workbook.addWorksheet('Valuation');
  const checks = workbook.addWorksheet('Checks');
  setupSheet(summary, { freezeRows: 4, freezeCols: 1, tabColor: 'FF0F766E', columnWidths: [28, 18, 18, 18, 18] });
  setupSheet(transactionsSheet, { freezeRows: 4, freezeCols: 1, tabColor: 'FF2563EB', columnWidths: [28, 18, 18, 12, 16, 16, 16, 14] });
  setupSheet(valuation, { freezeRows: 4, freezeCols: 1, tabColor: 'FF4F46E5', columnWidths: [28, 18, 18, 18, 18] });
  setupSheet(checks, { freezeRows: 3, freezeCols: 1, tabColor: 'FFB45309', columnWidths: [28, 18, 34] });

  const medianRevenueMultiple = median(inputs.transactions.map((item) => item.revenueMultiple));
  const medianEbitdaMultiple = median(inputs.transactions.map((item) => item.ebitdaMultiple));
  const medianPremium = median(inputs.transactions.map((item) => item.premium));
  const minRevenueMultiple = minValue(inputs.transactions.map((item) => item.revenueMultiple));
  const maxRevenueMultiple = maxValue(inputs.transactions.map((item) => item.revenueMultiple));
  const minEbitdaMultiple = minValue(inputs.transactions.map((item) => item.ebitdaMultiple));
  const maxEbitdaMultiple = maxValue(inputs.transactions.map((item) => item.ebitdaMultiple));
  const impliedEvRevenue = medianRevenueMultiple && inputs.subjectRevenue ? medianRevenueMultiple * inputs.subjectRevenue : null;
  const impliedEvEbitda = medianEbitdaMultiple && inputs.subjectEbitda ? medianEbitdaMultiple * inputs.subjectEbitda : null;

  summary.getCell('A1').value = `${inputs.companyName} Precedent Transactions`;
  summary.mergeCells('A1:E1');
  styleTitle(summary.getCell('A1'));
  summary.getCell('A2').value = 'Decision summary built from the selected deal set, with control premium and valuation range framed for banking-style review.';
  summary.mergeCells('A2:E2');
  styleSubtitle(summary.getCell('A2'));
  summary.getCell('A3').value = 'Subject';
  summary.getCell('B3').value = inputs.companyName;
  summary.getCell('A4').value = 'Transaction set';
  summary.getCell('B4').value = `${inputs.transactionCount} transactions`;
  summary.getCell('D3').value = 'Source';
  summary.getCell('E3').value = inputs.source;
  ['A3', 'A4', 'D3'].forEach((ref) => styleLabel(summary.getCell(ref)));
  ['B3', 'B4', 'E3'].forEach((ref) => styleFormula(summary.getCell(ref)));

  const controlTakeaway =
    medianPremium == null
      ? 'Control premium context is incomplete. Fix the precedent set before using this range in a banker deck.'
      : medianPremium > 0.3
        ? 'The precedent set implies a high-control premium outcome. Make sure the buyer mix and cycle line up with the subject.'
        : medianPremium > 0.15
          ? 'The precedent set implies a normal strategic premium. The main question is whether the subject deserves to clear the median.'
          : 'The precedent set screens on the low end for control premium. Pressure-test whether timing or deal mix is distorting the read-through.'
  ;

  styleSectionHeader(summary, 6, 'Banker Takeaway', 5);
  summary.getCell('A7').value = controlTakeaway;
  summary.mergeCells('A7:E7');
  styleNarrativeBlock(summary, 7, 1, 5);

  styleSectionHeader(summary, 9, 'Selected Methodology', 5);
  summary.getCell('A10').value = 'Primary lens';
  summary.getCell('B10').value = medianEbitdaMultiple !== null ? 'EV / EBITDA precedents' : 'EV / Revenue precedents';
  summary.getCell('C10').value = 'Edit first';
  summary.getCell('D10').value = 'Transaction set comparability and premium dispersion';
  summary.getCell('E10').value = 'Pitch use';
  summary.getCell('E11').value = 'Board / fairness range';
  ['A10', 'C10', 'E10'].forEach((ref) => styleLabel(summary.getCell(ref)));
  ['B10', 'D10', 'E11'].forEach((ref) => styleFormula(summary.getCell(ref)));
  styleThinGrid(summary, 10, 11, 1, 5);

  styleSectionHeader(summary, 13, 'Market Range', 4);
  styleTableHeader(summary, 14, 1, 4);
  ['Metric', 'Median', 'Implied EV', 'Commentary'].forEach((value, index) => {
    summary.getCell(14, index + 1).value = value;
  });
  const summaryRows = [
    ['EV / Revenue', medianRevenueMultiple, impliedEvRevenue, 'Benchmarks control valuations off topline scale'],
    ['EV / EBITDA', medianEbitdaMultiple, impliedEvEbitda, 'Useful for banking and sponsor return framing'],
    ['Control premium', medianPremium, null, 'Median premium paid across precedent set'],
  ] as const;
  summaryRows.forEach((row, index) => {
    const excelRow = 15 + index;
    summary.getCell(excelRow, 1).value = row[0];
    summary.getCell(excelRow, 2).value = row[1];
    summary.getCell(excelRow, 3).value = row[2];
    summary.getCell(excelRow, 4).value = row[3];
    styleLabel(summary.getCell(excelRow, 1));
    styleOutput(summary.getCell(excelRow, 2), row[0] === 'Control premium' ? 'percent' : 'multiple');
    styleAccentOutput(summary.getCell(excelRow, 3), 'currency');
    styleFormula(summary.getCell(excelRow, 4));
  });
  styleThinGrid(summary, 14, 17, 1, 4);

  styleSectionHeader(summary, 19, 'Decision Frame', 5);
  summary.getCell('A20').value =
    'Use the transaction medians to frame the control value range, then pressure-test whether the selected deal set is still representative for the subject today.';
  summary.mergeCells('A20:E20');
  styleNarrativeBlock(summary, 20, 1, 5);

  styleSectionHeader(summary, 22, 'Control Value Range', 5);
  styleTableHeader(summary, 23, 1, 5);
  ['Method', 'Low Multiple', 'Median Multiple', 'High Multiple', 'Implied EV Range'].forEach((value, index) => {
    summary.getCell(23, index + 1).value = value;
  });
  const rangeRows = [
    ['EV / Revenue', minRevenueMultiple, medianRevenueMultiple, maxRevenueMultiple, inputs.subjectRevenue],
    ['EV / EBITDA', minEbitdaMultiple, medianEbitdaMultiple, maxEbitdaMultiple, inputs.subjectEbitda],
  ] as const;
  rangeRows.forEach((row, index) => {
    const excelRow = 24 + index;
    const lowValue = row[1] !== null && row[4] ? row[1] * row[4] : null;
    const highValue = row[3] !== null && row[4] ? row[3] * row[4] : null;
    summary.getCell(excelRow, 1).value = row[0];
    summary.getCell(excelRow, 2).value = row[1];
    summary.getCell(excelRow, 3).value = row[2];
    summary.getCell(excelRow, 4).value = row[3];
    summary.getCell(excelRow, 5).value =
      lowValue !== null && highValue !== null
        ? `${Math.round(lowValue).toLocaleString('en-US')} to ${Math.round(highValue).toLocaleString('en-US')}`
        : 'Insufficient data';
    styleLabel(summary.getCell(excelRow, 1));
    styleOutput(summary.getCell(excelRow, 2), 'multiple');
    styleAccentOutput(summary.getCell(excelRow, 3), 'multiple');
    styleOutput(summary.getCell(excelRow, 4), 'multiple');
    styleFormula(summary.getCell(excelRow, 5));
  });
  styleThinGrid(summary, 23, 25, 1, 5);

  transactionsSheet.getCell('A1').value = `${inputs.companyName} Transaction Set`;
  transactionsSheet.mergeCells('A1:H1');
  styleTitle(transactionsSheet.getCell('A1'));
  transactionsSheet.getCell('A2').value = 'Selected transactions, announced premiums, and reference multiples for the current precedent set.';
  transactionsSheet.mergeCells('A2:H2');
  styleSubtitle(transactionsSheet.getCell('A2'));
  styleSectionHeader(transactionsSheet, 3, 'Selected Transactions', 8);
  styleTableHeader(transactionsSheet, 4, 1, 8);
  ['Transaction', 'Target', 'Acquirer', 'Year', 'Enterprise Value', 'EV / Revenue', 'EV / EBITDA', 'Premium'].forEach((value, index) => {
    transactionsSheet.getCell(4, index + 1).value = value;
  });
  inputs.transactions.forEach((transaction, index) => {
    const row = 5 + index;
    transactionsSheet.getCell(row, 1).value = transaction.transaction;
    transactionsSheet.getCell(row, 2).value = transaction.target;
    transactionsSheet.getCell(row, 3).value = transaction.acquirer;
    transactionsSheet.getCell(row, 4).value = transaction.announcementYear;
    transactionsSheet.getCell(row, 5).value = transaction.enterpriseValue;
    transactionsSheet.getCell(row, 6).value = transaction.revenueMultiple;
    transactionsSheet.getCell(row, 7).value = transaction.ebitdaMultiple;
    transactionsSheet.getCell(row, 8).value = transaction.premium;
    [1, 2, 3].forEach((column) => styleFormula(transactionsSheet.getCell(row, column)));
    styleFormula(transactionsSheet.getCell(row, 4), 'number');
    styleFormula(transactionsSheet.getCell(row, 5), 'currency');
    styleFormula(transactionsSheet.getCell(row, 6), 'multiple');
    styleFormula(transactionsSheet.getCell(row, 7), 'multiple');
    styleFormula(transactionsSheet.getCell(row, 8), 'percent');
  });
  if (inputs.transactions.length > 0) styleThinGrid(transactionsSheet, 4, 4 + inputs.transactions.length, 1, 8);

  valuation.getCell('A1').value = `${inputs.companyName} Banking Summary`;
  valuation.mergeCells('A1:E1');
  styleTitle(valuation.getCell('A1'));
  valuation.getCell('A2').value = 'Reference valuation outputs built from the precedent medians, intended for banker-style range framing rather than standalone intrinsic value.';
  valuation.mergeCells('A2:E2');
  styleSubtitle(valuation.getCell('A2'));
  styleSectionHeader(valuation, 3, 'Subject Framing', 5);
  const valuationRows = [
    ['Subject revenue', inputs.subjectRevenue],
    ['Subject EBITDA', inputs.subjectEbitda],
    ['Implied EV from revenue comps', impliedEvRevenue],
    ['Implied EV from EBITDA comps', impliedEvEbitda],
  ] as const;
  valuationRows.forEach((row, index) => {
    const excelRow = 4 + index;
    valuation.getCell(excelRow, 1).value = row[0];
    valuation.getCell(excelRow, 2).value = row[1];
    styleLabel(valuation.getCell(excelRow, 1));
    styleAccentOutput(valuation.getCell(excelRow, 2), 'currency');
  });
  styleSectionHeader(valuation, 9, 'Premium Context', 5);
  styleTableHeader(valuation, 10, 1, 5);
  ['Metric', 'Observed', 'Read-Through', 'Commentary', 'Use In Pitch'].forEach((value, index) => {
    valuation.getCell(10, index + 1).value = value;
  });
  const premiumRead = medianPremium == null ? 'n/a' : medianPremium > 0.3 ? 'High-control premium set' : medianPremium > 0.15 ? 'Normal strategic premium set' : 'Low premium / mixed set';
  const contextRows = [
    ['Median control premium', medianPremium, premiumRead, 'Control premium dispersion frames takeover value, not standalone trading value.', 'Board / fairness range'],
    ['Transaction count', inputs.transactionCount, inputs.transactionCount >= 5 ? 'Broad enough set' : 'Thin set', 'Smaller sets need heavier judgment on comparability and timing.', 'Appendix / caveats'],
  ] as const;
  contextRows.forEach((row, index) => {
    const excelRow = 11 + index;
    valuation.getCell(excelRow, 1).value = row[0];
    valuation.getCell(excelRow, 2).value = row[1];
    valuation.getCell(excelRow, 3).value = row[2];
    valuation.getCell(excelRow, 4).value = row[3];
    valuation.getCell(excelRow, 5).value = row[4];
    styleLabel(valuation.getCell(excelRow, 1));
    if (typeof row[1] === 'number' && row[0] === 'Median control premium') {
      styleAccentOutput(valuation.getCell(excelRow, 2), 'percent');
    } else {
      styleAccentOutput(valuation.getCell(excelRow, 2), 'number');
    }
    styleFormula(valuation.getCell(excelRow, 3));
    styleFormula(valuation.getCell(excelRow, 4));
    styleFormula(valuation.getCell(excelRow, 5));
  });
  styleThinGrid(valuation, 10, 12, 1, 5);
  valuation.getCell('A14').value =
    'The clean read is whether the subject deserves to trade above or below the median precedent range once growth, quality, and timing are adjusted for.';
  valuation.mergeCells('A14:E14');
  styleNarrativeBlock(valuation, 14, 1, 5);

  const equations: EquationRow[] = [
    {
      metric: 'Implied EV (Revenue)',
      description: 'Median EV / Revenue multiple applied to subject revenue.',
      excelFormula: '=MedianRevenueMultiple * SubjectRevenue',
      dependencies: 'MedianRevenueMultiple, SubjectRevenue',
      location: 'Summary / Valuation',
    },
    {
      metric: 'Implied EV (EBITDA)',
      description: 'Median EV / EBITDA multiple applied to subject EBITDA.',
      excelFormula: '=MedianEbitdaMultiple * SubjectEBITDA',
      dependencies: 'MedianEbitdaMultiple, SubjectEBITDA',
      location: 'Summary / Valuation',
    },
    {
      metric: 'Control Premium',
      description: 'Median announced premium across selected transactions.',
      excelFormula: '=MEDIAN(TransactionPremiums)',
      dependencies: 'Transaction premiums',
      location: 'Transactions',
    },
  ];
  addEquationsSheet(workbook, `${inputs.companyName} Precedents`, equations);

  checks.getCell('A1').value = `${inputs.companyName} Precedent Checks`;
  checks.mergeCells('A1:C1');
  styleTitle(checks.getCell('A1'));
  writeCheckRow(checks, 4, 'At least 3 transactions', `IF(${inputs.transactions.length}>=3,"PASS","FLAG")`, 'Precedent set should have enough points to support a range.');
  writeCheckRow(checks, 5, 'Revenue multiple available', `=${medianRevenueMultiple ? '"PASS"' : '"FLAG"'}`, 'Median EV / Revenue supports topline valuation framing.');
  writeCheckRow(checks, 6, 'EBITDA multiple available', `=${medianEbitdaMultiple ? '"PASS"' : '"FLAG"'}`, 'Median EV / EBITDA supports banking and sponsor valuation framing.');
  finalizeChecksSheet(checks, 4, 6);

  return finalizeWorkbookCompatibility(workbook);
}

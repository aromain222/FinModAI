import ExcelJS from 'exceljs';
import { calculateCompsFromData } from '@/lib/compsCalculator';
import type { CompsModelInputs } from '@/lib/model-generator/extractInputs';
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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = toFiniteNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

export function getPreview(inputs: CompsModelInputs) {
  return {
    title: `${inputs.companyName} Comparable Company Analysis`,
    tabs: ['Summary', 'Peer Set', 'Valuation', 'Equations', 'Checks'],
  };
}

export async function buildWorkbook(inputs: CompsModelInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  applyWorkbookMeta(workbook, `${inputs.companyName} Comparable Company Analysis`);
  enableWorkbookRecalculation(workbook);

  const summary = workbook.addWorksheet('Summary');
  const peers = workbook.addWorksheet('Peer Set');
  const valuation = workbook.addWorksheet('Valuation');
  const checks = workbook.addWorksheet('Checks');
  setupSheet(summary, { freezeRows: 4, freezeCols: 1, tabColor: 'FF0F766E', columnWidths: [28, 18, 18, 18, 18, 18] });
  setupSheet(peers, { freezeRows: 4, freezeCols: 1, tabColor: 'FF2563EB', columnWidths: [12, 24, 16, 16, 16, 16, 16, 16, 16] });
  setupSheet(valuation, { freezeRows: 4, freezeCols: 1, tabColor: 'FF4F46E5', columnWidths: [28, 18, 18, 18, 18] });
  setupSheet(checks, { freezeRows: 3, freezeCols: 1, tabColor: 'FFB45309', columnWidths: [28, 18, 34] });

  const result = calculateCompsFromData(inputs.subject, inputs.peers);
  const selectedEvRevenue = firstFinite(inputs.selectedMultiples?.evToRevenue, result.medianMultiples.evToRevenue);
  const selectedEvEbitda = firstFinite(inputs.selectedMultiples?.evToEbitda, result.medianMultiples.evToEbitda);
  const selectedPeRatio = firstFinite(inputs.selectedMultiples?.peRatio, result.medianMultiples.peRatio);
  const equations: EquationRow[] = [];
  const subjectMarketCap = firstFinite(
    result.subject.marketCap,
    inputs.subject.marketCap,
    firstFinite(inputs.subject.price, result.subject.price) !== null && firstFinite(inputs.subject.sharesOutstanding, result.subject.sharesOutstanding) !== null
      ? (firstFinite(inputs.subject.price, result.subject.price) as number) * (firstFinite(inputs.subject.sharesOutstanding, result.subject.sharesOutstanding) as number) / 1_000_000
      : null
  );
  const subjectRevenue = firstFinite(result.subject.revenue, inputs.subject.revenue);
  const subjectEbitda = firstFinite(result.subject.ebitda, inputs.subject.ebitda);
  const subjectNetIncome = firstFinite(result.subject.netIncome, inputs.subject.netIncome);
  const subjectCash = firstFinite(result.subject.cash, inputs.subject.cash);
  const subjectDebt = firstFinite(result.subject.totalDebt, inputs.subject.totalDebt);
  const subjectNetDebt =
    result.subject.netDebt ??
    (subjectDebt !== null && subjectCash !== null ? subjectDebt - subjectCash : null);
  const subjectEnterpriseValue =
    result.subject.enterpriseValue ??
    (subjectMarketCap !== null && subjectNetDebt !== null ? subjectMarketCap + subjectNetDebt : null);
  const subjectShares = firstFinite(result.subject.sharesOutstanding, inputs.subject.sharesOutstanding);
  const subjectPrice = firstFinite(result.subject.price, inputs.subject.price);
  const impliedEvRevenue =
    result.impliedValuation.byEvRevenue ??
    (selectedEvRevenue !== null && subjectRevenue !== null && subjectRevenue > 0
      ? selectedEvRevenue * subjectRevenue
      : null);
  const impliedEvEbitda =
    result.impliedValuation.byEvEbitda ??
    (selectedEvEbitda !== null && subjectEbitda !== null && subjectEbitda > 0
      ? selectedEvEbitda * subjectEbitda
      : null);
  const impliedEquityRevenue =
    inputs.selectedMultiples?.evToRevenue !== undefined
      ? impliedEvRevenue !== null && subjectNetDebt !== null
        ? impliedEvRevenue - subjectNetDebt
        : null
      : (result.impliedValuation.equityValueByEvRevenue ??
        (impliedEvRevenue !== null && subjectNetDebt !== null ? impliedEvRevenue - subjectNetDebt : null));
  const impliedEquityEbitda =
    inputs.selectedMultiples?.evToEbitda !== undefined
      ? impliedEvEbitda !== null && subjectNetDebt !== null
        ? impliedEvEbitda - subjectNetDebt
        : null
      : (result.impliedValuation.equityValueByEvEbitda ??
        (impliedEvEbitda !== null && subjectNetDebt !== null ? impliedEvEbitda - subjectNetDebt : null));
  const impliedEquityPe =
    inputs.selectedMultiples?.peRatio !== undefined
      ? selectedPeRatio !== null && subjectNetIncome !== null && subjectNetIncome > 0
        ? selectedPeRatio * subjectNetIncome
        : null
      : firstFinite(result.impliedValuation.equityValueByPe, result.impliedValuation.byPe);
  const impliedEvPe =
    impliedEquityPe !== null && subjectNetDebt !== null ? impliedEquityPe + subjectNetDebt : null;
  const impliedPriceRevenue =
    result.impliedValuation.pricePerShareByEvRevenue ??
    (impliedEquityRevenue !== null && subjectShares !== null && subjectShares > 0
      ? impliedEquityRevenue / subjectShares
      : null);
  const impliedPriceEbitda =
    result.impliedValuation.pricePerShareByEvEbitda ??
    (impliedEquityEbitda !== null && subjectShares !== null && subjectShares > 0
      ? impliedEquityEbitda / subjectShares
      : null);
  const impliedPricePe =
    result.impliedValuation.pricePerShareByPe ??
    (impliedEquityPe !== null && subjectShares !== null && subjectShares > 0
      ? impliedEquityPe / subjectShares
      : null);
  const subjectEvRevenueMultiple =
    subjectEnterpriseValue !== null && subjectRevenue !== null && subjectRevenue > 0
      ? subjectEnterpriseValue / subjectRevenue
      : null;
  const subjectEvEbitdaMultiple =
    subjectEnterpriseValue !== null && subjectEbitda !== null && subjectEbitda > 0
      ? subjectEnterpriseValue / subjectEbitda
      : null;
  const subjectPeMultiple =
    subjectMarketCap !== null && subjectNetIncome !== null && subjectNetIncome > 0
      ? subjectMarketCap / subjectNetIncome
      : null;

  summary.getCell('A1').value = `${inputs.companyName} Comparable Company Analysis`;
  summary.mergeCells('A1:F1');
  styleTitle(summary.getCell('A1'));
  summary.getCell('A2').value =
    'Relative valuation workbook with a defined subject, explicit peer set, selected trading multiples, implied valuation range, equations, and checks.';
  summary.mergeCells('A2:F2');
  styleSubtitle(summary.getCell('A2'));
  summary.getCell('A3').value = 'Subject';
  summary.getCell('B3').value = inputs.companyName;
  summary.getCell('A4').value = 'Peer set';
  summary.getCell('B4').value = inputs.peerSetLabel;
  summary.getCell('D3').value = 'Generated';
  summary.getCell('E3').value = dateStamp();
  summary.getCell('D4').value = 'Source';
  summary.getCell('E4').value = inputs.source;
  ['A3', 'A4', 'D3', 'D4'].forEach((ref) => styleLabel(summary.getCell(ref)));
  ['B3', 'B4', 'E3', 'E4'].forEach((ref) => styleFormula(summary.getCell(ref)));

  styleSectionHeader(summary, 6, 'Decision Frame', 6);
  summary.getCell('A7').value = 'Selected peers';
  summary.getCell('B7').value = result.peers.length;
  summary.getCell('C7').value = 'Current price';
  summary.getCell('D7').value = subjectPrice;
  summary.getCell('E7').value = 'Current EV';
  summary.getCell('F7').value = subjectEnterpriseValue;
  ['A7', 'C7', 'E7'].forEach((ref) => styleLabel(summary.getCell(ref)));
  styleFormula(summary.getCell('B7'), 'number');
  styleAccentOutput(summary.getCell('D7'), 'currency');
  styleAccentOutput(summary.getCell('F7'), 'currency');
  styleThinGrid(summary, 7, 7, 1, 6);

  styleSectionHeader(summary, 10, 'Valuation Range', 5);
  styleTableHeader(summary, 11, 1, 5);
  summary.getCell('A11').value = 'Method';
  summary.getCell('B11').value = 'Selected Multiple';
  summary.getCell('C11').value = 'Implied EV';
  summary.getCell('D11').value = 'Implied Equity';
  summary.getCell('E11').value = 'Implied Price';

  const rows = [
    ['EV / Revenue', selectedEvRevenue, impliedEvRevenue, impliedEquityRevenue, impliedPriceRevenue],
    ['EV / EBITDA', selectedEvEbitda, impliedEvEbitda, impliedEquityEbitda, impliedPriceEbitda],
    ['P / E', selectedPeRatio, impliedEvPe, impliedEquityPe, impliedPricePe],
  ] as const;

  rows.forEach((row, index) => {
    const excelRow = 12 + index;
    summary.getCell(excelRow, 1).value = row[0];
    summary.getCell(excelRow, 2).value = row[1];
    summary.getCell(excelRow, 3).value = row[2];
    summary.getCell(excelRow, 4).value = row[3];
    summary.getCell(excelRow, 5).value = row[4];
    styleLabel(summary.getCell(excelRow, 1));
    styleFormula(summary.getCell(excelRow, 2), 'multiple');
    styleOutput(summary.getCell(excelRow, 3), 'currency');
    styleOutput(summary.getCell(excelRow, 4), 'currency');
    styleAccentOutput(summary.getCell(excelRow, 5), 'currency');
  });
  styleThinGrid(summary, 11, 14, 1, 5);

  styleSectionHeader(summary, 17, 'Subject Snapshot', 4);
  const snapshotRows = [
    ['Enterprise value', subjectEnterpriseValue],
    ['Revenue', subjectRevenue],
    ['EBITDA', subjectEbitda],
    ['Net income', subjectNetIncome],
  ] as const;
  snapshotRows.forEach((row, index) => {
    const excelRow = 18 + index;
    summary.getCell(excelRow, 1).value = row[0];
    summary.getCell(excelRow, 2).value = row[1];
    styleLabel(summary.getCell(excelRow, 1));
    styleFormula(summary.getCell(excelRow, 2), 'currency');
  });
  styleSectionHeader(summary, 24, 'Subject vs Peer Median', 4);
  styleTableHeader(summary, 25, 1, 4);
  ['Metric', 'Subject', 'Peer Median', 'Premium / (Discount)'].forEach((value, index) => {
    summary.getCell(25, index + 1).value = value;
  });
  const comparisonRows = [
    ['EV / Revenue', subjectEvRevenueMultiple, result.medianMultiples.evToRevenue],
    ['EV / EBITDA', subjectEvEbitdaMultiple, result.medianMultiples.evToEbitda],
    ['P / E', subjectPeMultiple, result.medianMultiples.peRatio],
  ] as const;
  comparisonRows.forEach((row, index) => {
    const excelRow = 26 + index;
    const premium =
      row[1] !== null && row[2] !== null && row[2] !== 0
        ? row[1] / row[2] - 1
        : null;
    summary.getCell(excelRow, 1).value = row[0];
    summary.getCell(excelRow, 2).value = row[1];
    summary.getCell(excelRow, 3).value = row[2];
    summary.getCell(excelRow, 4).value = premium;
    styleLabel(summary.getCell(excelRow, 1));
    styleFormula(summary.getCell(excelRow, 2), 'multiple');
    styleFormula(summary.getCell(excelRow, 3), 'multiple');
    styleOutput(summary.getCell(excelRow, 4), 'percent');
  });
  styleThinGrid(summary, 25, 28, 1, 4);

  summary.getCell('A30').value =
    'Use the subject-vs-median bridge to decide whether the premium or discount is earned. Then inspect the peer table for denominator quality and obvious trading outliers.';
  summary.mergeCells('A30:F30');
  styleNarrativeBlock(summary, 30, 1, 6);

  peers.getCell('A1').value = `${inputs.companyName} Peer Set`;
  peers.mergeCells('A1:I1');
  styleTitle(peers.getCell('A1'));
  peers.getCell('A2').value =
    'Peer table is the audit trail. Challenge inclusion, trading levels, and denominator quality before trusting the median multiple.';
  peers.mergeCells('A2:I2');
  styleSubtitle(peers.getCell('A2'));
  styleSectionHeader(peers, 3, 'Peer Trading Multiples', 9);
  styleTableHeader(peers, 4, 1, 9);
  ['Ticker', 'Name', 'Price', 'Market Cap', 'EV', 'Revenue', 'EBITDA', 'EV / Revenue', 'EV / EBITDA'].forEach((value, index) => {
    peers.getCell(4, index + 1).value = value;
  });

  result.peers.forEach((peer, index) => {
    const row = 5 + index;
    peers.getCell(row, 1).value = peer.ticker;
    peers.getCell(row, 2).value = peer.name;
    peers.getCell(row, 3).value = peer.price;
    peers.getCell(row, 4).value = peer.marketCap;
    peers.getCell(row, 5).value = peer.enterpriseValue;
    peers.getCell(row, 6).value = peer.revenue;
    peers.getCell(row, 7).value = peer.ebitda;
    peers.getCell(row, 8).value = peer.evToRevenue;
    peers.getCell(row, 9).value = peer.evToEbitda;
    styleLabel(peers.getCell(row, 1));
    styleFormula(peers.getCell(row, 2));
    [3, 4, 5, 6, 7].forEach((column) => styleFormula(peers.getCell(row, column), 'currency'));
    [8, 9].forEach((column) => styleFormula(peers.getCell(row, column), 'multiple'));
  });
  if (result.peers.length > 0) styleThinGrid(peers, 4, 4 + result.peers.length, 1, 9);

  valuation.getCell('A1').value = `${inputs.companyName} Valuation Summary`;
  valuation.mergeCells('A1:E1');
  styleTitle(valuation.getCell('A1'));
  valuation.getCell('A2').value =
    'Premium / discount output is only as good as the peer set and the selected multiples. Treat this as a framing tool, not a single-point answer.';
  valuation.mergeCells('A2:E2');
  styleSubtitle(valuation.getCell('A2'));
  styleSectionHeader(valuation, 3, 'Selected Multiple Audit', 5);
  styleTableHeader(valuation, 4, 1, 5);
  ['Method', 'Peer Median', 'Selected Multiple', 'Subject Denominator', 'Implied EV / Equity'].forEach((value, index) => {
    valuation.getCell(4, index + 1).value = value;
  });
  const selectedRows = [
    ['EV / Revenue', result.medianMultiples.evToRevenue, selectedEvRevenue, subjectRevenue, impliedEvRevenue],
    ['EV / EBITDA', result.medianMultiples.evToEbitda, selectedEvEbitda, subjectEbitda, impliedEvEbitda],
    ['P / E', result.medianMultiples.peRatio, selectedPeRatio, subjectNetIncome, impliedEquityPe],
  ] as const;
  selectedRows.forEach((row, index) => {
    const excelRow = 5 + index;
    valuation.getCell(excelRow, 1).value = row[0];
    valuation.getCell(excelRow, 2).value = row[1];
    valuation.getCell(excelRow, 3).value = row[2];
    valuation.getCell(excelRow, 4).value = row[3];
    valuation.getCell(excelRow, 5).value = row[4];
    styleLabel(valuation.getCell(excelRow, 1));
    styleFormula(valuation.getCell(excelRow, 2), 'multiple');
    styleFormula(valuation.getCell(excelRow, 3), 'multiple');
    styleFormula(valuation.getCell(excelRow, 4), 'currency');
    styleAccentOutput(valuation.getCell(excelRow, 5), 'currency');
  });
  styleThinGrid(valuation, 4, 7, 1, 5);

  styleSectionHeader(valuation, 10, 'Premium / Discount View', 5);
  styleTableHeader(valuation, 11, 1, 5);
  ['Method', 'Implied Price', 'Current Price', 'Premium / (Discount)', 'Commentary'].forEach((value, index) => {
    valuation.getCell(11, index + 1).value = value;
  });
  const currentPrice = subjectPrice;
  rows.forEach((row, index) => {
    const excelRow = 12 + index;
    const impliedPrice = row[4];
    const premium = currentPrice && impliedPrice ? impliedPrice / currentPrice - 1 : null;
    valuation.getCell(excelRow, 1).value = row[0];
    valuation.getCell(excelRow, 2).value = impliedPrice;
    valuation.getCell(excelRow, 3).value = currentPrice;
    valuation.getCell(excelRow, 4).value = premium;
    valuation.getCell(excelRow, 5).value =
      premium == null ? 'Insufficient data' : premium > 0.1 ? 'Trades below implied comp range' : premium < -0.1 ? 'Trades above implied comp range' : 'Within peer valuation range';
    styleLabel(valuation.getCell(excelRow, 1));
    styleOutput(valuation.getCell(excelRow, 2), 'currency');
    styleFormula(valuation.getCell(excelRow, 3), 'currency');
    styleOutput(valuation.getCell(excelRow, 4), 'percent');
    styleFormula(valuation.getCell(excelRow, 5));
  });
  styleThinGrid(valuation, 11, 14, 1, 5);

  equations.push(
    {
      metric: 'Enterprise Value',
      description: 'Market capitalization plus net debt.',
      excelFormula: '=MarketCap + TotalDebt - Cash',
      dependencies: 'MarketCap, TotalDebt, Cash',
      location: 'Peer Set',
    },
    {
      metric: 'EV / Revenue',
      description: 'Enterprise value divided by LTM revenue.',
      excelFormula: '=EnterpriseValue / Revenue',
      dependencies: 'EnterpriseValue, Revenue',
      location: 'Peer Set',
    },
    {
      metric: 'Implied Price',
      description: 'Implied equity value divided by shares outstanding.',
      excelFormula: '=ImpliedEquityValue / SharesOutstanding',
      dependencies: 'ImpliedEquityValue, SharesOutstanding',
      location: 'Summary',
    }
  );
  addEquationsSheet(workbook, `${inputs.companyName} Comps`, equations);

  checks.getCell('A1').value = `${inputs.companyName} Comps Checks`;
  checks.mergeCells('A1:C1');
  styleTitle(checks.getCell('A1'));
  writeCheckRow(checks, 4, 'At least 3 valid peers', `IF(${result.peers.length}>=3,"PASS","FLAG")`, 'Peer coverage should be broad enough for stable trading multiples.');
  writeCheckRow(checks, 5, 'EV / Revenue available', `=${result.medianMultiples.evToRevenue ? '"PASS"' : '"FLAG"'}`, 'Revenue multiple should resolve for at least one comparable.');
  writeCheckRow(checks, 6, 'EV / EBITDA available', `=${result.medianMultiples.evToEbitda ? '"PASS"' : '"FLAG"'}`, 'EBITDA multiple supports banking and ER valuation framing.');
  finalizeChecksSheet(checks, 4, 6);

  return workbook;
}

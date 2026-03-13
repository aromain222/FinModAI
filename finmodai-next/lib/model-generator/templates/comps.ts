import ExcelJS from 'exceljs';
import { calculateCompsFromData } from '@/lib/compsCalculator';
import type { CompsModelInputs } from '@/lib/model-generator/extractInputs';
import { finalizeChecksSheet, writeCheckRow } from '@/lib/model-generator/excel/checks';
import { addEquationsSheet, type EquationRow } from '@/lib/model-generator/excel/equations';
import {
  applyWorkbookMeta,
  enableWorkbookRecalculation,
  setupSheet,
  styleFormula,
  styleLabel,
  styleOutput,
  styleSectionHeader,
  styleTableHeader,
  styleThinGrid,
  styleTitle,
} from '@/lib/model-generator/excel/formatting';

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
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
  const equations: EquationRow[] = [];

  summary.getCell('A1').value = `${inputs.companyName} Comparable Company Analysis`;
  summary.mergeCells('A1:F1');
  styleTitle(summary.getCell('A1'));
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

  styleSectionHeader(summary, 6, 'Valuation Range', 5);
  styleTableHeader(summary, 7, 1, 5);
  summary.getCell('A7').value = 'Method';
  summary.getCell('B7').value = 'Median Multiple';
  summary.getCell('C7').value = 'Implied EV';
  summary.getCell('D7').value = 'Implied Equity';
  summary.getCell('E7').value = 'Implied Price';

  const rows = [
    ['EV / Revenue', result.medianMultiples.evToRevenue, result.impliedValuation.byEvRevenue, result.impliedValuation.equityValueByEvRevenue, result.impliedValuation.pricePerShareByEvRevenue],
    ['EV / EBITDA', result.medianMultiples.evToEbitda, result.impliedValuation.byEvEbitda, result.impliedValuation.equityValueByEvEbitda, result.impliedValuation.pricePerShareByEvEbitda],
    ['P / E', result.medianMultiples.peRatio, result.impliedValuation.byPe, result.impliedValuation.equityValueByPe, result.impliedValuation.pricePerShareByPe],
  ] as const;

  rows.forEach((row, index) => {
    const excelRow = 8 + index;
    summary.getCell(excelRow, 1).value = row[0];
    summary.getCell(excelRow, 2).value = row[1];
    summary.getCell(excelRow, 3).value = row[2];
    summary.getCell(excelRow, 4).value = row[3];
    summary.getCell(excelRow, 5).value = row[4];
    styleLabel(summary.getCell(excelRow, 1));
    styleFormula(summary.getCell(excelRow, 2), 'multiple');
    styleOutput(summary.getCell(excelRow, 3), 'currency');
    styleOutput(summary.getCell(excelRow, 4), 'currency');
    styleOutput(summary.getCell(excelRow, 5), 'currency');
  });
  styleThinGrid(summary, 7, 10, 1, 5);

  styleSectionHeader(summary, 13, 'Subject Snapshot', 4);
  const snapshotRows = [
    ['Enterprise value', result.subject.enterpriseValue],
    ['Revenue', result.subject.revenue],
    ['EBITDA', result.subject.ebitda],
    ['Net income', result.subject.netIncome],
  ] as const;
  snapshotRows.forEach((row, index) => {
    const excelRow = 14 + index;
    summary.getCell(excelRow, 1).value = row[0];
    summary.getCell(excelRow, 2).value = row[1];
    styleLabel(summary.getCell(excelRow, 1));
    styleFormula(summary.getCell(excelRow, 2), 'currency');
  });

  peers.getCell('A1').value = `${inputs.companyName} Peer Set`;
  peers.mergeCells('A1:I1');
  styleTitle(peers.getCell('A1'));
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
  styleSectionHeader(valuation, 3, 'Premium / Discount View', 5);
  styleTableHeader(valuation, 4, 1, 5);
  ['Method', 'Implied Price', 'Current Price', 'Premium / (Discount)', 'Commentary'].forEach((value, index) => {
    valuation.getCell(4, index + 1).value = value;
  });
  const currentPrice = result.subject.price;
  rows.forEach((row, index) => {
    const excelRow = 5 + index;
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
  styleThinGrid(valuation, 4, 7, 1, 5);

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

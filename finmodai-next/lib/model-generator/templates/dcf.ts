import ExcelJS from 'exceljs';
import type { DcfModelInputs } from '@/lib/model-generator/extractInputs';
import { finalizeChecksSheet, writeCheckRow } from '@/lib/model-generator/excel/checks';
import { addEquationsSheet, type EquationRow } from '@/lib/model-generator/excel/equations';
import {
  applyWorkbookMeta,
  col,
  enableWorkbookRecalculation,
  mergeAndCenter,
  setupSheet,
  styleFormula,
  styleInput,
  styleLabel,
  styleModelMeta,
  styleOutput,
  styleSectionHeader,
  styleSubTotal,
  styleTableHeader,
  styleThinGrid,
  styleTitle,
  styleTotal,
} from '@/lib/model-generator/excel/formatting';
import { defineNamedCell, defineNamedCells } from '@/lib/model-generator/excel/namedRanges';

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function yearName(prefix: string, year: string) {
  return `${prefix}_${year.replace(/[^A-Za-z0-9]/g, '')}`;
}

function buildAxis(base: number, step: number, size: number, floor = 0): number[] {
  const start = base - step * Math.floor(size / 2);
  return Array.from({ length: size }, (_, index) => Number(Math.max(start + step * index, floor).toFixed(4)));
}

export function getPreview(inputs: DcfModelInputs) {
  return {
    title: `${inputs.companyName} DCF`,
    tabs: ['Cover', 'Assumptions', 'Operating Forecast', 'DCF Valuation', 'Sensitivity', 'Equations', 'Checks'],
    keyAssumptions: {
      years: inputs.years,
      wacc: inputs.wacc,
      terminalGrowth: inputs.terminalGrowth,
    },
  };
}

export async function buildWorkbook(inputs: DcfModelInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  const baseYear = generatedAt.getFullYear() - 1;
  const forecastYears = Array.from({ length: inputs.years }, (_, index) => `${baseYear + index + 1}E`);
  const lastForecastYear = forecastYears[forecastYears.length - 1];
  const sharePrice = inputs.sharePrice ?? 0;
  const exitMultiple = 14;
  const equations: EquationRow[] = [];

  applyWorkbookMeta(workbook, `${inputs.companyName} DCF Valuation`);
  enableWorkbookRecalculation(workbook);

  const coverSheet = workbook.addWorksheet('Cover');
  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  const forecastSheet = workbook.addWorksheet('Operating Forecast');
  const valuationSheet = workbook.addWorksheet('DCF Valuation');
  const sensitivitySheet = workbook.addWorksheet('Sensitivity');
  const checksSheet = workbook.addWorksheet('Checks');

  setupSheet(coverSheet, { freezeRows: 2, freezeCols: 0, tabColor: 'FF1D4ED8', columnWidths: [28, 18, 18, 18, 24, 18, 18, 18] });
  setupSheet(assumptionsSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF2563EB', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14, 14] });
  setupSheet(forecastSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF0F766E', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14, 14] });
  setupSheet(valuationSheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF047857', columnWidths: [30, 18, 14, 14, 14, 14, 14, 14, 14] });
  setupSheet(sensitivitySheet, { freezeRows: 4, freezeCols: 2, tabColor: 'FF7C3AED', columnWidths: [24, 12, 14, 14, 14, 14, 14, 14] });
  setupSheet(checksSheet, { freezeRows: 3, freezeCols: 1, tabColor: 'FFB45309', columnWidths: [30, 16, 36, 18] });

  coverSheet.getCell('A1').value = `${inputs.companyName} Discounted Cash Flow`;
  mergeAndCenter(coverSheet, 'A1:H1');
  styleTitle(coverSheet.getCell('A1'));
  styleModelMeta(coverSheet, 3, 'Company', inputs.companyName);
  styleModelMeta(coverSheet, 4, 'Ticker', inputs.ticker || 'N/A');
  styleModelMeta(coverSheet, 5, 'Generated', formatDate(generatedAt));
  styleModelMeta(coverSheet, 6, 'Source', inputs.source);
  styleModelMeta(coverSheet, 7, 'Input legend', 'Blue cells are editable inputs. Green cells are key outputs.');

  styleSectionHeader(coverSheet, 9, 'Assumption Snapshot', 3);
  coverSheet.getCell('A10').value = 'Forecast years';
  coverSheet.getCell('B10').value = { formula: '=ForecastYears' };
  coverSheet.getCell('A11').value = 'WACC';
  coverSheet.getCell('B11').value = { formula: '=WACC' };
  coverSheet.getCell('A12').value = 'Terminal growth';
  coverSheet.getCell('B12').value = { formula: '=TerminalGrowth' };
  coverSheet.getCell('A13').value = 'Exit multiple';
  coverSheet.getCell('B13').value = { formula: '=ExitMultiple' };
  coverSheet.getCell('A14').value = 'Terminal method';
  coverSheet.getCell('B14').value = { formula: '=TerminalMethod' };
  ['A10', 'A11', 'A12', 'A13', 'A14'].forEach((ref) => styleLabel(coverSheet.getCell(ref)));
  styleFormula(coverSheet.getCell('B10'), 'number');
  styleFormula(coverSheet.getCell('B11'), 'percent');
  styleFormula(coverSheet.getCell('B12'), 'percent');
  styleFormula(coverSheet.getCell('B13'), 'multiple');
  styleFormula(coverSheet.getCell('B14'));

  styleSectionHeader(coverSheet, 9, 'Valuation Snapshot', 7);
  coverSheet.getCell('E10').value = 'Enterprise Value';
  coverSheet.getCell('F10').value = { formula: '=EnterpriseValue' };
  coverSheet.getCell('E11').value = 'Equity Value';
  coverSheet.getCell('F11').value = { formula: '=EquityValue' };
  coverSheet.getCell('E12').value = 'Implied Share Price';
  coverSheet.getCell('F12').value = { formula: '=ImpliedSharePrice' };
  coverSheet.getCell('E13').value = 'PV of Explicit FCF';
  coverSheet.getCell('F13').value = { formula: '=PVExplicitFCF' };
  coverSheet.getCell('E14').value = 'PV of Terminal Value';
  coverSheet.getCell('F14').value = { formula: '=PVTerminalValue' };
  ['E10', 'E11', 'E12', 'E13', 'E14'].forEach((ref) => styleLabel(coverSheet.getCell(ref)));
  ['F10', 'F11', 'F12', 'F13', 'F14'].forEach((ref) => styleOutput(coverSheet.getCell(ref), 'currency'));
  styleThinGrid(coverSheet, 10, 14, 1, 2);
  styleThinGrid(coverSheet, 10, 14, 5, 6);

  styleSectionHeader(coverSheet, 17, 'Valuation Bridge', 3);
  coverSheet.getCell('A18').value = 'PV of Explicit FCF';
  coverSheet.getCell('B18').value = { formula: '=PVExplicitFCF' };
  coverSheet.getCell('A19').value = 'PV of Terminal Value';
  coverSheet.getCell('B19').value = { formula: '=PVTerminalValue' };
  coverSheet.getCell('A20').value = 'Enterprise Value';
  coverSheet.getCell('B20').value = { formula: '=EnterpriseValue' };
  coverSheet.getCell('A21').value = 'Net debt / (cash)';
  coverSheet.getCell('B21').value = { formula: '=NetDebt' };
  coverSheet.getCell('A22').value = 'Equity Value';
  coverSheet.getCell('B22').value = { formula: '=EquityValue' };
  ['A18', 'A19', 'A20', 'A21', 'A22'].forEach((ref) => styleLabel(coverSheet.getCell(ref)));
  ['B18', 'B19', 'B20', 'B21', 'B22'].forEach((ref, index) =>
    index === 2 || index === 4 ? styleOutput(coverSheet.getCell(ref), 'currency') : styleFormula(coverSheet.getCell(ref), 'currency')
  );

  styleSectionHeader(coverSheet, 17, 'Sensitivity Snapshot', 8);
  coverSheet.getCell('E18').value = 'Implied Share Price';
  coverSheet.getCell('F18').value = { formula: '=ImpliedSharePrice' };
  coverSheet.getCell('E19').value = 'Current Share Price';
  coverSheet.getCell('F19').value = { formula: '=CurrentSharePrice' };
  coverSheet.getCell('E20').value = 'Upside / (Downside)';
  coverSheet.getCell('F20').value = { formula: '=IF(CurrentSharePrice>0,ImpliedSharePrice/CurrentSharePrice-1,"")' };
  coverSheet.getCell('E21').value = 'Low Sensitivity Price';
  coverSheet.getCell('F21').value = { formula: '=MIN(Sensitivity!C5:G9)' };
  coverSheet.getCell('E22').value = 'High Sensitivity Price';
  coverSheet.getCell('F22').value = { formula: '=MAX(Sensitivity!C5:G9)' };
  ['E18', 'E19', 'E20', 'E21', 'E22'].forEach((ref) => styleLabel(coverSheet.getCell(ref)));
  styleOutput(coverSheet.getCell('F18'), 'currency');
  styleFormula(coverSheet.getCell('F19'), 'currency');
  styleOutput(coverSheet.getCell('F20'), 'percent');
  styleFormula(coverSheet.getCell('F21'), 'currency');
  styleFormula(coverSheet.getCell('F22'), 'currency');
  styleThinGrid(coverSheet, 18, 22, 1, 2);
  styleThinGrid(coverSheet, 18, 22, 5, 6);

  assumptionsSheet.getCell('A1').value = `${inputs.companyName} Valuation Assumptions`;
  mergeAndCenter(assumptionsSheet, 'A1:I1');
  styleTitle(assumptionsSheet.getCell('A1'));
  styleModelMeta(assumptionsSheet, 3, 'Base year', `${baseYear}A`);
  styleModelMeta(assumptionsSheet, 4, 'Model type', 'Unlevered DCF');

  styleSectionHeader(assumptionsSheet, 6, 'Operating Inputs', 4);
  assumptionsSheet.getCell('A7').value = 'Forecast years';
  assumptionsSheet.getCell('B7').value = inputs.years;
  assumptionsSheet.getCell('A8').value = 'Base revenue';
  assumptionsSheet.getCell('B8').value = inputs.baseRevenue;
  assumptionsSheet.getCell('A9').value = 'Cash';
  assumptionsSheet.getCell('B9').value = inputs.cash;
  assumptionsSheet.getCell('A10').value = 'Debt';
  assumptionsSheet.getCell('B10').value = inputs.debt;
  assumptionsSheet.getCell('A11').value = 'Shares outstanding';
  assumptionsSheet.getCell('B11').value = inputs.sharesOutstanding;
  assumptionsSheet.getCell('A12').value = 'Current share price';
  assumptionsSheet.getCell('B12').value = sharePrice;
  ['A7', 'A8', 'A9', 'A10', 'A11', 'A12'].forEach((ref) => styleLabel(assumptionsSheet.getCell(ref)));
  styleInput(assumptionsSheet.getCell('B7'), 'number');
  styleInput(assumptionsSheet.getCell('B8'), 'currency');
  styleInput(assumptionsSheet.getCell('B9'), 'currency');
  styleInput(assumptionsSheet.getCell('B10'), 'currency');
  styleInput(assumptionsSheet.getCell('B11'), 'number');
  styleInput(assumptionsSheet.getCell('B12'), 'currency');

  styleSectionHeader(assumptionsSheet, 14, 'Valuation Inputs', 4);
  assumptionsSheet.getCell('A15').value = 'WACC';
  assumptionsSheet.getCell('B15').value = inputs.wacc;
  assumptionsSheet.getCell('A16').value = 'Terminal growth';
  assumptionsSheet.getCell('B16').value = inputs.terminalGrowth;
  assumptionsSheet.getCell('A17').value = 'Exit EBITDA multiple';
  assumptionsSheet.getCell('B17').value = exitMultiple;
  assumptionsSheet.getCell('A18').value = 'Terminal method';
  assumptionsSheet.getCell('B18').value = 'Perpetuity Growth';
  assumptionsSheet.getCell('A19').value = 'Tax rate';
  assumptionsSheet.getCell('B19').value = inputs.taxRate;
  assumptionsSheet.getCell('A20').value = 'D&A % revenue';
  assumptionsSheet.getCell('B20').value = inputs.daPctRevenue;
  assumptionsSheet.getCell('A21').value = 'Capex % revenue';
  assumptionsSheet.getCell('B21').value = inputs.capexPctRevenue;
  assumptionsSheet.getCell('A22').value = 'NWC % revenue';
  assumptionsSheet.getCell('B22').value = inputs.nwcPctRevenue;
  ['A15', 'A16', 'A17', 'A18', 'A19', 'A20', 'A21', 'A22'].forEach((ref) => styleLabel(assumptionsSheet.getCell(ref)));
  styleInput(assumptionsSheet.getCell('B15'), 'percent');
  styleInput(assumptionsSheet.getCell('B16'), 'percent');
  styleInput(assumptionsSheet.getCell('B17'), 'multiple');
  styleInput(assumptionsSheet.getCell('B18'));
  styleInput(assumptionsSheet.getCell('B19'), 'percent');
  styleInput(assumptionsSheet.getCell('B20'), 'percent');
  styleInput(assumptionsSheet.getCell('B21'), 'percent');
  styleInput(assumptionsSheet.getCell('B22'), 'percent');

  styleSectionHeader(assumptionsSheet, 24, 'Yearly Operating Drivers', 2 + inputs.years);
  styleTableHeader(assumptionsSheet, 25, 1, 2 + inputs.years);
  assumptionsSheet.getCell('A25').value = 'Driver';
  assumptionsSheet.getCell('B25').value = `${baseYear}A`;
  assumptionsSheet.getCell('A26').value = 'Revenue growth';
  assumptionsSheet.getCell('A27').value = 'EBIT margin';
  assumptionsSheet.getCell('A28').value = 'Capex % revenue';
  assumptionsSheet.getCell('A29').value = 'D&A % revenue';
  assumptionsSheet.getCell('A30').value = 'NWC % revenue';
  ['A26', 'A27', 'A28', 'A29', 'A30'].forEach((ref) => styleLabel(assumptionsSheet.getCell(ref)));
  forecastYears.forEach((year, index) => {
    const columnIndex = 3 + index;
    const letter = col(columnIndex);
    assumptionsSheet.getCell(25, columnIndex).value = year;
    assumptionsSheet.getCell(26, columnIndex).value = inputs.revenueGrowth[index];
    assumptionsSheet.getCell(27, columnIndex).value = inputs.ebitMargin[index];
    assumptionsSheet.getCell(28, columnIndex).value = inputs.capexPctRevenue;
    assumptionsSheet.getCell(29, columnIndex).value = inputs.daPctRevenue;
    assumptionsSheet.getCell(30, columnIndex).value = inputs.nwcPctRevenue;
    ['26', '27', '28', '29', '30'].forEach((row) => styleInput(assumptionsSheet.getCell(`${letter}${row}`), 'percent'));
  });

  defineNamedCells(workbook, assumptionsSheet, [
    { name: 'ForecastYears', cellRef: 'B7' },
    { name: 'BaseRevenue', cellRef: 'B8' },
    { name: 'CashBalance', cellRef: 'B9' },
    { name: 'DebtBalance', cellRef: 'B10' },
    { name: 'SharesOutstanding', cellRef: 'B11' },
    { name: 'CurrentSharePrice', cellRef: 'B12' },
    { name: 'WACC', cellRef: 'B15' },
    { name: 'TerminalGrowth', cellRef: 'B16' },
    { name: 'ExitMultiple', cellRef: 'B17' },
    { name: 'TerminalMethod', cellRef: 'B18' },
    { name: 'TaxRate', cellRef: 'B19' },
    { name: 'DAPctRevenue', cellRef: 'B20' },
    { name: 'CapexPctRevenue', cellRef: 'B21' },
    { name: 'NWCPctRevenue', cellRef: 'B22' },
  ]);
  forecastYears.forEach((year, index) => {
    defineNamedCell(workbook, yearName('RevenueGrowth', year), assumptionsSheet, `${col(3 + index)}26`);
    defineNamedCell(workbook, yearName('EBITMargin', year), assumptionsSheet, `${col(3 + index)}27`);
    defineNamedCell(workbook, yearName('CapexPct', year), assumptionsSheet, `${col(3 + index)}28`);
    defineNamedCell(workbook, yearName('DAPct', year), assumptionsSheet, `${col(3 + index)}29`);
    defineNamedCell(workbook, yearName('NWCPct', year), assumptionsSheet, `${col(3 + index)}30`);
  });

  forecastSheet.getCell('A1').value = 'Operating Forecast';
  mergeAndCenter(forecastSheet, 'A1:I1');
  styleTitle(forecastSheet.getCell('A1'));
  styleSectionHeader(forecastSheet, 3, 'Unlevered Free Cash Flow Build', 2 + inputs.years);
  styleTableHeader(forecastSheet, 4, 1, 2 + inputs.years);
  forecastSheet.getCell('A4').value = 'Line Item';
  forecastSheet.getCell('B4').value = `${baseYear}A`;
  forecastYears.forEach((year, index) => {
    forecastSheet.getCell(4, 3 + index).value = year;
  });

  const forecastRows = {
    revenue: 5,
    revenueGrowth: 6,
    ebit: 7,
    ebitMargin: 8,
    taxes: 9,
    nopat: 10,
    da: 11,
    capex: 12,
    deltaNwc: 13,
    ufcf: 14,
  } as const;

  [
    [forecastRows.revenue, 'Revenue'],
    [forecastRows.revenueGrowth, 'Revenue growth'],
    [forecastRows.ebit, 'EBIT'],
    [forecastRows.ebitMargin, 'EBIT margin'],
    [forecastRows.taxes, 'Taxes'],
    [forecastRows.nopat, 'NOPAT'],
    [forecastRows.da, 'D&A'],
    [forecastRows.capex, 'Capex'],
    [forecastRows.deltaNwc, 'Change in NWC'],
    [forecastRows.ufcf, 'Unlevered FCF'],
  ].forEach(([row, label]) => {
    forecastSheet.getCell(`A${row}`).value = label;
    styleLabel(forecastSheet.getCell(`A${row}`));
  });

  forecastSheet.getCell(`B${forecastRows.revenue}`).value = { formula: '=BaseRevenue' };
  forecastSheet.getCell(`B${forecastRows.revenueGrowth}`).value = '';
  forecastSheet.getCell(`B${forecastRows.ebitMargin}`).value = inputs.ebitMargin[0];
  forecastSheet.getCell(`B${forecastRows.ebit}`).value = { formula: `=B${forecastRows.revenue}*B${forecastRows.ebitMargin}` };
  forecastSheet.getCell(`B${forecastRows.taxes}`).value = { formula: `=MAX(B${forecastRows.ebit},0)*TaxRate` };
  forecastSheet.getCell(`B${forecastRows.nopat}`).value = { formula: `=B${forecastRows.ebit}-B${forecastRows.taxes}` };
  forecastSheet.getCell(`B${forecastRows.da}`).value = { formula: `=B${forecastRows.revenue}*DAPctRevenue` };
  forecastSheet.getCell(`B${forecastRows.capex}`).value = { formula: `=B${forecastRows.revenue}*CapexPctRevenue` };
  forecastSheet.getCell(`B${forecastRows.deltaNwc}`).value = 0;
  forecastSheet.getCell(`B${forecastRows.ufcf}`).value = { formula: `=B${forecastRows.nopat}+B${forecastRows.da}-B${forecastRows.capex}-B${forecastRows.deltaNwc}` };
  styleFormula(forecastSheet.getCell(`B${forecastRows.revenue}`), 'currency');
  styleFormula(forecastSheet.getCell(`B${forecastRows.ebitMargin}`), 'percent');
  [forecastRows.ebit, forecastRows.taxes, forecastRows.nopat, forecastRows.da, forecastRows.capex, forecastRows.deltaNwc].forEach((row) =>
    styleFormula(forecastSheet.getCell(`B${row}`), 'currency')
  );
  styleOutput(forecastSheet.getCell(`B${forecastRows.ufcf}`), 'currency');

  let previousRevenueName = 'BaseRevenue';
  let previousNwcValue = `B${forecastRows.revenue}*${yearName('NWCPct', forecastYears[0])}`;
  forecastYears.forEach((year, index) => {
    const letter = col(3 + index);
    const revenueName = yearName('Revenue', year);
    const ebitName = yearName('EBIT', year);
    const nopatName = yearName('NOPAT', year);
    const daName = yearName('DA', year);
    const capexName = yearName('Capex', year);
    const deltaNwcName = yearName('DeltaNWC', year);
    const ufcfName = yearName('UFCF', year);
    const growthName = yearName('RevenueGrowth', year);
    const marginName = yearName('EBITMargin', year);
    const daPctName = yearName('DAPct', year);
    const capexPctName = yearName('CapexPct', year);
    const nwcPctName = yearName('NWCPct', year);

    forecastSheet.getCell(`${letter}${forecastRows.revenue}`).value = { formula: `=${previousRevenueName}*(1+${growthName})` };
    forecastSheet.getCell(`${letter}${forecastRows.revenueGrowth}`).value = { formula: `=${growthName}` };
    forecastSheet.getCell(`${letter}${forecastRows.ebit}`).value = { formula: `=${revenueName}*${marginName}` };
    forecastSheet.getCell(`${letter}${forecastRows.ebitMargin}`).value = { formula: `=${marginName}` };
    forecastSheet.getCell(`${letter}${forecastRows.taxes}`).value = { formula: `=MAX(${ebitName},0)*TaxRate` };
    forecastSheet.getCell(`${letter}${forecastRows.nopat}`).value = { formula: `=${ebitName}-${letter}${forecastRows.taxes}` };
    forecastSheet.getCell(`${letter}${forecastRows.da}`).value = { formula: `=${revenueName}*${daPctName}` };
    forecastSheet.getCell(`${letter}${forecastRows.capex}`).value = { formula: `=${revenueName}*${capexPctName}` };
    forecastSheet.getCell(`${letter}${forecastRows.deltaNwc}`).value = { formula: `=(${revenueName}*${nwcPctName})-(${previousNwcValue})` };
    forecastSheet.getCell(`${letter}${forecastRows.ufcf}`).value = { formula: `=${nopatName}+${daName}-${capexName}-${deltaNwcName}` };

    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.revenue}`), 'currency');
    styleInput(forecastSheet.getCell(`${letter}${forecastRows.revenueGrowth}`), 'percent');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.ebit}`), 'currency');
    styleInput(forecastSheet.getCell(`${letter}${forecastRows.ebitMargin}`), 'percent');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.taxes}`), 'currency');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.nopat}`), 'currency');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.da}`), 'currency');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.capex}`), 'currency');
    styleFormula(forecastSheet.getCell(`${letter}${forecastRows.deltaNwc}`), 'currency');
    styleOutput(forecastSheet.getCell(`${letter}${forecastRows.ufcf}`), 'currency');

    defineNamedCell(workbook, revenueName, forecastSheet, `${letter}${forecastRows.revenue}`);
    defineNamedCell(workbook, ebitName, forecastSheet, `${letter}${forecastRows.ebit}`);
    defineNamedCell(workbook, nopatName, forecastSheet, `${letter}${forecastRows.nopat}`);
    defineNamedCell(workbook, daName, forecastSheet, `${letter}${forecastRows.da}`);
    defineNamedCell(workbook, capexName, forecastSheet, `${letter}${forecastRows.capex}`);
    defineNamedCell(workbook, deltaNwcName, forecastSheet, `${letter}${forecastRows.deltaNwc}`);
    defineNamedCell(workbook, ufcfName, forecastSheet, `${letter}${forecastRows.ufcf}`);

    equations.push({
      metric: `Revenue ${year}`,
      description: 'Prior-year revenue times one plus revenue growth.',
      excelFormula: `=${previousRevenueName}*(1+${growthName})`,
      dependencies: `${previousRevenueName}, ${growthName}`,
      location: `'Operating Forecast'!${letter}${forecastRows.revenue}`,
    });
    equations.push({
      metric: `UFCF ${year}`,
      description: 'NOPAT plus D&A less capex less the change in NWC.',
      excelFormula: `=${nopatName}+${daName}-${capexName}-${deltaNwcName}`,
      dependencies: `${nopatName}, ${daName}, ${capexName}, ${deltaNwcName}`,
      location: `'Operating Forecast'!${letter}${forecastRows.ufcf}`,
    });

    previousRevenueName = revenueName;
    previousNwcValue = `${revenueName}*${nwcPctName}`;
  });
  styleSubTotal(forecastSheet, forecastRows.nopat, 1, 2 + inputs.years);
  styleTotal(forecastSheet, forecastRows.ufcf, 1, 2 + inputs.years);

  valuationSheet.getCell('A1').value = 'DCF Valuation';
  mergeAndCenter(valuationSheet, 'A1:I1');
  styleTitle(valuationSheet.getCell('A1'));
  styleSectionHeader(valuationSheet, 3, 'Valuation Summary', 4);
  valuationSheet.getCell('A4').value = 'PV of Explicit FCF';
  valuationSheet.getCell('A5').value = 'PV of Terminal Value';
  valuationSheet.getCell('A6').value = 'Enterprise Value';
  valuationSheet.getCell('A7').value = 'Net debt / (cash)';
  valuationSheet.getCell('A8').value = 'Equity Value';
  valuationSheet.getCell('A9').value = 'Value per Share';
  valuationSheet.getCell('A10').value = 'Current Share Price';
  ['A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'].forEach((ref) => styleLabel(valuationSheet.getCell(ref)));

  styleSectionHeader(valuationSheet, 12, 'Discounting Schedule', 2 + inputs.years);
  styleTableHeader(valuationSheet, 13, 1, 2 + inputs.years);
  valuationSheet.getCell('A13').value = 'Line Item';
  valuationSheet.getCell('B13').value = 'Units';
  forecastYears.forEach((year, index) => {
    valuationSheet.getCell(13, 3 + index).value = year;
  });
  const valRows = {
    ufcf: 14,
    period: 15,
    discountFactor: 16,
    pvFcf: 17,
    ebitda: 19,
    exitMultipleTv: 20,
    perpetuityTv: 21,
    selectedTv: 22,
    pvTv: 23,
  } as const;
  [
    [valRows.ufcf, 'Unlevered FCF'],
    [valRows.period, 'Discount period'],
    [valRows.discountFactor, 'Discount factor'],
    [valRows.pvFcf, 'PV of FCF'],
    [valRows.ebitda, 'EBITDA proxy'],
    [valRows.exitMultipleTv, 'Exit multiple TV'],
    [valRows.perpetuityTv, 'Perpetuity growth TV'],
    [valRows.selectedTv, 'Selected terminal value'],
    [valRows.pvTv, 'PV of terminal value'],
  ].forEach(([row, label]) => {
    valuationSheet.getCell(`A${row}`).value = label;
    styleLabel(valuationSheet.getCell(`A${row}`));
  });
  valuationSheet.getCell(`B${valRows.ufcf}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.period}`).value = 'Years';
  valuationSheet.getCell(`B${valRows.discountFactor}`).value = 'x';
  valuationSheet.getCell(`B${valRows.pvFcf}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.ebitda}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.exitMultipleTv}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.perpetuityTv}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.selectedTv}`).value = '$mm';
  valuationSheet.getCell(`B${valRows.pvTv}`).value = '$mm';

  forecastYears.forEach((year, index) => {
    const letter = col(3 + index);
    valuationSheet.getCell(`${letter}${valRows.ufcf}`).value = { formula: `=${yearName('UFCF', year)}` };
    valuationSheet.getCell(`${letter}${valRows.period}`).value = index + 1;
    valuationSheet.getCell(`${letter}${valRows.discountFactor}`).value = { formula: `=1/(1+WACC)^${index + 1}` };
    valuationSheet.getCell(`${letter}${valRows.pvFcf}`).value = { formula: `=${letter}${valRows.ufcf}*${letter}${valRows.discountFactor}` };
    valuationSheet.getCell(`${letter}${valRows.ebitda}`).value = { formula: `=${yearName('EBIT', year)}+${yearName('DA', year)}` };
    styleFormula(valuationSheet.getCell(`${letter}${valRows.ufcf}`), 'currency');
    styleFormula(valuationSheet.getCell(`${letter}${valRows.period}`), 'number');
    styleFormula(valuationSheet.getCell(`${letter}${valRows.discountFactor}`), 'multiple');
    styleFormula(valuationSheet.getCell(`${letter}${valRows.pvFcf}`), 'currency');
    styleFormula(valuationSheet.getCell(`${letter}${valRows.ebitda}`), 'currency');
  });

  const lastLetter = col(2 + inputs.years);
  valuationSheet.getCell(`C${valRows.exitMultipleTv}`).value = { formula: `=${lastLetter}${valRows.ebitda}*ExitMultiple` };
  valuationSheet.getCell(`C${valRows.perpetuityTv}`).value = { formula: `=(${yearName('UFCF', lastForecastYear)}*(1+TerminalGrowth))/(WACC-TerminalGrowth)` };
  valuationSheet.getCell(`C${valRows.selectedTv}`).value = {
    formula: `=IF(TerminalMethod="Exit Multiple",C${valRows.exitMultipleTv},C${valRows.perpetuityTv})`,
  };
  valuationSheet.getCell(`C${valRows.pvTv}`).value = { formula: `=C${valRows.selectedTv}*${lastLetter}${valRows.discountFactor}` };
  styleFormula(valuationSheet.getCell(`C${valRows.exitMultipleTv}`), 'currency');
  styleFormula(valuationSheet.getCell(`C${valRows.perpetuityTv}`), 'currency');
  styleOutput(valuationSheet.getCell(`C${valRows.selectedTv}`), 'currency');
  styleOutput(valuationSheet.getCell(`C${valRows.pvTv}`), 'currency');

  valuationSheet.getCell('B4').value = { formula: `=SUM(C${valRows.pvFcf}:${lastLetter}${valRows.pvFcf})` };
  valuationSheet.getCell('B5').value = { formula: `=C${valRows.pvTv}` };
  valuationSheet.getCell('B6').value = { formula: '=B4+B5' };
  valuationSheet.getCell('B7').value = { formula: '=DebtBalance-CashBalance' };
  valuationSheet.getCell('B8').value = { formula: '=B6-B7' };
  valuationSheet.getCell('B9').value = { formula: '=IF(SharesOutstanding>0,B8/SharesOutstanding,0)' };
  valuationSheet.getCell('B10').value = { formula: '=CurrentSharePrice' };
  styleOutput(valuationSheet.getCell('B4'), 'currency');
  styleOutput(valuationSheet.getCell('B5'), 'currency');
  styleTotal(valuationSheet, 6, 1, 2);
  styleFormula(valuationSheet.getCell('B7'), 'currency');
  styleTotal(valuationSheet, 8, 1, 2);
  styleOutput(valuationSheet.getCell('B9'), 'currency');
  styleFormula(valuationSheet.getCell('B10'), 'currency');

  defineNamedCells(workbook, valuationSheet, [
    { name: 'PVExplicitFCF', cellRef: 'B4' },
    { name: 'PVTerminalValue', cellRef: 'B5' },
    { name: 'EnterpriseValue', cellRef: 'B6' },
    { name: 'NetDebt', cellRef: 'B7' },
    { name: 'EquityValue', cellRef: 'B8' },
    { name: 'ImpliedSharePrice', cellRef: 'B9' },
  ]);

  styleSectionHeader(valuationSheet, 25, 'Value Driver Mix', 4);
  valuationSheet.getCell('A26').value = 'Explicit FCF as % EV';
  valuationSheet.getCell('B26').value = { formula: '=IF(EnterpriseValue<>0,PVExplicitFCF/EnterpriseValue,0)' };
  valuationSheet.getCell('A27').value = 'Terminal value as % EV';
  valuationSheet.getCell('B27').value = { formula: '=IF(EnterpriseValue<>0,PVTerminalValue/EnterpriseValue,0)' };
  valuationSheet.getCell('A28').value = 'Net debt as % EV';
  valuationSheet.getCell('B28').value = { formula: '=IF(EnterpriseValue<>0,NetDebt/EnterpriseValue,0)' };
  valuationSheet.getCell('A29').value = 'Equity value / EV';
  valuationSheet.getCell('B29').value = { formula: '=IF(EnterpriseValue<>0,EquityValue/EnterpriseValue,0)' };
  ['A26', 'A27', 'A28', 'A29'].forEach((ref) => styleLabel(valuationSheet.getCell(ref)));
  ['B26', 'B27', 'B28', 'B29'].forEach((ref) => styleOutput(valuationSheet.getCell(ref), 'percent'));
  styleThinGrid(valuationSheet, 26, 29, 1, 2);

  equations.push(
    {
      metric: 'Terminal value (perpetuity)',
      description: 'Terminal-year unlevered FCF grown by terminal growth and divided by the WACC spread.',
      excelFormula: `=(${yearName('UFCF', lastForecastYear)}*(1+TerminalGrowth))/(WACC-TerminalGrowth)`,
      dependencies: `${yearName('UFCF', lastForecastYear)}, TerminalGrowth, WACC`,
      location: `'DCF Valuation'!C21`,
    },
    {
      metric: 'Terminal value (exit multiple)',
      description: 'Terminal-year EBITDA multiplied by the assumed exit multiple.',
      excelFormula: `=${lastLetter}${valRows.ebitda}*ExitMultiple`,
      dependencies: `${lastLetter}${valRows.ebitda}, ExitMultiple`,
      location: `'DCF Valuation'!C20`,
    },
    {
      metric: 'Enterprise value',
      description: 'Present value of explicit forecast plus present value of terminal value.',
      excelFormula: '=PVExplicitFCF+PVTerminalValue',
      dependencies: 'PVExplicitFCF, PVTerminalValue',
      location: `'DCF Valuation'!B6`,
    }
  );

  sensitivitySheet.getCell('A1').value = 'Sensitivity';
  mergeAndCenter(sensitivitySheet, 'A1:H1');
  styleTitle(sensitivitySheet.getCell('A1'));

  styleSectionHeader(sensitivitySheet, 3, 'WACC vs Terminal Growth', 8);
  styleTableHeader(sensitivitySheet, 4, 1, 7);
  sensitivitySheet.getCell('A4').value = 'WACC \\ Terminal g';
  const waccAxis = buildAxis(inputs.wacc, 0.005, 5, 0.05);
  const growthAxis = buildAxis(inputs.terminalGrowth, 0.005, 5, 0);
  growthAxis.forEach((value, index) => {
    sensitivitySheet.getCell(4, 3 + index).value = value;
    styleInput(sensitivitySheet.getCell(4, 3 + index), 'percent');
  });
  waccAxis.forEach((value, rowIndex) => {
    const row = 5 + rowIndex;
    sensitivitySheet.getCell(`B${row}`).value = value;
    styleInput(sensitivitySheet.getCell(`B${row}`), 'percent');
    growthAxis.forEach((_, colIndex) => {
      const terminalRef = `${col(3 + colIndex)}$4`;
      const waccRef = `$B${row}`;
      const explicitPv = forecastYears
        .map((year, index) => `${yearName('UFCF', year)}/(1+${waccRef})^${index + 1}`)
        .join('+');
      sensitivitySheet.getCell(row, 3 + colIndex).value = {
        formula:
          `=IF(${terminalRef}>=${waccRef},"",((` +
          `${explicitPv})+((` +
          `${yearName('UFCF', lastForecastYear)}*(1+${terminalRef}))/(${waccRef}-${terminalRef})` +
          `)/(1+${waccRef})^${inputs.years}-(DebtBalance-CashBalance))/SharesOutstanding)`,
      };
      styleFormula(sensitivitySheet.getCell(row, 3 + colIndex), 'currency');
    });
  });

  styleSectionHeader(sensitivitySheet, 12, 'WACC vs Exit Multiple', 8);
  styleTableHeader(sensitivitySheet, 13, 1, 7);
  sensitivitySheet.getCell('A13').value = 'WACC \\ Exit multiple';
  const multipleAxis = [10, 12, 14, 16, 18];
  multipleAxis.forEach((value, index) => {
    sensitivitySheet.getCell(13, 3 + index).value = value;
    styleInput(sensitivitySheet.getCell(13, 3 + index), 'multiple');
  });
  waccAxis.forEach((value, rowIndex) => {
    const row = 14 + rowIndex;
    sensitivitySheet.getCell(`B${row}`).value = value;
    styleInput(sensitivitySheet.getCell(`B${row}`), 'percent');
    multipleAxis.forEach((_, colIndex) => {
      const multipleRef = `${col(3 + colIndex)}$13`;
      const waccRef = `$B${row}`;
      const explicitPv = forecastYears
        .map((year, index) => `${yearName('UFCF', year)}/(1+${waccRef})^${index + 1}`)
        .join('+');
      sensitivitySheet.getCell(row, 3 + colIndex).value = {
        formula:
          `=((` +
          `${explicitPv})+((${lastLetter}${valRows.ebitda}*${multipleRef})/(1+${waccRef})^${inputs.years})-(DebtBalance-CashBalance))/SharesOutstanding`,
      };
      styleFormula(sensitivitySheet.getCell(row, 3 + colIndex), 'currency');
    });
  });

  checksSheet.getCell('A1').value = 'Checks';
  mergeAndCenter(checksSheet, 'A1:D1');
  styleTitle(checksSheet.getCell('A1'));
  styleTableHeader(checksSheet, 3, 1, 3);
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Result';
  checksSheet.getCell('C3').value = 'Commentary';
  writeCheckRow(checksSheet, 4, 'Terminal growth < WACC', 'IF(TerminalGrowth<WACC,"PASS","FLAG")', 'Perpetuity growth must remain below WACC.');
  writeCheckRow(checksSheet, 5, 'FCF is populated', `IF(COUNTA('Operating Forecast'!C14:${lastLetter}14)=${inputs.years},"PASS","FLAG")`, 'All forecast FCF cells should be populated.');
  writeCheckRow(checksSheet, 6, 'Sensitivity tables generated', 'IF(COUNTA(Sensitivity!C5:G9)+COUNTA(Sensitivity!C14:G18)=50,"PASS","FLAG")', 'Both sensitivity tables should be fully populated.');
  writeCheckRow(checksSheet, 7, 'Value per share available', 'IF(AND(SharesOutstanding>0,ImpliedSharePrice>0),"PASS","FLAG")', 'Share price requires a positive share count and valuation.');
  styleThinGrid(checksSheet, 4, 7, 1, 3);
  finalizeChecksSheet(checksSheet, 4, 7);

  addEquationsSheet(workbook, `${inputs.companyName} DCF`, equations);

  return workbook;
}

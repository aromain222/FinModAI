import ExcelJS from 'exceljs';
import type { DcfSpec } from '@/lib/modeling/dcfSpec';

type BaseCaseResult = {
  revenue: number[];
  ebitMargin: number[];
  ebit: number[];
  nopat: number[];
  da: number[];
  capex: number[];
  deltaNwc: number[];
  fcff: number[];
  discountFactors: number[];
  pvFcff: number[];
  stagePv: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
};

function col(n: number): string {
  let x = n;
  let out = '';
  while (x > 0) {
    const rem = (x - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    x = Math.floor((x - 1) / 26);
  }
  return out;
}

function applySheetScaffold(sheet: ExcelJS.Worksheet): void {
  sheet.properties.defaultRowHeight = 20;
  sheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 2, showGridLines: false }];
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 20;
  for (let i = 3; i <= 24; i += 1) sheet.getColumn(i).width = 14;
  sheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    orientation: 'landscape',
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
}

function styleTitle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F3A56' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF1F3A56' } },
    left: { style: 'thin', color: { argb: 'FF1F3A56' } },
    bottom: { style: 'thin', color: { argb: 'FF1F3A56' } },
    right: { style: 'thin', color: { argb: 'FF1F3A56' } },
  };
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNum: number, fromCol: number, toCol: number): void {
  for (let c = fromCol; c <= toCol; c += 1) {
    const cell = sheet.getCell(rowNum, c);
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
}

function styleBodyGrid(sheet: ExcelJS.Worksheet, rowStart: number, rowEnd: number, colStart: number, colEnd: number): void {
  for (let r = rowStart; r <= rowEnd; r += 1) {
    for (let c = colStart; c <= colEnd; c += 1) {
      const cell = sheet.getCell(r, c);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    }
  }
}

function styleSectionHeader(sheet: ExcelJS.Worksheet, rowNum: number, title: string, toCol: number): void {
  sheet.mergeCells(rowNum, 1, rowNum, toCol);
  const cell = sheet.getCell(rowNum, 1);
  cell.value = title;
  cell.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
  sheet.getRow(rowNum).height = 22;
}

function styleLabelCell(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: 'FF1F2937' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  };
}

function styleInputCell(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: 'FF0F172A' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0F2FE' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFBAE6FD' } },
    left: { style: 'thin', color: { argb: 'FFBAE6FD' } },
    bottom: { style: 'thin', color: { argb: 'FFBAE6FD' } },
    right: { style: 'thin', color: { argb: 'FFBAE6FD' } },
  };
}

function styleFormulaCell(cell: ExcelJS.Cell): void {
  cell.font = { color: { argb: 'FF111827' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  };
}

function styleOutputCell(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: 'FF052E16' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCFCE7' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF86EFAC' } },
    left: { style: 'thin', color: { argb: 'FF86EFAC' } },
    bottom: { style: 'thin', color: { argb: 'FF86EFAC' } },
    right: { style: 'thin', color: { argb: 'FF86EFAC' } },
  };
}

function applyTitleBand(sheet: ExcelJS.Worksheet, title: string, toCol: number): void {
  sheet.mergeCells(1, 1, 1, toCol);
  sheet.getRow(1).height = 26;
  sheet.getCell(1, 1).value = title;
  styleTitle(sheet.getCell(1, 1));
}

function fmtCurrency(cell: ExcelJS.Cell): void {
  cell.numFmt = '$#,##0.00';
}

function fmtPercent(cell: ExcelJS.Cell): void {
  cell.numFmt = '0.00%';
}

function fmtMultiple(cell: ExcelJS.Cell): void {
  cell.numFmt = '0.00x';
}

function computeBaseCase(spec: DcfSpec): BaseCaseResult {
  const years = spec.periods.years;
  const revenue: number[] = [];
  const ebitMargin: number[] = [];
  const ebit: number[] = [];
  const nopat: number[] = [];
  const da: number[] = [];
  const capex: number[] = [];
  const deltaNwc: number[] = [];
  const fcff: number[] = [];

  let prevRevenue = spec.base_year.revenue;

  for (let i = 0; i < years; i += 1) {
    const rev = prevRevenue * (1 + spec.forecast.revenue_growth[i]);
    const e = rev * spec.forecast.ebit_margin[i];
    const nop = e * (1 - spec.forecast.tax_rate);
    const dep = rev * spec.forecast.da_pct_rev;
    const cap = rev * spec.forecast.capex_pct_rev;
    const dNwc = rev * spec.forecast.nwc_pct_rev;
    const f = nop + dep - cap - dNwc;

    revenue.push(rev);
    ebitMargin.push(spec.forecast.ebit_margin[i]);
    ebit.push(e);
    nopat.push(nop);
    da.push(dep);
    capex.push(cap);
    deltaNwc.push(dNwc);
    fcff.push(f);
    prevRevenue = rev;
  }

  const discountFactors = fcff.map((_, i) => 1 / Math.pow(1 + spec.valuation.wacc, i + 1));
  const pvFcff = fcff.map((value, i) => value * discountFactors[i]);
  const stagePv = pvFcff.reduce((acc, value) => acc + value, 0);

  let terminalValue: number;
  if (spec.valuation.terminal.method === 'gordon') {
    terminalValue = (fcff[years - 1] * (1 + spec.valuation.terminal.g)) / (spec.valuation.wacc - spec.valuation.terminal.g);
  } else {
    terminalValue = ebit[years - 1] * spec.valuation.terminal.exit_multiple;
  }

  const pvTerminalValue = terminalValue * discountFactors[years - 1];
  const enterpriseValue = stagePv + pvTerminalValue;

  return {
    revenue,
    ebitMargin,
    ebit,
    nopat,
    da,
    capex,
    deltaNwc,
    fcff,
    discountFactors,
    pvFcff,
    stagePv,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
  };
}

function buildAssumptionsSheet(workbook: ExcelJS.Workbook, spec: DcfSpec): void {
  const sheet = workbook.addWorksheet('Assumptions');
  applySheetScaffold(sheet);

  const years = spec.periods.years;
  const firstYearCol = 3;

  applyTitleBand(sheet, 'CapitalBase DCF Model — Assumptions', firstYearCol + years - 1);
  styleSectionHeader(sheet, 3, 'Company Setup', 2);

  sheet.getCell('A4').value = 'Company Name';
  sheet.getCell('B4').value = spec.company.name;
  sheet.getCell('A5').value = 'Ticker';
  sheet.getCell('B5').value = spec.company.ticker || 'N/A';
  sheet.getCell('A6').value = 'Currency';
  sheet.getCell('B6').value = spec.company.currency;

  styleSectionHeader(sheet, 8, 'Forecast Setup', 2);
  sheet.getCell('A9').value = 'Start Year';
  sheet.getCell('B9').value = spec.periods.start_year;
  sheet.getCell('A10').value = 'Forecast Years';
  sheet.getCell('B10').value = years;

  styleSectionHeader(sheet, 12, 'Operating Assumptions', 2);
  sheet.getCell('A13').value = 'Base Year Revenue';
  sheet.getCell('B13').value = spec.base_year.revenue;
  fmtCurrency(sheet.getCell('B13'));

  sheet.getCell('A14').value = 'Base Year EBIT Margin';
  sheet.getCell('B14').value = spec.base_year.ebit_margin;
  fmtPercent(sheet.getCell('B14'));

  sheet.getCell('A16').value = 'Tax Rate';
  sheet.getCell('B16').value = spec.forecast.tax_rate;
  fmtPercent(sheet.getCell('B16'));

  sheet.getCell('A17').value = 'D&A % Revenue';
  sheet.getCell('B17').value = spec.forecast.da_pct_rev;
  fmtPercent(sheet.getCell('B17'));

  sheet.getCell('A18').value = 'Capex % Revenue';
  sheet.getCell('B18').value = spec.forecast.capex_pct_rev;
  fmtPercent(sheet.getCell('B18'));

  sheet.getCell('A19').value = 'NWC % Revenue';
  sheet.getCell('B19').value = spec.forecast.nwc_pct_rev;
  fmtPercent(sheet.getCell('B19'));

  styleSectionHeader(sheet, 21, 'Valuation Assumptions', 2);
  sheet.getCell('A22').value = 'WACC';
  sheet.getCell('B22').value = spec.valuation.wacc;
  fmtPercent(sheet.getCell('B22'));

  sheet.getCell('A23').value = 'Terminal Method';
  sheet.getCell('B23').value = spec.valuation.terminal.method;

  sheet.getCell('A24').value = 'Terminal g';
  sheet.getCell('B24').value = spec.valuation.terminal.method === 'gordon' ? spec.valuation.terminal.g : null;
  fmtPercent(sheet.getCell('B24'));

  sheet.getCell('A25').value = 'Exit Multiple';
  sheet.getCell('B25').value = spec.valuation.terminal.method === 'exit_multiple' ? spec.valuation.terminal.exit_multiple : null;
  fmtMultiple(sheet.getCell('B25'));

  styleSectionHeader(sheet, 28, 'Forecast Path', firstYearCol + years - 1);

  sheet.getCell('A29').value = 'Metric';
  sheet.getCell('A30').value = 'Revenue Growth';
  sheet.getCell('A34').value = 'EBIT Margin';

  for (let i = 0; i < years; i += 1) {
    const c = firstYearCol + i;
    const y = spec.periods.start_year + i + 1;

    sheet.getCell(29, c).value = y;
    sheet.getCell(30, c).value = spec.forecast.revenue_growth[i];
    fmtPercent(sheet.getCell(30, c));

    sheet.getCell(34, c).value = spec.forecast.ebit_margin[i];
    fmtPercent(sheet.getCell(34, c));
  }

  styleSectionHeader(sheet, 38, 'Sensitivity Inputs', firstYearCol + years - 1);
  sheet.getCell('A39').value = 'WACC Range';

  spec.outputs.sensitivity.wacc.forEach((value, i) => {
    const c = firstYearCol + i;
    sheet.getCell(39, c).value = value;
    fmtPercent(sheet.getCell(39, c));
  });

  if (spec.valuation.terminal.method === 'gordon') {
    sheet.getCell('A42').value = 'Terminal g Range';
    (spec.outputs.sensitivity.terminal_g || []).forEach((value, i) => {
      const c = firstYearCol + i;
      sheet.getCell(42, c).value = value;
      fmtPercent(sheet.getCell(42, c));
    });
  } else {
    sheet.getCell('A42').value = 'Exit Multiple Range';
    (spec.outputs.sensitivity.exit_multiple || []).forEach((value, i) => {
      const c = firstYearCol + i;
      sheet.getCell(42, c).value = value;
      fmtMultiple(sheet.getCell(42, c));
    });
  }

  const labelRows = [4, 5, 6, 9, 10, 13, 14, 16, 17, 18, 19, 22, 23, 24, 25, 30, 34, 39, 42];
  labelRows.forEach((row) => styleLabelCell(sheet.getCell(row, 1)));
  [4, 5, 6, 9, 10, 13, 14, 16, 17, 18, 19, 22, 23, 24, 25].forEach((row) => styleInputCell(sheet.getCell(row, 2)));
  styleHeaderRow(sheet, 29, 1, firstYearCol + years - 1);
  styleBodyGrid(sheet, 30, 34, 1, firstYearCol + years - 1);
  styleBodyGrid(sheet, 39, 39, 1, firstYearCol + Math.max(spec.outputs.sensitivity.wacc.length - 1, 0));
  styleBodyGrid(sheet, 42, 42, 1, firstYearCol + Math.max((spec.valuation.terminal.method === 'gordon' ? (spec.outputs.sensitivity.terminal_g || []).length : (spec.outputs.sensitivity.exit_multiple || []).length) - 1, 0));
  for (let c = firstYearCol; c < firstYearCol + years; c += 1) {
    styleInputCell(sheet.getCell(30, c));
    styleInputCell(sheet.getCell(34, c));
  }
  for (let c = firstYearCol; c < firstYearCol + spec.outputs.sensitivity.wacc.length; c += 1) {
    styleInputCell(sheet.getCell(39, c));
  }
  const terminalInputLength = spec.valuation.terminal.method === 'gordon'
    ? (spec.outputs.sensitivity.terminal_g || []).length
    : (spec.outputs.sensitivity.exit_multiple || []).length;
  for (let c = firstYearCol; c < firstYearCol + terminalInputLength; c += 1) {
    styleInputCell(sheet.getCell(42, c));
  }
}

function buildForecastSheet(workbook: ExcelJS.Workbook, spec: DcfSpec, baseCase: BaseCaseResult): void {
  const sheet = workbook.addWorksheet('Forecast');
  applySheetScaffold(sheet);

  const years = spec.periods.years;
  const firstYearCol = 3;

  applyTitleBand(sheet, 'Forecast', firstYearCol + years - 1);

  sheet.getCell('A3').value = 'Metric';
  sheet.getCell('A4').value = 'Revenue';
  sheet.getCell('A5').value = 'EBIT Margin';
  sheet.getCell('A6').value = 'EBIT';
  sheet.getCell('A7').value = 'Tax Rate';
  sheet.getCell('A8').value = 'NOPAT';

  for (let i = 0; i < years; i += 1) {
    const c = firstYearCol + i;
    const cLetter = col(c);
    const prevCLetter = col(c - 1);

    sheet.getCell(3, c).value = spec.periods.start_year + i + 1;

    if (i === 0) {
      sheet.getCell(4, c).value = {
        formula: `Assumptions!$B$13*(1+Assumptions!${cLetter}30)`,
        result: baseCase.revenue[i],
      };
    } else {
      sheet.getCell(4, c).value = {
        formula: `${prevCLetter}4*(1+Assumptions!${cLetter}30)`,
        result: baseCase.revenue[i],
      };
    }

    sheet.getCell(5, c).value = { formula: `Assumptions!${cLetter}34`, result: baseCase.ebitMargin[i] };
    sheet.getCell(6, c).value = { formula: `${cLetter}4*${cLetter}5`, result: baseCase.ebit[i] };
    sheet.getCell(7, c).value = { formula: 'Assumptions!$B$16', result: spec.forecast.tax_rate };
    sheet.getCell(8, c).value = { formula: `${cLetter}6*(1-${cLetter}7)`, result: baseCase.nopat[i] };

    fmtCurrency(sheet.getCell(4, c));
    fmtPercent(sheet.getCell(5, c));
    fmtCurrency(sheet.getCell(6, c));
    fmtPercent(sheet.getCell(7, c));
    fmtCurrency(sheet.getCell(8, c));
  }

  styleHeaderRow(sheet, 3, 1, firstYearCol + years - 1);
  styleBodyGrid(sheet, 4, 8, 1, firstYearCol + years - 1);
  [4, 5, 6, 7, 8].forEach((row) => styleLabelCell(sheet.getCell(row, 1)));
  for (let r = 4; r <= 8; r += 1) {
    for (let c = firstYearCol; c <= firstYearCol + years - 1; c += 1) {
      styleFormulaCell(sheet.getCell(r, c));
    }
  }
}

function buildFcffSheet(workbook: ExcelJS.Workbook, spec: DcfSpec, baseCase: BaseCaseResult): void {
  const sheet = workbook.addWorksheet('FCFF');
  applySheetScaffold(sheet);

  const years = spec.periods.years;
  const firstYearCol = 3;

  applyTitleBand(sheet, 'FCFF', firstYearCol + years - 1);

  sheet.getCell('A3').value = 'Metric';
  sheet.getCell('A4').value = 'EBIT';
  sheet.getCell('A5').value = 'NOPAT';
  sheet.getCell('A6').value = 'D&A';
  sheet.getCell('A7').value = 'Capex';
  sheet.getCell('A8').value = 'ΔNWC';
  sheet.getCell('A9').value = 'FCFF';

  for (let i = 0; i < years; i += 1) {
    const c = firstYearCol + i;
    const cLetter = col(c);

    sheet.getCell(3, c).value = spec.periods.start_year + i + 1;
    sheet.getCell(4, c).value = { formula: `Forecast!${cLetter}6`, result: baseCase.ebit[i] };
    sheet.getCell(5, c).value = { formula: `Forecast!${cLetter}8`, result: baseCase.nopat[i] };
    sheet.getCell(6, c).value = { formula: `Forecast!${cLetter}4*Assumptions!$B$17`, result: baseCase.da[i] };
    sheet.getCell(7, c).value = { formula: `Forecast!${cLetter}4*Assumptions!$B$18`, result: baseCase.capex[i] };
    sheet.getCell(8, c).value = { formula: `Forecast!${cLetter}4*Assumptions!$B$19`, result: baseCase.deltaNwc[i] };

    // Required explicit FCFF formula: EBIT*(1-tax)+D&A-Capex-ΔNWC
    sheet.getCell(9, c).value = {
      formula: `${cLetter}4*(1-Assumptions!$B$16)+${cLetter}6-${cLetter}7-${cLetter}8`,
      result: baseCase.fcff[i],
    };
    fmtCurrency(sheet.getCell(4, c));
    fmtCurrency(sheet.getCell(5, c));
    fmtCurrency(sheet.getCell(6, c));
    fmtCurrency(sheet.getCell(7, c));
    fmtCurrency(sheet.getCell(8, c));
    fmtCurrency(sheet.getCell(9, c));
  }

  styleHeaderRow(sheet, 3, 1, firstYearCol + years - 1);
  styleBodyGrid(sheet, 4, 9, 1, firstYearCol + years - 1);
  [4, 5, 6, 7, 8, 9].forEach((row) => styleLabelCell(sheet.getCell(row, 1)));
  for (let r = 4; r <= 8; r += 1) {
    for (let c = firstYearCol; c <= firstYearCol + years - 1; c += 1) {
      styleFormulaCell(sheet.getCell(r, c));
    }
  }
  for (let c = firstYearCol; c <= firstYearCol + years - 1; c += 1) {
    styleOutputCell(sheet.getCell(9, c));
  }
}

function buildDcfSheet(workbook: ExcelJS.Workbook, spec: DcfSpec, baseCase: BaseCaseResult): void {
  const sheet = workbook.addWorksheet('DCF');
  applySheetScaffold(sheet);

  const years = spec.periods.years;
  const firstYearCol = 3;
  const lastCol = firstYearCol + years - 1;
  const lastColLetter = col(lastCol);

  applyTitleBand(sheet, 'DCF Valuation', lastCol);

  sheet.getCell('A3').value = 'Metric';
  sheet.getCell('A4').value = 'FCFF';
  sheet.getCell('A5').value = 'Discount Factor';
  sheet.getCell('A6').value = 'PV of FCFF';

  for (let i = 0; i < years; i += 1) {
    const c = firstYearCol + i;
    const cLetter = col(c);
    const yearNum = i + 1;

    sheet.getCell(3, c).value = spec.periods.start_year + yearNum;
    sheet.getCell(4, c).value = { formula: `FCFF!${cLetter}9`, result: baseCase.fcff[i] };
    sheet.getCell(5, c).value = { formula: `1/(1+Assumptions!$B$22)^${yearNum}`, result: baseCase.discountFactors[i] };
    sheet.getCell(6, c).value = { formula: `${cLetter}4*${cLetter}5`, result: baseCase.pvFcff[i] };

    fmtCurrency(sheet.getCell(4, c));
    sheet.getCell(5, c).numFmt = '0.0000';
    fmtCurrency(sheet.getCell(6, c));
  }

  sheet.getCell('A8').value = 'PV of Stage-1 FCFF';
  sheet.getCell('B8').value = { formula: `SUM(${col(firstYearCol)}6:${lastColLetter}6)`, result: baseCase.stagePv };
  fmtCurrency(sheet.getCell('B8'));

  sheet.getCell('A9').value = 'Terminal Value';
  sheet.getCell('B9').value = {
    formula: `IF(Assumptions!$B$23="gordon",(FCFF!${lastColLetter}9*(1+Assumptions!$B$24))/(Assumptions!$B$22-Assumptions!$B$24),Forecast!${lastColLetter}6*Assumptions!$B$25)`,
    result: baseCase.terminalValue,
  };
  fmtCurrency(sheet.getCell('B9'));

  sheet.getCell('A10').value = 'PV of Terminal Value';
  sheet.getCell('B10').value = { formula: `B9*${lastColLetter}5`, result: baseCase.pvTerminalValue };
  fmtCurrency(sheet.getCell('B10'));

  sheet.getCell('A11').value = 'Enterprise Value';
  sheet.getCell('B11').value = { formula: 'B8+B10', result: baseCase.enterpriseValue };
  fmtCurrency(sheet.getCell('B11'));
  styleHeaderRow(sheet, 3, 1, lastCol);
  styleBodyGrid(sheet, 4, 6, 1, lastCol);
  styleBodyGrid(sheet, 8, 11, 1, 2);
  [4, 5, 6, 8, 9, 10, 11].forEach((row) => styleLabelCell(sheet.getCell(row, 1)));
  for (let r = 4; r <= 6; r += 1) {
    for (let c = firstYearCol; c <= lastCol; c += 1) {
      styleFormulaCell(sheet.getCell(r, c));
    }
  }
  [8, 9, 10, 11].forEach((row) => styleOutputCell(sheet.getCell(row, 2)));
}

function buildSensitivityEnterpriseValue(spec: DcfSpec, wacc: number, terminalValueAssumption: number): number {
  const altSpec: DcfSpec = {
    ...spec,
    valuation: {
      ...spec.valuation,
      wacc,
      terminal:
        spec.valuation.terminal.method === 'gordon'
          ? { method: 'gordon', g: terminalValueAssumption }
          : { method: 'exit_multiple', exit_multiple: terminalValueAssumption },
    },
  };

  return computeBaseCase(altSpec).enterpriseValue;
}

function buildSensitivitySheet(workbook: ExcelJS.Workbook, spec: DcfSpec, baseCase: BaseCaseResult): void {
  const sheet = workbook.addWorksheet('Sensitivity');
  applySheetScaffold(sheet);

  const years = spec.periods.years;
  const fcffFirstCol = 3;
  const fcffLastCol = fcffFirstCol + years - 1;
  const fcffLastColLetter = col(fcffLastCol);

  const waccAxis = spec.outputs.sensitivity.wacc;
  const terminalAxis =
    spec.valuation.terminal.method === 'gordon'
      ? spec.outputs.sensitivity.terminal_g || []
      : spec.outputs.sensitivity.exit_multiple || [];

  const startRow = 5;
  const startCol = 3;
  const endCol = startCol + Math.max(terminalAxis.length - 1, 0);

  applyTitleBand(sheet, 'Sensitivity (Implied Enterprise Value)', endCol >= startCol ? endCol : startCol + 2);

  sheet.getCell(startRow, 1).value =
    spec.valuation.terminal.method === 'gordon' ? 'WACC \\ Terminal g' : 'WACC \\ Exit Multiple';

  terminalAxis.forEach((value, idx) => {
    const c = startCol + idx;
    sheet.getCell(startRow, c).value = value;
    if (spec.valuation.terminal.method === 'gordon') fmtPercent(sheet.getCell(startRow, c));
    else fmtMultiple(sheet.getCell(startRow, c));
  });

  const discountedFcffSumFormula = (waccCell: string): string =>
    Array.from({ length: years }, (_, i) => {
      const yearCol = col(fcffFirstCol + i);
      return `(FCFF!$${yearCol}$9/(1+${waccCell})^${i + 1})`;
    }).join('+');

  waccAxis.forEach((wacc, rowIdx) => {
    const r = startRow + 1 + rowIdx;
    sheet.getCell(r, 2).value = wacc;
    fmtPercent(sheet.getCell(r, 2));

    terminalAxis.forEach((_, colIdx) => {
      const c = startCol + colIdx;
      const cLetter = col(c);
      const waccCell = `$B${r}`;
      const terminalCell = `${cLetter}$5`;

      if (spec.valuation.terminal.method === 'gordon') {
        sheet.getCell(r, c).value = {
          formula:
            `${discountedFcffSumFormula(waccCell)}+` +
            `((FCFF!$${fcffLastColLetter}$9*(1+${terminalCell}))/(${waccCell}-${terminalCell}))/(1+${waccCell})^${years}`,
          result: buildSensitivityEnterpriseValue(spec, wacc, terminalAxis[colIdx]),
        };
      } else {
        sheet.getCell(r, c).value = {
          formula:
            `${discountedFcffSumFormula(waccCell)}+` +
            `((Forecast!$${fcffLastColLetter}$6*${terminalCell})/(1+${waccCell})^${years})`,
          result: buildSensitivityEnterpriseValue(spec, wacc, terminalAxis[colIdx]),
        };
      }
      fmtCurrency(sheet.getCell(r, c));
    });
  });

  const endRow = startRow + waccAxis.length;

  styleHeaderRow(sheet, startRow, 1, endCol);
  styleBodyGrid(sheet, startRow + 1, endRow, 2, endCol);
  styleLabelCell(sheet.getCell(startRow, 1));
  for (let r = startRow + 1; r <= endRow; r += 1) {
    styleInputCell(sheet.getCell(r, 2));
    for (let c = startCol; c <= endCol; c += 1) {
      styleOutputCell(sheet.getCell(r, c));
    }
  }

  sheet.getCell(endRow + 2, 1).value = 'Base Case EV';
  sheet.getCell(endRow + 2, 2).value = { formula: 'DCF!B11', result: baseCase.enterpriseValue };
  fmtCurrency(sheet.getCell(endRow + 2, 2));
  styleLabelCell(sheet.getCell(endRow + 2, 1));
  styleOutputCell(sheet.getCell(endRow + 2, 2));
}

export function evaluateDcfSpec(spec: DcfSpec): BaseCaseResult {
  return computeBaseCase(spec);
}

export async function buildDcfWorkbook(spec: DcfSpec): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  (workbook.calcProperties as ExcelJS.Workbook['calcProperties'] & { forceFullCalc?: boolean }).forceFullCalc = true;
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  const baseCase = computeBaseCase(spec);

  buildAssumptionsSheet(workbook, spec);
  buildForecastSheet(workbook, spec, baseCase);
  buildFcffSheet(workbook, spec, baseCase);
  buildDcfSheet(workbook, spec, baseCase);
  buildSensitivitySheet(workbook, spec, baseCase);

  return workbook;
}

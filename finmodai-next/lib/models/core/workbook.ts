import type ExcelJS from 'exceljs';

const COLORS = {
  ink: 'FF0F172A',
  slate: 'FF334155',
  white: 'FFFFFFFF',
  titleFill: 'FFEFF4FA',
  headerFill: 'FF31475E',
  headerBorder: 'FFCBD5E1',
  gridBorder: 'FFE2E8F0',
  inputFill: 'FFFFF7CC',
  inputFont: 'FF1D4ED8',
  outputFill: 'FFF8FAFC',
  noteFill: 'FFF8FAFC',
  noteFont: 'FF64748B',
};

export function applyWorksheetChrome(
  sheet: ExcelJS.Worksheet,
  options?: { tabColor?: string }
): void {
  sheet.properties.showGridLines = false;
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
  if (options?.tabColor) {
    sheet.properties.tabColor = { argb: options.tabColor };
  }
}

export function addSheetTitle(
  sheet: ExcelJS.Worksheet,
  title: string,
  endCol: number,
  subtitle?: string
): void {
  sheet.mergeCells(1, 1, 1, endCol);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: COLORS.ink } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.titleFill },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  titleCell.border = {
    top: { style: 'thin', color: { argb: COLORS.headerBorder } },
    bottom: { style: 'medium', color: { argb: COLORS.slate } },
  };
  sheet.getRow(1).height = 24;

  if (subtitle) {
    sheet.mergeCells(2, 1, 2, endCol);
    const subtitleCell = sheet.getCell(2, 1);
    subtitleCell.value = subtitle;
    subtitleCell.font = { name: 'Aptos', size: 10, italic: true, color: { argb: COLORS.noteFont } };
    subtitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.noteFill },
    };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    subtitleCell.border = {
      bottom: { style: 'thin', color: { argb: COLORS.gridBorder } },
    };
    sheet.getRow(2).height = 18;
  }
}

export function styleHeaderRow(sheet: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number): void {
  for (let c = fromCol; c <= toCol; c += 1) {
    const cell = sheet.getCell(row, c);
    cell.font = { name: 'Aptos', bold: true, color: { argb: COLORS.white } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.headerFill },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.headerBorder } },
      left: { style: 'thin', color: { argb: COLORS.headerBorder } },
      bottom: { style: 'medium', color: { argb: COLORS.slate } },
      right: { style: 'thin', color: { argb: COLORS.headerBorder } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  sheet.getRow(row).height = 20;
}

export function styleGrid(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, startCol: number, endCol: number): void {
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      const cell = sheet.getCell(r, c);
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.gridBorder } },
        left: { style: c === startCol ? 'thin' : 'hair', color: { argb: COLORS.gridBorder } },
        bottom: { style: 'thin', color: { argb: COLORS.gridBorder } },
        right: { style: c === endCol ? 'thin' : 'hair', color: { argb: COLORS.gridBorder } },
      };
      if (!cell.font) {
        cell.font = { name: 'Aptos', size: 10, color: { argb: COLORS.ink } };
      }
    }
    sheet.getRow(r).height = Math.max(sheet.getRow(r).height || 0, 18);
  }
}

export function setInputCell(cell: ExcelJS.Cell): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.inputFill },
  };
  cell.font = { name: 'Aptos', size: 10, color: { argb: COLORS.inputFont }, bold: true };
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.headerBorder } },
    left: { style: 'thin', color: { argb: COLORS.headerBorder } },
    bottom: { style: 'thin', color: { argb: COLORS.headerBorder } },
    right: { style: 'thin', color: { argb: COLORS.headerBorder } },
  };
  cell.protection = { locked: false };
}

export function setOutputCell(cell: ExcelJS.Cell): void {
  if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.outputFill },
    };
  }
  cell.font = {
    name: 'Aptos',
    size: 10,
    color: { argb: COLORS.ink },
    bold: typeof cell.value === 'number',
  };
  cell.protection = { locked: true };
}

export function setFormulaCell(cell: ExcelJS.Cell, formula: string, result?: number | string | boolean | Date | null): void {
  cell.value = {
    formula,
    result: result ?? undefined,
  } as ExcelJS.CellValue;
  setOutputCell(cell);
}

export function setCurrency(cell: ExcelJS.Cell): void {
  cell.numFmt = '$#,##0.0_);[Red]($#,##0.0)';
}

export function setPercent(cell: ExcelJS.Cell): void {
  cell.numFmt = '0.0%;[Red](0.0%)';
}

export function setDate(cell: ExcelJS.Cell): void {
  cell.numFmt = 'mmm-yy';
}

export function configureWorkbookForRecalc(workbook: ExcelJS.Workbook): void {
  workbook.calcProperties.fullCalcOnLoad = true;
  (workbook.calcProperties as ExcelJS.Workbook['calcProperties'] & { forceFullCalc?: boolean }).forceFullCalc = true;
}

export function columnLetter(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export async function protectSheetIfConfigured(sheet: ExcelJS.Worksheet): Promise<void> {
  const password = process.env.TEMPLATE_PROTECT_PASSWORD;
  // Even without a configured password, protect the sheet so locked vs unlocked cells are enforced.
  await sheet.protect(password ?? '', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });
}

import type ExcelJS from 'exceljs';

export function styleHeaderRow(sheet: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number): void {
  for (let c = fromCol; c <= toCol; c += 1) {
    const cell = sheet.getCell(row, c);
    cell.font = { bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
}

export function styleGrid(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, startCol: number, endCol: number): void {
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      const cell = sheet.getCell(r, c);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    }
  }
}

export function setInputCell(cell: ExcelJS.Cell): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF9C3' },
  };
  cell.protection = { locked: false };
}

export function setOutputCell(cell: ExcelJS.Cell): void {
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
  cell.numFmt = '$#,##0.00;($#,##0.00)';
}

export function setPercent(cell: ExcelJS.Cell): void {
  cell.numFmt = '0.00%';
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

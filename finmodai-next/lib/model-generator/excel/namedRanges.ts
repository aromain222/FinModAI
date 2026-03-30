import ExcelJS from 'exceljs';

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_.]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function toAbsoluteReference(cellRef: string): string {
  return cellRef
    .split(':')
    .map((segment) => {
      const match = segment.match(/^([A-Z]+)(\d+)$/i);
      if (!match) return segment;
      return `$${match[1].toUpperCase()}$${match[2]}`;
    })
    .join(':');
}

export function defineNamedRange(
  workbook: ExcelJS.Workbook,
  name: string,
  sheetName: string,
  cellRef: string
) {
  workbook.definedNames.add(`'${sheetName}'!${toAbsoluteReference(cellRef)}`, sanitizeName(name));
}

export function defineNamedCell(workbook: ExcelJS.Workbook, name: string, sheet: ExcelJS.Worksheet, cellRef: string) {
  workbook.definedNames.add(`'${sheet.name}'!${toAbsoluteReference(cellRef)}`, sanitizeName(name));
}

export function defineNamedCells(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  cells: Array<{ name: string; cellRef: string }>
) {
  cells.forEach(({ name, cellRef }) => defineNamedCell(workbook, name, sheet, cellRef));
}

import ExcelJS from 'exceljs';
import { WORKBOOK_FONT_NAME, sanitizeWorkbookText } from '@/lib/excel/workbookText';

const COLORS = {
  ink: 'FF0F172A',
  slate: 'FF526072',
  grid: 'FFD9E2EC',
  headerBg: 'FFEFF3F8',
  titleBg: 'FF10243E',
  titleSubBg: 'FFF4F7FB',
  inputBg: 'FFDCEBFF',
  formulaBg: 'FFFAFBFC',
  outputBg: 'FFE7F4EC',
  checkBg: 'FFFFF4D6',
  passBg: 'FFDCFCE7',
  failBg: 'FFFEE2E2',
  accent: 'FF0F766E',
  accentSoft: 'FFE5F3EF',
  danger: 'FFB91C1C',
} as const;

type CellKind = 'currency' | 'percent' | 'number' | 'multiple' | 'text';

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.grid } },
    bottom: { style: 'thin', color: { argb: COLORS.grid } },
    left: { style: 'thin', color: { argb: COLORS.grid } },
    right: { style: 'thin', color: { argb: COLORS.grid } },
  };
}

function ensureFontName(font?: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> {
  return { ...(font ?? {}), name: WORKBOOK_FONT_NAME };
}

function sanitizeCellValue(value: ExcelJS.CellValue): ExcelJS.CellValue {
  if (typeof value === 'string') return sanitizeWorkbookText(value);
  if (!value || typeof value !== 'object') return value;

  if ('richText' in value && Array.isArray(value.richText)) {
    return {
      ...value,
      richText: value.richText.map((segment) => ({
        ...segment,
        text: sanitizeWorkbookText(segment.text ?? ''),
        font: ensureFontName(segment.font),
      })),
    };
  }

  if ('text' in value && typeof value.text === 'string') {
    return {
      ...value,
      text: sanitizeWorkbookText(value.text),
    };
  }

  if ('result' in value && typeof value.result === 'string') {
    return {
      ...value,
      result: sanitizeWorkbookText(value.result),
    };
  }

  return value;
}

function sanitizeCellNote(note: ExcelJS.Comment | string | undefined): ExcelJS.Comment | string | undefined {
  if (!note) return note;
  if (typeof note === 'string') return sanitizeWorkbookText(note);
  if (Array.isArray(note.texts)) {
    return {
      ...note,
      texts: note.texts.map((entry) => ({
        ...entry,
        text: sanitizeWorkbookText(entry.text ?? ''),
        font: ensureFontName(entry.font),
      })),
    };
  }
  return note;
}

export function writeWorkbookText(cell: ExcelJS.Cell, value: string): void {
  cell.value = sanitizeWorkbookText(value);
}

export function finalizeWorkbookCompatibility<T extends ExcelJS.Workbook>(workbook: T): T {
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.value !== null && cell.value !== undefined) {
          cell.value = sanitizeCellValue(cell.value);
        }
        if (cell.note) {
          cell.note = sanitizeCellNote(cell.note);
        }
        if (cell.value !== null && cell.value !== undefined || cell.font || cell.fill || cell.border || cell.alignment) {
          cell.font = ensureFontName(cell.font);
        }
      });
    });
  });
  return workbook;
}

export function applyWorkbookMeta(workbook: ExcelJS.Workbook, subject: string) {
  workbook.creator = 'CapitalBase';
  workbook.company = 'CapitalBase';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = sanitizeWorkbookText(subject);
}

export function enableWorkbookRecalculation(workbook: ExcelJS.Workbook) {
  workbook.calcProperties.fullCalcOnLoad = true;
  (workbook.calcProperties as ExcelJS.Workbook['calcProperties'] & { forceFullCalc?: boolean }).forceFullCalc = true;
}

export function setupSheet(
  sheet: ExcelJS.Worksheet,
  options?: {
    freezeRows?: number;
    freezeCols?: number;
    tabColor?: string;
    columnWidths?: number[];
    defaultRowHeight?: number;
  }
) {
  sheet.views = [
    {
      state: 'frozen',
      ySplit: options?.freezeRows ?? 3,
      xSplit: options?.freezeCols ?? 2,
    },
  ];
  sheet.properties.defaultRowHeight = options?.defaultRowHeight ?? 20;
  if (options?.tabColor) {
    sheet.properties.tabColor = { argb: options.tabColor };
  }
  const widths = options?.columnWidths ?? [28, 16, 14, 14, 14, 14, 14, 14, 14, 14];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

export function col(index: number): string {
  let value = index;
  let output = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    output = String.fromCharCode(65 + mod) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

export function formatCell(cell: ExcelJS.Cell, kind: CellKind) {
  if (kind === 'currency') cell.numFmt = '$#,##0.0';
  if (kind === 'percent') cell.numFmt = '0.0%';
  if (kind === 'number') cell.numFmt = '#,##0.0';
  if (kind === 'multiple') cell.numFmt = '0.0x';
}

export function styleTitle(cell: ExcelJS.Cell) {
  cell.font = { name: WORKBOOK_FONT_NAME, bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

export function styleSubtitle(cell: ExcelJS.Cell) {
  cell.font = { name: WORKBOOK_FONT_NAME, size: 10, color: { argb: COLORS.slate }, italic: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleSubBg } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
}

export function styleNarrativeBlock(sheet: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  for (let column = startCol; column <= endCol; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleSubBg } };
    cell.font = { name: WORKBOOK_FONT_NAME, color: { argb: COLORS.slate }, size: 10 };
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    applyBorder(cell);
  }
}

export function styleModelMeta(sheet: ExcelJS.Worksheet, row: number, label: string, value: string) {
  sheet.getCell(row, 1).value = sanitizeWorkbookText(label);
  sheet.getCell(row, 1).font = { name: WORKBOOK_FONT_NAME, bold: true, color: { argb: COLORS.slate }, size: 10 };
  sheet.getCell(row, 2).value = sanitizeWorkbookText(value);
  sheet.getCell(row, 2).font = { name: WORKBOOK_FONT_NAME, color: { argb: COLORS.ink }, size: 10 };
}

export function styleSectionHeader(sheet: ExcelJS.Worksheet, row: number, title: string, endCol = 8) {
  sheet.getCell(row, 1).value = sanitizeWorkbookText(title);
  for (let column = 1; column <= endCol; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
    cell.font = { name: WORKBOOK_FONT_NAME, bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: column === 1 ? 'left' : 'center' };
    applyBorder(cell);
  }
}

export function styleTableHeader(sheet: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  for (let column = startCol; column <= endCol; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.font = { name: WORKBOOK_FONT_NAME, bold: true, color: { argb: COLORS.ink } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    applyBorder(cell);
  }
}

export function styleLabel(cell: ExcelJS.Cell) {
  cell.font = { name: WORKBOOK_FONT_NAME, color: { argb: COLORS.ink }, size: 10 };
}

export function styleInput(cell: ExcelJS.Cell, kind: CellKind = 'text') {
  cell.font = { name: WORKBOOK_FONT_NAME, color: { argb: 'FF1D4ED8' }, bold: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.inputBg } };
  cell.protection = { locked: false };
  applyBorder(cell);
  formatCell(cell, kind);
}

export function styleFormula(cell: ExcelJS.Cell, kind: CellKind = 'text') {
  cell.font = { name: WORKBOOK_FONT_NAME, color: { argb: COLORS.ink } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.formulaBg } };
  cell.protection = { locked: true };
  applyBorder(cell);
  formatCell(cell, kind);
}

export function styleOutput(cell: ExcelJS.Cell, kind: CellKind = 'text') {
  cell.font = { name: WORKBOOK_FONT_NAME, color: { argb: COLORS.accent }, bold: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.outputBg } };
  cell.protection = { locked: true };
  applyBorder(cell);
  formatCell(cell, kind);
}

export function styleAccentOutput(cell: ExcelJS.Cell, kind: CellKind = 'text') {
  cell.font = { name: WORKBOOK_FONT_NAME, color: { argb: COLORS.titleBg }, bold: true, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accentSoft } };
  cell.protection = { locked: true };
  applyBorder(cell);
  formatCell(cell, kind);
}

export function styleCheck(cell: ExcelJS.Cell) {
  cell.font = { name: WORKBOOK_FONT_NAME, color: { argb: COLORS.danger }, bold: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.checkBg } };
  cell.protection = { locked: true };
  applyBorder(cell);
}

export function styleTotal(sheet: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  for (let column = startCol; column <= endCol; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.font = { name: WORKBOOK_FONT_NAME, bold: true, color: { argb: COLORS.ink } };
    cell.border = {
      top: { style: 'medium', color: { argb: COLORS.ink } },
      bottom: { style: 'double', color: { argb: COLORS.ink } },
    };
  }
}

export function addPassFailConditionalFormatting(sheet: ExcelJS.Worksheet, range: string) {
  const topLeftCell = range.split(':')[0];
  sheet.addConditionalFormatting({
    ref: range,
    rules: [
      {
        type: 'expression',
        formulae: [`EXACT(${topLeftCell},"PASS")`],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.passBg }, fgColor: { argb: COLORS.passBg } },
          font: { name: WORKBOOK_FONT_NAME, bold: true, color: { argb: COLORS.accent } },
        },
      },
      {
        type: 'expression',
        formulae: [`EXACT(${topLeftCell},"FLAG")`],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.failBg }, fgColor: { argb: COLORS.failBg } },
          font: { name: WORKBOOK_FONT_NAME, bold: true, color: { argb: COLORS.danger } },
        },
      },
    ] as any,
  });
}

export function styleSubTotal(sheet: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  for (let column = startCol; column <= endCol; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.font = { name: WORKBOOK_FONT_NAME, bold: true, color: { argb: COLORS.ink } };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.ink } },
      bottom: { style: 'double', color: { argb: COLORS.ink } },
    };
  }
}

export function styleDashedSubTotal(sheet: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  for (let column = startCol; column <= endCol; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.font = { name: WORKBOOK_FONT_NAME, bold: true, color: { argb: COLORS.ink } };
    cell.border = {
      top: { style: 'dotted', color: { argb: COLORS.ink } },
      bottom: { style: 'thin', color: { argb: COLORS.ink } },
    };
  }
}

export function styleThinGrid(sheet: ExcelJS.Worksheet, rowStart: number, rowEnd: number, colStart: number, colEnd: number) {
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let column = colStart; column <= colEnd; column += 1) {
      applyBorder(sheet.getCell(row, column));
    }
  }
}

export function mergeAndCenter(sheet: ExcelJS.Worksheet, range: string) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

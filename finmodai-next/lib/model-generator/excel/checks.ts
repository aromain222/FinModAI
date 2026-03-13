import ExcelJS from 'exceljs';
import { addPassFailConditionalFormatting, styleCheck, styleFormula, styleLabel } from '@/lib/model-generator/excel/formatting';

export function writeCheckRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  formula: string,
  note?: string
) {
  sheet.getCell(row, 1).value = label;
  styleLabel(sheet.getCell(row, 1));
  sheet.getCell(row, 2).value = { formula };
  styleCheck(sheet.getCell(row, 2));
  if (note) {
    sheet.getCell(row, 3).value = note;
    styleFormula(sheet.getCell(row, 3));
  }
}

export function finalizeChecksSheet(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  addPassFailConditionalFormatting(sheet, `B${startRow}:B${endRow}`);
}

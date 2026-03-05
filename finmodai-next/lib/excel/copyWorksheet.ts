import ExcelJS from 'exceljs';
import { toUniqueWorksheetName } from './safeSheetName';

export async function copyWorksheet(
  source: ExcelJS.Worksheet,
  target: ExcelJS.Workbook,
  newName?: string
): Promise<ExcelJS.Worksheet> {
  const safeName = toUniqueWorksheetName(target, newName || source.name, 'Sheet');
  const newSheet = target.addWorksheet(safeName);
  
  // Copy column definitions (handle null columns)
  if (source.columns && Array.isArray(source.columns) && source.columns.length > 0) {
    newSheet.columns = source.columns.map(col => ({
      key: col.key,
      width: col.width
    }));
  }
  
  // Copy rows
  source.eachRow((row, rowNumber) => {
    const newRow = newSheet.getRow(rowNumber);
    row.eachCell((cell, colNumber) => {
      newRow.getCell(colNumber).value = cell.value;
      newRow.getCell(colNumber).style = cell.style;
    });
    newRow.commit();
  });
  
  return newSheet;
}

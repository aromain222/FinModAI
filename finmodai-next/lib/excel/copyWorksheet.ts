import type ExcelJS from 'exceljs';

/**
 * Utility to copy the contents and formatting of one worksheet into another.
 * Keeps column widths and row heights intact so banker templates remain intact.
 */
export function copyWorksheet(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet): void {
  source.eachRow((row, rowNumber) => {
    const targetRow = target.getRow(rowNumber);
    row.eachCell((cell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.value = cell.value;
      targetCell.style = cell.style;
    });
    targetRow.height = row.height;
  });

  source.columns.forEach((column, index) => {
    const targetColumn = target.getColumn(index + 1);
    targetColumn.width = column.width;
  });

  if (source.properties.defaultRowHeight) {
    target.properties.defaultRowHeight = source.properties.defaultRowHeight;
  }
}

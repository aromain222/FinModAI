import ExcelJS from 'exceljs';
import {
  mergeAndCenter,
  setupSheet,
  styleFormula,
  styleLabel,
  styleSectionHeader,
  styleTableHeader,
  styleThinGrid,
  styleTitle,
} from '@/lib/model-generator/excel/formatting';

export type EquationRow = {
  metric: string;
  description: string;
  excelFormula: string;
  dependencies: string;
  location: string;
};

export function addEquationsSheet(workbook: ExcelJS.Workbook, modelName: string, rows: EquationRow[]) {
  const sheet = workbook.addWorksheet('Equations');
  setupSheet(sheet, {
    freezeRows: 4,
    freezeCols: 1,
    tabColor: 'FF4F46E5',
    columnWidths: [24, 42, 44, 36, 22, 14, 14],
  });

  sheet.getCell('A1').value = `${modelName} Equations`;
  mergeAndCenter(sheet, 'A1:E1');
  styleTitle(sheet.getCell('A1'));
  styleSectionHeader(sheet, 3, 'Key Formula Logic', 5);
  styleTableHeader(sheet, 4, 1, 5);
  sheet.getCell('A4').value = 'Metric';
  sheet.getCell('B4').value = 'Equation Description';
  sheet.getCell('C4').value = 'Excel Formula';
  sheet.getCell('D4').value = 'Dependencies';
  sheet.getCell('E4').value = 'Sheet / Range';

  rows.forEach((row, index) => {
    const excelRow = 5 + index;
    sheet.getCell(`A${excelRow}`).value = row.metric;
    sheet.getCell(`B${excelRow}`).value = row.description;
    sheet.getCell(`C${excelRow}`).value = row.excelFormula;
    sheet.getCell(`D${excelRow}`).value = row.dependencies;
    sheet.getCell(`E${excelRow}`).value = row.location;
    styleLabel(sheet.getCell(`A${excelRow}`));
    styleFormula(sheet.getCell(`B${excelRow}`));
    styleFormula(sheet.getCell(`C${excelRow}`));
    styleFormula(sheet.getCell(`D${excelRow}`));
    styleFormula(sheet.getCell(`E${excelRow}`));
    sheet.getCell(`C${excelRow}`).font = {
      name: 'Courier New',
      color: { argb: 'FF0F172A' },
    };
  });

  if (rows.length > 0) {
    styleThinGrid(sheet, 5, 4 + rows.length, 1, 5);
  }

  return sheet;
}

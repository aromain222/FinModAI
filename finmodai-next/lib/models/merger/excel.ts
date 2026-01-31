import ExcelJS from 'exceljs';

export async function generateMergerWorkbook(data: Record<string, any>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Merger Analysis');
  sheet.addRow(['Merger Analysis']);
  return workbook;
}

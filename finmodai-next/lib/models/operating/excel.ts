import ExcelJS from 'exceljs';

export async function generateOperatingWorkbook(data: Record<string, any>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Operating Model');
  sheet.addRow(['Operating Model']);
  return workbook;
}

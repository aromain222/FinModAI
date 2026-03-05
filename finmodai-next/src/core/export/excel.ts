import ExcelJS from 'exceljs';
import type { ModelOutputs } from '@/src/core/contracts/modelOutputs';

export async function buildExcelFromModelOutputs(params: {
  templateId: string;
  modelOutputs: ModelOutputs;
  companyName: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet('Summary');

  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 32 },
    { header: 'Value', key: 'value', width: 24 },
  ];

  const summary = params.modelOutputs.summary;
  summarySheet.addRow({ metric: 'Company', value: params.companyName });
  summarySheet.addRow({ metric: 'Template', value: params.templateId });
  summarySheet.addRow({ metric: 'Enterprise Value', value: summary.enterpriseValue });
  summarySheet.addRow({ metric: 'Equity Value', value: summary.equityValue ?? null });
  summarySheet.addRow({ metric: 'Implied Share Price', value: summary.impliedSharePrice ?? null });
  summarySheet.addRow({ metric: 'WACC', value: summary.wacc });
  summarySheet.addRow({ metric: 'Terminal Value Share', value: summary.terminalValueShare });

  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getColumn(2).numFmt = '#,##0.00';
  summarySheet.getCell('B6').numFmt = '0.00%';
  summarySheet.getCell('B7').numFmt = '0.00%';

  const statements = params.modelOutputs.statements;
  if (statements?.projectionYears && statements.projectionYears.length > 0) {
    const projSheet = workbook.addWorksheet('Statements');
    projSheet.addRow(['Metric', ...statements.projectionYears]);
    projSheet.addRow(['Revenue', ...(statements.revenue || [])]);
    projSheet.addRow(['EBIT', ...(statements.ebit || [])]);
    projSheet.addRow(['FCF', ...(statements.fcf || [])]);

    projSheet.getRow(1).font = { bold: true };
    projSheet.columns = [{ width: 20 }, ...statements.projectionYears.map(() => ({ width: 14 }))];
    for (let row = 2; row <= 4; row += 1) {
      for (let col = 2; col <= statements.projectionYears.length + 1; col += 1) {
        projSheet.getCell(row, col).numFmt = '#,##0.00';
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

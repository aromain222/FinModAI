/**
 * Comps Excel Generator
 * Generate Excel workbooks for comps analysis
 */

import ExcelJS from 'exceljs';

export async function generateCompsWorkbook(data: Record<string, any>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Trading Comps');
  
  // Header
  sheet.getCell('A1').value = 'Trading Comps Analysis';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  
  // Column headers
  sheet.addRow(['Company', 'Ticker', 'Market Cap', 'EV/EBITDA', 'EV/Revenue', 'P/E']);
  sheet.getRow(3).font = { bold: true };
  
  // Add data rows
  if (data.peers && Array.isArray(data.peers)) {
    for (const peer of data.peers) {
      sheet.addRow([
        peer.name || peer.ticker,
        peer.ticker,
        peer.marketCap,
        peer.evToEbitda,
        peer.evToRevenue,
        peer.peRatio
      ]);
    }
  }
  
  // Set column widths
  sheet.columns = [
    { key: 'company', width: 25 },
    { key: 'ticker', width: 10 },
    { key: 'marketCap', width: 15 },
    { key: 'evEbitda', width: 12 },
    { key: 'evRevenue', width: 12 },
    { key: 'pe', width: 10 }
  ];
  
  return workbook;
}

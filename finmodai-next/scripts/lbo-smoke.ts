import ExcelJS from 'exceljs';
import { runLboModel } from '@/lib/lboEngine';

async function runSmokeTest() {
  const workbook = new ExcelJS.Workbook();
  await runLboModel({
    workbook,
    ticker: 'SMOKE',
    companyName: 'CapitalBase LBO Smoke Test',
    normalizedFinancials: {
      revenueM: 1500,
      ebitdaM: 300,
      ebitM: 250,
      netDebtM: 400,
      sharesOutstandingM: 60,
      fcfM: 120,
    },
    sliderAssumptions: {
      revenueGrowth: 0.06,
      ebitdaMargin: 0.25,
      capexPercent: 0.04,
      daPercent: 0.035,
      nwcPercent: 0.02,
      taxRate: 0.24,
      entryMultiple: 10,
      exitMultiple: 12,
      leverageMultiple: 4.5,
      transactionFeesPercent: 0.02,
      offerPremium: 0.3,
      forecastYears: 5,
      termLoanBRate: 0.065,
      revolverRate: 0.05,
      minimumCash: 50,
    },
  });
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  console.log('[LBO_SMOKE] sheets:', sheetNames);
  const buffer = await workbook.xlsx.writeBuffer();
  console.log('[LBO_SMOKE] buffer bytes:', buffer.byteLength ?? buffer.length ?? 0);
}

runSmokeTest().catch((err) => {
  console.error('[LBO_SMOKE_ERROR]', err);
  process.exit(1);
});

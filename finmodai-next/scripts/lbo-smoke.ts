import { runLboModel, buildLboWorkbook } from '@/lib/lboEngine';

async function runSmokeTest() {
  const output = runLboModel({
    ticker: 'SMOKE',
    companyName: 'CapitalBase LBO Smoke Test',
    revenue: 1500,
    ebitda: 300,
    netDebt: 400,
    entryMultiple: 10,
    exitMultiple: 12,
    transactionFeesPercent: 0.02,
    exitFeesPercent: 0.01,
    debtPercent: 0.6,
    equityPercent: 0.4,
    interestRate: 0.065,
    amortizationPercent: 0.05,
    cashSweepPercent: 1,
    revenueGrowth: 0.06,
    ebitdaMargin: 0.25,
    capexPctRevenue: 0.04,
    deltaNwcPctRevenue: 0.02,
    taxRate: 0.24,
    holdingPeriodYears: 5,
    minimumCashBalance: 50,
    depreciationPctRevenue: 0.035,
  });
  const workbook = await buildLboWorkbook(output);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  console.log('[LBO_SMOKE] sheets:', sheetNames);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes =
    typeof (buffer as any)?.byteLength === 'number'
      ? (buffer as any).byteLength
      : typeof (buffer as any)?.length === 'number'
        ? (buffer as any).length
        : 0;
  console.log('[LBO_SMOKE] buffer bytes:', bytes);
}

runSmokeTest().catch((err) => {
  console.error('[LBO_SMOKE_ERROR]', err);
  process.exit(1);
});

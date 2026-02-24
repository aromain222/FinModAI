import { NextResponse } from 'next/server';
import { runLboModel, buildLboWorkbook } from '@/lib/lboEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const output = runLboModel({
      ticker: 'TEST_LBO',
      companyName: 'CapitalBase LBO Test',
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

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="capitalbase_test_lbo.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[TEST_LBO_WORKBOOK_ERROR]', error);
    return NextResponse.json(
      {
        error: 'Failed to generate LBO test workbook',
        details: error?.message ?? null,
      },
      { status: 500 }
    );
  }
}

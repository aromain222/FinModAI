import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not available in production', { status: 404 });
  }

  try {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;
    const { runLboModel } = await import('@/lib/lboEngine');

    const workbook = new ExcelJS.Workbook();
    await runLboModel({
      workbook,
      ticker: 'TEST_LBO',
      companyName: 'CapitalBase LBO Test',
      sectorHint: 'apparel',
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
      excelOverrides: {
        currentStockPrice: 25,
        basicSharesOutstanding: 60,
        inTheMoneyOptions: 2,
      },
    });

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

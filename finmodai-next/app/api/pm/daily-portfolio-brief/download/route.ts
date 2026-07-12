import { NextRequest, NextResponse } from 'next/server';
import { listPMRecords } from '@/lib/pm/persistence/store';
import type { DailyPortfolioBrief } from '@/lib/pm/dailyBrief/generator';
import { renderDailyBriefPdf } from '@/lib/pm/dailyBrief/pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const records = await listPMRecords<DailyPortfolioBrief>('pm_daily_portfolio_briefs', { limit: 30 });
  const brief = id ? records.find(record => record.id === id) : records[0];
  if (!brief) {
    return NextResponse.json({ error: id ? `No brief found for id ${id}` : 'No daily briefs generated yet' }, { status: 404 });
  }
  const pdf = await renderDailyBriefPdf(brief);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="capitalbase-daily-brief-${brief.tradingDate}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

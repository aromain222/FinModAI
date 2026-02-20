import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

import { CapitalBaseReportView } from '@/components/reports/CapitalBaseReportView';
import type { ModelReport } from '@/lib/reportTypes';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  let data: { id: string; report: ModelReport; created_at: string } | null = null;
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const result = await supabase
        .from('model_reports')
        .select('id, report, created_at')
        .eq('id', params.id)
        .maybeSingle();

      if (!result.error && result.data) {
        data = result.data as { id: string; report: ModelReport; created_at: string };
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ReportDetailPage] Supabase error:', (e as Error)?.message);
      }
    }
  }
  if (!data) notFound();
  type Row = { id: string; report: ModelReport; created_at: string };
  const row = data as Row;
  const report = row.report as ModelReport;
  report.id = row.id;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader
        title={report.title || report.ticker}
        subtitle={`${report.ticker} · ${report.modelType.toUpperCase()} Model Insight`}
        backHref="/reports"
      />
      <CapitalBaseReportView report={report} />
    </main>
  );
}


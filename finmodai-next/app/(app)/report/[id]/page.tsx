import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import { CapitalBaseReportView } from '@/components/reports/CapitalBaseReportView';
import type { ModelReport } from '@/lib/reportTypes';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data, error } = await supabase
    .from('model_reports')
    .select('id, report, created_at')
    .eq('id', params.id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const report = data.report as ModelReport;
  report.id = data.id;

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


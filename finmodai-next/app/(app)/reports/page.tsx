import Link from 'next/link';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import type { ModelReport } from '@/lib/reportTypes';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function ReportsPage() {
  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data } = await supabase
    .from('model_reports')
    .select('id, report, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  const reports = data ?? [];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <PageHeader
        title="Analyst Reports"
        subtitle="Saved narratives from your most recent models. Click any card to reopen the full report view."
        backHref="/models/create"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {reports.length === 0 && <p className="text-sm text-cb-slate">No reports yet. Generate one from a model run.</p>}
        {reports.map((row) => {
          const report = row.report as ModelReport | null;
          if (!report) return null;
          return (
            <Link
              key={row.id}
              href={`/report/${row.id}`}
              className="rounded-2xl border border-cb-line bg-white p-4 shadow-sm transition hover:border-cb-blue"
            >
              <p className="text-xs uppercase tracking-wide text-cb-slate">{report.modelType.toUpperCase()}</p>
              <h2 className="mt-1 text-lg font-semibold text-cb-ink">
                {report.title || report.ticker}
              </h2>
              <p className="text-sm text-cb-slate">{report.ticker}</p>
              <p className="mt-2 text-xs text-cb-slate">Generated {new Date(report.createdAt).toLocaleString()}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

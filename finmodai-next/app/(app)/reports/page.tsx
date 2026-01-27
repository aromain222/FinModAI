import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const mockReports = [
  { id: '1', modelType: 'DCF', companyName: 'DemoCo', ticker: 'DEMO', createdAt: new Date().toISOString() },
  { id: '2', modelType: 'LBO', companyName: 'Example Holdings', ticker: 'EXH', createdAt: new Date().toISOString() },
  { id: '3', modelType: 'COMPS', companyName: 'Sample Corp', ticker: 'SAMP', createdAt: new Date().toISOString() },
  { id: '4', modelType: 'MA', companyName: 'TargetCo', ticker: 'TCO', createdAt: new Date().toISOString() },
];

export default function ReportsPage() {
  const reports = mockReports; // TODO: wire to Supabase model_reports table

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 text-[var(--cb-text-body)]">
      <PageHeader
        title="Reports"
        subtitle="Model-generated reports by type. Generate a model to create your first report."
        backHref="/models"
      />

      {reports.length === 0 ? (
        <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">No reports yet</h2>
            <p className="text-sm text-[var(--cb-text-muted)]">
              Generate a model to create your first report. Once reports are available, they&apos;ll appear here.
            </p>
            <div className="pt-2">
              <Link href="/models">
                <Button>Go to Models</Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/report/${report.id}`}
              className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 shadow-sm transition hover:border-[var(--cb-green)]/60"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">{report.companyName}</h3>
                <Badge variant="outline" className="border-[var(--cb-border-subtle)] text-[var(--cb-text-muted)]">
                  {report.modelType}
                </Badge>
              </div>
              <p className="text-sm text-[var(--cb-text-muted)]">{report.ticker}</p>
              <p className="text-xs text-[var(--cb-text-muted)] mt-2">
                Created {new Date(report.createdAt).toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

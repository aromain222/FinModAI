import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ModelPdfReport } from '@/components/reports/ModelPdfReport';
import { PrintOnLoad } from '@/components/reports/PrintOnLoad';
import { buildPdfExecutiveSummary } from '@/lib/reports/pdfSummary';
import { getModelRunReportContext } from '@/lib/reports/modelRunReport';

export const runtime = 'nodejs';

type PageProps = {
  params: { modelRunId: string };
  searchParams?: { print?: string };
};

export default async function ModelRunReportPage({ params, searchParams }: PageProps) {
  const context = await getModelRunReportContext(params.modelRunId);
  if (!context.ok) {
    if (context.error === 'run_not_found') notFound();
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-xl font-semibold text-red-600">Unable to load report</h1>
        <p className="mt-2 text-sm text-zinc-700">{context.error}</p>
        <pre className="mt-3 overflow-auto rounded border bg-zinc-50 p-3 text-xs">{JSON.stringify(context.details ?? {}, null, 2)}</pre>
        <Link href="/models/create" className="mt-4 inline-block text-sm text-blue-600 underline">
          Back to model builder
        </Link>
      </main>
    );
  }

  const summary = await buildPdfExecutiveSummary(context.data);
  const printMode = searchParams?.print === '1';
  const demoMode = String(process.env.DEMO_MODE || '').toLowerCase() === 'true';

  return (
    <>
      <PrintOnLoad enabled={printMode} />
      <main className={printMode ? 'print-shell' : 'screen-shell'}>
        {!printMode && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <h1 className="text-base font-semibold text-zinc-900">Model PDF Report</h1>
              <p className="text-xs text-zinc-600">Company-specific report tied to run {context.data.runId}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/models/create" className="rounded border px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
                Back
              </Link>
              <Link
                href={`/reports/${context.data.runId}?print=1`}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Print / Save PDF
              </Link>
            </div>
          </div>
        )}
        <ModelPdfReport
          data={context.data}
          summaryParagraphs={summary.paragraphs}
          summarySource={summary.source}
          demoMode={demoMode}
        />
      </main>
    </>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PreviewV3Table } from '@/components/models/PreviewV3Table';
import type { ReportV1 } from '@/types/reportContracts';

type ReportResponse = {
  reportId: string;
  status: string;
  report?: ReportV1;
  error?: string;
};

export default function ReportPage({ params }: { params: { modelId: string; reportId: string } }) {
  const { reportId, modelId } = params;
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const fetchReport = async () => {
    try {
      const res = await fetch(`/api/reports/${reportId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      if (json.status === 'ready' || json.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    pollRef.current = setInterval(fetchReport, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const report = data?.report;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Report</p>
            <h1 className="text-2xl font-semibold text-slate-50">
              {report?.summary?.title ?? 'Model Report'}
            </h1>
            <p className="text-sm text-slate-400">
              Status: {data?.status ?? 'unknown'} • Model: {modelId}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/models/${modelId}`)}>
              Back to model
            </Button>
          </div>
        </div>

        {loading && (
          <Card className="border border-white/10 bg-black/60">
            <CardHeader>
              <CardTitle className="text-white">Generating report…</CardTitle>
              <CardDescription className="text-slate-400">
                Please wait while we prepare the report.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {error && (
          <Card className="border border-rose-500/30 bg-rose-500/10">
            <CardHeader>
              <CardTitle className="text-rose-100">Error</CardTitle>
              <CardDescription className="text-rose-200">{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={fetchReport} variant="outline">
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {report && (
          <>
            <Card className="border border-white/10 bg-black/60">
              <CardHeader>
                <CardTitle className="text-white">Summary</CardTitle>
                <CardDescription className="text-slate-400">{report.summary?.subtitle}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {report.kpis.map((kpi) => (
                  <div key={kpi.key} className="rounded-lg border border-white/10 bg-black/50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">{kpi.label}</div>
                    <div className="text-lg font-semibold text-white">{kpi.value ?? '—'}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-black/60">
              <CardHeader>
                <CardTitle className="text-white">Inputs</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {report.inputs.map((input) => (
                  <div key={input.key} className="rounded-lg border border-white/10 bg-black/50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">{input.label}</div>
                    <div className="text-sm text-white">{input.value ?? '—'}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-black/60">
              <CardHeader>
                <CardTitle className="text-white">Drivers & Risks</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-white">Drivers</div>
                  {report.drivers.map((d, idx) => (
                    <div key={idx} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
                      <div className="font-semibold">{d.label}</div>
                      <div className="text-xs text-emerald-200">{d.impact}</div>
                      {d.detail && <div className="text-xs text-emerald-200">{d.detail}</div>}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-white">Risks</div>
                  {report.risks.map((r, idx) => (
                    <div key={idx} className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                      <div className="font-semibold">{r.label}</div>
                      {r.detail && <div className="text-xs text-amber-200">{r.detail}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {Object.keys(report.tables || {}).length > 0 && (
              <Card className="border border-white/10 bg-black/60">
                <CardHeader>
                  <CardTitle className="text-white">Tables</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(report.tables).map(([key, table]) => (
                    <div key={key} className="rounded-md border border-white/10 bg-black/70 p-3">
                      <div className="text-sm font-semibold text-white">{table.title}</div>
                      <div className="overflow-x-auto mt-2">
                        <table className="min-w-full text-xs text-slate-200">
                          <thead className="bg-white/5">
                            <tr>
                              {table.columns.map((col) => (
                                <th key={col.key} className="px-2 py-1 text-left font-semibold">
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.map((row, idx) => (
                              <tr key={idx} className="border-t border-white/5">
                                {table.columns.map((col) => (
                                  <td key={col.key} className="px-2 py-1">
                                    {row[col.key] ?? '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <PreviewV3Table
              preview={null}
              loading={false}
              status={data?.status ?? null}
              reason={report?.notes?.methodology ?? null}
              devDebug={report?.debug}
              downloadUrl={report?.artifacts?.excel?.signedUrl ?? undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}

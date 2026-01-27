'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DownloadModelButton } from '@/components/models/DownloadButton';
import { NotesEditor } from '@/components/models/NotesEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Home,
  ArrowLeft,
  Loader2,
  Activity,
  AlertTriangle,
  FileSpreadsheet,
  Info,
  Plus,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { ModelPreview, type ModelPreviewTable } from '@/components/models/ModelPreview';
import { apiFetch, ApiError } from '@/lib/api/client';
import type { ModelRow } from '@/types/modelContracts';

type DcfSummary = {
  valuationResults?: {
    enterpriseValue?: number;
    equityValue?: number;
    pricePerShare?: number | null;
  };
  keyAssumptions?: {
    wacc?: number;
    terminalGrowth?: number;
    ebitdaMargin?: number;
    year1RevenueGrowth?: number;
  };
};

type StoredModelResults = {
  preview?: ModelPreviewTable | null;
  dcfSummary?: DcfSummary | null;
  lboSummary?: Record<string, any> | null;
  statements?: Record<string, any> | null;
  scenarioNotes?: string | string[] | null;
  warnings?: string[];
  filename?: string;
  isValid?: boolean;
  invalidReason?: string | null;
  validation?: {
    reason?: string | null;
    errors?: string[];
    warnings?: string[];
  };
  dcfResults?: {
    enterpriseValue?: number;
    equityValue?: number;
    pricePerShare?: number | null;
    netDebt?: number;
    notes?: string[];
    isValid?: boolean;
    invalidReason?: string | null;
  };
};

type Model = Omit<ModelRow, 'user_id' | 'normalized_assumptions' | 'validation' | 'units' | 'signed_url' | 'export_key'> & {
  results?: StoredModelResults | null;
  preview?: ModelPreviewTable | null;
};

export default function ModelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const modelId = params?.modelId as string;

  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
      setLoading(false);
      router.replace('/app');
      return;
    }
    fetchModel();
  }, [modelId, router]);

  const fetchModel = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch<Model>(`/api/models/${modelId}`);

      if (!data || !data.id) {
        clearStaleModelId();
        showToast({
          title: 'Previous model not found',
          description: 'Starting fresh',
          variant: 'default',
        });
        router.replace('/app');
        return;
      }

      setModel(data);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const apiErr = err;
        if (apiErr.status === 404) {
          clearStaleModelId();
          setModel(null);
          setNotFound(true);
          setError('not-found');
          return;
        }
        if (apiErr.status === 401) {
          router.replace('/auth');
          return;
        }
        console.error('Failed to fetch model:', {
          error: apiErr.message,
          details: apiErr.details,
          traceId: apiErr.traceId,
          status: apiErr.status,
        });
      } else {
        console.error('Failed to fetch model:', err);
      }

      clearStaleModelId();
      setError('unknown');
    } finally {
      setLoading(false);
    }
  };

  const clearStaleModelId = () => {
    if (typeof window !== 'undefined') {
      const keysToRemove = ['lastModelId', 'activeModelId', 'selectedModel', 'modelId'];
      keysToRemove.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
      });
    }
  };

  const nav = (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild variant="ghost" size="sm" className="text-slate-200 hover:bg-slate-800">
        <Link href="/dashboard">
          <Home className="mr-2 h-4 w-4" />
          Home
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="text-slate-200 hover:bg-slate-800">
        <Link href="/models">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Models
        </Link>
      </Button>
    </div>
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-12">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-400" />
              <p className="mt-3 text-sm text-slate-400">Loading model...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const renderNotFound = () => (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl space-y-8 text-center">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 shadow-sm">
          <h1 className="mb-2 text-2xl font-semibold text-slate-50">Model not found</h1>
          <p className="mb-6 text-sm text-slate-400">
            We couldn&apos;t find that model. It may have been deleted or never finished generating.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild className="bg-emerald-500 text-white hover:bg-emerald-600">
              <Link href="/models/create">Create new model</Link>
            </Button>
            <Button asChild variant="outline" className="border-slate-700 text-slate-200 hover:bg-slate-800">
              <Link href="/models">Back to library</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );

  if (error === 'not-found' || notFound) {
    return renderNotFound();
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center shadow-sm">
            <h2 className="mb-2 text-2xl font-semibold text-slate-50">No model selected</h2>
            <p className="mb-6 text-sm text-slate-400">
              Create a new model to get started with financial analysis.
            </p>
            <Button asChild className="bg-emerald-500 text-white hover:bg-emerald-600">
              <Link href="/models/create">
                <Plus className="mr-2 h-4 w-4" />
                Create model
              </Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!model) {
    return renderNotFound();
  }

  const displayFileName =
    model.file_name && typeof model.file_name === 'string'
      ? model.file_name.split('/').pop() || model.file_name
      : null;
  const resolvedModelType = model?.model_type ?? model?.type ?? 'dcf';
  const isReady = model.status === 'ready' && Boolean(model.results);
  const results = (model.results ?? null) as StoredModelResults | null;
  const isModelValid = results?.isValid !== false;
  const invalidReason = results?.invalidReason ?? results?.validation?.reason;
  const dcfSummary = results?.dcfSummary ?? null;
  const valuation = dcfSummary?.valuationResults ?? null;
  const keyAssumptions = dcfSummary?.keyAssumptions ?? null;
  const previewData = model.preview ?? results?.preview ?? null;
  const scenarioNotesRaw = results?.scenarioNotes;
  const scenarioNotes = Array.isArray(scenarioNotesRaw)
    ? scenarioNotesRaw.join(' ')
    : scenarioNotesRaw ?? null;
  const canDownload = isReady && Boolean(model.r2_key) && isModelValid;
  const sheets = results?.sheets ?? [];
  const validationWarnings = results?.validation?.warnings ?? results?.warnings ?? [];
  const validationErrors = results?.validation?.errors ?? [];
  const assumptionsJson = results?.assumptionsUsed ?? model.assumptions ?? {};

  if (model.status === 'error' || model.status === 'failed') {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
        <div className="mx-auto max-w-5xl space-y-8">
          {nav}
          <Card className="border border-red-900/60 bg-red-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-100">
                <AlertTriangle className="h-4 w-4 text-red-300" />
                Model failed to generate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-red-100">
              <p>{model.error || 'Generation failed. Please adjust inputs and regenerate.'}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={fetchModel} className="bg-emerald-500 text-white hover:bg-emerald-600">
                  Retry fetch
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-red-700 text-red-100 hover:bg-red-900/20"
                >
                  <Link href="/models/create">Create new model</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!isReady) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
        <div className="mx-auto max-w-5xl space-y-8">
          {nav}
          <Card className="border border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-50">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                Generating workbook
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-400">
              <p>
                The {model.ticker} {formatModelLabel(resolvedModelType)} model is still being generated.
              </p>
              <p className="text-xs text-slate-500">
                Feel free to refresh this page in a moment. We&apos;ll automatically unlock preview +
                download as soon as processing finishes.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={fetchModel} className="bg-emerald-500 text-white hover:bg-emerald-600">
                  Refresh now
                </Button>
                <Button asChild variant="outline" size="sm" className="border-slate-700 text-slate-200 hover:bg-slate-800">
                  <Link href="/models">Return to models</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const headerMeta = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{model.ticker}</span>
        <span className={statusPill(model.status)}>{model.status}</span>
        <span className="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-200">
          {formatModelLabel(resolvedModelType)}
        </span>
        <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-200">
          {model?.scenario ?? 'BASE'}
        </span>
      </div>
      <h1 className="text-2xl font-semibold text-slate-50 md:text-3xl">
        {formatModelLabel(resolvedModelType)} for {model.ticker}
      </h1>
      <p className="text-sm text-slate-400">
        Updated{' '}
        {new Date(model.updated_at || model.created_at).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {nav}

        <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:flex-row md:items-center md:justify-between">
          {headerMeta}
          <div className="flex flex-wrap items-center gap-2">
            <DownloadModelButton
              ticker={model.ticker}
              modelType={resolvedModelType}
              modelId={model.id}
              variant="default"
              size="lg"
              disabled={!canDownload}
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            />
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <Link href={`/scenario-engine?ticker=${model.ticker}`}>Scenario Engine</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-slate-200 hover:bg-slate-800">
              <Link href={`/analyst-chat?modelId=${model.id}`}>Analyst Chat</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <Card className="border border-slate-800 bg-slate-900/40">
            <CardHeader className="border-b border-slate-800 pb-0">
              <CardTitle className="text-base text-slate-100">Model Preview</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Tabs defaultValue="preview" className="w-full">
                <TabsList className="grid w-full grid-cols-4 bg-slate-900/60 text-slate-200">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="sheets">Sheets</TabsTrigger>
                  <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
                  <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="pt-4">
                  {isModelValid && previewData ? (
                    <ModelPreview preview={previewData} modelType={resolvedModelType} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
                      Preview not available yet. Regenerate or refresh once processing finishes.
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="sheets" className="pt-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200">
                    <div className="mb-2 flex items-center gap-2 font-semibold text-slate-100">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-300" /> Workbook Sheets
                    </div>
                    {sheets && sheets.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sheets.map((sheet) => (
                          <div
                            key={sheet}
                            className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100"
                          >
                            {sheet}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">
                        Sheets will appear after the workbook is generated.
                      </p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="assumptions" className="pt-4">
                  <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
                    <div className="mb-2 flex items-center gap-2 font-semibold text-slate-100">
                      <Info className="h-4 w-4 text-emerald-300" /> Key Assumptions
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <AssumptionTile label="WACC" value={formatPercent(keyAssumptions?.wacc)} />
                      <AssumptionTile label="Terminal Growth" value={formatPercent(keyAssumptions?.terminalGrowth)} />
                      <AssumptionTile
                        label="EBITDA Margin"
                        value={formatPercent(keyAssumptions?.ebitdaMargin)}
                      />
                      <AssumptionTile
                        label="Year 1 Revenue Growth"
                        value={formatPercent(keyAssumptions?.year1RevenueGrowth)}
                      />
                      <AssumptionTile label="Scenario" value={model?.scenario ?? 'BASE'} />
                      {displayFileName && <AssumptionTile label="File" value={displayFileName} />}
                    </div>
                    <Accordion type="single" collapsible className="border border-slate-800">
                      <AccordionItem value="raw">
                        <AccordionTrigger className="px-3 text-sm text-slate-200">Raw JSON</AccordionTrigger>
                        <AccordionContent>
                          <pre className="max-h-[360px] overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-200">
                            {JSON.stringify(assumptionsJson, null, 2)}
                          </pre>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </TabsContent>
                <TabsContent value="diagnostics" className="pt-4">
                  <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
                    <div className="flex items-center gap-2 font-semibold text-slate-100">
                      <Activity className="h-4 w-4 text-emerald-300" /> Validation & Diagnostics
                    </div>
                    {validationWarnings.length === 0 && validationErrors.length === 0 ? (
                      <p className="text-sm text-slate-400">No diagnostics to show.</p>
                    ) : (
                      <>
                        {validationWarnings.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Warnings</p>
                            <ul className="list-inside list-disc space-y-1 text-sm text-amber-200">
                              {validationWarnings.map((warn, idx) => (
                                <li key={idx}>{warn}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {validationErrors.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-red-300">Errors</p>
                            <ul className="list-inside list-disc space-y-1 text-sm text-red-200">
                              {validationErrors.map((err, idx) => (
                                <li key={idx}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="space-y-4 lg:sticky lg:top-4">
            <Card className="border border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-slate-100">Key Outputs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <KeyOutputRow label="Enterprise Value" value={formatLargeCurrency(valuation?.enterpriseValue)} />
                <KeyOutputRow label="Equity Value" value={formatLargeCurrency(valuation?.equityValue)} />
                <KeyOutputRow
                  label="Price / Share"
                  value={formatCurrency(valuation?.pricePerShare ?? results?.dcfResults?.pricePerShare)}
                />
                <KeyOutputRow label="WACC" value={formatPercent(keyAssumptions?.wacc)} />
                <KeyOutputRow label="Terminal Growth" value={formatPercent(keyAssumptions?.terminalGrowth)} />
                {displayFileName && <KeyOutputRow label="File" value={displayFileName} muted />}
              </CardContent>
            </Card>

            {scenarioNotes && (
              <Card className="border border-slate-800 bg-slate-900/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-100">Scenario Notes</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-300">{scenarioNotes}</CardContent>
              </Card>
            )}

            <Card className="border border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-100">Analyst Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <NotesEditor modelId={model.id} initialValue={model.notes} />
              </CardContent>
            </Card>
          </div>
        </div>

        {!isModelValid && (
          <Card className="border border-red-900/60 bg-red-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-100">
                <AlertTriangle className="h-4 w-4 text-red-300" />
                This DCF failed validation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-red-100">
              <p>
                {invalidReason ||
                  'Model inputs did not pass internal consistency checks. Please review the assumptions and regenerate.'}
              </p>
              <p className="text-xs text-red-200">
                Generating or downloading the workbook is disabled until the inputs pass guardrails.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function formatModelLabel(type?: string | null) {
  switch (type) {
    case 'three-statement':
      return 'Three-Statement';
    case 'dcf':
      return 'DCF';
    case 'lbo':
      return 'LBO';
    case 'comps':
      return 'Comps';
    default:
      return type || 'Model';
  }
}

function formatLargeCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (absValue >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  return formatCurrency(value);
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `$${value.toFixed(2)}`;
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function statusPill(status?: string | null) {
  switch (status) {
    case 'ready':
      return 'rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-200';
    case 'generating':
      return 'rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-200';
    case 'error':
    case 'failed':
      return 'rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-red-200';
    default:
      return 'rounded-full border border-slate-700/60 bg-slate-900/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-200';
  }
}

function KeyOutputRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${muted ? 'text-slate-400' : 'text-slate-100'}`}>
        {value || '—'}
      </span>
    </div>
  );
}

function AssumptionTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-100">{value || '—'}</p>
    </div>
  );
}

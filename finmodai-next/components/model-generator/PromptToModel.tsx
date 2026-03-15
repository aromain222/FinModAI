'use client';

import Link from 'next/link';
import { AnalystCoreTemplateCard } from '@/components/analyst/AnalystCoreTemplateCard';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AnalystCoreTemplatePayload } from '@/lib/analyst/coreModelTemplates';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type { ComparisonSummary, ProvenanceSummary } from '@/lib/model-generator/runHistory';

type PreviewSummary = {
  modelName: string;
  tabs: string[];
  keyOutputs: string[];
};

type PreviewResponse = {
  modelType: ModelGeneratorType | null;
  extractedInputs: Record<string, unknown>;
  missingInputs: string[];
  defaultsUsed: Record<string, unknown>;
  provenanceSummary: ProvenanceSummary | null;
  comparisonSummary: ComparisonSummary | null;
  supported: boolean;
  needsClarification: boolean;
  clarificationQuestion?: string;
  previewSummary: PreviewSummary | null;
  recentRun?: {
    runId: string;
    status: string;
    createdAt: string;
    versionNumber: number | null;
  } | null;
  handoffOnly?: boolean;
  coreTemplateModel?: AnalystCoreTemplatePayload | null;
  message?: string;
};

type RecentRun = {
  id: string;
  prompt: string;
  modelType: ModelGeneratorType;
  companyName: string | null;
  ticker: string | null;
  status: string;
  updatedAt: string;
  latestVersion: {
    versionNumber: number;
    assumptions: Record<string, unknown>;
    workbookFilename: string | null;
    provenance: ProvenanceSummary | null;
  } | null;
};

const EXAMPLE_PROMPTS = [
  'Generate a DCF model for Nvidia',
  'Build a comparable company analysis for Snowflake',
  'Create a precedent transactions view for Mastercard',
  'Build an LBO model for Oracle',
  'Build a revenue recognition ASC 606 model',
  'Create a debt capacity model for Netflix',
];

function isCurrencyKey(key?: string): boolean {
  if (!key) return false;
  return /(revenue|income|cash|debt|price|value|equity|ebitda|ebit|ev|capex|nwc|inventory|dividend|book|ppe|burn|fundraise|purchase|goodwill|assets|liab|sales|cogs|arr|arpu|cac|marketcap|valuation|proceeds|amount|principal|interest|expense|balance|amortization|buyback|repurchase|cashflow|fcf)/i.test(
    key
  );
}

function isPercentKey(key?: string): boolean {
  if (!key) return false;
  return /(margin|growth|rate|yield|pct|percent|ownership|churn|tax|wacc|discount|terminal|payout|roe|irr|probability)/i.test(
    key
  );
}

function isMultipleKey(key?: string): boolean {
  if (!key) return false;
  return /(multiple|coverage|leverage|moic|ltv|turnover)/i.test(key);
}

function renderValue(value: unknown, key?: string): string {
  if (Array.isArray(value)) return value.map((item) => renderValue(item, key)).join(', ');
  if (typeof value === 'number') {
    if (isPercentKey(key)) {
      const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
      return `${percentValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    }
    if (isMultipleKey(key)) return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}x`;
    if (isCurrencyKey(key)) {
      return `$${value.toLocaleString('en-US', {
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      })}`;
    }
    if (Math.abs(value) >= 1000) return value.toLocaleString('en-US');
    if (value > 0 && value < 1) return `${(value * 100).toFixed(1)}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'n/a';
  return String(value);
}

function ObjectGrid(props: { title: string; values: Record<string, unknown>; emptyMessage: string }) {
  const entries = Object.entries(props.values);
  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">{props.title}</div>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--cb-text-muted)]">{props.emptyMessage}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{key}</div>
              <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{renderValue(value, key)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StringListCard(props: { title: string; values: string[]; emptyMessage: string }) {
  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">{props.title}</div>
      {props.values.length === 0 ? (
        <p className="text-sm text-[var(--cb-text-muted)]">{props.emptyMessage}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {props.values.map((value) => (
            <Badge key={value} variant="outline" className="border-[rgba(118,138,161,0.22)] text-[var(--cb-text-secondary)]">
              {value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function PromptToModel() {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0]);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [inputOverridesText, setInputOverridesText] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = window.localStorage.getItem('capitalbase-model-session');
    if (existing) {
      setSessionId(existing);
      return;
    }
    const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `session_${Date.now()}`;
    window.localStorage.setItem('capitalbase-model-session', next);
    setSessionId(next);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void loadRecentRuns(sessionId);
  }, [sessionId]);

  function parseOverrides(value: string = inputOverridesText): Record<string, unknown> | undefined {
    if (!value.trim()) return undefined;
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Assumption overrides must be a JSON object.');
    }
    return parsed as Record<string, unknown>;
  }

  async function loadRecentRuns(activeSessionId: string) {
    setRunsLoading(true);
    try {
      const response = await fetch(`/api/model-generator/runs?sessionId=${encodeURIComponent(activeSessionId)}&limit=6`);
      const payload = (await response.json()) as { runs?: RecentRun[] };
      setRecentRuns(Array.isArray(payload.runs) ? payload.runs : []);
    } catch {
      setRecentRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }

  async function requestPreview(nextPrompt?: string, nextClarification?: string, nextOverridesText?: string) {
    const activePrompt = (nextPrompt ?? prompt).trim();
    const activeClarification = (nextClarification ?? clarificationAnswer).trim();
    if (!activePrompt) return;

    setPreviewLoading(true);
    setGenerateLoading(false);
    setError(null);

    try {
      const overrides = parseOverrides(nextOverridesText ?? inputOverridesText);
      const response = await fetch('/api/model-generator/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: activePrompt,
          clarificationAnswer: activeClarification || undefined,
          sessionId: sessionId || undefined,
          inputOverrides: overrides,
        }),
      });
      const payload = (await response.json()) as PreviewResponse;
      setPreview(payload);
      if (!payload.supported) {
        setError(payload.message || 'Unsupported prompt.');
      }
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Unable to preview model.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleGenerate() {
    const activePrompt = prompt.trim();
    const activeClarification = clarificationAnswer.trim();
    if (!activePrompt || !preview?.supported || preview.needsClarification) return;

    setGenerateLoading(true);
    setError(null);

    try {
      const overrides = parseOverrides();
      const response = await fetch('/api/model-generator/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: JSON.stringify({
          prompt: activePrompt,
          clarificationAnswer: activeClarification || undefined,
          sessionId: sessionId || undefined,
          inputOverrides: overrides,
        }),
      });

      if (!response.ok) {
        const maybeJson = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(maybeJson?.error || 'Failed to generate workbook.');
      }

      const blob = await response.blob();
      const filenameMatch = response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || 'CapitalBase_Model.xlsx';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      if (sessionId) {
        await loadRecentRuns(sessionId);
        await requestPreview(activePrompt, activeClarification);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate workbook.');
    } finally {
      setGenerateLoading(false);
    }
  }

  const canGenerate = Boolean(preview?.supported && !preview.handoffOnly && !preview.needsClarification && !previewLoading && !generateLoading);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-[rgba(118,138,161,0.18)] bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(14,18,24,0.92))] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <CardHeader className="border-b border-[rgba(118,138,161,0.14)]">
          <CardTitle className="text-xl text-[var(--cb-text-primary)]">Prompt to Model</CardTitle>
          <CardDescription>
            Deterministic prompt parsing, visible provenance, saved reruns, downloadable finance-native Excel workbooks, and direct routing into the broader CapitalBase model catalog when a dedicated workflow already exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="model-generator-prompt">Prompt</Label>
            <Textarea
              id="model-generator-prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setPreview(null);
                setClarificationAnswer('');
                setError(null);
              }}
              placeholder="Describe the model you want to generate"
              className="min-h-[140px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-generator-overrides">Assumption Overrides (JSON)</Label>
            <Textarea
              id="model-generator-overrides"
              value={inputOverridesText}
              onChange={(event) => {
                setInputOverridesText(event.target.value);
                setError(null);
              }}
              placeholder='Optional. Example: {"wacc":0.095,"entryMultiple":10.5}'
              className="min-h-[92px] font-mono text-xs"
            />
            <p className="text-xs text-[var(--cb-text-muted)]">
              Use explicit overrides for reruns. Keys must match the extracted input field names.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setPrompt(example);
                  setClarificationAnswer('');
                  setPreview(null);
                  setError(null);
                  void requestPreview(example, '');
                }}
                className="rounded-full border border-[rgba(118,138,161,0.22)] bg-[rgba(255,255,255,0.02)] px-4 py-2 text-sm text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-green)] hover:text-[var(--cb-text-primary)]"
              >
                {example}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void requestPreview()} disabled={previewLoading || !prompt.trim()}>
              {previewLoading ? 'Analyzing Prompt…' : 'Preview Model'}
            </Button>
            {preview?.handoffOnly && preview.coreTemplateModel ? (
              <Button asChild variant="outline">
                <Link href={preview.coreTemplateModel.href}>
                  {preview.coreTemplateModel.surface === 'template_library' ? 'Open Model Wizard' : 'Open Builder'}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void handleGenerate()} disabled={!canGenerate}>
                {generateLoading ? 'Generating Workbook…' : 'Generate Model'}
              </Button>
            )}
            {error ? <p className="text-sm text-[#fda4af]">{error}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[rgba(118,138,161,0.18)] bg-[rgba(11,14,19,0.9)]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-lg text-[var(--cb-text-primary)]">Preview</CardTitle>
            {preview?.modelType ? <Badge variant="outline">{preview.modelType}</Badge> : null}
            {preview?.handoffOnly ? <Badge variant="outline">Workflow Handoff</Badge> : null}
            {preview?.supported ? <Badge>Supported</Badge> : <Badge variant="secondary">Waiting</Badge>}
            {preview?.needsClarification ? <Badge variant="outline">Clarification Required</Badge> : null}
            {preview?.recentRun?.versionNumber ? <Badge variant="outline">Latest Saved v{preview.recentRun.versionNumber}</Badge> : null}
          </div>
          <CardDescription>
            Review detected model type, provenance, comparison versus the latest saved version, and any one-step clarification before generating the workbook. If the prompt maps to a stronger native model workflow, this surface now hands off cleanly instead of forcing a weak generic generator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preview ? (
            <>
              {!preview.supported && preview.message ? (
                <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] p-4 text-sm text-[#fecaca]">
                  {preview.message}
                </div>
              ) : null}

              {preview.supported && preview.handoffOnly && preview.message ? (
                <div className="rounded-2xl border border-[rgba(59,130,246,0.28)] bg-[rgba(30,41,59,0.4)] p-4 text-sm text-[var(--cb-text-secondary)]">
                  {preview.message}
                </div>
              ) : null}

              {preview.coreTemplateModel ? <AnalystCoreTemplateCard payload={preview.coreTemplateModel} /> : null}

              {preview.previewSummary ? (
                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Model Preview</div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Model Name</div>
                        <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{preview.previewSummary.modelName}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Workbook Tabs</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {preview.previewSummary.tabs.map((tab) => (
                            <Badge key={tab} variant="outline" className="border-[rgba(118,138,161,0.22)] text-[var(--cb-text-secondary)]">
                              {tab}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <StringListCard title="Key Outputs" values={preview.previewSummary.keyOutputs} emptyMessage="No key outputs available." />
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <ObjectGrid
                  title="Data Provenance"
                  values={
                    preview.provenanceSummary
                      ? {
                          sourceType: preview.provenanceSummary.sourceType,
                          sources: preview.provenanceSummary.sources.join(', '),
                          asOfDate: preview.provenanceSummary.asOfDate,
                          lastSynced: preview.provenanceSummary.lastSynced,
                          fallbackUsed: preview.provenanceSummary.fallbackUsed.join(', ') || 'None',
                        }
                      : {}
                  }
                  emptyMessage="No provenance summary available."
                />
                <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Comparison View</div>
                  {preview.comparisonSummary ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                          <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Previous Version</div>
                          <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">v{preview.comparisonSummary.previousVersionNumber ?? 'n/a'}</div>
                        </div>
                        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                          <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Next Version</div>
                          <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">v{preview.comparisonSummary.currentVersionNumber ?? 'n/a'}</div>
                        </div>
                      </div>
                      <StringListCard
                        title="Changed Assumptions"
                        values={preview.comparisonSummary.changedKeys}
                        emptyMessage="No assumption changes detected versus the latest generated run."
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--cb-text-muted)]">No saved baseline yet. Generate a model to create a reusable run history.</p>
                  )}
                </div>
              </div>

              {preview.needsClarification && preview.clarificationQuestion ? (
                <div className="rounded-2xl border border-[rgba(245,158,11,0.36)] bg-[rgba(120,53,15,0.18)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#fde68a]">Clarification</div>
                  <p className="mt-2 text-sm text-[var(--cb-text-primary)]">{preview.clarificationQuestion}</p>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                      value={clarificationAnswer}
                      onChange={(event) => setClarificationAnswer(event.target.value)}
                      placeholder="Enter one concise assumption or company context"
                    />
                    <Button onClick={() => void requestPreview(prompt, clarificationAnswer)} disabled={previewLoading || !clarificationAnswer.trim()}>
                      {previewLoading ? 'Refreshing Preview…' : 'Update Preview'}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <ObjectGrid title="Extracted Inputs" values={preview.extractedInputs} emptyMessage="No extracted inputs yet." />
                <ObjectGrid title="Defaults Added" values={preview.defaultsUsed} emptyMessage="No defaults were required." />
              </div>
              <StringListCard title="Missing Inputs" values={preview.missingInputs} emptyMessage="No material inputs are missing from the prompt." />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-6 text-sm text-[var(--cb-text-muted)]">
              Enter a supported prompt and preview it to inspect model detection, missing inputs, defaults, provenance, and workbook structure.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[rgba(118,138,161,0.18)] bg-[rgba(11,14,19,0.9)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">Recent Runs</CardTitle>
          <CardDescription>Generated workbooks saved for this browser session. Load assumptions back into the workflow and rerun with explicit overrides.</CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="rounded-2xl border border-dashed border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-6 text-sm text-[var(--cb-text-muted)]">
              Loading recent runs…
            </div>
          ) : recentRuns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-6 text-sm text-[var(--cb-text-muted)]">
              No generated model history yet. Generate a workbook to create a reusable run history.
            </div>
          ) : (
            <div className="space-y-3">
              {recentRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.7)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{run.modelType}</Badge>
                        {run.latestVersion?.versionNumber ? <Badge>v{run.latestVersion.versionNumber}</Badge> : null}
                      </div>
                      <div className="text-sm font-medium text-[var(--cb-text-primary)]">{run.companyName || run.prompt}</div>
                      <div className="text-xs text-[var(--cb-text-muted)]">{run.prompt}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const nextOverrides = JSON.stringify(run.latestVersion?.assumptions ?? {}, null, 2);
                          setPrompt(run.prompt);
                          setClarificationAnswer('');
                          setInputOverridesText(nextOverrides);
                          setPreview(null);
                        }}
                      >
                        Load Assumptions
                      </Button>
                      <Button
                        onClick={() => {
                          const nextOverrides = JSON.stringify(run.latestVersion?.assumptions ?? {}, null, 2);
                          setPrompt(run.prompt);
                          setClarificationAnswer('');
                          setInputOverridesText(nextOverrides);
                          void requestPreview(run.prompt, '', nextOverrides);
                        }}
                      >
                        Preview Rerun
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                      <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Status</div>
                      <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{run.status}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                      <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Workbook</div>
                      <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{run.latestVersion?.workbookFilename || 'Generated workbook'}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                      <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">As Of</div>
                      <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{run.latestVersion?.provenance?.asOfDate || 'n/a'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

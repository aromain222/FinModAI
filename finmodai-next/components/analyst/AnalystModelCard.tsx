'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';

function renderValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => renderValue(item)).join(', ');
  }
  if (typeof value === 'number') {
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
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">{props.title}</div>
      {entries.length === 0 ? (
        <p className="text-xs text-[var(--cb-text-muted)]">{props.emptyMessage}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">{key}</div>
              <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{renderValue(value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnalystModelCard({ payload }: { payload: AnalystGeneratedModelPayload }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch('/api/analyst-chat/model-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: JSON.stringify({
          payload,
        }),
      });

      if (!response.ok) {
        const maybeJson = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(maybeJson?.error || 'Failed to export model workbook.');
      }

      const blob = await response.blob();
      const filenameMatch = response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `${payload.modelType}_Analyst_Chat.xlsx`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download workbook.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Prompt-to-Model Demo</CardTitle>
            <CardDescription>{payload.title}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{payload.modelType}</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()} disabled={isDownloading}>
              {isDownloading ? 'Preparing Excel…' : 'Download Excel'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {downloadError ? (
          <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
            {downloadError}
          </div>
        ) : null}

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Workbook Tabs</div>
          <div className="flex flex-wrap gap-2">
            {payload.tabs.map((tab) => (
              <Badge key={tab} variant="outline" className="border-[var(--cb-border-subtle)] text-[var(--cb-text-secondary)]">
                {tab}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Key Outputs</div>
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{payload.keyOutputs.join(', ')}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Source Provenance</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Source Type</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{payload.provenanceSummary.sourceType}</div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">As Of</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{payload.provenanceSummary.asOfDate ?? 'n/a'}</div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3 md:col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Sources</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                  {payload.provenanceSummary.sources.join(', ') || 'n/a'}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3 md:col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Fallback Used</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                  {payload.provenanceSummary.fallbackUsed.join(', ') || 'None'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Version Context</div>
            <div className="grid gap-3">
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Previous Run</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                  {payload.recentRun ? `Version ${payload.recentRun.versionNumber ?? 'n/a'} • ${payload.recentRun.status}` : 'No prior analyst chat run'}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Assumption Changes</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                  {payload.comparisonSummary?.changedKeys.length
                    ? payload.comparisonSummary.changedKeys.join(', ')
                    : 'No tracked changes versus prior saved version'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ObjectGrid title="Extracted Inputs" values={payload.extractedInputs as Record<string, unknown>} emptyMessage="No structured inputs were extracted." />
          <ObjectGrid title="Defaults Used" values={payload.defaultsUsed} emptyMessage="No defaults were required." />
        </div>

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Analyst Framing</div>
          <div className="space-y-3">
            {payload.narrativeBlocks.map((block) => (
              <div key={block.title} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">{block.title}</div>
                <div className="mt-2 text-sm leading-6 text-[var(--cb-text-primary)]">{block.body}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

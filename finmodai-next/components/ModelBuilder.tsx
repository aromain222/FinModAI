'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Summary = {
  company: string;
  ticker: string;
  years: number;
  wacc: number;
  terminal_method: 'gordon' | 'exit_multiple';
  terminal_g?: number;
  exit_multiple?: number;
  enterprise_value: number;
  warnings: string[];
};

type BuilderResult = {
  fileUrl: string;
  filename: string;
  summary: Summary | null;
};

const BUILDER_STEPS = [
  { title: 'Define Company', description: 'Describe the company and model request.', icon: Building2 },
  { title: 'Set Overrides', description: 'Tighten the valuation inputs only when needed.', icon: SlidersHorizontal },
  { title: 'Generate Workbook', description: 'Produce the Excel file and download-ready summary.', icon: CheckCircle2 },
] as const;

function parseContentDispositionFilename(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/filename="?([^";]+)"?/i);
  return match?.[1] || null;
}

function parseHeaderJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(decodeURIComponent(value)) as T;
  } catch {
    return null;
  }
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function ModelBuilder() {
  const [prompt, setPrompt] = useState('Generate a DCF model for Google');
  const [years, setYears] = useState('');
  const [wacc, setWacc] = useState('');
  const [terminalG, setTerminalG] = useState('');
  const [terminalMethod, setTerminalMethod] = useState<'gordon' | 'exit_multiple' | ''>('');
  const [exitMultiple, setExitMultiple] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BuilderResult | null>(null);

  useEffect(() => {
    return () => {
      if (result?.fileUrl) URL.revokeObjectURL(result.fileUrl);
    };
  }, [result?.fileUrl]);

  const canGenerate = useMemo(() => prompt.trim().length >= 3 && !loading, [prompt, loading]);
  const overrideCount = useMemo(
    () => [years, wacc, terminalG, terminalMethod, exitMultiple].filter((value) => String(value).trim().length > 0).length,
    [years, wacc, terminalG, terminalMethod, exitMultiple]
  );

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setLoading(true);
    setError(null);

    try {
      const overrides = {
        years: parseOptionalNumber(years),
        wacc: parseOptionalNumber(wacc),
        terminal_g: parseOptionalNumber(terminalG),
        terminal_method: terminalMethod || undefined,
        exit_multiple: parseOptionalNumber(exitMultiple),
      };

      const payload = {
        prompt: prompt.trim(),
        overrides: Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
      };

      const response = await fetch('/api/generate-dcf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const maybeJson = await response.json().catch(() => null);
        throw new Error(maybeJson?.error || 'Failed to generate DCF workbook');
      }

      const blob = await response.blob();
      const fileUrl = URL.createObjectURL(blob);
      const filename =
        parseContentDispositionFilename(response.headers.get('Content-Disposition')) ||
        'CapitalBase_DCF_Model.xlsx';
      const summary = parseHeaderJson<Summary>(response.headers.get('X-CapitalBase-DCF-Summary'));

      if (result?.fileUrl) URL.revokeObjectURL(result.fileUrl);
      setResult({ fileUrl, filename, summary });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate DCF workbook');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-[rgba(118,138,161,0.18)] bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(14,18,24,0.92))] shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
        <CardHeader className="border-b border-[rgba(118,138,161,0.14)]">
          <CardTitle className="text-xl text-[var(--cb-text-primary)]">Build the DCF in three steps</CardTitle>
          <CardDescription>
            Keep the prompt as the primary input, use overrides sparingly, then export a finance-native workbook with a quick valuation summary.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-[rgba(118,138,161,0.18)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-secondary)]">
              Prompt status: {prompt.trim() ? 'Defined' : 'Waiting'}
            </div>
            <div className="rounded-full border border-[rgba(118,138,161,0.18)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-secondary)]">
              Overrides: {overrideCount} active
            </div>
            <div className="rounded-full border border-[rgba(118,138,161,0.18)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-secondary)]">
              Output: Excel workbook
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {BUILDER_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-2xl border border-[rgba(118,138,161,0.16)] bg-[rgba(255,255,255,0.02)] p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(16,36,62,0.8)] text-white">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">
                      Step {index + 1}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[var(--cb-text-primary)]">{step.title}</div>
                  <div className="mt-1 text-sm text-[var(--cb-text-secondary)]">{step.description}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Step 1</div>
          <CardTitle>Define Company And Model Request</CardTitle>
          <CardDescription>
            Prompt the copilot in plain English. This stays as the main input to the generator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="model-builder-prompt">Prompt</Label>
            <Textarea
              id="model-builder-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Generate a DCF model for Google"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Step 2</div>
          <CardTitle>Set Assumption Overrides</CardTitle>
          <CardDescription>
            Use only when you want to force a known valuation input instead of relying on the extracted defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="override-years">Forecast Years</Label>
            <Input
              id="override-years"
              type="number"
              inputMode="numeric"
              value={years}
              onChange={(e) => setYears(e.target.value)}
              placeholder="5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="override-wacc">WACC (decimal)</Label>
            <Input
              id="override-wacc"
              type="number"
              step="0.001"
              value={wacc}
              onChange={(e) => setWacc(e.target.value)}
              placeholder="0.10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="override-terminal-method">Terminal Method</Label>
            <select
              id="override-terminal-method"
              value={terminalMethod}
              onChange={(e) => setTerminalMethod((e.target.value as 'gordon' | 'exit_multiple' | '') || '')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Use model default</option>
              <option value="gordon">gordon</option>
              <option value="exit_multiple">exit_multiple</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="override-terminal-g">Terminal g (decimal)</Label>
            <Input
              id="override-terminal-g"
              type="number"
              step="0.001"
              value={terminalG}
              onChange={(e) => setTerminalG(e.target.value)}
              placeholder="0.025"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="override-exit-multiple">Exit Multiple (if exit_multiple method)</Label>
            <Input
              id="override-exit-multiple"
              type="number"
              step="0.1"
              value={exitMultiple}
              onChange={(e) => setExitMultiple(e.target.value)}
              placeholder="12"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Step 3</div>
          <CardTitle>Generate Workbook Output</CardTitle>
          <CardDescription>
            Build the DCF workbook, then review the valuation summary and download the Excel file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!canGenerate} onClick={handleGenerate}>
              {loading ? 'Generating DCF…' : 'Generate DCF'}
            </Button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        </CardContent>
      </Card>

      {result?.summary && (
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">
              <FileSpreadsheet className="h-4 w-4" />
              Workbook Output
            </div>
            <CardTitle>Model Summary</CardTitle>
            <CardDescription>
              {result.summary.company} ({result.summary.ticker})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <p>
                <span className="font-medium">Years:</span> {result.summary.years}
              </p>
              <p>
                <span className="font-medium">WACC:</span> {(result.summary.wacc * 100).toFixed(2)}%
              </p>
              <p>
                <span className="font-medium">Terminal Method:</span> {result.summary.terminal_method}
              </p>
              <p>
                <span className="font-medium">Terminal Input:</span>{' '}
                {result.summary.terminal_method === 'gordon'
                  ? `${((result.summary.terminal_g || 0) * 100).toFixed(2)}%`
                  : `${(result.summary.exit_multiple || 0).toFixed(2)}x`}
              </p>
              <p className="md:col-span-2">
                <span className="font-medium">Base Case EV:</span> ${result.summary.enterprise_value.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {result.summary.warnings.length > 0 && (
              <div>
                <p className="font-medium">Sanity Warnings</p>
                <ul className="list-disc pl-5">
                  {result.summary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <Button asChild>
                <a href={result.fileUrl} download={result.filename}>
                  Download .xlsx
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

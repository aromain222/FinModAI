"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/branding';
import { DownloadWorkbookButton } from '@/components/models/DownloadWorkbookButton';
import type { LboAdvancedOptions } from '@/types/lbo';

type ModelType = 'dcf' | 'comps' | 'lbo';

type AdvancedLboFormState = {
  managementRolloverPct: string;
  preferredEquityAmount: string;
  subordinatedNotesAmount: string;
  minimumCashAtClose: string;
};

const createDefaultAdvancedLboState = (): AdvancedLboFormState => ({
  managementRolloverPct: '',
  preferredEquityAmount: '',
  subordinatedNotesAmount: '',
  minimumCashAtClose: '',
});

const MODEL_OPTIONS: { value: ModelType; label: string; description: string }[] = [
  { value: 'dcf', label: 'DCF', description: 'Multi-stage cash flow model with terminal value controls.' },
  { value: 'comps', label: 'Comps', description: 'Comparable companies with trading multiples output.' },
  { value: 'lbo', label: 'LBO', description: 'Leverage, debt paydown, and sponsor IRR analysis.' }
];

export default function CreateModelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ticker, setTicker] = useState('');
  const [modelType, setModelType] = useState<ModelType>(() => {
    const param = searchParams?.get('type');
    return isModelType(param) ? param : 'dcf';
  });
  const [includeScenario, setIncludeScenario] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioNotes, setScenarioNotes] = useState('');
  const [includeAssumptions, setIncludeAssumptions] = useState(false);
  const [assumptionsText, setAssumptionsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedLbo, setShowAdvancedLbo] = useState(false);
  const [advancedLboForm, setAdvancedLboForm] = useState<AdvancedLboFormState>(() => createDefaultAdvancedLboState());
  const [downloadRequest, setDownloadRequest] = useState<Record<string, any> | null>(null);
  const [downloadTicker, setDownloadTicker] = useState<string | null>(null);
  const [downloadModelType, setDownloadModelType] = useState<ModelType | null>(null);

  useEffect(() => {
    const param = searchParams?.get('type');
    if (isModelType(param)) {
      setModelType(param);
    }
  }, [searchParams]);

  useEffect(() => {
    if (modelType !== 'lbo') {
      setShowAdvancedLbo(false);
      setAdvancedLboForm(createDefaultAdvancedLboState());
    }
  }, [modelType]);

  const handleAdvancedInputChange = (field: keyof AdvancedLboFormState, value: string) => {
    setAdvancedLboForm((prev) => ({ ...prev, [field]: value }));
  };

  const parseAdvancedNumber = (value: string): number | undefined => {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.toString().trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const normalizeAdvancedLboOptions = (): LboAdvancedOptions | undefined => {
    if (modelType !== 'lbo') {
      return undefined;
    }
    const normalized: LboAdvancedOptions = {};
    const pctValue = parseAdvancedNumber(advancedLboForm.managementRolloverPct);
    if (pctValue !== undefined && pctValue > 0) {
      normalized.managementRolloverPct = Math.min(Math.max(pctValue / 100, 0), 0.9);
    }
    const preferred = parseAdvancedNumber(advancedLboForm.preferredEquityAmount);
    if (preferred !== undefined && preferred > 0) {
      normalized.preferredEquityAmount = preferred;
    }
    const subNotes = parseAdvancedNumber(advancedLboForm.subordinatedNotesAmount);
    if (subNotes !== undefined && subNotes > 0) {
      normalized.subordinatedNotesAmount = subNotes;
    }
    const minCash = parseAdvancedNumber(advancedLboForm.minimumCashAtClose);
    if (minCash !== undefined && minCash > 0) {
      normalized.minimumCashAtClose = minCash;
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTicker = ticker.trim().toUpperCase();
    if (!trimmedTicker || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const advancedLboPayload = normalizeAdvancedLboOptions();
      const requestPayload: Record<string, any> = {
        modelType,
        ticker: trimmedTicker,
      };
      if (advancedLboPayload) {
        requestPayload.lboAdvanced = advancedLboPayload;
      }
      setDownloadRequest(requestPayload);
      setDownloadTicker(trimmedTicker);
      setDownloadModelType(modelType);
    } catch (err) {
      console.error('Generate model error:', err);
      setError(err instanceof Error ? err.message : 'Unexpected error while generating model.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <BackButton />
        <Link
          href="/models"
          className="inline-flex items-center text-sm text-muted-foreground transition hover:text-secondary"
        >
          ← Back to Models
        </Link>

        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-cb-blue">{APP_NAME}</p>
          <h1 className="text-3xl font-semibold text-cb-ink">Create financial model</h1>
          <p className="text-sm text-cb-slate">
            Enter a ticker, choose a model type, and optionally add scenario engine inputs and custom assumptions.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="ticker">Ticker</Label>
            <Input
              id="ticker"
              name="ticker"
              placeholder="AAPL, MSFT, SOFI"
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              required
            />
          </div>

          <div className="space-y-3">
            <Label>Model type</Label>
            <div className="grid gap-3 md:grid-cols-3">
              {MODEL_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  htmlFor={`model-type-${option.value}`}
                  className={cn(
                    'cursor-pointer rounded-2xl border p-4 transition',
                    modelType === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold text-secondary">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    <input
                      type="radio"
                      id={`model-type-${option.value}`}
                      className="h-4 w-4 accent-primary"
                      name="model-type"
                      value={option.value}
                      checked={modelType === option.value}
                      onChange={() => setModelType(option.value)}
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="includeScenario" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                id="includeScenario"
                name="includeScenario"
                className="h-4 w-4 accent-primary"
                checked={includeScenario}
                onChange={(event) => setIncludeScenario(event.target.checked)}
              />
              Include Scenario Engine configuration
            </Label>
            {includeScenario && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scenario-name">Scenario name</Label>
                  <Input
                    id="scenario-name"
                    name="scenario-name"
                    placeholder="Base Case, Bull Case..."
                    value={scenarioName}
                    onChange={(event) => setScenarioName(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="scenario-notes">Scenario notes</Label>
                  <Textarea
                    id="scenario-notes"
                    name="scenario-notes"
                    placeholder="Base case growth rate 8%, WACC 9%..."
                    value={scenarioNotes}
                    onChange={(event) => setScenarioNotes(event.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="includeAssumptions" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                id="includeAssumptions"
                name="includeAssumptions"
                className="h-4 w-4 accent-primary"
                checked={includeAssumptions}
                onChange={(event) => setIncludeAssumptions(event.target.checked)}
              />
              Include custom assumptions
            </Label>
            {includeAssumptions && (
              <div className="space-y-2">
                <Label htmlFor="assumptions-text">Assumptions</Label>
                <Textarea
                  id="assumptions-text"
                  name="assumptions-text"
                  placeholder="Revenue CAGR, margin targets, capex cadence, macro context..."
                  value={assumptionsText}
                  onChange={(event) => setAssumptionsText(event.target.value)}
                  rows={4}
                />
              </div>
            )}
          </div>

          {modelType === 'lbo' && (
            <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-secondary">Advanced LBO Options</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvancedLbo((prev) => !prev)}
                >
                  {showAdvancedLbo ? 'Hide Options' : 'Show Options'}
                </Button>
              </div>
              {showAdvancedLbo && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="lite-lbo-rollover">Management rollover (% of equity)</Label>
                    <Input
                      id="lite-lbo-rollover"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={advancedLboForm.managementRolloverPct}
                      onChange={(event) =>
                        handleAdvancedInputChange('managementRolloverPct', event.target.value)
                      }
                      placeholder="5"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lite-lbo-preferred">Preferred equity ($MM)</Label>
                    <Input
                      id="lite-lbo-preferred"
                      type="number"
                      min={0}
                      step={0.1}
                      value={advancedLboForm.preferredEquityAmount}
                      onChange={(event) =>
                        handleAdvancedInputChange('preferredEquityAmount', event.target.value)
                      }
                      placeholder="20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lite-lbo-sub-notes">Subordinated notes ($MM)</Label>
                    <Input
                      id="lite-lbo-sub-notes"
                      type="number"
                      min={0}
                      step={0.1}
                      value={advancedLboForm.subordinatedNotesAmount}
                      onChange={(event) =>
                        handleAdvancedInputChange('subordinatedNotesAmount', event.target.value)
                      }
                      placeholder="30"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lite-lbo-min-cash">Minimum cash at close ($MM)</Label>
                    <Input
                      id="lite-lbo-min-cash"
                      type="number"
                      min={0}
                      step={0.1}
                      value={advancedLboForm.minimumCashAtClose}
                      onChange={(event) =>
                        handleAdvancedInputChange('minimumCashAtClose', event.target.value)
                      }
                      placeholder="50"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={loading || !ticker.trim()} className="w-full sm:w-auto">
              {loading ? 'Preparing…' : 'Prepare download'}
            </Button>
            <Button asChild variant="ghost" className="w-full sm:w-auto">
              <Link href="/models">Back to Models</Link>
            </Button>
          </div>
          {downloadRequest && downloadTicker && downloadModelType && (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
              <p className="text-sm font-semibold text-secondary">
                {downloadTicker} — {downloadModelType.toUpperCase()} workbook ready
              </p>
              <p className="text-xs text-muted-foreground">Click below to download the full Excel model.</p>
              <DownloadWorkbookButton
                className="mt-3"
                ticker={downloadTicker}
                modelType={downloadModelType}
                requestBody={downloadRequest}
              />
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

function isModelType(value: string | null): value is ModelType {
  return value === 'dcf' || value === 'comps' || value === 'lbo';
}

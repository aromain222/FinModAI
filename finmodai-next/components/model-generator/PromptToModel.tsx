'use client';

import Link from 'next/link';
import { AnalystCoreTemplateCard } from '@/components/analyst/AnalystCoreTemplateCard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, FileSpreadsheet, Search, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AnalystCoreTemplatePayload } from '@/lib/analyst/coreModelTemplates';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import { calculateDebtCapacityPreview } from '@/lib/model-generator/debtCapacitySummary';
import { calculateMergerSummary } from '@/lib/model-generator/mergerSummary';
import type { ComparisonSummary, ProvenanceSummary } from '@/lib/model-generator/runHistory';
import { cn } from '@/lib/utils';

type PreviewSummary = {
  modelName: string;
  tabs: string[];
  keyOutputs: string[];
  decisionQuestion?: string;
  whatToEditFirst?: string[];
  reviewStandard?: string;
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
  macroContext?: string;
  macroAssumptions?: Array<{
    key: string;
    label: string;
    displayValue: string;
    relevance: string;
    source: string;
  }>;
  catalystContext?: string | null;
  companyCatalystContext?: {
    calendarItems: Array<{
      title: string;
      displayDate: string;
      relevance: string;
    }>;
    ownershipItems: Array<{
      label: string;
      displayValue: string;
      relevance: string;
    }>;
    transcriptItems: Array<{
      label: string;
      excerpt: string;
    }>;
  } | null;
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
  'Value Nvidia on a DCF basis',
  'Run a trading comps analysis for Snowflake versus cloud software peers',
  'Size debt capacity for Netflix at 5.0x leverage and 2.5x minimum coverage',
  'Run accretion / dilution for Microsoft acquiring Salesforce at $95B with 60% cash and 40% stock',
  'Build a banker-style football field for Salesforce',
  'Frame a precedent transactions range for Mastercard',
  'Underwrite an LBO for Oracle',
  'Build a revenue recognition ASC 606 model',
];

const WIZARD_STEPS = [
  { title: 'Frame The Ask', description: 'State the valuation, deal, or underwriting question in banker language.', icon: Search },
  { title: 'Review Extracted Workstream', description: 'Check the subject, valuation anchors, provenance, and missing items.', icon: SlidersHorizontal },
  { title: 'Generate Banker Output', description: 'Export the workbook and memo-ready package once the extracted setup is right.', icon: CheckCircle2 },
] as const;

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

function formatCompactMetric(value: unknown, kind: 'currency' | 'percent' | 'multiple' | 'number' = 'number'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (kind === 'currency') {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 1 })}`;
  }
  if (kind === 'percent') {
    const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
    return `${percentValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  }
  if (kind === 'multiple') {
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}x`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function formatModelMoney(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
}

function renderModelSpecificReview(preview: PreviewResponse) {
  if (!preview.modelType) return null;

  if (preview.modelType === 'COMPS') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    const subject = (extracted.subject ?? {}) as Record<string, unknown>;
    const peers = Array.isArray(extracted.peers) ? (extracted.peers as Array<Record<string, unknown>>) : [];
    const selectedMultiples = (extracted.selectedMultiples ?? {}) as Record<string, unknown>;
    return (
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Subject Snapshot</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div><span className="font-medium text-[var(--cb-text-primary)]">{String(subject.name ?? extracted.companyName ?? 'Subject')}</span>{subject.ticker ? ` (${String(subject.ticker)})` : ''}</div>
            <div>Revenue: {formatCompactMetric(subject.revenue, 'currency')}</div>
            <div>EBITDA: {formatCompactMetric(subject.ebitda, 'currency')}</div>
            <div>Price: {formatCompactMetric(subject.price, 'currency')}</div>
          </div>
        </div>
        <StringListCard
          title="Peer Set"
          values={peers.map((peer) => `${String(peer.ticker ?? '')}${peer.name ? ` — ${String(peer.name)}` : ''}`).filter((value) => value.trim().length > 0)}
          emptyMessage="No peers resolved yet."
        />
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Selected Multiples</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>EV / Revenue: {formatCompactMetric(selectedMultiples.evToRevenue, 'multiple')}</div>
            <div>EV / EBITDA: {formatCompactMetric(selectedMultiples.evToEbitda, 'multiple')}</div>
            <div>P / E: {formatCompactMetric(selectedMultiples.peRatio, 'multiple')}</div>
          </div>
        </div>
      </div>
    );
  }

  if (preview.modelType === 'PRECEDENTS') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    const transactions = Array.isArray(extracted.transactions) ? (extracted.transactions as Array<Record<string, unknown>>) : [];
    const previewDeals = transactions.slice(0, 4).map((transaction) => {
      const revenueMultiple = formatCompactMetric(transaction.revenueMultiple, 'multiple');
      const ebitdaMultiple = formatCompactMetric(transaction.ebitdaMultiple, 'multiple');
      const premium = formatCompactMetric(transaction.premium, 'percent');
      return `${String(transaction.target ?? 'Target')} / ${String(transaction.acquirer ?? 'Buyer')} — ${revenueMultiple} EV/Rev, ${ebitdaMultiple} EV/EBITDA, ${premium} premium`;
    });
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Transaction Set</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Subject Revenue: {formatCompactMetric(extracted.subjectRevenue, 'currency')}</div>
            <div>Subject EBITDA: {formatCompactMetric(extracted.subjectEbitda, 'currency')}</div>
            <div>Transaction Count: {formatCompactMetric(extracted.transactionCount, 'number')}</div>
            <div>Anchor Revenue Multiple: {formatCompactMetric(extracted.revenueMultiple, 'multiple')}</div>
            <div>Anchor EBITDA Multiple: {formatCompactMetric(extracted.ebitdaMultiple, 'multiple')}</div>
          </div>
        </div>
        <StringListCard
          title="Selected Transactions"
          values={previewDeals}
          emptyMessage="No precedent transactions resolved yet."
        />
      </div>
    );
  }

  if (preview.modelType === 'DEBT_CAPACITY_LITE') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    const summary = calculateDebtCapacityPreview(extracted as any);
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Credit Anchor</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>EBITDA: {formatModelMoney(extracted.ebitda)}</div>
            <div>Current Net Debt: {formatModelMoney(extracted.currentNetDebt)}</div>
            <div>Company: {String(extracted.companyName ?? 'n/a')}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Underwriting Assumptions</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Max Leverage: {formatCompactMetric(extracted.maxLeverage, 'multiple')}</div>
            <div>Min Interest Coverage: {formatCompactMetric(extracted.minInterestCoverage, 'multiple')}</div>
            <div>Interest Rate: {formatCompactMetric(extracted.interestRate, 'percent')}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Capacity Read</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Selected Max Debt: {summary ? formatModelMoney(summary.maxDebt) : 'n/a'}</div>
            <div>Binding Constraint: {summary ? String(summary.bindingConstraint) : 'n/a'}</div>
            <div>Headroom vs Net Debt: {summary ? formatModelMoney(summary.headroomVsNetDebt) : 'n/a'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (preview.modelType === 'FOOTBALL_FIELD') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    const ranges = Array.isArray(extracted.ranges) ? (extracted.ranges as Array<Record<string, unknown>>) : [];
    const previewRanges = ranges.map((range) => {
      const midValue = formatCompactMetric(range.midValue, 'currency');
      const midPrice = formatCompactMetric(range.midPrice, 'currency');
      return `${String(range.label ?? 'Method')} — mid EV ${midValue}${midPrice !== 'n/a' ? `, mid price ${midPrice}` : ''}`;
    });
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Subject Anchor</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Revenue: {formatCompactMetric(extracted.revenue, 'currency')}</div>
            <div>EBITDA: {formatCompactMetric(extracted.ebitda, 'currency')}</div>
            <div>Net Debt: {formatCompactMetric(extracted.netDebt, 'currency')}</div>
            <div>Current Price: {formatCompactMetric(extracted.sharePrice, 'currency')}</div>
          </div>
        </div>
        <StringListCard
          title="Valuation Methods"
          values={previewRanges}
          emptyMessage="No valuation methods resolved yet."
        />
      </div>
    );
  }

  if (preview.modelType === 'MERGER') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    const mergerSummary = calculateMergerSummary(extracted as any);
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Deal Terms</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Acquirer: {String(extracted.acquirerName ?? 'n/a')}{extracted.acquirerTicker ? ` (${String(extracted.acquirerTicker)})` : ''}</div>
            <div>Target: {String(extracted.targetName ?? 'n/a')}{extracted.targetTicker ? ` (${String(extracted.targetTicker)})` : ''}</div>
            <div>Purchase Price: {formatModelMoney(extracted.purchasePrice)}</div>
            <div>Structure: {String(extracted.dealStructure ?? 'n/a')}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Financing Mix</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Cash: {formatCompactMetric(extracted.cashPct, 'percent')}</div>
            <div>Stock: {formatCompactMetric(extracted.stockPct, 'percent')}</div>
            <div>Debt: {formatCompactMetric(extracted.debtPct, 'percent')}</div>
            <div>New Debt Rate: {formatCompactMetric(extracted.newDebtRate, 'percent')}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">EPS Bridge</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Standalone EPS: {formatCompactMetric(mergerSummary.standaloneEps, 'number')}</div>
            <div>Pro Forma EPS: {formatCompactMetric(mergerSummary.proFormaEps, 'number')}</div>
            <div>Accretion / Dilution: {formatCompactMetric(mergerSummary.epsAccretionPct, 'percent')}</div>
            <div>Pro Forma EBITDA: {formatModelMoney(mergerSummary.proFormaEbitda)}</div>
          </div>
        </div>
      </div>
    );
  }

  if (preview.modelType === 'LBO') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Entry Case</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Revenue: {formatCompactMetric(extracted.revenue, 'currency')}</div>
            <div>EBITDA: {formatCompactMetric(extracted.ebitda, 'currency')}</div>
            <div>Entry Multiple: {formatCompactMetric(extracted.entryMultiple, 'multiple')}</div>
            <div>Net Debt: {formatCompactMetric(extracted.netDebt, 'currency')}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Financing Mix</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Debt: {formatCompactMetric(extracted.debtPercent, 'percent')}</div>
            <div>Equity: {formatCompactMetric(extracted.equityPercent, 'percent')}</div>
            <div>Interest Rate: {formatCompactMetric(extracted.interestRate, 'percent')}</div>
            <div>Cash Sweep: {formatCompactMetric(extracted.cashSweepPercent, 'percent')}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Exit Underwrite</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Exit Multiple: {formatCompactMetric(extracted.exitMultiple, 'multiple')}</div>
            <div>Hold Period: {formatCompactMetric(extracted.holdingPeriodYears, 'number')} years</div>
            <div>Revenue Growth: {Array.isArray(extracted.revenueGrowth) ? (extracted.revenueGrowth as number[]).map((value) => formatCompactMetric(value, 'percent')).join(', ') : 'n/a'}</div>
            <div>EBITDA Margin: {formatCompactMetric(extracted.ebitdaMargin, 'percent')}</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export function PromptToModel() {
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0]);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [inputOverridesText, setInputOverridesText] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const hydratedPromptRef = useRef<string | null>(null);

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

  const prefilledPrompt = searchParams.get('prompt')?.trim() ?? '';

  const parseOverrides = useCallback((value: string = inputOverridesText): Record<string, unknown> | undefined => {
    if (!value.trim()) return undefined;
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Assumption overrides must be a JSON object.');
    }
    return parsed as Record<string, unknown>;
  }, [inputOverridesText]);

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

  const requestPreview = useCallback(async (nextPrompt?: string, nextClarification?: string, nextOverridesText?: string) => {
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
  }, [clarificationAnswer, inputOverridesText, parseOverrides, prompt, sessionId]);

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

  async function handleGenerateReport() {
    if (!preview?.supported || preview.handoffOnly || preview.needsClarification || reportLoading || !preview.modelType) return;

    setReportLoading(true);
    setReportError(null);

    try {
      const extractedInputs = preview.extractedInputs as Record<string, unknown>;
      const response = await fetch('/api/generateReport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker:
            typeof extractedInputs.ticker === 'string'
              ? extractedInputs.ticker
              : typeof extractedInputs.acquirerTicker === 'string' && typeof extractedInputs.targetTicker === 'string'
                ? `${extractedInputs.acquirerTicker}/${extractedInputs.targetTicker}`
                : undefined,
          companyName:
            typeof extractedInputs.companyName === 'string'
              ? extractedInputs.companyName
              : typeof extractedInputs.acquirerName === 'string' && typeof extractedInputs.targetName === 'string'
                ? `${extractedInputs.acquirerName} / ${extractedInputs.targetName}`
                : typeof extractedInputs.acquirerName === 'string'
                  ? extractedInputs.acquirerName
                  : typeof extractedInputs.targetName === 'string'
                    ? extractedInputs.targetName
                    : typeof extractedInputs.name === 'string'
                      ? extractedInputs.name
                      : undefined,
          asOfDate: preview.provenanceSummary?.asOfDate,
          modelType: preview.modelType,
          modelData: {
            extractedInputs: preview.extractedInputs,
            defaultsUsed: preview.defaultsUsed,
            provenanceSummary: preview.provenanceSummary,
            comparisonSummary: preview.comparisonSummary,
          },
          reportInput: {
            highLevelNotes: `Prompt run: ${prompt.trim()}`,
          },
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Failed to generate report PDF.');
      }

      const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : null;
      if (!pdfBase64) {
        throw new Error('Report generated but PDF output was missing.');
      }

      const binary = atob(pdfBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${preview.modelType.toLowerCase()}_capitalbase_report.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Unable to generate report.');
    } finally {
      setReportLoading(false);
    }
  }

  const canGenerate = Boolean(preview?.supported && !preview.handoffOnly && !preview.needsClarification && !previewLoading && !generateLoading);
  const resolvedModelLabel = preview?.previewSummary?.modelName ?? preview?.modelType ?? 'Waiting';
  const canGenerateReport = Boolean(
    preview?.supported &&
      !preview.handoffOnly &&
      !preview.needsClarification &&
      !reportLoading &&
      (preview?.modelType === 'FOOTBALL_FIELD' || preview?.modelType === 'MERGER' || preview?.modelType === 'DEBT_CAPACITY_LITE')
  );

  useEffect(() => {
    if (!prefilledPrompt) return;
    if (hydratedPromptRef.current === prefilledPrompt) return;
    hydratedPromptRef.current = prefilledPrompt;
    setPrompt(prefilledPrompt);
    setClarificationAnswer('');
    setPreview(null);
    setError(null);
    void requestPreview(prefilledPrompt, '', '');
  }, [prefilledPrompt, requestPreview]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-[rgba(118,138,161,0.18)] bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(14,18,24,0.92))] shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
        <CardHeader className="border-b border-[rgba(118,138,161,0.14)]">
          <CardTitle className="text-xl text-[var(--cb-text-primary)]">Build the banker workflow in three steps</CardTitle>
          <CardDescription>
            Keep the flow structured: frame the workstream, inspect the deterministic preview, then generate the workbook or route into the stronger native wizard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-[rgba(118,138,161,0.18)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-secondary)]">
              Model: {resolvedModelLabel}
            </div>
            <div className="rounded-full border border-[rgba(118,138,161,0.18)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-secondary)]">
              Session runs: {recentRuns.length}
            </div>
            <div className="rounded-full border border-[rgba(118,138,161,0.18)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-secondary)]">
              Output: Excel workbook
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {WIZARD_STEPS.map((step, index) => {
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

      <Card className="overflow-hidden border-[rgba(118,138,161,0.18)] bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(14,18,24,0.92))] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <CardHeader className="border-b border-[rgba(118,138,161,0.14)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Step 1</div>
          <CardTitle className="text-xl text-[var(--cb-text-primary)]">Describe The Banker Ask</CardTitle>
          <CardDescription>
            Deterministic prompt parsing, visible provenance, saved reruns, downloadable finance-native workbooks, and direct routing into the broader CapitalBase model catalog when a dedicated workflow already exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="model-generator-prompt">Banking Prompt</Label>
            <Textarea
              id="model-generator-prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setPreview(null);
                setClarificationAnswer('');
                setError(null);
              }}
              placeholder="Example: Run a trading comps analysis for Snowflake versus cloud software peers"
              className="min-h-[140px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-generator-overrides">Underwriting Overrides (JSON)</Label>
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
              {previewLoading ? 'Analyzing Banker Prompt…' : 'Preview Workstream'}
            </Button>
            {preview?.handoffOnly && preview.coreTemplateModel ? (
              <Button asChild variant="outline">
                <Link href={preview.coreTemplateModel.href}>
                  {preview.coreTemplateModel.surface === 'template_library' ? 'Open Model Wizard' : 'Open Builder'}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void handleGenerate()} disabled={!canGenerate}>
                {generateLoading ? 'Generating Banker Output…' : 'Generate Banker Output'}
              </Button>
            )}
            {preview?.modelType === 'FOOTBALL_FIELD' || preview?.modelType === 'MERGER' || preview?.modelType === 'DEBT_CAPACITY_LITE' ? (
              <Button variant="outline" onClick={() => void handleGenerateReport()} disabled={!canGenerateReport}>
                {reportLoading ? 'Generating Report PDF…' : 'Generate Report PDF'}
              </Button>
            ) : null}
            {error ? <p className="text-sm text-[#fda4af]">{error}</p> : null}
            {reportError ? <p className="text-sm text-[#fda4af]">{reportError}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[rgba(118,138,161,0.18)] bg-[rgba(11,14,19,0.9)]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Step 2</div>
            <CardTitle className="text-lg text-[var(--cb-text-primary)]">Review Structured Workstream</CardTitle>
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
                <div className="space-y-4">
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

                  {(preview.previewSummary.decisionQuestion || preview.previewSummary.reviewStandard || preview.previewSummary.whatToEditFirst?.length) ? (
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Decision Question</div>
                        <p className="text-sm leading-6 text-[var(--cb-text-secondary)]">
                          {preview.previewSummary.decisionQuestion ?? 'No decision framing available.'}
                        </p>
                      </div>
                      <StringListCard
                        title="Edit First"
                        values={preview.previewSummary.whatToEditFirst ?? []}
                        emptyMessage="No priority edits listed."
                      />
                      <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Review Standard</div>
                        <p className="text-sm leading-6 text-[var(--cb-text-secondary)]">
                          {preview.previewSummary.reviewStandard ?? 'No review guidance available.'}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {preview.macroContext || (preview.macroAssumptions && preview.macroAssumptions.length > 0) ? (
                    <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
                      <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Market Context</div>
                        <p className="text-sm leading-6 text-[var(--cb-text-secondary)]">
                          {preview.macroContext ?? 'No shared macro assumptions available.'}
                        </p>
                      </div>
                      <ObjectGrid
                        title="Macro Assumptions"
                        values={Object.fromEntries(
                          (preview.macroAssumptions ?? []).map((item) => [
                            item.label,
                            `${item.displayValue} (${item.relevance})`,
                          ]),
                        )}
                        emptyMessage="No macro assumptions available."
                      />
                    </div>
                  ) : null}

                  {preview.catalystContext || preview.companyCatalystContext ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
                        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Company Catalyst Context</div>
                          <p className="text-sm leading-6 text-[var(--cb-text-secondary)]">
                            {preview.catalystContext ?? 'No company-specific catalyst context available.'}
                          </p>
                        </div>
                        <StringListCard
                          title="Catalyst Calendar"
                          values={(preview.companyCatalystContext?.calendarItems ?? []).map(
                            (item) => `${item.title} — ${item.displayDate} (${item.relevance})`,
                          )}
                          emptyMessage="No catalyst calendar items available."
                        />
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <StringListCard
                          title="Ownership / Insider / Buyback"
                          values={(preview.companyCatalystContext?.ownershipItems ?? []).map(
                            (item) => `${item.label}: ${item.displayValue} (${item.relevance})`,
                          )}
                          emptyMessage="No ownership or buyback context available."
                        />
                        <StringListCard
                          title="Transcript Catalysts"
                          values={(preview.companyCatalystContext?.transcriptItems ?? []).map(
                            (item) => `${item.label}: ${item.excerpt}`,
                          )}
                          emptyMessage="No transcript catalyst excerpts available."
                        />
                      </div>
                    </div>
                  ) : null}

                  {renderModelSpecificReview(preview)}
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

              <div className="rounded-2xl border border-[rgba(118,138,161,0.18)] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Step 3</div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--cb-text-primary)]">Generate Workbook Output</div>
                      <div className="mt-1 text-sm text-[var(--cb-text-secondary)]">
                        Use the structured preview as the gating check. When it looks right, export the workbook or open the stronger native workflow.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-[rgba(118,138,161,0.16)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-secondary)]">
                    <FileSpreadsheet className="h-4 w-4" />
                    {preview?.modelType === 'FOOTBALL_FIELD' || preview?.modelType === 'MERGER' || preview?.modelType === 'DEBT_CAPACITY_LITE'
                      ? 'Excel + memo-ready path'
                      : 'Excel-ready path'}
                  </div>
                </div>
              </div>
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Run History</div>
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
                        <Badge variant="outline" className={cn(run.modelType === preview?.modelType && 'border-[var(--cb-green)] text-[var(--cb-text-primary)]')}>
                          {run.modelType}
                        </Badge>
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

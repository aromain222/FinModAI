'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import type { FormEvent, RefObject } from 'react';
import { FormattedTextBlock } from '@/components/ui/formatted-text-block';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import type { AttachmentStatusPayload as AnalystAttachmentStatus } from '@/lib/analyst/attachmentStatus';
import type { AnalystCoreTemplatePayload } from '@/lib/analyst/coreModelTemplates';
import {
  normalizeAnalystOutput,
  type AnalystOutput,
  type InvestmentSignal,
} from '@/lib/analyst/investmentOutput';
import {
  getTeslaDemoGuidedHint,
  isTeslaTicker,
  type AnalystDemoStep,
} from '@/lib/analyst/demoWorkflow';
import type { AnalystDcfAdjustment, AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import { supportsSmartAssumptionAdjustment } from '@/lib/analyst/modelAdjustmentHelpers';
import type { PendingModelRequest } from '@/lib/analyst/modelReadiness';
import {
  buildScenarioDcfAdjustmentFromPayload,
  buildScenarioStructuredModelOverridesFromPayload,
  type AnalystScenarioCardPayload,
} from '@/lib/analyst/scenarioCard';
import type { AnalystGeneratedModelPayload, AnalystStructuredModelAdjustment } from '@/lib/analyst/types';
import type { AnalystVisualizationPayload } from '@/lib/analyst/visualization';
import type { AnalystEarningsSummaryCard } from '@/lib/analyst/earningsSummary';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';
import type { CompanyInfoResponse } from '@/app/api/company-info/route';
import type { AppExecutionTrace } from '@/lib/debug/executionTrace';

const AnalystDcfCard = dynamic(
  () => import('@/components/analyst/AnalystDcfCard').then((mod) => mod.AnalystDcfCard)
);
const AnalystCoreTemplateCard = dynamic(
  () => import('@/components/analyst/AnalystCoreTemplateCard').then((mod) => mod.AnalystCoreTemplateCard)
);
const AnalystModelCard = dynamic(
  () => import('@/components/analyst/AnalystModelCard').then((mod) => mod.AnalystModelCard)
);
const AnalystStockCard = dynamic(
  () => import('@/components/analyst/AnalystStockCard').then((mod) => mod.AnalystStockCard)
);
const AnalystVisualizationCard = dynamic(
  () => import('@/components/analyst/AnalystVisualizationCard').then((mod) => mod.AnalystVisualizationCard)
);
const ScenarioCard = dynamic(
  () => import('@/components/scenario/ScenarioCard').then((mod) => mod.ScenarioCard)
);

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: {
    mode?: 'live' | 'fallback' | 'scenario';
    reason?: string;
    structuredRequested?: boolean;
    sources?: string[];
    retrievalWarnings?: string[];
    attachmentUsed?: string;
    dcfDemo?: AnalystDcfDemoPayload;
    generatedModel?: AnalystGeneratedModelPayload;
    coreTemplateModel?: AnalystCoreTemplatePayload;
    stockLookup?: StockLookupResult;
    visualization?: AnalystVisualizationPayload;
    attachmentStatus?: AnalystAttachmentStatus;
    executionTrace?: AppExecutionTrace;
    earningsSummary?: AnalystEarningsSummaryCard;
    scenarioCard?: AnalystScenarioCardPayload;
    needsClarification?: boolean;
    clarificationQuestion?: string;
    clarificationField?: string;
    clarificationFieldLabel?: string;
    remainingMissingInputs?: string[];
    pendingModelRequest?: PendingModelRequest;
    analystOutput?: AnalystOutput;
  };
};

type LatestGeneratedModelMessage = {
  messageId: string;
  payload: AnalystGeneratedModelPayload;
} | null;

type LatestDcfMessage = {
  messageId: string;
  payload: AnalystDcfDemoPayload;
} | null;

function getLatestDcfMessage(messages: Message[]): LatestDcfMessage {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== 'assistant' || !candidate.meta?.dcfDemo) continue;
    return {
      messageId: candidate.id,
      payload: candidate.meta.dcfDemo,
    };
  }
  return null;
}

function isTeslaScenarioCard(payload?: AnalystScenarioCardPayload): boolean {
  return Boolean(payload && payload.company.trim().toLowerCase() === 'tesla');
}

function isLatestTeslaEarningsMessage(messages: Message[], index: number): boolean {
  for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (!candidate.meta?.earningsSummary) continue;
    return cursor === index && isTeslaTicker(candidate.meta.earningsSummary.ticker);
  }
  return false;
}

function isLatestTeslaScenarioMessage(messages: Message[], index: number): boolean {
  for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate.role !== 'assistant' || !isTeslaScenarioCard(candidate.meta?.scenarioCard)) continue;
    return cursor === index;
  }
  return false;
}

function attachmentReadStatusLabel(readStatus: AnalystAttachmentStatus['readStatus']): string {
  if (readStatus === 'read_success') return 'Server PDF read: succeeded';
  if (readStatus === 'read_failed') return 'Server PDF read: failed';
  return 'Server PDF read: partial';
}

function getSourceHref(source: string): string | null {
  const trimmed = source.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const match = trimmed.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

function getSourceLabel(source: string): string {
  const href = getSourceHref(source);
  if (!href) return source;
  try {
    const url = new URL(href);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return source;
  }
}

function formatMarketCap(value: number | null): string | null {
  if (value == null) return null;
  // marketCap is stored in millions in StockLookupResult
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}T`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}

function signalClasses(signal: InvestmentSignal): string {
  if (signal === 'LONG') return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200';
  if (signal === 'SHORT') return 'border-rose-400/30 bg-rose-500/15 text-rose-200';
  return 'border-zinc-400/30 bg-zinc-500/15 text-zinc-200';
}

function signalAccentClasses(signal: InvestmentSignal): string {
  if (signal === 'LONG') return 'bg-emerald-400';
  if (signal === 'SHORT') return 'bg-rose-400';
  return 'bg-zinc-400';
}

function formatValuationGap(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatConfidence(value: number): string {
  return value.toFixed(2);
}

function AnalystInvestmentOutputCard({ output }: { output: AnalystOutput }) {
  const normalized = normalizeAnalystOutput(output);
  const summaryLine = `${normalized.signal} | ${formatValuationGap(normalized.percentChange)} Gap (${normalized.edgeStrength})`;
  const showAccuracy = normalized.confidenceBreakdown.sampleSize >= 5 && normalized.confidenceBreakdown.accuracy != null;

  if (!normalized.isComplete) {
    return (
      <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 text-[var(--cb-text-primary)] md:p-6">
        <div className="text-sm font-semibold text-[var(--cb-text-muted)]">Signal: Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative space-y-5 overflow-hidden rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 text-[var(--cb-text-primary)] shadow-[0_18px_60px_rgba(0,0,0,0.18)] md:p-6">
      <div className={`absolute inset-y-0 left-0 w-1 ${signalAccentClasses(normalized.signal)}`} />
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Signal</div>
          <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${signalClasses(normalized.signal)}`}>
            {summaryLine}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Valuation Gap</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatValuationGap(normalized.percentChange)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Confidence</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatConfidence(normalized.confidence)} <span className="text-sm font-medium text-[var(--cb-text-muted)]">({normalized.confidenceBand})</span>
          </div>
        </div>
      </div>

      <div className="text-sm leading-6 text-[var(--cb-text-primary)]">
        {normalized.attributionExplanation}
      </div>

      <p className="max-w-3xl text-[15px] leading-7 text-[var(--cb-text-primary)]">
        {normalized.analystNote}
      </p>

      <div className="text-xs text-[var(--cb-text-muted)]">
        {normalized.confidenceExplanation}
      </div>
      {normalized.sizePct != null ? (
        <div className="text-xs font-medium text-[var(--cb-text-primary)]">
          Suggested Position: {normalized.sizePct.toFixed(1)}%
        </div>
      ) : null}

      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-widest text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-primary)]">
          Details <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="mt-4 grid gap-5 md:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--cb-text-muted)]">Confidence Breakdown</div>
            <div className="space-y-1.5 text-sm text-[var(--cb-text-primary)]">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--cb-text-muted)]">Model confidence</span>
                <span className="font-medium tabular-nums">
                  {normalized.confidenceBreakdown.model != null ? formatConfidence(normalized.confidenceBreakdown.model) : 'n/a'}
                </span>
              </div>
              {showAccuracy ? (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--cb-text-muted)]">Historical accuracy</span>
                  <span className="font-medium tabular-nums">
                    {Math.round((normalized.confidenceBreakdown.accuracy ?? 0) * 100)}%
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {normalized.drivers.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--cb-text-muted)]">Secondary Drivers</div>
              <ul className="space-y-1.5 text-sm leading-6 text-[var(--cb-text-primary)]">
                {normalized.drivers.map((driver) => (
                  <li key={driver} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--cb-text-muted)]" />
                    <span>{driver}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

// ─── Sidebar state ───────────────────────────────────────────────────────────

type SidebarState = {
  latestStockLookup: StockLookupResult | null;
  latestSources: string[] | null;
  latestAttachmentStatus: AnalystAttachmentStatus | null;
};

function getSidebarState(messages: Message[]): SidebarState {
  let latestStockLookup: StockLookupResult | null = null;
  let latestSources: string[] | null = null;
  let latestAttachmentStatus: AnalystAttachmentStatus | null = null;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    if (!latestStockLookup && m.meta?.stockLookup) latestStockLookup = m.meta.stockLookup;
    if (!latestSources && m.meta?.sources?.length) latestSources = m.meta.sources;
    if (!latestAttachmentStatus && m.meta?.attachmentStatus) latestAttachmentStatus = m.meta.attachmentStatus;
    if (latestStockLookup && latestSources && latestAttachmentStatus) break;
  }

  return { latestStockLookup, latestSources, latestAttachmentStatus };
}

// ─── Sidebar components ───────────────────────────────────────────────────────

function CompactStockSnapshot({ payload }: { payload: StockLookupResult }) {
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState<CompanyInfoResponse | null>(null);
  const mcap = formatMarketCap(payload.marketCap);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/company-info?ticker=${encodeURIComponent(payload.ticker)}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((data: CompanyInfoResponse | null) => { if (!cancelled) setInfo(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [payload.ticker]);

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Company</p>
          <p className="mt-0.5 text-sm font-bold text-white">{payload.ticker}</p>
          {payload.companyName && (
            <p className="text-[11px] text-zinc-400">{payload.companyName}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 shrink-0 text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300"
        >
          {expanded ? 'Less ▴' : 'More ▾'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {payload.price != null && (
          <div>
            <p className="text-[10px] text-zinc-500">Price</p>
            <p className="text-sm font-semibold text-white">${payload.price.toFixed(2)}</p>
          </div>
        )}
        {mcap && (
          <div>
            <p className="text-[10px] text-zinc-500">Mkt Cap</p>
            <p className="text-sm font-semibold text-white">{mcap}</p>
          </div>
        )}
        {payload.sector && (
          <div className="col-span-2">
            <p className="text-[10px] text-zinc-500">Sector</p>
            <p className="text-[11px] text-zinc-300">
              {payload.sector}{payload.industry ? ` · ${payload.industry}` : ''}
            </p>
          </div>
        )}
        {info?.employees && (
          <div>
            <p className="text-[10px] text-zinc-500">Employees</p>
            <p className="text-[11px] text-zinc-300">{info.employees.toLocaleString()}</p>
          </div>
        )}
        {info?.founded && (
          <div>
            <p className="text-[10px] text-zinc-500">Founded / IPO</p>
            <p className="text-[11px] text-zinc-300">{info.founded}</p>
          </div>
        )}
      </div>

      {/* Company description */}
      {info?.description && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">About</p>
          <p className="text-[11px] leading-[1.6] text-zinc-300 line-clamp-4">
            {info.description}
          </p>
        </div>
      )}

      {/* Recent news */}
      {info?.news && info.news.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Recent News</p>
          <div className="space-y-2">
            {info.news.slice(0, 4).map((item, idx) => (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block group"
              >
                <p className="text-[11px] leading-[1.5] text-zinc-300 group-hover:text-white line-clamp-2">
                  {item.title}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  {item.source}{item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : ''}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Expanded full card */}
      {expanded && (
        <div className="border-t border-[var(--cb-border-subtle)] pt-3">
          <AnalystStockCard payload={payload} />
        </div>
      )}
    </div>
  );
}

function CollapsedSources({ sources }: { sources: string[] }) {
  return (
    <details className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-3 text-[11px]">
      <summary className="cursor-pointer list-none select-none">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            Sources ({sources.length})
          </span>
          <span className="text-zinc-500 text-[10px]">▸</span>
        </div>
      </summary>
      <div className="mt-3 space-y-2">
        {sources.map((source) => {
          const href = getSourceHref(source);
          const label = getSourceLabel(source);
          return (
            <div key={source} className="min-w-0">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-[var(--cb-text-primary)] underline decoration-[var(--cb-border-strong)] underline-offset-4 hover:text-[var(--cb-green)]"
                  title={source}
                >
                  {label}
                </a>
              ) : (
                <div className="truncate text-[var(--cb-text-primary)]" title={source}>
                  {source}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function CollapsedAttachmentStatus({ status }: { status: AnalystAttachmentStatus }) {
  const hasWarnings = status.warnings.length > 0;
  const label = attachmentReadStatusLabel(status.readStatus);
  const identity = [
    status.extractedIdentity.companyName,
    status.extractedIdentity.ticker,
    status.extractedIdentity.fiscalPeriod,
  ].filter((v): v is string => Boolean(v));

  return (
    <details className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-3 text-[11px]">
      <summary className="cursor-pointer list-none select-none">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[10px] uppercase tracking-widest ${
              hasWarnings ? 'text-amber-300/90' : 'text-zinc-500'
            }`}
          >
            {hasWarnings ? '⚠ Data Issues' : 'Server Status'}
          </span>
          <span className="text-zinc-500 text-[10px]">▸</span>
        </div>
      </summary>
      <div className="mt-3 space-y-1 text-zinc-400">
        <div className="text-zinc-200">{label}</div>
        <div>
          Seedable: {status.isFinancialModelSeedable ? 'yes' : 'no'} · Package:{' '}
          {status.hasStatementPackage ? 'present' : 'missing'}
        </div>
        <div>
          Coverage: {status.statementCoverage.incomeStatement ? 'IS' : '—'} /{' '}
          {status.statementCoverage.balanceSheet ? 'BS' : '—'} /{' '}
          {status.statementCoverage.cashFlowStatement ? 'CF' : '—'}
        </div>
        {identity.length > 0 && <div>{identity.join(' · ')}</div>}
        {hasWarnings && (
          <div className="mt-1 text-amber-300/90">{status.warnings[0]}</div>
        )}
      </div>
    </details>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GuidedDemoHint({ children }: { children: string }) {
  return (
    <div className="mt-3 pl-3 text-sm text-[var(--cb-text-muted)]">{children}</div>
  );
}

function AnalystEarningsSummaryCardView({ summary }: { summary: AnalystEarningsSummaryCard }) {
  return (
    <div className="mt-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
            Earnings Snapshot
          </div>
          <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
            {summary.companyName} ({summary.ticker})
          </div>
          <div className="mt-1 text-xs text-[var(--cb-text-muted)]">{summary.quarterLabel}</div>
        </div>
        {summary.nextEarningsDate ? (
          <div className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
            Next earnings {summary.nextEarningsDate}
          </div>
        ) : null}
      </div>
      {summary.metrics.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {summary.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-2"
            >
              <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                {metric.label}
              </div>
              <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {summary.highlights.length > 0 ? (
        <div className="mt-3 space-y-1 text-sm text-[var(--cb-text-primary)]">
          {summary.highlights.map((highlight) => (
            <div key={highlight}>• {highlight}</div>
          ))}
        </div>
      ) : null}
      {summary.warnings.length > 0 ? (
        <div className="mt-3 text-xs text-[#fde68a]">{summary.warnings[0]}</div>
      ) : null}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type AnalystChatSurfaceProps = {
  ticker: string;
  attachment: UploadedAttachmentContext | null;
  attachmentError: string | null;
  messages: Message[];
  isLoading: boolean;
  loadingState: {
    title: string;
    detail: string;
    routeLabel: string;
    steps: string[];
    activeStep: number;
  } | null;
  memoPdfLoadingId: string | null;
  pendingModelRequest: PendingModelRequest | null;
  quickEventTitle: string;
  quickEventText: string;
  quickEventSource: string;
  quickEventError: string | null;
  quickEventNotice: string | null;
  quickEventApplying: boolean;
  input: string;
  demoMode: boolean;
  demoStep: AnalystDemoStep | null;
  bottomRef: RefObject<HTMLDivElement>;
  promptRef: RefObject<HTMLTextAreaElement>;
  quickEventTextRef: RefObject<HTMLTextAreaElement>;
  onTickerChange: (value: string) => void;
  onAttachmentSelect: (file: File | null) => Promise<void>;
  getPromptForAssistantMessage: (index: number) => string | undefined;
  onDownloadMemoPdf: (messageId: string, content: string, prompt?: string, sources?: string[]) => Promise<void>;
  onDcfAdjustment: (messageId: string, payload: AnalystDcfDemoPayload, adjustment: AnalystDcfAdjustment) => Promise<void>;
  onDcfEventShock: (messageId: string, payload: AnalystDcfDemoPayload, prompt: string) => Promise<void>;
  onModelAdjustment: (
    messageId: string,
    payload: AnalystGeneratedModelPayload,
    adjustment: AnalystStructuredModelAdjustment,
  ) => Promise<void>;
  onAdjustFromEvent: () => void;
  onSuggestSmartAssumptions: (messageId: string, payload: AnalystGeneratedModelPayload) => Promise<void>;
  getLatestGeneratedModelMessage: () => LatestGeneratedModelMessage;
  onQuickEventTitleChange: (value: string) => void;
  onQuickEventTextChange: (value: string) => void;
  onQuickEventSourceChange: (value: string) => void;
  onQuickEventApply: () => Promise<void>;
  onQuickPrompt: (text: string) => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  onInputChange: (value: string) => void;
  showExecutionTrace: boolean;
};

// ─── Main surface ─────────────────────────────────────────────────────────────

export function AnalystChatSurface(props: AnalystChatSurfaceProps) {
  const latestModelMessage = props.getLatestGeneratedModelMessage();
  const latestDcfMessage = getLatestDcfMessage(props.messages);
  const sidebar = getSidebarState(props.messages);
  const hasSidebar =
    Boolean(sidebar.latestStockLookup) ||
    Boolean(sidebar.latestSources) ||
    Boolean(sidebar.latestAttachmentStatus);

  return (
    <div className={`grid gap-4 ${hasSidebar ? 'lg:grid-cols-[2fr_1fr]' : ''} lg:items-start`}>
      {/* ── LEFT: primary analysis ── */}
      <Card className="flex flex-col shadow-lg">
        <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
          <CardTitle className="text-xl font-semibold text-[var(--cb-text-primary)]">
            Analyst Chat
          </CardTitle>
          <div className="flex flex-col gap-3 text-sm text-[var(--cb-text-muted)] md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
              <label htmlFor="ticker-input" className="sr-only">Ticker</label>
              <Input
                id="ticker-input"
                name="ticker-input"
                value={props.ticker}
                onChange={(event) => props.onTickerChange(event.target.value.toUpperCase())}
                placeholder="Ticker (optional)"
              />
            </div>
            <label htmlFor="pdf-upload-analyst" className="sr-only">Upload PDF</label>
            <input
              type="file"
              id="pdf-upload-analyst"
              name="pdf-upload-analyst"
              accept=".pdf,.xlsx,.xls,.csv,.txt,.md,application/pdf,text/csv,text/plain"
              onChange={(event) => void props.onAttachmentSelect(event.target.files?.[0] ?? null)}
              className="text-xs text-[var(--cb-text-muted)]"
            />
          </div>
          {props.attachment && (
            <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-3 py-2 text-xs text-[var(--cb-text-muted)]">
              <div className="font-medium text-[var(--cb-text-primary)]">
                Attached: {props.attachment.name} • {props.attachment.kind.replace(/_/g, ' ')}
              </div>
              <div>{props.attachment.sizeKb}kb • Client preview ready</div>
              <div>Waiting for server parse on submit</div>
              {(props.attachment.filingClassification?.familiarCategory ||
                props.attachment.filingClassification?.rawFilingType ||
                props.attachment.filingPacket?.label) && (
                <div className="mt-1">
                  {[
                    props.attachment.filingClassification?.familiarCategory,
                    props.attachment.filingClassification?.rawFilingType,
                    props.attachment.filingPacket?.label,
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join(' • ')}
                </div>
              )}
              {(props.attachment.signals?.ticker ||
                props.attachment.signals?.companyName ||
                props.attachment.signals?.modelTypeHint ||
                props.attachment.signals?.fiscalPeriod) && (
                <div className="mt-1">
                  {[
                    props.attachment.signals?.companyName,
                    props.attachment.signals?.ticker,
                    props.attachment.signals?.modelTypeHint?.replace(/_/g, ' '),
                    props.attachment.signals?.fiscalPeriod,
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join(' • ')}
                </div>
              )}
              {props.attachment.signals?.extractedMetrics &&
                props.attachment.signals.extractedMetrics.length > 0 && (
                  <div className="mt-1 truncate">
                    {props.attachment.signals.extractedMetrics
                      .slice(0, 3)
                      .map((metric) => `${metric.label}: ${metric.value}`)
                      .join(' • ')}
                  </div>
                )}
              {props.attachment.warnings.length > 0 && (
                <div className="mt-1 text-amber-300/90">{props.attachment.warnings[0]}</div>
              )}
            </div>
          )}
          {props.attachmentError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {props.attachmentError}
            </div>
          )}
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4 bg-[var(--cb-surface-subtle)] p-0">
          {/* Message list */}
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 text-sm">
            {props.isLoading && props.loadingState
              ? (() => {
                  const loadingState = props.loadingState;
                  return (
                    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-[var(--cb-text-primary)]">
                            {loadingState.title}
                          </div>
                          <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
                            {loadingState.detail}
                          </div>
                        </div>
                        <div className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                          {loadingState.routeLabel}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-4">
                        {loadingState.steps.map((step, index) => {
                          const isActive = index === loadingState.activeStep;
                          const isComplete = index < loadingState.activeStep;
                          return (
                            <div
                              key={`${step}-${index}`}
                              className={`rounded-xl border px-3 py-2 text-xs ${
                                isActive
                                  ? 'border-[var(--cb-green)] bg-[var(--cb-green)]/10 text-[var(--cb-text-primary)]'
                                  : isComplete
                                    ? 'border-[var(--cb-border-strong)] bg-[var(--cb-surface-alt)] text-[var(--cb-text-primary)]'
                                    : 'border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)]'
                              }`}
                            >
                              <div className="mb-1 uppercase tracking-wide">
                                {isComplete ? 'Done' : isActive ? 'Now' : 'Queued'}
                              </div>
                              <div>{step}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              : null}

            {props.messages.map((message, index) => {
              const prompt = props.getPromptForAssistantMessage(index);
              const isScenarioMode =
                message.role === 'assistant' &&
                message.meta?.mode === 'scenario' &&
                message.meta?.scenarioCard;
              const showEarningsHint =
                props.demoMode &&
                props.demoStep === 'earnings' &&
                message.role === 'assistant' &&
                Boolean(message.meta?.earningsSummary) &&
                isTeslaTicker(message.meta?.earningsSummary?.ticker) &&
                isLatestTeslaEarningsMessage(props.messages, index);
              const showScenarioHint =
                props.demoMode &&
                props.demoStep === 'scenario' &&
                isScenarioMode &&
                isLatestTeslaScenarioMessage(props.messages, index);
              const guidedHint = getTeslaDemoGuidedHint(props.demoStep);

              return (
                <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
                  {isScenarioMode ? (
                    <>
                      <div className="my-6 w-full border-y border-[color:var(--cb-border-subtle)]/40 bg-muted/30 py-8">
                        <div className="flex w-full justify-center px-4 md:px-6">
                          <div className="w-full max-w-5xl">
                            {(() => {
                              const activeGeneratedTeslaDcf =
                                latestModelMessage?.payload.modelType === 'DCF' &&
                                latestModelMessage.payload.extractedInputs &&
                                typeof latestModelMessage.payload.extractedInputs === 'object' &&
                                'ticker' in latestModelMessage.payload.extractedInputs &&
                                isTeslaTicker(
                                  typeof latestModelMessage.payload.extractedInputs.ticker === 'string'
                                    ? latestModelMessage.payload.extractedInputs.ticker
                                    : null,
                                )
                                  ? latestModelMessage
                                  : null;

                              const canApplyToModel = Boolean(
                                activeGeneratedTeslaDcf || latestDcfMessage?.payload.ticker === 'TSLA',
                              );
                              const onApplyToModel = activeGeneratedTeslaDcf
                                ? () =>
                                    void props.onModelAdjustment(
                                      activeGeneratedTeslaDcf.messageId,
                                      activeGeneratedTeslaDcf.payload,
                                      {
                                        changes: buildScenarioStructuredModelOverridesFromPayload(
                                          message.meta!.scenarioCard!,
                                          activeGeneratedTeslaDcf.payload,
                                        ),
                                      },
                                    )
                                : latestDcfMessage?.payload.ticker === 'TSLA'
                                  ? () =>
                                      void props.onDcfAdjustment(
                                        latestDcfMessage.messageId,
                                        latestDcfMessage.payload,
                                        buildScenarioDcfAdjustmentFromPayload(
                                          message.meta!.scenarioCard!,
                                          latestDcfMessage.payload,
                                        ),
                                      )
                                  : undefined;

                              return (
                                <ScenarioCard
                                  {...message.meta!.scenarioCard!}
                                  canApplyToActiveModel={canApplyToModel}
                                  onApplyToModel={onApplyToModel}
                                />
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      {showScenarioHint && guidedHint ? (
                        <GuidedDemoHint>{guidedHint}</GuidedDemoHint>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div
                        className={`inline-block rounded-2xl px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-[var(--cb-green)] text-[#041007]'
                            : message.meta?.analystOutput
                              ? 'block max-w-full bg-transparent p-0 text-[var(--cb-text-primary)]'
                              : 'block max-w-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)] whitespace-pre-wrap leading-7'
                        }`}
                      >
                        {message.role === 'assistant' ? (
                          message.meta?.analystOutput ? (
                            <AnalystInvestmentOutputCard output={message.meta.analystOutput} />
                          ) : (
                            <FormattedTextBlock
                              content={message.content}
                              className="space-y-4"
                              paragraphClassName="text-[var(--cb-text-primary)] leading-7"
                            />
                          )
                        ) : (
                          message.content
                        )}

                        {message.role === 'assistant' && message.meta?.earningsSummary ? (
                          <AnalystEarningsSummaryCardView summary={message.meta.earningsSummary} />
                        ) : null}

                        {message.role === 'assistant' && message.meta?.attachmentUsed && (
                          <div className="mt-2 text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                            {message.meta.attachmentUsed}
                          </div>
                        )}

                        {message.role === 'assistant' &&
                          message.meta?.retrievalWarnings &&
                          message.meta.retrievalWarnings.length > 0 && (
                            <div className="mt-2 text-[11px] text-amber-300/90">
                              {message.meta.retrievalWarnings.join(' • ')}
                            </div>
                          )}

                        {message.role === 'assistant' &&
                          !message.meta?.dcfDemo &&
                          !message.meta?.generatedModel &&
                          !message.meta?.coreTemplateModel &&
                          !message.meta?.stockLookup &&
                          !message.meta?.visualization &&
                          !message.meta?.scenarioCard &&
                          !message.meta?.analystOutput && (
                            <div className="mt-3 flex justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void props.onDownloadMemoPdf(
                                    message.id,
                                    message.content,
                                    prompt,
                                    message.meta?.sources,
                                  )
                                }
                                disabled={props.memoPdfLoadingId === message.id}
                              >
                                {props.memoPdfLoadingId === message.id
                                  ? 'Generating Memo PDF…'
                                  : 'Download Memo PDF'}
                              </Button>
                            </div>
                          )}

                        {message.role === 'assistant' && message.meta?.dcfDemo && (
                          <AnalystDcfCard
                            payload={message.meta.dcfDemo}
                            onAdjust={(adjustment) =>
                              props.onDcfAdjustment(message.id, message.meta!.dcfDemo!, adjustment)
                            }
                            onRunEventShock={(promptText) =>
                              props.onDcfEventShock(message.id, message.meta!.dcfDemo!, promptText)
                            }
                          />
                        )}

                        {message.role === 'assistant' && message.meta?.generatedModel && (
                          <AnalystModelCard
                            payload={message.meta.generatedModel}
                            onAdjust={(adjustment) =>
                              props.onModelAdjustment(
                                message.id,
                                message.meta!.generatedModel!,
                                adjustment,
                              )
                            }
                            onAdjustFromEvent={props.onAdjustFromEvent}
                            onSuggestSmartAssumptions={
                              supportsSmartAssumptionAdjustment(message.meta.generatedModel)
                                ? () =>
                                    props.onSuggestSmartAssumptions(
                                      message.id,
                                      message.meta!.generatedModel!,
                                    )
                                : undefined
                            }
                          />
                        )}

                        {message.role === 'assistant' && message.meta?.coreTemplateModel && (
                          <AnalystCoreTemplateCard payload={message.meta.coreTemplateModel} />
                        )}

                        {message.role === 'assistant' && message.meta?.visualization && (
                          <AnalystVisualizationCard payload={message.meta.visualization} />
                        )}

                        {message.role === 'assistant' &&
                          message.meta?.needsClarification &&
                          message.meta.clarificationQuestion && (
                            <div className="mt-3 rounded-xl border border-[var(--cb-border-strong)] bg-[var(--cb-surface-alt)] p-3 text-sm text-[var(--cb-text-primary)]">
                              <div className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">
                                Needs input
                              </div>
                              <div className="mt-1">{message.meta.clarificationQuestion}</div>
                            </div>
                          )}

                        {message.role === 'assistant' &&
                          props.showExecutionTrace &&
                          message.meta?.executionTrace && (
                            <details className="mt-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3 text-[11px] text-[var(--cb-text-muted)]">
                              <summary className="cursor-pointer uppercase tracking-wide">
                                Execution Trace
                              </summary>
                              <div className="mt-2 space-y-2">
                                <div>
                                  <span className="text-[var(--cb-text-muted)]">Surface:</span>{' '}
                                  <span className="text-[var(--cb-text-primary)]">
                                    {message.meta.executionTrace.surface}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--cb-text-muted)]">Route:</span>{' '}
                                  <span className="text-[var(--cb-text-primary)]">
                                    {message.meta.executionTrace.routeIntent || 'n/a'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--cb-text-muted)]">Model:</span>{' '}
                                  <span className="text-[var(--cb-text-primary)]">
                                    {message.meta.executionTrace.modelType || 'n/a'}
                                  </span>
                                </div>
                                <div>
                                  <div className="mb-1 text-[var(--cb-text-muted)]">
                                    Fired Services
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {message.meta.executionTrace.firedServices.map((service) => (
                                      <span
                                        key={service}
                                        className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-1 text-[10px] text-[var(--cb-text-primary)]"
                                      >
                                        {service}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                {message.meta.executionTrace.notes?.length ? (
                                  <div>
                                    <div className="mb-1 text-[var(--cb-text-muted)]">Notes</div>
                                    <ul className="list-disc pl-4 text-[var(--cb-text-primary)]">
                                      {message.meta.executionTrace.notes.map((note) => (
                                        <li key={note}>{note}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          )}
                      </div>
                      {showEarningsHint && guidedHint ? (
                        <GuidedDemoHint>{guidedHint}</GuidedDemoHint>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}

            {props.isLoading && props.loadingState && (
              <div className="text-left">
                <div className="block max-w-full rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-4 py-3 text-[var(--cb-text-primary)]">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cb-green)] [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cb-green)] [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cb-green)] [animation-delay:300ms]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{props.loadingState.title}</div>
                      <div className="text-xs text-[var(--cb-text-muted)]">
                        {props.loadingState.detail}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={props.bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
            {latestModelMessage ? (
              <div className="mb-4 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                      Quick Assumption Update
                    </div>
                    <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
                      Paste a headline or event excerpt here to adjust the active model&apos;s assumptions
                      without leaving chat.
                    </div>
                    <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
                      Reviewed updates can move growth, margin, WACC, or terminal growth when the
                      event actually supports it.
                    </div>
                  </div>
                  <div className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                    Active model: {latestModelMessage.payload.modelType.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
                  <div className="space-y-3">
                    <Input
                      value={props.quickEventTitle}
                      placeholder="Event title (optional)"
                      onChange={(event) => props.onQuickEventTitleChange(event.target.value)}
                    />
                    <Textarea
                      ref={props.quickEventTextRef}
                      value={props.quickEventText}
                      placeholder="Paste the headline, article excerpt, or short event description you want reflected in assumptions."
                      onChange={(event) => props.onQuickEventTextChange(event.target.value)}
                    />
                  </div>
                  <div className="space-y-3">
                    <Input
                      value={props.quickEventSource}
                      placeholder="Source label (optional)"
                      onChange={(event) => props.onQuickEventSourceChange(event.target.value)}
                    />
                    <Button
                      type="button"
                      onClick={() => void props.onQuickEventApply()}
                      disabled={props.quickEventApplying || !props.quickEventText.trim()}
                      className="w-full"
                    >
                      {props.quickEventApplying ? 'Applying…' : 'Apply to Assumptions'}
                    </Button>
                  </div>
                </div>
                {props.quickEventError ? (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {props.quickEventError}
                  </div>
                ) : null}
                {props.quickEventNotice ? (
                  <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    {props.quickEventNotice}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(latestModelMessage || latestDcfMessage) && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(([
                  { label: 'Is it undervalued?',  prompt: 'is it undervalued?' },
                  { label: 'Upside / downside',   prompt: 'what is the upside/downside?' },
                  { label: 'Key assumptions',     prompt: 'what are the key assumptions?' },
                  { label: 'What breaks this?',   prompt: 'what breaks this valuation case?' },
                  { label: 'Stress test',         prompt: 'stress test this model' },
                ]) as { label: string; prompt: string }[]).map(({ label, prompt }) => (
                  <button
                    key={label}
                    type="button"
                    disabled={props.isLoading}
                    onClick={() => props.onQuickPrompt(prompt)}
                    className="inline-flex items-center rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-1 text-[11px] font-medium text-[var(--cb-text-muted)] transition-colors hover:border-[var(--cb-border-strong)] hover:bg-[var(--cb-surface)] hover:text-[var(--cb-text-primary)] disabled:pointer-events-none disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={props.onSubmit}>
              <label htmlFor="analyst-prompt" className="sr-only">Ask a question</label>
              <Textarea
                ref={props.promptRef}
                id="analyst-prompt"
                name="analyst-prompt"
                placeholder={
                  props.pendingModelRequest?.clarificationField
                    ? 'Answer the missing-input question so the model can continue...'
                    : 'Ask about valuations, KPIs, diligence follow-ups...'
                }
                value={props.input}
                onChange={(event) => props.onInputChange(event.target.value)}
                onKeyDownCapture={(event) => { event.stopPropagation(); }}
                onKeyUpCapture={(event) => { event.stopPropagation(); }}
                disabled={props.isLoading}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
              />
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--cb-text-muted)]">
                {props.pendingModelRequest ? (
                  <span>
                    Waiting for{' '}
                    {props.pendingModelRequest.clarificationField
                      ?.replace(/([A-Z])/g, ' $1')
                      .toLowerCase() || 'the next required input'}{' '}
                    to continue the model build.
                  </span>
                ) : props.attachment ? (
                  <span>
                    Using {props.attachment.kind.replace(/_/g, ' ')} context from{' '}
                    {props.attachment.name}.
                  </span>
                ) : (
                  <span>Attach earnings reports, model files, or notes for additional context.</span>
                )}
                <Button type="submit" disabled={props.isLoading || !props.input.trim()}>
                  {props.isLoading
                    ? 'Thinking…'
                    : props.pendingModelRequest
                      ? 'Continue Model'
                      : 'Ask'}
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* ── RIGHT: context sidebar ── */}
      {hasSidebar && (
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {sidebar.latestStockLookup && (
            <CompactStockSnapshot payload={sidebar.latestStockLookup} />
          )}
          {sidebar.latestSources && sidebar.latestSources.length > 0 && (
            <CollapsedSources sources={sidebar.latestSources} />
          )}
          {sidebar.latestAttachmentStatus && (
            <CollapsedAttachmentStatus status={sidebar.latestAttachmentStatus} />
          )}
        </div>
      )}
    </div>
  );
}

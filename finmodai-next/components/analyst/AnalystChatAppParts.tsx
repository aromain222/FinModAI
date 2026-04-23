'use client';

import dynamic from 'next/dynamic';
import type { FormEvent, RefObject } from 'react';
import { FormattedTextBlock } from '@/components/ui/formatted-text-block';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import type { AttachmentStatusPayload as AnalystAttachmentStatus } from '@/lib/analyst/attachmentStatus';
import type { AnalystCoreTemplatePayload } from '@/lib/analyst/coreModelTemplates';
import type { AnalystDcfAdjustment, AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import type { PendingModelRequest } from '@/lib/analyst/modelReadiness';
import { buildScenarioDcfAdjustmentFromPayload, type AnalystScenarioCardPayload } from '@/lib/analyst/scenarioCard';
import type { AnalystGeneratedModelPayload, AnalystStructuredModelAdjustment } from '@/lib/analyst/types';
import type { AnalystVisualizationPayload } from '@/lib/analyst/visualization';
import type { AnalystEarningsSummaryCard } from '@/lib/analyst/earningsSummary';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';
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

function AnalystEarningsSummaryCardView({ summary }: { summary: AnalystEarningsSummaryCard }) {
  return (
    <div className="mt-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Earnings Snapshot</div>
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
            <div key={metric.label} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">{metric.label}</div>
              <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{metric.value}</div>
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
  onSuggestSmartAssumptions: () => Promise<void>;
  getLatestGeneratedModelMessage: () => LatestGeneratedModelMessage;
  onQuickEventTitleChange: (value: string) => void;
  onQuickEventTextChange: (value: string) => void;
  onQuickEventSourceChange: (value: string) => void;
  onQuickEventApply: () => Promise<void>;
  onSubmit: (event: FormEvent) => Promise<void>;
  onInputChange: (value: string) => void;
  showExecutionTrace: boolean;
};

export function AnalystChatSurface(props: AnalystChatSurfaceProps) {
  const latestModelMessage = props.getLatestGeneratedModelMessage();
  const latestDcfMessage = getLatestDcfMessage(props.messages);

  return (
    <Card className="flex h-full flex-col shadow-lg">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle className="text-xl font-semibold text-[var(--cb-text-primary)]">Analyst Chat</CardTitle>
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
            {(props.attachment.filingClassification?.familiarCategory || props.attachment.filingClassification?.rawFilingType || props.attachment.filingPacket?.label) && (
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
            {(props.attachment.signals?.ticker || props.attachment.signals?.companyName || props.attachment.signals?.modelTypeHint || props.attachment.signals?.fiscalPeriod) && (
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
            {props.attachment.signals?.extractedMetrics && props.attachment.signals.extractedMetrics.length > 0 && (
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
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 text-sm">
          {props.isLoading && props.loadingState ? (
            (() => {
              const loadingState = props.loadingState;
              return (
            <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--cb-text-primary)]">{loadingState.title}</div>
                  <div className="mt-1 text-xs text-[var(--cb-text-muted)]">{loadingState.detail}</div>
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
                      <div className="mb-1 uppercase tracking-wide">{isComplete ? 'Done' : isActive ? 'Now' : 'Queued'}</div>
                      <div>{step}</div>
                    </div>
                  );
                })}
              </div>
            </div>
              );
            })()
          ) : null}
          {props.messages.map((message, index) => {
            const prompt = props.getPromptForAssistantMessage(index);
            const isScenarioMode = message.role === 'assistant' && message.meta?.mode === 'scenario' && message.meta?.scenarioCard;

            return (
              <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
                {isScenarioMode ? (
                  <div className="my-6 w-full border-y border-[color:var(--cb-border-subtle)]/40 bg-muted/30 py-8">
                    <div className="flex w-full justify-center px-4 md:px-6">
                      <div className="w-full max-w-5xl">
                        <ScenarioCard
                          {...message.meta!.scenarioCard!}
                          canApplyToActiveDcf={latestDcfMessage?.payload.ticker === 'TSLA'}
                          onApplyToDcf={
                            latestDcfMessage?.payload.ticker === 'TSLA'
                              ? () =>
                                  void props.onDcfAdjustment(
                                    latestDcfMessage.messageId,
                                    latestDcfMessage.payload,
                                    buildScenarioDcfAdjustmentFromPayload(
                                      message.meta!.scenarioCard!,
                                      latestDcfMessage.payload,
                                    ),
                                  )
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                <div
                  className={`inline-block rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-[var(--cb-green)] text-[#041007]'
                      : 'block max-w-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)] whitespace-pre-wrap leading-7'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <FormattedTextBlock
                      content={message.content}
                      className="space-y-4"
                      paragraphClassName="text-[var(--cb-text-primary)] leading-7"
                    />
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
                  {message.role === 'assistant' && message.meta?.attachmentStatus && (
                    <div className="mt-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3 text-[11px] text-[var(--cb-text-muted)]">
                      <div className="mb-1 uppercase tracking-wide">Server Read Status</div>
                      <div className="text-[var(--cb-text-primary)]">
                        {attachmentReadStatusLabel(message.meta.attachmentStatus.readStatus)}
                      </div>
                      <div className="mt-1">
                        Seedable: {message.meta.attachmentStatus.isFinancialModelSeedable ? 'yes' : 'no'} • Package: {message.meta.attachmentStatus.hasStatementPackage ? 'present' : 'missing'}
                      </div>
                      <div className="mt-1">
                        Coverage: {message.meta.attachmentStatus.statementCoverage.incomeStatement ? 'IS' : '-'} / {message.meta.attachmentStatus.statementCoverage.balanceSheet ? 'BS' : '-'} / {message.meta.attachmentStatus.statementCoverage.cashFlowStatement ? 'CF' : '-'}
                      </div>
                      {(message.meta.attachmentStatus.extractedIdentity.companyName ||
                        message.meta.attachmentStatus.extractedIdentity.ticker ||
                        message.meta.attachmentStatus.extractedIdentity.fiscalPeriod) && (
                        <div className="mt-1">
                          {[message.meta.attachmentStatus.extractedIdentity.companyName, message.meta.attachmentStatus.extractedIdentity.ticker, message.meta.attachmentStatus.extractedIdentity.fiscalPeriod]
                            .filter((item): item is string => Boolean(item))
                            .join(' • ')}
                        </div>
                      )}
                      {(message.meta.attachmentStatus.filingView.familiarCategory ||
                        message.meta.attachmentStatus.filingView.rawFilingType ||
                        message.meta.attachmentStatus.packetView?.label) && (
                        <div className="mt-1">
                          {[
                            message.meta.attachmentStatus.filingView.familiarCategory,
                            message.meta.attachmentStatus.filingView.rawFilingType,
                            message.meta.attachmentStatus.packetView?.label,
                          ]
                            .filter((item): item is string => Boolean(item))
                            .join(' • ')}
                        </div>
                      )}
                      {message.meta.attachmentStatus.packetView?.rawFilingTypes.length ? (
                        <div className="mt-1">
                          Packet filings: {message.meta.attachmentStatus.packetView.rawFilingTypes.join(', ')}
                        </div>
                      ) : null}
                      {message.meta.attachmentStatus.warnings.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-amber-300/90">Warnings</summary>
                          <div className="mt-1 text-amber-300/90">
                            {message.meta.attachmentStatus.warnings[0]}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                  {message.role === 'assistant' &&
                    !message.meta?.dcfDemo &&
                    !message.meta?.generatedModel &&
                    !message.meta?.coreTemplateModel &&
                    !message.meta?.stockLookup &&
                    !message.meta?.visualization &&
                    !message.meta?.scenarioCard && (
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
                          {props.memoPdfLoadingId === message.id ? 'Generating Memo PDF…' : 'Download Memo PDF'}
                        </Button>
                      </div>
                    )}
                  {message.role === 'assistant' && message.meta?.sources && message.meta.sources.length > 0 && (
                    <div className="mt-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3 text-[11px] text-[var(--cb-text-muted)]">
                      <div className="mb-2 uppercase tracking-wide">Sources</div>
                      <div className="space-y-2">
                        {message.meta.sources.map((source) => {
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
                  {message.role === 'assistant' && props.showExecutionTrace && message.meta?.executionTrace && (
                    <details className="mt-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3 text-[11px] text-[var(--cb-text-muted)]">
                      <summary className="cursor-pointer uppercase tracking-wide">Execution Trace</summary>
                      <div className="mt-2 space-y-2">
                        <div>
                          <span className="text-[var(--cb-text-muted)]">Surface:</span>{' '}
                          <span className="text-[var(--cb-text-primary)]">{message.meta.executionTrace.surface}</span>
                        </div>
                        <div>
                          <span className="text-[var(--cb-text-muted)]">Route:</span>{' '}
                          <span className="text-[var(--cb-text-primary)]">{message.meta.executionTrace.routeIntent || 'n/a'}</span>
                        </div>
                        <div>
                          <span className="text-[var(--cb-text-muted)]">Model:</span>{' '}
                          <span className="text-[var(--cb-text-primary)]">{message.meta.executionTrace.modelType || 'n/a'}</span>
                        </div>
                        <div>
                          <div className="mb-1 text-[var(--cb-text-muted)]">Fired Services</div>
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
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {message.role === 'assistant' &&
                    message.meta?.retrievalWarnings &&
                    message.meta.retrievalWarnings.length > 0 && (
                      <div className="mt-2 text-[11px] text-amber-300/90">
                        {message.meta.retrievalWarnings.join(' • ')}
                      </div>
                    )}
                  {message.role === 'assistant' && message.meta?.dcfDemo && (
                    <AnalystDcfCard
                      payload={message.meta.dcfDemo}
                      onAdjust={(adjustment) => props.onDcfAdjustment(message.id, message.meta!.dcfDemo!, adjustment)}
                      onRunEventShock={(promptText) => props.onDcfEventShock(message.id, message.meta!.dcfDemo!, promptText)}
                    />
                  )}
                  {message.role === 'assistant' && message.meta?.generatedModel && (
                    <AnalystModelCard
                      payload={message.meta.generatedModel}
                      onAdjust={(adjustment) =>
                        props.onModelAdjustment(message.id, message.meta!.generatedModel!, adjustment)
                      }
                      onAdjustFromEvent={props.onAdjustFromEvent}
                      onSuggestSmartAssumptions={() => void props.onSuggestSmartAssumptions()}
                    />
                  )}
                  {message.role === 'assistant' && message.meta?.coreTemplateModel && (
                    <AnalystCoreTemplateCard payload={message.meta.coreTemplateModel} />
                  )}
                  {message.role === 'assistant' && message.meta?.stockLookup && (
                    <AnalystStockCard payload={message.meta.stockLookup} />
                  )}
                  {message.role === 'assistant' && message.meta?.visualization && (
                    <AnalystVisualizationCard payload={message.meta.visualization} />
                  )}
                </div>
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
                    <div className="text-xs text-[var(--cb-text-muted)]">{props.loadingState.detail}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={props.bottomRef} />
        </div>
        <div className="border-t border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
          {latestModelMessage ? (
            <div className="mb-4 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                    Quick Assumption Update
                  </div>
                  <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
                    Paste a headline or event excerpt here to adjust the active model’s assumptions without leaving chat.
                  </div>
                  <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
                    Reviewed updates can move growth, margin, WACC, or terminal growth when the event actually supports it.
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
              onKeyDownCapture={(event) => {
                event.stopPropagation();
              }}
              onKeyUpCapture={(event) => {
                event.stopPropagation();
              }}
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
                  Waiting for {props.pendingModelRequest.clarificationField?.replace(/([A-Z])/g, ' $1').toLowerCase() || 'the next required input'} to continue the model build.
                </span>
              ) : props.attachment ? (
                <span>Using {props.attachment.kind.replace(/_/g, ' ')} context from {props.attachment.name}.</span>
              ) : (
                <span>Attach earnings reports, model files, or notes for additional context.</span>
              )}
              <Button type="submit" disabled={props.isLoading || !props.input.trim()}>
                {props.isLoading ? 'Thinking…' : props.pendingModelRequest ? 'Continue Model' : 'Ask'}
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

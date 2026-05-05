'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnalystChatSurface } from '@/components/analyst/AnalystChatAppParts';
import { parseUploadedAttachment, type UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import type { AttachmentStatusPayload as AnalystAttachmentStatus } from '@/lib/analyst/attachmentStatus';
import { buildClientVisibleBackendError } from '@/lib/analyst/clientErrorResponse';
import type { AnalystCoreTemplatePayload } from '@/lib/analyst/coreModelTemplates';
import {
  isTeslaDemoProgressionPrompt,
  isTeslaTicker,
  looksLikeTeslaDemoEntryPrompt,
  looksLikeTeslaDemoInterpretationPrompt,
  type AnalystDemoStep,
} from '@/lib/analyst/demoWorkflow';
import type { AnalystDcfAdjustment, AnalystDcfDemoPayload, AnalystDcfEventContext } from '@/lib/analyst/dcfDemo';
import { deriveOutputFromDcf, deriveOutputFromGeneratedModel, type AnalystOutput, type InvestmentSignal } from '@/lib/analyst/investmentOutput';
import type { PendingModelRequest } from '@/lib/analyst/modelReadiness';
import { routeAnalystQuery } from '@/lib/analyst/router';
import type { AnalystScenarioCardPayload } from '@/lib/analyst/scenarioCard';
import { looksLikeTeslaMacroScenarioPrompt } from '@/lib/analyst/scenarioCard';
import type { AnalystGeneratedModelPayload, AnalystStructuredModelAdjustment } from '@/lib/analyst/types';
import type { AnalystForecastModelPayload } from '@/lib/analyst/forecastModel';
import type { AnalystEarningsSummaryCard } from '@/lib/analyst/earningsSummary';
import {
  buildSmartAssumptionRequestFromGeneratedModel,
} from '@/lib/analyst/modelAdjustmentHelpers';
import type { AnalystVisualizationPayload } from '@/lib/analyst/visualization';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';
import type { AppExecutionTrace } from '@/lib/debug/executionTrace';
import {
  buildAnalystSmartAssumptionOverrides,
} from '@/lib/smart-assumptions/shared';
import type { SmartAssumptionResult } from '@/lib/smart-assumptions/types';

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
    forecastModel?: AnalystForecastModelPayload;
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

type StockOpportunityContext = {
  ticker: string;
  score: number | null;
  signal: string | null;
  horizonWeeks: number | null;
  primaryReason: string | null;
  mainRisk: string | null;
};

function userExplicitlyWantsStructuredOutput(message: string): boolean {
  const text = message.toLowerCase();
  return /\b(bullets?|bullet points?|table|json|memo|sections?|headers?|outline|format|template|list)\b/.test(text);
}

function stripTemplatePhrasing(content: string): string {
  return content
    .replace(
      /^\s*(summary paragraph|why it matters paragraph|analysis paragraph|impacted stocks or sectors|most affected stocks\/sectors|most affected stocks and sectors|summary|impact|analysis|diagnosis|rewrite|key facts|what happened|why it matters|market impact|what to watch next|business model|key financials|growth drivers|risks|how to forecast|catalysts)\s*:\s*/gim,
      '',
    )
    .replace(/(?:^|\n)\s*impacted stocks or sectors\s*\n+/gi, '\n')
    .replace(/(?:^|\n)\s*most affected stocks\/sectors\s*\n+/gi, '\n')
    .replace(/(?:^|\n)\s*most affected stocks and sectors\s*\n+/gi, '\n')
    .replace(/\bTIME\.\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripInlineCitations(content: string): string {
  return content
    .replace(/\s*\(\s*\[[^\]]+\]\((https?:\/\/[^)]+)\)\s*\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/\s*\((https?:\/\/[^)\s]+)\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanAssistantText(content: string, preserveStructure = false): string {
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '').trim())
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\n\s*---+\s*\n/g, '\n')
    .replace(/^\s*[•*+]\s+/gm, '- ')
    .replace(/^\s*\d+[.)]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+\n/g, '\n')
    .trim();

  const withoutInlineCitations = stripInlineCitations(normalized);
  return preserveStructure ? withoutInlineCitations : stripTemplatePhrasing(withoutInlineCitations);
}

function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseSignal(value: unknown): InvestmentSignal | undefined {
  const raw = isRecord(value) ? value.position ?? value.direction : value;
  if (raw === 'LONG' || raw === 'SHORT' || raw === 'NEUTRAL') return raw;
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toUpperCase();
  return normalized === 'LONG' || normalized === 'SHORT' || normalized === 'NEUTRAL'
    ? normalized
    : undefined;
}

function parseConfidenceBreakdown(value: unknown): AnalystOutput['confidenceBreakdown'] {
  if (!isRecord(value)) return undefined;
  return {
    model: finiteNumber(value.model),
    accuracy: finiteNumber(value.accuracy),
    sampleSize: finiteNumber(value.sampleSize) ?? finiteNumber(value.sample_size) ?? 0,
  };
}

function parseSizePct(payload: Record<string, unknown>): number | null {
  const topLevel = finiteNumber(payload.size_pct) ?? finiteNumber(payload.sizePct);
  if (topLevel !== null) return topLevel;
  if (!isRecord(payload.signal)) return null;
  return finiteNumber(payload.signal.size_pct) ?? finiteNumber(payload.signal.sizePct);
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseNumberSeries(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => finiteNumber(item))
    .filter((item): item is number => item !== null);
}

function parseNullableFloat(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOpportunityContext(searchParams: ReturnType<typeof useSearchParams>): StockOpportunityContext | null {
  const tickerParam = searchParams.get('ticker')?.trim().toUpperCase();
  if (!tickerParam) return null;
  return {
    ticker: tickerParam,
    score: parseNullableFloat(searchParams.get('score')),
    signal: searchParams.get('signal')?.trim().toLowerCase() ?? null,
    horizonWeeks: parseNullableFloat(searchParams.get('horizonWeeks')),
    primaryReason: searchParams.get('reason')?.trim() || null,
    mainRisk: searchParams.get('risk')?.trim() || null,
  };
}

function buildInitialOpportunityPrompt(context: StockOpportunityContext): string {
  const scoreText = context.score !== null ? ` Score: ${context.score.toFixed(1)}/10.` : '';
  const signalText = context.signal ? ` Signal: ${context.signal}.` : '';
  const reasonText = context.primaryReason ? ` Ranked reason: ${context.primaryReason}.` : '';
  const riskText = context.mainRisk ? ` Main risk: ${context.mainRisk}.` : '';
  const horizonText = context.horizonWeeks !== null ? ` Horizon: ${context.horizonWeeks} weeks.` : ' Horizon: 1-3 months.';
  return `Here’s why this stock is ranked here. Analyze ${context.ticker} as a ranked 1-3 month stock opportunity.${scoreText}${signalText}${horizonText}${reasonText}${riskText} Explain the rank, forecast path, catalysts, valuation context, technical confirmation, what could change the score, and give a concise pitch-ready view.`;
}

function parseEventContext(value: unknown): AnalystDcfEventContext[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AnalystDcfEventContext | null => {
      if (!isRecord(item)) return null;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const impact = typeof item.impact === 'string' ? item.impact.trim() : '';
      const eventType = typeof item.eventType === 'string'
        ? item.eventType.trim()
        : typeof item.event_type === 'string'
          ? item.event_type.trim()
          : '';
      const horizon = typeof item.horizon === 'string' ? item.horizon.trim() : '';
      const severity = finiteNumber(item.severity) ?? 0;
      const sourceName = typeof item.sourceName === 'string'
        ? item.sourceName.trim()
        : typeof item.source_name === 'string'
          ? item.source_name.trim()
          : null;
      const publishedAt = typeof item.publishedAt === 'string'
        ? item.publishedAt
        : typeof item.published_at === 'string'
          ? item.published_at
          : null;
      const signal = parseSignal(item.signal);
      if (!title || !impact) return null;
      return {
        title,
        eventType: eventType || 'MarketEvent',
        severity,
        horizon: horizon || 'NearTerm',
        impact,
        sourceName,
        publishedAt,
        signal: signal ?? null,
      };
    })
    .filter((item): item is AnalystDcfEventContext => item !== null)
    .slice(0, 3);
}

function parseAnalystOutput(payload: Record<string, unknown> | null): AnalystOutput | undefined {
  if (!payload) return undefined;
  const hasStructuredOutput =
    'signal' in payload ||
    'position' in payload ||
    'direction' in payload ||
    'impact_summary' in payload ||
    'percentChange' in payload ||
    'percent_change' in payload ||
    'valuation_change' in payload ||
    'valuationChange' in payload ||
    'primaryDriver' in payload ||
    'primary_driver' in payload ||
    'attributionExplanation' in payload ||
    'attribution_explanation' in payload ||
    'confidence' in payload ||
    'confidence_breakdown' in payload ||
    'confidenceBreakdown' in payload ||
    'drivers' in payload ||
    'secondaryDrivers' in payload ||
    'secondary_drivers' in payload ||
    'analystNote' in payload ||
    'analyst_note' in payload ||
    'investmentCapabilityMemo' in payload ||
    'investment_capability_memo' in payload ||
    'strategicContext' in payload ||
    'strategic_context' in payload ||
    'eventContext' in payload ||
    'event_context' in payload ||
    'forecast' in payload ||
    'historical' in payload ||
    'targetPrice' in payload ||
    'target_price' in payload ||
    'stopLoss' in payload ||
    'stop_loss' in payload ||
    'currentPrice' in payload ||
    'current_price' in payload;
  if (!hasStructuredOutput) return undefined;

  const impactSummary = isRecord(payload.impact_summary) ? payload.impact_summary : null;
  const signal =
    parseSignal(payload.signal) ??
    parseSignal(payload.position) ??
    parseSignal(payload.direction) ??
    parseSignal(impactSummary?.direction);
  const percentChange =
    firstFinite(
      payload.percentChange,
      payload.percent_change,
      payload.valuationChange,
      payload.valuation_change,
      impactSummary?.valuation_change,
    ) ??
    undefined;
  const confidence =
    firstFinite(payload.confidence, isRecord(payload.signal) ? payload.signal.conviction : null);
  const analystNote =
    typeof payload.analystNote === 'string'
      ? payload.analystNote.trim()
      : typeof payload.analyst_note === 'string'
        ? payload.analyst_note.trim()
        : '';
  const investmentCapabilityMemo =
    typeof payload.investmentCapabilityMemo === 'string'
      ? payload.investmentCapabilityMemo.trim()
      : typeof payload.investment_capability_memo === 'string'
        ? payload.investment_capability_memo.trim()
        : '';
  const strategicContext =
    typeof payload.strategicContext === 'string'
      ? payload.strategicContext.trim()
      : typeof payload.strategic_context === 'string'
        ? payload.strategic_context.trim()
        : '';
  const primaryDriver =
    typeof payload.primaryDriver === 'string' && payload.primaryDriver.trim().length > 0
      ? payload.primaryDriver.trim()
      : typeof payload.primary_driver === 'string' && payload.primary_driver.trim().length > 0
        ? payload.primary_driver.trim()
        : typeof impactSummary?.primary_driver === 'string' && impactSummary.primary_driver.trim().length > 0
          ? impactSummary.primary_driver.trim()
        : isRecord(payload.signal) &&
            typeof payload.signal.primary_driver === 'string' &&
            payload.signal.primary_driver.trim().length > 0
          ? payload.signal.primary_driver.trim()
      : undefined;
  const attributionExplanation =
    typeof payload.attributionExplanation === 'string' && payload.attributionExplanation.trim().length > 0
      ? payload.attributionExplanation.trim()
      : typeof payload.attribution_explanation === 'string' && payload.attribution_explanation.trim().length > 0
        ? payload.attribution_explanation.trim()
      : undefined;

  const rawDrivers = Array.isArray(payload.drivers)
    ? payload.drivers
    : Array.isArray(payload.secondaryDrivers)
      ? payload.secondaryDrivers
      : Array.isArray(payload.secondary_drivers)
        ? payload.secondary_drivers
        : [];
  const drivers = rawDrivers
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());

  const confidenceBreakdownSource =
    payload.confidence_breakdown ?? payload.confidenceBreakdown;
  const targetPrice = firstFinite(
    payload.targetPrice,
    payload.target_price,
    isRecord(payload.signal) ? payload.signal.target_price : null,
  );
  const stopLoss = firstFinite(
    payload.stopLoss,
    payload.stop_loss,
    isRecord(payload.signal) ? payload.signal.stop_loss : null,
  );
  const currentPrice = firstFinite(
    payload.currentPrice,
    payload.current_price,
    isRecord(payload.signal) ? payload.signal.current_price : null,
  );
  const ticker =
    typeof payload.ticker === 'string' && payload.ticker.trim().length > 0
      ? payload.ticker.trim().toUpperCase()
      : isRecord(payload.signal) && typeof payload.signal.ticker === 'string' && payload.signal.ticker.trim().length > 0
        ? payload.signal.ticker.trim().toUpperCase()
      : undefined;
  const tradeHorizon =
    typeof payload.horizon === 'string' && payload.horizon.trim().length > 0
      ? payload.horizon.trim()
      : typeof payload.tradeHorizon === 'string' && payload.tradeHorizon.trim().length > 0
        ? payload.tradeHorizon.trim()
        : undefined;

  const analystOutput: AnalystOutput = {
    signal,
    percentChange,
    primaryDriver,
    attributionExplanation,
    confidence: confidence ?? undefined,
    confidenceBreakdown: parseConfidenceBreakdown(confidenceBreakdownSource),
    drivers,
    analystNote: analystNote || undefined,
    investmentCapabilityMemo: investmentCapabilityMemo || undefined,
    strategicContext: strategicContext || undefined,
    eventContext: parseEventContext(payload.eventContext ?? payload.event_context),
    sizePct: parseSizePct(payload),
    forecast: parseNumberSeries(payload.forecast),
    historical: parseNumberSeries(payload.historical),
    ticker,
    targetPrice,
    stopLoss,
    currentPrice,
    tradeHorizon,
  };

  if (!analystOutput.signal && isRecord(payload.signal)) {
    analystOutput.signal = parseSignal(payload.signal);
  }

  return analystOutput;
}

function parseAttachmentStatus(payload: Record<string, unknown> | null): AnalystAttachmentStatus | undefined {
  if (!payload || !payload.attachmentStatus || typeof payload.attachmentStatus !== 'object') return undefined;
  return payload.attachmentStatus as AnalystAttachmentStatus;
}

type AgentLoadingState = {
  title: string;
  detail: string;
  routeLabel: string;
  steps: string[];
  activeStep: number;
};

function getLoadingPlan(prompt: string, ticker?: string): AgentLoadingState {
  const text = prompt.toLowerCase();
  const route = routeAnalystQuery(prompt, ticker);

  if (looksLikeTeslaMacroScenarioPrompt(prompt, ticker)) {
    return {
      title: 'Applying macro scenario...',
      detail: 'Recomputing valuation...',
      routeLabel: 'AI scenario',
      steps: ['Routing request', 'Applying macro scenario', 'Recomputing valuation'],
      activeStep: 0,
    };
  }

  if (route.intent === 'financial_model') {
    return {
      title: /\bforecast|projection|operating forecast|operating model\b/.test(text)
        ? 'Building forecast model'
        : 'Building model',
      detail: 'Routing the request, resolving company inputs, then preparing the model artifact.',
      routeLabel: 'Financial model',
      steps: [
        'Routing request',
        'Resolving company inputs',
        'Applying assumptions and defaults',
        'Preparing model output',
      ],
      activeStep: 0,
    };
  }

  if (route.intent === 'company_question') {
    const earningsHeavy = route.prefersEarningsContext || route.requiresQuarterReportContext || /\bearnings|quarter|guidance|results\b/.test(text);
    return {
      title: earningsHeavy ? 'Reviewing company and earnings context' : 'Analyzing company',
      detail: earningsHeavy
        ? 'Routing the request, checking earnings context, then grounding the response in company evidence.'
        : 'Routing the request, gathering company facts, then writing the answer.',
      routeLabel: earningsHeavy ? 'Company / earnings' : 'Company research',
      steps: earningsHeavy
        ? ['Routing request', 'Checking earnings context', 'Gathering company evidence', 'Drafting answer']
        : ['Routing request', 'Gathering company facts', 'Ranking sources', 'Drafting answer'],
      activeStep: 0,
    };
  }

  if (route.intent === 'market_question' || route.intent === 'event_intelligence') {
    return {
      title: route.intent === 'event_intelligence' ? 'Reviewing market events' : 'Analyzing market',
      detail: 'Routing the request, collecting market context, then writing the transmission path.',
      routeLabel: route.intent === 'event_intelligence' ? 'Event intelligence' : 'Market research',
      steps: ['Routing request', 'Collecting market context', 'Ranking signals', 'Drafting answer'],
      activeStep: 0,
    };
  }

  return {
    title: 'Working',
    detail: 'Routing the request and preparing the response.',
    routeLabel: 'General finance',
    steps: ['Routing request', 'Gathering context', 'Drafting answer'],
    activeStep: 0,
  };
}

export function AnalystChatApp() {
  const searchParams = useSearchParams();
  const showExecutionTrace = searchParams.get('trace') === '1';
  const opportunityContext = readOpportunityContext(searchParams);
  const [ticker, setTicker] = useState('');
  const [attachment, setAttachment] = useState<UploadedAttachmentContext | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<AgentLoadingState | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoStep, setDemoStep] = useState<AnalystDemoStep | null>(null);
  const [memoPdfLoadingId, setMemoPdfLoadingId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [pendingModelRequest, setPendingModelRequest] = useState<PendingModelRequest | null>(null);
  const [quickEventTitle, setQuickEventTitle] = useState('');
  const [quickEventText, setQuickEventText] = useState('');
  const [quickEventSource, setQuickEventSource] = useState('');
  const [quickEventError, setQuickEventError] = useState<string | null>(null);
  const [quickEventNotice, setQuickEventNotice] = useState<string | null>(null);
  const [quickEventApplying, setQuickEventApplying] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const quickEventTextRef = useRef<HTMLTextAreaElement>(null);
  const initialOpportunitySentRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const storageKey = 'capitalbase-analyst-session-id';
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      setSessionId(existing);
      return;
    }
    const created = crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    setSessionId(created);
  }, []);

  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!opportunityContext?.ticker) return;
    setTicker(opportunityContext.ticker);
  }, [opportunityContext?.ticker]);

  const focusQuickEventComposer = () => {
    quickEventTextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => {
      quickEventTextRef.current?.focus();
    });
  };

  function getLatestGeneratedArtifact() {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate.role !== 'assistant') continue;
      if (candidate.meta?.generatedModel || candidate.meta?.dcfDemo || candidate.meta?.stockLookup) {
        return {
          generatedModel: candidate.meta?.generatedModel ?? null,
          dcfDemo: candidate.meta?.dcfDemo ?? null,
          stockLookup: candidate.meta?.stockLookup ?? null,
        };
      }
    }
    return { generatedModel: null, dcfDemo: null, stockLookup: null };
  }

  function getLatestGeneratedModelMessage() {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate.role !== 'assistant' || !candidate.meta?.generatedModel) continue;
      return {
        messageId: candidate.id,
        payload: candidate.meta.generatedModel,
      };
    }
    return null;
  }

  function getPromptForAssistantMessage(index: number): string | undefined {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (messages[cursor]?.role === 'user') return messages[cursor]?.content;
    }
    return undefined;
  }

  const handleAttachment = async (file: File | null) => {
    if (!file) {
      setAttachment(null);
      setAttachmentError(null);
      setPendingModelRequest(null);
      return;
    }
    try {
      setAttachmentError(null);
      const parsed = await parseUploadedAttachment(file);
      setAttachment(parsed);
      setPendingModelRequest(null);
    } catch (error) {
      console.error('Attachment parse error', error);
      setAttachment(null);
      setAttachmentError('Unable to parse the uploaded file.');
    }
  };

  const handleDownloadMemoPdf = async (messageId: string, content: string, prompt?: string, sources?: string[]) => {
    if (memoPdfLoadingId) return;

    setMemoPdfLoadingId(messageId);
    try {
      const response = await fetch('/api/analyst-chat/memo-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prompt ? `CapitalBase Memo - ${prompt.slice(0, 72)}` : 'CapitalBase Analyst Memo',
          prompt,
          content,
          sources,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Failed to generate memo PDF.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || 'capitalbase_analyst_memo.pdf';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setMemoPdfLoadingId(null);
    }
  };

  const submitPrompt = async (prompt: string) => {
    if (!prompt || isLoading) return;

    const explicitTicker = ticker.trim().length > 0 ? ticker.trim().toUpperCase() : undefined;
    const entersTeslaDemo = looksLikeTeslaDemoEntryPrompt(prompt, explicitTicker);
    const staysInTeslaDemo = isTeslaDemoProgressionPrompt(prompt, explicitTicker);
    if (entersTeslaDemo) {
      setDemoMode(true);
      setDemoStep(null);
    } else if (demoMode && !staysInTeslaDemo) {
      setDemoMode(false);
      setDemoStep(null);
    }

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    const loadingPlan = getLoadingPlan(prompt, explicitTicker);
    setLoadingState(loadingPlan);
    const isScenarioMode = looksLikeTeslaMacroScenarioPrompt(
      prompt,
      explicitTicker,
    );
    const requestStartedAt = Date.now();
    const preserveStructure = userExplicitlyWantsStructuredOutput(prompt);
    const latestArtifact = getLatestGeneratedArtifact();
    const isClarificationTurn = Boolean(pendingModelRequest);
    const loadingInterval = window.setInterval(() => {
      setLoadingState((prev) => {
        if (!prev || prev.activeStep >= prev.steps.length - 1) return prev;
        return {
          ...prev,
          activeStep: prev.activeStep + 1,
        };
      });
    }, 1400);

    try {
      const response = await fetch('/api/analyst-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Optional ticker context; chat should still work without it.
        body: JSON.stringify({
          ticker: explicitTicker,
          attachmentContext: attachment,
          sessionId,
          currentModel: latestArtifact.generatedModel,
          currentDcf: latestArtifact.dcfDemo,
          currentStock: latestArtifact.stockLookup,
          messages: [...messages, userMessage],
          clarificationAnswer: isClarificationTurn ? prompt : undefined,
          inputOverrides: pendingModelRequest?.inputOverrides,
          pendingModelRequest: pendingModelRequest ?? undefined,
        })
      });
      const rawBody = await response.text();
      const payload = rawBody ? tryParseJson<Record<string, unknown>>(rawBody) : null;

      if (!response.ok) {
        const backendMessage = buildClientVisibleBackendError({
          rawBody,
          payload,
          fallbackStatusText: `Analyst Chat request failed (${response.status}).`,
        });
        if (rawBody.trim().length > 0 && rawBody.trim().startsWith('<')) {
          console.error('Analyst Chat returned non-JSON error body', {
            status: response.status,
            body: rawBody.slice(0, 1000),
          });
        }
        throw new Error(backendMessage || `Analyst Chat request failed (${response.status}).`);
      }

      if (!payload) {
        throw new Error(rawBody.trim() || 'Analyst Chat returned an invalid response.');
      }

      if (isScenarioMode) {
        const minDelayMs = 1200;
        const elapsed = Date.now() - requestStartedAt;
        if (elapsed < minDelayMs) {
          await new Promise((resolve) => window.setTimeout(resolve, minDelayMs - elapsed));
        }
      }

      const replyText =
        (payload?.mode === 'scenario' && payload?.scenarioCard && typeof payload.reply === 'string'
          ? payload.reply
          : payload && typeof payload.reply === 'string' && payload.reply.trim().length > 0
          ? payload.reply
          : payload && typeof payload.error === 'string' && payload.error.trim().length > 0
            ? payload.error
            : 'No response generated.');
      const reply: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: cleanAssistantText(replyText, preserveStructure),
        meta: {
          mode:
            payload?.mode === 'fallback'
              ? 'fallback'
              : payload?.mode === 'scenario'
                ? 'scenario'
                : 'live',
          reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
          structuredRequested: preserveStructure,
          sources: Array.isArray(payload?.sources)
            ? payload.sources.filter((item: unknown): item is string => typeof item === 'string').slice(0, 5)
            : [],
          retrievalWarnings: Array.isArray(payload?.retrievalWarnings)
            ? payload.retrievalWarnings.filter((item: unknown): item is string => typeof item === 'string').slice(0, 3)
            : [],
          attachmentUsed:
            typeof payload?.attachmentUsed === 'string' && payload.attachmentUsed.trim().length > 0
              ? payload.attachmentUsed
              : undefined,
          dcfDemo:
            payload?.dcfDemo && typeof payload.dcfDemo === 'object'
              ? (payload.dcfDemo as AnalystDcfDemoPayload)
              : undefined,
          generatedModel:
            payload?.generatedModel && typeof payload.generatedModel === 'object'
              ? (payload.generatedModel as AnalystGeneratedModelPayload)
              : undefined,
          forecastModel:
            payload?.forecastModel && typeof payload.forecastModel === 'object'
              ? (payload.forecastModel as AnalystForecastModelPayload)
              : undefined,
          coreTemplateModel:
            payload?.coreTemplateModel && typeof payload.coreTemplateModel === 'object'
              ? (payload.coreTemplateModel as AnalystCoreTemplatePayload)
              : undefined,
          stockLookup:
            payload?.stockLookup && typeof payload.stockLookup === 'object'
              ? (payload.stockLookup as StockLookupResult)
              : undefined,
          visualization:
            payload?.visualization && typeof payload.visualization === 'object'
              ? (payload.visualization as AnalystVisualizationPayload)
              : undefined,
          attachmentStatus: parseAttachmentStatus(payload),
          executionTrace:
            payload?.executionTrace && typeof payload.executionTrace === 'object'
              ? (payload.executionTrace as AppExecutionTrace)
              : undefined,
          earningsSummary:
            payload?.earningsSummary && typeof payload.earningsSummary === 'object'
              ? (payload.earningsSummary as AnalystEarningsSummaryCard)
              : undefined,
          scenarioCard:
            payload?.scenarioCard && typeof payload.scenarioCard === 'object'
              ? (payload.scenarioCard as AnalystScenarioCardPayload)
              : undefined,
          needsClarification: payload?.needsClarification === true,
          clarificationQuestion:
            typeof payload?.clarificationQuestion === 'string' ? payload.clarificationQuestion : undefined,
          clarificationField:
            typeof payload?.clarificationField === 'string' ? payload.clarificationField : undefined,
          clarificationFieldLabel:
            typeof payload?.clarificationFieldLabel === 'string' ? payload.clarificationFieldLabel : undefined,
          remainingMissingInputs: Array.isArray(payload?.remainingMissingInputs)
            ? payload.remainingMissingInputs.filter((item: unknown): item is string => typeof item === 'string')
            : undefined,
          pendingModelRequest:
            payload?.pendingModelRequest && typeof payload.pendingModelRequest === 'object'
              ? (payload.pendingModelRequest as PendingModelRequest)
              : undefined,
          analystOutput: parseAnalystOutput(payload) ??
            (payload?.dcfDemo && typeof payload.dcfDemo === 'object'
              ? deriveOutputFromDcf(payload.dcfDemo as AnalystDcfDemoPayload)
              : payload?.generatedModel && typeof payload.generatedModel === 'object'
                ? (deriveOutputFromGeneratedModel(payload.generatedModel as AnalystGeneratedModelPayload) ?? undefined)
                : undefined),
        },
      };
      if (process.env.NODE_ENV !== 'production' && payload?.executionTrace) {
        console.debug('[analyst-chat] execution trace', payload.executionTrace);
      }
      if (reply.meta?.earningsSummary && isTeslaTicker(reply.meta.earningsSummary.ticker) && (demoMode || entersTeslaDemo)) {
        setDemoMode(true);
        setDemoStep('earnings');
      } else if (
        reply.meta?.mode === 'scenario' &&
        reply.meta?.scenarioCard &&
        reply.meta.scenarioCard.company.trim().toLowerCase() === 'tesla' &&
        (demoMode || staysInTeslaDemo)
      ) {
        setDemoMode(true);
        setDemoStep('scenario');
      } else if ((demoMode || staysInTeslaDemo) && looksLikeTeslaDemoInterpretationPrompt(prompt)) {
        setDemoMode(true);
        setDemoStep('interpretation');
      }
      setMessages((prev) => [...prev, reply]);
      setPendingModelRequest(reply.meta?.needsClarification ? reply.meta?.pendingModelRequest ?? null : null);
    } catch (error) {
      console.error('Chat error', error);
      if (isScenarioMode) {
        const minDelayMs = 1200;
        const elapsed = Date.now() - requestStartedAt;
        if (elapsed < minDelayMs) {
          await new Promise((resolve) => window.setTimeout(resolve, minDelayMs - elapsed));
        }
      }
      const failureMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : 'Unable to generate a response at the moment.';
      const reply: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: cleanAssistantText(failureMessage, preserveStructure),
        meta: {
          structuredRequested: preserveStructure,
        },
      };
      setMessages((prev) => [...prev, reply]);
    } finally {
      window.clearInterval(loadingInterval);
      setIsLoading(false);
      setLoadingState(null);
      requestAnimationFrame(() => {
        promptRef.current?.focus();
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitPrompt(input.trim());
  };

  const handleQuickPrompt = async (text: string) => {
    await submitPrompt(text.trim());
  };

  useEffect(() => {
    if (!opportunityContext || initialOpportunitySentRef.current || isLoading) return;
    initialOpportunitySentRef.current = true;
    void submitPrompt(buildInitialOpportunityPrompt(opportunityContext));
    // Opening a ranked stock should trigger exactly one initial analyst read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityContext, isLoading]);

  const handleDcfAdjustment = async (
    messageId: string,
    payload: AnalystDcfDemoPayload,
    adjustment: AnalystDcfAdjustment,
  ) => {
    const response = await fetch('/api/analyst-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        currentDcf: payload,
        dcfAdjustment: adjustment,
      }),
    });

    const rawBody = await response.text();
    const parsed = rawBody ? tryParseJson<Record<string, unknown>>(rawBody) : null;
    if (!response.ok) {
      const backendMessage = buildClientVisibleBackendError({
        rawBody,
        payload: parsed,
        fallbackStatusText: `DCF adjustment failed (${response.status}).`,
      });
      throw new Error(backendMessage || `DCF adjustment failed (${response.status}).`);
    }
    if (!parsed) {
      throw new Error(rawBody.trim() || 'DCF adjustment returned an invalid response.');
    }

    const replyText =
      typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
        ? parsed.reply
        : 'Updated the DCF assumptions.';

    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          content: cleanAssistantText(replyText, false),
          meta: {
            ...message.meta,
            mode: parsed?.mode === 'fallback' ? 'fallback' : 'live',
            reason: typeof parsed?.reason === 'string' ? parsed.reason : undefined,
            sources: Array.isArray(parsed?.sources)
              ? parsed.sources.filter((item: unknown): item is string => typeof item === 'string').slice(0, 5)
              : message.meta?.sources,
            dcfDemo:
              parsed?.dcfDemo && typeof parsed.dcfDemo === 'object'
                ? (parsed.dcfDemo as AnalystDcfDemoPayload)
                : message.meta?.dcfDemo,
            attachmentStatus: parseAttachmentStatus(parsed) ?? message.meta?.attachmentStatus,
          },
        };
      }),
    );
  };

  const handleDcfEventShock = async (
    messageId: string,
    payload: AnalystDcfDemoPayload,
    prompt: string,
  ) => {
    const response = await fetch('/api/analyst-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        currentDcf: payload,
        dcfEventShockPrompt: prompt,
      }),
    });

    const rawBody = await response.text();
    const parsed = rawBody ? tryParseJson<Record<string, unknown>>(rawBody) : null;
    if (!response.ok) {
      const backendMessage =
        (parsed && typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
          ? parsed.reply
          : parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0
            ? parsed.error
            : rawBody.trim());
      throw new Error(backendMessage || `DCF event shock failed (${response.status}).`);
    }
    if (!parsed) {
      throw new Error(rawBody.trim() || 'DCF event shock returned an invalid response.');
    }

    const replyText =
      typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
        ? parsed.reply
        : 'Updated the DCF with the selected event shock.';

    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          content: cleanAssistantText(replyText, false),
          meta: {
            ...message.meta,
            mode: parsed?.mode === 'fallback' ? 'fallback' : 'live',
            reason: typeof parsed?.reason === 'string' ? parsed.reason : undefined,
            sources: Array.isArray(parsed?.sources)
              ? parsed.sources.filter((item: unknown): item is string => typeof item === 'string').slice(0, 5)
              : message.meta?.sources,
            dcfDemo:
              parsed?.dcfDemo && typeof parsed.dcfDemo === 'object'
                ? (parsed.dcfDemo as AnalystDcfDemoPayload)
                : message.meta?.dcfDemo,
            attachmentStatus: parseAttachmentStatus(parsed) ?? message.meta?.attachmentStatus,
          },
        };
      }),
    );
  };

  const handleModelAdjustment = async (
    messageId: string,
    payload: AnalystGeneratedModelPayload,
    adjustment: AnalystStructuredModelAdjustment,
  ) => {
    const response = await fetch('/api/analyst-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        currentModel: payload,
        modelAdjustment: adjustment,
      }),
    });

    const rawBody = await response.text();
    const parsed = rawBody ? tryParseJson<Record<string, unknown>>(rawBody) : null;
    if (!response.ok) {
      const backendMessage =
        (parsed && typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
          ? parsed.reply
          : parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0
            ? parsed.error
            : rawBody.trim());
      throw new Error(backendMessage || `Model adjustment failed (${response.status}).`);
    }
    if (!parsed) {
      throw new Error(rawBody.trim() || 'Model adjustment returned an invalid response.');
    }

    const replyText =
      typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
        ? parsed.reply
        : 'Updated the model assumptions.';

    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          content: cleanAssistantText(replyText, false),
          meta: {
            ...message.meta,
            mode: parsed?.mode === 'fallback' ? 'fallback' : 'live',
            reason: typeof parsed?.reason === 'string' ? parsed.reason : undefined,
            sources: Array.isArray(parsed?.sources)
              ? parsed.sources.filter((item: unknown): item is string => typeof item === 'string').slice(0, 5)
              : message.meta?.sources,
            generatedModel:
              parsed?.generatedModel && typeof parsed.generatedModel === 'object'
                ? (parsed.generatedModel as AnalystGeneratedModelPayload)
                : message.meta?.generatedModel,
            attachmentStatus: parseAttachmentStatus(parsed) ?? message.meta?.attachmentStatus,
          },
        };
      }),
    );
  };

  const handleQuickEventApply = async () => {
    const latestModelMessage = getLatestGeneratedModelMessage();
    if (!latestModelMessage || !quickEventText.trim() || quickEventApplying) return;

    setQuickEventApplying(true);
    setQuickEventError(null);
    setQuickEventNotice(null);
    try {
      await handleModelAdjustment(latestModelMessage.messageId, latestModelMessage.payload, {
        changes: {},
        eventContext: {
          sourceType: 'pasted_text',
          title: quickEventTitle.trim() || null,
          rawEventText: quickEventText.trim(),
          sourceLabel: quickEventSource.trim() || null,
        },
      });
      setQuickEventTitle('');
      setQuickEventText('');
      setQuickEventSource('');
      setQuickEventNotice('Applied the reviewed event adjustment to the active model assumptions.');
    } catch (error) {
      setQuickEventError(error instanceof Error ? error.message : 'Unable to apply event update.');
    } finally {
      setQuickEventApplying(false);
    }
  };

  const handleSuggestSmartAssumptions = async (
    messageId: string,
    payload: AnalystGeneratedModelPayload,
  ) => {
    const requestPayload = buildSmartAssumptionRequestFromGeneratedModel(payload);
    const response = await fetch('/api/smart-assumptions/derive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    const rawBody = await response.text();
    const parsed = rawBody ? tryParseJson<Record<string, unknown>>(rawBody) : null;
    if (!response.ok) {
      const backendMessage =
        (parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0
          ? parsed.error
          : rawBody.trim()) || `Smart assumption derivation failed (${response.status}).`;
      throw new Error(backendMessage);
    }
    if (!parsed) {
      throw new Error(rawBody.trim() || 'Smart assumption derivation returned an invalid response.');
    }

    const smartAssumptionSummary = parsed as SmartAssumptionResult;
    if (smartAssumptionSummary.changedDrivers.length === 0) {
      throw new Error('Smart assumptions did not produce a material change for the active model.');
    }
    const changes = buildAnalystSmartAssumptionOverrides(
      payload.extractedInputs as Record<string, unknown>,
      smartAssumptionSummary,
    );
    if (Object.keys(changes).length === 0) {
      throw new Error('The current model does not expose compatible assumption fields for smart assumptions.');
    }

    await handleModelAdjustment(messageId, payload, {
      changes,
      smartAssumptionSummary,
    });
  };

  return (
    <AnalystChatSurface
      ticker={ticker}
      attachment={attachment}
      attachmentError={attachmentError}
      messages={messages}
      isLoading={isLoading}
      loadingState={loadingState}
      memoPdfLoadingId={memoPdfLoadingId}
      pendingModelRequest={pendingModelRequest}
      quickEventTitle={quickEventTitle}
      quickEventText={quickEventText}
      quickEventSource={quickEventSource}
      quickEventError={quickEventError}
      quickEventNotice={quickEventNotice}
      quickEventApplying={quickEventApplying}
      input={input}
      bottomRef={bottomRef}
      promptRef={promptRef}
      quickEventTextRef={quickEventTextRef}
      demoMode={demoMode}
      demoStep={demoStep}
      onTickerChange={(value) => {
        setTicker(value);
        if (value.trim().length > 0 && !isTeslaTicker(value)) {
          setDemoMode(false);
          setDemoStep(null);
        }
      }}
      onAttachmentSelect={handleAttachment}
      getPromptForAssistantMessage={getPromptForAssistantMessage}
      onDownloadMemoPdf={handleDownloadMemoPdf}
      onDcfAdjustment={handleDcfAdjustment}
      onDcfEventShock={handleDcfEventShock}
      onModelAdjustment={handleModelAdjustment}
      onAdjustFromEvent={focusQuickEventComposer}
      onSuggestSmartAssumptions={handleSuggestSmartAssumptions}
      getLatestGeneratedModelMessage={getLatestGeneratedModelMessage}
      onQuickEventTitleChange={setQuickEventTitle}
      onQuickEventTextChange={setQuickEventText}
      onQuickEventSourceChange={setQuickEventSource}
      onQuickEventApply={handleQuickEventApply}
      onQuickPrompt={handleQuickPrompt}
      onSubmit={handleSubmit}
      onInputChange={setInput}
      showExecutionTrace={showExecutionTrace}
      opportunityContext={opportunityContext}
    />
  );
}

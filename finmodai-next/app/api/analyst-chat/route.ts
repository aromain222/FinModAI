/**
 * CapitalBase Analyst Chat API
 *
 * Architecture:
 *   User question
 *        ↓
 *   Router classifies intent
 *        ↓
 *   Data retrieval (Perigon + FMP + web search)
 *        ↓
 *   Structured facts extracted
 *        ↓
 *   LLM analysis on verified data
 *
 * The model NEVER guesses. It reasons on verified, sourced facts.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import { overrideRouteFromAttachment } from '@/lib/analyst/attachmentRouting';
import { buildAttachmentStatus, type AttachmentStatusPayload } from '@/lib/analyst/attachmentStatus';
import { buildFilingPacket, classifyAttachmentFiling } from '@/lib/analyst/filingClassification';
import {
  extractPdfStatementPackage,
  type AttachmentStatementSnapshot,
} from '@/lib/analyst/pdfFinancialStatements';
import {
  assessPdfStatementExtraction,
  isPdfAttachment,
} from '@/lib/analyst/pdfModelSeeding';
import { extractPdfTextServer } from '@/lib/analyst/serverPdfExtraction';
import {
  runAiStatementCompletion,
  type MissingFieldSchema,
} from '@/lib/analyst/aiStatementCompletion';
import { routeAnalystQuery, type AnalystRoute } from '@/lib/analyst/router';
import { retrieveDataForRoute } from '@/lib/analyst/dataRetrieval';
import { extractVerifiedFacts, serializeFactsBriefForContext, type VerifiedFacts } from '@/lib/analyst/factsExtractor';
import { gatherAnalystRetrievalContext, inferTickerFromPrompt } from '@/lib/analyst/retrieval';
import {
  generateAnalystDcfDemo,
  isDcfEventShockPrompt,
  normalizeDcfSharesOutstanding,
  repairDcfPayloadShareCount,
  reviseAnalystDcfDemo,
  reviseAnalystDcfDemoFromAdjustment,
  reviseAnalystDcfDemoFromEventShock,
  type AnalystDcfAdjustment,
  type AnalystDcfDemoPayload,
  type AnalystDcfEventContext,
} from '@/lib/analyst/dcfDemo';
import {
  buildAnalystGeneratedModelExportSeed,
  buildAnalystGeneratedModelRecentRun,
  generateAnalystStructuredModel,
  reviseAnalystStructuredModelFromOverrides,
  isModelAdjustmentPrompt,
  reviseAnalystStructuredModel,
  type AnalystStructuredModelAdjustment,
  type AnalystGeneratedModelPayload,
} from '@/lib/analyst/modelChat';
import {
  evaluateAttachmentModelReadiness,
  parseAttachmentClarificationAnswer,
  type AttachmentDrivenModelType,
  type PendingModelRequest,
} from '@/lib/analyst/modelReadiness';
import { resolveAttachmentModelExtraction } from '@/lib/analyst/claudeModelExtraction';
import { savePromptModelRunVersion } from '@/lib/model-generator/runHistory';
import { toPromptRunSmartAssumptionSummary } from '@/lib/model-generator/runHistory';
import { toPromptRunCustomAssumptionSummary } from '@/lib/model-generator/runHistory';
import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { ANALYST_SYSTEM_PROMPT, getIntentPrompt } from '@/lib/analyst/prompts';
import {
  runEarningsRetrievalAgent,
  serializeEarningsRetrievalAgentResult,
  type EarningsRetrievalAgentResult,
  type EarningsRetrievalRuntimeMeta,
} from '@/lib/analyst/earningsRetrievalAgent';
import {
  buildDeterministicEarningsSummaryReply,
  buildDeterministicEarningsSummaryCard,
  isGenericEarningsSummaryPrompt,
} from '@/lib/analyst/earningsSummary';
import {
  buildTeslaDemoInterpretationReply,
  hasTeslaDemoHistory,
  isTeslaTicker,
  looksLikeTeslaDemoEntryPrompt,
  looksLikeTeslaDemoInterpretationPrompt,
} from '@/lib/analyst/demoWorkflow';
import {
  buildScenarioDcfAdjustmentFromPayload,
  buildAnalystScenarioCardPayload,
  buildScenarioStructuredModelOverridesFromPayload,
  looksLikeTeslaMacroScenarioPrompt,
  looksLikeScenarioDcfWorkflowPrompt,
  type AnalystScenarioCardPayload,
} from '@/lib/analyst/scenarioCard';
import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';
import { getAnthropicKeyCandidates } from '@/lib/anthropicKey';
import { getOpenAIKeyCandidates, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { lookupStock } from '@/lib/data/company/lookupStock';
import { detectCoreTemplatePrompt } from '@/lib/analyst/coreModelTemplates';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';
import { getMarketEvents } from '@/lib/news/marketEventsPipeline';
import type { MarketEvent } from '@/lib/news/marketEventsTypes';
import {
  buildEventAdjustedForecast,
  deriveMarketEventAdjustment,
  type EventAdjustedForecast,
  type EventAdjustmentInput,
  type PriceForecastPayload,
} from '@/lib/forecast/eventAdjustedForecast';
import { labelForecastSource, type AnalystForecastModelPayload, type ForecastNewsWatchItem, type ForecastTradingSignal } from '@/lib/analyst/forecastModel';
import { computePriceForecastBacktest } from '@/lib/analyst/forecastBacktest';
import { computeTechnicalConfirmation } from '@/lib/analyst/technicalConfirmation';
import { runPmAgentBrainForEvent, type PmAgentBrainOutput } from '@/lib/analyst/pmAgentBrain';
import { retrievePmPlaybookForEvent, type RetrievedPmPlaybook } from '@/lib/analyst/pmPlaybook';
import { featureFlags, serverEnv } from '@/lib/env/server';
import {
  buildComparisonVisualizationFromPrompt,
  buildRevenueForecastVisualizationFromDcf,
  buildSingleCompanyRevenueGrowthVisualization,
  buildVisualizationFromCurrentArtifact,
  generateVisualizationSpecFromPrompt,
  revenueDriverSummary,
} from '@/lib/analyst/visualization';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import {
  buildPersistentDriverContext,
  buildReasoningReply,
  translateFinancialReasoningToOverrides,
  type FinancialReasoningResponse,
} from '@/lib/analyst/revision/persistentModelReasoning';
import { deriveEventLinkedModelAdjustment } from '@/lib/model-events/deriveEventLinkedModelAdjustment';
import type { EventLinkedModelAdjustmentResult } from '@/lib/model-events/types';
import { runPublicFinancialSearch } from '@/lib/analyst/financialSearch';
import { buildEventContextFromPrompt, looksLikeEventLinkedModelFollowUp } from '@/lib/analyst/eventFollowUp';
import { getCompanyCatalystContext, type CompanyCatalystContext } from '@/lib/models/shared/companyCatalystContext';
import { buildSmartAssumptionReply } from '@/lib/smart-assumptions/shared';
import type { SmartAssumptionResult } from '@/lib/smart-assumptions/types';
import {
  addExecutionTraceNote,
  addExecutionTraceService,
  createExecutionTrace,
  withExecutionTrace,
} from '@/lib/debug/executionTrace';
import {
  buildAnalystCustomAssumptionOverrides,
  buildCurrentAssumptionsFromExtractedInputs,
  buildCustomAssumptionReply,
  looksLikeCustomAssumptionPrompt,
  parseCustomAssumptionPrompt,
  type CustomAssumptionResult,
} from '@/lib/analyst/customAssumptions';
import type { SmartScenarioDcfReport } from '@/lib/scenarios/aiSmartDcf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/* ────────── Utility Functions ────────── */

const WEB_TOOL_CANDIDATES = [{ type: 'web_search' }, { type: 'web_search_preview' }] as const;
const PDF_COMPLETION_SCHEMA: MissingFieldSchema[] = [
  { field: 'companyName', type: 'string', description: 'Legal company name in the statement header.', required: true },
  { field: 'ticker', type: 'string', description: 'Primary stock ticker symbol.', required: false },
  { field: 'fiscalPeriod', type: 'string', description: 'Fiscal period such as Q1 2026 or FY 2025.', required: false },
  { field: 'reportEndDate', type: 'string', description: 'Report end date in ISO format YYYY-MM-DD.', required: false },
  { field: 'revenue', type: 'number', description: 'Revenue in absolute USD units.', required: true },
  {
    field: 'operatingIncome',
    type: 'number',
    description: 'Operating income in absolute USD units.',
    required: true,
    anyOfGroup: 'profitability_anchor',
  },
  {
    field: 'ebitda',
    type: 'number',
    description: 'EBITDA in absolute USD units.',
    required: true,
    anyOfGroup: 'profitability_anchor',
  },
  {
    field: 'cash',
    type: 'number',
    description: 'Cash and cash equivalents in absolute USD units.',
    required: true,
    anyOfGroup: 'cash_or_debt_anchor',
  },
  {
    field: 'totalDebt',
    type: 'number',
    description: 'Total debt in absolute USD units.',
    required: true,
    anyOfGroup: 'cash_or_debt_anchor',
  },
  { field: 'sharesOutstanding', type: 'number', description: 'Diluted shares outstanding count.', required: false },
];

function getAttachmentSeedSnapshot(attachment: UploadedAttachmentContext | null): AttachmentStatementSnapshot | null {
  if (!attachment) return null;
  return attachment.aiStatementCompletion?.mergedSnapshot ?? attachment.statementPackage?.snapshot ?? null;
}

function redactSecrets(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
}

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { status?: number; message?: string; error?: { code?: string; message?: string } };
  const message = String(row.message || row.error?.message || '').toLowerCase();
  return row.status === 401 || message.includes('incorrect api key') || message.includes('invalid api key');
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { status?: number; message?: string; error?: { code?: string; message?: string } };
  const message = String(row.message || row.error?.message || '').toLowerCase();
  return row.status === 429 || message.includes('rate limit') || row.error?.code === 'rate_limit_exceeded';
}

function isDataAvailabilityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { message?: string; error?: { message?: string } };
  const message = String(row.message || row.error?.message || '').toLowerCase();
  return (
    message.includes('no matching company profile') ||
    message.includes('cached demo financials') ||
    message.includes('incomplete') ||
    message.includes('no data available')
  );
}

function classifyFailureReason(error: unknown): 'missing_key' | 'auth_failed' | 'rate_limited' | 'model_unavailable' | 'data_unavailable' {
  if (isAuthError(error)) return 'auth_failed';
  if (isRateLimitError(error)) return 'rate_limited';
  if (isDataAvailabilityError(error)) return 'data_unavailable';
  return 'model_unavailable';
}

function keyFingerprint(apiKey: string): string {
  return `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`;
}

function extractReplyFromCompletions(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const row = response as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = row.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim().length > 0) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part === 'object' && 'text' in part ? (part as { text?: unknown }).text : null))
      .filter((part): part is string => typeof part === 'string')
      .join('\n')
      .trim();
    if (text.length > 0) return text;
  }
  return null;
}

function hasPlaceholderNumbers(text: string): boolean {
  return /\b(?:\$?\s*X{2,}|\$?\s*xx|approximately\s+\$?\s*X{2,})\b/i.test(text);
}

function fmtMillions(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US')}`;
}

function buildEventAdjustmentSummary(adjustment: EventLinkedModelAdjustmentResult) {
  return {
    normalizedEventSummary: adjustment.normalizedEventSummary,
    eventCategory: adjustment.eventCategory,
    confidence: adjustment.confidence,
    scenarioBias: adjustment.scenarioBias,
    warnings: adjustment.warnings,
    blockingErrors: adjustment.blockingErrors,
    hasMaterialChanges: adjustment.hasMaterialChanges,
    transcription: adjustment.transcription,
  } as const;
}

function buildReasoningResponseFromEventAdjustment(
  adjustment: EventLinkedModelAdjustmentResult,
): FinancialReasoningResponse {
  return {
    intent: 'event_update',
    changes: adjustment.changes,
    updated_outputs: {
      valuation_change: null,
      key_driver_impact: adjustment.changedDrivers.map((change) => change.label).join(', '),
    },
    summary: adjustment.summary,
    detailed_reasoning: adjustment.detailedReasoning,
  };
}

function explicitQuarterRequestUnresolved(
  earningsResult: EarningsRetrievalAgentResult | null,
  runtimeMeta: EarningsRetrievalRuntimeMeta | null,
): boolean {
  if (!earningsResult || !runtimeMeta || runtimeMeta.request.mode !== 'explicit_quarter') return false;
  return runtimeMeta.resolutionStatus === 'unresolved_exact';
}

function buildExplicitQuarterUnresolvedReply(params: {
  ticker: string;
  runtimeMeta: EarningsRetrievalRuntimeMeta;
  earningsResult: EarningsRetrievalAgentResult | null;
}): string {
  const { ticker, runtimeMeta, earningsResult } = params;
  const requestedQuarter = [runtimeMeta.request.fiscalPeriod, runtimeMeta.request.fiscalYear].filter(Boolean).join(' ').trim();
  const requestedLabel = requestedQuarter.length > 0 ? `${ticker} ${requestedQuarter}` : ticker;

  const missingLanes: string[] = [];
  if (!earningsResult?.dataQuality.usedEarningsRelease) missingLanes.push('earnings release');
  if (!earningsResult?.dataQuality.usedTranscript) missingLanes.push('prepared remarks or transcript');
  if (!earningsResult?.dataQuality.usedFinancials) missingLanes.push('quarter financials');
  if (!earningsResult?.quarter.reportUrl) missingLanes.push('report link');

  const missingText = missingLanes.length > 0 ? missingLanes.join(', ') : 'exact-quarter source lanes';
  return `${requestedLabel} was not resolved from the current exact-quarter sources. Missing lanes: ${missingText}. I did not substitute latest-quarter or unrelated annual data.`;
}

function isVisualizationPrompt(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /\b(graph|chart|cgart|visuali[sz]e|plot|trend line|show.*chart|show.*graph)\b/.test(text) &&
    !/\b(download|export)\b/.test(text)
  );
}

function userExplicitlyWantsStructuredOutput(message: string): boolean {
  const text = message.toLowerCase();
  return /\b(bullets?|bullet points?|table|json|memo|sections?|headers?|outline|format|template|list)\b/.test(text);
}

function isRevenueForecastVisualizationPrompt(message: string): boolean {
  const text = message.toLowerCase();
  return (
    isVisualizationPrompt(message) &&
    /\b(revenue|reveneue|reveenue|sales|top line|topline)\b/.test(text) &&
    /\b(next|forecast|project|projected|displaying|showing)\b/.test(text) &&
    /\b\d+\s+years?\b/.test(text)
  );
}

function isCompanyForecastPrompt(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /\b(forecast|outlook|predict|prediction|project|projection|move|price target|where.*(?:trade|go)|next\s+\d+\s*(?:days?|weeks?|months?))\b/.test(text) ||
    /\b\d+\s*(?:day|week|month)s?\s+(?:forecast|outlook|prediction|move)\b/.test(text)
  );
}

function isValuationOrTradeAnalysisPrompt(message: string): boolean {
  const text = message.toLowerCase();
  return /\b(valuation|valuation impact|model impact|intrinsic value|fair value|model value|undervalued|under valued|overvalued|over valued|worth|target price|price target|trade recommendation|position size|stop loss|margin of safety|upside|downside|buy|sell|long|short)\b/.test(text);
}

function shouldPrioritizeShortTermPriceForecast(message: string): boolean {
  const text = message.toLowerCase();
  const asksShortHorizon =
    /\b(?:next|over|for)\s+\d{1,3}\s*(?:days?|weeks?|months?)\b/.test(text) ||
    /\b(?:next|one)\s+month\b/.test(text);
  const asksForecastLayer =
    /\b(online forecast layer|timesfm|forecast layer|stock price path|price path|potential stock|potential growth|show.*price path|show.*stock)\b/.test(text);
  const asksModelArtifact =
    /\b(dcf|intrinsic value|fair value|build.*(?:model|dcf)|trade recommendation|position size|stop loss|risk budget)\b/.test(text);

  return isCompanyForecastPrompt(message) && asksShortHorizon && asksForecastLayer && !asksModelArtifact;
}

function isInvestmentValuationPrompt(message: string): boolean {
  const text = message.toLowerCase();
  return (
    isValuationOrTradeAnalysisPrompt(message) ||
    /\b(as an investment|investment case|investment view|investment impact|investment thesis|bull case|bear case|base case)\b/.test(text)
  );
}

function explicitlyRequestsOperatingModelArtifact(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /\b(three[-\s]?statement|3[-\s]?statement|forecast model|operating model|operating forecast|projection model|income statement|balance sheet|cash flow statement)\b/.test(text) ||
    (/\b(build|create|generate|download|export)\b/.test(text) && /\b(forecast workbook|forecast excel|forecast model|three[-\s]?statement|3[-\s]?statement)\b/.test(text))
  );
}

function isLongHorizonForecastPrompt(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /\b(?:next|over|for)\s+\d{1,2}\s*(?:years?|yrs?)\b/.test(text) ||
    /\b\d{1,2}\s*(?:years?|yrs?)\s+(?:forecast|outlook|projection|view|model)\b/.test(text) ||
    /\b(?:multi[- ]year|long[- ]term)\s+(?:forecast|outlook|projection|view)\b/.test(text)
  );
}

function shouldUseForecastLayerForLongHorizon(message: string): boolean {
  const text = message.toLowerCase();
  if (!isLongHorizonForecastPrompt(message) || !isCompanyForecastPrompt(message)) return false;
  if (isValuationOrTradeAnalysisPrompt(message)) return false;
  if (explicitlyRequestsOperatingModelArtifact(message)) return false;
  return !/\b(active|current|existing)\s+(?:dcf|model|case|forecast)\b|\bdcf\b|\bfcff\b|\bfree cash flow\b/.test(text);
}

function parseForecastHorizonYears(message: string, fallbackYears: number): number {
  const text = message.toLowerCase();
  const explicit = text.match(/\b(\d{1,2})\s*(?:years?|yrs?)\b/);
  if (explicit?.[1]) {
    const years = Number(explicit[1]);
    if (Number.isFinite(years) && years > 0) return Math.min(10, Math.max(1, Math.round(years)));
  }
  return Math.min(10, Math.max(1, Math.round(fallbackYears)));
}

function parseForecastHorizonDays(message: string): number {
  const text = message.toLowerCase();
  const explicit = text.match(/\b(\d{1,2})\s*[- ]?\s*(day|days|week|weeks|month|months)\b/);
  if (explicit?.[1] && explicit[2]) {
    const amount = Number(explicit[1]);
    const unit = explicit[2];
    if (Number.isFinite(amount) && amount > 0) {
      const days =
        unit.startsWith('day') ? amount :
        unit.startsWith('week') ? amount * 7 :
        amount * 30;
      return Math.min(180, Math.max(5, days));
    }
  }
  if (/\bnext\s+month\b|\bone\s+month\b/.test(text)) return 30;
  if (/\bnext\s+quarter\b|\bthree\s+months?\b/.test(text)) return 90;
  return 30;
}

function formatForecastHorizon(days: number): string {
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months}-month`;
  }
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks}-week`;
  }
  return `${days}-day`;
}

type DeterministicForecastReplyInput = {
  ticker: string;
  horizonLabel: string;
  sourceLabel: string;
  methodology: string;
  startPrice: number;
  endForecast: number;
  returnPct: number;
  direction: 'up' | 'down' | 'flat';
  lower: number | null;
  upper: number | null;
  eventSynthesis: ReturnType<typeof buildEventAdjustedForecast>;
  revenueForecast: {
    quarters: number;
    impliedGrowthPct: number;
    quarterlyProjections: string;
    sourceLabel: string;
  } | null;
};

type ForecastLayerPayload = {
  ticker: string;
  type: 'revenue' | 'macro';
  historical: number[];
  forecast: number[];
  confidence: number;
  baseConfidence?: number;
  accuracy?: number;
  accuracySampleSize?: number;
  attribution?: {
    primaryDriver?: string;
    explanation?: string;
  };
  source: 'timesfm' | 'flat_fallback' | string;
  warning?: string;
};

type CompanyInfoNewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string | null;
  tags?: string[];
  provider?: string;
  sourceType?: 'live_news' | 'strategic_fallback';
  rankScore?: number;
  rankReason?: string;
};

function isForecastLayerPayload(value: unknown): value is ForecastLayerPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.ticker === 'string' &&
    (record.type === 'revenue' || record.type === 'macro') &&
    Array.isArray(record.historical) &&
    record.historical.every((item) => typeof item === 'number' && Number.isFinite(item)) &&
    Array.isArray(record.forecast) &&
    record.forecast.every((item) => typeof item === 'number' && Number.isFinite(item)) &&
    typeof record.confidence === 'number' &&
    Number.isFinite(record.confidence) &&
    typeof record.source === 'string'
  );
}

function daysUntil(dateValue: string | null | undefined): number | null {
  if (!dateValue) return null;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const event = new Date(time);
  const eventUtc = Date.UTC(event.getUTCFullYear(), event.getUTCMonth(), event.getUTCDate());
  return Math.round((eventUtc - todayUtc) / 86_400_000);
}

function isWithinForecastHorizon(dateValue: string | null | undefined, horizonDays: number): boolean {
  const days = daysUntil(dateValue);
  return days !== null && days >= 0 && days <= horizonDays;
}

function timingLabel(dateValue: string | null | undefined, fallback: string | null): string | null {
  const days = daysUntil(dateValue);
  if (days === null) return fallback;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `${days} days`;
}

function datedTimingLabel(dateValue: string | null | undefined, displayDate: string | null | undefined, fallback: string | null): string | null {
  const relative = timingLabel(dateValue, fallback);
  if (!dateValue || !displayDate || displayDate === fallback) return relative;
  return relative ? `${displayDate} (${relative})` : displayDate;
}

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeNewsDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.trim() : parsed.toISOString();
}

function cleanNewsText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function toLiveNewsItem(params: {
  title: unknown;
  url: unknown;
  source: unknown;
  publishedAt: unknown;
  description?: unknown;
  provider: string;
  tags?: string[];
}): CompanyInfoNewsItem | null {
  const title = cleanNewsText(params.title);
  const url = cleanNewsText(params.url);
  if (!title || !url || /demo|example\.com/i.test(url)) return null;
  return {
    title,
    url,
    source: cleanNewsText(params.source) || params.provider,
    publishedAt: normalizeNewsDate(params.publishedAt),
    description: cleanNewsText(params.description) || null,
    tags: params.tags,
    provider: params.provider,
    sourceType: 'live_news',
  };
}

async function fetchFmpCompanyNews(ticker: string): Promise<CompanyInfoNewsItem[]> {
  if (!serverEnv.FMP_API_KEY) return [];
  try {
    const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${encodeURIComponent(ticker)}&limit=20&apikey=${serverEnv.FMP_API_KEY}`;
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3500) });
    if (!response.ok) return [];
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row): CompanyInfoNewsItem | null => {
        if (!row || typeof row !== 'object') return null;
        const record = row as Record<string, unknown>;
        return toLiveNewsItem({
          title: record.title,
          url: record.url,
          source: record.site,
          publishedAt: record.publishedDate,
          description: record.text,
          provider: 'fmp_stock_news',
          tags: ['company_news', ticker],
        });
      })
      .filter((item): item is CompanyInfoNewsItem => item !== null);
  } catch {
    return [];
  }
}

async function fetchFinnhubCompanyNews(ticker: string): Promise<CompanyInfoNewsItem[]> {
  if (!serverEnv.FINNHUB_API_KEY) return [];
  try {
    const params = new URLSearchParams({
      symbol: ticker,
      from: isoDateDaysAgo(30),
      to: isoDateToday(),
      token: serverEnv.FINNHUB_API_KEY,
    });
    const response = await fetch(`https://finnhub.io/api/v1/company-news?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .slice(0, 30)
      .map((row): CompanyInfoNewsItem | null => {
        if (!row || typeof row !== 'object') return null;
        const record = row as Record<string, unknown>;
        const datetime = typeof record.datetime === 'number' ? new Date(record.datetime * 1000).toISOString() : record.datetime;
        return toLiveNewsItem({
          title: record.headline,
          url: record.url,
          source: record.source,
          publishedAt: datetime,
          description: record.summary,
          provider: 'finnhub_company_news',
          tags: ['company_news', ticker],
        });
      })
      .filter((item): item is CompanyInfoNewsItem => item !== null);
  } catch {
    return [];
  }
}

async function fetchNewsApiCompanyNews(ticker: string, aliases: string[]): Promise<CompanyInfoNewsItem[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) return [];
  try {
    const queryAliases = aliases.slice(0, 5).map((alias) => `"${alias.replace(/"/g, '')}"`).join(' OR ');
    const params = new URLSearchParams({
      q: queryAliases || ticker,
      language: 'en',
      sortBy: 'publishedAt',
      from: isoDateDaysAgo(30),
      pageSize: '20',
      apiKey,
    });
    const response = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as unknown;
    const articles = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).articles : null;
    if (!Array.isArray(articles)) return [];
    return articles
      .map((row): CompanyInfoNewsItem | null => {
        if (!row || typeof row !== 'object') return null;
        const record = row as Record<string, unknown>;
        const source = record.source && typeof record.source === 'object'
          ? (record.source as Record<string, unknown>).name
          : record.source;
        return toLiveNewsItem({
          title: record.title,
          url: record.url,
          source,
          publishedAt: record.publishedAt,
          description: record.description,
          provider: 'newsapi_company_search',
          tags: ['company_news', ticker],
        });
      })
      .filter((item): item is CompanyInfoNewsItem => item !== null);
  } catch {
    return [];
  }
}

const STRATEGIC_NEWS_TERMS: Record<string, Array<{ pattern: RegExp; label: string; weight: number }>> = {
  GOOGL: [
    { pattern: /\b(ai overviews?|gemini|ai search|search generative|search monetization)\b/i, label: 'AI Search', weight: 16 },
    { pattern: /\b(google cloud|gcp|cloud growth|cloud margin|cloud backlog)\b/i, label: 'Cloud', weight: 14 },
    { pattern: /\b(capex|data centers?|tpu|infrastructure spend|ai infrastructure)\b/i, label: 'AI capex', weight: 12 },
    { pattern: /\b(antitrust|doj|eu|regulat|remed(y|ies)|data[-\s]?sharing|competition)\b/i, label: 'regulatory risk', weight: 15 },
    { pattern: /\b(youtube|ad market|advertising|search ads?|tac)\b/i, label: 'ads/Search economics', weight: 10 },
    { pattern: /\b(earnings|guidance|estimate|margin|free cash flow|fcf)\b/i, label: 'estimate reset', weight: 9 },
  ],
  GOOG: [
    { pattern: /\b(ai overviews?|gemini|ai search|search generative|search monetization)\b/i, label: 'AI Search', weight: 16 },
    { pattern: /\b(google cloud|gcp|cloud growth|cloud margin|cloud backlog)\b/i, label: 'Cloud', weight: 14 },
    { pattern: /\b(capex|data centers?|tpu|infrastructure spend|ai infrastructure)\b/i, label: 'AI capex', weight: 12 },
    { pattern: /\b(antitrust|doj|eu|regulat|remed(y|ies)|data[-\s]?sharing|competition)\b/i, label: 'regulatory risk', weight: 15 },
    { pattern: /\b(youtube|ad market|advertising|search ads?|tac)\b/i, label: 'ads/Search economics', weight: 10 },
    { pattern: /\b(earnings|guidance|estimate|margin|free cash flow|fcf)\b/i, label: 'estimate reset', weight: 9 },
  ],
  NVDA: [
    { pattern: /\b(blackwell|h100|h200|b200|gb200|gpu|cuda|accelerator)\b/i, label: 'AI accelerator demand', weight: 16 },
    { pattern: /\b(hyperscaler|data center|ai infrastructure|networking|infiniband|ethernet)\b/i, label: 'AI infrastructure', weight: 14 },
    { pattern: /\b(tsmc|supply|lead times?|capacity|export controls?|china)\b/i, label: 'supply/geopolitical risk', weight: 12 },
    { pattern: /\b(amd|asic|custom silicon|broadcom|competition)\b/i, label: 'competition', weight: 12 },
    { pattern: /\b(gross margin|pricing|guidance|earnings|estimate)\b/i, label: 'margin/estimate reset', weight: 10 },
  ],
  TSLA: [
    { pattern: /\b(deliveries|production|pricing|incentives?|demand|inventory)\b/i, label: 'deliveries/pricing', weight: 15 },
    { pattern: /\b(robotaxi|fsd|autonomy|self-driving|dojo)\b/i, label: 'autonomy narrative', weight: 14 },
    { pattern: /\b(china|tariff|ev credit|regulat|safety|recall)\b/i, label: 'policy/regulatory risk', weight: 11 },
    { pattern: /\b(margin|earnings|guidance|free cash flow|fcf)\b/i, label: 'margin/estimate reset', weight: 10 },
  ],
};

const GENERAL_MARKET_MOVING_TERMS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /\b(beat|beats|raise|raises|raised|upgrade|upgraded|approval|partnership|buyback|margin expansion)\b/i, label: 'positive catalyst language', weight: 7 },
  { pattern: /\b(miss|misses|cut|cuts|lowered|downgrade|downgraded|lawsuit|probe|investigation|margin pressure|warning)\b/i, label: 'negative catalyst language', weight: 7 },
  { pattern: /\b(earnings|guidance|forecast|outlook|estimate|consensus)\b/i, label: 'estimate-sensitive', weight: 6 },
  { pattern: /\b(regulat|antitrust|tariff|sanction|export control|litigation)\b/i, label: 'risk-premium catalyst', weight: 6 },
];

function headlineAgeDays(publishedAt: string): number | null {
  if (!publishedAt) return null;
  const time = new Date(publishedAt).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / 86_400_000);
}

function scoreHeadlineRecency(publishedAt: string): number {
  const age = headlineAgeDays(publishedAt);
  if (age === null) return 1;
  if (age <= 1) return 10;
  if (age <= 3) return 8;
  if (age <= 7) return 5;
  if (age <= 14) return 3;
  return 1;
}

function rankCompanyHeadline(item: CompanyInfoNewsItem, ticker: string, aliases: string[]): CompanyInfoNewsItem {
  const normalizedTicker = ticker.trim().toUpperCase();
  const text = `${item.title} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase();
  const reasons: string[] = [];
  let score = scoreHeadlineRecency(item.publishedAt);

  if (item.sourceType === 'live_news' && item.provider && /fmp|finnhub|newsapi|perigon|market_headlines/i.test(item.provider)) {
    score += /fmp_stock_news|finnhub_company_news/.test(item.provider) ? 12 : 8;
    reasons.push('live company headline');
  }

  for (const alias of aliases) {
    const lowerAlias = alias.toLowerCase();
    if (!lowerAlias || !text.includes(lowerAlias)) continue;
    score += lowerAlias === normalizedTicker.toLowerCase() ? 12 : 8;
    if (reasons.length < 3) reasons.push(alias);
  }

  const strategicTerms = STRATEGIC_NEWS_TERMS[normalizedTicker] ?? [];
  for (const term of strategicTerms) {
    if (!term.pattern.test(text)) continue;
    score += term.weight;
    if (!reasons.includes(term.label) && reasons.length < 4) reasons.push(term.label);
  }

  for (const term of GENERAL_MARKET_MOVING_TERMS) {
    if (!term.pattern.test(text)) continue;
    score += term.weight;
    if (!reasons.includes(term.label) && reasons.length < 4) reasons.push(term.label);
  }

  if (item.source && /\b(reuters|bloomberg|wsj|financial times|cnbc|marketwatch|seeking alpha|the information|verge)\b/i.test(item.source)) {
    score += 3;
  }

  const age = headlineAgeDays(item.publishedAt);
  const recencyReason = age === null
    ? 'date unavailable'
    : age <= 1
      ? 'fresh headline'
      : age <= 7
        ? 'recent headline'
        : 'older context';
  const reason = [...reasons.slice(0, 3), recencyReason].filter(Boolean).join(' • ');

  return {
    ...item,
    rankScore: Math.round(score * 10) / 10,
    rankReason: reason || 'ticker-relevant headline',
  };
}

function rankCompanyHeadlines(items: CompanyInfoNewsItem[], ticker: string): CompanyInfoNewsItem[] {
  const aliases = companyAliasesForTicker(ticker);
  return items
    .map((item) => rankCompanyHeadline(item, ticker, aliases))
    .filter((item) => (item.rankScore ?? 0) >= 10)
    .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0))
    .slice(0, 8);
}

async function loadForecastCompanyNews(origin: string, ticker: string): Promise<CompanyInfoNewsItem[]> {
  const aliases = companyAliasesForTicker(ticker);
  const isRelevant = (item: CompanyInfoNewsItem): boolean => {
    const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
    return aliases.some((alias) => text.includes(alias.toLowerCase()));
  };
  const seen = new Set<string>();
  const merge = (items: CompanyInfoNewsItem[]): CompanyInfoNewsItem[] => {
    const merged: CompanyInfoNewsItem[] = [];
    for (const item of items) {
      if (!item.title.trim()) continue;
      const key = item.url || item.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged;
  };

  try {
    const [companyInfo, marketHeadlines, fmpDirectNews, finnhubDirectNews, newsApiDirectNews] = await Promise.all([
      fetch(`${origin}/api/company-info?ticker=${encodeURIComponent(ticker)}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetch(`${origin}/api/news/headlines?range=1M&limit=80&topic=all`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(3500),
      })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetchFmpCompanyNews(ticker),
      fetchFinnhubCompanyNews(ticker),
      fetchNewsApiCompanyNews(ticker, aliases),
    ]);

    const companyItems = Array.isArray(companyInfo?.news)
      ? companyInfo.news
          .map((item: unknown): CompanyInfoNewsItem | null => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            const title = typeof row.title === 'string' ? row.title.trim() : '';
            const url = typeof row.url === 'string' ? row.url.trim() : '';
            if (!title) return null;
            return {
              title,
              url,
              source: typeof row.source === 'string' ? row.source.trim() : '',
              publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : '',
              description: typeof row.description === 'string' ? row.description.trim() : null,
              tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
              provider: 'fmp_company_info',
              sourceType: 'live_news',
            };
          })
          .filter((item: CompanyInfoNewsItem | null): item is CompanyInfoNewsItem => item !== null)
      : [];

    const marketProvider = typeof marketHeadlines?.provider === 'string' ? marketHeadlines.provider : null;
    const headlineItems = marketProvider !== 'demo' && Array.isArray(marketHeadlines?.items)
      ? marketHeadlines.items
          .map((item: unknown): (CompanyInfoNewsItem & { tags?: string[] }) | null => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            const title = typeof row.title === 'string' ? row.title.trim() : '';
            const url = typeof row.url === 'string' ? row.url.trim() : '';
            if (!title || !url) return null;
            return {
              title,
              url,
              source: typeof row.source === 'string' ? row.source.trim() : '',
              publishedAt: typeof row.publishedAt === 'string'
                ? row.publishedAt
                : typeof row.published_at === 'string'
                  ? row.published_at
                  : '',
              description: typeof row.description === 'string' ? row.description.trim() : null,
              tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
              provider: marketProvider ?? 'market_headlines',
              sourceType: 'live_news',
            };
          })
          .filter((item: (CompanyInfoNewsItem & { tags?: string[] }) | null): item is CompanyInfoNewsItem & { tags?: string[] } => {
            if (!item) return false;
            if (item.tags?.some((tag) => tag.toLowerCase() === 'demo')) return false;
            return isRelevant(item);
          })
      : [];

    return rankCompanyHeadlines(
      merge([
        ...fmpDirectNews,
        ...finnhubDirectNews,
        ...newsApiDirectNews,
        ...companyItems,
        ...headlineItems,
      ]),
      ticker,
    );
  } catch {
    return [];
  }
}

function companyAliasesForTicker(ticker: string): string[] {
  const normalized = ticker.trim().toUpperCase();
  const aliases: Record<string, string[]> = {
    GOOGL: ['GOOGL', 'GOOG', 'Alphabet', 'Google', 'Gemini', 'YouTube', 'Google Cloud', 'Search'],
    GOOG: ['GOOG', 'GOOGL', 'Alphabet', 'Google', 'Gemini', 'YouTube', 'Google Cloud', 'Search'],
    NVDA: ['NVDA', 'Nvidia', 'GPU', 'CUDA', 'Blackwell', 'AI chip'],
    TSLA: ['TSLA', 'Tesla', 'EV', 'FSD', 'Cybertruck', 'robotaxi'],
    MSFT: ['MSFT', 'Microsoft', 'Azure', 'OpenAI', 'Copilot'],
    AAPL: ['AAPL', 'Apple', 'iPhone', 'App Store', 'Vision Pro'],
    AMZN: ['AMZN', 'Amazon', 'AWS', 'Prime'],
    META: ['META', 'Meta', 'Facebook', 'Instagram', 'WhatsApp', 'Reality Labs'],
  };
  return aliases[normalized] ?? [normalized];
}

function strategicForecastWatchItems(ticker: string): ForecastNewsWatchItem[] {
  const normalized = ticker.trim().toUpperCase();
  const byTicker: Record<string, ForecastNewsWatchItem[]> = {
    GOOGL: [
      {
        title: 'Alphabet AI Search monetization',
        timing: '30-day thesis watch',
        impact: 'Watch whether AI Overviews and Gemini improve query engagement without weakening ad monetization or publisher/regulatory pressure.',
        source: 'CapitalBase strategic watchlist',
        kind: 'company_news',
        sourceType: 'strategic_fallback',
      },
      {
        title: 'Google Cloud growth and AI capex',
        timing: '30-day thesis watch',
        impact: 'Cloud demand supports growth, but higher AI infrastructure spending can pressure free cash flow and valuation multiples.',
        source: 'CapitalBase strategic watchlist',
        kind: 'company_news',
        sourceType: 'strategic_fallback',
      },
      {
        title: 'Search antitrust and EU data-sharing pressure',
        timing: '30-day thesis watch',
        impact: 'Regulatory remedies could pressure Search distribution advantages, data access, and the risk premium investors assign to Alphabet.',
        source: 'CapitalBase strategic watchlist',
        kind: 'company_news',
        sourceType: 'strategic_fallback',
      },
    ],
    NVDA: [
      {
        title: 'NVIDIA AI infrastructure demand',
        timing: '30-day thesis watch',
        impact: 'Hyperscaler GPU demand, Blackwell ramp execution, and networking attach rates drive the near-term AI infrastructure read-through.',
        source: 'CapitalBase strategic watchlist',
        kind: 'company_news',
        sourceType: 'strategic_fallback',
      },
      {
        title: 'Custom silicon and GPU margin risk',
        timing: '30-day thesis watch',
        impact: 'Watch whether hyperscaler ASIC efforts or AMD competition pressure NVIDIA pricing, lead times, or gross margin expectations.',
        source: 'CapitalBase strategic watchlist',
        kind: 'company_news',
        sourceType: 'strategic_fallback',
      },
    ],
    TSLA: [
      {
        title: 'Tesla deliveries and pricing',
        timing: '30-day thesis watch',
        impact: 'Deliveries, incentives, and pricing determine whether the market treats demand as stabilizing or still deteriorating.',
        source: 'CapitalBase strategic watchlist',
        kind: 'company_news',
        sourceType: 'strategic_fallback',
      },
      {
        title: 'Tesla autonomy and robotaxi narrative',
        timing: '30-day thesis watch',
        impact: 'Autonomy progress can support the multiple, but execution gaps or regulatory delays can quickly reverse sentiment.',
        source: 'CapitalBase strategic watchlist',
        kind: 'company_news',
        sourceType: 'strategic_fallback',
      },
    ],
  };
  return byTicker[normalized] ?? [];
}

type PortfolioAnalystResult = {
  items: ForecastNewsWatchItem[];
  tradingSignal?: import('@/lib/analyst/forecastModel').ForecastTradingSignal | null;
  riskProfile?: import('@/lib/analyst/forecastModel').ForecastRiskProfile | null;
  combinedEventImpactPct?: number | null;
};

async function discoverEventsWithLlm(params: {
  ticker: string;
  companyName: string;
  horizonDays: number;
  currentPrice?: number | null;
  timesFMBaseline?: { currentPrice: number; endPrice: number; returnPct: number } | null;
}): Promise<PortfolioAnalystResult> {
  try {
    const tfm = params.timesFMBaseline;
    const timesFMContext = tfm
      ? `TimesFM (Google's foundation time-series model) has already produced a quantitative price forecast:
  - Current price: $${tfm.currentPrice.toFixed(2)}
  - ${params.horizonDays}-day forecast endpoint: $${tfm.endPrice.toFixed(2)}
  - Baseline return: ${tfm.returnPct >= 0 ? '+' : ''}${tfm.returnPct.toFixed(2)}%
  Your analysis MUST be anchored to this baseline. Do NOT replace it. Adjust it based on events you identify.`
      : `No quantitative baseline is available. Use trend extrapolation, volatility context, and macro overlays to generate an expected price path.`;

    const systemPrompt = `You are an event-driven portfolio analyst embedded inside an AI-native asset management system.

Your job is to take a user request for a stock forecast and transform it into a structured JSON analysis.

You must think like a hedge fund analyst, not a chatbot.

INPUT:
- Ticker: ${params.ticker}
- Company: ${params.companyName}
- Forecast Horizon: ${params.horizonDays} days
- Current Price: ${params.currentPrice ? `$${params.currentPrice.toFixed(2)}` : tfm ? `$${tfm.currentPrice.toFixed(2)}` : 'use your best estimate'}

STEP 1 — BASE FORECAST: ${timesFMContext}

STEP 2 — EVENT DISCOVERY: Identify ALL relevant events within the forecast window: earnings, regulatory decisions, product launches, macro releases, legal/antitrust cases, industry catalysts.

STEP 3 — EVENT ANALYSIS: For EACH event output scenarios (bull/base/bear) with probabilities that sum to 1.0, % impact per scenario, and probability-weighted expected impact.

STEP 4 — EVENT STACKING: Do NOT treat events independently. Adjust for interactions and sequencing.

STEP 5 — FINAL FORECAST: Combine base forecast + event-adjusted impacts.

STEP 6 — TRADING SIGNAL: Generate LONG / SHORT / NEUTRAL with conviction (0–1), position size (max 10% of portfolio), and time horizon.

STEP 7 — RISK ANALYSIS: Top 3 risks, invalidation triggers, exit conditions.

RULES:
- No vague language. Every % must be justified.
- Probabilities must sum to 1.0 per event.
- Do NOT skip event analysis even if uncertain.
- If data is missing, make the most reasonable assumption and proceed.
- Today's date is ${new Date().toISOString().slice(0, 10)}. The forecast window ends ${new Date(Date.now() + params.horizonDays * 86400000).toISOString().slice(0, 10)}.
- For event_date: use a FUTURE date within the forecast window (YYYY-MM-DD), OR use "ongoing" for active situations with no fixed date. NEVER use a past date.
- Focus on what is happening NOW or will happen in the next ${params.horizonDays} days. Do not surface historical events that already occurred.

Return ONLY valid JSON in this exact structure, no markdown:
{
  "forecast": { "direction": "UP|DOWN|SIDEWAYS", "confidence": 0.0, "expected_return_pct": 0.0, "price_target_range": [low, high], "drivers": [] },
  "events": [
    {
      "event_name": "", "event_date": "YYYY-MM-DD or ongoing", "event_type": "EARNINGS|LEGAL|MACRO|PRODUCT|REGULATORY|INDUSTRY",
      "description": "",
      "scenarios": {
        "bull": { "probability": 0.0, "impact_pct": 0.0 },
        "base": { "probability": 0.0, "impact_pct": 0.0 },
        "bear": { "probability": 0.0, "impact_pct": 0.0 }
      },
      "expected_impact_pct": 0.0,
      "key_driver": ""
    }
  ],
  "combined_event_impact_pct": 0.0,
  "final_forecast": { "expected_return_pct": 0.0, "price_target_range": [low, high], "volatility": "LOW|MEDIUM|HIGH" },
  "trading_signal": { "signal": "LONG|SHORT|NEUTRAL", "conviction": 0.0, "position_size_pct": 0.0, "horizon": "" },
  "risks": { "top_risks": [], "invalidation_triggers": [], "exit_conditions": [] }
}`;

    const userPrompt = `Analyze ${params.ticker} (${params.companyName}) over ${params.horizonDays} days. Return the JSON analysis now.`;

    // Tier 1: responses.create — the same API path the main chat handler uses (proven working in production).
    let text = '';
    const openAiKeys = getOpenAIKeyCandidates('user');
    const openAiModels = getOpenAIModelCandidates(process.env.OPENAI_MODEL);
    console.info('[discoverEventsWithLlm] start for', params.ticker, '— openAiKeys:', openAiKeys.length, '— models:', openAiModels.slice(0, 2).join(','));
    for (const apiKey of openAiKeys) {
      if (text) break;
      for (const model of openAiModels) {
        if (text) break;
        try {
          const oai = new OpenAI({ apiKey });
          const response = await Promise.race([
            oai.responses.create({
              model,
              input: [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: userPrompt },
              ],
              temperature: 0,
              max_output_tokens: 800,
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
          ]);
          const t = response && typeof (response as { output_text?: unknown }).output_text === 'string'
            ? ((response as { output_text: string }).output_text).trim()
            : '';
          if (t) {
            text = t;
            console.info('[discoverEventsWithLlm] responses.create succeeded via', model, 'for', params.ticker);
          } else if (response === null) {
            console.warn('[discoverEventsWithLlm] responses.create timeout via', model, 'for', params.ticker);
          } else {
            console.warn('[discoverEventsWithLlm] responses.create empty response via', model, 'for', params.ticker);
          }
        } catch (err) {
          console.warn('[discoverEventsWithLlm] responses.create error via', model, ':', err instanceof Error ? err.message : String(err));
        }
      }
    }

    // Tier 2: generateTextWithProviderFallback (Anthropic → chat.completions).
    if (!text) {
      console.info('[discoverEventsWithLlm] trying generateTextWithProviderFallback for', params.ticker);
      const result = await Promise.race([
        generateTextWithProviderFallback({
          clientType: 'user',
          preferredProvider: 'anthropic',
          temperature: 0,
          maxTokens: 800,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }).catch((err: unknown) => { console.warn('[discoverEventsWithLlm] generateTextWithProviderFallback threw:', err instanceof Error ? err.message : String(err)); return null; }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
      ]);
      text = result?.text?.trim() ?? '';
      if (text) {
        console.info('[discoverEventsWithLlm] generateTextWithProviderFallback succeeded via', result!.provider, result!.model, 'for', params.ticker);
      } else {
        console.warn('[discoverEventsWithLlm] all providers exhausted for', params.ticker);
        return { items: [] };
      }
    }

    console.info('[discoverEventsWithLlm] got text for', params.ticker, '— length', text.length);

    // Parse the full portfolio analyst JSON object
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      console.warn('[discoverEventsWithLlm] no JSON object in response for', params.ticker, text.slice(0, 120));
      return { items: [] };
    }

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

    // Map event type string → ForecastNewsWatchItem kind
    const mapKind = (t: unknown): ForecastNewsWatchItem['kind'] => {
      const s = typeof t === 'string' ? t.toUpperCase() : '';
      if (s === 'EARNINGS') return 'earnings';
      if (s === 'MACRO') return 'macro';
      if (s === 'LEGAL' || s === 'REGULATORY' || s === 'ANTITRUST') return 'event';
      if (s === 'PRODUCT' || s === 'INDUSTRY') return 'company_news';
      return 'company_news';
    };

    const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];
    const items: ForecastNewsWatchItem[] = rawEvents
      .map((e: unknown): ForecastNewsWatchItem | null => {
        if (!e || typeof e !== 'object') return null;
        const ev = e as Record<string, unknown>;
        const title = typeof ev.event_name === 'string' ? ev.event_name.trim() : '';
        const impact = typeof ev.description === 'string' ? ev.description.trim() : '';
        if (!title || !impact) return null;

        const scenarios = ev.scenarios && typeof ev.scenarios === 'object'
          ? ev.scenarios as Record<string, { probability?: number; impact_pct?: number }>
          : null;
        const bull = scenarios?.bull ?? {};
        const base = scenarios?.base ?? {};
        const bear = scenarios?.bear ?? {};

        const bullImpact = typeof bull.impact_pct === 'number' ? bull.impact_pct : 0;
        const bearImpact = typeof bear.impact_pct === 'number' ? bear.impact_pct : 0;
        const baseProb = typeof base.probability === 'number' ? Math.min(0.85, Math.max(0.1, base.probability)) : 0.5;
        const weightedImpact = typeof ev.expected_impact_pct === 'number' ? ev.expected_impact_pct : 0;
        const direction: 'positive' | 'negative' | 'neutral' = weightedImpact > 0.5 ? 'positive' : weightedImpact < -0.5 ? 'negative' : 'neutral';

        const bullPct = Math.round((typeof bull.probability === 'number' ? bull.probability : 0.25) * 100);
        const basePct = Math.round(baseProb * 100);
        const bearPct = Math.round((typeof bear.probability === 'number' ? bear.probability : 0.25) * 100);

        // Sanitize event_date — replace any past date with "ongoing"
        const rawDate = typeof ev.event_date === 'string' ? ev.event_date.trim() : '';
        const today = new Date().toISOString().slice(0, 10);
        const timing = rawDate && rawDate !== 'ongoing' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate < today
          ? 'ongoing'
          : rawDate || null;

        return {
          title,
          timing,
          impact,
          kind: mapKind(ev.event_type),
          sourceType: 'llm_discovery',
          eventForecast: {
            expectedResult: impact,
            surpriseToWatch: typeof ev.key_driver === 'string' ? `Key driver: ${ev.key_driver}` : undefined,
            direction,
            confidence: baseProb,
            priceImpactPct: Math.min(10, Math.max(-10, weightedImpact)),
            priceImpactRangePct: { downside: bearImpact, upside: bullImpact },
            pmBrain: {
              pmView: `Bull +${bullImpact > 0 ? bullImpact.toFixed(1) : bullImpact}% (${bullPct}%) · Base ${weightedImpact > 0 ? '+' : ''}${weightedImpact.toFixed(1)}% (${basePct}%) · Bear ${bearImpact.toFixed(1)}% (${bearPct}%)`,
              forecastOverlayPct: Math.min(10, Math.max(-10, weightedImpact)),
              confidence: baseProb,
              invalidationSignal: typeof ev.key_driver === 'string' ? `Invalidate if ${ev.key_driver} does not shift materially` : 'Watch for estimate or multiple change',
            },
            stockImpact: impact,
          },
        };
      })
      .filter((item): item is ForecastNewsWatchItem => item !== null)
      .slice(0, 6);

    console.info('[discoverEventsWithLlm] mapped', items.length, 'events for', params.ticker);

    // Extract trading signal
    const rawSignal = parsed.trading_signal && typeof parsed.trading_signal === 'object'
      ? parsed.trading_signal as Record<string, unknown>
      : null;
    const tradingSignal = rawSignal ? {
      signal: ['LONG', 'SHORT', 'NEUTRAL'].includes(rawSignal.signal as string)
        ? (rawSignal.signal as 'LONG' | 'SHORT' | 'NEUTRAL')
        : 'NEUTRAL' as const,
      conviction: typeof rawSignal.conviction === 'number' ? Math.min(1, Math.max(0, rawSignal.conviction)) : 0.5,
      positionSizePct: typeof rawSignal.position_size_pct === 'number' ? Math.min(10, Math.max(0, rawSignal.position_size_pct)) : 0,
      horizon: typeof rawSignal.horizon === 'string' ? rawSignal.horizon : `${params.horizonDays}d`,
    } : null;

    // Extract risk profile
    const rawRisks = parsed.risks && typeof parsed.risks === 'object'
      ? parsed.risks as Record<string, unknown>
      : null;
    const riskProfile = rawRisks ? {
      topRisks: Array.isArray(rawRisks.top_risks) ? (rawRisks.top_risks as unknown[]).filter((r): r is string => typeof r === 'string') : [],
      invalidationTriggers: Array.isArray(rawRisks.invalidation_triggers) ? (rawRisks.invalidation_triggers as unknown[]).filter((r): r is string => typeof r === 'string') : [],
      exitConditions: Array.isArray(rawRisks.exit_conditions) ? (rawRisks.exit_conditions as unknown[]).filter((r): r is string => typeof r === 'string') : [],
    } : null;

    const combinedEventImpactPct = typeof parsed.combined_event_impact_pct === 'number' ? parsed.combined_event_impact_pct : null;

    return { items, tradingSignal, riskProfile, combinedEventImpactPct };
  } catch (err) {
    console.warn('[discoverEventsWithLlm] error for', params.ticker, err instanceof Error ? err.message : String(err));
    return { items: [] };
  }
}

function buildForecastNewsWatchItems(params: {
  ticker: string;
  horizonDays: number;
  events: MarketEvent[] | undefined;
  catalystContext: CompanyCatalystContext | null | undefined;
  companyNews: CompanyInfoNewsItem[];
  llmDiscoveredItems?: ForecastNewsWatchItem[];
}): ForecastNewsWatchItem[] {
  const seen = new Set<string>();
  const items: ForecastNewsWatchItem[] = [];
  const push = (item: ForecastNewsWatchItem) => {
    const title = item.title.trim();
    const impact = item.impact.trim();
    if (!title || !impact) return;
    const key = `${title.toLowerCase()}|${impact.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ ...item, title, impact });
  };

  const calendarItems = params.catalystContext?.calendarItems ?? [];
  const earningsItems = calendarItems.filter((item) => item.kind === 'earnings');
  const economicItems = calendarItems.filter((item) => item.kind === 'economic');

  for (const item of earningsItems) {
    if (item.kind === 'earnings' && item.date && !isWithinForecastHorizon(item.date, params.horizonDays)) continue;
    push({
      title: `${params.ticker} ${item.title}`,
      timing: datedTimingLabel(item.date, item.displayDate, item.kind),
      impact: item.note?.trim() || 'Earnings and guidance can reset the short-term price path.',
      source: item.source,
      kind: 'earnings',
      sourceType: 'calendar',
    });
    if (items.length >= 5) return items;
  }

  for (const news of params.companyNews.slice(0, 3)) {
    push({
      title: news.title,
      timing: news.publishedAt ? 'recent' : 'watch',
      impact: news.description?.trim() ||
        'Watch whether this changes sentiment, guidance expectations, or the assumptions behind the forecast path.',
      source: news.source || null,
      url: news.url || null,
      kind: 'company_news',
      sourceType: news.sourceType ?? 'live_news',
      rank: typeof news.rankScore === 'number' && news.rankReason
        ? {
            score: news.rankScore,
            reason: news.rankReason,
          }
        : undefined,
    });
    if (items.length >= 5) return items;
  }

  // LLM-discovered items fill any remaining slots after live news and calendar.
  // Preferred over hardcoded strategic fallbacks because they reflect actual ongoing situations.
  for (const item of (params.llmDiscoveredItems ?? [])) {
    push(item);
    if (items.length >= 5) return items;
  }

  // Hardcoded strategic fallback: only when LLM discovery also returned nothing
  if (items.length === 0) {
    for (const item of strategicForecastWatchItems(params.ticker)) {
      push(item);
      if (items.length >= 5) return items;
    }
  }

  for (const event of (params.events ?? [])
    .slice()
    .sort((a, b) => eventRelevanceScore(b, params.ticker) - eventRelevanceScore(a, params.ticker))
    .slice(0, 3)) {
    push({
      title: event.title,
      timing: event.horizon,
      impact: marketEventImpactSummary(event) || 'Active market event that could change the near-term forecast read-through.',
      source: event.sources[0]?.name ?? null,
      url: event.sources[0]?.url ?? null,
      kind: 'event',
      sourceType: 'market_event',
    });
    if (items.length >= 5) return items;
  }

  for (const item of economicItems) {
    if (item.date && !isWithinForecastHorizon(item.date, params.horizonDays)) continue;
    push({
      title: item.title,
      timing: datedTimingLabel(item.date, item.displayDate, item.kind),
      impact: item.note?.trim() || 'Macro release can move rates, risk appetite, and large-cap tech multiples.',
      source: item.source,
      kind: 'macro',
      sourceType: 'calendar',
    });
    if (items.length >= 5) return items;
  }

  return items;
}

function deterministicEventForecast(item: ForecastNewsWatchItem, ticker: string): NonNullable<ForecastNewsWatchItem['eventForecast']> {
  const text = `${item.title} ${item.impact}`.toLowerCase();
  if (item.kind === 'earnings' || text.includes('earnings')) {
    return {
      expectedResult: 'Base case is an in-line report unless guidance, AI demand, cloud growth, or ad trends surprise materially.',
      surpriseToWatch: 'Watch forward guidance, margin commentary, and whether management raises or lowers demand expectations.',
      transmissionPath: 'Guidance revision -> earnings expectations -> multiple and near-term price path.',
      stockImpact: `For ${ticker}, guidance and forward commentary should matter more than the reported quarter itself.`,
      direction: 'neutral',
      confidence: 0.5,
      priceImpactPct: 0,
      priceImpactRangePct: { downside: -4, upside: 4 },
    };
  }
  if (/\b(cpi|inflation|pce)\b/.test(text)) {
    return {
      expectedResult: 'Base case is inflation roughly in line to slightly sticky; the key surprise is whether the print changes rate-cut expectations.',
      surpriseToWatch: 'A cooler print is equity-positive; a hot services or core inflation print is the negative surprise.',
      transmissionPath: 'Inflation surprise -> Treasury yields -> discount rates -> growth-stock multiple.',
      stockImpact: `Cooler inflation would support ${ticker} through lower discount rates; hotter inflation would pressure long-duration tech multiples.`,
      direction: 'neutral',
      confidence: 0.48,
      priceImpactPct: 0,
      priceImpactRangePct: { downside: -2.2, upside: 1.8 },
    };
  }
  if (/\b(fomc|fed|rate|rates)\b/.test(text)) {
    return {
      expectedResult: 'Base case is no major policy shock; markets will focus on the statement tone and path for future cuts.',
      surpriseToWatch: 'The meaningful surprise is a dovish pivot or a higher-for-longer message relative to market pricing.',
      transmissionPath: 'Fed path -> yields and risk appetite -> large-cap tech valuation multiples.',
      stockImpact: `Dovish language would help ${ticker}; higher-for-longer language would pressure the forecast path.`,
      direction: 'neutral',
      confidence: 0.48,
      priceImpactPct: 0,
      priceImpactRangePct: { downside: -2, upside: 1.8 },
    };
  }
  if (/\b(payroll|jobs|employment|nonfarm)\b/.test(text)) {
    return {
      expectedResult: 'Base case is a still-resilient labor market; the market reaction depends on whether strength looks inflationary.',
      surpriseToWatch: 'Best case is soft enough to support cuts but not weak enough to imply demand risk.',
      transmissionPath: 'Labor surprise -> rate-cut odds and macro growth expectations -> equity risk appetite.',
      stockImpact: `A soft-but-not-weak jobs print would be best for ${ticker}; a hot print raises rate risk.`,
      direction: 'neutral',
      confidence: 0.45,
      priceImpactPct: 0,
      priceImpactRangePct: { downside: -1.6, upside: 1.2 },
    };
  }
  if (/\b(ai search|ai overviews|gemini|search monetization)\b/.test(text)) {
    return {
      expectedResult: 'Base case is gradual AI Search adoption without clear evidence yet that ad monetization is breaking.',
      surpriseToWatch: 'The bullish surprise is stable or improving Search ad monetization; the bearish surprise is evidence that AI answers reduce paid-click economics.',
      transmissionPath: 'Search monetization -> revenue durability and margin confidence -> Alphabet multiple.',
      stockImpact: `For ${ticker}, durable AI Search monetization would support the multiple; monetization leakage would pressure the stock.`,
      direction: 'neutral',
      confidence: 0.58,
      priceImpactPct: 0,
      priceImpactRangePct: { downside: -3, upside: 2.5 },
    };
  }
  if (/\b(cloud|capex|infrastructure|tpu|data center)\b/.test(text)) {
    return {
      expectedResult: 'Base case is Cloud growth remains supportive while AI capex keeps free-cash-flow conversion under scrutiny.',
      surpriseToWatch: 'The bullish surprise is Cloud margin expansion offsetting capex; the bearish surprise is higher spending without visible revenue acceleration.',
      transmissionPath: 'Cloud growth and capex intensity -> FCF expectations -> valuation multiple.',
      stockImpact: `For ${ticker}, Cloud acceleration helps the growth case, but capex intensity can cap upside if investors focus on FCF drag.`,
      direction: 'neutral',
      confidence: 0.56,
      priceImpactPct: 0,
      priceImpactRangePct: { downside: -2.5, upside: 2.2 },
    };
  }
  if (/\b(antitrust|regulat|data[-\s]?sharing|eu|doj|remed)\b/.test(text)) {
    return {
      expectedResult: 'Base case is regulatory pressure stays headline-relevant but does not immediately change near-term Search economics.',
      surpriseToWatch: 'The bearish surprise is a remedy that weakens Search distribution, data advantages, or monetization control.',
      transmissionPath: 'Regulatory remedy risk -> higher equity risk premium and lower terminal multiple -> stock pressure.',
      stockImpact: `For ${ticker}, regulation is more likely to weigh on the multiple than change next-quarter revenue immediately.`,
      direction: 'negative',
      confidence: 0.58,
      priceImpactPct: -1.4,
      priceImpactRangePct: { downside: -3.5, upside: 0.8 },
    };
  }
  const direction = newsDirectionScore(`${item.title} ${item.impact}`);
  if (direction > 0) {
    return {
      expectedResult: 'Event read-through skews favorable if the headline is confirmed by follow-through in guidance, demand, or sentiment.',
      surpriseToWatch: 'Watch whether follow-up reporting confirms durable growth, pricing power, or lower risk.',
      transmissionPath: 'Company catalyst -> forward estimates and sentiment -> near-term price path.',
      stockImpact: `Likely modest positive pressure on ${ticker} if investors treat this as durable rather than one-off.`,
      direction: 'positive',
      confidence: 0.52,
      priceImpactPct: 1.2,
      priceImpactRangePct: { downside: -0.8, upside: 2.5 },
    };
  }
  if (direction < 0) {
    return {
      expectedResult: 'Event read-through skews unfavorable if the issue persists or becomes a larger regulatory, margin, or demand concern.',
      surpriseToWatch: 'Watch whether the issue is isolated or becomes a broader estimate, margin, or regulatory reset.',
      transmissionPath: 'Negative catalyst -> lower estimates or higher risk premium -> price pressure.',
      stockImpact: `Likely modest negative pressure on ${ticker} unless management or macro data offsets the concern.`,
      direction: 'negative',
      confidence: 0.52,
      priceImpactPct: -1.2,
      priceImpactRangePct: { downside: -2.5, upside: 0.8 },
    };
  }
  return {
    expectedResult: 'No clear directional result forecast from available context; monitor whether the item changes expectations.',
    surpriseToWatch: 'No single surprise variable is strong enough to drive the forecast without new information.',
    transmissionPath: 'Low-signal event -> limited estimate change -> small or no forecast overlay.',
    stockImpact: `Likely limited standalone effect on ${ticker} unless it changes the broader AI, cloud, Search, or rate narrative.`,
    direction: 'neutral',
    confidence: 0.35,
    priceImpactPct: 0,
    priceImpactRangePct: { downside: -0.8, upside: 0.8 },
  };
}

function isForecastNewsWatchItemArray(value: unknown): value is Array<{
  title: string;
  expectedResult: string;
  surpriseToWatch: string;
  transmissionPath: string;
  pmRead: string;
  institutional: NonNullable<NonNullable<ForecastNewsWatchItem['eventForecast']>['institutional']>;
  pmBrain?: NonNullable<NonNullable<ForecastNewsWatchItem['eventForecast']>['pmBrain']>;
  stockImpact: string;
  direction: 'positive' | 'negative' | 'neutral';
  confidence: number;
  priceImpactPct: number;
  priceImpactRangePct?: { downside: number; upside: number };
}> {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    return (
      typeof row.title === 'string' &&
      typeof row.expectedResult === 'string' &&
      typeof row.surpriseToWatch === 'string' &&
      typeof row.transmissionPath === 'string' &&
      typeof row.pmRead === 'string' &&
      isInstitutionalRead(row.institutional) &&
      (row.pmBrain === undefined || isPmBrain(row.pmBrain)) &&
      typeof row.stockImpact === 'string' &&
      (row.direction === 'positive' || row.direction === 'negative' || row.direction === 'neutral') &&
      typeof row.confidence === 'number' &&
      Number.isFinite(row.confidence) &&
      typeof row.priceImpactPct === 'number' &&
      Number.isFinite(row.priceImpactPct) &&
      (
        row.priceImpactRangePct === undefined ||
        (
          typeof row.priceImpactRangePct === 'object' &&
          row.priceImpactRangePct !== null &&
          typeof (row.priceImpactRangePct as Record<string, unknown>).downside === 'number' &&
          Number.isFinite((row.priceImpactRangePct as Record<string, unknown>).downside) &&
          typeof (row.priceImpactRangePct as Record<string, unknown>).upside === 'number' &&
          Number.isFinite((row.priceImpactRangePct as Record<string, unknown>).upside)
        )
      )
    );
  });
}

function clampEventImpactPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-6, Math.min(6, value));
}

function clampEventImpactRange(value: { downside: number; upside: number } | undefined): { downside: number; upside: number } | undefined {
  if (!value) return undefined;
  const downside = clampEventImpactPct(value.downside);
  const upside = clampEventImpactPct(value.upside);
  return {
    downside: Math.min(downside, upside),
    upside: Math.max(downside, upside),
  };
}

function portfolioManagerRead(item: ForecastNewsWatchItem, ticker: string): string {
  const text = `${item.title} ${item.impact}`.toLowerCase();
  if (item.kind === 'earnings' || /\b(earnings|guidance|estimate|outlook)\b/.test(text)) {
    return `PM read: this matters if it changes forward estimates, not because the print exists. For ${ticker}, guidance quality, margin bridge, and management tone determine whether analysts revise numbers or investors fade the move.`;
  }
  if (/\b(ai search|ai overviews|gemini|search monetization)\b/.test(text)) {
    return `PM read: the stock moves if AI Search changes the durability of Search cash flow. Stable monetization supports the terminal multiple; click or ad-yield leakage forces investors to haircut the highest-quality profit pool.`;
  }
  if (/\b(cloud|capex|infrastructure|tpu|data center)\b/.test(text)) {
    return `PM read: investors will underwrite AI capex only if Cloud growth and margins prove the spend has a return. The stock reacts to the spread between incremental revenue/margin and incremental capital intensity.`;
  }
  if (/\b(antitrust|regulat|data[-\s]?sharing|eu|doj|remed)\b/.test(text)) {
    return `PM read: this is a multiple-risk catalyst more than a near-term revenue catalyst. The stock weakens if remedies reduce Search distribution power, data advantages, or the market's confidence in terminal economics.`;
  }
  if (/\b(cpi|inflation|pce|fomc|fed|rate|rates|payroll|jobs|employment|nonfarm)\b/.test(text)) {
    return `PM read: this flows through discount rates and risk appetite. ${ticker} should react most if the release changes the path of real yields, because long-duration cash flows and mega-cap tech multiples are rate-sensitive.`;
  }
  const direction = newsDirectionScore(`${item.title} ${item.impact}`);
  if (direction > 0) {
    return `PM read: this can move ${ticker} if it creates an estimate-revision path or lowers perceived risk. One-off headlines should get a smaller overlay than catalysts that change growth, margin, or multiple assumptions.`;
  }
  if (direction < 0) {
    return `PM read: this can pressure ${ticker} if it raises risk premium, threatens margins, or causes investors to question the forecast. If it does not affect estimates or positioning, the price impact should fade.`;
  }
  return `PM read: this is a watch item, not a full thesis change yet. It should only move ${ticker} if follow-through changes estimates, discount rates, regulation risk, or investor positioning.`;
}

function institutionalReadFromPlaybook(playbook: RetrievedPmPlaybook): NonNullable<NonNullable<ForecastNewsWatchItem['eventForecast']>['institutional']> {
  return {
    playbook: playbook.label,
    whatPriced: playbook.whatPriced,
    estimateRevisionRisk: playbook.estimateRevisionRisk,
    multipleImpact: playbook.multipleImpact,
    positioningRisk: playbook.positioningRisk,
    timeHorizon: playbook.timeHorizon,
    forecastOverlay: playbook.forecastOverlay,
  };
}

function isInstitutionalRead(value: unknown): value is NonNullable<NonNullable<ForecastNewsWatchItem['eventForecast']>['institutional']> {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.playbook === 'string' &&
    typeof row.whatPriced === 'string' &&
    typeof row.estimateRevisionRisk === 'string' &&
    typeof row.multipleImpact === 'string' &&
    typeof row.positioningRisk === 'string' &&
    typeof row.timeHorizon === 'string' &&
    typeof row.forecastOverlay === 'string'
  );
}

function pmBrainForForecast(brain: PmAgentBrainOutput): NonNullable<NonNullable<ForecastNewsWatchItem['eventForecast']>['pmBrain']> {
  return {
    pmView: brain.pmView,
    forecastOverlayPct: brain.forecastOverlayPct,
    confidence: brain.confidence,
    invalidationSignal: brain.invalidationSignal,
  };
}

function isPmBrain(value: unknown): value is NonNullable<NonNullable<ForecastNewsWatchItem['eventForecast']>['pmBrain']> {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.pmView === 'string' &&
    typeof row.forecastOverlayPct === 'number' &&
    Number.isFinite(row.forecastOverlayPct) &&
    typeof row.confidence === 'number' &&
    Number.isFinite(row.confidence) &&
    typeof row.invalidationSignal === 'string'
  );
}

async function enrichNewsWatchWithEventForecasts(params: {
  ticker: string;
  horizonLabel: string;
  items: ForecastNewsWatchItem[];
}): Promise<ForecastNewsWatchItem[]> {
  const playbookByTitle = new Map<string, RetrievedPmPlaybook>();
  const base = params.items.map((item) => {
    const playbook = retrievePmPlaybookForEvent({
      ticker: params.ticker,
      title: item.title,
      impact: item.impact,
      kind: item.kind,
    });
    const brain = runPmAgentBrainForEvent({
      ticker: params.ticker,
      title: item.title,
      impact: item.impact,
      kind: item.kind,
      horizonLabel: params.horizonLabel,
      rankScore: item.rank?.score,
      playbook,
    });
    playbookByTitle.set(item.title.trim().toLowerCase(), playbook);
    return {
      ...item,
      eventForecast: {
        ...(item.eventForecast ?? deterministicEventForecast(item, params.ticker)),
        pmRead: item.eventForecast?.pmRead ?? brain.pmView ?? portfolioManagerRead(item, params.ticker),
        institutional: item.eventForecast?.institutional ?? institutionalReadFromPlaybook(playbook),
        pmBrain: item.eventForecast?.pmBrain ?? pmBrainForForecast(brain),
      },
    };
  });
  if (base.length === 0) return base;

  try {
    const result = await Promise.race([
      generateTextWithProviderFallback({
        clientType: 'user',
        preferredProvider: 'anthropic',
        temperature: 0,
        maxTokens: 900,
        messages: [
          {
            role: 'system',
            content:
              [
                'You are a senior hedge fund portfolio manager and buy-side event-forecasting analyst for public equities.',
                'Return strict JSON only: an array, no markdown.',
                'For each event, forecast the most likely actual event result, the surprise variable to watch, the transmission path into the stock, and the likely stock impact over the stated horizon.',
                'Be specific to the ticker when possible. Think like a PM: what is consensus already pricing, what would force estimate revisions, what changes the multiple, what affects positioning, and what matters inside the forecast window.',
                'Use concrete financial channels: revenue growth, margin, capex/free-cash-flow conversion, discount rates, risk premium, terminal multiple, regulatory overhang, or investor positioning.',
                'You will receive a retrieved PM playbook template for each event. Use that template. Do not ignore it. Populate institutional fields in the output: whatPriced, estimateRevisionRisk, multipleImpact, positioningRisk, timeHorizon, forecastOverlay.',
                'Avoid vague phrases like sentiment unless you tie them to a financial channel or positioning effect.',
                'Do not invent exact economic or earnings numbers unless provided. Use qualitative outcomes like in-line, slightly hotter, weaker guidance, capex pressure, regulatory multiple risk.',
                'priceImpactPct is the expected direct stock effect over the forecast horizon before TimesFM trend, bounded between -6 and +6. Use 0 for low-signal events.',
                'direction must be positive, negative, or neutral for the stock. confidence must be 0.2 to 0.85.',
              ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              ticker: params.ticker,
              horizon: params.horizonLabel,
              events: base.map((item) => ({
                title: item.title,
                timing: item.timing,
                kind: item.kind,
                sourceType: item.sourceType,
                impact: item.impact,
                source: item.source,
                deterministicPmRead: item.eventForecast?.pmRead,
                retrievedPmPlaybook: item.eventForecast?.institutional,
                pmAgentBrain: item.eventForecast?.pmBrain,
                ranking: item.rank
                  ? {
                      score: item.rank.score,
                      reason: item.rank.reason,
                    }
                  : undefined,
              })),
              schema: [
                {
                  title: 'same event title',
                  expectedResult: 'short likely event outcome',
                  surpriseToWatch: 'specific variable that would make the event bullish or bearish',
                  transmissionPath: 'event result -> financial driver -> stock impact',
                  pmRead: 'hedge fund PM read on what is priced, what can revise estimates or the multiple, and why the stock should move',
                  pmBrain: {
                    pmView: 'deterministic PM view of why the stock should move',
                    forecastOverlayPct: 0,
                    confidence: 0.5,
                    invalidationSignal: 'what would make the PM view wrong',
                  },
                  institutional: {
                    playbook: 'closest retrieved playbook label',
                    whatPriced: 'what the market likely already prices',
                    estimateRevisionRisk: 'risk of analyst estimate revisions',
                    multipleImpact: 'how valuation multiple or risk premium changes',
                    positioningRisk: 'crowding, rotation, or squeeze/de-risking risk',
                    timeHorizon: 'when the catalyst should matter',
                    forecastOverlay: 'how to map it into the stock forecast overlay',
                  },
                  stockImpact: 'short expected stock effect',
                  direction: 'positive|negative|neutral',
                  confidence: 0.2,
                  priceImpactPct: 0,
                  priceImpactRangePct: { downside: -1.5, upside: 1.2 },
                },
              ],
            }),
          },
        ],
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    const text = result?.text?.trim();
    if (!text) return base;
    const parsed = JSON.parse(text) as unknown;
    if (!isForecastNewsWatchItemArray(parsed)) return base;
    const byTitle = new Map(parsed.map((item) => [item.title.trim().toLowerCase(), item]));
    return base.map((item) => {
      const ai = byTitle.get(item.title.trim().toLowerCase());
      if (!ai) return item;
      const retrievedPlaybook =
        playbookByTitle.get(item.title.trim().toLowerCase()) ??
        retrievePmPlaybookForEvent({
          ticker: params.ticker,
          title: item.title,
          impact: item.impact,
          kind: item.kind,
        });
      const fallbackPlaybook = item.eventForecast?.institutional ?? institutionalReadFromPlaybook(retrievedPlaybook);
      const fallbackBrain =
        item.eventForecast?.pmBrain ??
        pmBrainForForecast(
          runPmAgentBrainForEvent({
            ticker: params.ticker,
            title: item.title,
            impact: item.impact,
            kind: item.kind,
            horizonLabel: params.horizonLabel,
            rankScore: item.rank?.score,
            playbook: retrievedPlaybook,
          }),
        );
      return {
        ...item,
        eventForecast: {
          expectedResult: ai.expectedResult.trim(),
          surpriseToWatch: ai.surpriseToWatch.trim(),
          transmissionPath: ai.transmissionPath.trim(),
          pmRead: ai.pmRead.trim() || item.eventForecast?.pmRead,
          pmBrain: ai.pmBrain
            ? {
                pmView: ai.pmBrain.pmView.trim() || fallbackBrain.pmView,
                forecastOverlayPct: clampEventImpactPct(ai.pmBrain.forecastOverlayPct),
                confidence: Math.max(0.2, Math.min(0.85, ai.pmBrain.confidence)),
                invalidationSignal: ai.pmBrain.invalidationSignal.trim() || fallbackBrain.invalidationSignal,
              }
            : fallbackBrain,
          institutional: {
            playbook: ai.institutional.playbook.trim() || fallbackPlaybook.playbook,
            whatPriced: ai.institutional.whatPriced.trim() || fallbackPlaybook.whatPriced,
            estimateRevisionRisk: ai.institutional.estimateRevisionRisk.trim() || fallbackPlaybook.estimateRevisionRisk,
            multipleImpact: ai.institutional.multipleImpact.trim() || fallbackPlaybook.multipleImpact,
            positioningRisk: ai.institutional.positioningRisk.trim() || fallbackPlaybook.positioningRisk,
            timeHorizon: ai.institutional.timeHorizon.trim() || fallbackPlaybook.timeHorizon,
            forecastOverlay: ai.institutional.forecastOverlay.trim() || fallbackPlaybook.forecastOverlay,
          },
          stockImpact: ai.stockImpact.trim(),
          direction: ai.direction,
          confidence: Math.max(0.2, Math.min(0.85, ai.confidence)),
          priceImpactPct: clampEventImpactPct(ai.priceImpactPct),
          priceImpactRangePct: clampEventImpactRange(ai.priceImpactRangePct) ?? item.eventForecast?.priceImpactRangePct,
        },
      };
    });
  } catch {
    return base;
  }
}

function newsDirectionScore(text: string): 1 | -1 | 0 {
  const lower = text.toLowerCase();
  if (/\b(beat|beats|raise|raises|raised|upgrade|upgraded|accelerat|strong demand|cloud growth|ai demand|partnership|approval|buyback|margin expansion|cost cuts?|dovish|rates? down|cooling inflation)\b/.test(lower)) {
    return 1;
  }
  if (/\b(miss|misses|cut|cuts|lowered|downgrade|downgraded|regulat|antitrust|lawsuit|probe|investigation|data[-\s]?sharing|capex|spending pressure|margin pressure|tariff|hawkish|rates? higher|inflation hotter|guidance risk)\b/.test(lower)) {
    return -1;
  }
  return 0;
}

function buildNewsCatalystAdjustment(items: ForecastNewsWatchItem[]): EventAdjustmentInput | null {
  const scored = items
    .map((item) => {
      const forecastDirection =
        item.eventForecast?.direction === 'positive' ? 1 :
        item.eventForecast?.direction === 'negative' ? -1 :
        0;
      const direction = forecastDirection || newsDirectionScore(`${item.title} ${item.impact} ${item.eventForecast?.stockImpact ?? ''}`);
      if (direction === 0) return null;
      const weight =
        item.kind === 'earnings' ? 1.15 :
        item.kind === 'event' ? 1 :
        item.kind === 'macro' ? 0.85 :
        item.kind === 'company_news' ? 0.7 :
        0.55;
      const priceImpactPct = item.eventForecast?.priceImpactPct;
      return {
        item,
        direction,
        weight: weight * (item.eventForecast?.confidence ?? 0.5),
        priceImpactPct: typeof priceImpactPct === 'number' && Number.isFinite(priceImpactPct)
          ? clampEventImpactPct(priceImpactPct)
          : null,
      };
    })
    .filter((item): item is { item: ForecastNewsWatchItem; direction: 1 | -1; weight: number; priceImpactPct: number | null } => item !== null)
    .slice(0, 4);

  if (scored.length === 0) return null;

  const raw = scored.reduce((sum, item) => {
    if (item.priceImpactPct !== null && Math.abs(item.priceImpactPct) >= 0.1) {
      return sum + item.priceImpactPct * item.weight;
    }
    return sum + item.direction * item.weight * 1.7;
  }, 0);
  const valuationDeltaPct = Math.max(-8, Math.min(8, raw));
  const top = scored[0];
  return {
    valuationDeltaPct,
    direction: valuationDeltaPct > 0.25 ? 'positive' : valuationDeltaPct < -0.25 ? 'negative' : 'mixed',
    magnitude: Math.abs(valuationDeltaPct) >= 5 ? 'high' : Math.abs(valuationDeltaPct) >= 2 ? 'medium' : 'low',
    confidence: Math.max(0.35, Math.min(0.7, 0.42 + scored.length * 0.06)),
    eventType: top.item.kind ?? 'event',
    label: top.item.title,
  };
}

function combineForecastAdjustments(params: {
  marketEventAdjustment: EventAdjustmentInput | null;
  newsCatalystAdjustment: EventAdjustmentInput | null;
}): EventAdjustmentInput | null {
  const adjustments = [params.marketEventAdjustment, params.newsCatalystAdjustment].filter(
    (item): item is EventAdjustmentInput => item !== null,
  );
  if (adjustments.length === 0) return null;

  const weightedDelta = adjustments.reduce((sum, item) => sum + item.valuationDeltaPct * (item.confidence ?? 0.5), 0);
  const confidenceWeight = adjustments.reduce((sum, item) => sum + (item.confidence ?? 0.5), 0);
  const averagedDelta = confidenceWeight > 0 ? weightedDelta / confidenceWeight : adjustments[0].valuationDeltaPct;
  const additiveTilt = adjustments.reduce((sum, item) => sum + item.valuationDeltaPct, 0) * 0.35;
  const valuationDeltaPct = Math.max(-12, Math.min(12, averagedDelta * 0.65 + additiveTilt));
  const top = adjustments.slice().sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5))[0];

  return {
    valuationDeltaPct,
    direction: valuationDeltaPct > 0.25 ? 'positive' : valuationDeltaPct < -0.25 ? 'negative' : 'mixed',
    magnitude: Math.abs(valuationDeltaPct) >= 6 ? 'high' : Math.abs(valuationDeltaPct) >= 2.5 ? 'medium' : 'low',
    confidence: Math.max(0.25, Math.min(0.85, confidenceWeight / adjustments.length)),
    eventType: top.eventType ?? 'event',
    label:
      adjustments.length > 1
        ? `Combined news/event overlay: ${adjustments.map((item) => item.label).filter(Boolean).slice(0, 2).join(' + ')}`
        : top.label ?? 'news/event overlay',
  };
}

function formatMillions(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `$${Math.round(value).toLocaleString('en-US')}M`;
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function sourceLabelForForecast(source: string): string {
  return labelForecastSource(source);
}

function buildForecastGrowthPath(historical: number[], forecast: number[]): number[] {
  const growth: number[] = [];
  let previous = historical.at(-1);
  if (typeof previous !== 'number' || !Number.isFinite(previous) || previous <= 0) return growth;
  for (const value of forecast) {
    if (!Number.isFinite(value) || value <= 0) continue;
    growth.push(value / previous - 1);
    previous = value;
  }
  return growth;
}

function buildLongHorizonForecastReply(payload: ForecastLayerPayload, years: number): string {
  const model = buildAnalystForecastModelPayload(payload, years);
  const horizon = model.horizonYears;
  const lastActual = model.latestActual;
  const terminalForecast = model.terminalForecast;
  const cagr = model.cagr;
  const source = sourceLabelForForecast(model.source);
  const confidence = Math.round(Math.max(0, Math.min(1, model.confidence)) * 100);
  const pathText = model.growthPath.length > 0
    ? model.growthPath.map((value) => formatPct(value)).join(' / ')
    : 'not available';
  const attribution = model.attributionExplanation
    ? ` The main driver flagged by the forecast layer is: ${model.attributionExplanation}.`
    : '';
  const warning = model.warning ? ` Warning: ${model.warning}` : '';

  if (typeof lastActual !== 'number' || typeof terminalForecast !== 'number' || horizon <= 0) {
    return `${payload.ticker} forecast unavailable. The forecast layer returned an incomplete revenue path, so I would not rely on a multi-year forecast from this run.`;
  }

  return [
    `${payload.ticker} ${horizon}-year revenue forecast: ${formatMillions(lastActual)} latest historical revenue to ${formatMillions(terminalForecast)} by year ${horizon}${cagr !== null ? `, implying about ${formatPct(cagr)} annualized growth` : ''}.`,
    `Forecast source: ${source}. Confidence is ${confidence}%. The year-by-year growth path is ${pathText}.${attribution}${warning}`,
    payload.source === 'timesfm'
      ? 'This is the actual forecasting layer output, not a manually written DCF assumption. Use it as the operating baseline, then layer valuation separately through margins, capex, discount rate, and terminal growth.'
      : 'This is not a live TimesFM run. It is a safe fallback, so it should be treated as a placeholder until the TimesFM backend is online.',
  ].join('\n\n');
}

function buildAnalystForecastModelPayload(payload: ForecastLayerPayload, years: number): AnalystForecastModelPayload {
  const horizon = Math.min(Math.max(1, years), payload.forecast.length);
  const lastActual = payload.historical.at(-1) ?? null;
  const terminalForecast = payload.forecast[horizon - 1] ?? null;
  const growthPath = buildForecastGrowthPath(payload.historical, payload.forecast).slice(0, horizon);
  const cagr =
    typeof lastActual === 'number' &&
    lastActual > 0 &&
    typeof terminalForecast === 'number' &&
    terminalForecast > 0 &&
    horizon > 0
      ? (terminalForecast / lastActual) ** (1 / horizon) - 1
      : null;

  return {
    modelType: 'FORECAST_MODEL',
    forecastKind: 'revenue',
    title: `${payload.ticker} Revenue Forecast Model`,
    ticker: payload.ticker,
    horizonYears: horizon,
    units: 'USD millions',
    historical: payload.historical,
    forecast: payload.forecast.slice(0, horizon),
    growthPath,
    latestActual: typeof lastActual === 'number' && Number.isFinite(lastActual) ? lastActual : null,
    terminalForecast: typeof terminalForecast === 'number' && Number.isFinite(terminalForecast) ? terminalForecast : null,
    cagr: cagr !== null && Number.isFinite(cagr) ? cagr : null,
    confidence: Math.max(0, Math.min(1, payload.confidence)),
    source: payload.source,
    attributionExplanation: payload.attribution?.explanation ?? null,
    warning: payload.warning ?? null,
    generatedAt: new Date().toISOString(),
  };
}

function deriveTradingSignalFromForecast(
  returnPct: number,
  confidence: number,
  horizonLabel: string,
): ForecastTradingSignal {
  const absPct = Math.abs(returnPct);
  if (returnPct > 3) {
    return {
      signal: 'LONG',
      conviction: Math.min(0.85, 0.5 + absPct / 40),
      positionSizePct: Math.min(10, Math.max(2, absPct / 2)),
      horizon: horizonLabel,
    };
  }
  if (returnPct < -3) {
    return {
      signal: 'SHORT',
      conviction: Math.min(0.85, 0.5 + absPct / 40),
      positionSizePct: Math.min(10, Math.max(2, absPct / 2)),
      horizon: horizonLabel,
    };
  }
  return {
    signal: 'NEUTRAL',
    conviction: Math.round(confidence * 100) / 100,
    positionSizePct: 0,
    horizon: horizonLabel,
  };
}

function buildPriceForecastModelPayload(params: {
  ticker: string;
  horizonDays: number;
  horizonLabel: string;
  payload: PriceForecastPayload;
  adjustedForecast: EventAdjustedForecast | null;
  confidence: number;
  attributionExplanation: string | null;
  newsWatch: ForecastNewsWatchItem[];
}): AnalystForecastModelPayload | null {
  const forecast = params.payload.forecast;
  const historical = params.payload.historical;
  if (!forecast || !historical) return null;

  const historicalPrices = historical.prices.filter((value) => Number.isFinite(value));
  const forecastValues = (params.adjustedForecast?.series.event_adjusted ?? forecast.values)
    .filter((value) => Number.isFinite(value));
  if (historicalPrices.length <= 1 || forecastValues.length <= 1) return null;

  const latestActual = historicalPrices.at(-1) ?? null;
  const terminalForecast = forecastValues.at(-1) ?? null;
  const returnPct =
    latestActual && latestActual > 0 && terminalForecast
      ? terminalForecast / latestActual - 1
      : null;
  const backtest = computePriceForecastBacktest({
    prices: historicalPrices,
    horizonDays: params.horizonDays,
  });
  const backtestConfidenceAdjustment =
    backtest.quality === 'strong' ? 0.05 :
    backtest.quality === 'weak' ? -0.12 :
    backtest.quality === 'insufficient' ? -0.05 :
    0;
  const technicals = computeTechnicalConfirmation({
    prices: historicalPrices,
    volumes: historical.volumes,
    forecastReturnPct: returnPct === null || !Number.isFinite(returnPct) ? null : returnPct * 100,
  });
  const lower =
    forecast.lower.length === forecast.values.length && forecast.lower.every((value) => Number.isFinite(value))
      ? forecast.lower
      : undefined;
  const upper =
    forecast.upper.length === forecast.values.length && forecast.upper.every((value) => Number.isFinite(value))
      ? forecast.upper
      : undefined;

  return {
    modelType: 'FORECAST_MODEL',
    forecastKind: 'price',
    title: `${params.ticker} Stock Forecast`,
    ticker: params.ticker,
    horizonYears: Math.max(1, Math.round(params.horizonDays / 365)),
    horizonLabel: params.horizonLabel,
    units: 'USD/share',
    historical: historicalPrices.slice(-90),
    forecast: forecastValues,
    lower,
    upper,
    historicalDates: historical.dates.slice(-90),
    forecastDates: forecast.dates,
    growthPath: [],
    latestActual: typeof latestActual === 'number' && Number.isFinite(latestActual) ? latestActual : null,
    terminalForecast: typeof terminalForecast === 'number' && Number.isFinite(terminalForecast) ? terminalForecast : null,
    cagr: null,
    returnPct: returnPct !== null && Number.isFinite(returnPct) ? returnPct : null,
    newsWatch: params.newsWatch.slice(0, 5),
    backtest,
    technicals,
    confidence: Math.max(0.2, Math.min(0.95, params.confidence + backtestConfidenceAdjustment + technicals.confidenceAdjustment)),
    source: params.payload.model_source ?? 'timesfm',
    attributionExplanation: params.attributionExplanation,
    warning: params.adjustedForecast
      ? `Combined prediction: TimesFM baseline plus news/event overlay. Baseline endpoint was $${params.adjustedForecast.baseline.end_price.toFixed(2)} before a ${params.adjustedForecast.event_adjustment.price_proxy_pct >= 0 ? '+' : ''}${params.adjustedForecast.event_adjustment.price_proxy_pct.toFixed(1)}% overlay.`
      : params.payload.methodology ?? null,
    generatedAt: new Date().toISOString(),
  };
}

async function buildLongHorizonForecastLayerReply(params: {
  origin: string;
  ticker: string;
  years: number;
}): Promise<{ reply: string; sources: string[]; forecastModel: AnalystForecastModelPayload } | null> {
  const horizon = Math.min(10, Math.max(1, Math.round(params.years)));
  try {
    const response = await fetch(`${params.origin}/api/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: params.ticker,
        type: 'revenue',
        horizon,
      }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok || !isForecastLayerPayload(data)) return null;
    const source = sourceLabelForForecast(data.source);
    const forecastModel = buildAnalystForecastModelPayload(data, horizon);
    return {
      reply: buildLongHorizonForecastReply(data, horizon),
      forecastModel,
      sources: [
        `CapitalBase forecast layer - ${source}`,
        ...(data.accuracySampleSize && data.accuracySampleSize >= 5
          ? [`Forecast history accuracy sample: ${data.accuracySampleSize}`]
          : []),
      ],
    };
  } catch {
    return null;
  }
}

function buildDeterministicForecastReply(input: DeterministicForecastReplyInput): string {
  const isCombined = input.eventSynthesis !== null;
  const endPrice = input.eventSynthesis?.combined.end_price ?? input.endForecast;
  const returnPct = input.eventSynthesis?.combined.return_pct ?? input.returnPct;
  const direction = input.eventSynthesis?.combined.direction ?? input.direction;
  const directionText = direction === 'flat' ? 'flat move' : `move ${direction}`;
  const band =
    input.lower !== null && input.upper !== null
      ? ` The 90% baseline model band is $${input.lower.toFixed(2)} to $${input.upper.toFixed(2)}, so treat the point estimate as directional rather than precise.`
      : '';
  const eventText = input.eventSynthesis
    ? ` TimesFM alone pointed to $${input.eventSynthesis.baseline.end_price.toFixed(2)} (${input.eventSynthesis.baseline.return_pct >= 0 ? '+' : ''}${input.eventSynthesis.baseline.return_pct.toFixed(1)}%). The news/event overlay (${input.eventSynthesis.event_adjustment.label ?? 'current market events'}) adds a ${input.eventSynthesis.event_adjustment.price_proxy_pct >= 0 ? '+' : ''}${input.eventSynthesis.event_adjustment.price_proxy_pct.toFixed(1)}% price proxy, so the displayed forecast is the combined view.`
    : ' I do not have a strong event overlay loaded for this ticker in the active market-event context, so the clean baseline is the trend forecast.';
  const revenueText = input.revenueForecast
    ? ` Revenue context: the ${input.revenueForecast.sourceLabel.toLowerCase()} revenue forecast implies ${input.revenueForecast.impliedGrowthPct >= 0 ? '+' : ''}${input.revenueForecast.impliedGrowthPct.toFixed(1)}% NTM growth, with projected quarters of ${input.revenueForecast.quarterlyProjections}.`
    : null;
  const eventProxyPct = Math.abs(input.eventSynthesis?.event_adjustment.price_proxy_pct ?? 0);
  const read =
    input.eventSynthesis
      ? eventProxyPct < 1
        ? `Net read: ${direction === 'up' ? 'constructive' : direction === 'down' ? 'cautious' : 'neutral'}, with TimesFM driving most of the forecast; events add only a small offset.`
        : input.eventSynthesis.combined.direction === 'up'
        ? 'Net read: constructive, but only modestly so unless the event overlay strengthens.'
        : input.eventSynthesis.combined.direction === 'down'
          ? 'Net read: cautious, because the event overlay adds meaningful pressure on top of the trend baseline.'
          : 'Net read: neutral, because the trend baseline and event overlay mostly offset.'
      : input.direction === 'up'
        ? 'Net read: constructive on trend, with confidence limited by the forecast band.'
        : input.direction === 'down'
          ? 'Net read: cautious on trend, with confidence limited by the forecast band.'
      : 'Net read: neutral, with the forecast not showing a meaningful directional edge.';

  return [
    `For ${input.ticker}, the ${input.horizonLabel} ${isCombined ? 'combined forecast' : 'forecast'} is $${input.startPrice.toFixed(2)} to $${endPrice.toFixed(2)}, a ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}% ${directionText}.${band}`,
    `${input.sourceLabel} basis: ${input.methodology}${eventText}`,
    ...(revenueText ? [revenueText] : []),
    read,
  ].join('\n\n');
}

function ensureForecastLead(reply: string, leadSentence: string | null): string {
  const trimmed = reply.trim();
  if (!leadSentence) return trimmed;
  if (trimmed.startsWith(leadSentence)) return trimmed;
  const firstSentence = trimmed.match(/^[^.!?]+[.!?]/)?.[0] ?? '';
  const looksLikeFragment =
    /^[+-]?\d+(?:\.\d+)?%?\s+(?:move|from|to|upside|downside)\b/i.test(trimmed) ||
    /^with\s+a\s+wide\s+confidence\s+band\b/i.test(trimmed);
  if (looksLikeFragment) {
    return `${leadSentence}\n\n${trimmed.replace(firstSentence, '').trim() || trimmed}`;
  }
  return `${leadSentence}\n\n${trimmed}`;
}

function isTerseFollowUpQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    text.length > 0 &&
    text.length <= 80 &&
    /^(why|how so|explain|explain this|what matters|what changed|what stands out|walk me through|break this down|drivers?|key drivers?|risks?|what assumptions?|which assumptions?|stress this|compare this|does this hold up|is this realistic)\b/.test(text)
  );
}

function isCurrentArtifactAnalysisPrompt(message: string): boolean {
  const text = message.toLowerCase();
  return (
    isTerseFollowUpQuestion(message) ||
    /\b(explain this|walk me through|break this down|what matters|what changed|what stands out|what is driving|driving factors|key drivers|what assumptions are doing the most work|assumptions doing the most work|which assumptions matter|key assumptions|biggest risks|stress this|sensitivity|compare this to peers|does this hold up|is this realistic|what breaks this case|where is the risk|undervalued|under valued|overvalued|over valued|cheap|expensive|worth buying|buy|sell)\b/.test(
      text,
    )
  );
}

function looksLikeDcfValuationVerdictPrompt(message: string): boolean {
  return /\b(undervalued|under valued|overvalued|over valued|cheap|expensive|worth buying|buy|sell|margin of safety|upside|downside)\b/i.test(message);
}

function formatValuationPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'not available';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function buildDcfValuationVerdictReply(payload: AnalystDcfDemoPayload): string {
  const base = payload.scenarios.base;
  const market = base.marketPrice ?? payload.baseMetrics.sharePrice;
  const normalizedShares = normalizeDcfSharesOutstanding(
    payload.baseMetrics.sharesOutstanding,
    payload.baseMetrics.marketCap,
    market,
  );
  const intrinsic =
    normalizedShares !== null && normalizedShares > 0
      ? base.equityValue / normalizedShares
      : base.pricePerShare;
  const upside = intrinsic !== null && market !== null && market > 0
    ? intrinsic / market - 1
    : base.upsidePct;
  const terminalWeight = base.terminalValueWeight;

  if (intrinsic === null || market === null || market <= 0 || upside === null) {
    return `${payload.ticker} cannot be classified as undervalued from the current DCF because either the model price per share or market price is missing. The base DCF enterprise value is $${Math.round(base.enterpriseValue).toLocaleString('en-US')}M, but the per-share valuation gap is not computable.`;
  }

  const verdict =
    upside > 0.15 ? 'undervalued' :
    upside > 0.03 ? 'modestly undervalued' :
    upside < -0.15 ? 'overvalued' :
    upside < -0.03 ? 'modestly overvalued' :
    'roughly fairly valued';
  const action =
    upside > 0.15 ? 'The signal is constructive, but still depends on the model assumptions holding.' :
    upside > 0.03 ? 'The signal is positive, but the margin of safety is thin.' :
    upside < -0.03 ? 'The model does not support a long thesis unless you underwrite better assumptions than the base case.' :
    'The model is not showing a strong valuation gap either way.';
  const terminalText = terminalWeight !== null && Number.isFinite(terminalWeight)
    ? ` Terminal value is ${(terminalWeight * 100).toFixed(0)}% of enterprise value, so WACC, terminal growth, and long-run margins are the key swing factors.`
    : '';

  return [
    `${payload.ticker} looks ${verdict} in the current DCF: base intrinsic value is $${intrinsic.toFixed(2)} per share versus market price of $${market.toFixed(2)}, implying ${formatValuationPct(upside)} upside/downside.`,
    `${action} The base case assumes revenue growth of ${payload.assumptions.revenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}, EBIT margins of ${payload.assumptions.ebitMargin.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}, WACC of ${(payload.assumptions.wacc * 100).toFixed(1)}%, and terminal growth of ${(payload.assumptions.terminalGrowth * 100).toFixed(1)}%.${terminalText}`,
    `The right read is not a blanket yes/no. It is ${verdict} under this DCF, but the conclusion should be stress-tested against lower ad growth, AI search pressure, antitrust risk, and higher discount rates.`,
  ].join('\n\n');
}

function buildDcfLongHorizonForecastReply(payload: AnalystDcfDemoPayload, requestedYears: number): string {
  const years = Math.min(requestedYears, payload.forecast.length, payload.assumptions.revenueGrowth.length);
  const forecastRows = payload.forecast.slice(0, years);
  const base = payload.scenarios.base;
  const startRevenue = payload.baseMetrics.revenueLtm;
  const endRevenue = forecastRows.at(-1)?.revenue ?? null;
  const revenueCagr =
    typeof startRevenue === 'number' &&
    Number.isFinite(startRevenue) &&
    startRevenue > 0 &&
    typeof endRevenue === 'number' &&
    Number.isFinite(endRevenue) &&
    years > 0
      ? (endRevenue / startRevenue) ** (1 / years) - 1
      : null;
  const growthPath = payload.assumptions.revenueGrowth
    .slice(0, years)
    .map((value) => `${(value * 100).toFixed(1)}%`)
    .join(' / ');
  const marginPath = payload.assumptions.ebitMargin
    .slice(0, years)
    .map((value) => `${(value * 100).toFixed(1)}%`)
    .join(' / ');
  const fcffPath = forecastRows
    .map((row) => `$${Math.round(row.fcff).toLocaleString('en-US')}M`)
    .join(' / ');
  const terminalText =
    base.terminalValueWeight !== null && Number.isFinite(base.terminalValueWeight)
      ? ` Terminal value is ${(base.terminalValueWeight * 100).toFixed(0)}% of enterprise value, so the out-year value is still highly sensitive to WACC, terminal growth, and mature margins.`
      : '';

  if (years <= 0 || forecastRows.length === 0) {
    return `${payload.ticker} does not have a populated multi-year operating forecast in the active DCF. Build or refresh the model first, then ask for the year-by-year forecast.`;
  }

  return [
    `${payload.ticker} ${years}-year operating forecast from the active DCF: revenue growth is ${growthPath}, with EBIT margin moving to ${marginPath}. This is an operating-model forecast, not a short-term price extrapolation.`,
    `Revenue moves from $${Math.round(startRevenue).toLocaleString('en-US')}M LTM to $${Math.round(endRevenue ?? 0).toLocaleString('en-US')}M by year ${years}${revenueCagr !== null ? `, implying a ${(revenueCagr * 100).toFixed(1)}% CAGR` : ''}. FCFF across the forecast is ${fcffPath}.`,
    `Valuation read: the base DCF implies ${base.pricePerShare !== null ? `$${base.pricePerShare.toFixed(2)} per share` : 'no computable per-share value'} on $${Math.round(base.enterpriseValue).toLocaleString('en-US')}M of enterprise value. WACC is ${(payload.assumptions.wacc * 100).toFixed(1)}% and terminal growth is ${(payload.assumptions.terminalGrowth * 100).toFixed(1)}%.${terminalText}`,
    `Net read: the forecast is constructive only if the modeled growth and margin path hold. The biggest risks are slower revenue growth, weaker margin expansion, and a higher discount rate.`,
  ].join('\n\n');
}

function currentArtifactFollowUpInstruction(params: {
  currentModel: AnalystGeneratedModelPayload | null;
  currentDcf: AnalystDcfDemoPayload | null;
  currentStock: StockLookupResult | null;
}): string | null {
  if (params.currentDcf) {
    return 'This is a follow-up on the current DCF artifact. Analyze the current DCF first: focus on valuation drivers, key assumptions, sensitivity, realism, and what is doing the most work. Do not fall back to generic finance explanations unless the user explicitly asks for one.';
  }
  if (params.currentModel) {
    return 'This is a follow-up on the current model artifact. Analyze the current model first: explain the drivers, assumptions, outputs, weak points, and what would change the conclusion. Do not fall back to generic finance explanations unless the user explicitly asks for one.';
  }
  if (params.currentStock) {
    return 'This is a follow-up on the current company lookup artifact. Answer using the current company context first, and separate operating drivers from valuation or sentiment drivers.';
  }
  return null;
}

function isUploadedAttachmentContext(value: unknown): value is UploadedAttachmentContext {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === 'string' &&
    typeof row.mimeType === 'string' &&
    typeof row.sizeKb === 'number' &&
    typeof row.kind === 'string' &&
    typeof row.summary === 'string' &&
    Array.isArray(row.warnings) &&
    (typeof row.rawText === 'undefined' || typeof row.rawText === 'string') &&
    (typeof row.rawBase64 === 'undefined' || typeof row.rawBase64 === 'string')
  );
}

function attachmentContextBlock(attachment: UploadedAttachmentContext): string {
  const signalLines = attachment.signals
    ? [
        attachment.signals.companyName ? `Company: ${attachment.signals.companyName}` : null,
        attachment.signals.ticker ? `Ticker: ${attachment.signals.ticker}` : null,
        attachment.signals.modelTypeHint ? `Model type hint: ${attachment.signals.modelTypeHint}` : null,
        attachment.signals.fiscalPeriod ? `Fiscal period: ${attachment.signals.fiscalPeriod}` : null,
        attachment.signals.extractedMetrics && attachment.signals.extractedMetrics.length > 0
          ? `Extracted metrics:\n${attachment.signals.extractedMetrics.map((metric) => `- ${metric.label}: ${metric.value}`).join('\n')}`
          : null,
        attachment.signals.keyLines.length > 0
          ? `Key extracted lines:\n${attachment.signals.keyLines.map((line) => `- ${line}`).join('\n')}`
          : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join('\n')
    : null;
  const filingLines = attachment.filingClassification
    ? [
        attachment.filingClassification.rawFilingType
          ? `Raw filing type: ${attachment.filingClassification.rawFilingType}`
          : null,
        attachment.filingClassification.familiarCategory
          ? `Familiar category: ${attachment.filingClassification.familiarCategory}`
          : null,
        attachment.filingPacket?.label ? `Packet: ${attachment.filingPacket.label}` : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join('\n')
    : null;
  const warnings = attachment.warnings.length > 0 ? `Warnings: ${attachment.warnings.join(' | ')}\n` : '';
  return [
    `Uploaded attachment: ${attachment.name}`,
    `Attachment type: ${attachment.kind}`,
    `MIME type: ${attachment.mimeType}`,
    `Size: ${attachment.sizeKb}kb`,
    warnings ? warnings.trimEnd() : null,
    filingLines,
    signalLines,
    attachment.statementPackage?.snapshot
      ? `Structured statements extracted: ${[
          attachment.statementPackage.incomeStatement.length > 0 ? 'income statement' : null,
          attachment.statementPackage.balanceSheet.length > 0 ? 'balance sheet' : null,
          attachment.statementPackage.cashFlowStatement.length > 0 ? 'cash flow statement' : null,
        ]
          .filter((item): item is string => Boolean(item))
          .join(', ') || 'statement package'}`
      : null,
    attachment.aiStatementCompletion
      ? `AI completion candidates: ${attachment.aiStatementCompletion.candidates.length} (source: ${attachment.aiStatementCompletion.sourceTag})`
      : null,
    'Use this uploaded artifact as primary context when the user asks to explain, interpret, or turn it into a model.',
    `Attachment summary:\n${attachment.summary}`,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n');
}

function shouldInjectMacroEventsContext(
  route: AnalystRoute,
  userMessage: string,
  attachment: UploadedAttachmentContext | null,
): boolean {
  if (route.intent === 'event_intelligence' || route.intent === 'market_question') return true;
  if (isValuationOrTradeAnalysisPrompt(userMessage)) return true;

  const macroKeywords =
    /\b(macro|market|rates?|yield|curve|fed|fomc|ecb|boj|boe|inflation|cpi|pce|gdp|jobs|payrolls|unemployment|oil|crude|fx|dollar|dxy|treasury|credit|spread|liquidity|geopolitic|tariff|trade policy)\b/i;
  if (macroKeywords.test(userMessage)) return true;

  const attachmentText = `${attachment?.summary ?? ''}\n${attachment?.signals?.keyLines.join('\n') ?? ''}`;
  return macroKeywords.test(attachmentText);
}

function artifactTickerFromContext(params: {
  currentModel: AnalystGeneratedModelPayload | null;
  currentDcf: AnalystDcfDemoPayload | null;
  currentStock: StockLookupResult | null;
}): string | undefined {
  if (params.currentDcf?.ticker) return params.currentDcf.ticker.toUpperCase();
  if (params.currentStock?.ticker) return params.currentStock.ticker.toUpperCase();
  const extractedTicker = params.currentModel?.extractedInputs
    && 'ticker' in params.currentModel.extractedInputs
    && typeof params.currentModel.extractedInputs.ticker === 'string'
    ? params.currentModel.extractedInputs.ticker
    : null;
  return extractedTicker?.trim().toUpperCase() || undefined;
}

function artifactLabelFromContext(params: {
  currentModel: AnalystGeneratedModelPayload | null;
  currentDcf: AnalystDcfDemoPayload | null;
  currentStock: StockLookupResult | null;
}): string | null {
  if (params.currentDcf) return `${params.currentDcf.companyName} (${params.currentDcf.ticker})`;
  if (params.currentStock) return `${params.currentStock.companyName ?? params.currentStock.ticker} (${params.currentStock.ticker})`;
  if (params.currentModel) {
    const extractedTicker = params.currentModel.extractedInputs
      && 'ticker' in params.currentModel.extractedInputs
      && typeof params.currentModel.extractedInputs.ticker === 'string'
      ? params.currentModel.extractedInputs.ticker
      : null;
    const extractedCompanyName = params.currentModel.extractedInputs
      && 'companyName' in params.currentModel.extractedInputs
      && typeof params.currentModel.extractedInputs.companyName === 'string'
      ? params.currentModel.extractedInputs.companyName
      : null;
    if (extractedCompanyName && extractedTicker) return `${extractedCompanyName} (${extractedTicker})`;
    return params.currentModel.title;
  }
  return null;
}

function buildArtifactTickerMismatchReply(params: {
  requestedTicker: string;
  artifactTicker: string;
  artifactLabel: string | null;
}): string {
  const artifactLabel = params.artifactLabel ?? params.artifactTicker;
  return [
    `The active workspace is still set to ${artifactLabel}, but you asked about ${params.requestedTicker}.`,
    `I am not going to apply a shock or explain assumptions on the wrong company.`,
    `Switch the active artifact to ${params.requestedTicker} or ask me to analyze ${params.requestedTicker} without using the current workspace.`,
  ].join('\n\n');
}

function currentArtifactContextBlock(params: {
  currentModel: AnalystGeneratedModelPayload | null;
  currentDcf: AnalystDcfDemoPayload | null;
  currentStock: StockLookupResult | null;
}): string | null {
  if (params.currentDcf) {
    const base = params.currentDcf.scenarios.base;
    return [
      `Current artifact: DCF for ${params.currentDcf.companyName} (${params.currentDcf.ticker})`,
      `Source: ${params.currentDcf.source}${params.currentDcf.asOfDate ? ` as of ${params.currentDcf.asOfDate}` : ''}`,
      `Base implied value: ${base.pricePerShare != null ? `$${base.pricePerShare.toFixed(2)} per share` : 'not available'}`,
      `Enterprise value: $${Math.round(base.enterpriseValue).toLocaleString('en-US')}M`,
      `Revenue growth path: ${params.currentDcf.assumptions.revenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}`,
      `EBIT margin path: ${params.currentDcf.assumptions.ebitMargin.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}`,
      `WACC / terminal growth: ${(params.currentDcf.assumptions.wacc * 100).toFixed(1)}% / ${(params.currentDcf.assumptions.terminalGrowth * 100).toFixed(1)}%`,
      `Memo: ${params.currentDcf.memo}`,
    ].join('\n');
  }

  if (params.currentModel) {
    const extractedTicker = params.currentModel.extractedInputs
      && 'ticker' in params.currentModel.extractedInputs
      && typeof params.currentModel.extractedInputs.ticker === 'string'
      ? params.currentModel.extractedInputs.ticker
      : null;
    const extractedCompanyName = params.currentModel.extractedInputs
      && 'companyName' in params.currentModel.extractedInputs
      && typeof params.currentModel.extractedInputs.companyName === 'string'
      ? params.currentModel.extractedInputs.companyName
      : null;
    return [
      `Current artifact: ${params.currentModel.modelType.replace(/_/g, ' ')} model${extractedCompanyName ? ` for ${extractedCompanyName}` : ''}${extractedTicker ? ` (${extractedTicker})` : ''}`,
      `Title: ${params.currentModel.title}`,
      `Key outputs: ${params.currentModel.keyOutputs.join(' | ')}`,
      `Tabs: ${params.currentModel.tabs.join(', ')}`,
      `Narrative blocks:\n${params.currentModel.narrativeBlocks.map((block) => `- ${block.title}: ${block.body}`).join('\n')}`,
      `Provenance: ${params.currentModel.provenanceSummary.sources.join(' | ')}`,
    ].join('\n');
  }

  if (params.currentStock) {
    return [
      `Current artifact: company lookup for ${params.currentStock.companyName ?? params.currentStock.ticker} (${params.currentStock.ticker})`,
      `Price: ${params.currentStock.price != null ? `$${params.currentStock.price.toFixed(2)}` : 'not available'}`,
      `Market cap: ${params.currentStock.marketCap != null ? `$${Math.round(params.currentStock.marketCap).toLocaleString('en-US')}` : 'not available'}`,
      `Revenue / EBITDA / net income: ${params.currentStock.revenueLtm != null ? `$${Math.round(params.currentStock.revenueLtm).toLocaleString('en-US')}M` : 'n/a'} / ${params.currentStock.ebitdaLtm != null ? `$${Math.round(params.currentStock.ebitdaLtm).toLocaleString('en-US')}M` : 'n/a'} / ${params.currentStock.netIncomeLtm != null ? `$${Math.round(params.currentStock.netIncomeLtm).toLocaleString('en-US')}M` : 'n/a'}`,
      `Sector / industry: ${params.currentStock.sector ?? 'n/a'} / ${params.currentStock.industry ?? 'n/a'}`,
    ].join('\n');
  }

  return null;
}

function withDerivedFilingMetadata(attachment: UploadedAttachmentContext): UploadedAttachmentContext {
  const filingClassification = classifyAttachmentFiling({
    name: attachment.name,
    mimeType: attachment.mimeType,
    summary: attachment.summary,
    rawText: attachment.rawText,
    kind: attachment.kind,
    signals: attachment.signals,
    statementPackage: attachment.statementPackage,
  });
  const filingPacket = buildFilingPacket({
    attachmentName: attachment.name,
    kind: attachment.kind,
    classification: filingClassification,
    signals: attachment.signals,
    statementPackage: attachment.statementPackage,
  });
  return {
    ...attachment,
    filingClassification,
    ...(filingPacket ? { filingPacket } : { filingPacket: undefined }),
  };
}

async function hydrateAttachmentContext(
  attachment: UploadedAttachmentContext | null,
): Promise<UploadedAttachmentContext | null> {
  if (!attachment) return null;
  if (!isPdfAttachment({ mimeType: attachment.mimeType, name: attachment.name })) {
    return withDerivedFilingMetadata(attachment);
  }
  if (!attachment.rawBase64) return withDerivedFilingMetadata(attachment);

  try {
    const pdfBuffer = Buffer.from(attachment.rawBase64, 'base64');
    console.info('[analyst-chat] pdf extraction started', {
      attachment: attachment.name,
      sizeKb: attachment.sizeKb,
    });
    const extraction = await extractPdfTextServer(pdfBuffer);
    if (
      extraction.stage === 'dependency_failed' ||
      extraction.stage === 'extract_failed' ||
      extraction.stage === 'runtime_bootstrap_failed'
    ) {
      const extractionAssessment = assessPdfStatementExtraction({
        failureMode: 'failed',
        authoritative: true,
      });
      console.warn('[analyst-chat] pdf text extraction failed', {
        attachment: attachment.name,
        extractor: extraction.extractor,
        stage: extraction.stage,
        runtimeBootstrap: extraction.runtimeBootstrap ?? null,
        warnings: extraction.warnings,
      });
      return withDerivedFilingMetadata({
        ...attachment,
        rawText: undefined,
        statementPackage: undefined,
        statementExtractionStatus: extractionAssessment.statementExtractionStatus,
        statementExtractionWarnings: extraction.warnings,
        isFinancialModelSeedable: extractionAssessment.isFinancialModelSeedable,
      });
    }

    const extractedText = extraction.text ?? '';
    console.info('[analyst-chat] pdf text extraction completed', {
      attachment: attachment.name,
      extractor: extraction.extractor,
      stage: extraction.stage,
      textLength: extractedText.length,
    });
    const statementPackage = extractPdfStatementPackage(extractedText);
    const parserFailure = extraction.stage === 'parser_failed' || !statementPackage;
    const extractionAssessment = assessPdfStatementExtraction({
      statementPackage,
      ...(parserFailure ? { failureMode: null } : {}),
      authoritative: true,
    });
    const parserWarnings = parserFailure
      ? [...extraction.warnings, 'PDF text was extracted, but no trusted financial statement package could be built from it.']
      : extraction.warnings;
    const resolvedStatus = parserFailure ? 'low_confidence' : extractionAssessment.statementExtractionStatus;
    console.info('[analyst-chat] pdf extraction stage resolved', {
      attachment: attachment.name,
      extractor: extraction.extractor,
      stage: extraction.stage,
      statementPackageBuilt: Boolean(statementPackage),
      trustStatus: resolvedStatus,
      missingStatements: statementPackage?.missingStatements ?? [],
    });
    const shouldRunAiCompletion = featureFlags.ENABLE_AI_PDF_COMPLETION === true;
    const aiCompletion = shouldRunAiCompletion
      ? await runAiStatementCompletion({
          extractedText,
          statementPackage: statementPackage ?? undefined,
          statementExtractionStatus: resolvedStatus,
          missingFieldSchema: PDF_COMPLETION_SCHEMA,
        })
      : null;
    const finalStatementPackage = statementPackage
      ? {
          ...statementPackage,
          snapshot: aiCompletion?.mergedSnapshot ?? statementPackage.snapshot,
        }
      : undefined;

    return withDerivedFilingMetadata({
      ...attachment,
      summary: extractedText.slice(0, 7000),
      rawText: extractedText.slice(0, 120000),
      ...(finalStatementPackage ? { statementPackage: finalStatementPackage } : {}),
      ...(!finalStatementPackage ? { statementPackage: undefined } : {}),
      statementExtractionStatus: resolvedStatus,
      statementExtractionWarnings: parserWarnings.length > 0 ? parserWarnings : extractionAssessment.statementExtractionWarnings,
      isFinancialModelSeedable: parserFailure ? false : extractionAssessment.isFinancialModelSeedable,
      ...(aiCompletion ? { aiStatementCompletion: aiCompletion } : {}),
      warnings: attachment.warnings.filter(
        (warning) => !warning.toLowerCase().includes('client-side pdf preview extraction'),
      ),
    });
  } catch (error) {
    console.error('[analyst-chat] pdf attachment hydration crashed', {
      attachment: attachment.name,
      message: error instanceof Error ? redactSecrets(error.message) : 'unknown error',
    });
    const extractionAssessment = assessPdfStatementExtraction({
      failureMode: 'failed',
      authoritative: true,
    });
    return withDerivedFilingMetadata({
      ...attachment,
      statementPackage: undefined,
      statementExtractionStatus: extractionAssessment.statementExtractionStatus,
      statementExtractionWarnings: extractionAssessment.statementExtractionWarnings,
      isFinancialModelSeedable: extractionAssessment.isFinancialModelSeedable,
      warnings: [...attachment.warnings, 'Server-side PDF extraction failed.'],
    });
  }
}

function buildFinancialPdfModelFailureReply(params: {
  modelType: 'DCF' | 'THREE_STATEMENT' | 'COMPS' | 'LBO' | null;
  status: UploadedAttachmentContext['statementExtractionStatus'];
  extractionWarnings: string[];
  missingCoverage?: string[];
}): string {
  const modelLabel = params.modelType ? params.modelType.replace(/_/g, ' ') : 'financial model';
  if (params.status !== 'trusted') {
    const statusLabel = params.status ?? 'low_confidence';
    const warningText =
      params.extractionWarnings.length > 0
        ? ` ${params.extractionWarnings.join(' ')}`
        : '';
    return `I could not build a ${modelLabel} from the attached financial PDF because server-side statement extraction was ${statusLabel}.${warningText}`;
  }

  if (params.missingCoverage && params.missingCoverage.length > 0) {
    return `I could not build a ${modelLabel} from the attached financial PDF because the extracted statements did not include the minimum required fields: ${params.missingCoverage.join(', ')}.`;
  }

  return `I could not build a ${modelLabel} from the attached financial PDF because the extracted statement package was not usable for model seeding.`;
}

function isPendingModelRequest(value: unknown): value is PendingModelRequest {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    (row.modelType === 'DCF' ||
      row.modelType === 'THREE_STATEMENT' ||
      row.modelType === 'COMPS' ||
      row.modelType === 'LBO') &&
    typeof row.originalPrompt === 'string'
  );
}

function buildAttachmentClarificationReply(params: {
  modelType: AttachmentDrivenModelType;
  clarificationQuestion: string;
  missingInputs: string[];
  clarificationFieldLabel?: string;
  parseFailed?: boolean;
}): string {
  const modelLabel = params.modelType.replace(/_/g, ' ');
  const missingSummary = params.missingInputs.join(', ');
  if (params.parseFailed && params.clarificationFieldLabel) {
    return `I still need ${params.clarificationFieldLabel} before I can build the ${modelLabel} from the attached PDF. ${params.clarificationQuestion}`;
  }
  return `I can build the ${modelLabel} from the attached PDF once I have the remaining required inputs: ${missingSummary}. ${params.clarificationQuestion}`;
}

function buildFinancialModelSourceLabel(source: string): string {
  if (source === 'attachment_pdf_statement') return 'Attachment PDF statement package';
  return `Demo snapshot cache — ${source}`;
}

function serializeMarketEventsContext(events: MarketEvent[]): string {
  return events
    .slice(0, 5)
    .map((event, index) => {
      const impact = [
        event.marketImpact.equities,
        event.marketImpact.rates,
        event.marketImpact.fx,
        event.marketImpact.oil,
        event.marketImpact.credit,
        event.marketImpact.sectors,
      ]
        .filter((item): item is string => Boolean(item))
        .slice(0, 2)
        .join(' | ');
      return [
        `${index + 1}. ${event.title} (${event.eventType}; severity ${event.severity}; ${event.horizon})`,
        `Drivers: ${event.drivers.join(' | ')}`,
        `Transmission: ${event.transmissionPath.join(' -> ')}`,
        impact ? `Market impact: ${impact}` : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join('\n');
    })
    .join('\n\n');
}

function marketEventImpactSummary(event: MarketEvent): string {
  return [
    event.marketImpact.equities,
    event.marketImpact.sectors,
    event.marketImpact.rates,
    event.marketImpact.oil,
    event.marketImpact.credit,
    event.marketImpact.fx,
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 2)
    .join(' | ') || event.drivers.slice(0, 2).join(' | ');
}

function eventRelevanceScore(event: MarketEvent, ticker: string | null): number {
  const tickerText = ticker?.trim().toUpperCase() ?? '';
  const searchable = [
    event.title,
    ...event.drivers,
    ...event.transmissionPath,
    event.marketImpact.equities,
    event.marketImpact.sectors,
  ]
    .filter((item): item is string => Boolean(item))
    .join(' ')
    .toUpperCase();
  const tickerMatch = tickerText.length > 0 && searchable.includes(tickerText) ? 40 : 0;
  const signalScore =
    event.signal?.position && event.signal.position !== 'NEUTRAL'
      ? Math.round((event.signal.conviction ?? 0.4) * 20)
      : 0;
  const typeScore = event.eventType === 'EarningsMegaCap' ? 16 : event.eventType === 'SystemicRisk' ? 12 : 8;
  return tickerMatch + signalScore + typeScore + event.severity;
}

function buildDcfEventContext(events: MarketEvent[] | undefined, ticker: string | null): AnalystDcfEventContext[] {
  return (events ?? [])
    .slice()
    .sort((a, b) => eventRelevanceScore(b, ticker) - eventRelevanceScore(a, ticker))
    .slice(0, 3)
    .map((event) => ({
      title: event.title,
      eventType: event.eventType,
      severity: event.severity,
      horizon: event.horizon,
      impact: marketEventImpactSummary(event),
      sourceName: event.sources[0]?.name ?? null,
      publishedAt: event.sources[0]?.publishedAt ?? event.lastUpdatedAt ?? null,
      signal: event.signal?.position ?? null,
    }));
}

function catalystSeverity(relevance: 'primary' | 'secondary' | 'monitor'): number {
  if (relevance === 'primary') return 65;
  if (relevance === 'secondary') return 50;
  return 35;
}

function buildDcfCatalystContext(context: CompanyCatalystContext | null | undefined): AnalystDcfEventContext[] {
  if (!context) return [];

  const transcriptItems = context.transcriptItems.slice(0, 1).map((item) => ({
    title: item.label,
    eventType: 'EarningsMegaCap',
    severity: catalystSeverity(item.relevance),
    horizon: 'NearTerm',
    impact: item.excerpt,
    sourceName: item.source,
    publishedAt: item.asOf,
    signal: null,
  } satisfies AnalystDcfEventContext));

  const calendarItems = context.calendarItems
    .filter((item) => item.relevance !== 'monitor')
    .slice(0, 2)
    .map((item) => ({
      title: item.kind === 'earnings' ? `${item.title}: ${item.displayDate}` : item.title,
      eventType: item.kind === 'earnings' ? 'EarningsMegaCap' : 'Macro',
      severity: catalystSeverity(item.relevance),
      horizon: item.kind === 'earnings' ? 'NearTerm' : 'Immediate',
      impact: item.note?.trim() || `${item.source}${item.date ? ` · ${item.displayDate}` : ''}`,
      sourceName: item.source,
      publishedAt: item.date,
      signal: null,
    } satisfies AnalystDcfEventContext));

  const ownershipItems = context.ownershipItems
    .filter((item) => item.relevance !== 'monitor')
    .slice(0, 1)
    .map((item) => ({
      title: item.label,
      eventType: 'SystemicRisk',
      severity: catalystSeverity(item.relevance),
      horizon: 'Structural',
      impact: item.note?.trim() ? `${item.displayValue} · ${item.note}` : item.displayValue,
      sourceName: item.source,
      publishedAt: item.asOf,
      signal: null,
    } satisfies AnalystDcfEventContext));

  return [...transcriptItems, ...calendarItems, ...ownershipItems]
    .filter((item) => item.title.trim().length > 0 && item.impact.trim().length > 0)
    .slice(0, 3);
}

function mergeDcfContextItems(...groups: AnalystDcfEventContext[][]): AnalystDcfEventContext[] {
  const seen = new Set<string>();
  const merged: AnalystDcfEventContext[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.title.toLowerCase()}|${item.impact.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 3) return merged;
    }
  }
  return merged;
}

function attachDcfEventContext(
  payload: AnalystDcfDemoPayload,
  events: MarketEvent[] | undefined,
  ticker: string | null,
  catalystContext?: CompanyCatalystContext | null,
): AnalystDcfDemoPayload {
  const eventContext = mergeDcfContextItems(
    buildDcfEventContext(events, ticker),
    buildDcfCatalystContext(catalystContext),
  );
  if (eventContext.length === 0) return payload;
  return {
    ...payload,
    eventContext,
  };
}

async function loadDcfCatalystContext(ticker: string | null | undefined): Promise<CompanyCatalystContext | null> {
  if (!ticker) return null;
  return Promise.race([
    getCompanyCatalystContext(ticker, 'dcf'),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]).catch(() => null);
}

function visualizationContextType(params: {
  currentModel: AnalystGeneratedModelPayload | null;
  currentDcf: AnalystDcfDemoPayload | null;
  currentStock: StockLookupResult | null;
  stockLookup: StockLookupResult | null;
}): 'dcf' | 'model' | 'stock' {
  if (params.currentDcf) return 'dcf';
  if (params.currentModel) return 'model';
  if (params.currentStock || params.stockLookup) return 'stock';
  return 'stock';
}

function visualizationContextLabel(params: {
  currentModel: AnalystGeneratedModelPayload | null;
  currentDcf: AnalystDcfDemoPayload | null;
  currentStock: StockLookupResult | null;
  stockLookup: StockLookupResult | null;
  resolvedTicker?: string;
}): string {
  if (params.currentDcf) return `${params.currentDcf.companyName} (${params.currentDcf.ticker})`;
  if (params.currentModel) {
    const ticker =
      params.currentModel.extractedInputs &&
      'ticker' in params.currentModel.extractedInputs &&
      typeof params.currentModel.extractedInputs.ticker === 'string'
        ? params.currentModel.extractedInputs.ticker
        : null;
    const companyName =
      params.currentModel.extractedInputs &&
      'companyName' in params.currentModel.extractedInputs &&
      typeof params.currentModel.extractedInputs.companyName === 'string'
        ? params.currentModel.extractedInputs.companyName
        : null;
    if (companyName && ticker) return `${companyName} (${ticker})`;
    return params.currentModel.title;
  }
  const stock = params.currentStock ?? params.stockLookup;
  if (stock) return `${stock.companyName ?? stock.ticker} (${stock.ticker})`;
  return params.resolvedTicker ?? 'Requested chart';
}

async function fetchDeterministicScenarioReport(origin: string): Promise<SmartScenarioDcfReport> {
  const response = await fetch(new URL('/api/scenarios/ai-smart-dcf', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as SmartScenarioDcfReport | { error?: string } | null;
  if (!response.ok || !payload || typeof payload !== 'object' || !('formattedResponse' in payload)) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Unable to apply the macro scenario right now.';
    throw new Error(error);
  }

  return payload as SmartScenarioDcfReport;
}

function isScenarioCardPayload(value: unknown): value is AnalystScenarioCardPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.company === 'string' &&
    typeof payload.title === 'string' &&
    Array.isArray(payload.assumptions) &&
    Array.isArray(payload.drivers) &&
    Array.isArray(payload.interpretation) &&
    Array.isArray(payload.risks)
  );
}

function extractLatestScenarioCardFromMessages(messages: unknown[]): AnalystScenarioCardPayload | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object') continue;
    const record = message as Record<string, unknown>;
    if (record.role !== 'assistant') continue;
    const meta = record.meta;
    if (!meta || typeof meta !== 'object') continue;
    const scenarioCard = (meta as Record<string, unknown>).scenarioCard;
    if (isScenarioCardPayload(scenarioCard)) return scenarioCard;
  }
  return null;
}

/* ────────── Fallback Reply Builder ────────── */

async function buildFallbackReply(params: {
  ticker?: string;
  facts?: VerifiedFacts;
  userMessage: string;
  reason: 'missing_key' | 'auth_failed' | 'rate_limited' | 'model_unavailable' | 'data_unavailable';
  preferSilent?: boolean;
}): Promise<string> {
  const headerByReason: Record<typeof params.reason, string> = {
    missing_key: 'No AI provider key is configured. Returning retrieved data context only.',
    auth_failed: 'AI provider authentication failed. Returning retrieved data context only.',
    rate_limited: 'AI provider rate limit exceeded. Returning retrieved data context only.',
    model_unavailable: 'AI generation is temporarily unavailable. Returning retrieved data context only.',
    data_unavailable: 'The requested model could not be built because company financial data is not available or complete for this ticker right now.',
  };
  const header = headerByReason[params.reason];

  if (params.preferSilent && params.reason !== 'data_unavailable') {
    return '';
  }

  if (params.facts) {
    const factBlock = serializeFactsBriefForContext(params.facts, params.userMessage);
    return `${header}\n\n${factBlock}`;
  }

  if (!params.ticker) {
    return `${header}\n\nNo ticker provided and no verified facts available.`;
  }

  try {
    const retrieved = await gatherAnalystRetrievalContext({ ticker: params.ticker, userMessage: params.userMessage });
    if (retrieved.context) {
      return `${header}\n\n${retrieved.context}`;
    }

    const { getDemoFundamentals } = await import('@/lib/data/providers/demoProvider');
    const fundamentals = await getDemoFundamentals(params.ticker);
    if (fundamentals) {
      const netDebt = typeof fundamentals.totalDebt === 'number' && typeof fundamentals.cash === 'number'
        ? fundamentals.totalDebt - fundamentals.cash : null;
      return `${header}

Ticker: ${fundamentals.ticker} (${fundamentals.companyName})
LTM Revenue: ${fmtMillions(fundamentals.revenueLTM)} (USD millions)
LTM EBITDA: ${fmtMillions(fundamentals.ebitdaLTM)} (USD millions)
LTM Net Income: ${fmtMillions(fundamentals.netIncomeLTM)} (USD millions)
Cash: ${fmtMillions(fundamentals.cash)} (USD millions)
Total Debt: ${fmtMillions(fundamentals.totalDebt)} (USD millions)
Net Debt: ${fmtMillions(netDebt)} (USD millions)

This is a deterministic data snapshot only.`;
    }
  } catch {
    // fall through
  }

  return `${header}\n\nTicker focus: ${params.ticker}\nNo data available.`;
}

/* ────────── Main POST Handler ────────── */

export async function POST(req: NextRequest) {
  let fallbackTicker: string | undefined;
  let fallbackUserMessage = '';
  let verifiedFacts: VerifiedFacts | undefined;
  let stockLookupPayload: Awaited<ReturnType<typeof lookupStock>> | null = null;
  let responseStockLookup: Awaited<ReturnType<typeof lookupStock>> | null = null;
  let earningsAgentResult: EarningsRetrievalAgentResult | null = null;
  let earningsRuntimeMeta: EarningsRetrievalRuntimeMeta | null = null;
  let responseAttachmentStatus: AttachmentStatusPayload | null = null;

  try {
    const body = await req.json();

    /* ── Parse request ── */
    const tickerRaw = typeof body?.ticker === 'string' && body.ticker.trim().length > 0
      ? body.ticker.trim().toUpperCase()
      : undefined;
    const attachmentContextInput = isUploadedAttachmentContext(body?.attachmentContext) ? body.attachmentContext : null;
    const attachmentContext = await hydrateAttachmentContext(attachmentContextInput).catch((error) => {
      console.error('[analyst-chat] attachment hydration failed before routing', {
        attachment: attachmentContextInput?.name ?? null,
        message: error instanceof Error ? redactSecrets(error.message) : 'unknown error',
      });
      if (!attachmentContextInput) return null;
      const extractionAssessment = assessPdfStatementExtraction({
        failureMode: 'failed',
        authoritative: true,
      });
      return {
        ...attachmentContextInput,
        rawText: undefined,
        statementPackage: undefined,
        statementExtractionStatus: extractionAssessment.statementExtractionStatus,
        statementExtractionWarnings: extractionAssessment.statementExtractionWarnings,
        isFinancialModelSeedable: extractionAssessment.isFinancialModelSeedable,
        warnings: [
          ...attachmentContextInput.warnings,
          'Server-side PDF extraction failed before attachment hydration completed.',
        ],
      } satisfies UploadedAttachmentContext;
    });
    responseAttachmentStatus = buildAttachmentStatus({
      attachment: attachmentContext,
      attachmentInputProvided: Boolean(attachmentContextInput),
      isPdf: Boolean(attachmentContext && isPdfAttachment({ mimeType: attachmentContext.mimeType, name: attachmentContext.name })),
    });
    const withAttachmentStatus = <T extends Record<string, unknown>>(payload: T): T => {
      if (!responseAttachmentStatus) return payload;
      return {
        ...payload,
        attachmentStatus: responseAttachmentStatus,
      };
    };
    const sessionId = typeof body?.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId.trim() : null;
    const safeMessages = Array.isArray(body?.messages)
      ? body.messages
          .filter(
            (m: unknown): m is { role: 'user' | 'assistant' | 'system'; content: string } =>
              Boolean(m) &&
              typeof m === 'object' &&
              (m as { role?: unknown }).role !== undefined &&
              typeof (m as { content?: unknown }).content === 'string',
          )
          .map((m: { role: 'user' | 'assistant' | 'system'; content: string }) => ({
            role: m.role,
            content: m.content,
          }))
          .slice(-12)
      : [];
    type SafeMessage = { role: 'user' | 'assistant' | 'system'; content: string };
    const lastUserMessage = safeMessages.filter((m: SafeMessage) => m.role === 'user').slice(-1)[0]?.content || '';
    const currentModel =
      body?.currentModel && typeof body.currentModel === 'object'
        ? (body.currentModel as AnalystGeneratedModelPayload)
        : null;
    const requestModelAdjustment =
      body?.modelAdjustment && typeof body.modelAdjustment === 'object'
        ? (body.modelAdjustment as AnalystStructuredModelAdjustment)
        : null;
    const currentDcf =
      body?.currentDcf && typeof body.currentDcf === 'object'
        ? repairDcfPayloadShareCount(body.currentDcf as AnalystDcfDemoPayload)
        : null;
    const dcfAdjustment =
      body?.dcfAdjustment && typeof body.dcfAdjustment === 'object'
        ? (body.dcfAdjustment as AnalystDcfAdjustment)
        : null;
    const dcfEventShockPrompt =
      typeof body?.dcfEventShockPrompt === 'string' && body.dcfEventShockPrompt.trim().length > 0
        ? body.dcfEventShockPrompt.trim()
        : null;
    const currentStock =
      body?.currentStock && typeof body.currentStock === 'object'
        ? (body.currentStock as StockLookupResult)
        : null;
    const clarificationAnswer =
      typeof body?.clarificationAnswer === 'string' && body.clarificationAnswer.trim().length > 0
        ? body.clarificationAnswer.trim()
        : null;
    const requestInputOverrides =
      body?.inputOverrides && typeof body.inputOverrides === 'object' && !Array.isArray(body.inputOverrides)
        ? (body.inputOverrides as Record<string, unknown>)
        : undefined;
    const pendingModelRequest = isPendingModelRequest(body?.pendingModelRequest)
      ? ({
          ...body.pendingModelRequest,
          inputOverrides:
            body.pendingModelRequest.inputOverrides &&
            typeof body.pendingModelRequest.inputOverrides === 'object' &&
            !Array.isArray(body.pendingModelRequest.inputOverrides)
              ? (body.pendingModelRequest.inputOverrides as Record<string, unknown>)
            : undefined,
        } satisfies PendingModelRequest)
      : null;
    const currentModelCompanyName =
      currentModel && 'companyName' in currentModel.extractedInputs
        ? currentModel.extractedInputs.companyName
        : currentModel?.title ?? null;
    const currentModelTicker =
      currentModel && 'ticker' in currentModel.extractedInputs
        ? currentModel.extractedInputs.ticker ?? null
        : null;
    const executionTrace = createExecutionTrace({
      surface: 'analyst_chat',
      prompt: lastUserMessage,
    });
    const parsedCustomAssumptionPrompt =
      currentModel && !requestModelAdjustment && looksLikeCustomAssumptionPrompt(lastUserMessage)
        ? parseCustomAssumptionPrompt({
            prompt: lastUserMessage,
            companyName: typeof currentModelCompanyName === 'string' ? currentModelCompanyName : null,
            ticker: typeof currentModelTicker === 'string' ? currentModelTicker : null,
            currentAssumptions: buildCurrentAssumptionsFromExtractedInputs(currentModel.extractedInputs),
          })
        : null;
    const syntheticModelAdjustment: AnalystStructuredModelAdjustment | null =
      currentModel && !requestModelAdjustment && parsedCustomAssumptionPrompt?.summary
        ? ({
            changes: buildAnalystCustomAssumptionOverrides(
              currentModel.extractedInputs as Record<string, unknown>,
              Object.fromEntries(
                parsedCustomAssumptionPrompt.summary.changedDrivers.map((driver) => [driver.driver, driver.new]),
              ),
            ),
            customAssumptionSummary: parsedCustomAssumptionPrompt.summary,
          } satisfies AnalystStructuredModelAdjustment)
        : currentModel && !requestModelAdjustment && looksLikeEventLinkedModelFollowUp(lastUserMessage)
          ? ({
              changes: {},
              prompt: undefined,
              eventContext: await buildEventContextFromPrompt(lastUserMessage),
            } satisfies AnalystStructuredModelAdjustment)
          : null;
    const modelAdjustment = requestModelAdjustment ?? syntheticModelAdjustment;
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const latestScenarioCard = extractLatestScenarioCardFromMessages(messages);

    if (currentDcf && dcfAdjustment) {
      const revisedDcf = await reviseAnalystDcfDemoFromAdjustment(dcfAdjustment, currentDcf);
      if (!revisedDcf) {
        return NextResponse.json(
          withAttachmentStatus({ error: 'No valid DCF control adjustments were provided.' }),
          { status: 400 },
        );
      }

      return NextResponse.json(withAttachmentStatus({
        reply: revisedDcf.reply,
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        dcfDemo: revisedDcf.payload,
        sources: [
          `Demo snapshot cache — ${revisedDcf.payload.source}`,
          ...(revisedDcf.payload.asOfDate ? [`Snapshot updated ${revisedDcf.payload.asOfDate}`] : []),
          'Analyst Chat scenario controls',
        ],
        factsCount: 0,
      }));
    }

    if (currentDcf && dcfEventShockPrompt) {
      const requestedTicker = tickerRaw ?? inferTickerFromPrompt(dcfEventShockPrompt);
      const currentTicker = currentDcf.ticker?.trim().toUpperCase();
      if (requestedTicker && currentTicker && requestedTicker !== currentTicker) {
        return NextResponse.json(withAttachmentStatus({
          reply: buildArtifactTickerMismatchReply({
            requestedTicker,
            artifactTicker: currentTicker,
            artifactLabel: `${currentDcf.companyName} (${currentTicker})`,
          }),
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          factsCount: 0,
        }));
      }

      const shockedDcf =
        (await reviseAnalystDcfDemo(dcfEventShockPrompt, currentDcf)) ??
        (await reviseAnalystDcfDemoFromEventShock(dcfEventShockPrompt, currentDcf));
      if (!shockedDcf) {
        return NextResponse.json(
          withAttachmentStatus({ error: 'No supported scenario adjustment was detected for the active DCF.' }),
          { status: 400 },
        );
      }

      return NextResponse.json(withAttachmentStatus({
        reply: shockedDcf.reply,
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        dcfDemo: shockedDcf.payload,
        sources: [
          `Demo snapshot cache — ${shockedDcf.payload.source}`,
          ...(shockedDcf.payload.asOfDate ? [`Snapshot updated ${shockedDcf.payload.asOfDate}`] : []),
          'Deterministic event shock mapping',
        ],
        factsCount: 0,
      }));
    }

    if (
      currentModel &&
      !requestModelAdjustment &&
      looksLikeCustomAssumptionPrompt(lastUserMessage) &&
      parsedCustomAssumptionPrompt &&
      !parsedCustomAssumptionPrompt.summary
    ) {
      addExecutionTraceService(executionTrace, 'custom_assumption_input');
      addExecutionTraceNote(executionTrace, 'Custom assumption prompt detected but no explicit supported driver values were parsed.');
      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply:
          parsedCustomAssumptionPrompt.reply ??
          'Use explicit custom assumptions like “set WACC to 10% and terminal growth to 2.5%”.',
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        generatedModel: currentModel,
        factsCount: 0,
      }, executionTrace)));
    }

    if (currentModel && modelAdjustment) {
      addExecutionTraceService(
        executionTrace,
        'revise_analyst_structured_model_from_overrides',
        modelAdjustment.smartAssumptionSummary ? 'smart_assumption_agent' : null,
        modelAdjustment.customAssumptionSummary ? 'custom_assumption_input' : null,
      );
      let baseModel = currentModel;
      let promptAdjustedModelResult: Awaited<ReturnType<typeof reviseAnalystStructuredModel>> | null = null;
      let eventAdjustment: EventLinkedModelAdjustmentResult | null = null;
      let eventOverrides: Record<string, unknown> = {};
      const smartAssumptionResult: SmartAssumptionResult | null =
        modelAdjustment.smartAssumptionSummary &&
        typeof modelAdjustment.smartAssumptionSummary === 'object' &&
        modelAdjustment.smartAssumptionSummary.sourceType === 'smart_assumption_agent' &&
        'subject' in modelAdjustment.smartAssumptionSummary &&
        'suggestions' in modelAdjustment.smartAssumptionSummary
          ? modelAdjustment.smartAssumptionSummary
          : null;
      const customAssumptionResult: CustomAssumptionResult | null =
        modelAdjustment.customAssumptionSummary &&
        typeof modelAdjustment.customAssumptionSummary === 'object' &&
        modelAdjustment.customAssumptionSummary.sourceType === 'custom_assumption_input'
          ? modelAdjustment.customAssumptionSummary
          : null;
      if (modelAdjustment.eventContext?.rawEventText?.trim()) {
        addExecutionTraceService(executionTrace, 'derive_event_linked_model_adjustment');
        eventAdjustment = await deriveEventLinkedModelAdjustment({
          event: modelAdjustment.eventContext,
          company: {
            companyName:
              'companyName' in currentModel.extractedInputs
                ? currentModel.extractedInputs.companyName
                : currentModel.title,
            ticker:
              'ticker' in currentModel.extractedInputs
                ? currentModel.extractedInputs.ticker ?? null
                : null,
            sector:
              'companyType' in currentModel.extractedInputs &&
              typeof currentModel.extractedInputs.companyType === 'string'
                ? currentModel.extractedInputs.companyType
                : null,
            industry: null,
          },
          currentAssumptions: buildPersistentDriverContext(currentModel.extractedInputs),
          modelType: currentModel.modelType,
        });

        if (eventAdjustment.blockingErrors.length > 0) {
          return NextResponse.json(
            withAttachmentStatus(withExecutionTrace({
              error: eventAdjustment.blockingErrors.join(' '),
              warnings: eventAdjustment.warnings,
            }, executionTrace)),
            { status: 400 },
          );
        }

        const eventReasoning = buildReasoningResponseFromEventAdjustment(eventAdjustment);
        eventOverrides = translateFinancialReasoningToOverrides(currentModel, eventReasoning);
        if (
          !eventAdjustment.hasMaterialChanges ||
          Object.keys(eventOverrides).length === 0
        ) {
          addExecutionTraceNote(executionTrace, 'Event review ran but did not produce material model changes.');
          return NextResponse.json(withAttachmentStatus(withExecutionTrace({
            reply: buildReasoningReply('active model', eventReasoning, false),
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            generatedModel: {
              ...currentModel,
              eventContext: eventAdjustment.event,
              eventAdjustmentSummary: buildEventAdjustmentSummary(eventAdjustment),
              appliedEventDeltas: eventAdjustment.changedDrivers,
            },
            sources: [
              ...currentModel.provenanceSummary.sources,
              'Event-linked model review',
            ],
            factsCount: 0,
          }, executionTrace)));
        }
      }
      if (typeof modelAdjustment.prompt === 'string' && modelAdjustment.prompt.trim().length > 0) {
        addExecutionTraceService(executionTrace, 'revise_analyst_structured_model');
        const promptAdjustedModel = await reviseAnalystStructuredModel(
          modelAdjustment.prompt.trim(),
          baseModel,
          sessionId,
        );
        if (promptAdjustedModel) {
          promptAdjustedModelResult = promptAdjustedModel;
          if (promptAdjustedModel.modelChanged) {
            baseModel = promptAdjustedModel.payload;
          }
        }
      }

      const revisedModel = await reviseAnalystStructuredModelFromOverrides(
        {
          ...eventOverrides,
          ...modelAdjustment.changes,
        },
        baseModel,
        sessionId,
      );
      if (!revisedModel && promptAdjustedModelResult) {
        return NextResponse.json(withAttachmentStatus(withExecutionTrace({
          reply: promptAdjustedModelResult.reply,
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          generatedModel: promptAdjustedModelResult.payload,
          sources: [
            ...promptAdjustedModelResult.payload.provenanceSummary.sources,
            'Analyst Chat model controls',
          ],
          factsCount: 0,
        }, executionTrace)));
      }
      if (!revisedModel) {
        return NextResponse.json(
          withAttachmentStatus(withExecutionTrace({ error: 'No valid structured model control adjustments were provided.' }, executionTrace)),
          { status: 400 },
        );
      }

      const revisedPayload: AnalystGeneratedModelPayload = {
        ...revisedModel.payload,
        eventContext: eventAdjustment?.event ?? revisedModel.payload.eventContext ?? null,
        eventAdjustmentSummary:
          eventAdjustment ? buildEventAdjustmentSummary(eventAdjustment) : revisedModel.payload.eventAdjustmentSummary ?? null,
        appliedEventDeltas: eventAdjustment?.changedDrivers ?? revisedModel.payload.appliedEventDeltas ?? null,
        smartAssumptionSummary:
          toPromptRunSmartAssumptionSummary(modelAdjustment.smartAssumptionSummary) ??
          revisedModel.payload.smartAssumptionSummary ??
          null,
        customAssumptionSummary:
          toPromptRunCustomAssumptionSummary(modelAdjustment.customAssumptionSummary) ??
          revisedModel.payload.customAssumptionSummary ??
          null,
      };

      let persistedRecentRun = revisedPayload.recentRun;
      try {
        const persisted = await savePromptModelRunVersion({
          surface: 'analyst_chat',
          sessionId,
          prompt: modelAdjustment.prompt?.trim() || eventAdjustment?.event.rawEventText || currentModel.prompt,
          modelType: revisedPayload.modelType,
          companyName:
            'companyName' in revisedPayload.extractedInputs
              ? revisedPayload.extractedInputs.companyName
              : null,
          ticker:
            'ticker' in revisedPayload.extractedInputs
              ? revisedPayload.extractedInputs.ticker ?? null
              : null,
          status: 'generated',
          assumptions: revisedPayload.extractedInputs as Record<string, unknown>,
          defaultsUsed: revisedPayload.defaultsUsed,
          extractedInputs: revisedPayload.extractedInputs as Record<string, unknown>,
          provenance: revisedPayload.provenanceSummary,
          exportSeed: buildAnalystGeneratedModelExportSeed(revisedPayload),
          eventContext: revisedPayload.eventContext,
          eventAdjustmentSummary: revisedPayload.eventAdjustmentSummary,
          smartAssumptionSummary: revisedPayload.smartAssumptionSummary,
          customAssumptionSummary: revisedPayload.customAssumptionSummary,
        });
        persistedRecentRun = buildAnalystGeneratedModelRecentRun({
          runId: persisted.runId,
          versionNumber: persisted.version.versionNumber,
          createdAt: persisted.version.createdAt,
          status: persisted.version.status,
        });
      } catch (error) {
        console.error('[analyst-chat] unable to persist direct model adjustment', error);
      }

      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply:
          eventAdjustment
            ? buildReasoningReply(
                'active model',
                buildReasoningResponseFromEventAdjustment(eventAdjustment),
                true,
              )
            : smartAssumptionResult
              ? buildSmartAssumptionReply(smartAssumptionResult)
              : customAssumptionResult
                ? buildCustomAssumptionReply(customAssumptionResult)
              : revisedModel.reply,
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        generatedModel: {
          ...revisedPayload,
          recentRun: persistedRecentRun,
        },
        sources: [
          ...revisedPayload.provenanceSummary.sources,
          eventAdjustment
            ? 'Event-linked model adjustment'
            : revisedPayload.smartAssumptionSummary
              ? 'Smart assumption agent'
              : revisedPayload.customAssumptionSummary
                ? 'Custom assumption input'
              : 'Analyst Chat model controls',
        ],
        factsCount: 0,
      }, executionTrace)));
    }

    const effectiveUserMessage = attachmentContext
      ? `${lastUserMessage}\n\n${attachmentContextBlock(attachmentContext)}`
      : lastUserMessage;
    const attachmentLabel = attachmentContext
      ? `Uploaded context: ${attachmentContext.name} (${attachmentContext.kind.replace(/_/g, ' ')})`
      : null;
    const tickerFromAttachment = attachmentContext?.signals?.ticker?.toUpperCase();
    const extractedCompanyQuery = extractCompanyQuery({ prompt: effectiveUserMessage });
    const tickerFromMessage = extractedCompanyQuery.ticker ?? inferTickerFromPrompt(effectiveUserMessage);
    const tickerFromCurrentArtifact = artifactTickerFromContext({ currentModel, currentDcf, currentStock });
    const artifactLabel = artifactLabelFromContext({ currentModel, currentDcf, currentStock });
    const explicitRequestedTicker = tickerRaw ?? tickerFromMessage ?? tickerFromAttachment;
    const artifactTickerMismatch =
      Boolean(explicitRequestedTicker && tickerFromCurrentArtifact && explicitRequestedTicker !== tickerFromCurrentArtifact);
    const currentArtifactBlock = artifactTickerMismatch
      ? null
      : currentArtifactContextBlock({ currentModel, currentDcf, currentStock });
    const resolvedTicker = explicitRequestedTicker ?? tickerFromCurrentArtifact;
    fallbackTicker = resolvedTicker;
    fallbackUserMessage = lastUserMessage;
    const forceEarningsFirstRetrieval = routeAnalystQuery(
      attachmentContext ? `${lastUserMessage}\nAttachment type: ${attachmentContext.kind}` : lastUserMessage,
      resolvedTicker,
    );
    const mustRefreshCompanyContext =
      forceEarningsFirstRetrieval.prefersEarningsContext || forceEarningsFirstRetrieval.requiresQuarterReportContext;
    const preferCurrentArtifact =
      Boolean(currentModel || currentDcf || currentStock) &&
      !artifactTickerMismatch &&
      !mustRefreshCompanyContext &&
      isCurrentArtifactAnalysisPrompt(lastUserMessage) &&
      !isVisualizationPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const currentArtifactInstruction = preferCurrentArtifact
      ? currentArtifactFollowUpInstruction({ currentModel, currentDcf, currentStock })
      : null;

    /* ── Step 1: Route the question ── */
    const baseRoute: AnalystRoute = forceEarningsFirstRetrieval;
    const route: AnalystRoute = pendingModelRequest
      ? {
          ...baseRoute,
          intent: 'financial_model',
          requiresFinancials: true,
          requiresNews: false,
          requiresLiveData: false,
        }
      : overrideRouteFromAttachment(baseRoute, lastUserMessage, attachmentContext);
    executionTrace.routeIntent = route.intent;
    addExecutionTraceService(executionTrace, 'route_analyst_query');
    const shouldRunTeslaScenarioCard =
      !pendingModelRequest &&
      looksLikeTeslaMacroScenarioPrompt(lastUserMessage, explicitRequestedTicker ?? tickerFromCurrentArtifact);
    const shouldRunTeslaDemoInterpretation =
      !pendingModelRequest &&
      looksLikeTeslaDemoInterpretationPrompt(lastUserMessage) &&
      hasTeslaDemoHistory(messages);
    const shouldApplyLatestScenarioToCurrentDcf =
      Boolean(
        currentDcf &&
        latestScenarioCard &&
        currentDcf.ticker?.trim().toUpperCase() === 'TSLA' &&
        !artifactTickerMismatch &&
        looksLikeScenarioDcfWorkflowPrompt(lastUserMessage),
      );
    const shouldApplyLatestScenarioToCurrentModel =
      Boolean(
        currentModel &&
        currentModel.modelType === 'DCF' &&
        latestScenarioCard &&
        currentModelTicker?.trim().toUpperCase() === 'TSLA' &&
        !artifactTickerMismatch &&
        looksLikeScenarioDcfWorkflowPrompt(lastUserMessage),
      );
    const shouldGenerateScenarioAdjustedTeslaDcf =
      Boolean(
        !currentDcf &&
        !currentModel &&
        latestScenarioCard &&
        latestScenarioCard.company.trim().toLowerCase() === 'tesla' &&
        looksLikeScenarioDcfWorkflowPrompt(lastUserMessage) &&
        (!resolvedTicker || resolvedTicker === 'TSLA'),
      );
    const prioritizeShortTermPriceForecast = shouldPrioritizeShortTermPriceForecast(lastUserMessage);

    if (shouldRunTeslaScenarioCard) {
      addExecutionTraceService(executionTrace, 'run_ai_smart_dcf_scenario');
      addExecutionTraceNote(
        executionTrace,
        'Deterministic Tesla macro scenario branch used for Analyst Chat.',
      );
      try {
        const scenarioReport = await fetchDeterministicScenarioReport(req.nextUrl.origin);
        return NextResponse.json(
          withAttachmentStatus(
            withExecutionTrace(
              {
                reply: '',
                scenarioCard: buildAnalystScenarioCardPayload(scenarioReport),
                fallback: false,
                mode: 'scenario',
                route: 'company_question',
                sources: ['Provided base case dataset', 'Provided macro assumptions'],
                factsCount: 0,
                attachmentUsed: attachmentLabel,
              },
              executionTrace,
            ),
          ),
        );
      } catch (error) {
        addExecutionTraceNote(
          executionTrace,
          error instanceof Error ? error.message : 'Scenario API call failed.',
        );
        return NextResponse.json(
          withAttachmentStatus(
            withExecutionTrace(
              {
                reply: 'Unable to apply the macro scenario right now.',
                fallback: false,
                mode: 'live',
                route: 'company_question',
                factsCount: 0,
                attachmentUsed: attachmentLabel,
              },
              executionTrace,
            ),
          ),
        );
      }
    }

    if (shouldRunTeslaDemoInterpretation) {
      addExecutionTraceService(executionTrace, 'run_tesla_demo_interpretation');
      addExecutionTraceNote(
        executionTrace,
        'Deterministic Tesla guided-demo interpretation branch used after earnings and scenario steps.',
      );
      return NextResponse.json(
        withAttachmentStatus(
          withExecutionTrace(
            {
              reply: buildTeslaDemoInterpretationReply(),
              fallback: false,
              mode: 'live',
              route: 'company_question',
              sources: ['Deterministic Tesla guided demo interpretation'],
              factsCount: 0,
              attachmentUsed: attachmentLabel,
            },
            executionTrace,
          ),
        ),
      );
    }

    if (shouldApplyLatestScenarioToCurrentDcf && currentDcf && latestScenarioCard) {
      addExecutionTraceService(executionTrace, 'apply_ai_smart_dcf_to_active_dcf');
      addExecutionTraceNote(
        executionTrace,
        'Applied the latest Tesla scenario card deltas to the active DCF workflow.',
      );
      const revisedDcf = await reviseAnalystDcfDemoFromAdjustment(
        buildScenarioDcfAdjustmentFromPayload(latestScenarioCard, currentDcf),
        currentDcf,
      );
      if (!revisedDcf) {
        return NextResponse.json(
          withAttachmentStatus({ error: 'Unable to apply the scenario to the active DCF.' }),
          { status: 400 },
        );
      }

      return NextResponse.json(
        withAttachmentStatus(
          withExecutionTrace(
            {
              reply: `Applied the Tesla rates-down scenario to the active DCF workflow. ${revisedDcf.reply}`,
              fallback: false,
              mode: 'live',
              route: 'financial_model',
              dcfDemo: revisedDcf.payload,
              sources: [
                buildFinancialModelSourceLabel(revisedDcf.payload.source),
                ...(revisedDcf.payload.asOfDate ? [`Snapshot updated ${revisedDcf.payload.asOfDate}`] : []),
                'Deterministic Tesla macro scenario overlay',
              ],
              factsCount: 0,
              attachmentUsed: attachmentLabel,
            },
            executionTrace,
          ),
        ),
      );
    }
    if (shouldApplyLatestScenarioToCurrentModel && currentModel && latestScenarioCard) {
      addExecutionTraceService(executionTrace, 'revise_analyst_structured_model_from_overrides');
      addExecutionTraceNote(
        executionTrace,
        'Applied the latest Tesla scenario card deltas to the active DCF model workflow.',
      );
      const revisedModel = await reviseAnalystStructuredModelFromOverrides(
        buildScenarioStructuredModelOverridesFromPayload(latestScenarioCard, currentModel),
        currentModel,
        sessionId,
      );
      if (!revisedModel) {
        return NextResponse.json(
          withAttachmentStatus({ error: 'Unable to apply the scenario to the active DCF model.' }),
          { status: 400 },
        );
      }

      let persistedRecentRun = revisedModel.payload.recentRun;
      try {
        const persisted = await savePromptModelRunVersion({
          surface: 'analyst_chat',
          sessionId,
          prompt: lastUserMessage,
          modelType: revisedModel.payload.modelType,
          companyName:
            'companyName' in revisedModel.payload.extractedInputs
              ? revisedModel.payload.extractedInputs.companyName
              : null,
          ticker:
            'ticker' in revisedModel.payload.extractedInputs
              ? revisedModel.payload.extractedInputs.ticker ?? null
              : null,
          status: 'generated',
          assumptions: revisedModel.payload.extractedInputs as Record<string, unknown>,
          defaultsUsed: revisedModel.payload.defaultsUsed,
          extractedInputs: revisedModel.payload.extractedInputs as Record<string, unknown>,
          provenance: revisedModel.payload.provenanceSummary,
          exportSeed: buildAnalystGeneratedModelExportSeed(revisedModel.payload),
        });
        persistedRecentRun = buildAnalystGeneratedModelRecentRun({
          runId: persisted.runId,
          versionNumber: persisted.version.versionNumber,
          createdAt: persisted.version.createdAt,
          status: persisted.version.status,
        });
      } catch (error) {
        console.error('[analyst-chat] unable to persist scenario-adjusted model run', error);
      }

      return NextResponse.json(
        withAttachmentStatus(
          withExecutionTrace(
            {
              reply: 'Applied the Tesla rates-down scenario to the active DCF model workflow.',
              fallback: false,
              mode: 'live',
              route: 'financial_model',
              generatedModel: {
                ...revisedModel.payload,
                recentRun: persistedRecentRun,
              },
              sources: [
                ...revisedModel.payload.provenanceSummary.sources,
                'Deterministic Tesla macro scenario overlay',
              ],
              factsCount: 0,
              attachmentUsed: attachmentLabel,
            },
            executionTrace,
          ),
        ),
      );
    }
    const shouldRunEarningsAgent =
      featureFlags.ENABLE_EARNINGS_PACKAGE_CACHE &&
      Boolean(resolvedTicker) &&
      (route.intent === 'company_question' || isTeslaTicker(resolvedTicker)) &&
      (
        route.prefersEarningsContext ||
        route.requiresQuarterReportContext ||
        (isTeslaTicker(resolvedTicker) && looksLikeTeslaDemoEntryPrompt(lastUserMessage, resolvedTicker))
      );
    const shouldReviseCurrentModel =
      currentModel &&
      !artifactTickerMismatch &&
      isModelAdjustmentPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldReviseCurrentDcf =
      currentDcf &&
      !artifactTickerMismatch &&
      isModelAdjustmentPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldApplyCurrentDcfEventShock =
      currentDcf &&
      !artifactTickerMismatch &&
      isDcfEventShockPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldVisualizeCurrentModel =
      currentModel &&
      !artifactTickerMismatch &&
      isVisualizationPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldVisualizeCurrentDcf =
      currentDcf &&
      !artifactTickerMismatch &&
      isVisualizationPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldVisualizeCurrentStock =
      currentStock &&
      !artifactTickerMismatch &&
      isVisualizationPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);

    if (artifactTickerMismatch && explicitRequestedTicker && tickerFromCurrentArtifact) {
      return NextResponse.json(withAttachmentStatus({
        reply: buildArtifactTickerMismatchReply({
          requestedTicker: explicitRequestedTicker,
          artifactTicker: tickerFromCurrentArtifact,
          artifactLabel,
        }),
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        factsCount: 0,
        attachmentUsed: attachmentLabel,
      }));
    }

    if (
      currentDcf &&
      !artifactTickerMismatch &&
      looksLikeDcfValuationVerdictPrompt(lastUserMessage) &&
      !prioritizeShortTermPriceForecast
    ) {
      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply: buildDcfValuationVerdictReply(currentDcf),
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        sources: [
          `Current DCF artifact - ${currentDcf.source}`,
          ...(currentDcf.asOfDate ? [`Snapshot updated ${currentDcf.asOfDate}`] : []),
        ],
        factsCount: 0,
        attachmentUsed: attachmentLabel,
      }, executionTrace)));
    }

    if (
      resolvedTicker &&
      shouldUseForecastLayerForLongHorizon(lastUserMessage)
    ) {
      const forecastReply = await buildLongHorizonForecastLayerReply({
        origin: req.nextUrl.origin,
        ticker: resolvedTicker,
        years: parseForecastHorizonYears(lastUserMessage, 4),
      });
      if (forecastReply) {
        addExecutionTraceService(executionTrace, 'forecast_layer_long_horizon');
        return NextResponse.json(withAttachmentStatus(withExecutionTrace({
          reply: forecastReply.reply,
          fallback: false,
          mode: 'live',
          route: 'company_question',
          sources: forecastReply.sources,
          factsCount: 0,
          forecastModel: forecastReply.forecastModel,
          stockLookup: responseStockLookup ?? stockLookupPayload,
          earningsRetrieval: earningsAgentResult,
          earningsPackageMeta: earningsRuntimeMeta,
          attachmentUsed: attachmentLabel,
        }, executionTrace)));
      }
    }

    if (currentDcf && !artifactTickerMismatch && isLongHorizonForecastPrompt(lastUserMessage)) {
      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply: buildDcfLongHorizonForecastReply(
          currentDcf,
          parseForecastHorizonYears(lastUserMessage, currentDcf.years),
        ),
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        sources: [
          `Current DCF artifact - ${currentDcf.source}`,
          ...(currentDcf.asOfDate ? [`Snapshot updated ${currentDcf.asOfDate}`] : []),
        ],
        factsCount: 0,
        attachmentUsed: attachmentLabel,
      }, executionTrace)));
    }

    // Run stock lookup and earnings retrieval in parallel — neither depends on the other.
    const [parallelStockLookup, parallelEarningsEnvelope] = await Promise.all([
      route.intent === 'company_question' && !(preferCurrentArtifact && currentStock)
        ? lookupStock(
            resolvedTicker
              ? { prompt: lastUserMessage, ticker: resolvedTicker }
              : { prompt: lastUserMessage }
          ).catch(() => null)
        : Promise.resolve(preferCurrentArtifact && currentStock ? currentStock : null),
      shouldRunEarningsAgent && resolvedTicker
        ? (addExecutionTraceService(executionTrace, 'run_earnings_retrieval_agent'),
           runEarningsRetrievalAgent({ ticker: resolvedTicker, prompt: lastUserMessage }).catch((error) => {
             console.warn('[analyst-chat] earnings retrieval agent failed; falling back to base retrieval', {
               ticker: resolvedTicker,
               message: error instanceof Error ? redactSecrets(error.message) : 'unknown error',
             });
             return null;
           }))
        : Promise.resolve(null),
    ]);

    if (route.intent === 'company_question') {
      stockLookupPayload = parallelStockLookup ?? stockLookupPayload;
    }
    if (shouldRunEarningsAgent && resolvedTicker && parallelEarningsEnvelope) {
      earningsAgentResult = parallelEarningsEnvelope.result ?? null;
      earningsRuntimeMeta = parallelEarningsEnvelope.runtime ?? null;
      if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
        console.info('[analyst-chat] earnings package context resolved', {
          ticker: resolvedTicker,
          packageKey: earningsRuntimeMeta?.packageKey ?? null,
          packageId: earningsRuntimeMeta?.packageId ?? null,
          cacheStatus: earningsRuntimeMeta?.cacheStatus ?? 'miss',
        });
      }
    }

    const shouldUseDeterministicEarningsSummary =
      Boolean(resolvedTicker) &&
      (route.intent === 'company_question' || isTeslaTicker(resolvedTicker)) &&
      (
        isGenericEarningsSummaryPrompt(lastUserMessage) ||
        (isTeslaTicker(resolvedTicker) && looksLikeTeslaDemoEntryPrompt(lastUserMessage, resolvedTicker))
      ) &&
      earningsAgentResult !== null;

    if (shouldUseDeterministicEarningsSummary && resolvedTicker && earningsAgentResult) {
      const catalystContext = await getCompanyCatalystContext(resolvedTicker, 'dcf').catch(() => null);
      const nextEarningsItem =
        catalystContext?.calendarItems.find((item) => item.kind === 'earnings' && item.date) ?? null;
      addExecutionTraceNote(
        executionTrace,
        isTeslaTicker(resolvedTicker) && looksLikeTeslaDemoEntryPrompt(lastUserMessage, resolvedTicker)
          ? 'Deterministic earnings summary branch used for the Tesla guided demo entry step.'
          : 'Deterministic earnings summary branch used for a generic company earnings prompt.',
      );
      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply: buildDeterministicEarningsSummaryReply({
          result: earningsAgentResult,
          nextEarnings: nextEarningsItem
            ? {
                displayDate: nextEarningsItem.displayDate,
                source: nextEarningsItem.source,
                note: nextEarningsItem.note,
              }
            : null,
        }),
        earningsSummary: buildDeterministicEarningsSummaryCard({
          result: earningsAgentResult,
          nextEarnings: nextEarningsItem
            ? {
                displayDate: nextEarningsItem.displayDate,
                source: nextEarningsItem.source,
                note: nextEarningsItem.note,
              }
            : null,
        }),
        fallback: false,
        mode: 'live',
        route: route.intent,
        sources: [
          ...(earningsAgentResult.quarter.reportUrl
            ? [`Quarter report — ${earningsAgentResult.quarter.reportUrl}`]
            : []),
          ...earningsAgentResult.commentary.sourceNotes.slice(0, 3),
          ...(nextEarningsItem
            ? [
                `Next earnings date — ${nextEarningsItem.source}${nextEarningsItem.displayDate ? ` (${nextEarningsItem.displayDate})` : ''}`,
              ]
            : []),
        ],
        factsCount: 0,
        retrievalWarnings: (() => {
          const filtered = earningsAgentResult.dataQuality.gaps.filter(
            (g) => !g.toLowerCase().includes('report link'),
          );
          return filtered.length > 0 ? filtered : undefined;
        })(),
        stockLookup: stockLookupPayload,
        earningsRetrieval: earningsAgentResult,
        earningsPackageMeta: earningsRuntimeMeta,
        attachmentUsed: attachmentLabel,
      }, executionTrace)));
    }

    const macroEventsContext = (shouldInjectMacroEventsContext(route, effectiveUserMessage, attachmentContext) || prioritizeShortTermPriceForecast)
      ? await Promise.race([
          getMarketEvents({ origin: req.nextUrl.origin, view: 'active', limit: 5, provider: 'live' }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
        ]).catch(() => null)
      : null;
    const macroEventsBlock =
      macroEventsContext && macroEventsContext.events.length > 0
        ? `ACTIVE MARKET EVENT CONTEXT (use this to ground macro answers if relevant):\n\n${serializeMarketEventsContext(
            macroEventsContext.events,
          )}`
        : null;

    // TimesFM price + revenue forecast — injected for company questions and
    // explicit forecast/outlook prompts. Fetched in parallel with 8s timeout.
    let timesFMBlock: string | null = null;
    let forecastLeadSentence: string | null = null;
    let deterministicForecastReply: string | null = null;
    let priceForecastModel: AnalystForecastModelPayload | null = null;
    const shouldInjectTimesFmForecast =
      Boolean(resolvedTicker) &&
      !isLongHorizonForecastPrompt(lastUserMessage) &&
      (route.intent === 'company_question' || isCompanyForecastPrompt(lastUserMessage));
    if (shouldInjectTimesFmForecast && resolvedTicker) {
      try {
        const origin = req.nextUrl.origin;
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
        const horizonDays = parseForecastHorizonDays(lastUserMessage);
        const horizonLabel = formatForecastHorizon(horizonDays);
        const revenueQuarters = Math.min(8, Math.max(1, Math.ceil(horizonDays / 90)));

        const resolvedCompanyName: string =
          (stockLookupPayload as { companyName?: string | null } | null)?.companyName ||
          resolvedTicker;

        // Phase 1: Fetch and parse TimesFM price so the LLM can anchor its signal to it.
        const pricePd = await Promise.race([
          fetch(`${origin}/api/timesfm?type=price&ticker=${resolvedTicker}&horizon=${horizonDays}`, { cache: 'no-store' })
            .then((r) => r.ok ? (r.json() as Promise<PriceForecastPayload>) : null)
            .catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
        const timesFMBaseline = (() => {
          if (!pricePd?.model_available || !pricePd.forecast?.values || !pricePd.historical?.prices) return null;
          const cur = pricePd.historical.prices.at(-1);
          const end = pricePd.forecast.values.at(-1);
          if (cur == null || end == null) return null;
          return { currentPrice: cur, endPrice: end, returnPct: (end - cur) / cur * 100 };
        })();

        // Phase 2: Revenue, catalysts, news, and LLM in parallel. LLM now knows the TimesFM baseline.
        const [revRes, catalystContext, companyNews, llmResult] = await Promise.all([
          Promise.race([
            fetch(`${origin}/api/timesfm?type=revenue&ticker=${resolvedTicker}&quarters=${revenueQuarters}`, { cache: 'no-store' }),
            timeout,
          ]),
          Promise.race([
            loadDcfCatalystContext(resolvedTicker),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]),
          Promise.race([
            loadForecastCompanyNews(origin, resolvedTicker),
            new Promise<CompanyInfoNewsItem[]>((resolve) => setTimeout(() => resolve([]), 3000)),
          ]),
          discoverEventsWithLlm({
            ticker: resolvedTicker,
            companyName: resolvedCompanyName,
            horizonDays,
            currentPrice: timesFMBaseline?.currentPrice,
            timesFMBaseline,
          }),
        ]);
        const llmDiscoveredItems = llmResult.items;
        console.info('[analyst-chat] llmDiscoveredItems for', resolvedTicker, ':', llmDiscoveredItems.length, '| signal:', llmResult.tradingSignal?.signal ?? 'none');

        const parts: string[] = [];
        let forecastReplyInput: DeterministicForecastReplyInput | null = null;
        const marketEventAdjustment =
          macroEventsContext?.events && macroEventsContext.events.length > 0
            ? deriveMarketEventAdjustment(macroEventsContext.events, resolvedTicker)
            : null;
        const rawForecastNewsWatch = buildForecastNewsWatchItems({
          ticker: resolvedTicker,
          horizonDays,
          events: macroEventsContext?.events,
          catalystContext,
          companyNews,
          llmDiscoveredItems,
        });
        const forecastNewsWatch = await enrichNewsWatchWithEventForecasts({
          ticker: resolvedTicker,
          horizonLabel,
          items: rawForecastNewsWatch,
        });
        const newsCatalystAdjustment = buildNewsCatalystAdjustment(forecastNewsWatch);
        const combinedForecastAdjustment = combineForecastAdjustments({
          marketEventAdjustment,
          newsCatalystAdjustment,
        });

        // Price forecast block
        if (pricePd?.model_available && pricePd.forecast && pricePd.historical) {
          const pd = pricePd;
          if (pd.model_available && pd.forecast && pd.historical) {
            const forecastSourceLabel =
              pd.model_source === 'provider_trend_fallback'
                ? 'PROVIDER-BACKED TREND (TIMESFM OFFLINE)'
                : 'TIMESFM';
            const forecastMethodology =
              pd.methodology ??
              (pd.model_source === 'provider_trend_fallback'
                ? 'TimesFM service is not configured or unavailable; using recent end-of-day price history as a fallback.'
                : 'Google foundation model, time-series extrapolation from historical price patterns; not event-driven.');
            const lastActual = pd.historical.prices.at(-1);
            const endForecast = pd.forecast.values.at(-1);
            const endLower = pd.forecast.lower.at(-1);
            const endUpper = pd.forecast.upper.at(-1);
            if (lastActual != null && endForecast != null) {
              const pctChangeValue = (endForecast - lastActual) / lastActual * 100;
              const pctChange = pctChangeValue.toFixed(1);
              const direction = endForecast > lastActual ? 'up' : endForecast < lastActual ? 'down' : 'flat';
              const bandStr = (endLower != null && endUpper != null)
                ? ` (90% confidence band: $${endLower.toFixed(2)}–$${endUpper.toFixed(2)})`
                : '';
              const bandSentence = (endLower != null && endUpper != null)
                ? ` The 90% model band is $${endLower.toFixed(2)} to $${endUpper.toFixed(2)}.`
                : '';
              forecastLeadSentence =
                `For ${resolvedTicker}, the ${horizonLabel} forecast is $${lastActual.toFixed(2)} to $${endForecast.toFixed(2)}, a ${pctChangeValue >= 0 ? '+' : ''}${pctChange}% ${direction === 'flat' ? 'move' : `move ${direction}`}.${bandSentence}`;
              const eventSynthesis = combinedForecastAdjustment
                ? buildEventAdjustedForecast(pd, combinedForecastAdjustment, 'market_events')
                : null;
              const displayedEndForecast = eventSynthesis?.combined.end_price ?? endForecast;
              const displayedPctChangeValue = eventSynthesis?.combined.return_pct ?? pctChangeValue;
              const displayedDirection =
                eventSynthesis?.combined.direction ?? direction;
              forecastReplyInput = {
                ticker: resolvedTicker,
                horizonLabel,
                sourceLabel: forecastSourceLabel,
                methodology: forecastMethodology,
                startPrice: lastActual,
                endForecast: displayedEndForecast,
                returnPct: displayedPctChangeValue,
                direction: displayedDirection,
                lower: endLower ?? null,
                upper: endUpper ?? null,
                eventSynthesis,
                revenueForecast: null,
              };
              const basePayload = buildPriceForecastModelPayload({
                ticker: resolvedTicker,
                horizonDays,
                horizonLabel,
                payload: pd,
                adjustedForecast: eventSynthesis,
                confidence: pd.model_source === 'provider_trend_fallback' ? 0.45 : 0.62,
                attributionExplanation: eventSynthesis
                  ? `Combined prediction: TimesFM baseline adjusted for news/events. ${eventSynthesis.event_adjustment.label ?? 'Current event overlay'} changes the path by ${eventSynthesis.event_adjustment.price_proxy_pct >= 0 ? '+' : ''}${eventSynthesis.event_adjustment.price_proxy_pct.toFixed(1)}%.`
                  : 'TimesFM trend path from recent stock history. News and catalysts are shown as watch items, but no directional overlay was strong enough to change the path.',
                newsWatch: forecastNewsWatch,
              });
              if (basePayload) {
                const forecastConfidence = pd.model_source === 'provider_trend_fallback' ? 0.45 : 0.62;
                // Prefer LLM signal — it is now anchored to the TimesFM baseline. Fall back to
                // the math-derived signal only when the LLM returned nothing.
                const tradingSignal = llmResult.tradingSignal
                  ?? deriveTradingSignalFromForecast(displayedPctChangeValue, forecastConfidence, horizonLabel);
                priceForecastModel = {
                  ...basePayload,
                  tradingSignal,
                  riskProfile: llmResult.riskProfile ?? null,
                  combinedEventImpactPct: llmResult.combinedEventImpactPct ?? null,
                };
              }
              const eventSynthesisBlock = eventSynthesis
                ? `\nEvent overlay: ${eventSynthesis.event_adjustment.label ?? 'active market events'} implies a ${eventSynthesis.event_adjustment.price_proxy_pct >= 0 ? '+' : ''}${eventSynthesis.event_adjustment.price_proxy_pct.toFixed(1)}% ${horizonLabel} price proxy after confidence/horizon weighting.\n` +
                  `Combined outlook: $${eventSynthesis.baseline.start_price.toFixed(2)} → $${eventSynthesis.combined.end_price.toFixed(2)} (${eventSynthesis.combined.direction}, ${eventSynthesis.combined.return_pct >= 0 ? '+' : ''}${eventSynthesis.combined.return_pct.toFixed(1)}%).\n` +
                  `Caveat: ${eventSynthesis.caveat}`
                : '';
              parts.push(
                `${forecastSourceLabel} ${horizonLabel.toUpperCase()} PRICE FORECAST (${forecastMethodology}):\n` +
                `Current price: $${lastActual.toFixed(2)} → ${horizonLabel} ${eventSynthesis ? 'combined forecast' : 'forecast'}: $${displayedEndForecast.toFixed(2)} (${displayedDirection}, ${displayedPctChangeValue >= 0 ? '+' : ''}${displayedPctChangeValue.toFixed(1)}%)${bandStr}\n` +
                `Note: the displayed forecast uses TimesFM as the baseline and applies a news/event overlay when the current catalyst set has directional signal.` +
                eventSynthesisBlock
              );
            }
          }
        }

        // Revenue forecast block
        if (revRes && revRes instanceof Response && revRes.ok) {
          const rd = await revRes.json() as {
            model_available?: boolean;
            implied_growth_rate?: number | null;
            forecast?: { labels: string[]; values: number[] } | null;
            model_source?: string;
            methodology?: string;
          };
          const forecastValues = rd.forecast?.values ?? [];
          const forecastLabels = rd.forecast?.labels ?? [];
          const impliedGrowthRate =
            typeof rd.implied_growth_rate === 'number' && Number.isFinite(rd.implied_growth_rate)
              ? rd.implied_growth_rate
              : null;
          const hasNtmRevenueContext =
            revenueQuarters >= 4 &&
            forecastValues.length >= 4 &&
            forecastLabels.length >= 4 &&
            impliedGrowthRate != null;
          if (rd.model_available && rd.forecast && hasNtmRevenueContext) {
            const growth = (impliedGrowthRate * 100).toFixed(1);
            const fwdRevenue = forecastValues
              .slice(0, revenueQuarters)
              .map((v, i) => `${forecastLabels[i]}: $${Math.round(v)}M`)
              .join(', ');
            if (forecastReplyInput) {
              forecastReplyInput.revenueForecast = {
                quarters: revenueQuarters,
                impliedGrowthPct: Number(growth),
                quarterlyProjections: fwdRevenue,
                sourceLabel: rd.model_source === 'historical_financials_fallback' ? 'Provider-backed' : 'TimesFM',
              };
            }
            parts.push(
              `${rd.model_source === 'historical_financials_fallback' ? 'PROVIDER-BACKED' : 'TIMESFM'} REVENUE FORECAST (${revenueQuarters} quarter${revenueQuarters === 1 ? '' : 's'}):\nImplied NTM growth: ${Number(growth) >= 0 ? '+' : ''}${growth}%\nQuarterly projections: ${fwdRevenue}${rd.methodology ? `\nMethodology: ${rd.methodology}` : ''}`
            );
          }
        }

        if (
          forecastReplyInput &&
          isCompanyForecastPrompt(lastUserMessage) &&
          (!isValuationOrTradeAnalysisPrompt(lastUserMessage) || prioritizeShortTermPriceForecast)
        ) {
          deterministicForecastReply = buildDeterministicForecastReply(forecastReplyInput);
        }

        if (parts.length > 0) {
          parts.push(
            `SYNTHESIS GUIDANCE: When asked how a stock will move or what the price outlook is, ` +
            `lead with the supplied ${horizonLabel} forecast baseline, then layer in any event or news signals you know about ` +
            `(earnings, macro events, rate decisions, geopolitical risk) as adjustments on top of that baseline. ` +
            (forecastLeadSentence ? `The first sentence must be exactly: "${forecastLeadSentence}" ` : '') +
            `If a combined outlook is provided, use that as the primary net view. ` +
            `Do not say no internal forecast model is loaded when this forecast block is present. ` +
            `Do not present baseline and event signals as unrelated bullets; synthesize baseline + overlay into one conclusion.`
          );
          timesFMBlock = parts.join('\n\n');
        }
      } catch {
        // Non-fatal — forecast is supplemental context only
      }
    }

    if (deterministicForecastReply) {
      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply: deterministicForecastReply,
        fallback: false,
        mode: 'live',
        route: route.intent,
        sources: [
          'CapitalBase forecast engine',
          ...(macroEventsContext && macroEventsContext.events.length > 0
            ? ['CapitalBase active market event context']
            : []),
        ],
        factsCount: 0,
        stockLookup: responseStockLookup ?? stockLookupPayload,
        earningsRetrieval: earningsAgentResult,
        earningsPackageMeta: earningsRuntimeMeta,
        forecastModel: priceForecastModel ?? undefined,
        attachmentUsed: attachmentLabel,
      }, executionTrace)));
    }

    if (isVisualizationPrompt(lastUserMessage)) {
      const comparisonVisualization = await buildComparisonVisualizationFromPrompt(lastUserMessage);
      if (comparisonVisualization) {
        addExecutionTraceService(executionTrace, 'build_visualization');
        return NextResponse.json(withAttachmentStatus(withExecutionTrace({
          reply: `Here is a standalone comparison chart for ${comparisonVisualization.visualization.contextLabel}. ${comparisonVisualization.explanation}`,
          fallback: false,
          mode: 'live',
          route: route.intent,
          visualization: comparisonVisualization.visualization,
          sources: comparisonVisualization.visualization.notes,
          factsCount: 0,
          attachmentUsed: attachmentLabel,
        }, executionTrace)));
      }

      const singleCompanyRevenueGrowthVisualization = await buildSingleCompanyRevenueGrowthVisualization({
        prompt: lastUserMessage,
        ticker: resolvedTicker,
      });
      if (singleCompanyRevenueGrowthVisualization) {
        addExecutionTraceService(executionTrace, 'build_visualization');
        return NextResponse.json(withAttachmentStatus(withExecutionTrace({
          reply: `Here is a standalone revenue growth chart for ${singleCompanyRevenueGrowthVisualization.visualization.contextLabel}. ${singleCompanyRevenueGrowthVisualization.explanation}`,
          fallback: false,
          mode: 'live',
          route: route.intent,
          visualization: singleCompanyRevenueGrowthVisualization.visualization,
          sources: singleCompanyRevenueGrowthVisualization.sources,
          factsCount: 0,
          attachmentUsed: attachmentLabel,
        }, executionTrace)));
      }

      if (!currentModel && !currentDcf && !currentStock && isRevenueForecastVisualizationPrompt(lastUserMessage) && resolvedTicker) {
        addExecutionTraceService(executionTrace, 'generate_analyst_dcf_demo', 'build_visualization');
        const demo = await generateAnalystDcfDemo({
          prompt: effectiveUserMessage,
          explicitTicker: resolvedTicker,
          attachmentStatementSnapshot: getAttachmentSeedSnapshot(attachmentContext),
        });
        const visualization = buildRevenueForecastVisualizationFromDcf(demo.payload);
        return NextResponse.json(withAttachmentStatus(withExecutionTrace({
          reply: `Here is a standalone ${demo.payload.years}-year revenue forecast chart for ${demo.payload.companyName} (${demo.payload.ticker}). ${revenueDriverSummary(demo.payload.ticker)}`,
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          visualization,
          sources: [
            `Demo snapshot cache — ${demo.payload.source}`,
            ...(demo.payload.asOfDate ? [`Snapshot updated ${demo.payload.asOfDate}`] : []),
            'Deterministic forecast path used for standalone visualization',
          ],
          factsCount: 0,
          attachmentUsed: attachmentLabel,
        }, executionTrace)));
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[analyst-chat] route:', {
        intent: route.intent,
        tickers: route.tickers,
        requiresNews: route.requiresNews,
        requiresFinancials: route.requiresFinancials,
        requiresLiveData: route.requiresLiveData,
      });
    }

    if (route.intent === 'financial_model' || shouldReviseCurrentModel || shouldVisualizeCurrentModel || shouldVisualizeCurrentDcf) {
      const activeModelPrompt = pendingModelRequest?.originalPrompt?.trim() || lastUserMessage;
      const activeEffectiveUserMessage = attachmentContext
        ? `${activeModelPrompt}\n\n${attachmentContextBlock(attachmentContext)}`
        : activeModelPrompt;
      const shouldDefaultInvestmentAskToDcf =
        !pendingModelRequest &&
        isInvestmentValuationPrompt(activeModelPrompt) &&
        !explicitlyRequestsOperatingModelArtifact(activeModelPrompt);
      const promptSelectedModelType =
        pendingModelRequest?.modelType ?? (shouldDefaultInvestmentAskToDcf ? 'DCF' : classifyPrompt(activeModelPrompt));
      const modelType =
        promptSelectedModelType ??
        (!attachmentContext?.statementPackage ? attachmentContext?.signals?.modelTypeHint ?? null : null);
      const requestedPdfModelType =
        modelType === 'DCF' || modelType === 'THREE_STATEMENT' || modelType === 'COMPS' || modelType === 'LBO'
          ? modelType
          : null;
      let attachmentExtractionContext = null;
      let attachmentModelOverrides = pendingModelRequest?.inputOverrides ?? requestInputOverrides ?? {};
      let clarificationParseFailed = false;
      const isFinancialPdfRequest = Boolean(
        attachmentContext &&
          isPdfAttachment({ mimeType: attachmentContext.mimeType, name: attachmentContext.name })
      );
      const coreTemplateModel = pendingModelRequest ? null : detectCoreTemplatePrompt(lastUserMessage);

      if (pendingModelRequest && requestedPdfModelType && clarificationAnswer) {
        const parsedClarification = parseAttachmentClarificationAnswer({
          modelType: requestedPdfModelType,
          answer: clarificationAnswer,
          currentField: pendingModelRequest.clarificationField,
          inputOverrides: attachmentModelOverrides,
        });
        attachmentModelOverrides = parsedClarification.inputOverrides;
        clarificationParseFailed = parsedClarification.matchedFields.length === 0;
      }

      if (shouldVisualizeCurrentDcf && currentDcf) {
        addExecutionTraceService(executionTrace, 'build_visualization');
        const visualization = buildVisualizationFromCurrentArtifact({ currentDcf });
        return NextResponse.json(withAttachmentStatus(withExecutionTrace({
          reply: `Here is a standalone chart package for ${currentDcf.companyName} (${currentDcf.ticker}). This is separate from the DCF model card and is meant purely for visualization.`,
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          visualization,
          sources: [
            `Demo snapshot cache — ${currentDcf.source}`,
            ...(currentDcf.asOfDate ? [`Snapshot updated ${currentDcf.asOfDate}`] : []),
            'Conversation follow-up visualization request',
          ],
          factsCount: 0,
          attachmentUsed: attachmentLabel,
        }, executionTrace)));
      }

      if (shouldVisualizeCurrentModel && currentModel) {
        addExecutionTraceService(executionTrace, 'build_visualization');
        const visualization = buildVisualizationFromCurrentArtifact({ currentModel });
        return NextResponse.json(withAttachmentStatus(withExecutionTrace({
          reply: `Here is a standalone visualization for the current ${currentModel.modelType.replace(/_/g, ' ')} output. This is separate from the model card so the chart can stand on its own.`,
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          visualization,
          sources: [
            ...currentModel.provenanceSummary.sources,
            'Conversation follow-up visualization request',
          ],
          factsCount: 0,
          attachmentUsed: attachmentLabel,
        }, executionTrace)));
      }

      if (shouldReviseCurrentModel && currentModel) {
        addExecutionTraceService(executionTrace, 'revise_analyst_structured_model');
        const revisedModel = await reviseAnalystStructuredModel(lastUserMessage, currentModel, sessionId);
        if (revisedModel) {
          if (!revisedModel.modelChanged) {
            addExecutionTraceNote(executionTrace, 'Revision request resolved to explanation only; no model values changed.');
            return NextResponse.json(withAttachmentStatus(withExecutionTrace({
              reply: revisedModel.reply,
              fallback: false,
              mode: 'live',
              route: 'financial_model',
              generatedModel: revisedModel.payload,
              sources: [
                ...revisedModel.payload.provenanceSummary.sources,
                'Conversation follow-up model explanation',
              ],
              factsCount: 0,
              attachmentUsed: attachmentLabel,
            }, executionTrace)));
          }
          let persistedRecentRun = revisedModel.payload.recentRun;
          try {
            const persisted = await savePromptModelRunVersion({
              surface: 'analyst_chat',
              sessionId,
              prompt: lastUserMessage,
              modelType: revisedModel.payload.modelType,
              companyName:
                'companyName' in revisedModel.payload.extractedInputs
                  ? revisedModel.payload.extractedInputs.companyName
                  : null,
              ticker:
                'ticker' in revisedModel.payload.extractedInputs
                  ? revisedModel.payload.extractedInputs.ticker ?? null
                  : null,
              status: 'generated',
              assumptions: revisedModel.payload.extractedInputs as Record<string, unknown>,
              defaultsUsed: revisedModel.payload.defaultsUsed,
              extractedInputs: revisedModel.payload.extractedInputs as Record<string, unknown>,
              provenance: revisedModel.payload.provenanceSummary,
              exportSeed: buildAnalystGeneratedModelExportSeed(revisedModel.payload),
            });
            persistedRecentRun = buildAnalystGeneratedModelRecentRun({
              runId: persisted.runId,
              versionNumber: persisted.version.versionNumber,
              createdAt: persisted.version.createdAt,
              status: persisted.version.status,
            });
          } catch (error) {
            console.error('[analyst-chat] unable to persist revised model run', error);
          }

          const revisedPayload: AnalystGeneratedModelPayload = {
            ...revisedModel.payload,
            recentRun: persistedRecentRun,
          };

          return NextResponse.json(withAttachmentStatus(withExecutionTrace({
            reply: revisedModel.reply,
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            generatedModel: revisedPayload,
            sources: [
              ...revisedPayload.provenanceSummary.sources,
              'CapitalBase local model templates',
              'Conversation follow-up model adjustment',
            ],
            factsCount: 0,
            attachmentUsed: attachmentLabel,
          }, executionTrace)));
        }
      }

      if (shouldApplyCurrentDcfEventShock && currentDcf) {
        addExecutionTraceService(executionTrace, 'revise_analyst_dcf_demo_from_event_shock');
        const shockedDcf = await reviseAnalystDcfDemoFromEventShock(lastUserMessage, currentDcf);
        if (shockedDcf) {
          const catalystContext = await loadDcfCatalystContext(resolvedTicker ?? shockedDcf.payload.ticker);
          return NextResponse.json(withAttachmentStatus(withExecutionTrace({
            reply: shockedDcf.reply,
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            dcfDemo: attachDcfEventContext(
              shockedDcf.payload,
              macroEventsContext?.events,
              resolvedTicker ?? shockedDcf.payload.ticker,
              catalystContext,
            ),
            sources: [
              `Demo snapshot cache — ${shockedDcf.payload.source}`,
              ...(shockedDcf.payload.asOfDate ? [`Snapshot updated ${shockedDcf.payload.asOfDate}`] : []),
              'Deterministic event shock mapping',
              ...(catalystContext ? ['CapitalBase company catalyst context'] : []),
            ],
            factsCount: 0,
            attachmentUsed: attachmentLabel,
          }, executionTrace)));
        }
      }

      if (shouldReviseCurrentDcf && currentDcf) {
        addExecutionTraceService(executionTrace, 'revise_analyst_dcf_demo');
        const revisedDcf = await reviseAnalystDcfDemo(lastUserMessage, currentDcf);
        if (revisedDcf) {
          const catalystContext = await loadDcfCatalystContext(resolvedTicker ?? revisedDcf.payload.ticker);
          return NextResponse.json(withAttachmentStatus(withExecutionTrace({
            reply: revisedDcf.reply,
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            dcfDemo: attachDcfEventContext(
              revisedDcf.payload,
              macroEventsContext?.events,
              resolvedTicker ?? revisedDcf.payload.ticker,
              catalystContext,
            ),
            sources: [
              `Demo snapshot cache — ${revisedDcf.payload.source}`,
              ...(revisedDcf.payload.asOfDate ? [`Snapshot updated ${revisedDcf.payload.asOfDate}`] : []),
              'Conversation follow-up DCF adjustment',
              ...(catalystContext ? ['CapitalBase company catalyst context'] : []),
            ],
            factsCount: 0,
            attachmentUsed: attachmentLabel,
          }, executionTrace)));
        }
      }

      if (isFinancialPdfRequest) {
        const extractionStatus = attachmentContext?.statementExtractionStatus ?? 'low_confidence';
        console.info('[analyst-chat] pdf model seed assessment', {
          attachment: attachmentContext?.name ?? null,
          requestedPdfModelType,
          extractionStatus,
          seedable: attachmentContext?.isFinancialModelSeedable ?? false,
        });
        if (attachmentContext?.isFinancialModelSeedable !== true) {
          return NextResponse.json(withAttachmentStatus({
            reply: buildFinancialPdfModelFailureReply({
              modelType: requestedPdfModelType,
              status: extractionStatus,
              extractionWarnings: attachmentContext?.statementExtractionWarnings ?? [],
            }),
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            sources: [
              'Attachment financial PDF',
              `Statement extraction status: ${extractionStatus}`,
            ],
            factsCount: 0,
            attachmentUsed: attachmentLabel,
          }));
        }
        if (requestedPdfModelType) {
          attachmentExtractionContext = await resolveAttachmentModelExtraction({
            modelType: requestedPdfModelType,
            prompt: activeModelPrompt,
            snapshot: getAttachmentSeedSnapshot(attachmentContext),
            inputOverrides: attachmentModelOverrides,
            attachmentText: attachmentContext?.rawText ?? null,
            attachmentSummary: attachmentContext?.summary ?? null,
          });
          const readiness = evaluateAttachmentModelReadiness({
            modelType: requestedPdfModelType,
            attachmentSnapshot: getAttachmentSeedSnapshot(attachmentContext),
            inputOverrides: attachmentModelOverrides,
            extractionContext: attachmentExtractionContext,
          });
          if (!readiness.ready) {
            return NextResponse.json(withAttachmentStatus({
              reply: buildAttachmentClarificationReply({
                modelType: requestedPdfModelType,
                clarificationQuestion: readiness.clarificationQuestion ?? 'Please provide the missing input.',
                missingInputs: readiness.missingInputs,
                clarificationFieldLabel: readiness.clarificationFieldLabel,
                parseFailed: clarificationParseFailed,
              }),
              fallback: false,
              mode: 'live',
              route: 'financial_model',
              needsClarification: true,
              clarificationQuestion: readiness.clarificationQuestion,
              clarificationField: readiness.clarificationField,
              clarificationFieldLabel: readiness.clarificationFieldLabel,
              clarificationParseType: readiness.clarificationParseType,
              remainingMissingInputs: readiness.missingRequiredFields ?? readiness.missingInputs,
              pendingModelRequest: {
                modelType: requestedPdfModelType,
                originalPrompt: activeModelPrompt,
                attachmentName: attachmentContext?.name ?? null,
                inputOverrides: attachmentModelOverrides,
                clarificationField: readiness.clarificationField ?? null,
              },
              sources: [
                'Attachment PDF statement package',
                `Awaiting required inputs: ${readiness.missingInputs.join(', ')}`,
              ],
              factsCount: 0,
              attachmentUsed: attachmentLabel,
            }));
          }
        }
      }

      if (modelType) {
        addExecutionTraceService(executionTrace, 'generate_analyst_structured_model');
        const normalizedModelPrompt =
          classifyPrompt(activeModelPrompt) === null && attachmentContext?.signals?.modelTypeHint === modelType
            ? `Build a ${modelType.replace(/_/g, ' ')} model using the uploaded context.\n\n${activeEffectiveUserMessage}`
            : activeEffectiveUserMessage;
        const generatedModel = await generateAnalystStructuredModel(normalizedModelPrompt, sessionId, {
          attachmentStatementSnapshot:
            attachmentContext?.isFinancialModelSeedable === true
              ? attachmentExtractionContext?.snapshot ?? getAttachmentSeedSnapshot(attachmentContext)
              : null,
          inputOverrides: attachmentModelOverrides,
          clarificationAnswer,
          attachmentDriven: requestedPdfModelType !== null,
          attachmentText: attachmentContext?.rawText ?? null,
          attachmentSummary: attachmentContext?.summary ?? null,
          attachmentExtractionContext,
        });
        if (generatedModel && !generatedModel.validationFailed && shouldGenerateScenarioAdjustedTeslaDcf && latestScenarioCard) {
          addExecutionTraceService(executionTrace, 'apply_ai_smart_dcf_to_new_dcf');
          addExecutionTraceNote(
            executionTrace,
            'Generated the Tesla DCF model workflow and applied the latest scenario card deltas before returning it.',
          );
          const revisedModel = await reviseAnalystStructuredModelFromOverrides(
            buildScenarioStructuredModelOverridesFromPayload(latestScenarioCard, generatedModel.payload),
            generatedModel.payload,
            sessionId,
          );
          if (revisedModel) {
            let persistedRecentRun = revisedModel.payload.recentRun;
            try {
              const persisted = await savePromptModelRunVersion({
                surface: 'analyst_chat',
                sessionId,
                prompt: lastUserMessage,
                modelType: revisedModel.payload.modelType,
                companyName:
                  'companyName' in revisedModel.payload.extractedInputs
                    ? revisedModel.payload.extractedInputs.companyName
                    : null,
                ticker:
                  'ticker' in revisedModel.payload.extractedInputs
                    ? revisedModel.payload.extractedInputs.ticker ?? null
                    : null,
                status: 'generated',
                assumptions: revisedModel.payload.extractedInputs as Record<string, unknown>,
                defaultsUsed: revisedModel.payload.defaultsUsed,
                extractedInputs: revisedModel.payload.extractedInputs as Record<string, unknown>,
                provenance: revisedModel.payload.provenanceSummary,
                exportSeed: buildAnalystGeneratedModelExportSeed(revisedModel.payload),
              });
              persistedRecentRun = buildAnalystGeneratedModelRecentRun({
                runId: persisted.runId,
                versionNumber: persisted.version.versionNumber,
                createdAt: persisted.version.createdAt,
                status: persisted.version.status,
              });
            } catch (error) {
              console.error('[analyst-chat] unable to persist scenario-adjusted generated model run', error);
            }

            const revisedPayload: AnalystGeneratedModelPayload = {
              ...revisedModel.payload,
              recentRun: persistedRecentRun,
            };

            return NextResponse.json(withAttachmentStatus(withExecutionTrace({
              reply: 'Applied the Tesla rates-down scenario to the DCF model workflow.',
              fallback: false,
              mode: 'live',
              route: 'financial_model',
              generatedModel: revisedPayload,
              unitValidationStatus: revisedPayload.unitValidationStatus,
              unitValidationMessage: revisedPayload.unitValidationMessage,
              sources: [
                ...revisedPayload.provenanceSummary.sources,
                'CapitalBase local model templates',
                'Deterministic Tesla macro scenario overlay',
              ],
              factsCount: 0,
              attachmentUsed: attachmentLabel,
            }, executionTrace)));
          }
        }
        if (generatedModel?.validationFailed) {
          return NextResponse.json(withAttachmentStatus(withExecutionTrace({
            reply: generatedModel.reply,
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            unitValidationStatus: 'failed',
            unitValidationMessage: generatedModel.unitValidation.message,
            sources: [
              'Attachment PDF statement package',
              'Hard unit-scale validation',
            ],
            factsCount: 0,
            attachmentUsed: attachmentLabel,
          }, executionTrace)));
        }
        if (generatedModel && 'payload' in generatedModel) {
          let persistedRecentRun = generatedModel.payload.recentRun;
          try {
            const persisted = await savePromptModelRunVersion({
              surface: 'analyst_chat',
              sessionId,
              prompt: activeModelPrompt,
              // Preserve the original user request in run history, not the synthetic attachment block.
              modelType: generatedModel.payload.modelType,
              companyName:
                'companyName' in generatedModel.payload.extractedInputs
                  ? generatedModel.payload.extractedInputs.companyName
                  : null,
              ticker:
                'ticker' in generatedModel.payload.extractedInputs
                  ? generatedModel.payload.extractedInputs.ticker ?? null
                  : null,
              status: 'generated',
              assumptions: generatedModel.payload.extractedInputs as Record<string, unknown>,
              defaultsUsed: generatedModel.payload.defaultsUsed,
              extractedInputs: generatedModel.payload.extractedInputs as Record<string, unknown>,
              provenance: generatedModel.payload.provenanceSummary,
              exportSeed: buildAnalystGeneratedModelExportSeed(generatedModel.payload),
            });
            persistedRecentRun = buildAnalystGeneratedModelRecentRun({
              runId: persisted.runId,
              versionNumber: persisted.version.versionNumber,
              createdAt: persisted.version.createdAt,
              status: persisted.version.status,
            });
          } catch (error) {
            console.error('[analyst-chat] unable to persist generated model run', error);
          }

          const generatedPayload: AnalystGeneratedModelPayload = {
            ...generatedModel.payload,
            recentRun: persistedRecentRun,
          };

          return NextResponse.json(withAttachmentStatus(withExecutionTrace({
            reply: generatedModel.reply,
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            generatedModel: generatedPayload,
            unitValidationStatus: generatedPayload.unitValidationStatus,
            unitValidationMessage: generatedPayload.unitValidationMessage,
            sources: [
              ...(attachmentContext?.isFinancialModelSeedable === true &&
              getAttachmentSeedSnapshot(attachmentContext)?.source === 'attachment_pdf_statement'
                ? ['Attachment PDF statement package']
                : []),
              ...(attachmentContext?.aiStatementCompletion
                ? [`AI PDF completion: ${attachmentContext.aiStatementCompletion.sourceTag}`]
                : []),
              ...generatedPayload.provenanceSummary.sources,
              'CapitalBase local model templates',
              'Deterministic prompt extraction and defaults',
            ],
            factsCount: 0,
            attachmentUsed: attachmentLabel,
          }, executionTrace)));
        }
      }

      if (coreTemplateModel) {
        return NextResponse.json(withAttachmentStatus({
          reply:
            coreTemplateModel.surface === 'template_library'
              ? `I routed this request into the deterministic template library. ${coreTemplateModel.name} already exists as a dedicated workbook model in CapitalBase, so the right workflow is to open the wizard, set the specific assumptions, and export the file from there.`
              : `I routed this request into the existing automated model builder. ${coreTemplateModel.name} already exists in CapitalBase, so the right workflow is to open the builder, set the required inputs, and export the workbook through that model-specific path.`,
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          coreTemplateModel,
          sources:
            coreTemplateModel.surface === 'template_library'
              ? ['CapitalBase template library', 'Deterministic workbook model registry']
              : ['CapitalBase automated builder', 'Existing model generation workflow'],
          factsCount: 0,
          attachmentUsed: attachmentLabel,
        }));
      }

      const demo = await generateAnalystDcfDemo({
        // no-op comment anchor
        prompt:
          attachmentContext?.signals?.modelTypeHint === 'DCF' || attachmentContext?.kind === 'earnings_report'
            ? `Build a DCF using the uploaded context.\n\n${effectiveUserMessage}`
            : effectiveUserMessage,
        explicitTicker: shouldGenerateScenarioAdjustedTeslaDcf ? (resolvedTicker ?? 'TSLA') : resolvedTicker,
        attachmentStatementSnapshot:
          attachmentContext?.isFinancialModelSeedable === true
            ? getAttachmentSeedSnapshot(attachmentContext)
            : null,
      });
      addExecutionTraceService(executionTrace, 'generate_analyst_dcf_demo');
      const dcfCatalystContext = await loadDcfCatalystContext(resolvedTicker ?? demo.payload.ticker);

      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply: demo.reply,
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        dcfDemo: attachDcfEventContext(
          demo.payload,
          macroEventsContext?.events,
          resolvedTicker ?? demo.payload.ticker,
          dcfCatalystContext,
        ),
        sources: [
          buildFinancialModelSourceLabel(demo.payload.source),
          ...(demo.payload.asOfDate ? [`Snapshot updated ${demo.payload.asOfDate}`] : []),
          ...(macroEventsContext && macroEventsContext.events.length > 0
            ? ['CapitalBase active market event context']
            : []),
          ...(dcfCatalystContext ? ['CapitalBase company catalyst context'] : []),
        ],
        factsCount: 0,
        attachmentUsed: attachmentLabel,
      }, executionTrace)));
    }

    if (shouldVisualizeCurrentStock && currentStock) {
      const visualization = buildVisualizationFromCurrentArtifact({ currentStock });
      return NextResponse.json(withAttachmentStatus({
        reply: `Here is a standalone market chart for ${currentStock.companyName ?? currentStock.ticker} (${currentStock.ticker}). This is separate from the full company lookup card.`,
        fallback: false,
        mode: 'live',
        route: route.intent,
        visualization,
        sources: [
          currentStock.source.company ? `Company: ${currentStock.source.company}` : null,
          currentStock.source.fundamentals ? `Fundamentals: ${currentStock.source.fundamentals}` : null,
          currentStock.source.price ? `Price: ${currentStock.source.price}` : null,
        ].filter((item): item is string => Boolean(item)),
        factsCount: 0,
        stockLookup: currentStock,
        attachmentUsed: attachmentLabel,
      }));
    }

    const financialSearchResult = await runPublicFinancialSearch({
      
      route,
      userMessage: lastUserMessage,
      explicitTicker: resolvedTicker,
      preloadedStockLookup: stockLookupPayload,
      hasAttachment: Boolean(attachmentContext),
    });

    if (financialSearchResult) {
      addExecutionTraceService(executionTrace, 'run_public_financial_search');
      responseStockLookup = financialSearchResult.stockLookup ?? responseStockLookup;
      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply: financialSearchResult.reply,
        fallback: false,
        mode: 'live',
        route: route.intent,
        sources: financialSearchResult.rankedSources
          .slice(0, 5)
          .map((source) => (source.url ? `${source.label} — ${source.url}` : source.label)),
        factsCount: financialSearchResult.rankedFacts.length,
        retrievalWarnings: financialSearchResult.warnings.length > 0 ? financialSearchResult.warnings : undefined,
        stockLookup: responseStockLookup,
        attachmentUsed: attachmentLabel,
      }, executionTrace)));
    }

    /* ── Step 2: Retrieve data based on route ── */
    const retrievalRoute = preferCurrentArtifact
      ? {
          ...route,
          requiresLiveData: false,
          requiresNews: false,
          requiresFinancials: false,
          prefersEarningsContext: false,
          requiresQuarterReportContext: false,
        }
      : route;

    const retrievedDataBase = preferCurrentArtifact
      ? {
          news: [],
          financials: [],
          webSnippets: [],
          curatedHeadlines: [],
          sources: [],
          warnings: [],
        }
      : await retrieveDataForRoute(route, lastUserMessage);
    const shouldSuppressGenericCompanyFacts =
      Boolean(resolvedTicker) &&
      earningsRuntimeMeta?.request.mode === 'explicit_quarter';
    const retrievedData =
      shouldSuppressGenericCompanyFacts && resolvedTicker
        ? {
            ...retrievedDataBase,
            financials: retrievedDataBase.financials.filter((financial) => financial.ticker !== resolvedTicker),
            warnings: [
              ...retrievedDataBase.warnings,
              explicitQuarterRequestUnresolved(earningsAgentResult, earningsRuntimeMeta)
                ? `Exact quarter package for ${resolvedTicker} ${earningsRuntimeMeta?.request.fiscalPeriod ?? ''} ${earningsRuntimeMeta?.request.fiscalYear ?? ''}`.trim() +
                  ' was not resolved; suppressed latest-company snapshot context for this reply.'
                : `Suppressed generic latest-company snapshot context for explicit historical quarter request on ${resolvedTicker}.`,
            ],
            sources: retrievedDataBase.sources.filter((source) => !source.includes(resolvedTicker)),
          }
        : retrievedDataBase;
    responseStockLookup =
      shouldSuppressGenericCompanyFacts
        ? null
        : stockLookupPayload;

    if (explicitQuarterRequestUnresolved(earningsAgentResult, earningsRuntimeMeta) && resolvedTicker && earningsRuntimeMeta) {
      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply: buildExplicitQuarterUnresolvedReply({
          ticker: resolvedTicker,
          runtimeMeta: earningsRuntimeMeta,
          earningsResult: earningsAgentResult,
        }),
        fallback: false,
        mode: 'live',
        route: route.intent,
        sources: [],
        factsCount: 0,
        retrievalWarnings: (() => {
          const hasGoodEarningsData = earningsAgentResult != null;
          const filtered = retrievedData.warnings.filter((w) => {
            const lower = w.toLowerCase();
            if (hasGoodEarningsData && lower.includes('fmp retrieval returned no usable')) return false;
            if (hasGoodEarningsData && lower.includes('no financial data was retrieved')) return false;
            if (hasGoodEarningsData && lower.includes('no live web data was available')) return false;
            return true;
          });
          return filtered.length > 0 ? filtered : undefined;
        })(),
        stockLookup: null,
        earningsRetrieval: earningsAgentResult,
        earningsPackageMeta: earningsRuntimeMeta,
        attachmentUsed: attachmentLabel,
      }, executionTrace)));
    }

    /* ── Step 3: Extract verified facts ── */
    const facts = extractVerifiedFacts(retrievalRoute, retrievedData);
    verifiedFacts = facts;
    const factsContext = serializeFactsBriefForContext(facts, lastUserMessage);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[analyst-chat] facts extracted:', {
        events: facts.events.length,
        companies: facts.companies.length,
        numbers: facts.numbers.length,
        sources: facts.sources.length,
        dataGaps: facts.dataGaps.length,
      });
    }

    if (isVisualizationPrompt(lastUserMessage)) {
      const chartStockLookup =
        currentStock ??
        stockLookupPayload ??
        (resolvedTicker ? await lookupStock({ prompt: lastUserMessage, ticker: resolvedTicker }) : null);
      const generatedSpec = await generateVisualizationSpecFromPrompt({
        prompt: lastUserMessage,
        factsContext,
        currentArtifactContext: currentArtifactBlock,
        stockLookup: chartStockLookup,
        attachmentContext: attachmentContext ? attachmentContextBlock(attachmentContext) : null,
        macroEventsContext: macroEventsBlock,
      });

      if (generatedSpec) {
        const sources = [
          ...facts.sources.slice(0, 4),
          chartStockLookup?.source.company ? `Company: ${chartStockLookup.source.company}` : null,
          chartStockLookup?.source.fundamentals ? `Fundamentals: ${chartStockLookup.source.fundamentals}` : null,
          chartStockLookup?.source.price ? `Price: ${chartStockLookup.source.price}` : null,
          'Anthropic constrained chart spec generation',
        ].filter((item): item is string => Boolean(item));

        return NextResponse.json(withAttachmentStatus({
          reply: `Here is a chart for ${visualizationContextLabel({
            currentModel,
            currentDcf,
            currentStock,
            stockLookup: chartStockLookup,
            resolvedTicker,
          })}.`,
          fallback: false,
          mode: 'live',
          route: route.intent,
          visualization: {
            title: generatedSpec.title,
            subtitle: generatedSpec.subtitle ?? 'Standalone chart generated from the current request and sourced context.',
            contextType: visualizationContextType({
              currentModel,
              currentDcf,
              currentStock,
              stockLookup: chartStockLookup,
            }),
            contextLabel: visualizationContextLabel({
              currentModel,
              currentDcf,
              currentStock,
              stockLookup: chartStockLookup,
              resolvedTicker,
            }),
            notes: [
              'Chart generated from constrained FinanceChartSpec output.',
              ...(generatedSpec.note ? [generatedSpec.note] : []),
            ],
            panels: [
              {
                id: 'llm-chart-spec',
                height: generatedSpec.chartType === 'scatter' ? 340 : 300,
                spec: generatedSpec,
              },
            ],
          },
          sources,
          factsCount: facts.numbers.length + facts.events.length,
          stockLookup: chartStockLookup,
          attachmentUsed: attachmentLabel,
        }));
      }
    }

    /* ── Check for provider keys ── */
    const openAiKeys = getOpenAIKeyCandidates('user');
    const anthropicKeys = getAnthropicKeyCandidates('user');
    if (openAiKeys.length === 0 && anthropicKeys.length === 0) {
      const fallback = await buildFallbackReply({
        ticker: resolvedTicker,
        facts,
        userMessage: lastUserMessage,
        reason: 'missing_key',
        preferSilent: Boolean(stockLookupPayload) && !isGenericEarningsSummaryPrompt(lastUserMessage),
      });
      return NextResponse.json(withAttachmentStatus({
        reply: fallback,
        fallback: true,
        mode: 'fallback',
        reason: 'missing_key',
        route: route.intent,
        factsCount: facts.numbers.length + facts.events.length,
        stockLookup: responseStockLookup,
        earningsRetrieval: earningsAgentResult,
        earningsPackageMeta: earningsRuntimeMeta,
        attachmentUsed: attachmentLabel,
      }), { status: 200 });
    }

    /* ── Step 4: Build LLM messages with intent-specific prompt + verified facts ── */
    const useWebTools = route.requiresLiveData && facts.events.length === 0 && facts.numbers.length === 0;
    const intentPrompt = getIntentPrompt(route.intent, lastUserMessage);
    const longHorizonForecastInstruction = isLongHorizonForecastPrompt(lastUserMessage)
      ? 'For this multi-year forecast, return clean prose only: no markdown tables, no pipe-delimited rows, no section headers, and no bullet lists unless the user explicitly asked for them. Use 3-4 short paragraphs in this order: core forecast, revenue/segment drivers, margin/FCF setup, key risks. Keep every currency and percent value attached to its subject and unit.'
      : null;
    const styleInstruction = userExplicitlyWantsStructuredOutput(lastUserMessage)
      ? 'Use the structure the user explicitly asked for. Keep it concise and finance-native.'
      : 'Default to natural analyst prose in short paragraphs. Do not use labeled section headers, bullet lists, memo scaffolding, or template headings unless the user explicitly asked for them.';
    const responseQualityInstruction =
      'Output quality guard: write complete sentences with intact currency/percent values. Never begin a paragraph with an orphaned numeric fragment such as "94 is pricing", "5% move", or "6T EV"; include the full subject and unit. Keep the answer to 2-4 short paragraphs unless the user explicitly asks for a table or memo.';
    const numericDisciplineInstruction =
      timesFMBlock
        ? 'Use the supplied forecast block as verified application-generated context. Lead with its numeric forecast range and do not replace it with a generic caveat.'
        : facts.numbers.length >= 3 || facts.companies.length > 0
        ? 'Use verified numeric facts when they sharpen the point. Do not add unsupported numeric sensitivities, valuation percentages, debt balances, or basis-point rules that are not in the sourced context.'
        : 'Verified numeric support is thin. Do not introduce precise numeric sensitivities, debt balances, WACC rules, valuation percentages, or basis-point estimates. Answer directionally and explain the mechanism instead.';
    const earningsFirstInstruction =
      featureFlags.ENABLE_EARNINGS_PACKAGE_CACHE && (route.prefersEarningsContext || route.requiresQuarterReportContext)
        ? 'This is a company framework or quarter-report request. Use the latest company earnings context first: reported quarter metrics, earnings commentary, transcript highlights, and latest available quarterly report link. Do not treat this as a generic follow-up if fresher company context is available.'
        : null;
    const earningsAgentInstruction = earningsAgentResult
      ? `EARNINGS RETRIEVAL AGENT OUTPUT (source of truth for quarter context):\n${serializeEarningsRetrievalAgentResult(
          earningsAgentResult,
        )}\nResolved package metadata:\n${JSON.stringify(earningsRuntimeMeta ?? {}, null, 2)}\nThe final answer must use this agent JSON as the primary quarter-context source. Do not invent facts beyond it.`
      : null;
    const exactQuarterGuardInstruction = explicitQuarterRequestUnresolved(earningsAgentResult, earningsRuntimeMeta)
      ? `The user asked for an explicit historical quarter. That exact quarter was not resolved. Do not substitute latest-quarter company financials. State clearly that the exact requested quarter was not resolved from current sources, keep the requested quarter identity, and do not blend in other period metrics as if they were the answer.`
      : null;

    const inputMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: ANALYST_SYSTEM_PROMPT },
      ...(intentPrompt ? [{ role: 'system' as const, content: intentPrompt }] : []),
      { role: 'system', content: styleInstruction },
      ...(longHorizonForecastInstruction ? [{ role: 'system' as const, content: longHorizonForecastInstruction }] : []),
      { role: 'system', content: responseQualityInstruction },
      { role: 'system', content: numericDisciplineInstruction },
      ...(earningsFirstInstruction ? [{ role: 'system' as const, content: earningsFirstInstruction }] : []),
      ...(earningsAgentInstruction ? [{ role: 'system' as const, content: earningsAgentInstruction }] : []),
      ...(exactQuarterGuardInstruction ? [{ role: 'system' as const, content: exactQuarterGuardInstruction }] : []),
      ...(currentArtifactInstruction ? [{ role: 'system' as const, content: currentArtifactInstruction }] : []),
      {
        role: 'system',
        content: `Sourced context for this answer:\n\n${factsContext}`,
      },
      ...(macroEventsBlock ? [{ role: 'system' as const, content: macroEventsBlock }] : []),
      ...(timesFMBlock ? [{ role: 'system' as const, content: timesFMBlock }] : []),
      ...(currentArtifactBlock ? [{ role: 'system' as const, content: currentArtifactBlock }] : []),
      ...(attachmentContext ? [{ role: 'system' as const, content: attachmentContextBlock(attachmentContext) }] : []),
      ...safeMessages,
    ];

    if (!inputMessages.some(m => m.role === 'user')) {
      inputMessages.push({ role: 'user', content: 'Provide a concise market and fundamentals summary.' });
    }

    /* ── Step 5: Call provider with verified facts as grounding ── */
    const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL);
    let replyText: string | null = null;
    let lastError: unknown = null;
    let sawAuthError = false;

    const attemptResponse = async (
      client: OpenAI,
      model: string,
      msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      withWebTools: boolean
    ): Promise<string | null> => {
      if (!withWebTools) {
        const response = await client.responses.create({
          model,
          input: msgs,
          temperature: 0,
          max_output_tokens: 1000,
        });
        return typeof response.output_text === 'string' && response.output_text.trim().length > 0
          ? response.output_text.trim()
          : null;
      }

      let webError: unknown = null;
      for (const tool of WEB_TOOL_CANDIDATES) {
        try {
          const response = await client.responses.create({
            model,
            input: msgs,
            temperature: 0,
            max_output_tokens: 1000,
            tools: [tool as unknown as Record<string, unknown>],
          } as never);
          if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
            return response.output_text.trim();
          }
        } catch (error) {
          webError = error;
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[analyst-chat] web tool attempt failed', {
              model, tool: tool.type,
              message: error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error)),
            });
          }
        }
      }
      if (webError) throw webError;
      return null;
    };

    if (!useWebTools) {
      try {
        const providerReply = await generateTextWithProviderFallback({
          clientType: 'user',
          preferredProvider: 'anthropic',
          temperature: 0,
          maxTokens: 1000,
          messages: inputMessages,
        });
        replyText = providerReply?.text?.trim() ?? null;
        if (process.env.NODE_ENV !== 'production' && providerReply) {
          console.debug('[analyst-chat] provider selected', {
            provider: providerReply.provider,
            model: providerReply.model,
            usedWebTool: false,
          });
        }
        if (replyText && hasPlaceholderNumbers(replyText)) {
          const repairMsgs = [
            ...inputMessages,
            {
              role: 'system' as const,
              content: 'Your previous draft contained placeholders (XX, $XX). Regenerate using ONLY the verified facts provided. If a number is not available in the facts context, say "not available" instead of guessing.',
            },
            { role: 'user' as const, content: 'Regenerate with concrete values from verified facts only.' },
          ];
          const repaired = await generateTextWithProviderFallback({
            clientType: 'user',
            preferredProvider: 'anthropic',
            temperature: 0,
            maxTokens: 1000,
            messages: repairMsgs,
          });
          if (repaired?.text?.trim()) replyText = repaired.text.trim();
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!replyText && openAiKeys.length > 0) {
      for (const apiKey of openAiKeys) {
        const client = new OpenAI({ apiKey });
        for (const model of models) {
          try {
            replyText = await attemptResponse(client, model, inputMessages, useWebTools);
            if (process.env.NODE_ENV !== 'production') {
              console.debug('[analyst-chat] model selected', { model, key: keyFingerprint(apiKey), usedWebTool: useWebTools });
            }
          } catch (error) {
            lastError = error;
            if (isAuthError(error)) { sawAuthError = true; break; }
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[analyst-chat] responses failed', {
                model, key: keyFingerprint(apiKey),
                message: error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error)),
              });
            }
          }

          if (!replyText && !useWebTools) {
            try {
              const completion = await client.chat.completions.create({
                model,
                messages: inputMessages,
                temperature: 0,
                max_tokens: 1000,
              });
              replyText = extractReplyFromCompletions(completion);
              if (process.env.NODE_ENV !== 'production') {
                console.debug('[analyst-chat] completions fallback', { model, key: keyFingerprint(apiKey) });
              }
            } catch (error) {
              lastError = error;
              if (isAuthError(error)) { sawAuthError = true; break; }
            }
          }

          if (replyText) {
            if (hasPlaceholderNumbers(replyText)) {
              try {
                const repairMsgs = [
                  ...inputMessages,
                  {
                    role: 'system' as const,
                    content: 'Your previous draft contained placeholders (XX, $XX). Regenerate using ONLY the verified facts provided. If a number is not available in the facts context, say "not available" instead of guessing.',
                  },
                  { role: 'user' as const, content: 'Regenerate with concrete values from verified facts only.' },
                ];
                const repaired = await attemptResponse(client, model, repairMsgs, false);
                if (repaired) replyText = repaired;
              } catch {
                // keep original reply
              }
            }
            break;
          }
        }
        if (replyText) break;
      }
    }

    if (!replyText) {
      if (sawAuthError) {
        throw new Error('LLM authentication failed. Verify configured provider keys and restart.');
      }
      throw (lastError instanceof Error ? lastError : new Error('LLM request failed across all provider candidates'));
    }

    replyText = ensureForecastLead(replyText, forecastLeadSentence);

    return NextResponse.json(withAttachmentStatus({
      reply: replyText.trim(),
      fallback: false,
      mode: 'live',
      route: route.intent,
      sources: [
        ...facts.sources.slice(0, 8),
        ...(macroEventsContext && macroEventsContext.events.length > 0
          ? ['CapitalBase active market event context']
          : []),
        ...(preferCurrentArtifact && currentArtifactBlock ? ['CapitalBase current artifact context'] : []),
        ...(earningsAgentResult
          ? [
              ...earningsAgentResult.commentary.sourceNotes,
              earningsAgentResult.quarter.reportUrl ? `Quarterly report: ${earningsAgentResult.quarter.reportUrl}` : null,
            ].filter((item): item is string => Boolean(item))
          : []),
      ],
      factsCount: facts.numbers.length + facts.events.length,
      dataGaps: facts.dataGaps.length > 0 ? facts.dataGaps : undefined,
      retrievalWarnings: (() => {
        const hasGoodStockData =
          responseStockLookup != null &&
          (responseStockLookup.price != null ||
            responseStockLookup.revenueLtm != null ||
            responseStockLookup.marketCap != null);
        const filtered = retrievedData.warnings.filter((w) => {
          const lower = w.toLowerCase();
          // Suppress FMP/financial-retrieval noise when Finnhub already delivered data
          if (hasGoodStockData && lower.includes('fmp retrieval returned no usable')) return false;
          if (hasGoodStockData && lower.includes('no financial data was retrieved')) return false;
          if (hasGoodStockData && lower.includes('no live web data was available')) return false;
          return true;
        });
        return filtered.length > 0 ? filtered : undefined;
      })(),
      stockLookup: responseStockLookup,
      earningsRetrieval: earningsAgentResult,
      earningsPackageMeta: earningsRuntimeMeta,
      forecastModel: priceForecastModel ?? undefined,
      attachmentUsed: attachmentLabel,
    }));
  } catch (error) {
    const message = error instanceof Error ? redactSecrets(error.message) : 'Unable to generate response';
    console.error('Analyst chat error', { message });

    const failureReason = classifyFailureReason(error);
    let fallbackReply = 'Unable to generate a response right now. Please retry in a moment.';
    try {
      fallbackReply = await buildFallbackReply({
        ticker: fallbackTicker,
        facts: verifiedFacts,
        userMessage: fallbackUserMessage,
        reason: failureReason,
        preferSilent: Boolean(stockLookupPayload) && !isGenericEarningsSummaryPrompt(fallbackUserMessage),
      });
    } catch {
      // keep generic fallback
    }

    return NextResponse.json({
      reply: fallbackReply,
      fallback: true,
      mode: 'fallback',
      reason: failureReason,
      error: message,
      stockLookup: responseStockLookup,
      earningsRetrieval: earningsAgentResult,
      earningsPackageMeta: earningsRuntimeMeta,
      ...(responseAttachmentStatus ? { attachmentStatus: responseAttachmentStatus } : {}),
    }, { status: 200 });
  }
}

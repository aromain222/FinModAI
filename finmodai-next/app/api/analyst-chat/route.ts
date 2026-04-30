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
  reviseAnalystDcfDemo,
  reviseAnalystDcfDemoFromAdjustment,
  reviseAnalystDcfDemoFromEventShock,
  type AnalystDcfAdjustment,
  type AnalystDcfDemoPayload,
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
import { featureFlags } from '@/lib/env/server';
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
import { getCompanyCatalystContext } from '@/lib/models/shared/companyCatalystContext';
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
    /\b(explain this|walk me through|break this down|what matters|what changed|what stands out|what is driving|driving factors|key drivers|what assumptions are doing the most work|assumptions doing the most work|which assumptions matter|key assumptions|biggest risks|stress this|sensitivity|compare this to peers|does this hold up|is this realistic|what breaks this case|where is the risk)\b/.test(
      text,
    )
  );
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
        ? (body.currentDcf as AnalystDcfDemoPayload)
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

    const macroEventsContext = shouldInjectMacroEventsContext(route, effectiveUserMessage, attachmentContext)
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

    // TimesFM revenue forecast — inject implied growth rate when available for company questions.
    let timesFMBlock: string | null = null;
    if (route.intent === 'company_question' && resolvedTicker) {
      try {
        const tfmRes = await Promise.race([
          fetch(`${req.nextUrl.origin}/api/timesfm?type=revenue&ticker=${resolvedTicker}`, { cache: 'no-store' }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
        if (tfmRes && tfmRes instanceof Response && tfmRes.ok) {
          const tfmData = await tfmRes.json() as {
            implied_growth_rate?: number | null;
            forecast?: { labels: string[]; values: number[] } | null;
            model_available?: boolean;
          };
          if (tfmData.model_available && tfmData.forecast && tfmData.implied_growth_rate != null) {
            const growth = (tfmData.implied_growth_rate * 100).toFixed(1);
            const fwdRevenue = tfmData.forecast.values
              .map((v, i) => `${tfmData.forecast!.labels[i]}: $${Math.round(v)}M`)
              .join(', ');
            timesFMBlock = `TIMESFM REVENUE FORECAST (Google foundation model — use as a quantitative forward reference):\nImplied NTM revenue growth: ${growth >= '0' ? '+' : ''}${growth}%\nQuarterly projections: ${fwdRevenue}`;
          }
        }
      } catch {
        // Non-fatal — forecast is supplemental context only
      }
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
      const promptSelectedModelType = pendingModelRequest?.modelType ?? classifyPrompt(activeModelPrompt);
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
          return NextResponse.json(withAttachmentStatus(withExecutionTrace({
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
            attachmentUsed: attachmentLabel,
          }, executionTrace)));
        }
      }

      if (shouldReviseCurrentDcf && currentDcf) {
        addExecutionTraceService(executionTrace, 'revise_analyst_dcf_demo');
        const revisedDcf = await reviseAnalystDcfDemo(lastUserMessage, currentDcf);
        if (revisedDcf) {
          return NextResponse.json(withAttachmentStatus(withExecutionTrace({
            reply: revisedDcf.reply,
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            dcfDemo: revisedDcf.payload,
            sources: [
              `Demo snapshot cache — ${revisedDcf.payload.source}`,
              ...(revisedDcf.payload.asOfDate ? [`Snapshot updated ${revisedDcf.payload.asOfDate}`] : []),
              'Conversation follow-up DCF adjustment',
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

      return NextResponse.json(withAttachmentStatus(withExecutionTrace({
        reply: demo.reply,
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        dcfDemo: demo.payload,
        sources: [
          buildFinancialModelSourceLabel(demo.payload.source),
          ...(demo.payload.asOfDate ? [`Snapshot updated ${demo.payload.asOfDate}`] : []),
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
        retrievalWarnings: retrievedData.warnings.length > 0 ? retrievedData.warnings : undefined,
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
    const styleInstruction = userExplicitlyWantsStructuredOutput(lastUserMessage)
      ? 'Use the structure the user explicitly asked for. Keep it concise and finance-native.'
      : 'Default to natural analyst prose in short paragraphs. Do not use labeled section headers, bullet lists, memo scaffolding, or template headings unless the user explicitly asked for them.';
    const numericDisciplineInstruction =
      facts.numbers.length >= 3 || facts.companies.length > 0
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
          max_output_tokens: 800,
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
            max_output_tokens: 900,
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
          maxTokens: 800,
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
            maxTokens: 800,
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
                max_tokens: 800,
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
      retrievalWarnings: retrievedData.warnings.length > 0 ? retrievedData.warnings : undefined,
      stockLookup: responseStockLookup,
      earningsRetrieval: earningsAgentResult,
      earningsPackageMeta: earningsRuntimeMeta,
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

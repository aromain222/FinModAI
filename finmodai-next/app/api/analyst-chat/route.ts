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
import { extractPdfStatementPackage } from '@/lib/analyst/pdfFinancialStatements';
import {
  assessPdfModelCoverage,
  assessPdfStatementExtraction,
  isPdfAttachment,
} from '@/lib/analyst/pdfModelSeeding';
import { extractPdfTextServer } from '@/lib/analyst/serverPdfExtraction';
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
  generateAnalystStructuredModel,
  reviseAnalystStructuredModelFromOverrides,
  isModelAdjustmentPrompt,
  reviseAnalystStructuredModel,
  type AnalystStructuredModelAdjustment,
  type AnalystGeneratedModelPayload,
} from '@/lib/analyst/modelChat';
import { savePromptModelRunVersion } from '@/lib/model-generator/runHistory';
import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { ANALYST_SYSTEM_PROMPT, getIntentPrompt } from '@/lib/analyst/prompts';
import {
  runEarningsRetrievalAgent,
  serializeEarningsRetrievalAgentResult,
  type EarningsRetrievalAgentResult,
  type EarningsRetrievalRuntimeMeta,
} from '@/lib/analyst/earningsRetrievalAgent';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/* ────────── Utility Functions ────────── */

const WEB_TOOL_CANDIDATES = [{ type: 'web_search' }, { type: 'web_search_preview' }] as const;
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
  const warnings = attachment.warnings.length > 0 ? `Warnings: ${attachment.warnings.join(' | ')}\n` : '';
  return [
    `Uploaded attachment: ${attachment.name}`,
    `Attachment type: ${attachment.kind}`,
    `MIME type: ${attachment.mimeType}`,
    `Size: ${attachment.sizeKb}kb`,
    warnings ? warnings.trimEnd() : null,
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

async function hydrateAttachmentContext(
  attachment: UploadedAttachmentContext | null,
): Promise<UploadedAttachmentContext | null> {
  if (!attachment) return null;
  if (!isPdfAttachment({ mimeType: attachment.mimeType, name: attachment.name })) {
    return attachment;
  }
  if (!attachment.rawBase64) return attachment;

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
      return {
        ...attachment,
        rawText: undefined,
        statementPackage: undefined,
        statementExtractionStatus: extractionAssessment.statementExtractionStatus,
        statementExtractionWarnings: extraction.warnings,
        isFinancialModelSeedable: extractionAssessment.isFinancialModelSeedable,
      };
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
    return {
      ...attachment,
      summary: extractedText.slice(0, 7000),
      rawText: extractedText.slice(0, 120000),
      ...(statementPackage ? { statementPackage } : {}),
      ...(!statementPackage ? { statementPackage: undefined } : {}),
      statementExtractionStatus: resolvedStatus,
      statementExtractionWarnings: parserWarnings.length > 0 ? parserWarnings : extractionAssessment.statementExtractionWarnings,
      isFinancialModelSeedable: parserFailure ? false : extractionAssessment.isFinancialModelSeedable,
      warnings: attachment.warnings.filter(
        (warning) => !warning.toLowerCase().includes('client-side pdf preview extraction'),
      ),
    };
  } catch (error) {
    console.error('[analyst-chat] pdf attachment hydration crashed', {
      attachment: attachment.name,
      message: error instanceof Error ? redactSecrets(error.message) : 'unknown error',
    });
    const extractionAssessment = assessPdfStatementExtraction({
      failureMode: 'failed',
      authoritative: true,
    });
    return {
      ...attachment,
      statementPackage: undefined,
      statementExtractionStatus: extractionAssessment.statementExtractionStatus,
      statementExtractionWarnings: extractionAssessment.statementExtractionWarnings,
      isFinancialModelSeedable: extractionAssessment.isFinancialModelSeedable,
      warnings: [...attachment.warnings, 'Server-side PDF extraction failed.'],
    };
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
    const sessionId = typeof body?.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId.trim() : null;
    const currentModel =
      body?.currentModel && typeof body.currentModel === 'object'
        ? (body.currentModel as AnalystGeneratedModelPayload)
        : null;
    const modelAdjustment =
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
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (currentDcf && dcfAdjustment) {
      const revisedDcf = await reviseAnalystDcfDemoFromAdjustment(dcfAdjustment, currentDcf);
      if (!revisedDcf) {
        return NextResponse.json(
          { error: 'No valid DCF control adjustments were provided.' },
          { status: 400 },
        );
      }

      return NextResponse.json({
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
      });
    }

    if (currentDcf && dcfEventShockPrompt) {
      const requestedTicker = tickerRaw ?? inferTickerFromPrompt(dcfEventShockPrompt);
      const currentTicker = currentDcf.ticker?.trim().toUpperCase();
      if (requestedTicker && currentTicker && requestedTicker !== currentTicker) {
        return NextResponse.json({
          reply: buildArtifactTickerMismatchReply({
            requestedTicker,
            artifactTicker: currentTicker,
            artifactLabel: `${currentDcf.companyName} (${currentTicker})`,
          }),
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          factsCount: 0,
        });
      }

      const shockedDcf = await reviseAnalystDcfDemoFromEventShock(dcfEventShockPrompt, currentDcf);
      if (!shockedDcf) {
        return NextResponse.json(
          { error: 'No supported event shock was detected for the active DCF.' },
          { status: 400 },
        );
      }

      return NextResponse.json({
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
      });
    }

    if (currentModel && modelAdjustment) {
      let baseModel = currentModel;
      let promptAdjustedModelResult: Awaited<ReturnType<typeof reviseAnalystStructuredModel>> | null = null;
      if (typeof modelAdjustment.prompt === 'string' && modelAdjustment.prompt.trim().length > 0) {
        const promptAdjustedModel = await reviseAnalystStructuredModel(
          modelAdjustment.prompt.trim(),
          baseModel,
          sessionId,
        );
        if (promptAdjustedModel) {
          promptAdjustedModelResult = promptAdjustedModel;
          baseModel = promptAdjustedModel.payload;
        }
      }

      const revisedModel = await reviseAnalystStructuredModelFromOverrides(
        modelAdjustment.changes,
        baseModel,
        sessionId,
      );
      if (!revisedModel && promptAdjustedModelResult) {
        return NextResponse.json({
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
        });
      }
      if (!revisedModel) {
        return NextResponse.json(
          { error: 'No valid structured model control adjustments were provided.' },
          { status: 400 },
        );
      }

      return NextResponse.json({
        reply: revisedModel.reply,
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        generatedModel: revisedModel.payload,
        sources: [
          ...revisedModel.payload.provenanceSummary.sources,
          'Analyst Chat model controls',
        ],
        factsCount: 0,
      });
    }

    const safeMessages = messages
      .filter((m: unknown): m is { role: 'user' | 'assistant' | 'system'; content: string } => {
        if (!m || typeof m !== 'object') return false;
        const row = m as Record<string, unknown>;
        return (
          (row.role === 'user' || row.role === 'assistant' || row.role === 'system') &&
          typeof row.content === 'string' &&
          row.content.trim().length > 0
        );
      })
      .map((m: { role: 'user' | 'assistant' | 'system'; content: string }) => ({
        role: m.role,
        content: m.content,
      }))
      .slice(-12);

    type SafeMessage = { role: 'user' | 'assistant' | 'system'; content: string };
    const lastUserMessage = safeMessages.filter((m: SafeMessage) => m.role === 'user').slice(-1)[0]?.content || '';
    const effectiveUserMessage = attachmentContext
      ? `${lastUserMessage}\n\n${attachmentContextBlock(attachmentContext)}`
      : lastUserMessage;
    const attachmentLabel = attachmentContext
      ? `Uploaded context: ${attachmentContext.name} (${attachmentContext.kind.replace(/_/g, ' ')})`
      : null;
    const tickerFromAttachment = attachmentContext?.signals?.ticker?.toUpperCase();
    const tickerFromMessage = inferTickerFromPrompt(effectiveUserMessage);
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
    const route = overrideRouteFromAttachment(baseRoute, lastUserMessage, attachmentContext);
    const shouldRunEarningsAgent =
      featureFlags.ENABLE_EARNINGS_PACKAGE_CACHE &&
      Boolean(resolvedTicker) &&
      route.intent === 'company_question' &&
      (route.prefersEarningsContext || route.requiresQuarterReportContext);
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
      return NextResponse.json({
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
      });
    }
    if (route.intent === 'company_question') {
      stockLookupPayload = preferCurrentArtifact && currentStock
        ? currentStock
        : await lookupStock(
            resolvedTicker
              ? { prompt: lastUserMessage, ticker: resolvedTicker }
              : { prompt: lastUserMessage }
          );
    }

    if (shouldRunEarningsAgent && resolvedTicker) {
      try {
        const earningsEnvelope = await runEarningsRetrievalAgent({
          ticker: resolvedTicker,
          prompt: lastUserMessage,
        });
        earningsAgentResult = earningsEnvelope?.result ?? null;
        earningsRuntimeMeta = earningsEnvelope?.runtime ?? null;
        if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
          console.info('[analyst-chat] earnings package context resolved', {
            ticker: resolvedTicker,
            packageKey: earningsRuntimeMeta?.packageKey ?? null,
            packageId: earningsRuntimeMeta?.packageId ?? null,
            cacheStatus: earningsRuntimeMeta?.cacheStatus ?? 'miss',
          });
        }
      } catch (error) {
        console.warn('[analyst-chat] earnings retrieval agent failed; falling back to base retrieval', {
          ticker: resolvedTicker,
          message: error instanceof Error ? redactSecrets(error.message) : 'unknown error',
        });
      }
    }

    const macroEventsContext = shouldInjectMacroEventsContext(route, effectiveUserMessage, attachmentContext)
      ? await getMarketEvents({
          origin: req.nextUrl.origin,
          view: 'active',
          limit: 5,
          provider: 'live',
        }).catch(() => null)
      : null;
    const macroEventsBlock =
      macroEventsContext && macroEventsContext.events.length > 0
        ? `ACTIVE MARKET EVENT CONTEXT (use this to ground macro answers if relevant):\n\n${serializeMarketEventsContext(
            macroEventsContext.events,
          )}`
        : null;

    if (isVisualizationPrompt(lastUserMessage)) {
      const comparisonVisualization = await buildComparisonVisualizationFromPrompt(lastUserMessage);
      if (comparisonVisualization) {
        return NextResponse.json({
          reply: `Here is a standalone comparison chart for ${comparisonVisualization.visualization.contextLabel}. ${comparisonVisualization.explanation}`,
          fallback: false,
          mode: 'live',
          route: route.intent,
          visualization: comparisonVisualization.visualization,
          sources: comparisonVisualization.visualization.notes,
          factsCount: 0,
          attachmentUsed: attachmentLabel,
        });
      }

      const singleCompanyRevenueGrowthVisualization = await buildSingleCompanyRevenueGrowthVisualization({
        prompt: lastUserMessage,
        ticker: resolvedTicker,
      });
      if (singleCompanyRevenueGrowthVisualization) {
        return NextResponse.json({
          reply: `Here is a standalone revenue growth chart for ${singleCompanyRevenueGrowthVisualization.visualization.contextLabel}. ${singleCompanyRevenueGrowthVisualization.explanation}`,
          fallback: false,
          mode: 'live',
          route: route.intent,
          visualization: singleCompanyRevenueGrowthVisualization.visualization,
          sources: singleCompanyRevenueGrowthVisualization.sources,
          factsCount: 0,
          attachmentUsed: attachmentLabel,
        });
      }

      if (!currentModel && !currentDcf && !currentStock && isRevenueForecastVisualizationPrompt(lastUserMessage) && resolvedTicker) {
        const demo = await generateAnalystDcfDemo({
          prompt: effectiveUserMessage,
          explicitTicker: resolvedTicker,
          attachmentStatementSnapshot: attachmentContext?.statementPackage?.snapshot ?? null,
        });
        const visualization = buildRevenueForecastVisualizationFromDcf(demo.payload);
        return NextResponse.json({
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
        });
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
      const promptSelectedModelType = classifyPrompt(lastUserMessage);
      const modelType =
        promptSelectedModelType ??
        (!attachmentContext?.statementPackage ? attachmentContext?.signals?.modelTypeHint ?? null : null);
      const requestedPdfModelType =
        modelType === 'DCF' || modelType === 'THREE_STATEMENT' || modelType === 'COMPS' || modelType === 'LBO'
          ? modelType
          : null;
      const isFinancialPdfRequest = Boolean(
        attachmentContext &&
          isPdfAttachment({ mimeType: attachmentContext.mimeType, name: attachmentContext.name })
      );
      const coreTemplateModel = detectCoreTemplatePrompt(lastUserMessage);

      if (shouldVisualizeCurrentDcf && currentDcf) {
        const visualization = buildVisualizationFromCurrentArtifact({ currentDcf });
        return NextResponse.json({
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
        });
      }

      if (shouldVisualizeCurrentModel && currentModel) {
        const visualization = buildVisualizationFromCurrentArtifact({ currentModel });
        return NextResponse.json({
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
        });
      }

      if (shouldReviseCurrentModel && currentModel) {
        const revisedModel = await reviseAnalystStructuredModel(lastUserMessage, currentModel, sessionId);
        if (revisedModel) {
          try {
            await savePromptModelRunVersion({
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
            });
          } catch (error) {
            console.error('[analyst-chat] unable to persist revised model run', error);
          }

          return NextResponse.json({
            reply: revisedModel.reply,
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            generatedModel: revisedModel.payload,
            sources: [
              ...revisedModel.payload.provenanceSummary.sources,
              'CapitalBase local model templates',
              'Conversation follow-up model adjustment',
            ],
            factsCount: 0,
            attachmentUsed: attachmentLabel,
          });
        }
      }

      if (shouldApplyCurrentDcfEventShock && currentDcf) {
        const shockedDcf = await reviseAnalystDcfDemoFromEventShock(lastUserMessage, currentDcf);
        if (shockedDcf) {
          return NextResponse.json({
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
          });
        }
      }

      if (shouldReviseCurrentDcf && currentDcf) {
        const revisedDcf = await reviseAnalystDcfDemo(lastUserMessage, currentDcf);
        if (revisedDcf) {
          return NextResponse.json({
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
          });
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
          return NextResponse.json({
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
          });
        }

        if (requestedPdfModelType) {
          const coverage = assessPdfModelCoverage(requestedPdfModelType, attachmentContext?.statementPackage);
          if (!coverage.ok) {
            return NextResponse.json({
              reply: buildFinancialPdfModelFailureReply({
                modelType: requestedPdfModelType,
                status: 'trusted',
                extractionWarnings: attachmentContext?.statementExtractionWarnings ?? [],
                missingCoverage: coverage.missing,
              }),
              fallback: false,
              mode: 'live',
              route: 'financial_model',
              sources: [
                'Attachment PDF statement package',
                `Missing model coverage: ${coverage.missing.join(', ')}`,
              ],
              factsCount: 0,
              attachmentUsed: attachmentLabel,
            });
          }
        }
      }

      if (modelType && modelType !== 'DCF') {
        const normalizedModelPrompt =
          classifyPrompt(lastUserMessage) === null && attachmentContext?.signals?.modelTypeHint === modelType
            ? `Build a ${modelType.replace(/_/g, ' ')} model using the uploaded context.\n\n${effectiveUserMessage}`
            : effectiveUserMessage;
        const generatedModel = await generateAnalystStructuredModel(normalizedModelPrompt, sessionId, {
          attachmentStatementSnapshot:
            attachmentContext?.isFinancialModelSeedable === true
              ? attachmentContext?.statementPackage?.snapshot ?? null
              : null,
        });
        if (generatedModel) {
          try {
            await savePromptModelRunVersion({
              surface: 'analyst_chat',
              sessionId,
              prompt: lastUserMessage,
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
            });
          } catch (error) {
            console.error('[analyst-chat] unable to persist generated model run', error);
          }

          return NextResponse.json({
            reply: generatedModel.reply,
            fallback: false,
            mode: 'live',
            route: 'financial_model',
            generatedModel: generatedModel.payload,
            sources: [
              ...(attachmentContext?.isFinancialModelSeedable === true &&
              attachmentContext?.statementPackage?.snapshot?.source === 'attachment_pdf_statement'
                ? ['Attachment PDF statement package']
                : []),
              ...generatedModel.payload.provenanceSummary.sources,
              'CapitalBase local model templates',
              'Deterministic prompt extraction and defaults',
            ],
            factsCount: 0,
            attachmentUsed: attachmentLabel,
          });
        }
      }

      if (coreTemplateModel) {
        return NextResponse.json({
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
        });
      }

      const demo = await generateAnalystDcfDemo({
        prompt:
          attachmentContext?.signals?.modelTypeHint === 'DCF' || attachmentContext?.kind === 'earnings_report'
            ? `Build a DCF using the uploaded context.\n\n${effectiveUserMessage}`
            : effectiveUserMessage,
        explicitTicker: resolvedTicker,
        attachmentStatementSnapshot:
          attachmentContext?.isFinancialModelSeedable === true
            ? attachmentContext?.statementPackage?.snapshot ?? null
            : null,
      });

      return NextResponse.json({
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
      });
    }

    if (shouldVisualizeCurrentStock && currentStock) {
      const visualization = buildVisualizationFromCurrentArtifact({ currentStock });
      return NextResponse.json({
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
      });
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
      return NextResponse.json({
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
      });
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

        return NextResponse.json({
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
        });
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
        preferSilent: Boolean(stockLookupPayload),
      });
      return NextResponse.json({
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
      }, { status: 200 });
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

    return NextResponse.json({
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
    });
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
        preferSilent: Boolean(stockLookupPayload),
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
    }, { status: 200 });
  }
}

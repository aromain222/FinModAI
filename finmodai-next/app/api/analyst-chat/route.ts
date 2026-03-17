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
import { routeAnalystQuery, type AnalystRoute } from '@/lib/analyst/router';
import { retrieveDataForRoute } from '@/lib/analyst/dataRetrieval';
import { extractVerifiedFacts, serializeFactsForContext, type VerifiedFacts } from '@/lib/analyst/factsExtractor';
import { gatherAnalystRetrievalContext, inferTickerFromPrompt } from '@/lib/analyst/retrieval';
import { generateAnalystDcfDemo, reviseAnalystDcfDemo, type AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import {
  generateAnalystStructuredModel,
  isModelAdjustmentPrompt,
  reviseAnalystStructuredModel,
  type AnalystGeneratedModelPayload,
} from '@/lib/analyst/modelChat';
import { savePromptModelRunVersion } from '@/lib/model-generator/runHistory';
import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { getIntentPrompt } from '@/lib/analyst/prompts';
import { getOpenAIKeyCandidates, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { lookupStock } from '@/lib/data/company/lookupStock';
import { detectCoreTemplatePrompt } from '@/lib/analyst/coreModelTemplates';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';
import { getMarketEvents } from '@/lib/news/marketEventsPipeline';
import type { MarketEvent } from '@/lib/news/marketEventsTypes';
import {
  buildComparisonVisualizationFromPrompt,
  buildRevenueForecastVisualizationFromDcf,
  buildVisualizationFromCurrentArtifact,
  revenueDriverSummary,
} from '@/lib/analyst/visualization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/* ────────── Utility Functions ────────── */

const WEB_TOOL_CANDIDATES = [{ type: 'web_search' }, { type: 'web_search_preview' }] as const;
const ANALYST_SYSTEM_PROMPT = `You are CapitalBase Analyst, a professional financial analyst similar to a buy-side research analyst or macro strategist.

Your job is to interpret market events, economic data, and company information and translate them into investor-grade financial analysis.

Always reason through the chain:
Event -> Economic Drivers -> Market Transmission -> Sector Impact -> Company Impact

Focus on:
- macroeconomic forces
- market structure
- sector implications
- company-level impact
- financial modeling implications

Write in clear sections using bullet points and short, dense paragraphs when needed.
Do not summarize mechanically. Prioritize the few drivers that actually matter.
Every answer should make the causal link explicit: what changed, why it matters economically, how markets reprice, and who is exposed.
When data is provided, use it directly. Do not generalize away from the numbers.
When the evidence is incomplete, narrow the claim rather than becoming vague.
Avoid filler phrases like "investors will watch closely" unless you say exactly what they should watch and why.

When analyzing a market event, use this exact format:
EVENT
SUMMARY
KEY FACTS
DRIVERS
TRANSMISSION PATH
MARKET IMPACT
WINNERS
LOSERS
WATCH NEXT

For MARKET IMPACT, only include relevant sections from:
- Equities
- Rates
- FX
- Commodities
- Credit

In TRANSMISSION PATH, explicitly show:
Event -> economic effect -> market reaction

When analyzing a company or earnings event, use this exact format:
COMPANY OVERVIEW
KEY METRICS
DRIVERS
COMPETITIVE POSITION
MARKET IMPLICATIONS
VALUATION CONTEXT
WATCH NEXT

For KEY METRICS, explicitly cover:
- Revenue
- Margins
- Growth
- Guidance

When generating a financial model framework, use this exact format:
ASSUMPTIONS
MODEL STRUCTURE

Under ASSUMPTIONS, explicitly cover:
- Revenue growth
- Margins
- Tax rate
- Capex
- Working capital

Under MODEL STRUCTURE, explicitly cover:
- Income Statement
- Balance Sheet
- Cash Flow

Ensure:
- Statements are linked logically
- Cash flow reconciles with balance sheet cash movement
- Assumptions are clearly labeled and traceable
- Use formulas and financial logic where applicable

Avoid generic explanations.
Think like an investor or analyst writing a research note.`;

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

function isVisualizationPrompt(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /\b(graph|chart|cgart|visuali[sz]e|plot|trend line|show.*chart|show.*graph)\b/.test(text) &&
    !/\b(download|export)\b/.test(text)
  );
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
    'Use this uploaded artifact as primary context when the user asks to explain, interpret, or turn it into a model.',
    `Attachment summary:\n${attachment.summary}`,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n');
}

function overrideRouteFromAttachment(
  route: AnalystRoute,
  userMessage: string,
  attachment: UploadedAttachmentContext | null,
): AnalystRoute {
  if (!attachment) return route;
  const text = userMessage.toLowerCase();
  const genericExplain =
    /\b(explain|interpret|summari[sz]e|walk me through|what matters|what are the drivers|driving factors|what is this|read this|analy[sz]e this|what stands out|break this down)\b/.test(
      text,
    );
  const genericModelingAsk =
    /\b(turn this into|use this to build|build from this|model this|create.*from this|make a model from this|use this report|plug this in)\b/.test(
      text,
    ) ||
    (/\b(build|create|generate|run|make|turn|convert)\b/.test(text) &&
      /\b(model|dcf|lbo|comps|three[- ]?statement|3[- ]?statement|scorecard|valuation|forecast|operating model)\b/.test(
        text,
      ));
  const hasStructuredSignals =
    Boolean(attachment.signals?.ticker) ||
    Boolean(attachment.signals?.companyName) ||
    Boolean(attachment.signals?.fiscalPeriod) ||
    Boolean(attachment.signals?.modelTypeHint) ||
    Boolean(attachment.signals?.extractedMetrics && attachment.signals.extractedMetrics.length > 0);

  if (attachment.kind === 'model_workbook' && genericModelingAsk) {
    return {
      intent: 'financial_model',
      tickers: route.tickers,
      requiresLiveData: false,
      requiresNews: false,
      requiresFinancials: true,
    };
  }

  if (attachment.kind === 'model_workbook' && (genericExplain || route.intent === 'general_finance')) {
    return {
      intent: 'general_finance',
      tickers: route.tickers,
      requiresLiveData: false,
      requiresNews: false,
      requiresFinancials: false,
    };
  }

  if (attachment.kind === 'earnings_report') {
    if (genericModelingAsk || route.intent === 'financial_model') {
      return {
        intent: 'financial_model',
        tickers: route.tickers,
        requiresLiveData: false,
        requiresNews: false,
        requiresFinancials: true,
      };
    }
    if (genericExplain || route.intent === 'general_finance') {
      return {
        intent: 'company_question',
        tickers: route.tickers,
        requiresLiveData: false,
        requiresNews: false,
        requiresFinancials: true,
      };
    }
  }

  if ((attachment.kind === 'document' || attachment.kind === 'spreadsheet') && genericModelingAsk) {
    return {
      intent: 'financial_model',
      tickers: route.tickers,
      requiresLiveData: false,
      requiresNews: false,
      requiresFinancials: true,
    };
  }

  if (hasStructuredSignals && genericExplain && route.intent === 'general_finance') {
    return {
      intent: attachment.kind === 'model_workbook' ? 'general_finance' : 'company_question',
      tickers: route.tickers,
      requiresLiveData: false,
      requiresNews: false,
      requiresFinancials: attachment.kind !== 'model_workbook',
    };
  }

  return route;
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
      `Use this company context unless the user clearly pivots away from it.`,
    ].join('\n');
  }

  return null;
}

async function hydrateAttachmentContext(
  attachment: UploadedAttachmentContext | null,
): Promise<UploadedAttachmentContext | null> {
  if (!attachment) return null;
  if (attachment.mimeType !== 'application/pdf' && !/\.pdf$/i.test(attachment.name)) {
    return attachment;
  }
  if (!attachment.rawBase64) return attachment;

  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfBuffer = Buffer.from(attachment.rawBase64, 'base64');
    const parser = new pdfParseModule.PDFParse({ data: pdfBuffer });
    const parsed = await parser.getText();
    await parser.destroy();
    const extractedText = parsed.text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!extractedText) return attachment;
    return {
      ...attachment,
      summary: extractedText.slice(0, 7000),
      rawText: extractedText.slice(0, 120000),
      warnings: attachment.warnings.filter(
        (warning) => !warning.toLowerCase().includes('client-side pdf preview extraction'),
      ),
    };
  } catch (error) {
    return {
      ...attachment,
      warnings: [...attachment.warnings, 'Server-side PDF extraction failed; using limited preview text instead.'],
    };
  }
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

/* ────────── Fallback Reply Builder ────────── */

async function buildFallbackReply(params: {
  ticker?: string;
  facts?: VerifiedFacts;
  userMessage: string;
  reason: 'missing_key' | 'auth_failed' | 'rate_limited' | 'model_unavailable' | 'data_unavailable';
}): Promise<string> {
  const headerByReason: Record<typeof params.reason, string> = {
    missing_key: 'OpenAI key is not configured. Returning retrieved data context only.',
    auth_failed: 'OpenAI authentication failed. Returning retrieved data context only.',
    rate_limited: 'OpenAI rate limit exceeded. Returning retrieved data context only.',
    model_unavailable: 'OpenAI is temporarily unavailable. Returning retrieved data context only.',
    data_unavailable: 'The requested model could not be built because company financial data is not available or complete for this ticker right now.',
  };
  const header = headerByReason[params.reason];

  if (params.facts) {
    const factBlock = serializeFactsForContext(params.facts);
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

  try {
    const body = await req.json();

    /* ── Parse request ── */
    const tickerRaw = typeof body?.ticker === 'string' && body.ticker.trim().length > 0
      ? body.ticker.trim().toUpperCase()
      : undefined;
    const attachmentContextInput = isUploadedAttachmentContext(body?.attachmentContext) ? body.attachmentContext : null;
    const attachmentContext = await hydrateAttachmentContext(attachmentContextInput);
    const sessionId = typeof body?.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId.trim() : null;
    const currentModel =
      body?.currentModel && typeof body.currentModel === 'object'
        ? (body.currentModel as AnalystGeneratedModelPayload)
        : null;
    const currentDcf =
      body?.currentDcf && typeof body.currentDcf === 'object'
        ? (body.currentDcf as AnalystDcfDemoPayload)
        : null;
    const currentStock =
      body?.currentStock && typeof body.currentStock === 'object'
        ? (body.currentStock as StockLookupResult)
        : null;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

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
    const currentArtifactBlock = currentArtifactContextBlock({ currentModel, currentDcf, currentStock });
    const tickerFromCurrentArtifact = artifactTickerFromContext({ currentModel, currentDcf, currentStock });
    const resolvedTicker = tickerRaw ?? tickerFromMessage ?? tickerFromAttachment ?? tickerFromCurrentArtifact;
    fallbackTicker = resolvedTicker;
    fallbackUserMessage = lastUserMessage;

    /* ── Step 1: Route the question ── */
    const baseRoute: AnalystRoute = routeAnalystQuery(
      attachmentContext ? `${lastUserMessage}\nAttachment type: ${attachmentContext.kind}` : lastUserMessage,
      resolvedTicker,
    );
    const route = overrideRouteFromAttachment(baseRoute, lastUserMessage, attachmentContext);
    const shouldReviseCurrentModel =
      currentModel &&
      isModelAdjustmentPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldReviseCurrentDcf =
      currentDcf &&
      isModelAdjustmentPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldVisualizeCurrentModel =
      currentModel &&
      isVisualizationPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldVisualizeCurrentDcf =
      currentDcf &&
      isVisualizationPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    const shouldVisualizeCurrentStock =
      currentStock &&
      isVisualizationPrompt(lastUserMessage) &&
      !classifyPrompt(lastUserMessage);
    if (route.intent === 'company_question' && resolvedTicker) {
      stockLookupPayload = await lookupStock({ prompt: lastUserMessage, ticker: resolvedTicker });
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

      if (!currentModel && !currentDcf && !currentStock && isRevenueForecastVisualizationPrompt(lastUserMessage) && resolvedTicker) {
        const demo = await generateAnalystDcfDemo({
          prompt: effectiveUserMessage,
          explicitTicker: resolvedTicker,
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
      const modelType = classifyPrompt(lastUserMessage) ?? attachmentContext?.signals?.modelTypeHint ?? null;
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

      if (modelType && modelType !== 'DCF') {
        const normalizedModelPrompt =
          classifyPrompt(lastUserMessage) === null && attachmentContext?.signals?.modelTypeHint === modelType
            ? `Build a ${modelType.replace(/_/g, ' ')} model using the uploaded context.\n\n${effectiveUserMessage}`
            : effectiveUserMessage;
        const generatedModel = await generateAnalystStructuredModel(normalizedModelPrompt, sessionId);
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
      });

      return NextResponse.json({
        reply: demo.reply,
        fallback: false,
        mode: 'live',
        route: 'financial_model',
        dcfDemo: demo.payload,
        sources: [
          `Demo snapshot cache — ${demo.payload.source}`,
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
    const retrievedData = await retrieveDataForRoute(route, lastUserMessage);

    /* ── Step 3: Extract verified facts ── */
    const facts = extractVerifiedFacts(route, retrievedData);
    verifiedFacts = facts;
    const factsContext = serializeFactsForContext(facts);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[analyst-chat] facts extracted:', {
        events: facts.events.length,
        companies: facts.companies.length,
        numbers: facts.numbers.length,
        sources: facts.sources.length,
        dataGaps: facts.dataGaps.length,
      });
    }

    /* ── Check for OpenAI keys ── */
    const openAiKeys = getOpenAIKeyCandidates('user');
    if (openAiKeys.length === 0) {
      const fallback = await buildFallbackReply({
        ticker: resolvedTicker,
        facts,
        userMessage: lastUserMessage,
        reason: 'missing_key',
      });
      return NextResponse.json({
        reply: fallback,
        fallback: true,
        mode: 'fallback',
        reason: 'missing_key',
        route: route.intent,
        factsCount: facts.numbers.length + facts.events.length,
        stockLookup: stockLookupPayload,
        attachmentUsed: attachmentLabel,
      }, { status: 200 });
    }

    /* ── Step 4: Build LLM messages with intent-specific prompt + verified facts ── */
    const useWebTools = route.requiresLiveData && facts.events.length === 0 && facts.numbers.length === 0;
    const intentPrompt = getIntentPrompt(route.intent);

    const inputMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: ANALYST_SYSTEM_PROMPT },
      ...(intentPrompt ? [{ role: 'system' as const, content: intentPrompt }] : []),
      {
        role: 'system',
        content: `VERIFIED FACTS CONTEXT (retrieved and verified before this conversation — base your analysis on these):\n\n${factsContext}`,
      },
      ...(macroEventsBlock ? [{ role: 'system' as const, content: macroEventsBlock }] : []),
      ...(currentArtifactBlock ? [{ role: 'system' as const, content: currentArtifactBlock }] : []),
      ...(attachmentContext ? [{ role: 'system' as const, content: attachmentContextBlock(attachmentContext) }] : []),
      ...safeMessages,
    ];

    if (!inputMessages.some(m => m.role === 'user')) {
      inputMessages.push({ role: 'user', content: 'Provide a concise market and fundamentals summary.' });
    }

    /* ── Step 5: Call OpenAI with verified facts as grounding ── */
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

        if (!replyText) {
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

    if (!replyText) {
      if (sawAuthError) {
        throw new Error('OpenAI authentication failed. Verify OPENAI_API_KEY and restart.');
      }
      throw (lastError instanceof Error ? lastError : new Error('OpenAI request failed across all model candidates'));
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
      ],
      factsCount: facts.numbers.length + facts.events.length,
      dataGaps: facts.dataGaps.length > 0 ? facts.dataGaps : undefined,
      retrievalWarnings: retrievedData.warnings.length > 0 ? retrievedData.warnings : undefined,
      stockLookup: stockLookupPayload,
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
      stockLookup: stockLookupPayload,
    }, { status: 200 });
  }
}

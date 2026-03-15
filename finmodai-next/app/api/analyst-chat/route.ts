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

function classifyFailureReason(error: unknown): 'missing_key' | 'auth_failed' | 'rate_limited' | 'model_unavailable' {
  if (isAuthError(error)) return 'auth_failed';
  if (isRateLimitError(error)) return 'rate_limited';
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
    /\b(graph|chart|visuali[sz]e|plot|trend line|show.*chart|show.*graph)\b/.test(text) &&
    !/\b(download|export)\b/.test(text)
  );
}

/* ────────── Fallback Reply Builder ────────── */

async function buildFallbackReply(params: {
  ticker?: string;
  facts?: VerifiedFacts;
  userMessage: string;
  reason: 'missing_key' | 'auth_failed' | 'rate_limited' | 'model_unavailable';
}): Promise<string> {
  const headerByReason: Record<typeof params.reason, string> = {
    missing_key: 'OpenAI key is not configured. Returning retrieved data context only.',
    auth_failed: 'OpenAI authentication failed. Returning retrieved data context only.',
    rate_limited: 'OpenAI rate limit exceeded. Returning retrieved data context only.',
    model_unavailable: 'OpenAI is temporarily unavailable. Returning retrieved data context only.',
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
    const pdfText = typeof body?.pdfText === 'string' ? body.pdfText : null;
    const sessionId = typeof body?.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId.trim() : null;
    const currentModel =
      body?.currentModel && typeof body.currentModel === 'object'
        ? (body.currentModel as AnalystGeneratedModelPayload)
        : null;
    const currentDcf =
      body?.currentDcf && typeof body.currentDcf === 'object'
        ? (body.currentDcf as AnalystDcfDemoPayload)
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
    const tickerFromMessage = inferTickerFromPrompt(lastUserMessage);
    const resolvedTicker = tickerRaw ?? tickerFromMessage;
    fallbackTicker = resolvedTicker;
    fallbackUserMessage = lastUserMessage;

    /* ── Step 1: Route the question ── */
    const route: AnalystRoute = routeAnalystQuery(lastUserMessage, resolvedTicker);
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
    if (route.intent === 'company_question' && resolvedTicker) {
      stockLookupPayload = await lookupStock({ prompt: lastUserMessage, ticker: resolvedTicker });
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
      const modelType = classifyPrompt(lastUserMessage);
      const coreTemplateModel = detectCoreTemplatePrompt(lastUserMessage);

      if (shouldVisualizeCurrentDcf && currentDcf) {
        return NextResponse.json({
          reply: `Here is the visual DCF view for ${currentDcf.companyName} (${currentDcf.ticker}). The card below shows the base forecast and scenario value-per-share chart for the current assumptions.`,
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          dcfDemo: currentDcf,
          sources: [
            `Demo snapshot cache — ${currentDcf.source}`,
            ...(currentDcf.asOfDate ? [`Snapshot updated ${currentDcf.asOfDate}`] : []),
            'Conversation follow-up visualization request',
          ],
          factsCount: 0,
        });
      }

      if (shouldVisualizeCurrentModel && currentModel) {
        return NextResponse.json({
          reply: `Here is the current ${currentModel.modelType.replace(/_/g, ' ')} model view. The structured card below reflects the latest assumptions and can still be exported to Excel.`,
          fallback: false,
          mode: 'live',
          route: 'financial_model',
          generatedModel: currentModel,
          sources: [
            ...currentModel.provenanceSummary.sources,
            'Conversation follow-up visualization request',
          ],
          factsCount: 0,
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
          });
        }
      }

      if (modelType && modelType !== 'DCF') {
        const generatedModel = await generateAnalystStructuredModel(lastUserMessage, sessionId);
        if (generatedModel) {
          try {
            await savePromptModelRunVersion({
              surface: 'analyst_chat',
              sessionId,
              prompt: lastUserMessage,
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
        });
      }

      const demo = await generateAnalystDcfDemo({
        prompt: lastUserMessage,
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
      ...(pdfText ? [{ role: 'system' as const, content: `Uploaded memo excerpt: ${pdfText.slice(0, 2000)}` }] : []),
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
      sources: facts.sources.slice(0, 8),
      factsCount: facts.numbers.length + facts.events.length,
      dataGaps: facts.dataGaps.length > 0 ? facts.dataGaps : undefined,
      retrievalWarnings: retrievedData.warnings.length > 0 ? retrievedData.warnings : undefined,
      stockLookup: stockLookupPayload,
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

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { APP_NAME } from '@/lib/branding';
import { getOpenAIKeyCandidates, getOpenAIModelCandidates } from '@/lib/openaiKey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const SYSTEM_PROMPT = `You are ${APP_NAME}, a sell-side/PE analyst and ChatGPT-style research assistant.
Provide concise, structured insights. Use ticker context when provided; otherwise respond generally.
Always cite assumptions, avoid investment advice, and reference any uploaded memo text when relevant.
Output plain text only (no markdown markers like **, __, ##, or ---).
When asked for latest/current/recent facts, provide concrete numbers with period labels and source URLs.
Never use placeholders such as XX, $XX, or "approximately $XX billion". If exact values are unavailable, state that explicitly.
Default response format unless user asks otherwise:
1) Direct answer paragraph in plain language (3-5 sentences, no jargon dumping).
2) If the user asks "compare/vs/peers", add a second comparison paragraph.
3) Optional "What to check next" with up to 3 concise bullets.
Never output malformed inline bullets like "- item - item - item".`;

type WebSnippet = {
  title: string;
  url: string;
  snippet: string;
};

const WEB_TOOL_CANDIDATES = [{ type: 'web_search' }, { type: 'web_search_preview' }] as const;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function domainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

function truncateText(value: string, max = 240): string {
  if (value.length <= max) return value;
  const sliced = value.slice(0, max);
  const cut = sliced.lastIndexOf(' ');
  return `${(cut > max * 0.6 ? sliced.slice(0, cut) : sliced).trim()}...`;
}

function parseDuckResultUrl(url: string): string {
  if (!url.startsWith('/l/?')) return url;
  try {
    const searchParams = new URLSearchParams(url.slice(4));
    const resolved = searchParams.get('uddg');
    return resolved ? decodeURIComponent(resolved) : url;
  } catch {
    return url;
  }
}

async function fetchTextWithTimeout(url: string, timeoutMs = 4500): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': `${APP_NAME} AnalystBot/1.0`,
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeDuckDuckGoSnippets(query: string): Promise<WebSnippet[]> {
  const html = await fetchTextWithTimeout(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];

  const titleMatches = Array.from(html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g));
  const snippetMatches = Array.from(
    html.matchAll(/<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g)
  );

  const items: WebSnippet[] = [];
  for (let i = 0; i < Math.min(titleMatches.length, 5); i += 1) {
    const hrefRaw = titleMatches[i]?.[1] ?? '';
    const titleRaw = titleMatches[i]?.[2] ?? '';
    const snippetRaw = snippetMatches[i]?.[1] ?? '';
    const url = parseDuckResultUrl(hrefRaw);
    const title = stripHtml(titleRaw);
    const snippet = truncateText(stripHtml(snippetRaw));
    if (!/^https?:\/\//i.test(url) || title.length === 0 || snippet.length === 0) continue;
    items.push({ title, url, snippet });
  }
  return items;
}

async function fetchWikipediaSnippet(query: string): Promise<WebSnippet[]> {
  const searchResponse = await fetchTextWithTimeout(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`
  );
  if (!searchResponse) return [];

  let pageTitle = '';
  try {
    const payload = JSON.parse(searchResponse) as unknown[];
    const titles = Array.isArray(payload?.[1]) ? payload[1] : [];
    pageTitle = typeof titles[0] === 'string' ? titles[0] : '';
  } catch {
    return [];
  }
  if (!pageTitle) return [];

  const summaryResponse = await fetchTextWithTimeout(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
  );
  if (!summaryResponse) return [];

  try {
    const payload = JSON.parse(summaryResponse) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
    const title = (payload.title || pageTitle).trim();
    const extract = truncateText((payload.extract || '').replace(/\s+/g, ' ').trim(), 320);
    const url = payload.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/\s+/g, '_'))}`;
    if (!title || !extract) return [];
    return [{ title, url, snippet: extract }];
  } catch {
    return [];
  }
}

function buildWebQuery(ticker: string | undefined, userMessage: string): string {
  const base = userMessage.trim().replace(/\?+$/, '');
  if (ticker && base.length > 0) return `${ticker} ${base}`;
  if (ticker) return `${ticker} company profile business model`;
  return base || 'public company business overview';
}

function dedupeWebSnippets(snippets: WebSnippet[]): WebSnippet[] {
  const seen = new Set<string>();
  const out: WebSnippet[] = [];
  for (const snippet of snippets) {
    const key = snippet.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(snippet);
    if (out.length >= 3) break;
  }
  return out;
}

function needsLiveFactSourcing(userMessage: string): boolean {
  if (!userMessage) return false;
  return /\b(latest|most recent|current|today|as of|this quarter|last quarter|recent quarter|revenue|ebitda|earnings|guidance|market cap)\b/i.test(
    userMessage
  );
}

function hasPlaceholderFinanceNumbers(text: string): boolean {
  if (!text) return false;
  return /\b(?:\$?\s*X{2,}|\$?\s*xx|approximately\s+\$?\s*X{2,})\b/i.test(text);
}

function lacksConcreteNumbersForFactQuery(text: string, askedForFacts: boolean): boolean {
  if (!askedForFacts) return false;
  const hasNumbers = /\d/.test(text);
  const tooGeneric = /\bas of the latest available data\b/i.test(text);
  return !hasNumbers || tooGeneric;
}

async function gatherWebContext(ticker: string | undefined, userMessage: string): Promise<{ context: string; sourceLines: string[] }> {
  if ((process.env.ANALYST_WEB_CONTEXT ?? 'true') === 'false') {
    return { context: '', sourceLines: [] };
  }
  const query = buildWebQuery(ticker, userMessage);
  if (query.length < 3) return { context: '', sourceLines: [] };

  const [wiki, ddg] = await Promise.all([fetchWikipediaSnippet(query), scrapeDuckDuckGoSnippets(query)]);
  const snippets = dedupeWebSnippets([...wiki, ...ddg]);
  if (snippets.length === 0) return { context: '', sourceLines: [] };

  const context = snippets
    .map((item, idx) => `[${idx + 1}] ${item.title} (${domainLabel(item.url)}): ${item.snippet}`)
    .join('\n');
  const sourceLines = snippets.map((item, idx) => `[${idx + 1}] ${item.title} (${domainLabel(item.url)}) - ${item.url}`);
  return { context, sourceLines };
}

function stripMarkdownArtifacts(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '').trim())
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*\d+[.)]\s+/gm, '- ')
    .replace(/^\s*[•*+]\s+/gm, '- ')
    .replace(/\n\s*---+\s*\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeInlineBullets(text: string): string {
  return text
    .replace(/Key points:\s*-\s*/gi, 'Key points:\n- ')
    .replace(/What to check next:\s*-\s*/gi, 'What to check next:\n- ')
    .replace(/\s-\s(?=[A-Z0-9])/g, '\n- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatSkimmableReply(raw: string, userMessage: string, sourceLines: string[]): string {
  const cleaned = normalizeInlineBullets(stripMarkdownArtifacts(raw));
  if (!cleaned) return raw.trim();

  const plain = cleaned.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const sentences = splitSentences(plain);
  if (sentences.length === 0) return cleaned;

  const asksComparison = /\b(compare|comparison|vs\.?|versus|peer|competitor|landscape)\b/i.test(userMessage);
  const asksChecklist = /\b(what to check|watch|monitor|next)\b/i.test(userMessage);

  const paragraphOne = sentences.slice(0, 3).join(' ');
  const paragraphTwo = sentences.slice(3, 6).join(' ');
  const paragraphThree = asksComparison ? sentences.slice(6, 9).join(' ') : '';

  const sections: string[] = [paragraphOne];
  if (paragraphTwo) sections.push(paragraphTwo);
  if (paragraphThree) sections.push(paragraphThree);

  const checklist = sentences.slice(asksComparison ? 9 : 6, asksComparison ? 12 : 9);
  if (checklist.length > 0 || asksChecklist) {
    const bullets = checklist.length > 0 ? checklist : ['Track confirmation in rates, USD, and credit spreads before increasing conviction.'];
    sections.push(`What to check next:\n- ${bullets.join('\n- ')}`);
  }

  const shouldShowSources = /\b(latest|recent|today|compare|overview|about|profile|business|how\b.*\bmake)\b/i.test(userMessage);
  if (shouldShowSources && sourceLines.length > 0) {
    sections.push(`Sources checked:\n- ${sourceLines.slice(0, 3).join('\n- ')}`);
  }

  return sections.join('\n\n').trim();
}

function redactSecrets(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
}

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { status?: number; message?: string; error?: { code?: string; type?: string; message?: string } };
  const message = String(row.message || row.error?.message || '').toLowerCase();
  return row.status === 401 || message.includes('incorrect api key') || message.includes('invalid api key');
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { status?: number; message?: string; error?: { code?: string; type?: string; message?: string } };
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

function fmtMillions(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US')}`;
}

async function buildDeterministicFallbackReply(params: {
  ticker?: string;
  contextualSummary: string;
  userMessage: string;
  reason: 'missing_key' | 'auth_failed' | 'rate_limited' | 'model_unavailable';
}): Promise<string> {
  const headerByReason: Record<typeof params.reason, string> = {
    missing_key: 'OpenAI key is not configured in this runtime. Returning deterministic demo context instead.',
    auth_failed: 'OpenAI authentication failed (invalid/revoked key in runtime). Returning deterministic demo context instead.',
    rate_limited: 'OpenAI rate limit is currently exceeded. Returning deterministic demo context instead.',
    model_unavailable: 'OpenAI is temporarily unavailable. Returning deterministic demo context instead.',
  };
  const header = headerByReason[params.reason];

  if (!params.ticker) {
    return `${header}\n\n${params.contextualSummary || 'General chat context (no ticker provided).'}`;
  }

  try {
    const { getDemoFundamentals } = await import('@/lib/data/providers/demoProvider');
    const fundamentals = await getDemoFundamentals(params.ticker);
    if (!fundamentals) {
      return `${header}\n\nTicker focus: ${params.ticker}\nNo demo fundamentals found for this ticker.`;
    }

    const netDebt =
      typeof fundamentals.totalDebt === 'number' && typeof fundamentals.cash === 'number'
        ? fundamentals.totalDebt - fundamentals.cash
        : null;
    const question = params.userMessage.trim() || 'the current fundamentals';

    return `${header}

Ticker focus: ${fundamentals.ticker} (${fundamentals.companyName})
Question: ${question}

LTM Revenue: ${fmtMillions(fundamentals.revenueLTM)} (USD millions)
LTM EBITDA: ${fmtMillions(fundamentals.ebitdaLTM)} (USD millions)
LTM Net Income: ${fmtMillions(fundamentals.netIncomeLTM)} (USD millions)
Cash: ${fmtMillions(fundamentals.cash)} (USD millions)
Total Debt: ${fmtMillions(fundamentals.totalDebt)} (USD millions)
Net Debt: ${fmtMillions(netDebt)} (USD millions)
Shares Outstanding: ${typeof fundamentals.sharesOutstanding === 'number' ? fundamentals.sharesOutstanding.toLocaleString('en-US') : '—'} (millions)

Interpretation: this is a deterministic data snapshot only; advanced narrative analysis resumes once OpenAI is available.`;
  } catch {
    return `${header}\n\n${params.contextualSummary || `Ticker focus: ${params.ticker}`}`;
  }
}

export async function POST(req: NextRequest) {
  let fallbackTicker: string | undefined;
  let fallbackUserMessage = '';
  let fallbackContextSummary = 'General chat context (no ticker provided).';
  try {
    const body = await req.json();
    const ticker =
      typeof body?.ticker === 'string' && body.ticker.trim().length > 0
        ? body.ticker.trim().toUpperCase()
        : undefined;
    fallbackTicker = ticker;
    const pdfText = typeof body?.pdfText === 'string' ? body.pdfText : null;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const contextualSummary = ticker ? `Ticker focus: ${ticker}` : 'General chat context (no ticker provided).';
    fallbackContextSummary = contextualSummary || fallbackContextSummary;

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
    const lastUserMessage = safeMessages.filter((message: SafeMessage) => message.role === 'user').slice(-1)[0]?.content || '';
    fallbackUserMessage = lastUserMessage;
    const webContext = await gatherWebContext(ticker, lastUserMessage);

    const openAiKeys = getOpenAIKeyCandidates('user');
    if (openAiKeys.length === 0) {
      const fallback = await buildDeterministicFallbackReply({
        ticker,
        contextualSummary,
        userMessage: lastUserMessage,
        reason: 'missing_key',
      });
      return NextResponse.json({ reply: fallback, fallback: true, mode: 'fallback', reason: 'missing_key' }, { status: 200 });
    }

    const shouldForceLiveFacts = needsLiveFactSourcing(lastUserMessage);

    const inputMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: contextualSummary || 'No explicit context provided.' },
      ...(shouldForceLiveFacts
        ? [
            {
              role: 'system' as const,
              content:
                'This user is asking for live factual data. Use concrete numerics with explicit period labels (e.g., "Q4 2025 revenue"), include URLs in citations, and avoid placeholders.',
            },
          ]
        : []),
      ...(webContext.context
        ? [
            {
              role: 'system' as const,
              content: `Fresh web context (scraped snippets, use as external reference and do not invent beyond these facts):\n${webContext.context}`,
            },
          ]
        : []),
      ...(pdfText ? [{ role: 'system' as const, content: `Uploaded memo excerpt: ${pdfText.slice(0, 2000)}` }] : []),
      ...safeMessages,
    ];
    if (!inputMessages.some((m) => m.role === 'user')) {
      inputMessages.push({ role: 'user', content: 'Provide a concise market and fundamentals summary.' });
    }

    const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL);
    let replyText: string | null = null;
    let lastError: unknown = null;
    let sawAuthError = false;

    const attemptResponses = async (
      client: OpenAI,
      model: string,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      withWebTools: boolean
    ): Promise<string | null> => {
      if (!withWebTools) {
        const response = await client.responses.create({
          model,
          input: messages,
          temperature: 0,
          max_output_tokens: 650,
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
            input: messages,
            temperature: 0,
            max_output_tokens: 700,
            tools: [tool as unknown as Record<string, unknown>],
          } as never);
          if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
            return response.output_text.trim();
          }
        } catch (error) {
          webError = error;
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[api/analyst-chat] responses web tool attempt failed', {
              model,
              tool: tool.type,
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
          replyText = await attemptResponses(client, model, inputMessages, shouldForceLiveFacts);
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[api/analyst-chat] responses model selected', {
              model,
              key: keyFingerprint(apiKey),
              usedWebTool: shouldForceLiveFacts,
            });
          }
        } catch (error) {
          lastError = error;
          const authError = isAuthError(error);
          if (authError) sawAuthError = true;
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[api/analyst-chat] responses model failed', {
              model,
              key: keyFingerprint(apiKey),
              authError,
              message: error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error)),
            });
          }
          // If a key is invalid, switch to the next configured key.
          if (authError) break;
        }

        // Endpoint fallback: if Responses API path fails, retry same model via Chat Completions.
        if (!replyText) {
          try {
            const completion = await client.chat.completions.create({
              model,
              messages: inputMessages,
              temperature: 0,
              max_tokens: 650,
            });
            replyText = extractReplyFromCompletions(completion);
            if (process.env.NODE_ENV !== 'production') {
              console.debug('[api/analyst-chat] chat.completions model selected', { model, key: keyFingerprint(apiKey) });
            }
          } catch (error) {
            lastError = error;
            const authError = isAuthError(error);
            if (authError) sawAuthError = true;
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[api/analyst-chat] chat.completions model failed', {
                model,
                key: keyFingerprint(apiKey),
                authError,
                message: error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error)),
              });
            }
            if (authError) break;
          }
        }

        if (replyText) {
          const needsRepair =
            hasPlaceholderFinanceNumbers(replyText) ||
            lacksConcreteNumbersForFactQuery(replyText, shouldForceLiveFacts);
          if (needsRepair) {
            try {
              const repairMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
                ...inputMessages,
                {
                  role: 'system',
                  content:
                    'Your previous draft lacked concrete factual fidelity. Regenerate using exact figures when available, include period labels and source URLs, and never use placeholders.',
                },
                {
                  role: 'user',
                  content: 'Please regenerate with concrete values and explicit citations.',
                },
              ];
              const repaired = await attemptResponses(client, model, repairMessages, shouldForceLiveFacts);
              if (repaired) replyText = repaired;
            } catch (error) {
              lastError = error;
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[api/analyst-chat] repair attempt failed', {
                  model,
                  key: keyFingerprint(apiKey),
                  message: error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error)),
                });
              }
            }
          }
          break;
        }
      }
      if (replyText) break;
    }
    if (!replyText) {
      if (sawAuthError) {
        throw new Error('OpenAI authentication failed for configured keys. Verify OPENAI_API_KEY / OPENAI_SERVICE_API_KEY and restart the dev server.');
      }
      throw (lastError instanceof Error ? lastError : new Error('OpenAI request failed across all model candidates'));
    }

    const reply = formatSkimmableReply(replyText, lastUserMessage, webContext.sourceLines);
    return NextResponse.json({ reply, fallback: false, mode: 'live', sources: webContext.sourceLines });
  } catch (error) {
    const message = error instanceof Error ? redactSecrets(error.message) : 'Unable to generate response';
    console.error('Analyst chat error', { message });
    const failureReason = classifyFailureReason(error);
    let fallbackReply = 'Unable to generate a response right now. Please retry in a moment.';
    try {
      fallbackReply = await buildDeterministicFallbackReply({
        ticker: fallbackTicker,
        contextualSummary: fallbackContextSummary,
        userMessage: fallbackUserMessage,
        reason: failureReason,
      });
    } catch {
      // keep generic fallback
    }
    return NextResponse.json(
      {
        reply: fallbackReply,
        fallback: true,
        mode: 'fallback',
        reason: failureReason,
        error: message,
      },
      { status: 200 }
    );
  }
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { AnalystDcfCard } from '@/components/analyst/AnalystDcfCard';
import { AnalystCoreTemplateCard } from '@/components/analyst/AnalystCoreTemplateCard';
import { AnalystModelCard } from '@/components/analyst/AnalystModelCard';
import { AnalystStockCard } from '@/components/analyst/AnalystStockCard';
import { AnalystVisualizationCard } from '@/components/analyst/AnalystVisualizationCard';
import { FormattedTextBlock } from '@/components/ui/formatted-text-block';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { parseUploadedAttachment, type UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import type { AnalystCoreTemplatePayload } from '@/lib/analyst/coreModelTemplates';
import type { AnalystDcfAdjustment, AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import type { AnalystGeneratedModelPayload, AnalystStructuredModelAdjustment } from '@/lib/analyst/modelChat';
import type { AnalystVisualizationPayload } from '@/lib/analyst/visualization';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: {
    mode?: 'live' | 'fallback';
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
  };
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

function getLoadingMessage(prompt: string): { title: string; detail: string } {
  const text = prompt.toLowerCase();

  if (
    /\bdcf\b|\bthree[-\s]?statement\b|\b3[-\s]?statement\b|\bcap\s?table\b|\bsaas\b|\barr\b|\boperating model\b|\bforecast model\b|\boperating forecast\b|\bbuild projections?\b|\bprojection model\b/.test(text)
  ) {
    return {
      title: /\bforecast|projection|operating forecast|operating model\b/.test(text)
        ? 'Building forecast model'
        : 'Building model',
      detail: /\bforecast|projection|operating forecast|operating model\b/.test(text)
        ? 'Resolving company data, building the forecast assumptions, and preparing the structured model output.'
        : 'Parsing assumptions, applying defaults, and preparing the workbook output.',
    };
  }

  if (/\bearnings?\b|\bguidance\b|\bmargin\b|\brevenue\b|\bvaluation\b|\bticker\b/.test(text)) {
    return {
      title: 'Analyzing company',
      detail: 'Pulling company context and structuring the analyst response.',
    };
  }

  if (/\bmarket\b|\brates?\b|\byield\b|\bcpi\b|\bpce\b|\bgdp\b|\bpayrolls\b|\binflation\b|\boil\b|\bfx\b/.test(text)) {
    return {
      title: 'Analyzing market',
      detail: 'Gathering market context and organizing the key transmission paths.',
    };
  }

  return {
    title: 'Working',
    detail: 'Routing the request and preparing the response.',
  };
}

export function AnalystChatApp() {
  const [ticker, setTicker] = useState('');
  const [attachment, setAttachment] = useState<UploadedAttachmentContext | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<{ title: string; detail: string } | null>(null);
  const [memoPdfLoadingId, setMemoPdfLoadingId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

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
      return;
    }
    try {
      setAttachmentError(null);
      const parsed = await parseUploadedAttachment(file);
      setAttachment(parsed);
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setLoadingState(getLoadingMessage(prompt));
    const preserveStructure = userExplicitlyWantsStructuredOutput(prompt);
    const latestArtifact = getLatestGeneratedArtifact();

    try {
      const response = await fetch('/api/analyst-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Optional ticker context; chat should still work without it.
        body: JSON.stringify({
          ticker: ticker.trim().length > 0 ? ticker.trim().toUpperCase() : undefined,
          attachmentContext: attachment,
          sessionId,
          currentModel: latestArtifact.generatedModel,
          currentDcf: latestArtifact.dcfDemo,
          currentStock: latestArtifact.stockLookup,
          messages: [...messages, userMessage]
        })
      });
      const rawBody = await response.text();
      const payload = rawBody ? tryParseJson<Record<string, unknown>>(rawBody) : null;

      if (!response.ok) {
        const backendMessage =
          (payload && typeof payload.reply === 'string' && payload.reply.trim().length > 0
            ? payload.reply
            : payload && typeof payload.error === 'string' && payload.error.trim().length > 0
              ? payload.error
              : rawBody.trim());
        throw new Error(backendMessage || `Analyst Chat request failed (${response.status}).`);
      }

      if (!payload) {
        throw new Error(rawBody.trim() || 'Analyst Chat returned an invalid response.');
      }

      const replyText =
        (payload && typeof payload.reply === 'string' && payload.reply.trim().length > 0
          ? payload.reply
          : payload && typeof payload.error === 'string' && payload.error.trim().length > 0
            ? payload.error
            : 'No response generated.');
      const reply: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: cleanAssistantText(replyText, preserveStructure),
        meta: {
          mode: payload?.mode === 'fallback' ? 'fallback' : 'live',
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
        },
      };
      setMessages((prev) => [...prev, reply]);
    } catch (error) {
      console.error('Chat error', error);
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
      setIsLoading(false);
      setLoadingState(null);
      requestAnimationFrame(() => {
        promptRef.current?.focus();
      });
    }
  };

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
      const backendMessage =
        (parsed && typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
          ? parsed.reply
          : parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0
            ? parsed.error
            : rawBody.trim());
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
          },
        };
      }),
    );
  };

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
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="Ticker (optional)"
            />
          </div>
          <label htmlFor="pdf-upload-analyst" className="sr-only">Upload PDF</label>
          <input
            type="file"
            id="pdf-upload-analyst"
            name="pdf-upload-analyst"
            accept=".pdf,.xlsx,.xls,.csv,.txt,.md,application/pdf,text/csv,text/plain"
            onChange={(event) => void handleAttachment(event.target.files?.[0] ?? null)}
            className="text-xs text-[var(--cb-text-muted)]"
          />
        </div>
        {attachment && (
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-3 py-2 text-xs text-[var(--cb-text-muted)]">
            <div className="font-medium text-[var(--cb-text-primary)]">
              Attached: {attachment.name} • {attachment.kind.replace(/_/g, ' ')}
            </div>
            <div>{attachment.sizeKb}kb • parsed for chat context</div>
            {(attachment.signals?.ticker || attachment.signals?.companyName || attachment.signals?.modelTypeHint || attachment.signals?.fiscalPeriod) && (
              <div className="mt-1">
                {[
                  attachment.signals?.companyName,
                  attachment.signals?.ticker,
                  attachment.signals?.modelTypeHint?.replace(/_/g, ' '),
                  attachment.signals?.fiscalPeriod,
                ]
                  .filter((item): item is string => Boolean(item))
                  .join(' • ')}
              </div>
            )}
            {attachment.signals?.extractedMetrics && attachment.signals.extractedMetrics.length > 0 && (
              <div className="mt-1 truncate">
                {attachment.signals.extractedMetrics
                  .slice(0, 3)
                  .map((metric) => `${metric.label}: ${metric.value}`)
                  .join(' • ')}
              </div>
            )}
            {attachment.warnings.length > 0 && (
              <div className="mt-1 text-amber-300/90">{attachment.warnings[0]}</div>
            )}
          </div>
        )}
        {attachmentError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {attachmentError}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 bg-[var(--cb-surface-subtle)] p-0">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 text-sm">
          {messages.map((message, index) => (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
              {(() => {
                const prompt = getPromptForAssistantMessage(index);
                return (
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
                {message.role === 'assistant' && message.meta?.attachmentUsed && (
                  <div className="mt-2 text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                    {message.meta.attachmentUsed}
                  </div>
                )}
                {message.role === 'assistant' &&
                  !message.meta?.dcfDemo &&
                  !message.meta?.generatedModel &&
                  !message.meta?.coreTemplateModel &&
                  !message.meta?.stockLookup &&
                  !message.meta?.visualization && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleDownloadMemoPdf(
                            message.id,
                            message.content,
                            prompt,
                            message.meta?.sources,
                          )
                        }
                        disabled={memoPdfLoadingId === message.id}
                      >
                        {memoPdfLoadingId === message.id ? 'Generating Memo PDF…' : 'Download Memo PDF'}
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
                    onAdjust={(adjustment) => handleDcfAdjustment(message.id, message.meta!.dcfDemo!, adjustment)}
                    onRunEventShock={(prompt) => handleDcfEventShock(message.id, message.meta!.dcfDemo!, prompt)}
                  />
                )}
                {message.role === 'assistant' && message.meta?.generatedModel && (
                  <AnalystModelCard
                    payload={message.meta.generatedModel}
                    onAdjust={(adjustment) =>
                      handleModelAdjustment(message.id, message.meta!.generatedModel!, adjustment)
                    }
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
                );
              })()}
            </div>
          ))}
          {isLoading && loadingState && (
            <div className="text-left">
              <div className="block max-w-full rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-4 py-3 text-[var(--cb-text-primary)]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cb-green)] [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cb-green)] [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cb-green)] [animation-delay:300ms]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{loadingState.title}</div>
                    <div className="text-xs text-[var(--cb-text-muted)]">{loadingState.detail}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={handleSubmit} className="border-t border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
          <label htmlFor="analyst-prompt" className="sr-only">Ask a question</label>
          <Textarea
            ref={promptRef}
            id="analyst-prompt"
            name="analyst-prompt"
            placeholder="Ask about valuations, KPIs, diligence follow-ups..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDownCapture={(event) => {
              event.stopPropagation();
            }}
            onKeyUpCapture={(event) => {
              event.stopPropagation();
            }}
            disabled={isLoading}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
          />
          <div className="mt-3 flex items-center justify-between text-xs text-[var(--cb-text-muted)]">
            {attachment ? (
              <span>Using {attachment.kind.replace(/_/g, ' ')} context from {attachment.name}.</span>
            ) : (
              <span>Attach earnings reports, model files, or notes for additional context.</span>
            )}
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? 'Thinking…' : 'Ask'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

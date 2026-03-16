'use client';

import { useEffect, useRef, useState } from 'react';
import { AnalystDcfCard } from '@/components/analyst/AnalystDcfCard';
import { AnalystCoreTemplateCard } from '@/components/analyst/AnalystCoreTemplateCard';
import { AnalystModelCard } from '@/components/analyst/AnalystModelCard';
import { AnalystStockCard } from '@/components/analyst/AnalystStockCard';
import { AnalystVisualizationCard } from '@/components/analyst/AnalystVisualizationCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { parseUploadedAttachment, type UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import type { AnalystCoreTemplatePayload } from '@/lib/analyst/coreModelTemplates';
import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';
import type { AnalystVisualizationPayload } from '@/lib/analyst/visualization';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: {
    mode?: 'live' | 'fallback';
    reason?: string;
    sources?: string[];
    retrievalWarnings?: string[];
    dcfDemo?: AnalystDcfDemoPayload;
    generatedModel?: AnalystGeneratedModelPayload;
    coreTemplateModel?: AnalystCoreTemplatePayload;
    stockLookup?: StockLookupResult;
    visualization?: AnalystVisualizationPayload;
  };
};

function cleanAssistantText(content: string): string {
  return content
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
}

function getLoadingMessage(prompt: string): { title: string; detail: string } {
  const text = prompt.toLowerCase();

  if (/\bdcf\b|\bthree[-\s]?statement\b|\b3[-\s]?statement\b|\bcap\s?table\b|\bsaas\b|\barr\b|\boperating model\b/.test(text)) {
    return {
      title: 'Building model',
      detail: 'Parsing assumptions, applying defaults, and preparing the workbook output.',
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
  const [sessionId, setSessionId] = useState<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setLoadingState(getLoadingMessage(prompt));
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

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload && typeof payload.error === 'string' && payload.error) || 'Chat request failed');
      }
      const payload = await response.json();
      const replyText =
        (payload && typeof payload.reply === 'string' && payload.reply.trim().length > 0
          ? payload.reply
          : payload && typeof payload.error === 'string' && payload.error.trim().length > 0
            ? payload.error
            : 'No response generated.');
      const reply: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: cleanAssistantText(replyText),
        meta: {
          mode: payload?.mode === 'fallback' ? 'fallback' : 'live',
          reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
          sources: Array.isArray(payload?.sources)
            ? payload.sources.filter((item: unknown): item is string => typeof item === 'string').slice(0, 5)
            : [],
          retrievalWarnings: Array.isArray(payload?.retrievalWarnings)
            ? payload.retrievalWarnings.filter((item: unknown): item is string => typeof item === 'string').slice(0, 3)
            : [],
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
      const reply: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Unable to generate a response at the moment.'
      };
      setMessages((prev) => [...prev, reply]);
    } finally {
      setIsLoading(false);
      setLoadingState(null);
    }
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
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
              <div
                className={`inline-block rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-[var(--cb-green)] text-[#041007]'
                    : 'block max-w-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)] whitespace-pre-wrap leading-7'
                }`}
              >
                {message.content}
                {message.role === 'assistant' && message.meta?.mode === 'fallback' && (
                  <div className="mt-2 text-[10px] uppercase tracking-wide text-amber-300/90">
                    fallback mode{message.meta.reason ? ` • ${message.meta.reason}` : ''}
                  </div>
                )}
                {message.role === 'assistant' && message.meta?.sources && message.meta.sources.length > 0 && (
                  <div className="mt-3 border-t border-[var(--cb-border-subtle)] pt-2 text-[11px] text-[var(--cb-text-muted)]">
                    <div className="mb-1 uppercase tracking-wide">Sources</div>
                    <div className="space-y-1">
                      {message.meta.sources.map((source) => (
                        <div key={source} className="truncate">
                          {source}
                        </div>
                      ))}
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
                  <AnalystDcfCard payload={message.meta.dcfDemo} />
                )}
                {message.role === 'assistant' && message.meta?.generatedModel && (
                  <AnalystModelCard payload={message.meta.generatedModel} />
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
            id="analyst-prompt"
            name="analyst-prompt"
            placeholder="Ask about valuations, KPIs, diligence follow-ups..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={isLoading}
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

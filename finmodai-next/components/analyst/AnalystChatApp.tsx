'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { ModelRecord } from '@/lib/modelsRepo';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type AnalystChatAppProps = {
  models: ModelRecord[];
  defaultModelId?: string;
};

export function AnalystChatApp({ models, defaultModelId }: AnalystChatAppProps) {
  const [contextType, setContextType] = useState<'ticker' | 'model'>(defaultModelId ? 'model' : 'ticker');
  const [ticker, setTicker] = useState('AAPL');
  const [modelId, setModelId] = useState<string | undefined>(defaultModelId);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handlePdf = (file: File | null) => {
    if (!file) {
      setPdfNote(null);
      return;
    }
    setPdfNote(`Attachment: ${file.name} (${Math.round(file.size / 1024)}kb)`);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/analyst-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextType,
          ticker: contextType === 'ticker' ? ticker : undefined,
          modelId: contextType === 'model' ? modelId : undefined,
          pdfText: pdfNote,
          messages: [...messages, userMessage]
        })
      });

      if (!response.ok) throw new Error('Chat request failed');
      const payload = await response.json();
      const reply: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: payload?.reply ?? 'No response generated.'
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
    }
  };

  return (
    <Card className="flex h-full flex-col shadow-lg">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle className="text-xl font-semibold text-[var(--cb-text-primary)]">Analyst Chat</CardTitle>
        <div className="flex flex-col gap-3 text-sm text-[var(--cb-text-muted)] md:flex-row md:items-center">
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
            <label htmlFor="context-type" className="sr-only">Context Type</label>
            <select
              id="context-type"
              name="context-type"
              value={contextType}
              onChange={(event) => setContextType(event.target.value as 'ticker' | 'model')}
              className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-input-bg)] px-3 py-2 text-sm text-[var(--cb-input-text)]"
            >
              <option value="ticker">Ticker context</option>
              <option value="model">Model context</option>
            </select>
            {contextType === 'ticker' ? (
              <>
                <label htmlFor="ticker-input" className="sr-only">Ticker</label>
                <Input id="ticker-input" name="ticker-input" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="Ticker" />
              </>
            ) : (
              <>
                <label htmlFor="model-select" className="sr-only">Select Model</label>
                <select
                  id="model-select"
                  name="model-select"
                  className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-input-bg)] px-3 py-2 text-sm text-[var(--cb-input-text)]"
                  value={modelId ?? ''}
                  onChange={(event) => setModelId(event.target.value || undefined)}
                >
                  <option value="">Select model</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.ticker} ({model.type})
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <label htmlFor="pdf-upload-analyst" className="sr-only">Upload PDF</label>
          <input
            type="file"
            id="pdf-upload-analyst"
            name="pdf-upload-analyst"
            accept="application/pdf"
            onChange={(event) => handlePdf(event.target.files?.[0] ?? null)}
            className="text-xs text-[var(--cb-text-muted)]"
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 bg-[var(--cb-surface-subtle)] p-0">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 text-sm">
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
              <div
                className={`inline-block rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-[var(--cb-green)] text-[#041007]'
                    : 'border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)]'
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
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
            {pdfNote ? <span>{pdfNote}</span> : <span>Attach memo PDFs for additional context.</span>}
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? 'Thinking…' : 'Ask'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

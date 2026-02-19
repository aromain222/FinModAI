'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/branding';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const introMessage: ChatMessage = {
  id: 'intro',
  role: 'assistant',
  content:
    'Tell me the ticker, the timeframe you are analyzing, and any assumptions you already have about revenue growth, margins, or the macro environment.'
};

type ChatInterfaceProps = {
  userEmail?: string;
};

export function ChatInterface({ userEmail }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([introMessage]);
  const [input, setInput] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setError(null);

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed
    };

    const assistantPlaceholder: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: ''
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInput('');
    setIsStreaming(true);

    try {
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          topic: extractTicker(trimmed),
          pdfFileName: pdfFile?.name ?? null
        })
      });

      if (!response.ok) {
        // Try to parse error message from server
        let errorMessage = 'The analysis service is unavailable.';
        try {
          const errorData = await response.json();
          if (errorData?.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // If JSON parsing fails, use default message
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('No response body received from server.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let accumulated = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantPlaceholder.id ? { ...msg, content: accumulated } : msg))
        );
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Unable to process your request.');
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantPlaceholder.id));
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <Card className="flex h-full flex-col border border-border/70 shadow-lg">
      <CardHeader className="border-b border-cb-line bg-white/90">
        <CardTitle className="text-xl font-semibold text-cb-ink">{APP_NAME} Analyst Chat</CardTitle>
        <p className="text-sm text-cb-slate">
          Logged in as <span className="font-medium text-cb-ink">{userEmail ?? 'analyst'}</span>. Responses focus on
          reasoning, not investment advice.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 bg-slate-50 p-0">
        <ScrollArea className="flex-1 px-4 py-6">
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} role={message.role} content={message.content} />
            ))}
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <form onSubmit={handleSubmit} className="space-y-3 border-t border-border bg-white p-4">
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/80 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="pdf-upload" className="flex flex-col text-secondary sm:flex-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attach PDF (optional)</span>
              <input
                type="file"
                id="pdf-upload"
                name="pdf-upload"
                accept="application/pdf"
                onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
                className="mt-1 text-xs text-muted-foreground"
              />
            </label>
            {pdfFile && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Attached: {pdfFile.name}
              </span>
            )}
          </div>
          <Textarea
            id="prompt"
            name="prompt"
            placeholder="Ask about a company, sector, or macro thesis..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={isStreaming}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Use professional reasoning only. No investment advice will be given.</span>
            <Button type="submit" disabled={isStreaming || !input.trim()}>
              {isStreaming ? 'Analyzing…' : 'Send'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ role, content }: { role: ChatMessage['role']; content: string }) {
  return (
    <div
      className={cn('flex w-full', {
        'justify-end': role === 'user',
        'justify-start': role === 'assistant'
      })}
    >
      <div
        className={cn(
          'max-w-3xl rounded-2xl px-4 py-3 text-sm shadow-sm transition',
          role === 'user'
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-white rounded-bl-sm border border-border/60 text-secondary'
        )}
      >
        {content || <span className="text-muted-foreground">…</span>}
      </div>
    </div>
  );
}

function extractTicker(message: string) {
  const match = message.match(/\b[A-Z]{2,5}\b/);
  return match ? match[0] : undefined;
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

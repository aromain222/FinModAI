'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, RefreshCw, User } from 'lucide-react';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type PortfolioChatResponse = {
  ok?: boolean;
  reply?: string;
  error?: string;
  detail?: string;
  context?: {
    builtAt: string;
    positionCount: number;
    totalMarketValue: number | null;
    tickers: string[];
    warnings: string[];
  };
};

const STARTERS = [
  'Where is my portfolio most concentrated?',
  'Which thesis looks weakest right now?',
  'What macro event would hurt me most?',
  'Where should I look to add or trim?',
];

export function PortfolioChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<PortfolioChatResponse['context']>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    const prior = messages.slice(-12);
    setMessages(current => [...current, { role: 'user', content: message }]);
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/pm/portfolio-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: prior }),
      });
      const payload = await response.json().catch(() => ({})) as PortfolioChatResponse;
      if (!response.ok || !payload.reply) throw new Error(payload.detail ?? payload.error ?? `HTTP ${response.status}`);
      setMessages(current => [...current, { role: 'assistant', content: payload.reply! }]);
      setContext(payload.context);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CapitalBase could not answer that question.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--cb-border)] px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--cb-green)]" />
            <h2 className="text-sm font-semibold text-[var(--cb-text-primary)]">Talk to CapitalBase</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Ask about your holdings, theses, concentration, catalysts, and macro risk.</p>
        </div>
        {context && (
          <div className="text-right font-mono text-[10px] text-[var(--cb-text-muted)]">
            <p>{context.positionCount} holdings · {context.totalMarketValue === null ? 'value incomplete' : `$${context.totalMarketValue.toLocaleString()}`}</p>
            <p>refreshed {new Date(context.builtAt).toLocaleTimeString()}</p>
          </div>
        )}
      </div>

      <div className="max-h-[560px] min-h-[300px] overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex min-h-[260px] flex-col justify-center">
            <p className="max-w-xl text-lg font-medium text-[var(--cb-text-primary)]">What do you want to know about your portfolio?</p>
            <p className="mt-1 max-w-xl text-sm text-[var(--cb-text-muted)]">CapitalBase reloads your active positions and latest saved theses for every answer.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {STARTERS.map(starter => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => { void send(starter); }}
                  className="rounded-full border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2 text-xs text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-green)] hover:text-[var(--cb-text-primary)]"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'ml-auto max-w-2xl' : 'mr-auto max-w-3xl'}>
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
                  {message.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3 text-[var(--cb-green)]" />}
                  {message.role === 'user' ? 'You' : 'CapitalBase'}
                </div>
                <div className={message.role === 'user'
                  ? 'whitespace-pre-wrap rounded-xl rounded-tr-sm bg-[var(--cb-green)] px-4 py-3 text-sm leading-relaxed text-black'
                  : 'whitespace-pre-wrap border-l-2 border-[var(--cb-green)] pl-4 text-sm leading-6 text-[var(--cb-text-secondary)]'}>
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-[var(--cb-text-muted)]">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Reading the portfolio and pressure-testing the question…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-[var(--cb-border)] p-3">
        {error && <p className="mb-2 px-1 text-xs text-red-400">{error}</p>}
        <div className="flex items-end gap-2 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] p-2 focus-within:border-[var(--cb-green)]">
          <textarea
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            maxLength={2_000}
            disabled={loading}
            placeholder="Ask CapitalBase about your portfolio…"
            className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[var(--cb-text-primary)] outline-none placeholder:text-[var(--cb-text-muted)] disabled:opacity-50"
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={() => { void send(input); }}
            disabled={loading || input.trim().length === 0}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--cb-green)] text-black transition hover:brightness-110 disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 px-1 text-[10px] text-[var(--cb-text-muted)]">Research conversation only. CapitalBase does not place an order from chat.</p>
      </div>
    </section>
  );
}

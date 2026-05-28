'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import type { PortfolioChatResponse, PortfolioPosition } from '@/app/api/execution/portfolio-chat/route';

interface PortfolioChatPanelProps {
  onAdd: (ticker: string) => void;
}

type MessageRole = 'user' | 'assistant' | 'error';

interface Message {
  id:      string;
  role:    MessageRole;
  text?:   string;
  result?: PortfolioChatResponse;
}

const PROGRESS_STEPS = [
  'Screening live stock universe…',
  'Scoring candidates in parallel…',
  'Building portfolio recommendation…',
];
const STEP_DELAYS_MS = [0, 4_000, 9_000];

const EXAMPLE_PROMPTS = [
  'Build me a 5-stock portfolio, tech-focused',
  'Suggest high-conviction growth plays, medium risk',
  'Give me a diversified 6-stock portfolio',
  'Find the best value names right now',
];

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 7.0
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      {score.toFixed(1)}
    </span>
  );
}

function PositionCard({ pos, onAdd }: { pos: PortfolioPosition; onAdd: (ticker: string) => void }) {
  return (
    <div className="rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{pos.ticker}</span>
            <ScoreBadge score={pos.score} />
            <span className="text-xs text-[var(--cb-text-muted)]">{pos.action}</span>
            <span className="text-xs text-[var(--cb-text-muted)]">· {pos.suggestedWeight}%</span>
            <span className="text-xs text-[var(--cb-text-muted)]">· {pos.sizing}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--cb-text-secondary)]">{pos.thesis}</p>
          <p className="mt-0.5 text-xs text-[var(--cb-text-muted)]">
            <span className="mr-1 text-amber-400/70">Risk:</span>{pos.risk}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(pos.ticker)}
          className="cursor-pointer shrink-0 rounded-lg border border-[var(--cb-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--cb-text-primary)] transition-colors hover:bg-[var(--cb-surface)]"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ProgressIndicator() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timers = STEP_DELAYS_MS.slice(1).map((delay, i) =>
      window.setTimeout(() => setStepIndex(i + 1), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="space-y-1.5 py-1">
      {PROGRESS_STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          {i < stepIndex ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
          ) : i === stepIndex ? (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--cb-text-muted)]" />
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cb-border)]" />
          )}
          <span className={`text-xs ${i <= stepIndex ? 'text-[var(--cb-text-secondary)]' : 'text-[var(--cb-text-muted)]'}`}>
            {step}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PortfolioChatPanel({ onAdd }: PortfolioChatPanelProps) {
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/execution/portfolio-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json() as PortfolioChatResponse & { error?: string };

      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'error', text: data.error ?? 'Something went wrong.' }]);
      } else {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', result: data }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'error', text: err instanceof Error ? err.message : 'Network error' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)]">
      {/* Message list */}
      <div className="min-h-[200px] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !loading && (
          <div>
            <p className="text-xs text-[var(--cb-text-muted)]">
              Describe the portfolio you want — the agent will screen stocks, run 19-investor hedge fund analysis, and build a personalised recommendation.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="cursor-pointer rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2.5 py-1 text-xs text-[var(--cb-text-secondary)] transition-colors hover:text-[var(--cb-text-primary)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <span className="max-w-[80%] rounded-2xl rounded-tr-sm border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2 text-xs text-[var(--cb-text-primary)]">
                  {msg.text}
                </span>
              </div>
            );
          }

          if (msg.role === 'error') {
            return (
              <div key={msg.id} className="flex items-center gap-2 rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2.5 text-xs text-red-400">
                <AlertCircle size={13} />
                {msg.text}
              </div>
            );
          }

          if (msg.role === 'assistant' && msg.result) {
            const { narrative, positions } = msg.result;
            return (
              <div key={msg.id} className="space-y-2">
                <p className="text-xs text-[var(--cb-text-secondary)]">{narrative}</p>
                {positions.map(pos => (
                  <PositionCard key={pos.ticker} pos={pos} onAdd={onAdd} />
                ))}
              </div>
            );
          }

          return null;
        })}

        {loading && (
          <div className="rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2.5">
            <ProgressIndicator />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-[var(--cb-border)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the portfolio you want…"
            rows={2}
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2 text-xs text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cb-border)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={loading || !input.trim()}
            className="cursor-pointer shrink-0 rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] p-2 text-[var(--cb-text-primary)] transition-colors hover:bg-[var(--cb-surface)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--cb-text-muted)]">Enter to send · Shift+Enter for new line · ~10s first run, ~3s after</p>
      </div>
    </div>
  );
}

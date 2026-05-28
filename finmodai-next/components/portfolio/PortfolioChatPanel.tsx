'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import type { PortfolioPosition, EnrichedTicker, SSEEvent } from '@/app/api/execution/portfolio-chat/route';
import { getPositions } from '@/lib/portfolio/storage';

interface PortfolioChatPanelProps {
  onAdd: (ticker: string) => void;
}

interface InitialResult {
  positions:     PortfolioPosition[];
  narrative:     string;
  positionCount: number;
  scoredAt:      string;
  cached:        boolean;
}

interface AssistantMessage {
  id:             string;
  role:           'assistant';
  result:         InitialResult;
  enriched:       Record<string, EnrichedTicker>;
  enrichingDone:  boolean;
  prices:         Record<string, number>;
  budget:         number;
}

interface UserMessage   { id: string; role: 'user';  text: string }
interface ErrorMessage  { id: string; role: 'error'; text: string }

type Message = UserMessage | ErrorMessage | AssistantMessage;

const EXAMPLE_PROMPTS = [
  'Build me a 10-stock portfolio, tech-focused',
  'Suggest high-conviction growth plays, medium risk',
  'Give me a diversified 6-stock portfolio',
  'Find the best value names right now',
];

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 7.0
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      {score.toFixed(1)}
    </span>
  );
}

function PositionCard({
  pos, index, enriched, enrichingDone, price, budget, onAdd,
}: {
  pos:           PortfolioPosition;
  index:         number;
  enriched?:     EnrichedTicker;
  enrichingDone: boolean;
  price?:        number;
  budget:        number;
  onAdd:         (ticker: string) => void;
}) {
  const isEnriching = index < 3 && !enrichingDone && !enriched;
  const shares = (price && budget > 0)
    ? Math.floor((budget * pos.suggestedWeight / 100) / price)
    : null;
  const estCost = (shares && price) ? (shares * price) : null;

  return (
    <div className="rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{pos.ticker}</span>
            <ScoreBadge score={pos.score} />
            <span className="text-xs text-[var(--cb-text-muted)]">{pos.action}</span>
            <span className="text-xs text-[var(--cb-text-muted)]">· {pos.suggestedWeight}%</span>
            <span className="text-xs text-[var(--cb-text-muted)]">· {pos.sizing}</span>
            {shares != null && (
              <span className="text-xs font-medium text-[var(--cb-text-primary)]">
                · {shares} shares
                {estCost != null && (
                  <span className="ml-1 font-normal text-[var(--cb-text-muted)]">
                    (${estCost.toLocaleString('en-US', { maximumFractionDigits: 0 })})
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Thesis + risk */}
          <p className="text-xs text-[var(--cb-text-secondary)]">{pos.thesis}</p>
          <p className="text-xs text-[var(--cb-text-muted)]">
            <span className="mr-1 text-amber-400/70">Risk:</span>{pos.risk}
          </p>

          {/* Enriched agent data */}
          {enriched && (
            <div className="mt-1.5 flex flex-wrap gap-3 border-t border-[var(--cb-border)] pt-1.5">
              {enriched.totalPersonas > 0 && (
                <span className="text-xs text-[var(--cb-text-muted)]">
                  <span className="mr-1 text-emerald-400/80">{enriched.bullishCount}/{enriched.totalPersonas}</span>
                  investors bullish
                </span>
              )}
              {enriched.tradingDecision && (
                <span className="text-xs text-[var(--cb-text-muted)]">
                  <span className="mr-1 text-[var(--cb-text-secondary)]">Verdict:</span>
                  {enriched.tradingDecision}
                  {enriched.tradingTimeHorizon && ` · ${enriched.tradingTimeHorizon}`}
                </span>
              )}
              {enriched.tradingThesis && (
                <p className="w-full text-xs text-[var(--cb-text-muted)] italic">{enriched.tradingThesis}</p>
              )}
            </div>
          )}

          {/* Loading enrichment */}
          {isEnriching && (
            <div className="mt-1.5 flex items-center gap-1.5 border-t border-[var(--cb-border)] pt-1.5">
              <span className="h-1 w-12 animate-pulse rounded bg-[var(--cb-border)]" />
              <span className="h-1 w-20 animate-pulse rounded bg-[var(--cb-border)]" />
              <span className="text-[10px] text-[var(--cb-text-muted)]">agent analysis running…</span>
            </div>
          )}
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

function ProgressStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done
        ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
        : <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--cb-text-muted)]" />}
      <span className={`text-xs ${done ? 'text-[var(--cb-text-secondary)]' : 'text-[var(--cb-text-muted)]'}`}>
        {label}
      </span>
    </div>
  );
}

export function PortfolioChatPanel({ onAdd }: PortfolioChatPanelProps) {
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [input,        setInput]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [stepLog,      setStepLog]      = useState<string[]>([]);
  const [budget,       setBudget]       = useState('10000');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, stepLog]);

  async function send(text: string) {
    if (!text.trim() || loading) return;

    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text }]);
    setInput('');
    setLoading(true);
    setStepLog([]);

    const msgId = crypto.randomUUID();

    try {
      const existingTickers = getPositions()
        .filter(p => p.status !== 'exited')
        .map(p => p.ticker);

      const res = await fetch('/api/execution/portfolio-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, existingTickers }),
      });

      if (!res.body) throw new Error('No response stream');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on SSE event delimiter
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const raw of parts) {
          if (!raw.trim()) continue;
          const typeMatch = raw.match(/^event: (.+)$/m);
          const dataMatch = raw.match(/^data: (.+)$/ms);
          if (!typeMatch || !dataMatch) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(dataMatch[1]) as SSEEvent;
            (event as { type: string }).type = typeMatch[1].trim();
          } catch { continue; }

          switch (event.type) {
            case 'step':
              setStepLog(prev => [...prev, event.message]);
              break;

            case 'initial': {
              setLoading(false);
              const initial: InitialResult = {
                positions:     event.positions,
                narrative:     event.narrative,
                positionCount: event.positionCount,
                scoredAt:      event.scoredAt,
                cached:        event.cached,
              };
              const budgetNum = Math.max(0, parseFloat(budget) || 0);
              setMessages(prev => [...prev, {
                id: msgId, role: 'assistant', result: initial, enriched: {}, enrichingDone: false, prices: {}, budget: budgetNum,
              }]);
              // Fetch live prices in the background — doesn't block card rendering
              const tickers = event.positions.map((p: PortfolioPosition) => p.ticker);
              if (tickers.length > 0) {
                fetch(`/api/quotes?symbols=${encodeURIComponent(tickers.join(','))}`)
                  .then(r => r.ok ? r.json() : null)
                  .then((data: { quotes?: Array<{ ticker: string; price: number | null }> } | null) => {
                    if (!data?.quotes) return;
                    const priceMap: Record<string, number> = {};
                    for (const q of data.quotes) {
                      if (q.price != null) priceMap[q.ticker] = q.price;
                    }
                    setMessages(prev => prev.map(m =>
                      m.id === msgId ? { ...m as AssistantMessage, prices: priceMap } as AssistantMessage : m,
                    ));
                  })
                  .catch(() => {/* prices optional */});
              }
              break;
            }

            case 'enriched': {
              const map: Record<string, EnrichedTicker> = {};
              for (const item of event.items) map[item.ticker] = item;
              setMessages(prev => prev.map(m =>
                m.id === msgId ? { ...m as AssistantMessage, enriched: map } as AssistantMessage : m,
              ));
              break;
            }

            case 'done':
              setMessages(prev => prev.map(m =>
                m.id === msgId ? { ...m as AssistantMessage, enrichingDone: true } as AssistantMessage : m,
              ));
              setStepLog([]);
              break;

            case 'error':
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'error', text: event.message }]);
              setLoading(false);
              setStepLog([]);
              break;
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'error',
        text: err instanceof Error ? err.message : 'Network error',
      }]);
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
      {/* Messages */}
      <div className="min-h-[220px] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !loading && (
          <div>
            <p className="text-xs text-[var(--cb-text-muted)]">
              Describe the portfolio you want. The agent screens stocks, then runs 19-investor hedge fund consensus and a TradingAgents debate on the top picks.
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

          if (msg.role === 'assistant') {
            const am = msg as AssistantMessage;
            const { positions, narrative } = am.result;
            return (
              <div key={msg.id} className="space-y-2">
                {narrative && (
                  <p className="text-xs text-[var(--cb-text-secondary)]">{narrative}</p>
                )}
                {positions.map((pos, i) => (
                  <PositionCard
                    key={pos.ticker}
                    pos={pos}
                    index={i}
                    enriched={am.enriched[pos.ticker]}
                    enrichingDone={am.enrichingDone}
                    price={am.prices[pos.ticker]}
                    budget={am.budget}
                    onAdd={onAdd}
                  />
                ))}
                {!am.enrichingDone && positions.length > 0 && (
                  <p className="text-[10px] text-[var(--cb-text-muted)]">
                    Running 19-persona analysis + TradingAgents debate on top 5…
                  </p>
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Loading / progress */}
        {loading && (
          <div className="rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2.5 space-y-1.5">
            {stepLog.map((step, i) => (
              <ProgressStep key={i} label={step} done={i < stepLog.length - 1} />
            ))}
            {stepLog.length === 0 && (
              <ProgressStep label="Connecting…" done={false} />
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--cb-border)] p-3">
        {/* Budget row */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-[var(--cb-text-muted)]">Budget</span>
          <div className="flex items-center rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2 py-1">
            <span className="text-xs text-[var(--cb-text-muted)]">$</span>
            <input
              type="number"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              min="0"
              step="1000"
              className="w-24 bg-transparent text-xs text-[var(--cb-text-primary)] focus:outline-none"
              placeholder="10000"
            />
          </div>
          <span className="text-xs text-[var(--cb-text-muted)]">— share counts calculated from this</span>
        </div>
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
        <p className="mt-1.5 text-[10px] text-[var(--cb-text-muted)]">
          Enter to send · cards appear in ~10s · full agent analysis fills in ~25s later
        </p>
      </div>
    </div>
  );
}

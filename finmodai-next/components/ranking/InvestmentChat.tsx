'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { RankedStock } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

type Message = {
  role:    'user' | 'assistant';
  content: string;
};

type InvestmentMode = 'explain' | 'evaluate' | 'challenge' | 'compare' | 'pitch';

const QUICK_PROMPTS: { label: string; mode: InvestmentMode; text: string }[] = [
  { label: 'Explain',   mode: 'explain',   text: 'Why is this stock ranked here?' },
  { label: 'Evaluate',  mode: 'evaluate',  text: 'Should I buy, wait, or avoid?' },
  { label: 'Challenge', mode: 'challenge', text: 'Push back on the bull case.' },
  { label: 'Compare',   mode: 'compare',   text: 'Compare against the other ranked stocks.' },
  { label: 'Pitch',     mode: 'pitch',     text: 'Write a structured investment pitch.' },
];

type PeerStock = Pick<
  RankedStock,
  'ticker' | 'score' | 'signal' | 'primaryReason' | 'mainRisk' | 'breakdown'
>;

type Props = {
  stock: RankedStock | null;
  peers: PeerStock[];
  onStockUpdate?: (stock: RankedStock) => void;
};

const SCORE_LABELS: Record<keyof RankedStock['breakdown'], string> = {
  forecastSignal:   'Forecast',
  catalystStrength: 'Catalysts',
  momentum:         'Momentum',
  earningsSetup:    'Earnings',
  valuationSignal:  'Valuation',
  riskAdjustment:   'Risk',
};

type AssumptionUpdateResponse = {
  result?: {
    adjustedScore: number;
    delta: number;
    plausibility: 'high' | 'medium' | 'low' | 'extreme';
    factorDeltas: Partial<Record<keyof RankedStock['breakdown'], number>>;
    adjustedBreakdown: RankedStock['breakdown'];
    explanation: string;
    pushback: string | null;
  };
  parsedClaim?: {
    direction: 'positive' | 'negative';
    primaryFactor: keyof RankedStock['breakdown'] | string;
  };
  error?: string;
};

function signalWord(signal: RankedStock['signal']): string {
  if (signal === 'green') return 'Bullish';
  if (signal === 'red') return 'Bearish';
  return 'Watch';
}

function signalFromScore(score: number): RankedStock['signal'] {
  if (score >= 7) return 'green';
  if (score >= 4) return 'yellow';
  return 'red';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function factorLabel(factor: string): string {
  if (factor in SCORE_LABELS) return SCORE_LABELS[factor as keyof RankedStock['breakdown']];
  return factor.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
}

function sortedFactors(stock: RankedStock): Array<[keyof RankedStock['breakdown'], number]> {
  return (Object.entries(stock.breakdown) as Array<[keyof RankedStock['breakdown'], number]>)
    .sort((a, b) => b[1] - a[1]);
}

function buildExplain(stock: RankedStock): string {
  const [first, second, third] = sortedFactors(stock);
  return [
    `${stock.ticker} is ranked ${stock.score.toFixed(1)}/10 because ${SCORE_LABELS[first[0]].toLowerCase()}, ${SCORE_LABELS[second[0]].toLowerCase()}, and ${SCORE_LABELS[third[0]].toLowerCase()} carry the setup.`,
    `${stock.primaryReason}.`,
    `Main risk: ${stock.mainRisk}.`,
  ].filter(Boolean).join(' ');
}

function buildMoveHigher(stock: RankedStock): string {
  const weak = sortedFactors(stock).slice(-3).reverse();
  return [
    `${stock.ticker}'s score moves higher if the lagging components improve:`,
    ...weak.map(([factor, value]) => `${SCORE_LABELS[factor]} is ${value.toFixed(1)}/10 and needs clearer evidence.`),
    'The highest-quality upgrade would be a catalyst that lifts estimates while the forecast path and momentum confirm.',
  ].join('\n');
}

function buildBadTrade(stock: RankedStock): string {
  const weakest = sortedFactors(stock).at(-1);
  return [
    `${stock.ticker} gets weaker if the setup stops improving inside the 1-3 month window.`,
    weakest ? `${SCORE_LABELS[weakest[0]]} is the weakest component at ${weakest[1].toFixed(1)}/10.` : null,
    `Bad-trade trigger: ${stock.mainRisk}.`,
    'Pass if guidance fails to support the catalyst, the forecast turns negative, or valuation starts pricing the upside before fundamentals confirm it.',
  ].filter(Boolean).join(' ');
}

function buildPitch(stock: RankedStock): string {
  const marketMiss = 'The market appears close to fair value, so catalysts matter more than valuation.';
  return [
    `${stock.ticker} — Weekly Pitch`,
    `Signal: ${signalWord(stock.signal)}`,
    `Why Now: ${stock.primaryReason}`,
    `Market Miss: ${marketMiss}`,
    `Risk: ${stock.mainRisk}`,
    `Trade: ${stock.signal === 'green' ? 'Buy / work up' : stock.signal === 'red' ? 'Pass / avoid' : 'Wait'}`,
  ].join('\n');
}

function buildEvaluate(stock: RankedStock): string {
  const trade = stock.signal === 'green'
    ? 'Buy / work up'
    : stock.signal === 'red'
      ? 'Avoid unless the setup changes'
      : 'Wait';
  const best = sortedFactors(stock)[0];
  return [
    `Decision: ${trade}.`,
    `${stock.ticker} scores ${stock.score.toFixed(1)}/10 with ${best ? SCORE_LABELS[best[0]].toLowerCase() : 'the score'} as the strongest input.`,
    `Use a 1-3 month horizon. The main thing to monitor is: ${stock.mainRisk}.`,
  ].join(' ');
}

function buildCompare(stock: RankedStock, peers: PeerStock[]): string {
  const ranked = [stock, ...peers]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return [
    `${stock.ticker} ranks ${ranked.findIndex(s => s.ticker === stock.ticker) + 1} of ${ranked.length} in this view.`,
    ...ranked.map(s => `${s.ticker}: ${s.score.toFixed(1)} (${signalWord(s.signal)}) — ${s.primaryReason}`),
  ].join('\n');
}

function buildLocalReply(stock: RankedStock, text: string, mode?: InvestmentMode): string | null {
  const normalized = text.toLowerCase();
  if (mode === 'pitch' || /\b(turn this into a pitch|pitch|weekly pitch)\b/.test(normalized)) return buildPitch(stock);
  if (mode === 'explain' || /\b(why|ranked here|score|breakdown)\b/.test(normalized)) return buildExplain(stock);
  if (mode === 'evaluate' || /\b(buy|wait|avoid|trade|recommendation|should i)\b/.test(normalized)) return buildEvaluate(stock);
  if (/\b(move.*higher|score higher|improve.*score|what would.*higher)\b/.test(normalized)) return buildMoveHigher(stock);
  if (mode === 'challenge' || /\b(bad trade|make this weaker|what.*weaker|what breaks|invalidat|risk|push back|bear case|challenge)\b/.test(normalized)) return buildBadTrade(stock);
  return null;
}

function buildAssumptionReply(stock: RankedStock, payload: AssumptionUpdateResponse): string {
  const result = payload.result;
  if (!result) return 'I could not apply that assumption to the score. Try making the driver more specific.';

  const fromScore = result.adjustedScore - result.delta;
  const primaryFactor = payload.parsedClaim?.primaryFactor
    ? factorLabel(payload.parsedClaim.primaryFactor)
    : 'the setup';
  const factorMoves = (Object.entries(result.factorDeltas) as Array<[keyof RankedStock['breakdown'], number]>)
    .filter(([, delta]) => Math.abs(delta) > 0)
    .map(([factor, delta]) => `${SCORE_LABELS[factor]} ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`)
    .join(', ');

  return [
    `Adjusted Score: ${fromScore.toFixed(1)} → ${result.adjustedScore.toFixed(1)} (${result.delta >= 0 ? '+' : ''}${result.delta.toFixed(1)}).`,
    `Plausibility: ${capitalize(result.plausibility)}.`,
    `Why: This mainly changes ${primaryFactor}${factorMoves ? ` (${factorMoves})` : ''}.`,
    result.explanation,
    result.pushback ? `Pushback: ${result.pushback}` : null,
    `Updated read: ${signalWord(signalFromScore(result.adjustedScore))} for ${stock.ticker}.`,
  ].filter(Boolean).join('\n');
}

function looksLikeAssumptionUpdate(text: string): boolean {
  return /\b(i think|i believe|i assume|assuming|assume|what if|because|my view|my assumption|stronger than|weaker than|beats?|misses?)\b/i.test(text);
}

export function InvestmentChat({ stock, peers, onStockUpdate }: Props) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const prevTicker = useRef<string | null>(null);

  // Reset conversation when selected stock changes
  useEffect(() => {
    if (stock?.ticker !== prevTicker.current) {
      abortRef.current?.abort();
      setMessages(stock ? [
        { role: 'user', content: "Here’s why this stock is ranked here..." },
        { role: 'assistant', content: buildExplain(stock) },
      ] : []);
      setInput('');
      setStreaming(false);
      prevTicker.current = stock?.ticker ?? null;
    }
  }, [stock]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string, modeOverride?: InvestmentMode) => {
      if (!stock || !text.trim() || streaming) return;

      const trimmed   = text.trim();
      const history   = [...messages, { role: 'user' as const, content: trimmed }];

      setMessages([...history, { role: 'assistant', content: '' }]);
      setInput('');
      setStreaming(true);

      if (looksLikeAssumptionUpdate(trimmed)) {
        const controller = new AbortController();
        abortRef.current = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), 2_000);

        try {
          const res = await fetch('/api/assumption-update', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker:       stock.ticker,
              baseScore:    stock.score,
              breakdown:    stock.breakdown,
              assumption:   trimmed,
              horizonWeeks: stock.horizonWeeks,
            }),
            signal: controller.signal,
          });

          const payload = await res.json().catch(() => null) as AssumptionUpdateResponse | null;
          if (!res.ok || !payload?.result) throw new Error(payload?.error ?? `HTTP ${res.status}`);

          const updated: RankedStock = {
            ...stock,
            score:     payload.result.adjustedScore,
            signal:    signalFromScore(payload.result.adjustedScore),
            breakdown: payload.result.adjustedBreakdown,
            primaryReason: payload.result.delta > 0
              ? `User assumption improves ${factorLabel(payload.parsedClaim?.primaryFactor ?? 'score')}`
              : stock.primaryReason,
            mainRisk: payload.result.pushback ?? stock.mainRisk,
          };
          onStockUpdate?.(updated);
          setMessages([...history, { role: 'assistant', content: buildAssumptionReply(stock, payload) }]);
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            setMessages([...history, { role: 'assistant', content: 'I could not update the score within 2 seconds. The current ranking is unchanged.' }]);
            return;
          }
          console.error('[InvestmentChat assumption-update]', err);
          setMessages([...history, { role: 'assistant', content: 'I could not apply that assumption cleanly. Try naming the driver, such as earnings, growth, valuation, momentum, or risk.' }]);
          return;
        } finally {
          window.clearTimeout(timeoutId);
          setStreaming(false);
        }
      }

      if (modeOverride === 'compare') {
        window.setTimeout(() => {
          setMessages([...history, { role: 'assistant', content: buildCompare(stock, peers) }]);
          setStreaming(false);
        }, 120);
        return;
      }

      const localReply = buildLocalReply(stock, trimmed, modeOverride);
      if (localReply) {
        window.setTimeout(() => {
          setMessages([...history, { role: 'assistant', content: localReply }]);
          setStreaming(false);
        }, 120);
        return;
      }

      const controller  = new AbortController();
      abortRef.current  = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 2_000);

      try {
        const body = {
          message: trimmed,
          ...(modeOverride ? { mode: modeOverride } : {}),
          context: {
            primaryTicker:     stock.ticker,
            score:             stock.score,
            signal:            stock.signal,
            horizonWeeks:      stock.horizonWeeks,
            breakdown:         stock.breakdown,
            primaryReason:     stock.primaryReason,
            mainRisk:          stock.mainRisk,
            forecastReturnPct: stock.meta.forecastReturnPct,
            catalystCount:     stock.meta.catalystCount,
            events:            [],
            recentPrices:      [],
            peers,
            history: history.map(m => ({ role: m.role, content: m.content })),
          },
        };

        const res = await fetch('/api/assistant', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal:  controller.signal,
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
          });
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setMessages([...history, { role: 'assistant', content: buildExplain(stock) }]);
          return;
        }
        console.error('[InvestmentChat]', err);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === '') {
            return [
              ...prev.slice(0, -1),
              { role: 'assistant', content: 'Analysis unavailable — AI provider may be offline.' },
            ];
          }
          return prev;
        });
      } finally {
        window.clearTimeout(timeoutId);
        setStreaming(false);
      }
    },
    [stock, peers, messages, streaming, onStockUpdate],
  );

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!stock) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cb-surface)] ring-1 ring-[var(--cb-border)]">
          <span className="text-xl">📊</span>
        </div>
        <p className="text-sm font-medium text-[var(--cb-text-primary)]">Select a stock</p>
        <p className="max-w-[220px] text-xs text-[var(--cb-text-muted)]">
          Click any opportunity on the left to open the investment assistant.
        </p>
      </div>
    );
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  const signalColor =
    stock.signal === 'green'  ? 'bg-emerald-500/15 text-emerald-400' :
    stock.signal === 'yellow' ? 'bg-amber-500/15 text-amber-400'     :
                                'bg-rose-500/15 text-rose-400';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--cb-border)] px-4 py-3">
        <span className="text-sm font-bold text-[var(--cb-text-primary)]">{stock.ticker}</span>
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums', signalColor)}>
          {stock.score.toFixed(1)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--cb-text-muted)]">
          {stock.primaryReason}
        </span>
      </div>

      {/* Small score chart */}
      <div className="shrink-0 border-b border-[var(--cb-border)] px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.entries(stock.breakdown) as Array<[keyof RankedStock['breakdown'], number]>).map(([key, value]) => (
            <div key={key} className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                  {SCORE_LABELS[key]}
                </span>
                <span className="text-[10px] tabular-nums text-[var(--cb-text-muted)]">{value.toFixed(1)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    'h-full rounded-full',
                    value >= 7 ? 'bg-emerald-400' : value >= 4 ? 'bg-amber-400' : 'bg-rose-400',
                  )}
                  style={{ width: `${Math.max(4, Math.min(100, value * 10))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {/* Quick-prompt buttons shown until the first message */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {QUICK_PROMPTS.map(qp => (
              <button
                key={qp.mode}
                type="button"
                onClick={() => sendMessage(qp.text, qp.mode)}
                disabled={streaming}
                className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-secondary)] transition-colors hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
              >
                {qp.label}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--cb-surface)] text-[var(--cb-text-body)] ring-1 ring-[var(--cb-border)]',
              )}
            >
              {msg.content || (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0.2s]" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--cb-border)] px-4 py-3">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about this stock…"
            disabled={streaming}
            className="min-w-0 flex-1 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-border-strong)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {streaming
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </button>
        </form>
      </div>
    </div>
  );
}

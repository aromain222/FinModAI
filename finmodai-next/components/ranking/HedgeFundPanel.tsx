'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Loader2, Play, RotateCcw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InvestorAvatar, InvestorAvatarStack, INVESTOR_META } from './InvestorAvatar';
import { hedgeFundRead, type NormalizedAgentRead } from '@/lib/ranking/agentAlignment';
import type { Signal as OpportunitySignal } from '@/lib/ranking/types';

type Signal = {
  key: string; name: string; group: 'persona' | 'quant' | string;
  signal: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string; thesis?: string;
};
type Consensus  = { bullish: number; bearish: number; neutral: number };
type Decision   = { action: string; confidence: number; reasoning: string; sizing?: string };
type AnalysisResult = {
  ticker: string;
  date: string;
  decision: Decision | null;
  signals: Signal[];
  consensus: Consensus;
  source?: 'python_backend' | 'openai_fallback';
};

const SIGNAL_STYLE = {
  bullish: { bg: 'bg-emerald-500/20', border: 'border-emerald-400/30', text: 'text-emerald-300', bar: 'bg-emerald-400', dot: 'bg-emerald-400', glow: 'shadow-[0_0_8px_rgba(52,211,153,0.2)]' },
  bearish: { bg: 'bg-rose-500/20',    border: 'border-rose-400/30',    text: 'text-rose-300',    bar: 'bg-rose-400',    dot: 'bg-rose-400',    glow: 'shadow-[0_0_8px_rgba(251,113,133,0.2)]' },
  neutral: { bg: 'bg-amber-500/15',   border: 'border-amber-400/25',   text: 'text-amber-300',   bar: 'bg-amber-400',   dot: 'bg-amber-300',   glow: '' },
} as const;

const ACTION_STYLE: Record<string, { classes: string; glow: string }> = {
  buy:   { classes: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/50', glow: 'shadow-[0_0_20px_rgba(52,211,153,0.25)]' },
  cover: { classes: 'bg-emerald-500/12 text-emerald-300/80 ring-1 ring-emerald-400/25', glow: '' },
  hold:  { classes: 'bg-amber-500/20   text-amber-200   ring-1 ring-amber-400/50',   glow: 'shadow-[0_0_20px_rgba(251,191,36,0.2)]' },
  short: { classes: 'bg-rose-500/20    text-rose-200    ring-1 ring-rose-400/50',    glow: 'shadow-[0_0_20px_rgba(251,113,133,0.25)]' },
  sell:  { classes: 'bg-rose-500/20    text-rose-200    ring-1 ring-rose-400/50',    glow: 'shadow-[0_0_20px_rgba(251,113,133,0.25)]' },
};

const SignalIcon = ({ signal }: { signal: string }) =>
  signal === 'bullish' ? <TrendingUp  className="h-3 w-3 text-emerald-400" /> :
  signal === 'bearish' ? <TrendingDown className="h-3 w-3 text-rose-400" /> :
                         <Minus        className="h-3 w-3 text-amber-400" />;

function ConsensusBar({ c, total }: { c: Consensus; total: number }) {
  if (!total) return null;
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
  const bullPct = (c.bullish / total) * 100;
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
        <div className="bg-emerald-500/70 transition-all duration-700" style={{ width: pct(c.bullish) }} />
        <div className="bg-amber-500/50  transition-all duration-700" style={{ width: pct(c.neutral)  }} />
        <div className="bg-rose-500/70   transition-all duration-700" style={{ width: pct(c.bearish)  }} />
      </div>
      <div className="flex items-center justify-between text-[9px]">
        <span className="font-semibold text-emerald-300">{c.bullish} Bullish</span>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[9px] font-bold',
          bullPct >= 60 ? 'bg-emerald-500/20 text-emerald-200' :
          bullPct <= 40 ? 'bg-rose-500/20 text-rose-200' :
                          'bg-amber-500/20 text-amber-200',
        )}>
          {bullPct.toFixed(0)}% Bull
        </span>
        <span className="font-semibold text-rose-300">{c.bearish} Bearish</span>
      </div>
    </div>
  );
}

function SignalCard({ s }: { s: Signal }) {
  const [expanded, setExpanded] = useState(false);
  const style = SIGNAL_STYLE[s.signal as keyof typeof SIGNAL_STYLE] ?? SIGNAL_STYLE.neutral;
  const meta = INVESTOR_META[s.name];
  return (
    <div className={cn('rounded-xl border transition-all duration-200', style.bg, style.border, expanded && style.glow)}>
      <button type="button" onClick={() => setExpanded(v => !v)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer">
        <InvestorAvatar name={s.name} signal={s.signal} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[11px] font-bold text-[var(--cb-text-primary)] leading-tight">{s.name}</span>
          {meta && (
            <span className={cn('text-[8px] font-medium leading-tight', style.text, 'opacity-70')}>{meta.style}</span>
          )}
        </span>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <SignalIcon signal={s.signal} />
            <span className={cn('text-[10px] font-bold capitalize', style.text)}>{s.signal}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1 w-12 overflow-hidden rounded-full bg-white/10">
              <div className={cn('h-full rounded-full transition-all duration-700', style.bar)} style={{ width: `${s.confidence}%` }} />
            </div>
            <span className={cn('shrink-0 text-[9px] font-bold tabular-nums', style.text)}>{s.confidence}%</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/8 px-3 pb-3 pt-2 space-y-1.5">
          {s.thesis && s.thesis !== s.reasoning && (
            <p className="text-[10px] leading-snug text-[var(--cb-text-secondary)]">{s.thesis}</p>
          )}
          <p className="text-[9px] leading-snug text-[var(--cb-text-muted)] italic">{s.reasoning}</p>
        </div>
      )}
    </div>
  );
}

const LOADING_NAMES = ['Warren Buffett','Ben Graham','Charlie Munger','Peter Lynch','Nassim Taleb','Michael Burry','Cathie Wood','Aswath Damodaran','Stanley Druckenmiller','Technical Analyst','Valuation Analyst','Momentum Analyst'];

function sourceLabel(source?: AnalysisResult['source']): string {
  return source === 'python_backend' ? 'Real repo backend' : 'OpenAI fallback';
}

async function readJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const preview = text.trim().slice(0, 180) || `HTTP ${res.status}`;
    throw new Error(`Agent route returned non-JSON: ${preview}`);
  }
}

function AgentReadCard({ read }: { read: NormalizedAgentRead }) {
  const tone = read.stance === 'bullish' ? 'emerald' : read.stance === 'bearish' ? 'rose' : 'amber';
  return (
    <div className={cn(
      'rounded-xl border px-3 py-2.5',
      tone === 'emerald' && 'border-emerald-400/25 bg-emerald-500/8',
      tone === 'rose' && 'border-rose-400/25 bg-rose-500/8',
      tone === 'amber' && 'border-amber-400/25 bg-amber-500/8',
    )}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--cb-text-muted)]">Unified PM Read</span>
        <span className={cn(
          'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
          read.stance === 'bullish' ? 'bg-emerald-500/15 text-emerald-300'
            : read.stance === 'bearish' ? 'bg-rose-500/15 text-rose-300'
              : 'bg-amber-500/15 text-amber-300',
        )}>{read.stance}</span>
        <span className="rounded border border-[var(--cb-border)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--cb-text-secondary)]">
          {read.readiness}
        </span>
        <span className="ml-auto text-[9px] font-bold text-[var(--cb-text-secondary)]">{read.confidence}%</span>
      </div>
      <p className="text-[10px] leading-snug text-[var(--cb-text-secondary)]">{read.pmRead}</p>
    </div>
  );
}

export function HedgeFundPanel({
  ticker,
  signal = 'yellow',
  autoRun = false,
  onResult,
}: {
  ticker: string;
  signal?: OpportunitySignal;
  autoRun?: boolean;
  onResult?: (result: AnalysisResult) => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<AnalysisResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const ranForRef = useRef<string | null>(null);

  async function run() {
    setLoading(true); setError(null); setOpen(true);
    try {
      const res  = await fetch('/api/hedge-fund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) });
      const data = await readJsonResponse(res) as Partial<AnalysisResult> & { error?: string };
      if (!res.ok) { setError(data?.error ?? `Error ${res.status}`); return; }
      if (!data || !Array.isArray(data.signals) || !data.consensus) {
        setError('Agent route returned an incomplete hedge-fund result.');
        return;
      }
      const typed = data as AnalysisResult;
      setResult(typed);
      onResult?.(typed);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!autoRun) return;
    if (ranForRef.current === ticker) return;
    ranForRef.current = ticker;
    setResult(null); setError(null); setOpen(false);
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, autoRun]);

  const total    = result ? result.consensus.bullish + result.consensus.bearish + result.consensus.neutral : 0;
  const personas = result?.signals.filter(s => s.group === 'persona') ?? [];
  const quants   = result?.signals.filter(s => s.group === 'quant')   ?? [];
  const dec      = result?.decision;
  const aStyle   = ACTION_STYLE[dec?.action ?? 'hold'] ?? ACTION_STYLE.hold;
  const agentRead = result && dec
    ? hedgeFundRead({
      action: dec.action,
      confidence: dec.confidence,
      bullish: result.consensus.bullish,
      bearish: result.consensus.bearish,
      neutral: result.consensus.neutral,
      signal,
    })
    : null;

  return (
    <div className="shrink-0 border-b border-[var(--cb-border)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button type="button" onClick={() => result && setOpen(v => !v)}
          className={cn('flex flex-1 items-center gap-2 text-left transition-colors', result && 'hover:text-[var(--cb-text-secondary)]')}>
          {result ? (open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--cb-text-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--cb-text-muted)]" />) : <span className="h-3.5 w-3.5 shrink-0" />}
          <span className="font-bold uppercase tracking-widest text-[9px] text-[var(--cb-text-secondary)]">AI Hedge Fund</span>
          <span className="text-[9px] text-[var(--cb-text-muted)]">· 19 Perspectives</span>
          {result && dec && (
            <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold capitalize', aStyle.classes)}>{dec.action}</span>
          )}
          {result && (
            <span className="ml-auto text-[9px]">
              <span className="text-emerald-400">{result.consensus.bullish}↑</span>
              <span className="mx-1 text-[var(--cb-text-muted)]">·</span>
              <span className="text-rose-400">{result.consensus.bearish}↓</span>
            </span>
          )}
        </button>
        <button type="button" disabled={loading} onClick={run}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-all disabled:opacity-50',
            result
              ? 'border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)] hover:border-[var(--cb-border-strong)]'
              : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/60 hover:bg-emerald-500/15 shadow-[0_0_12px_rgba(52,211,153,0.15)]',
          )}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : result ? <RotateCcw className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {loading ? 'Running…' : result ? 'Re-run' : 'Run'}
        </button>
      </div>

      {/* Loading — trading-floor avatar grid */}
      {loading && (
        <div className="border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-4 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-300">Consulting 19 analysts in parallel…</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {LOADING_NAMES.map((name, i) => (
              <div
                key={name}
                className="flex flex-col items-center gap-1.5"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <InvestorAvatar name={name} size="md" pulse className="opacity-60" />
                <span className="text-center text-[8px] leading-tight text-[var(--cb-text-muted)] line-clamp-2 max-w-[56px]">
                  {name.split(' ')[0]}
                  {name.includes(' ') && <><br />{name.split(' ').slice(1).join(' ')}</>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="border-t border-rose-400/20 bg-rose-500/8 px-4 py-2">
          <p className="text-[10px] text-rose-300">{error}</p>
        </div>
      )}

      {result && open && !loading && (
        <div className="border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-4 py-4 space-y-4">
          {/* PM Decision hero */}
          {dec && (
            <div className={cn('rounded-xl p-3', aStyle.classes, aStyle.glow)}>
              <p className="mb-1 text-[8px] font-bold uppercase tracking-widest opacity-60">PM Decision</p>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black capitalize tracking-tight">{dec.action}</span>
                {dec.sizing && <span className="text-sm font-semibold opacity-75">{dec.sizing}</span>}
                <span className="ml-auto text-sm font-bold">{dec.confidence}%</span>
              </div>
              {dec.reasoning && <p className="mt-1.5 text-[10px] leading-snug opacity-70">{dec.reasoning}</p>}
            </div>
          )}

          {agentRead && <AgentReadCard read={agentRead} />}

          {/* Consensus */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
                Analyst Consensus — {total} signals
              </p>
              <span className="text-[9px] text-[var(--cb-text-muted)] opacity-60">{sourceLabel(result.source)}</span>
            </div>
            <ConsensusBar c={result.consensus} total={total} />
            {/* Face stacks: bullish vs bearish */}
            <div className="mt-2.5 flex items-center justify-between">
              <InvestorAvatarStack
                names={result.signals.filter(s => s.signal === 'bullish').map(s => s.name)}
                signal="bullish"
                max={6}
              />
              <InvestorAvatarStack
                names={result.signals.filter(s => s.signal === 'bearish').map(s => s.name)}
                signal="bearish"
                max={6}
              />
            </div>
          </div>

          {/* Personas */}
          {personas.length > 0 && (
            <div>
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Investor Personas</p>
              <div className="grid gap-1.5 sm:grid-cols-2">{personas.map(s => <SignalCard key={s.key} s={s} />)}</div>
            </div>
          )}

          {/* Quants */}
          {quants.length > 0 && (
            <div>
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Quant Analysts</p>
              <div className="grid gap-1.5 sm:grid-cols-2">{quants.map(s => <SignalCard key={s.key} s={s} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

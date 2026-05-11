'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Play, RotateCcw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Signal = {
  key: string; name: string; group: 'persona' | 'quant' | string;
  signal: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string;
};
type Consensus  = { bullish: number; bearish: number; neutral: number };
type Decision   = { action: string; quantity: number; confidence: number; reasoning: string };
type AnalysisResult = { ticker: string; date: string; decision: Decision | null; signals: Signal[]; consensus: Consensus };

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
  return (
    <div className={cn('rounded-lg border transition-all duration-200', style.bg, style.border, expanded && style.glow)}>
      <button type="button" onClick={() => setExpanded(v => !v)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <SignalIcon signal={s.signal} />
        <span className="flex-1 truncate text-[10px] font-semibold text-[var(--cb-text-primary)]">{s.name}</span>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
            <div className={cn('h-full rounded-full', style.bar)} style={{ width: `${s.confidence}%` }} />
          </div>
          <span className={cn('shrink-0 text-[9px] font-bold tabular-nums', style.text)}>{s.confidence}%</span>
        </div>
      </button>
      {expanded && s.reasoning && (
        <div className="border-t border-white/8 px-2.5 pb-2.5 pt-2">
          <p className="text-[10px] leading-snug text-[var(--cb-text-secondary)]">{s.reasoning}</p>
        </div>
      )}
    </div>
  );
}

const LOADING_NAMES = ['Warren Buffett','Ben Graham','Charlie Munger','Peter Lynch','Nassim Taleb','Michael Burry','Cathie Wood','Aswath Damodaran','Stanley Druckenmiller','Technical Analyst','Valuation Analyst'];

export function HedgeFundPanel({ ticker }: { ticker: string }) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<AnalysisResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null); setOpen(true);
    try {
      const res  = await fetch('/api/hedge-fund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? `Error ${res.status}`); return; }
      setResult(data as AnalysisResult);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setLoading(false); }
  }

  const total    = result ? result.consensus.bullish + result.consensus.bearish + result.consensus.neutral : 0;
  const personas = result?.signals.filter(s => s.group === 'persona') ?? [];
  const quants   = result?.signals.filter(s => s.group === 'quant')   ?? [];
  const dec      = result?.decision;
  const aStyle   = ACTION_STYLE[dec?.action ?? 'hold'] ?? ACTION_STYLE.hold;

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

      {/* Loading */}
      {loading && (
        <div className="border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-4 py-3">
          <div className="mb-2.5 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-300">Running 19 analysts in parallel…</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LOADING_NAMES.map((n, i) => (
              <span key={n} className="animate-pulse rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-[var(--cb-text-muted)]"
                style={{ animationDelay: `${i * 150}ms` }}>{n}</span>
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
                {dec.quantity > 0 && <span className="text-sm font-semibold opacity-75">{dec.quantity} shares</span>}
                <span className="ml-auto text-sm font-bold">{dec.confidence}%</span>
              </div>
              {dec.reasoning && <p className="mt-1.5 text-[10px] leading-snug opacity-70">{dec.reasoning}</p>}
            </div>
          )}

          {/* Consensus */}
          <div>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
              Analyst Consensus — {total} signals
            </p>
            <ConsensusBar c={result.consensus} total={total} />
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

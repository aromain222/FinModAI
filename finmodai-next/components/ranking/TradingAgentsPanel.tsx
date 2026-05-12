'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

type AnalystReports = { market: string | null; fundamentals: string | null; sentiment: string | null; news: string | null };
type AnalysisResult = {
  ticker: string;
  date: string;
  decision: string;
  summary: string | null;
  thesis: string | null;
  price_target: number | null;
  time_horizon: string | null;
  reports: AnalystReports;
  source?: 'python_backend' | 'openai_fallback';
};

const DECISION_STYLE: Record<string, { bg: string; text: string; ring: string; glow: string }> = {
  Buy:         { bg: 'bg-emerald-500/20', text: 'text-emerald-200', ring: 'ring-emerald-400/50', glow: 'shadow-[0_0_20px_rgba(52,211,153,0.25)]' },
  Overweight:  { bg: 'bg-emerald-500/12', text: 'text-emerald-300', ring: 'ring-emerald-400/25', glow: '' },
  Hold:        { bg: 'bg-amber-500/20',   text: 'text-amber-200',   ring: 'ring-amber-400/50',   glow: 'shadow-[0_0_20px_rgba(251,191,36,0.2)]' },
  Underweight: { bg: 'bg-amber-500/12',   text: 'text-amber-300',   ring: 'ring-amber-400/25',   glow: '' },
  Sell:        { bg: 'bg-rose-500/20',    text: 'text-rose-200',    ring: 'ring-rose-400/50',    glow: 'shadow-[0_0_20px_rgba(251,113,133,0.25)]' },
};

const REPORT_LABELS: Record<keyof AnalystReports, string> = {
  market: 'Technical', fundamentals: 'Fundamentals', sentiment: 'Sentiment', news: 'News',
};

function ReportCard({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--cb-surface-subtle)] transition-colors">
        {open ? <ChevronDown className="h-3 w-3 shrink-0 text-[var(--cb-text-muted)]" /> : <ChevronRight className="h-3 w-3 shrink-0 text-[var(--cb-text-muted)]" />}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cb-text-secondary)]">{label}</span>
        <span className="ml-auto text-[9px] text-[var(--cb-text-muted)]">{open ? 'Collapse' : 'Read'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 pb-3 pt-2">
          <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-[var(--cb-text-secondary)]">{text}</p>
        </div>
      )}
    </div>
  );
}

const PIPELINE_STAGES = ['4 Analysts', 'Bull Researcher', 'Bear Researcher', 'Risk Manager', 'PM Decision'];

function sourceLabel(source?: AnalysisResult['source']): string {
  return source === 'python_backend' ? 'Real repo backend' : 'OpenAI fallback';
}

export function TradingAgentsPanel({ ticker }: { ticker: string }) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<AnalysisResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/tradingagents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? `Error ${res.status}`); return; }
      setResult(data as AnalysisResult); setOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setLoading(false); }
  }

  const decision = result?.decision ?? '';
  const dStyle   = DECISION_STYLE[decision] ?? DECISION_STYLE['Hold'];

  return (
    <div className="shrink-0 border-b border-[var(--cb-border)]">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button type="button" onClick={() => result && setOpen(v => !v)}
          className={cn('flex flex-1 items-center gap-2 text-left transition-colors', result && 'hover:text-[var(--cb-text-secondary)]')}>
          {result ? (open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--cb-text-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--cb-text-muted)]" />) : <span className="h-3.5 w-3.5 shrink-0" />}
          <span className="font-bold uppercase tracking-widest text-[9px] text-[var(--cb-text-secondary)]">TradingAgents</span>
          <span className="text-[9px] text-[var(--cb-text-muted)]">· Debate Pipeline</span>
          {result && (
            <span className="hidden rounded border border-[var(--cb-border)] px-1.5 py-0.5 text-[8px] text-[var(--cb-text-muted)] sm:inline">
              {sourceLabel(result.source)}
            </span>
          )}
          {result && (
            <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold ring-1', dStyle.bg, dStyle.text, dStyle.ring)}>{decision}</span>
          )}
        </button>
        <button type="button" disabled={loading} onClick={run}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-all disabled:opacity-50',
            result
              ? 'border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)] hover:border-[var(--cb-border-strong)]'
              : 'border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:border-blue-500/60 hover:bg-blue-500/15 shadow-[0_0_12px_rgba(96,165,250,0.15)]',
          )}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : result ? <RotateCcw className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {loading ? 'Running…' : result ? 'Re-run' : 'Run'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            <span className="text-[10px] font-medium text-blue-300">Running debate pipeline…</span>
          </div>
          <div className="flex items-center gap-1">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center gap-1">
                <span className="animate-pulse rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-[var(--cb-text-muted)]"
                  style={{ animationDelay: `${i * 300}ms` }}>{stage}</span>
                {i < PIPELINE_STAGES.length - 1 && <span className="text-[var(--cb-text-muted)] opacity-40">→</span>}
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
        <div className="border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-4 py-4 space-y-3">
          {/* Decision hero */}
          <div className={cn('rounded-xl p-3 ring-1', dStyle.bg, dStyle.ring, dStyle.glow)}>
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest opacity-60">PM Verdict</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn('text-2xl font-black tracking-tight', dStyle.text)}>{decision}</span>
              {result.price_target != null && (
                <span className={cn('text-sm font-semibold opacity-80', dStyle.text)}>
                  Target ${result.price_target.toFixed(2)}
                </span>
              )}
              {result.time_horizon && <span className="text-[10px] opacity-60">{result.time_horizon}</span>}
              <span className="ml-auto text-[9px] opacity-50">{result.date}</span>
            </div>
          </div>

          {result.summary && (
            <div>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Executive Summary</p>
              <p className="text-[11px] leading-snug text-[var(--cb-text-secondary)]">{result.summary}</p>
            </div>
          )}
          {result.thesis && (
            <div>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Investment Thesis</p>
              <p className="text-[11px] leading-snug text-[var(--cb-text-secondary)]">{result.thesis}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Analyst Reports</p>
            <div className="space-y-1.5">
              {(Object.entries(result.reports) as Array<[keyof AnalystReports, string | null]>)
                .filter(([, v]) => !!v)
                .map(([key, text]) => <ReportCard key={key} label={REPORT_LABELS[key]} text={text!} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Send, Loader2 } from 'lucide-react';
import type {
  IncomeStatement, CashFlowStatement, KeyMetrics, SecFiling, InsiderTransaction,
} from '@/lib/dexter/client';
import { cn } from '@/lib/utils';

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(n: number | null, mode: 'money' | 'pct' | 'ratio' | 'eps' = 'money'): string {
  if (n == null) return '—';
  if (mode === 'pct')   return `${(n * 100).toFixed(1)}%`;
  if (mode === 'ratio') return n.toFixed(2);
  if (mode === 'eps')   return `$${n.toFixed(2)}`;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

function trendColor(vals: (number | null)[]): string {
  const clean = vals.filter((v): v is number => v != null);
  if (clean.length < 2) return 'text-[var(--cb-text-muted)]';
  return clean[0]! >= clean[1]! ? 'text-emerald-300' : 'text-rose-300';
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'financials' | 'filings' | 'insider' | 'research';

const TABS: { id: Tab; label: string }[] = [
  { id: 'financials', label: 'Financials' },
  { id: 'filings',    label: 'Filings'    },
  { id: 'insider',    label: 'Insider'    },
  { id: 'research',   label: 'Research'   },
];

// ── Overview response type ────────────────────────────────────────────────────

type OverviewData = {
  income:   IncomeStatement[];
  cashflow: CashFlowStatement[];
  metrics:  KeyMetrics[];
  filings:  SecFiling[];
  insider:  InsiderTransaction[];
};

// ── Sub-components ────────────────────────────────────────────────────────────

function FinancialsTab({ income, cashflow, metrics }: {
  income: IncomeStatement[]; cashflow: CashFlowStatement[]; metrics: KeyMetrics[];
}) {
  const rows: Array<{ label: string; values: string[]; colorValues: (number | null)[] }> = [
    {
      label:       'Revenue',
      values:      income.map(r => fmt(r.revenue)),
      colorValues: income.map(r => r.revenue),
    },
    {
      label:       'Gross Margin',
      values:      income.map((r, i) => {
        const m = metrics[i];
        return fmt(m?.gross_profit_margin ?? null, 'pct');
      }),
      colorValues: metrics.map(m => m.gross_profit_margin),
    },
    {
      label:       'Net Income',
      values:      income.map(r => fmt(r.net_income)),
      colorValues: income.map(r => r.net_income),
    },
    {
      label:       'FCF',
      values:      cashflow.map(r => fmt(r.free_cash_flow)),
      colorValues: cashflow.map(r => r.free_cash_flow),
    },
    {
      label:       'EPS',
      values:      income.map(r => fmt(r.eps_diluted, 'eps')),
      colorValues: income.map(r => r.eps_diluted),
    },
  ];

  const years = income.slice(0, 4).map(r => `FY${r.calendar_year}`);

  // Hero metrics — most recent year, big display
  const latest = income[0];
  const latestCF = cashflow[0];
  const latestM = metrics[0];

  return (
    <div className="space-y-3">
      {/* Hero numbers */}
      {latest && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Revenue',    value: fmt(latest.revenue),       color: trendColor(income.map(r => r.revenue)) },
            { label: 'Net Income', value: fmt(latest.net_income),    color: trendColor(income.map(r => r.net_income)) },
            { label: 'FCF',        value: fmt(latestCF?.free_cash_flow ?? null), color: trendColor(cashflow.map(r => r.free_cash_flow)) },
            { label: 'EPS',        value: fmt(latest.eps_diluted, 'eps'), color: trendColor(income.map(r => r.eps_diluted)) },
          ].map(h => (
            <div key={h.label} className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2">
              <div className="text-[8px] uppercase tracking-widest text-[var(--cb-text-muted)]">{h.label}</div>
              <div className={cn('mt-0.5 text-base font-bold tabular-nums', h.color)}>{h.value}</div>
              <div className="text-[8px] text-[var(--cb-text-muted)]">TTM</div>
            </div>
          ))}
        </div>
      )}

      {/* Historical table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] text-[10px]">
          <thead>
            <tr>
              <th className="pb-1.5 pr-3 text-left text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Metric</th>
              {years.map(y => (
                <th key={y} className="pb-1.5 text-right text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} className="border-t border-[var(--cb-border-subtle)]">
                <td className="py-1.5 pr-3 text-[var(--cb-text-muted)]">{row.label}</td>
                {row.values.slice(0, 4).map((v, i) => (
                  <td key={i} className={cn(
                    'py-1.5 text-right font-medium tabular-nums',
                    i === 0 ? trendColor(row.colorValues) : 'text-[var(--cb-text-secondary)]',
                  )}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Key ratios */}
      {latestM && (
        <div className="grid grid-cols-3 gap-2 border-t border-[var(--cb-border)] pt-3">
          {[
            { label: 'P/E',        value: fmt(latestM.pe_ratio,         'ratio') },
            { label: 'P/B',        value: fmt(latestM.price_to_book,    'ratio') },
            { label: 'EV/EBITDA',  value: fmt(latestM.ev_to_ebitda,     'ratio') },
            { label: 'ROE',        value: fmt(latestM.return_on_equity,  'pct')  },
            { label: 'Net Margin', value: fmt(latestM.net_profit_margin, 'pct')  },
            { label: 'D/E',        value: fmt(latestM.debt_to_equity,   'ratio') },
          ].map(r => (
            <div key={r.label} className="rounded-md bg-[var(--cb-surface)] px-2 py-1.5">
              <div className="text-[8px] uppercase tracking-wide text-[var(--cb-text-muted)]">{r.label}</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-[var(--cb-text-primary)]">{r.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilingsTab({ filings }: { filings: SecFiling[] }) {
  if (filings.length === 0)
    return <p className="text-[10px] text-[var(--cb-text-muted)]">No filings loaded.</p>;
  return (
    <div className="space-y-1.5">
      {filings.map((f, i) => (
        <a
          key={i}
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-2 text-left transition-colors hover:border-[var(--cb-border)] hover:bg-[var(--cb-surface-subtle)]"
        >
          <span className="mt-0.5 shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
            {f.form_type}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-[var(--cb-text-primary)]">{f.description}</p>
            <p className="text-[9px] text-[var(--cb-text-muted)]">{f.filing_date}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

function InsiderTab({ insider }: { insider: InsiderTransaction[] }) {
  if (insider.length === 0)
    return <p className="text-[10px] text-[var(--cb-text-muted)]">No insider data loaded.</p>;
  return (
    <div className="space-y-1">
      {insider.map((t, i) => {
        const isBuy = t.transaction_type?.toLowerCase().includes('purchase') ||
                      t.transaction_type?.toLowerCase() === 'buy';
        return (
          <div key={i} className="flex items-center gap-2 py-1 border-b border-[var(--cb-border-subtle)]">
            <span className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold',
              isBuy ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300',
            )}>
              {isBuy ? 'Buy' : 'Sell'}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-[var(--cb-text-secondary)]">{t.name}</span>
              {t.title && <span className="ml-1 text-[9px] text-[var(--cb-text-muted)]">· {t.title}</span>}
            </div>
            <div className="text-right">
              <div className="text-[10px] tabular-nums text-[var(--cb-text-primary)]">
                {t.total_value != null ? fmt(t.total_value) : '—'}
              </div>
              <div className="text-[9px] text-[var(--cb-text-muted)]">{t.transaction_date}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResearchTab({ ticker }: { ticker: string }) {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [streaming, setStreaming] = useState(false);

  async function ask(q: string) {
    if (!q.trim() || streaming) return;
    setStreaming(true);
    setResponse('');
    try {
      const res = await fetch('/api/dexter/research', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: q, ticker }),
      });
      if (!res.ok || !res.body) { setResponse('[Error: ' + res.status + ']'); return; }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setResponse(text);
      }
    } finally {
      setStreaming(false);
    }
  }

  const QUICK = [
    `What is ${ticker}'s free cash flow trend over the last 4 years?`,
    `Estimate ${ticker}'s intrinsic value using a simple DCF.`,
    `What are the key risks in ${ticker}'s most recent 10-K?`,
    `How has ${ticker}'s gross margin trended and why?`,
  ];

  return (
    <div className="space-y-2">
      {!response && !streaming && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {QUICK.map(q => (
            <button
              key={q}
              type="button"
              disabled={streaming}
              onClick={() => { setQuestion(q); ask(q); }}
              className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-2 text-left text-[10px] text-[var(--cb-text-muted)] transition-colors hover:border-[var(--cb-border)] hover:text-[var(--cb-text-secondary)] disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {(response || streaming) && (
        <div className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2">
          <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-[var(--cb-text-secondary)]">
            {response}
            {streaming && <span className="ml-0.5 animate-pulse">▌</span>}
          </p>
        </div>
      )}

      <form
        onSubmit={e => { e.preventDefault(); ask(question); setQuestion(''); }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask about financials, valuation, filings…"
          className="h-8 flex-1 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 text-[11px] text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-border-strong)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!question.trim() || streaming}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)] transition-colors hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-secondary)] disabled:opacity-40"
        >
          {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Props = { ticker: string };

export function DexterPanel({ ticker }: Props) {
  const [open,    setOpen]    = useState(false);
  const [tab,     setTab]     = useState<Tab>('financials');
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState<OverviewData | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || fetchedFor.current === ticker) return;
    fetchedFor.current = ticker;
    setLoading(true);
    setError(null);
    fetch(`/api/dexter?action=overview&ticker=${ticker}`)
      .then(r => r.json())
      .then((d: OverviewData) => setData(d))
      .catch(err => setError(err.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [open, ticker]);

  // Reset when ticker changes
  useEffect(() => {
    fetchedFor.current = null;
    setData(null);
    setError(null);
  }, [ticker]);

  return (
    <div className="shrink-0 border-b border-[var(--cb-border)]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:text-[var(--cb-text-secondary)]"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--cb-text-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--cb-text-muted)]" />}
        <span className="font-bold uppercase tracking-widest text-[9px] text-[var(--cb-text-secondary)]">Dexter</span>
        <span className="text-[9px] text-[var(--cb-text-muted)]">· Fundamentals · Filings · Insider · Research</span>
      </button>

      {open && (
        <div className="border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)]">
          {/* Tabs */}
          <div className="flex border-b border-[var(--cb-border)]">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex-1 py-1.5 text-[10px] font-medium transition-colors',
                  tab === t.id
                    ? 'bg-[var(--cb-surface)] text-[var(--cb-text-primary)]'
                    : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="px-4 py-3">
            {loading && (
              <div className="flex items-center gap-2 text-[10px] text-[var(--cb-text-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading financial data…
              </div>
            )}
            {error && !loading && (
              <p className="text-[10px] text-rose-300">{error}</p>
            )}
            {!loading && !error && data && tab === 'financials' && (
              <FinancialsTab income={data.income} cashflow={data.cashflow} metrics={data.metrics} />
            )}
            {!loading && !error && data && tab === 'filings' && (
              <FilingsTab filings={data.filings} />
            )}
            {!loading && !error && data && tab === 'insider' && (
              <InsiderTab insider={data.insider} />
            )}
            {tab === 'research' && (
              <ResearchTab ticker={ticker} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

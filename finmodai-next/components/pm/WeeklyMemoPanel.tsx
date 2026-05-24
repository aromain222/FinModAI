'use client';

import { useState } from 'react';
import type { WeeklyMemo } from '@/lib/pm/types';
import { Download, FileText, Loader2, RefreshCw } from 'lucide-react';

type Props = {
  memo: WeeklyMemo | null;
  onGenerate: () => Promise<void>;
};

function MemoSection({ title, content }: { title: string; content: string | undefined }) {
  if (!content) return null;
  return (
    <div>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{title}</p>
      <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">{content}</p>
    </div>
  );
}

function TickerList({ tickers, label }: { tickers: string[] | undefined; label: string }) {
  if (!tickers || tickers.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1">
        {tickers.map((t) => (
          <span
            key={t}
            className="rounded border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--cb-text-secondary)]"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildMemoText(memo: WeeklyMemo): string {
  const lines: string[] = [
    `# CapitalBase — Weekly PM Memo`,
    `Week ending: ${memo.weekEnd}`,
    '',
    `## Portfolio Performance`,
    memo.portfolioPerformance,
    '',
  ];
  if (memo.portfolioSummary) { lines.push(`## Summary`, memo.portfolioSummary, ''); }
  if (memo.winners.length)    { lines.push(`## Winners`, memo.winners.join(', '), ''); }
  if (memo.losers.length)     { lines.push(`## Losers`, memo.losers.join(', '), ''); }
  if (memo.alertsSummary)     { lines.push(`## Alerts`, memo.alertsSummary, ''); }
  if (memo.thesisChanges.length) { lines.push(`## Thesis Changes`, ...memo.thesisChanges.map((c) => `- ${c}`), ''); }
  if (memo.decisionsMade.length) { lines.push(`## Decisions`, ...memo.decisionsMade.map((d) => `- ${d}`), ''); }
  if (memo.agentDisagreementSummary) { lines.push(`## Agent Disagreement`, memo.agentDisagreementSummary, ''); }
  if (memo.macroContext)      { lines.push(`## Macro Context`, memo.macroContext, ''); }
  if (memo.agentHighlights)   { lines.push(`## Agent Highlights`, memo.agentHighlights, ''); }
  lines.push(`---`, `Generated at: ${new Date(memo.generatedAt).toLocaleString()}`);
  return lines.join('\n');
}

function downloadMemo(memo: WeeklyMemo) {
  const text = buildMemoText(memo);
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `capitalbase-memo-${memo.weekEnd}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function WeeklyMemoPanel({ memo, onGenerate }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      await onGenerate();
    } catch {
      setError('Failed to generate memo. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section aria-label="Weekly memo">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
          Weekly Memo
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="flex items-center gap-1 rounded border border-[var(--cb-border)] px-2 py-1 text-[10px] font-medium text-[var(--cb-text-secondary)] transition-all hover:border-[var(--cb-green)] hover:text-[var(--cb-green)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {memo ? 'Regenerate' : 'Generate Weekly Memo'}
          </button>
          {memo && (
            <button
              type="button"
              onClick={() => downloadMemo(memo)}
              className="flex items-center gap-1 rounded border border-[var(--cb-border)] px-2 py-1 text-[10px] font-medium text-[var(--cb-text-secondary)] transition-all hover:border-[var(--cb-green)] hover:text-[var(--cb-green)]"
              aria-label="Download memo as markdown"
            >
              <Download className="h-3 w-3" />
              Download
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-2 rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">{error}</p>
      )}

      {!memo && !generating ? (
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-6 py-10 text-center">
          <FileText className="mx-auto mb-3 h-6 w-6 text-[var(--cb-text-muted)]" />
          <p className="text-sm font-medium text-[var(--cb-text-secondary)]">No weekly memo generated yet.</p>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
            Click &ldquo;Generate Weekly Memo&rdquo; to synthesize the week&apos;s thesis changes, alerts, and decisions.
          </p>
        </div>
      ) : generating ? (
        <div className="flex items-center justify-center rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] py-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--cb-text-muted)]" />
            <p className="text-xs text-[var(--cb-text-muted)]">Generating memo…</p>
          </div>
        </div>
      ) : memo ? (
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-4 py-4 space-y-4">
          {/* Header */}
          <div className="border-b border-[var(--cb-border-subtle)] pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
              CapitalBase · Weekly PM Memo
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--cb-text-primary)]">
              Week ending {memo.weekEnd}
            </p>
            <p className="text-[10px] text-[var(--cb-text-muted)]">
              Generated {new Date(memo.generatedAt).toLocaleString()}
            </p>
          </div>

          <MemoSection title="Portfolio Performance" content={memo.portfolioPerformance} />
          <MemoSection title="Portfolio Summary" content={memo.portfolioSummary} />

          <div className="grid gap-3 sm:grid-cols-2">
            <TickerList tickers={memo.winners} label="Winners" />
            <TickerList tickers={memo.losers} label="Losers" />
            <TickerList tickers={memo.thesisBreaks} label="Thesis Breaks" />
            <TickerList tickers={memo.thesisConfirmations} label="Thesis Confirmed" />
          </div>

          <MemoSection title="Alerts This Week" content={memo.alertsSummary} />

          {memo.thesisChanges.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
                Thesis Changes
              </p>
              <ul className="space-y-1">
                {memo.thesisChanges.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--cb-text-secondary)]">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--cb-text-muted)]" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {memo.decisionsMade.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
                Decisions Made
              </p>
              <ul className="space-y-1">
                {memo.decisionsMade.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--cb-text-secondary)]">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--cb-text-muted)]" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <MemoSection title="Agent Disagreement" content={memo.agentDisagreementSummary} />
          <MemoSection title="Agent Highlights" content={memo.agentHighlights} />
          <MemoSection title="Macro Context" content={memo.macroContext} />

          {memo.nextWeekWatchlist && memo.nextWeekWatchlist.length > 0 && (
            <TickerList tickers={memo.nextWeekWatchlist} label="Next Week Watchlist" />
          )}
        </div>
      ) : null}
    </section>
  );
}

'use client';

import { useState } from 'react';
import { ArrowRight, BrainCircuit, ShieldAlert, Sparkles } from 'lucide-react';
import type { SwingThesisSleeve } from '@/lib/pm/types';

type SleeveResponse = { ok?: boolean; sleeve?: SwingThesisSleeve; error?: string; detail?: string };

function signed(value: number | null): string {
  if (value === null) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function ThesisSleeveBuilder() {
  const [idea, setIdea] = useState('');
  const [capital, setCapital] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sleeve, setSleeve] = useState<SwingThesisSleeve | null>(null);

  async function buildSleeve() {
    setLoading(true);
    setError(null);
    try {
      const capitalUsd = capital.trim() ? Number(capital.replaceAll(',', '')) : undefined;
      if (capitalUsd !== undefined && (!Number.isFinite(capitalUsd) || capitalUsd <= 0)) {
        setError('Enter a positive sleeve size or leave it blank.');
        return;
      }
      const response = await fetch('/api/pm/thesis-sleeve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: idea.trim() || undefined, capitalUsd, horizonDays: 45, maxPositions: 4 }),
      });
      const payload = await response.json().catch(() => ({})) as SleeveResponse;
      if (!response.ok || !payload.sleeve) throw new Error(payload.detail ?? payload.error ?? `HTTP ${response.status}`);
      setSleeve(payload.sleeve);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to build the sleeve.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-[var(--cb-green)]" />
            <h2 className="text-sm font-semibold text-[var(--cb-text-primary)]">Thesis → Sleeve</h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--cb-text-muted)]">
            Give Claude a swing thesis to challenge, or leave it blank to find the strongest 1–3 month setup on the ranked board.
          </p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Research only · no order submitted</span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
        <textarea
          value={idea}
          onChange={event => setIdea(event.target.value)}
          rows={3}
          maxLength={800}
          placeholder="Optional thesis: lower rates could re-accelerate fintech activity. Test the idea and find the best expressions."
          className="min-h-20 resize-none rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] p-3 text-sm text-[var(--cb-text-primary)] outline-none placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-green)]"
        />
        <input
          value={capital}
          onChange={event => setCapital(event.target.value)}
          inputMode="decimal"
          placeholder="Sleeve size (optional)"
          className="h-10 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 text-sm text-[var(--cb-text-primary)] outline-none placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-green)]"
        />
        <button
          type="button"
          onClick={() => { void buildSleeve(); }}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--cb-green)] px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          <Sparkles className={loading ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
          {loading ? 'Building…' : idea.trim() ? 'Test thesis' : 'Find a thesis'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {sleeve && <SleeveResult sleeve={sleeve} />}
    </section>
  );
}

function SleeveResult({ sleeve }: { sleeve: SwingThesisSleeve }) {
  const decisionTone = sleeve.decision === 'build' ? 'var(--cb-bull)' : sleeve.decision === 'watch' ? 'var(--cb-caution)' : 'var(--cb-bear)';
  return (
    <div className="mt-5 space-y-4 border-t border-[var(--cb-border)] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded border px-2 py-1 font-mono text-xs font-semibold" style={{ borderColor: decisionTone, color: decisionTone }}>{sleeve.decision.toUpperCase()}</span>
        <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">{sleeve.theme}</h3>
        <span className="font-mono text-xs text-[var(--cb-text-muted)]">{sleeve.horizonDays}d · {sleeve.confidence}/100 confidence · {sleeve.cashWeightPct}% cash</span>
      </div>

      <div className="grid gap-4 text-sm md:grid-cols-2">
        <TextBlock label="Thesis" value={sleeve.thesis} />
        <TextBlock label="Why now" value={sleeve.whyNow} />
        <TextBlock label="What is priced" value={sleeve.whatIsPriced} />
        <TextBlock label="Whole thesis breaks if" value={sleeve.invalidation} danger />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Transmission path</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {sleeve.transmissionPath.map((step, index) => (
            <div key={`${step}-${index}`} className="flex items-center gap-2">
              <span className="rounded border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2.5 py-1.5 text-xs text-[var(--cb-text-secondary)]">{step}</span>
              {index < sleeve.transmissionPath.length - 1 && <ArrowRight className="h-3 w-3 text-[var(--cb-text-muted)]" />}
            </div>
          ))}
        </div>
      </div>

      {sleeve.positions.length === 0 ? (
        <div className="rounded border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] p-3 text-sm text-[var(--cb-text-muted)]">No sleeve recommended. The evidence does not clear the build threshold.</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sleeve.positions.map(position => (
            <article key={position.ticker} className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-base font-bold text-[var(--cb-text-primary)]">{position.ticker}</span>
                  {position.companyName && <span className="ml-2 text-xs text-[var(--cb-text-muted)]">{position.companyName}</span>}
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--cb-text-muted)]">{position.role} · rank {position.rankScore.toFixed(1)} · {position.signal}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-base text-[var(--cb-text-primary)]">{position.weightPct.toFixed(1)}%</p>
                  {position.notionalUsd !== null && <p className="font-mono text-[10px] text-[var(--cb-text-muted)]">${position.notionalUsd.toLocaleString()}</p>}
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--cb-text-secondary)]">{position.thesis}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 border-y border-[var(--cb-border)] py-2 text-center font-mono text-xs">
                <span className="text-red-300">Bear {signed(position.forecast.bearReturnPct)}</span>
                <span className="text-[var(--cb-text-primary)]">Base {signed(position.forecast.baseReturnPct)}</span>
                <span className="text-emerald-300">Bull {signed(position.forecast.bullReturnPct)}</span>
              </div>
              <p className="mt-2 text-[10px] text-[var(--cb-text-muted)]">{position.forecast.source}</p>
              <MiniRow label="Catalyst" value={position.keyCatalyst} />
              <MiniRow label="Entry" value={position.entryCondition} />
              <MiniRow label="Invalidation" value={position.invalidation} danger />
            </article>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <List label="Monitor" items={sleeve.monitor} />
        <List label="Portfolio risks" items={sleeve.portfolioRisks} danger />
      </div>
      <div className="flex items-start gap-2 border-t border-[var(--cb-border)] pt-3 text-[10px] text-[var(--cb-text-muted)]">
        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{sleeve.evidenceQuality.liveCandidates} live candidates · ranked {new Date(sleeve.evidenceQuality.rankedAt).toLocaleString()} · {sleeve.evidenceQuality.warnings.join(' ')}</span>
      </div>
    </div>
  );
}

function TextBlock({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p><p className={danger ? 'mt-1 leading-relaxed text-red-200' : 'mt-1 leading-relaxed text-[var(--cb-text-secondary)]'}>{value}</p></div>;
}

function MiniRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <p className={danger ? 'mt-2 text-[11px] text-red-200' : 'mt-2 text-[11px] text-[var(--cb-text-secondary)]'}><span className="font-semibold text-[var(--cb-text-muted)]">{label}:</span> {value}</p>;
}

function List({ label, items, danger = false }: { label: string; items: string[]; danger?: boolean }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p><ul className="mt-1 space-y-1">{items.map((item, index) => <li key={`${item}-${index}`} className={danger ? 'text-xs text-red-200' : 'text-xs text-[var(--cb-text-secondary)]'}>— {item}</li>)}</ul></div>;
}

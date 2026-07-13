'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Download, FileText, RefreshCw, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import type { DailyPortfolioBrief } from '@/lib/pm/dailyBrief/generator';

function currency(value: number | null | undefined, digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits }).format(value);
}

function pct(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function actionLabel(action: DailyPortfolioBrief['analysis']['positionViews'][number]['action']): string {
  return action === 'add_watch' ? 'Add watch' : action === 'trim_watch' ? 'Trim watch' : action === 'review' ? 'Review' : 'Hold';
}

function actionTone(action: DailyPortfolioBrief['analysis']['positionViews'][number]['action']): string {
  if (action === 'review' || action === 'trim_watch') return 'var(--cb-caution)';
  if (action === 'add_watch') return 'var(--cb-bull)';
  return 'var(--cb-neutral)';
}

function statusTone(status: string | null): string {
  if (status === 'broken') return 'var(--cb-bear)';
  if (status === 'weakening') return 'var(--cb-caution)';
  if (status === 'strengthening') return 'var(--cb-bull)';
  return 'var(--cb-neutral)';
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-[var(--cb-border-strong)] bg-[var(--cb-surface)] px-3 py-2 shadow-lg">
      <p className="mb-1 font-mono text-[10px] text-[var(--cb-text-muted)]">{label}</p>
      {payload.map((item, index) => (
        <p key={`${item.name}-${index}`} className="text-xs text-[var(--cb-text-primary)]">
          <span style={{ color: item.color }}>{item.name}:</span> {item.name?.includes('P&L') ? currency(item.value, 0) : pct(item.value, 1)}
        </p>
      ))}
    </div>
  );
}

export function DailyPortfolioBriefPanel() {
  const [briefs, setBriefs] = useState<DailyPortfolioBrief[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/pm/daily-portfolio-brief', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { briefs?: DailyPortfolioBrief[] };
      const next = payload.briefs ?? [];
      setBriefs(next);
      setSelectedId(current => current && next.some(brief => brief.id === current) ? current : next[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load daily portfolio briefs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => briefs.find(brief => brief.id === selectedId) ?? null, [briefs, selectedId]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/pm/daily-portfolio-brief', { method: 'POST' });
      const payload = await response.json().catch(() => ({})) as { brief?: DailyPortfolioBrief; error?: string; reason?: string };
      if (!response.ok || !payload.brief) throw new Error(payload.reason ?? payload.error ?? `HTTP ${response.status}`);
      setBriefs(current => [payload.brief!, ...current]);
      setSelectedId(payload.brief.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate brief.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Post-close PM memo</p>
          <h2 className="mt-1 text-xl font-bold text-[var(--cb-text-primary)]">Daily Portfolio Brief</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--cb-text-muted)]">
            Last session attribution, thesis drift, and the catalysts or risks that matter over the next seven days. Scheduled after the close each weekday.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected && (
            <a
              href={`/api/pm/daily-portfolio-brief/download?id=${encodeURIComponent(selected.id)}`}
              download
              className="inline-flex items-center gap-2 rounded border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2 text-xs font-medium text-[var(--cb-text-primary)] transition hover:border-[var(--cb-border-strong)]"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </a>
          )}
          <button
            type="button"
            onClick={() => { void generate(); }}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2 text-xs font-medium text-[var(--cb-text-primary)] transition hover:border-[var(--cb-border-strong)] disabled:opacity-50"
          >
            <RefreshCw className={generating ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            {generating ? 'Building memo…' : 'Run memo now'}
          </button>
        </div>
      </div>

      {error && <div className="rounded border border-[var(--cb-danger)]/40 bg-[var(--cb-danger)]/[0.08] px-3 py-2 text-xs text-[var(--cb-text-primary)]">{error}</div>}

      {briefs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {briefs.slice(0, 10).map(brief => (
            <button
              type="button"
              key={brief.id}
              onClick={() => setSelectedId(brief.id)}
              className={`shrink-0 rounded border px-2.5 py-1.5 text-left ${brief.id === selectedId ? 'border-[var(--cb-green)] bg-[var(--cb-accent-soft)]' : 'border-[var(--cb-border)] bg-[var(--cb-surface)]'}`}
            >
              <p className="font-mono text-[10px] font-semibold text-[var(--cb-text-primary)]">{brief.tradingDate}</p>
              <p className="font-mono text-[9px] text-[var(--cb-text-muted)]">{brief.runLabel.replace('_', ' ')}</p>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="rounded border border-[var(--cb-border)] bg-[var(--cb-surface)] p-8 text-sm text-[var(--cb-text-muted)]">Loading portfolio brief…</div>
      ) : selected ? <Memo brief={selected} /> : (
        <div className="rounded border border-dashed border-[var(--cb-border)] bg-[var(--cb-surface)] p-8 text-center">
          <FileText className="mx-auto h-6 w-6 text-[var(--cb-text-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--cb-text-primary)]">No daily portfolio memo yet</p>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Run the first memo after syncing your holdings and theses.</p>
        </div>
      )}
    </div>
  );
}

function Memo({ brief }: { brief: DailyPortfolioBrief }) {
  const views = new Map(brief.analysis.positionViews.map(view => [view.ticker, view]));
  const attribution = brief.charts.dailyPnlAttribution.filter(item => item.pnl !== 0 || item.dayChangePct !== null);
  const levels = brief.charts.priceLevels.filter(item => item.upsideToTargetPct !== null || item.downsideToStopPct !== null);
  const pnlPositive = (brief.portfolio.dayPnl ?? 0) >= 0;

  return (
    <article className="space-y-5 print:space-y-4">
      <section className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] p-5 print:break-after-page">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--cb-text-muted)]">Daily memo · {brief.tradingDate}</p>
            <h3 className="mt-1 text-xl font-semibold text-[var(--cb-text-primary)]">Portfolio P&amp;L and thesis review</h3>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Generated {dateTime(brief.asOf)} · {brief.source.positionsCovered}/{brief.portfolio.activePositions} positions with fresh quotes</p>
          </div>
          <div className="flex items-center gap-2 rounded border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2">
            {pnlPositive ? <TrendingUp className="h-4 w-4 text-[var(--cb-bull)]" /> : <TrendingDown className="h-4 w-4 text-[var(--cb-bear)]" />}
            <div>
              <p className="font-mono text-sm font-semibold" style={{ color: pnlPositive ? 'var(--cb-bull)' : 'var(--cb-bear)' }}>{currency(brief.portfolio.dayPnl)}</p>
              <p className="font-mono text-[10px] text-[var(--cb-text-muted)]">{pct(brief.portfolio.dayReturnPct)} on covered capital</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Portfolio value" value={currency(brief.portfolio.marketValue)} />
          <Stat label="Market regime" value={brief.market.regime.replace('_', ' ')} sub={`${brief.market.regimeConfidence}/100 confidence`} />
          <Stat label="SPY / breadth" value={pct(brief.market.spyChangePct)} sub={`Breadth ${pct(brief.market.breadthNetPct)}`} />
          <Stat label="Thesis attention" value={`${brief.portfolio.weakeningOrBroken} review`} sub={`${brief.portfolio.strengthening} strengthening`} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <SectionTitle title="PM conclusion" />
            <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{brief.analysis.portfolioRead}</p>
            <ul className="mt-3 space-y-2">
              {brief.analysis.executiveSummary.map((item, index) => <li key={index} className="text-sm text-[var(--cb-text-secondary)]">— {item}</li>)}
            </ul>
          </div>
          <div className="rounded border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] p-4">
            <SectionTitle title="Market tape" />
            <dl className="space-y-2 text-xs">
              <Metric label="VIX" value={brief.market.vix?.toFixed(1) ?? '—'} />
              <Metric label="US 10Y" value={brief.market.us10y === null ? '—' : `${brief.market.us10y.toFixed(2)}%`} />
              <Metric label="Leaders" value={brief.market.sectorLeaders.map(s => `${s.name} ${pct(s.changePct)}`).join(' · ') || '—'} />
              <Metric label="Laggards" value={brief.market.sectorLaggards.map(s => `${s.name} ${pct(s.changePct)}`).join(' · ') || '—'} />
            </dl>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2 print:break-inside-avoid">
        <ChartCard title="Daily P&amp;L attribution" note="Estimated from current holding size and latest verified daily quote change.">
          {attribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={attribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cb-border)" vertical={false} />
                <XAxis dataKey="ticker" tick={{ fontSize: 10, fill: 'var(--cb-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={value => currency(value, 0)} tick={{ fontSize: 10, fill: 'var(--cb-text-muted)' }} axisLine={false} tickLine={false} width={64} />
                <ReferenceLine y={0} stroke="var(--cb-border-strong)" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="pnl" name="Daily P&L" radius={[3, 3, 0, 0]}>{attribution.map(item => <Cell key={item.ticker} fill={item.pnl >= 0 ? 'var(--cb-bull)' : 'var(--cb-bear)'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Fresh position quotes are unavailable." />}
        </ChartCard>
        <ChartCard title="Distance to recorded price levels" note="Positive target distance is upside; negative stop distance is the current cushion to stop.">
          {levels.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={levels} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cb-border)" vertical={false} />
                <XAxis dataKey="ticker" tick={{ fontSize: 10, fill: 'var(--cb-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={value => `${value}%`} tick={{ fontSize: 10, fill: 'var(--cb-text-muted)' }} axisLine={false} tickLine={false} width={42} />
                <ReferenceLine y={0} stroke="var(--cb-border-strong)" />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="upsideToTargetPct" name="Target" fill="var(--cb-bull)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="downsideToStopPct" name="Stop" fill="var(--cb-bear)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No recorded targets or stops yet." />}
        </ChartCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-2 print:break-after-page">
        <MemoList icon={<TrendingUp className="h-4 w-4 text-[var(--cb-text-muted)]" />} title="What changed last session" items={brief.analysis.whatChanged} />
        <MemoList icon={<CalendarDays className="h-4 w-4 text-[var(--cb-text-muted)]" />} title="What to watch next" items={brief.analysis.lookingAhead} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle title={`Position theses (${brief.positions.length})`} />
          {brief.source.warnings.length > 0 && <span className="font-mono text-[10px] text-[var(--cb-caution)]">Data notes: {brief.source.warnings.join(', ')}</span>}
        </div>
        {brief.positions.map(position => {
          const view = views.get(position.ticker);
          return (
            <article key={position.ticker} className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4 print:break-inside-avoid">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-mono text-base font-semibold text-[var(--cb-text-primary)]">{position.ticker}</h4>
                    <span className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ color: statusTone(position.thesisStatus), backgroundColor: 'var(--cb-surface-subtle)' }}>{position.thesisStatus ?? 'unrated'}</span>
                    {view && <span className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ color: actionTone(view.action), backgroundColor: 'var(--cb-surface-subtle)' }}>{actionLabel(view.action)}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--cb-text-muted)]">{position.companyName ?? position.portfolioRole ?? 'Tracked position'} · {position.weightPct === null ? 'weight unavailable' : `${position.weightPct.toFixed(1)}% weight`}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-right font-mono text-[10px]">
                  <SmallMetric label="Last" value={currency(position.price, 2)} />
                  <SmallMetric label="Day" value={pct(position.dayChangePct)} tone={position.dayChangePct === null ? undefined : position.dayChangePct >= 0 ? 'var(--cb-bull)' : 'var(--cb-bear)'} />
                  <SmallMetric label="Conviction" value={position.conviction === null ? '—' : `${position.conviction}/100`} />
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Thesis update</p>
                  <p className="mt-1 text-sm leading-5 text-[var(--cb-text-primary)]">{view?.thesisUpdate ?? position.thesisSummary ?? 'No current thesis is stored.'}</p>
                  {view?.thesisPerformance && <p className="mt-2 text-xs text-[var(--cb-text-secondary)]"><span className="text-[var(--cb-text-muted)]">Thesis performance:</span> {view.thesisPerformance}</p>}
                  {view?.forwardThesis && <p className="mt-2 text-xs text-[var(--cb-text-secondary)]"><span className="text-[var(--cb-text-muted)]">Forward thesis:</span> {view.forwardThesis}</p>}
                  <p className="mt-2 text-xs text-[var(--cb-text-secondary)]"><span className="text-[var(--cb-text-muted)]">Why now:</span> {view?.whyNow ?? 'No new PM commentary is available.'}</p>
                </div>
                <div className="grid gap-2 text-xs text-[var(--cb-text-secondary)]">
                  {view?.recentNewsSummary && <p><span className="font-medium text-[var(--cb-text-muted)]">News already happened:</span> {view.recentNewsSummary}</p>}
                  {position.recentNews?.map((item, index) => (
                    <p key={`${item.title}-${index}`} className="pl-2 text-[11px] text-[var(--cb-text-muted)]">
                      {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{item.title}</a> : item.title}
                      {item.source ? ` · ${item.source}` : ''}{item.publishedAt ? ` · ${dateTime(item.publishedAt)}` : ''}
                    </p>
                  ))}
                  {view?.macroImpact && <p><span className="font-medium text-[var(--cb-text-muted)]">Macro link:</span> {view.macroImpact}</p>}
                  {view?.pricePlan && <p><span className="font-medium text-[var(--cb-text-muted)]">Price / sizing plan:</span> {view.pricePlan}</p>}
                  <p><span className="font-medium text-[var(--cb-text-muted)]">Catalyst:</span> {view?.nextCatalyst ?? position.catalysts[0] ?? 'Unavailable'}</p>
                  <p><span className="font-medium text-[var(--cb-text-muted)]">Risk:</span> {view?.mainRisk ?? position.keyRisks[0] ?? 'Unavailable'}</p>
                  <p><span className="font-medium text-[var(--cb-text-muted)]">Invalidation:</span> {view?.invalidation ?? (position.stopLoss ? `Below ${currency(position.stopLoss, 2)}` : 'Use stored thesis conditions')}</p>
                  {position.alerts.length > 0 && <p className="flex gap-1.5"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cb-caution)]" /><span>{position.alerts.map(alert => alert.title).join(' · ')}</span></p>}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </article>
  );
}

function SectionTitle({ title }: { title: string }) { return <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{title}</h4>; }
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) { return <div className="rounded border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p><p className="mt-1 text-sm font-medium capitalize text-[var(--cb-text-primary)]">{value}</p>{sub && <p className="mt-0.5 text-[10px] text-[var(--cb-text-muted)]">{sub}</p>}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><dt className="text-[var(--cb-text-muted)]">{label}</dt><dd className="text-right text-[var(--cb-text-primary)]">{value}</dd></div>; }
function SmallMetric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div><p className="text-[9px] uppercase text-[var(--cb-text-muted)]">{label}</p><p className="mt-0.5" style={tone ? { color: tone } : undefined}>{value}</p></div>; }
function ChartCard({ title, note, children }: { title: string; note: string; children: ReactNode }) { return <div className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4"><SectionTitle title={title} /><div className="mt-3 h-[250px]">{children}</div><p className="mt-2 text-[10px] text-[var(--cb-text-muted)]">{note}</p></div>; }
function EmptyChart({ message }: { message: string }) { return <div className="flex h-full items-center justify-center text-xs text-[var(--cb-text-muted)]">{message}</div>; }
function MemoList({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) { return <section className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4"><div className="flex items-center gap-2"><span>{icon}</span><SectionTitle title={title} /></div><ul className="mt-3 space-y-2">{items.map((item, index) => <li key={index} className="text-sm leading-5 text-[var(--cb-text-secondary)]">— {item}</li>)}</ul></section>; }

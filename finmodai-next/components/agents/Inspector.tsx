'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, RefreshCw, Users } from 'lucide-react';
import type {
  QuantScoreSnapshot,
  QuantSignalEvent,
} from '@/lib/pm/monitoring/types';
import type { AgentView } from '@/lib/pm/types';
import { cn } from '@/lib/utils';
import {
  ANALYSTS,
  ConsensusBar,
  SENIORS,
  ScoreBar,
  ScoutOutputCard,
  SeniorOutputCard,
  StaticSprite,
  formatAge,
  scoreBandColor,
  stanceColor,
  type CommitteeConsensus,
  type CommitteeDecision,
  type SeniorSignal,
} from '@/components/agents/parts';

type Props = {
  ticker: string | null;
  analyst: string | null;
};

type CommitteeRaw = {
  decision?: CommitteeDecision;
  signals?: SeniorSignal[];
  consensus?: CommitteeConsensus;
  signalEventIds?: string[];
  trigger?: string;
};

export function Inspector({ ticker, analyst }: Props) {
  const [snapshots, setSnapshots] = useState<QuantScoreSnapshot[]>([]);
  const [events, setEvents] = useState<QuantSignalEvent[]>([]);
  const [views, setViews] = useState<AgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (!ticker) {
      setLoading(false);
      return;
    }
    if (manual) setRefreshing(true);
    try {
      const params = `ticker=${encodeURIComponent(ticker)}&limit=200`;
      const [monitorRes, viewsRes] = await Promise.all([
        fetch(`/api/pm/quant-monitor?${params}`, { cache: 'no-store' }),
        fetch(`/api/pm/agent-views?${params}`, { cache: 'no-store' }),
      ]);
      if (!monitorRes.ok) throw new Error(`Monitor request failed (${monitorRes.status})`);
      if (!viewsRes.ok) throw new Error(`Views request failed (${viewsRes.status})`);
      const monitorPayload = await monitorRes.json() as { snapshots?: QuantScoreSnapshot[]; events?: QuantSignalEvent[] };
      const viewsPayload = await viewsRes.json() as { agentViews?: AgentView[] };
      const sortedSnaps = (monitorPayload.snapshots ?? [])
        .slice()
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
      const sortedEvents = (monitorPayload.events ?? [])
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const sortedViews = (viewsPayload.agentViews ?? [])
        .slice()
        .sort((a, b) => (b.runAt ?? b.createdAt).localeCompare(a.runAt ?? a.createdAt));
      setSnapshots(sortedSnaps);
      setEvents(sortedEvents);
      setViews(sortedViews);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load inspector data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ticker]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestSnapshotByAnalyst = useMemo(() => {
    const map = new Map<string, QuantScoreSnapshot>();
    for (const snap of snapshots) {
      if (!map.has(snap.analystKey)) map.set(snap.analystKey, snap);
    }
    return map;
  }, [snapshots]);

  const latestEventByAnalyst = useMemo(() => {
    const map = new Map<string, QuantSignalEvent>();
    for (const event of events) {
      if (!map.has(event.analystKey)) map.set(event.analystKey, event);
    }
    return map;
  }, [events]);

  const trajectoryByAnalyst = useMemo(() => {
    const map = new Map<string, QuantScoreSnapshot[]>();
    for (const analystDef of ANALYSTS) {
      const list = snapshots
        .filter(snap => snap.analystKey === analystDef.key)
        .slice(0, 12);
      map.set(analystDef.key, list);
    }
    return map;
  }, [snapshots]);

  const committeeView = useMemo(
    () => views.find(view => view.agentName === 'Senior Investment Committee') ?? null,
    [views],
  );
  const committeeRaw = (committeeView?.rawOutput ?? {}) as CommitteeRaw;
  const committeeSignals: SeniorSignal[] = Array.isArray(committeeRaw.signals) ? committeeRaw.signals : [];
  const committeeSignalByKey = useMemo(
    () => new Map(committeeSignals.map(signal => [signal.key ?? '', signal])),
    [committeeSignals],
  );
  const triggeringEventIds = Array.isArray(committeeRaw.signalEventIds) ? committeeRaw.signalEventIds : [];
  const triggeringEvents = triggeringEventIds
    .map(id => events.find(event => event.id === id))
    .filter((event): event is QuantSignalEvent => Boolean(event));

  if (!ticker) {
    return (
      <div className="mx-auto w-full max-w-[1100px] p-6">
        <header className="mb-4">
          <Link href="/agents" className="inline-flex items-center gap-1 text-xs text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]">
            <ArrowLeft className="h-3 w-3" /> Back to office
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--cb-text-primary)]">Agent Inspector</h1>
        </header>
        <div className="border border-dashed border-[#303842] bg-[#0b1015] p-8 text-center text-sm text-[#8d97a2]">
          Select a ticker from the office floor to see what every scout produced.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] p-4">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <Link href="/agents" className="inline-flex items-center gap-1 text-xs text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]">
            <ArrowLeft className="h-3 w-3" /> Back to office
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--cb-text-primary)]">
            <span className="font-mono text-[var(--cb-text-primary)]">{ticker}</span>
            <span className="ml-2 text-sm font-normal text-[var(--cb-text-muted)]">Agent Inspector</span>
          </h1>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
            {analyst ? `Focused on ${analyst}.` : 'All six scouts and the committee verdict for this ticker.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void load(true); }}
          disabled={refreshing}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 text-xs font-medium text-[var(--cb-text-secondary)] hover:border-[var(--cb-border-strong)] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="mb-4 flex items-start gap-2 border border-red-500/30 bg-red-500/5 p-3 text-[11px] text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Snapshot panel — all 6 scouts */}
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
          Scout outputs
        </h2>
        {loading && snapshots.length === 0 ? (
          <div className="border border-dashed border-[#303842] bg-[#0b1015] p-8 text-center text-sm text-[#8d97a2]">
            Loading scout output…
          </div>
        ) : snapshots.length === 0 ? (
          <div className="border border-dashed border-[#303842] bg-[#0b1015] p-8 text-center text-sm text-[#8d97a2]">
            No scans recorded yet for {ticker}.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ANALYSTS.map(analystDef => {
              const snap = latestSnapshotByAnalyst.get(analystDef.key);
              const event = latestEventByAnalyst.get(analystDef.key);
              if (!snap) {
                return (
                  <div key={analystDef.key} className="border border-dashed border-[#252c34] bg-[#0a0f14] p-4 text-xs text-[#8d97a2]">
                    <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">{analystDef.domain}</p>
                    <p className="mt-1 text-sm text-white">{analystDef.name}</p>
                    <p className="mt-3">No scan recorded yet.</p>
                  </div>
                );
              }
              return (
                <ScoutOutputCard
                  key={analystDef.key}
                  snapshot={snap}
                  event={event}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Trajectory panel */}
      {snapshots.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
            Score trajectory
          </h2>
          <div className="border border-[#252c34] bg-[#0b1015] p-4">
            <div className="space-y-3">
              {ANALYSTS.map(analystDef => {
                const list = trajectoryByAnalyst.get(analystDef.key) ?? [];
                const newestFirst = list;
                const oldestFirst = list.slice().reverse();
                const latest = newestFirst[0];
                return (
                  <div key={analystDef.key} className="grid grid-cols-[140px_1fr_64px] items-center gap-3">
                    <span className="truncate text-xs text-[#c9d0d7]">{analystDef.name.replace(' Analyst', '')}</span>
                    {oldestFirst.length === 0 ? (
                      <span className="text-[10px] text-[#5b636c]">No scans yet.</span>
                    ) : (
                      <div className="flex items-end gap-1">
                        {oldestFirst.map(snap => {
                          const color = scoreBandColor(snap.score);
                          const height = Math.max(8, Math.min(28, Math.round(snap.score / 4)));
                          return (
                            <span
                              key={snap.id}
                              title={`${Math.round(snap.score)} · ${snap.signal} · ${formatAge(snap.observedAt)}`}
                              className="block w-3 border-b border-[#252c34]"
                              style={{ height: `${height}px`, backgroundColor: `${color}55`, borderTop: `2px solid ${color}` }}
                            />
                          );
                        })}
                      </div>
                    )}
                    <span className="text-right font-mono text-[10px]" style={{ color: latest ? scoreBandColor(latest.score) : '#5b636c' }}>
                      {latest ? Math.round(latest.score) : '—'} / 100
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Committee verdict panel */}
      <section className="mb-6">
        <h2 className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
          <Users className="h-3 w-3" /> Senior committee verdict
        </h2>
        {!committeeView || !committeeRaw.decision ? (
          <div className="border border-dashed border-[#303842] bg-[#0b1015] p-6 text-center text-xs text-[#8d97a2]">
            No committee session on record for {ticker}. Escalated signals will wake the committee.
          </div>
        ) : (
          <div className="border border-[#252c34] bg-[#0b1015] p-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">Verdict</p>
                <h3 className="mt-0.5 text-lg font-semibold text-white">
                  <span
                    className="uppercase tracking-wide"
                    style={{
                      color: stanceColor(
                        ['buy', 'add'].includes((committeeRaw.decision.action ?? '').toLowerCase())
                          ? 'bullish'
                          : ['sell', 'trim', 'exit'].includes((committeeRaw.decision.action ?? '').toLowerCase())
                            ? 'bearish'
                            : 'neutral',
                      ),
                    }}
                  >
                    {committeeRaw.decision.action ?? 'n/a'}
                  </span>
                  {committeeRaw.decision.confidence != null ? (
                    <span className="ml-2 text-sm font-normal text-[#9aa4ae]">
                      · {committeeRaw.decision.confidence}% confidence
                    </span>
                  ) : null}
                  {committeeRaw.decision.sizing ? (
                    <span className="ml-2 text-sm font-normal text-[#9aa4ae]">· {committeeRaw.decision.sizing}</span>
                  ) : null}
                </h3>
                {committeeRaw.trigger ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-[#65717c]">
                    Trigger: {committeeRaw.trigger.replace(/_/g, ' ')}
                  </p>
                ) : null}
              </div>
              <span className="font-mono text-[10px] text-[#727d88]">
                {formatAge(committeeView.runAt ?? committeeView.createdAt)}
              </span>
            </header>

            {committeeRaw.decision.reasoning ? (
              <p className="mt-3 whitespace-pre-line text-xs leading-5 text-[#d2d7dd]">
                {committeeRaw.decision.reasoning}
              </p>
            ) : null}

            <div className="mt-4 border-t border-[#252c34] pt-3">
              <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">Correlated perspectives, not independent votes</p>
              <div className="mt-2"><ConsensusBar consensus={committeeRaw.consensus} /></div>
            </div>

            {triggeringEvents.length > 0 ? (
              <div className="mt-4 border-t border-[#252c34] pt-3">
                <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">Triggered by</p>
                <ul className="mt-2 space-y-1">
                  {triggeringEvents.map(event => (
                    <li key={event.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stanceColor(event.direction) }} />
                      <span className="text-[#c2cad3]">
                        <span className="font-mono text-[10px] text-[#9aa4ae]">
                          {event.analystName} · {event.previousScore}→{event.currentScore} ({event.delta >= 0 ? '+' : ''}{event.delta}) · {event.severity}
                        </span>
                        <br />
                        {event.summary}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 border-t border-[#252c34] pt-3">
              <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">All thirteen senior reads</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SENIORS.map(senior => {
                  const signal = committeeSignalByKey.get(senior.key);
                  return (
                    <SeniorMiniCard key={senior.key} senior={senior} signal={signal} />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {analyst ? (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
            Recent runs for {analyst}
          </h2>
          <RecentRunsList
            snapshots={snapshots.filter(snap => snap.analystKey === analyst)}
            events={events.filter(event => event.analystKey === analyst)}
          />
        </section>
      ) : null}
    </div>
  );
}

function SeniorMiniCard({
  senior,
  signal,
}: {
  senior: { key: string; name: string; lens: string; palette: number };
  signal?: SeniorSignal;
}) {
  const stance = signal?.signal ?? 'neutral';
  const accent = stanceColor(stance);
  return (
    <div className="border border-[#252c34] bg-[#0a0f14] p-2">
      <div className="flex items-start gap-2">
        <div className="flex h-12 w-7 items-center justify-center border border-[#252c34] bg-[#161c22]">
          <StaticSprite palette={senior.palette} pose="reading" compact />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase tracking-wide text-[#7d8792]">{senior.lens}</p>
          <p className="truncate text-xs font-medium text-white">{senior.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              {stance}
            </span>
            {signal?.confidence != null ? (
              <span className="font-mono text-[9px] text-[#9aa4ae]">{signal.confidence}%</span>
            ) : null}
          </div>
        </div>
      </div>
      {signal?.thesis ? (
        <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[#aeb6bf]">
          {signal.thesis}
        </p>
      ) : null}
      {signal?.reasoning ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#7d8792]">
          {signal.reasoning}
        </p>
      ) : null}
    </div>
  );
}

function RecentRunsList({
  snapshots,
  events,
}: {
  snapshots: QuantScoreSnapshot[];
  events: QuantSignalEvent[];
}) {
  if (snapshots.length === 0) {
    return (
      <div className="border border-dashed border-[#303842] bg-[#0b1015] p-6 text-center text-xs text-[#8d97a2]">
        No runs for this analyst yet.
      </div>
    );
  }
  return (
    <div className="border border-[#252c34] bg-[#0b1015]">
      {snapshots.slice(0, 12).map((snap, idx) => {
        const snapTime = new Date(snap.observedAt).getTime();
        const matchingEvent = events.find(e =>
          Math.abs(new Date(e.createdAt).getTime() - snapTime) < 60_000,
        );
        const stance = matchingEvent?.direction ?? snap.signal;
        const accent = stanceColor(stance);
        return (
          <div
            key={snap.id}
            className={cn(
              'grid grid-cols-[64px_72px_minmax(0,1fr)_24px] items-center gap-3 p-3 text-xs',
              idx > 0 && 'border-t border-[#252c34]',
            )}
          >
            <span className="font-mono text-[10px] text-[#9aa4ae]">{formatAge(snap.observedAt)}</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm font-semibold text-white">{Math.round(snap.score)}</span>
              <div className="w-12"><ScoreBar score={snap.score} /></div>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] text-[#d2d7dd]">{snap.reasoning || '—'}</p>
              {matchingEvent ? (
                <p className="mt-0.5 truncate font-mono text-[9px]" style={{ color: accent }}>
                  ↳ {matchingEvent.summary}
                </p>
              ) : null}
            </div>
            <ChevronRight className="h-3 w-3 text-[#5b636c]" />
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  RefreshCw,
} from 'lucide-react';
import type { AgentView } from '@/lib/pm/types';
import { cn } from '@/lib/utils';

type AgentStatus = 'working' | 'reviewing' | 'idle' | 'needs_attention';
type StatusFilter = 'all' | 'active' | 'attention' | 'idle';

type AgentDefinition = {
  id: string;
  name: string;
  shortName: string;
  types: NonNullable<AgentView['agentType']>[];
  sources: NonNullable<AgentView['source']>[];
  palette: number;
  desk: string;
};

type OfficeAgent = AgentDefinition & {
  view: AgentView | null;
  status: AgentStatus;
};

const AGENTS: AgentDefinition[] = [
  {
    id: 'hedge-fund',
    name: 'AI Hedge Fund',
    shortName: 'Hedge Fund',
    types: ['hedge_fund'],
    sources: ['hedge_fund'],
    palette: 0,
    desk: 'Fundamental and persona consensus',
  },
  {
    id: 'trading-agents',
    name: 'TradingAgents Debate',
    shortName: 'Debate',
    types: ['tradingagents'],
    sources: ['tradingagents'],
    palette: 1,
    desk: 'Bull, bear, and risk debate',
  },
  {
    id: 'catalyst',
    name: 'Catalyst Scanner',
    shortName: 'Catalyst',
    types: ['catalyst', 'world_monitor'],
    sources: ['news', 'world_monitor'],
    palette: 2,
    desk: 'Events, headlines, and timing',
  },
  {
    id: 'forecast',
    name: 'Forecast Agent',
    shortName: 'Forecast',
    types: ['forecast'],
    sources: ['forecast', 'rank'],
    palette: 3,
    desk: 'Price path and momentum',
  },
  {
    id: 'pm-brain',
    name: 'PM Brain',
    shortName: 'PM Brain',
    types: ['pm_brain'],
    sources: ['pm_brain'],
    palette: 4,
    desk: 'Sizing and portfolio decision',
  },
  {
    id: 'quant',
    name: 'Quant Discipline',
    shortName: 'Quant',
    types: ['quant'],
    sources: ['quant'],
    palette: 5,
    desk: 'Risk controls and sell discipline',
  },
];

const STATUS_LABELS: Record<AgentStatus, string> = {
  working: 'Working',
  reviewing: 'Reviewing',
  idle: 'Idle',
  needs_attention: 'Needs attention',
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  working: '#65d487',
  reviewing: '#e6b84d',
  idle: '#8a929d',
  needs_attention: '#f26d6d',
};

function timeOf(view: AgentView): string {
  return view.runAt ?? view.createdAt;
}

function ageInMs(view: AgentView, now: number): number {
  const timestamp = new Date(timeOf(view)).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
}

function deriveStatus(view: AgentView | null, now: number): AgentStatus {
  if (!view) return 'idle';
  if (view.changedSinceLast && (view.stance === 'bearish' || view.stance === 'mixed')) {
    return 'needs_attention';
  }
  const age = ageInMs(view, now);
  if (age <= 90_000) return 'working';
  if (age <= 30 * 60_000) return 'reviewing';
  return 'idle';
}

function matchesAgent(view: AgentView, agent: AgentDefinition): boolean {
  if (view.agentType && agent.types.includes(view.agentType)) return true;
  if (view.source && agent.sources.includes(view.source)) return true;
  const normalizedName = view.agentName.toLowerCase();
  return normalizedName.includes(agent.shortName.toLowerCase())
    || normalizedName.includes(agent.id.replace(/-/g, ' '));
}

function formatAge(value: string | undefined): string {
  if (!value) return 'No runs yet';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function stanceColor(stance: AgentView['stance'] | undefined): string {
  if (stance === 'bullish') return '#65d487';
  if (stance === 'bearish') return '#f26d6d';
  if (stance === 'mixed') return '#e6b84d';
  return '#a7afb9';
}

function compactTask(view: AgentView | null, fallback: string): string {
  if (!view) return fallback;
  return view.summary?.trim() || view.reasoning.trim() || fallback;
}

function latestViewFor(agent: AgentDefinition, views: AgentView[]): AgentView | null {
  return views.find((view) => matchesAgent(view, agent)) ?? null;
}

function AgentSprite({ palette, status }: { palette: number; status: AgentStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'agent-office-sprite',
        status === 'working' && 'agent-office-sprite--typing',
        (status === 'reviewing' || status === 'needs_attention') && 'agent-office-sprite--reading',
      )}
      style={{ backgroundImage: `url(/pixel-agents/assets/characters/char_${palette}.png)` }}
    />
  );
}

function Workstation({
  agent,
  selected,
  hidden,
  onSelect,
}: {
  agent: OfficeAgent;
  selected: boolean;
  hidden: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex min-h-[205px] min-w-0 flex-col items-center justify-end border border-transparent px-2 pb-3 pt-8 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65d487]',
        selected && 'border-[#65d487]/70 bg-[#65d487]/[0.035] shadow-[inset_0_0_0_1px_rgba(101,212,135,0.16),0_0_24px_rgba(101,212,135,0.06)]',
        hidden && 'opacity-25 grayscale',
      )}
      aria-pressed={selected}
    >
      <span className="absolute top-3 max-w-[90%] truncate border border-[#46505a] bg-[#12171d] px-2 py-1 font-mono text-[10px] text-[#e6e9ed] shadow-md">
        <span
          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[agent.status] }}
        />
        {agent.name}
      </span>

      <span className="relative h-[118px] w-[190px] max-w-full">
        <Image
          alt=""
          src="/pixel-agents/assets/furniture/DESK/DESK_FRONT.png"
          width={48}
          height={32}
          unoptimized
          className="absolute bottom-0 left-1/2 h-28 w-44 -translate-x-1/2 object-fill [image-rendering:pixelated]"
        />
        <Image
          alt=""
          src={agent.status === 'idle'
            ? '/pixel-agents/assets/furniture/PC/PC_FRONT_OFF.png'
            : '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_2.png'}
          width={16}
          height={32}
          unoptimized
          className="absolute bottom-[62px] left-[42px] h-16 w-8 [image-rendering:pixelated]"
        />
        <Image
          alt=""
          src={agent.status === 'idle'
            ? '/pixel-agents/assets/furniture/PC/PC_FRONT_OFF.png'
            : '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_1.png'}
          width={16}
          height={32}
          unoptimized
          className="absolute bottom-[65px] left-1/2 h-16 w-8 -translate-x-1/2 [image-rendering:pixelated]"
        />
        <Image
          alt=""
          src={agent.status === 'idle'
            ? '/pixel-agents/assets/furniture/PC/PC_FRONT_OFF.png'
            : '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_3.png'}
          width={16}
          height={32}
          unoptimized
          className="absolute bottom-[62px] right-[42px] h-16 w-8 [image-rendering:pixelated]"
        />
        <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2">
          <AgentSprite palette={agent.palette} status={agent.status} />
        </span>
      </span>

      <span
        className="mt-1 font-mono text-[10px]"
        style={{ color: STATUS_COLORS[agent.status] }}
      >
        {STATUS_LABELS[agent.status]}
      </span>
    </button>
  );
}

function EmptyOfficeState() {
  return (
    <div className="absolute inset-x-6 bottom-5 flex items-center justify-center">
      <div className="border border-[#343b44] bg-[#11161c]/95 px-4 py-2 text-center text-[11px] text-[#929aa5] shadow-xl">
        Agent desks are ready. Run an analysis from Opportunities to populate live output.
      </div>
    </div>
  );
}

export function AgentOffice() {
  const [views, setViews] = useState<AgentView[]>([]);
  const [selectedId, setSelectedId] = useState(AGENTS[0].id);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadViews = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch('/api/pm/agent-views?limit=500', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Agent activity request failed (${response.status})`);
      const payload = await response.json() as { agentViews?: AgentView[] };
      const nextViews = [...(payload.agentViews ?? [])]
        .sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
      setViews(nextViews);
      setNow(Date.now());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load agent activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadViews();
    const polling = window.setInterval(() => { void loadViews(); }, 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearInterval(polling);
      window.clearInterval(clock);
    };
  }, [loadViews]);

  const officeAgents = useMemo<OfficeAgent[]>(() => AGENTS.map((agent) => {
    const view = latestViewFor(agent, views);
    return { ...agent, view, status: deriveStatus(view, now) };
  }), [now, views]);

  const selectedAgent = officeAgents.find((agent) => agent.id === selectedId) ?? officeAgents[0];
  const selectedView = selectedAgent.view;
  const activity = views.slice(0, 8);
  const hasAnyRuns = views.length > 0;
  const activeCount = officeAgents.filter((agent) => agent.status === 'working' || agent.status === 'reviewing').length;
  const attentionCount = officeAgents.filter((agent) => agent.status === 'needs_attention').length;

  function agentHidden(agent: OfficeAgent): boolean {
    if (filter === 'all') return false;
    if (filter === 'active') return agent.status !== 'working' && agent.status !== 'reviewing';
    if (filter === 'attention') return agent.status !== 'needs_attention';
    return agent.status !== 'idle';
  }

  const output = selectedView?.rawOutput ?? (selectedView ? {
    ticker: selectedView.ticker,
    stance: selectedView.stance,
    conviction: selectedView.conviction,
    recommendation: selectedView.recommendation,
    reasoning: selectedView.reasoning,
  } : null);

  return (
    <div className="mx-auto w-full max-w-[1540px]">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--cb-text-primary)]">Agent Office</h1>
            <span className="flex items-center gap-1.5 text-[10px] text-[var(--cb-text-muted)]">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                error ? 'bg-red-400' : attentionCount > 0 ? 'bg-amber-400' : 'bg-[var(--cb-green)]',
              )} />
              {error ? 'Activity feed unavailable' : attentionCount > 0 ? `${attentionCount} need attention` : 'All systems operational'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--cb-text-muted)]">
            Live agent operations from persisted PM OS runs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Filter agent status</span>
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cb-text-muted)]" />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as StatusFilter)}
              className="h-9 appearance-none rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] pl-8 pr-8 text-xs text-[var(--cb-text-secondary)] outline-none focus:border-[var(--cb-green)]"
            >
              <option value="all">All systems</option>
              <option value="active">Active</option>
              <option value="attention">Needs attention</option>
              <option value="idle">Idle</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => { void loadViews(true); }}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 text-xs font-medium text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </header>

      <div className="overflow-hidden border border-[#252c34] bg-[#0d1116] text-[#dfe4ea] shadow-[0_14px_50px_rgba(0,0,0,0.18)]">
        <div className="grid min-h-[690px] xl:grid-cols-[minmax(0,1fr)_350px]">
          <section className="relative min-w-0 border-b border-[#252c34] xl:border-b-0 xl:border-r">
            <div className="flex h-11 items-center justify-between border-b border-[#252c34] bg-[#10151a] px-4">
              <div className="flex items-center gap-4 text-[10px] text-[#8f98a3]">
                <span className="inline-flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-[#65d487]" />
                  {officeAgents.length} configured agents
                </span>
                <span>{activeCount} active</span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#66717d]">
                Polling every 15s
              </span>
            </div>

            <div
              className="relative min-h-[646px] overflow-hidden p-4 sm:p-6"
              style={{
                backgroundColor: '#24292f',
                backgroundImage: 'linear-gradient(rgba(11,14,18,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(11,14,18,0.18) 1px, transparent 1px), url(/pixel-agents/assets/floors/floor_6.png)',
                backgroundSize: '32px 32px, 32px 32px, 32px 32px',
                imageRendering: 'pixelated',
              }}
            >
              <div className="pointer-events-none absolute inset-3 border-[6px] border-[#171c22] shadow-[inset_0_0_0_2px_#3b424a]" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[68%] w-px -translate-x-1/2 -translate-y-1/2 bg-[#151a20]/50" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[78%] -translate-x-1/2 -translate-y-1/2 bg-[#151a20]/50" />

              <div className="relative z-10 grid min-h-[590px] grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {officeAgents.map((agent) => (
                  <Workstation
                    key={agent.id}
                    agent={agent}
                    selected={selectedAgent.id === agent.id}
                    hidden={agentHidden(agent)}
                    onSelect={() => setSelectedId(agent.id)}
                  />
                ))}
              </div>

              {!loading && !hasAnyRuns && <EmptyOfficeState />}
            </div>
          </section>

          <aside className="min-w-0 bg-[#0f1419]">
            <section className="border-b border-[#252c34] p-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8792]">Selected agent</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center border border-[#313943] bg-[#181e24]">
                  <AgentSprite palette={selectedAgent.palette} status={selectedAgent.status} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-white">{selectedAgent.name}</h2>
                  <p className="mt-1 text-xs" style={{ color: STATUS_COLORS[selectedAgent.status] }}>
                    {STATUS_LABELS[selectedAgent.status]}
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-3 text-xs">
                <dt className="text-[#7d8792]">Current task</dt>
                <dd className="line-clamp-3 leading-5 text-[#d2d7dd]">
                  {compactTask(selectedView, selectedAgent.desk)}
                </dd>
                <dt className="text-[#7d8792]">Ticker</dt>
                <dd className="font-mono font-semibold text-white">{selectedView?.ticker ?? '—'}</dd>
                <dt className="text-[#7d8792]">Stance</dt>
                <dd className="font-medium capitalize" style={{ color: stanceColor(selectedView?.stance) }}>
                  {selectedView?.stance ?? 'No read'}
                </dd>
                <dt className="text-[#7d8792]">Conviction</dt>
                <dd>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }, (_, index) => {
                      const conviction = selectedView?.confidence ?? selectedView?.conviction ?? 0;
                      return (
                        <span
                          key={index}
                          className="h-2.5 w-4 border border-[#4b5560]"
                          style={{
                            backgroundColor: conviction >= (index + 1) * 20
                              ? stanceColor(selectedView?.stance)
                              : 'transparent',
                          }}
                        />
                      );
                    })}
                    <span className="ml-1 font-mono text-[10px] text-[#9ba4ae]">
                      {selectedView ? `${selectedView.confidence ?? selectedView.conviction}%` : '—'}
                    </span>
                  </div>
                </dd>
                <dt className="text-[#7d8792]">Last run</dt>
                <dd className="text-[#d2d7dd]">
                  {formatAge(selectedView ? timeOf(selectedView) : undefined)}
                  {selectedView && (
                    <span className="mt-0.5 block text-[10px] text-[#697480]">
                      {new Date(timeOf(selectedView)).toLocaleString()}
                    </span>
                  )}
                </dd>
              </dl>
            </section>

            <section className="border-b border-[#252c34] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#d8dde3]">Recent activity</h3>
                <span className="text-[10px] text-[#727d88]">{activity.length} events</span>
              </div>
              <div className="mt-3 space-y-3">
                {activity.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[#697480]">No persisted agent runs yet.</p>
                ) : activity.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => {
                      const matching = officeAgents.find((agent) => matchesAgent(view, agent));
                      if (matching) setSelectedId(matching.id);
                    }}
                    className="grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-2 text-left"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: stanceColor(view.stance) }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] text-[#c9d0d7]">
                        {view.agentName} · {view.ticker}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#697480]">
                        {view.summary || view.reasoning}
                      </span>
                    </span>
                    <span className="pt-0.5 font-mono text-[9px] text-[#697480]">{formatAge(timeOf(view))}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#d8dde3]">Latest output</h3>
                {selectedView && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#65d487]">
                    <CheckCircle2 className="h-3 w-3" />
                    Persisted
                  </span>
                )}
              </div>

              {output ? (
                <>
                  <pre className="mt-3 max-h-44 overflow-auto border border-[#2d353e] bg-[#0b1015] p-3 font-mono text-[9px] leading-4 text-[#8fce8f]">
                    {JSON.stringify(output, null, 2)}
                  </pre>
                  {selectedView?.evidence && selectedView.evidence.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {selectedView.evidence.slice(0, 3).map((item, index) => (
                        <a
                          key={item.id ?? `${item.source}-${index}`}
                          href={item.url ?? undefined}
                          target={item.url ? '_blank' : undefined}
                          rel={item.url ? 'noreferrer' : undefined}
                          className={cn(
                            'flex items-start gap-2 border-t border-[#252c34] pt-2 text-[10px] text-[#8d97a2]',
                            item.url && 'hover:text-[#d7dde3]',
                          )}
                        >
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="line-clamp-2">{item.title || item.summary}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-3 border border-dashed border-[#303842] px-4 py-8 text-center">
                  <Clock3 className="mx-auto h-5 w-5 text-[#606b76]" />
                  <p className="mt-2 text-xs text-[#8d97a2]">No output recorded for this agent.</p>
                  <p className="mt-1 text-[10px] text-[#606b76]">Run it from the Opportunities workspace.</p>
                </div>
              )}

              {error && (
                <div className="mt-3 flex items-start gap-2 border border-red-500/30 bg-red-500/5 p-3 text-[10px] text-red-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-[var(--cb-text-muted)]">
        Pixel artwork adapted from Pixel Agents under the MIT License. Activity is sourced from CapitalBase PM OS agent records.
      </p>

      <style jsx global>{`
        .agent-office-sprite {
          display: block;
          width: 48px;
          height: 96px;
          background-repeat: no-repeat;
          background-size: 336px 288px;
          background-position: 0 0;
          image-rendering: pixelated;
        }

        .agent-office-sprite--typing {
          animation: agent-office-typing 0.75s steps(1) infinite;
        }

        .agent-office-sprite--reading {
          animation: agent-office-reading 1s steps(1) infinite;
        }

        @keyframes agent-office-typing {
          0%, 49% { background-position: -144px 0; }
          50%, 100% { background-position: -192px 0; }
        }

        @keyframes agent-office-reading {
          0%, 49% { background-position: -240px 0; }
          50%, 100% { background-position: -288px 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .agent-office-sprite--typing,
          .agent-office-sprite--reading {
            animation: none;
          }
          .agent-office-sprite--typing { background-position: -144px 0; }
          .agent-office-sprite--reading { background-position: -240px 0; }
        }
      `}</style>
    </div>
  );
}

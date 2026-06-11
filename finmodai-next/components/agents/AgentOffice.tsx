'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Filter,
  RefreshCw,
  Users,
} from 'lucide-react';
import type {
  QuantAnalystKey,
  QuantScoreSnapshot,
  QuantSignalEvent,
} from '@/lib/pm/monitoring/types';
import type { AgentView, PortfolioPosition } from '@/lib/pm/types';
import { getActivePositions, PORTFOLIO_EVENT } from '@/lib/portfolio/storage';
import { cn } from '@/lib/utils';
import {
  ANALYSTS,
  DESK_VERB,
  SENIORS,
  STATUS_COLORS,
  STATUS_LABELS,
  ScoreBar,
  ScoutOutputCard,
  SeniorOutputCard,
  ageInMs,
  formatAge,
  stanceColor,
  type AgentStatus,
  type AnalystDefinition,
  type SeniorDefinition,
  type SeniorSignal,
} from '@/components/agents/parts';

type StatusFilter = 'all' | 'active' | 'attention' | 'idle';
type Selection = `quant:${QuantAnalystKey}` | `senior:${string}`;
type ScoutLocation = 'desk' | 'company_queue' | 'research_wall' | 'pm_inbox';

const ACTIVE_LOOP_INTERVAL_MS = 30_000;
const TICKER_COOLDOWN_MS = 90_000;

// Walking choreography — triggered when a scout completes a scan. Total 8s round trip.
const WALK_TOTAL_MS = 8000;
const WALK_PHASE_END_MS = {
  STAND_UP: 700,
  TO_AISLE: 1800,
  TO_INBOX: 3300,
  AT_INBOX: 5500,
  BACK_TO_AISLE: 7000,
  TO_DESK: 8000,
} as const;

type WalkSession = { startedAt: number; ticker: string };
const LOCATION_LABELS: Record<ScoutLocation, string> = {
  desk: 'Analyst desk',
  company_queue: 'Company queue',
  research_wall: 'Research wall',
  pm_inbox: 'PM inbox',
};
const DESK_POSITIONS = [
  { x: 16, y: 22 },
  { x: 50, y: 22 },
  { x: 84, y: 22 },
  { x: 16, y: 52 },
  { x: 50, y: 52 },
  { x: 84, y: 52 },
];

// Standing positions around the break-area sofas (3 per side, facing the coffee table).
const BREAK_POSITIONS = [
  { x: 30, y: 80 },
  { x: 38, y: 82 },
  { x: 46, y: 80 },
  { x: 56, y: 80 },
  { x: 64, y: 82 },
  { x: 72, y: 80 },
];

function scoutPosition(location: ScoutLocation, index: number): { x: number; y: number } {
  if (location === 'desk') return DESK_POSITIONS[index] ?? DESK_POSITIONS[0];
  if (location === 'company_queue') {
    return { x: 40 + (index % 3) * 10, y: 47 + Math.floor(index / 3) * 9 };
  }
  if (location === 'research_wall') {
    return { x: 7 + (index % 2) * 6, y: 34 + (index % 3) * 12 };
  }
  return { x: 93 - (index % 2) * 6, y: 34 + (index % 3) * 12 };
}

type WalkChoreography = {
  position: { x: number; y: number };
  walking: boolean;
  activity: string;
  phaseLabel: string;
  remainingMs: number;
};

function walkChoreography(
  elapsedMs: number,
  index: number,
  ticker: string,
): WalkChoreography {
  const desk = scoutPosition('desk', index);
  const aisleAtDesk = { x: desk.x, y: 70 };
  const aisleAtInbox = { x: 78, y: 70 };
  const inbox = scoutPosition('pm_inbox', index);
  if (elapsedMs < WALK_PHASE_END_MS.STAND_UP) {
    return {
      position: desk,
      walking: false,
      activity: `Wrapping ${ticker} scan`,
      phaseLabel: 'Standing up',
      remainingMs: WALK_PHASE_END_MS.STAND_UP - elapsedMs,
    };
  }
  if (elapsedMs < WALK_PHASE_END_MS.TO_AISLE) {
    return {
      position: aisleAtDesk,
      walking: true,
      activity: `Stepping into aisle`,
      phaseLabel: 'To aisle',
      remainingMs: WALK_PHASE_END_MS.TO_AISLE - elapsedMs,
    };
  }
  if (elapsedMs < WALK_PHASE_END_MS.TO_INBOX) {
    return {
      position: aisleAtInbox,
      walking: true,
      activity: `Carrying ${ticker} to PM`,
      phaseLabel: 'Down the aisle',
      remainingMs: WALK_PHASE_END_MS.TO_INBOX - elapsedMs,
    };
  }
  if (elapsedMs < WALK_PHASE_END_MS.AT_INBOX) {
    return {
      position: inbox,
      walking: false,
      activity: `Dropping ${ticker} signal`,
      phaseLabel: 'At PM inbox',
      remainingMs: WALK_PHASE_END_MS.AT_INBOX - elapsedMs,
    };
  }
  if (elapsedMs < WALK_PHASE_END_MS.BACK_TO_AISLE) {
    return {
      position: aisleAtInbox,
      walking: true,
      activity: `Heading back to desk`,
      phaseLabel: 'Leaving inbox',
      remainingMs: WALK_PHASE_END_MS.BACK_TO_AISLE - elapsedMs,
    };
  }
  if (elapsedMs < WALK_PHASE_END_MS.TO_DESK) {
    return {
      position: aisleAtDesk,
      walking: true,
      activity: `Approaching desk`,
      phaseLabel: 'Back to desk',
      remainingMs: WALK_PHASE_END_MS.TO_DESK - elapsedMs,
    };
  }
  return {
    position: desk,
    walking: false,
    activity: 'Back at desk',
    phaseLabel: 'At desk',
    remainingMs: 0,
  };
}

function statusForAnalyst(
  snapshot: QuantScoreSnapshot | undefined,
  event: QuantSignalEvent | undefined,
  now: number,
): AgentStatus {
  if (event?.status === 'escalated' && event.shouldEscalate) return 'needs_attention';
  const age = ageInMs(snapshot?.observedAt, now);
  if (age <= 90_000) return 'working';
  if (age <= 30 * 60_000) return 'reviewing';
  return 'idle';
}

function filterMatches(status: AgentStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return status === 'working' || status === 'reviewing';
  if (filter === 'attention') return status === 'needs_attention';
  return status === 'idle';
}

function AgentSprite({
  palette,
  status,
  compact = false,
  moving = false,
}: {
  palette: number;
  status: AgentStatus;
  compact?: boolean;
  moving?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'agent-office-sprite',
        compact && 'agent-office-sprite--compact',
        moving && 'agent-office-sprite--walking',
        !moving && status === 'working' && 'agent-office-sprite--typing',
        !moving && (status === 'reviewing' || status === 'needs_attention') && 'agent-office-sprite--reading',
      )}
      style={{ backgroundImage: `url(/pixel-agents/assets/characters/char_${palette}.png)` }}
    />
  );
}

function ScoutMover({
  analyst,
  status,
  location,
  nextLocation,
  ticker,
  bookIndex,
  bookSize,
  position,
  selected,
  hidden,
  moving,
  activity,
  alerting,
  onSelect,
}: {
  analyst: AnalystDefinition;
  status: AgentStatus;
  location: ScoutLocation;
  nextLocation: ScoutLocation;
  ticker: string;
  bookIndex: number;
  bookSize: number;
  position: { x: number; y: number };
  selected: boolean;
  hidden: boolean;
  moving: boolean;
  activity: string;
  alerting: boolean;
  onSelect: () => void;
}) {
  const shortName = analyst.name.replace(' Analyst', '');
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`scout-${analyst.key}`}
      className={cn(
        'agent-office-scout pointer-events-auto absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-[left,top,opacity] ease-in-out',
        selected && 'agent-office-scout--selected',
        hidden && 'opacity-20 grayscale',
      )}
      style={{ left: `${position.x}%`, top: `${position.y}%`, transitionDuration: '900ms' }}
      aria-label={`${analyst.name}: ${activity}. Covering ${ticker}${bookSize > 0 ? `, portfolio position ${bookIndex + 1} of ${bookSize}` : ''}, at ${LOCATION_LABELS[location]}, heading toward ${LOCATION_LABELS[nextLocation]}`}
      title={`${analyst.name} · ${activity}`}
    >
      {alerting ? (
        <span
          className="-mb-1 max-w-[11rem] truncate border-2 bg-[#1b0f0f]/95 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide shadow-[0_0_12px_rgba(242,109,109,0.45)]"
          style={{ borderColor: STATUS_COLORS[status], color: STATUS_COLORS[status] }}
        >
          {activity}
        </span>
      ) : null}
      <span className="agent-office-scout__sprite">
        <AgentSprite palette={analyst.palette} status={status} moving={moving} />
      </span>
      <span
        className={cn(
          'max-w-[8rem] truncate border bg-[#0b0f13]/95 px-1.5 py-0.5 font-mono text-[8px] shadow-md',
          alerting ? 'border-[#252c34] text-[#c9d0d7]' : 'border-[#1f262d] text-[#8d97a2]',
        )}
      >
        {alerting ? `${shortName} · ${ticker}` : `${shortName} · ${activity}`}
      </span>
    </button>
  );
}

function AnalystDesk({
  analyst,
  snapshot,
  event,
  status,
  selected,
  hidden,
  onSelect,
}: {
  analyst: AnalystDefinition;
  snapshot?: QuantScoreSnapshot;
  event?: QuantSignalEvent;
  status: AgentStatus;
  selected: boolean;
  hidden: boolean;
  onSelect: () => void;
}) {
  const currentTask = snapshot?.reasoning?.trim() || `Monitoring ${analyst.domain.toLowerCase()}.`;
  const nextEvidence = snapshot?.watch?.trim() || 'Waiting for the next scheduled company scan.';

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`analyst-${analyst.key}`}
      className={cn(
        'group relative flex min-h-[205px] min-w-0 flex-col items-center justify-end border border-transparent px-1 pb-2 pt-8 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65d487]',
        selected && 'border-[#65d487]/70 bg-[#65d487]/[0.04]',
        hidden && 'opacity-20 grayscale',
      )}
      aria-pressed={selected}
    >
      <span className="absolute top-2 max-w-[94%] border border-[#46505a] bg-[#12171d] px-2 py-1 text-center font-mono text-[9px] text-[#e6e9ed] shadow-md">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
        {analyst.name}
      </span>

      <span className="relative h-[112px] w-[170px] max-w-full">
        <Image
          alt=""
          src="/pixel-agents/assets/furniture/DESK/DESK_FRONT.png"
          width={48}
          height={32}
          unoptimized
          className="absolute bottom-0 left-1/2 h-24 w-40 -translate-x-1/2 object-fill [image-rendering:pixelated]"
        />
        <Image
          alt=""
          src={status === 'idle'
            ? '/pixel-agents/assets/furniture/PC/PC_FRONT_OFF.png'
            : '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_2.png'}
          width={16}
          height={32}
          unoptimized
          className="absolute bottom-[54px] left-[37px] h-14 w-7 [image-rendering:pixelated]"
        />
        <Image
          alt=""
          src={status === 'idle'
            ? '/pixel-agents/assets/furniture/PC/PC_FRONT_OFF.png'
            : '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_1.png'}
          width={16}
          height={32}
          unoptimized
          className="absolute bottom-[56px] left-1/2 h-14 w-7 -translate-x-1/2 [image-rendering:pixelated]"
        />
        <Image
          alt=""
          src={status === 'idle'
            ? '/pixel-agents/assets/furniture/PC/PC_FRONT_OFF.png'
            : '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_3.png'}
          width={16}
          height={32}
          unoptimized
          className="absolute bottom-[54px] right-[37px] h-14 w-7 [image-rendering:pixelated]"
        />
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 border border-[#46505a] bg-[#171d23]/90 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.1em] text-[#78838e]">
          Field rotation
        </span>
      </span>

      <span className="mt-1 flex items-center gap-2 font-mono text-[9px]">
        <span style={{ color: STATUS_COLORS[status] }}>{STATUS_LABELS[status]}</span>
        <span className="text-[#b8c0c8]">{snapshot ? `${snapshot.ticker} ${Math.round(snapshot.score)}` : 'No score'}</span>
      </span>
      {event ? (
        <span className="mt-1 max-w-[95%] truncate font-mono text-[8px] text-[#f18a8a]">
          {event.delta > 0 ? '+' : ''}{event.delta} event
        </span>
      ) : null}
      <span className="mt-1 block w-[96%] border border-[#303942] bg-[#10161b]/95 px-2 py-1.5">
        <span className="block font-mono text-[7px] uppercase tracking-[0.12em] text-[#65d487]">
          Now · {snapshot?.ticker ?? 'Queue'}
        </span>
        <span className="mt-0.5 block line-clamp-2 min-h-5 font-mono text-[7px] leading-[10px] text-[#c4cbd2]">
          {currentTask}
        </span>
        <span className="mt-1 block truncate font-mono text-[7px] text-[#727d88]" title={nextEvidence}>
          Next: {nextEvidence}
        </span>
      </span>
    </button>
  );
}

function SeniorSeat({
  senior,
  signal,
  active,
  selected,
  onSelect,
}: {
  senior: SeniorDefinition;
  signal?: SeniorSignal;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const status: AgentStatus = active ? 'reviewing' : 'idle';
  const currentTask = active
    ? signal?.reasoning?.trim() || signal?.thesis?.trim() || `Reviewing through the ${senior.lens.toLowerCase()} lens.`
    : `Standby · ${senior.lens}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex min-w-0 items-start gap-1 border border-transparent px-1 py-1 text-left transition',
        selected && 'border-[#e6b84d]/70 bg-[#e6b84d]/10',
        !active && 'opacity-65',
      )}
      aria-pressed={selected}
      title={`${senior.name}: ${senior.lens}`}
    >
      <span className="h-8 w-5 shrink-0 overflow-hidden">
        <AgentSprite palette={senior.palette} status={status} compact />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-[7px] text-[#e5e7eb]">{senior.name}</span>
        <span className="block truncate font-mono text-[7px]" style={{ color: stanceColor(signal?.signal) }}>
          {active ? signal?.signal ?? 'reviewing' : 'standby'}
        </span>
        <span className="mt-0.5 block line-clamp-2 min-h-4 font-mono text-[6px] leading-2 text-[#a7afb9]">
          {currentTask}
        </span>
      </span>
    </button>
  );
}

function pendingSnapshot(
  analyst: AnalystDefinition,
  ticker: string,
  now: number,
): QuantScoreSnapshot {
  const observedAt = new Date(now).toISOString();
  return {
    id: `pending-${ticker}-${analyst.key}`,
    ticker,
    analystKey: analyst.key,
    analystName: analyst.name,
    score: 50,
    signal: 'neutral',
    confidence: 0,
    reasoning: `Building the first ${analyst.domain.toLowerCase()} baseline for ${ticker}.`,
    watch: 'Waiting for the monitoring model to return the first scored observation.',
    source: 'hedge_fund_monitoring',
    observedAt,
    createdAt: observedAt,
  };
}

export function AgentOffice() {
  const [views, setViews] = useState<AgentView[]>([]);
  const [snapshots, setSnapshots] = useState<QuantScoreSnapshot[]>([]);
  const [events, setEvents] = useState<QuantSignalEvent[]>([]);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [localPortfolioTickers, setLocalPortfolioTickers] = useState<string[]>([]);
  const [monitoringTicker, setMonitoringTicker] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>('quant:fundamentals');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [walkTick, setWalkTick] = useState(0);
  const [walkSessions, setWalkSessions] = useState<Partial<Record<QuantAnalystKey, WalkSession>>>({});
  const lastSeenEventRef = useRef<Partial<Record<QuantAnalystKey, string>>>({});

  const loadActivity = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [viewsResponse, monitoringResponse, positionsResponse] = await Promise.all([
        fetch('/api/pm/agent-views?limit=500', { cache: 'no-store' }),
        fetch('/api/pm/quant-monitor?limit=500', { cache: 'no-store' }),
        fetch('/api/pm/positions?limit=200', { cache: 'no-store' }),
      ]);
      if (!viewsResponse.ok) throw new Error(`Agent activity request failed (${viewsResponse.status})`);
      if (!monitoringResponse.ok) throw new Error(`Monitoring request failed (${monitoringResponse.status})`);
      if (!positionsResponse.ok) throw new Error(`Portfolio request failed (${positionsResponse.status})`);
      const [viewsPayload, monitoringPayload, positionsPayload] = await Promise.all([
        viewsResponse.json() as Promise<{ agentViews?: AgentView[] }>,
        monitoringResponse.json() as Promise<{ snapshots?: QuantScoreSnapshot[]; events?: QuantSignalEvent[] }>,
        positionsResponse.json() as Promise<{ positions?: PortfolioPosition[] }>,
      ]);
      setViews([...(viewsPayload.agentViews ?? [])].sort((a, b) => (b.runAt ?? b.createdAt).localeCompare(a.runAt ?? a.createdAt)));
      setSnapshots(monitoringPayload.snapshots ?? []);
      setEvents(monitoringPayload.events ?? []);
      setPositions(positionsPayload.positions ?? []);
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
    void loadActivity();
    const polling = window.setInterval(() => { void loadActivity(); }, 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    const walk = window.setInterval(() => setWalkTick(current => (current + 1) % 1_000_000), 250);
    return () => {
      window.clearInterval(polling);
      window.clearInterval(clock);
      window.clearInterval(walk);
    };
  }, [loadActivity]);

  useEffect(() => {
    const refreshLocalPortfolio = () => {
      setLocalPortfolioTickers([
        ...new Set(getActivePositions().map(position => position.ticker.toUpperCase())),
      ]);
    };
    refreshLocalPortfolio();
    window.addEventListener(PORTFOLIO_EVENT, refreshLocalPortfolio);
    window.addEventListener('storage', refreshLocalPortfolio);
    return () => {
      window.removeEventListener(PORTFOLIO_EVENT, refreshLocalPortfolio);
      window.removeEventListener('storage', refreshLocalPortfolio);
    };
  }, []);

  const portfolioTickers = useMemo(
    () => [...new Set(
      [
        ...localPortfolioTickers,
        ...positions
          .filter(position => position.status === 'active' || position.status === 'watch')
          .map(position => position.ticker.toUpperCase()),
      ],
    )],
    [localPortfolioTickers, positions],
  );
  const scoredTickers = useMemo(() => new Set(snapshots.map(snapshot => snapshot.ticker)), [snapshots]);
  const nextUnscoredTicker = portfolioTickers.find(ticker => !scoredTickers.has(ticker)) ?? null;

  useEffect(() => {
    if (loading || monitoringTicker || !nextUnscoredTicker) return;
    setMonitoringTicker(nextUnscoredTicker);
    void fetch('/api/pm/quant-monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: nextUnscoredTicker, autoEscalate: true }),
    })
      .then(async response => {
        if (!response.ok) throw new Error(`Baseline monitoring failed (${response.status})`);
        return response.json() as Promise<{
          snapshots?: QuantScoreSnapshot[];
          events?: QuantSignalEvent[];
        }>;
      })
      .then(result => {
        setSnapshots(current => [...(result.snapshots ?? []), ...current]);
        setEvents(current => [...(result.events ?? []), ...current]);
        setError(null);
      })
      .catch(requestError => {
        setError(requestError instanceof Error ? requestError.message : 'Could not start portfolio monitoring');
      })
      .finally(() => {
        setMonitoringTicker(null);
      });
  }, [loading, monitoringTicker, nextUnscoredTicker]);

  // Always-on monitoring loop: rescans the stalest portfolio ticker on a cadence
  // so the desk is never quiet. Per-ticker cooldown keeps the same name from being
  // hammered. State is read through a ref so the interval does not reset on every
  // snapshot/event update.
  const loopStateRef = useRef<{
    monitoringTicker: string | null;
    portfolioTickers: string[];
    snapshots: QuantScoreSnapshot[];
    lastScanAt: Record<string, number>;
  }>({
    monitoringTicker: null,
    portfolioTickers: [],
    snapshots: [],
    lastScanAt: {},
  });
  loopStateRef.current.monitoringTicker = monitoringTicker;
  loopStateRef.current.portfolioTickers = portfolioTickers;
  loopStateRef.current.snapshots = snapshots;

  useEffect(() => {
    if (loading) return;
    const interval = window.setInterval(() => {
      const state = loopStateRef.current;
      if (state.monitoringTicker || state.portfolioTickers.length === 0) return;
      const nowMs = Date.now();
      let candidate: string | null = null;
      let stalestAt = Number.POSITIVE_INFINITY;
      for (const ticker of state.portfolioTickers) {
        const lastLocal = state.lastScanAt[ticker] ?? 0;
        if (nowMs - lastLocal < TICKER_COOLDOWN_MS) continue;
        let observedAt = Number.POSITIVE_INFINITY;
        for (const snap of state.snapshots) {
          if (snap.ticker !== ticker) continue;
          const t = new Date(snap.observedAt).getTime();
          if (Number.isFinite(t) && t < observedAt) observedAt = t;
        }
        if (observedAt < stalestAt) {
          stalestAt = observedAt;
          candidate = ticker;
        }
      }
      if (!candidate) return;
      state.lastScanAt[candidate] = nowMs;
      setMonitoringTicker(candidate);
      void fetch('/api/pm/quant-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: candidate, autoEscalate: true }),
      })
        .then(async response => {
          if (!response.ok) throw new Error(`Continuous monitoring failed (${response.status})`);
          return response.json() as Promise<{
            snapshots?: QuantScoreSnapshot[];
            events?: QuantSignalEvent[];
          }>;
        })
        .then(result => {
          setSnapshots(current => [...(result.snapshots ?? []), ...current]);
          setEvents(current => [...(result.events ?? []), ...current]);
        })
        .catch(requestError => {
          setError(requestError instanceof Error ? requestError.message : 'Continuous monitoring failed');
        })
        .finally(() => setMonitoringTicker(null));
    }, ACTIVE_LOOP_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loading]);

  const latestSnapshotByAnalyst = useMemo(() => {
    const map = new Map<QuantAnalystKey, QuantScoreSnapshot>();
    for (const snapshot of snapshots) {
      if (!map.has(snapshot.analystKey)) map.set(snapshot.analystKey, snapshot);
    }
    return map;
  }, [snapshots]);

  const latestEventByAnalyst = useMemo(() => {
    const map = new Map<QuantAnalystKey, QuantSignalEvent>();
    for (const event of events) {
      if (!map.has(event.analystKey)) map.set(event.analystKey, event);
    }
    return map;
  }, [events]);

  // Only big events make a scout get up — anything tagged shouldEscalate triggers
  // a walk to the PM inbox. Routine snapshots just keep the scout typing at their desk.
  useEffect(() => {
    let pending: Partial<Record<QuantAnalystKey, WalkSession>> | null = null;
    for (const analyst of ANALYSTS) {
      const latestEvent = latestEventByAnalyst.get(analyst.key);
      if (!latestEvent) continue;
      const prevId = lastSeenEventRef.current[analyst.key];
      if (prevId === latestEvent.id) continue;
      const firstTime = !prevId;
      lastSeenEventRef.current[analyst.key] = latestEvent.id;
      if (firstTime) continue;
      if (!latestEvent.shouldEscalate) continue;
      if (!pending) pending = {};
      pending[analyst.key] = { startedAt: Date.now(), ticker: latestEvent.ticker };
    }
    if (pending) {
      const additions = pending;
      setWalkSessions(prev => ({ ...prev, ...additions }));
    }
  }, [latestEventByAnalyst]);

  // Drop walk sessions once they finish so the scout returns to default at-desk.
  useEffect(() => {
    setWalkSessions(prev => {
      const nowMs = Date.now();
      let changed = false;
      const next: Partial<Record<QuantAnalystKey, WalkSession>> = { ...prev };
      for (const [key, session] of Object.entries(prev)) {
        if (!session) continue;
        if (nowMs - session.startedAt >= WALK_TOTAL_MS) {
          delete next[key as QuantAnalystKey];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [walkTick]);

  const scoutRotations = useMemo(() => ANALYSTS.map((analyst, index) => {
    const event = latestEventByAnalyst.get(analyst.key);
    const snapshot = latestSnapshotByAnalyst.get(analyst.key);
    const session = walkSessions[analyst.key];
    const nowMs = Date.now();
    const escalated = event?.status === 'escalated' && event.shouldEscalate;
    const isScanningThis = monitoringTicker && snapshot?.ticker === monitoringTicker;

    let position = scoutPosition('desk', index);
    let walking = false;
    let activity: string;
    let phaseLabel: string;
    let remainingMs = 0;
    let location: ScoutLocation = 'desk';
    let nextLocation: ScoutLocation = 'desk';
    let isWalking = false;
    const verb = DESK_VERB[analyst.key];

    if (escalated && event) {
      position = scoutPosition('pm_inbox', index);
      activity = `Escalating ${event.ticker}`;
      phaseLabel = 'At PM inbox';
      location = 'pm_inbox';
      nextLocation = 'pm_inbox';
    } else if (session && nowMs - session.startedAt < WALK_TOTAL_MS) {
      const elapsed = nowMs - session.startedAt;
      const chor = walkChoreography(elapsed, index, session.ticker);
      position = chor.position;
      walking = chor.walking;
      activity = chor.activity;
      phaseLabel = chor.phaseLabel;
      remainingMs = chor.remainingMs;
      isWalking = true;
      if (elapsed < WALK_PHASE_END_MS.AT_INBOX) {
        location = elapsed < WALK_PHASE_END_MS.TO_AISLE ? 'desk' : 'company_queue';
        nextLocation = 'pm_inbox';
      } else {
        location = elapsed < WALK_PHASE_END_MS.BACK_TO_AISLE ? 'pm_inbox' : 'company_queue';
        nextLocation = 'desk';
      }
    } else if (monitoringTicker) {
      // Active scan in progress — sit at desk and work.
      position = scoutPosition('desk', index);
      activity = `${verb} ${monitoringTicker}`;
      phaseLabel = isScanningThis ? 'At desk · scoring' : 'At desk · scanning';
      location = 'desk';
      nextLocation = 'desk';
    } else {
      // No scan in flight — head to the break room.
      position = BREAK_POSITIONS[index] ?? BREAK_POSITIONS[0];
      activity = snapshot
        ? `Reading ${snapshot.ticker} notes`
        : portfolioTickers.length === 0
          ? 'Awaiting portfolio'
          : 'On break';
      phaseLabel = 'In break room';
      location = 'company_queue';
      nextLocation = 'desk';
    }
    const alerting = escalated || isWalking;

    const tickerPool = portfolioTickers.length > 0
      ? portfolioTickers
      : snapshot?.ticker ? [snapshot.ticker] : [];
    const ticker = session?.ticker ?? monitoringTicker ?? snapshot?.ticker ?? 'QUEUE';
    const bookIndex = tickerPool.length > 0 ? Math.max(0, tickerPool.indexOf(ticker)) : 0;

    const status: AgentStatus = escalated
      ? 'needs_attention'
      : isWalking
        ? 'working'
        : monitoringTicker && !snapshot
          ? 'working'
          : statusForAnalyst(snapshot, event, now);

    return {
      analyst,
      status,
      location,
      nextLocation,
      ticker,
      bookIndex,
      bookSize: tickerPool.length,
      position,
      moving: walking,
      activity,
      phaseLabel,
      remainingMs,
      alerting,
    };
  }), [
    latestEventByAnalyst,
    latestSnapshotByAnalyst,
    monitoringTicker,
    now,
    portfolioTickers,
    walkSessions,
    walkTick,
  ]);
  const scoutRotationByKey = useMemo(
    () => new Map(scoutRotations.map(rotation => [rotation.analyst.key, rotation])),
    [scoutRotations],
  );

  const latestCommitteeView = views.find(view => view.agentName === 'Senior Investment Committee') ?? null;
  const committeeSignals = useMemo(() => {
    const raw = latestCommitteeView?.rawOutput as { signals?: SeniorSignal[] } | undefined;
    return Array.isArray(raw?.signals) ? raw.signals : [];
  }, [latestCommitteeView]);
  const committeeSignalByKey = useMemo(
    () => new Map(committeeSignals.map(signal => [signal.key ?? '', signal])),
    [committeeSignals],
  );

  const pendingEscalation = events.find(event => event.status === 'escalated' && event.shouldEscalate && !event.committeeRunId);
  const recentlyReviewed = events.find(event => event.status === 'reviewed' && ageInMs(event.reviewedAt ?? event.createdAt, now) <= 10 * 60_000);
  const committeeActive = Boolean(
    pendingEscalation
    || recentlyReviewed
    || ageInMs(latestCommitteeView?.runAt ?? latestCommitteeView?.createdAt, now) <= 10 * 60_000,
  );
  const handoffEvent = pendingEscalation ?? recentlyReviewed;
  const committeeTicker = handoffEvent?.ticker ?? latestCommitteeView?.ticker ?? null;

  const latestCompanies = useMemo(() => {
    const byTicker = new Map<string, string>();
    for (const snapshot of snapshots) {
      if (!byTicker.has(snapshot.ticker)) byTicker.set(snapshot.ticker, snapshot.observedAt);
    }
    for (const ticker of portfolioTickers) {
      if (!byTicker.has(ticker)) byTicker.set(ticker, '');
    }
    return [...byTicker.entries()].slice(0, 8);
  }, [portfolioTickers, snapshots]);

  const selectedQuantKey = selection.startsWith('quant:')
    ? selection.slice(6) as QuantAnalystKey
    : null;
  const selectedSeniorKey = selection.startsWith('senior:') ? selection.slice(7) : null;
  const selectedAnalyst = selectedQuantKey ? ANALYSTS.find(analyst => analyst.key === selectedQuantKey) : undefined;
  const selectedSnapshot = selectedQuantKey ? latestSnapshotByAnalyst.get(selectedQuantKey) : undefined;
  const selectedVisibleSnapshot = selectedSnapshot
    ?? (selectedAnalyst && monitoringTicker ? pendingSnapshot(selectedAnalyst, monitoringTicker, now) : undefined);
  const selectedEvent = selectedQuantKey ? latestEventByAnalyst.get(selectedQuantKey) : undefined;
  const selectedRotation = selectedQuantKey ? scoutRotationByKey.get(selectedQuantKey) : undefined;
  const selectedSenior = selectedSeniorKey ? SENIORS.find(senior => senior.key === selectedSeniorKey) : undefined;
  const selectedSeniorSignal = selectedSeniorKey ? committeeSignalByKey.get(selectedSeniorKey) : undefined;

  const activeAnalystCount = monitoringTicker ? ANALYSTS.length : ANALYSTS.filter(analyst => {
    const status = statusForAnalyst(
      latestSnapshotByAnalyst.get(analyst.key),
      latestEventByAnalyst.get(analyst.key),
      now,
    );
    return status !== 'idle';
  }).length;
  const attentionCount = ANALYSTS.filter(analyst => statusForAnalyst(
    latestSnapshotByAnalyst.get(analyst.key),
    latestEventByAnalyst.get(analyst.key),
    now,
  ) === 'needs_attention').length;

  const committeeRaw = (latestCommitteeView?.rawOutput ?? {}) as {
    decision?: { action?: string; confidence?: number; reasoning?: string; sizing?: string };
    consensus?: { bullish?: number; bearish?: number; neutral?: number };
  };
  const committeeDecision = committeeRaw.decision;
  const committeeConsensus = committeeRaw.consensus;
  const committeeAge = formatAge(latestCommitteeView?.runAt ?? latestCommitteeView?.createdAt);
  const inspectorTicker = selectedVisibleSnapshot?.ticker ?? committeeTicker ?? '';
  const scoutInspectorHref = selectedAnalyst && inspectorTicker
    ? `/agents/inspector?ticker=${encodeURIComponent(inspectorTicker)}&analyst=${selectedAnalyst.key}`
    : undefined;
  const committeeInspectorHref = inspectorTicker
    ? `/agents/inspector?ticker=${encodeURIComponent(inspectorTicker)}`
    : undefined;
  const recentForSelected = selectedAnalyst
    ? snapshots
        .filter(snap => snap.analystKey === selectedAnalyst.key)
        .slice()
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
        .slice(0, 6)
    : [];

  return (
    <div className="mx-auto w-full max-w-[2000px]">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--cb-text-primary)]">Agent Office</h1>
            <span className="flex items-center gap-1.5 text-[10px] text-[var(--cb-text-muted)]">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                error ? 'bg-red-400' : attentionCount > 0 ? 'bg-amber-400' : 'bg-[var(--cb-green)]',
              )} />
              {error
                ? 'Activity feed unavailable'
                : portfolioTickers.length === 0
                  ? 'No portfolio positions — add holdings to start monitoring'
                  : monitoringTicker
                    ? `Six scouts scanning ${monitoringTicker}`
                    : committeeActive
                      ? `Committee reviewing ${committeeTicker ?? 'an escalation'}`
                      : Object.keys(walkSessions).length > 0
                        ? `${Object.keys(walkSessions).length} scout${Object.keys(walkSessions).length === 1 ? '' : 's'} delivering signals`
                        : attentionCount > 0
                          ? `${attentionCount} signal${attentionCount === 1 ? '' : 's'} escalating`
                          : 'Scouts monitoring normally'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--cb-text-muted)]">
            Quant scouts type at their desks. When a scan completes they get up, walk the result to the PM inbox, and head back.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Filter agent status</span>
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cb-text-muted)]" />
            <select
              value={filter}
              onChange={event => setFilter(event.target.value as StatusFilter)}
              className="h-9 appearance-none rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] pl-8 pr-8 text-xs text-[var(--cb-text-secondary)] outline-none focus:border-[var(--cb-green)]"
            >
              <option value="all">All scouts</option>
              <option value="active">Active</option>
              <option value="attention">Escalating</option>
              <option value="idle">Idle</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => { void loadActivity(true); }}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 text-xs font-medium text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </header>

      <div className="overflow-hidden border border-[#252c34] bg-[#0d1116] text-[#dfe4ea] shadow-[0_14px_50px_rgba(0,0,0,0.18)]">
        <div className="flex min-h-11 items-center justify-between gap-4 overflow-x-auto border-b border-[#252c34] bg-[#10151a] px-4">
          <div className="flex shrink-0 items-center gap-4 text-[10px] text-[#8f98a3]">
            <span className="inline-flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5 text-[#65d487]" />
              6 monitoring scouts
            </span>
            <span>{activeAnalystCount} active</span>
            <span className={committeeActive ? 'text-[#e6b84d]' : undefined}>
              {committeeActive ? 'Investment committee awake' : 'Senior room on standby'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#66717d]">
            {latestCompanies.length > 0 ? latestCompanies.map(([ticker]) => (
              <span key={ticker} className="border-l border-[#303842] pl-2">{ticker}</span>
            )) : <span>No monitored companies yet</span>}
          </div>
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 border-b border-[#252c34] xl:border-b-0 xl:border-r">
            <div
              className="relative min-h-[920px] overflow-x-auto p-4"
              style={{
                backgroundColor: '#24292f',
                backgroundImage: 'linear-gradient(rgba(11,14,18,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(11,14,18,0.18) 1px, transparent 1px), url(/pixel-agents/assets/floors/floor_6.png)',
                backgroundSize: '32px 32px, 32px 32px, 32px 32px',
                imageRendering: 'pixelated',
              }}
            >
              <div className="pointer-events-none absolute inset-3 border-[6px] border-[#171c22] shadow-[inset_0_0_0_2px_#3b424a]" />

              <div className="relative z-10 mx-auto grid min-h-[880px] min-w-[1480px] grid-cols-[220px_minmax(0,1fr)_88px_380px]">
                {/* Research library — bookshelves, reading bench, ambient decor */}
                <section
                  className="relative border-r-[6px] border-[#171c22] px-3 pb-3 pt-10"
                  style={{
                    backgroundImage: 'url(/pixel-agents/assets/floors/floor_3.png)',
                    backgroundSize: '32px 32px',
                    imageRendering: 'pixelated',
                  }}
                >
                  <div className="absolute left-3 top-3 flex items-center gap-2 bg-[#10151a]/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f98a3]">
                    <Bot className="h-3 w-3 text-[#7ea8c9]" />
                    Research library
                  </div>
                  {/* Bookshelf wall (top half) */}
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png"
                    width={48}
                    height={48}
                    unoptimized
                    className="absolute left-3 top-12 h-24 w-32 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/BOOKSHELF/BOOKSHELF.png"
                    width={32}
                    height={48}
                    unoptimized
                    className="absolute right-3 top-12 h-24 w-16 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/SMALL_PAINTING/SMALL_PAINTING.png"
                    width={32}
                    height={32}
                    unoptimized
                    className="absolute left-1/2 top-40 h-10 w-14 -translate-x-1/2 [image-rendering:pixelated]"
                  />
                  {/* Reading nook (mid) */}
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/CUSHIONED_BENCH/CUSHIONED_BENCH.png"
                    width={64}
                    height={32}
                    unoptimized
                    className="absolute left-1/2 top-56 h-12 w-36 -translate-x-1/2 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png"
                    width={32}
                    height={16}
                    unoptimized
                    className="absolute left-1/2 top-72 h-6 w-20 -translate-x-1/2 [image-rendering:pixelated]"
                  />
                  {/* Plants and clock */}
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/LARGE_PLANT/LARGE_PLANT.png"
                    width={32}
                    height={48}
                    unoptimized
                    className="absolute bottom-12 left-3 h-20 w-12 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/HANGING_PLANT/HANGING_PLANT.png"
                    width={32}
                    height={32}
                    unoptimized
                    className="absolute right-3 top-3 h-12 w-12 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/CLOCK/CLOCK.png"
                    width={16}
                    height={16}
                    unoptimized
                    className="absolute bottom-3 right-3 h-8 w-8 [image-rendering:pixelated]"
                  />
                  <p className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[7px] uppercase tracking-[0.16em] text-[#5f6a76]">
                    Edgar · 10-K · transcripts
                  </p>
                </section>

                <section className="relative border-r-[6px] border-[#171c22] px-3 pb-3 pt-10">
                  <div className="absolute left-4 top-3 flex items-center gap-2 bg-[#10151a]/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f98a3]">
                    <Bot className="h-3 w-3 text-[#65d487]" />
                    Trading floor
                  </div>
                  <div className="pointer-events-none absolute inset-0 z-20">
                    <span className="absolute left-1/2 top-[5%] -translate-x-1/2 border border-[#4b5948] bg-[#152019]/95 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-[#79c98f]">
                      Company queue
                    </span>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 border border-[#5e4d32] bg-[#211b13]/95 px-1.5 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-[#d8ae5b] [writing-mode:vertical-rl]">
                      PM inbox
                    </span>
                    <span className="absolute left-1/2 top-[70%] -translate-x-1/2 -translate-y-1/2 border border-[#3b4650] bg-[#12181e]/95 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-[#8da2b3]">
                      Break area
                    </span>
                  </div>
                  {/* Break area decor — coffee table flanked by sofas, plus plants. Below desks at y~80%. */}
                  <div className="pointer-events-none absolute inset-x-6 bottom-3 z-10 flex items-end justify-center gap-4">
                    <Image
                      alt=""
                      src="/pixel-agents/assets/furniture/LARGE_PLANT/LARGE_PLANT.png"
                      width={32}
                      height={48}
                      unoptimized
                      className="h-20 w-12 [image-rendering:pixelated]"
                    />
                    <Image
                      alt=""
                      src="/pixel-agents/assets/furniture/SOFA/SOFA_SIDE.png"
                      width={48}
                      height={32}
                      unoptimized
                      className="h-14 w-20 [image-rendering:pixelated]"
                    />
                    <div className="flex flex-col items-center gap-1">
                      <Image
                        alt=""
                        src="/pixel-agents/assets/furniture/COFFEE/COFFEE.png"
                        width={16}
                        height={16}
                        unoptimized
                        className="h-6 w-6 [image-rendering:pixelated]"
                      />
                      <Image
                        alt=""
                        src="/pixel-agents/assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png"
                        width={32}
                        height={16}
                        unoptimized
                        className="h-8 w-20 [image-rendering:pixelated]"
                      />
                    </div>
                    <Image
                      alt=""
                      src="/pixel-agents/assets/furniture/SOFA/SOFA_SIDE.png"
                      width={48}
                      height={32}
                      unoptimized
                      className="h-14 w-20 -scale-x-100 [image-rendering:pixelated]"
                    />
                    <Image
                      alt=""
                      src="/pixel-agents/assets/furniture/CACTUS/CACTUS.png"
                      width={16}
                      height={32}
                      unoptimized
                      className="h-10 w-8 [image-rendering:pixelated]"
                    />
                  </div>
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/HANGING_PLANT/HANGING_PLANT.png"
                    width={32}
                    height={32}
                    unoptimized
                    className="pointer-events-none absolute left-3 top-3 z-10 h-12 w-12 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/SMALL_PAINTING_2/SMALL_PAINTING_2.png"
                    width={32}
                    height={32}
                    unoptimized
                    className="pointer-events-none absolute right-12 top-3 z-10 h-10 w-14 [image-rendering:pixelated]"
                  />
                  <div className="grid min-h-[520px] grid-cols-3 gap-1">
                    {ANALYSTS.map(analyst => {
                      const persistedSnapshot = latestSnapshotByAnalyst.get(analyst.key);
                      const snapshot = persistedSnapshot
                        ?? (monitoringTicker ? pendingSnapshot(analyst, monitoringTicker, now) : undefined);
                      const event = latestEventByAnalyst.get(analyst.key);
                      const status = monitoringTicker && !persistedSnapshot
                        ? 'working'
                        : statusForAnalyst(snapshot, event, now);
                      return (
                        <AnalystDesk
                          key={analyst.key}
                          analyst={analyst}
                          snapshot={snapshot}
                          event={event}
                          status={status}
                          selected={selection === `quant:${analyst.key}`}
                          hidden={!filterMatches(status, filter)}
                          onSelect={() => setSelection(`quant:${analyst.key}`)}
                        />
                      );
                    })}
                  </div>
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 top-10 z-30">
                    {scoutRotations.map(rotation => (
                      <ScoutMover
                        key={rotation.analyst.key}
                        analyst={rotation.analyst}
                        status={rotation.status}
                        location={rotation.location}
                        nextLocation={rotation.nextLocation}
                        ticker={rotation.ticker}
                        bookIndex={rotation.bookIndex}
                        bookSize={rotation.bookSize}
                        position={rotation.position}
                        selected={selection === `quant:${rotation.analyst.key}`}
                        hidden={!filterMatches(rotation.status, filter)}
                        moving={rotation.moving}
                        activity={rotation.activity}
                        alerting={rotation.alerting}
                        onSelect={() => setSelection(`quant:${rotation.analyst.key}`)}
                      />
                    ))}
                  </div>
                </section>

                <section className="relative border-r-[6px] border-[#171c22] bg-[#171c22]/25">
                  <div className="absolute inset-x-3 top-1/2 h-16 -translate-y-1/2 border-y-2 border-dashed border-[#4e5964] bg-[#29313a]/80" />
                  <div className="absolute left-1/2 top-[43%] -translate-x-1/2 font-mono text-[7px] uppercase tracking-[0.16em] text-[#737e89] [writing-mode:vertical-rl]">
                    PM escalation corridor
                  </div>
                  {handoffEvent ? (
                    <div
                      className={cn(
                        'agent-office-runner absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2',
                        pendingEscalation && 'agent-office-runner--handoff',
                      )}
                      data-testid="escalation-runner"
                    >
                      <AgentSprite
                        palette={ANALYSTS.find(analyst => analyst.key === handoffEvent.analystKey)?.palette ?? 0}
                        status="needs_attention"
                      />
                      <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap bg-[#10151a] px-1 font-mono text-[7px] text-[#f18a8a]">
                        {handoffEvent.ticker} signal
                      </span>
                    </div>
                  ) : (
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[8px] text-[#59636e]">
                      clear
                    </span>
                  )}
                </section>

                <section
                  className={cn(
                    'relative px-3 pb-3 pt-12 transition-shadow',
                    committeeActive && 'shadow-[inset_0_0_42px_rgba(230,184,77,0.13)]',
                  )}
                  data-testid="senior-room"
                  style={{
                    backgroundImage: 'url(/pixel-agents/assets/floors/floor_1.png)',
                    backgroundSize: '32px 32px',
                    imageRendering: 'pixelated',
                  }}
                >
                  <div className="absolute left-4 top-3 flex items-center gap-2 bg-[#10151a]/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f98a3]">
                    <Users className={cn('h-3 w-3', committeeActive ? 'text-[#e6b84d]' : 'text-[#8a929d]')} />
                    Senior committee
                  </div>
                  <div className="absolute right-4 top-3 font-mono text-[8px]" style={{ color: committeeActive ? '#e6b84d' : '#8a929d' }}>
                    {committeeActive ? `IN SESSION · ${committeeTicker ?? ''}` : 'STANDBY'}
                  </div>

                  {/* Boardroom side decor */}
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png"
                    width={48}
                    height={48}
                    unoptimized
                    className="pointer-events-none absolute bottom-12 left-2 h-20 w-24 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/LARGE_PAINTING/LARGE_PAINTING.png"
                    width={48}
                    height={32}
                    unoptimized
                    className="pointer-events-none absolute right-2 top-12 h-12 w-20 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/LARGE_PLANT/LARGE_PLANT.png"
                    width={32}
                    height={48}
                    unoptimized
                    className="pointer-events-none absolute bottom-4 right-3 h-20 w-12 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/PLANT/PLANT.png"
                    width={16}
                    height={32}
                    unoptimized
                    className="pointer-events-none absolute left-3 top-12 h-12 w-8 [image-rendering:pixelated]"
                  />
                  <Image
                    alt=""
                    src="/pixel-agents/assets/furniture/CLOCK/CLOCK.png"
                    width={16}
                    height={16}
                    unoptimized
                    className="pointer-events-none absolute right-3 top-3 h-8 w-8 [image-rendering:pixelated]"
                  />

                  <div className="relative mx-auto mt-4 min-h-[640px] max-w-[320px] border-[4px] border-[#151a20] bg-[#20262d]/85 p-3 shadow-[inset_0_0_0_2px_#414952]">
                    <Image
                      alt=""
                      src="/pixel-agents/assets/furniture/WHITEBOARD/WHITEBOARD.png"
                      width={32}
                      height={32}
                      unoptimized
                      className="mx-auto h-16 w-24 [image-rendering:pixelated]"
                    />
                    <p className="mt-1 text-center font-mono text-[8px] text-[#9aa4ae]">
                      {committeeActive ? `${committeeTicker ?? 'Ticker'} review in progress` : 'Awaiting PM escalation'}
                    </p>

                    <div className="relative mt-4 grid grid-cols-2 gap-x-2 gap-y-1 border border-[#4c3f26] bg-[#5e482c]/65 p-2 shadow-[inset_0_0_0_2px_#806541]">
                      {SENIORS.map(senior => (
                        <SeniorSeat
                          key={senior.key}
                          senior={senior}
                          signal={committeeSignalByKey.get(senior.key)}
                          active={committeeActive}
                          selected={selection === `senior:${senior.key}`}
                          onSelect={() => setSelection(`senior:${senior.key}`)}
                        />
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-center gap-2 border border-[#38414a] bg-[#11171c] px-2 py-2">
                      <AgentSprite palette={4} status={committeeActive ? 'working' : 'idle'} compact />
                      <div>
                        <p className="font-mono text-[8px] text-white">PM Agent</p>
                        <p className="font-mono text-[7px]" style={{ color: committeeActive ? '#65d487' : '#8a929d' }}>
                          {committeeActive ? 'Synthesizing recommendation' : 'Monitoring signal queue'}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </section>

          <aside className="min-w-0 bg-[#0f1419]">
            <section className="border-b border-[#252c34] p-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8792]">
                {selectedAnalyst ? 'Selected scout' : 'Selected senior investor'}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center border border-[#313943] bg-[#181e24]">
                  <AgentSprite
                    palette={selectedAnalyst?.palette ?? selectedSenior?.palette ?? 0}
                    status={selectedAnalyst
                      ? monitoringTicker && !selectedSnapshot
                        ? 'working'
                        : statusForAnalyst(selectedSnapshot, selectedEvent, now)
                      : committeeActive ? 'reviewing' : 'idle'}
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-white">
                    {selectedAnalyst?.name ?? selectedSenior?.name ?? 'Agent'}
                  </h2>
                  <p className="mt-1 text-xs text-[#8d97a2]">
                    {selectedAnalyst?.domain ?? selectedSenior?.lens}
                  </p>
                </div>
              </div>

              {selectedAnalyst ? (
                <dl className="mt-5 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-3 text-xs">
                  <dt className="text-[#7d8792]">Company</dt>
                  <dd className="font-mono font-semibold text-white">{selectedVisibleSnapshot?.ticker ?? '—'}</dd>
                  <dt className="text-[#7d8792]">Score</dt>
                  <dd>
                    <div className="flex items-center justify-between font-mono text-white">
                      <span>{selectedVisibleSnapshot ? Math.round(selectedVisibleSnapshot.score) : '—'}</span>
                      <span className="text-[9px] capitalize" style={{ color: stanceColor(selectedVisibleSnapshot?.signal) }}>
                        {monitoringTicker && !selectedSnapshot ? 'Scanning' : selectedVisibleSnapshot?.signal ?? 'No read'}
                      </span>
                    </div>
                    {selectedVisibleSnapshot ? <ScoreBar score={selectedVisibleSnapshot.score} /> : null}
                  </dd>
                  <dt className="text-[#7d8792]">Last scan</dt>
                  <dd className="text-[#d2d7dd]">
                    {monitoringTicker && !selectedSnapshot ? 'Running now' : formatAge(selectedVisibleSnapshot?.observedAt)}
                  </dd>
                  <dt className="text-[#7d8792]">Activity</dt>
                  <dd data-testid="selected-scout-location" className="font-mono text-[#d2d7dd]">
                    {selectedRotation?.activity ?? '—'}
                  </dd>
                  <dt className="text-[#7d8792]">Phase</dt>
                  <dd data-testid="selected-scout-next-move" className="font-mono text-[#d2d7dd]">
                    {selectedRotation
                      ? selectedRotation.remainingMs > 0
                        ? `${selectedRotation.phaseLabel} · ${(selectedRotation.remainingMs / 1000).toFixed(1)}s left`
                        : selectedRotation.phaseLabel
                      : '—'}
                  </dd>
                  <dt className="text-[#7d8792]">Book</dt>
                  <dd data-testid="selected-scout-book-rotation" className="font-mono text-[#d2d7dd]">
                    {selectedRotation && selectedRotation.bookSize > 0
                      ? `${selectedRotation.ticker} · ${selectedRotation.bookIndex + 1}/${selectedRotation.bookSize}`
                      : 'Queue empty'}
                  </dd>
                  <dt className="text-[#7d8792]">Watching</dt>
                  <dd className="line-clamp-4 leading-5 text-[#d2d7dd]">{selectedVisibleSnapshot?.watch ?? selectedAnalyst.domain}</dd>
                </dl>
              ) : (
                <dl className="mt-5 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-3 text-xs">
                  <dt className="text-[#7d8792]">Room</dt>
                  <dd style={{ color: committeeActive ? '#e6b84d' : '#8a929d' }}>{committeeActive ? 'In session' : 'Standby'}</dd>
                  <dt className="text-[#7d8792]">Company</dt>
                  <dd className="font-mono font-semibold text-white">{committeeTicker ?? '—'}</dd>
                  <dt className="text-[#7d8792]">View</dt>
                  <dd className="capitalize" style={{ color: stanceColor(selectedSeniorSignal?.signal) }}>
                    {selectedSeniorSignal?.signal ?? 'No committee read'}
                  </dd>
                  <dt className="text-[#7d8792]">Confidence</dt>
                  <dd className="font-mono text-[#d2d7dd]">
                    {selectedSeniorSignal?.confidence != null ? `${selectedSeniorSignal.confidence}%` : '—'}
                  </dd>
                </dl>
              )}
            </section>

            <section className="border-b border-[#252c34] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#d8dde3]">Current activity</h3>
                <span className="font-mono text-[9px] text-[#65d487]">
                  {Object.keys(walkSessions).length > 0
                    ? `${Object.keys(walkSessions).length} walking`
                    : 'All at desks'}
                </span>
              </div>
              <p className="mt-1 text-[9px] leading-4 text-[#697480]">
                Scouts work at their desks. When a scan completes they walk the result to the PM inbox and back.
              </p>
              <div className="mt-3 divide-y divide-[#252c34] border-y border-[#252c34]">
                {scoutRotations.map(rotation => (
                  <button
                    key={rotation.analyst.key}
                    type="button"
                    onClick={() => setSelection(`quant:${rotation.analyst.key}`)}
                    className={cn(
                      'grid w-full grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-2 py-2 text-left',
                      selection === `quant:${rotation.analyst.key}` && 'bg-[#65d487]/[0.035]',
                    )}
                  >
                    <span className="truncate font-mono text-[8px] text-[#c9d0d7]">
                      {rotation.analyst.name.replace(' Analyst', '')}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block truncate font-mono text-[8px]"
                        style={{ color: STATUS_COLORS[rotation.status] }}
                      >
                        {rotation.activity}
                      </span>
                      <span className="block truncate font-mono text-[7px] text-[#65717c]">
                        {rotation.phaseLabel}
                        {rotation.remainingMs > 0
                          ? ` · ${(rotation.remainingMs / 1000).toFixed(1)}s`
                          : ''}
                      </span>
                    </span>
                    <span className="border border-[#344039] bg-[#152019] px-1.5 py-0.5 font-mono text-[8px] text-[#65d487]">
                      {rotation.ticker}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="border-b border-[#252c34] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#d8dde3]">Live workboard</h3>
                <span className="font-mono text-[9px] text-[#727d88]">Updates every 15s</span>
              </div>
              <div className="mt-3 divide-y divide-[#252c34] border-y border-[#252c34]">
                {ANALYSTS.map(analyst => {
                  const persistedSnapshot = latestSnapshotByAnalyst.get(analyst.key);
                  const snapshot = persistedSnapshot
                    ?? (monitoringTicker ? pendingSnapshot(analyst, monitoringTicker, now) : undefined);
                  const event = latestEventByAnalyst.get(analyst.key);
                  const status = monitoringTicker && !persistedSnapshot
                    ? 'working'
                    : statusForAnalyst(snapshot, event, now);
                  return (
                    <button
                      key={analyst.key}
                      type="button"
                      onClick={() => setSelection(`quant:${analyst.key}`)}
                      className={cn(
                        'grid w-full grid-cols-[8px_78px_minmax(0,1fr)] items-start gap-2 py-2 text-left',
                        selection === `quant:${analyst.key}` && 'bg-[#65d487]/[0.035]',
                      )}
                    >
                      <span
                        className="mt-1 h-2 w-2 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[status] }}
                      />
                      <span className="font-mono text-[9px] text-[#c9d0d7]">
                        {analyst.name.replace(' Analyst', '')}
                        <span className="mt-0.5 block text-[8px] text-[#697480]">
                          {snapshot
                            ? `${snapshot.ticker} · ${monitoringTicker && !persistedSnapshot ? 'scanning' : Math.round(snapshot.score)}`
                            : 'Queue idle'}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block line-clamp-2 text-[9px] leading-3 text-[#aeb6bf]">
                          {snapshot?.reasoning || `Monitoring ${analyst.domain.toLowerCase()}.`}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[8px] text-[#65717c]">
                          {snapshot
                            ? monitoringTicker && !persistedSnapshot
                              ? 'Baseline scan running now'
                              : `Updated ${formatAge(snapshot.observedAt)}`
                            : 'Awaiting first scheduled scan'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="border-b border-[#252c34] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#d8dde3]">Completed work</h3>
                <span className="text-[10px] text-[#727d88]">{snapshots.length} scans</span>
              </div>
              <p className="mt-1 text-[9px] leading-4 text-[#697480]">
                What each scout finished and what shifted as a result.
              </p>
              <div className="mt-3 space-y-2">
                {snapshots.length === 0 ? (
                  <p className="py-3 text-center text-xs text-[#697480]">No completed scans yet.</p>
                ) : snapshots.slice(0, 8).map(snap => {
                  const snapTime = new Date(snap.observedAt).getTime();
                  const matchingEvent = events.find(e =>
                    e.ticker === snap.ticker
                    && e.analystKey === snap.analystKey
                    && Math.abs(new Date(e.createdAt).getTime() - snapTime) < 60_000,
                  );
                  const firstSentence = (snap.reasoning || '').split(/(?<=[.!?])\s+/)[0]?.trim();
                  const synthesis = firstSentence || `Scored ${snap.ticker} at ${Math.round(snap.score)}.`;
                  const stance = matchingEvent?.direction ?? snap.signal;
                  const accent = stanceColor(stance);
                  return (
                    <button
                      key={snap.id}
                      type="button"
                      onClick={() => setSelection(`quant:${snap.analystKey}`)}
                      className={cn(
                        'w-full border-l-2 px-2 py-1.5 text-left transition',
                        selection === `quant:${snap.analystKey}` && 'bg-[#65d487]/[0.04]',
                      )}
                      style={{ borderLeftColor: accent }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[9px] text-[#c9d0d7]">
                          {snap.analystName.replace(' Analyst', '')} ·{' '}
                          <span style={{ color: accent }}>{snap.ticker}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[8px] text-[#697480]">
                          {formatAge(snap.observedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-[14px] text-[#aeb6bf]">
                        {synthesis}
                      </p>
                      <p className="mt-1 line-clamp-1 font-mono text-[8px] text-[#65717c]">
                        {matchingEvent
                          ? `↳ ${matchingEvent.summary}`
                          : `score ${Math.round(snap.score)} · ${snap.signal} · conf ${Math.round((snap.confidence ?? 0) * 100)}%`}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="border-b border-[#252c34] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#d8dde3]">Signal handoffs</h3>
                <span className="text-[10px] text-[#727d88]">{events.length} events</span>
              </div>
              <div className="mt-3 space-y-3">
                {events.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[#697480]">No score-change events yet.</p>
                ) : events.slice(0, 6).map(event => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelection(`quant:${event.analystKey}`)}
                    className="grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-2 text-left"
                  >
                    <span className="mt-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: event.shouldEscalate ? '#f26d6d' : '#e6b84d' }} />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] text-[#c9d0d7]">{event.ticker} · {event.analystName}</span>
                      <span className="mt-0.5 block line-clamp-2 text-[10px] text-[#697480]">{event.summary}</span>
                    </span>
                    <span className="pt-0.5 font-mono text-[9px] text-[#697480]">{formatAge(event.createdAt)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#d8dde3]">Latest output</h3>
                {(selectedVisibleSnapshot || selectedSeniorSignal) ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#65d487]">
                    <CheckCircle2 className="h-3 w-3" />
                    Persisted
                  </span>
                ) : null}
              </div>

              {selectedAnalyst && selectedVisibleSnapshot ? (
                <div className="mt-3">
                  <ScoutOutputCard
                    snapshot={selectedVisibleSnapshot}
                    event={selectedEvent}
                    recentSnapshots={recentForSelected}
                    inspectorHref={scoutInspectorHref}
                  />
                </div>
              ) : selectedSenior ? (
                <div className="mt-3">
                  <SeniorOutputCard
                    senior={selectedSenior}
                    signal={selectedSeniorSignal}
                    decision={committeeActive ? committeeDecision : undefined}
                    consensus={committeeActive ? committeeConsensus : undefined}
                    age={committeeActive ? committeeAge : 'Standby'}
                    inspectorHref={committeeInspectorHref}
                  />
                </div>
              ) : (
                <div className="mt-3 border border-dashed border-[#303842] px-4 py-8 text-center">
                  <Clock3 className="mx-auto h-5 w-5 text-[#606b76]" />
                  <p className="mt-2 text-xs text-[#8d97a2]">
                    {loading ? 'Loading agent activity…' : 'No output recorded for this agent.'}
                  </p>
                </div>
              )}

              {error ? (
                <div className="mt-3 flex items-start gap-2 border border-red-500/30 bg-red-500/5 p-3 text-[10px] text-red-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-[var(--cb-text-muted)]">
        Pixel artwork adapted from Pixel Agents under the MIT License. Scores and assignments are persisted; floor movement visualizes the live scout rotation.
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

        .agent-office-sprite--compact {
          width: 24px;
          height: 48px;
          background-size: 168px 144px;
        }

        .agent-office-sprite--typing {
          animation: agent-office-typing 0.75s steps(1) infinite;
        }

        .agent-office-sprite--reading {
          animation: agent-office-reading 1s steps(1) infinite;
        }

        .agent-office-sprite--walking {
          animation: agent-office-walking 0.55s steps(1) infinite;
        }

        .agent-office-sprite--compact.agent-office-sprite--typing {
          animation-name: agent-office-typing-compact;
        }

        .agent-office-sprite--compact.agent-office-sprite--reading {
          animation-name: agent-office-reading-compact;
        }

        .agent-office-runner--handoff {
          animation: agent-office-handoff 2.6s ease-in-out infinite;
        }

        .agent-office-scout__sprite {
          filter: drop-shadow(0 4px 2px rgba(0, 0, 0, 0.4));
        }

        .agent-office-scout--selected .agent-office-scout__sprite {
          filter:
            drop-shadow(0 4px 2px rgba(0, 0, 0, 0.45))
            drop-shadow(0 0 5px rgba(101, 212, 135, 0.95));
        }

        @keyframes agent-office-walking {
          0%, 32% { background-position: 0 0; }
          33%, 65% { background-position: -48px 0; }
          66%, 100% { background-position: -96px 0; }
        }

        @keyframes agent-office-typing {
          0%, 49% { background-position: -144px 0; }
          50%, 100% { background-position: -192px 0; }
        }

        @keyframes agent-office-reading {
          0%, 49% { background-position: -240px 0; }
          50%, 100% { background-position: -288px 0; }
        }

        @keyframes agent-office-typing-compact {
          0%, 49% { background-position: -72px 0; }
          50%, 100% { background-position: -96px 0; }
        }

        @keyframes agent-office-reading-compact {
          0%, 49% { background-position: -120px 0; }
          50%, 100% { background-position: -144px 0; }
        }

        @keyframes agent-office-handoff {
          0%, 12% { transform: translate(-70px, -50%); }
          45%, 58% { transform: translate(-50%, -50%); }
          88%, 100% { transform: translate(20px, -50%); }
        }

        @media (prefers-reduced-motion: reduce) {
          .agent-office-sprite--typing,
          .agent-office-sprite--reading,
          .agent-office-sprite--walking,
          .agent-office-runner--handoff {
            animation: none;
          }
          .agent-office-scout {
            transition: none;
          }
          .agent-office-sprite--typing { background-position: -144px 0; }
          .agent-office-sprite--reading { background-position: -240px 0; }
          .agent-office-sprite--walking { background-position: 0 0; }
          .agent-office-sprite--compact.agent-office-sprite--typing { background-position: -72px 0; }
          .agent-office-sprite--compact.agent-office-sprite--reading { background-position: -120px 0; }
        }
      `}</style>
    </div>
  );
}

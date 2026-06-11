'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

type AgentStatus = 'working' | 'reviewing' | 'idle' | 'needs_attention';
type StatusFilter = 'all' | 'active' | 'attention' | 'idle';
type Selection = `quant:${QuantAnalystKey}` | `senior:${string}`;
type ScoutLocation = 'desk' | 'company_queue' | 'research_wall' | 'pm_inbox';

type AnalystDefinition = {
  key: QuantAnalystKey;
  name: string;
  palette: number;
  domain: string;
};

type SeniorDefinition = {
  key: string;
  name: string;
  palette: number;
  lens: string;
};

type SeniorSignal = {
  key?: string;
  name?: string;
  signal?: 'bullish' | 'bearish' | 'neutral';
  confidence?: number;
  reasoning?: string;
  thesis?: string;
};

const ANALYSTS: AnalystDefinition[] = [
  { key: 'fundamentals', name: 'Fundamentals Analyst', palette: 0, domain: 'Financial quality and cash-flow durability' },
  { key: 'growth', name: 'Growth Analyst', palette: 1, domain: 'Revenue acceleration and market expansion' },
  { key: 'news_sentiment', name: 'News Sentiment Analyst', palette: 2, domain: 'Headlines, revisions, and catalyst flow' },
  { key: 'sentiment', name: 'Sentiment Analyst', palette: 3, domain: 'Positioning, options, and institutional behavior' },
  { key: 'technicals', name: 'Technical Analyst', palette: 4, domain: 'Trend, momentum, volume, and structure' },
  { key: 'valuation', name: 'Valuation Analyst', palette: 5, domain: 'Intrinsic value and multiple extension' },
];

const SENIORS: SeniorDefinition[] = [
  { key: 'warren_buffett', name: 'Warren Buffett', palette: 0, lens: 'Moat and compounding' },
  { key: 'charlie_munger', name: 'Charlie Munger', palette: 1, lens: 'Quality and mental models' },
  { key: 'ben_graham', name: 'Ben Graham', palette: 2, lens: 'Margin of safety' },
  { key: 'peter_lynch', name: 'Peter Lynch', palette: 3, lens: 'Growth at a reasonable price' },
  { key: 'nassim_taleb', name: 'Nassim Taleb', palette: 4, lens: 'Fragility and tail risk' },
  { key: 'michael_burry', name: 'Michael Burry', palette: 5, lens: 'Contrarian asymmetry' },
  { key: 'cathie_wood', name: 'Cathie Wood', palette: 0, lens: 'Disruptive innovation' },
  { key: 'aswath_damodaran', name: 'Aswath Damodaran', palette: 1, lens: 'Narrative and valuation' },
  { key: 'stanley_druckenmiller', name: 'Stanley Druckenmiller', palette: 2, lens: 'Macro and momentum' },
  { key: 'bill_ackman', name: 'Bill Ackman', palette: 3, lens: 'Concentrated quality' },
  { key: 'phil_fisher', name: 'Phil Fisher', palette: 4, lens: 'Management and durability' },
  { key: 'mohnish_pabrai', name: 'Mohnish Pabrai', palette: 5, lens: 'Low-risk asymmetry' },
  { key: 'rakesh_jhunjhunwala', name: 'Rakesh Jhunjhunwala', palette: 0, lens: 'Structural growth' },
];

const STATUS_LABELS: Record<AgentStatus, string> = {
  working: 'Scanning',
  reviewing: 'Reviewing',
  idle: 'Idle',
  needs_attention: 'Escalating',
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  working: '#65d487',
  reviewing: '#e6b84d',
  idle: '#8a929d',
  needs_attention: '#f26d6d',
};

const ROTATION_SECONDS = 5;
const ROTATION_ROUTE: ScoutLocation[] = ['desk', 'company_queue', 'research_wall', 'pm_inbox'];
const LOCATION_LABELS: Record<ScoutLocation, string> = {
  desk: 'Analyst desk',
  company_queue: 'Company queue',
  research_wall: 'Research wall',
  pm_inbox: 'PM inbox',
};
const DESK_POSITIONS = [
  { x: 16, y: 30 },
  { x: 50, y: 30 },
  { x: 84, y: 30 },
  { x: 16, y: 76 },
  { x: 50, y: 76 },
  { x: 84, y: 76 },
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

function ageInMs(value: string | undefined, now: number): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
}

function formatAge(value: string | undefined): string {
  if (!value) return 'No runs yet';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return 'Unknown';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

function stanceColor(stance: string | undefined): string {
  if (stance === 'bullish') return '#65d487';
  if (stance === 'bearish') return '#f26d6d';
  if (stance === 'mixed') return '#e6b84d';
  return '#a7afb9';
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
  onSelect: () => void;
}) {
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
      style={{ left: `${position.x}%`, top: `${position.y}%`, transitionDuration: '1400ms' }}
      aria-label={`${analyst.name} covering ${ticker}${bookSize > 0 ? `, portfolio position ${bookIndex + 1} of ${bookSize}` : ''}, at ${LOCATION_LABELS[location]}, moving next to ${LOCATION_LABELS[nextLocation]}`}
      title={`${analyst.name} · ${ticker}${bookSize > 0 ? ` ${bookIndex + 1}/${bookSize}` : ''} · ${LOCATION_LABELS[location]} → ${LOCATION_LABELS[nextLocation]}`}
    >
      <span className="agent-office-scout__sprite">
        <AgentSprite palette={analyst.palette} status={status} moving={moving} />
      </span>
      <span className="max-w-24 truncate border border-[#303942] bg-[#10161b]/95 px-1.5 py-0.5 font-mono text-[7px] text-[#d9dfe5] shadow-md">
        {ticker} · {bookSize > 0 ? `${bookIndex + 1}/${bookSize}` : 'queue'}
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

function ScoreBar({ score }: { score: number }) {
  const color = score >= 60 ? '#65d487' : score <= 40 ? '#f26d6d' : '#e6b84d';
  return (
    <div className="h-1.5 overflow-hidden bg-[#252d35]">
      <div className="h-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: color }} />
    </div>
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
  const [rotationClock, setRotationClock] = useState(0);

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
    const rotation = window.setInterval(() => setRotationClock(current => current + 1), 1_000);
    return () => {
      window.clearInterval(polling);
      window.clearInterval(clock);
      window.clearInterval(rotation);
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

  const rotationStep = Math.floor(rotationClock / ROTATION_SECONDS);
  const rotationCountdown = ROTATION_SECONDS - (rotationClock % ROTATION_SECONDS);
  const scoutRotations = useMemo(() => ANALYSTS.map((analyst, index) => {
    const event = latestEventByAnalyst.get(analyst.key);
    const routeIndex = (rotationStep + index) % ROTATION_ROUTE.length;
    const normalLocation = ROTATION_ROUTE[routeIndex];
    const location: ScoutLocation = event?.status === 'escalated' && event.shouldEscalate
      ? 'pm_inbox'
      : normalLocation;
    const nextLocation = location === 'pm_inbox' && event?.status === 'escalated'
      ? 'pm_inbox'
      : ROTATION_ROUTE[(routeIndex + 1) % ROTATION_ROUTE.length];
    const snapshot = latestSnapshotByAnalyst.get(analyst.key);
    const tickerPool = portfolioTickers.length > 0
      ? portfolioTickers
      : snapshot?.ticker ? [snapshot.ticker] : [];
    const bookIndex = tickerPool.length > 0 ? (rotationStep + index) % tickerPool.length : 0;
    const ticker = monitoringTicker ?? (tickerPool[bookIndex] ?? 'QUEUE');
    const status = monitoringTicker && !snapshot
      ? 'working'
      : statusForAnalyst(snapshot, event, now);
    return {
      analyst,
      status,
      location,
      nextLocation,
      ticker,
      bookIndex: monitoringTicker
        ? Math.max(0, tickerPool.indexOf(monitoringTicker))
        : bookIndex,
      bookSize: tickerPool.length,
      position: scoutPosition(location, index),
      moving: rotationClock % ROTATION_SECONDS <= 1,
    };
  }), [
    latestEventByAnalyst,
    latestSnapshotByAnalyst,
    monitoringTicker,
    now,
    portfolioTickers,
    rotationClock,
    rotationStep,
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

  const detailOutput = selectedAnalyst
    ? {
        latestScore: selectedVisibleSnapshot ?? null,
        latestSignalEvent: selectedEvent ?? null,
      }
    : {
        committee: latestCommitteeView?.rawOutput ?? null,
        selectedInvestor: selectedSeniorSignal ?? null,
      };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
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
                : monitoringTicker
                  ? `Six scouts scanning ${monitoringTicker}`
                : committeeActive
                  ? `Committee reviewing ${committeeTicker ?? 'an escalation'}`
                  : attentionCount > 0
                    ? `${attentionCount} signal${attentionCount === 1 ? '' : 's'} escalating`
                    : 'Scouts monitoring normally'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--cb-text-muted)]">
            Quant scouts monitor continuously. Senior investors convene only when the PM escalates a signal.
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
              className="relative min-h-[720px] overflow-x-auto p-4"
              style={{
                backgroundColor: '#24292f',
                backgroundImage: 'linear-gradient(rgba(11,14,18,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(11,14,18,0.18) 1px, transparent 1px), url(/pixel-agents/assets/floors/floor_6.png)',
                backgroundSize: '32px 32px, 32px 32px, 32px 32px',
                imageRendering: 'pixelated',
              }}
            >
              <div className="pointer-events-none absolute inset-3 border-[6px] border-[#171c22] shadow-[inset_0_0_0_2px_#3b424a]" />

              <div className="relative z-10 mx-auto grid min-h-[680px] min-w-[920px] grid-cols-[minmax(0,1fr)_88px_330px]">
                <section className="relative border-r-[6px] border-[#171c22] px-3 pb-3 pt-10">
                  <div className="absolute left-4 top-3 flex items-center gap-2 bg-[#10151a]/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f98a3]">
                    <Bot className="h-3 w-3 text-[#65d487]" />
                    Monitoring floor
                  </div>
                  <div className="pointer-events-none absolute inset-0 z-20">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 border border-[#3b4650] bg-[#12181e]/95 px-1.5 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-[#8da2b3] [writing-mode:vertical-rl]">
                      Research wall
                    </span>
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-[#4b5948] bg-[#152019]/95 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-[#79c98f]">
                      Company queue
                    </span>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 border border-[#5e4d32] bg-[#211b13]/95 px-1.5 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-[#d8ae5b] [writing-mode:vertical-rl]">
                      PM inbox
                    </span>
                  </div>
                  <div className="grid min-h-[610px] grid-cols-3 gap-1">
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
                >
                  <div className="absolute left-4 top-3 flex items-center gap-2 bg-[#10151a]/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f98a3]">
                    <Users className={cn('h-3 w-3', committeeActive ? 'text-[#e6b84d]' : 'text-[#8a929d]')} />
                    Senior committee
                  </div>
                  <div className="absolute right-4 top-3 font-mono text-[8px]" style={{ color: committeeActive ? '#e6b84d' : '#8a929d' }}>
                    {committeeActive ? `IN SESSION · ${committeeTicker ?? ''}` : 'STANDBY'}
                  </div>

                  <div className="relative mx-auto mt-4 min-h-[570px] max-w-[300px] border-[4px] border-[#151a20] bg-[#20262d]/75 p-3 shadow-[inset_0_0_0_2px_#414952]">
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
                  <dt className="text-[#7d8792]">Location</dt>
                  <dd data-testid="selected-scout-location" className="font-mono text-[#d2d7dd]">
                    {selectedRotation ? LOCATION_LABELS[selectedRotation.location] : '—'}
                  </dd>
                  <dt className="text-[#7d8792]">Next move</dt>
                  <dd data-testid="selected-scout-next-move" className="font-mono text-[#d2d7dd]">
                    {selectedRotation
                      ? `${LOCATION_LABELS[selectedRotation.nextLocation]} · ${rotationCountdown}s`
                      : '—'}
                  </dd>
                  <dt className="text-[#7d8792]">Book rotation</dt>
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
                <h3 className="text-xs font-medium text-[#d8dde3]">Scout rotation</h3>
                <span className="font-mono text-[9px] text-[#65d487]">
                  Move in {rotationCountdown}s
                </span>
              </div>
              <p className="mt-1 text-[9px] leading-4 text-[#697480]">
                Desk → company queue → research wall → PM inbox. Ticker assignments rotate across the active book.
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
                      <span className="block truncate font-mono text-[8px] text-[#9fa9b3]">
                        {LOCATION_LABELS[rotation.location]}
                      </span>
                      <span className="block truncate font-mono text-[7px] text-[#65717c]">
                        Next: {LOCATION_LABELS[rotation.nextLocation]}
                      </span>
                    </span>
                    <span className="border border-[#344039] bg-[#152019] px-1.5 py-0.5 font-mono text-[8px] text-[#65d487]">
                      {rotation.ticker} · {rotation.bookSize > 0 ? `${rotation.bookIndex + 1}/${rotation.bookSize}` : 'queue'}
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

              {(selectedVisibleSnapshot || selectedSeniorSignal) ? (
                <pre className="mt-3 max-h-56 overflow-auto border border-[#2d353e] bg-[#0b1015] p-3 font-mono text-[9px] leading-4 text-[#8fce8f]">
                  {JSON.stringify(detailOutput, null, 2)}
                </pre>
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

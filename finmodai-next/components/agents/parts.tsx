'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import type {
  QuantAnalystKey,
  QuantScoreSnapshot,
  QuantSignalEvent,
} from '@/lib/pm/monitoring/types';
import { cn } from '@/lib/utils';

export type AgentStatus = 'working' | 'reviewing' | 'idle' | 'needs_attention';

export type AnalystDefinition = {
  key: QuantAnalystKey;
  name: string;
  palette: number;
  domain: string;
};

export type SeniorDefinition = {
  key: string;
  name: string;
  palette: number;
  lens: string;
};

export type SeniorSignal = {
  key?: string;
  name?: string;
  signal?: 'bullish' | 'bearish' | 'neutral';
  confidence?: number;
  reasoning?: string;
  thesis?: string;
};

export type CommitteeDecision = {
  action?: string;
  confidence?: number;
  reasoning?: string;
  sizing?: string;
};

export type CommitteeConsensus = {
  bullish?: number;
  bearish?: number;
  neutral?: number;
};

export const ANALYSTS: AnalystDefinition[] = [
  { key: 'fundamentals', name: 'Fundamentals Analyst', palette: 0, domain: 'Financial quality and cash-flow durability' },
  { key: 'growth', name: 'Growth Analyst', palette: 1, domain: 'Revenue acceleration and market expansion' },
  { key: 'news_sentiment', name: 'News Sentiment Analyst', palette: 2, domain: 'Headlines, revisions, and catalyst flow' },
  { key: 'sentiment', name: 'Sentiment Analyst', palette: 3, domain: 'Positioning, options, and institutional behavior' },
  { key: 'technicals', name: 'Technical Analyst', palette: 4, domain: 'Trend, momentum, volume, and structure' },
  { key: 'valuation', name: 'Valuation Analyst', palette: 5, domain: 'Intrinsic value and multiple extension' },
];

export const SENIORS: SeniorDefinition[] = [
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

export const DESK_VERB: Record<QuantAnalystKey, string> = {
  fundamentals: 'Modeling',
  growth: 'Forecasting',
  news_sentiment: 'Reading',
  sentiment: 'Mapping flow on',
  technicals: 'Charting',
  valuation: 'Valuing',
};

export const STATUS_LABELS: Record<AgentStatus, string> = {
  working: 'Scanning',
  reviewing: 'Reviewing',
  idle: 'Idle',
  needs_attention: 'Escalating',
};

export const STATUS_COLORS: Record<AgentStatus, string> = {
  working: '#65d487',
  reviewing: '#e6b84d',
  idle: '#8a929d',
  needs_attention: '#f26d6d',
};

export function ageInMs(value: string | undefined, now: number): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
}

export function formatAge(value: string | undefined): string {
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

export function stanceColor(stance: string | undefined): string {
  if (stance === 'bullish') return '#65d487';
  if (stance === 'bearish') return '#f26d6d';
  if (stance === 'mixed') return '#e6b84d';
  return '#a7afb9';
}

export function scoreBandColor(score: number): string {
  return score >= 60 ? '#65d487' : score <= 40 ? '#f26d6d' : '#e6b84d';
}

export function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 overflow-hidden bg-[#252d35]">
      <div
        className="h-full transition-[width]"
        style={{ width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: scoreBandColor(score) }}
      />
    </div>
  );
}

export function StaticSprite({
  palette,
  pose = 'typing',
  compact = false,
}: {
  palette: number;
  pose?: 'walking' | 'typing' | 'reading';
  compact?: boolean;
}) {
  const offsets = { walking: 0, typing: -144, reading: -240 };
  const offset = compact ? offsets[pose] / 2 : offsets[pose];
  const size = compact
    ? { width: 24, height: 48, bg: '168px 144px' }
    : { width: 48, height: 96, bg: '336px 288px' };
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width: size.width,
        height: size.height,
        backgroundImage: `url(/pixel-agents/assets/characters/char_${palette}.png)`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: size.bg,
        backgroundPosition: `${offset}px 0`,
        imageRendering: 'pixelated',
      }}
    />
  );
}

// ---------- Cards ----------

export function ScoutOutputCard({
  snapshot,
  event,
  recentSnapshots,
  inspectorHref,
}: {
  snapshot: QuantScoreSnapshot;
  event?: QuantSignalEvent;
  recentSnapshots?: QuantScoreSnapshot[];
  inspectorHref?: string;
}) {
  const analyst = ANALYSTS.find(a => a.key === snapshot.analystKey);
  const stance = event?.direction ?? snapshot.signal;
  const accent = stanceColor(stance);

  return (
    <div className="border border-[#252c34] bg-[#0b1015] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase tracking-wide text-[#7d8792]">
            {analyst?.domain ?? snapshot.analystName}
          </p>
          <h4 className="mt-0.5 truncate text-sm font-medium text-white">
            {analyst?.name ?? snapshot.analystName}
            <span className="mx-1.5 text-[#3b424a]">·</span>
            <span className="font-mono" style={{ color: accent }}>{snapshot.ticker}</span>
          </h4>
        </div>
        <span className="shrink-0 font-mono text-[9px] text-[#727d88]">{formatAge(snapshot.observedAt)}</span>
      </header>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold text-white">{Math.round(snapshot.score)}</span>
        <span className="font-mono text-[10px] text-[#7d8792]">/ 100</span>
        <span
          className="ml-auto rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wide"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {snapshot.signal}
        </span>
        <span className="font-mono text-[10px] text-[#9aa4ae]">conf {Math.round(snapshot.confidence)}%</span>
      </div>
      <div className="mt-2"><ScoreBar score={snapshot.score} /></div>
      {snapshot.scoreComponents ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-[#7d8792]">
          <span>LLM {snapshot.scoreComponents.llmScore} × {Math.round(snapshot.scoreComponents.llmWeight * 100)}%</span>
          <span>
            Numeric {snapshot.scoreComponents.deterministicScore ?? 'n/a'} × {Math.round(snapshot.scoreComponents.deterministicWeight * 100)}%
          </span>
          <span>coverage {Math.round(snapshot.scoreComponents.deterministicCoverage * 100)}%</span>
          {snapshot.scoreComponents.deterministicInputs.length > 0 ? (
            <span className="basis-full">
              inputs: {snapshot.scoreComponents.deterministicInputs.join(', ')}
            </span>
          ) : null}
        </div>
      ) : null}

      {event ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 pl-2 text-[11px]"
          style={{ borderColor: accent }}
        >
          <span className="font-mono text-[10px] text-[#9aa4ae]">
            {event.previousScore} → {event.currentScore}
          </span>
          <span className="font-mono text-[10px]" style={{ color: accent }}>
            {event.delta >= 0 ? '+' : ''}{event.delta} · {event.severity}
          </span>
          {event.stability ? (
            <span className="font-mono text-[10px] text-[#9aa4ae]">
              stability {event.stability.confirmations}/{event.stability.window}
            </span>
          ) : null}
          <span className="basis-full text-[10px] leading-4 text-[#c2cad3]">{event.summary}</span>
        </div>
      ) : null}

      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">Reasoning</p>
        <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#d2d7dd]">
          {snapshot.reasoning?.trim() || 'No reasoning provided.'}
        </p>
      </div>

      {snapshot.watch ? (
        <div className="mt-3 flex items-start gap-2 border border-[#252c34] bg-[#11171c] p-2">
          <Eye className="mt-0.5 h-3 w-3 shrink-0 text-[#65d487]" />
          <p className="text-[11px] leading-5 text-[#c2cad3]">{snapshot.watch}</p>
        </div>
      ) : null}

      {recentSnapshots && recentSnapshots.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">Recent scores</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {recentSnapshots.slice(0, 12).map(snap => {
              const color = scoreBandColor(snap.score);
              return (
                <span
                  key={snap.id}
                  title={`${snap.ticker} · ${Math.round(snap.score)} · ${formatAge(snap.observedAt)}`}
                  className="border px-1.5 py-0.5 font-mono text-[9px]"
                  style={{ borderColor: color, color }}
                >
                  {Math.round(snap.score)}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {inspectorHref ? (
        <Link
          href={inspectorHref}
          className="mt-3 inline-flex items-center gap-1 text-[10px] text-[#65d487] hover:text-[#85e3a3]"
        >
          → View full inspector
        </Link>
      ) : null}
    </div>
  );
}

export function ConsensusBar({ consensus }: { consensus: CommitteeConsensus | undefined }) {
  const bullish = consensus?.bullish ?? 0;
  const bearish = consensus?.bearish ?? 0;
  const neutral = consensus?.neutral ?? 0;
  const total = Math.max(1, bullish + bearish + neutral);
  return (
    <div className="space-y-1">
      <div className="flex h-2 w-full overflow-hidden border border-[#252c34]">
        <div style={{ width: `${(bullish / total) * 100}%`, backgroundColor: '#65d487' }} />
        <div style={{ width: `${(neutral / total) * 100}%`, backgroundColor: '#a7afb9' }} />
        <div style={{ width: `${(bearish / total) * 100}%`, backgroundColor: '#f26d6d' }} />
      </div>
      <div className="flex items-center justify-between font-mono text-[9px] text-[#9aa4ae]">
        <span className="text-[#65d487]">{bullish} bullish</span>
        <span>{neutral} neutral</span>
        <span className="text-[#f26d6d]">{bearish} bearish</span>
      </div>
    </div>
  );
}

export function SeniorOutputCard({
  senior,
  signal,
  decision,
  consensus,
  age,
  inspectorHref,
}: {
  senior: SeniorDefinition;
  signal?: SeniorSignal;
  decision?: CommitteeDecision;
  consensus?: CommitteeConsensus;
  age?: string;
  inspectorHref?: string;
}) {
  const stance = signal?.signal ?? 'neutral';
  const accent = stanceColor(stance);
  const decisionStance = decision?.action
    ? ['buy', 'add'].includes(decision.action.toLowerCase())
      ? 'bullish'
      : ['sell', 'trim', 'exit'].includes(decision.action.toLowerCase())
        ? 'bearish'
        : 'neutral'
    : 'neutral';
  const decisionColor = stanceColor(decisionStance);

  return (
    <div className="border border-[#252c34] bg-[#0b1015] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className="flex h-12 w-7 items-center justify-center border border-[#252c34] bg-[#161c22]">
            <StaticSprite palette={senior.palette} pose="reading" compact />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-wide text-[#7d8792]">{senior.lens}</p>
            <h4 className="mt-0.5 truncate text-sm font-medium text-white">{senior.name}</h4>
          </div>
        </div>
        <span className="shrink-0 font-mono text-[9px] text-[#727d88]">{age ?? 'Standby'}</span>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <span
          className="rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wide"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {stance}
        </span>
        {signal?.confidence != null ? (
          <span className="font-mono text-[10px] text-[#9aa4ae]">conf {signal.confidence}%</span>
        ) : (
          <span className="font-mono text-[10px] text-[#5b636c]">no committee read yet</span>
        )}
      </div>

      {signal?.thesis ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">Thesis</p>
          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#d2d7dd]">{signal.thesis}</p>
        </div>
      ) : null}

      {signal?.reasoning ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">Reasoning</p>
          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#d2d7dd]">{signal.reasoning}</p>
        </div>
      ) : null}

      {decision ? (
        <div className="mt-4 border-t border-[#252c34] pt-3">
          <p className="text-[10px] uppercase tracking-wide text-[#7d8792]">Committee decision</p>
          <p className="mt-1 text-xs text-white">
            <span className="font-semibold uppercase tracking-wide" style={{ color: decisionColor }}>
              {decision.action ?? 'n/a'}
            </span>
            {decision.confidence != null ? <span className="text-[#9aa4ae]"> · {decision.confidence}% conf</span> : null}
            {decision.sizing ? <span className="text-[#9aa4ae]"> · {decision.sizing}</span> : null}
          </p>
          {decision.reasoning ? (
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#aeb6bf]">{decision.reasoning}</p>
          ) : null}
          {consensus ? (
            <div className="mt-3">
              <ConsensusBar consensus={consensus} />
            </div>
          ) : null}
        </div>
      ) : null}

      {inspectorHref ? (
        <Link
          href={inspectorHref}
          className="mt-3 inline-flex items-center gap-1 text-[10px] text-[#65d487] hover:text-[#85e3a3]"
        >
          → View committee inspector
        </Link>
      ) : null}
    </div>
  );
}

// ---------- Empty states ----------

export function EmptyOutputCard({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-[#303842] bg-[#0a0f14] px-4 py-8 text-center">
      <p className={cn('text-xs text-[#8d97a2]')}>{title}</p>
      {hint ? <p className="mt-1 text-[10px] text-[#5b636c]">{hint}</p> : null}
    </div>
  );
}

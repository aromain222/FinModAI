'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, Loader2, Plus, Send, TrendingUp } from 'lucide-react';
import { PMDecisionStrip } from '@/components/ranking/PMDecisionStrip';
import { TradeStructurePanel } from '@/components/ranking/TradeStructurePanel';
import { ScenarioEngine } from '@/components/ranking/ScenarioEngine';
import { CatalystTimeline } from '@/components/ranking/CatalystTimeline';
import { DeepResearchPanel } from '@/components/ranking/DeepResearchPanel';
import { TradingAgentsPanel } from '@/components/ranking/TradingAgentsPanel';
import { DexterPanel } from '@/components/ranking/DexterPanel';
import { HedgeFundPanel } from '@/components/ranking/HedgeFundPanel';
import { ConvictionMeter, parseConvictionLevel } from '@/components/ranking/ConvictionMeter';
import { TradeReadinessStrip } from '@/components/ranking/TradeReadinessStrip';
import { getPitchQueue, upsertPitchQueueItem } from '@/lib/pitchQueue/storage';
import { buildPitchQueueItemFromRankedStock } from '@/lib/pitchQueue/buildPitch';
import {
  getActivePositions,
  addPosition,
  updatePositionThesis,
  PORTFOLIO_EVENT,
} from '@/lib/portfolio/storage';
import { buildPositionFromRankedStock } from '@/lib/portfolio/buildPosition';
import type { ActivePosition } from '@/lib/portfolio/types';
import type { RankedStock } from '@/lib/ranking/types';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import { buildValuationSignal } from '@/lib/valuation/signal';
import {
  type InvestmentMode, type ScoreFactor, SCORE_LABELS,
  capitalize, factorLabel, resolvedRisk, signalFromScore, contextPrompt, tradeReadiness,
} from '@/lib/ranking/chatHelpers';
import { cn } from '@/lib/utils';
import { PeerStock, buildSwingThesis, buildExplain, buildLocalReply, buildCompare, buildCatalystAgent, buildForecastAgent, buildAssumptionAgent, buildPitch, buildEvaluate, buildThesis, buildNeedsTrue, buildMonitor, buildBadTrade, buildScoreBacktest, expectedMoveStr, catalystContext, catalystDetailedContext, scoreBacktestContext, cryptoTapeContext, buildGeneralStockQuestion, looksLikeStockQuestion, buildMoveHigher, buildMarketMiss, buildNotBuyYet, buildEvidence } from '@/lib/ranking/chatBuilders';

type Message = {
  role:    'user' | 'assistant';
  content: string;
};

const STANDARD_PROMPTS: { label: string; mode: InvestmentMode; text: string }[] = [
  { label: 'Explain thesis',     mode: 'explain',   text: 'Why is this stock ranked here?' },
  { label: 'Evaluate risk',      mode: 'evaluate',  text: 'Should I buy, wait, or avoid?' },
  { label: 'Make the bear case', mode: 'challenge', text: 'Push back on the bull case.' },
  { label: 'Compare to peers',   mode: 'compare',   text: 'Compare against the other ranked stocks.' },
];

const NOTEBOOK_PROMPTS: { label: string; mode?: InvestmentMode; text: string }[] = [
  { label: 'Thesis', text: 'What is the thesis?' },
  { label: 'Needs true', text: 'What needs to be true for this to work?' },
  { label: 'Monitor', text: 'What should I monitor?' },
  { label: 'Breaks it', text: 'What would make this a bad trade?', mode: 'challenge' },
  { label: 'Pitch', text: 'Turn this into a pitch.', mode: 'pitch' },
];

const AGENT_PROMPTS: { label: string; mode?: InvestmentMode; text: string }[] = [
  { label: 'PM', text: 'Run the PM brain: why is this ranked here and what is the decision?' },
  { label: 'Catalyst', text: 'Run the catalyst agent: what events or headlines matter most over the next 1-3 months?' },
  { label: 'Forecast', text: 'Run the forecast agent: what does the forecast, momentum, and market tape imply?' },
  { label: 'Assumption', text: 'Show me the best assumption to test that would change the score and valuation.' },
  { label: 'Pitch', mode: 'pitch', text: 'Turn this into a pitch.' },
];

type Props = {
  stock: RankedStock | null;
  peers: PeerStock[];
  onStockUpdate?: (stock: RankedStock) => void;
};

type AssumptionUpdateResponse = {
  result?: {
    adjustedScore: number;
    delta: number;
    plausibility: 'high' | 'medium' | 'low' | 'extreme';
    factorDeltas: Partial<Record<keyof RankedStock['breakdown'], number>>;
    adjustedBreakdown: RankedStock['breakdown'];
    explanation: string;
    pushback: string | null;
  };
  financialImpact?: {
    beforeValuation: NonNullable<RankedStock['meta']['valuation']>;
    afterValuation: NonNullable<RankedStock['meta']['valuation']>;
    valuationGapDelta: number | null;
    expectedMoveDeltaPct: number;
    riskScoreBefore: number;
    riskScoreAfter: number;
    riskRead: string;
  };
  parsedClaim?: {
    direction: 'positive' | 'negative';
    primaryFactor: keyof RankedStock['breakdown'] | string;
  };
  error?: string;
};

type ScoreChange = {
  fromScore: number;
  toScore: number;
  delta: number;
  fromSignal: RankedStock['signal'];
  toSignal: RankedStock['signal'];
  factorDeltas: Partial<Record<ScoreFactor, number>>;
  primaryFactor: string;
  explanation: string;
};

function changedFactorTone(delta: number): string {
  if (delta > 0) return 'animate-pulse border-emerald-400/60 bg-emerald-500/15 shadow-[0_0_18px_rgba(52,211,153,0.16)]';
  if (delta < 0) return 'animate-pulse border-rose-400/60 bg-rose-500/15 shadow-[0_0_18px_rgba(251,113,133,0.16)]';
  return 'border-transparent';
}

function changedFactorSummary(factorDeltas: Partial<Record<ScoreFactor, number>>): string {
  return (Object.entries(factorDeltas) as Array<[ScoreFactor, number | undefined]>)
    .filter(([, delta]) => delta != null && Math.abs(delta) > 0)
    .map(([factor, delta]) => `${SCORE_LABELS[factor]} ${delta! > 0 ? '↑' : '↓'}`)
    .join(', ');
}

function scoreChangeExplanation(change: ScoreChange): string {
  const direction = change.delta >= 0 ? 'moved up' : 'moved down';
  const sign = change.delta >= 0 ? '+' : '';
  const changedFactors = (Object.entries(change.factorDeltas) as Array<[ScoreFactor, number | undefined]>)
    .filter(([, d]) => d != null && Math.abs(d) > 0.05)
    .sort((a, b) => Math.abs(b[1] ?? 0) - Math.abs(a[1] ?? 0))
    .map(([f]) => SCORE_LABELS[f]);
  const factorStr = changedFactors.length > 0
    ? changedFactors.join(' and ')
    : factorLabel(change.primaryFactor);
  const verb = change.delta >= 0 ? 'improved' : 'weakened';
  return `Score ${direction} ${sign}${change.delta.toFixed(1)} because ${factorStr} ${verb}.`;
}

function buildAssumptionReply(stock: RankedStock, payload: AssumptionUpdateResponse): string {
  const result = payload.result;
  if (!result) {
    return buildSwingThesis(stock, {
      bullCase: stock.primaryReason,
      risk:     'Assumption was not specific enough to map to a scoring factor — ranking unchanged.',
    });
  }

  const fromScore     = result.adjustedScore - result.delta;
  const primaryFactor = payload.parsedClaim?.primaryFactor
    ? factorLabel(payload.parsedClaim.primaryFactor)
    : 'the setup';
  const factorMoves = (Object.entries(result.factorDeltas) as Array<[keyof RankedStock['breakdown'], number]>)
    .filter(([, delta]) => Math.abs(delta) > 0)
    .map(([factor, delta]) => `${SCORE_LABELS[factor]} ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`)
    .join(', ');
  const beforeValuation = stock.meta.valuation ?? buildValuationSignal({
    ticker: stock.ticker,
    forecastReturnPct: stock.meta.forecastReturnPct,
    factorBreakdown:   stock.breakdown,
  });
  const afterValuation = payload.financialImpact?.afterValuation ?? buildValuationSignal({
    ticker: stock.ticker,
    forecastReturnPct: stock.meta.forecastReturnPct,
    factorBreakdown:   result.adjustedBreakdown,
  });
  const valuationGapDelta = payload.financialImpact?.valuationGapDelta;
  const valuationLine = payload.financialImpact
    ? `Valuation gap ${beforeValuation.impliedUpside != null && beforeValuation.impliedUpside >= 0 ? '+' : ''}${beforeValuation.impliedUpside?.toFixed(1) ?? 'n/a'}% → ${afterValuation.impliedUpside != null && afterValuation.impliedUpside >= 0 ? '+' : ''}${afterValuation.impliedUpside?.toFixed(1) ?? 'n/a'}%${valuationGapDelta != null ? ` (${valuationGapDelta >= 0 ? '+' : ''}${valuationGapDelta.toFixed(1)} pts)` : ''}; expected move ${payload.financialImpact.expectedMoveDeltaPct >= 0 ? '+' : ''}${payload.financialImpact.expectedMoveDeltaPct.toFixed(1)}%.`
    : beforeValuation.impliedUpside != null && afterValuation.impliedUpside != null
    ? `Valuation gap ${beforeValuation.impliedUpside >= 0 ? '+' : ''}${beforeValuation.impliedUpside.toFixed(1)}% → ${afterValuation.impliedUpside >= 0 ? '+' : ''}${afterValuation.impliedUpside.toFixed(1)}%.`
    : '';

  const updatedStock: RankedStock = {
    ...stock,
    score:     result.adjustedScore,
    signal:    signalFromScore(result.adjustedScore),
    breakdown: result.adjustedBreakdown,
  };
  return buildSwingThesis(updatedStock, {
    bullCase: `${primaryFactor}${factorMoves ? ` (${factorMoves})` : ''} drove score from ${fromScore.toFixed(1)} → ${result.adjustedScore.toFixed(1)} (${capitalize(result.plausibility)} plausibility).${valuationLine ? ` ${valuationLine}` : ''}`,
    risk:     result.pushback ?? stock.mainRisk,
  });
}

function buildInputErrorReply(stock: RankedStock, reason: string): string {
  return buildSwingThesis(stock, {
    bullCase: stock.primaryReason,
    risk:     reason,
  });
}

function buildPositionEvolution(stock: RankedStock, position: ActivePosition): string {
  const daysSince = Math.floor((Date.now() - new Date(position.entryDate).getTime()) / 86400000);
  const pctChange = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const dollarPnL = typeof position.notionalUsd === 'number' && Number.isFinite(position.notionalUsd)
    ? position.notionalUsd * (pctChange / 100)
    : null;
  const scoreDelta = position.currentScore - position.entryScore;
  const recentEvents = position.timeline.slice(-3).reverse();
  const eventStr = recentEvents.length > 0
    ? '\n\nTimeline:\n' + recentEvents.map(e =>
        `  ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → ${e.description}`
      ).join('\n')
    : '';
  return [
    `Position: ${stock.ticker} (${daysSince}d open)`,
    `P&L: ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%${dollarPnL !== null ? ` (${dollarPnL >= 0 ? '+' : ''}$${Math.round(dollarPnL).toLocaleString('en-US')})` : ''} · Entry: $${position.entryPrice.toFixed(2)} · Current: $${position.currentPrice.toFixed(2)}${position.notionalUsd ? ` · Amount: $${Math.round(position.notionalUsd).toLocaleString('en-US')}` : ''}`,
    `Score: ${position.entryScore.toFixed(1)} → ${position.currentScore.toFixed(1)} (${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}) · Drift: ${capitalize(position.thesisDrift)}`,
    `Stance: ${position.currentStance}`,
    `Next: ${position.nextCatalyst}`,
    `Risk: ${position.keyRisks}`,
  ].join('\n') + eventStr;
}

function buildPositionChanges(stock: RankedStock, position: ActivePosition): string {
  const scoreDelta    = position.currentScore - position.entryScore;
  const recentEvents  = position.timeline.slice(-5).reverse();
  const eventStr = recentEvents.map(e =>
    `  ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → ${e.description}`
  ).join('\n');
  return [
    `Changes since entry — ${stock.ticker}`,
    `Score: ${position.entryScore.toFixed(1)} → ${position.currentScore.toFixed(1)} (${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}) · Drift: ${capitalize(position.thesisDrift)}`,
    `Thesis: ${position.thesisSummary}`,
    '',
    'Timeline:',
    eventStr || '  No logged updates yet.',
  ].join('\n');
}

function buildHoldDecision(stock: RankedStock, position: ActivePosition): string {
  const scoreDelta = position.currentScore - position.entryScore;
  let rec: string;
  if (position.thesisDrift === 'strengthening' || scoreDelta > 0.5) {
    rec = 'Hold and consider adding — thesis is strengthening.';
  } else if (position.thesisDrift === 'weakening' || scoreDelta < -1.0) {
    rec = 'Consider trimming — thesis drift is negative.';
  } else {
    rec = 'Hold — thesis is stable; no action needed yet.';
  }
  return buildSwingThesis(stock, {
    bullCase:  `${rec} ${stock.primaryReason}`,
    risk:      position.keyRisks,
    tradeView: `${position.currentStance} — entered $${position.entryPrice.toFixed(2)}`,
  });
}

function buildWhatMattersNext(stock: RankedStock, position: ActivePosition): string {
  const watchStr = position.watchItems.length > 0 ? position.watchItems.join(', ') : undefined;
  return buildSwingThesis(stock, {
    bullCase:        stock.primaryReason,
    keyCatalyst:     position.nextCatalyst,
    whatMattersMost: watchStr ? `Watch: ${watchStr}` : undefined,
    risk:            position.keyRisks,
  });
}

function isStrongerThesis(stock: RankedStock, position: ActivePosition): boolean {
  return position.thesisDrift === 'strengthening' || stock.score > position.entryScore + 0.5;
}

function buildThesisStrength(stock: RankedStock, position: ActivePosition): string {
  const scoreDelta = position.currentScore - position.entryScore;
  const stronger   = isStrongerThesis(stock, position);
  return buildSwingThesis(stock, {
    bullCase: stronger
      ? `Thesis is strengthening. Score moved ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)} since entry. ${stock.primaryReason}`
      : `Thesis is ${position.thesisDrift}. Score: ${position.entryScore.toFixed(1)} → ${position.currentScore.toFixed(1)}. Monitor closely.`,
    risk:      position.keyRisks,
    tradeView: `${position.currentStance} — entered $${position.entryPrice.toFixed(2)}`,
  });
}

function looksLikeAssumptionUpdate(text: string): boolean {
  return /\b(i think|i believe|i assume|assuming|assume|what if|because|my view|my assumption|stronger than|weaker than|beats?|misses?)\b/i.test(text);
}

export function InvestmentChat({ stock, peers, onStockUpdate }: Props) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [scoreChange, setScoreChange] = useState<ScoreChange | null>(null);
  const [displayedScore, setDisplayedScore] = useState(stock?.score ?? 0);
  const [queued,     setQueued]     = useState(false);
  const [isInQueue,  setIsInQueue]  = useState(false);
  const [currentPosition,   setCurrentPosition]   = useState<ActivePosition | null>(null);
  const [showEnterForm,     setShowEnterForm]     = useState(false);
  const [entryPriceInput,   setEntryPriceInput]   = useState('');
  const [positionAmountInput, setPositionAmountInput] = useState('');
  const [positionConfirmed, setPositionConfirmed] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<{ action: string; bullish: number; bearish: number; neutral: number; confidence: number } | null>(null);
  const [panelTab, setPanelTab] = useState<'analysis' | 'agents' | 'chat'>('chat');
  const scrollRef         = useRef<HTMLDivElement>(null);
  const abortRef          = useRef<AbortController | null>(null);
  const prevTicker        = useRef<string | null>(null);
  const scoreAnimationRef = useRef<number | null>(null);
  const clearScoreRef     = useRef<number | null>(null);
  const queuedTimeoutRef  = useRef<number | null>(null);
  const positionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (stock?.ticker !== prevTicker.current) {
      abortRef.current?.abort();
      if (clearScoreRef.current    !== null) { window.clearTimeout(clearScoreRef.current);    clearScoreRef.current    = null; }
      if (queuedTimeoutRef.current !== null) { window.clearTimeout(queuedTimeoutRef.current); queuedTimeoutRef.current = null; }
      if (positionTimeoutRef.current !== null) { window.clearTimeout(positionTimeoutRef.current); positionTimeoutRef.current = null; }
      setMessages(stock ? [
        { role: 'user', content: "Here's why this stock is ranked here..." },
        { role: 'assistant', content: buildExplain(stock) },
      ] : []);
      setInput('');
      setStreaming(false);
      setScoreChange(null);
      setQueued(false);
      setIsInQueue(stock ? getPitchQueue().some(item => item.ticker === stock.ticker) : false);
      setDisplayedScore(stock?.score ?? 0);
      setShowEnterForm(false);
      setEntryPriceInput('');
      setPositionAmountInput('');
      setPositionConfirmed(false);
      setAiVerdict(null);
      setPanelTab('chat');
      setCurrentPosition(
        stock ? (getActivePositions().find(p => p.ticker === stock.ticker) ?? null) : null,
      );
      prevTicker.current = stock?.ticker ?? null;
    }
  }, [stock]);

  useEffect(() => {
    return () => {
      if (scoreAnimationRef.current  !== null) cancelAnimationFrame(scoreAnimationRef.current);
      if (clearScoreRef.current      !== null) window.clearTimeout(clearScoreRef.current);
      if (queuedTimeoutRef.current   !== null) window.clearTimeout(queuedTimeoutRef.current);
      if (positionTimeoutRef.current !== null) window.clearTimeout(positionTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!scoreChange) {
      setDisplayedScore(stock?.score ?? 0);
      return;
    }

    if (scoreAnimationRef.current !== null) cancelAnimationFrame(scoreAnimationRef.current);
    const startedAt = performance.now();
    const durationMs = 700;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const next = scoreChange.fromScore + (scoreChange.toScore - scoreChange.fromScore) * eased;
      setDisplayedScore(Math.round(next * 10) / 10);

      if (progress < 1) {
        scoreAnimationRef.current = requestAnimationFrame(step);
      } else {
        setDisplayedScore(scoreChange.toScore);
        scoreAnimationRef.current = null;
        if (clearScoreRef.current !== null) window.clearTimeout(clearScoreRef.current);
        clearScoreRef.current = window.setTimeout(() => setScoreChange(null), 2400);
      }
    };

    setDisplayedScore(scoreChange.fromScore);
    scoreAnimationRef.current = requestAnimationFrame(step);
  }, [scoreChange, stock?.score]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string, modeOverride?: InvestmentMode) => {
      if (!stock || !text.trim() || streaming) return;

      const trimmed   = text.trim();
      const history   = [...messages, { role: 'user' as const, content: trimmed }];

      setMessages([...history, { role: 'assistant', content: '' }]);
      setInput('');
      setStreaming(true);

      if (currentPosition) {
        const norm = trimmed.toLowerCase();
        let positionReply: string | null = null;
        if (/\b(how is this evolving|position evolving|evolving)\b/.test(norm))
          positionReply = buildPositionEvolution(stock, currentPosition);
        else if (/\b(changed since|what changed|since entry)\b/.test(norm))
          positionReply = buildPositionChanges(stock, currentPosition);
        else if (/\b(should.*hold|still hold|hold this)\b/.test(norm))
          positionReply = buildHoldDecision(stock, currentPosition);
        else if (/\b(matters next|what.*next|what event|catalyst next)\b/.test(norm))
          positionReply = buildWhatMattersNext(stock, currentPosition);
        else if (/\b(thesis.*stronger|getting stronger|is the thesis|thesis improving)\b/.test(norm))
          positionReply = buildThesisStrength(stock, currentPosition);
        if (positionReply) {
          window.setTimeout(() => {
            setMessages([...history, { role: 'assistant', content: positionReply! }]);
            setStreaming(false);
          }, 120);
          return;
        }
      }

      if (looksLikeAssumptionUpdate(trimmed)) {
        const controller = new AbortController();
        abortRef.current = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), 2_000);

        try {
          const res = await fetch('/api/assumption-update', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker:       stock.ticker,
              baseScore:    stock.score,
              breakdown:    stock.breakdown,
              assumption:   trimmed,
              horizonWeeks: stock.horizonWeeks,
              forecastReturnPct: stock.meta.forecastReturnPct,
            }),
            signal: controller.signal,
          });

          const payload = await res.json().catch(() => null) as AssumptionUpdateResponse | null;
          if (!res.ok || !payload?.result) throw new Error(payload?.error ?? `HTTP ${res.status}`);

          const updated: RankedStock = {
            ...stock,
            score:     payload.result.adjustedScore,
            signal:    signalFromScore(payload.result.adjustedScore),
            breakdown: payload.result.adjustedBreakdown,
            meta: {
              ...stock.meta,
              valuation: payload.financialImpact?.afterValuation ?? buildValuationSignal({
                ticker: stock.ticker,
                forecastReturnPct: stock.meta.forecastReturnPct,
                factorBreakdown: payload.result.adjustedBreakdown,
              }),
            },
            primaryReason: payload.result.delta > 0
              ? `User assumption strengthens ${factorLabel(payload.parsedClaim?.primaryFactor ?? 'score')}`
              : payload.result.delta < 0
                ? `User assumption weakens ${factorLabel(payload.parsedClaim?.primaryFactor ?? 'score')}`
                : stock.primaryReason,
            mainRisk: payload.result.pushback ?? stock.mainRisk,
          };
          setScoreChange({
            fromScore: stock.score,
            toScore: payload.result.adjustedScore,
            delta: payload.result.delta,
            fromSignal: stock.signal,
            toSignal: signalFromScore(payload.result.adjustedScore),
            factorDeltas: payload.result.factorDeltas,
            primaryFactor: payload.parsedClaim?.primaryFactor ?? 'score',
            explanation: payload.result.explanation,
          });
          onStockUpdate?.(updated);
          if (currentPosition) {
            const note = `Score updated: ${stock.score.toFixed(1)} → ${payload.result.adjustedScore.toFixed(1)} via assumption — ${payload.result.explanation}`;
            updatePositionThesis(currentPosition.id, payload.result.adjustedScore, signalFromScore(payload.result.adjustedScore), note);
            setCurrentPosition(prev => prev ? { ...prev, currentScore: payload.result!.adjustedScore, currentSignal: signalFromScore(payload.result!.adjustedScore) } : prev);
          }
          setMessages([...history, { role: 'assistant', content: buildAssumptionReply(stock, payload) }]);
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            setMessages([...history, { role: 'assistant', content: buildInputErrorReply(stock, 'The score update timed out after 2 seconds.') }]);
            return;
          }
          console.error('[InvestmentChat assumption-update]', err);
          setMessages([...history, { role: 'assistant', content: buildInputErrorReply(stock, 'The assumption needs a clearer driver such as earnings, growth, valuation, momentum, or risk.') }]);
          return;
        } finally {
          window.clearTimeout(timeoutId);
          setStreaming(false);
        }
      }

      if (modeOverride === 'compare') {
        window.setTimeout(() => {
          setMessages([...history, { role: 'assistant', content: buildCompare(stock, peers) }]);
          setStreaming(false);
        }, 120);
        return;
      }

      const localReply = buildLocalReply(stock, trimmed, modeOverride);
      if (localReply) {
        window.setTimeout(() => {
          setMessages([...history, { role: 'assistant', content: localReply }]);
          setStreaming(false);
        }, 120);
        return;
      }

      const controller  = new AbortController();
      abortRef.current  = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 2_000);

      try {
        const body = {
          message: trimmed,
          ...(modeOverride ? { mode: modeOverride } : {}),
          context: {
            primaryTicker:     stock.ticker,
            score:             stock.score,
            signal:            stock.signal,
            horizonWeeks:      stock.horizonWeeks,
            breakdown:         stock.breakdown,
            primaryReason:     stock.primaryReason,
            mainRisk:          stock.mainRisk,
            forecastReturnPct: stock.meta.forecastReturnPct,
            catalystCount:     stock.meta.catalystCount,
            events:            [],
            recentPrices:      [],
            peers,
            history: history.map(m => ({ role: m.role, content: m.content })),
          },
        };

        const res = await fetch('/api/assistant', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal:  controller.signal,
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
          });
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setMessages([...history, { role: 'assistant', content: buildExplain(stock) }]);
          return;
        }
        console.error('[InvestmentChat]', err);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === '') {
            return [
              ...prev.slice(0, -1),
              { role: 'assistant', content: buildInputErrorReply(stock, 'AI provider unavailable; using current score context only.') },
            ];
          }
          return prev;
        });
      } finally {
        window.clearTimeout(timeoutId);
        setStreaming(false);
      }
    },
    [stock, peers, messages, streaming, onStockUpdate, currentPosition],
  );

  const handleAddToQueue = useCallback(() => {
    if (!stock) return;
    try {
      upsertPitchQueueItem(buildPitchQueueItemFromRankedStock(stock));
      setIsInQueue(true);
    } catch {
      // localStorage unavailable — silent no-op
    }
    if (queuedTimeoutRef.current !== null) window.clearTimeout(queuedTimeoutRef.current);
    setQueued(true);
    queuedTimeoutRef.current = window.setTimeout(() => setQueued(false), 2000);
  }, [stock]);

  const handleEnterPosition = useCallback(() => {
    if (!stock) return;
    const price = parseFloat(entryPriceInput);
    const amount = parseFloat(positionAmountInput);
    if (isNaN(price) || price <= 0) return;
    const position = buildPositionFromRankedStock(stock, price, !isNaN(amount) && amount > 0 ? amount : null);
    const updated  = addPosition(position);
    setCurrentPosition(updated.find(p => p.id === position.id) ?? null);
    setShowEnterForm(false);
    setEntryPriceInput('');
    setPositionAmountInput('');
    if (positionTimeoutRef.current !== null) window.clearTimeout(positionTimeoutRef.current);
    setPositionConfirmed(true);
    positionTimeoutRef.current = window.setTimeout(() => setPositionConfirmed(false), 2400);
  }, [stock, entryPriceInput, positionAmountInput]);

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!stock) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cb-surface)] ring-1 ring-[var(--cb-border)]">
          <span className="text-xl">📊</span>
        </div>
        <p className="text-sm font-medium text-[var(--cb-text-primary)]">Select a stock</p>
        <p className="max-w-[220px] text-xs text-[var(--cb-text-muted)]">
          Click any opportunity on the left to open the investment assistant.
        </p>
      </div>
    );
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  const cp = contextPrompt(stock.signal, stock.breakdown);
  const brief = getCompanyBrief(stock.ticker);
  const liveValuation = buildValuationSignal({
    ticker: stock.ticker,
    forecastReturnPct: stock.meta.forecastReturnPct,
    factorBreakdown: stock.breakdown,
  });
  const cryptoTape = cryptoTapeContext(stock);
  const sourceCards = [
    { label: 'Company file',  value: brief.strategicContext, prompt: 'Tell me about this company and why it is in the ranked universe.' },
    { label: 'Score basis',   value: stock.primaryReason,   prompt: 'Why is this stock ranked here and what drives the score?', mode: 'explain' as InvestmentMode },
    { label: 'Catalyst tape', value: catalystDetailedContext(stock), prompt: 'Run the catalyst agent: what events or headlines matter most over the next 1-3 months?' },
    ...(cryptoTape ? [{ label: 'Crypto tape', value: cryptoTape, prompt: 'Run the forecast agent: what does the forecast, momentum, and market tape imply?' }] : []),
    { label: 'Risk file',     value: resolvedRisk(stock),   prompt: 'What are the biggest risk factors that could break this trade?', mode: 'challenge' as InvestmentMode },
    { label: 'Valuation note', value: liveValuation.summary, prompt: 'Is this stock overpriced relative to its growth expectations?', mode: 'evaluate' as InvestmentMode },
  ];

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">

      {/* ── Sticky header: score strip + action buttons ── */}
      <PMDecisionStrip stock={stock} displayedScore={displayedScore} scoreChange={scoreChange} />

      {/* Trade Readiness strip */}
      <div className="shrink-0 border-b border-[var(--cb-border)] px-4 pb-2 pt-1">
        <TradeReadinessStrip ticker={stock.ticker} computed={tradeReadiness(stock)} />
      </div>

      {/* AI Verdict banner */}
      {aiVerdict && (() => {
        const total = aiVerdict.bullish + aiVerdict.bearish + aiVerdict.neutral;
        const bullPct = total > 0 ? Math.round((aiVerdict.bullish / total) * 100) : 0;
        const act = aiVerdict.action.toLowerCase();
        const isBull = act === 'buy' || act === 'cover';
        const isBear = act === 'sell' || act === 'short';
        const bannerClasses = isBull
          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
          : isBear
          ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
          : 'border-amber-400/30 bg-amber-500/12 text-amber-200';
        const dotClass = isBull ? 'bg-emerald-400' : isBear ? 'bg-rose-400' : 'bg-amber-400';
        const glowClass = isBull
          ? 'shadow-[0_2px_16px_rgba(52,211,153,0.18)]'
          : isBear ? 'shadow-[0_2px_16px_rgba(251,113,133,0.18)]' : '';
        return (
          <div className={cn('shrink-0 flex items-center gap-3 border-b px-4 py-2', bannerClasses, glowClass)}>
            <span className={cn('h-2 w-2 shrink-0 rounded-full animate-pulse', dotClass)} />
            <span className="text-[10px] font-bold uppercase tracking-widest">AI Hedge Fund</span>
            <span className="text-[11px] font-black capitalize tracking-tight">{aiVerdict.action}</span>
            <span className="text-[10px] opacity-70">{aiVerdict.confidence}% confidence</span>
            <div className="mx-2 h-3 w-px bg-current opacity-20" />
            <span className="text-[10px]">
              <span className="font-semibold">{aiVerdict.bullish}</span><span className="opacity-60"> bull · </span>
              <span className="font-semibold">{aiVerdict.bearish}</span><span className="opacity-60"> bear · </span>
              <span className="opacity-60">{bullPct}% bullish</span>
            </span>
          </div>
        );
      })()}

      {/* Action buttons */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-[var(--cb-border)] px-4 py-2">
        <button
          type="button"
          onClick={isInQueue ? undefined : handleAddToQueue}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
            queued || isInQueue
              ? 'cursor-default border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
              : 'border-[var(--cb-border)] text-[var(--cb-text-muted)] hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)]',
          )}
        >
          {queued
            ? <><CheckCircle className="h-3 w-3" />&nbsp;Added to Pitch Queue</>
            : isInQueue
              ? <><CheckCircle className="h-3 w-3" />&nbsp;In Queue</>
              : <><Plus className="h-3 w-3" />&nbsp;Queue</>
          }
        </button>
        {queued && (
          <a href="/pitch-queue" className="text-[10px] text-emerald-400 hover:underline">
            View Queue →
          </a>
        )}

        {currentPosition ? (
          <a
            href="/portfolio"
            className="flex items-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:underline"
          >
            <TrendingUp className="h-3 w-3" />
            Tracked Idea ↗
          </a>
        ) : showEnterForm ? (
          <div className="flex flex-wrap items-center gap-1">
            <input
              type="number"
              value={positionAmountInput}
              onChange={e => setPositionAmountInput(e.target.value)}
              placeholder="$ amount"
              className="w-24 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-1 text-[11px] text-[var(--cb-text-primary)] focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter') handleEnterPosition(); if (e.key === 'Escape') setShowEnterForm(false); }}
            />
            <input
              type="number"
              value={entryPriceInput}
              onChange={e => setEntryPriceInput(e.target.value)}
              placeholder="Ref price"
              className="w-20 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-1 text-[11px] text-[var(--cb-text-primary)] focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter') handleEnterPosition(); if (e.key === 'Escape') setShowEnterForm(false); }}
              autoFocus
            />
            <button type="button" onClick={handleEnterPosition} className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">✓</button>
            <button type="button" onClick={() => setShowEnterForm(false)} className="rounded-lg border border-[var(--cb-border)] px-2 py-1 text-[11px] text-[var(--cb-text-muted)]">✕</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowEnterForm(true)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
              positionConfirmed
                ? 'cursor-default border-blue-400/30 bg-blue-500/10 text-blue-300'
                : 'border-[var(--cb-border)] text-[var(--cb-text-muted)] hover:border-blue-400/30 hover:text-blue-300',
            )}
          >
            <TrendingUp className="h-3 w-3" />
            {positionConfirmed ? 'Idea Tracked' : 'Paper Track'}
          </button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="shrink-0 flex border-b border-[var(--cb-border)] bg-[var(--cb-surface)]">
        {([ ['agents', 'AI Agents'], ['analysis', 'Analysis'], ['chat', 'Chat'] ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setPanelTab(tab)}
            className={cn(
              'flex-1 py-2 text-[11px] font-semibold tracking-wide transition-colors relative',
              panelTab === tab
                ? 'text-[var(--cb-text-primary)]'
                : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
            )}
          >
            {label}
            {tab === 'agents' && aiVerdict && (
              <span className={cn(
                'ml-1.5 inline-block h-1.5 w-1.5 rounded-full',
                aiVerdict.action.toLowerCase() === 'buy' || aiVerdict.action.toLowerCase() === 'cover'
                  ? 'bg-emerald-400' : aiVerdict.action.toLowerCase() === 'sell' || aiVerdict.action.toLowerCase() === 'short'
                  ? 'bg-rose-400' : 'bg-amber-400',
              )} />
            )}
            {panelTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--cb-text-primary)]" />
            )}
          </button>
        ))}
      </div>

      {/* ── Analysis tab ── */}
      {panelTab === 'analysis' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TradeStructurePanel stock={stock} />
          <ScenarioEngine stock={stock} onScenarioClick={text => sendMessage(text)} disabled={streaming} />
          <CatalystTimeline stock={stock} onCatalystClick={text => sendMessage(text)} disabled={streaming} />
          <DeepResearchPanel
            stock={stock}
            scoreChange={scoreChange}
            sourceCards={sourceCards}
            onPrompt={(text, mode) => sendMessage(text, mode as InvestmentMode | undefined)}
            disabled={streaming}
          />
        </div>
      )}

      {/* ── AI Agents tab — the three integrated repos ── */}
      {panelTab === 'agents' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <HedgeFundPanel
            ticker={stock.ticker}
            autoRun
            onResult={r => {
              if (!r.decision) return;

              // ── Dynamic ranking: AI consensus adjusts the live score ──────
              const total = r.consensus.bullish + r.consensus.bearish + r.consensus.neutral;
              const bullPct = total > 0 ? r.consensus.bullish / total : 0.5;
              // Maps 0% bull → -1.5, 50% → 0, 100% → +1.5
              const consensusAdj = (bullPct - 0.5) * 3;
              // Action override: buy/cover add 0.4, sell/short subtract 0.4
              const act = r.decision.action.toLowerCase();
              const actionAdj = (act === 'buy' || act === 'cover') ? 0.4
                : (act === 'sell' || act === 'short') ? -0.4 : 0;

              const rawNew = stock.score + consensusAdj + actionAdj;
              const newScore = Math.round(Math.max(0, Math.min(10, rawNew)) * 10) / 10;
              const newSignal = signalFromScore(newScore);

              onStockUpdate?.({
                ...stock,
                score: newScore,
                signal: newSignal,
                primaryReason: `AI: ${r.decision.action} (${r.consensus.bullish}↑ ${r.consensus.bearish}↓) — ${stock.primaryReason}`,
                meta: { ...stock.meta, dataSource: 'live' },
              });

              setAiVerdict({
                action: r.decision.action,
                bullish: r.consensus.bullish,
                bearish: r.consensus.bearish,
                neutral: r.consensus.neutral,
                confidence: r.decision.confidence,
              });
            }}
          />
          <TradingAgentsPanel ticker={stock.ticker} />
          <DexterPanel ticker={stock.ticker} />
        </div>
      )}

      {/* ── Chat tab ── */}
      {panelTab === 'chat' && (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
        {messages.map((msg, i) => {
          const convictionLevel =
            msg.role === 'assistant' && msg.content
              ? parseConvictionLevel(msg.content)
              : null;
          return (
            <div
              key={i}
              className={cn(
                'flex flex-col',
                msg.role === 'user' ? 'items-end' : 'items-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[92%] overflow-hidden rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--cb-surface)] text-[var(--cb-text-body)] ring-1 ring-[var(--cb-border)]',
                )}
              >
                {msg.content || (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0.2s]" />
                  </span>
                )}
              </div>
              {convictionLevel && (
                <div className="mt-1 w-full max-w-[85%] px-1">
                  <ConvictionMeter level={convictionLevel} />
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {/* Suggested prompts + input — only on chat tab */}
      {panelTab === 'chat' && <div className="shrink-0 border-t border-[var(--cb-border)] px-4 py-2">
        {currentPosition && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-blue-400/70">
              Position
            </span>
            {(
              [
                { label: 'Evolving?',     text: 'How is this position evolving?' },
                { label: 'What changed?', text: 'What changed since entry?' },
                { label: 'Still hold?',   text: 'Should we still hold this?' },
                { label: 'Next event?',   text: 'What event matters next for this position?' },
                { label: 'Thesis?',       text: 'Is the thesis getting stronger?' },
              ] as const
            ).map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => sendMessage(p.text)}
                disabled={streaming}
                className="rounded-lg border border-blue-400/20 bg-blue-500/8 px-2 py-1 text-[10px] font-medium text-blue-300 transition-colors hover:border-blue-300/40 hover:bg-blue-500/12 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
            Agents
          </span>
          {AGENT_PROMPTS.map(agent => (
            <button
              key={agent.label}
              type="button"
              onClick={() => sendMessage(agent.text, agent.mode)}
              disabled={streaming}
              className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-200 transition-colors hover:border-blue-300/40 hover:bg-blue-500/15 disabled:opacity-50"
            >
              {agent.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_PROMPTS.map(qp => (
            <button
              key={qp.mode}
              type="button"
              onClick={() => sendMessage(qp.text, qp.mode)}
              disabled={streaming}
              className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-1 text-[10px] font-medium text-[var(--cb-text-secondary)] transition-colors hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
            >
              {qp.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => sendMessage(cp.text, cp.mode)}
            disabled={streaming}
            className={cn(
              'rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50',
              stock.signal === 'green'
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                : stock.signal === 'red'
                  ? 'border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15'
                  : 'border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15',
            )}
          >
            {cp.label}
          </button>
        </div>
      </div>}

      {panelTab === 'chat' && <div className="shrink-0 border-t border-[var(--cb-border)] px-4 py-3">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about this stock…"
            disabled={streaming}
            className="min-w-0 flex-1 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-border-strong)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {streaming
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </button>
        </form>
      </div>}
    </div>
  );
}

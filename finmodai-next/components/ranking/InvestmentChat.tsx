'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, CheckCircle, Copy, FileText, Loader2, Maximize2, Minimize2, Plus, Send, Shield, Target, TrendingUp, X, Zap } from 'lucide-react';
import { PMDecisionStrip } from '@/components/ranking/PMDecisionStrip';
import { TradeStructurePanel } from '@/components/ranking/TradeStructurePanel';
import { ScenarioEngine } from '@/components/ranking/ScenarioEngine';
import { CatalystTimeline } from '@/components/ranking/CatalystTimeline';
import { DeepResearchPanel } from '@/components/ranking/DeepResearchPanel';
import { TradingAgentsPanel } from '@/components/ranking/TradingAgentsPanel';
import { DexterPanel } from '@/components/ranking/DexterPanel';
import { HedgeFundPanel } from '@/components/ranking/HedgeFundPanel';
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
import type { StockQuote } from '@/app/api/quotes/route';
import type { RankedStock } from '@/lib/ranking/types';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import { buildValuationSignal } from '@/lib/valuation/signal';
import {
  type InvestmentMode, type ScoreFactor, SCORE_LABELS,
  capitalize, factorLabel, resolvedRisk, signalFromScore, contextPrompt, tradeReadiness, setupLabel,
} from '@/lib/ranking/chatHelpers';
import { cn } from '@/lib/utils';
import { PeerStock, buildExplain, buildSwingThesis, buildCompare, buildLocalReply, catalystDetailedContext, cryptoTapeContext } from '@/lib/ranking/chatBuilders';
import { ChatMessage } from '@/components/ranking/ChatMessage';
import { ConvictionMeter, parseConvictionLevel } from '@/components/ranking/ConvictionMeter';


type Message = { role: 'user' | 'assistant'; content: string };

type AssumptionUpdateResponse = {
  result?: {
    adjustedScore: number;
    adjustedBreakdown: RankedStock['breakdown'];
    delta: number;
    factorDeltas: Partial<Record<ScoreFactor, number>>;
    plausibility: string;
    pushback?: string;
    explanation: string;
  };
  parsedClaim?: { primaryFactor?: string };
  financialImpact?: {
    beforeValuation: ReturnType<typeof buildValuationSignal>;
    afterValuation: ReturnType<typeof buildValuationSignal>;
    valuationGapDelta: number | null;
    expectedMoveDeltaPct: number;
  };
  error?: string;
};

const AGENT_PROMPTS: Array<{ label: string; text: string; mode?: InvestmentMode }> = [
  { label: 'Thesis',    text: 'Run the pm brain: explain why this stock belongs in the ranked list.', mode: 'explain' },
  { label: 'Catalyst',  text: 'Run the catalyst agent: what events or headlines matter most?' },
  { label: 'Forecast',  text: 'Run the forecast agent: what does the forecast, momentum, and tape imply?' },
  { label: 'Bear Case', text: 'What are the biggest risk factors that could break this trade?', mode: 'challenge' },
];

const STANDARD_PROMPTS: Array<{ label: string; text: string; mode: InvestmentMode }> = [
  { label: 'Explain',   text: 'Why is this stock ranked here and what drives the score?',      mode: 'explain' },
  { label: 'Evaluate',  text: 'Is this stock overpriced relative to its growth expectations?', mode: 'evaluate' },
  { label: 'Challenge', text: 'What would make this a bad trade?',                             mode: 'challenge' },
  { label: 'Compare',   text: 'How does this compare to peers in the ranked list?',            mode: 'compare' },
  { label: 'Pitch',     text: 'Write a short pitch for this trade.',                           mode: 'pitch' },
];

const CHAT_AGENT_SHORTCUTS: Array<{ label: string; text: string; mode?: InvestmentMode }> = [
  { label: 'AI Hedge Fund',       text: 'Run the pm brain: explain why this stock belongs in the ranked list.', mode: 'explain' },
  { label: 'Valuation Analyst',   text: 'Is this stock overpriced relative to its growth expectations?', mode: 'evaluate' },
  { label: 'Technical Analyst',   text: 'Analyze the technical setup, momentum, forecast, and tape for this stock.' },
  { label: 'Bear Case',           text: 'What would make this a bad trade?', mode: 'challenge' },
  { label: 'Catalyst Scanner',    text: 'Run the catalyst agent: what events or headlines matter most for this stock?' },
  { label: 'News Radar',          text: 'What are the latest news and sentiment signals for this stock?' },
];

type Props = {
  stock: RankedStock | null;
  peers: PeerStock[];
  onStockUpdate?: (stock: RankedStock) => void;
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
  const [shareCountInput, setShareCountInput] = useState('');
  const [positionConfirmed, setPositionConfirmed] = useState(false);
  const [entryQuote, setEntryQuote] = useState<StockQuote | null>(null);
  const [entryQuoteLoading, setEntryQuoteLoading] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<{ action: string; bullish: number; bearish: number; neutral: number; confidence: number } | null>(null);
  const [panelTab, setPanelTab] = useState<'analysis' | 'agents' | 'chat'>('agents');
  const [analysisPaneTab, setAnalysisPaneTab] = useState<'analysis' | 'agents' | 'chat'>('analysis');
  const [chatExpanded, setChatExpanded] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
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
      setShareCountInput('');
      setPositionConfirmed(false);
      setEntryQuote(null);
      setEntryQuoteLoading(false);
      setAiVerdict(stock?.meta.aiHedgeFund ? {
        action: stock.meta.aiHedgeFund.action,
        bullish: stock.meta.aiHedgeFund.bullish,
        bearish: stock.meta.aiHedgeFund.bearish,
        neutral: stock.meta.aiHedgeFund.neutral,
        confidence: stock.meta.aiHedgeFund.confidence,
      } : null);
      setPanelTab('chat');
      setAnalysisPaneTab('analysis');
      setCurrentPosition(
        stock ? (getActivePositions().find(p => p.ticker === stock.ticker) ?? null) : null,
      );
      prevTicker.current = stock?.ticker ?? null;
    }
  }, [stock]);

  useEffect(() => {
    if (!stock || !showEnterForm) return;
    let alive = true;
    setEntryQuoteLoading(true);
    fetch(`/api/quotes?symbols=${encodeURIComponent(stock.ticker)}`, { cache: 'no-store' })
      .then(res => res.ok ? res.json() as Promise<{ quotes?: StockQuote[] }> : null)
      .then(data => {
        if (!alive) return;
        const quote = data?.quotes?.[0] ?? null;
        setEntryQuote(quote);
        if (quote?.price && !entryPriceInput) setEntryPriceInput(quote.price.toFixed(2));
      })
      .catch(() => {
        if (alive) setEntryQuote(null);
      })
      .finally(() => {
        if (alive) setEntryQuoteLoading(false);
      });
    return () => { alive = false; };
  }, [stock, showEnterForm, entryPriceInput]);

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
      setPanelTab('chat');
      setAnalysisPaneTab('chat');

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
    const shares = parseFloat(shareCountInput);
    if (isNaN(price) || price <= 0) return;
    const resolvedAmount = !isNaN(amount) && amount > 0
      ? amount
      : !isNaN(shares) && shares > 0
        ? shares * price
        : null;
    const position = buildPositionFromRankedStock(
      stock,
      price,
      resolvedAmount,
      !isNaN(shares) && shares > 0 ? shares : null,
    );
    const updated  = addPosition(position);
    setCurrentPosition(updated.find(p => p.id === position.id) ?? null);
    setShowEnterForm(false);
    setEntryPriceInput('');
    setPositionAmountInput('');
    setShareCountInput('');
    if (positionTimeoutRef.current !== null) window.clearTimeout(positionTimeoutRef.current);
    setPositionConfirmed(true);
    positionTimeoutRef.current = window.setTimeout(() => setPositionConfirmed(false), 2400);
  }, [stock, entryPriceInput, positionAmountInput, shareCountInput]);

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
  const parsedEntryPrice = parseFloat(entryPriceInput);
  const parsedAmount = parseFloat(positionAmountInput);
  const parsedShares = parseFloat(shareCountInput);
  const resolvedShares =
    Number.isFinite(parsedShares) && parsedShares > 0
      ? parsedShares
      : Number.isFinite(parsedEntryPrice) && parsedEntryPrice > 0 &&
        Number.isFinite(parsedAmount) && parsedAmount > 0
        ? parsedAmount / parsedEntryPrice
        : null;
  const resolvedCostBasis =
    resolvedShares !== null && Number.isFinite(parsedEntryPrice) && parsedEntryPrice > 0
      ? resolvedShares * parsedEntryPrice
      : Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : null;
  const estimatedShares =
    Number.isFinite(parsedEntryPrice) && parsedEntryPrice > 0 &&
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? parsedAmount / parsedEntryPrice
      : null;
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

      {/* ── Command bar ── */}
      <div className={cn(
        'shrink-0 border-b border-l-4 px-4 py-2.5',
        stock.signal === 'green'
          ? 'border-l-emerald-500 bg-emerald-500/[0.04] border-b-[var(--cb-border)]'
          : stock.signal === 'red'
            ? 'border-l-rose-500 bg-rose-500/[0.04] border-b-[var(--cb-border)]'
            : 'border-l-amber-500 bg-amber-500/[0.04] border-b-[var(--cb-border)]',
      )}>
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Left: identity strip */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-lg font-black tracking-tight text-[var(--cb-text-primary)]">{stock.ticker}</span>
            <span className={cn(
              'rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 transition-all duration-300',
              stock.signal === 'green'
                ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25'
                : stock.signal === 'red'
                  ? 'bg-rose-500/15 text-rose-300 ring-rose-400/25'
                  : 'bg-amber-500/15 text-amber-300 ring-amber-400/25',
              scoreChange && scoreChange.fromSignal !== scoreChange.toSignal && 'animate-pulse',
            )}>
              {setupLabel(stock.signal)} · {displayedScore.toFixed(1)}
            </span>
            {scoreChange && (
              <span className={cn(
                'text-[10px] font-bold tabular-nums',
                scoreChange.delta >= 0 ? 'text-emerald-300' : 'text-rose-300',
              )}>
                {scoreChange.delta >= 0 ? '+' : ''}{scoreChange.delta.toFixed(1)}
              </span>
            )}
            {aiVerdict && (() => {
              const act = aiVerdict.action.toLowerCase();
              const isBull = act === 'buy' || act === 'cover';
              const isBear = act === 'sell' || act === 'short';
              return (
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                  isBull ? 'bg-emerald-500/15 text-emerald-300'
                    : isBear ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-amber-500/15 text-amber-300',
                )}>
                  AI: {aiVerdict.action} · {aiVerdict.confidence}%
                </span>
              );
            })()}
            {/* Primary reason — shows context without opening analysis pane */}
            {stock.primaryReason && (
              <span className="hidden min-w-0 truncate text-[11px] text-[var(--cb-text-muted)] lg:inline">
                {stock.primaryReason}
              </span>
            )}
          </div>
          {/* Right: action buttons */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={isInQueue ? undefined : handleAddToQueue}
              className={cn(
                'flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-all duration-150',
                queued || isInQueue
                  ? 'cursor-default border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                  : 'border-[var(--cb-border)] text-[var(--cb-text-muted)] hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)]',
              )}
            >
              {queued || isInQueue
                ? <><CheckCircle className="h-3.5 w-3.5" /><span className="hidden sm:inline">&nbsp;Queued</span></>
                : <><Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">&nbsp;Queue</span></>
              }
            </button>
            {queued && (
              <a href="/pitch-queue" className="text-[10px] text-emerald-400 hover:underline">View →</a>
            )}
            {currentPosition ? (
              <a
                href="/portfolio"
                className="flex cursor-pointer items-center gap-1 rounded-md border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-300 transition-colors hover:bg-blue-500/15"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tracked ↗</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setShowEnterForm(v => !v)}
                className={cn(
                  'flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-all duration-150',
                  positionConfirmed
                    ? 'cursor-default border-blue-400/30 bg-blue-500/10 text-blue-300'
                    : showEnterForm
                      ? 'border-blue-400/30 bg-blue-500/15 text-blue-300'
                      : 'border-[var(--cb-border)] text-[var(--cb-text-muted)] hover:border-blue-400/30 hover:text-blue-300',
                )}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{positionConfirmed ? 'Tracked' : 'Track'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Enter position form (collapsible below header) ── */}
      {showEnterForm && !currentPosition && (
        <div className="shrink-0 border-b border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300">Track Thesis</div>
              <div className="text-[11px] text-[var(--cb-text-muted)]">
                Add {stock.ticker} with a reference price and position size.
              </div>
            </div>
            <div className="text-right text-[10px] text-[var(--cb-text-muted)]">
              {entryQuoteLoading
                ? 'Loading quote...'
                : entryQuote?.price
                  ? <>Live ref <span className="font-semibold text-[var(--cb-text-primary)]">${entryQuote.price.toFixed(2)}</span></>
                  : 'Manual ref price'}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="space-y-1">
              <span className="block text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Shares</span>
              <input
                type="number"
                value={shareCountInput}
                onChange={e => setShareCountInput(e.target.value)}
                placeholder="10"
                className="h-9 w-full rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2.5 text-sm text-[var(--cb-text-primary)] focus:border-blue-400/40 focus:outline-none"
                onKeyDown={e => { if (e.key === 'Enter') handleEnterPosition(); if (e.key === 'Escape') setShowEnterForm(false); }}
                autoFocus
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Cost basis</span>
              <input
                type="number"
                value={positionAmountInput}
                onChange={e => setPositionAmountInput(e.target.value)}
                placeholder="3000"
                className="h-9 w-full rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2.5 text-sm text-[var(--cb-text-primary)] focus:border-blue-400/40 focus:outline-none"
                onKeyDown={e => { if (e.key === 'Enter') handleEnterPosition(); if (e.key === 'Escape') setShowEnterForm(false); }}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Entry / ref price</span>
              <input
                type="number"
                value={entryPriceInput}
                onChange={e => setEntryPriceInput(e.target.value)}
                placeholder={entryQuote?.price ? entryQuote.price.toFixed(2) : 'Price'}
                className="h-9 w-full rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2.5 text-sm text-[var(--cb-text-primary)] focus:border-blue-400/40 focus:outline-none"
                onKeyDown={e => { if (e.key === 'Enter') handleEnterPosition(); if (e.key === 'Escape') setShowEnterForm(false); }}
              />
            </label>
            <div className="flex items-end gap-1.5">
              <button
                type="button"
                onClick={handleEnterPosition}
                disabled={!Number.isFinite(parsedEntryPrice) || parsedEntryPrice <= 0}
                className="h-9 rounded-lg bg-blue-600 px-3 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowEnterForm(false)}
                className="h-9 rounded-lg border border-[var(--cb-border)] px-3 text-[11px] text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[var(--cb-text-muted)]">
            <span>Setup <span className="font-semibold text-[var(--cb-text-primary)]">{setupLabel(stock.signal)}</span></span>
            <span>Score <span className="font-semibold text-[var(--cb-text-primary)]">{stock.score.toFixed(1)}</span></span>
            {resolvedShares !== null && (
              <span>Shares <span className="font-semibold text-[var(--cb-text-primary)]">{resolvedShares.toFixed(4)}</span>{estimatedShares !== null && !shareCountInput ? ' est.' : ''}</span>
            )}
            {resolvedCostBasis !== null && (
              <span>Cost basis <span className="font-semibold text-[var(--cb-text-primary)]">${Math.round(resolvedCostBasis).toLocaleString('en-US')}</span></span>
            )}
          </div>
        </div>
      )}

      {/* ── Full-width tabbed workspace ── */}
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">

        {/* Tab bar — 3 tabs, full-width segmented pill control */}
        <div className="shrink-0 flex items-center gap-1 border-b border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2 py-1.5">
          {([
            { id: 'analysis', label: 'Deep Analysis' },
            { id: 'agents',   label: 'AI Agents' },
            { id: 'chat',     label: 'Chat' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAnalysisPaneTab(tab.id)}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold tracking-wide transition-all duration-150',
                analysisPaneTab === tab.id
                  ? 'bg-[var(--cb-surface)] text-[var(--cb-text-primary)] shadow-[0_1px_4px_rgba(0,0,0,0.35)]'
                  : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)] hover:bg-white/[0.03]',
              )}
            >
              {tab.label}
              {tab.id === 'agents' && aiVerdict && (
                <span className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  aiVerdict.action.toLowerCase() === 'buy' || aiVerdict.action.toLowerCase() === 'cover'
                    ? 'bg-emerald-400'
                    : aiVerdict.action.toLowerCase() === 'sell' || aiVerdict.action.toLowerCase() === 'short'
                      ? 'bg-rose-400' : 'bg-amber-400',
                )} />
              )}
              {tab.id === 'chat' && messages.length > 2 && (
                <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-500/20 px-1 text-[8px] font-bold text-blue-300 tabular-nums">
                  {Math.floor(messages.length / 2)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Deep Analysis tab — full workspace width ── */}
        {analysisPaneTab === 'analysis' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PMDecisionStrip stock={stock} displayedScore={displayedScore} scoreChange={scoreChange} />
            <div className="border-b border-[var(--cb-border)] px-4 pb-2 pt-1">
              <TradeReadinessStrip ticker={stock.ticker} computed={tradeReadiness(stock)} />
            </div>
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

        {/* ── AI Agents tab — consensus dashboard, full width ── */}
        {analysisPaneTab === 'agents' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PMDecisionStrip stock={stock} displayedScore={displayedScore} scoreChange={scoreChange} />
            <HedgeFundPanel
              ticker={stock.ticker}
              autoRun
              onResult={r => {
                if (!r.decision) return;

                const total = r.consensus.bullish + r.consensus.bearish + r.consensus.neutral;
                const bullPct = total > 0 ? r.consensus.bullish / total : 0.5;
                const bearPct = total > 0 ? r.consensus.bearish / total : 0.5;
                const consensusAdj = (bullPct - 0.5) * 3;
                const act = r.decision.action.toLowerCase();
                const actionAdj = (act === 'buy' || act === 'cover') ? 0.4
                  : (act === 'sell' || act === 'short') ? -0.4 : 0;

                const rawNew = stock.score + consensusAdj + actionAdj;
                const newScore = Math.round(Math.max(0, Math.min(10, rawNew)) * 10) / 10;
                const newSignal = signalFromScore(newScore);
                const actionDirection =
                  act === 'buy' || act === 'cover' ? 'bullish' :
                  act === 'sell' || act === 'short' ? 'bearish' : 'neutral';
                const scoreDirection = newSignal === 'green' ? 'bullish' : newSignal === 'red' ? 'bearish' : 'neutral';
                const alignment = actionDirection === 'neutral' || scoreDirection === 'neutral'
                  ? 'mixed'
                  : actionDirection === scoreDirection ? 'confirms' : 'conflicts';
                const aiHedgeFund = {
                  action: r.decision.action,
                  bullish: r.consensus.bullish,
                  bearish: r.consensus.bearish,
                  neutral: r.consensus.neutral,
                  confidence: r.decision.confidence,
                  bullPct,
                  netBias: bullPct - bearPct,
                  alignment,
                  updatedAt: new Date().toISOString(),
                } as const;

                setScoreChange({
                  fromScore: stock.score,
                  toScore: newScore,
                  delta: newScore - stock.score,
                  fromSignal: stock.signal,
                  toSignal: newSignal,
                  factorDeltas: {},
                  primaryFactor: 'AI Hedge Fund',
                  explanation: `AI Hedge Fund ${alignment === 'confirms' ? 'confirmed' : alignment === 'conflicts' ? 'challenged' : 'mixed on'} the setup.`,
                });

                onStockUpdate?.({
                  ...stock,
                  score: newScore,
                  signal: newSignal,
                  primaryReason: `AI: ${r.decision.action} (${r.consensus.bullish}↑ ${r.consensus.bearish}↓) — ${stock.primaryReason}`,
                  meta: { ...stock.meta, dataSource: 'live', aiHedgeFund },
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

        {/* ── Chat tab — full analyst copilot workspace ── */}
        {analysisPaneTab === 'chat' && (
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">

            {/* Messages — centered max-w for comfortable reading */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-6">
                {messages.map((msg, i) => {
                  const convictionLevel =
                    msg.role === 'assistant' && msg.content
                      ? parseConvictionLevel(msg.content)
                      : null;
                  return (
                    <div key={i} className="flex flex-col gap-1.5">
                      <ChatMessage role={msg.role} content={msg.content} />
                      {convictionLevel && msg.content && (
                        <ConvictionMeter level={convictionLevel} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sticky input area */}
            <div className="shrink-0 border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)]">

              {/* Agent shortcut command row */}
              <div className="flex items-center gap-1.5 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-[var(--cb-text-muted)] opacity-60">Agents</span>
                {CHAT_AGENT_SHORTCUTS.map(shortcut => (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => sendMessage(shortcut.text, shortcut.mode)}
                    disabled={streaming}
                    className="shrink-0 cursor-pointer rounded-md border border-blue-400/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-200 transition-all duration-150 hover:border-blue-300/40 hover:bg-blue-500/15 disabled:opacity-50"
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>

              {/* Quick mode chips + position chips */}
              <div className="flex items-center gap-1 overflow-x-auto px-4 pt-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {currentPosition && (
                  <>
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-blue-400/60">Pos</span>
                    {(
                      [
                        { label: 'Evolving?',   text: 'How is this position evolving?' },
                        { label: 'Changed?',    text: 'What changed since entry?' },
                        { label: 'Still hold?', text: 'Should we still hold this?' },
                        { label: 'Next event?', text: 'What event matters next for this position?' },
                        { label: 'Thesis?',     text: 'Is the thesis getting stronger?' },
                      ] as const
                    ).map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => sendMessage(p.text)}
                        disabled={streaming}
                        className="shrink-0 cursor-pointer rounded-md border border-blue-400/20 bg-blue-500/8 px-2 py-0.5 text-[10px] font-medium text-blue-300 transition-all duration-150 hover:border-blue-300/40 disabled:opacity-50"
                      >
                        {p.label}
                      </button>
                    ))}
                    <span className="mx-1 shrink-0 h-3.5 w-px bg-[var(--cb-border)]" />
                  </>
                )}
                {STANDARD_PROMPTS.map(qp => (
                  <button
                    key={qp.mode}
                    type="button"
                    onClick={() => sendMessage(qp.text, qp.mode)}
                    disabled={streaming}
                    className="shrink-0 cursor-pointer rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--cb-text-secondary)] transition-all duration-150 hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
                  >
                    {qp.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => sendMessage(cp.text, cp.mode)}
                  disabled={streaming}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-all duration-150 disabled:opacity-50',
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

              {/* Input form — centered max-w to match messages */}
              <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-1">
                <form
                  onSubmit={e => { e.preventDefault(); sendMessage(input); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={`Ask the analyst about ${stock.ticker}…`}
                    disabled={streaming}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] transition-colors focus:border-blue-400/40 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || streaming}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-600 text-white transition-all duration-150 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {streaming
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />
                    }
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

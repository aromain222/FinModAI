'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar } from 'recharts';
import { format, parseISO, startOfWeek } from 'date-fns';
import { Search, Star, TrendingUp, TrendingDown, ExternalLink, AlertCircle, ChevronRight, Sparkles } from 'lucide-react';
import { DateRangePicker, getDateRangeFromSelection } from '@/components/stocks/DateRangePicker';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import type { MoveWithCatalysts, MoveEvent } from '@/lib/analytics/moveExplainer/types';

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: { message: string };
  meta?: {
    traceId?: string;
    source?: string;
    fetchedAt?: string;
  };
};

type MoveExplainerResponse = {
  moves: MoveWithCatalysts[];
  priceSeries: Array<{ date: string; close: number; volume?: number }>;
  warnings: string[];
};

type Interval = 'daily' | 'weekly';

// Skeleton loader
function MoveExplainerSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-black/60 p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-white/10 bg-black/60 p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </Card>
        <Card className="border border-white/10 bg-black/60 p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-48 w-full" />
        </Card>
      </div>
    </div>
  );
}

// Price Chart Component with optional volume bars
function PriceChart({
  priceSeries,
  moves,
  selectedMove,
  onMoveSelect,
  interval,
  showVolume = false,
}: {
  priceSeries: Array<{ date: string; close: number; volume?: number }>;
  moves: MoveEvent[];
  selectedMove?: MoveEvent;
  onMoveSelect: (move: MoveEvent | undefined) => void;
  interval: Interval;
  showVolume?: boolean;
}) {
  const hasVolume = priceSeries.some(p => p.volume !== undefined && p.volume > 0);
  const shouldShowVolume = showVolume && hasVolume;

  const chartData = useMemo(() => {
    const moveMap = new Map(moves.map(m => [m.date, m]));
    const maxVolume = Math.max(...priceSeries.map(p => p.volume || 0));
    
    return priceSeries.map(point => {
      const move = moveMap.get(point.date);
      return {
        date: point.date,
        close: point.close,
        volume: point.volume || 0,
        volumeNormalized: maxVolume > 0 ? ((point.volume || 0) / maxVolume) * 100 : 0,
        returnPct: move?.returnPct,
        direction: move?.direction,
        benchmarkReturnPct: move?.benchmarkReturnPct,
        excessReturnPct: move?.excessReturnPct,
        isMove: Boolean(move),
        isSelected: selectedMove?.date === point.date,
        move,
      };
    });
  }, [priceSeries, moves, selectedMove]);

  const maxPrice = useMemo(() => Math.max(...priceSeries.map(p => p.close)), [priceSeries]);
  const minPrice = useMemo(() => Math.min(...priceSeries.map(p => p.close)), [priceSeries]);
  const priceRange = maxPrice - minPrice || 1; // Avoid division by zero

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload[0]) return null;
    
    const data = payload[0].payload;
    const move = data.move as MoveEvent | undefined;
    
    return (
      <div className="bg-slate-900 border border-white/10 rounded-lg p-3 shadow-lg min-w-[200px]">
        <p className="text-sm font-semibold text-white mb-2">{format(parseISO(label), 'MMM dd, yyyy')}</p>
        <p className="text-sm text-slate-300">Close: <span className="text-white font-medium">${data.close.toFixed(2)}</span></p>
        {shouldShowVolume && data.volume > 0 && (
          <p className="text-sm text-slate-300 mt-1">
            Volume: <span className="text-white font-medium">{data.volume.toLocaleString()}</span>
          </p>
        )}
        {move && (
          <>
            <div className="mt-2 pt-2 border-t border-white/10">
              <p className="text-sm text-slate-300">
                Return: <span className={cn('font-medium', move.direction === 'up' ? 'text-green-400' : 'text-red-400')}>
                  {move.returnPct >= 0 ? '+' : ''}{move.returnPct.toFixed(2)}%
                </span>
              </p>
              {move.benchmarkReturnPct !== undefined && (
                <p className="text-sm text-slate-300 mt-1">
                  Benchmark ({move.benchmarkTicker || 'SPY'}): <span className="text-white font-medium">{move.benchmarkReturnPct >= 0 ? '+' : ''}{move.benchmarkReturnPct.toFixed(2)}%</span>
                </p>
              )}
              {move.excessReturnPct !== undefined && (
                <p className="text-sm text-slate-300 mt-1">
                  Excess: <span className={cn('font-medium', Math.abs(move.excessReturnPct) > (interval === 'daily' ? 1.5 : 3) ? 'text-purple-400' : 'text-blue-400')}>
                    {move.excessReturnPct >= 0 ? '+' : ''}{move.excessReturnPct.toFixed(2)}%
                  </span>
                  <span className="text-xs text-slate-500 ml-1">
                    ({move.moveClass || 'unknown'})
                  </span>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={cn('relative', shouldShowVolume ? 'h-96' : 'h-80')}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: shouldShowVolume ? 50 : 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(value) => format(parseISO(value), interval === 'daily' ? 'MMM dd' : 'MMM yyyy')}
            angle={shouldShowVolume ? -45 : 0}
            textAnchor={shouldShowVolume ? 'end' : 'middle'}
            height={shouldShowVolume ? 60 : 30}
          />
          <YAxis
            yAxisId="price"
            orientation="left"
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
            domain={[(dataMin: number) => Math.max(0, dataMin - priceRange * 0.1), (dataMax: number) => dataMax + priceRange * 0.1]}
          />
          {shouldShowVolume && (
            <YAxis
              yAxisId="volume"
              orientation="right"
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickFormatter={() => ''}
              domain={[0, 100]}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          
          {/* Volume bars (background, if enabled) */}
          {shouldShowVolume && (
            <Bar
              yAxisId="volume"
              dataKey="volumeNormalized"
              fill="#334155"
              opacity={0.25}
              radius={[2, 2, 0, 0]}
            />
          )}
          
          {/* Price line with custom dots for moves */}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="close"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={(props: any) => {
              const { payload, cx, cy } = props;
              if (!payload?.isMove || !payload?.move) return null;
              
              const move = payload.move as MoveEvent;
              const isSelected = selectedMove?.date === move.date;
              
              return (
                <g>
                  {/* Outer ring for selected */}
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={9}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      opacity={0.6}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onMoveSelect(move)}
                    />
                  )}
                  {/* Move dot */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 6 : 5}
                    fill={move.direction === 'up' ? '#22c55e' : '#ef4444'}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 2.5 : 2}
                    opacity={isSelected ? 1 : 0.9}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onMoveSelect(move)}
                  />
                </g>
              );
            }}
            activeDot={{ r: 7, fill: '#10b981', strokeWidth: 2, stroke: '#ffffff' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span>Up move</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>Down move</span>
        </div>
        {shouldShowVolume && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-3 h-3 bg-slate-500/30"></div>
            <span>Volume</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Move Timeline Component
function MoveTimeline({
  moves,
  selectedMove,
  onMoveSelect,
  interval,
}: {
  moves: MoveWithCatalysts[];
  selectedMove?: MoveEvent;
  onMoveSelect: (move: MoveEvent) => void;
  interval: Interval;
}) {
  const groupedMoves = useMemo(() => {
    if (interval === 'weekly') {
      const groups = new Map<string, MoveWithCatalysts[]>();
      moves.forEach(move => {
        const date = parseISO(move.move.date);
        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
        const weekKey = format(weekStart, 'yyyy-MM-dd');
        if (!groups.has(weekKey)) {
          groups.set(weekKey, []);
        }
        groups.get(weekKey)!.push(move);
      });
      return Array.from(groups.entries()).map(([weekKey, weekMoves]) => ({
        label: format(parseISO(weekKey), 'MMM dd, yyyy'),
        moves: weekMoves.sort((a, b) => b.move.returnPct - a.move.returnPct),
      }));
    }
    return [{ label: 'All Moves', moves }];
  }, [moves, interval]);

  return (
    <div className="space-y-4">
      {groupedMoves.map((group, groupIdx) => (
        <div key={groupIdx}>
          {interval === 'weekly' && (
            <h3 className="text-sm font-semibold text-slate-400 mb-3">{group.label}</h3>
          )}
          <div className="space-y-2">
            {group.moves.map((moveWithCatalysts) => {
              const move = moveWithCatalysts.move;
              const catalyst = moveWithCatalysts.catalysts[0];
              const isSelected = selectedMove?.date === move.date;
              
              return (
                <Card
                  key={move.date}
                  className={cn(
                    'border border-white/10 bg-black/60 p-4 cursor-pointer transition-all hover:bg-black/80',
                    isSelected && 'ring-2 ring-emerald-500/50 bg-black/90'
                  )}
                  onClick={() => onMoveSelect(move)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-white">
                          {format(parseISO(move.date), 'MMM dd, yyyy')}
                        </span>
                        <Badge
                          variant={move.direction === 'up' ? 'default' : 'destructive'}
                          className={cn(
                            'text-xs',
                            move.direction === 'up'
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                          )}
                        >
                          {move.direction === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                          {move.returnPct >= 0 ? '+' : ''}{move.returnPct.toFixed(2)}%
                        </Badge>
                        {move.moveClass && (
                          <Badge 
                            variant="outline" 
                            className={cn(
                              'text-xs',
                              move.moveClass === 'idiosyncratic'
                                ? 'border-purple-500/30 text-purple-400 bg-purple-500/10'
                                : 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                            )}
                          >
                            {move.moveClass === 'idiosyncratic' ? 'Idiosyncratic' : 'Market-driven'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {moveWithCatalysts.aiExplanation && (
                          <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                            <Sparkles className="w-3 h-3 mr-1" />
                            AI Explained
                          </Badge>
                        )}
                        {catalyst && (
                          <p className="text-sm text-slate-300 line-clamp-1 flex-1">{catalyst.label}</p>
                        )}
                      </div>
                      {move.benchmarkReturnPct !== undefined && move.benchmarkTicker && (
                        <p className="text-xs text-slate-500 mt-1">
                          Stock {move.returnPct >= 0 ? '+' : ''}{move.returnPct.toFixed(2)}% vs {move.benchmarkTicker} {move.benchmarkReturnPct >= 0 ? '+' : ''}{move.benchmarkReturnPct.toFixed(2)}%
                          {move.excessReturnPct !== undefined && (
                            <span className="ml-1 text-slate-400">
                              (excess {move.excessReturnPct >= 0 ? '+' : ''}{move.excessReturnPct.toFixed(2)}%)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <ChevronRight className={cn('w-4 h-4 text-slate-400', isSelected && 'text-emerald-400')} />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Move Detail Component
function MoveDetail({ moveWithCatalysts }: { moveWithCatalysts: MoveWithCatalysts | null }) {
  if (!moveWithCatalysts) {
    return (
      <Card className="border border-white/10 bg-black/60 p-6">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400">Select a move to see details</p>
        </div>
      </Card>
    );
  }

  // If no AI explanation but explanation is requested, show a message
  if (!moveWithCatalysts.aiExplanation) {
    const { move, catalysts } = moveWithCatalysts;
    const topCatalyst = catalysts[0];
    
    return (
      <Card className="border border-white/10 bg-black/60 p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Move Details</h2>
        
        <div className="mb-4 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
          <p className="text-sm text-slate-300">
            <Sparkles className="w-4 h-4 inline mr-2 text-yellow-400" />
            AI explanation not available for this move. Only the top 10 biggest movers include AI explanations when "Biggest movers only" is enabled.
          </p>
        </div>

        {topCatalyst && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">Catalyst</h3>
            <p className="text-slate-300 leading-relaxed">{topCatalyst.label}</p>
            <p className="text-xs text-slate-500 mt-2">
              Confidence: <span className={cn(
                topCatalyst.confidence === 'high' ? 'text-green-400' :
                topCatalyst.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400'
              )}>
                {topCatalyst.confidence}
              </span>
            </p>
          </div>
        )}

        {moveWithCatalysts.benchmarkComparison && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-xs text-slate-500">
              Benchmark: {move.returnPct >= 0 ? '+' : ''}{move.returnPct.toFixed(2)}% vs{' '}
              {moveWithCatalysts.benchmarkComparison.ticker} {moveWithCatalysts.benchmarkComparison.returnPct >= 0 ? '+' : ''}
              {moveWithCatalysts.benchmarkComparison.returnPct.toFixed(2)}% → excess{' '}
              {moveWithCatalysts.benchmarkComparison.excessReturnPct >= 0 ? '+' : ''}
              {moveWithCatalysts.benchmarkComparison.excessReturnPct.toFixed(2)}% ({moveWithCatalysts.benchmarkComparison.context})
            </p>
          </div>
        )}
      </Card>
    );
  }

  const { move, catalysts, aiExplanation, benchmarkComparison } = moveWithCatalysts;
  const topCatalyst = catalysts[0];

  return (
    <Card className="border border-white/10 bg-black/60 p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Why it moved</h2>
        <div className="flex items-center gap-3">
          <Badge 
            className={cn(
              move.direction === 'up' 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            )}
          >
            {move.direction === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {move.direction === 'up' ? '+' : ''}{move.returnPct.toFixed(2)}%
          </Badge>
          <span className="text-xs text-slate-500">{format(parseISO(move.date), 'MMM dd, yyyy')}</span>
        </div>
      </div>

      {aiExplanation ? (
        <>
          {/* Main Explanation */}
          <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h3 className="text-lg font-semibold text-emerald-300 mb-3">{aiExplanation.headline}</h3>
            <p className="text-sm text-slate-200 leading-relaxed">{aiExplanation.explanation}</p>
            {aiExplanation.certainty && (
              <div className="mt-3">
                <Badge 
                  className={cn(
                    'text-xs',
                    aiExplanation.certainty === 'high' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                    aiExplanation.certainty === 'med' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                    'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  )}
                >
                  Confidence: {aiExplanation.certainty}
                </Badge>
              </div>
            )}
          </div>

          {/* Key Drivers / Reasons */}
          {aiExplanation.drivers.length > 0 && (
            <div className="mb-6 rounded-lg border border-white/10 bg-black/40 p-5">
              <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wide flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Key Reasons
              </h4>
              <ul className="space-y-3">
                {aiExplanation.drivers.map((driver, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-slate-200">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-semibold">
                      {idx + 1}
                    </div>
                    <span className="flex-1 pt-0.5">{driver}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence / Citations */}
          {aiExplanation.citations.length > 0 && (
            <div className="mb-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-5">
              <h4 className="text-sm font-semibold text-blue-300 mb-3 uppercase tracking-wide flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Supporting Evidence
              </h4>
              <div className="space-y-3">
                {aiExplanation.citations.map((citation, idx) => (
                  <a
                    key={idx}
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 hover:border-blue-500/30 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors">{citation.title}</p>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                          <span>{citation.source}</span>
                          {citation.publishedAt && (
                            <>
                              <span>•</span>
                              <span>{format(parseISO(citation.publishedAt), 'MMM dd, yyyy')}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-400 flex-shrink-0 mt-1 transition-colors" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      ) : topCatalyst && topCatalyst.confidence !== 'low' ? (
        <>
          <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h3 className="text-lg font-semibold text-emerald-300 mb-3">Likely Reason</h3>
            <p className="text-sm text-slate-200 leading-relaxed">{topCatalyst.label}</p>
            <div className="mt-3">
              <Badge 
                className={cn(
                  'text-xs',
                  topCatalyst.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  topCatalyst.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                  'bg-rose-500/20 text-rose-300 border-rose-500/30'
                )}
              >
                Confidence: {topCatalyst.confidence}
              </Badge>
            </div>
          </div>
          {topCatalyst.newsEvidence && topCatalyst.newsEvidence.length > 0 && (
            <div className="mb-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-5">
              <h4 className="text-sm font-semibold text-blue-300 mb-3 uppercase tracking-wide flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Supporting News
              </h4>
              <div className="space-y-3">
                {topCatalyst.newsEvidence.map((ev, idx) => (
                  <a
                    key={idx}
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 hover:border-blue-500/30 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors">{ev.title}</p>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                          <span>{ev.source}</span>
                          {ev.publishedAt && (
                            <>
                              <span>•</span>
                              <span>{format(parseISO(ev.publishedAt), 'MMM dd, yyyy')}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-400 flex-shrink-0 mt-1 transition-colors" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mb-6 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-5">
          <h3 className="text-sm font-semibold text-yellow-300 mb-3 uppercase tracking-wide">Analysis Unavailable</h3>
          <p className="text-sm text-slate-200 leading-relaxed mb-3">
            No single dominant catalyst found. This move may reflect broader market or sector dynamics, or multiple smaller factors.
          </p>
          {benchmarkComparison && (
            <div className="mt-4 p-3 rounded-lg border border-white/10 bg-black/40">
              <p className="text-xs text-slate-400 mb-1">Benchmark Comparison:</p>
              <p className="text-sm text-slate-200">
                Stock {move.returnPct >= 0 ? '+' : ''}{move.returnPct.toFixed(2)}% vs {benchmarkComparison.ticker}{' '}
                {benchmarkComparison.returnPct >= 0 ? '+' : ''}{benchmarkComparison.returnPct.toFixed(2)}% → excess{' '}
                {benchmarkComparison.excessReturnPct >= 0 ? '+' : ''}{benchmarkComparison.excessReturnPct.toFixed(2)}% ({benchmarkComparison.context})
              </p>
            </div>
          )}
        </div>
      )}

      {benchmarkComparison && !(aiExplanation && aiExplanation.citations.length > 0) && (
        <div className="mt-6 pt-6 border-t border-white/10">
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <h4 className="text-xs font-semibold text-blue-300 mb-2 uppercase tracking-wide">Benchmark Context</h4>
            <p className="text-sm text-slate-200">
              {move.returnPct >= 0 ? '+' : ''}{move.returnPct.toFixed(2)}% vs {benchmarkComparison.ticker}{' '}
              {benchmarkComparison.returnPct >= 0 ? '+' : ''}{benchmarkComparison.returnPct.toFixed(2)}% → excess{' '}
              {benchmarkComparison.excessReturnPct >= 0 ? '+' : ''}{benchmarkComparison.excessReturnPct.toFixed(2)}% 
              {' '}({benchmarkComparison.context === 'idiosyncratic' ? 'Stock-specific move' : 'Market-driven move'})
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

// Ticker Search Component
function TickerSearch({
  value,
  onChange,
  savedTickers,
  onSaveTicker,
}: {
  value: string;
  onChange: (ticker: string) => void;
  savedTickers: string[];
  onSaveTicker: (ticker: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const popularTickers = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'META', 'TSLA', 'SPY', 'QQQ'];

  const suggestions = useMemo(() => {
    if (!value) return popularTickers.slice(0, 5);
    const upper = value.toUpperCase();
    return popularTickers.filter(t => t.includes(upper)).slice(0, 5);
  }, [value]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search ticker (e.g., AAPL, NVDA)"
          value={value}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase());
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          className="pl-10 pr-10 bg-black/40 border-white/10 text-white placeholder:text-slate-500"
        />
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
            onClick={() => {
              if (value && !savedTickers.includes(value)) {
                onSaveTicker(value);
              }
            }}
          >
            <Star className={cn('w-4 h-4', savedTickers.includes(value) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-400')} />
          </Button>
        )}
      </div>
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-white/10 rounded-lg shadow-lg">
          {suggestions.map((ticker) => (
            <button
              key={ticker}
              onClick={() => {
                onChange(ticker);
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 hover:bg-slate-800 text-white text-sm"
            >
              {ticker}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StockMoveExplainerPage() {
  const params = useParams();
  const router = useRouter();
  const tickerParam = (params.ticker as string)?.toUpperCase() || '';
  
  const [ticker, setTicker] = useState(tickerParam);
  const [selectedMove, setSelectedMove] = useState<MoveEvent | undefined>();
  const [interval, setInterval] = useState<Interval>('daily');
  const [savedTickers, setSavedTickers] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'YTD'>('3M');
  const [showVolume, setShowVolume] = useState(false);
  const [explainOnlyTopN, setExplainOnlyTopN] = useState(true); // Default to biggest movers only

  useEffect(() => {
    const saved = localStorage.getItem('savedTickers');
    if (saved) {
      setSavedTickers(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (ticker && ticker !== tickerParam) {
      router.push(`/stocks/${ticker}`);
    }
  }, [ticker, tickerParam, router]);

  const handleSaveTicker = (t: string) => {
    const updated = [...savedTickers, t].slice(0, 10); // Max 10 saved
    setSavedTickers(updated);
    localStorage.setItem('savedTickers', JSON.stringify(updated));
  };

  // Date range based on selection
  const { start: startDate, end: endDate } = getDateRangeFromSelection(dateRange);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['stock-moves', ticker, interval, dateRange, explainOnlyTopN, startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      if (!ticker) return null;
      const res = await fetch(
        `/api/stocks/catalysts?ticker=${ticker}&start=${startDate.toISOString().split('T')[0]}&end=${endDate.toISOString().split('T')[0]}&interval=${interval}&topN=10&includeAI=true&useStrictAI=true&includeBenchmark=true&explainOnlyTopN=${explainOnlyTopN}`
      );
      const json = (await res.json()) as ApiResponse<MoveExplainerResponse>;
      if (!json.ok) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data;
    },
    enabled: Boolean(ticker),
    staleTime: 5 * 60 * 1000,
  });

  // Auto-show volume if available
  useEffect(() => {
    if (data?.priceSeries && data.priceSeries.some(p => p.volume && p.volume > 0)) {
      setShowVolume(true);
    }
  }, [data]);

  const selectedMoveWithCatalysts = useMemo(() => {
    if (!selectedMove || !data) return null;
    return data.moves.find(m => m.move.date === selectedMove.date) || null;
  }, [selectedMove, data]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <MoveExplainerSkeleton />
      </div>
    );
  }

  if (isError || (!ticker && !isLoading)) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Card className="border border-white/10 bg-black/60 p-12">
          <div className="text-center max-w-md mx-auto">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-6" />
            <h2 className="text-2xl font-semibold text-white mb-3">Unable to load stock data</h2>
            <p className="text-slate-400 mb-2">
              {error instanceof Error ? error.message : 'Please try a different ticker or check your connection.'}
            </p>
            {!ticker && (
              <p className="text-sm text-slate-500 mb-6">Enter a ticker symbol to get started.</p>
            )}
            <div className="mt-6 max-w-xs mx-auto">
              <TickerSearch
                value={ticker}
                onChange={setTicker}
                savedTickers={savedTickers}
                onSaveTicker={handleSaveTicker}
              />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.moves.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border border-white/10 bg-black/60 p-12">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No moves found</h2>
            <p className="text-slate-400 mb-6">No significant price movements detected for {ticker} in this period.</p>
            <TickerSearch
              value={ticker}
              onChange={setTicker}
              savedTickers={savedTickers}
              onSaveTicker={handleSaveTicker}
            />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <TickerSearch
              value={ticker}
              onChange={setTicker}
              savedTickers={savedTickers}
              onSaveTicker={handleSaveTicker}
            />
          </div>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-2 bg-black/40 border border-white/10 rounded-lg p-1">
            <Button
              variant={interval === 'daily' ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-7 px-3 text-xs',
                interval === 'daily'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              )}
              onClick={() => setInterval('daily')}
            >
              Daily
            </Button>
            <Button
              variant={interval === 'weekly' ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-7 px-3 text-xs',
                interval === 'weekly'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              )}
              onClick={() => setInterval('weekly')}
            >
              Weekly
            </Button>
          </div>
        </div>
        
        {/* AI Explanation Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-4 h-4" />
            <span>AI Explanations:</span>
          </div>
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-1">
            <Toggle
              pressed={explainOnlyTopN}
              onPressedChange={setExplainOnlyTopN}
              className="h-7 px-3 text-xs"
            >
              Biggest movers only
            </Toggle>
            <Toggle
              pressed={!explainOnlyTopN}
              onPressedChange={(pressed) => setExplainOnlyTopN(!pressed)}
              className="h-7 px-3 text-xs"
            >
              Every period
            </Toggle>
          </div>
          <span className="text-xs text-slate-500">
            {explainOnlyTopN 
              ? '(Top 10 moves for faster performance)' 
              : '(All moves - may take longer)'}
          </span>
        </div>
        {savedTickers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Saved:</span>
            {savedTickers.map((t) => (
              <Button
                key={t}
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setTicker(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Price Chart */}
      <Card className="border border-white/10 bg-black/60 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{ticker} Price Movement</h2>
          {data.priceSeries.some(p => p.volume && p.volume > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-xs',
                showVolume
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border'
                  : 'text-slate-400 hover:text-white'
              )}
              onClick={() => setShowVolume(!showVolume)}
            >
              {showVolume ? 'Hide' : 'Show'} Volume
            </Button>
          )}
        </div>
        <PriceChart
          priceSeries={data.priceSeries}
          moves={data.moves.map(m => m.move)}
          selectedMove={selectedMove}
          onMoveSelect={setSelectedMove}
          interval={interval}
          showVolume={showVolume}
        />
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Move Timeline */}
        <Card className="border border-white/10 bg-black/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Significant Moves</h2>
          <MoveTimeline
            moves={data.moves}
            selectedMove={selectedMove}
            onMoveSelect={setSelectedMove}
            interval={interval}
          />
        </Card>

        {/* Move Detail */}
        <MoveDetail moveWithCatalysts={selectedMoveWithCatalysts} />
      </div>
    </div>
  );
}


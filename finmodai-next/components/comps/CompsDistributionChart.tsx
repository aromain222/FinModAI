"use client";

import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CompsOutput } from '@/lib/models/outputTypes';

export type MetricType = 'evRevenue' | 'evEbitda' | 'pe';

interface CompsDistributionChartProps {
  output: CompsOutput;
  targetTicker: string;
  selectedMetric: MetricType;
  onMetricChange?: (metric: MetricType) => void;
}

interface DistributionStats {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  targetValue?: number;
}

interface PeerDataPoint {
  ticker: string;
  value: number;
  isTarget: boolean;
}

export function CompsDistributionChart({ output, targetTicker, selectedMetric }: CompsDistributionChartProps) {

  // Calculate distribution stats for selected metric
  const distributionStats = useMemo((): DistributionStats | null => {
    // Get all peer values (excluding undefined)
    const peers = output.peers ?? [];
    const peerValues = peers
      .map((peer) => {
        if (selectedMetric === 'evRevenue') return peer.evRevenue;
        if (selectedMetric === 'evEbitda') return peer.evEbitda;
        return peer.pe;
      })
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    if (peerValues.length === 0) return null;

    const sorted = [...peerValues].sort((a, b) => a - b);
    const min = sorted[0]!;
    const max = sorted[sorted.length - 1]!;
    const median = output.summary[selectedMetric].median;
    const p25 = output.summary[selectedMetric].p25;
    const p75 = output.summary[selectedMetric].p75;

    const targetValue =
      selectedMetric === 'evRevenue'
        ? output.target.evRevenue
        : selectedMetric === 'evEbitda'
        ? output.target.evEbitda
        : output.target.pe;

    return {
      min,
      p25,
      median,
      p75,
      max,
      targetValue: typeof targetValue === 'number' && Number.isFinite(targetValue) ? targetValue : undefined,
    };
  }, [output, selectedMetric]);

  // Prepare peer data for scatter/bar chart
  const peerChartData = useMemo((): PeerDataPoint[] => {
    const peers = (output.peers ?? []).map((peer) => {
      const value =
        selectedMetric === 'evRevenue'
          ? peer.evRevenue
          : selectedMetric === 'evEbitda'
          ? peer.evEbitda
          : peer.pe;

      return {
        ticker: peer.ticker,
        value: typeof value === 'number' && Number.isFinite(value) ? value : 0,
        isTarget: false,
      };
    });

    // Add target if it has a value
    const targetValue =
      selectedMetric === 'evRevenue'
        ? output.target.evRevenue
        : selectedMetric === 'evEbitda'
        ? output.target.evEbitda
        : output.target.pe;

    if (typeof targetValue === 'number' && Number.isFinite(targetValue)) {
      peers.push({
        ticker: output.target.ticker,
        value: targetValue,
        isTarget: true,
      });
    }

    // Sort by value for better visualization
    return peers.sort((a, b) => a.value - b.value);
  }, [output, selectedMetric]);


  const metricLabel =
    selectedMetric === 'evRevenue' ? 'EV/Revenue' : selectedMetric === 'evEbitda' ? 'EV/EBITDA' : 'P/E';

  if (!distributionStats || peerChartData.length === 0) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg">Valuation Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-[var(--cb-text-muted)]">
            No data available for the selected metric
          </div>
        </CardContent>
      </Card>
    );
  }

  // Custom tooltip for peer chart
  const PeerTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload[0]) return null;
    const data = payload[0].payload as PeerDataPoint;

    return (
      <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-3 shadow-lg">
        <div className="text-xs font-semibold text-[var(--cb-text-primary)] mb-1">
          {data.isTarget ? `${data.ticker} (Target)` : data.ticker}
        </div>
        <div className="text-sm font-medium text-[var(--cb-text-primary)]">
          {metricLabel}: {data.value.toFixed(1)}
        </div>
      </div>
    );
  };

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle className="text-lg">Valuation Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Box Plot Visualization (simulated with reference lines and bars) */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">
            Distribution Statistics ({metricLabel})
          </h3>
          {/* Box plot visualization using HTML/CSS */}
          <div className="relative h-16 px-4 py-2">
            <div className="relative h-full flex items-center">
              {/* Calculate positions as percentages */}
              {(() => {
                const range = distributionStats.max - distributionStats.min;
                const minPos = 0;
                const p25Pos = ((distributionStats.p25 - distributionStats.min) / range) * 100;
                const medianPos = ((distributionStats.median - distributionStats.min) / range) * 100;
                const p75Pos = ((distributionStats.p75 - distributionStats.min) / range) * 100;
                const maxPos = 100;
                const targetPos =
                  distributionStats.targetValue !== undefined
                    ? ((distributionStats.targetValue - distributionStats.min) / range) * 100
                    : null;

                return (
                  <>
                    {/* Vertical line at min */}
                    <div
                      className="absolute h-6 w-0.5 bg-[var(--cb-text-muted)] opacity-50"
                      style={{ left: `${minPos}%`, top: '50%', transform: 'translateY(-50%)' }}
                    />
                    {/* Min to P25 whisker */}
                    <div
                      className="absolute h-0.5 bg-[var(--cb-text-muted)] opacity-50"
                      style={{ left: `${minPos}%`, width: `${p25Pos - minPos}%`, top: '50%', transform: 'translateY(-50%)' }}
                    />
                    {/* Vertical line at P25 */}
                    <div
                      className="absolute h-6 w-0.5 bg-[var(--cb-text-primary)] opacity-70"
                      style={{ left: `${p25Pos}%`, top: '50%', transform: 'translateY(-50%)' }}
                    />
                    {/* IQR Box */}
                    <div
                      className="absolute h-10 bg-[var(--cb-text-primary)] opacity-30 border border-[var(--cb-text-primary)]"
                      style={{ left: `${p25Pos}%`, width: `${p75Pos - p25Pos}%`, top: '50%', transform: 'translateY(-50%)' }}
                    />
                    {/* Median line inside box */}
                    <div
                      className="absolute h-10 w-1 bg-[var(--cb-text-primary)]"
                      style={{ left: `${medianPos}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
                    />
                    {/* Vertical line at P75 */}
                    <div
                      className="absolute h-6 w-0.5 bg-[var(--cb-text-primary)] opacity-70"
                      style={{ left: `${p75Pos}%`, top: '50%', transform: 'translateY(-50%)' }}
                    />
                    {/* P75 to Max whisker */}
                    <div
                      className="absolute h-0.5 bg-[var(--cb-text-muted)] opacity-50"
                      style={{ left: `${p75Pos}%`, width: `${maxPos - p75Pos}%`, top: '50%', transform: 'translateY(-50%)' }}
                    />
                    {/* Vertical line at max */}
                    <div
                      className="absolute h-6 w-0.5 bg-[var(--cb-text-muted)] opacity-50"
                      style={{ left: `${maxPos}%`, top: '50%', transform: 'translateY(-50%)' }}
                    />
                    {/* Target marker */}
                    {targetPos !== null && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[var(--cb-green)] rounded-full border-2 border-[var(--cb-surface)] shadow-lg z-10"
                        style={{ left: `${targetPos}%` }}
                        title={`${targetTicker}: ${distributionStats.targetValue!.toFixed(1)}`}
                      />
                    )}
                  </>
                );
              })()}
            </div>
            {/* Value labels below */}
            <div className="mt-3 flex justify-between text-xs text-[var(--cb-text-muted)]">
              <span className="text-[10px]">{distributionStats.min.toFixed(1)}</span>
              <span className="text-[10px]">{distributionStats.p25.toFixed(1)}</span>
              <span className="text-[10px] font-semibold text-[var(--cb-text-primary)]">{distributionStats.median.toFixed(1)}</span>
              <span className="text-[10px]">{distributionStats.p75.toFixed(1)}</span>
              <span className="text-[10px]">{distributionStats.max.toFixed(1)}</span>
            </div>
          </div>
          {/* Legend for box plot */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--cb-text-muted)]">
            <div className="flex items-center gap-2">
              <div className="h-0.5 w-4 bg-[var(--cb-text-muted)] opacity-50" />
              <span>Whiskers (Min/Max)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-6 bg-[var(--cb-text-primary)] opacity-30 border border-[var(--cb-text-primary)]" />
              <span>IQR (25th-75th)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-0.5 bg-[var(--cb-text-primary)]" />
              <span>Median</span>
            </div>
            {distributionStats.targetValue !== undefined && (
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[var(--cb-green)] border-2 border-[var(--cb-surface)]" />
                <span className="text-[var(--cb-green)]">Target ({targetTicker})</span>
              </div>
            )}
          </div>
        </div>

        {/* Peer Comparison Chart */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">
            Peer Comparison ({metricLabel})
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={peerChartData}
                margin={{ top: 10, right: 10, bottom: 40, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cb-border-subtle)" opacity={0.3} />
                <XAxis
                  dataKey="ticker"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fill: 'var(--cb-text-muted)', fontSize: 10 }}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: 'var(--cb-text-muted)', fontSize: 11 }}
                  label={{ value: metricLabel, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                />
                <Tooltip content={<PeerTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {peerChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isTarget ? 'var(--cb-green)' : 'var(--cb-text-primary)'}
                      opacity={entry.isTarget ? 0.8 : 0.6}
                    />
                  ))}
                </Bar>
                {/* Median reference line */}
                <ReferenceLine
                  y={distributionStats.median}
                  stroke="var(--cb-text-muted)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  label={{ value: 'Median', position: 'right', fill: 'var(--cb-text-muted)', fontSize: 9 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


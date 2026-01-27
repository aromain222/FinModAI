'use client';

import React, { useMemo, useState } from 'react';
import { ArrowUpRight, TrendingUp as RiseIcon, TrendingDown as FallIcon } from 'lucide-react';
import { fmtPct } from '@/lib/utils/percent';
import type { ChartPoint } from '@/lib/charts/normalizeChartSeries';
import { BenchmarkLine } from '@/components/charts/recharts/BenchmarkLine';

interface MarketIndexData {
  symbol: string;
  name: string;
  data: ChartPoint[];
  loading: boolean;
  error: string | null;
  changePct: number | null;
}

interface SectorData {
  sector: string;
  returnPct: number;
  returnPctValid?: boolean;
  returnPctReason?: string;
}

interface TopStockData {
  ticker: string;
  name?: string;
  changePct: number;
  changePctValid?: boolean;
  changePctReason?: string;
  reason?: string;
}

export interface MarketSnapshotProps {
  range: string;
  indices: MarketIndexData[];
  sectors: SectorData[];
  topStocks: TopStockData[];
  onRetry: () => void;
}

// Benchmark options for dropdown
const BENCHMARK_OPTIONS = [
  { value: 'SPY', label: 'S&P 500 (SPY)' },
  { value: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
  { value: 'IWM', label: 'Russell 2000 (IWM)' },
];

export function MarketSnapshot({
  range,
  indices,
  sectors,
  topStocks,
  onRetry,
}: MarketSnapshotProps) {
  const safeIndices = Array.isArray(indices) ? indices : [];
  const safeSectors = Array.isArray(sectors) ? sectors : [];
  const safeTopStocks = Array.isArray(topStocks) ? topStocks : [];
  
  // Selected benchmark state (default to SPY)
  const [selectedBenchmark, setSelectedBenchmark] = useState('SPY');
  
  // Find the selected index data
  const selectedIndex = useMemo(() => {
    return safeIndices.find(idx => idx.symbol === selectedBenchmark) || {
      symbol: selectedBenchmark,
      name: BENCHMARK_OPTIONS.find(b => b.value === selectedBenchmark)?.label || selectedBenchmark,
      data: [],
      loading: false,
      error: 'Data not available',
      changePct: null,
    };
  }, [safeIndices, selectedBenchmark]);
  
  // Separate rising and falling sectors
  const { rising, falling } = useMemo(() => {
    const sorted = [...safeSectors].sort((a, b) => b.returnPct - a.returnPct);
    return {
      rising: sorted.slice(0, 5),
      falling: sorted.slice(-5).reverse(),
    };
  }, [safeSectors]);

  // Filter top stocks with valid data
  const validTopStocks = useMemo(() => {
    return safeTopStocks.filter((s) => s.changePctValid !== false).slice(0, 5);
  }, [safeTopStocks]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ArrowUpRight className="h-5 w-5 text-[var(--cb-accent-text,rgb(56,189,248))]" />
          <h2 className="text-lg font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
            Market Snapshot
          </h2>
          <span className="text-xs text-[var(--cb-text-muted,#9ca3af)]">
            {range} window
          </span>
        </div>
        
        {/* Benchmark Selector in Header */}
        <select
          value={selectedBenchmark}
          onChange={(e) => setSelectedBenchmark(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--cb-text-body,#d1d5db)] transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--cb-accent-text,rgb(56,189,248))] focus:ring-offset-0"
        >
          {BENCHMARK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#0f1117] text-[var(--cb-text-body,#d1d5db)]">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Grid: Chart Left, Sidebar Right */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* LEFT: Large Chart Card (2/3 width on desktop) */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 lg:col-span-2">
          {/* Chart Header */}
          <div className="mb-3 flex items-center gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
                {selectedIndex.name}
              </div>
              <div className="mt-0.5 text-xs text-[var(--cb-text-muted,#9ca3af)]">
                {selectedIndex.symbol}
              </div>
            </div>
            {selectedIndex.changePct !== null && !selectedIndex.loading && !selectedIndex.error && (
              <div
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                  selectedIndex.changePct >= 0
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                }`}
              >
                {selectedIndex.changePct >= 0 ? (
                  <RiseIcon className="h-3 w-3" />
                ) : (
                  <FallIcon className="h-3 w-3" />
                )}
                <span>{fmtPct(selectedIndex.changePct)}</span>
              </div>
            )}
          </div>

          {/* Chart */}
          {selectedIndex.loading ? (
            <div className="h-[300px] animate-pulse rounded-lg bg-white/5 lg:h-[420px]" />
          ) : selectedIndex.error ? (
            <div className="flex h-[300px] items-center justify-center rounded-lg bg-red-500/5 px-3 lg:h-[420px]">
              <p className="text-center text-xs text-[var(--cb-text-muted,#9ca3af)]">
                Data unavailable for this window
              </p>
            </div>
          ) : selectedIndex.data.length > 0 ? (
            <div className="h-[300px] w-full overflow-hidden lg:h-[420px]">
              <BenchmarkLine
                data={selectedIndex.data}
                range={range}
                scale="Price"
                loading={false}
                error={null}
                onRetry={onRetry}
                label={selectedIndex.name}
                strokeColor={selectedIndex.changePct !== null && selectedIndex.changePct >= 0 ? '#52c41a' : '#ff4d4f'}
              />
            </div>
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded-lg bg-white/5 px-3 lg:h-[420px]">
              <p className="text-xs text-[var(--cb-text-muted,#9ca3af)]">No data</p>
            </div>
          )}
        </div>

        {/* RIGHT: Sidebar with Sectors and Stocks (1/3 width on desktop) */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          {/* Rising Sectors */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <RiseIcon className="h-4 w-4 text-green-400" />
              <h3 className="text-sm font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
                Rising Sectors
              </h3>
            </div>
            {rising.length > 0 ? (
              <div className="max-h-56 space-y-2 overflow-auto">
                {rising.map((sector, idx) => (
                  <div
                    key={sector.sector || idx}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-[var(--cb-text-body,#d1d5db)]">
                      {sector.sector}
                    </span>
                    {sector.returnPctValid !== false ? (
                      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-400">
                        {fmtPct(sector.returnPct)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-[var(--cb-text-muted,#9ca3af)]">
                        —
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center">
                <p className="text-center text-xs text-[var(--cb-text-muted,#9ca3af)]">
                  Sector performance unavailable for this window
                </p>
              </div>
            )}
          </div>

          {/* Falling Sectors */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <FallIcon className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
                Falling Sectors
              </h3>
            </div>
            {falling.length > 0 ? (
              <div className="max-h-56 space-y-2 overflow-auto">
                {falling.map((sector, idx) => (
                  <div
                    key={sector.sector || idx}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-[var(--cb-text-body,#d1d5db)]">
                      {sector.sector}
                    </span>
                    {sector.returnPctValid !== false ? (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-400">
                        {fmtPct(sector.returnPct)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-[var(--cb-text-muted,#9ca3af)]">
                        —
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center">
                <p className="text-center text-xs text-[var(--cb-text-muted,#9ca3af)]">
                  Sector performance unavailable for this window
                </p>
              </div>
            )}
          </div>

          {/* Top Stocks to Watch */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
              Top Stocks to Watch
            </h3>
            {validTopStocks.length > 0 ? (
              <div className="max-h-56 space-y-3 overflow-auto">
                {validTopStocks.map((stock, idx) => (
                  <div key={stock.ticker || idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
                        {stock.ticker}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          stock.changePct >= 0
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {fmtPct(stock.changePct)}
                      </span>
                    </div>
                    {stock.reason && (
                      <p className="text-xs leading-tight text-[var(--cb-text-muted,#9ca3af)]">
                        {stock.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center">
                <p className="text-center text-xs text-[var(--cb-text-muted,#9ca3af)]">
                  No stocks to watch for this window
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Unit tests for benchmark comparison
 */

import {
  getDefaultBenchmarkTicker,
  isTechHeavyTicker,
  classifyMove,
  computeBenchmarkReturn,
  enrichMovesWithBenchmark,
} from './benchmark';
import type { MoveEvent } from './move_detection';
import type { MarketProvider, PriceBar } from '../lib/market_data/providers/types';

describe('benchmark', () => {
  describe('getDefaultBenchmarkTicker', () => {
    it('should return SPY for non-tech tickers', () => {
      expect(getDefaultBenchmarkTicker('JPM')).toBe('SPY');
      expect(getDefaultBenchmarkTicker('BAC')).toBe('SPY');
      expect(getDefaultBenchmarkTicker('WMT')).toBe('SPY');
    });

    it('should return QQQ for tech tickers', () => {
      expect(getDefaultBenchmarkTicker('AAPL')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('NVDA')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('MSFT')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('GOOGL')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('META')).toBe('QQQ');
    });

    it('should be case-insensitive', () => {
      expect(getDefaultBenchmarkTicker('aapl')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('AAPL')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('AaPl')).toBe('QQQ');
    });
  });

  describe('isTechHeavyTicker', () => {
    it('should identify tech tickers', () => {
      expect(isTechHeavyTicker('AAPL')).toBe(true);
      expect(isTechHeavyTicker('NVDA')).toBe(true);
      expect(isTechHeavyTicker('TSLA')).toBe(true);
    });

    it('should not identify non-tech tickers', () => {
      expect(isTechHeavyTicker('JPM')).toBe(false);
      expect(isTechHeavyTicker('BAC')).toBe(false);
      expect(isTechHeavyTicker('WMT')).toBe(false);
    });
  });

  describe('classifyMove', () => {
    it('should classify daily moves correctly', () => {
      // Idiosyncratic (excess > 1.5%)
      expect(classifyMove(2.0, 'daily')).toBe('idiosyncratic');
      expect(classifyMove(-2.0, 'daily')).toBe('idiosyncratic');
      expect(classifyMove(1.6, 'daily')).toBe('idiosyncratic');

      // Market-driven (excess <= 1.5%)
      expect(classifyMove(1.5, 'daily')).toBe('market-driven');
      expect(classifyMove(-1.5, 'daily')).toBe('market-driven');
      expect(classifyMove(0.5, 'daily')).toBe('market-driven');
      expect(classifyMove(0, 'daily')).toBe('market-driven');
    });

    it('should classify weekly moves correctly', () => {
      // Idiosyncratic (excess > 3%)
      expect(classifyMove(4.0, 'weekly')).toBe('idiosyncratic');
      expect(classifyMove(-4.0, 'weekly')).toBe('idiosyncratic');
      expect(classifyMove(3.1, 'weekly')).toBe('idiosyncratic');

      // Market-driven (excess <= 3%)
      expect(classifyMove(3.0, 'weekly')).toBe('market-driven');
      expect(classifyMove(-3.0, 'weekly')).toBe('market-driven');
      expect(classifyMove(1.0, 'weekly')).toBe('market-driven');
    });
  });

  describe('computeBenchmarkReturn', () => {
    it('should compute return when both bars found', () => {
      const benchmarkBars: Array<{ date: string; close: number }> = [
        { date: '2024-01-09', close: 100 },
        { date: '2024-01-10', close: 105 }, // +5%
      ];

      const result = computeBenchmarkReturn(benchmarkBars, '2024-01-10', '2024-01-09');

      expect(result.found).toBe(true);
      expect(result.returnPct).toBe(5.0);
    });

    it('should return found=false when bars not found', () => {
      const benchmarkBars: Array<{ date: string; close: number }> = [
        { date: '2024-01-09', close: 100 },
      ];

      const result = computeBenchmarkReturn(benchmarkBars, '2024-01-10', '2024-01-09');

      expect(result.found).toBe(false);
      expect(result.returnPct).toBe(0);
    });

    it('should use previous bar in series if previousDate not provided', () => {
      const benchmarkBars: Array<{ date: string; close: number }> = [
        { date: '2024-01-09', close: 100 },
        { date: '2024-01-10', close: 105 },
      ];

      const result = computeBenchmarkReturn(benchmarkBars, '2024-01-10');

      expect(result.found).toBe(true);
      expect(result.returnPct).toBe(5.0);
    });
  });

  describe('enrichMovesWithBenchmark', () => {
    const mockProvider: MarketProvider = {
      async getPriceSeries(params: PriceSeriesParams): Promise<PriceBar[]> {
        if (params.ticker === 'SPY') {
          return [
            { date: '2024-01-09', close: 100 },
            { date: '2024-01-10', close: 102 }, // +2%
          ];
        }
        return [];
      },
      async searchNews() {
        return [];
      },
      async getCompanyEvents() {
        return [];
      },
    };

    it('should enrich moves with benchmark data', async () => {
      const moves: MoveEvent[] = [
        {
          date: '2024-01-10',
          returnPct: 8.0,
          direction: 'up',
          rank: 1,
          close: 150,
          previousClose: 138,
        },
      ];

      const enriched = await enrichMovesWithBenchmark(moves, 'SPY', 'daily', mockProvider);

      expect(enriched.length).toBe(1);
      expect(enriched[0].benchmarkReturnPct).toBe(2.0);
      expect(enriched[0].excessReturnPct).toBeCloseTo(6.0, 2); // 8% - 2%
      expect(enriched[0].moveClass).toBe('idiosyncratic'); // 6% > 1.5% threshold
      expect(enriched[0].benchmarkTicker).toBe('SPY');
    });

    it('should handle market-driven moves', async () => {
      const moves: MoveEvent[] = [
        {
          date: '2024-01-10',
          returnPct: 2.0,
          direction: 'up',
          rank: 1,
          close: 102,
          previousClose: 100,
        },
      ];

      const enriched = await enrichMovesWithBenchmark(moves, 'SPY', 'daily', mockProvider);

      expect(enriched.length).toBe(1);
      expect(enriched[0].excessReturnPct).toBeCloseTo(0.0, 2); // 2% - 2%
      expect(enriched[0].moveClass).toBe('market-driven'); // 0% <= 1.5% threshold
    });

    it('should handle empty moves array', async () => {
      const enriched = await enrichMovesWithBenchmark([], 'SPY', 'daily', mockProvider);

      expect(enriched).toEqual([]);
    });

    it('should handle provider errors gracefully', async () => {
      const failingProvider: MarketProvider = {
        async getPriceSeries() {
          throw new Error('Provider failed');
        },
        async searchNews() {
          return [];
        },
        async getCompanyEvents() {
          return [];
        },
      };

      const moves: MoveEvent[] = [
        {
          date: '2024-01-10',
          returnPct: 8.0,
          direction: 'up',
          rank: 1,
          close: 150,
        },
      ];

      const enriched = await enrichMovesWithBenchmark(moves, 'SPY', 'daily', failingProvider);

      // Should return moves with default benchmark values (graceful degradation)
      expect(enriched.length).toBe(1);
      expect(enriched[0].benchmarkReturnPct).toBe(0);
      expect(enriched[0].excessReturnPct).toBe(8.0); // Same as stock return
      expect(enriched[0].moveClass).toBe('idiosyncratic');
    });
  });
});


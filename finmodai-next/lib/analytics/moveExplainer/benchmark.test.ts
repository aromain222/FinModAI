/**
 * Tests for benchmark classification logic
 */

import { describe, it, expect } from 'vitest';
import { classifyMove, getDefaultBenchmarkTicker, isTechHeavyTicker, computeBenchmarkReturn } from './benchmark';

describe('Benchmark Classification', () => {
  describe('classifyMove', () => {
    it('classifies daily moves as idiosyncratic when excess > 1.5%', () => {
      expect(classifyMove(2.0, 'daily')).toBe('idiosyncratic');
      expect(classifyMove(-2.0, 'daily')).toBe('idiosyncratic');
      expect(classifyMove(1.6, 'daily')).toBe('idiosyncratic');
    });
    
    it('classifies daily moves as market-driven when excess <= 1.5%', () => {
      expect(classifyMove(1.0, 'daily')).toBe('market-driven');
      expect(classifyMove(-1.0, 'daily')).toBe('market-driven');
      expect(classifyMove(1.5, 'daily')).toBe('idiosyncratic'); // > threshold
      expect(classifyMove(0.5, 'daily')).toBe('market-driven');
    });
    
    it('classifies weekly moves as idiosyncratic when excess > 3%', () => {
      expect(classifyMove(4.0, 'weekly')).toBe('idiosyncratic');
      expect(classifyMove(-4.0, 'weekly')).toBe('idiosyncratic');
      expect(classifyMove(3.1, 'weekly')).toBe('idiosyncratic');
    });
    
    it('classifies weekly moves as market-driven when excess <= 3%', () => {
      expect(classifyMove(2.0, 'weekly')).toBe('market-driven');
      expect(classifyMove(-2.0, 'weekly')).toBe('market-driven');
      expect(classifyMove(3.0, 'weekly')).toBe('market-driven'); // <= threshold
      expect(classifyMove(1.0, 'weekly')).toBe('market-driven');
    });
  });
  
  describe('getDefaultBenchmarkTicker', () => {
    it('returns QQQ for tech-heavy tickers', () => {
      expect(getDefaultBenchmarkTicker('AAPL')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('NVDA')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('MSFT')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('GOOGL')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('META')).toBe('QQQ');
      expect(getDefaultBenchmarkTicker('AMD')).toBe('QQQ');
    });
    
    it('returns SPY for non-tech tickers', () => {
      expect(getDefaultBenchmarkTicker('JPM')).toBe('SPY');
      expect(getDefaultBenchmarkTicker('JNJ')).toBe('SPY');
      expect(getDefaultBenchmarkTicker('XOM')).toBe('SPY');
      expect(getDefaultBenchmarkTicker('WMT')).toBe('SPY');
    });
  });
  
  describe('isTechHeavyTicker', () => {
    it('identifies tech tickers correctly', () => {
      expect(isTechHeavyTicker('AAPL')).toBe(true);
      expect(isTechHeavyTicker('NVDA')).toBe(true);
      expect(isTechHeavyTicker('MSFT')).toBe(true);
      expect(isTechHeavyTicker('GOOGL')).toBe(true);
    });
    
    it('identifies non-tech tickers correctly', () => {
      expect(isTechHeavyTicker('JPM')).toBe(false);
      expect(isTechHeavyTicker('XOM')).toBe(false);
      expect(isTechHeavyTicker('WMT')).toBe(false);
    });
  });
  
  describe('computeBenchmarkReturn', () => {
    it('computes benchmark return correctly', () => {
      const benchmarkBars = [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 101 },
        { date: '2024-01-03', close: 102 },
      ];
      
      const result = computeBenchmarkReturn(benchmarkBars, '2024-01-02', '2024-01-01');
      expect(result.found).toBe(true);
      expect(result.returnPct).toBeCloseTo(1.0); // (101 - 100) / 100 * 100 = 1%
    });
    
    it('uses previous bar in series if previousDate not found', () => {
      const benchmarkBars = [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 101 },
        { date: '2024-01-03', close: 102 },
      ];
      
      const result = computeBenchmarkReturn(benchmarkBars, '2024-01-02');
      expect(result.found).toBe(true);
      expect(result.returnPct).toBeCloseTo(1.0); // Uses previous bar (2024-01-01)
    });
    
    it('returns found=false when move date not found', () => {
      const benchmarkBars = [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 101 },
      ];
      
      const result = computeBenchmarkReturn(benchmarkBars, '2024-01-10');
      expect(result.found).toBe(false);
      expect(result.returnPct).toBe(0);
    });
    
    it('returns found=false when insufficient data', () => {
      const benchmarkBars = [
        { date: '2024-01-02', close: 101 },
      ];
      
      const result = computeBenchmarkReturn(benchmarkBars, '2024-01-02');
      expect(result.found).toBe(false);
      expect(result.returnPct).toBe(0);
    });
  });
});

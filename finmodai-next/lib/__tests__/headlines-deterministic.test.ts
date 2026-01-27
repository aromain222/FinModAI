/**
 * Contract Tests for Deterministic Headlines
 * 
 * Verifies that deterministicHeadlines() always returns headlines with required fields:
 * - id, canonicalTitle, impactBullets (length >= 1), topic, confidence
 * 
 * This prevents regressions where UI expects canonicalTitle/impactBullets and they disappear.
 * 
 * Run with: npm test lib/__tests__/headlines-deterministic.test.ts
 */

import { describe, test, expect } from 'vitest';
import { deterministicHeadlines, type DeterministicHeadline } from '../headlines/deterministic';

// Sample raw headline data that mimics real provider responses
const SAMPLE_RAW_HEADLINES = [
  {
    id: 'test-1',
    title: 'Apple Inc. (AAPL) Reports Q4 Earnings Beat - Reuters',
    source: 'Reuters',
    publishedAt: '2024-01-15T10:30:00Z',
    url: 'https://example.com/apple-earnings',
    tickers: ['AAPL'],
  },
  {
    id: 'test-2',
    title: 'Federal Reserve raises interest rates unexpectedly | CNBC',
    source: 'CNBC',
    publishedAt: '2024-01-15T14:00:00Z',
    url: 'https://example.com/fed-rates',
  },
  {
    id: 'test-3',
    title: 'Oil prices surge after Venezuela military escalation',
    source: 'Bloomberg',
    publishedAt: '2024-01-15T16:00:00Z',
    url: 'https://example.com/oil-venezuela',
  },
  {
    id: 'test-4',
    title: 'Microsoft (MSFT) and Amazon (AMZN) merger deal announced - $50B',
    source: 'WSJ',
    publishedAt: '2024-01-15T12:00:00Z',
    url: 'https://example.com/merger',
  },
  {
    id: 'test-5',
    title: 'Goldman Sachs upgrades Tesla (TSLA) to Buy, raises price target to $250',
    source: 'Seeking Alpha',
    publishedAt: '2024-01-15T09:00:00Z',
    url: 'https://example.com/analyst',
  },
  {
    id: 'test-6',
    title: 'General market update',
    source: 'MarketWatch',
    publishedAt: '2024-01-15T11:00:00Z',
  },
  // Edge cases
  {
    id: 'test-7',
    title: '', // Empty title should be filtered out
    source: 'Test',
  },
  {
    id: 'test-8',
    headline: 'Alternative headline field', // Test headline fallback
    source: 'Test',
    publishedAt: '2024-01-15T10:00:00Z',
  },
];

describe('deterministicHeadlines', () => {
  test('returns array with deterministic fields for valid headlines', () => {
    const result = deterministicHeadlines(SAMPLE_RAW_HEADLINES);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    
    // Filter out empty titles - should have at least 6 valid items
    expect(result.length).toBeGreaterThanOrEqual(6);
  });

  test('each output has required fields: id, canonicalTitle, impactBullets, topic, confidence', () => {
    const result = deterministicHeadlines(SAMPLE_RAW_HEADLINES);
    
    result.forEach((headline: DeterministicHeadline, index: number) => {
      // ID must be present and non-empty
      expect(headline.id).toBeDefined();
      expect(typeof headline.id).toBe('string');
      expect(headline.id.length).toBeGreaterThan(0);
      
      // Canonical title must be present and non-empty
      expect(headline.canonicalTitle).toBeDefined();
      expect(typeof headline.canonicalTitle).toBe('string');
      expect(headline.canonicalTitle.length).toBeGreaterThan(0);
      
      // Impact bullets must be an array with 2-4 items (contract requirement)
      expect(Array.isArray(headline.impactBullets)).toBe(true);
      expect(headline.impactBullets.length).toBeGreaterThanOrEqual(2);
      expect(headline.impactBullets.length).toBeLessThanOrEqual(4);
      
      // Each impact bullet must be a non-empty string
      headline.impactBullets.forEach((bullet: string) => {
        expect(typeof bullet).toBe('string');
        expect(bullet.length).toBeGreaterThan(0);
      });
      
      // Topic must be a valid HeadlineTopic
      expect(headline.topic).toBeDefined();
      expect(['equities', 'macro', 'rates', 'commodities', 'crypto', 'geopolitics']).toContain(headline.topic);
      
      // Impact must be a valid HeadlineImpact
      expect(headline.impact).toBeDefined();
      expect(['positive', 'neutral', 'negative']).toContain(headline.impact);
      
      // Confidence must be a number between 0 and 1
      expect(typeof headline.confidence).toBe('number');
      expect(headline.confidence).toBeGreaterThanOrEqual(0);
      expect(headline.confidence).toBeLessThanOrEqual(1);
    });
  });

  test('canonicalTitle is cleaned (no source suffixes)', () => {
    const result = deterministicHeadlines(SAMPLE_RAW_HEADLINES);
    
    result.forEach((headline: DeterministicHeadline) => {
      // Should not contain common source suffixes
      expect(headline.canonicalTitle).not.toMatch(/\s*-\s*Reuters$/i);
      expect(headline.canonicalTitle).not.toMatch(/\s*\|\s*CNBC$/i);
      expect(headline.canonicalTitle).not.toMatch(/\s*-\s*Bloomberg$/i);
      expect(headline.canonicalTitle).not.toMatch(/\s*-\s*WSJ$/i);
    });
  });

  test('handles empty input gracefully', () => {
    expect(deterministicHeadlines([])).toEqual([]);
    expect(deterministicHeadlines(null as any)).toEqual([]);
    expect(deterministicHeadlines(undefined as any)).toEqual([]);
  });

  test('filters out items with empty titles after cleaning', () => {
    const emptyTitleHeadlines = [
      { id: '1', title: '   ', source: 'Test' },
      { id: '2', title: '', source: 'Test' },
      { id: '3', title: 'Valid Title', source: 'Test', publishedAt: '2024-01-15T10:00:00Z' },
    ];
    
    const result = deterministicHeadlines(emptyTitleHeadlines);
    expect(result.length).toBe(1);
    expect(result[0].canonicalTitle).toBe('Valid Title');
  });

  test('impactBullets are topic-appropriate and have 2-4 items', () => {
    const result = deterministicHeadlines(SAMPLE_RAW_HEADLINES);
    
    result.forEach((headline: DeterministicHeadline) => {
      // Impact bullets should exist and have 2-4 items (contract requirement)
      expect(headline.impactBullets.length).toBeGreaterThanOrEqual(2);
      expect(headline.impactBullets.length).toBeLessThanOrEqual(4);
      
      // Impact bullets should be strings
      headline.impactBullets.forEach((bullet: string) => {
        expect(typeof bullet).toBe('string');
        expect(bullet.trim().length).toBeGreaterThan(0);
      });
    });
  });

  test('tickers are extracted correctly', () => {
    const tickerHeadlines = [
      { id: '1', title: 'Apple (AAPL) beats earnings', source: 'Test', publishedAt: '2024-01-15T10:00:00Z' },
      { id: '2', title: 'Microsoft $MSFT and Tesla $TSLA rally', source: 'Test', publishedAt: '2024-01-15T10:00:00Z' },
    ];
    
    const result = deterministicHeadlines(tickerHeadlines);
    expect(result.length).toBe(2);
    expect(result[0].tickers).toContain('AAPL');
    expect(result[1].tickers.length).toBeGreaterThan(0);
  });

  test('confidence is calculated based on available fields', () => {
    const fullHeadlines = [
      {
        id: '1',
        title: 'Apple beats earnings',
        source: 'Reuters',
        publishedAt: '2024-01-15T10:00:00Z',
        url: 'https://example.com',
      },
    ];
    
    const result = deterministicHeadlines(fullHeadlines);
    expect(result.length).toBe(1);
    expect(result[0].confidence).toBeGreaterThan(0.5); // Should be higher with full data
  });

  test('handles malformed items gracefully', () => {
    const malformedHeadlines = [
      { id: '1', title: 'Valid', source: 'Test', publishedAt: '2024-01-15T10:00:00Z' },
      { invalid: 'data' }, // Missing title
      null,
      undefined,
      { id: '2', title: 'Also Valid', source: 'Test' },
    ];
    
    const result = deterministicHeadlines(malformedHeadlines as any);
    // Should filter out invalid items but keep valid ones
    expect(result.length).toBeGreaterThanOrEqual(2);
    result.forEach((headline) => {
      expect(headline.canonicalTitle).toBeDefined();
      expect(headline.canonicalTitle.length).toBeGreaterThan(0);
    });
  });

  test('ids are stable and unique for same input', () => {
    const headlines = [
      { id: '1', title: 'Test headline', source: 'Test', publishedAt: '2024-01-15T10:00:00Z', url: 'https://example.com' },
    ];
    
    const result1 = deterministicHeadlines(headlines);
    const result2 = deterministicHeadlines(headlines);
    
    expect(result1.length).toBe(1);
    expect(result2.length).toBe(1);
    expect(result1[0].id).toBe(result2[0].id); // Should be stable
  });
});

// Optional: Test against real endpoint in dev mode
// This can be enabled when running in development
describe('deterministicHeadlines integration (optional)', () => {
  test.skip('real endpoint returns headlines with deterministic fields', async () => {
    // Only run if NEXT_PUBLIC_API_URL or similar is set
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    
    try {
      const response = await fetch(`${apiUrl}/api/market-brief/headlines?range=1D&limit=5`);
      const data = await response.json();
      
      if (data.ok && data.data?.items) {
        const items = data.data.items;
        
        // Check that at least some items have deterministic fields
        const withDeterministic = items.filter(
          (item: any) => item.canonicalTitle && Array.isArray(item.impactBullets) && item.impactBullets.length > 0
        );
        
        // In dev mode, at least some items should have deterministic fields
        if (items.length > 0) {
          expect(withDeterministic.length).toBeGreaterThan(0);
        }
      }
    } catch (error) {
      // Skip if endpoint not available (e.g., in CI)
      console.warn('Skipping integration test - endpoint not available:', error);
    }
  });
});


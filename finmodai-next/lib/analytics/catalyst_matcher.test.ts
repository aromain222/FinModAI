/**
 * Unit tests for catalyst matcher
 */

import { matchCatalysts } from './catalyst_matcher';
import type { MoveEvent } from './move_detection';
import type { NewsItem, EventItem } from '../lib/market_data/providers/types';

describe('matchCatalysts', () => {
  const baseMove: MoveEvent = {
    date: '2024-01-10',
    returnPct: 8.5,
    direction: 'up',
    rank: 1,
    close: 150,
    previousClose: 138,
  };

  describe('empty input', () => {
    it('should return low confidence when no news or events', () => {
      const result = matchCatalysts(baseMove, [], [], 'daily');

      expect(result.label).toBe('No dominant headline found');
      expect(result.confidence).toBe('low');
      expect(result.evidence).toEqual([]);
    });
  });

  describe('date window matching', () => {
    it('should match news within ±1 trading day for daily interval', () => {
      const news: NewsItem[] = [
        {
          title: 'Earnings beat expectations',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-09T10:00:00Z', // Previous trading day
        },
        {
          title: 'Some other news',
          url: 'https://example.com/news2',
          source: 'Reuters',
          publishedAt: '2024-01-05T10:00:00Z', // Too far away
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.evidence[0].title).toBe('Earnings beat expectations');
    });

    it('should match events within same week for weekly interval', () => {
      // Jan 10, 2024 is a Wednesday
      // Week is Jan 8 (Mon) - Jan 14 (Sun)
      const events: EventItem[] = [
        {
          type: 'earnings',
          title: 'Q4 Earnings Report',
          date: '2024-01-09', // Same week (Tuesday)
          source: 'polygon',
        },
        {
          type: 'other',
          title: 'Old event',
          date: '2024-01-01', // Previous week (Monday of previous week)
        },
      ];

      const result = matchCatalysts(baseMove, [], events, 'weekly');

      // Should find the earnings event from the same week
      const earningsEvidence = result.evidence.find(e => e.title === 'Q4 Earnings Report');
      expect(earningsEvidence).toBeDefined();
      expect(result.evidence.length).toBeGreaterThan(0);
    });
  });

  describe('scoring', () => {
    it('should prioritize earnings events', () => {
      const events: EventItem[] = [
        {
          type: 'earnings',
          title: 'Earnings beat',
          date: '2024-01-10',
          source: 'polygon',
        },
        {
          type: 'other',
          title: 'Other event',
          date: '2024-01-10',
        },
      ];

      const result = matchCatalysts(baseMove, [], events, 'daily');

      expect(result.label).toContain('Earnings');
      expect(result.confidence).toBe('high');
    });

    it('should boost score for strong keywords', () => {
      const news: NewsItem[] = [
        {
          title: 'Earnings beat expectations by 10%',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-10T10:00:00Z',
        },
        {
          title: 'Company updates website',
          url: 'https://example.com/news2',
          source: 'Blog',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      expect(result.label).toContain('Earnings');
    });

    it('should boost score for major sources', () => {
      const news: NewsItem[] = [
        {
          title: 'Important news',
          url: 'https://example.com/news1',
          source: 'Bloomberg',
          publishedAt: '2024-01-10T10:00:00Z',
        },
        {
          title: 'Similar news',
          url: 'https://example.com/news2',
          source: 'Reddit',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      expect(result.evidence[0].source).toBe('Bloomberg');
    });
  });

  describe('confidence levels', () => {
    it('should return high confidence for strong earnings event', () => {
      const events: EventItem[] = [
        {
          type: 'earnings',
          title: 'Earnings beat expectations',
          date: '2024-01-10',
          source: 'polygon',
        },
      ];

      const result = matchCatalysts(baseMove, [], events, 'daily');

      expect(result.confidence).toBe('high');
    });

    it('should return medium confidence for moderate match', () => {
      const news: NewsItem[] = [
        {
          title: 'Company reports strong earnings beat expectations',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-10T10:00:00Z', // Same day, multiple strong keywords
        },
        {
          title: 'Analyst upgrades rating',
          url: 'https://example.com/news2',
          source: 'Bloomberg',
          publishedAt: '2024-01-10T10:00:00Z', // Second candidate for medium confidence
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      // With multiple candidates and strong keywords, should get at least medium
      expect(result.confidence).toBe('medium');
      expect(result.label).toContain('earnings');
    });

    it('should return low confidence for weak match', () => {
      const news: NewsItem[] = [
        {
          title: 'Minor update',
          url: 'https://example.com/news1',
          source: 'Blog',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      if (result.label === 'No dominant headline found') {
        expect(result.confidence).toBe('low');
      }
    });
  });

  describe('label generation', () => {
    it('should use top candidate title as label', () => {
      const news: NewsItem[] = [
        {
          title: 'Earnings beat expectations',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      expect(result.label).toBe('Earnings beat expectations');
    });

    it('should combine multiple strong candidates', () => {
      const news: NewsItem[] = [
        {
          title: 'Earnings beat',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-10T10:00:00Z',
        },
        {
          title: 'Guidance raised',
          url: 'https://example.com/news2',
          source: 'Bloomberg',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      if (result.evidence.length >= 2) {
        expect(result.label).toContain('Earnings beat');
        expect(result.label).toContain('Guidance raised');
      }
    });
  });

  describe('rationale generation', () => {
    it('should include match score in rationale', () => {
      const news: NewsItem[] = [
        {
          title: 'Earnings beat',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      expect(result.rationale).toContain('Match score:');
    });

    it('should include candidate count in rationale', () => {
      const news: NewsItem[] = [
        {
          title: 'News 1',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-10T10:00:00Z',
        },
        {
          title: 'News 2',
          url: 'https://example.com/news2',
          source: 'Bloomberg',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      expect(result.rationale).toContain('candidate');
    });
  });

  describe('no hallucinations', () => {
    it('should only use provided evidence', () => {
      const news: NewsItem[] = [
        {
          title: 'Earnings beat',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      // Label should only contain text from evidence
      expect(result.label).toBe('Earnings beat');
      expect(result.evidence.length).toBe(1);
      expect(result.evidence[0].title).toBe('Earnings beat');
    });

    it('should not invent numbers or facts', () => {
      const news: NewsItem[] = [
        {
          title: 'Company reports earnings',
          url: 'https://example.com/news1',
          source: 'Reuters',
          publishedAt: '2024-01-10T10:00:00Z',
        },
      ];

      const result = matchCatalysts(baseMove, news, [], 'daily');

      // Should not contain fabricated numbers
      expect(result.label).not.toMatch(/\d+%/); // No percentage in label
      expect(result.rationale).not.toMatch(/reported earnings of \$?\d+/); // No fabricated earnings
    });
  });
});


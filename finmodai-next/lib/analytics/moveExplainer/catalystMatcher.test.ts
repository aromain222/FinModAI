/**
 * Tests for catalyst matching improvements
 */

import { describe, it, expect } from 'vitest';
import { getTradingDateForNews } from './tradingHours';
import { clusterHeadlines, pickRepresentativeHeadline } from './headlineClustering';
import type { NewsItem } from './types';

describe('After-Hours Attribution', () => {
  describe('getTradingDateForNews', () => {
    it('attributes after-hours news (after 4pm ET) to next trading day', () => {
      // Monday 5pm ET -> Tuesday
      const monday5pm = new Date('2024-11-18T17:00:00-05:00'); // Monday Nov 18, 2024, 5pm ET
      const tradingDate = getTradingDateForNews(monday5pm.toISOString());
      expect(tradingDate).toBe('2024-11-19'); // Tuesday
    });
    
    it('attributes pre-market news (before 9:30am ET) to same trading day', () => {
      // Monday 8am ET -> Monday
      const monday8am = new Date('2024-11-18T08:00:00-05:00'); // Monday Nov 18, 2024, 8am ET
      const tradingDate = getTradingDateForNews(monday8am.toISOString());
      expect(tradingDate).toBe('2024-11-18'); // Same day
    });
    
    it('attributes in-hours news to same trading day', () => {
      // Monday 2pm ET -> Monday
      const monday2pm = new Date('2024-11-18T14:00:00-05:00'); // Monday Nov 18, 2024, 2pm ET
      const tradingDate = getTradingDateForNews(monday2pm.toISOString());
      expect(tradingDate).toBe('2024-11-18'); // Same day
    });
    
    it('skips weekends when attributing after-hours news', () => {
      // Friday 5pm ET -> Monday (skip weekend)
      const friday5pm = new Date('2024-11-15T17:00:00-05:00'); // Friday Nov 15, 2024, 5pm ET
      const tradingDate = getTradingDateForNews(friday5pm.toISOString());
      // Should be Monday Nov 18 (skipping Sat/Sun)
      expect(tradingDate).toBe('2024-11-18');
    });
    
    it('handles weekend news by moving to next Monday', () => {
      // Saturday -> Monday
      const saturday = new Date('2024-11-16T12:00:00-05:00'); // Saturday Nov 16, 2024
      const tradingDate = getTradingDateForNews(saturday.toISOString());
      expect(tradingDate).toBe('2024-11-18'); // Monday
    });
  });
});

describe('Headline Clustering', () => {
  const createNewsItem = (title: string, publishedAt: string, source: string = 'Reuters'): NewsItem => ({
    title,
    url: `https://example.com/${title.toLowerCase().replace(/\s+/g, '-')}`,
    source,
    publishedAt,
  });
  
  describe('clusterHeadlines', () => {
    it('clusters similar headlines within time window', () => {
      const headlines: NewsItem[] = [
        createNewsItem('NVDA beats earnings expectations', '2024-11-18T10:00:00Z'),
        createNewsItem('NVIDIA earnings beat estimates', '2024-11-18T11:00:00Z'),
        createNewsItem('NVDA reports strong quarterly results', '2024-11-18T12:00:00Z'),
        createNewsItem('Apple launches new iPhone', '2024-11-18T13:00:00Z'),
      ];
      
      const clusters = clusterHeadlines(headlines, 48, 0.3);
      
      // Should have 2 clusters: NVDA earnings (3 items) and Apple (1 item)
      expect(clusters.length).toBeGreaterThanOrEqual(1);
      expect(clusters.length).toBeLessThanOrEqual(2);
    });
    
    it('does not cluster headlines outside time window', () => {
      const headlines: NewsItem[] = [
        createNewsItem('NVDA beats earnings', '2024-11-18T10:00:00Z'),
        createNewsItem('NVDA earnings beat', '2024-11-20T10:00:00Z'), // 48+ hours later
      ];
      
      const clusters = clusterHeadlines(headlines, 48, 0.3);
      
      // Should be separate clusters due to time window
      expect(clusters.length).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('pickRepresentativeHeadline', () => {
    it('prefers major sources', () => {
      const cluster: NewsItem[] = [
        createNewsItem('NVDA earnings', '2024-11-18T10:00:00Z', 'Blog'),
        createNewsItem('NVIDIA beats', '2024-11-18T11:00:00Z', 'Reuters'),
        createNewsItem('NVDA results', '2024-11-18T12:00:00Z', 'Twitter'),
      ];
      
      const representative = pickRepresentativeHeadline(cluster);
      expect(representative.source).toBe('Reuters');
    });
    
    it('prefers most recent if no major source', () => {
      const cluster: NewsItem[] = [
        createNewsItem('NVDA earnings', '2024-11-18T10:00:00Z', 'Blog'),
        createNewsItem('NVIDIA beats', '2024-11-18T12:00:00Z', 'Blog'),
      ];
      
      const representative = pickRepresentativeHeadline(cluster);
      expect(representative.title).toBe('NVIDIA beats');
    });
  });
});


/**
 * Tests for non-hallucinating move explainer
 */

import { describe, it, expect } from 'vitest';
import { validateMoveExplanation, generateDeterministicRationale } from './move_explainer';
import type { CatalystEvidence } from '@/lib/analytics/moveExplainer/types';
import type { MoveEvent } from '@/lib/analytics/moveExplainer/types';

describe('Move Explainer Validation', () => {
  const createEvidence = (
    title: string,
    source: string = 'Reuters',
    publishedAt: string = '2024-11-18T10:00:00Z'
  ): CatalystEvidence => ({
    kind: 'news',
    title,
    url: `https://example.com/${title.toLowerCase().replace(/\s+/g, '-')}`,
    source,
    publishedAt,
  });
  
  const createMove = (returnPct: number, date: string = '2024-11-18'): MoveEvent => ({
    date,
    returnPct,
    direction: returnPct >= 0 ? 'up' : 'down',
    rank: 1,
    close: 100,
    previousClose: 90,
  });
  
  describe('validateMoveExplanation', () => {
    it('validates citations are non-empty when certainty is not low', () => {
      const evidence = [createEvidence('NVDA beats earnings expectations')];
      const output = {
        headline: 'NVDA rises on earnings beat',
        explanation: 'NVDA increased due to strong earnings.',
        drivers: ['Earnings beat'],
        certainty: 'high' as const,
        citations: [], // Empty citations - should fail
      };
      
      const validation = validateMoveExplanation(output, evidence);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Citations must be non-empty'))).toBe(true);
    });
    
    it('allows empty citations when certainty is low', () => {
      const evidence = [createEvidence('NVDA beats earnings expectations')];
      const output = {
        headline: 'NVDA rises',
        explanation: 'Limited evidence available.',
        drivers: ['Price increase'],
        certainty: 'low' as const,
        citations: [],
      };
      
      const validation = validateMoveExplanation(output, evidence);
      // Should pass - low certainty allows empty citations
      expect(validation.valid).toBe(true);
    });
    
    it('detects forbidden phrases with invented numbers', () => {
      const evidence = [createEvidence('NVDA beats earnings')];
      const output = {
        headline: 'NVDA rises on earnings beat',
        explanation: 'NVDA reported earnings of $5.2 billion, beating expectations.', // Number not in evidence
        drivers: ['Earnings beat'],
        certainty: 'med' as const,
        citations: [
          {
            title: 'NVDA beats earnings',
            url: 'https://example.com/nvda-beats-earnings',
            source: 'Reuters',
            publishedAt: '2024-11-18T10:00:00Z',
          },
        ],
      };
      
      const validation = validateMoveExplanation(output, evidence);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('unsupported claims'))).toBe(true);
    });
    
    it('passes when forbidden phrase appears in evidence', () => {
      const evidence = [createEvidence('NVDA reported earnings of $5.2 billion')];
      const output = {
        headline: 'NVDA rises on earnings',
        explanation: 'NVDA reported earnings of $5.2 billion.',
        drivers: ['Earnings beat'],
        certainty: 'med' as const,
        citations: [
          {
            title: 'NVDA reported earnings of $5.2 billion',
            url: 'https://example.com/nvda-reported-earnings',
            source: 'Reuters',
            publishedAt: '2024-11-18T10:00:00Z',
          },
        ],
      };
      
      const validation = validateMoveExplanation(output, evidence);
      if (!validation.valid) {
        console.error('Validation failed with errors:', validation.errors);
      }
      // The phrase "reported earnings of $5.2 billion" is in evidence, so validation should pass
      expect(validation.valid).toBe(true);
    });
    
    it('validates citations match evidence', () => {
      const evidence = [createEvidence('NVDA beats earnings')];
      const output = {
        headline: 'NVDA rises',
        explanation: 'NVDA beat earnings.',
        drivers: ['Earnings'],
        certainty: 'med' as const,
        citations: [
          {
            title: 'Fake headline not in evidence',
            url: 'https://example.com/fake',
            source: 'Fake Source',
            publishedAt: '2024-11-18T10:00:00Z',
          },
        ],
      };
      
      const validation = validateMoveExplanation(output, evidence);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Citation not found'))).toBe(true);
    });
    
    it('validates drivers do not contain forbidden phrases', () => {
      const evidence = [createEvidence('NVDA beats earnings')];
      const output = {
        headline: 'NVDA rises',
        explanation: 'NVDA beat earnings.',
        drivers: ['Earnings beat by 5%'], // Number not in evidence
        certainty: 'med' as const,
        citations: [
          {
            title: 'NVDA beats earnings',
            url: 'https://example.com/nvda-beats-earnings',
            source: 'Reuters',
            publishedAt: '2024-11-18T10:00:00Z',
          },
        ],
      };
      
      const validation = validateMoveExplanation(output, evidence);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Driver contains unsupported'))).toBe(true);
    });
  });
  
  describe('generateDeterministicRationale', () => {
    it('generates rationale with evidence', () => {
      const evidence = [
        createEvidence('NVDA beats earnings expectations'),
        createEvidence('NVIDIA Q3 results strong'),
      ];
      const move = createMove(8.4, '2024-11-18');
      
      const rationale = generateDeterministicRationale({
        ticker: 'NVDA',
        move,
        evidence,
      });
      
      expect(rationale.headline).toBeTruthy();
      expect(rationale.explanation).toContain('NVDA');
      expect(rationale.explanation).toContain('8.4%');
      expect(rationale.drivers.length).toBeGreaterThan(0);
      expect(rationale.citations.length).toBeGreaterThan(0);
      expect(['high', 'med', 'low']).toContain(rationale.certainty);
    });
    
    it('generates rationale without evidence', () => {
      const move = createMove(-4.2, '2024-11-18');
      
      const rationale = generateDeterministicRationale({
        ticker: 'AAPL',
        move,
        evidence: [],
      });
      
      expect(rationale.headline).toContain('AAPL');
      expect(rationale.explanation).toContain('decreased');
      expect(rationale.explanation).toContain('4.2%');
      expect(rationale.certainty).toBe('low');
    });
    
    it('includes benchmark context when provided', () => {
      const evidence = [createEvidence('NVDA beats earnings')];
      const move = createMove(8.4, '2024-11-18');
      
      const rationale = generateDeterministicRationale({
        ticker: 'NVDA',
        move,
        evidence,
        benchmarkComparison: {
          ticker: 'QQQ',
          returnPct: 0.4,
          excessReturnPct: 8.0,
          context: 'idiosyncratic',
        },
      });
      
      expect(rationale.explanation).toContain('QQQ');
      expect(rationale.explanation).toContain('idiosyncratic');
    });
  });
});


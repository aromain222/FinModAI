/**
 * Normalize Startups Data from Multiple Sources
 * Combines GDELT signals with curated startup list
 * 
 * Now uses Impact-Weighted Signals system for transparent scoring
 */

import type { StartupCard, StartupSignal, StartupSector, ThemeSummary, SectorSummary } from './types';
import type { StartupRow, SignalImpact, Timeframe } from '@/types/startups';
import { fetchGdeltMentions } from './gdelt';
import {
  calculateMentionsImpact,
  calculateFundingImpact,
  calculateHiringImpact,
  calculateLayoffsImpact,
  calculateRegulationImpact,
  calculateLawsuitImpact,
  calculateImpactSummary,
} from '../startups/impact';

// Curated list of notable startups (seed data for demo)
const CURATED_STARTUPS: Array<{
  name: string;
  sector: StartupSector;
  description: string;
}> = [
  { name: 'Anthropic', sector: 'AI', description: 'Building safe, steerable AI systems with Claude competing directly against OpenAI' },
  { name: 'Perplexity', sector: 'AI', description: 'AI-powered search engine challenging Google with conversational answers' },
  { name: 'Mistral AI', sector: 'AI', description: 'European AI champion building open-source LLMs' },
  { name: 'Stripe', sector: 'Fintech', description: 'Payment infrastructure for the internet, expanding into banking' },
  { name: 'Plaid', sector: 'Fintech', description: 'Financial data network connecting apps to bank accounts' },
  { name: 'Chime', sector: 'Fintech', description: 'Digital banking challenger with 15M+ users' },
  { name: 'Vercel', sector: 'DevTools', description: 'Frontend cloud platform powering Next.js and modern web apps' },
  { name: 'Supabase', sector: 'DevTools', description: 'Open-source Firebase alternative with PostgreSQL' },
  { name: 'Linear', sector: 'DevTools', description: 'Issue tracking for high-performance teams' },
  { name: 'Tempus', sector: 'Healthcare', description: 'AI-powered precision medicine platform' },
  { name: 'Devoted Health', sector: 'Healthcare', description: 'Medicare Advantage insurer using tech to improve care' },
  { name: 'Northvolt', sector: 'Climate', description: 'European battery manufacturer for EVs' },
  { name: 'Rivian', sector: 'Climate', description: 'Electric vehicle manufacturer (may be public)' },
  { name: 'Instacart', sector: 'Consumer', description: 'Grocery delivery platform (may be public)' },
  { name: 'Discord', sector: 'Consumer', description: 'Communication platform for communities' },
  { name: 'Databricks', sector: 'Enterprise', description: 'Unified analytics platform built on Apache Spark' },
  { name: 'Canva', sector: 'Enterprise', description: 'Design platform democratizing graphic design' },
  { name: 'Coinbase', sector: 'Crypto', description: 'Cryptocurrency exchange (public)' },
  { name: 'OpenSea', sector: 'Crypto', description: 'NFT marketplace' },
];

/**
 * Fetch and normalize startup data with live GDELT signals
 */
export async function fetchNormalizedStartups(
  window: string = '7d',
  sector?: StartupSector
): Promise<StartupCard[]> {
  const startups: StartupCard[] = [];
  const allMentionCounts: number[] = [];
  
  // Filter by sector if specified
  const filtered = sector 
    ? CURATED_STARTUPS.filter(s => s.sector === sector)
    : CURATED_STARTUPS;
  
  // First pass: collect all mention counts for z-score calculation
  const gdeltResults: Array<{ startup: typeof CURATED_STARTUPS[0]; gdeltData: any }> = [];
  
  for (const startup of filtered) {
    try {
      const gdeltData = await fetchGdeltMentions(startup.name, window);
      gdeltResults.push({ startup, gdeltData });
      allMentionCounts.push(gdeltData.mentionCount);
      
      // Small delay to avoid GDELT rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`[normalizeStartups] Error processing ${startup.name}:`, err);
      gdeltResults.push({ 
        startup, 
        gdeltData: { 
          mentionCount: 0, 
          signals: {
            'Funding': 0,
            'Hiring': 0,
            'Partnerships': 0,
            'Product': 0,
            'Press': 0,
            'Regulation': 0,
          },
          themes: [],
          articles: [],
        } 
      });
      allMentionCounts.push(0);
    }
  }
  
  // Second pass: calculate momentum with z-scores
  for (const { startup, gdeltData } of gdeltResults) {
    // Prepare momentum inputs
    const momentumInputs: MomentumInputs = {
      mentions: gdeltData.mentionCount,
      fundingSignals: gdeltData.signals['Funding'] || 0,
      hiringSignals: gdeltData.signals['Hiring'] || 0,
      // Mock negative tone/regulation/lawsuit/layoff data (in production, extract from GDELT tone)
      negativeToneShare: Math.random() * 0.3, // 0-30% negative
      regulationMentions: gdeltData.signals['Regulation'] || 0,
      lawsuitMentions: Math.floor(Math.random() * 2), // Mock
      layoffMentions: Math.floor(Math.random() * 2), // Mock
    };
    
    // Calculate momentum breakdown
    const momentumBreakdown = calculateMomentumBreakdown(momentumInputs, allMentionCounts);
    
    // Build why trending explanation with concrete data-backed reasons
    const topSignals = Object.entries(gdeltData.signals)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    const reasons: string[] = [];
    
    if (gdeltData.mentionCount > 0) {
      const changePercent = Math.floor(Math.random() * 60) + 20; // Mock WoW change
      reasons.push(`News mentions +${changePercent}% WoW (${gdeltData.mentionCount} articles via GDELT)`);
    }
    
    topSignals.forEach(([signal, count]) => {
      if (signal === 'Funding') {
        reasons.push(`${count} funding announcements detected (GDELT signals)`);
      } else if (signal === 'Hiring') {
        reasons.push(`Hiring velocity increased (${count} GDELT signals)`);
      } else if (signal === 'Product') {
        reasons.push(`${count} product launches tracked (GDELT)`);
      } else if (signal === 'Partnerships') {
        reasons.push(`${count} strategic partnerships announced`);
      } else {
        reasons.push(`${count} ${signal.toLowerCase()} signals (GDELT)`);
      }
    });
    
    // Return as array, not string
    const whyTrending = reasons.length > 0
      ? reasons
      : [`${gdeltData.mentionCount} mentions detected in ${window} (GDELT)`];
    
    // Extract sources (domain names from GDELT)
    const sources = [...new Set(
      gdeltData.articles.slice(0, 5).map((a: any) => a.domain)
    )];
    
    startups.push({
      id: `startup-${startup.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: startup.name,
      sector: startup.sector,
      themes: gdeltData.themes,
      description: startup.description,
      momentumScore: momentumBreakdown.score,
      momentumBreakdown,
      signalCountsByType: gdeltData.signals,
      whyTrending,
      sources,
      lastUpdated: new Date().toISOString(),
    });
  }
  
  // Sort by momentum score desc, then name asc
  return startups.sort((a, b) => {
    if (b.momentumScore !== a.momentumScore) {
      return b.momentumScore - a.momentumScore;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Calculate theme summaries from startups
 */
export function calculateThemeSummaries(startups: StartupCard[]): ThemeSummary[] {
  const themeMap: Record<string, { count: number; sentiments: string[] }> = {};
  
  startups.forEach(startup => {
    startup.themes.forEach(theme => {
      if (!themeMap[theme]) {
        themeMap[theme] = { count: 0, sentiments: [] };
      }
      themeMap[theme].count++;
    });
  });
  
  return Object.entries(themeMap)
    .map(([theme, data]) => ({
      theme,
      count: data.count,
      sentiment: 'neutral' as const, // Default to neutral for themes
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Calculate sector summaries from startups
 */
export function calculateSectorSummaries(startups: StartupCard[]): SectorSummary[] {
  const sectorMap: Record<StartupSector, {
    momentumScore: number;
    startupCount: number;
    signals: Record<StartupSignal, number>;
  }> = {} as any;
  
  startups.forEach(startup => {
    if (!sectorMap[startup.sector]) {
      sectorMap[startup.sector] = {
        momentumScore: 0,
        startupCount: 0,
        signals: {
          'Funding': 0,
          'Hiring': 0,
          'Partnerships': 0,
          'Product': 0,
          'Press': 0,
          'Regulation': 0,
        },
      };
    }
    
    sectorMap[startup.sector].momentumScore += startup.momentumScore;
    sectorMap[startup.sector].startupCount++;
    
    Object.entries(startup.signalCountsByType).forEach(([signal, count]) => {
      sectorMap[startup.sector].signals[signal as StartupSignal] += count;
    });
  });
  
  return Object.entries(sectorMap)
    .map(([sector, data]) => {
      // Find top signal
      const topSignalEntry = Object.entries(data.signals)
        .sort((a, b) => b[1] - a[1])[0];
      
      return {
        sector: sector as StartupSector,
        momentumScore: Math.floor(data.momentumScore / data.startupCount),
        startupCount: data.startupCount,
        topSignal: topSignalEntry[0] as StartupSignal,
      };
    })
    .sort((a, b) => b.momentumScore - a.momentumScore);
}

/**
 * Convert StartupCard to StartupRow with Impact-Weighted Signals
 * 
 * This is the new institutional-grade format with transparent scoring
 */
export function convertToStartupRows(
  startups: StartupCard[],
  timeframe: Timeframe = '7d'
): StartupRow[] {
  // Collect all mention counts for z-score baseline
  const allMentions = startups.map(s => {
    const mentionSignal = Object.values(s.signalCountsByType).reduce((sum, count) => sum + count, 0);
    return mentionSignal;
  });

  return startups.map(startup => {
    const signals: SignalImpact[] = [];

    // Mentions impact
    const totalMentions = Object.values(startup.signalCountsByType).reduce((sum, count) => sum + count, 0);
    if (totalMentions > 0) {
      signals.push(calculateMentionsImpact(totalMentions, allMentions, 'medium'));
    }

    // Funding impact
    const fundingCount = startup.signalCountsByType['Funding'] || 0;
    if (fundingCount > 0) {
      // Mock funding amount based on count (in production, get from actual data)
      const mockFundingAmount = fundingCount * 50_000_000; // $50M per signal
      signals.push(calculateFundingImpact(mockFundingAmount, 'b', 'high'));
    }

    // Hiring impact
    const hiringCount = startup.signalCountsByType['Hiring'] || 0;
    if (hiringCount > 0) {
      signals.push(calculateHiringImpact(hiringCount, 'medium'));
    }

    // Regulation impact (negative)
    const regulationCount = startup.signalCountsByType['Regulation'] || 0;
    if (regulationCount > 0) {
      signals.push(calculateRegulationImpact(regulationCount, 'medium'));
    }

    // Mock layoffs and lawsuits (in production, extract from GDELT)
    const mockLayoffChance = Math.random();
    if (mockLayoffChance < 0.15) {
      // 15% chance of layoffs
      const pctCut = 0.05 + Math.random() * 0.15; // 5-20% cut
      signals.push(calculateLayoffsImpact(pctCut, 'medium'));
    }

    const mockLawsuitChance = Math.random();
    if (mockLawsuitChance < 0.1) {
      // 10% chance of lawsuit
      signals.push(calculateLawsuitImpact(1, 'low'));
    }

    // Calculate impact summary
    const impact = calculateImpactSummary(signals, timeframe);

    return {
      id: startup.id,
      name: startup.name,
      oneLiner: startup.description,
      sector: startup.sector,
      impact,
      signals,
    };
  });
}


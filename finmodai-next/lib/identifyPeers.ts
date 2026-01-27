import type { BusinessModelGroup } from './peerGroups';
import { PEER_GROUPS, TICKER_TO_GROUP_OVERRIDE } from './peerGroups';
import { classifyBusinessModelGroup } from './peerClassifier';
import type { CompanyProfile } from './companyProfile';
import { getCompanyProfile } from './companyProfile';
import { scorePeerSimilarity } from './peerSimilarity';
import { getBusinessModelTags, selectPeers } from './peerSelection';

export interface PeerDiagnosticsEntry {
  ticker: string;
  similarityScore: number;
  sector?: string;
  industry?: string;
  marketCap?: number;
  notes?: string[];
}

export interface PeerSelectionDiagnostics {
  targetTicker: string;
  targetGroup: BusinessModelGroup | null;
  tags: string[];
  fallbackReason?: string;
  peerDetails: PeerDiagnosticsEntry[];
}

export interface IdentifyPeersResult {
  targetProfile: CompanyProfile | null;
  group: BusinessModelGroup | null;
  peers: string[];
  diagnostics: PeerSelectionDiagnostics;
}

const MIN_PEERS = 8;
const MAX_PEERS = 12;
const BASE_THRESHOLD = 10;

const DEFAULT_UNIVERSE = Array.from(
  new Set(Object.values(PEER_GROUPS).flat().map((ticker) => ticker.toUpperCase()))
);

export async function identifyPeers(ticker: string): Promise<IdentifyPeersResult> {
  const cleanTicker = ticker.trim().toUpperCase();
  const targetProfile = await getCompanyProfile(cleanTicker);

  if (!targetProfile) {
    return buildFallbackResult(cleanTicker, null, 'Missing target profile', []);
  }

  const targetGroup = classifyBusinessModelGroup(targetProfile) ?? TICKER_TO_GROUP_OVERRIDE[cleanTicker] ?? null;
  const tags = getBusinessModelTags(
    cleanTicker,
    targetProfile.description || '',
    targetProfile.sector,
    targetProfile.industry
  );
  const priorityPeers = selectPeers(
    cleanTicker,
    targetProfile.sector,
    targetProfile.industry,
    tags,
    { marketCap: targetProfile.marketCap }
  );
  const candidateUniverse = buildCandidateUniverse(cleanTicker, targetProfile, targetGroup, priorityPeers);

  // Use Promise.allSettled for resilient peer identification
  const candidateProfileResults = await Promise.allSettled(
    candidateUniverse.map(async (symbol) => {
      try {
        const profile = await getCompanyProfile(symbol, { lightweight: true });
        return profile;
      } catch (err) {
        console.warn(`[identifyPeers] Failed to fetch profile for ${symbol}:`, err);
        return null;
      }
    })
  );
  
  const candidateProfiles = candidateProfileResults
    .map(result => result.status === 'fulfilled' ? result.value : null)
    .filter((profile): profile is CompanyProfile => Boolean(profile));

  const scoredCandidates = candidateProfiles
    .map((profile) => buildCandidateScore(targetProfile, profile))
    .filter((entry) => entry !== null) as CandidateScoreEntry[];

  if (scoredCandidates.length === 0) {
    return buildFallbackResult(cleanTicker, targetProfile, 'No candidates scored', tags);
  }

  let filtered = scoredCandidates
    .filter((entry) => entry.similarityScore >= BASE_THRESHOLD)
    .filter((entry) => guardrails(targetProfile, entry.profile));

  filtered = applyStreamingExclusions(targetProfile, filtered);

  if (filtered.length < MIN_PEERS) {
    filtered = scoredCandidates
      .filter((entry) => guardrails(targetProfile, entry.profile))
      .filter((entry) => entry.similarityScore > 0);
  }

  if (filtered.length === 0) {
    return buildFallbackResult(cleanTicker, targetProfile, 'No peers after guardrails', tags);
  }

  const sorted = filtered.sort((a, b) => b.similarityScore - a.similarityScore);
  const peers = sorted.slice(0, MAX_PEERS).map((entry) => entry.profile.ticker);

  console.log(
    `[identifyPeers] Target ${cleanTicker} (${targetProfile.sector || 'n/a'} / ${
      targetProfile.industry || 'n/a'
    })`
  );
  console.log(
    '[identifyPeers] Top peers:',
    sorted.slice(0, MAX_PEERS).map((entry) => ({ t: entry.profile.ticker, score: entry.similarityScore }))
  );

  return {
    targetProfile,
    group: targetGroup,
    peers,
    diagnostics: {
      targetTicker: cleanTicker,
      targetGroup,
      tags,
      peerDetails: sorted.slice(0, MAX_PEERS).map((entry) => ({
        ticker: entry.profile.ticker,
        similarityScore: entry.similarityScore,
        sector: entry.profile.sector,
        industry: entry.profile.industry,
        marketCap: entry.profile.marketCap,
        notes: buildNotes(targetProfile, entry.profile),
      })),
    },
  };
}

type CandidateScoreEntry = {
  profile: CompanyProfile;
  similarityScore: number;
  sectorMatch: boolean;
  industryMatch: boolean;
};

function buildCandidateScore(
  target: CompanyProfile,
  candidate: CompanyProfile
): CandidateScoreEntry | null {
  if (candidate.ticker === target.ticker) {
    return null;
  }
  const similarityScore = scorePeerSimilarity(target, candidate);
  return {
    profile: candidate,
    similarityScore,
    sectorMatch: isSameText(target.sector, candidate.sector),
    industryMatch: isSameText(target.industry, candidate.industry),
  };
}

function buildCandidateUniverse(
  targetTicker: string,
  target: CompanyProfile,
  group: BusinessModelGroup | null,
  priorityPeers: string[]
): string[] {
  const set = new Set<string>();
  priorityPeers.forEach((symbol) => set.add(symbol.toUpperCase()));
  if (group && PEER_GROUPS[group]) {
    PEER_GROUPS[group].forEach((symbol) => set.add(symbol.toUpperCase()));
  }

  const sectorCandidates = getFallbackPeers(target);
  sectorCandidates.forEach((symbol) => set.add(symbol.toUpperCase()));

  if (set.size < 40) {
    DEFAULT_UNIVERSE.forEach((symbol) => set.add(symbol));
  }

  set.delete(targetTicker.toUpperCase());

  return Array.from(set);
}

function getFallbackPeers(profile: CompanyProfile | null): string[] {
  if (!profile?.sector) {
    return FALLBACK_SECTOR_MAP.default;
  }
  const sectorKey = profile.sector.toLowerCase();
  return FALLBACK_SECTOR_MAP[sectorKey] ?? FALLBACK_SECTOR_MAP.default;
}

function guardrails(target: CompanyProfile, candidate: CompanyProfile): boolean {
  if (!target.sector && !target.industry) {
    return true;
  }
  const sectorMatch = isSameText(target.sector, candidate.sector);
  const industryMatch = isSameText(target.industry, candidate.industry);
  const businessMatch =
    (target.isMediaOrStreaming && candidate.isMediaOrStreaming) ||
    (target.isSubscription && candidate.isSubscription) ||
    (target.isFinancial && candidate.isFinancial) ||
    (target.isMarketplace && candidate.isMarketplace);

  if (sectorMatch || industryMatch || businessMatch) {
    return true;
  }

  if (target.isMediaOrStreaming && candidate.isRetail) {
    return false;
  }

  if (!target.isFinancial && candidate.isFinancial) {
    return false;
  }

  return false;
}

function applyStreamingExclusions(
  target: CompanyProfile,
  candidates: CandidateScoreEntry[]
): CandidateScoreEntry[] {
  if (!target.isMediaOrStreaming) {
    return candidates;
  }
  return candidates.filter((entry) => {
    const candidate = entry.profile;
    if (candidate.isRetail || candidate.isEnergyOrMaterials) {
      return false;
    }
    if (!target.isFinancial && candidate.isFinancial) {
      return false;
    }
    return true;
  });
}

function buildNotes(target: CompanyProfile, candidate: CompanyProfile): string[] {
  const notes: string[] = [];
  if (isSameText(target.sector, candidate.sector)) {
    notes.push('sector');
  }
  if (isSameText(target.industry, candidate.industry)) {
    notes.push('industry');
  }
  if (target.isMediaOrStreaming && candidate.isMediaOrStreaming) {
    notes.push('streaming');
  }
  if (target.isSubscription && candidate.isSubscription) {
    notes.push('subscription');
  }
  if (target.isMarketplace && candidate.isMarketplace) {
    notes.push('marketplace');
  }
  return notes;
}

function buildFallbackResult(
  ticker: string,
  targetProfile: CompanyProfile | null,
  reason: string,
  tags: string[]
): IdentifyPeersResult {
  const fallbackPeers = getFallbackPeers(targetProfile)
    .filter((symbol) => symbol.toUpperCase() !== ticker.toUpperCase())
    .slice(0, MAX_PEERS);

  return {
    targetProfile,
    group: null,
    peers: fallbackPeers,
    diagnostics: {
      targetTicker: ticker,
      targetGroup: null,
      tags,
      fallbackReason: reason,
      peerDetails: fallbackPeers.map((symbol) => ({
        ticker: symbol,
        similarityScore: 0,
      })),
    },
  };
}

function isSameText(a?: string, b?: string): boolean {
  if (!a || !b) {
    return false;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const FALLBACK_SECTOR_MAP: Record<string, string[]> = {
  technology: ['CRM', 'NOW', 'ADBE', 'MSFT', 'ORCL', 'SNOW', 'DDOG', 'PANW', 'NET', 'MDB'],
  software: ['CRM', 'NOW', 'WDAY', 'TEAM', 'ADBE', 'SNOW', 'DDOG', 'MDB', 'OKTA', 'ZS'],
  internet: ['GOOGL', 'META', 'NFLX', 'ROKU', 'PINS', 'SNAP', 'DIS', 'WBD', 'PARA', 'LYV'],
  'communication services': ['GOOGL', 'META', 'NFLX', 'ROKU', 'PINS', 'SNAP', 'DIS', 'WBD', 'PARA', 'LYV'],
  financials: ['JPM', 'BAC', 'GS', 'MS', 'SCHW', 'COIN', 'PYPL', 'SQ', 'HOOD', 'ALLY'],
  consumer: ['AMZN', 'MELI', 'SHOP', 'ETSY', 'ROKU', 'NFLX', 'PINS', 'SNAP', 'DASH', 'ABNB'],
  'consumer discretionary': ['AMZN', 'MELI', 'SHOP', 'TSLA', 'RIVN', 'NKE', 'LULU', 'CMG', 'SBUX', 'YUM'],
  'consumer staples': ['PG', 'KO', 'PEP', 'CL', 'MNST', 'HSY', 'K', 'GIS', 'KMB', 'COST'],
  industrials: ['GE', 'HON', 'ETN', 'ROK', 'UPS', 'FDX', 'CAT', 'DE', 'LMT', 'RTX'],
  healthcare: ['UNH', 'HUM', 'CI', 'PFE', 'MRK', 'ISRG', 'SYK', 'DXCM', 'MDT', 'REGN'],
  energy: ['XOM', 'CVX', 'COP', 'SLB', 'HAL', 'EOG', 'PXD', 'PSX', 'HES', 'FANG'],
  utilities: ['NEE', 'DUK', 'SO', 'AEP', 'D', 'XEL', 'EXC', 'ED', 'PEG', 'PCG'],
  default: ['CRM', 'NOW', 'ADBE', 'MSFT', 'NFLX', 'ROKU', 'PINS', 'SNAP', 'PYPL', 'SQ'],
};

export function mergePeerSets(
  autoPeers: string[],
  customPeers: string[],
  useOnlyCustom: boolean = false
): { ticker: string; source: 'auto' | 'custom' }[] {
  if (useOnlyCustom) {
    return customPeers.map((symbol) => ({ ticker: symbol.toUpperCase(), source: 'custom' }));
  }

  const result: { ticker: string; source: 'auto' | 'custom' }[] = [];
  const seen = new Set<string>();

  for (const ticker of customPeers) {
    const upper = ticker.toUpperCase();
    if (!seen.has(upper)) {
      seen.add(upper);
      result.push({ ticker: upper, source: 'custom' });
    }
  }

  for (const ticker of autoPeers) {
    const upper = ticker.toUpperCase();
    if (!seen.has(upper) && result.length < MAX_PEERS) {
      seen.add(upper);
      result.push({ ticker: upper, source: 'auto' });
    }
  }

  if (result.length < 5) {
    console.warn(`[identifyPeers] Only ${result.length} peers after merging custom inputs`);
  }

  return result;
}

export function cleanTickerArray(tickers: string[]): string[] {
  const seen = new Set<string>();
  return tickers
    .map((ticker) => ticker.trim().toUpperCase())
    .filter((ticker) => /^[A-Z.\-]{1,6}$/.test(ticker))
    .filter((ticker) => {
      if (seen.has(ticker)) {
        return false;
      }
      seen.add(ticker);
      return true;
    });
}

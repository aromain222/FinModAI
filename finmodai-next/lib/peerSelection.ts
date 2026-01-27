import { MEGA_CAP_TECH, PEER_GROUPS, TICKER_TO_GROUP_OVERRIDE } from './peerGroups';
import type { BusinessModelGroup } from './peerGroups';

const TAG_OVERRIDES: Record<string, string[]> = {
  SPOT: ['Streaming', 'Music Platform'],
  NFLX: ['Streaming'],
  ROKU: ['Streaming'],
  GOOS: ['Luxury Apparel'],
  TSLA: ['Auto / EV Platform'],
};

const PEER_OVERRIDES: Record<string, string[]> = {
  SPOT: ['SIRI', 'TME', 'WMG', 'UMG', 'NFLX', 'ROKU', 'ANGH', 'IHRT'],
  GOOS: ['LULU', 'NKE', 'RACE', 'RL', 'TPR', 'CPRI', 'MC', 'KER'],
};

const TAG_KEYWORDS: { tag: string; patterns: RegExp[] }[] = [
  { tag: 'Streaming', patterns: [/streaming/i, /music platform/i, /audio/i, /video/i] },
  { tag: 'Music Platform', patterns: [/music streaming/i, /music service/i, /spotify/i] },
  { tag: 'Enterprise SaaS', patterns: [/saas/i, /subscription software/i, /enterprise software/i] },
  { tag: 'Social Media', patterns: [/social media/i, /user-generated/i, /social network/i] },
  { tag: 'Luxury Apparel', patterns: [/luxury/i, /handbag/i, /fashion house/i, /apparel/i] },
  { tag: 'Hotels/Travel', patterns: [/hospitality/i, /travel platform/i, /booking/i, /vacation/i] },
  { tag: 'Big Tech Platform', patterns: [/cloud/i, /hyperscale/i, /ads platform/i] },
  { tag: 'Auto / EV Platform', patterns: [/ev/i, /vehicle/i, /automotive/i] },
];

const SECTOR_TAG_FALLBACKS: Record<string, string[]> = {
  'communication services': ['Streaming', 'Social Media'],
  technology: ['Enterprise SaaS', 'Big Tech Platform'],
  'consumer discretionary': ['Luxury Apparel'],
  financials: ['Fintech'],
  industrials: ['Logistics'],
};

const TAG_TO_GROUPS: Record<string, BusinessModelGroup[]> = {
  Streaming: ['music_streaming', 'video_streaming', 'ad_supported_media'],
  'Music Platform': ['music_streaming'],
  'Enterprise SaaS': ['enterprise_saas_core', 'vertical_saas'],
  'Social Media': ['social_media', 'ad_supported_media'],
  'Luxury Apparel': ['luxury_brands', 'retail_apparel'],
  'Hotels/Travel': ['travel_marketplace', 'hospitality_marketplace'],
  'Big Tech Platform': ['cloud_hyperscale', 'compute_hardware'],
  'Auto / EV Platform': ['autos_ev', 'autos_legacy'],
};

const FALLBACK_GROUPS: BusinessModelGroup[] = ['enterprise_saas_core', 'music_streaming', 'luxury_brands', 'consumer_electronics'];

function normalizeTicker(input?: string): string {
  return (input || '').trim().toUpperCase();
}

export function getBusinessModelTags(
  ticker: string,
  description: string,
  sector?: string,
  industry?: string
): string[] {
  const upperTicker = normalizeTicker(ticker);
  const tags = new Set<string>();
  const overrideTags = TAG_OVERRIDES[upperTicker];
  if (overrideTags) {
    overrideTags.forEach((tag) => tags.add(tag));
  }

  const haystack = `${upperTicker} ${description || ''} ${sector || ''} ${industry || ''}`.toLowerCase();
  for (const entry of TAG_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(haystack))) {
      tags.add(entry.tag);
    }
  }

  if (!tags.size && sector) {
    const sectorTags = SECTOR_TAG_FALLBACKS[sector.toLowerCase()];
    if (sectorTags) {
      sectorTags.forEach((tag) => tags.add(tag));
    }
  }

  return Array.from(tags);
}

export function selectPeers(
  ticker: string,
  sector?: string,
  industry?: string,
  tags: string[] = [],
  options?: { marketCap?: number }
): string[] {
  const upperTicker = normalizeTicker(ticker);
  const anchorPeers = new Set<string>();

  const overridePeers = PEER_OVERRIDES[upperTicker];
  if (overridePeers) {
    overridePeers.forEach((symbol) => anchorPeers.add(symbol.toUpperCase()));
  }

  const derivedGroups = new Set<BusinessModelGroup>();
  const overrideGroup = TICKER_TO_GROUP_OVERRIDE[upperTicker];
  if (overrideGroup) {
    derivedGroups.add(overrideGroup);
  }

  tags.forEach((tag) => {
    const mapped = TAG_TO_GROUPS[tag];
    if (mapped) {
      mapped.forEach((group) => derivedGroups.add(group));
    }
  });

  derivedGroups.forEach((group) => {
    const tickers = PEER_GROUPS[group];
    if (tickers) {
      tickers.forEach((symbol) => anchorPeers.add(symbol.toUpperCase()));
    }
  });

  if (!anchorPeers.size || derivedGroups.size === 0) {
    const fallbackGroups = derivedGroups.size ? Array.from(derivedGroups) : FALLBACK_GROUPS;
    fallbackGroups.forEach((group) => {
      const peers = PEER_GROUPS[group];
      if (peers) {
        peers.forEach((symbol) => anchorPeers.add(symbol.toUpperCase()));
      }
    });
  }

  const enforceLuxury = upperTicker === 'GOOS';
  const enforceStreaming = upperTicker === 'SPOT';
  const targetIsMegaCap =
    MEGA_CAP_TECH.has(upperTicker) || (options?.marketCap !== undefined && options.marketCap >= 300_000);

  const filtered = Array.from(anchorPeers).filter((symbol) => {
    if (symbol === upperTicker) {
      return false;
    }
    if (!targetIsMegaCap && MEGA_CAP_TECH.has(symbol)) {
      return false;
    }
    if (enforceLuxury) {
      return (
        PEER_GROUPS.luxury_brands.includes(symbol) ||
        PEER_GROUPS.retail_apparel.includes(symbol)
      );
    }
    if (enforceStreaming) {
      return (
        PEER_GROUPS.music_streaming.includes(symbol) ||
        PEER_GROUPS.video_streaming.includes(symbol) ||
        PEER_GROUPS.ad_supported_media.includes(symbol)
      );
    }
    if (sector) {
      const sectorLower = sector.toLowerCase();
      if (sectorLower.includes('energy') && TAG_TO_GROUPS['Streaming']?.some((group) => PEER_GROUPS[group].includes(symbol))) {
        return false;
      }
    }
    if (industry && industry.toLowerCase().includes('retail') && MEGA_CAP_TECH.has(symbol)) {
      return false;
    }
    return true;
  });

  if (filtered.length > 0) {
    return filtered;
  }

  if (overridePeers && overridePeers.length > 0) {
    return overridePeers.map((value) => value.toUpperCase());
  }

  const defaultGroup = derivedGroups.values().next().value as BusinessModelGroup | undefined;
  if (defaultGroup && PEER_GROUPS[defaultGroup]) {
    return PEER_GROUPS[defaultGroup];
  }

  return PEER_GROUPS.retail_apparel;
}

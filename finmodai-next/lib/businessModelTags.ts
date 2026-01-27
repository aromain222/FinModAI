/**
 * Lightweight business model tagging helper.
 * 
 * Uses sector hints, ticker overrides, and simple keyword rules
 * to keep peer selection business-model aware without new data feeds.
 */

const BUSINESS_MODEL_OVERRIDES: Record<string, string[]> = {
  SOFI: ['Fintech', 'Neobank', 'Digital Lending', 'Consumer Finance'],
  UPST: ['Fintech', 'AI Lending', 'Digital Lending'],
  LC: ['Fintech', 'Digital Lending'],
  AFRM: ['Fintech', 'Buy Now Pay Later'],
  SQ: ['Fintech', 'Payments', 'Merchant Services'],
  PYPL: ['Fintech', 'Payments', 'Digital Wallet'],
  HOOD: ['Fintech', 'Brokerage', 'Retail Trading'],
  MQ: ['Fintech', 'Payments Infrastructure'],
  NU: ['Fintech', 'Neobank', 'LatAm'],
  STNE: ['Fintech', 'Payments', 'LatAm'],
  COIN: ['Fintech', 'Crypto', 'Exchange'],
  SPOT: ['Streaming', 'Music Streaming', 'Subscription', 'Ad-Supported Platform'],
  SIRI: ['Audio', 'Subscription', 'Media'],
  TME: ['Streaming', 'Music Streaming', 'China'],
  NFLX: ['Streaming', 'Video Streaming', 'Subscription'],
  ROKU: ['Streaming', 'Ad-Supported Platform', 'Hardware'],
  IHRT: ['Audio', 'Ad-Supported Platform'],
  UBER: ['Marketplace', 'Mobility', 'Delivery'],
  LYFT: ['Marketplace', 'Mobility'],
  DASH: ['Marketplace', 'Delivery', 'Logistics'],
  ABNB: ['Marketplace', 'Travel'],
  RIVN: ['Auto/EV', 'Manufacturing'],
  LCID: ['Auto/EV', 'Luxury Auto'],
  TSLA: ['Auto/EV', 'Manufacturing', 'Battery'],
  NIO: ['Auto/EV', 'China'],
  XPEV: ['Auto/EV', 'China'],
  GM: ['Auto', 'Manufacturing'],
  F: ['Auto', 'Manufacturing'],
};

const SECTOR_TAGS: Record<string, string[]> = {
  software: ['Software', 'SaaS', 'Enterprise'],
  internet: ['Digital Platform', 'Ad-Supported Platform', 'Marketplace'],
  fintech: ['Fintech', 'Payments', 'Digital Finance'],
  consumer: ['Consumer', 'Retail'],
  luxury: ['Consumer', 'Luxury'],
  staples: ['Consumer', 'Staples'],
  telecom: ['Telecom', 'Media'],
  industrial: ['Industrial', 'Manufacturing'],
  energy: ['Energy', 'Resources'],
  financials: ['Financials', 'Banking'],
  other: ['Diversified'],
};

const KEYWORD_RULES: Array<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /music|audio/i, tags: ['Music Streaming', 'Streaming'] },
  { pattern: /video|film|tv|media/i, tags: ['Video Streaming', 'Streaming'] },
  { pattern: /stream/i, tags: ['Streaming'] },
  { pattern: /fintech|bank|lending|loan|card/i, tags: ['Fintech'] },
  { pattern: /payment|pay|merchant/i, tags: ['Payments'] },
  { pattern: /ride|mobility|delivery|logistics|transport/i, tags: ['Marketplace', 'Logistics'] },
  { pattern: /commerce|retail|apparel|consumer/i, tags: ['Consumer'] },
  { pattern: /cloud|software|platform|saas/i, tags: ['Software', 'SaaS'] },
  { pattern: /auto|ev|vehicle|battery/i, tags: ['Auto/EV'] },
];

function titleCase(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface BusinessModelClassificationInput {
  ticker: string;
  sector?: string;
  description?: string;
  industry?: string;
  fallbackTags?: string[];
}

export function classifyBusinessModel(input: BusinessModelClassificationInput): string[] {
  const upperTicker = input.ticker.trim().toUpperCase();
  const tags = new Set<string>();

  const overrideTags = BUSINESS_MODEL_OVERRIDES[upperTicker];
  if (overrideTags) {
    overrideTags.forEach((tag) => tags.add(tag));
  }

  const sectorKey = input.sector?.toLowerCase();
  if (sectorKey && SECTOR_TAGS[sectorKey]) {
    SECTOR_TAGS[sectorKey].forEach((tag) => tags.add(tag));
  } else if (input.sector) {
    tags.add(titleCase(input.sector));
  }

  const searchText = `${input.description || ''} ${input.industry || ''}`.trim();
  if (searchText.length > 0) {
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(searchText)) {
        rule.tags.forEach((tag) => tags.add(tag));
      }
    }
  }

  if (input.fallbackTags) {
    input.fallbackTags.forEach((tag) => tags.add(tag));
  }

  if (tags.size === 0) {
    tags.add('Diversified');
  }

  return Array.from(tags);
}

export function getBusinessModelOverride(ticker: string): string[] | undefined {
  return BUSINESS_MODEL_OVERRIDES[ticker.toUpperCase()];
}

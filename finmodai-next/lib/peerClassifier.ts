import type { BusinessModelGroup } from './peerGroups';
import { PEER_GROUPS, TICKER_TO_GROUP_OVERRIDE } from './peerGroups';
import type { CompanyProfile } from './companyProfile';

type KeywordRule = {
  group: BusinessModelGroup;
  keywords: RegExp[];
  sectorHints?: string[];
  industryHints?: RegExp[];
};

const normalize = (value?: string) => value?.toLowerCase() || '';

const GROUP_KEYWORDS: KeywordRule[] = [
  {
    group: 'consumer_fintech',
    keywords: [/fintech/, /lending/, /consumer finance/, /student loan/],
    sectorHints: ['financials'],
  },
  {
    group: 'b2b_fintech',
    keywords: [/merchant/, /point of sale/, /invoice/, /b2b/, /small business/],
    sectorHints: ['financials', 'technology'],
  },
  {
    group: 'payments_networks',
    keywords: [/payment/, /network/, /card/, /issuer/, /processor/],
    sectorHints: ['financials'],
  },
  {
    group: 'digital_wallets',
    keywords: [/wallet/, /super app/, /peer-to-peer/, /remittance/],
  },
  {
    group: 'brokerage_trading',
    keywords: [/broker/, /trading/, /exchange/, /clearing/, /securities/],
    sectorHints: ['financials'],
  },
  {
    group: 'music_streaming',
    keywords: [/music/, /audio/, /streaming/, /podcast/],
  },
  {
    group: 'video_streaming',
    keywords: [/video/, /ott/, /streaming/, /svod/, /avod/],
  },
  {
    group: 'ad_supported_media',
    keywords: [/advertising/, /ad tech/, /connected tv/, /programmatic/],
    sectorHints: ['communication', 'technology'],
  },
  {
    group: 'gaming_platforms',
    keywords: [/gaming/, /interactive entertainment/, /esports/],
  },
  {
    group: 'social_media',
    keywords: [/social/, /messaging/, /user-generated/, /community/],
  },
  {
    group: 'rideshare_mobility',
    keywords: [/rideshare/, /ride-hailing/, /mobility/, /transport/],
  },
  {
    group: 'food_delivery',
    keywords: [/delivery/, /courier/, /last mile/, /online food/],
  },
  {
    group: 'travel_marketplace',
    keywords: [/travel/, /booking/, /ota/, /trip/],
  },
  {
    group: 'hospitality_marketplace',
    keywords: [/vacation rental/, /hospitality/, /lodging/],
  },
  {
    group: 'ecommerce_marketplace',
    keywords: [/marketplace/, /e-commerce/, /commerce platform/],
  },
  {
    group: 'cloud_hyperscale',
    keywords: [/infrastructure/, /cloud/, /iaas/, /compute/],
    sectorHints: ['technology'],
  },
  {
    group: 'enterprise_saas_core',
    keywords: [/saas/, /enterprise software/, /workflow/, /crm/],
  },
  {
    group: 'vertical_saas',
    keywords: [/vertical/, /industry-specific/, /erp/, /practice management/],
  },
  {
    group: 'developer_tools',
    keywords: [/developer/, /devops/, /observability/, /data platform/],
  },
  {
    group: 'cybersecurity',
    keywords: [/security/, /endpoint/, /identity/, /zero trust/, /firewall/],
  },
  {
    group: 'data_infrastructure',
    keywords: [/data/, /analytics/, /warehouse/, /lake/, /etl/],
  },
  {
    group: 'semis_ai',
    keywords: [/gpu/, /accelerator/, /ai/, /datacenter/],
    sectorHints: ['information technology'],
  },
  {
    group: 'semis_analog',
    keywords: [/analog/, /rf/, /automotive/, /power management/],
  },
  {
    group: 'compute_hardware',
    keywords: [/server/, /storage/, /hardware/, /infrastructure/],
  },
  {
    group: 'consumer_electronics',
    keywords: [/consumer electronics/, /devices/, /wearables/, /audio/],
  },
  {
    group: 'autos_ev',
    keywords: [/ev/, /electric vehicle/, /battery/, /autonomous/],
    sectorHints: ['consumer discretionary'],
  },
  {
    group: 'autos_legacy',
    keywords: [/automotive/, /internal combustion/, /legacy auto/],
  },
  {
    group: 'energy_storage',
    keywords: [/battery/, /storage/, /charging/, /fuel cell/],
  },
  {
    group: 'solar_clean_energy',
    keywords: [/solar/, /renewable/, /clean energy/, /pv/],
  },
  {
    group: 'oil_gas_integrated',
    keywords: [/oil/, /gas/, /upstream/, /midstream/],
  },
  {
    group: 'oilfield_services',
    keywords: [/oilfield/, /services/, /drilling/, /equipment/],
  },
  {
    group: 'industrial_automation',
    keywords: [/automation/, /industrial/, /robotics/, /controls/],
  },
  {
    group: 'logistics_freight',
    keywords: [/logistics/, /freight/, /parcel/, /shipping/],
  },
  {
    group: 'aerospace_defense',
    keywords: [/aerospace/, /defense/, /missile/, /space/],
  },
  {
    group: 'airlines',
    keywords: [/airline/, /aviation/, /carrier/],
  },
  {
    group: 'medical_devices',
    keywords: [/medical device/, /surgical/, /implant/],
  },
  {
    group: 'healthcare_services',
    keywords: [/managed care/, /payer/, /provider/, /hospital/],
  },
  {
    group: 'biotech_growth',
    keywords: [/biotech/, /gene therapy/, /rna/, /clinical/],
  },
  {
    group: 'big_pharma',
    keywords: [/pharma/, /drug/, /therapeutics/],
  },
  {
    group: 'retail_apparel',
    keywords: [/apparel/, /athletic/, /fashion/, /footwear/],
  },
  {
    group: 'retail_broadlines',
    keywords: [/mass merchant/, /supercenter/, /discount/, /warehouse club/],
  },
  {
    group: 'luxury_brands',
    keywords: [/luxury/, /handbag/, /premium/, /couture/],
  },
  {
    group: 'restaurants',
    keywords: [/restaurant/, /quick service/, /fast casual/, /dining/],
  },
  {
    group: 'home_improvement',
    keywords: [/home improvement/, /home furnishings/, /remodel/, /building products/],
  },
  {
    group: 'telecom_wireless',
    keywords: [/wireless/, /mobility/, /5g/, /cellular/],
    sectorHints: ['communication'],
  },
  {
    group: 'telecom_cable',
    keywords: [/cable/, /broadband/, /fiber/, /msos/],
  },
  {
    group: 'utilities_regulated',
    keywords: [/utility/, /regulated/, /power/, /electric/],
  },
  {
    group: 'reits_digital',
    keywords: [/reit/, /data center/, /tower/, /digital infrastructure/],
  },
];

export function classifyBusinessModelGroup(profile: CompanyProfile): BusinessModelGroup | null {
  const ticker = profile.ticker.toUpperCase();
  if (TICKER_TO_GROUP_OVERRIDE[ticker]) {
    return TICKER_TO_GROUP_OVERRIDE[ticker];
  }

  const haystack = [
    profile.sector,
    profile.industry,
    profile.subIndustry,
    profile.description,
  ]
    .filter(Boolean)
    .map((value) => normalize(value))
    .join(' ');

  if (!haystack) {
    return null;
  }

  for (const rule of GROUP_KEYWORDS) {
    const inferredSectorOk =
      !rule.sectorHints ||
      rule.sectorHints.some((hint) => normalize(profile.sector).includes(hint));

    if (rule.sectorHints && !inferredSectorOk) {
      continue;
    }

    const industryText = `${normalize(profile.industry)} ${normalize(profile.subIndustry)}`;
    const industryOk =
      !rule.industryHints || rule.industryHints.some((regex) => regex.test(industryText));

    if (!industryOk) {
      continue;
    }

    if (rule.keywords.some((regex) => regex.test(haystack))) {
      return rule.group;
    }
  }

  return null;
}

export function groupExists(group: BusinessModelGroup | null | undefined): group is BusinessModelGroup {
  if (!group) {
    return false;
  }
  return Boolean(PEER_GROUPS[group]);
}

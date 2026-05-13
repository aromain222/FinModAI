import type { MarketCompanyListing } from '@/lib/data/company/companyUniverse';

export type TickerClassification = {
  sector: string;
  subsector: string;
  companyName?: string | null;
  exchange?: string | null;
  source: 'company_cache' | 'curated' | 'fallback';
};

function inSet(ticker: string, values: readonly string[]): boolean {
  return values.includes(ticker);
}

const GROUPS = {
  aiInfrastructure: [
    'NVDA', 'AMD', 'AVGO', 'TSM', 'ASML', 'ARM', 'MU', 'INTC', 'QCOM', 'SMCI',
    'MRVL', 'TXN', 'ADI', 'NXPI', 'LRCX', 'KLAC', 'AMAT', 'ON', 'MPWR', 'TER',
    'STX', 'WDC', 'NTAP', 'SNDK', 'RMBS', 'GFS', 'UMC', 'ASX', 'ALAB', 'CRDO',
    'COHR', 'LITE', 'CIEN', 'JNPR', 'ANET', 'VRT', 'DELL', 'HPE', 'HPQ',
  ],
  software: [
    'PLTR', 'CRM', 'ADBE', 'INTU', 'ADSK', 'WDAY', 'SNOW', 'NOW', 'DDOG',
    'NET', 'MDB', 'CRWD', 'PANW', 'ZS', 'OKTA', 'TEAM', 'SNPS', 'CDNS', 'GTLB',
    'CFLT', 'ESTC', 'DT', 'S', 'PCOR', 'BILL', 'HUBS', 'APP', 'TTD', 'DOCS',
    'BRZE', 'NTNX', 'PSTG', 'RAMP', 'VEEV', 'RBRK', 'CXM', 'AMPL', 'ASAN',
    'MNDY', 'SMAR', 'FRSH', 'DBX', 'BOX', 'DOCN', 'FROG', 'BASE', 'TWLO',
  ],
  internet: [
    'META', 'AMZN', 'GOOGL', 'GOOG', 'NFLX', 'ROKU', 'SHOP', 'SPOT', 'PDD',
    'BABA', 'BIDU', 'JD', 'SE', 'MELI', 'UBER', 'DASH', 'ABNB', 'BKNG', 'RDDT',
    'CART', 'PINS', 'SNAP', 'ZM', 'DOCU', 'ETSY', 'EBAY', 'W', 'DUOL', 'U',
    'TTWO', 'EA', 'EXPE', 'TRIP', 'TCOM', 'WIX', 'GRAB',
  ],
  fintechCrypto: [
    'SOFI', 'HOOD', 'COIN', 'AFRM', 'SQ', 'PYPL', 'MSTR', 'RIOT', 'MARA',
    'UPST', 'APLD', 'HIVE', 'BITF', 'BTBT', 'CAN', 'GREE', 'ANY', 'GLXY',
    'BKKT', 'FRGE', 'WULF', 'IREN', 'CIFR', 'HUT', 'BTDR', 'CLSK', 'CORZ',
    'NU', 'STNE', 'PAGS', 'TIGR', 'FUTU', 'QFIN', 'FINV', 'OPFI', 'ENVA',
    'AX', 'LC', 'RELY', 'PAYO', 'FOUR', 'TOST',
  ],
  roboticsAutonomy: [
    'ROK', 'CGNX', 'ZBRA', 'TRMB', 'KEYS', 'NATI', 'NOVT', 'AZTA', 'SYM',
    'IRBT', 'ATS', 'FARO', 'VLD', 'SSYS', 'DDD', 'SERV', 'RR', 'AUR', 'MBLY',
    'LAZR', 'OUST', 'AEVA', 'INVZ', 'ARBE', 'INDI', 'HSAI', 'ACHR', 'JOBY',
    'EVTL', 'EH', 'RKLB', 'LUNR', 'SPIR', 'AVAV', 'RCAT', 'PDYN',
  ],
  powerEnergy: [
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'LNG', 'NEE', 'DUK', 'SO',
    'CEG', 'VST', 'NRG', 'TLN', 'GEV', 'BWXT', 'LEU', 'SMR', 'OKLO', 'NNE',
    'BE', 'BLDP', 'PLUG', 'FCEL', 'RUN', 'ARRY', 'NXT', 'SHLS', 'SEDG',
    'ET', 'EPD', 'MPLX', 'OKE', 'PSX', 'VLO', 'MPC', 'HES', 'APA', 'RRC',
    'PAA', 'AM', 'DTM', 'TRGP',
  ],
  healthcare: [
    'LLY', 'NVO', 'UNH', 'HUM', 'CI', 'ELV', 'CVS', 'ABBV', 'MRK', 'PFE',
    'BMY', 'GILD', 'AMGN', 'REGN', 'VRTX', 'ISRG', 'SYK', 'MDT', 'TMO',
    'DHR', 'BSX', 'ZBH', 'JNJ', 'ABT', 'ZTS', 'DXCM', 'ALGN', 'MRNA', 'BNTX',
    'BIIB', 'ILMN', 'ALNY', 'CRSP', 'BEAM', 'NTLA', 'RXRX', 'NTRA', 'ADPT',
  ],
  financials: [
    'JPM', 'GS', 'BAC', 'C', 'MS', 'BLK', 'SCHW', 'AXP', 'COF', 'ALLY',
    'DFS', 'KKR', 'BX', 'APO', 'ICE', 'CME', 'SPGI', 'MCO', 'BRK.B', 'TROW',
    'USB', 'PNC', 'WFC', 'STT', 'BK', 'NTRS', 'TRV', 'CB', 'ALL', 'AIG',
    'AFL', 'MET', 'PRU', 'HIG', 'IBKR', 'VIRT',
  ],
  consumer: [
    'AAPL', 'DIS', 'WMT', 'COST', 'TGT', 'HD', 'LOW', 'NKE', 'SBUX',
    'MCD', 'CMG', 'YUM', 'KO', 'PEP', 'PG', 'CL', 'EL', 'LULU', 'TJX',
    'ULTA', 'RCL', 'CCL', 'CVNA', 'CAR', 'GME', 'AMC', 'CHWY', 'CAVA',
    'WING', 'BROS', 'CELH', 'MNST', 'DKNG', 'ONON', 'BIRK', 'HIMS',
  ],
  industrials: [
    'GE', 'HON', 'CAT', 'DE', 'ETN', 'EMR', 'PH', 'BA', 'LMT', 'RTX',
    'ITW', 'IR', 'GRMN', 'ROP', 'FTV', 'AME', 'XYL', 'OTIS', 'CARR',
    'AXON', 'LDOS', 'SAIC', 'BAH', 'KTOS', 'TDG', 'DAL', 'UAL', 'AAL',
    'LUV', 'FDX', 'UPS', 'CSX', 'UNP', 'NSC', 'GM', 'F', 'RIVN',
  ],
  materials: [
    'LIN', 'APD', 'ECL', 'SHW', 'PPG', 'CE', 'EMN', 'IFF', 'MOS', 'CF',
    'NTR', 'FCX', 'NEM', 'GOLD', 'AA', 'NUE', 'STLD', 'CLF', 'SCCO',
    'ALB', 'LAC', 'MP', 'CCJ', 'UUUU', 'UEC', 'NXE', 'TECK', 'RIO', 'BHP',
  ],
  realEstateUtilities: [
    'PLD', 'AMT', 'CCI', 'EQIX', 'O', 'SPG', 'VICI', 'PSA', 'DLR', 'IRM',
    'DBRG', 'AEP', 'EXC', 'PCG', 'XEL', 'ES', 'AWK', 'CNP', 'WEC', 'CMS',
    'DTE', 'PPL', 'AES', 'FE', 'D',
  ],
  telecomMedia: [
    'T', 'VZ', 'TMUS', 'CHTR', 'CMCSA', 'WBD', 'PARA', 'CSCO', 'ERIC', 'NOK',
    'EXTR', 'COMM', 'HLIT', 'VSAT', 'IRDM', 'ASTS', 'GSAT', 'LUMN',
  ],
} as const;

export function classifyTicker(ticker: string, listing?: MarketCompanyListing | null): TickerClassification {
  const normalized = ticker.trim().toUpperCase();
  if (listing?.sector || listing?.industry) {
    return {
      sector: listing.sector ?? 'Other',
      subsector: listing.industry ?? listing.sector ?? 'General',
      companyName: listing.companyName,
      exchange: listing.exchange,
      source: 'company_cache',
    };
  }
  if (inSet(normalized, GROUPS.aiInfrastructure)) return { sector: 'Technology', subsector: 'AI Infrastructure', source: 'curated' };
  if (inSet(normalized, GROUPS.software)) return { sector: 'Technology', subsector: 'Software / SaaS', source: 'curated' };
  if (inSet(normalized, GROUPS.internet)) return { sector: 'Communication Services', subsector: 'Internet / Platforms', source: 'curated' };
  if (inSet(normalized, GROUPS.fintechCrypto)) return { sector: 'Financials', subsector: 'Fintech / Crypto Beta', source: 'curated' };
  if (inSet(normalized, GROUPS.roboticsAutonomy)) return { sector: 'Industrials', subsector: 'Robotics / Autonomy', source: 'curated' };
  if (inSet(normalized, GROUPS.powerEnergy)) return { sector: 'Energy', subsector: 'Power / Energy', source: 'curated' };
  if (inSet(normalized, GROUPS.healthcare)) return { sector: 'Health Care', subsector: 'Healthcare Growth', source: 'curated' };
  if (inSet(normalized, GROUPS.financials)) return { sector: 'Financials', subsector: 'Banks / Capital Markets', source: 'curated' };
  if (inSet(normalized, GROUPS.consumer)) return { sector: 'Consumer', subsector: 'Consumer / Retail', source: 'curated' };
  if (inSet(normalized, GROUPS.industrials)) return { sector: 'Industrials', subsector: 'Industrial / Transport', source: 'curated' };
  if (inSet(normalized, GROUPS.materials)) return { sector: 'Materials', subsector: 'Materials / Mining', source: 'curated' };
  if (inSet(normalized, GROUPS.realEstateUtilities)) return { sector: 'Real Estate / Utilities', subsector: 'REITs / Utilities', source: 'curated' };
  if (inSet(normalized, GROUPS.telecomMedia)) return { sector: 'Communication Services', subsector: 'Telecom / Media', source: 'curated' };
  return { sector: 'Other', subsector: 'General', source: 'fallback' };
}

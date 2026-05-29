/**
 * Deterministic theme classifier used by the portfolio screener and final
 * synthesis gates. Keep this broad enough for discovery, but strict enough that
 * generic liquid names do not pad a themed portfolio.
 */

export type ThemeMatchInput = {
  ticker?: string;
  symbol?: string;
  name?: string;
  sector?: string;
  industry?: string;
  business_summary?: string;
};

export type ThemeMatchResult = {
  fits: boolean;
  matchedThemes: string[];
  matchedBy: 'ticker' | 'keyword' | 'none';
  score: number;
  reason: string;
};

type ThemeDefinition = {
  aliases: string[];
  keywords: string[];
  tickers: string[];
};

const THEME_DEFINITIONS: Record<string, ThemeDefinition> = {
  ai: {
    aliases: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gpt', 'generative ai'],
    keywords: [
      'artificial intelligence', 'generative ai', 'machine learning', 'deep learning',
      'large language model', 'neural', 'accelerated computing', 'gpu', 'data center',
      'semiconductor', 'chip', 'robotics', 'automation', 'computer vision', 'ai infrastructure',
    ],
    tickers: [
      'NVDA', 'MSFT', 'GOOGL', 'META', 'AMZN', 'AMD', 'AVGO', 'ARM', 'TSM', 'ASML',
      'PLTR', 'ORCL', 'CRM', 'NOW', 'SNOW', 'MDB', 'DDOG', 'NET', 'PANW', 'CRWD',
      'ZS', 'PATH', 'AI', 'SOUN', 'BBAI', 'TEM', 'APP', 'TTD', 'U', 'RBLX',
      'SMCI', 'DELL', 'HPE', 'VRT', 'ETN', 'PWR', 'ANET', 'MU', 'MRVL', 'AMAT',
      'LRCX', 'KLAC', 'TER', 'COHR', 'WDC', 'STX', 'QCOM', 'TXN', 'ADI', 'MCHP',
      'ON', 'MPWR', 'LSCC', 'ALAB', 'CRDO', 'ACLS', 'AEHR', 'AMBA', 'MBLY', 'ISRG',
      'SYM', 'SERV', 'CGNX', 'ROK', 'ZBRA', 'AUR', 'TSLA', 'IONQ', 'RGTI', 'QBTS',
      'ADBE', 'INTU', 'CDNS', 'SNPS', 'ADSK', 'ANSS', 'VEEV', 'HUBS', 'ESTC', 'GTLB',
      'CFLT', 'IOT', 'TWLO', 'DOCU', 'PCOR', 'DUOL', 'DT', 'RPD', 'CYBR', 'OKTA',
      'FTNT', 'AKAM', 'FSLY', 'PSTG', 'NTAP', 'IBM', 'ACN', 'GDDY', 'PAYC', 'MANH',
      'NICE', 'PEGA', 'BILL', 'FOUR', 'TOST', 'UPST', 'FICO', 'TYL', 'DOCN', 'ZM',
    ],
  },
  tech: {
    aliases: ['tech', 'technology', 'software', 'saas', 'cloud computing', 'enterprise software'],
    keywords: ['software', 'cloud', 'cybersecurity', 'internet', 'platform', 'semiconductor', 'data analytics'],
    tickers: [
      'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NVDA', 'AMD', 'AVGO', 'ORCL', 'CRM',
      'ADBE', 'NOW', 'INTU', 'ADP', 'SNOW', 'DDOG', 'NET', 'MDB', 'TEAM', 'WDAY',
      'SHOP', 'UBER', 'DASH', 'ABNB', 'SQ', 'PYPL', 'HOOD', 'COIN', 'PANW', 'CRWD',
      'ZS', 'OKTA', 'S', 'FTNT', 'ANET', 'DELL', 'HPE', 'SMCI', 'MU', 'MRVL',
    ],
  },
  space: {
    aliases: ['space', 'aerospace', 'rocket', 'satellite', 'defense', 'hypersonic'],
    keywords: ['space', 'aerospace', 'rocket', 'satellite', 'launch', 'defense', 'hypersonic', 'orbital'],
    tickers: [
      'RKLB', 'LUNR', 'ASTS', 'PL', 'SPIR', 'SATL', 'BKSY', 'IRDM', 'VSAT', 'GSAT',
      'SPCE', 'BA', 'LMT', 'NOC', 'RTX', 'GD', 'TDG', 'HEI', 'HWM', 'KTOS',
      'AVAV', 'ACHR', 'JOBY', 'EVTL', 'TXT', 'SPR', 'MRCY', 'CW', 'AXON', 'LDOS',
    ],
  },
  robotics: {
    aliases: ['robotics', 'robot', 'automation', 'autonomous', 'industrial automation'],
    keywords: ['robotics', 'robot', 'automation', 'autonomous', 'machine vision', 'industrial software'],
    tickers: [
      'ISRG', 'SYM', 'TER', 'CGNX', 'ZBRA', 'ROK', 'EMR', 'HON', 'PH', 'DE',
      'CAT', 'TSLA', 'MBLY', 'AUR', 'SERV', 'IRBT', 'NVDA', 'AMD', 'AVGO', 'AMBA',
      'PATH', 'ABBNY', 'FANUY', 'FANUF', 'GM', 'F', 'APTV', 'ALV', 'KNSL',
    ],
  },
  semis: {
    aliases: ['semi', 'semis', 'semiconductor', 'semiconductors', 'chip', 'chips', 'chipmaker', 'fab'],
    keywords: ['semiconductor', 'chip', 'wafer', 'foundry', 'fab', 'analog devices', 'memory'],
    tickers: [
      'NVDA', 'AMD', 'AVGO', 'TSM', 'ASML', 'ARM', 'MU', 'MRVL', 'QCOM', 'TXN',
      'ADI', 'MCHP', 'ON', 'MPWR', 'LSCC', 'NXPI', 'INTC', 'AMAT', 'LRCX', 'KLAC',
      'TER', 'COHR', 'ACLS', 'AEHR', 'AMBA', 'ALAB', 'CRDO', 'ENTG', 'ONTO', 'FORM',
      'VECO', 'RMBS', 'WOLF', 'STM', 'GFS', 'UMC', 'ASX', 'SMTC', 'POWI',
    ],
  },
  cloud: {
    aliases: ['cloud', 'data center', 'datacenter', 'infrastructure', 'enterprise cloud'],
    keywords: ['cloud', 'data center', 'datacenter', 'server', 'networking', 'infrastructure'],
    tickers: [
      'MSFT', 'AMZN', 'GOOGL', 'ORCL', 'CRM', 'NOW', 'SNOW', 'DDOG', 'NET', 'MDB',
      'ANET', 'VRT', 'ETN', 'PWR', 'DELL', 'HPE', 'SMCI', 'NTAP', 'PSTG', 'WDC',
      'STX', 'CRWD', 'PANW', 'ZS', 'AKAM', 'FSLY',
    ],
  },
  cybersecurity: {
    aliases: ['cyber', 'cybersecurity', 'security', 'zero trust'],
    keywords: ['cybersecurity', 'security software', 'zero trust', 'endpoint security', 'identity security'],
    tickers: ['CRWD', 'PANW', 'ZS', 'FTNT', 'OKTA', 'S', 'NET', 'CYBR', 'VRNS', 'TENB', 'QLYS', 'RPD', 'GEN', 'CHKP'],
  },
  crypto: {
    aliases: ['crypto', 'bitcoin', 'blockchain', 'defi', 'web3', 'digital asset'],
    keywords: ['crypto', 'bitcoin', 'blockchain', 'digital asset', 'mining'],
    tickers: ['COIN', 'MSTR', 'HOOD', 'SQ', 'PYPL', 'RIOT', 'MARA', 'CLSK', 'HUT', 'BITF', 'IREN', 'CIFR', 'WULF', 'BTBT', 'HIVE', 'CAN'],
  },
  fintech: {
    aliases: ['fintech', 'payments', 'neobank', 'insurtech', 'lending'],
    keywords: ['fintech', 'payments', 'lending', 'brokerage', 'digital bank', 'insurance technology'],
    tickers: ['SOFI', 'HOOD', 'AFRM', 'SQ', 'PYPL', 'COIN', 'NU', 'TOST', 'FOUR', 'BILL', 'UPST', 'LC', 'ALLY', 'AXP', 'V', 'MA', 'FI', 'FIS'],
  },
  biotech: {
    aliases: ['biotech', 'biopharma', 'pharma', 'drug', 'clinical', 'genomics', 'oncology', 'therapeutics'],
    keywords: ['biotech', 'biopharma', 'therapeutics', 'clinical', 'oncology', 'genomics', 'drug discovery'],
    tickers: [
      'LLY', 'NVO', 'REGN', 'VRTX', 'MRNA', 'BNTX', 'CRSP', 'NTLA', 'BEAM', 'EDIT',
      'RXRX', 'SDGR', 'TWST', 'ILMN', 'TMO', 'DHR', 'TECH', 'EXAS', 'HALO', 'BMRN',
      'SRPT', 'RARE', 'IONS', 'ALNY', 'NBIX', 'ARGX', 'LEGN', 'VKTX', 'MDGL',
    ],
  },
  energy: {
    aliases: ['energy', 'oil', 'gas', 'lng', 'solar', 'renewable', 'clean energy', 'ev battery', 'nuclear'],
    keywords: ['energy', 'oil', 'gas', 'lng', 'solar', 'renewable', 'battery', 'nuclear', 'uranium'],
    tickers: [
      'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'HAL', 'LNG', 'FLNG', 'ENPH', 'FSLR',
      'SEDG', 'RUN', 'NEE', 'CEG', 'CCJ', 'UEC', 'UUUU', 'SMR', 'NNE', 'OKLO',
      'TSLA', 'ALB', 'LAC', 'PLL', 'QS', 'ENVX',
    ],
  },
  consumer: {
    aliases: ['consumer', 'retail', 'ecommerce', 'e-commerce', 'apparel', 'luxury'],
    keywords: ['retail', 'consumer', 'ecommerce', 'e-commerce', 'marketplace', 'restaurant', 'apparel'],
    tickers: ['AMZN', 'SHOP', 'MELI', 'SE', 'BABA', 'JD', 'WMT', 'COST', 'TGT', 'HD', 'LOW', 'NKE', 'LULU', 'ELF', 'CAVA', 'CMG', 'SBUX', 'MCD'],
  },
  internet: {
    aliases: ['internet', 'platform', 'ad tech', 'streaming', 'social media', 'marketplace'],
    keywords: ['internet', 'platform', 'advertising', 'streaming', 'social media', 'marketplace', 'rideshare'],
    tickers: ['GOOGL', 'META', 'AMZN', 'NFLX', 'SPOT', 'ROKU', 'TTD', 'APP', 'UBER', 'DASH', 'ABNB', 'SHOP', 'MELI', 'SE', 'SNAP', 'PINS', 'RDDT', 'MTCH'],
  },
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').toLowerCase();
}

function keywordMatches(text: string, keyword: string): boolean {
  const lower = keyword.toLowerCase();
  if (lower.length <= 3) {
    return new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  }
  return text.includes(lower);
}

export function canonicalizeTheme(theme: string): string | null {
  const lower = theme.toLowerCase().trim();
  for (const [key, def] of Object.entries(THEME_DEFINITIONS)) {
    if (key === lower || def.aliases.some(alias => alias === lower)) return key;
  }
  return null;
}

export function detectThemesFromPrompt(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const themes: string[] = [];
  for (const [theme, def] of Object.entries(THEME_DEFINITIONS)) {
    if (def.aliases.some(alias => keywordMatches(lower, alias))) themes.push(theme);
  }
  return unique(themes);
}

export function getThemeFallbackTickers(themes: string[], limit = 100): string[] {
  const canonicalThemes = unique(themes.map(t => canonicalizeTheme(t) ?? t));
  const tickers = canonicalThemes.flatMap(theme => THEME_DEFINITIONS[theme]?.tickers ?? []);
  return unique(tickers).slice(0, limit);
}

export function matchThemes(input: ThemeMatchInput, themes: string[]): ThemeMatchResult {
  const canonicalThemes = unique(themes.map(t => canonicalizeTheme(t) ?? t));
  if (canonicalThemes.length === 0) {
    return { fits: true, matchedThemes: [], matchedBy: 'none', score: 10, reason: 'No theme filter requested.' };
  }

  const ticker = (input.ticker ?? input.symbol ?? '').toUpperCase().trim();
  const text = [
    input.name,
    input.sector,
    input.industry,
    input.business_summary,
  ].map(normalizeText).join(' ');

  const tickerThemes = canonicalThemes.filter(theme =>
    THEME_DEFINITIONS[theme]?.tickers.includes(ticker),
  );
  if (tickerThemes.length > 0) {
    return {
      fits: true,
      matchedThemes: tickerThemes,
      matchedBy: 'ticker',
      score: 9,
      reason: `${ticker} is tagged to ${tickerThemes.join(', ')}.`,
    };
  }

  const keywordThemes = canonicalThemes.filter(theme => {
    const def = THEME_DEFINITIONS[theme];
    return !!def && def.keywords.some(keyword => keywordMatches(text, keyword));
  });
  if (keywordThemes.length > 0) {
    return {
      fits: true,
      matchedThemes: keywordThemes,
      matchedBy: 'keyword',
      score: 7,
      reason: `${ticker || 'Asset'} matched ${keywordThemes.join(', ')} by business description.`,
    };
  }

  return {
    fits: false,
    matchedThemes: [],
    matchedBy: 'none',
    score: 1,
    reason: `${ticker || 'Asset'} has no deterministic link to requested themes: ${canonicalThemes.join(', ')}.`,
  };
}

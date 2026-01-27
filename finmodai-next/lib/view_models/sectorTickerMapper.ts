/**
 * Deterministic Sector/Ticker Mapper
 * Maps driver tags to impacted sectors and representative tickers
 * NO LLM REQUIRED - pure rule-based logic
 */

export type DriverTag = 'Rates' | 'Energy' | 'Geopolitics' | 'Earnings' | 'Risk-off' | 'Risk-on';

export type SectorImpact = {
  sector: string;
  etf: string;
  tickers: string[];
  direction: 'winners' | 'losers';
};

/**
 * Maps driver tags to sector impacts
 */
export function mapDriverTagsToSectors(
  driverTags: string[],
  sectorMomentum?: Array<{ sector: string; score: number; direction: 'up' | 'down' | 'flat' }>
): { winners: SectorImpact[]; losers: SectorImpact[] } {
  const winners: SectorImpact[] = [];
  const losers: SectorImpact[] = [];
  const processedSectors = new Set<string>();

  // Normalize driver tags
  const normalizedTags = driverTags.map((tag) => tag.trim()).filter(Boolean);
  const hasRates = normalizedTags.some((tag) => /rate|fed|yield|hawk|dove/i.test(tag));
  const hasEnergy = normalizedTags.some((tag) => /energy|oil|crude|gas/i.test(tag));
  const hasGeopolitics = normalizedTags.some((tag) => /geopolit|war|conflict|defense|military/i.test(tag));
  const hasEarnings = normalizedTags.some((tag) => /earnings|corporate|profit/i.test(tag));
  const isRiskOff = normalizedTags.some((tag) => /risk.?off|flight|safe|havens/i.test(tag));
  const isRiskOn = normalizedTags.some((tag) => /risk.?on|risk.?appetite|growth/i.test(tag));

  // If sector momentum data is available, use it to prioritize
  const sectorMap = new Map<string, { score: number; direction: 'up' | 'down' | 'flat' }>();
  if (sectorMomentum) {
    sectorMomentum.forEach((s) => {
      sectorMap.set(s.sector, { score: s.score, direction: s.direction });
    });
  }

  // RATES UP / HAWKISH
  if (hasRates && !normalizedTags.some((tag) => /dove|cut|ease/i.test(tag))) {
    // Losers: Rate-sensitive sectors
    if (!processedSectors.has('XLU')) {
      losers.push({
        sector: 'Utilities',
        etf: 'XLU',
        tickers: ['NEE', 'DUK', 'SO'],
        direction: 'losers',
      });
      processedSectors.add('XLU');
    }
    if (!processedSectors.has('XLRE')) {
      losers.push({
        sector: 'Real Estate',
        etf: 'XLRE',
        tickers: ['PLD', 'AMT', 'EQIX'],
        direction: 'losers',
      });
      processedSectors.add('XLRE');
    }
    // High-duration tech
    if (!processedSectors.has('XLK')) {
      losers.push({
        sector: 'Technology (long-duration)',
        etf: 'XLK',
        tickers: ['CRM', 'NOW', 'ADBE'],
        direction: 'losers',
      });
      processedSectors.add('XLK');
    }
    // Small caps
    if (!processedSectors.has('IWM')) {
      losers.push({
        sector: 'Small Caps',
        etf: 'IWM',
        tickers: ['IWM'],
        direction: 'losers',
      });
      processedSectors.add('IWM');
    }
    // Winners: Banks (if curve steepening)
    if (!processedSectors.has('XLF')) {
      winners.push({
        sector: 'Financials (banks)',
        etf: 'XLF',
        tickers: ['JPM', 'BAC', 'WFC'],
        direction: 'winners',
      });
      processedSectors.add('XLF');
    }
  }

  // RATES DOWN / DOVISH
  if (hasRates && normalizedTags.some((tag) => /dove|cut|ease/i.test(tag))) {
    // Winners: Rate-sensitive sectors
    if (!processedSectors.has('XLU')) {
      winners.push({
        sector: 'Utilities',
        etf: 'XLU',
        tickers: ['NEE', 'DUK', 'SO'],
        direction: 'winners',
      });
      processedSectors.add('XLU');
    }
    if (!processedSectors.has('XLRE')) {
      winners.push({
        sector: 'Real Estate',
        etf: 'XLRE',
        tickers: ['PLD', 'AMT', 'EQIX'],
        direction: 'winners',
      });
      processedSectors.add('XLRE');
    }
    // Growth/tech
    if (!processedSectors.has('QQQ')) {
      winners.push({
        sector: 'Growth/Technology',
        etf: 'QQQ',
        tickers: ['QQQ', 'AAPL', 'MSFT'],
        direction: 'winners',
      });
      processedSectors.add('QQQ');
    }
  }

  // ENERGY UP
  if (hasEnergy && !normalizedTags.some((tag) => /energy.*down|oil.*down/i.test(tag))) {
    // Winners: Energy
    if (!processedSectors.has('XLE')) {
      winners.push({
        sector: 'Energy',
        etf: 'XLE',
        tickers: ['XOM', 'CVX', 'SLB'],
        direction: 'winners',
      });
      processedSectors.add('XLE');
    }
    // Losers: Airlines, transports
    if (!processedSectors.has('Airlines')) {
      losers.push({
        sector: 'Airlines',
        etf: 'JETS',
        tickers: ['DAL', 'UAL', 'LUV'],
        direction: 'losers',
      });
      processedSectors.add('Airlines');
    }
  }

  // GEOPOLITICS
  if (hasGeopolitics) {
    // Winners: Defense, energy
    if (!processedSectors.has('Defense')) {
      winners.push({
        sector: 'Defense',
        etf: 'ITA',
        tickers: ['LMT', 'RTX', 'NOC'],
        direction: 'winners',
      });
      processedSectors.add('Defense');
    }
    if (!processedSectors.has('XLE')) {
      winners.push({
        sector: 'Energy',
        etf: 'XLE',
        tickers: ['XOM', 'CVX'],
        direction: 'winners',
      });
      processedSectors.add('XLE');
    }
    // Losers: Travel/leisure (risk-off)
    if (isRiskOff && !processedSectors.has('Travel')) {
      losers.push({
        sector: 'Travel/Leisure',
        etf: 'JETS',
        tickers: ['CCL', 'BKNG', 'EXPE'],
        direction: 'losers',
      });
      processedSectors.add('Travel');
    }
  }

  // RISK-OFF
  if (isRiskOff) {
    // Winners: Staples, health care
    if (!processedSectors.has('XLP')) {
      winners.push({
        sector: 'Consumer Staples',
        etf: 'XLP',
        tickers: ['PG', 'COST', 'KO'],
        direction: 'winners',
      });
      processedSectors.add('XLP');
    }
    if (!processedSectors.has('XLV')) {
      winners.push({
        sector: 'Health Care',
        etf: 'XLV',
        tickers: ['UNH', 'JNJ', 'LLY'],
        direction: 'winners',
      });
      processedSectors.add('XLV');
    }
  }

  // EARNINGS: Use sector momentum data if available
  if (hasEarnings && sectorMomentum) {
    // Sort by score and take top winners/losers
    const sorted = [...sectorMomentum].sort((a, b) => b.score - a.score);
    const topWinners = sorted.filter((s) => s.direction === 'up').slice(0, 3);
    const topLosers = sorted.filter((s) => s.direction === 'down').slice(0, 3);

    topWinners.forEach((s) => {
      if (!processedSectors.has(s.sector)) {
        const etf = getEtfForSector(s.sector);
        if (etf) {
          winners.push({
            sector: s.sector,
            etf,
            tickers: getTickersForSector(s.sector).slice(0, 3),
            direction: 'winners',
          });
          processedSectors.add(s.sector);
        }
      }
    });

    topLosers.forEach((s) => {
      if (!processedSectors.has(s.sector)) {
        const etf = getEtfForSector(s.sector);
        if (etf) {
          losers.push({
            sector: s.sector,
            etf,
            tickers: getTickersForSector(s.sector).slice(0, 3),
            direction: 'losers',
          });
          processedSectors.add(s.sector);
        }
      }
    });
  }

  // Limit to 6 winners and 6 losers max
  return {
    winners: winners.slice(0, 6),
    losers: losers.slice(0, 6),
  };
}

/**
 * Get ETF symbol for sector name
 */
function getEtfForSector(sector: string): string | null {
  const map: Record<string, string> = {
    Financials: 'XLF',
    Technology: 'XLK',
    Energy: 'XLE',
    'Consumer Discretionary': 'XLY',
    'Consumer Staples': 'XLP',
    Industrials: 'XLI',
    Materials: 'XLB',
    'Health Care': 'XLV',
    Utilities: 'XLU',
    'Real Estate': 'XLRE',
    'Communication Services': 'XLC',
  };
  return map[sector] || null;
}

/**
 * Get representative tickers for sector
 */
function getTickersForSector(sector: string): string[] {
  const map: Record<string, string[]> = {
    Financials: ['JPM', 'BAC', 'WFC', 'GS'],
    Technology: ['AAPL', 'MSFT', 'NVDA', 'META'],
    Energy: ['XOM', 'CVX', 'SLB', 'COP'],
    'Consumer Discretionary': ['AMZN', 'TSLA', 'HD', 'MCD'],
    'Consumer Staples': ['PG', 'COST', 'PEP', 'KO'],
    Industrials: ['BA', 'CAT', 'GE', 'HON'],
    Materials: ['LIN', 'SHW', 'APD', 'FCX'],
    'Health Care': ['LLY', 'UNH', 'JNJ', 'MRK'],
    Utilities: ['NEE', 'DUK', 'SO', 'SRE'],
    'Real Estate': ['PLD', 'AMT', 'EQIX', 'WELL'],
    'Communication Services': ['GOOGL', 'NFLX', 'CMCSA', 'DIS'],
  };
  return map[sector] || [];
}


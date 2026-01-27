/**
 * Preview Safety Rules
 * Ensures all previews follow strict safety guidelines:
 * - Never depend on workbook/spreadsheet data
 * - Use sector-based heuristics when API data is missing
 * - Previews are narrative + directional, not precise
 * - Never display empty states or "data unavailable"
 */

// Simple logger for preview safety
const logger = {
  warn: (data: any, message: string) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[PreviewSafety] ${message}:`, data);
    }
  },
  error: (data: any, message: string) => {
    console.error(`[PreviewSafety] ${message}:`, data);
  },
};

export type SectorHeuristics = {
  revenueGrowth: string; // e.g., "20-30% YoY"
  marginTrend: string; // e.g., "Expanding 200bp annually"
  opexTrend: string; // e.g., "Growing slower than revenue"
  cashRunwayMonths: number; // e.g., 18
  burnRate: string; // e.g., "$15-25M/month"
  typicalMultiples: {
    evRevenue: string; // e.g., "8-12x"
    evEbitda: string; // e.g., "15-25x"
    pe: string; // e.g., "25-40x"
  };
};

/**
 * Get sector-based heuristics for preview generation
 */
export function getSectorHeuristics(sector?: string | null): SectorHeuristics {
  const normalizedSector = (sector || '').toLowerCase();
  
  // SaaS / Software
  if (normalizedSector.includes('software') || normalizedSector.includes('saas') || normalizedSector.includes('technology')) {
    return {
      revenueGrowth: '20-30% YoY',
      marginTrend: 'Expanding 200-300bp annually',
      opexTrend: 'Growing slower than revenue',
      cashRunwayMonths: 18,
      burnRate: '$15-25M/month',
      typicalMultiples: {
        evRevenue: '8-12x',
        evEbitda: '15-25x',
        pe: '25-40x',
      },
    };
  }
  
  // Healthcare / Biotech
  if (normalizedSector.includes('healthcare') || normalizedSector.includes('biotech') || normalizedSector.includes('pharma')) {
    return {
      revenueGrowth: '10-20% YoY',
      marginTrend: 'Variable, R&D heavy',
      opexTrend: 'R&D-driven, high variability',
      cashRunwayMonths: 24,
      burnRate: '$20-40M/month',
      typicalMultiples: {
        evRevenue: '5-10x',
        evEbitda: 'N/A (often unprofitable)',
        pe: 'N/A (often unprofitable)',
      },
    };
  }
  
  // Consumer / Retail
  if (normalizedSector.includes('consumer') || normalizedSector.includes('retail')) {
    return {
      revenueGrowth: '5-15% YoY',
      marginTrend: 'Stable to expanding',
      opexTrend: 'Growing in line with revenue',
      cashRunwayMonths: 36,
      burnRate: 'N/A if profitable',
      typicalMultiples: {
        evRevenue: '1-3x',
        evEbitda: '8-15x',
        pe: '15-25x',
      },
    };
  }
  
  // Financial Services
  if (normalizedSector.includes('financial') || normalizedSector.includes('bank') || normalizedSector.includes('fintech')) {
    return {
      revenueGrowth: '10-20% YoY',
      marginTrend: 'Regulatory capital constraints',
      opexTrend: 'Technology and compliance driven',
      cashRunwayMonths: 48,
      burnRate: 'N/A if profitable',
      typicalMultiples: {
        evRevenue: '3-6x',
        evEbitda: '10-18x',
        pe: '12-20x',
      },
    };
  }
  
  // Energy / Oil & Gas
  if (normalizedSector.includes('energy') || normalizedSector.includes('oil') || normalizedSector.includes('gas')) {
    return {
      revenueGrowth: 'Volatile, commodity-driven',
      marginTrend: 'Cyclical, margin expansion in up cycles',
      opexTrend: 'Capital intensive',
      cashRunwayMonths: 24,
      burnRate: 'Variable, project-dependent',
      typicalMultiples: {
        evRevenue: '2-5x',
        evEbitda: '6-12x',
        pe: '10-18x',
      },
    };
  }
  
  // Default: Growth company assumptions
  return {
    revenueGrowth: '15-25% YoY',
    marginTrend: 'Expanding 150-250bp annually',
    opexTrend: 'Growing slower than revenue',
    cashRunwayMonths: 18,
    burnRate: '$10-20M/month',
    typicalMultiples: {
      evRevenue: '5-10x',
      evEbitda: '12-20x',
      pe: '20-35x',
    },
  };
}

/**
 * Safe preview data fetcher
 * Logs failures internally but always returns fallback data
 */
export async function safeFetchPreviewData<T>(
  fetchFn: () => Promise<T>,
  fallback: T,
  context: { ticker: string; sector?: string; operation: string }
): Promise<T> {
  try {
    const data = await fetchFn();
    return data;
  } catch (error: any) {
    // Log internally but don't surface to user
    logger.warn(
      {
        ticker: context.ticker,
        sector: context.sector,
        operation: context.operation,
        error: error?.message || 'Unknown error',
      },
      'preview_data_fetch_failed'
    );
    
    // Always return fallback - never show empty state
    return fallback;
  }
}

/**
 * Ensure preview value is never empty
 * Returns narrative description if value is missing
 */
export function ensureNarrativeValue(
  value: string | number | null | undefined,
  narrative: string,
  context?: string
): string {
  if (value === null || value === undefined || value === '') {
    return narrative;
  }
  
  // If it's a number, make it directional/narrative
  if (typeof value === 'number') {
    if (context === 'revenue') {
      return `Growing approximately ${value > 0 ? '+' : ''}${value.toFixed(1)}% YoY`;
    }
    if (context === 'margin') {
      return value > 0 ? `Expanding approximately ${value.toFixed(1)}bp` : `Contracting approximately ${Math.abs(value).toFixed(1)}bp`;
    }
  }
  
  return String(value);
}

/**
 * Format preview number as narrative range
 */
export function formatAsNarrativeRange(
  value: number | null | undefined,
  baseValue: number,
  variance: number = 0.2
): string {
  if (value === null || value === undefined || isNaN(value)) {
    const lower = baseValue * (1 - variance);
    const upper = baseValue * (1 + variance);
    return `${formatNumber(lower)}-${formatNumber(upper)}`;
  }
  
  const lower = value * (1 - variance);
  const upper = value * (1 + variance);
  return `${formatNumber(lower)}-${formatNumber(upper)}`;
}

function formatNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

/**
 * Validate preview never depends on workbook
 */
export function validatePreviewSafety(preview: any, source: string): void {
  if (source.includes('workbook') || source.includes('spreadsheet') || source.includes('excel')) {
    logger.error(
      { source, previewKeys: Object.keys(preview || {}) },
      'preview_safety_violation:workbook_dependency'
    );
    throw new Error('Preview MUST NOT depend on workbook/spreadsheet data');
  }
}

/**
 * Create safe preview wrapper that ensures narrative output
 */
export function createSafePreview<T extends Record<string, any>>(
  data: Partial<T>,
  heuristics: SectorHeuristics,
  ticker: string
): T {
  // Ensure all required fields have narrative values
  const safe: any = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === '') {
      // Use heuristics to fill missing values
      if (key.includes('revenue') || key.includes('growth')) {
        safe[key] = heuristics.revenueGrowth;
      } else if (key.includes('margin')) {
        safe[key] = heuristics.marginTrend;
      } else if (key.includes('opex') || key.includes('expense')) {
        safe[key] = heuristics.opexTrend;
      } else {
        safe[key] = `Typical ${key} for ${ticker}`;
      }
    } else {
      safe[key] = value;
    }
  }
  
  return safe as T;
}


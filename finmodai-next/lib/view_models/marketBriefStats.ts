/**
 * Deterministic Market Brief Statistics
 * NO LLM REQUIRED - pure rule-based logic
 */

/**
 * Determine sentiment label from benchmark return + breadth
 * Deterministic rules:
 * - if benchmarkReturnPct > +0.50% and rising > falling => Bullish
 * - if benchmarkReturnPct < -0.50% and falling > rising => Bearish
 * - else Neutral
 */
export function determineSentiment(
  benchmarkReturn: number | null,
  breadth: { sectorsUp: number; sectorsDown: number } | null
): 'Bullish' | 'Neutral' | 'Bearish' {
  // If benchmark missing and no breadth, return Neutral
  if (benchmarkReturn === null && !breadth) return 'Neutral';
  
  // Deterministic rules
  if (benchmarkReturn !== null && breadth) {
    // Bullish: benchmark > +0.50% AND rising > falling
    if (benchmarkReturn > 0.50 && breadth.sectorsUp > breadth.sectorsDown) {
      return 'Bullish';
    }
    // Bearish: benchmark < -0.50% AND falling > rising
    if (benchmarkReturn < -0.50 && breadth.sectorsDown > breadth.sectorsUp) {
      return 'Bearish';
    }
  }
  
  // Fallback: use benchmark alone if breadth missing
  if (benchmarkReturn !== null) {
    if (benchmarkReturn > 0.50) return 'Bullish';
    if (benchmarkReturn < -0.50) return 'Bearish';
  }
  
  // Fallback: use breadth alone if benchmark missing
  if (breadth) {
    if (breadth.sectorsUp > breadth.sectorsDown) return 'Bullish';
    if (breadth.sectorsDown > breadth.sectorsUp) return 'Bearish';
  }
  
  return 'Neutral';
}

/**
 * Compute breadth from sectors array
 * Returns { rising, falling, flat } counts
 */
export function computeBreadthFromSectors(sectors: Array<{ returnPct?: number | null }>): {
  rising: number;
  falling: number;
  flat: number;
} {
  if (!sectors || sectors.length === 0) {
    return { rising: 0, falling: 0, flat: 0 };
  }
  
  let rising = 0;
  let falling = 0;
  let flat = 0;
  
  for (const sector of sectors) {
    const returnPct = sector.returnPct;
    if (returnPct === null || returnPct === undefined) {
      flat++;
    } else if (returnPct > 0) {
      rising++;
    } else if (returnPct < 0) {
      falling++;
    } else {
      flat++;
    }
  }
  
  return { rising, falling, flat };
}

/**
 * Calculate coverage percentage from partial data
 */
export function calculateCoveragePct(returned: number, requested: number): number {
  if (requested === 0) return 0;
  return Math.round((returned / requested) * 100);
}


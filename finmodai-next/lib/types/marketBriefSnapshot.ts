/**
 * Market Brief Snapshot Data Model
 * 
 * Represents a persisted snapshot of a Market Brief at a point in time.
 */

export type MarketBriefSnapshot = {
  id: string; // UUID
  created_at: string; // ISO timestamp
  as_of_date: string; // YYYY-MM-DD
  tone: 'risk_on' | 'neutral' | 'risk_off';
  confidence: 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  keyDrivers: Array<{ label: string; detail: string }>;
  risksAndGaps: Array<{ label: string; detail: string }>;
  watchNext: Array<{ label: string; date?: string | null; why: string }>;
  sourcesStatus: {
    primarySource: string;
    usedFallback: boolean;
    lastUpdated: string;
    coverageNotes: string[];
  };
};

/**
 * Converts MarketBriefViewModel to MarketBriefSnapshot
 * Handles both old (keyDrivers/risksAndGaps) and new (drivingMarkets) structures for backward compatibility
 * Null-safe: handles missing optional fields gracefully
 */
export function viewModelToSnapshot(viewModel: {
  snapshot: { title: string; tone: 'risk_on' | 'neutral' | 'risk_off'; summary: string; confidence: 'high' | 'medium' | 'low' };
  keyDrivers?: Array<{ label: string; detail: string }>;
  risksAndGaps?: Array<{ label: string; detail: string }>;
  drivingMarkets?: {
    observed: Array<{ label: string; detail: string }>;
    inferred: Array<{ label: string; detail: string }>;
    limitations: Array<{ label: string; detail: string }>;
  };
  watchNext?: { items: Array<{ label: string; date?: string; why: string }>; isGeneric?: boolean };
  sourcesStatus: { primarySource: string; usedFallback: boolean; lastUpdated: string; coverageNotes: string[] };
}): MarketBriefSnapshot | null {
  if (!viewModel.snapshot) {
    return null; // Don't save empty/unavailable snapshots (shouldn't happen with new structure)
  }

  const asOfDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Convert new structure to old structure for storage (backward compatibility)
  // Null-safe: use fallback arrays
  let keyDrivers: Array<{ label: string; detail: string }> = [];
  let risksAndGaps: Array<{ label: string; detail: string }> = [];

  if (viewModel.drivingMarkets) {
    // New structure: merge observed + inferred into keyDrivers, limitations into risksAndGaps
    const observed = viewModel.drivingMarkets.observed ?? [];
    const inferred = viewModel.drivingMarkets.inferred ?? [];
    const limitations = viewModel.drivingMarkets.limitations ?? [];
    keyDrivers = [...observed, ...inferred];
    risksAndGaps = limitations;
  } else if (viewModel.keyDrivers || viewModel.risksAndGaps) {
    // Old structure: use as-is with fallbacks
    keyDrivers = viewModel.keyDrivers ?? [];
    risksAndGaps = viewModel.risksAndGaps ?? [];
  }

  // Null-safe watchNext access: use optional chaining + fallback array
  const watchNextItems = viewModel.watchNext?.items ?? [];
  const watchNext = watchNextItems.map(item => ({
    label: item.label ?? '',
    date: item.date || null,
    why: item.why ?? '',
  }));

  // Null-safe sourcesStatus access
  const sourcesStatus = viewModel.sourcesStatus ?? {
    primarySource: 'unknown',
    usedFallback: false,
    lastUpdated: new Date().toISOString(),
    coverageNotes: [],
  };

  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    as_of_date: asOfDate,
    tone: viewModel.snapshot.tone,
    confidence: viewModel.snapshot.confidence,
    title: viewModel.snapshot.title,
    summary: viewModel.snapshot.summary,
    keyDrivers,
    risksAndGaps,
    watchNext,
    sourcesStatus: {
      primarySource: sourcesStatus.primarySource ?? 'unknown',
      usedFallback: sourcesStatus.usedFallback ?? false,
      lastUpdated: sourcesStatus.lastUpdated ?? new Date().toISOString(),
      coverageNotes: sourcesStatus.coverageNotes ?? [],
    },
  };
}


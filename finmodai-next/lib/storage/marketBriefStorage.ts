/**
 * Market Brief Snapshot Storage Layer
 * 
 * MVP: Uses localStorage (can be migrated to Supabase/DB later)
 * Stores up to 30 snapshots, keyed by 'market_brief_snapshots'
 */

import type { MarketBriefSnapshot } from '@/lib/types/marketBriefSnapshot';

const STORAGE_KEY = 'market_brief_snapshots';
const MAX_SNAPSHOTS = 30;

function safeIso(value: unknown): string {
  if (typeof value !== 'string') return new Date().toISOString();
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();
}

function normalizeDriver(value: any): { label: string; detail: string } | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { label: trimmed, detail: '' } : null;
  }
  if (typeof value === 'object') {
    const label = typeof value.label === 'string' ? value.label.trim() : '';
    const detail = typeof value.detail === 'string' ? value.detail.trim() : '';
    if (!label) return null;
    return { label, detail };
  }
  return null;
}

function normalizeWatchItem(value: any): { label: string; date?: string | null; why: string } | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { label: trimmed, date: null, why: '' } : null;
  }
  if (typeof value === 'object') {
    const label = typeof value.label === 'string' ? value.label.trim() : '';
    const why = typeof value.why === 'string' ? value.why.trim() : '';
    const date =
      typeof value.date === 'string'
        ? value.date
        : value.date === null
          ? null
          : undefined;
    if (!label) return null;
    return { label, ...(date !== undefined ? { date } : {}), why };
  }
  return null;
}

function normalizeSnapshot(raw: any): MarketBriefSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;

  const id = typeof raw.id === 'string' ? raw.id : null;
  const as_of_date = typeof raw.as_of_date === 'string' ? raw.as_of_date : null;
  if (!id || !as_of_date) return null;

  const tone: MarketBriefSnapshot['tone'] =
    raw.tone === 'risk_on' || raw.tone === 'neutral' || raw.tone === 'risk_off' ? raw.tone : 'neutral';
  const confidence: MarketBriefSnapshot['confidence'] =
    raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low' ? raw.confidence : 'low';

  const keyDrivers = Array.isArray(raw.keyDrivers)
    ? raw.keyDrivers.map(normalizeDriver).filter((v): v is NonNullable<typeof v> => Boolean(v))
    : [];

  const risksAndGaps = Array.isArray(raw.risksAndGaps)
    ? raw.risksAndGaps.map(normalizeDriver).filter((v): v is NonNullable<typeof v> => Boolean(v))
    : [];

  const watchNextRaw = raw.watchNext;
  const watchNextItems = Array.isArray(watchNextRaw)
    ? watchNextRaw
    : watchNextRaw && Array.isArray(watchNextRaw.items)
      ? watchNextRaw.items
      : [];

  const watchNext = watchNextItems
    .map(normalizeWatchItem)
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  const sourcesStatusRaw = raw.sourcesStatus && typeof raw.sourcesStatus === 'object' ? raw.sourcesStatus : {};
  const sourcesStatus: MarketBriefSnapshot['sourcesStatus'] = {
    primarySource:
      typeof sourcesStatusRaw.primarySource === 'string' && sourcesStatusRaw.primarySource.trim().length
        ? sourcesStatusRaw.primarySource
        : 'unknown',
    usedFallback: Boolean(sourcesStatusRaw.usedFallback),
    lastUpdated: safeIso(sourcesStatusRaw.lastUpdated),
    coverageNotes: Array.isArray(sourcesStatusRaw.coverageNotes)
      ? sourcesStatusRaw.coverageNotes.filter((n: any) => typeof n === 'string')
      : [],
  };

  return {
    id,
    created_at: safeIso(raw.created_at),
    as_of_date,
    tone,
    confidence,
    title: typeof raw.title === 'string' ? raw.title : 'Market Brief',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    keyDrivers,
    risksAndGaps,
    watchNext,
    sourcesStatus,
  };
}

/**
 * Gets all snapshots from storage
 */
export function getSnapshots(): MarketBriefSnapshot[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored) as unknown;
    const normalized = Array.isArray(parsed)
      ? parsed.map(normalizeSnapshot).filter((s): s is MarketBriefSnapshot => Boolean(s))
      : [];

    // Sort by created_at (most recent first), invalid dates last
    return normalized.sort((a, b) => {
      const aTs = Date.parse(a.created_at);
      const bTs = Date.parse(b.created_at);
      const aScore = Number.isFinite(aTs) ? aTs : 0;
      const bScore = Number.isFinite(bTs) ? bTs : 0;
      return bScore - aScore;
    });
  } catch (error) {
    console.error('[MarketBriefStorage] Failed to load snapshots:', error);
    return [];
  }
}

/**
 * Gets a snapshot by ID
 */
export function getSnapshotById(id: string): MarketBriefSnapshot | null {
  const snapshots = getSnapshots();
  return snapshots.find(s => s.id === id) || null;
}

/**
 * Gets the most recent snapshot for a given date
 */
export function getSnapshotByDate(asOfDate: string): MarketBriefSnapshot | null {
  const snapshots = getSnapshots();
  const matches = snapshots.filter(s => s.as_of_date === asOfDate);
  if (matches.length === 0) return null;
  
  // Return most recent if multiple exist for same date
  return matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

/**
 * Gets snapshots within a date range
 */
export function getSnapshotsInRange(startDate: string, endDate: string): MarketBriefSnapshot[] {
  const snapshots = getSnapshots();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  
  return snapshots.filter(s => {
    const date = new Date(s.as_of_date).getTime();
    return date >= start && date <= end;
  });
}

/**
 * Saves a snapshot to storage
 * Rules:
 * - If snapshot exists for as_of_date, only overwrite if confidence improved OR sources changed
 * - Otherwise, append and keep only last MAX_SNAPSHOTS
 */
export function saveSnapshot(snapshot: MarketBriefSnapshot): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const existing = getSnapshots();
    const existingForDate = existing.find(s => s.as_of_date === snapshot.as_of_date);
    
    // If exists for date, check if we should overwrite
    if (existingForDate) {
      const confidenceRank = { low: 0, medium: 1, high: 2 };
      const existingConfidence = confidenceRank[existingForDate.confidence as keyof typeof confidenceRank] ?? 0;
      const newConfidence = confidenceRank[snapshot.confidence as keyof typeof confidenceRank] ?? 0;
      
      const confidenceImproved = newConfidence > existingConfidence;
      const sourcesChanged = 
        existingForDate.sourcesStatus.primarySource !== snapshot.sourcesStatus.primarySource ||
        existingForDate.sourcesStatus.usedFallback !== snapshot.sourcesStatus.usedFallback;
      
      if (!confidenceImproved && !sourcesChanged) {
        // Don't overwrite - no improvement
        return false;
      }
      
      // Remove existing snapshot for this date
      const filtered = existing.filter(s => s.id !== existingForDate.id);
      filtered.push(snapshot);
      
      // Keep only last MAX_SNAPSHOTS
      const sorted = filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const limited = sorted.slice(0, MAX_SNAPSHOTS);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
      return true;
    }
    
    // New snapshot - append
    existing.push(snapshot);
    
    // Keep only last MAX_SNAPSHOTS
    const sorted = existing.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const limited = sorted.slice(0, MAX_SNAPSHOTS);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    return true;
  } catch (error) {
    console.error('[MarketBriefStorage] Failed to save snapshot:', error);
    return false;
  }
}

/**
 * Deletes a snapshot by ID
 */
export function deleteSnapshot(id: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const existing = getSnapshots();
    const filtered = existing.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('[MarketBriefStorage] Failed to delete snapshot:', error);
    return false;
  }
}

/**
 * Clears all snapshots (debug/testing)
 */
export function clearSnapshots(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('[MarketBriefStorage] Failed to clear snapshots:', error);
    return false;
  }
}

/**
 * Gets snapshot count
 */
export function getSnapshotCount(): number {
  return getSnapshots().length;
}

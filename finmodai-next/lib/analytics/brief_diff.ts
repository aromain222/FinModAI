/**
 * Market Brief Diff Engine
 * 
 * Compares two Market Brief snapshots and generates a diff
 */

import type { MarketBriefSnapshot } from '@/lib/types/marketBriefSnapshot';

export type BriefDiff = {
  toneChanged?: { from: 'risk_on' | 'neutral' | 'risk_off'; to: 'risk_on' | 'neutral' | 'risk_off' };
  confidenceChanged?: { from: 'high' | 'medium' | 'low'; to: 'high' | 'medium' | 'low' };
  summaryChanged: boolean;
  driversAdded: string[];
  driversRemoved: string[];
  risksAdded: string[];
  risksRemoved: string[];
  watchNextChanged: boolean;
};

/**
 * Simple string hash for comparing summaries
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

/**
 * Compares two Market Brief snapshots and returns a diff
 */
export function compareSnapshots(
  previous: MarketBriefSnapshot,
  current: MarketBriefSnapshot
): BriefDiff {
  const diff: BriefDiff = {
    summaryChanged: false,
    driversAdded: [],
    driversRemoved: [],
    risksAdded: [],
    risksRemoved: [],
    watchNextChanged: false,
  };

  // Compare tone
  if (previous.tone !== current.tone) {
    diff.toneChanged = {
      from: previous.tone,
      to: current.tone,
    };
  }

  // Compare confidence
  if (previous.confidence !== current.confidence) {
    diff.confidenceChanged = {
      from: previous.confidence,
      to: current.confidence,
    };
  }

  // Compare summary (using hash for efficiency)
  const previousSummaryHash = hashString(previous.summary);
  const currentSummaryHash = hashString(current.summary);
  diff.summaryChanged = previousSummaryHash !== currentSummaryHash;

  // Compare drivers (by label - set diff)
  const previousDriverLabels = new Set(previous.keyDrivers.map(d => d.label));
  const currentDriverLabels = new Set(current.keyDrivers.map(d => d.label));

  diff.driversAdded = Array.from(currentDriverLabels).filter(label => !previousDriverLabels.has(label));
  diff.driversRemoved = Array.from(previousDriverLabels).filter(label => !currentDriverLabels.has(label));

  // Compare risks (by label - set diff)
  const previousRiskLabels = new Set(previous.risksAndGaps.map(r => r.label));
  const currentRiskLabels = new Set(current.risksAndGaps.map(r => r.label));

  diff.risksAdded = Array.from(currentRiskLabels).filter(label => !previousRiskLabels.has(label));
  diff.risksRemoved = Array.from(previousRiskLabels).filter(label => !currentRiskLabels.has(label));

  // Compare watch next (by label - if any changed)
  const previousWatchLabels = new Set(previous.watchNext.map(w => w.label));
  const currentWatchLabels = new Set(current.watchNext.map(w => w.label));

  diff.watchNextChanged = 
    previousWatchLabels.size !== currentWatchLabels.size ||
    Array.from(previousWatchLabels).some(label => !currentWatchLabels.has(label)) ||
    Array.from(currentWatchLabels).some(label => !previousWatchLabels.has(label));

  return diff;
}

/**
 * Checks if a diff has any changes
 */
export function hasChanges(diff: BriefDiff): boolean {
  return !!(
    diff.toneChanged ||
    diff.confidenceChanged ||
    diff.summaryChanged ||
    diff.driversAdded.length > 0 ||
    diff.driversRemoved.length > 0 ||
    diff.risksAdded.length > 0 ||
    diff.risksRemoved.length > 0 ||
    diff.watchNextChanged
  );
}

/**
 * Gets a human-readable summary of the diff
 */
export function getDiffSummary(diff: BriefDiff): string[] {
  const summary: string[] = [];

  if (diff.toneChanged) {
    summary.push(`Market tone shifted from ${diff.toneChanged.from.replace('_', '-')} to ${diff.toneChanged.to.replace('_', '-')}`);
  }

  if (diff.confidenceChanged) {
    summary.push(`Confidence changed from ${diff.confidenceChanged.from} to ${diff.confidenceChanged.to}`);
  }

  if (diff.summaryChanged) {
    summary.push('Market summary was updated');
  }

  if (diff.driversAdded.length > 0) {
    summary.push(`${diff.driversAdded.length} new driver${diff.driversAdded.length > 1 ? 's' : ''}: ${diff.driversAdded.slice(0, 3).join(', ')}${diff.driversAdded.length > 3 ? '...' : ''}`);
  }

  if (diff.driversRemoved.length > 0) {
    summary.push(`${diff.driversRemoved.length} driver${diff.driversRemoved.length > 1 ? 's' : ''} removed: ${diff.driversRemoved.slice(0, 3).join(', ')}${diff.driversRemoved.length > 3 ? '...' : ''}`);
  }

  if (diff.risksAdded.length > 0) {
    summary.push(`${diff.risksAdded.length} new risk${diff.risksAdded.length > 1 ? 's' : ''}: ${diff.risksAdded.slice(0, 3).join(', ')}${diff.risksAdded.length > 3 ? '...' : ''}`);
  }

  if (diff.risksRemoved.length > 0) {
    summary.push(`${diff.risksRemoved.length} risk${diff.risksRemoved.length > 1 ? 's' : ''} removed: ${diff.risksRemoved.slice(0, 3).join(', ')}${diff.risksRemoved.length > 3 ? '...' : ''}`);
  }

  if (diff.watchNextChanged) {
    summary.push('Watch list items changed');
  }

  return summary;
}


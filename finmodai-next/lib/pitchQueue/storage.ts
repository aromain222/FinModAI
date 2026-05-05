import type { PitchQueueItem, PitchVoteStatus } from '@/lib/pitchQueue/types';

const STORAGE_KEY = 'capitalbase:pitch-queue:v1';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParseQueue(value: string | null): PitchQueueItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPitchQueueItem);
  } catch {
    return [];
  }
}

function isPitchQueueItem(value: unknown): value is PitchQueueItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Partial<PitchQueueItem>;
  return (
    typeof item.id === 'string' &&
    typeof item.ticker === 'string' &&
    typeof item.opportunityScore === 'number' &&
    typeof item.signal === 'string' &&
    typeof item.horizon === 'string' &&
    typeof item.primaryReason === 'string' &&
    typeof item.mainRisk === 'string' &&
    typeof item.generatedPitch === 'string' &&
    typeof item.timestamp === 'number' &&
    (item.voteStatus === 'pending' || item.voteStatus === 'approved' || item.voteStatus === 'rejected')
  );
}

function writeQueue(items: PitchQueueItem[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('capitalbase:pitch-queue-updated'));
}

export function getPitchQueue(): PitchQueueItem[] {
  if (!canUseStorage()) return [];
  return safeParseQueue(window.localStorage.getItem(STORAGE_KEY)).sort((a, b) => b.timestamp - a.timestamp);
}

export function upsertPitchQueueItem(item: PitchQueueItem): PitchQueueItem[] {
  const current = getPitchQueue();
  const filtered = current.filter((existing) => existing.ticker !== item.ticker);
  const next = [item, ...filtered].slice(0, 100);
  writeQueue(next);
  return next;
}

export function removePitchQueueItem(id: string): PitchQueueItem[] {
  const next = getPitchQueue().filter((item) => item.id !== id);
  writeQueue(next);
  return next;
}

export function updatePitchVoteStatus(id: string, voteStatus: PitchVoteStatus): PitchQueueItem[] {
  const next = getPitchQueue().map((item) =>
    item.id === id ? { ...item, voteStatus } : item,
  );
  writeQueue(next);
  return next;
}


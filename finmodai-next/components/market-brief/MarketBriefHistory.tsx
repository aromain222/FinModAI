/**
 * Market Brief History Component
 * 
 * Side sheet that displays historical snapshots and allows comparison
 */

'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionCard } from '@/components/ui/SectionCard';
import { Calendar, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { MarketBriefSnapshot } from '@/lib/types/marketBriefSnapshot';
import { getSnapshots, getSnapshotById } from '@/lib/storage/marketBriefStorage';
import { compareSnapshots, hasChanges, type BriefDiff } from '@/lib/analytics/brief_diff';

interface MarketBriefHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSnapshot: MarketBriefSnapshot | null;
  onSelectSnapshot: (snapshot: MarketBriefSnapshot | null) => void;
}

export function MarketBriefHistory({
  open,
  onOpenChange,
  currentSnapshot,
  onSelectSnapshot,
}: MarketBriefHistoryProps) {
  const [snapshots, setSnapshots] = useState<MarketBriefSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [diff, setDiff] = useState<BriefDiff | null>(null);

  // Load snapshots when sheet opens
  useEffect(() => {
    if (open) {
      const loaded = getSnapshots();
      setSnapshots(loaded);
    }
  }, [open]);

  // Update diff when selection changes in compare mode
  useEffect(() => {
    if (compareMode && selectedId && currentSnapshot) {
      const selected = getSnapshotById(selectedId);
      if (selected) {
        // Compare: selected (previous) vs current (today)
        const comparison = compareSnapshots(selected, currentSnapshot);
        setDiff(comparison);
      } else {
        setDiff(null);
      }
    } else {
      setDiff(null);
    }
  }, [compareMode, selectedId, currentSnapshot]);

  const handleSelect = (snapshot: MarketBriefSnapshot) => {
    if (compareMode) {
      setSelectedId(snapshot.id);
    } else {
      onSelectSnapshot(snapshot);
      onOpenChange(false);
    }
  };

  const handleClearSelection = () => {
    onSelectSnapshot(null);
    setSelectedId(null);
    setCompareMode(false);
    setDiff(null);
  };

  const selectedSnapshot = selectedId ? getSnapshotById(selectedId) : null;

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return dateString;
      return format(date, 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return dateString;
      return format(date, 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const getToneBadgeClass = (tone: string) => {
    if (tone === 'risk_on') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    if (tone === 'risk_off') return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    return 'bg-slate-700/50 text-slate-300 border-slate-600/30';
  };

  const getToneDisplay = (tone: string) => {
    if (tone === 'risk_on') return 'Risk-on';
    if (tone === 'risk_off') return 'Risk-off';
    return 'Neutral';
  };

  const getConfidenceBadgeClass = (confidence: string) => {
    if (confidence === 'high') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    if (confidence === 'medium') return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" className="w-full max-w-md">
      <SheetHeader onClose={() => onOpenChange(false)}>
        <div className="flex-1">
          <SheetTitle>Market Brief History</SheetTitle>
          <p className="text-sm text-slate-400 mt-1">View and compare historical snapshots</p>
        </div>
      </SheetHeader>

      <SheetContent>
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setCompareMode(!compareMode);
                if (!compareMode) {
                  // Enter compare mode: select most recent non-today snapshot, or first snapshot
                  const today = new Date().toISOString().split('T')[0];
                  const nonTodaySnapshots = snapshots.filter(s => s.as_of_date !== today);
                  setSelectedId(nonTodaySnapshots.length > 0 ? nonTodaySnapshots[0].id : (snapshots.length > 1 ? snapshots[1].id : null));
                } else {
                  // Exit compare mode
                  setSelectedId(null);
                  setDiff(null);
                }
              }}
              variant="outline"
              size="sm"
              className={cn(
                'flex-1',
                compareMode && 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300'
              )}
            >
              {compareMode ? 'Exit Compare' : 'Compare'}
            </Button>
            {!compareMode && (
              <Button
                onClick={handleClearSelection}
                variant="ghost"
                size="sm"
                className="text-slate-400 hover:text-slate-300"
                disabled={!currentSnapshot}
              >
                View Today
              </Button>
            )}
          </div>

          {/* Compare Mode - Diff Display */}
          {compareMode && diff && selectedSnapshot && currentSnapshot ? (
            <SectionCard title="What Changed" titleSize="lg">
              <div className="mb-3 text-xs text-slate-400">
                Comparing {formatDate(selectedSnapshot.as_of_date)} vs Today
              </div>
              {!hasChanges(diff) ? (
                <p className="text-sm text-slate-400">No changes detected between these snapshots</p>
              ) : (
                <div className="space-y-3">
                  {diff.toneChanged && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">Tone:</span>
                      <Badge className={cn(getToneBadgeClass(diff.toneChanged.from), 'text-xs')}>
                        {getToneDisplay(diff.toneChanged.from)}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                      <Badge className={cn(getToneBadgeClass(diff.toneChanged.to), 'text-xs')}>
                        {getToneDisplay(diff.toneChanged.to)}
                      </Badge>
                    </div>
                  )}

                  {diff.confidenceChanged && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">Confidence:</span>
                      <Badge className={cn(getConfidenceBadgeClass(diff.confidenceChanged.from), 'text-xs')}>
                        {diff.confidenceChanged.from}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                      <Badge className={cn(getConfidenceBadgeClass(diff.confidenceChanged.to), 'text-xs')}>
                        {diff.confidenceChanged.to}
                      </Badge>
                    </div>
                  )}

                  {diff.summaryChanged && (
                    <div className="text-sm text-slate-300">
                      <span className="text-emerald-400">•</span> Market summary was updated
                    </div>
                  )}

                  {diff.driversAdded.length > 0 && (
                    <div className="text-sm text-slate-300">
                      <span className="text-emerald-400">•</span> New drivers: {diff.driversAdded.slice(0, 3).join(', ')}
                      {diff.driversAdded.length > 3 && ` (+${diff.driversAdded.length - 3} more)`}
                    </div>
                  )}

                  {diff.driversRemoved.length > 0 && (
                    <div className="text-sm text-slate-300">
                      <span className="text-rose-400">•</span> Removed drivers: {diff.driversRemoved.slice(0, 3).join(', ')}
                      {diff.driversRemoved.length > 3 && ` (+${diff.driversRemoved.length - 3} more)`}
                    </div>
                  )}

                  {diff.risksAdded.length > 0 && (
                    <div className="text-sm text-slate-300">
                      <span className="text-emerald-400">•</span> New risks: {diff.risksAdded.slice(0, 3).join(', ')}
                      {diff.risksAdded.length > 3 && ` (+${diff.risksAdded.length - 3} more)`}
                    </div>
                  )}

                  {diff.risksRemoved.length > 0 && (
                    <div className="text-sm text-slate-300">
                      <span className="text-rose-400">•</span> Removed risks: {diff.risksRemoved.slice(0, 3).join(', ')}
                      {diff.risksRemoved.length > 3 && ` (+${diff.risksRemoved.length - 3} more)`}
                    </div>
                  )}

                  {diff.watchNextChanged && (
                    <div className="text-sm text-slate-300">
                      <span className="text-slate-400">•</span> Watch list items changed
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          ) : compareMode && (!selectedSnapshot || !currentSnapshot) ? (
            <SectionCard title="What Changed" titleSize="lg">
              <p className="text-sm text-slate-400">
                {!currentSnapshot
                  ? 'No current snapshot available to compare'
                  : 'Select a historical snapshot to compare with today'}
              </p>
            </SectionCard>
          ) : null}

          {/* Snapshot List */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">
              {compareMode ? 'Select Snapshot to Compare' : 'Snapshots'}
            </h3>
            {snapshots.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No snapshots yet</p>
                <p className="text-xs mt-1">Snapshots are saved automatically when Market Brief is generated</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-400px)]">
                <div className="space-y-2">
                  {snapshots.map((snapshot) => {
                    const isSelected = selectedId === snapshot.id;
                    const isToday = snapshot.as_of_date === new Date().toISOString().split('T')[0];
                    const isCurrent = currentSnapshot && currentSnapshot.as_of_date === snapshot.as_of_date;

                    return (
                      <div
                        key={snapshot.id}
                        onClick={() => handleSelect(snapshot)}
                        className={cn(
                          'rounded-lg border p-4 cursor-pointer transition-all',
                          isSelected
                            ? 'border-emerald-500/50 bg-emerald-500/10'
                            : isCurrent
                            ? 'border-slate-600 bg-slate-900/50'
                            : 'border-white/5 bg-slate-950/50 hover:border-white/10 hover:bg-slate-900/30'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white">
                                {isToday ? 'Today' : formatDate(snapshot.as_of_date)}
                              </span>
                            {isCurrent && (
                              <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/30 text-xs px-2 py-0.5">
                                Current
                              </Badge>
                            )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {formatDateTime(snapshot.created_at)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={cn(getToneBadgeClass(snapshot.tone), 'text-xs')}>
                              {getToneDisplay(snapshot.tone)}
                            </Badge>
                            <Badge className={cn(getConfidenceBadgeClass(snapshot.confidence), 'text-xs')}>
                              {snapshot.confidence}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-2">{snapshot.summary}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                          <span>{snapshot.keyDrivers.length} drivers</span>
                          <span>{snapshot.risksAndGaps.length} risks</span>
                          <span>{snapshot.watchNext.length} watch items</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


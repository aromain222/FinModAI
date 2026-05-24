'use client';

import { useEffect } from 'react';
import { getTRState } from '@/lib/tradeReadiness/storage';
import { getPitchQueue } from '@/lib/pitchQueue/storage';

const ACTIVE_STATUSES = new Set(['paper-track', 'queued', 'ready']);
const SYNCED_KEY = 'capitalbase:pm-sync:v1';

function getSyncedTickers(): Set<string> {
  try {
    const raw = localStorage.getItem(SYNCED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markSynced(ticker: string): void {
  try {
    const synced = getSyncedTickers();
    synced.add(ticker);
    localStorage.setItem(SYNCED_KEY, JSON.stringify([...synced]));
  } catch { /* quota exceeded */ }
}

async function syncPMRecords(ticker: string, payload: Record<string, unknown>, thesis: Record<string, unknown>): Promise<void> {
  await fetch('/api/pm/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await fetch('/api/pm/theses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(thesis),
  });
  markSynced(ticker);
}

export function LocalStoragePositionSync() {
  useEffect(() => {
    const synced = getSyncedTickers();
    const toSync: Array<{ ticker: string; position: Record<string, unknown>; thesis: Record<string, unknown> }> = [];

    // Collect from pitch queue first (richer data)
    const pitchItems = getPitchQueue();
    for (const item of pitchItems) {
      if (synced.has(item.ticker)) continue;
      const trStatus = getTRState(item.ticker);
      if (!trStatus || !ACTIVE_STATUSES.has(trStatus)) continue;

      const pmStatus =
        trStatus === 'ready' ? 'active' :
        trStatus === 'queued' ? 'watch' : 'watch';

      const position = {
        id: item.id,
        ticker: item.ticker.toUpperCase(),
        companyName: null,
        shares: null,
        notionalExposure: null,
        costBasis: null,
        currentPrice: null,
        targetAllocation: null,
        currentAllocation: null,
        portfolioTheme: null,
        portfolioRole: null,
        timeHorizon: item.horizon ?? null,
        status: pmStatus,
        pmNotes: item.generatedPitch ?? '',
        createdAt: new Date(item.timestamp).toISOString(),
        updatedAt: new Date().toISOString(),
      };
      toSync.push({
        ticker: item.ticker.toUpperCase(),
        position,
        thesis: {
          ticker: item.ticker.toUpperCase(),
          thesisSummary: item.primaryReason ?? item.generatedPitch ?? `${item.ticker.toUpperCase()} added to PM watchlist.`,
          whyWeOwnIt: item.generatedPitch ?? item.primaryReason ?? 'Added from ranked board workflow.',
          addConditions: [],
          sellConditions: [],
          invalidationConditions: item.mainRisk ? [item.mainRisk] : [],
          keyRisks: item.mainRisk ? [item.mainRisk] : [],
          catalysts: item.primaryReason ? [item.primaryReason] : [],
          convictionScore: Math.max(0, Math.min(100, Math.round(item.opportunityScore * 10))),
          thesisStatus: pmStatus === 'active' ? 'building' : 'under_review',
          timeHorizon: item.horizon ?? null,
          lastReviewedAt: new Date().toISOString(),
          createdAt: new Date(item.timestamp).toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    // Collect any tickers in tradeReadiness but not yet in pitch queue
    try {
      const prefix = 'capitalbase:tr:';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const ticker = key.slice(prefix.length);
        if (synced.has(ticker)) continue;
        if (toSync.some(p => p.ticker === ticker)) continue;
        const status = getTRState(ticker);
        if (!status || !ACTIVE_STATUSES.has(status)) continue;

        const pmStatus = status === 'ready' ? 'active' : 'watch';
        const now = new Date().toISOString();
        toSync.push({
          ticker,
          position: {
            id: `${ticker}-tr-${Date.now()}`,
            ticker,
            companyName: null,
            shares: null,
            notionalExposure: null,
            costBasis: null,
            currentPrice: null,
            targetAllocation: null,
            currentAllocation: null,
            portfolioTheme: null,
            portfolioRole: null,
            timeHorizon: null,
            status: pmStatus,
            pmNotes: '',
            createdAt: now,
            updatedAt: now,
          },
          thesis: {
            ticker,
            thesisSummary: `${ticker} added from trade-readiness workflow.`,
            whyWeOwnIt: 'User promoted this idea from the ranked board or trade readiness flow.',
            addConditions: [],
            sellConditions: [],
            invalidationConditions: [],
            keyRisks: [],
            catalysts: [],
            convictionScore: status === 'ready' ? 65 : 50,
            thesisStatus: pmStatus === 'active' ? 'building' : 'under_review',
            timeHorizon: null,
            lastReviewedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    } catch { /* localStorage iteration failed */ }

    for (const item of toSync) {
      syncPMRecords(item.ticker, item.position, item.thesis).catch(() => {});
    }
  }, []);

  return null;
}

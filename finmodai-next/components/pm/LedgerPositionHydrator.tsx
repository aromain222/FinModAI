'use client';

import { useEffect } from 'react';
import { addPosition, getPositions } from '@/lib/portfolio/storage';
import type { ActivePosition, PositionStatus } from '@/lib/portfolio/types';
import type { PortfolioPosition } from '@/lib/pm/types';

const HYDRATED_KEY = 'capitalbase:pm-positions-hydrated:v1';

function deriveSignal(score: number | null | undefined): 'green' | 'yellow' | 'red' {
  if (score == null) return 'yellow';
  if (score >= 6.5) return 'green';
  if (score <= 4) return 'red';
  return 'yellow';
}

function deriveStatus(pm: PortfolioPosition): PositionStatus {
  if (pm.status === 'exited' || pm.status === 'closed') return 'exited';
  // PM 'active'/'watch'/'trimmed' → legacy narrative status. Default to 'working';
  // PositionCard will derive 'extended' on its own from price action.
  return 'working';
}

function entryPriceOf(pm: PortfolioPosition): number {
  if (pm.costBasis != null && pm.shares != null && pm.shares > 0) {
    return pm.costBasis / pm.shares;
  }
  if (pm.entryPrice != null) return pm.entryPrice;
  return pm.currentPrice ?? 0;
}

function toActivePosition(pm: PortfolioPosition): ActivePosition | null {
  if (!pm.ticker) return null;
  const entryPrice = entryPriceOf(pm);
  const currentPrice = pm.currentPrice ?? entryPrice;
  if (entryPrice <= 0 || currentPrice <= 0) return null;
  const score = pm.currentScore ?? 5;
  const entryScore = pm.entryScore ?? score;
  const addedAt = pm.createdAt ?? new Date().toISOString();
  return {
    id: pm.id,
    ticker: pm.ticker.toUpperCase(),
    entryDate: addedAt,
    entryPrice,
    currentPrice,
    shares: pm.shares ?? null,
    costBasis: pm.costBasis ?? null,
    notionalUsd: pm.notionalExposure ?? null,
    entryScore,
    currentScore: score,
    entrySignal: deriveSignal(entryScore),
    currentSignal: deriveSignal(score),
    status: deriveStatus(pm),
    thesisDrift: 'stable',
    thesisSummary: pm.pmNotes || 'Synced from Ledger holdings (Plaid). Edit thesis to track conviction.',
    currentStance: 'Hold',
    nextCatalyst: '',
    keyRisks: '',
    watchItems: [],
    timeline: [],
    addedAt,
  };
}

/**
 * One-shot hydrator: pulls pm_positions into the legacy browser-storage portfolio
 * so the Monitor tab on /portfolio shows the same holdings the Agent Office sees.
 *
 * Runs once per browser (gated by HYDRATED_KEY) so user edits don't get overwritten.
 * To re-hydrate after a fresh Ledger sync, delete that localStorage key.
 */
export function LedgerPositionHydrator() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const alreadyHydrated = localStorage.getItem(HYDRATED_KEY);
        if (alreadyHydrated === '1') return;

        const res = await fetch('/api/pm/positions?limit=200', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { positions?: PortfolioPosition[] };
        const pmPositions = data.positions ?? [];
        if (cancelled || pmPositions.length === 0) return;

        const existingTickers = new Set(getPositions().map(p => p.ticker.toUpperCase()));
        let added = 0;

        for (const pm of pmPositions) {
          const ticker = pm.ticker?.toUpperCase();
          if (!ticker || existingTickers.has(ticker)) continue;
          if (pm.status === 'exited' || pm.status === 'closed') continue;
          const active = toActivePosition(pm);
          if (!active) continue;
          addPosition(active);
          existingTickers.add(ticker);
          added += 1;
        }

        localStorage.setItem(HYDRATED_KEY, '1');
        if (added > 0) {
          console.info(`Hydrated ${added} position${added === 1 ? '' : 's'} from pm_positions into /portfolio`);
        }
      } catch {
        // Silent — hydration is best-effort
      }
    }

    void run();
    return () => { cancelled = true; };
  }, []);

  return null;
}

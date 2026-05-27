/**
 * Position Sync
 *
 * After Alpaca fills orders, syncs live Alpaca positions back into the
 * PM positions store so the portfolio page reflects real paper trades.
 */

import { alpacaPaperCredentials } from '@/lib/execution/alpacaPaper';
import { savePosition, listPositions } from '@/lib/pm/portfolio/positionStore';

type AlpacaPosition = {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: 'long' | 'short';
};

async function fetchAlpacaPositions(): Promise<AlpacaPosition[]> {
  const creds = alpacaPaperCredentials();
  if (!creds.configured) return [];

  const res = await fetch(`${creds.baseUrl}/v2/positions`, {
    headers: {
      'APCA-API-KEY-ID': creds.keyId,
      'APCA-API-SECRET-KEY': creds.secretKey,
    },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });

  if (!res.ok) return [];
  return res.json() as Promise<AlpacaPosition[]>;
}

export type SyncResult = {
  synced: number;
  created: number;
  updated: number;
  errors: string[];
};

export async function syncAlpacaPositions(): Promise<SyncResult> {
  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  let alpacaPositions: AlpacaPosition[] = [];
  try {
    alpacaPositions = await fetchAlpacaPositions();
  } catch (err) {
    errors.push(`Alpaca fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return { synced: 0, created: 0, updated: 0, errors };
  }

  for (const ap of alpacaPositions) {
    try {
      const ticker = ap.symbol.toUpperCase();
      const existing = await listPositions({ ticker, limit: 1 });
      const now = new Date().toISOString();
      const qty = parseFloat(ap.qty);
      const costBasis = parseFloat(ap.avg_entry_price);
      const currentPrice = parseFloat(ap.current_price);
      const notional = parseFloat(ap.market_value);

      if (existing.length > 0 && existing[0]) {
        await savePosition({
          ...existing[0],
          shares: qty,
          costBasis,
          currentPrice,
          notionalExposure: notional,
          status: 'active',
          updatedAt: now,
        });
        updated++;
      } else {
        await savePosition({
          id: `alpaca-${ticker}-${Date.now()}`,
          ticker,
          companyName: null,
          shares: qty,
          costBasis,
          currentPrice,
          notionalExposure: notional,
          entryPrice: costBasis,
          targetAllocation: null,
          currentAllocation: null,
          portfolioTheme: null,
          portfolioRole: null,
          timeHorizon: null,
          status: 'active',
          pmNotes: `Synced from Alpaca paper trading. Side: ${ap.side}.`,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    } catch (err) {
      errors.push(`Sync failed for ${ap.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { synced: alpacaPositions.length, created, updated, errors };
}

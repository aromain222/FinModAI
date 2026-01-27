import 'server-only';

import { getSeries } from "@/lib/dataSources/orchestrator";

export async function getMarketSnapshot(range: string) {
  const symbols = ['SPY', 'QQQ', 'DIA', 'VIX', 'TNX', 'UST2Y'];
  const results = await Promise.all(symbols.map(async (s) => {
    try {
      const res = await getSeries({ kind: 'INDEX_PRICE', symbol: s, range });
      const change = res.data.length > 1 ? ((res.data.at(-1)!.v - res.data[0].v) / res.data[0].v) * 100 : 0;
      return { symbol: s, changePct: change, last: res.data.at(-1)?.v ?? null, meta: res.meta };
    } catch (error: any) {
      return { symbol: s, error: error?.message || 'error', last: null, changePct: 0 };
    }
  }));

  return { ok: true, data: { prices: results } };
}

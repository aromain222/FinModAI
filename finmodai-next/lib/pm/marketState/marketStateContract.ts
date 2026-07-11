export type MarketStateMetric = {
  value: number | null;
  source: string | null;
  asOf: string | null;
  unit: string;
};

export type MarketStatePacket = {
  version: 1;
  builtAt: string;
  asOf: string | null;
  regime: 'risk_on' | 'neutral' | 'risk_off' | 'mixed' | 'insufficient_data';
  regimeConfidence: number;
  indices: Array<{
    symbol: string;
    return1mPct: number | null;
    source: string | null;
    asOf: string | null;
  }>;
  tape: {
    spyPrice: MarketStateMetric;
    spyChangePct: MarketStateMetric;
    vix: MarketStateMetric;
    us2y: MarketStateMetric;
    us10y: MarketStateMetric;
    curve2s10sBps: MarketStateMetric;
    dxy: MarketStateMetric;
    wti: MarketStateMetric;
    gold: MarketStateMetric;
  };
  breadth: {
    risingCount: number | null;
    fallingCount: number | null;
    netPct: number | null;
  };
  sectors: Array<{ name: string; changePct: number }>;
  quality: {
    provider: string | null;
    fallback: boolean;
    coveragePct: number;
    missing: string[];
    warnings: string[];
  };
};

export function isMarketStatePacket(value: unknown): value is MarketStatePacket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<MarketStatePacket>;
  return row.version === 1
    && typeof row.builtAt === 'string'
    && typeof row.regime === 'string'
    && Array.isArray(row.indices)
    && Boolean(row.quality && Array.isArray(row.quality.missing));
}

export function formatMarketStateForPrompt(packet: MarketStatePacket): string {
  const metric = (label: string, item: MarketStateMetric): string => (
    `${label}: ${item.value === null ? 'unavailable' : `${item.value} ${item.unit}`}`
      + `${item.source || item.asOf ? ` [${[item.source, item.asOf].filter(Boolean).join(', ')}]` : ''}`
  );
  return [
    '=== VERIFIED MARKET STATE ===',
    `Regime: ${packet.regime} (${packet.regimeConfidence}/100 confidence)`,
    `As of: ${packet.asOf ?? 'unavailable'} | Coverage: ${packet.quality.coveragePct}% | Fallback: ${packet.quality.fallback}`,
    `Index 1M returns: ${packet.indices.map(item => `${item.symbol} ${item.return1mPct === null ? 'n/a' : `${item.return1mPct}%`}`).join(' | ')}`,
    metric('SPY daily change', packet.tape.spyChangePct),
    metric('VIX', packet.tape.vix),
    metric('US 2Y', packet.tape.us2y),
    metric('US 10Y', packet.tape.us10y),
    metric('2s10s curve', packet.tape.curve2s10sBps),
    metric('DXY', packet.tape.dxy),
    metric('WTI', packet.tape.wti),
    `Breadth: ${packet.breadth.risingCount ?? 'n/a'} rising / ${packet.breadth.fallingCount ?? 'n/a'} falling; net ${packet.breadth.netPct ?? 'n/a'}%`,
    `Sector tape: ${packet.sectors.slice(0, 8).map(item => `${item.name} ${item.changePct >= 0 ? '+' : ''}${item.changePct}%`).join(' | ') || 'unavailable'}`,
    `Missing market evidence: ${packet.quality.missing.join(', ') || 'none'}`,
  ].join('\n');
}

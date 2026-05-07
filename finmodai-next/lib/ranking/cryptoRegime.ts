import type { CryptoMarketRegime, ScoreBreakdown } from './types';

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

const CRYPTO_SENSITIVE_TICKERS = new Set(['COIN', 'MSTR', 'HOOD', 'RIOT', 'MARA', 'SQ', 'PYPL']);
const BINANCE_BASE_URL = 'https://api.binance.com/api/v3/klines';
const REGIME_CACHE_TTL_MS = 60_000;

let cachedRegime: { expiresAt: number; value: CryptoMarketRegime | null } | null = null;
let inFlightRegime: Promise<CryptoMarketRegime | null> | null = null;

function clamp(n: number, lo = 0, hi = 10): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctChange(values: number[], days: number): number {
  if (values.length <= days) return 0;
  const end = values.at(-1);
  const start = values.at(-(days + 1));
  if (end == null || start == null || start <= 0) return 0;
  return ((end - start) / start) * 100;
}

function dailyVolPct(values: number[]): number {
  const returns: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const prior = values[i - 1];
    if (prior > 0) returns.push((values[i] - prior) / prior);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * 100;
}

function parseCloses(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!Array.isArray(row) || row.length < 5) return null;
      const close = Number(row[4]);
      return Number.isFinite(close) && close > 0 ? close : null;
    })
    .filter((value): value is number => value != null);
}

async function fetchSpotCloses(symbol: 'BTCUSDT' | 'ETHUSDT', signal?: AbortSignal): Promise<number[]> {
  const params = new URLSearchParams({
    symbol,
    interval: '1d',
    limit: '35',
  });
  const response = await fetch(`${BINANCE_BASE_URL}?${params.toString()}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as BinanceKline[] | unknown;
  return parseCloses(payload);
}

export function isCryptoSensitiveTicker(ticker: string): boolean {
  return CRYPTO_SENSITIVE_TICKERS.has(ticker.toUpperCase());
}

export function buildCryptoMarketRegime(params: {
  btcCloses: number[];
  ethCloses: number[];
  asOf?: string;
}): CryptoMarketRegime | null {
  const { btcCloses, ethCloses, asOf = new Date().toISOString() } = params;
  if (btcCloses.length < 31 || ethCloses.length < 31) return null;

  const btc7dPct = round1(pctChange(btcCloses, 7));
  const btc30dPct = round1(pctChange(btcCloses, 30));
  const eth7dPct = round1(pctChange(ethCloses, 7));
  const eth30dPct = round1(pctChange(ethCloses, 30));
  const dailyVol = round1((dailyVolPct(btcCloses.slice(-31)) + dailyVolPct(ethCloses.slice(-31))) / 2);
  const avg7d = (btc7dPct + eth7dPct) / 2;
  const avg30d = (btc30dPct + eth30dPct) / 2;

  const regime: CryptoMarketRegime['regime'] =
    (avg30d >= 6 && avg7d >= -2 && dailyVol <= 5.5) || (avg7d >= 5 && avg30d >= 0)
      ? 'risk-on'
      : avg30d <= -6 || avg7d <= -5 || dailyVol >= 7
        ? 'risk-off'
        : 'neutral';

  const leader: CryptoMarketRegime['leader'] =
    eth7dPct > btc7dPct + 2 ? 'ETH' : btc7dPct > eth7dPct + 2 ? 'BTC' : 'mixed';
  const confidence = round1(clamp(0.5 + Math.min(0.25, Math.abs(avg30d) / 40) - Math.max(0, dailyVol - 5) * 0.03, 0.35, 0.8));
  const trendText =
    regime === 'risk-on'
      ? 'confirming crypto beta'
      : regime === 'risk-off'
        ? 'pressuring crypto beta'
        : 'not giving a clean directional confirmation';
  const leaderText =
    leader === 'ETH'
      ? 'ETH leading suggests stronger speculative risk appetite'
      : leader === 'BTC'
        ? 'BTC leading suggests risk appetite is concentrated in the larger, more liquid asset'
        : 'BTC and ETH leadership is mixed';

  return {
    regime,
    btc7dPct,
    btc30dPct,
    eth7dPct,
    eth30dPct,
    dailyVolPct: dailyVol,
    leader,
    confidence,
    source: 'binance',
    asOf,
    pmRead: `Crypto tape is ${trendText}: BTC ${btc30dPct >= 0 ? '+' : ''}${btc30dPct.toFixed(1)}% over 30D, ETH ${eth30dPct >= 0 ? '+' : ''}${eth30dPct.toFixed(1)}% over 30D, daily vol ${dailyVol.toFixed(1)}%. ${leaderText}.`,
  };
}

export async function fetchCryptoMarketRegime(signal?: AbortSignal): Promise<CryptoMarketRegime | null> {
  if (cachedRegime && cachedRegime.expiresAt > Date.now()) return cachedRegime.value;
  if (inFlightRegime) return inFlightRegime;

  inFlightRegime = (async () => {
    try {
      const [btcCloses, ethCloses] = await Promise.all([
        fetchSpotCloses('BTCUSDT', signal),
        fetchSpotCloses('ETHUSDT', signal),
      ]);
      const value = buildCryptoMarketRegime({ btcCloses, ethCloses });
      cachedRegime = { expiresAt: Date.now() + REGIME_CACHE_TTL_MS, value };
      return value;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.warn('[ranking.cryptoRegime] Binance fetch failed', error);
      }
      cachedRegime = { expiresAt: Date.now() + 10_000, value: null };
      return null;
    } finally {
      inFlightRegime = null;
    }
  })();

  return inFlightRegime;
}

export function applyCryptoRegimeToBreakdown(
  breakdown: ScoreBreakdown,
  regime: CryptoMarketRegime | null,
): ScoreBreakdown {
  if (!regime) return breakdown;

  const regimeTilt =
    regime.regime === 'risk-on' ? 1 :
    regime.regime === 'risk-off' ? -1 :
    0;
  const leaderTilt = regime.leader === 'ETH' ? 0.2 : regime.leader === 'BTC' ? 0.05 : 0;
  const highVolPenalty = regime.dailyVolPct >= 6 ? Math.min(1.2, (regime.dailyVolPct - 5) * 0.25) : 0;

  return {
    ...breakdown,
    forecastSignal: round1(clamp(breakdown.forecastSignal + regimeTilt * 0.45 + leaderTilt)),
    catalystStrength: round1(clamp(breakdown.catalystStrength + regimeTilt * 0.65 + leaderTilt)),
    momentum: round1(clamp(breakdown.momentum + regimeTilt * 0.7 + leaderTilt)),
    riskAdjustment: round1(clamp(breakdown.riskAdjustment + (regime.regime === 'risk-on' ? 0.2 : regime.regime === 'risk-off' ? -0.6 : 0) - highVolPenalty)),
  };
}

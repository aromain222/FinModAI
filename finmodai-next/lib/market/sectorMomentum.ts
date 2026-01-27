import { resolveMarketSymbol } from '../marketSymbols';
import { getFlowMetrics } from './databento';

type Driver = { label: string; value: number; impact: number; evidence: string[] };
type Constituent = { symbol: string; score: number; movePct: number; volumeShock: number; evidence: string[] };

export type SectorScore = {
  sector: string;
  score: number;
  direction: 'up' | 'down' | 'flat';
  summary: string;
  drivers: Driver[];
  drags: Driver[];
  constituents: Constituent[];
};

export type SectorMomentumRange = '1D' | '1W' | '1M';

const SECTOR_ETFS: Record<string, string[]> = {
  XLF: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'USB', 'PNC', 'BK'],
  XLK: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'META', 'CRM', 'ADBE', 'ORCL', 'CSCO', 'AMD'],
  XLE: ['XOM', 'CVX', 'SLB', 'COP', 'EOG', 'MPC', 'PSX', 'OXY', 'VLO', 'HAL'],
  XLY: ['AMZN', 'TSLA', 'HD', 'MCD', 'LOW', 'BKNG', 'SBUX', 'NKE', 'TJX', 'CMG'],
  XLP: ['PG', 'COST', 'PEP', 'KO', 'WMT', 'MDLZ', 'PM', 'CL', 'EL', 'KHC'],
  XLI: ['BA', 'CAT', 'GE', 'HON', 'UNP', 'RTX', 'LMT', 'DE', 'ETN', 'GD'],
  XLB: ['LIN', 'SHW', 'APD', 'FCX', 'ECL', 'NEM', 'MLM', 'VMC', 'DD', 'NUE'],
  XLV: ['LLY', 'UNH', 'JNJ', 'MRK', 'ABBV', 'TMO', 'ABT', 'PFE', 'AMGN', 'BMY'],
  XLU: ['NEE', 'DUK', 'SO', 'SRE', 'D', 'AEP', 'XEL', 'EXC', 'PEG', 'ED'],
  XLRE: ['PLD', 'AMT', 'EQIX', 'WELL', 'SPG', 'PSA', 'DLR', 'O', 'CCI', 'VICI'],
  XLC: ['GOOGL', 'GOOG', 'NFLX', 'CMCSA', 'DIS', 'VZ', 'TMUS', 'CHTR', 'META', 'RBLX'],
};

const sectorName = (etf: string) =>
  ({
    XLF: 'Financials',
    XLK: 'Technology',
    XLE: 'Energy',
    XLY: 'Consumer Discretionary',
    XLP: 'Consumer Staples',
    XLI: 'Industrials',
    XLB: 'Materials',
    XLV: 'Health Care',
    XLU: 'Utilities',
    XLRE: 'Real Estate',
    XLC: 'Communication Services',
  }[etf] ?? etf);

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isLiveMetric = (metric: any) => {
  const meta = metric?.meta as any;
  if (!meta) return true;
  if (meta.stale === true) return false;
  if (meta.sourceUsed === 'fallback') return false;
  return true;
};

const countSource = (counts: Record<string, number>, metric: any) => {
  const source = metric?.meta?.sourceUsed;
  const stale = metric?.meta?.stale === true || source === 'fallback';
  if (typeof source !== 'string' || !source || stale) return;
  counts[source] = (counts[source] ?? 0) + 1;
};

export async function computeSectorMomentum(params?: { range?: SectorMomentumRange; traceId?: string }): Promise<{
  scores: SectorScore[];
  meta: { providerUsed: string; sources: Record<string, number> };
  providers: Record<string, string>;
  warnings: string[];
}> {
  const range: SectorMomentumRange = params?.range ?? '1D';
  const traceId = params?.traceId ?? 'sector-momentum';
  const etfSymbols = Object.keys(SECTOR_ETFS);
  const allSymbols = new Set<string>();
  etfSymbols.forEach((symbol) => allSymbols.add(resolveMarketSymbol(symbol)));
  Object.values(SECTOR_ETFS).forEach((members) => members.forEach((symbol) => allSymbols.add(resolveMarketSymbol(symbol))));

  const metrics = await getFlowMetrics(Array.from(allSymbols), { range, traceId });
  const bySymbol = new Map<string, any>(metrics.map((m) => [resolveMarketSymbol(m.symbol), m]));

  const sources: Record<string, number> = {};
  metrics.forEach((m) => countSource(sources, m));
  const providerUsed =
    Object.entries(sources).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'fallback';

  const warnings: string[] = [];
  const providers: Record<string, string> = {};
  const missingEtfs: string[] = [];
  for (const etf of etfSymbols) {
    const metric = bySymbol.get(resolveMarketSymbol(etf));
    const provider = typeof metric?.meta?.sourceUsed === 'string' ? metric.meta.sourceUsed : 'fallback';
    providers[etf] = provider;
    if (!metric || !isFiniteNumber(metric.changePct)) missingEtfs.push(etf);
  }
  if (Object.values(providers).some((p) => p === 'yfinance')) warnings.push('fallback_to_yfinance');
  if (Object.values(providers).some((p) => p === 'fallback')) warnings.push('sector_partial');
  if (missingEtfs.length) warnings.push('missing_etf_data');

  const scores: SectorScore[] = [];

  for (const etf of etfSymbols) {
    const flow = bySymbol.get(resolveMarketSymbol(etf));
    const constituents = SECTOR_ETFS[etf];
    const memberFlow = constituents
      .map((symbol) => bySymbol.get(resolveMarketSymbol(symbol)))
      .filter(Boolean);
    const liveMembers = memberFlow.filter(isLiveMetric).filter((m) => isFiniteNumber(m.changePct));

    const upCount = liveMembers.filter((m) => m.changePct > 0).length;
    const breadth = liveMembers.length ? (upCount / liveMembers.length) * 100 : null;
    const breadthForScore = breadth ?? 50;
    const volumeMembers = liveMembers.filter((m) => isFiniteNumber(m.volumeShock));
    const avgShock = volumeMembers.length
      ? volumeMembers.reduce((sum, m) => sum + m.volumeShock, 0) / volumeMembers.length
      : 0;
    const avgMove = liveMembers.length ? liveMembers.reduce((sum, m) => sum + m.changePct, 0) / liveMembers.length : 0;

    const volPenalty =
      liveMembers.length && flow && isLiveMetric(flow) && isFiniteNumber(flow.realizedVol) ? -flow.realizedVol * 0.5 : 0;
    const scoreRaw = avgMove * 2 + avgShock * 10 + (breadthForScore - 50) * 0.4 + volPenalty;
    const score = clamp(Math.round(scoreRaw), -100, 100);
    const direction = score > 15 ? 'up' : score < -15 ? 'down' : 'flat';

    const drivers: Driver[] = [];
    const drags: Driver[] = [];

    const ranked = memberFlow
      .filter((m) => isFiniteNumber(m.changePct))
      .slice()
      .sort((a, b) => b.changePct - a.changePct);

    ranked
      .slice(0, 3)
      .forEach((m) => {
        const move = m.changePct as number;
        const shock = isFiniteNumber(m.volumeShock) ? m.volumeShock : 0;
        drivers.push({
          label: `${m.symbol} ${move >= 0 ? '+' : ''}${move.toFixed(2)}%`,
          value: move,
          impact: shock,
          evidence: [
            isFiniteNumber(m.volumeShock) ? `Volume shock ${m.volumeShock.toFixed(2)}` : 'Volume unavailable',
            `Change ${move.toFixed(2)}%`,
          ],
        });
      });

    ranked
      .slice(-3)
      .reverse()
      .forEach((m) => {
        const move = m.changePct as number;
        const shock = isFiniteNumber(m.volumeShock) ? m.volumeShock : 0;
        drags.push({
          label: `${m.symbol} ${move >= 0 ? '+' : ''}${move.toFixed(2)}%`,
          value: move,
          impact: shock,
          evidence: [
            isFiniteNumber(m.volumeShock) ? `Volume shock ${m.volumeShock.toFixed(2)}` : 'Volume unavailable',
            `Change ${move.toFixed(2)}%`,
          ],
        });
      });

    if (!drivers.length && flow && isFiniteNumber(flow.changePct)) {
      const move = flow.changePct as number;
      drivers.push({
        label: `${resolveMarketSymbol(etf)} ${move >= 0 ? '+' : ''}${move.toFixed(2)}%`,
        value: move,
        impact: 0,
        evidence: [`Change ${move.toFixed(2)}%`],
      });
    }

    const coverageText =
      constituents.length && liveMembers.length < constituents.length ? ` Coverage ${liveMembers.length}/${constituents.length}.` : '';
    const breadthText = breadth == null ? 'unavailable' : `${breadth.toFixed(0)}%`;
    const shockText = volumeMembers.length ? avgShock.toFixed(2) : 'unavailable';
    const summary =
      direction === 'up'
        ? `${sectorName(etf)} rising; breadth ${breadthText} with avg vol shock ${shockText}.${coverageText}`
      : direction === 'down'
        ? `${sectorName(etf)} falling; breadth ${breadthText} with avg vol shock ${shockText}.${coverageText}`
        : `${sectorName(etf)} flat; breadth ${breadthText} with avg vol shock ${shockText}.${coverageText}`;

    const constituentScores: Constituent[] = memberFlow
      .filter((m) => isFiniteNumber(m.changePct))
      .map((m) => {
        const move = m.changePct as number;
        const shock = isFiniteNumber(m.volumeShock) ? m.volumeShock : 0;
        return {
          symbol: m.symbol,
          score: clamp(Math.round(move * 2 + shock * 10), -100, 100),
          movePct: move,
          volumeShock: shock,
          evidence: [
            `Change ${move.toFixed(2)}%`,
            isFiniteNumber(m.volumeShock) ? `Volume shock ${m.volumeShock.toFixed(2)}` : 'Volume unavailable',
          ],
        };
      });

    scores.push({
      sector: sectorName(etf),
      score,
      direction,
      summary,
      drivers,
      drags,
      constituents: constituentScores,
    });
  }

  return { scores, meta: { providerUsed, sources }, providers, warnings };
}

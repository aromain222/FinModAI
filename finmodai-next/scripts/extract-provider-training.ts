import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fetchPolygonQuote } from '@/lib/data/providers/polygon';
import { fetchTiingoFundamentals, fetchTiingoQuote } from '@/lib/data/providers/tiingo';
import { fetchTwelveDataQuote } from '@/lib/data/providers/twelvedata';
import { fetchAlphaVantageFundamentals, fetchAlphaVantageQuote } from '@/lib/data/providers/alphavantage';

type QuoteRecord = {
  provider: string;
  price: number | null;
  asOf: string | null;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
};

type FundamentalsRecord = {
  provider: string;
  marketCap: number | null;
  sharesOutstanding: number | null;
  revenueLTM: number | null;
  ebitdaLTM: number | null;
  netIncomeLTM: number | null;
  cash: number | null;
  totalDebt: number | null;
};

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pctSpread(values: number[]): number | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0) return null;
  return ((max - min) / min) * 100;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

async function runForTicker(ticker: string, outputDir: string): Promise<void> {
  const normalizedTicker = ticker.trim().toUpperCase();

  const [polygonQuote, tiingoQuote, tiingoFundamentals, twelveQuote, alphaQuote, alphaFundamentals] =
    await Promise.all([
      fetchPolygonQuote(normalizedTicker),
      fetchTiingoQuote(normalizedTicker),
      fetchTiingoFundamentals(normalizedTicker),
      fetchTwelveDataQuote(normalizedTicker),
      fetchAlphaVantageQuote(normalizedTicker),
      fetchAlphaVantageFundamentals(normalizedTicker),
    ]);

  const quotes: Record<string, QuoteRecord> = {};
  const fundamentals: Record<string, FundamentalsRecord> = {};
  const errors: Record<string, string> = {};

  if (polygonQuote.ok) {
    quotes.polygon = { provider: 'polygon', ...polygonQuote.data };
  } else {
    errors.polygon = polygonQuote.error.message;
  }
  if (tiingoQuote.ok) {
    quotes.tiingo = { provider: 'tiingo', ...tiingoQuote.data };
  } else {
    errors.tiingo_quote = tiingoQuote.error.message;
  }
  if (twelveQuote.ok) {
    quotes.twelvedata = { provider: 'twelvedata', ...twelveQuote.data };
  } else {
    errors.twelvedata = twelveQuote.error.message;
  }
  if (alphaQuote.ok) {
    quotes.alphavantage = { provider: 'alphavantage', ...alphaQuote.data };
  } else {
    errors.alphavantage_quote = alphaQuote.error.message;
  }

  if (tiingoFundamentals.ok) {
    fundamentals.tiingo = { provider: 'tiingo', ...tiingoFundamentals.data };
  } else {
    errors.tiingo_fundamentals = tiingoFundamentals.error.message;
  }
  if (alphaFundamentals.ok) {
    fundamentals.alphavantage = { provider: 'alphavantage', ...alphaFundamentals.data };
  } else {
    errors.alphavantage_fundamentals = alphaFundamentals.error.message;
  }

  const quotePrices = Object.values(quotes)
    .map((item) => toNumber(item.price))
    .filter((value): value is number => value !== null);
  const marketCaps = [
    ...Object.values(quotes).map((item) => toNumber(item.marketCap)),
    ...Object.values(fundamentals).map((item) => toNumber(item.marketCap)),
  ].filter((value): value is number => value !== null);

  const missingFieldsByProvider: Record<string, string[]> = {};
  for (const [provider, payload] of Object.entries({ ...quotes, ...fundamentals })) {
    const missing = Object.entries(payload)
      .filter(([key, value]) => key !== 'provider' && (value === null || value === undefined))
      .map(([key]) => key);
    if (missing.length > 0) {
      missingFieldsByProvider[provider] = missing;
    }
  }

  const snapshot = {
    ticker: normalizedTicker,
    quotes,
    fundamentals,
    comparisons: {
      priceSpreadPct: pctSpread(quotePrices),
      marketCapSpreadPct: pctSpread(marketCaps),
      quoteConsensusProvider: Object.keys(quotes)[0] ?? null,
      fundamentalsCoverageLeader:
        Object.entries(fundamentals)
          .sort((left, right) => {
            const leftCount = Object.values(left[1]).filter((value) => value !== null).length;
            const rightCount = Object.values(right[1]).filter((value) => value !== null).length;
            return rightCount - leftCount;
          })[0]?.[0] ?? null,
      missingFieldsByProvider,
    },
    errors,
  };

  const manifest = {
    dataset_slug: `market-snapshot-${slugify(normalizedTicker)}`,
    ticker: normalizedTicker,
    company_name: normalizedTicker,
    source_type: 'market_data_snapshot',
    providers: ['polygon', 'tiingo', 'twelvedata', 'alphavantage'],
    fetched_at: new Date().toISOString(),
  };

  await writeJson(join(outputDir, 'manifest.json'), manifest);
  await writeJson(join(outputDir, 'snapshot.json'), snapshot);

  console.log(
    JSON.stringify(
      {
        ticker: normalizedTicker,
        outputDir,
        quoteProviders: Object.keys(quotes),
        fundamentalsProviders: Object.keys(fundamentals),
        errors,
      },
      null,
      2
    )
  );
}

async function main() {
  loadEnvFile(join(process.cwd(), '.env.local'));
  loadEnvFile(join(process.cwd(), '.env'));

  const tickersArg = getArg('--tickers');
  if (!tickersArg) {
    throw new Error('Missing --tickers');
  }
  const tickers = tickersArg
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (tickers.length === 0) {
    throw new Error('No valid tickers supplied');
  }

  const baseOutputDir = getArg('--outputDir') ?? join(process.cwd(), '..', 'data', 'training');
  for (const ticker of tickers) {
    const outputDir = join(baseOutputDir, `market-snapshot-${slugify(ticker)}`);
    await runForTicker(ticker, outputDir);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

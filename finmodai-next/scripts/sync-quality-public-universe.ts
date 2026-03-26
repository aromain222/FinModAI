import { fetchJsonWithRetry, sleep } from '../lib/data/providers/shared';
import { serverEnv } from '../lib/env/server';
import { getMarketCompanyUniverse, getQualityPublicTickers, isQualityPublicTicker } from '../lib/data/company/companyUniverse';
import { syncCompanyFromFmp } from '../lib/integrations/fmp/syncCompany';
import { syncIdentifiersFromOpenFigi } from '../lib/integrations/openfigi/syncIdentifiers';
import { syncPricesFromPolygon } from '../lib/integrations/polygon/syncPrices';
import { syncCompanyFactsFromSec } from '../lib/integrations/sec/syncCompanyFacts';

type SyncOptions = {
  target: number;
  sleepMs: number;
  checkpointEvery: number;
  includeSecTail: boolean;
  skipOpenFigi: boolean;
  skipSec: boolean;
};

type SecTickerMapRow = {
  ticker?: string;
};

function normalizeTicker(value: string): string | null {
  const cleaned = value.trim().toUpperCase().replace(/\./g, '-');
  if (!cleaned) return null;
  return /^[A-Z.-]{1,10}$/.test(cleaned) ? cleaned : null;
}

function looksLikeFundOrTrust(name: string | null | undefined): boolean {
  const normalized = String(name ?? '').trim();
  if (!normalized) return false;
  return /\b(etf|trust|fund|shares)\b/i.test(normalized);
}

function looksUsDomiciled(country: string | null | undefined): boolean {
  const normalized = String(country ?? '').trim().toLowerCase();
  return normalized === 'united states' || normalized === 'us' || normalized === 'usa';
}

function parseArgs(argv: string[]): SyncOptions {
  let target = 1000;
  let sleepMs = 1200;
  let checkpointEvery = 25;
  let includeSecTail = true;
  let skipOpenFigi = false;
  let skipSec = false;

  for (const arg of argv) {
    if (arg.startsWith('--target=')) {
      const parsed = Number(arg.slice('--target='.length));
      target = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : target;
    } else if (arg.startsWith('--sleep-ms=')) {
      const parsed = Number(arg.slice('--sleep-ms='.length));
      sleepMs = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : sleepMs;
    } else if (arg.startsWith('--checkpoint-every=')) {
      const parsed = Number(arg.slice('--checkpoint-every='.length));
      checkpointEvery = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : checkpointEvery;
    } else if (arg === '--skip-sec-tail') {
      includeSecTail = false;
    } else if (arg === '--skip-openfigi') {
      skipOpenFigi = true;
    } else if (arg === '--skip-sec') {
      skipSec = true;
    }
  }

  return { target, sleepMs, checkpointEvery, includeSecTail, skipOpenFigi, skipSec };
}

async function fetchSecPublicTickers(): Promise<string[]> {
  if (!serverEnv.SEC_UA_EMAIL) {
    throw new Error('SEC_UA_EMAIL is required to fetch the SEC public-company ticker list.');
  }

  const response = await fetchJsonWithRetry<Record<string, SecTickerMapRow>>({
    provider: 'sec_edgar',
    url: 'https://www.sec.gov/files/company_tickers.json',
    cacheKey: 'sec_edgar:company_tickers:bulk_sync',
    ttlMs: 24 * 60 * 60 * 1000,
    options: {
      headers: {
        'User-Agent': serverEnv.SEC_UA_EMAIL,
      },
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SEC public-company tickers: ${response.error.message}`);
  }

  return Array.from(
    new Set(
      Object.values(response.data ?? {})
        .map((row) => normalizeTicker(String(row?.ticker ?? '')))
        .filter((ticker): ticker is string => Boolean(ticker))
    )
  );
}

async function buildCandidateList(target: number, includeSecTail: boolean): Promise<string[]> {
  const cachedUniverse = await getMarketCompanyUniverse(Math.max(target * 3, 2000), { qualityOnly: false });
  const cachedByTicker = new Map(
    cachedUniverse
      .map((row) => [normalizeTicker(row.ticker), row] as const)
      .filter((entry): entry is [string, (typeof cachedUniverse)[number]] => Boolean(entry[0]))
  );
  const candidates: string[] = [];
  const seen = new Set<string>();

  if (includeSecTail) {
    const secTickers = await fetchSecPublicTickers();
    for (const ticker of secTickers) {
      if (seen.has(ticker)) continue;
      const cachedRow = cachedByTicker.get(ticker);
      if (cachedRow) {
        if (looksLikeFundOrTrust(cachedRow.companyName)) continue;
        if (cachedRow.country && !looksUsDomiciled(cachedRow.country)) continue;
      }
      seen.add(ticker);
      candidates.push(ticker);
    }
  }

  for (const row of cachedUniverse) {
    const ticker = normalizeTicker(row.ticker);
    if (!ticker || seen.has(ticker)) continue;
    if (looksLikeFundOrTrust(row.companyName)) continue;
    if (row.country && !looksUsDomiciled(row.country)) continue;
    seen.add(ticker);
    candidates.push(ticker);
  }

  return candidates;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const qualitySet = new Set(await getQualityPublicTickers(Math.max(options.target, 1000)));

  if (qualitySet.size >= options.target) {
    console.log(`[quality-universe] already have ${qualitySet.size} quality public companies. target=${options.target}`);
    return;
  }

  const candidates = await buildCandidateList(options.target, options.includeSecTail);
  if (candidates.length === 0) {
    throw new Error('No candidate public-company tickers found for bulk sync.');
  }

  console.log(
    `[quality-universe] starting bulk sync. target=${options.target} current=${qualitySet.size} candidates=${candidates.length} sleepMs=${options.sleepMs} checkpointEvery=${options.checkpointEvery}`
  );

  const synced: string[] = [];
  const failures: Record<string, string> = {};
  let processed = 0;

  for (const ticker of candidates) {
    if (qualitySet.has(ticker)) continue;
    if (qualitySet.size >= options.target) break;

    processed += 1;
    console.log(`[quality-universe] ${processed}/${candidates.length} ${ticker}`);

    try {
      const fmp = await syncCompanyFromFmp(ticker);
      const warnings = [...fmp.warnings];

      if (!options.skipOpenFigi) {
        const openfigi = await syncIdentifiersFromOpenFigi(ticker).catch((error) => ({
          warnings: [error instanceof Error ? error.message : 'OpenFIGI sync failed'],
        }));
        warnings.push(...openfigi.warnings);
      }

      const polygon = await syncPricesFromPolygon(ticker).catch((error) => ({
        warnings: [error instanceof Error ? error.message : 'Polygon sync failed'],
      }));
      warnings.push(...polygon.warnings);

      if (!options.skipSec) {
        const sec = await syncCompanyFactsFromSec(ticker).catch((error) => ({
          warnings: [error instanceof Error ? error.message : 'SEC sync failed'],
        }));
        warnings.push(...sec.warnings);
      }

      const qualityNow = await isQualityPublicTicker(ticker);
      if (qualityNow) {
        qualitySet.add(ticker);
        synced.push(ticker);
        console.log(`[quality-universe] ${ticker} now quality-ready. count=${qualitySet.size}`);
      } else {
        console.log(
          `[quality-universe] ${ticker} synced but still not quality-ready.${warnings.length > 0 ? ` warnings=${warnings.join(' | ')}` : ''}`
        );
      }
    } catch (error) {
      failures[ticker] = error instanceof Error ? error.message : 'unknown error';
      console.error(`[quality-universe] ${ticker} failed: ${failures[ticker]}`);
    }

    if (processed % options.checkpointEvery === 0) {
      console.log(
        `[quality-universe] checkpoint processed=${processed} qualityCount=${qualitySet.size} newlySynced=${synced.length} failures=${Object.keys(failures).length}`
      );
    }

    if (qualitySet.size >= options.target) break;
    await sleep(options.sleepMs);
  }

  console.log(
    `[quality-universe] complete. target=${options.target} qualityCount=${qualitySet.size} newlySynced=${synced.length} failures=${Object.keys(failures).length}`
  );

  if (Object.keys(failures).length > 0) {
    console.warn(
      `[quality-universe] failures: ${Object.entries(failures)
        .slice(0, 50)
        .map(([ticker, reason]) => `${ticker}: ${reason}`)
        .join(' | ')}`
    );
  }

  if (qualitySet.size < options.target) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('[quality-universe] failed', error);
  process.exit(1);
});

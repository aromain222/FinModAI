export type ModelingModelType = 'lbo' | 'comps' | 'merger';

export type NormalizedModelInputs = {
  modelType: ModelingModelType;
  primaryTicker: string;
  tickers: string[];
  merger?: { acquirer: string; target: string };
  assumptions: Record<string, any>;
};

export class NormalizeInputsError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'NormalizeInputsError';
    this.code = code;
  }
}

type AnyRecord = Record<string, any>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTicker(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const upper = trimmed.toUpperCase().replace(/\s+/g, '');
    const sanitized = upper.replace(/[^A-Z0-9.-]/g, '');
    return sanitized.length > 0 ? sanitized : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeTicker(String(value));
  }

  if (isRecord(value)) {
    return (
      normalizeTicker(value.tickerSymbol) ||
      normalizeTicker(value.symbol) ||
      normalizeTicker(value.ticker)
    );
  }

  return null;
}

function normalizeTickers(value: unknown): string[] {
  if (!value) return [];

  const raw: unknown[] = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item === 'string' && item.includes(',')) {
      const parts = item.split(',').map((part) => part.trim()).filter(Boolean);
      for (const part of parts) {
        const normalized = normalizeTicker(part);
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          out.push(normalized);
        }
      }
      continue;
    }

    const normalized = normalizeTicker(item);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }

  return out;
}

function readPath(root: unknown, path: string[]): unknown {
  let cursor: any = root;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function firstTickerFromPaths(root: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = readPath(root, path);
    const resolved = normalizeTicker(value);
    if (resolved) return resolved;
  }
  return null;
}

function mergeAssumptions(raw: unknown, primaryTicker: string, extras?: AnyRecord): Record<string, any> {
  const base = isRecord(raw) ? { ...raw } : {};

  if (typeof base.ticker !== 'string' || base.ticker.trim().length === 0) {
    base.ticker = primaryTicker;
  }

  if (!isRecord(base.company)) {
    base.company = { ticker: primaryTicker };
  } else if (!normalizeTicker(base.company.ticker)) {
    base.company = { ...base.company, ticker: primaryTicker };
  }

  if (extras && isRecord(extras)) {
    for (const [key, value] of Object.entries(extras)) {
      if (base[key] === undefined) {
        base[key] = value;
      }
    }
  }

  return base;
}

function normalizeModelType(value: unknown): ModelingModelType {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'lbo') return 'lbo';
  if (raw === 'comps' || raw === 'comp' || raw === 'trading-comps' || raw === 'trading_comps') return 'comps';
  if (raw === 'merger' || raw === 'm&a' || raw === 'ma') return 'merger';
  throw new NormalizeInputsError('INVALID_MODEL_TYPE', `Unsupported modelType: ${String(value)}`);
}

function extractPrimaryTicker(root: unknown): string | null {
  return firstTickerFromPaths(root, [
    ['tickerSymbol'],
    ['symbol'],
    ['ticker'],
    ['assumptions', 'tickerSymbol'],
    ['assumptions', 'symbol'],
    ['assumptions', 'ticker'],
    ['assumptions', 'company', 'tickerSymbol'],
    ['assumptions', 'company', 'symbol'],
    ['assumptions', 'company', 'ticker'],
    ['company', 'tickerSymbol'],
    ['company', 'symbol'],
    ['company', 'ticker'],
  ]);
}

function extractPeers(root: unknown): string[] {
  const peerSources: unknown[] = [
    readPath(root, ['peers']),
    readPath(root, ['comps']),
    readPath(root, ['tickers']),
    readPath(root, ['symbols']),
    readPath(root, ['assumptions', 'peers']),
    readPath(root, ['assumptions', 'comps']),
    readPath(root, ['assumptions', 'tickers']),
    readPath(root, ['assumptions', 'symbols']),
  ];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const source of peerSources) {
    for (const ticker of normalizeTickers(source)) {
      if (!seen.has(ticker)) {
        seen.add(ticker);
        out.push(ticker);
      }
    }
  }

  return out;
}

function extractMergerPair(root: unknown): { acquirer: string | null; target: string | null } {
  const acquirer = firstTickerFromPaths(root, [
    ['acquirer'],
    ['acquirerTicker'],
    ['buyer'],
    ['buyerTicker'],
    ['merger', 'acquirer'],
    ['merger', 'acquirerTicker'],
    ['merger', 'buyer'],
    ['merger', 'buyerTicker'],
    ['mergerInputs', 'acquirer'],
    ['mergerInputs', 'acquirerTicker'],
    ['mergerInputs', 'buyer'],
    ['mergerInputs', 'buyerTicker'],
    ['assumptions', 'merger', 'acquirer'],
    ['assumptions', 'merger', 'acquirerTicker'],
    ['assumptions', 'merger', 'buyer'],
    ['assumptions', 'merger', 'buyerTicker'],
    ['assumptions', 'mergerInputs', 'acquirer'],
    ['assumptions', 'mergerInputs', 'buyerTicker'],
  ]);

  const target = firstTickerFromPaths(root, [
    ['target'],
    ['targetTicker'],
    ['seller'],
    ['sellerTicker'],
    ['merger', 'target'],
    ['merger', 'targetTicker'],
    ['merger', 'seller'],
    ['merger', 'sellerTicker'],
    ['mergerInputs', 'target'],
    ['mergerInputs', 'targetTicker'],
    ['mergerInputs', 'seller'],
    ['mergerInputs', 'sellerTicker'],
    ['assumptions', 'merger', 'target'],
    ['assumptions', 'merger', 'targetTicker'],
    ['assumptions', 'merger', 'seller'],
    ['assumptions', 'merger', 'sellerTicker'],
    ['assumptions', 'mergerInputs', 'target'],
    ['assumptions', 'mergerInputs', 'targetTicker'],
  ]);

  return { acquirer, target };
}

export function normalizeInputs(modelType: unknown, raw: unknown): NormalizedModelInputs {
  const resolvedModelType = normalizeModelType(modelType);
  const record = isRecord(raw) ? raw : {};
  const assumptionsSource = record.assumptions;

  if (resolvedModelType === 'merger') {
    const merger = extractMergerPair(record);
    if (!merger.acquirer || !merger.target) {
      throw new NormalizeInputsError(
        'MISSING_MERGER_TICKERS',
        'MERGER requires { acquirer, target } tickers (or buyer/target equivalents).'
      );
    }
    if (merger.acquirer === merger.target) {
      throw new NormalizeInputsError('INVALID_MERGER_PAIR', 'MERGER acquirer and target tickers must differ.');
    }

    const tickers = normalizeTickers([merger.acquirer, merger.target]);
    return {
      modelType: resolvedModelType,
      primaryTicker: merger.acquirer,
      tickers,
      merger: { acquirer: merger.acquirer, target: merger.target },
      assumptions: mergeAssumptions(assumptionsSource, merger.acquirer, {
        merger: { acquirer: merger.acquirer, target: merger.target },
      }),
    };
  }

  const primaryTicker = extractPrimaryTicker(record);
  const peers = extractPeers(record);

  if (resolvedModelType === 'lbo') {
    const candidates = primaryTicker ? [primaryTicker] : peers;
    if (candidates.length === 0) {
      throw new NormalizeInputsError('MISSING_TICKER', 'LBO requires exactly one ticker.');
    }
    if (candidates.length > 1) {
      throw new NormalizeInputsError('TOO_MANY_TICKERS', `LBO requires exactly one ticker; got ${candidates.length}.`);
    }

    const ticker = candidates[0]!;
    return {
      modelType: resolvedModelType,
      primaryTicker: ticker,
      tickers: [ticker],
      assumptions: mergeAssumptions(assumptionsSource, ticker),
    };
  }

  // COMPS
  if (primaryTicker) {
    const tickers = normalizeTickers([primaryTicker, ...peers.filter((peer) => peer !== primaryTicker)]);
    return {
      modelType: resolvedModelType,
      primaryTicker,
      tickers,
      assumptions: mergeAssumptions(assumptionsSource, primaryTicker, {
        tickers,
      }),
    };
  }

  if (peers.length < 3) {
    throw new NormalizeInputsError(
      'MISSING_COMPS_INPUTS',
      'COMPS requires either { ticker } or { peers[] } (>= 3 tickers when no ticker is supplied).'
    );
  }

  const primaryFromPeers = peers[0]!;
  const tickers = normalizeTickers(peers);
  return {
    modelType: resolvedModelType,
    primaryTicker: primaryFromPeers,
    tickers,
    assumptions: mergeAssumptions(assumptionsSource, primaryFromPeers, {
      tickers,
    }),
  };
}


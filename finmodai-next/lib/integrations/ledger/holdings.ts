import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export type LedgerHolding = {
  securityId: string;
  ticker: string;
  name: string | null;
  quantity: number;
  costBasis: number | null;
  currentPrice: number | null;
  marketValue: number | null;
  accountName: string;
  institutionName: string | null;
  currency: string | null;
};

export type LedgerHoldingsResult = {
  ok: true;
  holdings: LedgerHolding[];
  source: { dbPath: string; readAt: string };
} | {
  ok: false;
  reason: 'db_missing' | 'sqlite_unavailable' | 'query_failed';
  detail: string;
};

function resolveDbPath(): string {
  const fromEnv = process.env.LEDGER_DB_PATH;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  return join(homedir(), 'ledger', 'data', 'ledger.db');
}

/**
 * Reads investment holdings from the Ledger sqlite file. Read-only, no writes,
 * no schema migrations. Skips cash equivalents (no ticker) and rows tied to
 * manual accounts (items.is_manual = 1) since those don't reflect real broker state.
 */
export async function readLedgerHoldings(): Promise<LedgerHoldingsResult> {
  const dbPath = resolveDbPath();

  if (!existsSync(dbPath)) {
    return { ok: false, reason: 'db_missing', detail: `Ledger sqlite not found at ${dbPath}` };
  }

  type BetterSqliteModule = typeof import('better-sqlite3');
  type DatabaseInstance = ReturnType<BetterSqliteModule>;

  let Database: BetterSqliteModule;
  try {
    Database = (await import('better-sqlite3')).default as unknown as BetterSqliteModule;
  } catch (err) {
    return {
      ok: false,
      reason: 'sqlite_unavailable',
      detail: `better-sqlite3 not loadable in this runtime: ${(err as Error).message}`,
    };
  }

  let db: DatabaseInstance | null = null;
  try {
    db = Database(dbPath, { readonly: true, fileMustExist: true });
    const handle = db;
    handle.pragma('query_only = ON');

    const hasManualColumn = handle
      .prepare(`SELECT 1 FROM pragma_table_info('items') WHERE name = 'is_manual'`)
      .get() != null;

    const manualFilter = hasManualColumn ? 'AND COALESCE(items.is_manual, 0) = 0' : '';

    const rows = handle
      .prepare(`
        SELECT
          s.security_id        AS securityId,
          s.ticker_symbol      AS ticker,
          s.name               AS name,
          h.quantity           AS quantity,
          h.cost_basis         AS costBasis,
          h.institution_price  AS currentPrice,
          h.institution_value  AS marketValue,
          a.name               AS accountName,
          items.institution_name AS institutionName,
          h.iso_currency_code  AS currency
        FROM investment_holdings h
        JOIN investment_securities s ON s.security_id = h.security_id
        JOIN accounts a              ON a.id = h.account_id
        JOIN items                   ON items.id = a.item_id
        WHERE COALESCE(s.is_cash_equivalent, 0) = 0
          AND s.ticker_symbol IS NOT NULL
          AND TRIM(s.ticker_symbol) <> ''
          AND h.quantity > 0
          ${manualFilter}
      `)
      .all() as Array<{
        securityId: string;
        ticker: string;
        name: string | null;
        quantity: number;
        costBasis: number | null;
        currentPrice: number | null;
        marketValue: number | null;
        accountName: string;
        institutionName: string | null;
        currency: string | null;
      }>;

    return {
      ok: true,
      holdings: rows.map((r) => ({
        ...r,
        ticker: r.ticker.toUpperCase().trim(),
      })),
      source: { dbPath, readAt: new Date().toISOString() },
    };
  } catch (err) {
    return { ok: false, reason: 'query_failed', detail: (err as Error).message };
  } finally {
    db?.close();
  }
}

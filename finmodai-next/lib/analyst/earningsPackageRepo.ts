import { createClient } from '@supabase/supabase-js';
import { featureFlags, getEarningsPackageCacheTtlHours } from '@/lib/env/server';
import { buildEarningsPackageKey, type EarningsRequestTarget } from './earningsRequest';

export type StoredEarningsPackage = {
  id: string;
  packageKey: string;
  ticker: string;
  companyName: string | null;
  fiscalPeriod: string | null;
  fiscalYear: number | null;
  reportEndDate: string | null;
  filedAt: string | null;
  quarterData: Record<string, unknown>;
  annualData: Record<string, unknown>;
  commentaryData: Record<string, unknown>;
  sourceMetadata: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  lastFetchedAt: string;
  freshnessExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertStoredEarningsPackageInput = Omit<StoredEarningsPackage, 'id' | 'createdAt' | 'updatedAt' | 'lastFetchedAt' | 'freshnessExpiresAt'> & {
  id?: string;
  lastFetchedAt?: string;
  freshnessExpiresAt?: string | null;
  reviewReasonCodes?: string[];
};

type EarningsPackageRow = {
  id: string;
  package_key: string;
  ticker: string;
  company_name: string | null;
  fiscal_period: string;
  fiscal_year: number | null;
  report_end_date: string;
  filed_at: string | null;
  quarter_data: Record<string, unknown>;
  annual_data: Record<string, unknown>;
  commentary_data: Record<string, unknown>;
  source_metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  last_fetched_at: string;
  freshness_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeRow(row: EarningsPackageRow): StoredEarningsPackage {
  return {
    id: row.id,
    packageKey: row.package_key,
    ticker: row.ticker,
    companyName: row.company_name,
    fiscalPeriod: normalizeNullableText(row.fiscal_period),
    fiscalYear: row.fiscal_year,
    reportEndDate: normalizeNullableText(row.report_end_date),
    filedAt: row.filed_at,
    quarterData: row.quarter_data ?? {},
    annualData: row.annual_data ?? {},
    commentaryData: row.commentary_data ?? {},
    sourceMetadata: row.source_metadata ?? {},
    rawPayload: row.raw_payload ?? {},
    lastFetchedAt: row.last_fetched_at,
    freshnessExpiresAt: row.freshness_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildFreshnessExpiry(nowIso: string): string {
  const ttlHours = getEarningsPackageCacheTtlHours();
  return new Date(new Date(nowIso).getTime() + ttlHours * 60 * 60 * 1000).toISOString();
}

export function isEarningsPackageFresh(pkg: StoredEarningsPackage | null): boolean {
  if (!pkg?.freshnessExpiresAt) return false;
  return new Date(pkg.freshnessExpiresAt).getTime() > Date.now();
}

export async function getLatestEarningsPackage(ticker: string): Promise<StoredEarningsPackage | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('earnings_packages')
    .select('*')
    .eq('ticker', ticker.trim().toUpperCase())
    .order('report_end_date', { ascending: false })
    .order('last_fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
    console.info('[earnings-cache] latest-package lookup hit', {
      ticker: ticker.trim().toUpperCase(),
      packageKey: (data as EarningsPackageRow).package_key,
    });
  }
  return normalizeRow(data as EarningsPackageRow);
}

export async function getEarningsPackageByQuarter(target: EarningsRequestTarget): Promise<StoredEarningsPackage | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const packageKey = buildEarningsPackageKey(target);
  const byKey = await supabase
    .from('earnings_packages')
    .select('*')
    .eq('package_key', packageKey)
    .maybeSingle();
  if (!byKey.error && byKey.data) {
    if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
      console.info('[earnings-cache] exact-quarter package lookup hit', {
        ticker: target.ticker,
        packageKey,
      });
    }
    return normalizeRow(byKey.data as EarningsPackageRow);
  }

  let query = supabase
    .from('earnings_packages')
    .select('*')
    .eq('ticker', target.ticker);

  if (target.reportEndDate) {
    query = query.eq('report_end_date', target.reportEndDate);
  }
  if (target.fiscalPeriod) {
    query = query.eq('fiscal_period', target.fiscalPeriod);
  }
  if (typeof target.fiscalYear === 'number') {
    query = query.eq('fiscal_year', target.fiscalYear);
  }

  const { data, error } = await query
    .order('report_end_date', { ascending: false })
    .order('last_fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
    console.info('[earnings-cache] quarter package fallback hit', {
      ticker: target.ticker,
      packageKey,
      reportEndDate: target.reportEndDate,
      fiscalPeriod: target.fiscalPeriod,
      fiscalYear: target.fiscalYear,
    });
  }
  return normalizeRow(data as EarningsPackageRow);
}

export async function upsertEarningsPackage(input: UpsertStoredEarningsPackageInput): Promise<StoredEarningsPackage | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const nowIso = input.lastFetchedAt ?? new Date().toISOString();
  const row = {
    package_key: input.packageKey,
    ticker: input.ticker.trim().toUpperCase(),
    company_name: input.companyName ?? null,
    fiscal_period: input.fiscalPeriod ?? '',
    fiscal_year: input.fiscalYear ?? null,
    report_end_date: input.reportEndDate ?? '',
    filed_at: input.filedAt ?? null,
    quarter_data: input.quarterData ?? {},
    annual_data: input.annualData ?? {},
    commentary_data: input.commentaryData ?? {},
    source_metadata: input.sourceMetadata ?? {},
    raw_payload: input.rawPayload ?? {},
    last_fetched_at: nowIso,
    freshness_expires_at: input.freshnessExpiresAt ?? buildFreshnessExpiry(nowIso),
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from('earnings_packages')
    .upsert(row, { onConflict: 'package_key' })
    .select('*')
    .single();

  if (error || !data) return null;
  const normalized = normalizeRow(data as EarningsPackageRow);
  if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
    console.info('[earnings-cache] package upserted', {
      ticker: normalized.ticker,
      packageKey: normalized.packageKey,
      packageId: normalized.id,
      freshnessExpiresAt: normalized.freshnessExpiresAt,
    });
  }
  await enqueueEarningsTrainingReview(normalized.id, input.reviewReasonCodes ?? ['runtime_cache_fill']);
  return normalized;
}

export async function enqueueEarningsTrainingReview(earningsPackageId: string, reasonCodes: string[] = []): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from('earnings_training_queue').upsert(
    {
      earnings_package_id: earningsPackageId,
      review_status: 'pending_review',
      ingestion_status: 'not_imported',
      reason_codes: reasonCodes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'earnings_package_id' },
  );
}
